#!/usr/bin/env bash
# Carga en Vercel (entorno PRODUCTION) las 6 variables nuevas del módulo Marketing, tomando las claves de tu .env.local
# sin mostrarlas ni copiarlas. Las dos claves de R2 se guardan como «sensibles» (Vercel no las vuelve a mostrar).
# No pisa nada: si una variable ya existe en Vercel, la deja como está.
#
#   scripts/vercel-cargar-variables.sh              → solo muestra qué haría (vista previa)
#   scripts/vercel-cargar-variables.sh --aplicar    → las carga en Vercel
# Requiere la CLI de Vercel conectada a tu cuenta (`vercel whoami`) y el proyecto vinculado (carpeta .vercel).
set -euo pipefail
cd "$(dirname "$0")/.."
APLICAR=0
[[ "${1:-}" == "--aplicar" ]] && APLICAR=1
[[ -f .env.local ]] || { echo "Falta el archivo .env.local"; exit 1; }

valor() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"; }

# nombre|origen (env = de .env.local; fijo:<valor> = valor público fijo)|sensible
VARIABLES=(
  "R2_ENDPOINT|env|no"
  "R2_BUCKET|env|no"
  "R2_ACCESS_KEY_ID|env|si"
  "R2_SECRET_ACCESS_KEY|env|si"
  "R2_PUBLIC_URL|fijo:https://img.sportcenterpe.com|no"
  "CATALOGOS_HOST|fijo:catalogos.sportcenterpe.com|no"
)

EXISTENTES=$(vercel env ls production 2>/dev/null | grep -oE '^ *[A-Z_0-9]+' | tr -d ' ' || true)
echo "Modo: $([[ $APLICAR == 1 ]] && echo 'APLICAR (escribe en Vercel, entorno Production)' || echo 'vista previa (no escribe nada)')"
echo
FALLOS=0
for item in "${VARIABLES[@]}"; do
  IFS='|' read -r nombre origen sensible <<<"$item"
  if grep -qx "$nombre" <<<"$EXISTENTES"; then printf '  %-22s ya existe en Vercel: se deja igual\n' "$nombre"; continue; fi
  if [[ "$origen" == env ]]; then v="$(valor "$nombre")"; else v="${origen#fijo:}"; fi
  if [[ -z "$v" ]]; then printf '  %-22s SIN VALOR en .env.local: no se puede cargar\n' "$nombre"; FALLOS=1; continue; fi
  if [[ $APLICAR == 0 ]]; then printf '  %-22s se agregaría (%s, %s)\n' "$nombre" "$([[ $sensible == si ]] && echo 'sensible, valor oculto' || echo "valor: $v")" "Production"; continue; fi
  bandera=(); [[ "$sensible" == si ]] && bandera=(--sensitive)
  if printf '%s' "$v" | vercel env add "$nombre" production ${bandera[@]+"${bandera[@]}"} >/dev/null 2>&1; then printf '  %-22s agregada\n' "$nombre"; else printf '  %-22s ERROR al agregarla\n' "$nombre"; FALLOS=1; fi
done
echo
[[ $FALLOS == 0 ]] && echo "Listo." || { echo "Hubo problemas; revisa lo de arriba."; exit 1; }
