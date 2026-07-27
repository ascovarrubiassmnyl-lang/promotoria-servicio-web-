# Deploy en Railway (un solo servicio)

El proyecto se despliega como **un servicio** en Railway: el build compila el
frontend (Vite) y el backend Express lo sirve como estáticos junto con la API
(`/api/*`). El `package.json` de la raíz orquesta todo:

- **Build**: `npm run build` → instala backend (con `prisma generate` vía
  postinstall), instala frontend y corre `vite build` → `frontend/dist`.
- **Start**: `npm start` → `prisma migrate deploy` (aplica migraciones) →
  `node prisma/seed.js` (en producción solo crea políticas RBAC y el super
  admin desde variables de entorno; **cero datos demo**) → arranca Express.

## 1. Crear el proyecto en Railway

1. En [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**
   y selecciona este repositorio (root directory = raíz del repo, Railway
   detecta el `package.json` raíz con Nixpacks).
2. Agrega una base de datos: **+ New → Database → PostgreSQL**.
3. En el servicio de la app → **Settings → Networking → Generate Domain** para
   obtener la URL pública (`https://<app>.up.railway.app`).

## 2. Variables de entorno del servicio

En el servicio de la app → **Variables**:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin de Postgres) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | secreto largo y aleatorio (p. ej. `openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `7d` |
| `SUPERADMIN_EMAIL` | email real del super admin |
| `SUPERADMIN_PASSWORD` | contraseña del super admin (mínimo 8 caracteres) |
| `GOOGLE_CLIENT_ID` | Client ID de OAuth (paso 3) |
| `VITE_GOOGLE_CLIENT_ID` | el **mismo** Client ID (lo lee el build del frontend) |
| `FRONTEND_URL` | la URL pública del servicio (para CORS) |
| `PUBLIC_URL` | la URL pública del servicio (links de notificaciones push) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | opcional: push web (`npx web-push generate-vapid-keys`); sin ellas el push queda deshabilitado sin romper nada |

**No** definas `VITE_API_URL` en producción: el frontend usa `/api` (mismo
origen) por default.

En producción **no hay cuentas demo**: la única cuenta inicial es el super
admin de `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` (create-only: cambiar la
variable después no resetea la contraseña; eso se hace desde la app). Las
cuentas `*@demo.com` y los datos de prueba solo existen en desarrollo.

## 3. Google OAuth (registro/acceso con Google)

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   crea un proyecto (o usa uno existente) → **Credentials → Create Credentials
   → OAuth client ID → Web application**.
   - Si es la primera vez, configura antes la **OAuth consent screen**
     (tipo External, nombre de la app, correo de soporte; con los scopes
     básicos de email/perfil no requiere verificación de Google).
2. En **Authorized JavaScript origins** agrega:
   - `https://<app>.up.railway.app` (producción)
   - `http://localhost:5173` (desarrollo)
   (No necesita redirect URIs: se usa Google Identity Services con ID token.)
3. Copia el **Client ID** (`....apps.googleusercontent.com`) a
   `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID` en Railway, y a
   `backend/.env` y `frontend/.env` locales para probar en desarrollo.

Comportamiento (decisión de producto): cualquier cuenta de Google puede
registrarse, pero nace como **ASESOR inactivo** y no puede entrar hasta que
un promotor la active en **Asesores → Equipo → Activar**. Un usuario ya
existente y activo puede iniciar sesión con Google si el email coincide.

## 4. Archivos subidos (uploads)

`backend/uploads/` (documentos de clientes) vive en el filesystem, que en
Railway es **efímero**: se pierde en cada deploy. Para conservarlos, agrega un
**Volume** al servicio (Settings → Volumes) montado en `/app/backend/uploads`.

## 5. Verificar el deploy

1. `https://<app>.up.railway.app/health` → `{ ok: true }`.
2. Login con el super admin de las variables.
3. Botón "Continuar con Google" visible (si configuraste el Client ID); una
   cuenta nueva debe mostrar el aviso "pendiente de activación" y aparecer
   como Inactivo en Asesores → Equipo.
4. Configuración → Roles y accesos: las políticas RBAC existen (las siembra
   la migración + seed).

## Desarrollo local (sin cambios)

Sigue igual: `npm run dev` en `backend/` (4000) y `frontend/` (5173), con las
cuentas demo del seed. El bloque de estáticos del backend solo se activa con
`NODE_ENV=production` y `frontend/dist` presente.
