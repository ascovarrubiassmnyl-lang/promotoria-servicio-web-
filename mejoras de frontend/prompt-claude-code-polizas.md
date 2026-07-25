# Prompt para Claude Code — Integrar rediseño de "Pólizas" con acceso por rol

> Pégalo en Claude Code **adjuntando el archivo `origen-polizas.html`** como referencia.
> Está escrito para que Claude Code inspeccione tu stack real antes de tocar nada,
> en lugar de asumir framework, auth o rutas.

---

## Objetivo

Integrar el rediseño de la sección **Pólizas** al código de esta aplicación, reutilizando
los componentes entre dos roles (asesor y promotor), y dejar documentado el sistema de
diseño para que futuras sesiones y otras vistas del panel lo repliquen sin adivinar.

Tienes como referencia visual el archivo `origen-polizas.html` (prototipo estático). **Es una
referencia de estructura y estilo, no código a copiar literalmente**: adáptalo al framework,
router, sistema de estado y convenciones que ya existan en este repositorio.

---

## Paso 0 — Explora antes de escribir código (obligatorio)

Antes de cualquier cambio, inspecciona el repo y **repórtame en texto** lo que encontraste:

1. Framework y build (por el puerto 5173 parece Vite — confirma si es React, Vue u otro).
2. Sistema de rutas y cómo se protegen rutas hoy (guards, layouts, middleware).
3. Cómo se maneja **autenticación y el rol del usuario** (¿JWT propio, Supabase, Firebase,
   sesión en backend?). Identifica **dónde vive el `role` del usuario** y si hay un backend/API.
4. Sistema de estilos (CSS Modules, Tailwind, styled-components, tokens existentes).
5. Componentes reutilizables ya presentes (tabla, card, badge/pill, botón, avatar).

**No asumas nada de lo anterior. Si algo no queda claro en el código, pregúntame antes de
implementar.** Especialmente: dime qué mecanismo de auth usas y desde dónde se obtiene el rol,
porque de eso depende cómo aplico la restricción de acceso.

---

## Requisitos funcionales

### Arquitectura de componentes (reutilización)
- `PolicyList` y `PolicyDetail` son **componentes únicos y compartidos** por ambos roles.
- El **asesor** entra directo a su propia `PolicyList` (solo sus pólizas).
- El **promotor** entra por un **roster de asesores** → al seleccionar un asesor ve la
  *misma* `PolicyList` y `PolicyDetail`, en modo consulta (sin acciones de edición).
- No dupliques la lista/detalle por rol. Una sola implementación, comportamiento condicionado
  por rol y por "scope" (de quién son las pólizas que se muestran).

### Contenido del detalle de póliza
Producto/ramo, aseguradora, contratante y edad, suma asegurada, prima + forma de pago,
fecha de firma, vigencia, próximo pago, comisión, coberturas (incluyendo adicionales para
Vida y deducible/coaseguro para Gastos Médicos), beneficiarios con porcentaje, calendario de
recibos y datos administrativos. Debe ser **data-driven** desde el modelo de póliza real,
no valores fijos.

### Reglas de negocio a respetar en la UI
- La comisión se muestra en color de "ganada" **solo si la póliza está aprobada/pagada**;
  si está pendiente, se muestra en tono neutro.
- "Ganado" y "en pipeline" (pendiente) **nunca se suman en una sola cifra**. Son tarjetas
  separadas.
- Incluye fila de totales en la tabla.

---

## Control de acceso por rol (CRÍTICO — no solo UI)

La vista de promotor (roster de asesores y consulta de carteras ajenas) debe estar disponible
**únicamente para usuarios con rol `promotor`**. Un usuario con rol `asesor` **no debe poder
verla ni acceder a datos de otros asesores por ningún medio**.

Impleméntalo en **tres capas** y **falla cerrado** (denegar por defecto):

1. **Navegación:** el ítem de menú "Equipo" y las rutas del promotor solo se renderizan si
   `role === 'promotor'`.
2. **Guard de ruta:** si un `asesor` navega directamente a la URL del roster o de la cartera
   de otro asesor (p. ej. `/equipo` o `/equipo/:advisorId`), se le redirige/deniega. Ocultar
   el menú **no basta**.
3. **Autorización en la capa de datos / API (la más importante):** cualquier endpoint o query
   que devuelva pólizas debe verificar en el servidor que:
   - un `asesor` solo puede obtener **sus propias** pólizas (filtrado por su `advisorId`, no
     por un parámetro que el cliente pueda manipular);
   - solo un `promotor` puede consultar la cartera de un `advisorId` arbitrario.
   Si esta app no tiene backend propio (p. ej. usa RLS de Supabase), aplica la regla ahí
   (Row Level Security / policies) y explícame cómo la dejaste.

**No implementes la restricción solo en el frontend.** Si la autorización de datos no se puede
garantizar en servidor con el stack actual, **detente y avísame** antes de continuar; no la
simules en el cliente.

---

## Sistema de diseño y persistencia entre sesiones

Para que este lenguaje visual se replique en las demás vistas del panel (Dashboard, Clientes,
Citas, Actividad) y en futuras sesiones tuyas (que no conservan memoria):

1. Extrae la paleta, tipografía, radios, espaciados y estilos de los componentes base
   (card, tabla, pill/badge, botón, KPI, avatar) del prototipo hacia el sistema de tokens/estilos
   que ya use el proyecto. No dejes valores hex sueltos repartidos por los componentes.
2. Crea o actualiza un archivo **`CLAUDE.md`** en la raíz (o `docs/design-system.md` referenciado
   desde `CLAUDE.md`) que documente:
   - los tokens de color/tipografía/espaciado y cuándo usar cada uno;
   - los componentes reutilizables y su API (props);
   - las convenciones de estado (colores de aprobada/pendiente, ganado vs. pipeline);
   - la regla de acceso por rol como convención del proyecto.
   Objetivo: que una sesión futura pueda rediseñar otra vista siguiendo este documento sin que
   yo tenga que re-explicar el estilo.

---

## Criterios de aceptación (verifícalos antes de darme por terminado)

- [ ] `PolicyList` y `PolicyDetail` existen una sola vez y se usan en ambos roles.
- [ ] Logueado como **asesor**: no aparece "Equipo"; navegar manualmente a `/equipo` (o la ruta
      equivalente) redirige/deniega; una petición a la API por pólizas de otro asesor es
      rechazada por el servidor.
- [ ] Logueado como **promotor**: veo el roster, entro a un asesor y veo su cartera en modo
      consulta.
- [ ] Los estilos salen de tokens centralizados; no hay hex duplicados en componentes.
- [ ] `CLAUDE.md` (o `docs/design-system.md`) creado/actualizado.
- [ ] Las rutas y vistas existentes siguen funcionando (no rompiste nada).

## No hagas
- No hardcodees datos de ejemplo en producción (los del prototipo son ficticios).
- No apliques la seguridad solo en el cliente.
- No reescribas partes del panel fuera del alcance de "Pólizas" sin avisarme.
- No introduzcas librerías nuevas si el proyecto ya resuelve eso con lo que tiene.

Cuando termines, resúmeme: qué stack detectaste, dónde aplicaste cada capa de la restricción
de acceso, y qué archivos tocaste.
