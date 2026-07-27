# Prompt para Claude Code — Rediseño de "Configuración" (permisos y notificaciones)

> Pégalo en Claude Code **adjuntando `origen-configuracion.html`** como referencia visual.
> Reutiliza el `CLAUDE.md` / design system. La ruta ya existe: `/configuracion`.
> **Esta pantalla es el plano de control de acceso: la corrección de fondo importa más que el
> diseño.**

---

## Objetivo

Rediseñar Configuración para que el control de acceso sea **por rol (RBAC)** con **excepciones
por usuario** claras, **enforced en el servidor**, con **salvaguardas** y **bitácora**. Usa
`origen-configuracion.html` como referencia; **adáptalo al stack real**.

---

## Paso 0 — Explora antes de tocar código (obligatorio)

Reporta antes de implementar:
1. Cómo se guardan hoy los permisos: ¿una casilla por usuario y sección (ACL plano), o hay
   roles? ¿Dónde vive el rol de cada usuario?
2. **Lo más importante:** ¿esas casillas **se enforcan en el servidor**, o son solo estado de
   UI? Si un asesor con la casilla "Configuración" marcada realmente puede llegar a `/configuracion`
   por API, hay un hueco de seguridad hoy.
3. El listado de secciones/permisos que existen y sus nombres.

No asumas nada; si algo no está claro, pregúntame.

---

## Problemas a corregir (prioridad 1)

1. **RBAC primero, overrides después.** El modelo debe ser: cada **rol** define su acceso base
   a cada sección; los permisos **por usuario** son solo **excepciones** sobre ese rol, no el
   mecanismo principal. Hoy está invertido (casilla por persona como norma), lo que no escala y
   no propaga cambios de rol.

2. **Estados explícitos, no una casilla binaria.** Un ✓ hoy significa a la vez "concedido" y
   "heredado del rol", y no se distinguen. Cada celda por usuario debe tener **tres estados
   visibles**: *Hereda del rol* (mostrando si el rol permite o bloquea), *Permitir (excepción)*,
   *Bloquear (excepción)*. Y un "Restablecer" que quita la excepción y vuelve a heredar.

3. **Enforcement en servidor (no negociable).** Cada permiso de esta pantalla debe corresponder
   a una política **verificada en el backend/capa de datos**. La matriz por sí sola no es
   seguridad. El acceso efectivo = override del usuario si existe, si no, el del rol; y **falla
   cerrado** (si no hay política, se deniega). Si hoy no se enforca en servidor, dímelo antes de
   seguir; no lo dejes como control solo de frontend.

4. **Salvaguardas contra bloqueo/escalación.**
   - Nadie puede quitarse a sí mismo el acceso a **Configuración** ni degradar su propio
     Súper Admin (anti-lockout). Deshabilita esas celdas para el usuario actual.
   - El rol **Súper Admin** no se edita (acceso total, bloqueado).
   - Confirmación al cambiar permisos sensibles (Configuración, Asesores).
   - Recomendación: la edición de permisos (Configuración) debería ser **solo Súper Admin**, no
     Admin/Promotor. Confírmame si lo restrinjo así.

5. **Bitácora de cambios.** Registra **quién** cambió **qué** permiso/rol, **cuándo** y sobre
   **quién**, y muéstrala en una pestaña. En control de acceso es indispensable.

6. **Taxonomía.** La columna dice "VENTAS" pero el módulo se llama "Pólizas". Unifica el nombre
   con el resto del sistema.

---

## Notificaciones (respetar el panel existente)

**Ya existe** un panel de **notificaciones push del navegador (Web Push)** que funciona y cuyo
estilo el usuario quiere conservar. **No lo reemplaces por preferencias genéricas por evento.**
Solo armonízalo con el design system (tokens, modo oscuro) y mantén su contenido:
- Tres tarjetas de estado: **Soporte** (soportado/no soportado), **Permiso**
  (concedido/denegado/pendiente), **Suscripción** (activa/inactiva).
- Acciones: **Enviar prueba** y **Desactivar** cuando está activa; **Activar notificaciones**
  cuando no lo está. Los botones deben **reflejar el estado real** (no mostrar "Activar" si ya
  está activa).
- Nota de "Cómo funciona": el job (cada 60 s) revisa notas tipo `RECORDATORIO` con `fechaAviso`
  vencida y sin enviar, manda la push al asesor dueño de la nota y la marca como enviada.
- Sugerencia menor (no obligatoria): ese texto expone nombres de campos internos; si el panel lo
  ven promotores/asesores y no solo devs, conviene redactarlo en lenguaje de usuario. Consúltalo
  con el usuario antes de cambiarlo, ya que le gusta como está.

---

## Coherencia con el resto del sistema

Los permisos definidos aquí deben ser **la misma fuente de verdad** que usa el control de acceso
de todas las secciones (Pólizas, Clientes, Actividad, Metas, etc.). No dupliques la lógica de
"qué ve cada rol" en cada pantalla; que todas consulten este modelo. Esto cierra el trabajo de
las secciones anteriores: la matriz de visibilidad por rol que documentamos vive aquí.

---

## Design system

Actualiza `CLAUDE.md` con: el modelo RBAC (rol base + overrides por usuario), los cuatro estados
de permiso, la regla de enforcement en servidor + fail-closed, las salvaguardas anti-lockout, y
el requerimiento de bitácora.

---

## Criterios de aceptación

- [ ] El acceso se define por rol; los permisos por usuario son excepciones sobre el rol.
- [ ] Cada celda por usuario distingue hereda-permite / hereda-bloquea / permitir / bloquear,
      con "Restablecer".
- [ ] Cada permiso se **enforca en el servidor**; el acceso falla cerrado. (Probado: un asesor
      no llega a `/configuracion` ni por URL ni por API aunque se manipule el request.)
- [ ] El usuario actual no puede auto-bloquearse Configuración; el rol Súper Admin no es editable.
- [ ] Existe bitácora de cambios de permisos (quién/qué/cuándo/sobre quién).
- [ ] La columna se llama "Pólizas", no "VENTAS".
- [ ] Pestaña de notificaciones por evento y canal.
- [ ] Funciona en claro y oscuro; ruta existente intacta.

## No hagas
- No dejes la casilla binaria que confunde heredado con override.
- No dejes los permisos como control solo de frontend.
- No permitas que alguien se quite su propio acceso de administración.
- No dupliques la lógica de acceso por pantalla; usa este modelo como fuente única.

Al terminar, resúmeme: si los permisos ya se enforcaban en servidor o no, cómo quedó el modelo
rol+overrides, cómo implementaste las salvaguardas anti-lockout y la bitácora, y confírmame la
decisión sobre si Admin/Promotor puede o no editar permisos.
