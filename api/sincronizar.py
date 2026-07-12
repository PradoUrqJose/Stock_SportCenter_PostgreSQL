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
from datetime import date, datetime
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


def exportar_excel(s: requests.Session, ruta: str, **params):
    """GET al endpoint del botón "Exportar a Excel": trae TODO sin paginar en
    una sola request. La respuesta es HTML (no un .xls real) con un
    __VIEWSTATE de relleno antes de la tabla real -- se recorta."""
    url = f"{BASE}/{ruta.lstrip('/')}"
    r = s.get(url, params=params, headers={"Referer": f"{BASE}/Default.aspx"}, timeout=60)
    r.raise_for_status()
    data = r.content
    i0 = data.find(b"<table")
    if i0 == -1:
        return [], []
    i1 = data.find(b"</table>", i0) + len(b"</table>")
    fragmento = data[i0:i1].decode("utf-8", errors="replace")
    headers, filas = parse_tabla(fragmento)
    if headers and headers[-1] == "":
        headers = headers[:-1]
    return headers, filas


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
# Facturación a Minoristas (VE/BVENT)
# --------------------------------------------------------------------------- #
def scrapear_facturacion(s: requests.Session) -> list[dict]:
    params = {
        "pag": 1, "size": 20, "p_desc": "", "p_tienda": "J",
        "p_fechaInicio": "01/08/2025",
        "p_fechaFin": date.today().strftime("%d/%m/%Y"),
        "p_dcto": "01", "p_tipo_descarga": "N",
    }
    headers, filas = exportar_excel(s, "Vistas/VE/excelVEBVENT.aspx", **params)
    out = []
    for fila in filas:
        if not es_fila_de_datos(fila):
            continue
        r = fila_dict(headers, fila)
        fecha = _fecha_iso(r.get("FECHA"))
        if not fecha:
            continue
        out.append({
            "ser_num": r.get("N°DCTO"),
            "codigo": r.get("CODIGO") or None,
            "tienda": r.get("TIENDA") or None,
            "tipo_comprobante": r.get("DCTO") or None,
            "cliente": r.get("CLIENTE") or None,
            "mayorista": None,
            "fecha": fecha,
            "moneda": r.get("MONEDA") or None,
            "subtotal": _num(r.get("SUBTOTAL")),
            "dscto": _num(r.get("DSCTO")),
            "not_cre": _num(r.get("NOT.CRE.")),
            "bi": _num(r.get("B.I.")),
            "igv": _num(r.get("IGV")),
            "total": _num(r.get("TOTAL")) or 0,
            "efectivo": _num(r.get("EFECTIVO")),
            "tarjeta": _num(r.get("TARJETA")),
            "transferencia": _num(r.get("TRANSFERENCIA")),
            "detalle_tarjeta": r.get("DETALLE VENTA CON TARJETA") or None,
            "vendedor": r.get("VENDEDOR") or None,
            "nc": r.get("NC") or None,
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
