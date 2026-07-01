# Plan de Desarrollo v2 — Fase 4 en adelante (upload)

> **Supersede al `PLAN-DESARROLLO.md` desde la Fase 4.** Las **Fases 0-3 quedan tal cual** (ya hechas; no se tocan). Este v2 incorpora 3 cosas que el original no tenía completas:
>
> 1. Los **descuentos entran en el upload** (baseline del ERP).
> 2. La **regla de orden del ciclo** (ZIP al ERP → luego archivos al auxiliar).
> 3. La **restricción de Vercel**: el upload **no puede correr entero en el servidor** → se orquesta desde el cliente.

---

## 🔁 Regla de orden del ciclo (de operación, obligatoria)

> **Primero se sube el ZIP al ERP. Después se suben los archivos al auxiliar.**

**Por qué importa:** el upload refresca `productos.descuento` (el baseline). El desajuste se computa como `lote_lineas.descuento_nuevo` (lo planeado) vs `productos.descuento` (baseline fresco). Entonces:

```
✅ ZIP al ERP → luego archivos:  el baseline ya refleja lo aplicado → desajuste salta SOLO si algo no se aplicó.
❌ archivos antes del ZIP:       el baseline tiene los descuentos viejos → TODO lote publicado da desajuste FALSO.
```

---

## ⚠️ Restricción clave: Vercel + el upload

Vercel limita el **tamaño del body** (Server Actions: `bodySizeLimit` ~1 MB por defecto) y el **tiempo de ejecución** de las funciones. Un stock completo (varios MB, decenas de miles de filas) **NO puede**:

- enviarse entero a una Server Action, ni
- parsearse + insertarse en una sola llamada de servidor.

**Por eso el upload es CLIENT-ORCHESTRATED:** el navegador parsea y trocea; el servidor solo persiste lotes pequeños. (Es el patrón que ya funcionaba en el sistema viejo — se conserva.)

```
NAVEGADOR  (parsea y orquesta)                    SERVIDOR  (Server Actions finas)
─────────────────────────────────                ────────────────────────────────
 parseStockFile / parseImages / parseDiscounts
 buildData  (filtra · aplica descuento · ingreso_fecha)
     │
     ├─► initUpload()                ──────────►  DELETE variantes; DELETE productos;
     │                                            DELETE producto_imagenes WHERE source='archivo'
     ├─► uploadProductosBatch(×~500) ──────────►  INSERT productos        (varios workers concurrentes)
     ├─► uploadVariantesBatch(×~500) ──────────►  INSERT OR IGNORE variantes
     └─► finalizeUpload()            ──────────►  imágenes 'archivo' · sync_log · revalidatePath
```

> El servidor inserta en chunks ≤ 2000 (límite de batch de Turso) aunque el cliente mande ~500 por llamada.

---

## Fase 4 — Upload (reescrita)

### Lógica paso a paso

**CLIENTE (parseo + construcción):**

1. `parseStockFile` → filas crudas (`xlsx` en el navegador).
2. `parseImagesFile` → `{ cod_universal: url }` (`DOMParser`, solo URLs `https`).
3. `parseDiscountFiles` → `{ cod_universal: % }` — el **%** sale del **nombre del archivo** (`/\d+/`). ← **baseline del ERP**.
4. `buildData`:
   - **variantes**: filtrar filas donde `alm_izq` **o** `alm_der` esté en `ALMACENES_VALIDOS` · **parsear `ingreso_fecha` del `cod_barras` (`J+AAMMDD`)**.
     ```
     ALMACENES_VALIDOS = ['JAL1', 'JAL4', 'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'OUT']
     ```
     > **Por qué ambos campos:** una variante puede tener stock repartido en dos tiendas (`alm_izq` en una, `alm_der` en otra). Filtrar solo por `alm_izq` descartaría variantes cuya tienda relevante está en `alm_der`, dejando tiendas sin confirmación en Fase 6.
   - **productos**: agrupar `(cod_universal, genero)` · `descuento = dict[cod_universal] ?? 0` · `stock_total` · `precio_final = precio_lista * (1 - descuento/100)`.
   - **imágenes**: array para `producto_imagenes`.

**SERVIDOR (orquestado por el cliente):** 5. `initUpload()` — **DELETE (no DROP)** del espejo: `variantes` primero, luego `productos`; y `DELETE FROM producto_imagenes WHERE source='archivo'` (preserva las `'sistema'`). 6. `uploadProductosBatch()` / `uploadVariantesBatch()` — INSERT en chunks; el cliente manda ~500 por llamada con varios workers concurrentes. 7. `finalizeUpload()` — insertar imágenes `'archivo'`, **una fila en `sync_log`** (`tipo='stock'`, filas, `ejecutado_at`, `ejecutado_by`), `revalidatePath('/admin','/client')`.

### Dónde se puebla cada tabla

| Paso                   | Tabla                    | Qué pasa                                                          |
| ---------------------- | ------------------------ | ----------------------------------------------------------------- |
| `initUpload`           | `productos`, `variantes` | se **vacían** (DELETE)                                            |
| `initUpload`           | `producto_imagenes`      | borra **solo** `source='archivo'`                                 |
| `uploadProductosBatch` | `productos`              | filas con **`descuento` baseline**, `stock_total`, `precio_final` |
| `uploadVariantesBatch` | `variantes`              | filas con **`ingreso_fecha`** parseada                            |
| `finalizeUpload`       | `producto_imagenes`      | imágenes `'archivo'` del HTML                                     |
| `finalizeUpload`       | `sync_log`               | **1 fila** (`tipo='stock'`)                                       |
| —                      | **resto (zona APP)**     | **INTACTO** — lotes, lote_lineas, confirmaciones, actores         |

### Reglas que no se rompen

- **`productos.descuento` solo lo escribe el upload** (baseline). El editor jamás.
- **`ingreso_fecha`** del barcode; `NULL` si no cumple el formato, sin romper la carga.
- **`DELETE`, no `DROP`**, en `initUpload`.
- **Imágenes `'sistema'`** (puestas por el admin) **sobreviven**; solo se refresca `'archivo'`.
- **`lote_lineas` / `confirmaciones` / actores intactos** — el before/after vive en los snapshots.
- **Todos los campos de texto se normalizan a MAYÚSCULAS** en `buildData` — el ERP puede traer códigos y campos en minúscula; la BD almacena siempre en MAYÚS.

### Atomicidad (honesto)

Como el upload se trocea en varias llamadas, **no es una sola transacción atómica**. Hay una ventana breve (durante la recarga) con el espejo a medio poblar. **Es aceptable**: es una operación controlada que corre el admin, idealmente fuera de horario; no hay tráfico concurrente a 12 tiendas que dependa de consistencia instantánea.

### Criterio de aceptación

Subes los archivos reales del ERP y: `productos`/`variantes` poblados · `descuento` = archivos de % · `ingreso_fecha` parseada · **solo variantes con `alm_izq` OR `alm_der` en `ALMACENES_VALIDOS`** · imágenes `'archivo'` refrescadas **sin borrar las `'sistema'`** · 1 fila nueva en `sync_log` · **lotes/confirmaciones intactos** · todo **sin exceder límites de Vercel** (parseo en cliente, batches chicos).

### Riesgos a auditar

- ❌ Mandar el archivo entero a una Server Action → excede límites. **Debe parsear en cliente.**
- ❌ `DROP` en vez de `DELETE`.
- ❌ Borrar imágenes `'sistema'` en el refresh.
- ❌ Escribir `descuento` fuera del upload.
- ❌ `ingreso_fecha` que rompe la carga si algún barcode no cumple el formato.

---

## Fases 5-12 (sin cambios de fondo respecto al plan original)

Se mantienen igual; solo **asumen** ahora la regla de orden y que el upload escribe el baseline.

- **5** Editor de descuentos → `lote_lineas` (borrador). `descuento_antes` = `productos.descuento` actual.
- **6** Lifecycle del lote: `publicar` (congela `confirmaciones`) → `cerrar`. Guard: un solo lote no-cerrado a la vez.
- **7** Vista cliente: antes→después + confirmar/rechazar selectivo con credencial.
- **8** Panel admin de confirmaciones.
- **9** Exclusiones en Tiendas (permanente + por-lote).
- **10** Export ZIP al ERP + **desajuste** (computado on-read tras el siguiente upload). **Depende de la regla de orden de arriba** para no dar falsos positivos.
- **11** Dashboard real (cosmético).
- **12** 🌱 Rotación (futuro): import de `ventas` + cálculo SQL. No empezar hasta validar el lazo.

> Detalle de cada una: ver `PLAN-DESARROLLO.md` (Fases 5-12 siguen vigentes al pie de la letra).

---

## Checklist de auditoría (Fase 4)

- [ ] ¿El archivo se parsea en el **cliente** (no se manda entero al servidor)?
- [ ] ¿`initUpload` usa **DELETE**, no DROP?
- [ ] ¿El refresh preserva las imágenes `source='sistema'`?
- [ ] ¿`descuento` se escribe **solo** aquí, como baseline?
- [ ] ¿Se parsea `ingreso_fecha` y se tolera el formato inválido?
- [ ] ¿`sync_log` registra la carga?
- [ ] ¿Lotes/confirmaciones quedaron **intactos** tras el upload?
- [ ] ¿El filtro de variantes usa `alm_izq OR alm_der` en `ALMACENES_VALIDOS` (no solo `alm_izq`)?

### Fase 5 — Editor de descuentos → `lote_lineas` (borrador)

- **Objetivo:** el admin planea descuentos.
- **Entregables:** lista de productos (Server Component, filtros/orden por URL state); edición de descuento con **estado pendiente local** (localStorage) antes de guardar; `guardarDescuentos()` → upsert a `lote_lineas` del borrador activo, **capturando snapshot** (marca/modelo/precios) y `descuento_antes`. Crea el borrador si no existe (un solo lote no-cerrado a la vez).
- **Aceptación:** editas varios descuentos, guardas, y aparecen como `lote_lineas` del borrador con su snapshot.
- **Riesgo:** escribir en `productos.descuento` (prohibido). El objetivo vive solo en `lote_lineas`.

### Fase 6 — Lifecycle del lote

- **Objetivo:** publicar y cerrar.
- **Entregables:** `publicarLote()` (`borrador→publicado`) que **congela la foto de `confirmaciones`**: una fila por (producto × tienda con stock), cruzando `variantes.alm_izq`/`alm_der` ↔ `tiendas.nombre`, excluyendo `lote_exclusiones` y `tiendas.excluida_actualizacion=1`. `cerrarLote()` (`publicado→cerrado`).
- **Aceptación:** al publicar, se generan confirmaciones `pendiente` solo para tiendas con stock y no excluidas.
- **Riesgo:** el cruce de ubicación debe usar el `UNION` de `alm_izq` + `alm_der` (pares repartidos en 2 tiendas).

### Fase 7 — Vista cliente: antes→después + confirmar/rechazar

- **Objetivo:** la tienda actualiza etiquetas y confirma.
- **Entregables:** `/client/actualizacion` pre-filtrada por la tienda del usuario; muestra antes→después; **selección por producto** (no todo o nada); `confirmarAplicacion(codigoVendedor, productos[])` y `rechazarProductos(codigoVendedor, motivo, productos[])`, validando que el vendedor pertenece a la tienda.
- **Aceptación:** un `client` confirma unos productos y rechaza otro con motivo; los estados persisten.
- **Riesgo:** que el rechazo sea ceremonia pesada — es un escape de UX, mantenerlo simple (código + nota).

### Fase 8 — Panel admin de confirmaciones

- **Objetivo:** el admin ve quién confirmó/rechazó qué.
- **Entregables:** panel en `actualizacion-updates` visible cuando el lote está `publicado`: resumen global (pendiente/confirmado/rechazado) y desglose por producto, expandible a tiendas (con motivo de rechazo).
- **Aceptación:** publicas, confirmas desde una tienda, y el panel lo refleja.
- **Riesgo:** recomputar confirmaciones en vez de leer la foto congelada al publicar.

### Fase 9 — Exclusiones en Tiendas

- **Objetivo:** excluir tiendas de una publicación.
- **Entregables:** en el CRUD de Tiendas, toggle de **exclusión permanente** (`tiendas.excluida_actualizacion`) y **exclusión del lote activo** (`lote_exclusiones`).
- **Aceptación:** excluyes una tienda y, al publicar, no recibe confirmaciones.
- **Riesgo:** confundir las dos exclusiones (permanente = futuras; lote = solo ese lote).

### Fase 10 — Export ZIP al ERP + desajuste

- **Objetivo:** cerrar el puente con el ERP.
- **Entregables:** exportar **ZIP de códigos universales por descuento** desde el lote; tras el siguiente `uploadStock`, **computar el desajuste** (líneas publicadas vs `productos.descuento` fresco) y mostrarlo como banner; acción `marcarResanado()` en el lote.
- **Aceptación:** generas el ZIP; tras subir stock que no refleja los cambios, el banner avisa el desajuste.
- **Riesgo:** almacenar el desajuste con banderas/metadata en vez de computarlo on-read.

### Fase 11 — Dashboard real

- Métricas de inventario/descuentos. Cosmético, va al final.

### Fase 12 (FUTURO, parqueado) — Rotación

- **Objetivo:** soporte de decisión en el editor.
- **Entregables:** import del reporte de **ventas** → tabla `ventas`; **cálculo por SQL** de antigüedad (`hoy − ingreso_fecha`), velocidad (ventas en ventana) y cobertura (`stock ÷ velocidad`); semáforo en el editor.
- **No empezar** hasta validar el lazo de comunicación. Cero cambios de schema cuando llegue.
- **Riesgo:** sacar el cálculo a Python. Es agregación SQL; se queda en la BD.

---

## 5. Convenciones de código

- **Server Actions**: empiezan validando sesión/rol → rate limit → lógica → `revalidatePath` → `return ActionResult`.
- **Errores**: nunca lanzar al cliente; capturar y devolver `{ success:false, msg }`.
- **Escrituras masivas**: por chunks (p.ej. 2000 filas) para respetar límites de batch de Turso.
- **Estado de tablas en cliente** (búsqueda/filtros/paginación): sincronizar a URL params sin navegación (`window.history.replaceState`), no provocar refetch del Server Component.
- **Nada de lógica de negocio en la zona espejo.**

---

## 6. Primeros pasos concretos (Fase 0, literal)

1. `npx create-next-app@latest` (TypeScript, App Router, Tailwind, ESLint).
2. `npm i @libsql/client jose` + lib de hash; `npx shadcn@latest init`.
3. Copiar `dev.db` a la raíz; crear `.env.local` (sección 1).
4. Escribir `lib/db.ts`:
   ```ts
   import { createClient } from "@libsql/client";
   export const db = createClient({
     url: process.env.DATABASE_URL!, // file:dev.db local · libsql://… prod
     authToken: process.env.DATABASE_AUTH_TOKEN, // undefined en local
   });
   ```
5. Probar con un Server Component que haga `SELECT 1`. ✅ Fase 0 cerrada.

---

## 7. Checklist de auditoría (correr en cada PR/fase)

- [ ] ¿Alguna escritura toca la zona espejo con significado de negocio? → prohibido.
- [ ] ¿Algún FK app→espejo? → usar llave natural plana.
- [ ] ¿`lote_lineas` capturó snapshot, o depende de que el producto siga existiendo?
- [ ] ¿Confirmaciones se leen de la foto congelada (no se recomputan)?
- [ ] ¿Esta pieza resuelve trabajo humano real a escala de 12 tiendas, o es "por si acaso"?
- [ ] ¿Algo se está saliendo a otro runtime para hacer lo que SQL ya hace?
- [ ] ¿El desajuste se computa on-read (no banderas almacenadas)?

```

```
