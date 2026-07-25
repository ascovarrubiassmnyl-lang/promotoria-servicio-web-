# Prompt para Claude Code — Rediseño de la sección "Actividad"

> Pégalo en Claude Code **adjuntando `origen-actividad.html`** como referencia visual.
> Asume que ya existe el `CLAUDE.md` / design system creado en la tarea de "Pólizas";
> si no existe, créalo siguiendo los tokens del prototipo.

---

## Objetivo

Rediseñar la vista **Actividad** como una línea de tiempo estructurada, y de paso corregir
un problema de datos que hoy es visible en la interfaz. Usa `origen-actividad.html` como
referencia de estructura y estilo; **adáptalo al stack real del repo, no lo copies literal**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta en texto antes de implementar:
1. Cómo se generan/guardan hoy los eventos de actividad (¿tabla, campo `type`, se guarda
   texto ya renderizado o datos estructurados?).
2. Todos los valores distintos que existen hoy en el campo de tipo de evento.
3. Framework, router, estilos y sistema de auth/rol (igual que en la tarea de Pólizas).

**No asumas el modelo de datos. Si algo no está claro, pregúntame.**

---

## Problema de datos a corregir (prioridad 1)

En la UI actual conviven **dos representaciones del mismo evento**: el enum crudo
`POLIZA_CREADA` y el string formateado `Póliza creada`, contados como tipos distintos. Esto
indica que los eventos se están registrando de forma inconsistente (probablemente algunos como
enum y otros como texto ya renderizado).

Requerido:
1. Define **un único conjunto canónico de tipos de evento** (enum), por ejemplo:
   `poliza_creada`, `cita_agendada`, `cliente_nuevo`, `llamada`, `pago_registrado`.
2. **Normaliza los datos existentes**: migra `POLIZA_CREADA`, `Póliza creada` y cualquier
   variante al valor canónico. Propón una migración; **no borres datos**, solo unifica el tipo.
   Muéstrame la migración antes de correrla.
3. A partir de ahora, **loguea eventos estructurados**, no strings pre-renderizados. Un evento
   debe guardar: `type` (enum), `timestamp`, `actor` (asesor), y un `payload` con los datos
   relevantes (cliente, producto, ramo, prima, nota…). El texto visible se arma en el frontend
   desde esos campos, no se guarda ya formateado.

Si algún evento antiguo solo tiene el string y no los campos, consérvalo mostrando el texto
crudo como *fallback*, pero que los nuevos usen la estructura.

---

## Requisitos de UI

- Un componente reutilizable `ActivityTimeline` que renderiza desde eventos estructurados.
- **Un solo mapa `type → {label, color, icono}`** como fuente de verdad para el estilo (no
  colores/labels sueltos por evento). Reutiliza los tokens del design system.
- Agrupación por día (Hoy / Ayer / fecha), con eje vertical y marcador por tipo.
- Metadatos del evento como chips estructurados (cliente, producto·ramo, prima), no como
  título concatenado.
- **Filtros consolidados:** los chips de tipo *son* el filtro (con conteo, toggle). Elimina el
  dropdown redundante "Todos los tipos" o unifícalo con los chips — no dos mecanismos para lo
  mismo.
- **Coherencia de rango temporal:** el filtro y la navegación deben usar la misma unidad. Hoy
  filtras por semana pero navegas por mes; elige una (recomiendo navegación por semana) o deja
  un selector explícito semana/mes. No mezcles.
- Corrige la pluralización "evento(s)" → "1 evento" / "N eventos".
- Debe verse bien en modo claro y oscuro (el proto ya demuestra ambos con variables).

---

## Alcance por rol (misma regla que en Pólizas)

- El **asesor** ve **su propia** actividad.
- El **promotor** puede ver la actividad **de un asesor** al entrar a su perfil, reutilizando el
  mismo `ActivityTimeline` en modo consulta.
- Aplica la restricción en **las tres capas** (nav, guard de ruta, y **autorización en la capa
  de datos/API**) y **falla cerrado**: un asesor no debe poder consultar la actividad de otro
  ni por URL ni por API. Si no puedes garantizar la autorización en servidor, **detente y
  avísame** en lugar de resolverlo solo en el cliente.

---

## Design system

Actualiza `CLAUDE.md` (o `docs/design-system.md`) agregando: el enum canónico de tipos de
evento y su mapa de color/ícono, y el patrón de "loguear estructurado, renderizar en UI", para
que futuras sesiones y otras vistas lo respeten.

---

## Criterios de aceptación

- [ ] En los filtros ya **no** aparecen dos variantes del mismo tipo (`POLIZA_CREADA` vs
      `Póliza creada`); hay un solo `poliza_creada`.
- [ ] Migración de datos ejecutada sin pérdida; eventos antiguos siguen visibles.
- [ ] `ActivityTimeline` renderiza desde datos estructurados; el estilo por tipo sale de un
      único mapa.
- [ ] Un solo mecanismo de filtro por tipo; rango temporal coherente.
- [ ] Como **asesor**: no puedo ver la actividad de otro asesor por ningún medio (probado por
      URL directa y por petición a la API).
- [ ] Funciona en claro y oscuro; rutas existentes intactas.

## No hagas
- No guardes eventos como texto ya formateado.
- No dupliques el mapa de tipos por componente.
- No apliques la seguridad solo en el frontend.
- No borres eventos históricos durante la normalización.

Al terminar, resúmeme: qué valores de tipo existían y cómo los unificaste, cómo quedó el modelo
de evento estructurado, y dónde aplicaste cada capa del control de acceso.
