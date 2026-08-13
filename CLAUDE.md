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
Nuevo usuario", solo ADMIN/SUPERADMIN) ya **no acepta `password`**: el rol
solo puede ser `ADMIN` o `ASESOR` (el select de la UI no ofrece Súper Admin —
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

Roles en `Usuario.rol`: `SUPERADMIN`, `ADMIN`, `ASESOR`. **"Promotor" = ADMIN o
SUPERADMIN** (helper `esAdmin()` en `AuthContext`). El rol vive en `user.rol`,
obtenido de `/api/auth/me`.

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
  no se conceden al rol ASESOR ni activando su toggle (sus rutas no tienen
  scoping por asesor); el PATCH de políticas lo rechaza y la UI lo bloquea.
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
   (`Layout.jsx`), que lee `user.accesos` del servidor.
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

## Sección Dashboard (rediseño 2026-07)

`pages/Dashboard.jsx` (`/`, compartida por ambos roles; el alcance lo fuerza el
servidor). Jerarquía: hero con **anillo de meta de prima** (punto focal único),
"Requiere tu atención", embudo diagnóstico, franja de estado de pólizas y
paneles secundarios (ranking solo admin, referidos y bonos). Sin emojis (SVG);
tipografía = la sans del sistema (no se importó serif del mock).

- **Fuente única**: `GET /metricas/dashboard` (mes/año) devuelve KPIs, `meta`
  (asesor → su `Target`; promotor → `TargetEquipo` — calculado en servidor,
  el asesor jamás recibe la meta o datos de otros), `atencion` (pendientes de
  pago con prima, citas de hoy, seguimiento, bonos por ganar), `polizasMes`
  (groupBy estado, creadas en el mes), `referidosMes`, `bonosMes` (por
  `mes`/`anio` del bono) y `ranking` con `metaPrima` (solo no-asesores).
  `GET /metricas/funnel` alimenta el embudo. **`/metricas/pipeline` y
  `/metricas/ventas-por-ramo` se eliminaron** (métricas duplicadas con
  definiciones propias — no reintroducirlos). `Asesores.jsx` también consume
  `/metricas/dashboard`: no romper los campos del ranking.
- **Definiciones únicas** (mismas que Pólizas/Metas, no recalcular distinto):
  venta ganada = `APROBADA`/`PAGADA` con `creadoEn` en el mes; "Comisión
  ganada" (verde) vs "Comisión en pipeline" (neutra, solo en la tarjeta
  Referidos y bonos) nunca se suman; la única "tasa de conversión" es la del
  embudo entre etapas; la de referidos se llama **"tasa de referidos"** y vive
  solo en su tarjeta.
- **Ritmo y proyección**: reutiliza `components/metas/ritmo.js`
  (`claveRitmo`, `proyeccion`, `ESTADOS_RITMO`); el anillo colorea por
  semáforo de ritmo, lleva **punto de ritmo** en la fracción transcurrida del
  mes y el copy dice la proyección de cierre en lenguaje llano. El embudo usa
  el mapa único de `components/clientes/etapas.js` y resalta el mayor cuello
  de botella entre las 5 etapas núcleo (conversión < 70% en ámbar).
- Estados vacíos que guían (agregar cliente / agendar cita / invitar asesor) y
  filas de atención/ranking enlazan a su sección. El anillo se anima al montar
  salvo `prefers-reduced-motion` (`motion-reduce:transition-none`).

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

- **Etapas del pipeline**: enum ordenado con **mapa único**
  `etapa → {label, color, orden}` en `components/clientes/etapas.js`
  (`ETAPAS`, `infoEtapa`, `siguienteEtapa`); el color encodea progreso:
  PROSPECTO slate → CITA sky → PROPUESTA blue → CIERRE_FIRMA violet →
  ENTREGA_POLIZA teal → REFERIDOS cyan → POST_VENTA_SEGUIMIENTO emerald.
  No duplicar colores/labels de etapa en otros componentes (`ClienteBadge`
  ya consume este mapa). La etapa se muestra como pill + indicador de
  posición (segmentos en la lista, stepper en el expediente).
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
  Archivar); la acción primaria es abrir el expediente. Con `asesorId` los
  clientes nuevos se asignan a ese asesor (el modal oculta su selector).
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
- **Suscripciones inválidas**: `sendPushToUser` borra la fila con
  `CODIGOS_SUSCRIPCION_INVALIDA = [401, 403, 404, 410]` (antes solo 410/404;
  401/403 = VAPID rotada). **400 queda fuera a propósito**: suele ser un
  payload mal armado nuestro y borraría suscripciones sanas.
- **API self-service** (`routes/notificaciones.js`, solo `authenticate`, sin
  `permiteSeccion` — igual que `/api/push`): `GET /` (lista + `noLeidas`),
  `GET /no-leidas` (solo el conteo, lo consulta la campana cada 30s),
  `PATCH /leer-todas` (declarada **antes** de `/:id`), `PATCH /:id`. Siempre
  `destinatarioId = req.user.id`, **sin excepción de admin**: un promotor no
  lee las notificaciones de sus asesores (403 si intenta marcar una ajena).
- **UI**: `components/notificaciones/CampanaNotificaciones.jsx` en
  `Layout.jsx` — barra superior en móvil y footer del sidebar en escritorio
  (oculta con el sidebar colapsado: el panel de 20rem no cabe junto a 68px).
  Datos vía `hooks/useNotificaciones.js` (react-query con `refetchInterval`;
  no hay WebSockets en el proyecto). Click en una fila marca leída y navega a
  `datos.url`, la misma URL que usa el service worker al tocar la push.

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
