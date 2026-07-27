# Prompt para Claude Code — Rediseño del Dashboard

> Pégalo en Claude Code **adjuntando `origen-dashboard.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system y la lógica de Metas (ritmo/proyección) y del pipeline
> de Clientes. Es la ruta raíz del panel.

---

## Objetivo

Rediseñar el dashboard para que **jerarquice la información y empuje a la acción**, en lugar de
mostrar un muro de contadores. Usa `origen-dashboard.html` como referencia; **adáptalo al stack
real**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. De dónde sale cada métrica del dashboard y con qué definición (sobre todo "ventas aprobadas",
   "comisiones" y las distintas "tasas de conversión").
2. Si el dashboard ya consume la meta de la promotoría y las metas individuales (de Metas).
3. Sistema de auth/rol.

No asumas nada; si algo no está claro, pregúntame.

---

## Correcciones (prioridad 1)

1. **Jerarquía, no muro de contadores.** Reduce a 4 KPIs hero con **contexto** (cada número con
   su comparación: % de la meta y/o vs. mes anterior, con barra y semáforo), y baja el resto a
   una franja compacta (estado de pólizas) y paneles secundarios.

2. **Elimina métricas duplicadas.** Hoy "tasa de conversión" aparece 3 veces (panel, dentro de
   Referidos y "conversión global") con definiciones distintas, y "comisiones" aparece 2 veces.
   Define **una sola** de cada una y colócala en un solo lugar. Documenta la definición.

3. **Números con referencia temporal.** Muestra el avance contra la **meta** con marcador de
   **ritmo** (fracción del mes transcurrida) y **proyección de fin de mes**, reutilizando la
   lógica de la sección Metas. Un "$62,000" debe leerse como "69% de la meta, atrasado al 87% del
   mes", no como cifra suelta.

4. **Panel "Requiere tu atención".** Convierte el dashboard en accionable: pólizas pendientes de
   pago (con monto), citas de hoy, clientes que necesitan seguimiento, bonos por ganar — cada uno
   enlazando a su sección.

5. **Embudo diagnóstico, no decorativo.** Muestra el conteo por etapa **y la conversión entre
   etapas**, resaltando el mayor cuello de botella (dónde se cae el pipeline). No una barra de
   colores plana.

6. **Sin emojis en UI** (usa SVG); estados vacíos útiles (es producción: en cero, guía al usuario
   —"agrega tu primer cliente/asesor"— en vez de mostrar solo ceros).

---

## Alcance por rol (EXPLÍCITO)

- **Promotor/Admin:** ve agregados del **equipo**, ranking de asesores, embudo global.
- **Asesor:** ve **sus propios** números (su meta, su embudo, sus pendientes); **no** ve el
  ranking ni datos de otros asesores, ni las secciones admin.
- Aplica la restricción en **tres capas** (nav/UI, guard de ruta, y **autorización en la capa de
  datos/API**) y **falla cerrado**. Un asesor nunca recibe agregados del equipo ni de otros
  asesores. Si no puedes garantizarlo en servidor, **detente y avísame**.

---

## Consistencia

Las cifras del dashboard deben salir de las **mismas fuentes** que Pólizas, Clientes, Citas y
Metas (misma definición de venta, prima, comisión, etapa). Nada de recalcular distinto aquí.

---

## Dirección de diseño (premium — importante)

El rediseño **no** es un grid de tarjetas con barritas de colores (eso se ve a plantilla). Sigue
esta dirección:

- **Un solo elemento firma:** un **anillo tipo "eclipse"** (el logo de ORIGEN convertido en
  dato) que muestra el avance de la meta de prima del mes, como punto focal del hero. Todo lo
  demás queda callado alrededor. Gasta la audacia visual solo ahí.
- **Tipografía con personalidad:** display en un serif fino (referencia: **Fraunces**) para el
  saludo, títulos de tarjeta y la cifra grande del anillo; datos y etiquetas en un sans neutro
  (**Inter**) con numerales tabulares. Nada de todo-Inter genérico.
- **Restricción de color:** fondo neutro, tarjetas limpias con hairline + sombra muy suave; el
  color solo aparece en el anillo, los chips de estado y los semáforos. Quita las barras de
  colores de cada tarjeta.
- **Espacio en blanco generoso** y jerarquía clara: padding amplio (28–32px en tarjetas), gaps
  de 24px, contenido con `max-width` para que respire; menos elementos por fila.
- **Copy del lado del usuario:** frases en lenguaje llano ("Vas por debajo del ritmo; al paso
  actual cerrarías en \$X") en vez de cifras mudas. Estados vacíos que invitan a actuar.
- Piso de calidad sin anunciarlo: responsive a móvil, foco de teclado visible, `prefers-
  reduced-motion` respetado (el anillo se anima al cargar, pero no si el usuario lo desactiva).

Íconos SVG consistentes (sin emojis), `cursor-pointer` y hover con transición 150–300ms.
Reutiliza los tokens del sistema; funciona en claro y oscuro.

---

## Criterios de aceptación

- [ ] 4 KPIs hero con comparación (meta / periodo), no 10 contadores planos.
- [ ] Una sola definición de "tasa de conversión" y una sola de "comisiones".
- [ ] Avance vs. meta con marcador de ritmo y proyección (misma lógica que Metas).
- [ ] Panel "Requiere atención" accionable con enlaces a las secciones.
- [ ] Embudo con conversión entre etapas y cuello de botella resaltado.
- [ ] Sin emojis; estados vacíos que guían.
- [ ] Como **asesor**: solo veo mis números; no veo ranking ni datos de otros (URL y API).
- [ ] Las cifras coinciden con Pólizas/Clientes/Metas.
- [ ] Funciona en claro y oscuro.

## No hagas
- No repitas la misma métrica en varios lugares con definiciones distintas.
- No muestres números sin referencia (meta / periodo / tendencia).
- No dejes el embudo como barra decorativa.
- No uses emojis como iconos.
- No apliques la restricción de rol solo en el frontend.

Al terminar, resúmeme: qué métricas consolidaste y su definición, cómo integraste meta/ritmo/
proyección, cómo quedó el embudo diagnóstico, y dónde aplicaste las tres capas de la restricción
por rol.
