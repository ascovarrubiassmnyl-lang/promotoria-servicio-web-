// Fuente de captación del cliente/prospecto — MAPA ÚNICO.
//
// La columna `Cliente.fuente` sigue siendo `String?` a propósito: los clientes
// dados de alta antes de este catálogo tienen texto libre ("Referido de Ana",
// "Expo"), y convertirla en enum los rompería. La UI ofrece SOLO estos valores
// para altas nuevas y muestra el texto legacy tal cual si no está en el mapa.
//
// No duplicar labels de fuente en otros componentes: usar `FUENTES`/`infoFuente`.

export const FUENTES = [
  { value: 'REFERIDO', label: 'Referido' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'ANUNCIOS', label: 'Anuncios / campaña pagada' },
  { value: 'PROSPECCION_FRIA', label: 'Prospección en frío' },
  { value: 'CLINICA_TELEFONICA', label: 'Clínica telefónica' },
  { value: 'EVENTO', label: 'Evento / networking' },
  { value: 'CARTERA_PROPIA', label: 'Cartera propia / conocido' },
  { value: 'OTRO', label: 'Otro' },
];

const POR_VALOR = Object.fromEntries(FUENTES.map((f) => [f.value, f]));

// Valor legacy (texto libre) → se muestra tal cual, sin romper la ficha.
export function infoFuente(valor) {
  if (!valor) return { value: '', label: '', legacy: false };
  return POR_VALOR[valor] || { value: valor, label: valor, legacy: true };
}

export const esFuenteCatalogo = (valor) => Boolean(valor && POR_VALOR[valor]);

// Select estándar de fuente. Conserva el valor legacy como opción para que
// editar un cliente antiguo no lo borre sin querer.
export function opcionesFuente(valorActual) {
  const info = infoFuente(valorActual);
  return info.legacy ? [...FUENTES, { value: info.value, label: `${info.value} (registro anterior)` }] : FUENTES;
}

