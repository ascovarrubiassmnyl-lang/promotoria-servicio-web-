# Prompt para Claude Code — Rediseño de "Citas / Calendario"

> Pégalo en Claude Code **adjuntando `origen-calendario.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system y los patrones de las secciones anteriores.
> La ruta ya existe: `/citas`.

---

## Objetivo

Rediseñar la sección de calendario para que sirva al trabajo diario del asesor, corrigiendo el
modelo confuso del formulario "Agendar cita" y agregando vistas útiles. Usa
`origen-calendario.html` como referencia de estructura y estilo; **adáptalo al stack real**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. Cómo se modela hoy una cita (campos, enums de "modalidad"/"tipo"/"estado").
2. Si hay manejo de **zona horaria** y de **empalmes/solapamientos**.
3. Si existe o se requiere **recurrencia** (citas repetidas, renovaciones anuales).
4. Sistema de auth/rol.

No asumas nada; si algo no está claro, pregúntame.

---

## Correcciones de modelo del formulario (prioridad 1)

Hoy el modal mezcla dos conceptos con nombres cruzados: "Modalidad = Cita única de asesor" y
"Tipo = Telefónica". Sepáralos y renómbralos:

1. **Tipo de cita** (quién participa): `cita_asesor` | `acompanamiento`. Si es acompañamiento,
   mostrar un selector de **promotor** que acompaña.
2. **Canal** (medio): `presencial` | `telefonica` | `videollamada`. La etiqueta del campo
   "Ubicación" debe adaptarse al canal (dirección / teléfono / link de videollamada).
3. **No pidas "Estado" al crear.** Toda cita nueva nace `programada`. El estado cambia después
   con acciones del ciclo de vida: **completar**, **cancelar**, **no asistió** / **reagendar**.
   Quita el dropdown de estado del alta.

## Usabilidad del alta (prioridad 1)

- **Prellenar Inicio** con el día seleccionado en el calendario y una hora razonable.
- **Fin automático** = inicio + 30 min (duración por defecto), ajustable.
- **Validar** que Fin > Inicio.
- **Detección de empalme:** si ya hay una cita del mismo asesor que se solapa, mostrar
  advertencia antes de guardar. (No la bloquees necesariamente, pero avisa.)

---

## Vistas del calendario

- Agrega un selector **Mes / Semana / Agenda** (hoy solo hay Mes). Para el asesor, considera
  **Semana** como vista por defecto (confírmame la preferencia).
- **Chips de evento informativos:** hora + título, color por canal, y estado (tachado si
  cancelada). En Mes, mostrar hasta 2–3 y "+N más". Hoy los eventos se cortan a "● 11:00 a.m.
  …" y no comunican nada.
- Mantener el **panel lateral del día** con el detalle de las citas seleccionadas.
- **Filtros:** por canal, por estado, y —solo admin/promotor— por asesor.

---

## Acción destructiva

"Eliminar" directo en el panel del día → cámbialo por **"Cancelar cita"** (cambio de estado a
`cancelada`, conservando el registro) y deja el borrado real como acción separada con
confirmación (soft delete). No pierdas el historial de citas.

---

## Alcance por rol (misma regla que el resto del sistema)

- **Asesor:** ve **su propio** calendario. Sin filtro de asesor.
- **Promotor/Admin:** ve el calendario del **equipo**, con filtro por asesor. Las citas de
  **acompañamiento** deben ser visibles para el asesor y para el promotor involucrado.
- Aplica la restricción en **tres capas** (nav/UI, guard de ruta, y **autorización en la capa
  de datos/API**) y **falla cerrado**: un asesor no puede ver ni modificar citas de otro asesor
  por ningún medio. Si no puedes garantizar la autorización en servidor, **detente y avísame**.

---

## Design system

Actualiza `CLAUDE.md` con: los enums de **tipo de cita**, **canal** y **estado** de cita con sus
colores, la distinción tipo-vs-canal, el patrón "cancelar en vez de borrar", y la regla de
visibilidad por rol del calendario.

---

## Criterios de aceptación

- [ ] El formulario separa "Tipo de cita" (asesor/acompañamiento + promotor) de "Canal"
      (presencial/telefónica/videollamada); la etiqueta de Ubicación cambia según canal.
- [ ] No se elige estado al crear; nace `programada` y se gestiona por acciones.
- [ ] Inicio prellenado, fin automático +30 min, validación Fin>Inicio y aviso de empalme.
- [ ] Existen vistas Mes / Semana / Agenda con chips informativos.
- [ ] "Cancelar cita" cambia estado; no hay borrado directo sin confirmación.
- [ ] Como **asesor**: no veo ni edito citas de otro asesor (probado por URL y API).
- [ ] Como **promotor**: veo el calendario del equipo con filtro por asesor.
- [ ] Funciona en claro y oscuro; ruta existente intacta.

## No hagas
- No dejes "Modalidad"/"Tipo" con los nombres cruzados actuales.
- No pidas el estado al crear la cita.
- No dejes "Eliminar" directo sin confirmación.
- No apliques la visibilidad por rol solo en el frontend.

Al terminar, resúmeme: cómo quedaron los enums de tipo/canal/estado, cómo manejas empalmes y
zona horaria, y dónde aplicaste las tres capas de la visibilidad por rol.
