# Plan — Módulo de Análisis de Ventas

> Constancia de lo planeado. Expande y reemplaza la "Fase 12 (Rotación)" parqueada en
> `PLAN-DESARROLLO-v2.md`. Fecha de definición: 2026-07-01.

## Estado: v1 IMPLEMENTADA (2026-07-01)

Todo lo de este documento salvo §9 (efectividad del descuento, diferida). Archivos:

- **Migración:** `db/migrations/001_analisis_ventas.sql` (aplicada a `dev.db`) — recrea `ventas`
  como tabla de hechos con `UNIQUE(cod_barras)` + registra el módulo `analisis`.
- **Barcode:** `src/lib/upload/parsers.ts` → `parseIngresofecha` (dos formatos, cualquier letra).
- **Carga de ventas:** `parseVentasFile` (columnas ricas + filtro `VEND='S'`),
  `src/lib/upload/types.ts` (`VentaInsert`), `src/lib/actions/upload.ts`
  (`uploadVentasBatch` con `INSERT OR IGNORE` + `finalizeVentasUpload`),
  `src/components/admin/upload/ventas-upload-form.tsx` (modo agregar / reconstruir).
- **Módulo:** `src/app/admin/analisis/{page,loading}.tsx`,
  `src/components/admin/analisis/analisis-dashboard.tsx`,
  `src/lib/queries/analisis.ts`, `src/lib/analisis/clasificacion.ts`.
- **Integración:** ícono en `sidebar.tsx`; carga de ventas movida desde Productos.
- Umbral de "muerto" fijado en **90 días** (`DIAS_MUERTO` en `clasificacion.ts`).

Pendiente de que el usuario recargue el histórico de ventas real (la tabla se vació en la
migración porque los datos previos eran inservibles).

### Añadidos posteriores (2026-07-01)

- **Tab "Rezagados"** en Análisis: aísla el sesgo del promedio. Un producto que **sí rota**
  (`vendido_90d > 0`) pero arrastra unidades en stock ≥ `DIAS_REZAGO` (180) días. El promedio de
  rotación lo hace ver lento por esas unidades; en realidad vende y hay que revisar esas unidades
  puntuales (talla mala, dañada, mal ubicada) — no es stock muerto. Campo nuevo `unidades_viejas`
  en `fetchProductosAnalisis`.
- **Tab "Únicos"** (dentro de Análisis, NO es página aparte): productos con **una sola unidad** en
  stock (`HAVING COUNT(*)=1` sobre `variantes`), con filtro por **tienda** (alm_izq/alm_der), talla,
  antigüedad, precio y descuento. Es stock puro → funciona aunque no haya ventas cargadas. Archivos:
  `src/lib/queries/unicos.ts`, `src/components/admin/unicos/unicos-table.tsx` (renderizado como tab).
- **Rankings por modelo**: el ranking dejó de ser por marca/categoría/grupo sueltos; ahora cruza
  **marca · modelo · género** (el modelo real) y es filtrable por categoría para ver "los modelos más
  vendidos por categoría". `fetchModelosRanking` reemplaza a `fetchRankings`.
- **Ayuda por tab** en Análisis (`TabInfo`) y banner "¿Cómo leer esta página?" (`PageHelp`) en las
  páginas con datos no obvios.

## 1. Contexto y problema

La lógica de rotación actual (query en `src/app/admin/actualizacion/page.tsx` + semáforo en
`editor-table.tsx`) **no funciona con datos reales**:

- Al subir ventas, `cod_universal`/`genero` se dejan NULL y se intentan rellenar con un JOIN
  `ventas.cod_barras = variantes.cod_barras` (`finalizeVentasUpload`).
- Ese JOIN **falla al 100%**: el código de barras es un serial **por unidad física**; cuando la
  unidad se vende, sale del stock, así que su barcode **ya no existe en `variantes`** (espejo del
  stock actual). Verificado: de 54.348 ventas, 0 hacen match.
- Resultado: `vendido_90d = 0` para todo → cobertura NULL → todos los productos en gris.

**Fix raíz:** el Excel de ventas ya trae `COD.UNIV.` y `GENERO` por fila. Se leen y guardan
directamente; no se depende del stock actual.

## 2. Cambio de comportamiento en la carga

- **Hoy:** cada carga hace `clearVentas()` (DELETE) y reemplaza todo.
- **Nuevo:** carga **incremental / append**. Primero una carga inicial grande (ago-2025 → jun-2026)
  y luego se agregan ventas **mes por mes**, solo acumulando.
- **Anti-duplicados (decisión tomada):** **clave única por `cod_barras`** con `INSERT OR IGNORE`.
  Cada barcode es una unidad vendida una sola vez → si se resube el mismo archivo/periodo, se
  ignoran los duplicados automáticamente. Sin registro de periodos.
- **Botón "Reconstruir" (peligro):** borra todo y recarga desde cero (para la carga inicial o
  correcciones).

## 3. Regla de código de barras (definitiva)

El barcode codifica la **fecha del lote de ingreso** (`Letra + fecha + serial`). Prefijos reales
observados: `J, D, P, V, I, B`. El parser actual solo aceptaba `J` y leía siempre 6 dígitos de
fecha → generaba fechas basura (`2018-11-00`) o NULL.

| Largo | Formato | Ejemplo | Fecha resultante |
|---|---|---|---|
| **12** | `Letra + AAMMDD + serial(5)` | `J24092800086` | `2024-09-28` (día real) |
| **10 / 9** (antiguos) | `Letra + AAMM + serial` | `J181100537`, `D11081326` | `2018-11-11`, `2011-08-08` (**día = mes**) |

Lógica: si `length == 12` → 6 dígitos de fecha con día real; si no (9–10) → 4 dígitos (AAMM) con
**día = mes**. Prefijo = cualquier letra. Validar mes 01–12 (si inválido → null). Año = `20AA`.
Impacto: recupera ~650 barcodes antiguos y elimina 80 fechas malformadas.

## 4. Modelo de datos: tabla de hechos (fact table)

Como las unidades vendidas **salen del stock** y los precios/atributos cambian con el tiempo, cada
venta se **fotografía con todos sus datos al momento de cargarla** (el Excel los trae todos). La
tabla `ventas` pasa de 4 columnas a una fila rica por unidad vendida:

```
cod_barras     TEXT  -- clave única (dedup)
cod_universal  TEXT
genero         TEXT
fecha_venta    TEXT  -- ISO
ingreso_fecha  TEXT  -- derivada del barcode (regla §3)
almacen        TEXT  -- IZQ/DER
marca          TEXT
modelo         TEXT
categoria      TEXT
grupo          TEXT
color          TEXT
talla          TEXT
precio_compra  REAL  -- COMPRA
precio_lista   REAL  -- LISTA
importe        REAL  -- VENTA (puede ser 0 en regalos)
```

Filtro de carga: solo ventas reales (`VEND='S'` + `FEC.VENDIDA` válida). El esquema vive solo en
`dev.db` (no hay migraciones versionadas) → se crea un `.sql` idempotente en el repo con los
`ALTER TABLE`/índices y se aplica a `dev.db`.

## 5. Métricas / parámetros contemplados

1. **Rotación real** — días-para-vender = `fecha_venta − ingreso_fecha` por unidad; mediana y P90
   por producto, marca, categoría, grupo. (Mejor que la cobertura teórica actual.)
2. **Antigüedad del stock actual** — distribución **por unidad** (maneja re-ingresos, §6); detecta
   stock viejo.
3. **Cobertura** — stock actual ÷ velocidad reciente = días para agotar (métrica de hoy, ya
   funcionando).
4. **Productos muertos** — con stock, antiguos, sin ventas en N meses. (Umbral por defecto: **90
   días** — a confirmar.) Clasificados por descuento actual (§7).
5. **Tendencia mensual** — unidades e importe por mes, comparativas (aprovecha el histórico).
6. **Rankings** — más/menos vendidos por producto, marca, categoría, color, género.
7. **Margen** — `(LISTA − COMPRA)` o `(VENTA − COMPRA)` agregado.
8. **Por almacén** — desempeño por local (IZQ/DER).

## 6. Re-ingresos (dato clave)

Un mismo `cod_universal` puede ingresar varias veces. Ejemplo real confirmado: `030933-01/UNISEX`
→ 1 unidad del 2025-07-18, 1 del 2025-12-12, 6 del 2026-06-04. **502 productos** tienen múltiples
fechas de ingreso.

Consecuencia: la antigüedad **NO** puede ser `MIN(ingreso_fecha)` por producto (haría ver "viejo"
un producto con stock mayormente fresco). Cada unidad/barcode carga su propia fecha de lote → la
antigüedad se analiza como **distribución del stock actual**, no como un único valor.

## 7. Clasificación de salud (3 ejes) — incluye descuento actual

La lógica ingenua "muerto → aplicar descuento" se rompe si el producto **ya tiene descuento y aun
así no rota**. El diagnóstico cruza **antigüedad × velocidad de venta × descuento actual**:

- 🟡 **Muerto sin descuento** (viejo + 0 ventas + 0%) → acción fácil: primer descuento.
- 🟠 **Muerto con descuento moderado** (viejo + 0 ventas + 10–30%) → subir escalón.
- 🔴 **Muerto pese a descuento alto** (viejo + 0 ventas + 40–70%) → **no responde al precio**:
  liquidación / bundle / decisión manual. Peor categoría: capital inmovilizado.

El descuento actual **modula la severidad**, no es un dato suelto. Espejo contemplado (fuga de
margen): producto que **rota rápido + descuento alto** → probablemente no lo necesita (enlaza con
el módulo de Reposición, que quita descuentos).

## 8. Estructura del módulo

- **Módulo nuevo "Análisis"** en `/admin/analisis`: registrado en tabla `modules` (+ `admin_modules`
  para permisos por usuario) + ícono en `sidebar.tsx` + `requireModule`.
- Dos zonas: **carga incremental de ventas** (se mueve aquí desde la página de Productos) y
  **reportes** (§5).

## 9. Diferido a una segunda iteración (FUERA de v1)

- **Efectividad del descuento (antes/después):** usar las fechas de `lotes`/`lote_lineas` (cuándo se
  aplicó cada descuento) para medir ventas antes vs. después de la fecha del descuento. Si un
  producto recibió 40% hace 4 meses y vendió 0 desde entonces, el descuento queda *confirmado* como
  inútil, no solo inferido. Es la parte más pesada porque cruza el historial de lotes con las
  ventas.

## 10. Pendientes por confirmar

- Umbral de "sin ventas" para productos muertos (default propuesto: **90 días**).
