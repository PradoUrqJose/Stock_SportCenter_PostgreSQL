# Stock Sport Center — Auxiliar de Descuentos

App interna para gestionar stock, descuentos y confirmaciones de tienda. Next.js (App Router) + SQLite/Turso vía `@libsql/client`.

## Stack

- Next.js 16 (App Router). **Ojo:** este repo corre sobre una versión de Next.js con convenciones que difieren de lo habitual (p. ej. `middleware.ts` fue renombrado a `proxy.ts`) — antes de tocar rutas, layouts o el archivo de proxy, revisar `node_modules/next/dist/docs/`.
- Base de datos: SQLite local (`dev.db`, vía `@libsql/client` en modo archivo) en desarrollo, o [Turso](https://turso.tech/) en producción (mismo cliente, endpoint remoto).
- Auth: JWT propio (`jose`) en cookie de sesión, contraseñas con `bcryptjs`. Ver `src/lib/auth.ts`.
- UI: Tailwind v4 + `@base-ui/react` + `shadcn`.

## Setup

### 1. Variables de entorno

Crear `.env.local` en la raíz:

```bash
# SQLite local: file:dev.db — Turso: libsql://<db>.turso.io
DATABASE_URL=file:dev.db
DATABASE_AUTH_TOKEN=          # solo si DATABASE_URL apunta a Turso

JWT_SECRET=                   # string aleatorio de al menos 32 caracteres

# Credenciales del primer admin. Se crean automáticamente en el primer
# intento de login si todavía no existe ningún administrador_general.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
```

Generar un `JWT_SECRET` válido:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Base de datos

El repo no versiona `dev.db` (contiene datos de desarrollo/credenciales). Para crear una base local desde cero:

```bash
sqlite3 dev.db < db/schema.sql
sqlite3 dev.db < db/migrations/001_analisis_ventas.sql
```

`db/schema.sql` define el esquema completo (tablas, índices y el seed de `modules` que alimenta el sidebar de admin). `db/migrations/` tiene cambios incrementales posteriores al schema base — revisar el directorio y aplicar los que falten en orden numérico.

Corré esto desde la raíz del proyecto:

$env:DATABASE_URL="libsql://TU-BASE.turso.io"
$env:DATABASE_AUTH_TOKEN="TU-TOKEN" node apply-schema.mjs db\schema.sql

Cuando termine (te tiene que imprimir OK: db\schema.sql aplicado.), borralo:

Remove-Item apply-schema.mjs

### 4. Producción — Turso + Vercel

```bash
# 1. Instalar Turso CLI (https://turso.tech/install)
winget install Turso       # Windows
# o: curl -sSfL https://get.turso.tech | bash   # Linux/macOS

turso auth login

# 2. Crear la base
turso db create stock-descuentos

# 3. Obtener credenciales
turso db show stock-descuentos --url
turso db tokens create stock-descuentos

# 4. Aplicar schema (base nueva)
turso db shell stock-descuentos < db/schema.sql

# Si la base ya tenía datos previos, aplicar solo migraciones nuevas:
# turso db shell stock-descuentos < db/migrations/002_rate_limits.sql
```

Configurar en **Vercel → Project Settings → Environment Variables** (solo Production):

| Variable              | Valor                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `libsql://<tu-db>.turso.io` (del paso 3)                                                                   |
| `DATABASE_AUTH_TOKEN` | token del paso 3                                                                                           |
| `JWT_SECRET`          | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — **distinto al de desarrollo** |
| `ADMIN_USERNAME`      | ej. `admin`                                                                                                |
| `ADMIN_PASSWORD`      | contraseña del admin general                                                                               |

El primer deploy y login con `ADMIN_USERNAME`/`ADMIN_PASSWORD` crea la cuenta `administrador_general` automáticamente.

---

### 5. Instalar y correr

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). El primer login con `ADMIN_USERNAME`/`ADMIN_PASSWORD` crea la cuenta `administrador_general`; desde ahí se gestionan el resto de usuarios, tiendas y permisos en `/admin/gestion`.

## Estructura

- `src/app/admin/*` — panel de administración (rol `admin` / `administrador_general`).
- `src/app/client/*` — vista de tienda (rol `client`).
- `src/app/(auth)/login` — login.
- `src/app/api/*` — route handlers (auth, export, lotes).
- `src/lib/actions/*` — Server Actions por dominio (usuarios, tiendas, credenciales, permisos).
- `src/lib/auth.ts` — sesión JWT, hashing de contraseñas, `requireRole`/`requireModule`.
- `src/lib/rate-limit.ts` — rate limiting en memoria para login y acciones sensibles (por proceso; no persiste entre restarts ni se comparte entre instancias).
- `src/proxy.ts` — proxy de Next (equivalente a `middleware.ts` en versiones previas): redirige por rol antes de renderizar `/admin`, `/client` y `/login`.
- `db/schema.sql` / `db/migrations/` — esquema y migraciones de la base.

## Scripts

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run start   # servir el build
npm run lint    # eslint
```
