# Auditoría del CRM y ruta a ARM — 5 nov 2026

Alcance: código del backend (Express + Prisma) y del frontend (React), y la UI
usada como asesor en celular y escritorio (entorno local). Se verificaron los
hallazgos leyendo el código. Los dos más graves (cobros y caché) los revisé a mano.
No se tocó código.

---

## 1. Resumen

- **El CRM está bien construido y bien documentado**, pero es un CRM clásico:
  **el asesor trabaja para el sistema**. Cada llamada, cambio de etapa, cita,
  clínica y 25 puntos se captura a mano.
- **Hay un bug crítico que hoy afecta cobros reales** (recordatorios de pago que
  mueren y periodos que se recorren) y dos errores de fondo en el frontend
  (la caché se borra completa en cada cambio, y al cerrar sesión los datos
  quedan a la vista del siguiente usuario). Esto va antes que cualquier cosa nueva.
- **Para ser ARM falta lo central: un canal de conversación.** Hoy WhatsApp
  solo es un link `wa.me` y la base de datos no tiene ningún modelo de
  conversación, mensaje ni consentimiento. Sin eso, un agente no tiene qué leer.
- **Las piezas para un ARM ya existen**: webhook de leads, extracción con IA
  (Gemini) en el patrón "la IA prellena y el humano confirma", job horario,
  notificaciones, deduplicación por teléfono y `Actividad` estructurada.
- **Recomendación:** Fase 0 (arreglos, ~1–2 semanas), luego un MVP con
  **bandeja de WhatsApp + copiloto que llena la ficha solo**. El agente autónomo
  que responde a prospectos va después, cuando el copiloto ya demostró que acierta.

---

## 2. Hallazgos críticos y altos (arreglar ya)

| # | Dónde | Qué pasa | Esfuerzo |
|---|---|---|---|
| C1 ✅ | `backend/src/jobs/reminderJob.js:22-63, 126-148` | **Corregido el 5-nov** (más `scripts/reparar-ciclo-cobro.mjs` para los datos ya dañados). Al vencer un recordatorio de pago, el job toma **la misma nota** que acaba de avisar, la mueve al siguiente periodo y después la marca `notificacionEnviada: true` → **no vuelve a avisar nunca**. Además adelanta `Venta.fechaProximoPago` aunque el cliente no haya pagado, así que el semáforo ámbar casi nunca aparece y "Confirmar cobro" registra el recibo con el periodo equivocado (se pierde un periodo y la comisión puede caer en el año de póliza equivocado). | M |
| A1 ✅ | `backend/src/utils/comisionesPoliza.js:63-90` | **Corregido el 5-nov.** Pagos duplicados: se hace `findFirst` y luego `create`, sin restricción única. Un doble clic o un reintento duplica el recibo y la comisión. | S |
| A2 | `frontend` (101 llamadas) | React Query v5 con la sintaxis de v4 `invalidateQueries(['x'])`: **invalida toda la caché** y vuelve a pedir todo lo que está en pantalla en cada mutación. Desde el celular se traduce en lentitud y consumo de datos. Además esconde invalidaciones que faltan (p. ej. `PolizaFormModal` no refresca ficha ni dashboard). No se arregla con buscar y reemplazar. | M |
| A3 | `frontend/src/context/AuthContext.jsx:71-75` | Logout no limpia la caché: si otra persona entra en la misma pestaña, ve un instante la cartera y la agenda del anterior. | S |
| A4 | `backend/src/routes/usuarios.js:189` | "Cualquiera invita con cualquier rol": un asesor (o alguien con su token) puede invitarse a sí mismo con otro correo como **ADMIN** y ver todas las carteras. Sin revertir la decisión: avisar a la promotora en toda invitación ADMIN/ASISTENTE (o pedir su aprobación). | S |
| A5 | `backend/src/routes/captura.js:152-212` | Con la clave pública de la landing se puede mandar una "cita" con el teléfono de un cliente existente y regresarlo de DESCARTADO a CITA. No cambiar la etapa de clientes existentes desde una captura pública. | M |
| A6 | `frontend/src/index.css:63` | Los inputs tienen 14 px y **el iPhone hace zoom en cada campo**. Pasar a `text-base md:text-sm`. | S |
| A7 | `Layout.jsx:289`, `index.html:5` | `h-screen` sin `viewport-fit=cover`: la barra inferior puede quedar debajo de la del navegador y las zonas seguras valen 0 (confirmar en iPhone). | S |
| A8 | Frontend en general | Solo hay 2 pantallas de error. Si falla la red, el Dashboard se queda en "Cargando…" para siempre, y la ficha muestra "Cliente no encontrado" ante un 403. | M |
| A9 | `PolizaFormModal.jsx:456,464` | La ficha de póliza (5 secciones, a veces prellenada con Gemini) se pierde con la X, con Cancelar o con el botón atrás de Android, sin confirmación. | S–M |

## 3. Hallazgos medios

**Backend**
- **Meses y "hoy" con la hora del servidor (UTC en Railway)**: `metricas.js`, `automatizacionesJob.js` y `ventas.js` (resumen de comisiones). Una póliza capturada el 31 a las 19:00 cuenta para el mes siguiente. Además, después de las 18:00 "Citas de hoy" del Dashboard ya muestra las de mañana. Solución: un helper `rangoMesMx()` en `utils/fechas.js`.
- **Un asesor puede aprobar su propia póliza por API** (`ventas.js:685`): el backend no exige rol para APROBADA/RECHAZADA, y los enums no se validan (un valor basura da 500 en vez de 400).
- **PATCH de cita acepta cualquier `promotorId`** (`citas.js:962`), aunque el POST sí lo valida.
- **El borrado forzado de un usuario arrastra datos de otros** (`usuarios.js:288`): candidatos, POP, invitaciones y los **documentos que esa persona subió** van en cascada. Por ejemplo, borrar a la secretaria se llevaría las carátulas de los clientes de todos.
- ✅ **Corregido el 5-nov.** **Fechas de cobro que se recorren** (31-ene → 3-mar) en `siguientePeriodo` y en una copia propia dentro de `ventas.js:968`.
- **Monedas mezcladas** al calcular la fracción pagada de la comisión (UDI contra MXN). Está sin confirmar en la UI.
- **N+1 en el ranking del Dashboard**: unas 50 consultas por carga con 8 asesores.
- **Las listas "ganada/activa/viva" están escritas a mano 14 veces en 8 archivos**, a pesar de la regla de definición única.

**Frontend**
- **El bundle inicial pesa 873 kB** (CLAUDE.md dice 703) porque ninguna página tiene `lazy()`. El asesor descarga Candidatos, POP y Configuración aunque nunca los abra.
- **`VistasAsesor.jsx` calcula sus propias reglas**: deja PAGADA fuera de "prima aprobada", pinta en verde comisiones de pipeline y usa otro endpoint de tendencia.
- **Archivos gigantes**: PolizaFormModal (1,358 líneas), CalendarioView (1,324), CalendarioMovil (1,147) y ClienteDetalle (984). El bloque "empalme → confirmar → reintentar" está copiado 10 veces.
- **Modales sin Escape, sin manejo de foco y sin `role="dialog"`**, y `Field` no asocia el label con su input (167 usos).
- **Quedan 22 `confirm()` nativos** y la búsqueda del CRM no espera antes de pedir al servidor (debounce).
- **Al volver a abrir la PWA los datos están viejos** porque `refetchOnWindowFocus` está apagado.
- **25 puntos, Clínica y Metas casi no son responsive.**

**Lo que está bien:** los cambios de auth sin commit están bien hechos (HS256 fijo, cierre de sesiones a distancia, freno de fuerza bruta, mensaje único). recharts y three cargan en diferido. Todos los `datetime-local` se convierten a ISO.

## 4. UI (recorrido como asesor)

- **10 secciones en el menú del asesor** (Hoy, Dashboard, CRM, Agrega tu sitio web, Citas, Pólizas, Actividad, 25 puntos, Clínica, Mi meta), y varias se enciman: Hoy, Clínica y 25 puntos responden la misma pregunta, "¿a quién llamo hoy y cuánto llevo?".
- **En el celular, el aviso de notificaciones bloqueadas ocupa un tercio de la pantalla en cada vista** hasta que se descarta.
- **En el CRM móvil, segmento, etapa, fuente, orden y filtros rápidos llenan media pantalla** antes del primer contacto.
- **En la ficha de cliente hay dos botones para la misma acción** ("+ Crear póliza" y "+ Registrar póliza").
- **Las citas pasadas sin cerrar convierten la "próxima acción" de todos los contactos en "Vencida"** (3 de 3 en la base demo). Es justo el tipo de limpieza que debería hacer un agente.
- **"Registrar llamada" es claro y rápido** (5 resultados, nota, recordatorio). Aun así es captura manual: es lo primero que debe sustituir el ARM.

---

## 5. Ruta CRM → ARM

### Qué significa aquí
Un ARM orquesta agentes que **leen las conversaciones** (WhatsApp), **llenan la
ficha solos**, **responden y califican**, y le pasan al asesor solo a los
prospectos con intención alta. El asesor deja de capturar y pasa a confirmar y vender.

### Lo que falta en el modelo de datos (bloqueos concretos)
- **`Conversacion` / `Mensaje`** (canal, dirección entrada/salida, id de WhatsApp, autor humano o agente).
- **`ConsentimientoContacto`** (aceptación, baja y fecha). Lo exigen la LFPDPPP y la política de WhatsApp. Hoy `Cliente` no tiene nada de esto.
- **Actor real en `Actividad`**: hoy se guarda el dueño, no quien hizo el cambio. Hace falta `actorId` + `origen: HUMANO | AGENTE` para saber qué hizo la IA y poder auditarla.
- **Capa de servicios**: la lógica vive en rutas de más de 1,000 líneas (`citas.js` y `ventas.js`). Un agente necesita llamar las mismas funciones que la UI (crear cita con empalme, registrar llamada, cambiar etapa) sin duplicarlas. `utils/seguimiento.js` ya es el patrón correcto: hay que extenderlo.
- **Sugerencias pendientes de confirmar**: un modelo `SugerenciaAgente` (campo, valor propuesto, evidencia, estado). Es el mismo patrón que ya funciona en la extracción de pólizas.

### Fases

**Fase 0 — Cimientos (1–2 semanas).** Arreglar C1, A1–A9 y la zona horaria.
Agregar `actorId`/`origen` en Actividad y sacar a servicios las funciones que
usará el agente. Sin esto, un agente multiplicaría los bugs actuales a la velocidad de una máquina.

**Fase 1 — Canal: bandeja de WhatsApp (3–4 semanas).** WhatsApp Business
Cloud API (Meta) con un webhook de entrada. Cada mensaje se liga al cliente por
teléfono, reusando la deduplicación de `captura.js`, y un número nuevo crea el
lead solo. Incluye:
- una bandeja en la ficha y otra general, desde donde el asesor responde;
- plantillas aprobadas para escribir después de la ventana de 24 h;
- registro de consentimiento.

Todavía sin IA. Esto solo ya resuelve que **"la información quede varada en el chat"**.

**Fase 2 — Copiloto (3–4 semanas), el corazón del MVP.** Con cada conversación
o nota de voz, el agente:
- **llena la ficha** (edad, dependientes, ocupación, ¿tiene seguro?, ramo de interés: son los mismos campos del Evaluador de la clínica);
- **propone la etapa y la siguiente acción**, y registra la llamada o la cita;
- **califica la intención** (frío / tibio / caliente);
- **deja todo como sugerencia** que el asesor acepta con un toque.

**Notas de voz → registro**: el asesor dicta "hablé con Carlos, quiere GMM,
cita el jueves a las 5" y el sistema registra la llamada, la cita y la etapa.
Eso elimina el formulario de Registrar llamada y la captura de la Clínica.
**Hoy** se vuelve "lo que tu agente preparó para ti". Ahí se fusionan Hoy,
Clínica y 25 puntos, y el menú baja de 10 a ~6 secciones.

**Fase 3 — Agente autónomo con guardarraíles.** Responde 24/7 a los leads
entrantes con las preguntas de calificación, agenda en la disponibilidad del
asesor (ya existe `/citas/disponibilidad`) y **entrega al humano** a los
calientes con un resumen. Post-venta automático, que hoy está bloqueado por
falta de canal: recordatorios de pago **al cliente**, renovaciones,
cumpleaños y pedir referidos después de la entrega.
Guardarraíles:
- nunca cotiza ni da asesoría de producto (eso le toca al asesor con cédula);
- tiene un conjunto cerrado de herramientas;
- el humano puede tomar el control con un botón;
- cada mensaje queda registrado con `origen: AGENTE`.

**Fase 4 — Agente de la promotora.** Resumen semanal por asesor, pipeline
atorado, reclutamiento (POP y candidatos) y coaching.

### Cómo medir que ya es ARM
- **Tiempo a la primera respuesta** de un lead (meta: menos de 5 min, las 24 h).
- **% de registros creados por agente** contra los capturados a mano.
- **% de sugerencias aceptadas sin editar** (si es bajo, el copiloto no está listo para ser autónomo).
- **Fichas completas** (los campos del Evaluador llenos).
- **Leads calientes entregados por semana** y su conversión a cita.

### Decisiones que son tuyas antes de la Fase 1
1. **Número de WhatsApp**: ¿uno por asesor o uno central de la promotoría que reparte? Cambia el modelo de datos y el costo.
2. **Alineación con el rediseño de marketing con Santi (D-028)**: la puerta de entrada (hoy ManyChat y `PROTEGE`, en pausa) debería terminar en esta bandeja y no en una herramienta paralela.
3. **Presupuesto mensual** para la API de WhatsApp (cobro por conversación) y el modelo de IA. Hoy se usa Gemini por costo. Para conversar con prospectos conviene evaluar un modelo fuerte en tool use (p. ej. Claude Sonnet 5.5 para conversar y Haiku 5.5 para clasificar) contra Gemini, con un piloto medido.
4. **Aviso de privacidad y consentimiento** para el tratamiento de datos de salud (GMM) por un agente automatizado.
