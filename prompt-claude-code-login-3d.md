# Prompt para Claude Code — Rediseño del login con fondo 3D

> Pégalo en Claude Code **adjuntando `origen-login-3d.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system. La ruta ya existe: `/login`.
> Stack objetivo: React + Vite → usa **React Three Fiber** (no Three.js vanilla).

---

## Objetivo

Rediseñar la pantalla de login con un **fondo 3D decorativo, ligero y no bloqueante** que evoca
la marca (un anillo tipo "eclipse" de ORIGEN, no formas al azar), manteniendo el formulario
rápido y accesible. Usa `origen-login-3d.html` como referencia de estilo; **adáptalo al stack
real con R3F**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. Cómo funciona hoy el login/auth (dónde valida, cómo maneja errores).
2. **De dónde salen las "cuentas demo" que se muestran en pantalla** y si el bundle de
   producción las incluye.
3. Confirmar Vite + React y si ya hay `three`/R3F en el proyecto.

No asumas nada; si algo no está claro, pregúntame.

---

## Seguridad (prioridad 1)

La pantalla muestra **credenciales en texto plano** (`superadmin@demo.com · super123`, etc.).
- **No deben aparecer en producción.** Muéstralas solo cuando `import.meta.env.DEV` (o un flag
  explícito de entorno demo), nunca en el build de producción.
- Verifica además que esas cuentas demo no existan en la base de datos de producción. Si el seed
  las crea, que sea solo en desarrollo.
- No dejes credenciales hardcodeadas en el código que llegue al cliente.

Esto es más importante que el efecto 3D: hazlo primero.

---

## Fondo 3D con React Three Fiber (decorativo, NO bloqueante)

Instala `three`, `@react-three/fiber`, `@react-three/drei`. Reglas:

1. **Nunca bloquear el formulario.** El form debe renderizar y ser usable de inmediato, aunque
   el 3D tarde o falle. Carga el `<Canvas>` con **lazy/Suspense y code-splitting** para no
   inflar el bundle de la ruta de login ni retrasar el primer paint.
2. **Contenido con propósito, no relleno.** Geometría procedural que evoca el logo (anillo/eclipse
   + núcleo + puntos), sin modelos pesados que descargar. Nada de formas random.
3. **`prefers-reduced-motion`:** si el usuario lo pide, renderiza un frame estático (sin loop de
   animación).
4. **Móvil y equipos de gama baja:** reduce el número de partículas, limita `dpr` a `[1, 2]`, y
   si no hay WebGL o el equipo es débil, **fallback a un gradiente CSS** (el que ya está de fondo).
5. **Accesibilidad:** el canvas es decorativo → `aria-hidden`. El formulario conserva foco,
   navegación por teclado, `autocomplete` y labels.
6. Parallax sutil con el mouse; en touch, sin parallax.

R3F de referencia:
```jsx
<Canvas dpr={[1, 2]} camera={{ position: [0, 0, 9], fov: 55 }} aria-hidden>
  <Suspense fallback={null}>
    <fog attach="fog" args={[colorFog, 5, 20]} />
    <ambientLight intensity={0.5} />
    {/* anillo/eclipse de marca + núcleo + puntos; rotación en useFrame,
        pausada si prefers-reduced-motion */}
  </Suspense>
</Canvas>
```

---

## Formulario y marca

- Conserva el comportamiento real de login (validación, estados de error, loading del botón).
- Mostrar/ocultar contraseña.
- Tarjeta tipo glass sobre el 3D, con la marca ORIGEN.
- **El login es de tema oscuro fijo** (sin toggle). No agregues alternancia claro/oscuro en esta
  pantalla; el resto de la app sí conserva su toggle.

---

## Design system

Reutiliza los tokens del sistema para colores/tipografía. Documenta en `CLAUDE.md`, si no está,
la convención de "3D decorativo: lazy, no bloqueante, con fallback y respeto a reduced-motion".

---

## Criterios de aceptación

- [ ] Las cuentas demo **no** aparecen en el build de producción (solo en dev).
- [ ] El formulario es usable al instante; si el 3D falla o no hay WebGL, se ve el gradiente y el
      login funciona igual.
- [ ] El `<Canvas>` está code-split (no infla el bundle inicial de otras rutas).
- [ ] `prefers-reduced-motion` detiene la animación.
- [ ] En móvil se reduce carga (menos partículas, dpr acotado); sin parallax en touch.
- [ ] Canvas `aria-hidden`; formulario accesible por teclado.
- [ ] Login en **tema oscuro fijo** (sin toggle); ruta `/login` intacta.

## No hagas
- No muestres credenciales en producción ni las dejes hardcodeadas en el cliente.
- No bloquees el render del formulario detrás del 3D.
- No cargues modelos 3D pesados; usa geometría procedural.
- No dejes el 3D corriendo a pantalla completa sin acotar dpr / sin fallback.

Al terminar, resúmeme: cómo ocultaste las cuentas demo en producción, cómo cargaste el 3D sin
bloquear el formulario, y qué fallback aplicaste para móvil / sin WebGL / reduced-motion.
