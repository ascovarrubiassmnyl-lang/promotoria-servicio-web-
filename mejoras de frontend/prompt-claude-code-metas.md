# Prompt para Claude Code — Rediseño de "Metas / Targets"

> Pégalo en Claude Code **adjuntando `origen-metas.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system y los patrones de las secciones anteriores.
> La ruta ya existe: `/targets`.

---

## Objetivo

Rediseñar la sección de metas para que soporte **dos niveles de objetivo** —meta de
**promotoría** (agregada del equipo) y metas **individuales** por asesor— y para que el avance
se lea contra el **tiempo transcurrido**, no solo como un porcentaje suelto. Usa
`origen-metas.html` como referencia; **adáptalo al stack real**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. Cómo se modelan hoy las metas (¿solo individuales? ¿existe una entidad de meta de equipo?).
2. De dónde salen los actuales ("ventas" y "prima real"): ¿qué cuenta como venta (póliza
   aprobada, pagada, activa)? Debe ser consistente con la sección de Pólizas.
3. Periodicidad: hoy es mensual. ¿Se requieren metas **trimestrales o anuales** también?
   Pregúntame antes de asumirlo.
4. Sistema de auth/rol.

No asumas nada; si algo no está claro, pregúntame.

---

## Nivel 1 — Meta de promotoría (nuevo, prioridad 1)

- Agrega una **meta de equipo** de primer nivel (ventas + prima) como entidad propia, con su
  avance agregado.
- Muéstrala con barra de progreso, %, y **estado según el ritmo** (ver abajo), no un % pelón.
- **Proyección de fin de mes**: `actual / fracción_de_periodo_transcurrida`, y qué % de la meta
  representa. Es la señal más útil para saber si el equipo va a llegar.
- **Reconciliación:** compara la **suma de las metas individuales** contra la meta de
  promotoría y muestra la diferencia ("por asignar" o "sobreasignado"). Ayuda al admin a repartir
  el número del equipo entre asesores.

## Nivel 2 — Metas individuales

- Barras de avance por asesor para ventas y prima, con **estado por ritmo** y ranking.
- **Edición en línea** de la meta por fila (además de o en lugar del formulario separado
  actual). Maneja bien el estado "Sin meta".

## Estado por ritmo (clave — prioridad 1)

El avance debe compararse con la fracción del periodo transcurrida:
- `ratio = (%avance / 100) / fracción_transcurrida`
- `%avance >= 100` → **Cumplida**; `ratio >= 1` → **En ritmo**; `ratio >= 0.8` → **Ligero
  atraso**; si no → **Atrasado**.
- Dibuja un **marcador de "ritmo"** en la barra en la posición de la fracción transcurrida, para
  ver de un vistazo si el avance va por delante o por detrás de donde debería.
(Documenta estos umbrales en el design system; son un parámetro, no un número mágico.)

---

## Alcance por rol (EXPLÍCITO)

- **Admin / Promotor:** gestiona la meta de promotoría y las metas de todos los asesores; ve el
  ranking y la reconciliación; puede asignar/editar.
- **Asesor:** ve **solo su propia** meta y su avance (y, si acaso, la meta de promotoría en modo
  lectura como contexto). **No** ve las metas ni los números individuales de otros asesores, ni
  puede asignar metas.
- Aplica la restricción en **tres capas** (nav/UI, guard de ruta, y **autorización en la capa de
  datos/API**) y **falla cerrado**: un asesor nunca recibe del servidor las metas o actuales de
  otro asesor. Si no puedes garantizarlo en servidor, **detente y avísame**.

---

## Design system

Actualiza `CLAUDE.md` con: el modelo de meta de dos niveles (promotoría + individual), los
umbrales de estado por ritmo, el cálculo de proyección, y la regla de visibilidad por rol de
esta sección.

---

## Criterios de aceptación

- [ ] Existe meta de promotoría (ventas + prima) con avance, proyección y estado por ritmo.
- [ ] Reconciliación suma-de-individuales vs meta de promotoría.
- [ ] Metas individuales con barras, estado por ritmo, ranking y edición en línea.
- [ ] El estado distingue "En ritmo / Ligero atraso / Atrasado / Cumplida" según tiempo
      transcurrido, con marcador de ritmo en la barra.
- [ ] "Ventas" y "prima real" salen de la misma fuente/definición que Pólizas.
- [ ] Como **asesor**: solo veo mi meta; no veo ni edito metas de otros (probado por URL y API).
- [ ] Como **admin**: gestiono meta de equipo e individuales.
- [ ] Funciona en claro y oscuro; ruta existente intacta.

## No hagas
- No dejes la sección solo con metas individuales; el nivel promotoría es requisito.
- No muestres el % de avance sin la referencia del tiempo transcurrido.
- No dejes que un asesor vea números de otros asesores (ni en frontend ni por API).
- No inventes una definición de "venta" distinta a la de Pólizas.

Al terminar, resúmeme: cómo modelaste la meta de promotoría vs. las individuales, cómo calculas
proyección y estado por ritmo, y dónde aplicaste las tres capas de la visibilidad por rol.
