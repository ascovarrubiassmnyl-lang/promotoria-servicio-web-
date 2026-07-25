# CRM Promotoría — guía para sesiones de Claude Code

CRM para una promotoría de Seguros Monterrey New York Life (SMNYL). Monorepo con
dos apps que corren en desarrollo con `npm run dev` en cada carpeta:

- `backend/` — Express + Prisma 5 + PostgreSQL (puerto **4000**, nodemon recarga solo).
  Auth: **JWT propio** (`Authorization: Bearer`), emitido en `/api/auth/login`.
- `frontend/` — React 18 + Vite (puerto **5173**), Tailwind (`darkMode: 'class'`),
  @tanstack/react-query para datos, axios en `src/api/client.js` (agrega el token solo).

Usuarios demo: `asesor1@demo.com`/`asesor123`, `superadmin@demo.com`/`super123`.

## Roles y control de acceso (convención del proyecto)

Roles en `Usuario.rol`: `SUPERADMIN`, `ADMIN`, `ASESOR`. **"Promotor" = ADMIN o
SUPERADMIN** (helper `esAdmin()` en `AuthContext`). El rol vive en `user.rol`,
obtenido de `/api/auth/me`.

Toda funcionalidad restringida se implementa en **tres capas, fallando cerrado**:

1. **Navegación** — el ítem de menú solo se renderiza si el rol lo permite
   (`Layout.jsx`, `esAdmin()` / `puede(seccion)`).
2. **Guard de ruta** — `<AdminRoute>` / `<SeccionRoute>` en `App.jsx`
   (`components/Protected.jsx`) redirigen a `/` si no hay permiso.
3. **Autorización en la API (la que manda)** — cada ruta de Express verifica rol
   y propiedad. Patrón estándar en `backend/src/routes/*`:
   - listados: `if (req.user.rol === 'ASESOR') where.asesorId = req.user.id`
     (el parámetro `asesorId` del cliente se **ignora** para asesores);
   - recursos: dueño o admin (`esDueno || isAdmin`), si no → 403.

Ejemplo vigente: la vista de **Equipo** (`/equipo`, roster de asesores y consulta
de carteras ajenas) es solo para promotores; `GET /api/ventas/equipo/resumen`
devuelve 403 a los asesores, y `GET /api/ventas` nunca devuelve pólizas ajenas a
un asesor aunque manipule `asesorId`.

## Sección Pólizas (rediseño 2026-07)

- `components/polizas/PolicyList.jsx` y `PolicyDetail.jsx` son **componentes
  únicos compartidos por ambos roles**; no se duplican por rol.
- `components/polizas/PolizasView.jsx` es el contenedor: `asesorId` define el
  scope (null = cartera propia; con valor, las pólizas nuevas se asignan a ese
  asesor y el selector de clientes se limita a su cartera). `readOnly` existe
  como modo consulta pero hoy **no se usa**: el promotor tiene control total.
- Asesor: `/ventas` → su propia cartera, con crear/editar/eliminar/registrar pago
  (`PolizaFormModal.jsx`, modal único para crear y editar).
- Promotor: `/equipo` (roster con agregados por asesor) → `/equipo/:asesorId`
  (misma lista/detalle con **control total**: crear/editar/eliminar/registrar
  pago sobre la cartera del asesor, con banner de alcance). `/ventas` redirige
  a `/equipo` para admins.
- **Validación**: en `PolicyDetail`, los promotores (`esAdmin()`) ven botones
  Aprobar/Rechazar mientras el estado no sea `APROBADA`/`RECHAZADA`/`CANCELADA`;
  el backend registra `validadoPor` + `fechaValidacion` en el PATCH de estado.
- Detalle data-driven del modelo `Venta`: suma asegurada, plazo, deducible,
  coaseguro, `coberturas` (Json `[{nombre, detalle?, monto?}]` — `monto` es texto
  libre: "$800,000", "Incluida", "10%"), `beneficiarios` (Json
  `[{nombre, porcentaje?}]`), calendario de recibos desde `recordatoriosPago`.

### Reglas de negocio de comisiones (no romper)

- **Ganado** = pólizas `PAGADA`/`APROBADA` → se pinta **verde** (`.money-earned`).
- **En pipeline** = `PENDIENTE_PAGAR`/`FIRMADA` → tono **neutro** (`.money-pending`).
- `CANCELADA`/`RECHAZADA` no cuentan en ninguno de los dos.
- **Nunca** sumar ganado + pipeline en una sola cifra: son tarjetas/columnas
  separadas. Helpers: `esVentaGanada`/`esVentaPipeline` en `lib/format.js`.
- Las tablas de pólizas llevan fila de totales (prima total; comisión desglosada
  en "ganada · pipeline").

## Sistema de diseño (tokens y componentes)

Los tokens viven en dos lugares — **no dejar hex sueltos en componentes**:

- `frontend/tailwind.config.js` — paleta `brand` completa (50–900, azul).
  Semánticos por convención de Tailwind: `emerald` = ganado/éxito, `amber` =
  pipeline/pendiente, `red` = peligro/cancelado, `slate` = neutros. Modo oscuro
  siempre con variantes `dark:`.
- `frontend/src/index.css` (`@layer components`) — clases compuestas:
  - `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`,
    `.badge` (píldora; `.badge-dot` le añade punto de estado).
  - `.kpi` + `.kpi-green|.kpi-amber|.kpi-accent` (tarjeta KPI con barra de acento
    izquierda) con `.kpi-label`, `.kpi-val`, `.kpi-note`.
  - `.tag` (etiqueta rectangular neutra: forma de pago, ramo), `.avatar`
    (iniciales), `.kv-k`/`.kv-v` (par clave/valor de fichas),
    `.money-earned`/`.money-pending`, `.scope-banner`.

Componentes reutilizables en `components/ui.jsx`:

- `Card({ title, subtitle, actions, children })` — contenedor estándar.
- `Stat({ title, value, subtitle, color })` — KPI simple (sin barra de acento).
- `Badge({ color })` y derivados `ClienteBadge`/`CitaBadge`/`VentaBadge` (estado→color).
- `Modal({ open, onClose, title, wide })`, `Drawer({ ..., wide })`, `Field({ label })`,
  `EmptyState({ message })`.

Formato: helpers y catálogos de labels en `lib/format.js` (`mxn`, `fechaCorta`,
`edad`, `RAMOS_LABEL`, `FORMAS_PAGO`, `ESTADOS_VENTA_LABEL`, `PAGOS_POR_ANIO`…).
Siempre usar estos labels en lugar de escribir textos de enum a mano.

Para rediseñar otra vista (Dashboard, Clientes, Citas, Actividad) con este
lenguaje: KPIs arriba con `.kpi`, barra de filtros con `.input w-auto`, tabla
dentro de `.card` con `thead` uppercase + hover en filas + `tfoot` de totales,
montos con `tabular-nums`, y estados como badges con punto.

## Seguridad operativa

- `backend/.env` y `frontend/.env` contienen secretos (JWT, VAPID, DB) y están
  gitignorados: **nunca** deben entrar a un commit.
- `backend/uploads/` (archivos de clientes) también está gitignorado.
- No hacer commit/push sin que el usuario lo pida.
- Migraciones: carpetas con timestamp en `backend/prisma/migrations` +
  `npx prisma migrate deploy` (el entorno no es interactivo: `migrate dev` falla;
  generar el SQL con `prisma migrate diff` si hace falta).
