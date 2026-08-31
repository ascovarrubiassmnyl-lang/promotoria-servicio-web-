# CRM Promotoría — guía para sesiones de Claude Code

CRM para una promotoría de Seguros Monterrey New York Life (SMNYL). Monorepo con
dos apps que corren en desarrollo con `npm run dev` en cada carpeta:

- `backend/` — Express + Prisma 5 + PostgreSQL (puerto **4000**, nodemon recarga solo).
  Auth: **JWT propio** (`Authorization: Bearer`), emitido en `/api/auth/login`.
- `frontend/` — React 18 + Vite (puerto **5173**), Tailwind (`darkMode: 'class'`),
  @tanstack/react-query para datos, axios en `src/api/client.js` (agrega el token solo).

Usuarios demo: `asesor1@demo.com`/`asesor123`, `superadmin@demo.com`/`super123`.
Solo existen en desarrollo: `prisma/seed.js` no las crea con
`NODE_ENV=production` (ahí solo siembra políticas RBAC y el super admin real
desde `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, create-only) y la pantalla de
login solo muestra la de superadmin en `import.meta.env.DEV` — nunca deben
llegar a producción ni quedar hardcodeadas en código que entre al bundle.

**Alta de usuarios = solo por invitación (no hay registro abierto, ni con
Google ni con contraseña).** `POST /api/usuarios` (Asesores → Equipo → "+
Nuevo usuario", solo con alcance de administración) ya **no acepta
`password`**: el rol solo puede ser uno de `ROLES_ASIGNABLES`
(`ADMIN` | `ASISTENTE` | `ASESOR`; el select de la UI no ofrece Súper Admin —
ver más abajo) y toda alta nace `activo: false` con un hash aleatorio
irrecuperable. Al guardar, en la misma request: (1) se crea un
`InvitacionUsuario` (token de un solo uso, vence a las 72h), (2) se intenta
enviar por correo vía SMTP (`services/mailer.js`, "mejor esfuerzo": si no hay
`SMTP_HOST/SMTP_USER/SMTP_PASS` en el `.env` o el envío falla, solo queda un
`console.warn`/`console.error`, la respuesta no se bloquea), y (3) la UI abre
**automáticamente** el modal "Link de invitación" con el link para copiar y
compartir a mano (WhatsApp, correo) — el correo automático nunca sustituye
ese respaldo manual, siempre aparece. Un link vencido o no entregado se
reemplaza con `POST /api/usuarios/:id/invitacion` (botón "Invitar" en el menú
⋯ de la fila, solo visible si el usuario está inactivo; también reintenta el
correo).

El asesor/promotor abre `/invitacion/:token` (`pages/Invitacion.jsx`, pública,
fuera de `ProtectedRoute`): ahí **crea su propia contraseña** (mínimo 6
caracteres, con confirmación) y solo cuando es válida aparece el botón de
Google — que sirve **únicamente para verificar identidad**, no como login
recurrente. `POST /invitaciones/:token/google` (`routes/invitaciones.js`, sin
`authenticate`) exige que el correo de la credencial coincida **exactamente**
con el del perfil ya creado; si coincide, en una sola transacción activa la
cuenta (`activo: true`), guarda esa contraseña (hash) y marca la invitación
usada — de ahí en adelante esa persona entra siempre por `/login` con
email + contraseña, igual que el superadmin. Si no coincide (o la credencial
no es válida), 403/401 sin tocar nada. `POST /api/auth/google` **ya no
existe**: el login normal no muestra botón de Google (`Login.jsx`), Google
Identity Services solo se usa dentro de esta pantalla de invitación.

**SUPERADMIN es un solo rol reservado para quien desarrolla el servicio**
(se siembra por `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, ver arriba): no se
crea ni se asigna desde la app en ningún caso (ni aunque el actor ya sea
superadmin) — `POST /api/usuarios` y el PATCH de rol lo rechazan siempre
(400), y el `<select>` de rol en el modal de Asesores → Equipo solo ofrece
Admin/Promotor y Asesor. El admin puede administrar el negocio por completo
(crear/editar/invitar/desactivar/eliminar usuarios) pero nunca tocar ese rol.

**Borrado permanente de usuarios** (`DELETE /api/usuarios/:id`, ADMIN o
SUPERADMIN, menú ⋯ → "Eliminar definitivamente" con modal de confirmación —
nunca botón directo): distinto de "Desactivar", que solo cambia `activo` y
conserva todo. Antes de borrar la fila de la base de datos, cuenta los
registros asociados por `asesorId` (`Cliente`, `Venta`, `Cita`, `Actividad`,
`Target`, `Bono`, `Nota`, `Referido`, `DocumentoCliente`) — si tiene
cualquiera, rechaza con 409 y sugiere desactivar en su lugar. Es necesario
porque casi todas esas relaciones son `onDelete: Cascade` en el schema: un
borrado sin esta guarda se llevaría en silencio toda la cartera del asesor.
No se puede eliminar a uno mismo ni al SUPERADMIN.

**Deploy (Railway, un solo servicio)**: ver `DEPLOY.md`. El `package.json`
raíz hace build del frontend y el backend sirve `frontend/dist` como
estáticos + fallback SPA **solo** con `NODE_ENV=production` (`server.js`);
`start:prod` corre `prisma migrate deploy` + seed + servidor. En producción
el frontend usa `/api` (mismo origen) — no definir `VITE_API_URL` ahí.

## Roles y control de acceso (convención del proyecto)

Roles en `Usuario.rol`: `SUPERADMIN`, `ADMIN`, `ASISTENTE`, `ASESOR`.
**"Promotor" = ADMIN o SUPERADMIN**; el alcance de administración incluye
además a `ASISTENTE` (helper `esAdmin()` en `AuthContext`, espejo de
`ROLES_ADMIN`/`tieneRolAdmin()` en `backend/src/middleware/auth.js`). El rol
vive en `user.rol`, obtenido de `/api/auth/me`.

**`ASISTENTE` = la secretaría de la promotoría** (2026-08-18, agregado para
Michelle): apoya con papelería, emisión de pólizas y el alta de asesores
nuevos, así que necesita **exactamente el mismo acceso que la promotora** —
su política RBAC se sembró como copia de la de ADMIN y `esAdmin` la incluye.
Lo que **no** es, es promotora: `GET /usuarios/promotores` sigue filtrando
solo `ADMIN`, así que no se ofrece para acompañamientos, no expone
disponibilidad (`GET /citas/disponibilidad` la rechaza con 400) ni aparece
como promotor invitable; y como todos los rosters/rankings filtran
`rol: 'ASESOR'` (`/usuarios/asesores`, metricas, targets, clinica,
ventas/equipo), tampoco contamina el ranking ni las metas. Por eso se creó un
rol en vez de darle ADMIN: con dos ADMIN, el autoselect de promotor único en
`CitaFormModal` dejaría de aplicar y saldría listada como si acompañara
ventas. **Los catálogos de rol tienen fuente única** —
`ROLES_ASIGNABLES`/`ROLES_ADMIN` en `middleware/permisos.js` y
`middleware/auth.js`, espejados en
`frontend/src/components/configuracion/secciones.js`
(`ROLES_LABEL`, `ROLES_DESC`, `ROLES_MATRIZ`, `ROLES_ADMIN`,
`ROLES_ASIGNABLES`)—: al agregar un rol se tocan esos, no cada `if` suelto.
Un check en línea de "dueño o admin" usa `tieneRolAdmin(req.user)`, nunca la
comparación de literales a mano.

### Modelo RBAC (rediseño 2026-07): acceso por rol

- **Política por rol** = modelo `PoliticaRol` (`accesos` Json `{seccion: bool}`,
  seed en la migración `20260725230000_rbac_politicas_bitacora`). Es el único
  control de acceso; se edita en Configuración → "Roles y accesos". **No hay
  excepciones por usuario** (se eliminaron por redundantes; `Usuario.permisos`
  quedó legacy y nadie lo lee ni escribe — para dar acceso distinto a una
  persona se le cambia el rol).
- **Acceso efectivo** (única implementación: `accesoEfectivo()` en
  `backend/src/middleware/permisos.js`): SUPERADMIN siempre `true` →
  política del rol → **denegar** (fail closed). Las secciones de
  administración (`asesores`, `configuracion`) tienen además **piso de rol**:
  no se conceden a un rol sin alcance de administración (hoy solo ASESOR) ni
  activando su toggle (sus rutas no tienen scoping por asesor); el PATCH de
  políticas lo rechaza y la UI lo bloquea.
- **Enforcement en servidor**: cada router lleva `permiteSeccion('<seccion>')`
  tras `authenticate` (metricas usa `permiteAlguna('dashboard','asesores')`;
  notas/referidos/documentos cuentan como `clientes`; bonos y
  productos-catalogo como `ventas`; push queda self-service). El frontend
  **no re-deriva reglas**: `/auth/login` y `/auth/me` devuelven
  `usuario.accesos` calculado en servidor y `puede()` lo consume tal cual.
- **Salvaguardas anti-lockout**: el rol SUPERADMIN no es editable (acceso
  total); nadie puede cambiar su propio rol; cambios a secciones sensibles
  (Asesores, Configuración) piden confirmación en la UI.
- **Bitácora obligatoria**: todo cambio de política o de rol se registra
  en `PermisoLog` (quién, qué, cuándo, sobre quién) vía `logPermiso()`; se
  consulta en Configuración → "Registro de cambios".

Toda funcionalidad restringida se implementa en **tres capas, fallando cerrado**:

1. **Navegación** — el ítem de menú solo se renderiza si `puede(seccion)`
   (`Layout.jsx`), que lee `user.accesos` del servidor. (El sidebar **se
   colapsa solo al hacer clic en un `NavLink`** —2026-08-26, a pedido del
   usuario: ya navegaste, el menú estorba y el contenido necesita el ancho—;
   se reabre con el botón de expandir y la preferencia sigue viviendo en
   `localStorage` bajo `crm:sidebar:colapsado`.)
2. **Guard de ruta** — `<SeccionRoute>` / `<AdminRoute>` en `App.jsx`
   (`components/Protected.jsx`) redirigen a la primera sección permitida.
3. **Autorización en la API (la que manda)** — `permiteSeccion` + verificación
   de rol y propiedad. Patrón estándar en `backend/src/routes/*`:
   - listados: `if (req.user.rol === 'ASESOR') where.asesorId = req.user.id`
     (el parámetro `asesorId` del cliente se **ignora** para asesores);
   - recursos: dueño o admin (`esDueno || isAdmin`), si no → 403.

Ejemplo vigente: la vista de **Equipo** (`/equipo`, roster de asesores y consulta
de carteras ajenas) es solo para promotores; `GET /api/ventas/equipo/resumen`
devuelve 403 a los asesores, y `GET /api/ventas` nunca devuelve pólizas ajenas a
un asesor aunque manipule `asesorId`.

### Matriz de visibilidad por rol

| Vista | ASESOR | Promotor (ADMIN/SUPERADMIN) |
| --- | --- | --- |
| Dashboard, Clientes, Citas, Pólizas (`/ventas`), Actividad | Solo **sus** datos (API fuerza `asesorId = req.user.id`) | Datos de todo el equipo, con filtro por asesor |
| Equipo (`/equipo`, `/equipo/:asesorId`) | No ve el enlace, ruta redirige, API 403 | Roster + control total de la cartera del asesor |
| Asesores, Configuración | No (política de rol + piso de rol en servidor) | Sí (editar permisos: solo SUPERADMIN) |
| Metas (`/targets`) | Solo **su** meta y avance ("Mi meta"; GET fuerza `asesorId`, `/targets/equipo` y POST → 403) | Meta de promotoría + metas de todos, ranking, reconciliación y edición |
| Ficha de cliente (`/clientes/:id`) | Solo clientes **propios** (403 en fichas ajenas, por URL o API) | Cualquier ficha, con banner de alcance si el cliente es de otro asesor |

Las tres capas para cada fila: enlace condicionado en `Layout.jsx`, guard
`SeccionRoute`/`AdminRoute` en `App.jsx`, y validación de rol + propiedad en la
ruta de Express correspondiente (la única capa que garantiza la restricción).

## Sección Dashboard (rediseño 2026-08-25: minimalista, a pedido del usuario)

`pages/Dashboard.jsx` (`/`, compartida por ambos roles; el alcance lo fuerza el
servidor). El rediseño 2026-07 (hero con anillo + narrativa de ritmo + 6
secciones) se sintió "ruidoso" para un asesor — el usuario pidió explícitamente
volver a lo que se consulta día a día. Jerarquía actual: **encabezado**
(saludo + fecha + selector de periodo), **4 KPIs** (prima vendida, pólizas
activas, clientes, vigencias por vencer), "Requiere tu atención", proceso de
ventas y ranking (solo admin). **Se eliminaron** "Estado de pólizas" y
"Referidos y bonos" como tarjetas del dashboard — esos números siguen vivos en
Pólizas y Metas, no se duplican aquí. Sin emojis (SVG); tipografía = la sans
del sistema.

- **Encabezado**: saludo dinámico por hora (`saludo()`: Buenos días/tardes/
  noches) + fecha completa de hoy en español (no la del periodo consultado,
  que vive solo en el selector) + badge de rol (Promotoría/Asesor). El
  selector de periodo (`PeriodoSelector`) reemplaza el `<select>` de mes y el
  `<input type="number">` de año: flechas para moverse de mes en mes, un
  botón "Hoy" que solo aparece si el periodo visible no es el actual, y un
  popover con cuadrícula de 12 meses + salto de año (mismo patrón que el
  selector de año de `DatePicker` en `ui.jsx` — llegar lejos sin decenas de
  clics).
- **Los 4 KPIs son las métricas que el usuario pidió, ni más ni menos**
  (`KpiPrincipales`, clases `.kpi`/`.kpi-green`/`.kpi-accent`/`.kpi-amber` del
  sistema de diseño, mismo patrón que los KPIs de `Asesores.jsx`):
  "Prima vendida" (`primaAnualTotal` del periodo, verde), "Pólizas activas"
  (nuevo campo `polizasActivas` — snapshot de hoy, **no** acotado al mes en
  curso, igual criterio que `totalClientes`), "Clientes" (`totalClientes` +
  nota de altas del mes, acento de marca) y "Vencen en N días" (nuevo campo
  `polizasPorVencer: {count, dias}`, ámbar solo si `count > 0`).
- **El anillo de meta y su narrativa de ritmo se retiraron del centro visual**
  (eran justo el "ruido" señalado), pero el semáforo de ritmo **no se perdió**:
  sigue viviendo, más discreto, como color del texto bajo la cifra de "Prima
  vendida" (reusa `claveRitmo`/`ESTADOS_RITMO`/`pctAvance` de
  `components/metas/ritmo.js`, sin `proyeccion` — ya no hay párrafo de
  proyección). Sin meta asignada, la nota dice "sin meta asignada"/"sin meta
  de promotoría" en vez de mostrar 0%.
- **"Póliza activa" = misma definición que la ficha de cliente** (`estado ∈
  {PAGADA, FIRMADA, APROBADA}`, constante `ACTIVA` en
  `backend/src/routes/metricas.js`, **no** confundir con `GANADA` que usa el
  dashboard para "venta ganada del periodo" — son dos conjuntos distintos:
  `GANADA` excluye `FIRMADA`). "Vencen en N días" cuenta esas mismas pólizas
  activas cuyo `fechaFinVigencia` cae entre hoy y hoy + `DIAS_ALERTA_VIGENCIA`
  (15). Ninguno de los dos se acota por `creadoEn` del mes: son fotos de hoy,
  no del periodo consultado (igual criterio que `totalClientes`).
- **Fuente única**: `GET /metricas/dashboard` (mes/año) devuelve KPIs, `meta`
  (asesor → su `Target`; promotor → `TargetEquipo` — calculado en servidor,
  el asesor jamás recibe la meta o datos de otros), `atencion` (pendientes de
  pago con prima, citas de hoy, seguimiento, bonos por ganar), `polizasActivas`,
  `polizasPorVencer`, y `ranking` con `metaPrima` (solo no-asesores). El
  endpoint también sigue calculando `polizasMes`/`referidosMes`/`bonosMes`
  (no se borraron del backend: `Asesores.jsx` y futuros consumidores de
  `/metricas/dashboard` pueden necesitarlos) **aunque el dashboard ya no los
  pinte** — no romper esos campos ni los del ranking al tocar este endpoint.
  `GET /metricas/proceso-ventas` alimenta el proceso de ventas.
  **`/metricas/pipeline` y
  `/metricas/ventas-por-ramo` se eliminaron** (métricas duplicadas con
  definiciones propias — no reintroducirlos). El desglose por ramo volvió
  en 2026-08-25 como el campo **`primaPorRamo`** (`[{ramo, prima, count}]`,
  desc por prima) **del propio `/metricas/dashboard`**, y eso no contradice
  lo anterior: lo que se eliminó fue un endpoint con **su propia** definición
  de "venta por ramo"; este campo es un `groupBy(['ramo'])` con exactamente
  los mismos `GANADA` + `whereAsesor` + `wherePeriodo` que ya calculan
  `primaAnualTotal`, así que sus segmentos **suman ese mismo número** (es el
  invariante que hace fiable la dona). Un desglose nuevo se agrega así —
  afinando la consulta que ya existe— nunca con un endpoint aparte.
- **UN solo "Proceso de ventas", de 5 pasos** (2026-08-26, definido por el
  usuario; `ProcesoVentas` en `Dashboard.jsx` +
  `GET /metricas/proceso-ventas?mes&anio`). Antes eran **dos embudos en un
  toggle** —`/metricas/funnel` (foto de en qué etapa está parado cada cliente
  hoy) y `/metricas/funnel-actividad` de 7 niveles (lo que pasó en el mes)—
  y el usuario los mandó consolidar porque eran "casi las mismas métricas
  solo divididas": el lector tenía que reconciliar dos lecturas del mismo
  trabajo. **Ambos endpoints se eliminaron; no reintroducirlos** (mismo
  criterio con que se borraron `/metricas/pipeline` y `/ventas-por-ramo`).
  La tarjeta ya no se llama "Embudo del pipeline" ni tiene toggle.
  Los 5 pasos, del contacto frío a la póliza cobrada, cada uno con la
  **definición de su módulo dueño** (aquí no se inventa ningún conteo):
  1. **Prospectos nuevos** — clientes creados en el mes, sin archivados
     (= la métrica `prospectos` de Metas).
  2. **Llamadas realizadas** — actividades `LLAMADA` del mes (= Metas).
  3. **Citas obtenidas** — citas **creadas** en el mes excluyendo `PERSONAL`
     (mismo criterio de exclusión que el resto de métricas de citas). Es
     "cita conseguida", no "cita asistida": el vocabulario de la clínica y
     de 25 puntos. El nivel "citas asistidas" del embudo viejo **ya no se
     pinta** aquí (sigue disponible como métrica de Metas).
  4. **Cierres** — pólizas del mes en `FIRMADA`/`APROBADA`/`PAGADA`: el
     momento en que el prospecto dijo que sí.
  5. **Pólizas emitidas, pagadas y entregadas** — las del mes en
     `APROBADA`/`PAGADA`, es decir **exactamente la "venta ganada"** de
     Pólizas y Metas. (4) contiene a (5), así que el embudo estrecha y la
     conversión entre ambos se lee sola.
  De ahí sale la **tasa de cierre del proceso completo** (nivel 5 / nivel 1).
  **Ojo con los 3 primeros niveles: no son un embudo estricto.** Se llama y
  se agenda cita con prospectos de meses anteriores, así que la conversión
  "Prospectos nuevos → Llamadas" puede pasar de 100% (se vio 150% con datos
  reales). Es correcto y es información: significa que se está trabajando
  cartera vieja. No "arreglarlo" acotando las llamadas a los prospectos del
  mes — eso sí inventaría una definición nueva.
- **Definiciones únicas** (mismas que Pólizas/Metas, no recalcular distinto):
  venta ganada = `APROBADA`/`PAGADA` con `creadoEn` en el mes; la única "tasa
  de conversión" es la del proceso de ventas entre niveles consecutivos, que
  calcula **el servidor** (`conversionPct`) — el frontend solo la pinta y
  resalta en ámbar el mayor cuello de botella (`CUELLO_BOTELLA_PCT = 50`).
- Estados vacíos que guían (agregar cliente / agendar cita / invitar asesor) y
  filas de atención/ranking enlazan a su sección.

### Gráficas del dashboard (2026-08-25)

Una **sola fila** de dos gráficas entre los KPIs y Atención/Proceso de ventas, tomada
como referencia de UI de la sección `dashboard-2` de la plantilla
`shadcn-dashboard-landing-template` que el usuario señaló. Se adoptaron el
**tipo de gráfica y el layout**, NO su stack: el CRM sigue sin shadcn/ui ni
Radix, y las tarjetas se visten con `.card` y los tokens de siempre. Aporta
lo que el rediseño minimalista no tenía —lectura en el tiempo y de dónde
viene el dinero— sin volver a llenar la pantalla de tarjetas.

- **`recharts` es la única dependencia nueva** (motor de las gráficas, igual
  que en la plantilla). Pesa ~400 kB, así que las dos gráficas viven en
  `components/dashboard/Graficas.jsx` y se cargan con `lazy()` + `Suspense`
  desde `Dashboard.jsx`: **misma convención que el 3D decorativo** — el
  bundle inicial no debe crecer por una librería de presentación (quedó en
  703 kB, idéntico a antes; recharts sale en su propio chunk). No importarlas
  de forma estática.
- **"Tendencia de ventas"** (área + línea de meta punteada, 12 meses) NO pide
  datos propios: consume **`GET /targets/historial?meses=12`**, que ya existía
  para Metas y ya resuelve el alcance por rol en servidor. Así la prima del
  dashboard y la de Metas no pueden diferir (misma `actualesPorMes()`). El
  array llega del mes más reciente al más antiguo y el frontend lo invierte.
  Ese endpoint vive bajo la sección `metas`, así que la gráfica se pide solo
  si `puede('metas')` y, si no, la fila queda con una sola columna.
  La línea de meta lleva `connectNulls={false}` (un mes sin `Target` deja
  hueco, no se inventa la línea) **y `dot` visible, que no es decorativo**:
  un mes con meta rodeado de meses sin meta no tiene segmento que trazar y
  sin punto la meta quedaba invisible (pasó con la única meta cargada).
- **"Prima por ramo"** (dona) consume `primaPorRamo` del mismo
  `/metricas/dashboard` (ver arriba) y su centro **reusa
  `data.primaAnualTotal`**, la cifra del KPI "Prima vendida" — nunca la suma
  de los segmentos, aunque sean iguales: una cifra, un origen. Colores desde
  `RAMOS_COLOR` (`lib/format.js`, junto a `RAMOS_LABEL`), fuente única.
- **Delta "vs. mes anterior"** solo en **Prima vendida** y **Clientes**, del
  mismo `historial` (`actual.prima` / `actual.prospectos`). "Pólizas activas"
  y "Vencen en N días" se quedan **a propósito** sin delta: son fotos de hoy,
  no del periodo, y compararlas contra "el mes pasado" no significaría lo
  mismo. Sin mes previo con dato (`previo = 0`) no se muestra delta: un
  aumento desde cero no es un porcentaje.
- recharts pinta SVG y **no entiende las variantes `dark:`**: los colores de
  grid/ejes salen de `coloresGrafica(tema)` con `useTheme()`, con los mismos
  slate del sistema. Cualquier gráfica nueva debe hacer lo mismo.
- **El proceso de ventas y el ranking NO se convirtieron a recharts** (siguen en divs con
  barras): ya miden bien el proceso y pasarlos a gráfica sería solo estética.

### Ranking de asesores — leaderboard (2026-08-25)

`components/dashboard/Leaderboard.jsx` (`RankingAsesores`) reemplaza la lista
plana que vivía dentro de `Dashboard.jsx`: encabezado con el rango de fechas
del periodo, **podio de los 3 primeros** (orden visual 2–1–3, corona en el
primero) y **lista paginada** de 10 debajo. El diseño viene de un componente
de referencia que el usuario señaló; **se adoptó el diseño, no el stack** —
venía en TypeScript sobre shadcn/ui + Radix (`@/components/ui/*`, `cn()`) y
aquí es JS + Tailwind con los tokens de siempre (`.card`, `.avatar`,
`.money-earned`, `.input w-auto`), misma decisión que con las gráficas y el
filtro de etapas. **Cero dependencias nuevas.**

- **Solo promotores**: el bloque se monta con alcance de administración y
  `/metricas/dashboard` no incluye `ranking` para un ASESOR (`if (!esAsesor)`)
  — las dos capas de siempre, ninguna se relaja.
- **El `runOptions` del componente original se tradujo a la métrica de orden**
  (`METRICAS_RANKING`: prima, pólizas, citas, clientes). **No pide datos
  nuevos**: las cuatro cifras ya venían en cada fila del `ranking`, así que
  cambiar de métrica solo reordena en el cliente. La métrica no elegida no se
  pierde: se muestra como byline de la fila.
- **La barra conserva el semáforo de ritmo** (`claveRitmo`/`ESTADOS_RITMO`/
  `pctAvance` de `components/metas/ritmo.js`, fuente única) **solo al ordenar
  por prima**, que es la única métrica con meta (`metaPrima`). En las otras
  tres la barra es neutra y mide "% del líder" — no inventar un semáforo para
  una métrica que no tiene meta.
- Los colores oro/plata/bronce del podio son decoración local: **no** son
  tokens semánticos (emerald/amber/red siguen significando ganado/pendiente/
  peligro) y no deben reusarse como estado.

## Sección Pólizas (rediseño 2026-07)

- `components/polizas/PolicyList.jsx` y `PolicyDetail.jsx` son **componentes
  únicos compartidos por ambos roles**; no se duplican por rol.
- `components/polizas/PolizasView.jsx` es el contenedor: `asesorId` define el
  scope (null = cartera propia; con valor, las pólizas nuevas se asignan a ese
  asesor y el selector de clientes se limita a su cartera). `readOnly` existe
  como modo consulta pero hoy **no se usa**: el promotor tiene control total.
- Asesor: `/ventas` → su propia cartera, con crear/editar/eliminar/registrar pago
  (`PolizaFormModal.jsx`, formulario único para crear y editar — desde
  2026-08-25 es una **ficha técnica de pantalla completa**, ver más abajo).
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
- **Coberturas guiadas desde el catálogo** (2026-07-30): `ProductoCatalogo.coberturas`
  (mismo shape `[{nombre, detalle, monto}]`, fuente: bóveda Obsidian
  `10_Seguros_SMYNL/Productos`, cargado vía `backend/prisma/productosCatalogoData.js`)
  es el catálogo de coberturas disponibles por producto (21 de 21 productos
  documentados). En `PolizaFormModal`, al elegir un producto del catálogo aparece
  un selector "Agregar cobertura del catálogo…" con las coberturas que aún no se
  agregaron a la póliza — se eligen **una por una**, nunca todas de golpe. Una
  fila agregada así queda con `nombre`/`detalle` de solo lectura (definidos por
  la compañía, no editables) y solo `monto` editable (varía por edad/suma
  asegurada/suscripción); "+ Agregar cobertura personalizada" sigue disponible
  para filas 100% libres fuera del catálogo. Cambios al catálogo (vía seed o
  `PATCH /api/productos-catalogo/:id`) no migran automáticamente pólizas ya
  creadas — `Venta.coberturas` es una copia, no una referencia viva.
- **`ProductoCatalogo.monedas`** (Json `["USD","UDI"]`, 2026-08-13): monedas
  en que la compañía ofrece el producto (Orvi y Star Dotal se contratan en
  USD/UDI, Vida Mujer en pesos, etc. — fuente: los manuales SMNYL en
  `Productos/`). En `PolizaFormModal` **limita el selector de moneda** y
  preselecciona la única disponible. Es una sugerencia: `Venta.moneda`
  manda. El seed es create-only **salvo este campo**, que sí se rellena en
  productos ya sembrados (se agregó después del catálogo original).

### Ficha técnica de la póliza — pantalla completa (2026-08-25)

`PolizaFormModal` dejó de ser un recuadro centrado: al elegir **"Capturar los
datos manualmente"** (y también al editar, y al confirmar un prellenado con
IA) la captura abre en **pantalla completa** con `PantallaCompleta`
(`components/ui.jsx`) — encabezado y pie fijos, contenido scrolleando entre
ambos, para que el botón de guardar no se pierda al final de cinco secciones.
Lo único que sigue siendo un `Modal` chico es la **elección inicial** "subir
documento / capturar a mano": es una pregunta de dos opciones, no una captura.
`PantallaCompleta` se usa cuando el formulario ES la tarea; **no convertir
todos los formularios del sistema a esto** — un `Modal` sigue siendo lo
correcto para preguntas cortas y confirmaciones.

La ficha está organizada en **5 secciones numeradas** (`SeccionFicha`), en el
orden que definió el usuario:

1. **Contratante** — el nombre se prellena con el del cliente (la póliza solo
   se crea desde su ficha) y **queda editable**: a veces contrata otra persona
   (un padre para un hijo). `Venta.contratante` guarda lo que quedó escrito;
   `null` = pólizas anteriores a este campo, donde la UI cae al nombre del
   cliente. El nombre llega por la prop `nombreCliente` desde
   `ClienteDetalle`, o de la lista cuando el cliente se elige aquí mismo.
2. **Datos de la póliza** — aseguradora (fija, `ASEGURADORA` en
   `polizas/tipos.js`, no es un campo), **`Venta.numeroPoliza`** (ya tiene
   columna propia: antes la extracción con IA lo anexaba a Notas por no tener
   dónde ponerlo), ramo, producto del catálogo filtrado por ramo (ya existía),
   plazo, **clave del agente** y estado.
3. **Vigencia y pago** — inicio/fin de vigencia (con la sugerencia por plazo
   de siempre), **"Forma de pago" = `metodoPago`** (con qué medio paga:
   tarjeta, transferencia, efectivo…) y **"Financiamiento / plazo de pago" =
   `formaPago`** (cada cuánto se cobra: mensual/trimestral/semestral/anual).
   Ojo con esos dos rótulos: son los nombres que pidió el usuario y quedan
   cruzados respecto a los nombres de columna históricos. Además prima anual +
   moneda (`MontoMoneda`), día de pago, monto por pago, fechas de firma y
   emisión, próximo pago y domiciliación.
4. **Comisión** — `comisionPct` y **comisión estimada de solo lectura**
   (`prima en pesos × %`). Con la póliza en divisa usa el equivalente del día;
   sin tipo de cambio no muestra cifra, en vez de inventar una.
5. **Detalle del ramo** — plan, suma asegurada, deducible/coaseguro
   (GMM/Salud), red médica (**solo GMM**), asegurados, coberturas,
   beneficiarios y notas.

**Dos campos nuevos que NO son lo que parecen:**

- **`Venta.situacion`** (enum `SituacionPoliza`: `ACTIVA` / `POR_RENOVAR` /
  `EN_RESCATE`, mapa único `SITUACIONES` en `polizas/tipos.js`) es la lectura
  **operativa** de una póliza viva. **NO sustituye a `Venta.estado`**
  (`EstadoVenta`), que sigue siendo el estado administrativo del que salen
  "comisión ganada", "en pipeline" y "póliza activa" en métricas, metas y
  ranking. Son dos campos a propósito: una póliza `PAGADA` puede estar por
  renovar. En la ficha se rotulan "Estado de la póliza" y "Estado
  administrativo". `situacion` es nullable y **ningún cálculo la lee** — no
  colgarle métricas sin decidirlo explícitamente.
- **`Venta.asegurados`** (Json `[{nombre, parentesco, fechaNacimiento}]`) son
  las personas **cubiertas** por la póliza; `beneficiarios` son quienes
  **cobran** el siniestro. No mezclarlos. `fechaNacimiento` se guarda como el
  string `'YYYY-MM-DD'` del `DatePicker` (dato de la carátula, no un
  instante), así que al pintarlo hay que leerlo como fecha **local**
  (`fechaDia()` en `PolicyDetail`): `new Date('2000-05-10')` es medianoche UTC
  y en México se vería un día antes.

**`Usuario.claveAgente`** (clave con que la compañía identifica al asesor) se
captura **una sola vez** en Asesores → Equipo y la ficha de cada póliza la
muestra sola, de solo lectura. **Es un dato de la persona, no de la póliza: no
se copia a `Venta`**, se lee siempre del asesor dueño (`GET /ventas` y
`/ventas/:id` la incluyen en `asesor`). Cuando un promotor captura sobre la
cartera de otro asesor, la clave que aplica es la de **ese** asesor
(`GET /usuarios/promotores` no, `GET /usuarios/asesores` sí la devuelve), no
la de quien teclea. También viaja en `/auth/me` para el caso normal.

El **ramo `VIDA` sigue existiendo** aunque no apareciera en la lista que dio
el usuario (GMM, Acumulación, Protección, Salud, Retiro): hay pólizas
registradas con él y quitarlo del enum las rompería.

### Moneda, domiciliación y pagos (2026-08-13)

Mapa único `frontend/src/components/polizas/tipos.js` (`MONEDAS`,
`METODOS_PAGO`, `SEMAFOROS_PAGO`, `semaforoPago`) — espejo de los enums
`MonedaPoliza` / `MetodoPagoPoliza` / `EstadoPagoPoliza`.

- **`Venta.primaAnual` SIEMPRE está en MXN.** Es el campo que suman todas
  las métricas, comisiones, metas y ranking; una póliza en USD/UDI guarda su
  monto original en `primaMoneda` y la conversión la hace **el servidor** en
  `resolverPrima()` (`routes/ventas.js`), no cada consumidor. **El asesor
  NUNCA captura el tipo de cambio** (corregido 2026-08-16, ver más abajo
  "Tipo de cambio 100% automático"): solo transcribe la prima en la moneda
  del contrato y el servidor resuelve `tipoCambio` solo. Sin ninguna fuente
  de tipo de cambio disponible, USD/UDI responde 400 en vez de inventar una
  paridad.
- **Nombre del producto bloqueado**: con `productoCatalogoId` elegido, el
  nombre lo define la compañía y queda de solo lectura en `PolizaFormModal`
  (mismo patrón que las coberturas del catálogo). Para escribirlo libre hay
  que elegir "— Personalizado —".
- **`Venta.domiciliada`**: si es true **no se generan recordatorios de
  cobro** y `sincronizarRecordatorioPago()` **borra** los abiertos (el cargo
  es automático; recordarlo es ruido). Aplica igual en `reminderJob.js`.
- **`Venta.fechaEmision`** es distinta de `fechaFirma` (el cliente firma la
  solicitud; la compañía emite después).
- **Fin de vigencia automático desde el plazo del producto** (2026-08-15,
  cambio de criterio pedido por el usuario — antes se sugería siempre un año):
  `finDeVigenciaSugerido(inicioISO, anios)` en `PolizaFormModal.jsx` adelanta
  `anios` desde el inicio y resta un día (vence la víspera del aniversario).
  Los años salen de `aniosDePlazo()`, que traduce el texto que ya producía
  `plazoDesdeNombre()` ("20 años" → 20, "10 pagos" → 10, "Anual renovable" →
  1, "Plazo medio (10-19 años)" → 10, el piso del rango). Devuelve `null` —y
  se cae al año de vigencia de siempre— en los plazos que no son un número
  fijo de años: "Todos los pagos" y "Hasta edad 60" (vitalicios / atados a la
  edad, que el modal no conoce) y SeguBeca ("18 menos la edad del menor").
  Se dispara en **dos** momentos, siempre sin pisar un ajuste manual: al
  capturar el inicio (solo si el fin está vacío) y al elegir producto cuando
  el inicio ya estaba puesto (solo si el fin sigue siendo exactamente el que
  sugerimos con el plazo anterior). Bajo el campo hay un texto que dice a
  cuántos años se sugirió y con qué plazo. **Es solo una sugerencia editable
  para no teclear la fecha a mano: no es un dato de negocio ni se guarda el
  número de años.** Nota de dominio que sigue vigente: el plazo ("20 pagos")
  es periodo de PAGO y la póliza se renueva de forma anual — la fecha
  sugerida es la del fin del plan, y el asesor la corrige si su póliza dice
  otra cosa.
- **El campo "Plazo" se autorrellena desde el catálogo** (2026-08-14): el
  plazo ya viene codificado en el `nombre` del producto ("Orvi 10 pagos",
  "Star Dotal 20 años", "Imagina Ser PPR — Pagos Limitados 15") porque cada
  plazo es una **variante distinta del catálogo**, no un campo aparte.
  `plazoDesdeNombre()` en `PolizaFormModal.jsx` lo extrae al elegir producto
  y el campo sigue siendo editable. Los **21 productos** autorrellenan: los 5
  que no declaran plazo en el nombre salen del mapa explícito
  `PLAZO_POR_PRODUCTO` en ese mismo archivo, con el dato del manual SMNYL —
  Vida Mujer "20 años" (periodo de cobertura y de pago de primas, manual
  §"Periodo de pago de primas"), los 3 Alfa Medical "Anual renovable" (GMM,
  no tiene plazo en años) y SeguBeca "18 menos la edad del menor" (su plazo
  **no es fijo**: la presentación lo define como `18 − edad del menor`, así
  que se prellena la fórmula para que el asesor ponga el número del caso).
  **No se agregó campo al modelo**: reestructurar el catálogo consolidando
  variantes rompería `productoCatalogoId` y la matriz de coberturas/monedas.
- **Coberturas**: el shape Json creció a `[{nombre, detalle, monto, costo}]`.
  `monto` sigue siendo el texto libre de la suma asegurada ("$800,000",
  "Incluida"); `costo` es el costo extra **numérico en MXN**, y `null`/0
  significa incluida. Es informativo: la prima la captura el asesor.
- **Modelo `PagoPoliza`** (ventaId, periodo, fechaPago, estado,
  montoEsperado, montoPagado, justificacion, registradoPor): historial real
  de cobros. Antes un pago solo dejaba rastro como nota completada, así que
  no había de dónde sacar el semáforo ni cómo registrar un monto distinto.
  `POST /ventas/:id/cobroconfirmado` acepta `{montoPagado, justificacion}` y
  el frontend lo pide en un **modal de confirmación con monto y periodo a la
  vista** (`PolicyDetail`) — ya no un `confirm()` del navegador. El monto
  esperado lo deriva el servidor (`montoEsperadoDePoliza`: `montoPago` o
  prima/periodos) y viaja como `venta.montoEsperado`.
- **Semáforo de pagos** = lectura derivada (`semaforoPago()`), no un campo:
  cancelada/rechazada → rojo; domiciliada → verde; `fechaProximoPago`
  vencida → ámbar; con pagos registrados o PAGADA → verde; si no, neutro.
- **`Venta.sumaAseguradaMoneda`** (2026-08-14, `MonedaPoliza`, default MXN):
  la suma asegurada tiene su **propia** moneda, independiente de la de la
  prima (`Venta.moneda`) — una póliza dotal puede primar en MXN y tener la
  suma asegurada pactada en UDIS. `PolizaFormModal` la preselecciona igual a
  `moneda` al elegir producto del catálogo (el caso normal) pero el asesor la
  puede cambiar con su propio selector en cualquier momento; **no hay
  conversión automática** entre ambas, es solo la denominación en que se
  capturó el número (mismo criterio que `primaMoneda`/`tipoCambio`, que sí
  convierten porque alimentan métricas — la suma asegurada no alimenta
  ninguna). El input usa `components/ui.jsx: NumeroFormateado` (separador de
  miles en vivo, "350,000") en vez de `<input type="number">`, que no puede
  mostrar comas; mismo componente reusable para cualquier otro monto grande
  del sistema.

### Multi-moneda en toda la póliza + Banxico (2026-08-15)

**Todos** los montos de la póliza tienen moneda propia (MXN/USD/UDI), no solo
la prima y la suma asegurada: se agregaron `Venta.montoPagoMoneda`,
`Venta.deducibleMoneda` y `costoMoneda` por fila dentro del Json
`Venta.coberturas` (migración `20260815140000_poliza_multimoneda`; las filas
guardadas antes no lo traen y se leen como MXN). Motivo: Orvi, Star Dotal y
Alfa Medical Internacional se contratan en USD/UDIS y forzar esos campos a
pesos obligaba a convertir a mano.

- **`Venta.primaAnual` SIGUE SIENDO SIEMPRE MXN** — esta sección no cambia esa
  regla. Es el único campo que alimenta métricas, comisiones, metas y ranking,
  y lo convierte `resolverPrima()` en el servidor. Los demás montos se guardan
  **en su moneda original, sin convertir**: son informativos y no alimentan
  ningún cálculo de negocio, así que convertirlos crearía una segunda
  definición de la verdad.
- **Tipo de cambio = Banxico** (`backend/src/services/tipoCambio.js`, expuesto
  en `GET /ventas/tipo-cambio`, declarado **antes** de `/:id` como el resto de
  rutas de segmento fijo). Series SIE: **SF43718** (FIX, pesos por dólar) y
  **SP68257** (valor de la UDI). Se eligió Banxico porque el FIX es la paridad
  con que se liquidan estas pólizas y porque **la UDI solo la publica Banxico**
  — ninguna API de FX genérica la tiene. Cache en memoria de 3h (el FIX se
  publica una vez al día) y timeout de 6s.
- **`BANXICO_TOKEN` en `.env`** (gratuito:
  banxico.org.mx/SieAPIRest/service/v1/token) da el dato oficial del día.
- **El equivalente en pesos NO se guarda: se calcula al vuelo** con el TC del
  día, en `equivalenteMXN()` (`components/polizas/tipos.js`). Por eso siempre
  refleja el valor actual y no una foto vieja. `equivalenteMXN` devuelve `null`
  cuando no hay TC disponible y la UI entonces **no muestra ninguna cifra en
  pesos** (con aviso ámbar) — es deliberado: mostrar un equivalente calculado
  con una paridad inventada o vencida es peor que no mostrarlo.
- **`Venta.sumaAseguradaTC`** es la única foto que sí se persiste: el TC con el
  que se le enseñó la cifra al cliente al capturar. Informativo puro (nadie más
  lo lee), igual que `tipoCambio` para la prima.
- **Componente único `components/polizas/MontoMoneda.jsx`** (monto +
  selector de moneda + equivalente en pesos) para **prima, suma asegurada,
  monto por pago y deducible** (2026-08-16: la prima se unificó al mismo
  componente, ver abajo). No volver a armar ese trío a mano en otro campo.
- **Sumar montos de monedas distintas exige convertir primero**: el total de
  "costo extra de coberturas" (formulario y `PolicyDetail`) convierte cada
  fila a MXN antes de sumar, y excluye —avisando— las filas en divisa sin TC.
  Nunca sumar los números crudos.

### Tipo de cambio 100% automático — el asesor nunca lo captura (2026-08-16)

**Corrección de diseño** sobre la sección anterior: la primera versión de
multi-moneda (2026-08-15) seguía pidiéndole al asesor un campo "Tipo de
cambio" obligatorio junto a la prima en USD/UDI. El usuario lo rechazó de
raíz: *"esto no fue lo que yo quería […] ni siquiera quiero que esto me
impida poder crear una póliza"*. Además, ese campo era la causa raíz de un
bug real reportado por el usuario — con el tipo de cambio en blanco o mal
capturado, `primaEnPesos` colapsaba y el asesor terminaba tecleando el
número de la **suma asegurada** en el campo de prima por confusión visual
entre dos campos casi idénticos, así que una póliza podía quedar con
`primaAnual` idéntica a `sumaAsegurada` — dos conceptos financieros
totalmente distintos (la prima es lo que cuesta el seguro; la suma asegurada
es lo que se cobra en un siniestro). Ambos problemas se resolvieron juntos:

- **`PolizaFormModal` ya no tiene ningún campo de tipo de cambio.** El campo
  "Prima anual" usa `MontoMoneda` igual que suma asegurada/deducible/monto
  por pago: el asesor solo transcribe la cifra tal cual viene en el
  documento de la compañía, en la moneda que sea, y ve el equivalente en
  pesos informativo debajo (o un aviso ámbar si no hay TC disponible en ese
  momento) — nunca un bloqueo para guardar.
- **`resolverPrima()` (`utils/prima.js`, antes en `routes/ventas.js`)
  resuelve el TC ella misma**, de forma async, contra `tipoCambioVigente()`.
  Solo usa un `tipoCambio` explícito si alguien lo manda (edición de una
  póliza histórica pactada a otra paridad); en el flujo normal de alta, el
  frontend nunca lo manda. Vive en `utils/` para que el job de
  automatizaciones la comparta (ver "Sin tipo de cambio…" abajo).
- **Respaldo manual cuando Banxico no responde**
  (`TIPO_CAMBIO_USD_RESPALDO` / `TIPO_CAMBIO_UDI_RESPALDO` en `.env`,
  decisión explícita del usuario: tiene su propia alerta que le avisa cuando
  cambia el valor de la UDI y los actualiza él mismo a mano cuando
  corresponde — **no hay integración automática para esto, es intencional**,
  no reintroducir un servicio que lo intente). `tipoCambioVigente()`
  (`services/tipoCambio.js`) cae a este respaldo solo si Banxico no
  responde (sin token, caído, o sin publicar ese día) y no hay nada en
  cache; el resultado se marca `fuente: 'respaldo-manual'`.
- **Editar sin tocar la prima no debe re-disparar la conversión**: el
  formulario reenvía `moneda`/`primaMoneda` en cada PATCH aunque el asesor
  no los haya tocado (son parte fija del payload). Si eso disparara siempre
  un nuevo `resolverPrima()`, cualquier edición trivial (cambiar solo el
  estado, por ejemplo) volvería a consultar el TC del día y movería
  `primaAnual` sin que nadie lo pidiera. Por eso el PATCH solo recalcula
  cuando `primaMoneda`/`moneda` **realmente cambiaron** contra lo ya
  guardado; si no cambiaron, conserva el `tipoCambio` existente de la
  póliza aunque el TC del día ya sea otro.
- **`resolverPrima` es async** (antes síncrona) porque consulta
  `tipoCambioVigente()`; ambos call sites (`POST /` y `PATCH /:id`) la
  esperan con `await`.

### Sin tipo de cambio NO se bloquea el alta: prima pendiente (2026-08-31)

**Segunda corrección** sobre lo anterior, del mismo reporte del usuario: en
producción (Railway) faltaban `BANXICO_TOKEN` y las dos variables de respaldo,
así que `tipoCambioVigente('UDI')` no devolvía nada y `resolverPrima()`
respondía **400** — el asesor simplemente **no podía registrar ninguna póliza
en UDIS**, que es la moneda de casi todo Orvi/Star Dotal. La regla vieja
("mejor rechazar que inventar una paridad") protegía bien el dato pero
convertía una falla de configuración en un bloqueo total de captura.

- **Nunca se rechaza por falta de TC.** Sin ninguna fuente disponible, la
  póliza se guarda con `primaAnual: 0` y `tipoCambio: null`: esa combinación
  con `moneda != 'MXN'` (y `primaMoneda` capturada) **es** la marca de
  "pendiente de conversión" — **no se agregó columna nueva**, se deriva, mismo
  criterio que el segmento prospecto/cliente y el semáforo de pagos. Lo que sí
  sigue rechazando es una prima en 0 o vacía: ese es un error de captura, no
  de tipo de cambio.
- **Sigue sin inventarse una paridad**: `primaAnual` en 0 no es una cifra
  falsa, es la ausencia declarada de la cifra. Ninguna métrica suma un número
  equivocado; simplemente esa póliza no aporta prima hasta que se convierta.
- **Se convierte sola**: `reconciliarPrimasPendientes()` (regla 4 de
  `jobs/automatizacionesJob.js`, cada hora) busca esas pólizas, reintenta
  `resolverPrima()` y, cuando hay TC, escribe `primaAnual`, `tipoCambio` y
  recalcula `comisionMonto`. **No notifica**: el asesor ve aparecer la cifra,
  no necesita un aviso por algo que el sistema resolvió solo (mismo criterio
  que el llenado de la clínica).
- **La UI dice "por convertir", nunca "$0"**: `primaPendienteConversion()`
  (`components/polizas/tipos.js`, implementación única) la detecta y
  `PolicyDetail`, `PolicyList` y el resumen de `PolizaFormModal` muestran el
  monto en su moneda original + la explicación, en vez de un cero que haría
  pensar que la póliza no vale nada. El aviso de `MontoMoneda` dejó de ser
  ámbar y ahora dice explícitamente que se puede guardar igual.
- **Configurar Railway sigue siendo lo correcto** (`BANXICO_TOKEN` y/o
  `TIPO_CAMBIO_USD_RESPALDO`/`TIPO_CAMBIO_UDI_RESPALDO`): esto es la red de
  seguridad, no el sustituto de tener la fuente de tipo de cambio bien puesta.

### Formato de miles en todos los montos capturados a mano (2026-08-16)

El usuario notó que solo uno o dos campos mostraban separador de miles al
escribir (ej. "20,000") y pidió aplicarlo **en todo el sistema** donde se
captura una cifra de dinero. `components/ui.jsx: NumeroFormateado` ya
existía (usado en `sumaAsegurada` desde 2026-08-14) — el trabajo fue barrer
el resto de los formularios y reemplazar cada `<input type="number">` de
**dinero** (no de conteos/porcentajes/edades/años, que se quedan como
número simple) por este componente: prima anual y costo de cobertura en
`PolizaFormModal`, monto pagado en `PolicyDetail`, ingresos anuales en
`CandidatoFormModal`, y la métrica de prima + meta de ingreso (PRP) en
`Targets.jsx` (el catálogo `METRICAS` de `components/metas/metricas.js` ya
distinguía `money: true/false` por métrica — se usó ese flag para decidir
cuáles llevan `NumeroFormateado` y cuáles siguen siendo `<input
type="number">` normal, ya que ventas/citas/prospectos/referidos/llamadas
son conteos, no dinero). `NumeroFormateado` es `type="text"`, así que donde
reemplazó a un `<input required>` la validación de "no vacío" se movió al
handler de submit en JS.

### Documento de la póliza y extracción con IA (2026-08-14)

Al hacer clic en "+ Nueva póliza" aparece primero una pantalla de elección
(**"Subir documento de la póliza"** vs. **"Capturar los datos manualmente"**)
en vez de ir directo al formulario — decisión explícita del usuario. Elegir
capturar a mano abre el formulario de siempre, sin cambios.

- **Subir y analizar**: `SubirPolizaModal.jsx` sube los PDF a
  `POST /ventas/analizar-documento` (multipart, reusa el mismo `/uploads` y
  convención de nombre físico que `routes/documentos.js`). El backend NO crea
  ni `Venta` ni `DocumentoCliente` ahí — solo guarda los archivos y devuelve
  los campos leídos; `PolizaFormModal` se prellena con esos datos (mismo
  formulario de captura manual, con un banner "Prellenado desde…" y opción de
  quitar los documentos) y **el asesor siempre revisa y confirma antes de
  guardar** — nada se persiste como póliza sin ese paso, por decisión
  explícita del usuario. Los `DocumentoCliente` recién se crean al hacer
  submit, dentro de la misma transacción que la `Venta` (`documentosTmp` en el
  body de `POST /ventas`). Si el asesor cancela sin guardar, los archivos
  quedan huérfanos en `/uploads` — mismo trade-off que cualquier upload
  abandonado en el resto del sistema; no hay barrido de limpieza todavía.
- **VARIOS documentos por póliza, analizados juntos** (2026-08-31): una póliza
  real no cabe en la carátula — la tabla de primas y los anexos vienen en PDF
  aparte. Se pueden subir hasta `MAX_DOCUMENTOS_ANALISIS` (6) y se mandan al
  modelo en **una sola petición** con varios `inlineData`, no uno por uno:
  solo viéndolos a la vez puede cruzar la prima de un documento con el
  producto de otro (la instrucción se lo dice explícitamente y le pide anotar
  en `advertencias` si dos se contradicen, quedándose con la carátula).
  **Todos quedan adjuntos** vía `DocumentoCliente.ventaId` (relación
  `VentaDocumentos`, 1 póliza → N documentos, migración
  `20260831120000_venta_documentos_multiples`); el **primero** es la carátula
  y además se marca en `Venta.documentoPolizaId`, que **no se tocó** (sigue
  siendo el 1:1 del documento principal, y con él la tarjeta de siempre).
  `PolicyDetail` los lista todos con el mismo `VisorDocumento` y su uploader
  ahora acepta múltiples: `POST /ventas/:id/documento` **ya no desplaza a la
  carátula** — si la póliza ya tiene principal, el archivo nuevo entra como
  anexo.
- **Extracción = Google Gemini** (`backend/src/services/extraccionPoliza.js`,
  **lista** de modelos `MODELOS_EXTRACCION`, no uno solo, decisión explícita del usuario por costo: tiene
  nivel gratuito real para este volumen y lee PDF nativo sin rasterizar a
  imagen — Anthropic habría sido la opción técnica preferida pero se descartó
  por costo). Requiere `GEMINI_API_KEY` en `.env` (gratis en
  aistudio.google.com/apikey); sin ella, `GET /ventas/analisis-disponible`
  responde `{disponible:false}` y el botón de subida queda deshabilitado con
  aviso — **subir/ver/descargar el PDF sigue funcionando siempre**, el
  análisis es un extra sobre eso, nunca un bloqueo. Usa `responseSchema`
  (salida JSON estructurada, sin parsear markdown) pidiendo producto, ramo,
  moneda, prima, suma asegurada, plazo, forma de pago, deducible/coaseguro,
  fechas de emisión/vigencia, coberturas, beneficiarios, más `confianza`
  (ALTA/MEDIA/BAJA) y `advertencias` cuando el documento es difícil de leer.
  Campos que la IA no encuentra se omiten (nunca se inventan). `asegurado` no
  tiene campo propio en `Venta`: se anexa al campo Notas para no perder el
  dato (`numeroPoliza` sí tiene columna desde la ficha técnica).
- **La prima anual se SUMA en código, no la calcula la IA** (2026-08-31): las
  carátulas de SMNYL normalmente no imprimen un total — traen una tabla con
  una columna **"PRIMA INICIAL"** donde cada fila (la cobertura básica, a
  veces marcada "VM", más cada adicional) aporta su parte, casi siempre en
  UDIS. El schema pide `primaInicial` **por cobertura** (valor literal de esa
  celda) y `mapearAForm()` en `SubirPolizaModal.jsx` hace la suma en JS: si
  hay al menos una fila con prima, esa suma manda sobre el `primaAnual` que
  el modelo haya adivinado. **No pedirle la aritmética al modelo** — extraer
  celdas lo hace bien, sumarlas es justo donde se equivoca. Cada
  `primaInicial` también se guarda como el `costo` de esa cobertura (en la
  moneda de la póliza), así que la ficha conserva el desglose del que salió
  el total.
- **Tener la carátula significa emitida y pagada**: el prellenado deja
  `estado: 'PAGADA'` (editable), no el `PENDIENTE_PAGAR` del alta manual — el
  asesor recibe ese documento justo cuando la compañía ya emitió y cobró. El
  único dato de la sección que la carátula normalmente **no** trae es la
  periodicidad (mensual/trimestral/semestral/anual): cuando el modelo no la
  encuentra, el mapeo marca `formaPagoPorConfirmar` y la ficha lo señala en
  ámbar junto al selector, en vez de dejar pasar el default `ANUAL` como si
  se hubiera leído del documento. (`formaPagoPorConfirmar` es solo estado de
  UI: el payload se arma campo por campo y nunca lo manda.)
- **Fechas: emisión Y vencimiento**. El fin de vigencia sí se mapeaba, pero el
  modelo lo omitía porque la carátula lo llama de otras formas; el schema
  ahora enumera los sinónimos reales ("fecha de vencimiento", "vigencia
  hasta", "vence el", "hasta las 12 horas del") e insiste en no devolver solo
  la de emisión.
- **`plan` (el "proyecto" del cliente)** se extrae y cae en el campo Plan de
  "Detalle del ramo". Es distinto de `producto`: Orvi es el producto,
  "Proyecto Imagina Ser" es el plan contratado.
- **El modelo se resuelve por lista, con fallback** (2026-08-27, bug real):
  Google retira modelos para las keys nuevas sin avisar — con la key vigente
  `gemini-2.5-flash` respondía **404 "no longer available to new users"**, y
  como la ruta atrapaba todo en un 502 genérico el asesor solo veía "No se
  pudo analizar el documento" sin causa. `MODELOS_EXTRACCION`
  (`gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-2.5-flash`) se prueba en
  orden y **el primero que responde se memoriza** en `modeloVigente` para no
  volver a pagar el 404 en cada análisis (se reevalúa al reiniciar). Se pasa
  al siguiente candidato solo con los errores que otro modelo sí podría
  atender —404, 500/503 y el timeout propio—; 401/403/429/400 se propagan tal
  cual, porque le pasarían igual a los tres y solo triplicarían la espera. `GEMINI_MODELO` en `.env` fija uno a
  mano y se salta la lista. **Cuando el análisis vuelva a fallar, la causa
  está en el log** (`[ventas] análisis de póliza falló (<status>)`) y el
  asesor recibe un mensaje accionable por caso —modelo retirado, cuota
  agotada, llave inválida, servicio saturado, documento ilegible—
  vía `motivoAnalisisFallido()` en `routes/ventas.js`, nunca otra vez un
  texto único para todo.
- **El límite de tiempo es un presupuesto TOTAL, y el navegador espera más que
  el servidor** (2026-08-27, segundo bug real): tras arreglar el 404 el asesor
  vio `timeout of 15000ms exceeded` — el default global de axios
  (`frontend/src/api/client.js`) cortaba a los 15 s un análisis que del lado
  del servidor seguía corriendo bien. Dos piezas, en este orden:
  `PRESUPUESTO_MS` (`GEMINI_TIMEOUT_MS`, **150 s** — el mismo PDF se ha medido
  entre 7 s y 60 s según el momento, así que el margen es holgado a propósito)
  es el presupuesto del
  análisis **completo**, repartido entre los candidatos —cada intento se lleva
  lo que queda, así tres modelos lentos ya no suman minutos— y el frontend
  manda `timeout: TIMEOUT_ANALISIS` (240 s) **por petición**, deliberadamente
  por encima, para que quien corte sea el servidor: es el único que sabe por
  qué falló y responde el mensaje accionable. El default global de 15 s se
  queda como está para las consultas normales; **subir un archivo también
  necesita el suyo** (`TIMEOUT_SUBIDA`, 120 s, en las 3 subidas del sistema:
  `SubirPolizaModal`, `PolicyDetail` y `ClienteDetalle` — 35 MB desde datos
  móviles tardan más de 15 s). Cualquier petición nueva que suba archivo o
  espere a un modelo debe pasar su propio `timeout`. `handleError` ya traduce
  `ECONNABORTED`/`ERR_NETWORK`: al asesor nunca le vuelve a salir el texto en
  inglés con milisegundos.
- **Diagnóstico, no dato de negocio**: `Venta.extraccionEn` /
  `extraccionModelo` / `extraccionConfirmada` solo registran si la póliza
  nació de un análisis y con qué modelo — nadie más los lee; sirven para
  saber si vale la pena reanalizar. `sumaAseguradaMoneda`, `moneda`, etc.
  quedan en los campos reales de siempre, no duplicados.
- **Agregar el documento después**: una póliza creada a mano (sin pasar por
  el análisis) puede recibir su PDF más tarde desde `PolicyDetail` → tarjeta
  "Documento de la póliza" → `POST /ventas/:id/documento` (sube y vincula
  directo, sin análisis con IA — ese paso solo existe en la creación).
- **Ver y descargar**: `components/documentos/VisorDocumento.jsx` (+ hook
  `useVisorDocumento`) es el visor **extraído** de `ClienteDetalle.jsx` (antes
  vivía inline ahí) para reusarlo también en `PolicyDetail.jsx` — mismo
  patrón del proyecto de "clic = previsualizar, descargar es secundario" vía
  `GET /documentos/:id/ver` con blob + object URL (la API va con token en
  header, no se puede apuntar un `<iframe>` directo a la ruta). No duplicar
  este visor de nuevo si se necesita en otra vista: importar desde ahí.
- **Ruteo de Express**: `GET /ventas/analisis-disponible` y
  `POST /ventas/analizar-documento` están declarados **antes** de
  `GET /ventas/:id` en `routes/ventas.js` — si fueran después, Express
  matchea `/:id` primero y trata "analisis-disponible" como un id de póliza
  (bug real encontrado al probar el endpoint). Cualquier ruta nueva de
  segmento fijo bajo `/ventas` debe ir antes de `/:id`, no después.

### Reglas de negocio de comisiones (no romper)

- **Ganado** = pólizas `PAGADA`/`APROBADA` → se pinta **verde** (`.money-earned`).
- **En pipeline** = `PENDIENTE_PAGAR`/`FIRMADA` → tono **neutro** (`.money-pending`).
- `CANCELADA`/`RECHAZADA` no cuentan en ninguno de los dos.
- **Nunca** sumar ganado + pipeline en una sola cifra: son tarjetas/columnas
  separadas. Helpers: `esVentaGanada`/`esVentaPipeline` en `lib/format.js`.
- Las tablas de pólizas llevan fila de totales (prima total; comisión desglosada
  en "ganada · pipeline").

## Sección Actividad (rediseño 2026-07)

**Eventos estructurados, nunca strings pre-renderizados.** El modelo `Actividad`
guarda `tipo` (enum canónico), `asesorId` (actor), `creadoEn` y `metadata` (Json
con el payload: `cliente`, `clienteId`, `producto`, `ramo`, `prima`, `nota`,
`titulo`, `proximoCobro`…). El texto visible se arma en el frontend a partir de
esos campos. `descripcion` es **nullable y solo fallback** de eventos históricos
que se guardaron ya formateados — no volver a escribirla.

- **Enum canónico** (única fuente backend: `registrarActividad()` en
  `backend/src/utils/actividad.js`, que rechaza tipos fuera de la lista):
  `POLIZA_CREADA`, `CITA_CREADA`, `CLIENTE_CREADO`, `LLAMADA`,
  `PAGO_CONFIRMADO`, `PAGO_RECORDADO`, `NOTA_CREADA`, `RECORDATORIO_CREADO`,
  `REFERIDO_CREADO`. (`VENTA_CREADA` fue migrado a `POLIZA_CREADA`
  preservando el original en `metadata.tipoOriginal`.) Para registrar actividad
  siempre usar `registrarActividad(asesorId, tipo, payload)`, nunca
  `prisma.actividad.create` directo.
- **Mapa único de presentación** `tipo → {label, color, icono, titulo(payload)}`
  en `frontend/src/components/actividad/tipos.jsx` (colores: póliza=emerald,
  cita=violet, cliente=blue, llamada=amber, pago=teal, recordatorio de
  pago=cyan, nota=slate, recordatorio=orange, referido=indigo). No duplicar
  labels/colores de actividad en otros componentes; tipos desconocidos caen a
  un estilo neutro vía `infoTipo()`.
- **UI**: `ActivityTimeline` (agrupa por día Hoy/Ayer/fecha, eje vertical,
  marcador por tipo, metadatos como chips) dentro de `ActividadView`
  (contenedor compartido por ambos roles, mismo patrón que `PolizasView`:
  `asesorId` define el scope). Los **chips de tipo son el filtro** (toggle con
  conteo, sin dropdown redundante) y la navegación temporal es **por semana
  lunes–domingo**, la misma unidad que el rango consultado.
- **Roles**: asesor ve solo su actividad (`GET /api/actividad` fuerza
  `asesorId = req.user.id` para ASESOR, ignora el query param); promotor ve
  todo el equipo en `/actividad` (con selector de asesor) y la actividad de un
  asesor en modo consulta en la pestaña Actividad de `/equipo/:asesorId`.

## Sección Clientes (rediseño 2026-07)

- **La pestaña de navegación se llama "CRM"** (2026-08-25, a pedido del
  usuario), no "Clientes": label en `allLinks`/`NAV_CORTO` de `Layout.jsx` y
  `titulo` por defecto de `ClientesView.jsx`. La ruta (`/clientes`), la
  sección RBAC (`clientes`) y los nombres internos de archivo/componente no
  cambiaron — es solo el texto que ve el usuario.
- **Filtro de etapa: menú desplegable, no chips en fila** (2026-08-25,
  `ClientesView.jsx`, dos vueltas de rediseño a pedido del usuario). Primera
  vuelta: de píldoras (`rounded-full border` + halo + badge propio) a chips
  de texto compacto (punto + label + conteo) — el usuario probó esa versión
  y "no le gustó". Segunda vuelta, con un componente de menú (ark-ui +
  Tailwind) como referencia visual: **un solo botón disparador** ("Todas las
  etapas" / la etapa activa, con su punto de color + chevron) que abre un
  **menú agrupado** — "En el embudo" (`ETAPAS`), "Fuera del embudo"
  (`ETAPAS_FUERA_EMBUDO`) y, tras un divisor, "Necesita seguimiento" — cada
  fila con punto de color + label + conteo discreto a la derecha, selección
  en fondo neutro (`bg-slate-100`/`dark:bg-slate-700`). El proyecto **no usa
  shadcn/ui ni TypeScript** (es JS puro) y CLAUDE.md ya tenía la convención
  de no meter dependencias nuevas para piezas de UI chicas (el DatePicker es
  el precedente hecho a mano) — así que en vez de instalar `@ark-ui/react` +
  `lucide-react` se recreó el patrón con React/Tailwind ya presentes en el
  proyecto: mismo click-outside (`ref` + `useEffect` con listener en
  `document`) que ya usan `EtapaCell` (la pill de la tabla) y `MenuAcciones`.
  Los campos `chipOn`/`badgeOn` de `components/clientes/etapas.js` (estilo
  de halo/badge de versiones anteriores de este filtro) siguen sin
  consumirse aquí — no confundir con los `chipOn`/`badgeOn` propios de
  `components/candidatos/tipos.js` y `components/actividad/tipos.jsx`, mapas
  aparte que sí siguen en uso para sus propios filtros de chips.
- **Prospecto vs. cliente es DERIVADO, no un campo** (2026-08-13): `GET
  /api/clientes` devuelve `esCliente` calculado en servidor (tiene al menos
  una `Venta` en `PENDIENTE_PAGAR`/`FIRMADA`/`APROBADA`/`PAGADA` —
  cancelada/rechazada no cuentan, mismo criterio que el resto del sistema).
  La lista lo presenta como switch **Todos | Prospectos | Clientes** encima
  de los chips de etapa, y el segmento se aplica **antes** que los chips
  (los conteos de etapa reflejan lo que el usuario está viendo). **No crear
  un enum `TipoContacto` capturado a mano**: se desincroniza en cuanto
  alguien cierra una venta y olvida cambiarlo.
- **"Cliente frío"** = prospecto sin datos de contacto. No necesitó columna
  nueva: `email` y `telefono` **ya eran opcionales**; lo que había era una
  validación de UI que obligaba a inventar correos falsos (`aaa@gmail.com`).
  El alta solo exige nombre y apellido paterno, y avisa en el modal cuando
  el registro va sin teléfono ni correo.
- **Fuente de captación**: mapa único `components/clientes/fuentes.js`
  (`FUENTES`, `infoFuente`, `opcionesFuente`). La columna sigue siendo
  `String?` a propósito — los clientes anteriores tienen texto libre y
  convertirla en enum los rompería; `opcionesFuente()` conserva el valor
  legacy como opción para no borrarlo al editar.
- **`Cliente.curp`** (migración `20260813180000_mejoras_ficha_polizas_recordatorios`)
  junto a `rfc`. La bandera **"necesita seguimiento" ya no se pide en el
  alta**: se marca desde el menú ⋯ de la ficha, cuando ya hay algo que seguir.
- **Etapas del pipeline**: enum ordenado con **mapa único**
  `etapa → {label, color, orden}` en `components/clientes/etapas.js`
  (`ETAPAS`, `infoEtapa`, `siguienteEtapa`); el color encodea progreso:
  PROSPECTO slate → CITA sky → PROPUESTA blue → CIERRE_FIRMA violet →
  ENTREGA_POLIZA teal → REFERIDOS cyan → POST_VENTA_SEGUIMIENTO emerald.
  No duplicar colores/labels de etapa en otros componentes (`ClienteBadge`
  ya consume este mapa). La etapa se muestra como pill + indicador de
  posición (segmentos en la lista, stepper en el expediente).
- **`CONTACTADO` es un paso del embudo** (2026-08-25), entre `PROSPECTO` y
  `CITA` (indigo): "ya le hablé, todavía no me da cita". Entra en el array
  `ETAPAS`, así que el stepper y los segmentos de progreso tienen 8 pasos. No
  confundir con `Cliente.fechaUltimaLlamada` (cuándo fue la llamada, no en qué
  punto del proceso está). **El "Proceso de ventas" del dashboard ya no se
  arma con estas etapas** desde 2026-08-26 (mide actividad del mes, no dónde
  está parado cada cliente — ver esa sección): agregar una etapa aquí ya no
  cambia lo que pinta el dashboard.
- **Tres etapas FUERA del embudo** (`ETAPAS_FUERA_EMBUDO` en `etapas.js`),
  deliberadamente fuera del array `ETAPAS` y con `orden: -1` — así el stepper,
  los segmentos de progreso y `siguienteEtapa()` las
  ignoran sin lógica extra. Se marcan con `fueraEmbudo: true` (antes se
  llamaba `terminal`, que dejó de describir a las tres; `terminal` quedó solo
  como dato propio de DESCARTADO):
  - `DESCARTADO` (roja, 2026-08-18) — no va a comprar (no contesta, no le
    interesa, no califica). Terminal.
  - `STANDBY` (ámbar, 2026-08-25) — interesado pero no ahora ("búscame en 3
    meses"). La pausa es deliberada, así que **sale de la clínica telefónica**
    y de la regla "prospecto estancado".
  - `RETARGETING` (fucsia, 2026-08-25) — se enfrió y hay que volver a
    trabajarlo. **Sí vuelve a la clínica telefónica** y sí dispara la alerta
    de estancado: es material de re-contacto, no una pausa.

  Lo que el usuario puede **elegir** (selectores, popover de la columna Etapa,
  chips de filtro) es `ETAPAS_SELECCIONABLES = [...ETAPAS,
  ...ETAPAS_FUERA_EMBUDO]`; `ETAPAS` a secas se reserva para pintar progreso.
  Donde no hay posición en el embudo se dice ("Fuera del embudo" en la lista,
  tarjeta en la ficha) en vez de pintar la barra vacía. La regla "prospecto
  estancado" de `automatizacionesJob.js` excluye DESCARTADO y STANDBY.
  **Ninguna es lo mismo que archivar** (`Cliente.archivadoEn`, borrado
  lógico): el cliente sigue en la lista y se reactiva cambiándole la etapa.
- **"Necesita seguimiento" es una BANDERA, no una etapa**: campo
  `Cliente.necesitaSeguimiento` (booleano), independiente de `estado` — un
  cliente puede estar en cualquier etapa y además necesitar seguimiento.
  El valor `NECESITA_SEGUIMIENTO` del enum es legacy (migración
  `20260725150000_cliente_flag_seguimiento` movió esas filas a la bandera,
  etapa PROSPECTO); el backend traduce el valor legacy a la bandera si aún
  llega, y la UI nunca lo ofrece como etapa.
- **Lista** = contenedor compartido `components/clientes/ClientesView.jsx`
  (mismo patrón que `PolizasView`: `asesorId` define el scope; `pages/
  Clientes.jsx` es solo un wrapper sin scope). Búsqueda + filtro de asesor
  (solo admin, se oculta con scope fijo) en el servidor; **los chips de etapa
  son el filtro** (con conteo, client-side) + chip ámbar de "Necesita
  seguimiento". Columna **"Próxima acción"**: la deriva el backend en
  `GET /api/clientes` (`proximaAccion` = lo más urgente entre la cita
  PROGRAMADA/CONFIRMADA más antigua y el recordatorio sin completar más
  próximo) — **no se inventa en el frontend**; vencida se pinta en rojo.
  Acciones por fila en menú ⋯ (Ver expediente / Editar / Agendar cita /
  **Recordatorio para el asesor** / **Recordatorio para el cliente** /
  Archivar); la acción primaria es abrir el expediente. Con `asesorId` los
  clientes nuevos se asignan a ese asesor (el modal oculta su selector).
- **La etapa se cambia desde la lista** (2026-08-14): la pill de `EtapaCell`
  es un botón que abre un popover con las `ETAPAS` y dispara el mismo
  `PATCH /clientes/:id { estado }` que la ficha (con `stopPropagation` para
  no navegar al expediente). El patrón de click-outside está clonado de
  `MenuAcciones`, **no reusado**: su contrato es de acciones, no de selección
  de valor. No duplicar labels/colores — salen de `etapas.js`.
- **Los recordatorios se crean desde la lista, no solo desde la ficha**
  (2026-08-14): el formulario vive en `components/notas/NotaFormModal.jsx`,
  **componente único compartido** (mismo patrón que `CitaFormModal` /
  `PolizaFormModal`) por `ClienteDetalle.jsx` y `ClientesView.jsx`. Props:
  `open`, `onClose`, `clienteId`, `tipo`, `destinatario`, `nombreCliente`.
  Las dos entradas del menú ⋯ son **planas** (una por `destinatario`): no hay
  submenús anidados en el proyecto y no se introdujo uno para esto.
- **Asesores → "CRM por asesor"** (`pages/Asesores.jsx`, solo promotores):
  roster estilo Equipo (avatar, fila clicable, prima en `.money-earned`) →
  detalle con breadcrumb, 4 KPIs `.kpi` y pestañas; la pestaña Clientes
  reutiliza `ClientesView` scoped con banner de alcance — no volver a la
  tabla plana de `VistasAsesor.jsx` (su `ClientesAsesor` se eliminó).
- El expediente (`/clientes/:id`, ver sección siguiente) incluye "Actividad
  reciente" reutilizando `ActivityTimeline` (`GET /api/actividad?clienteId=…`
  filtra por `metadata.clienteId`), stepper coloreado por etapa y botón
  "Avanzar etapa" (usa `siguienteEtapa`).

## Ficha de cliente (rediseño 2026-07)

`pages/ClienteDetalle.jsx` (`/clientes/:id`), compartida por ambos roles con
alcance de datos por rol (ver matriz de visibilidad).

- **Estado de póliza consolidado**: una sola columna con `VentaBadge` (estado
  primario del enum `EstadoVenta`) + subestado derivado "Póliza activa/inactiva"
  (`activa ⇔ estado ∈ {PAGADA, FIRMADA, APROBADA}`). "Activa" **no** es un campo
  independiente: nunca mostrarla como columna aparte.
- **Color de comisión por estado real**: verde (`.money-earned`) solo con
  `esVentaGanada`; pipeline en `.money-pending`; cancelada/rechazada en slate
  tachado. Aplica también a los stats del rail (Comisión ganada / En pipeline,
  nunca sumadas).
- **Acción destructiva = menú ⋯ + confirmación + borrado lógico.** Nada de
  botones rojos directos. `DELETE /api/clientes/:id` **archiva** (campo
  `Cliente.archivadoEn`, migración `20260725120000_cliente_archivado`): las
  pólizas, citas, notas y referidos se conservan. Restaurar:
  `PATCH { archivado: false }`. Los listados (`GET /api/clientes`) y las
  métricas excluyen archivados por defecto; `?archivados=1` los lista
  (toggle "Ver archivados" en `Clientes.jsx`). Para pólizas, la baja soft es
  `estado: CANCELADA`; el borrado físico queda como opción secundaria del menú
  con confirmación explícita.
- **Etapa del pipeline**: selector rotulado ("Etapa del pipeline") + stepper
  con el enum ordenado `ESTADOS_CLIENTE`. `NECESITA_SEGUIMIENTO` no es etapa
  del embudo: se muestra como banner ámbar de alerta.
- **Layout**: riel izquierdo (Contacto + Producto de interés, Resumen con 4
  stats, Referidos compacto) y columna principal (Pólizas, Citas, Notas +
  Recordatorios compactas en two-up, Archivos). Las secciones vacías no dominan
  la parte superior.
- **Un solo punto de edición** (2026-08-13): el botón "Editar" visible del
  encabezado se eliminó — la edición vive en el menú ⋯ como **"Agregar datos
  del cliente"** (y el botón del bloque Contacto dice "Agregar datos"), que
  es lo que realmente se hace ahí: completar RFC, CURP, fecha de nacimiento
  y dirección que no se piden al registrar. El campo `detalleInteres` ya no
  se muestra ni se edita en la ficha (duplicaba las notas); la columna se
  conserva por los datos históricos y **sí** se sigue capturando en el alta.
- **La ficha ya no tiene "Notas generales"** (2026-08-14): esa tarjeta
  mezclaba dos cosas distintas — el string legacy `Cliente.notas` (solo
  lectura ahí) y las `Nota` de `tipo: NOTA` — y duplicaba el propósito de los
  recordatorios. Se eliminó la Card completa; las dos tarjetas de
  recordatorios (asesor / cliente) quedan lado a lado. **`Cliente.notas` NO
  se borró**: se sigue capturando y editando en el modal de alta/edición de
  `ClientesView.jsx`, y la columna conserva los datos históricos. Desde la
  ficha ya no se crean `Nota` de tipo `NOTA` (los recordatorios cubren el
  caso real).
- **Archivos: clic = previsualizar, descargar es secundario.** `GET
  /documentos/:id/ver` sirve el archivo con `Content-Disposition: inline`;
  el visor es un modal que renderiza imágenes y PDF (otros formatos ofrecen
  la descarga). Como la API va con token en header, **no se puede apuntar un
  `<iframe>` a la URL**: se trae el blob y se crea un object URL local, que
  se revoca al cerrar. Descargar y eliminar viven en el menú ⋯ de la fila.
- La ficha **reutiliza** `PolizaFormModal` (prop `clienteId` fija el cliente y
  oculta su selector; con ficha ajena se pasa `asesorId` del dueño para que la
  póliza nueva se asigne a él). No duplicar formularios de pólizas. Lo mismo
  con `CitaFormModal` para agendar citas desde la ficha.

## Sección Citas / Calendario (rediseño 2026-07)

**Tipo de cita ≠ canal — no volver a cruzarlos.** Los campos de Prisma
conservan sus nombres históricos; la traducción a UI vive en el **mapa único**
`frontend/src/components/citas/tipos.js` (no duplicar labels/colores):

- `Cita.modalidad` (`ModalidadCita`) = **Tipo de cita** (quién participa):
  `CITA_UNICA` → "Cita de asesor" | `ACOMPANAMIENTO` → "Acompañamiento con
  promotor" (con selector de `promotorId`, validado como admin en el backend)
  | `ENTREGA_POLIZA` → "Entrega de póliza" (chip teal en el panel de detalle).
- `Cita.clasificacion` (`ClasificacionCita`, 2026-07-28) = **el COLOR del
  evento en el calendario** (metodología de la promotoría): `PRODUCTIVA`
  verde "Genera dinero" | `GESTION` ámbar "Gestión / seguimiento" |
  `PERSONAL` rojo. El canal ya NO colorea eventos (quedó como etiqueta de
  texto); `colorCita(c)` en `tipos.js` es el único punto de decisión del
  color. **Eventos personales**: `Cita.clienteId` es opcional — solo una cita
  `PERSONAL` puede no llevar cliente (checkbox "Evento personal" en el modal;
  bloquea agenda, cuenta para empalmes, la promotora la ve como ocupación).
  Las citas PERSONAL se excluyen de TODAS las métricas de citas (dashboard,
  ranking, targets: `clasificacion: { not: 'PERSONAL' }`) y no registran
  actividad en la bitácora.
- `Cita.tipo` (`TipoCita`) = **Canal** (medio): `TELEFONICA` → azul (blue),
  `PRESENCIAL` → teal, `VIDEO` → "Videollamada", violeta. El canal es el color
  de chips/eventos/leyenda, y la etiqueta del campo Ubicación se adapta al
  canal (`ubicacionLabel`: dirección / teléfono / link de videollamada).
- `Cita.estado` (`EstadoCita`) = ciclo de vida: `PROGRAMADA` blue,
  `CONFIRMADA` purple, `COMPLETADA` green, `CANCELADA` slate (chips tachados),
  `NO_ASISTIO` red. **El alta nunca pide estado**: `POST /api/citas` lo ignora
  y toda cita nace `PROGRAMADA`; después cambia con acciones del panel
  (Completar / Reagendar / Cancelar cita / No asistió).
- **Cancelar en vez de borrar**: la baja normal es `PATCH estado: CANCELADA`
  (conserva historial). El borrado físico (`DELETE`) es acción secundaria en
  el menú ⋯ con confirmación explícita — nunca botón directo.
- **Empalmes**: el backend detecta solape con citas vivas
  (`PROGRAMADA`/`CONFIRMADA`) del mismo asesor en POST y PATCH y responde
  **409 con `{empalme}`**; se guarda igual reenviando `ignorarEmpalme: true`
  (advertir, no bloquear). El modal muestra el aviso en vivo antes de guardar.
  Alta con inicio prellenado, **fin automático = inicio + 30 min** (conserva
  la duración al mover el inicio) y validación fin > inicio en ambas capas.
  Zona horaria: se guarda UTC y el navegador la convierte a local (un solo
  país); no hay recurrencia de citas en el modelo.
- **UI**: `components/citas/CalendarioView.jsx` es el contenedor compartido
  por ambos roles (ruta `/citas`), con vistas **Mes / Semana / Agenda**
  (Semana por defecto para asesor, Mes para promotor), chips informativos
  (hora + título, color por canal, tachado si cancelada, "+N más" en Mes),
  filtros por canal/estado y panel lateral del día. `CitaFormModal.jsx` es el
  formulario único (alta y reagendar), reutilizado por la ficha de cliente
  (`clienteId` fija el cliente, `asesorId` delimita scope y empalmes).
  **Semana y Mes comparten lenguaje visual** (2026-08-14): mismo círculo de
  "hoy" (`w-5 h-5`), mismas tarjetas de cita (punto de color + hora tabular +
  título truncado, como `LineaCita`) y mismo hover. Lo que **no** se unifica
  es la rejilla: Semana necesita su posicionamiento absoluto por hora/minuto
  (`ALTO_HORA`, `HORA_INI`/`HORA_FIN`) para mostrar granularidad horaria —
  no intentar convertirla al grid de celdas de Mes.
- **Roles**: asesor ve solo su agenda (la API fuerza `asesorId = req.user.id`);
  promotor ve el equipo con filtro por asesor y "Mis acompañamientos"
  (`GET /api/citas?promotorId=`). Las citas de acompañamiento son visibles
  para el asesor dueño y para el promotor involucrado. Tres capas fallando
  cerrado, como el resto del sistema.
- **Disponibilidad del promotor (ocupado/libre, 2026-08-12)**: el asesor puede
  ver en qué horarios está ocupado un promotor para invitarlo a un
  acompañamiento sin preguntarle antes, vía `GET /api/citas/disponibilidad`
  (`usuarioId` + `desde`/`hasta`, tope 62 días). Endpoint **deliberadamente
  separado** de `GET /api/citas`: devuelve solo `bloques: [{inicio, fin}]`, sin
  includes ni un campo más — el asesor nunca sabe con quién ni por qué está
  ocupado el promotor (otro asesor, cliente, candidato o asunto personal), y
  por eso tampoco se expone el motivo ni el tipo. **Rechaza con 400 cualquier
  `usuarioId` que no sea ADMIN/SUPERADMIN**: no es un free/busy genérico, así
  un asesor no puede espiar la agenda de un compañero. Ocupan agenda las citas
  propias del promotor más los acompañamientos que ya **ACEPTÓ** (mismo
  criterio que el empalme de `PATCH /:id/invitacion`): una invitación
  PENDIENTE no bloquea el hueco, coherente con el resto del sistema. En la UI
  es una capa gris de solo lectura (`pointer-events-none`, estilo único
  `DISPONIBILIDAD_ESTILO` en `citas/tipos.js`, nunca los colores de
  `CLASIFICACIONES`) superpuesta a la vista Semana (escritorio) / Día (móvil),
  activada con el selector "Ver disponibilidad de" — espejo del filtro de
  asesor, visible solo para no-admins. Agendar con la capa activa prellena
  `preModalidad='ACOMPANAMIENTO'` + `prePromotorId` en `CitaFormModal`. Con la
  disponibilidad activa, el panel lateral "Citas · [fecha]" del día
  seleccionado (`CalendarioView.jsx`, desktop) también lista los tramos
  ocupado/libre de 8:00 a 20:00 con un botón "Agendar" en cada hueco libre —
  no hace falta ir a la vista Semana a buscar la celda vacía. **También dentro
  de `CitaFormModal` sin pasar por esa vista**: al elegir Tipo de cita =
  "Acompañamiento con promotor" sin un `prePromotorId` ya fijado, se
  autoselecciona el promotor si `GET /usuarios/promotores` devuelve uno solo
  (con una sola promotora ADMIN esa es la situación normal, ver abajo).
  Con un promotor elegido (autoseleccionado o manual) el modal consulta su
  disponibilidad del día vía el mismo `GET /citas/disponibilidad` y muestra
  si el horario elegido está libre u ocupado; a diferencia del empalme entre
  asesores (que solo advierte), **si choca con un bloque del promotor el botón
  de guardar queda deshabilitado** — no tiene sentido invitarlo "de todas
  formas" a una hora que ya no tiene libre. Al reagendar una cita ya
  ACEPTADA por ese promotor, su propio bloque original se excluye del choque
  para no bloquear "guardar sin cambiar el horario".
- **Sugerir otro horario (2026-08-12)**: además de Aceptar/Rechazar, el
  promotor invitado a un acompañamiento puede responder `PATCH
  /api/citas/:id/invitacion` con `respuesta: 'SUGERIDA'` +
  `sugerenciaInicio`/`sugerenciaFin`/`sugerenciaNota` (nuevo valor del enum
  `EstadoInvitacionCita` + esos 3 campos en `Cita`, migración
  `20260812120000_cita_sugerencia_horario`) — la cita **conserva su horario
  original** y sigue sin ocupar la agenda del promotor mientras esté
  SUGERIDA, igual que PENDIENTE. El asesor dueño responde con `PATCH
  /api/citas/:id/invitacion/sugerencia` (`{aceptar: boolean}`): aceptar
  mueve la cita al horario propuesto y la deja ACEPTADA (sí bloquea, valida
  empalme igual que aceptar una invitación normal); rechazar vuelve a
  PENDIENTE conservando el horario original, a la espera de que el promotor
  responda de nuevo. Ambas respuestas notifican por push a la otra parte
  (mejor esfuerzo). Solo el promotor invitado sugiere; solo el asesor dueño
  de la cita responde la sugerencia — nadie más.
- **Bloquear un horario recurrente** (ej. "hora de comida"): no es un modelo
  aparte — se resuelve combinando el checkbox "Evento personal" con
  "Repetir" al agendar (ambos ya existían). El copy de `CitaFormModal` lo
  deja explícito. Aplica igual para un asesor bloqueando su propia agenda o
  para el promotor.

### Layout del calendario de escritorio (2026-08-26)

`CalendarioView.jsx` (rama de escritorio) pasó de "tarjeta de filtros + Card
del calendario + Card del día" a **un solo contenedor con borde partido en
riel izquierdo (320px) y panel del calendario**, tomando como referencia la
sección `calendar` de la plantilla `shadcn-dashboard-landing-template` que el
usuario señaló (la misma de la que salieron las gráficas del dashboard). Se
adoptó el **diseño y el layout, NO su stack**: allá es TypeScript + shadcn/ui
+ Radix (`Sheet`, `Collapsible`, `DropdownMenu`, `cn()`) y `date-fns`; aquí es
JS + Tailwind con los tokens de siempre y **cero dependencias nuevas** — misma
decisión que el leaderboard y el filtro de etapas de Clientes.

- **Riel izquierdo** (`components/citas/CalendarioSidebar.jsx`: `MiniMes` y
  `GrupoVisibilidad`): botón "+ Agendar cita" de ancho completo, **mini
  calendario del mes** con punto en los días con citas, el **panel del día
  seleccionado** (el que vivía en la Card derecha, con sus acciones y los
  tramos ocupado/libre del promotor) y los filtros. Se monta fijo en `xl`+ y,
  por debajo, dentro del `Drawer` que abre el botón ☰ del encabezado (el
  equivalente al `Sheet` de la plantilla). **Es el mismo árbol JSX** (`riel`)
  en los dos lugares, no dos copias.
- **Los filtros dejaron de ser `<select>` de un solo valor**: son casillas de
  visibilidad por valor (clasificación, canal, estado), guardadas como
  conjuntos de lo que SÍ se ve — patrón "calendarios" de la plantilla. La
  casilla lleva el color del evento, así el riel **es también la leyenda** (la
  fila de leyenda suelta se eliminó). Los conteos de cada fila se calculan
  ignorando las casillas y respetando solo la búsqueda: si se contaran sobre
  lo filtrado, ocultar un valor lo dejaría en 0 y no se sabría qué se está
  escondiendo. `ESTADOS_CITA` ganó `dot` en `citas/tipos.js` porque Tailwind
  no genera clases armadas en runtime (`bg-${badge}-500` no existe).
- **Buscador** en el encabezado (título, cliente, candidato, asesor,
  ubicación), client-side sobre lo ya consultado.
- **Rejilla del mes**: celdas pegadas con separadores (sin gap ni esquinas
  redondeadas), semanas completas —incluye los días de los meses vecinos, en
  tono apagado, con sus citas— filas estiradas al alto del contenedor, "hoy"
  como cuadro de marca sobre el número y `+N` arriba a la derecha. Semana y
  Agenda **no cambiaron de estructura**, solo quedaron dentro del contenedor.
- **El rango CONSULTADO ya no es el periodo visible**: cubre además los días
  de meses vecinos que pinta la rejilla y el mes completo del mini calendario
  (si no, sus puntos saldrían vacíos al navegar por semana). `desde`/`hasta`
  siguen siendo el periodo visible (título, Agenda); `qDesde`/`qHasta` son los
  del `GET /citas` y de `/citas/disponibilidad`.
- **La vista móvil (`CalendarioMovil.jsx`, < md) no se tocó**: tiene su propio
  árbol Día/Agenda/Mes y el riel de escritorio no aplica ahí.
- **El contenedor tiene alto DEFINIDO, atado a la ventana**
  (`h-[calc(100vh-7rem)] max-h-[1000px] min-h-[620px]`, 2026-08-26) — no un
  `min-h`. Con `min-h` el riel y la rejilla crecían sin tope: un día con
  muchas citas apiladas en el panel del día estiraba el `<aside>`, y con él
  toda la fila flex, así que la cuadrícula del mes cambiaba de tamaño y el
  calendario quedaba a varios scrolls de distancia. **La cuadrícula es
  estática: lo que crece scrollea por dentro.** En el riel el scroll es **uno
  solo** (`min-h-0 flex-1 overflow-y-auto`) y envuelve el apilado completo —
  citas del día y, debajo, los filtros de visibilidad—, sin recortarle alto a
  ninguno de los dos: **no partirlo en dos zonas de scroll** (se intentó
  anclando los filtros abajo con `max-h-%` y el usuario lo rechazó: dejaba las
  citas en una ventanita y parecía que los bloques se habían eliminado). El
  panel del calendario scrollea aparte (Mes estira sus filas y solo scrollea
  si no caben; Semana conserva su rejilla horaria, ahora `h-full` en vez de
  `max-h-[620px]`; Agenda crece con la lista). Ese `flex-1` del riel solo
  funciona porque el contenedor tiene alto definido — si se vuelve a `min-h`,
  el scroll del riel deja de existir en silencio.
  En el `Drawer` (< xl) el riel se apila como antes y scrollea el drawer
  completo: ahí no hay alto definido y `flex-1`/`max-h-%` no aplican.

## Sección Metas / Targets (rediseño 2026-07)

**Dos niveles de objetivo, mensuales (mes + año), en 6 métricas** (catálogo
único `METRICAS` en `frontend/src/components/metas/metricas.js` — bloques,
tabla, formularios y reconciliación se generan de ahí, no duplicar la lista):
ventas, prima, citas realizadas, prospectos nuevos, referidos y llamadas
(migración `20260725210000_target_metricas_actividad` agregó las 4 de
actividad a `Target` y `TargetEquipo`).

- **Meta de promotoría** = modelo `TargetEquipo` (`@@unique([mes, anio])`,
  migración `20260725190000_target_equipo`): objetivo agregado del equipo.
  API: `GET/POST /api/targets/equipo` (**solo admin**, el GET regresa
  `{meta, actual, sumaIndividual}` con las 6 métricas).
- **Metas individuales** = modelo `Target` (asesor + mes + año). Upsert vía
  `POST /api/targets` (admin); edición **en línea** por fila en la tabla.
- **Los actuales se calculan en servidor** (`GET /api/targets/resumen`
  regresa cada asesor con su meta y sus actuales; a un ASESOR solo su propia
  fila): ventas/prima = `APROBADA`/`PAGADA` con `creadoEn` en el mes (**misma
  definición que Pólizas — no inventar otra**), citas = `COMPLETADA` por
  `fechaHoraInicio`, prospectos = clientes creados en el mes (excluye
  archivados), referidos = registrados en el mes, llamadas = actividades
  tipo `LLAMADA`.
- **Reconciliación por métrica**: la UI compara la suma de metas individuales
  contra la meta de promotoría → "Por asignar" (ámbar) / "Sobreasignado"
  (rojo) / "Cubierta" (esmeralda), una fila por métrica con meta fijada.

**Referidos obtenidos = definición única** (`backend/src/utils/referidos.js`,
2026-08-21): un referido es una **persona** que llegó por recomendación y se
cuenta **una sola vez**, sin importar por dónde entró al CRM. Antes la métrica
solo contaba filas del modelo `Referido` (que se capturan desde la ficha de un
cliente) y salía en **0** para quien registra sus prospectos por el alta normal
eligiendo la fuente — que es el flujo real. Ahora es la unión de dos entradas:

- **(A)** `Cliente` creado en el mes, no archivado, que es referido: `fuente`
  contiene "referido" (`contains` insensible, **no** igualdad: la columna es
  `String?` con texto libre legacy como "Referido de Ana"), **o** tiene
  `referidoPorId`, **o** es destino de alguna fila `Referido`. Cuenta con la
  fecha de alta del cliente.
- **(B)** Fila `Referido` **sin `clienteReferidoId`** (el referido todavía no
  existe como cliente: solo hay nombre/teléfono). Cuenta con su propia fecha.

La deduplicación es por identidad y **no depende del orden ni del mes**: una
fila `Referido` ya ligada a un cliente nunca suma por su cuenta, porque ese
cliente ya entra por (A). "Convertido" = el referido tiene póliza viva (mismo
criterio `VENTA_VIVA` del segmento prospecto/cliente) o la fila `Referido` está
en `CONVERTIDO`. **Consumen esta única función** `referidosObtenidos()` la
métrica de Metas (`routes/targets.js`) y la tarjeta "Referidos y bonos" del
dashboard, incluida su "tasa de referidos" (`routes/metricas.js`) — no volver a
hacer un `prisma.referido.count()` suelto en ninguna vista.

**Historial de metas** (`GET /targets/historial?mes&anio&meses&asesorId`,
2026-08-21, `Historial` en `pages/Targets.jsx`): los últimos N periodos
(6/12/24, tope 36) terminando en el mes seleccionado, cada uno con la meta que
se registró y el avance real. **No se guarda ningún snapshot ni estado de
cierre**: `Target`/`TargetEquipo` ya son una fila por (mes, año) —por eso la
meta "se reinicia" sola cada mes, se haya cumplido o no— y los actuales se
recalculan de los registros con la **misma** `actualesPorMes()` que alimenta el
resumen del mes en curso (el mes se agrupa en JS, no con `groupBy`, justo para
que resumen e historial no tengan dos implementaciones). Congelar una foto al
cierre crearía una segunda verdad que se desincroniza al corregir una póliza o
archivar un cliente — mismo criterio que el segmento prospecto/cliente y el
contador de la clínica: derivar, no persistir. "Cumplida / Parcial / No
cumplida / En curso" se deriva en el frontend con `cumplimiento()` +
`ESTADOS_CUMPLIMIENTO` de `components/metas/metricas.js` (implementación única,
no re-derivar a mano en otro componente). Alcance por rol como el resto de
Metas: el asesor solo recibe su historial (se ignora `asesorId`); el promotor
ve la promotoría o un asesor con el selector.

**Estado por ritmo** (mapa único `components/metas/ritmo.js` — umbrales
parametrizados en `UMBRALES_RITMO`, no duplicar):

- `ratio = (%avance/100) / fracciónTranscurrida`; `%avance ≥ 100` → Cumplida
  (emerald); `ratio ≥ 1` → En ritmo (emerald); `ratio ≥ 0.8` → Ligero atraso
  (amber); si no → Atrasado (red). Sin meta → pill slate.
- **Nunca mostrar % de avance sin la referencia temporal**: las barras llevan
  **marcador de "ritmo"** en la posición de la fracción transcurrida
  (`GoalBlock`/`MiniBar` en `components/metas/GoalBlock.jsx`) y el card
  muestra el chip "Mes transcurrido: X% · día d de n".
- **Proyección de fin de mes** = `actual / fracciónTranscurrida` (y qué % de
  la meta representa); null si el periodo no ha iniciado.
- El estado de la fila de un asesor usa el **peor** de sus avances entre las
  métricas que tienen meta fijada.

**Roles (tres capas fallando cerrado):** el asesor ve **solo su meta** en
`/targets` (enlace "Mi meta" en el nav; `metas` ya no es adminOnly en
`puede()`), la API fuerza el alcance en `GET /targets` y `GET /targets/resumen`
(solo su propia fila) y responde **403** en `/targets/equipo` y en los POST —
un asesor nunca recibe metas ni actuales de otros. El promotor gestiona meta
de equipo e individuales con ranking y contribución (% de la prima del equipo).

## Sección 25 puntos (`/puntos`, 2026-07-28)

Digitaliza el **formato semanal de 25 puntos** de SMNYL (`pages/Puntos.jsx`,
sección RBAC `puntos`, permitida a ambos roles). Modelos: `RegistroPuntos`
(registro DIARIO por asesor, `@@unique([asesorId, fecha])`, columnas de
prospección/alta productividad/resultados) y `PlanSemanal` (las 4 listas de
planeación por semana, lunes como inicio).

- **El puntaje NO se guarda**: se calcula con el mapa único `PUNTOS` de
  `backend/src/routes/puntos.js` (referido obtenido=3, llamada=1, cita
  obtenida=2, cuestionario realizado=2, cierre realizado=3, solicitud=5;
  `META_PUNTOS_DIARIA = 25`). El frontend recibe `valores`/`metaDiaria` en
  `GET /puntos/semana` y no re-declara valores.
- API: `GET /puntos/semana?inicio=YYYY-MM-DD` (lunes), `PUT /puntos/dia`
  (upsert del día, guarda al salir de cada celda), `PUT /puntos/plan`,
  `GET /puntos/resumen` (solo promotores: ranking semanal por asesor). El
  asesor solo se ve a sí mismo (el parámetro `asesorId` se ignora); el
  promotor **consulta** por asesor con el selector, pero ya no puede
  **capturar/editar** el formato de nadie más que el suyo.
- **Candado anti-falsificación** (2026-08-05, acordado con Diana/Israel):
  `PUT /puntos/dia` y `PUT /puntos/plan` siempre escriben sobre
  `req.user.id` (ignoran cualquier `asesorId` del body) y `PUT /puntos/dia`
  rechaza con 409 cualquier `fecha` anterior a "hoy" — calculado en el
  servidor con `Intl.DateTimeFormat(..., { timeZone: 'America/Mexico_City' })`,
  nunca con el reloj/zona del navegador. En cuanto el día cierra, ni el
  propio asesor ni el promotor pueden modificarlo, sin excepciones de rol
  (ni SUPERADMIN). `GET /puntos/semana` regresa `hoy` y `soloLectura`
  (`true` cuando el que consulta no es el dueño del formato) para que el
  frontend deshabilite las celdas antes de intentar guardar
  (`frontend/src/pages/Puntos.jsx`). El candado aplica solo al registro
  diario de puntos (`RegistroPuntos`); las listas de `PlanSemanal` no tienen
  candado por fecha, solo el candado de autoría (cada quien edita solo lo
  suyo).
- Semana lunes–domingo con helpers compartidos en `frontend/src/lib/semana.js`
  (`rangoSemana`, `labelSemana`, `isoDia`) — mismos que usa Clínica.

## Sección Clínica telefónica (`/clinica`, 2026-07-28)

Digitaliza el **"Evaluador de Prospectos"** semanal (formato físico de la
promotoría, diseñado para conseguir 10 citas/semana) más el registro de
sesiones de clínica (`pages/Clinica.jsx`, sección RBAC `clinica`). Modelos:
`ProspectoClinica` (fila del evaluador: nombre, contacto, parentesco, edad,
estado civil, ocupación, dependientes, ¿tiene seguro?, fecha de entrevista,
plan de seguimiento, `resultado`) y `SesionClinica` (fecha, llamadas, citas
obtenidas, notas).

- Metas fijas en `backend/src/routes/clinica.js`: `META_CITAS_SEMANA = 10`,
  `META_SESIONES_SEMANA = 2`. "Citas obtenidas" de la semana = suma de las
  sesiones + prospectos con resultado `CITA_OBTENIDA`.
- `resultado` ∈ PENDIENTE/CONTACTADO/CITA_OBTENIDA/CONVERTIDO/DESCARTADO
  (mapa de labels/colores en `pages/Clinica.jsx`, select inline en la tabla).
  **Convertir en cliente** (`POST /clinica/prospectos/:id/convertir`): crea el
  `Cliente` con `fuente: "Clínica telefónica"`, lo enlaza (`clienteId`), marca
  `CONVERTIDO` y registra `CLIENTE_CREADO` en la bitácora. "Pasar a la próxima
  semana" = PATCH de `semanaInicio` (arrastre de no contactados).
- **La clínica se llena SOLA — no se importa a mano** (2026-08-14). La
  importación manual ("Traer de mi cartera", `GET
  /clinica/prospectos/sugeridos` + `POST /clinica/prospectos/importar`) **se
  eliminó**, junto con las dos preguntas del alta ("¿Ya lo contacté?" / "¿Ya
  me ha dado una cita?"): decidir a quién perseguir era justo el trabajo que
  el asesor evitaba hacer. **No reintroducirlas.** Un prospecto entra al
  evaluador de la semana por **dos disparadores**, ambos en
  `backend/src/utils/clinica.js`:
  1. **Recién registrado** — `POST /clientes` mete la fila si el cliente nace
     en una etapa de `ETAPAS_CLINICA` (mejor esfuerzo: si la clínica falla el
     alta no se cae; la respuesta incluye `enClinica`).
  2. **Atorado sin conseguir cita** — `DIAS_SIN_AVANCE = 4`: sigue en
     `PROSPECTO` o `CONTACTADO` (con `fechaUltimaCita: null`) o en
     `RETARGETING` (aquí **no** se exige `fechaUltimaCita: null` — ya avanzó
     antes y se enfrió, volver a llamarlo es el punto), sin cita viva, sin
     póliza viva, y o nunca se le llamó o la última llamada fue hace más de 4
     días. `STANDBY` y `DESCARTADO` nunca entran.
     `sincronizarClinicaDeAsesor()` lo corre el **job horario**
     (`jobs/automatizacionesJob.js`, regla 3, para todos los usuarios
     activos). No manda notificación: el resultado es una fila en `/clinica`.
- **El "contador" es DERIVADO, no una columna**: sale de `creadoEn`,
  `fechaUltimaLlamada`, `fechaUltimaCita` y `estado`, que ya se mantienen.
  **No agregar un contador persistido**: se desincroniza en cuanto alguien
  llama al cliente fuera del CRM, igual que pasaba con `TipoContacto`.
- La anti-duplicación sigue siendo `clienteId` + `semanaInicio`: no se
  duplica dentro de la semana, pero **sí reaparece la semana siguiente** si
  sigue sin avanzar (arrastre automático, que es lo buscado).
  `sincronizarClinicaDeAsesor()` **solo agrega, nunca borra**: una fila ya
  trabajada es registro de lo que el asesor hizo, no un cache regenerable.
- **Agendar cita cierra la fila** aunque la cita se agende desde el
  calendario o la ficha: `POST /citas` con `clienteId` llama
  `marcarCitaObtenidaEnClinica()`, que pasa a `CITA_OBTENIDA` las filas en
  `PENDIENTE`/`CONTACTADO` (nunca pisa `CONVERTIDO`/`DESCARTADO`). Sin esto
  el asesor seguiría viendo en la clínica a alguien con quien ya quedó y el
  conteo de citas de la semana se quedaría corto.
- **El avance en la clínica se refleja en la ficha** (2026-08-14): `PATCH
  /clinica/prospectos/:id` propaga al `Cliente` enlazado (solo si hay
  `clienteId` y el `resultado` realmente cambió): `CONTACTADO` →
  `fechaUltimaLlamada` + sube la etapa a `CONTACTADO` con un `updateMany`
  acotado a `ETAPAS_CLINICA`, que es la guarda para no pisar con un retroceso
  a quien ya avanzó; `CITA_OBTENIDA` → `estado: 'CITA'` +
  `fechaUltimaCita` + baja la bandera de seguimiento; `DESCARTADO` → solo
  baja la bandera (**no archiva ni cambia etapa**: descartar en la clínica es
  "no le sigo llamando esta semana", archivar es decisión aparte desde la
  ficha). Sin esto el asesor tenía que actualizar la etapa dos veces y el
  embudo quedaba desfasado.
- Alcance por rol igual que 25 puntos: asesor solo lo suyo; promotor con
  selector + `GET /clinica/resumen` (avance de cada asesor hacia 10 citas y
  2 sesiones).

## Sección Candidatos (`/candidatos`, 2026-07-31)

CRM de **reclutamiento de asesores** de la promotora, replicando el flujo del
sistema corporativo SMNYL. Modelo `Candidato` **separado de `Cliente`**
(decisión de arquitectura: Cliente está acoplado a venta y a un asesor dueño —
no extenderlo). Modelos: `Candidato` (datos del formulario SMNYL + `etapa` +
`semaforo` + borrado lógico `archivadoEn`, mismo patrón que Cliente) y
`EvaluacionCandidato` (1:1, las 12 dimensiones 0–5).

- **Pipeline** (`EtapaCandidato`, mapa único frontend en
  `components/candidatos/tipos.js` — etapas, semáforo, dimensiones y
  `MODALIDAD_POR_ETAPA` salen de ahí, no duplicar): Entrevista Inicial →
  Selección → Carrera → Entrevista Adicional (**opcional**, se puede saltar) →
  Precontrato (MC) → Firma de contrato (FC). `PATCH /candidatos/:id/etapa`
  solo permite avanzar secuencialmente (con el salto de la Adicional) y
  regresar libremente; registra `CANDIDATO_ETAPA` en la bitácora.
- **Evaluación en dos pasos** (formato SMNYL): 6 **vitales** → 6 **valores**,
  escala 1 Pobre…5 Excelente (0 = sin contestar). `PUT
  /candidatos/:id/evaluacion/vitales|valores`; valores exige vitales completos
  (flujo secuencial). El **semáforo NO se captura**: lo calcula el servidor en
  `backend/src/utils/semaforoCandidato.js` (**única implementación de la
  regla**, función pura): promedio de las 12 → ≥4.0 VERDE, 3.0–3.9 AMARILLO,
  <3.0 ROJO; ROJO automático si cualquier vital queda en 1. Regla default
  pendiente de confirmación de la promotora — si la cambia, ajustar SOLO ahí.
- **Roles**: sección RBAC `candidatos` con **piso de rol** (en
  `SECCIONES_SOLO_ADMIN`): solo ADMIN/SUPERADMIN ven/gestionan el módulo.
  Excepción deliberada: `POST /api/candidatos` solo exige `authenticate`
  (cualquier rol puede **capturar** — un asesor puede referir un candidato);
  todo lo demás del router pasa por `permiteSeccion('candidatos')`.
- **Captura**: el modal "+ Nuevo cliente" (`ClientesView.jsx`) abre con el
  selector "¿Qué vas a registrar?" (Cliente | Candidato a asesor) y rutea a
  `CandidatoFormModal` (formulario SMNYL: requeridos nombre, apellido paterno,
  teléfono, sexo, fuente; "Información adicional" colapsable; reclutador =
  usuario opcional + oficina texto libre).
- **Citas de reclutamiento**: `Cita.candidatoId` (opcional, **solo** en
  modalidades `PRP`/`ENTREVISTA_*` y **excluyente con `clienteId`** — validado
  en `routes/citas.js`; una PRP grupal puede no llevar candidato). El perfil
  del candidato agenda con `CitaFormModal` (`candidatoId` fija el candidato,
  `preModalidad` según `MODALIDAD_POR_ETAPA`; clasificación default `GESTION`).
  El calendario (escritorio y móvil) muestra el nombre del candidato en chips
  y panel.
- Actividad: tipos canónicos nuevos `CANDIDATO_CREADO` y `CANDIDATO_ETAPA`
  (backend `utils/actividad.js` + espejo en `components/actividad/tipos.jsx`).
- UI: `pages/Candidatos.jsx` (lista con chips de etapa/semáforo como filtro,
  archivar/restaurar) y `pages/CandidatoDetalle.jsx` (stepper, wizard de
  evaluación, citas). Archivado = borrado lógico, igual que clientes.
  En la ficha, **Notas y Recordatorios viven en el riel izquierdo** bajo
  "Reclutamiento" (2026-08-15): estaban hasta el fondo de la columna
  principal y había que hacer scroll para llegar; son consulta rápida
  mientras se revisa la evaluación.

### POP · Evaluación de potencial (2026-08-15)

Replica el **POP Screen** que SMNYL aplica a sus candidatos a asesor, para
dejar de depender de la compañía. Modelos `PopPlantilla` (cuestionario) y
`PopEnvio` (link por candidato + resultado), router autenticado
`routes/pop.js` (`permiteSeccion('candidatos')`) y router **público**
`routes/popPublico.js` montado en `/api/pop-publico`.

- **El cuestionario ya viene hecho — nadie lo captura.** Las 12 preguntas de
  la sección "Información general" del POP Screen están **en código**:
  `backend/src/utils/popEstandar.js`. `asegurarPlantillaEstandar()`
  (`utils/popPlantillaEstandar.js`) siembra la fila con `clave: 'estandar'`
  la primera vez que alguien abre `GET /pop/plantillas` o manda un POP, y
  `POST /pop/envios` **sin `plantillaId`** usa esa. La promotora oprime
  "Enviar POP" y sale el link: **no reintroducir un paso de "crear
  cuestionario" antes de poder enviar.** El editor (`PopPlantillaModal`)
  sigue existiendo detrás de "Ver preguntas", solo para ajustar redacción o
  puntos.
- **Es CREATE-ONLY sobre el contenido**: si la promotora edita preguntas o
  umbrales desde la UI, un redeploy no se los pisa. Solo repone las
  preguntas si la fila quedó vacía, y desarchiva la plantilla estándar (sin
  ella "Enviar POP" no funcionaría).
- **Lo que NO se replica es el algoritmo**: el POP Screen lo califica un
  tercero (Selection Testing Consultants) con un modelo propietario. Los
  puntos por opción son criterio propio de la promotoría, en el mismo
  archivo, y el cálculo vive en `utils/pop.js` (función pura, única
  implementación — mismo criterio que `semaforoCandidato.js`).
- **Umbrales calibrados contra la escala real, no a ojo** (85 verde / 62
  ámbar): como ninguna pregunta puede valer 0 en todas sus opciones, el piso
  alcanzable es ~24/100 y no 0 — con los genéricos 70/40 casi cualquier
  perfil salía verde. Referencias medidas: mejor opción siempre = 100,
  segunda mejor = 83, peor = 24. **Si se editan los puntos, recalibrar.**
- **Sin ficha completa no hay link**: `camposFaltantes()` en `routes/pop.js`
  exige nombre, teléfono, correo, fecha de nacimiento, sexo y RFC (los datos
  que la compañía imprime en su carátula). El espejo en el frontend es
  `camposFaltantesPop()` en `components/candidatos/tipos.js` — el servidor es
  el que manda; la UI solo evita pedir un link que sería rechazado y ofrece
  completar la ficha con el **mismo** `CandidatoFormModal`, no un formulario
  paralelo.
- **Link de un solo uso, 14 días** (`DIAS_VIGENCIA`), mismo patrón que
  `InvitacionUsuario`: se copia y se comparte a mano — el CRM no tiene canal
  saliente hacia el candidato.
- **Los puntos nunca viajan al navegador del candidato** (`sinPuntos()` en
  `popPublico.js`) y el puntaje **siempre** se calcula en el servidor: si no,
  bastaría ver el HTML para saber qué contestar. El candidato tampoco recibe
  su resultado — es información de selección para la promotora.
- **El resultado vive en la ficha técnica**: `GET /candidatos/:id` incluye
  `popEnvios` y `components/candidatos/PopCandidato.jsx` los muestra con
  puntaje, semáforo (`RecomendacionPop`: PROCEDER / PRECAUCION /
  NO_PROCEDER) y desglose por bloque — los mismos bloques del "Gráfico del
  Potencial de Ventas" oficial (ADN en Ventas, Experiencia, Compatibilidad
  con la Carrera). Al contestar, `notificar()` avisa a quien lo mandó
  (`POP_RESPONDIDO`).
- **El PDF de referencia de la compañía nunca entra al repo**: es el
  resultado real de una persona. Sirvió solo para extraer el formato de las
  preguntas.

## Notificaciones (campana in-app + push, 2026-08-13)

**La notificación in-app es la fuente de verdad; la push es mejor esfuerzo.**
Antes todo aviso salía solo por Web Push dentro de un `try/catch` que apenas
loggeaba: si el navegador no estaba suscrito o el envío fallaba, el aviso se
perdía sin dejar rastro (por eso "las notificaciones funcionaban de vez en
cuando"). Ahora cada aviso se **persiste primero** y después se intenta la
push sobre esa fila ya guardada.

- **Modelo `Notificacion`** (migración `20260813120000_notificacion_in_app`):
  `destinatarioId` (a quién va, no quién lo causó — a diferencia de
  `Actividad.asesorId`, que es el actor), `tipo` canónico, `titulo`, `cuerpo`,
  `datos` Json (`url`, `citaId`, `notaId`, `clienteId`, `ventaId`), `leida` +
  `leidaEn`, y `pushIntentado`/`pushEnviado` solo como diagnóstico.
- **Punto de entrada ÚNICO**: `notificar(destinatarioId, tipo, {titulo,
  cuerpo, datos, pushPayload})` en `backend/src/utils/notificaciones.js`
  (paralelo a `registrarActividad`). Nunca llamar `sendPushToUser` directo
  desde una ruta: el único uso legítimo que queda es `POST /api/push/test`,
  que prueba el transporte. El `create` **propaga** su error (si no se pudo
  persistir no hay aviso en ningún lado); el push va en `try/catch` y su
  fallo solo se refleja en `pushEnviado: false`.
- **Tipos canónicos** (`TIPOS_NOTIFICACION`, alcance deliberadamente fijo —
  solo lo que ya disparaba push): `CITA_INVITACION`,
  `CITA_INVITACION_RESPUESTA`, `CITA_SUGERENCIA_RESPUESTA`, `RECORDATORIO`,
  `RECORDATORIO_PAGO`. Espejo de presentación (label/color/icono) en
  `frontend/src/components/notificaciones/tipos.jsx`, con los mismos colores
  que Actividad usa para el mismo concepto (cita=violet, recordatorio=orange,
  pago=cyan). No agregar tipos de negocio (pólizas, referidos, bonos) sin
  decisión explícita.
- **`Nota.notificacionEnviada` ya no significa "la push llegó"** sino "el
  aviso quedó guardado" (`reminderJob.js`): antes se marcaba `true` pasara lo
  que pasara y el recordatorio se perdía para siempre; ahora solo se marca si
  `notificar()` persistió, así un fallo se reintenta en la siguiente corrida.
- **Suscripciones inválidas**: `sendPushToUser` borra la fila cuando
  `esSuscripcionInvalida(err)` (`backend/src/services/push.js`) es cierto:
  `CODIGOS_SUSCRIPCION_INVALIDA = [401, 403, 404, 410]` (401/403 = VAPID
  rotada) **más** un 400 cuyo body trae `reason: "VapidPkHashMismatch"` —
  la forma en que Apple Web Push (`web.push.apple.com`, Safari/iOS/macOS)
  reporta el mismo caso de VAPID rotada, con un código distinto al resto.
  Detectado en 2026-08-13 por logs de producción: era la causa de que el
  push a un iPhone "funcionara de vez en cuando" — en realidad fallaba
  siempre desde que las claves VAPID de Railway se generaron, pero la
  suscripción muerta nunca se limpiaba. Un 400 con otra `reason` (o sin body
  parseable) sigue sin limpiarse: normalmente es payload mal armado nuestro,
  no un problema de la suscripción.
- **El navegador no se entera solo de que su suscripción fue limpiada.**
  `usePushNotifications` (`frontend/src/hooks/usePushNotifications.js`)
  confirma contra `POST /api/push/estado` si el endpoint que tiene localmente
  sigue registrado en el servidor; si no, la marca `rota` (no "Activa") y
  `NotifContext` la vuelve a crear sola en el siguiente login si el permiso
  del navegador ya estaba concedido — el usuario no tiene que notar el fallo
  ni volver a Configuración a mano. `subscribeUser()` sabe que una
  suscripción `rota` no se puede reenviar tal cual (quedó atada a la VAPID
  key vieja): primero des-suscribe del navegador y crea una nueva contra la
  key vigente.
- **La app es una PWA instalable** (2026-08-14): `frontend/public/manifest.json`
  (`display: standalone`, íconos cuadrados `icon-192.png`/`icon-512.png`
  generados con `sips` sobre `origen-blanco.png` — los logos originales son
  2550×1032 y se recortaban mal) + `<link rel="manifest">` y metas
  `apple-mobile-web-app-*` en `index.html`. Esto es **requisito de Apple**:
  en iOS el Web Push solo funciona si el usuario hizo "Compartir → Añadir a
  pantalla de inicio"; en Safari suelto no llega nada. En Android sí llega
  sin instalar, pero sin manifest la notificación aparecía bajo "Chrome" en
  vez de con la marca. El SW usa `vibrate: [200,100,200]` + `renotify: true`
  (el patrón corto anterior pasaba desapercibido) y `notificar()` manda
  siempre `icon`/`badge`. **El "sonido" NO es controlable por Web Push**: lo
  decide el canal de notificaciones que el SO asignó al navegador/PWA.
- **Activar push ya no depende de encontrar el botón en Configuración.**
  `components/notificaciones/BannerActivarPush.jsx` se muestra en toda vista
  del panel (montado una vez en `Layout.jsx`, arriba del `Outlet`) mientras
  el permiso del navegador siga en `default` (nunca decidido); un clic activa
  igual que el botón de Configuración. Se descarta por sesión con "Ahora no"
  (`sessionStorage`), nunca permanentemente. Motivo: de 8 usuarios activos en
  producción, solo 2 habían encontrado y usado el botón original.
- **API self-service** (`routes/notificaciones.js`, solo `authenticate`, sin
  `permiteSeccion` — igual que `/api/push`): `GET /` (lista **paginada** +
  `total`/`paginas`/`noLeidas`/`conteos` por tipo, filtros `estado`
  (`no-leidas`/`leidas`) y `tipo`; un `tipo` fuera del catálogo canónico se
  ignora en vez de devolver vacío), `GET /no-leidas` (solo el conteo; sin
  consumidor en el frontend desde que se quitó el badge del nav, ver más
  abajo — se deja intacta por si vuelve a hacer falta), `PATCH /leer-todas` (declarada
  **antes** de `/:id`), `PATCH /:id` (`{leida}` — permite marcar leída y
  devolver a no leída) y `DELETE /:id`. Siempre `destinatarioId =
  req.user.id`, **sin excepción de admin**: un promotor no lee ni borra las
  notificaciones de sus asesores (403 si lo intenta). Los `conteos` de los
  chips se calculan sobre **toda** la bandeja, no sobre la página actual, para
  que el número del chip no cambie al paginar.
- **Ya NO hay sección/página propia** (2026-08-25, a pedido del usuario):
  `pages/Notificaciones.jsx` (`/notificaciones`), el enlace de nav
  `components/notificaciones/CampanaNotificaciones.jsx` (footer del sidebar,
  barra superior móvil, hoja "Más") y su badge de no leídas se **eliminaron**.
  El motivo: para el usuario, "Requiere tu atención" del Dashboard (ver esa
  sección) **es** la bandeja de notificaciones — mantener las dos era
  redundante. `useNoLeidas()` se borró de `hooks/useNotificaciones.js` por no
  tener ya consumidor. **El backend no cambió nada**: modelo, rutas
  (`GET /`, `/no-leidas`, `PATCH /leer-todas`, `PATCH /:id`, `DELETE /:id`) y
  el disparo de push siguen igual — solo se movió qué parte del frontend los
  consume.
- **Ahora vive dentro de `Atencion` en `pages/Dashboard.jsx`**: ese bloque
  combina las notificaciones sin leer (`useListaNotificaciones({estado:
  'no-leidas'})`, con polling de 30s, mismo criterio que tenía el badge) con
  los pendientes que ya calculaba el servidor (pagos, citas de hoy,
  seguimiento, bonos), en una sola lista — las notificaciones van primero.
  Cada fila usa `infoTipoNotificacion()` (`components/notificaciones/
  tipos.jsx`, sin cambios) para el color del punto; al hacer clic se marca
  leída (`useMarcarLeida`) y navega a `datos.url` si trae una, igual que
  hacía la página eliminada. "Marcar todas como leídas" aparece junto al
  título solo si hay notificaciones sin leer. **No hay bandeja histórica
  navegable**: al no existir ya una página con paginación/filtros por tipo,
  "marcar como leída" aquí es "ya lo atendí, quítalo de la lista", no un
  archivo consultable después — el registro completo sigue en la tabla
  `Notificacion`, solo que el frontend no lo expone.
- **Borrado de una notificación es físico**, no lógico (a diferencia de
  Cliente/Candidato): es un aviso ya entregado, no dato de negocio — la cita o
  el recordatorio que lo originó queda intacto. (La acción de eliminar ya no
  tiene UI propia tras quitar la página; sigue disponible en la API.)

### Recordatorios segmentados y doble aviso (2026-08-13)

- **`Nota.destinatario`** (`DestinatarioNota`: `ASESOR` | `CLIENTE`) separa
  la gestión propia del asesor (llamadas, seguimientos) de lo que hay que
  tratar con el cliente (pagos, renovaciones). **Ojo: el CRM no tiene canal
  hacia el asegurado** — no le manda WhatsApp ni correo. `CLIENTE` significa
  "el asesor debe contactarlo por esto", y el aviso le llega igual al asesor,
  solo con etiqueta distinta. La ficha los muestra en dos tarjetas separadas
  y los `RECORDATORIO_PAGO` nacen con `destinatario: 'CLIENTE'`.
- **Dos ventanas de aviso**: `notificacionEnviada` (el día) y
  `avisoPrevioEnviado` (24h antes). Son **dos banderas y no un contador**
  porque son independientes: un recordatorio creado con menos de 24h de
  anticipación solo dispara el del día. `procesarAvisosPrevios()` en
  `reminderJob.js` busca `fechaAviso` entre ahora y +24h con
  `avisoPrevioEnviado: false`; `notificarRecordatorioNota(nota, {previo:
  true})` usa copy y `tag` propios para que la push anticipada no reemplace
  a la del día. Mover `fechaAviso` en un PATCH resetea ambas banderas.
- **Las fechas capturadas viajan con zona horaria** (2026-08-18, bug real): un
  `<input type="datetime-local">` produce un string SIN zona
  (`"2026-08-19T10:00"`) y Node lo interpreta con la zona del **servidor** —
  en Railway (UTC) las 10:00 del asesor quedaban como 10:00Z y se veían a las
  04:00. `NotaFormModal` ahora manda `new Date(valor).toISOString()`, igual
  que `CitaFormModal` con `fechaHoraInicio`/`Fin`: **cualquier formulario
  nuevo con `datetime-local` debe convertir en el navegador**. Red de
  seguridad en servidor: `parseFechaEntrada()`
  (`backend/src/utils/fechas.js`, usada en el POST y el PATCH de `/notas`)
  respeta un ISO con zona y lee un string sin zona como hora de
  `America/Mexico_City`, nunca como hora del servidor. La corrección de los
  datos ya guardados es el script único
  `backend/scripts/corregir-recordatorios-utc.mjs` (simulación por defecto;
  solo toca `tipo: RECORDATORIO`, nunca `RECORDATORIO_PAGO` ni las banderas
  de aviso, que se conservan para no volver a notificar). **Solo aplica a una
  base escrita por un servidor en UTC**: en desarrollo esas filas están bien,
  y por eso el script se niega a escribir si ninguna fila muestra la huella
  del bug.

### Automatizaciones cableadas (`jobs/automatizacionesJob.js`, 2026-08-13)

Reglas **fijas**, no un motor configurable: el motor tipo n8n/ManyChat quedó
como pendiente/experimento por decisión explícita del usuario, no como
requisito. Corre cada hora (nada de lo que vigila cambia por minuto).

- **Prospecto estancado** (`PROSPECTO_ESTANCADO`): cliente sin actualizar en
  15 días, sin póliza viva, sin cita PROGRAMADA/CONFIRMADA y sin
  recordatorio abierto. Se avisa una vez cada 15 días por prospecto.
- **Avance de meta** (`META_AVANCE`): hitos 50/80/100% de `metaVentasNum`
  del mes, una vez cada uno. Reusa la **misma** definición de venta ganada
  que Pólizas y Metas (APROBADA/PAGADA creadas en el mes).
- **Llenado de la clínica telefónica**: `sincronizarClinicaDeAsesor()` para
  cada usuario activo (regla y consultas en `utils/clinica.js`, ver la
  sección de Clínica). **Es la única regla que no notifica**: su resultado es
  una fila en `/clinica`, no un aviso — su idempotencia es la propia
  anti-duplicación por `clienteId` + `semanaInicio`, no `datos.clave`.
- **Conversión de primas pendientes**: `reconciliarPrimasPendientes()`
  completa la prima en pesos de las pólizas en USD/UDI que se registraron sin
  tipo de cambio disponible (ver "Sin tipo de cambio NO se bloquea el alta").
  Tampoco notifica, y su idempotencia es la propia marca derivada
  (`moneda != MXN` + `tipoCambio: null`), no `datos.clave`.
- **Idempotencia sin tabla extra**: la propia bandeja (`Notificacion`) es el
  registro — cada aviso lleva `datos.clave` (`prospecto:<id>`,
  `meta:<anio>-<mes>:<hito>`) y se consulta con
  `datos: { path: ['clave'], equals: clave }` dentro de la ventana.
- **Retargeting automatizado NO se implementó**: está bloqueado por el mismo
  motivo que los recordatorios "para el cliente" — no hay canal saliente
  hacia el asegurado. Requiere decidir WhatsApp Business API o correo
  transaccional, con sus implicaciones de consentimiento.

## Sección Configuración (rediseño 2026-07)

`pages/Configuracion.jsx` (`/configuracion`) es el **plano de control de
acceso** del sistema (modelo RBAC descrito arriba — esa sección es la fuente
de verdad; aquí solo lo específico de la pantalla):

- **Tres pestañas**: "Roles y accesos" (matriz rol × sección con toggles; fila
  Súper Admin bloqueada con acceso total; toggles de Asesores/Configuración
  bloqueados en la fila Asesor por el piso de rol), "Notificaciones" y
  "Registro de cambios" (bitácora legible + Exportar CSV). No reintroducir
  permisos por usuario: el acceso es por rol.
- **Catálogo único** de secciones en
  `components/configuracion/secciones.js` (`SECCIONES`, `infoSeccion`,
  `SECCIONES_SENSIBLES`, `ROLES_LABEL`) — labels de la matriz y la bitácora
  salen de ahí; la sección `ventas` se rotula **"Pólizas"** (nombre del
  módulo en el resto del sistema, no volver a "Ventas"). Debe coincidir
  con `SECCIONES` del backend (`middleware/permisos.js`).
- **Quién edita**: promotores pueden **ver** Configuración (lectura), pero la
  edición de políticas y excepciones es **solo SUPERADMIN** (403 en servidor
  vía `esSuperadmin`, decisión confirmada por el usuario).
- **Panel de notificaciones push**: se conserva el existente (tarjetas
  Soporte / Permiso / Suscripción; los botones reflejan el estado real —
  "Enviar prueba"/"Desactivar" solo con suscripción activa, "Activar" solo
  sin ella) y el texto de "Cómo funciona" quedó **tal cual** (decisión del
  usuario). No reemplazar por preferencias genéricas por evento.
- API: `GET/PATCH /api/configuracion/politicas`, `GET
  /api/configuracion/usuarios` (conteo por rol) y `GET
  /api/configuracion/bitacora`. Todo el router exige la sección
  `configuracion` (fail closed).

## Login con fondo 3D (rediseño 2026-07)

`pages/Login.jsx` (`/login`): tema **oscuro fijo** — sin toggle de tema y con
estilos explícitos (no variantes `dark:`, que dependen de la clase del
`<html>`). Tarjeta glass con la marca ORIGEN, mostrar/ocultar contraseña y el
comportamiento real de login intacto (validación, error, loading). Las cuentas
demo solo se renderizan en `import.meta.env.DEV` (ver arriba).

**Convención de 3D decorativo** (React Three Fiber; `three` + `@react-three/
fiber@8` + `@react-three/drei@9` — v8/v9 porque el proyecto usa React 18, R3F 9
exige React 19):

- El `<Canvas>` vive en su propio componente cargado con `lazy()` + `Suspense`
  (code-split: `three` no entra al bundle inicial) y **nunca bloquea la UI**:
  se monta solo si hay WebGL, envuelto en un ErrorBoundary silencioso; el
  fallback siempre es el gradiente CSS que ya está de fondo.
- `prefers-reduced-motion` → frame estático (`frameloop='demand'`, sin loop).
- Gama baja/móvil: menos partículas en pantallas chicas, `dpr={[1, 2]}`,
  `powerPreference: 'low-power'`; sin parallax en touch (`pointer: coarse`).
- El canvas es decorativo → `aria-hidden` y `pointer-events-none`.
- Contenido con propósito: geometría procedural que evoca la marca (anillos
  "eclipse" + núcleo + puntos) en `components/login/LoginScene.jsx`; nada de
  modelos pesados descargables ni formas al azar.
- Helpers compartidos (`soportaWebGL()`, ErrorBoundary `Silencioso`) en
  `components/decor/util3d.jsx` — no re-implementarlos por escena.

### Fondo 3D del panel (solo modo oscuro)

El shell de la app (`Layout.jsx`) lleva el mismo efecto navy pero **sutil y
solo en modo oscuro** (decisión del usuario: se conserva el toggle y el modo
claro queda intacto; el contenido manda sobre el efecto):

- `.app-shell` (index.css): claro = `bg-slate-50`; oscuro = gradiente radial
  navy del login. Sobre él se monta `components/decor/FondoApp.jsx` (misma
  convención: lazy + WebGL + `Silencioso`, reduced-motion, menos partículas
  en móvil) **solo si `tema === 'dark'`** — al volver a claro se desmonta.
- La escena del panel es la variante tenue: anillos con `opacity ~0.55` hacia
  la esquina superior derecha, animación lenta y **sin parallax** (detrás de
  contenido con scroll). No subirle intensidad ni centrarla.
- En oscuro, `.card` es glass (`dark:bg-slate-800/75` + `backdrop-blur-sm`) y
  el sidebar translúcido (`dark:bg-slate-900/70` + blur), con sidebar y main
  en `z-10` sobre el canvas (`z-0`). No volver a fondos opacos en dark ni
  poner el canvas dentro de `<main>` (vive una sola vez en el Layout).
- `three` + R3F quedan en un chunk compartido que solo descargan `/login` o
  el panel en oscuro; el bundle inicial no debe crecer por el 3D.

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
- `DatePicker({ value, onChange, placeholder })` (2026-07-30) — mini calendario en
  popover (mismo contrato `value`/`onChange` string `'YYYY-MM-DD'` que
  `<input type="date">`, para sustituirlo directo). Sin librería externa (no hay
  date-picker en `package.json`, `dayjs` solo se usa para formateo): construido a
  mano con los mismos tokens del sistema, siguiendo la convención del proyecto de
  no meter dependencias nuevas para piezas decorativas/UI pequeñas. Semana
  lunes-domingo, igual que el resto del calendario de la app. Usado en
  `PolizaFormModal` para las 4 fechas de la póliza; para agregarlo a Citas u
  otro formulario, reusar este componente en vez de crear otro.
  **Mes y año son `<select>` en el encabezado** (2026-08-15): solo con las
  flechas, llegar a un fin de vigencia a 20 años eran decenas de clics. El
  rango de años va de `hoy − 10` a `hoy + 40` (las pólizas de vida llegan a
  20+ años) y **siempre incluye el año visible** aunque caiga fuera, para que
  una fecha ya guardada nunca desaparezca del selector.

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
