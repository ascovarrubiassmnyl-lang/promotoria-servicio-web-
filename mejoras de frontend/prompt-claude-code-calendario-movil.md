# Prompt para Claude Code — Rediseño móvil de la sección Calendario

> Pégalo tal cual. Adjunta también `calendario-movil-origen.html` como referencia visual.

---

## Contexto

Trabajo en el panel de Origen Asesores (promotoría SMNYL). La sección **Citas / Calendario** funciona bien en escritorio, pero al implementar responsive:

1. El layout de escritorio se degradó respecto a la versión anterior (celdas más angostas, cuadrícula apretada, una sola cita visible por casilla).
2. En móvil, la cuadrícula semanal de 7 columnas × N horas es inusable: celdas de ~45px de ancho, scroll vertical excesivo, una cita ocupa toda la casilla del día.

**Objetivo:** restaurar el escritorio a su estado previo y construir una experiencia móvil distinta, no una versión encogida de la semanal.

---

## Paso 0 — Antes de escribir código (no lo omitas)

1. Localiza los archivos de la vista de calendario y los estilos asociados.
2. Corre `git log --oneline -- <ruta del calendario>` y `git diff` de los commits donde se introdujo el responsive.
3. **Muéstrame el diff antes de revertir nada.** Quiero ver exactamente qué reglas cambiaron el layout de escritorio: si fue CSS global sin media query, cambio de `grid-template-columns` fijo a `minmax()/fr`, `flex-wrap` nuevo, o alturas de fila en `vh` en vez de `px`.
4. Propón la reversión mínima que devuelva el escritorio a su comportamiento anterior **sin** borrar el trabajo móvil.

Regla de oro para el resto de la tarea: **todo estilo o comportamiento nuevo va detrás de `@media (max-width: 768px)` o de un hook `useIsMobile()`. Ninguna regla nueva puede tocar el árbol de escritorio.** Si algo debe compartirse, extráelo a un token o componente común y avísame explícitamente.

---

## Paso 1 — Cambio de paradigma en móvil

Elimina la cuadrícula semanal de 7 columnas en viewports < 768px. Sustitúyela por:

**Segmented control: `Día · Agenda · Mes`** (en escritorio se mantiene `Mes · Semana · Agenda`).
Vista por defecto en móvil: **Día**.

### Vista Día
- **Tira de días horizontal** bajo el header: 7 chips (día de semana + número + hasta 3 puntos de color según canal). El día seleccionado en azul sólido, hoy con número azul. Swipe horizontal cambia de semana.
- **Timeline de una sola columna**: etiqueta de hora a la izquierda (46px, `border-right` sutil), pista de eventos ocupando el resto del ancho. Altura por hora: **56px**.
- **Rango dinámico, no 8am–8pm fijo**: renderiza desde 1 h antes de la primera cita hasta 1 h después de la última, acotado a 7:00–21:00. Los bloques de horas sin citas se colapsan en una fila de 34px que dice `Sin citas · 11am – 4pm` con un botón "Mostrar" que los expande. Esto es lo que elimina el scroll excesivo.
- **Tarjetas de cita a ancho completo**, altura proporcional a la duración con mínimo 38px. Si la altura resultante es < 46px, el layout interno pasa a horizontal (nombre + hora en una línea) en vez de apilarse y cortarse.
- Borde izquierdo de 3px y fondo tenue según canal: telefónica `#2563EB`, presencial `#0EA47A`, videollamada `#8B5CF6`.
- Solapamientos: si dos citas se cruzan, divide el ancho en 2 columnas (máximo 2; a partir de la tercera, la segunda tarjeta muestra `+N más`).
- Línea de "ahora" roja si el día seleccionado es hoy.
- Al abrir el día, `scrollIntoView` a la primera cita.
- Estado vacío: `Sin citas este día` + botón `Agendar para este día`.

### Vista Agenda
Lista cronológica agrupada por día, sin cuadrícula. Encabezado de día con número grande + abreviatura + línea divisoria + conteo. Cada cita es una card: hora, nombre, chips de canal y estado, chevron a la derecha. Los días sin citas simplemente no aparecen.

### Vista Mes
Cuadrícula 7×5 de celdas cuadradas (`aspect-ratio: 1`) con número y hasta 3 puntos de color. Al tocar un día, se listan sus citas debajo del calendario con el mismo componente de card de Agenda.

---

## Paso 2 — Cromo de la interfaz (recuperar espacio vertical)

- Los dos `<select>` de canal y estado se sustituyen por **un solo botón `Filtros`** que abre un bottom sheet con chips seleccionables. Muestra un punto indicador cuando hay filtros activos y el conteo resultante en el botón de aplicar.
- El botón `+ Agendar cita` a ancho completo pasa a **FAB** flotante (esquina inferior derecha, sobre la tab bar).
- La leyenda de colores (Telefónica / Presencial / Videollamada) se mueve al bottom sheet de filtros; en el calendario los colores ya se explican solos con los chips de cada cita.
- Header: `‹ Hoy ›` + rango de fechas + `Filtros` en una sola fila de 32px de alto.
- Header y tira de días **sticky**; solo scrollea el contenido.

---

## Paso 3 — Calidad

- Áreas táctiles mínimas de 44×44px.
- `prefers-reduced-motion` respetado en las transiciones del bottom sheet.
- Foco visible por teclado en el segmented control y en las cards.
- Modo oscuro: usa los tokens existentes del proyecto, no colores nuevos hardcodeados.
- Sin dependencias nuevas. Si el calendario actual usa una librería (FullCalendar, react-big-calendar, etc.), **no la uses en móvil** — renderiza el componente móvil propio; esas librerías son la causa probable del layout apretado.

---

## Entregables

1. Diff del Paso 0 con el diagnóstico de la regresión en escritorio, **antes** de tocar nada.
2. Componente(s) móvil(es) nuevos, aislados por media query / hook.
3. Confirmación explícita de qué archivos compartidos tocaste y por qué.
4. Capturas o descripción del resultado en 390px y en 1440px para verificar que escritorio quedó idéntico al anterior.

Trabaja en una rama aparte. Si algo del rediseño choca con la arquitectura actual, dímelo antes de improvisar una solución.
