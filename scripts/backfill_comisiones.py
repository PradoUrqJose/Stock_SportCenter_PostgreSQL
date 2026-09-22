#!/usr/bin/env python3
"""Carga inicial segura de Comisiones por meses desde el ERP.

Uso: python3 scripts/backfill_comisiones.py 2026-01-01 2026-09-22
Cada mes se confirma en una transacción separada para no dejar meses a medio
guardar ni hacer una sola consulta demasiado pesada al ERP.
"""
import importlib.util
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

ROOT = Path(__file__).resolve().parents[1]


def cargar_env():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"\''))


def cargar_scraper():
    spec = importlib.util.spec_from_file_location("erp_comisiones", ROOT / "api" / "comisiones.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def meses(inicio: date, fin: date):
    actual = inicio.replace(day=1)
    while actual <= fin:
        siguiente = (actual.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield max(actual, inicio), min(siguiente - timedelta(days=1), fin)
        actual = siguiente


COLUMNAS = (
    "fecha_venta", "codigo_venta", "comprobante_serie", "comprobante_numero", "codigo_barras",
    "codigo_universal", "modelo", "marca", "grupo", "categoria", "color", "talla",
    "precio_compra", "precio_lista", "precio_venta", "tienda", "usuario", "promocion_aplicada",
)
CLAVE = ("codigo_venta", "codigo_barras", "comprobante_serie", "comprobante_numero")
ACTUALIZAR = ", ".join(f"{c}=EXCLUDED.{c}" for c in COLUMNAS if c not in CLAVE)
SQL_INSERT = f"""
  INSERT INTO comisiones_ventas ({", ".join(COLUMNAS)}) VALUES %s
  ON CONFLICT (codigo_venta,codigo_barras,comprobante_serie,comprobante_numero)
  DO UPDATE SET {ACTUALIZAR}, sincronizado_at=now_text()
"""


def unicas(ventas):
    por_clave = {}
    for venta in ventas:
        por_clave[tuple(venta.get(c) for c in CLAVE)] = venta
    return list(por_clave.values())


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Uso: python3 scripts/backfill_comisiones.py AAAA-MM-DD AAAA-MM-DD")
    inicio, fin = map(date.fromisoformat, sys.argv[1:])
    if inicio > fin:
        raise SystemExit("El inicio no puede ser posterior al fin.")
    cargar_env()
    scraper = cargar_scraper()
    conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
    try:
        for desde, hasta in meses(inicio, fin):
            print(f"Consultando ERP: {desde} a {hasta}", flush=True)
            sesion = scraper.crear_sesion()
            scraper.login(sesion)
            ventas_erp = scraper.scrapear_comisiones(sesion, desde.strftime("%d/%m/%Y"), hasta.strftime("%d/%m/%Y"))
            ventas_minorista = [venta for venta in ventas_erp if venta.get("comprobante_serie") != "FJ01"]
            ventas = unicas(ventas_minorista)
            filas = [tuple(venta.get(c) for c in COLUMNAS) for venta in ventas]
            with conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM comisiones_ventas WHERE fecha_venta BETWEEN %s AND %s", (desde.isoformat(), hasta.isoformat()))
                    if filas:
                        execute_values(cur, SQL_INSERT, filas, page_size=500)
                    cur.execute(
                        "INSERT INTO comisiones_sync_log (fecha_inicio, fecha_fin, filas, ejecutado_by) VALUES (%s, %s, %s, NULL)",
                        (desde.isoformat(), hasta.isoformat(), len(filas)),
                    )
            print(f"  Guardadas: {len(filas)}; FJ01 excluidas: {len(ventas_erp) - len(ventas_minorista)}; repetidas omitidas: {len(ventas_minorista) - len(filas)}", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
