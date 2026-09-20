"""Genera los derivados WebP livianos de las imágenes de producto y los sube a R2.

    derivados/w600/<COD>.v<N>.webp    (grilla del módulo y páginas de catálogo)
    derivados/w1200/<COD>.v<N>.webp   (visor de catálogo en pantallas grandes)

Motivo: el PNG original (1600x1600, ~900 KB) obliga a bajar decenas de MB al
abrir la grilla de IMAGENES. Un WebP de 600 px pesa ~25 KB.

Lee cada original del bucket, lo redimensiona y sube el derivado con caché
inmutable (el nombre lleva la versión, así que nunca cambia de contenido).
Es re-ejecutable: se salta lo que ya existe. Por defecto NO escribe nada.

Uso (desde la raíz de STOCK_SC):
    python3 scripts/marketing_generar_derivados.py <r2_keys.json>                    # simulación
    python3 scripts/marketing_generar_derivados.py <r2_keys.json> --aplicar --limite 12   # prueba
    nice -n 19 python3 scripts/marketing_generar_derivados.py <r2_keys.json> --aplicar    # todo

El WebP se codifica en CPU. Se usa method=4: medido, gasta ~12x menos CPU que
method=6 (0,2 s vs 2,4 s por imagen) y los archivos pesan ~6 % más. Aun así, con
muchos hilos satura la máquina: por eso el valor por defecto es bajo y conviene
lanzarlo con `taskpolicy -b nice -n 19` (núcleos de eficiencia, apenas calienta).

Credenciales: variables R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y
R2_BUCKET, tomadas del entorno o del archivo indicado con --env (por defecto el
.env.local de EstandarizacionImagenes). Nunca se imprimen.

Reversión: borrar el prefijo `derivados/` del bucket (los originales no se tocan).
Requiere: pip install boto3 pillow
"""
import argparse
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.config import Config
from PIL import Image

ANCHOS = (600, 1200)
CALIDAD = 80
METODO = 4  # 0 (rápido) … 6 (lento); ver nota de CPU arriba
CACHE = "public, max-age=31536000, immutable"


def cargar_env(ruta: str) -> dict:
    env = dict(os.environ)
    if ruta and os.path.exists(ruta):
        for linea in open(ruta):
            linea = linea.strip()
            if "=" in linea and not linea.startswith("#"):
                k, v = linea.split("=", 1)
                env.setdefault(k, v.strip().strip('"'))
    return env


def clave_derivado(ancho: int, cod: str, version: int) -> str:
    return f"derivados/w{ancho}/{cod}.v{version}.webp"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", help="JSON con las claves del bucket (ej. '022356-01.png')")
    ap.add_argument("--aplicar", action="store_true", help="subir a R2 (por defecto solo simula)")
    ap.add_argument("--limite", type=int, help="procesar solo N códigos (prueba)")
    ap.add_argument("--version", type=int, default=1, help="versión de imagen (mk_imagenes.version)")
    ap.add_argument("--hilos", type=int, default=3)
    ap.add_argument(
        "--env",
        default=os.path.expanduser("~/Documents/Code/Projects/EstandarizacionImagenes/.env.local"),
    )
    a = ap.parse_args()

    codigos = sorted(
        {
            k[:-4].upper()
            for k in json.load(open(a.keys))
            if isinstance(k, str) and "/" not in k and k.lower().endswith(".png")
        }
    )
    if a.limite:
        codigos = codigos[: a.limite]
    print(f"Códigos a procesar: {len(codigos)} · anchos {ANCHOS} · versión v{a.version}")
    if not a.aplicar:
        print("Simulación: no se subió nada. Agregar --aplicar.")
        return 0

    env = cargar_env(a.env)
    faltan = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not env.get(k)]
    if faltan:
        print(f"Faltan variables de R2: {', '.join(faltan)}", file=sys.stderr)
        return 1
    bucket = env["R2_BUCKET"]
    s3 = boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(max_pool_connections=a.hilos * 2, retries={"max_attempts": 5, "mode": "standard"}),
    )

    # Un solo listado en vez de miles de HEAD: qué derivados ya existen.
    existentes: set[str] = set()
    for pagina in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix="derivados/"):
        existentes.update(o["Key"] for o in pagina.get("Contents", []))
    print(f"Derivados ya en R2: {len(existentes)}")

    def procesar(cod: str) -> tuple[str, dict[int, int], str | None]:
        pendientes = [w for w in ANCHOS if clave_derivado(w, cod, a.version) not in existentes]
        if not pendientes:
            return cod, {}, None
        try:
            crudo = s3.get_object(Bucket=bucket, Key=f"{cod}.png")["Body"].read()
            img = Image.open(io.BytesIO(crudo)).convert("RGBA")
            pesos = {}
            for w in pendientes:
                chica = img.copy()
                chica.thumbnail((w, w), Image.LANCZOS)  # no agranda; conserva proporción
                buf = io.BytesIO()
                chica.save(buf, "WEBP", quality=CALIDAD, method=METODO)
                s3.put_object(
                    Bucket=bucket,
                    Key=clave_derivado(w, cod, a.version),
                    Body=buf.getvalue(),
                    ContentType="image/webp",
                    CacheControl=CACHE,
                )
                pesos[w] = buf.tell()
            return cod, pesos, None
        except Exception as e:  # un fallo no debe detener el lote
            return cod, {}, f"{type(e).__name__}: {e}"

    t0 = time.time()
    total = {w: [0, 0] for w in ANCHOS}  # ancho -> [bytes, cantidad]
    fallos = []
    hechos = 0
    with ThreadPoolExecutor(a.hilos) as ex:
        for fut in as_completed(ex.submit(procesar, c) for c in codigos):
            cod, pesos, err = fut.result()
            hechos += 1
            if err:
                fallos.append({"cod": cod, "error": err})
            for w, b in pesos.items():
                total[w][0] += b
                total[w][1] += 1
            if hechos % 100 == 0 or hechos == len(codigos):
                print(f"  {hechos}/{len(codigos)} · {time.time() - t0:.0f}s · fallos {len(fallos)}")

    for w, (b, n) in total.items():
        if n:
            print(f"w{w}: {n} subidos, promedio {b / n / 1024:.1f} KB, total {b / 1024 / 1024:.1f} MB")
    if fallos:
        with open("marketing_derivados_fallos.json", "w") as f:
            json.dump(fallos, f, indent=2)
        print(f"{len(fallos)} fallos → marketing_derivados_fallos.json", file=sys.stderr)
        return 2
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
