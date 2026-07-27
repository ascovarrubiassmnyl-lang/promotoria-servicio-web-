# Prompt para Claude Code — Rediseño de la sección "Clientes" (CRM)

> Pégalo en Claude Code **adjuntando `origen-clientes.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system y los componentes creados en las tareas de
> Pólizas y Actividad (PolicyList, ActivityTimeline, mapa de tipos de evento).

---

## Objetivo

Rediseñar la sección **Clientes** para que funcione como un CRM real: una lista accionable y
un **expediente de cliente** (vista de detalle), no solo una tabla. Usa `origen-clientes.html`
como referencia de estructura y estilo, **adaptándolo al stack real del repo**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta en texto antes de implementar:
1. Cómo se modela hoy el "estado" del cliente (¿un solo campo? ¿enum? ¿qué valores existen?).
2. Cómo se relacionan cliente ↔ pólizas ↔ citas ↔ actividad ↔ asesor.
3. Framework, router, estilos y sistema de auth/rol.
4. Cómo funciona hoy el botón "Eliminar" (¿borra en duro? ¿hay `deleted_at` / soft delete?).

**No asumas nada. Si algo no está claro, pregúntame.**

---

## Problemas de modelo a corregir (prioridad 1)

1. **"Estado" es una etapa de embudo, trátala como tal.** Define un **enum ordenado** de
   etapas del pipeline (p. ej. `prospecto → cita → propuesta → entrega → postventa`) con un
   único mapa `etapa → {label, color, orden}` como fuente de verdad. El color debe encodear
   progreso, no ser arbitrario. Muestra la posición en el embudo (indicador de pasos), no solo
   una píldora plana.

2. **"Necesita seguimiento" NO es una etapa, es una bandera.** Sepárala del campo de etapa: un
   cliente puede estar en cualquier etapa **y** estar marcado como "necesita seguimiento" a la
   vez. Modélala como un flag/booleano o un campo aparte, no como un valor más del enum de
   etapa. Si hoy está mezclado, propón la migración (sin perder datos) y muéstramela antes de
   correrla.

3. **Revisa la coherencia etapa ↔ ventas.** Hay al menos un cliente con ventas > 0 cuya etapa
   sigue en una fase temprana ("Cita"). Verifica si la etapa debería avanzar automáticamente al
   registrar una venta/póliza, o si es intencional. Repórtame qué encontraste; no cambies la
   lógica de negocio sin confirmarlo conmigo.

---

## Seguridad de datos: acción destructiva (prioridad 1)

Hoy la única acción por fila es **"Eliminar"** en rojo, a un clic. Cámbialo:
- Mueve las acciones a un **menú por fila** (Ver expediente, Editar, Agendar cita, y al final
  Archivar/Eliminar).
- Eliminar debe pedir **confirmación explícita** y ser **borrado lógico (soft delete)** por
  defecto — un cliente tiene pólizas, citas e historial que no deben desaparecer. Si de verdad
  se requiere borrado físico, que sea una acción separada y restringida.
- La acción primaria de la fila debe ser **ver el expediente**, no borrar.

---

## Vista de detalle (expediente de cliente) — nueva

Al hacer clic en el nombre, abrir el expediente con:
- Encabezado: nombre, contacto, fuente, asesor asignado, bandera de seguimiento.
- **Stepper de etapa** del pipeline + botón "Avanzar etapa".
- Secciones reutilizando componentes existentes: **Pólizas** (usa `PolicyList`/tarjetas del
  módulo de Pólizas), **Próximas citas**, **Actividad reciente** (usa `ActivityTimeline` del
  módulo de Actividad, filtrado a este cliente) y **Notas**.
- No dupliques componentes: reutiliza los de las otras secciones filtrados por cliente.

---

## Lista: mejoras

- Mantén búsqueda (nombre, email, teléfono, RFC) y filtro por asesor.
- Convierte los estados en una **fila de chips de pipeline con conteo** (clic = filtra por
  etapa), más un chip de "Necesita seguimiento".
- Agrega columna **"Próxima acción"** (fecha + tipo), resaltando en rojo lo vencido. Es la
  información más útil para trabajar la cartera. Requiere que el modelo guarde la próxima
  tarea/seguimiento; si hoy no existe ese dato, dímelo y lo definimos antes de implementarlo
  (no lo inventes en el frontend).
- Debe verse bien en claro y oscuro (el proto lo demuestra).

---

## Alcance por rol (misma regla que Pólizas y Actividad)

- **Asesor:** ve solo **sus** clientes. Sin columna ni filtro de asesor.
- **Admin / Promotor:** ve todos los clientes, con columna y filtro de asesor.
- Aplica la restricción en **tres capas** (nav, guard de ruta, y **autorización en la capa de
  datos/API**) y **falla cerrado**: un asesor no debe poder consultar el expediente de un
  cliente que no le pertenece, ni por URL ni por API. Si no puedes garantizar la autorización
  en servidor, **detente y avísame** en lugar de resolverlo solo en el cliente.

---

## Design system

Actualiza `CLAUDE.md` (o `docs/design-system.md`) con: el enum ordenado de etapas del pipeline
y su mapa de color/orden, la convención de "bandera de seguimiento separada de la etapa", y el
patrón de acción destructiva (menú + confirmación + soft delete).

---

## Criterios de aceptación

- [ ] "Estado" es un enum ordenado de etapas con color por progreso e indicador de posición.
- [ ] "Necesita seguimiento" es una bandera independiente de la etapa; un cliente puede tener
      ambas.
- [ ] Ninguna fila expone "Eliminar" directo; hay menú, confirmación y soft delete.
- [ ] Existe la vista de expediente reutilizando PolicyList y ActivityTimeline.
- [ ] Como **asesor**: no puedo ver clientes de otro asesor por ningún medio (probado por URL
      y por API).
- [ ] Migraciones (si aplican) ejecutadas sin pérdida de datos.
- [ ] Funciona en claro y oscuro; rutas existentes intactas.

## No hagas
- No conviertas "necesita seguimiento" en un valor del enum de etapa.
- No hagas borrado físico por defecto ni lo dejes a un clic.
- No dupliques los componentes de Pólizas/Actividad; reutilízalos.
- No inventes datos de "próxima acción" en el frontend si el modelo no los tiene.
- No apliques la seguridad solo en el cliente.

Al terminar, resúmeme: cómo quedó el modelo de etapa + bandera, cómo migraste los datos, cómo
implementaste el soft delete, y dónde aplicaste cada capa del control de acceso.
