// Avisos breves (toasts) — 2026-10-13, auditoría de UI: guardar no daba
// ninguna confirmación y los errores salían en un alert() del navegador.
// Emisor a nivel módulo para poder avisar desde cualquier handler sin hook;
// el contenedor <Toasts /> (components/ui.jsx) se monta una vez en Layout.
const oyentes = new Set();
let siguienteId = 1;

export function avisar(mensaje, tipo = 'ok') {
  if (!mensaje) return;
  const toast = { id: siguienteId++, mensaje: String(mensaje), tipo };
  oyentes.forEach((fn) => fn(toast));
}

export function suscribirToasts(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
