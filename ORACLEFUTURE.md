# Migrar de Vercel+Neon a self-host único en Oracle Cloud (VM Always Free)

## Contexto

Hoy la app corre en Vercel (build/deploy) + Neon (Postgres serverless). El objetivo es eliminar la dependencia de ambos servicios y sus límites (cold starts, límites de conexiones del pooler, cuotas de build/bandwidth) desplegando todo — app Next.js + Postgres — en **una sola VM Oracle Cloud "Always Free"** (shape Ampere A1, ARM, hasta 4 OCPU/24GB gratis de por vida).

El inventario del código (agente de exploración) confirmó que la app es fácilmente self-hosteable:
- Sin dependencias de Vercel (`@vercel/*`), sin Vercel Blob/KV/Cron/Analytics, sin Edge Runtime, sin `middleware.ts` (usa `src/proxy.ts` con matcher estándar de Next.js).
- Imágenes de producto son solo URLs externas guardadas como texto — no hay storage de binarios que migrar.
- Único acoplamiento a Neon: el connection string `DATABASE_URL` y dos detalles en `src/lib/db.ts` (SSL relajado por el pooler de Neon, `pool max: 3` dimensionado para el límite de conexiones del pooler).
- Variables de entorno usadas: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NODE_ENV`.

El dominio de la empresa es `sportcenter.pe` (ya usan `erp.sportcenter.pe` y `pos.sportcenter.pe`); este sistema usará **`stock.sportcenter.pe`** apuntando a la VM — así que el acceso será por **HTTPS con certificado real desde el día uno**, vía Caddy con emisión automática de Let's Encrypt (solo necesita que el subdominio resuelva por DNS a la IP pública de la VM antes de levantar el proxy).

## Alcance

Lo que se ejecuta como cambios en el repo:
1. Dockerizar la app y Postgres con `docker-compose`.
2. Ajustar `src/lib/db.ts` para self-host (quitar peculiaridades de Neon).
3. Preparar el flujo de migración de datos Neon → Postgres self-hosted.
4. Dejar un script de backup simple.

Lo que requiere acción manual en el navegador o en el panel DNS de la empresa (no son cambios de archivo):
- Crear cuenta Oracle Cloud (si no existe) y provisionar la VM Ampere A1 Always Free.
- Abrir puertos 80/443/22 en la Security List/NSG de la VM (además del firewall interno `iptables` que las imágenes de Oracle traen activado por defecto).
- Crear el registro DNS `A` de `stock.sportcenter.pe` apuntando a la IP pública de la VM.
- Copiar la clave SSH y conectarte la primera vez.

## Cambios en el repo

### 1. `next.config.ts`
Agregar `output: "standalone"` — genera un build mínimo autocontenido ideal para Docker (solo copia `.next/standalone` + `.next/static` + `public`, sin `node_modules` completo).

### 2. `Dockerfile` (nuevo)
Build multi-stage (`deps` → `builder` → `runner`) sobre `node:20-alpine`, arquitectura arm64/amd64 (imagen oficial multi-arch, no requiere ajuste). Runner final ejecuta `node server.js` (entrypoint que genera `output: standalone`), expone puerto 3000, usuario no-root.

### 3. `.dockerignore` (nuevo)
Excluye `node_modules`, `.next`, `.git`, `.env*`, logs.

### 4. `docker-compose.yml` (nuevo)
Tres servicios:
- **`db`**: `postgres:16-alpine`, volumen nombrado `pgdata` para persistencia, variables `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB` desde `.env`, sin puerto expuesto al host (solo red interna de compose).
- **`app`**: build desde el `Dockerfile`, `depends_on: db`, `DATABASE_URL=postgresql://...@db:5432/...` (nombre de servicio `db` como host, red interna de Docker), lee el resto de env vars (`JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) desde `.env`.
- **`caddy`**: `caddy:2-alpine`, publica `80:80` y `443:443`, con volumen para persistir certificados (`caddy_data`). `Caddyfile` con el bloque del subdominio real y `reverse_proxy app:3000` — Caddy emite y renueva el certificado Let's Encrypt automáticamente (necesita que el DNS ya resuelva antes del primer arranque).

### 5. `Caddyfile` (nuevo)
```
stock.sportcenter.pe {
  reverse_proxy app:3000
}
```
Caddy maneja HTTPS, redirección HTTP→HTTPS y renovación automática sin configuración adicional.

### 6. `src/lib/db.ts` — ajustes para self-host
- El comentario y `ssl: { rejectUnauthorized: false }` (líneas 16-18) son específicos del pooler de Neon; en Docker la conexión `app → db` es red interna sin TLS, así que se cambia a `ssl: false` (o condicional por env `PGSSL`).
- `max: 3` estaba dimensionado al límite de conexiones del pooler serverless de Neon; con Postgres dedicado en la misma VM se sube a un valor razonable (p. ej. `10`) ya que no hay ese límite artificial.
- Comentarios del archivo se actualizan para reflejar que ya no hay pooler de Neon de por medio.

### 7. `src/lib/rate-limit.ts` (cleanup menor)
Actualizar el comentario que aún dice "Persistido en Turso" → ya persiste en Postgres.

### 8. `.env.example` (nuevo)
Plantilla con `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (armado a partir de los anteriores, apuntando a `db:5432`), `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. El `.env` real (con secretos) no se commitea, se crea a mano en la VM.

### 9. Migración de datos Neon → self-hosted Postgres
Como origen y destino son ambos Postgres, no hace falta reusar `migrate-data.mjs` (ese script era Turso→Postgres, con conversión de tipos). Más simple y confiable:
```
pg_dump "$NEON_DATABASE_URL" --no-owner --no-privileges -f dump.sql
scp dump.sql <vm>:~/
ssh <vm> 'docker compose exec -T db psql -U <user> -d <db> -f - < dump.sql'
```
Alternativa si `pg_dump` local no está disponible: `docker run --rm postgres:16-alpine pg_dump ...` usando la imagen oficial para no depender de instalar herramientas cliente localmente.

### 10. Backups en la VM
Script `backup.sh` simple (pg_dump programado) + entrada de `cron` diaria que rota los últimos N dumps en un volumen local. Reemplaza los backups automáticos que Neon hacía por defecto.

### 11. Limpieza opcional
Quitar la dependencia huérfana `@libsql/client` de `package.json`/lockfile (confirmado sin uso real en `src/`) y decidir si `migrate-data.mjs` se conserva como referencia histórica o se borra, una vez que los datos ya estén migrados y verificados en el nuevo Postgres.

## Verificación end-to-end
1. `docker compose up -d --build` en la VM, confirmar los 3 contenedores healthy (`docker compose ps`).
2. Aplicar `db/schema_postgres.sql` contra el contenedor `db` (via `docker compose exec db psql` o reutilizando `apply-migration.mjs` apuntando al `DATABASE_URL` interno desde dentro del contenedor `app`).
3. Restaurar el dump de datos de Neon (paso 9).
4. `curl -I https://stock.sportcenter.pe` desde tu máquina — confirmar certificado válido y que Caddy sirve el login de Next.js.
5. Login real con `ADMIN_USERNAME`/`ADMIN_PASSWORD`, navegar a `/admin` y a una página con queries pesadas (ej. `/admin/analisis` o el dashboard con KPIs) para confirmar que las lecturas a Postgres funcionan de punta a punta.
6. Revisar logs (`docker compose logs -f app`) buscando los `[PERF][db]` que ya emite `db.ts` para confirmar tiempos de query razonables sobre Postgres local (deberían ser más bajos que contra Neon por eliminar la latencia de red).
