# Auditoría de consultas del catálogo al ERP

Fecha: 30 de octubre de 2026. Alcance: filtros, planificación, transporte local/Vercel, lectura de tablas, precarga, concurrencia y uso del resultado para generar o sincronizar. Los cambios están en local; no se desplegaron ni se modificaron datos del ERP, catálogos o tipos guardados.

## Hallazgos y correcciones

| Prioridad | Hallazgo comprobado | Corrección local |
|---|---|---|
| Alta | Elegir marcas evitaba todo control de tamaño; niños solo se dividía por una excepción añadida después. | Un planificador único para marcas, géneros, grupos y categorías. No recibe nombres de tipos ni contiene casos por tipo. |
| Alta | Los universos de marcas/géneros salían de STOCK y podían omitir opciones nuevas del ERP. | Se leen las cuatro listas del formulario oficial del ERP en cada consulta nueva. Los conteos locales solo estiman volumen. Si no es posible dividir con cobertura completa, se conserva la consulta completa y su límite de tiempo; no se fabrica un resultado parcial. |
| Alta | Una respuesta HTTP sin `items`, HTML de login o filas truncadas podía interpretarse como stock vacío o perder productos. | Validación de JSON, encabezados, filas, cantidades y sumas por talla. Los errores detienen la operación antes de crear el catálogo o preparar una sincronización. Solo el resultado vacío explícito del ERP se acepta como tal. |
| Alta | La precarga podía volver a consultarse al fallar o al superar 200 segundos, aunque siguiera activa. | Espera con límite propio y fallo explícito. Solo la ausencia inicial de precarga permite una consulta nueva. El fallo o desaparición de una precarga observada no dispara otra consulta. |
| Alta | El ERP devuelve varias fichas para el mismo código y género. El generador conservaba la primera, sin determinar si el stock de las demás debía sumarse. | Se bloquean fichas repetidas antes de construir el catálogo. Se conserva la posibilidad de mostrar el mismo código en géneros diferentes. No se suman ni se eligen fichas ambiguas automáticamente. |
| Media | Nombres visibles y códigos ERP no siempre coinciden. Ejemplos reales: BASQUET/BASKETBALL, NIÑOS/NINOS y TRAIL RUNNING/TRAIL RUNN. | Resolución desde el formulario oficial. Un valor desconocido, ambiguo o sin código detiene la operación; nunca equivale a quitar el filtro. |
| Media | La estimación de 27 segundos para 938 filas estaba desactualizada y decidía cuándo dividir. | El reparto usa volúmenes por combinación y objetivos comunes; el cálculo orientativo de tiempo ya no decide una estrategia distinta. Los lotes indivisibles pueden superar el objetivo, sin perder productos. |
| Media | Cada lote tenía un plazo independiente, y otros trabajadores podían seguir iniciando consultas después de un fallo. | Plazo de red del conjunto de 240 segundos, hasta tres lotes simultáneos, cancelación de los demás al fallar y cola detenida. |
| Media | Dos peticiones concurrentes podían pasar el mismo SELECT y crear dos precargas o generaciones. | Comprobación e inserción bajo bloqueo transaccional PostgreSQL, compartido entre generación y sincronización y específico por clave para precargas. No requiere migración. |
| Media | Variantes repetidas de listas generaban claves de precarga diferentes; almacenes inválidos se descartaban sin avisar; «solo únicos» podía combinarse con mínimo mayor que 1. | Clave versionada y canónica, almacenes inválidos rechazados y combinación contradictoria de stock rechazada. |

## Regla común de planificación

1. Resolver los filtros seleccionados a sus códigos oficiales, conservando lo pedido.
2. Estimar las filas de esa combinación con STOCK. Un conteo cero no excluye productos del ERP.
3. Dividir listas OR de marcas, géneros, grupos o categorías con el mismo algoritmo, buscando lotes equilibrados. Cada combinación queda cubierta una sola vez.
4. Si hace falta, expandir una dimensión no seleccionada con su lista oficial. No usar para ello una lista con códigos vacíos o que contradiga valores locales conocidos.
5. Mantener una consulta completa cuando no sea posible subdividir más. Aplicar el límite global y mostrar un error si el ERP no responde.

Los almacenes no se dividen: el stock mínimo y «solo únicos» dependen del total de los almacenes seleccionados. Fecha y stock mínimo se envían iguales en todos los lotes. Precio y talla siguen aplicándose al resultado local; no reducen el universo usado por una precarga compartida.

## Datos del ERP pendientes de revisión

La exportación completa confirmó diez pares código/género repetidos. No se corrigieron en el ERP:

| Código | Género | Stock de las dos fichas |
|---|---|---|
| 117497-TPE | MUJER | 1 y 11 unidades |
| 371125-01 | MUJER | 3 y 1 unidades |
| 384311-09 | JUNIOR | 2 y 2 unidades |
| 400365-06 | MUJER | 2 y 7 unidades |
| DH2987-002 | HOMBRE | 1 y 7 unidades |
| DH2987-100 | HOMBRE | 3 y 2 unidades |
| DV4355-800 | JUNIOR | 4 y 2 unidades |
| FJ2604-300 | JUNIOR | 2 y 13 unidades |
| HQ2038-400 | JUNIOR | 18 y 3 unidades |
| IH6102 | HOMBRE | 6 y 1 unidades |

Hasta aclarar/corregir esas fichas, una generación que las incluya se detendrá con un mensaje explícito. Los catálogos ya guardados no se alteran. Esta comprobación también se aplica a la precarga reutilizada.

Se revisaron los filtros de 8 catálogos locales y 14 de producción. Cuatro catálogos de producción incluyen `SLIDES` como categoría, que no figura en el formulario actual del ERP: Hombres — Octubre 2026, Niños — Octubre 2026, Hombres únicos — Octubre 2026 y Niños — Talla 34 Octubre 2026. Esas selecciones requieren revisión antes de una nueva sincronización. No se borró ni se sustituyó el filtro automáticamente.

## Validación

- Matriz de 81 combinaciones de filtros en tres escenarios: conteos completos, inexistentes y subestimados. Comprueba cobertura exacta, sin solapamientos, incluyendo opciones nuevas del ERP.
- Nueve tipos actuales planificados con sus filtros y las opciones reales del ERP. Todos usan el mismo algoritmo.
- 33 pruebas Node y 8 pruebas Python aprobadas (41 en total). Incluyen códigos, ambigüedades, claves de precarga, concurrencia, cancelación, plazo global, respuestas corruptas, duplicados y stock incoherente.
- Pruebas de Python de encabezados, sesión vencida, truncamiento, cantidades inválidas, resultado vacío y conservación de almacenes/fecha/mínimo.
- El lector estricto aceptó 35 tablas reales guardadas.
- Prueba real del flujo de consulta: niños, 45,3 segundos y 820 filas; ADIDAS, 39,7 segundos y 838 filas. Los 820 registros de niños coinciden como multiconjunto con la prueba anterior; las fichas repetidas son datos presentes en el ERP, no solapamiento entre lotes. Estas son mediciones de consulta: el control de integridad añadido después impide generar con fichas repetidas. La prueba adicional del catálogo completo terminó los 14 lotes y leyó 2.452 filas; se detuvo, como se esperaba, al confirmar los diez pares repetidos. No creó ningún catálogo.
- Exclusión del bloqueo verificada con dos conexiones PostgreSQL de solo lectura: la segunda no adquirió el bloqueo mientras estaba ocupado y sí después de liberarlo.

Comandos de verificación:

```sh
npm test
python3 -B -m unittest discover -s tests -p '*_erp_test.py'
npx tsc --noEmit --incremental false
npm run build
```

## Límites explícitos

Los conteos locales pueden estar atrasados y el ERP puede variar su latencia. El objetivo de filas no es una promesa de segundos ni un límite de filas devueltas. La lectura oficial evita inferir universos desde STOCK, pero no convierte varias exportaciones en una transacción atómica del ERP.

La precarga conserva la vigencia existente de diez minutos; el catálogo registra la fecha de consulta. La concurrencia de tres lotes es por operación, no una cuota global de toda la cuenta ERP entre procesos de Vercel. Los bloqueos impiden duplicar una misma precarga y admiten una sola generación/sincronización a la vez; precargas de filtros distintos todavía pueden coexistir.
