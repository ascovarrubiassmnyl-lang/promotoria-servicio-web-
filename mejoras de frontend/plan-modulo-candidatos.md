# Plan de implementación — Módulo de Candidatos (Reclutamiento)

CRM Promotoría SMNYL · Node/Express/Prisma/PostgreSQL + React/Vite/Tailwind/React Query

---

## Contexto para Claude Code

La promotora (rol `ADMIN`) recluta y capacita asesores. Hoy el CRM solo maneja **clientes** (venta de seguros, dueño = `ASESOR`). Se agrega un módulo de **candidatos** a reclutamiento, cuyo dueño es la promotora, replicando el flujo del sistema corporativo de SMNYL:

1. Captura de datos personales del candidato (formulario con selector "Cliente o Candidato").
2. Evaluación en dos pasos: **Vitales** (6 dimensiones, escala 1–5) → **Valores** (6 dimensiones, escala 1–5).
3. **Semáforo** de selección (VERDE / AMARILLO / ROJO) derivado de la evaluación.
4. Pipeline de etapas: Entrevista Inicial → Selección → Carrera → (Adicional, opcional) → Precontrato (MC) → Firma de contrato (FC).
5. Citas de reclutamiento ligadas al candidato — el enum `ModalidadCita` **ya tiene** `PRP`, `ENTREVISTA_INICIAL`, `ENTREVISTA_SELECCION`, `ENTREVISTA_CARRERA`, pero hoy esas citas no pueden apuntar a nadie.
6. Notificaciones al crear/asignar citas (push + centro in-app). Hoy el push solo se dispara desde `Nota.fechaAviso`; no existe modelo `Notificacion` ni aviso al agendar citas.

**Decisión de arquitectura ya tomada:** modelo `Candidato` separado, NO extender `Cliente`. Razones: `Cliente` está acoplado a venta (`EstadoCliente`, productos, primas, ventas, referidos), su dueño obligatorio es un asesor, y todas las métricas/rankings asumen eso. El selector "Cliente o Candidato" es solo UI: un formulario que rutea a `POST /api/clientes` o `POST /api/candidatos`.

---

## Preguntas abiertas (resolver con la promotora ANTES de Fase 1)

| # | Pregunta | Default propuesto si no hay respuesta |
|---|----------|----------------------------------------|
| Q1 | **Regla del semáforo**: ¿cómo se calcula verde/amarillo/rojo a partir de vitales+valores? | Promedio global de las 12 dimensiones: ≥4.0 VERDE, 3.0–3.9 AMARILLO, <3.0 ROJO. Además ROJO automático si cualquier vital ≤1. |
| Q2 | ¿Se incluye la etapa "Entrevista Adicional"? (está en el sistema SMNYL, no en las notas) | Sí, como etapa opcional que se puede saltar. |
| Q3 | ¿Los asesores (`ASESOR`) pueden ver/capturar candidatos, o es exclusivo de ADMIN/SUPERADMIN? | Solo ADMIN/SUPERADMIN ven el módulo. Cualquier rol puede capturar vía el selector (un asesor puede referir un candidato), pero la gestión es de la promotora. |
| Q4 | ¿Qué es `ProspectoClinica` y el "pop-up" existente? ¿El semáforo debe leer de ahí? | Se asume que no existe evaluación previa; se construye desde cero. **Verificar en el código antes de decidir.** |
| Q5 | ¿"Reclutador/Oficina" es texto libre (como en SMNYL) o un select de usuarios del sistema? | Relación opcional a `Usuario` + campo texto libre `oficina`. |

---

## Fase 1 — Schema y migración (backend)

**Archivo:** `backend/prisma/schema.prisma`

### 1.1 Nuevos enums

```prisma
enum EtapaCandidato {
  ENTREVISTA_INICIAL
  SELECCION
  CARRERA
  ENTREVISTA_ADICIONAL   // opcional en el flujo (Q2)
  PRECONTRATO_MC
  FIRMA_CONTRATO_FC
}

enum SemaforoCandidato {
  SIN_EVALUAR
  VERDE
  AMARILLO
  ROJO
}
```

### 1.2 Modelo `Candidato`

Campos tomados del formulario SMNYL (captura + información adicional):

```prisma
model Candidato {
  id              String            @id @default(cuid())
  // Dueño: la promotora. Quién lo capturó puede ser cualquier usuario.
  creadoPorId     String
  creadoPor       Usuario           @relation("candidatosCreados", fields: [creadoPorId], references: [id], onDelete: Cascade)
  reclutadorId    String?           // Q5: usuario reclutador si aplica
  reclutador      Usuario?          @relation("candidatosReclutados", fields: [reclutadorId], references: [id], onDelete: SetNull)
  oficina         String?

  // Datos personales (paso 1 del form SMNYL)
  nombre          String
  apellidoP       String
  apellidoM       String?
  telefono        String
  ciudad          String?
  email           String?
  fechaNacimiento DateTime?
  sexo            String?           // "M" | "F" | otro — validar en ruta
  rfc             String?
  fuente          String            // requerido en SMNYL
  referidoPor     String?           // texto libre
  notas           String?

  // Información adicional (colapsable en el form)
  calle           String?
  colonia         String?
  codigoPostal    String?
  estadoDireccion String?
  profesion       String?
  gradoEstudios   String?
  antiguedadResidencia String?
  estadoCivil     String?
  numeroHijos     Int?
  ingresosAnuales Float?

  // Pipeline
  etapa           EtapaCandidato    @default(ENTREVISTA_INICIAL)
  semaforo        SemaforoCandidato @default(SIN_EVALUAR)

  // Evaluación (una por candidato; si prefieren histórico, mover a modelo aparte)
  evaluacion      EvaluacionCandidato?

  // Borrado lógico, mismo patrón que Cliente
  archivadoEn     DateTime?
  creadoEn        DateTime          @default(now())
  actualizadoEn   DateTime          @updatedAt

  citas           Cita[]

  @@index([etapa])
  @@index([reclutadorId])
  @@index([creadoPorId])
}
```

### 1.3 Modelo `EvaluacionCandidato`

Escala: `0` = sin contestar, `1–5` = Pobre/Promedio/Bueno/Muy bueno/Excelente. La evaluación se considera completa cuando las 12 dimensiones son ≥1.

```prisma
model EvaluacionCandidato {
  id          String    @id @default(cuid())
  candidatoId String    @unique
  candidato   Candidato @relation(fields: [candidatoId], references: [id], onDelete: Cascade)
  evaluadorId String
  evaluador   Usuario   @relation(fields: [evaluadorId], references: [id], onDelete: Cascade)

  // Vitales (1–5)
  caracterIntegridad      Int @default(0)
  agilidadMental          Int @default(0)
  empuje                  Int @default(0)
  nivelEnergia            Int @default(0)
  motivacionDinero        Int @default(0)
  posibilidadPermanencia  Int @default(0)

  // Valores (1–5)
  imagenProfesional  Int @default(0)
  enfoqueSocial      Int @default(0)
  autoGestionable    Int @default(0)
  orientadoProcesos  Int @default(0)
  claridadMetas      Int @default(0)
  enfoqueActividad   Int @default(0)

  vitalesCompletadosEn DateTime?
  valoresCompletadosEn DateTime?
  creadoEn      DateTime @default(now())
  actualizadoEn DateTime @updatedAt
}
```

### 1.4 Cambios a modelos existentes

- `Cita`: agregar `candidatoId String?` + relación `candidato Candidato?` + `@@index([candidatoId])`. Validación en ruta: las modalidades `PRP` / `ENTREVISTA_*` exigen `candidatoId` y prohíben `clienteId`; el resto al revés. Mantener el comentario del enum actualizado.
- `Usuario`: agregar relaciones inversas `candidatosCreados`, `candidatosReclutados`, `evaluacionesCandidato`, `notificaciones` (Fase 4).

### 1.5 Migración

```bash
cd backend && npx prisma migrate dev --name modulo_candidatos
```

**Verificar:** la migración no toca tablas existentes salvo `Cita` (columna nullable — sin riesgo para datos actuales).

---

## Fase 2 — API (backend)

**Archivos nuevos:** `backend/src/routes/candidatos.js` (seguir el patrón exacto de `clientes.js` existente: middleware auth, estructura de respuestas, borrado lógico).

### Endpoints

| Método | Ruta | Descripción | Permisos |
|--------|------|-------------|----------|
| GET | `/api/candidatos` | Lista con filtros `?etapa=&semaforo=&busqueda=` | ADMIN/SUPERADMIN (Q3) |
| POST | `/api/candidatos` | Crear candidato | Todos los roles (Q3) |
| GET | `/api/candidatos/:id` | Perfil completo (incluye evaluación y citas) | ADMIN/SUPERADMIN |
| PUT | `/api/candidatos/:id` | Editar datos | ADMIN/SUPERADMIN |
| DELETE | `/api/candidatos/:id` | Archivar (borrado lógico) | ADMIN/SUPERADMIN |
| PUT | `/api/candidatos/:id/etapa` | Avanzar/regresar etapa | ADMIN/SUPERADMIN |
| PUT | `/api/candidatos/:id/evaluacion/vitales` | Guardar los 6 vitales | ADMIN/SUPERADMIN |
| PUT | `/api/candidatos/:id/evaluacion/valores` | Guardar los 6 valores | ADMIN/SUPERADMIN |

### Lógica de negocio

- Al guardar valores con vitales ya completos → calcular y persistir `semaforo` según regla Q1. Centralizar el cálculo en `backend/src/lib/semaforoCandidato.js` (función pura, testeable).
- Guardar vitales exige los 6 campos entre 1 y 5; ídem valores. El endpoint de valores rechaza si vitales no están completos (flujo secuencial del sistema SMNYL).
- Transiciones de etapa: permitir avanzar solo secuencialmente (con salto opcional de `ENTREVISTA_ADICIONAL`) y regresar libremente; registrar cambio de etapa en la bitácora de actividad si el CRM ya tiene ese patrón (verificar cómo `clientes.js` registra actividad y replicar).
- Modificar `backend/src/routes/citas.js`: aceptar `candidatoId`, validar exclusión mutua con `clienteId` según modalidad.

---

## Fase 3 — Frontend

**Patrón:** replicar la estructura existente de la sección de clientes (páginas, hooks de React Query, componentes). Antes de crear nada, leer cómo está organizado `frontend/src` (¿pages/? ¿features/?) y seguir esa convención.

### 3.1 Selector "Cliente o Candidato" en captura

- En el formulario de alta actual de cliente: agregar arriba un selector (radio o dropdown) "Tipo: Cliente | Candidato".
- Si "Candidato": el formulario cambia a los campos del candidato (dos secciones: datos personales + "Información adicional" colapsable, como en SMNYL) y envía a `POST /api/candidatos`.
- Campos requeridos según SMNYL: nombre, apellido paterno, teléfono, sexo, fuente. RFC opcional con nota "podrá editarse después".
- Campo calculado `edad` (solo lectura, derivado de fecha de nacimiento).

### 3.2 Vista de lista `/candidatos`

- Nueva entrada en el sidebar (visible solo ADMIN/SUPERADMIN según Q3): "Candidatos".
- Tabla/cards con: nombre, etapa (badge), semáforo (punto de color verde/amarillo/rojo/gris), fuente, reclutador, última cita.
- Filtros por etapa y semáforo. Vista de pipeline tipo tabs horizontales con las etapas (como imagen 4 del sistema SMNYL) es un plus, no MVP.

### 3.3 Perfil del candidato `/candidatos/:id`

- Header: nombre + badge de etapa + semáforo con resumen de la evaluación (promedios de vitales y valores).
- Stepper de etapas con botón "Avanzar a [siguiente etapa]".
- Sección de evaluación en dos pasos (wizard "Paso a paso" como SMNYL):
  - **Vitales**: 6 sliders 0–5 con descripción colapsable de cada dimensión (textos exactos de la imagen 2). Botón "Completar todos los vitales" deshabilitado hasta que los 6 sean ≥1.
  - **Valores**: se habilita al completar vitales. 6 sliders + descripción de calificación (1 Pobre … 5 Excelente). Botón "Completar todos los valores" → al guardar, el backend calcula el semáforo y la UI lo muestra.
- Citas del candidato: lista + botón para agendar (abre el flujo de cita existente con modalidad `ENTREVISTA_*` preseleccionada según la etapa actual).
- Soporte de modo claro/oscuro consistente con el resto de la app.

### 3.4 Calendario

- El formulario de cita: cuando la modalidad es `PRP`/`ENTREVISTA_*`, el selector de cliente se reemplaza por selector de candidato.
- Color del evento: las entrevistas de reclutamiento clasifican como `GESTION` por default (no generan dinero directo) — confirmar con la promotora si prefiere un color propio.

---

## Fase 4 — Notificaciones de citas (módulo independiente)

Esto arregla el pendiente "si alguien agenda una cita, debe llegar aviso al celular y al sistema". Beneficia a TODO el CRM, no solo candidatos. Hacerlo al final para no bloquear el módulo de candidatos.

### 4.1 Modelo

```prisma
enum TipoNotificacion {
  CITA_CREADA
  CITA_MODIFICADA
  CITA_CANCELADA
  RECORDATORIO
}

model Notificacion {
  id        String   @id @default(cuid())
  usuarioId String
  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  tipo      TipoNotificacion
  titulo    String
  cuerpo    String?
  // Link relativo dentro de la app, p.ej. /calendario?cita=xxx
  url       String?
  leidaEn   DateTime?
  creadoEn  DateTime @default(now())

  @@index([usuarioId, leidaEn])
}
```

### 4.2 Backend

- `backend/src/lib/notificar.js`: función `notificar(usuarioId, {tipo, titulo, cuerpo, url})` que (a) crea el registro `Notificacion` y (b) envía Web Push a todas las `PushSubscription` del usuario (reusar la infraestructura de push existente de los recordatorios de `Nota` — localizarla primero).
- Hook en `POST /api/citas` y `PUT /api/citas/:id`: notificar a todos los involucrados que NO son quien ejecuta la acción (asesor, promotor de acompañamiento). Ejemplo: si la promotora agenda un acompañamiento, el push le llega al asesor, no a ella.
- Endpoints: `GET /api/notificaciones` (paginado, no leídas primero), `PUT /api/notificaciones/:id/leer`, `PUT /api/notificaciones/leer-todas`.

### 4.3 Frontend

- Campana en el header con contador de no leídas (polling de React Query cada 60s o al enfocar la ventana).
- Dropdown/drawer con lista; click navega a `url` y marca como leída.

### 4.4 Diagnóstico previo obligatorio

Antes de escribir código nuevo, verificar por qué el push actual "no llega" (queja literal de las notas). Checklist:
1. ¿Las VAPID keys están configuradas en el `.env` de producción?
2. ¿Los usuarios tienen `PushSubscription` registradas? (query directa a la tabla)
3. ¿El service worker del frontend está registrado y sirviendo en HTTPS?
4. ¿El cron/scheduler que revisa `Nota.fechaAviso` corre en producción?

Es posible que el problema sea de configuración, no de código. Arreglar eso primero; el modelo `Notificacion` es adicional, no reemplazo.

---

## Fase 5 — Seed y verificación

- Extender `prisma:seed`: 4–5 candidatos demo repartidos en etapas distintas, uno con evaluación completa en cada color de semáforo.
- Prueba manual E2E: capturar candidato vía selector → evaluar vitales → valores → verificar semáforo → agendar `ENTREVISTA_INICIAL` → verificar notificación push + campana → avanzar etapa hasta `FIRMA_CONTRATO_FC`.
- Test unitario mínimo: `semaforoCandidato.js` (función pura de cálculo).

---

## Orden de ejecución sugerido en Claude Code

```
1. Leer estructura real: backend/src/routes/, frontend/src/ — confirmar convenciones
2. Investigar ProspectoClinica (Q4) y la infraestructura push existente (4.4)
3. Resolver Q1–Q5 con la promotora (o aceptar defaults)
4. Fase 1 (schema + migración)
5. Fase 2 (API) — probar con curl/Thunder antes de tocar frontend
6. Fase 3 (frontend)
7. Fase 5 parcial (seed + prueba del módulo)
8. Fase 4 (notificaciones) como sesión aparte
9. Fase 5 completa
```

Estimación realista: Fases 1–3 en una o dos sesiones largas de Claude Code; Fase 4 en una sesión aparte (incluye diagnóstico de producción que puede ser el verdadero cuello de botella).
