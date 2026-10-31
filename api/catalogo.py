"""
Función serverless (Python) de Vercel: obtiene la data cruda del catálogo del
ERP (módulo PO/POVEXCA) para el generador de catálogos de Marketing. Vive
aparte de sincronizar.py (aunque comparte el mismo mecanismo de login) porque
es un módulo distinto del ERP y, por convención de Vercel, cada función de
/api se empaqueta de forma aislada — no hay imports relativos entre ellas.

El ERP no expone esto como una grilla normal: el botón "Generar catálogo" de
POVEXCA solo genera un PDF (p_formato=pdf). Pero el mismo endpoint acepta
p_formato=excel, que en vez de devolver un archivo devuelve
{"url": "DownloadExcelWithImg.aspx"} — una URL relativa a un endpoint GLOBAL
(no bajo /cargaforma/) que, ligado al estado de la sesión que dejó el POST
anterior, devuelve HTML con una tabla (<table id="testTable">) en vez de un
.xlsx real. De ahí sale toda la data: código universal, marca, modelo,
género, categoría, color y el STOCK POR TALLA (la tabla trae dos filas de
encabezado: la fija y, debajo, una con cada talla individual como columna).

Verificado en vivo contra ADIDAS/ZAPATILLAS: la suma de los stocks por talla
de cada fila coincide con la columna STOCK total, así que el alineamiento de
columnas de parse_tabla_catalogo() está confirmado.

Nota sobre tallas: esta grilla trae la talla en escala USA. La talla europea
NO sale acá (solo aparece en el PDF, p_formato=pdf, y no hay una tabla de
conversión USA->EUR fija y confiable para todos los géneros — se probó y en
calzado de niño una misma talla USA mapea a más de una talla EUR según el
modelo). Por ahora la conversión a EUR se resuelve aparte con una
equivalencia fija que se agrega en otra capa; este módulo no toca el PDF.
"""

import json
import os
import sys
from math import isfinite
from http.server import BaseHTTPRequestHandler
from time import perf_counter

import requests
from bs4 import BeautifulSoup

BASE = "https://erp.sportcenter.pe"
LOGIN_URL = f"{BASE}/login.aspx?ReturnUrl=%2fdefault.aspx"
CARGADOR_URL = f"{BASE}/cargaforma/cargador.aspx"
EXCEL_URL = f"{BASE}/DownloadExcelWithImg.aspx"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/149.0.0.0 Safari/537.36")


# --------------------------------------------------------------------------- #
# Login (idéntico a sincronizar.py — duplicado a propósito, ver docstring)
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


def opciones_catalogo(s: requests.Session) -> dict:
    """Códigos oficiales del mismo formulario que usa el ERP, sin inferirlos desde STOCK."""
    r = s.post(CARGADOR_URL, data={"m": "PO", "f": "POVEXCA"}, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    opciones = {}
    for dimension, campo in (("marcas", "marca"), ("generos", "genero"), ("grupos", "grupo"), ("categorias", "categoria")):
        select = soup.find("select", id=lambda valor: valor and valor.endswith(f"_dd_{campo}"))
        if select is None or not select.find_all("option"):
            raise RuntimeError(f"No se pudo verificar el filtro {dimension} del ERP; no se generó el catálogo")
        opciones[dimension] = [{"valor": o.get("value", ""), "nombre": texto(o)} for o in select.find_all("option")]
    return opciones


# --------------------------------------------------------------------------- #
# Catálogo (PO/POVEXCA) — POST prepara el resultado en la sesión, GET lo trae
# --------------------------------------------------------------------------- #
# Campos fijos del formulario que no varían por tipo de catálogo (calcados
# de la request real capturada desde el navegador).
_PARAMS_FIJOS = {
    "m": "PO",
    "f": "POVEXCA",
    "p_a": "EXP",
    "p_formato": "excel",
    "p_imagen": "T",
    "p_con_logo": "N",
    "p_logo": "upload/portal/logo/logo_exportar_catalgo.png",
    "p_precio_mostrar": "PL",
    "p_positivo_negativo": "+",
    "p_mostrar_genero": "S",
}

# Alias de encabezados del ERP -> nombres de campo estables. Si un grupo de
# productos trae un encabezado que no está acá, se usa un slug del texto tal
# cual (no revienta, pero conviene revisar y agregar el alias).
_ALIAS_FIJOS = {
    "NUMERO": "numero",
    "MARCA": "marca",
    "CODIGO UNIVERSAL": "cod_universal",
    "MODELO": "modelo",
    "GENERO": "genero",
    "CATEGORIA": "categoria",
    "COLOR": "color",
}
_ALIAS_FINALES = {
    "STOCK": "stock_total",
    "P. COMPRA": "precio_compra",
    "P. VENTA": "precio_venta",
    "P. DESCUENTO": "precio_descuento",
    "P. 1 CAJA": "precio_1_caja",
    "P. 1/2 CAJA": "precio_1_2_caja",
    "P. 1/4 CAJA": "precio_1_4_caja",
}


def _slug(texto_col: str) -> str:
    return texto_col.strip().lower().replace(" ", "_").replace(".", "").replace("/", "_")


def cargar_excel(s: requests.Session, *, _tiempos: dict | None = None, **filtros) -> str:
    """POST a cargador.aspx (deja el resultado listo en la sesión) + GET al
    endpoint global que lo devuelve como HTML con <table>."""
    params = {**_PARAMS_FIJOS, **filtros}
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": BASE,
        "Referer": f"{BASE}/Default.aspx",
        "Accept": "*/*",
    }
    inicio = perf_counter()
    r = s.post(CARGADOR_URL, data=params, headers=headers, timeout=60)
    r.raise_for_status()
    data = r.json()
    if _tiempos is not None:
        _tiempos["preparar_ms"] = round((perf_counter() - inicio) * 1000)
    # Filtros sin ninguna fila (p. ej. una marca sin stock en esos almacenes): es un resultado vacío, no un error.
    if data.get("message") == "No se encontraron resultados":
        return ""
    if data.get("message") != "OK":
        raise RuntimeError(f"El ERP no devolvió OK al preparar el catálogo: {data}")

    # Preparación y descarga tienen límites propios; el ejecutor impone además un plazo al conjunto de lotes.
    inicio = perf_counter()
    r = s.get(EXCEL_URL, headers={"Referer": f"{BASE}/Default.aspx"}, timeout=280)
    r.raise_for_status()
    html = r.text
    if _tiempos is not None:
        _tiempos["descargar_ms"] = round((perf_counter() - inicio) * 1000)
        _tiempos["bytes_html"] = len(r.content)
    return html


def parse_tabla_catalogo(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    tabla = soup.find("table", id="testTable")
    if not tabla:
        raise RuntimeError("El ERP no devolvió la tabla de stock; la sesión puede haber vencido")

    filas = tabla.find_all("tr")
    if len(filas) < 3:
        raise RuntimeError("La tabla de stock del ERP llegó incompleta")

    encabezado_fijo = [texto(td) for td in filas[0].find_all(["th", "td"])]
    try:
        idx_tallas = encabezado_fijo.index("TALLAS")
    except ValueError:
        raise RuntimeError(f"No se encontró la columna TALLAS en el encabezado: {encabezado_fijo}")

    campos_antes = encabezado_fijo[:idx_tallas]  # NUMERO, IMAGEN, MARCA, ...
    campos_despues = encabezado_fijo[idx_tallas + 1:]  # STOCK, P. COMPRA, ...
    tallas_labels = [texto(td) for td in filas[1].find_all(["th", "td"])]
    if not {"CODIGO UNIVERSAL", "MARCA", "GENERO"}.issubset(campos_antes) or "STOCK" not in campos_despues or "P. VENTA" not in campos_despues or not tallas_labels or len(set(tallas_labels)) != len(tallas_labels):
        raise RuntimeError("Las columnas de stock del ERP cambiaron; se canceló la consulta")

    n_antes, n_tallas, n_despues = len(campos_antes), len(tallas_labels), len(campos_despues)
    esperado = n_antes + n_tallas + n_despues

    out = []
    for fila in filas[2:]:
        celdas = fila.find_all(["td", "th"])
        es_producto = bool(celdas) and texto(celdas[0]).isdigit()
        if len(celdas) != esperado:
            if es_producto:
                raise RuntimeError("Una fila de producto del ERP tiene columnas incompletas; se canceló la consulta")
            continue  # fila de totales/pie u otra cosa que no calza con el layout
        if not es_producto:
            continue

        item: dict = {}
        for etiqueta, celda in zip(campos_antes, celdas[:n_antes]):
            if etiqueta == "IMAGEN":
                img = celda.find("img")
                item["imagen_erp_url"] = img.get("src") if img else None
            else:
                item[_ALIAS_FIJOS.get(etiqueta, _slug(etiqueta))] = texto(celda) or None

        tallas: dict[str, int | float] = {}
        for talla, celda in zip(tallas_labels, celdas[n_antes:n_antes + n_tallas]):
            v = texto(celda)
            if v:
                if not _es_numero(v):
                    raise RuntimeError("El ERP devolvió una cantidad por talla no válida; se canceló la consulta")
                cantidad = float(v.replace(",", ""))
                tallas[talla] = int(cantidad) if cantidad.is_integer() else cantidad
        item["tallas"] = tallas

        for etiqueta, celda in zip(campos_despues, celdas[n_antes + n_tallas:]):
            v = texto(celda)
            if etiqueta in _ALIAS_FINALES and v and not _es_numero(v):
                raise RuntimeError("El ERP devolvió un stock o precio no válido; se canceló la consulta")
            item[_ALIAS_FINALES.get(etiqueta, _slug(etiqueta))] = float(v.replace(",", "")) if _es_numero(v) else (v or None)

        out.append(item)
        if not item.get("cod_universal"):
            raise RuntimeError("El ERP devolvió un producto sin código; se canceló la consulta")
    return out


def _es_numero(v: str) -> bool:
    if not v:
        return False
    try:
        return isfinite(float(v.replace(",", "")))
    except ValueError:
        return False


def scrapear_catalogo(
    s: requests.Session,
    *,
    almacen: str,
    grupo: str = "",
    marca: str = "",
    genero: str = "",
    disciplina: str = "",
    categoria: str = "",
    color: str = "",
    talla: str = "",
    modelo: str = "",
    codigo_universal: str = "",
    stock_mayor_a: str = "1",
    fecha_minima_ingreso: str = "",
    _tiempos: dict | None = None,
) -> list[dict]:
    html = cargar_excel(
        s,
        _tiempos=_tiempos,
        p_almacen=almacen,
        p_grupo=grupo,
        p_marca=marca,
        p_genero=genero,
        p_disciplina=disciplina,
        p_categoria=categoria,
        p_color=color,
        p_talla=talla,
        p_modelo=modelo,
        p_codigo_universal=codigo_universal,
        p_stock_mayor_a=stock_mayor_a,
        p_color_predominante="",
        p_forma_plus="",
        p_monto_plus="",
        p_proveedor="",
        p_porcentaje_1_caja="",
        p_porcentaje_1_2_caja="",
        p_porcentaje_1_4_caja="",
        p_fecha_minima_ingreso=fecha_minima_ingreso,
    )
    inicio = perf_counter()
    items = parse_tabla_catalogo(html) if html else []
    if _tiempos is not None:
        _tiempos["parsear_ms"] = round((perf_counter() - inicio) * 1000)
    return items


def consultar_catalogo(filtros: dict) -> dict:
    """Mismo resultado en local y Vercel, con tiempos sin credenciales ni datos de productos."""
    inicio = perf_counter()
    tiempos = {"descargar_ms": 0, "bytes_html": 0}
    with crear_sesion() as s:
        login(s)
        tiempos["login_ms"] = round((perf_counter() - inicio) * 1000)
        if filtros.get("operacion") == "opciones":
            return {"opciones": opciones_catalogo(s), "tiempos": tiempos}
        items = scrapear_catalogo(s, **filtros, _tiempos=tiempos)
    tiempos["total_ms"] = round((perf_counter() - inicio) * 1000)
    return {"items": items, "tiempos": tiempos}


# --------------------------------------------------------------------------- #
# Handler HTTP (convención de Vercel: clase `handler` en /api/<nombre>.py)
# --------------------------------------------------------------------------- #
class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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

        length = int(self.headers.get("Content-Length", 0))
        try:
            filtros = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Body inválido, se esperaba JSON"})
            return

        if not isinstance(filtros, dict):
            self._json(400, {"error": "Se esperaba un objeto de filtros"})
            return

        if "almacen" not in filtros and filtros.get("operacion") != "opciones":
            self._json(400, {"error": "Falta 'almacen' en los filtros"})
            return

        try:
            self._json(200, consultar_catalogo(filtros))
        except requests.Timeout:
            self._json(504, {"error": "El ERP agotó el tiempo de respuesta; vuelve a intentarlo o reduce la selección"})
        except Exception as e:  # noqa: BLE001 — se reporta tal cual al caller
            self._json(500, {"error": str(e)})


# --------------------------------------------------------------------------- #
# Desarrollo local: python3 api/catalogo.py '{"almacen": "...", "marca": "..."}'
# (mismo mecanismo que sincronizar.py — vercel dev no sirve funciones *.py en
# un proyecto Next.js, así que en local se ejecuta el script directo)
# --------------------------------------------------------------------------- #
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

    filtros = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    if "almacen" not in filtros and filtros.get("operacion") != "opciones":
        raise SystemExit("Uso: python3 api/catalogo.py '{\"almacen\": \"T01,...\", \"marca\": \"ADIDAS\", ...}'")

    try:
        respuesta = consultar_catalogo(filtros)
    except requests.Timeout:
        respuesta = {"error": "El ERP agotó el tiempo de respuesta; vuelve a intentarlo o reduce la selección"}
    except Exception as e:
        respuesta = {"error": str(e)}
    json.dump(respuesta, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    _main_json()
