# Prompt para Claude Code — Versión móvil del Panel

> Adjunta `origen-dashboard-movil.html` (referencia móvil) junto con `origen-dashboard.html`
> (escritorio). No es una pantalla aparte: es el **mismo dashboard, responsive**.

## Objetivo
Que el Panel funcione bien en celular sin duplicar código: una sola implementación responsive.

## Reglas
1. **Navegación adaptativa.** En escritorio, el sidebar lateral. En móvil (≤ ~768px), ocúltalo y
   usa una **barra de pestañas inferior** (Panel, Clientes, Citas, Pólizas, Más) con zonas
   táctiles ≥ 44px. Deja `padding-bottom` en el contenido para no quedar tapado por la barra, y
   respeta `env(safe-area-inset-bottom)`.
2. **Una columna en móvil.** El hero (anillo) se centra; los stats de apoyo pasan a una fila de 3
   tarjetitas; el resto de tarjetas se apilan a ancho completo. El "Estado de pólizas" pasa de 4
   en línea a rejilla 2×2.
3. **Mismo lenguaje visual** (anillo eclipse, Fraunces/Inter, restricción de color) y los **mismos
   componentes/datos** que la versión de escritorio; solo cambia el layout por breakpoints. No
   crees un dashboard móvil paralelo.
4. **Cuerpo legible** (≥16px), sin scroll horizontal, foco de teclado visible, `prefers-reduced-
   motion` respetado. Header pegajoso compacto.
5. Encabezado móvil: saludo + contexto en una línea, toggle de tema accesible; el selector de
   periodo puede colapsarse a un control compacto.

## Aceptación
- [ ] Un solo componente de dashboard, responsive (no dos).
- [ ] Sidebar en escritorio / barra inferior en móvil, con áreas táctiles ≥44px y safe-area.
- [ ] Sin scroll horizontal a 375px; cuerpo ≥16px; foco visible; reduced-motion respetado.
- [ ] Mismo anillo, tipografía y datos que escritorio.

Al terminar, dime en qué breakpoint cambia la navegación y cómo evitaste duplicar la lógica.
