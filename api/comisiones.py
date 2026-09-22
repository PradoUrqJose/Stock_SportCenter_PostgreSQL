"""Exporta VE/VERMAMI Minorista y devuelve las ventas para Comisiones."""
import json
import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler

import requests
from bs4 import BeautifulSoup

BASE = "https://erp.sportcenter.pe"
LOGIN_URL = f"{BASE}/login.aspx?ReturnUrl=%2fdefault.aspx"
CARGADOR_URL = f"{BASE}/cargaforma/cargador.aspx"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"

def texto(td): return td.get_text(strip=True).replace("​", "").strip()
def crear_sesion():
    s = requests.Session(); s.headers.update({"User-Agent": UA, "Accept-Language": "es-US,es;q=0.9"}); return s
def login(s):
    r=s.get(LOGIN_URL,timeout=30); r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser")
    campos={n:(soup.find("input",{"name":n}) or {}).get("value","") for n in ("__VIEWSTATE","__VIEWSTATEGENERATOR","__EVENTVALIDATION")}
    r=s.post(LOGIN_URL,data={**campos,"__EVENTTARGET":"","__EVENTARGUMENT":"","txt_usuario":os.environ["ERP_USUARIO"],"txt_clave":os.environ["ERP_CLAVE"],"btn_acceder":"Iniciar sesion "},headers={"Referer":LOGIN_URL},timeout=30); r.raise_for_status()
    if "txt_clave" in r.text and "AuthCookie" not in s.cookies.get_dict(): raise RuntimeError("Login falló. Revisa ERP_USUARIO / ERP_CLAVE.")

DOWNLOAD_URL = "https://erp.sportcenter.pe/DownloadDataTable.aspx"


def fecha_iso(valor: str) -> str | None:
    try:
        return datetime.strptime(valor.strip(), "%d/%m/%Y").date().isoformat()
    except (ValueError, AttributeError):
        return None


def numero(valor: str) -> float | None:
    try:
        return float((valor or "").replace(",", "").strip())
    except ValueError:
        return None


def promocion(valor: str) -> float | None:
    return numero((valor or "").replace("%", ""))


def valor(fila: dict, clave: str) -> str | None:
    return fila.get(clave) or None


def scrapear_comisiones(s, inicio: str, fin: str) -> list[dict]:
    # El ERP prepara un Excel-HTML en la sesión y DownloadDataTable.aspx lo descarga.
    r = s.post(CARGADOR_URL, data={
        "f": "VERMAMI", "m": "VE", "p_a": "EXPORTAR", "p_may_min": "N",
        "p_fecha_inicio": inicio, "p_fecha_fin": fin,
        "p_cliente": "", "p_codigo_barras": "",
    }, headers={"X-Requested-With":"XMLHttpRequest","Origin":BASE,"Referer":f"{BASE}/Default.aspx"}, timeout=60)
    r.raise_for_status()
    if r.text.strip() != "OK":
        raise RuntimeError(f"El ERP no pudo preparar el reporte: {r.text[:200]}")
    descarga = s.get(DOWNLOAD_URL, timeout=60)
    descarga.raise_for_status()
    soup = BeautifulSoup(descarga.content, "html.parser")
    tabla = soup.find("table")
    if not tabla:
        raise RuntimeError("El ERP no devolvió una tabla en el reporte de comisiones.")
    filas_html = tabla.find_all("tr")
    if not filas_html:
        return []
    encabezados = [texto(c) for c in filas_html[0].find_all(["th", "td"])]
    resultado = []
    for tr in filas_html[1:]:
        celdas = tr.find_all("td")
        if len(celdas) != len(encabezados):
            continue
        fila = dict(zip(encabezados, [texto(c) for c in celdas]))
        fecha = fecha_iso(fila.get("FECHA_VENTA_MINORISTA", ""))
        codigo = valor(fila, "COD_VENTA_MINORISTA")
        if not fecha or not codigo:
            continue
        resultado.append({
            "fecha_venta": fecha, "codigo_venta": codigo,
            "comprobante_serie": valor(fila, "COMPROBANTE_SERIE"),
            "comprobante_numero": valor(fila, "COMPROBANTE_NUMERO"),
            "codigo_barras": valor(fila, "CODIGO_BARRAS"),
            "codigo_universal": valor(fila, "CODIGO_UNIVERSAL"),
            "modelo": valor(fila, "MODELO"), "marca": valor(fila, "MARCA"),
            "grupo": valor(fila, "GRUPO"), "categoria": valor(fila, "CATEGORIA"),
            "color": valor(fila, "COLOR"), "talla": valor(fila, "TALLA"),
            "precio_compra": numero(fila.get("PRECIO_COMPRA_NOT_ING", "")),
            "precio_lista": numero(fila.get("PRECIO_LISTA", "")),
            "precio_venta": numero(fila.get("PRECIO_VENTA_A_CLIENTE", "")) or 0,
            "tienda": valor(fila, "TIENDA"), "usuario": valor(fila, "USUARIO"),
            "promocion_aplicada": promocion(fila.get("PROMOCION_APLICADA", "")),
        })
    return resultado


class handler(BaseHTTPRequestHandler):
    def respuesta(self, estado: int, cuerpo: dict):
        data = json.dumps(cuerpo).encode("utf-8")
        self.send_response(estado); self.send_header("Content-Type", "application/json")
        self.end_headers(); self.wfile.write(data)

    def do_POST(self):
        if not os.environ.get("SYNC_SECRET") or self.headers.get("X-Sync-Secret") != os.environ.get("SYNC_SECRET"):
            self.respuesta(401, {"error": "No autorizado"}); return
        inicio = self.headers.get("X-Comisiones-Inicio", "")
        fin = self.headers.get("X-Comisiones-Fin", "")
        if not fecha_iso(inicio) or not fecha_iso(fin):
            self.respuesta(400, {"error": "Fechas inválidas"}); return
        try:
            s = crear_sesion(); login(s)
            self.respuesta(200, {"ventas": scrapear_comisiones(s, inicio, fin)})
        except Exception as e:
            self.respuesta(500, {"error": str(e)})


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: python3 api/comisiones.py DD/MM/AAAA DD/MM/AAAA")
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for linea in open(os.path.join(raiz, ".env.local"), encoding="utf-8"):
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.strip().split("=", 1); os.environ.setdefault(k, v.strip('"\''))
    sesion = crear_sesion(); login(sesion)
    json.dump({"ventas": scrapear_comisiones(sesion, sys.argv[1], sys.argv[2])}, sys.stdout)
