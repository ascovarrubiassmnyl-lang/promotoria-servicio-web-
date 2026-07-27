# Prompt para Claude Code — Rediseño de la ficha de cliente + reglas de visibilidad por rol

> Pégalo en Claude Code **adjuntando `origen-ficha-cliente.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system y los componentes de Pólizas, Actividad y Clientes.
> La ruta ya existe: `/clientes/:id`.

---

## Objetivo

Rediseñar la **ficha de cliente** (vista de detalle en `/clientes/:id`) conservando todas las
secciones que ya existen, corrigiendo problemas de datos y jerarquía, y dejando explícitas las
reglas de visibilidad por rol. Usa `origen-ficha-cliente.html` como referencia de estructura y
estilo; **adáptalo al stack real, no lo copies literal**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. El componente/página actual de `/clientes/:id` y de qué modelo saca cada sección.
2. Cómo se modelan hoy los estados de póliza: **hay dos campos** en la UI, "Póliza"
   (Activa/Inactiva) y "Estado" (Aprobada / Pendiente de pagar). Dime si uno se deriva del otro
   o si son independientes.
3. Sistema de auth/rol y cómo se obtiene el rol del usuario.

No asumas nada; si algo no está claro, pregúntame.

---

## Secciones a conservar (ya existen, no las quites)

Contacto (Teléfono, Email, RFC, Dirección, Fuente), Producto de interés, Notas generales,
Recordatorios, Pólizas (tabla), Próximas citas (con modalidad Telefónica/Presencial, promotor
acompañante, fecha, lugar y estatus), Archivos del cliente (subida de documentos) y Referidos
(referido por / referidos generados).

---

## Correcciones (prioridad 1)

1. **Estado de póliza duplicado.** Consolida "Póliza (Activa/Inactiva)" y "Estado (Aprobada /
   Pendiente de pagar)" en una sola columna con estado primario + subestado, en lugar de dos
   columnas que hoy se mueven juntas. Si de verdad pueden divergir, documenta cuándo; si una se
   deriva de la otra, no la muestres como columna aparte. Confírmame el modelo antes de cambiarlo.

2. **Comisión coloreada por estado real.** Verde solo si la póliza está aprobada/activa; si está
   pendiente de pago, tono neutro. Hoy se pinta verde aun estando pendiente.

3. **Acción destructiva.** Quita el botón rojo grande "Eliminar" del cliente y el "Eliminar"
   inline de cada póliza. Muévelos a un menú, con **confirmación** y **borrado lógico (archivar)**
   por defecto; un cliente tiene pólizas, citas y referidos que no deben perderse. La acción
   primaria de la cabecera debe ser editar / cambiar etapa, no borrar.

4. **Selector de etapa con etiqueta + stepper.** El selector actual ("Cita") va suelto y sin
   rótulo. Rotúlalo ("Etapa del pipeline") y agrega un **stepper** que muestre la posición en el
   embudo (usa el mismo enum ordenado de etapas del módulo de Clientes).

5. **Jerarquía / estados vacíos.** No dejes que "Notas" y "Recordatorios" vacías ocupen la parte
   superior. Pon Contacto + resumen en un riel izquierdo y las secciones con contenido (Pólizas,
   Citas) como columna principal; Notas/Recordatorios van más abajo y compactas cuando están
   vacías.

Debe verse bien en claro y oscuro.

---

## Reglas de visibilidad por rol (EXPLÍCITO — requisito del usuario)

La aplicación tiene dos experiencias y **cada una es visible solo para su rol**:

- **Vista de PROMOTOR/ADMIN:** el roster de asesores, la consulta de carteras de otros
  asesores, y las secciones de administración (Asesores, Metas, Configuración) se muestran
  **únicamente** a usuarios cuyo rol sea `promotor`/`admin`. Un `asesor` **no** debe ver estas
  vistas ni sus enlaces.
- **Vista de ASESOR:** un `asesor` ve **solo su propia** información (sus clientes, sus pólizas,
  su actividad). No ve datos de otros asesores ni el roster.
- **Ficha de cliente (esta pantalla):** es un componente compartido, pero **con alcance de
  datos por rol**. Un `asesor` solo puede abrir la ficha de **sus** clientes. Un `promotor`
  puede abrir la ficha de cualquier cliente al entrar desde el perfil del asesor
  correspondiente, en modo consulta.

Implementa la restricción en **tres capas** y **falla cerrado** (denegar por defecto):
1. **Navegación:** los enlaces/menús de cada vista se renderizan solo para el rol autorizado.
2. **Guard de ruta:** entrar por URL directa a una vista o ficha no autorizada
   (p. ej. un `asesor` abriendo `/clientes/:id` de un cliente ajeno, o cualquier ruta de
   promotor) redirige/deniega.
3. **Autorización en la capa de datos/API (la crítica):** el servidor valida el rol y la
   propiedad del recurso en cada consulta; un `asesor` nunca recibe datos de un cliente o
   asesor que no le corresponde, aunque manipule el `id` en la petición.

**No implementes la restricción solo en el frontend.** Si no puedes garantizar la autorización
en el servidor con el stack actual, **detente y avísame**.

---

## Design system

Actualiza `CLAUDE.md` (o `docs/design-system.md`) con: la consolidación del estado de póliza
(estado + subestado), la regla de color de comisión por estado, el patrón de acción destructiva
(menú + confirmación + soft delete) y, de forma explícita, **la matriz de visibilidad por rol**
(qué vistas ve cada rol y las tres capas de control de acceso), para que futuras vistas la
respeten sin re-explicarla.

---

## Criterios de aceptación

- [ ] La ficha conserva todas las secciones actuales.
- [ ] Una sola columna de estado de póliza (primario + subestado); comisión en verde solo si
      aprobada/activa.
- [ ] Cliente y pólizas sin "Eliminar" directo: menú + confirmación + soft delete.
- [ ] Selector de etapa rotulado + stepper.
- [ ] Notas/Recordatorios vacías no dominan la parte superior.
- [ ] Como **asesor**: no aparecen vistas ni enlaces de promotor; no puedo abrir la ficha de un
      cliente ajeno por URL ni por API.
- [ ] Como **promotor**: veo las vistas de administración y puedo consultar fichas de clientes
      de cualquier asesor.
- [ ] Funciona en claro y oscuro; rutas existentes intactas.

## No hagas
- No muestres dos columnas de estado redundantes.
- No pintes de verde comisiones pendientes.
- No dejes borrado directo/físico a un clic.
- No apliques la visibilidad por rol solo en el frontend.
- No dupliques componentes ya creados (Pólizas, Actividad); reutilízalos filtrados por cliente.

Al terminar, resúmeme: cómo consolidaste el estado de póliza, cómo quedó el soft delete, y —
punto por punto— dónde aplicaste las tres capas de la visibilidad por rol para las vistas de
promotor y de asesor.
