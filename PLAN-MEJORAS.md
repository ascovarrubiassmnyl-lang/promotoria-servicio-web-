# Plan de implementación — mejoras del CRM (13 ago 2026)

Evaluación de `mejoras.md` contra el código actual, agrupada por lote de
implementación. Cada punto lleva: **veredicto** (qué tanto ya existe), **dónde
se toca** y **decisiones pendientes** cuando las hay.

Regla que se respeta en todo el plan: cada cambio de negocio pasa por las tres
capas del proyecto (nav / guard / API) y reutiliza los mapas únicos existentes
(`etapas.js`, `tipos.js`, `format.js`, `ritmo.js`) en vez de duplicar labels o
reglas.

---

## Resumen ejecutivo

De los ~35 puntos del documento:

- **7 son ajustes de UI de una sola sesión** (mover botones, quitar bloques
  duplicados, preview de archivos) — lote 1, sin migración.
- **12 son cambios de modelo + UI acotados** (fuente como enum, cliente frío,
  domiciliación, fecha de emisión, costo por cobertura, moneda) — lotes 2–4,
  con migraciones pequeñas.
- **4 son features grandes que merecen decisión previa** (extracción de PDF con
  IA, motor de automatizaciones tipo n8n, backup, retargeting) — lote 6, y dos
  de ellos recomiendo **no** hacerlos como están descritos (ver "Reevaluar").
- **6 ya existen total o parcialmente** en el código y solo necesitan
  exponerse o afinarse — están marcados abajo como *(ya existe)*.

Orden recomendado: **1 → 2 → 3 → 4 → 5 → 6**. Los lotes 1–3 son los que le
cambian el día a día al asesor; el 6 es producto nuevo y necesita
conversación con la promotora antes de escribir código.

---

## Lote 0 — Bloqueador declarado por ti: catálogo de productos

Es el "Próximo paso" #1 del documento y el que estás redactando ahora.

**Estado actual:** el catálogo **ya existe y funciona**:
`ProductoCatalogo` (ramo, nombre, código, comisionPct, comisionBonoPct,
`coberturas` Json) con datos en `backend/prisma/productosCatalogoData.js`
(21 productos, ~119 coberturas) y API `productos-catalogo.js`.

**Lo que hace falta no es infraestructura, es datos.** Cuando termines de
redactar los productos, el trabajo es:

1. Extender `productosCatalogoData.js` con los productos nuevos/corregidos.
2. Si tu información trae campos que hoy no existen en el modelo (p. ej.
   **plazo por defecto**, **moneda nativa**, **edades de emisión**,
   **vigencia estándar**) → agregarlos a `ProductoCatalogo` en la misma
   migración del lote 3, no en migraciones sueltas.
3. Correr el script de producción `scripts/seed-productos-catalogo.mjs`.

> **Lo que necesito de ti en el documento de productos**, para no tener que
> pedirlo después: por producto → nombre exacto, ramo, código, moneda
> (MXN/USD/UDI), plazo(s) válidos, duración de vigencia (para el cálculo
> automático de fin de vigencia), comisión %, y por cobertura → nombre,
> detalle, si es incluida u opcional y **si tiene costo extra**.

---

## Lote 1 — Limpieza de UI (sin migración, ~1 sesión)

Todo en frontend. Es el lote con mejor relación esfuerzo/impacto.

| # | Punto del doc | Dónde | Nota |
|---|---|---|---|
| 1.1 | Quitar bloque "Detalle de interés" (duplica notas) | `ClienteDetalle.jsx:397-402,707` | El campo `Cliente.detalleInteres` **se conserva en BD** (dato histórico); solo se deja de mostrar/editar. Se mantiene "Producto de interés" (el ramo), que sí es dato estructurado. |
| 1.2 | Quitar botón "Editar" visible, dejarlo solo en ⋯ | `ClienteDetalle.jsx:343` | El ⋯ ya tiene "Editar datos del cliente" (`:349`). Es borrar la línea 343. |
| 1.3 | Mover "necesita seguimiento" al ⋯ y sacarlo del alta | `ClienteDetalle.jsx:350` (ya está en ⋯) + `ClientesView.jsx` (quitar del modal de alta) | *(ya existe a medias)* — solo falta quitarlo del registro inicial. |
| 1.4 | Renombrar "Editar" del bloque Contacto → "Agregar datos del cliente" | `ClienteDetalle.jsx:387` | Cambio de copy + que el modal muestre RFC/CURP/dirección (RFC y dirección **ya existen** en el modelo; **CURP es campo nuevo** → va al lote 2). |
| 1.5 | Previsualizar archivo en vez de descargar | `ClienteDetalle.jsx:274-276,605-613` + `documentos.js` | Agregar `GET /documentos/:id/ver` que sirva inline (`Content-Disposition: inline`) para PDF/imagen, abrir en modal/pestaña; "Descargar" pasa a secundario. |
| 1.6 | Poder eliminar archivos | `documentos.js` | Verificar si ya hay `DELETE`; si no, agregarlo con confirmación en UI (patrón ⋯ + modal, nunca botón rojo directo). |
| 1.7 | Vista semanal del calendario alineada con la mensual | `components/citas/CalendarioView.jsx` | Ajuste visual: mismos chips, misma densidad, misma leyenda. |

---

## Lote 2 — Prospectos vs. clientes y calidad del dato (1 migración)

Este lote resuelve el dolor #1 del documento: "hoy todo está mezclado".

### 2.1 Segmentación prospecto / cliente — **no crear un modelo nuevo**

**Veredicto: ya tienes el dato, falta la presentación.** El pipeline
`EstadoCliente` (`components/clientes/etapas.js`) ya ordena las etapas. Un
"cliente" no es otra tabla: es quien tiene al menos una `Venta` viva
(o llegó a `ENTREGA_POLIZA`+).

**Propuesta:** campo derivado en el servidor `esCliente` en
`GET /api/clientes` (true si tiene venta en `PAGADA/APROBADA/FIRMADA`), y en
`ClientesView.jsx` un **switch de segmento arriba de los chips de etapa**:
`Prospectos | Clientes | Todos`. Cero migración, cero riesgo de dato
duplicado, y no rompe métricas que ya cuentan sobre `Cliente`.

> Alternativa que **descarto**: un enum `TipoContacto` manual. Se
> desincroniza el día que alguien olvida cambiarlo; el estado de venta ya es
> la verdad.

### 2.2 "Cliente frío" (prospecto sin datos de contacto)

**Veredicto: no requiere campo nuevo.** `Cliente.email` y `Cliente.telefono`
**ya son opcionales** en el schema — el correo falso es un workaround por
validación del frontend, no del modelo.

**Propuesta:** quitar la obligatoriedad de contacto en el modal de alta,
mostrar chip "Sin contacto" en la lista y ofrecer el filtro. Si además
quieres marcarlo explícitamente, un booleano `contactoPendiente` es
opcional — recomiendo derivarlo (`!email && !telefono`) y no guardarlo.

### 2.3 `Cliente.fuente` → lista desplegable

Hoy es `String?` libre (`ClienteDetalle.jsx:639` es un `<input>`).

**Propuesta:** mapa único nuevo `components/clientes/fuentes.js`
(`FUENTES = [REFERIDO, FACEBOOK, INSTAGRAM, ANUNCIOS, PROSPECCION_FRIA,
CLINICA_TELEFONICA, EVENTO, OTRO]`) + `<select>` en alta y ficha.

Mantener la columna como `String` (no enum de Prisma) para no romper los
valores de texto ya capturados; el servidor valida contra el catálogo y
deja pasar los legacy. Migración de datos: normalizar los valores actuales
con un script one-off.

### 2.4 CURP + campos fiscales

`rfc` y `direccion` ya existen; falta **`curp`**. Migración pequeña, se
agrupa con 2.3.

**Migración del lote:** `curp` en `Cliente` (+ normalización de `fuente`).

---

## Lote 3 — Módulo de pólizas: el corazón del documento (1–2 migraciones)

### 3.1 Producto autorrellenado y **bloqueado**

Hoy `onProductoCatalogo` (`PolizaFormModal.jsx:76`) ya copia el nombre, pero
el campo sigue editable.

**Propuesta:** cuando hay `productoCatalogoId`, el input de nombre pasa a
`readOnly` (mismo patrón que ya usan las coberturas del catálogo con
`esCoberturaDeCatalogo`). Se conserva editable solo si el asesor elige
"producto fuera de catálogo".

### 3.2 Moneda (MXN / USD / UDI) con conversión

**Campos nuevos en `Venta`:** `moneda` (enum `MXN|USD|UDI`, default `MXN`),
`primaMoneda` (monto en moneda original) y `tipoCambio` (float, el usado al
capturar). `primaAnual` **se conserva siempre en MXN** para no romper
ninguna métrica, comisión, meta ni ranking del sistema (todo el CRM suma
`primaAnual` hoy).

**Decisión pendiente (te la pregunto al final):** el tipo de cambio y el
valor de la UDI ¿se capturan a mano, o el sistema los consulta? Consultarlos
implica una fuente externa (Banxico) — es la única dependencia externa nueva
del plan.

### 3.3 Fin de vigencia automático + ajuste manual sin navegar mes a mes

Requiere el dato del lote 0: **duración de vigencia por producto**
(`ProductoCatalogo.vigenciaMeses` o `plazoDefault`).

**Propuesta:** al elegir producto + `fechaInicioVigencia`, calcular
`fechaFinVigencia`; queda editable (se marca "ajustado manualmente"). Para no
navegar mes a mes: agregar al `DatePicker` existente (`components/ui.jsx`)
selector de mes/año en el encabezado — mejora que beneficia a todos los
formularios, no solo a este.

### 3.4 Domiciliación y método de pago

**Campos nuevos en `Venta`:** `domiciliada` (Boolean, default false) y
`metodoPago` (enum `TARJETA_CREDITO | TARJETA_CREDITO_MSI | TARJETA_DEBITO |
TRANSFERENCIA | EFECTIVO | CARGO_AUTOMATICO`).

**Efecto en el job:** si `domiciliada = true`, `sincronizarRecordatorioPago`
(`ventas.js:16`) **no genera** `RECORDATORIO_PAGO`. Es el cambio de lógica más
importante del lote — hoy todas las pólizas generan recordatorio de cobro.

### 3.5 Aviso un día antes **y** el mismo día del vencimiento

Hoy `reminderJob.js` dispara **una sola vez** (`notificacionEnviada`
booleano) cuando `fechaAviso <= ahora`.

**Propuesta:** cambiar `Nota.notificacionEnviada` (Boolean) por
`avisosEnviados` (Int, 0/1/2) o agregar `avisoPrevioEnviado` (Boolean), y
que el job evalúe dos ventanas: `fechaAviso - 1día` y `fechaAviso`. Se
respeta la regla vigente: se marca enviado **solo si `notificar()`
persistió** la notificación in-app.

### 3.6 Costo individual por cobertura

`Venta.coberturas` ya es Json `[{nombre, detalle, monto}]` donde `monto` es
texto libre ("Incluida", "Costo adicional").

**Propuesta:** agregar `costo` (número, opcional) al shape, dejando `monto`
como está (es la *suma asegurada / etiqueta*, no el precio). En
`PolizaFormModal` una columna más, editable siempre (el costo varía por
persona aunque la cobertura venga del catálogo). En `PolicyDetail`, subtotal
de coberturas con costo.

### 3.7 Confirmación de pago con monto y periodo + "otro monto"

Hoy es un `confirm()` de navegador (`PolicyDetail.jsx:68-69`).

**Propuesta:** modal real con periodo, monto esperado (`montoPago` o
`primaAnual/pagos`), opción "otro monto" + justificación. `POST
/ventas/:id/cobroconfirmado` acepta `{ monto, nota }`.

**Campo nuevo:** para no perder el historial, modelo **`PagoPoliza`**
(ventaId, fecha, montoEsperado, montoPagado, justificacion, registradoPor).
Hoy el pago solo deja rastro en la nota completada — insuficiente para 3.8.

### 3.8 Historial de pagos con semáforo

Sale gratis del modelo `PagoPoliza`: pagado (emerald) / pendiente (amber) /
vencido (red) / cancelado (slate), usando los mismos tokens del sistema. Va
en `PolicyDetail` y como columna en la ficha del cliente.

### 3.9 Fecha de emisión

**Campo nuevo:** `Venta.fechaEmision` (distinta de `fechaFirma`, que ya
existe). Trivial, va en la misma migración.

**Migración del lote 3:** `moneda`, `primaMoneda`, `tipoCambio`,
`domiciliada`, `metodoPago`, `fechaEmision` en `Venta`; modelo `PagoPoliza`;
`avisoPrevioEnviado` en `Nota`; campos de vigencia/moneda en
`ProductoCatalogo`.

---

## Lote 4 — Recordatorios segmentados y clínica automática

### 4.1 Notas → recordatorios segmentados (asesor / cliente)

El documento pide reemplazar "Notas generales" por recordatorios divididos.
`TipoNota` ya tiene `NOTA | RECORDATORIO | RECORDATORIO_PAGO`.

**Propuesta:** agregar `Nota.destinatario` (`ASESOR | CLIENTE`, default
`ASESOR`) y reorganizar la ficha en dos tarjetas. **Importante:** los
recordatorios "para el cliente" hoy **no se le pueden enviar al cliente** —
el CRM no tiene canal hacia el cliente (no hay WhatsApp/SMS/email
transaccional al asegurado). Se implementan como "recordatorio de que el
asesor contacte al cliente", y el envío directo queda como dependencia del
lote 6.

> Recomiendo **no eliminar** las notas libres: son el lugar donde se
> registra contexto que no es accionable. Se conservan como pestaña.

### 4.2 Clínica telefónica poblada automáticamente

Hoy `ProspectoClinica` se captura fila por fila y `clienteId` es opcional.

**Propuesta:** botón "Traer prospectos que necesitan llamada" que crea filas
de `ProspectoClinica` (semana actual) desde `Cliente` con
`necesitaSeguimiento = true` (o etapa `PROSPECTO` sin cita futura),
enlazando `clienteId` — sin duplicar los ya traídos.

### 4.3 Contador de llamadas y citas por sesión

**Veredicto: *(ya existe)*.** `SesionClinica` guarda llamadas y citas
obtenidas, y `META_CITAS_SEMANA = 10` / `META_SESIONES_SEMANA = 2` ya se
calculan. Solo verificar que la UI de `Clinica.jsx` lo muestre por sesión y
no solo agregado.

### 4.4 Tasa de cierre por embudo completo

**Veredicto: *(ya existe parcialmente)*.** `GET /metricas/funnel` ya alimenta
el embudo del dashboard, y CLAUDE.md fija que "la única tasa de conversión es
la del embudo entre etapas".

**Falta** el tramo de actividad previo a las etapas del cliente: prospectos
abordados → llamadas → citas agendadas → citas asistidas. Las tres primeras
ya son datos (`Actividad` tipo `LLAMADA`, `Cita` `PROGRAMADA`, `Cita`
`COMPLETADA`). Es extender `/metricas/funnel`, **no** crear otra métrica
paralela.

### 4.5 Meta de 5 pólizas al mes

**Veredicto: *(ya existe)*.** `Target`/`TargetEquipo` ya tienen la métrica
`ventas`. Es configuración, no código — la promotora la captura en
`/targets`. **Sin cambio de código.**

---

## Lote 5 — Automatizaciones acotadas (las que sí valen ya)

Estas tres son reglas concretas, no un motor. Se implementan como extensiones
del `reminderJob` existente + `notificar()`:

| Regla | Implementación |
|---|---|
| Prospecto sin avance en 15 días | Job diario: `Cliente` sin `Actividad` ni `Cita` en 15 días y no archivado → `notificar(asesorId, 'PROSPECTO_ESTANCADO', …)`. Tipo nuevo en `TIPOS_NOTIFICACION`. |
| Avance de meta mensual | Job: al 50% y 80% del mes, comparar `Target` vs. actual → "llevas 6 de 10 pólizas". Reutiliza `GET /targets/resumen`, no recalcula. |
| Push a celular y computadora | **Ya funciona** (Web Push, con el fix de VAPID de ayer). Lo que faltaba era confiabilidad y descubrimiento, y eso ya se resolvió con la bandeja in-app + `BannerActivarPush`. **Sin trabajo nuevo.** |

Agregar tipos de notificación implica decisión explícita (CLAUDE.md lo pide):
`PROSPECTO_ESTANCADO` y `META_AVANCE` son los dos que propongo.

---

## Lote 6 — Features grandes: mi recomendación honesta

### 6.1 Subir PDF de póliza y extraer datos con IA — **hacer, con alcance recortado**

Es la función de mayor valor real del documento (elimina la captura manual
más pesada). Viable: ya hay upload (`documentos.js`, multer 20 MB) y ya
guardas el PDF.

**Alcance propuesto (MVP):** subir PDF en el modal de póliza → extracción con
Claude (`claude-opus-5` o `claude-sonnet-5` según costo/latencia) → **pantalla
de revisión campo por campo** donde el asesor confirma o corrige antes de
guardar. Nunca guardado automático: un dato mal extraído en una póliza es un
error que se propaga a comisiones y metas.

**Implica:** primera dependencia de API externa del backend (`@anthropic-ai/sdk`
+ `ANTHROPIC_API_KEY` en Railway) y costo por documento. Requiere tu visto
bueno antes de empezar.

### 6.2 Motor de automatizaciones tipo n8n / ManyChat — **posponer**

El documento mismo dice "definir qué automatizar en iteraciones futuras". Un
constructor visual de flujos es, realistamente, más trabajo que todos los
lotes 1–5 juntos, y hoy no hay una sola automatización en producción que lo
justifique.

**Recomiendo:** hacer el lote 5 (3 reglas cableadas), vivir con ellas un mes,
y recién entonces decidir si hace falta un motor genérico. Si al mes hay 10
reglas pedidas, el motor se justifica solo.

### 6.3 Retargeting automatizado a prospectos sin respuesta — **bloqueado por canal**

Igual que 4.1: el CRM no tiene canal hacia el cliente. "Retargeting
automatizado" requiere decidir el canal (WhatsApp Business API, email
transaccional) y eso trae costo, verificación de Meta y reglas de consentimiento.
Hasta que exista canal, lo que sí se puede hacer es el **recordatorio al
asesor** (lote 5, regla de 15 días).

### 6.4 Backup del sistema — **hacer ya, y es lo más barato del documento**

Riesgo real y sin mitigación hoy. En Railway con PostgreSQL:

1. Verificar/activar los backups automáticos del plugin de Postgres.
2. Job semanal de `pg_dump` a almacenamiento externo (S3/R2) con retención.
3. Documentar el procedimiento de restauración en `DEPLOY.md` **y probarlo
   una vez** — un backup no probado no es un backup.
4. `backend/uploads/` (archivos de clientes) hoy vive en el filesystem del
   contenedor: **en Railway eso se pierde en cada redeploy salvo que haya
   volumen persistente.** Verificar esto es urgente, independientemente del
   resto del plan.

---

## Orden de ejecución propuesto

1. **Lote 1** (UI, sin riesgo) — resultado visible inmediato.
2. **6.4 backup + verificar volumen de uploads** — es riesgo abierto, no espera.
3. **Lote 0** (catálogo, cuando entregues los datos) + **Lote 2** (migración
   `curp` + `fuente` + segmentación).
4. **Lote 3** (pólizas, la migración grande) — el bloque de más valor.
5. **Lote 4** (recordatorios + clínica automática).
6. **Lote 5** (3 automatizaciones cableadas).
7. **6.1** (extracción con IA) si das visto bueno al costo.
8. **6.2 / 6.3** solo tras revisión con la promotora.

## Decisiones que necesito de ti (no bloquean empezar el lote 1)

1. **Tipo de cambio / UDI**: ¿captura manual o consulta automática a Banxico?
2. **Extracción con IA**: ¿autorizas dependencia de la API de Claude y su costo
   por documento?
3. **Recordatorios "para el cliente"**: ¿se quedan como aviso al asesor, o
   quieres abrir la conversación de canal (WhatsApp/email al asegurado)?
4. **Notas libres**: ¿las conservo como pestaña o realmente las elimino?
