"""
Función serverless (Python) de Vercel: botón "Sincronizar" de Facturación
a Minoristas e Ingresos. Corre a demanda (no programada), por eso vive en
Vercel en vez de un host aparte — el scrape completo tarda ~15-20s, muy por
debajo del límite de duración de la función.

Reimplementa (self-contained, sin imports relativos — Vercel empaqueta cada
función de /api de forma aislada) la misma lógica de login/scraping que
/Users/jpradou/Documents/Code/SportCenter-Reportes/core/erp_common.py.

Protegido por un secreto compartido (header X-Sync-Secret) — lo llama el
server action de Next.js, no el navegador directamente.

Devuelve JSON con las filas ya mapeadas a los nombres de columna de
`facturacion`/`ingresos` (fuente="erp"), listas para pasar tal cual a
uploadFacturacionBatch/uploadIngresosBatch (src/lib/actions/upload.ts).
"""

import json
import os
import re
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler

import requests
from bs4 import BeautifulSoup

BASE = "https://erp.sportcenter.pe"
LOGIN_URL = f"{BASE}/login.aspx?ReturnUrl=%2fdefault.aspx"
CARGADOR_URL = f"{BASE}/cargaforma/cargador.aspx"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/149.0.0.0 Safari/537.36")


# --------------------------------------------------------------------------- #
# Login / scraping (ver SportCenter-Reportes/core/erp_common.py para el
# detalle de por qué cada mecanismo funciona así)
# --------------------------------------------------------------------------- #
def crear_sesion() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "es-US,es;q=0.9,en;q=0.8"})
    return s


def _campos_ocultos(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    campos = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"):
        tag = soup.find("input", {"name": name})
        campos[name] = tag.get("value", "") if tag else ""
    return campos


def login(s: requests.Session) -> None:
    usuario = os.environ["ERP_USUARIO"]
    clave = os.environ["ERP_CLAVE"]
    r = s.get(LOGIN_URL, timeout=30)
    r.raise_for_status()
    campos = _campos_ocultos(r.text)
    if not campos["__VIEWSTATE"]:
        raise RuntimeError("No se encontró __VIEWSTATE en el login.")
    payload = {
        **campos,
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "txt_usuario": usuario,
        "txt_clave": clave,
        "btn_acceder": "Iniciar sesion ",
    }
    r = s.post(LOGIN_URL, data=payload, headers={"Referer": LOGIN_URL}, timeout=30)
    r.raise_for_status()
    if "txt_clave" in r.text and "AuthCookie" not in s.cookies.get_dict():
        raise RuntimeError("Login falló. Revisa ERP_USUARIO / ERP_CLAVE.")


def texto(td) -> str:
    return td.get_text(strip=True).replace("​", "").strip()


def parse_tabla(html: str):
    soup = BeautifulSoup(html, "html.parser")
    tabla = soup.find("table")
    if not tabla:
        return [], []
    headers = [th.get_text(strip=True) for th in tabla.find_all("th")]
    filas = [tr.find_all("td") for tr in tabla.find_all("tr") if tr.find_all("td")]
    if not headers and filas:
        headers = [texto(td) for td in filas[0]]
        filas = filas[1:]
    return headers, filas


def es_fila_de_datos(fila) -> bool:
    """Descarta la fila de TOTALES que el ERP agrega al final de cada tabla."""
    return bool(fila) and texto(fila[0]).isdigit()


def cargar(s: requests.Session, **params) -> str:
    """POST a cargador.aspx (el loader normal de la grilla) — para módulos
    chicos, pedir un 'size' generoso trae todo en una sola página."""
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": BASE,
        "Referer": f"{BASE}/Default.aspx",
        "Accept": "*/*",
    }
    r = s.post(CARGADOR_URL, data=params, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text


def fila_dict(headers, fila) -> dict:
    return dict(zip(headers, [texto(td) for td in fila]))


def _num(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _fecha_iso(v) -> str | None:
    """dd/mm/yyyy -> yyyy-mm-dd."""
    if not v:
        return None
    try:
        return datetime.strptime(v.strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Facturación a Minoristas (VE/VEBREDI)
# --------------------------------------------------------------------------- #
# Se lee VEBREDI (registro de documentos electrónicos) y NO el export de
# VE/BVENT: la columna FECHA de BVENT es la fecha en que la venta se registró
# en el módulo, no la de emisión del comprobante. Cuando un lote se registra
# al día siguiente las dos difieren (p.ej. FJ01-4506..4509, emitidas el
# 30/08/2026, salían todas con 31/08 en BVENT). VEBREDI trae la fecha que
# viaja en el CPE a SUNAT, que es la que coincide con el registro de compras
# del cliente.
#
# VEBREDI da exactamente las columnas que consume la app (N°, MAYORISTA,
# MINORISTA, COMPROBANTE, FECHA, TOTAL, SER-NUM); el resto de campos de
# `facturacion` (tienda, vendedor, medios de pago, etc.) quedan en NULL, igual
# que en las 4200+ filas del histórico.
COL_MAYORISTA = "MAYORISTA"
COL_MINORISTA = "MINORISTA"


def _razon_social(td) -> str | None:
    """La celda trae razón social y RUC juntos:
    `RAZON SOCIAL<br/><small><b>20601577055</b></small>` — get_text() los
    pegaría ("...S.A.C20601577055"), así que se descarta el <small>."""
    if td is None:
        return None
    ruc = td.find("small")
    if ruc:
        ruc.extract()
    return texto(td) or None


def scrapear_facturacion(s: requests.Session) -> list[dict]:
    # size grande = todo en una sola request (el módulo pagina de 10 en 10).
    html = cargar(s, f="VEBREDI", m="VE", pag=1, size=5000, desc="", nc="")
    headers, filas = parse_tabla(html)
    idx = {h: i for i, h in enumerate(headers)}
    out = []
    for fila in filas:
        if not es_fila_de_datos(fila):
            continue
        r = fila_dict(headers, fila)
        fecha = _fecha_iso(r.get("FECHA"))
        ser_num = r.get("SER-NUM")
        if not fecha or not ser_num:
            continue
        out.append({
            "ser_num": ser_num,
            "codigo": None,
            "tienda": None,
            "tipo_comprobante": r.get("COMPROBANTE") or None,
            "cliente": _razon_social(fila[idx[COL_MINORISTA]]) if COL_MINORISTA in idx else None,
            "mayorista": _razon_social(fila[idx[COL_MAYORISTA]]) if COL_MAYORISTA in idx else None,
            "fecha": fecha,
            "moneda": None,
            "subtotal": None,
            "dscto": None,
            "not_cre": None,
            "bi": None,
            "igv": None,
            "total": _num(r.get("TOTAL")) or 0,
            "efectivo": None,
            "tarjeta": None,
            "transferencia": None,
            "detalle_tarjeta": None,
            "vendedor": None,
            "nc": None,
            "fuente": "erp",
        })
    return out


# --------------------------------------------------------------------------- #
# Ingresos (CO/COBNOIN)
# --------------------------------------------------------------------------- #
def scrapear_ingresos(s: requests.Session) -> list[dict]:
    params = {
        "f": "COBNOIN", "m": "CO", "p_a": "EXP", "desc": "",
        "pag": 1, "size": 1000, "opcion": 2,
        "p_fecha_inicio": "", "p_fecha_fin": "",
    }
    html = cargar(s, **params)
    headers, filas = parse_tabla(html)
    out = []
    for fila in filas:
        if not es_fila_de_datos(fila):
            continue
        r = fila_dict(headers, fila)
        emision = _fecha_iso(r.get("EMISIÓN"))
        if not emision:
            continue
        out.append({
            "codigo_interno": r.get("CÓDIGO INTERNO"),
            "emp": None,
            "almacen": r.get("ALMC") or None,
            "ing_sal": None,
            "tipo_mov": None,
            "serie_numero": r.get("SERIE-NÚMERO") or None,
            "emision": emision,
            "moneda": r.get("MOND.") or None,
            "importe": None,
            "subtotal": _num(r.get("SUBTOTAL")),
            "igv": _num(r.get("IGV")),
            "dscto": _num(r.get("DSCTO")),
            "total": _num(r.get("TOTAL")),
            "ruc": r.get("RUC") or None,
            "proveedor": r.get("PROVEEDOR") or None,
            "cmpl": r.get("CMPL") or None,
            "mcdr": r.get("MCDR") or None,
            "ord_compra": r.get("ORD.COMPRA") or None,
            "fuente": "erp",
        })
    return out


# --------------------------------------------------------------------------- #
# Handler HTTP (convención de Vercel: clase `handler` en /api/<nombre>.py)
# --------------------------------------------------------------------------- #
class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        secreto = os.environ.get("SYNC_SECRET", "")
        recibido = self.headers.get("X-Sync-Secret", "")
        if not secreto or recibido != secreto:
            self._json(401, {"error": "No autorizado"})
            return

        try:
            s = crear_sesion()
            login(s)
            facturacion = scrapear_facturacion(s)
            ingresos = scrapear_ingresos(s)
            self._json(200, {"facturacion": facturacion, "ingresos": ingresos})
        except Exception as e:  # noqa: BLE001 — se reporta tal cual al caller
            self._json(500, {"error": str(e)})


# --------------------------------------------------------------------------- #
# Desarrollo local
# --------------------------------------------------------------------------- #
# `vercel dev` NO sirve esta función: en un proyecto Next.js delega todas las
# rutas a `next dev`, que no conoce api/*.py, y /api/sincronizar responde 404
# (en producción sí se construye, ahí no hay problema). Por eso en local el
# server action no hace fetch sino que ejecuta este archivo como script:
#
#     python3 api/sincronizar.py --json    # scrapea y escribe el JSON a stdout
#
# Sin servidor ni secreto de por medio: la autorización ya la hizo requireRole
# en el server action. Las credenciales salen de .env.local, el mismo archivo
# que lee Next.
def _main_json() -> None:
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_local = os.path.join(raiz, ".env.local")
    if os.path.exists(env_local):
        with open(env_local, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith("#") and "=" in linea:
                    clave, valor = linea.split("=", 1)
                    os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))

    s = crear_sesion()
    login(s)
    # stdout tiene que quedar limpio: sólo JSON, que es lo que parsea el caller.
    json.dump(
        {"facturacion": scrapear_facturacion(s), "ingresos": scrapear_ingresos(s)},
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    _main_json()
