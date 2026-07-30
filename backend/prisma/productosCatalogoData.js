// Catálogo de productos SMNYL (fuente: bóveda Obsidian, 10_Seguros_SMYNL/Productos).
// Compartido entre el seed de desarrollo (seed.js) y el script one-off de
// producción (scripts/seed-productos-catalogo.mjs) para no duplicar la lista.
export const productosCatalogoSeed = [
  // Orvi 99 — Vida vitalicio (nombre interno en la plataforma CDP de la aseguradora)
  { ramo: 'VIDA', nombre: 'Orvi 6 pagos',         codigo: 'Orvi 99', comisionPct: 20, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 6 años; protección de por vida con reserva garantizada.' },
  { ramo: 'VIDA', nombre: 'Orvi 10 pagos',        codigo: 'Orvi 99', comisionPct: 36, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 10 años; disponible en USD (36%) y UDI (35%).' },
  { ramo: 'VIDA', nombre: 'Orvi 15 pagos',        codigo: 'Orvi 99', comisionPct: 35, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 15 años; protección de por vida.' },
  { ramo: 'VIDA', nombre: 'Orvi 20 pagos',        codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 20 años; en UDI 44% (SA<1.5M) o 35% (SA>=1.5M).' },
  { ramo: 'VIDA', nombre: 'Orvi Edad 60',         codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con pago de primas hasta edad alcanzada de 60 años; 44% si edad<=41 al contratar, 35% si edad>41.' },
  { ramo: 'VIDA', nombre: 'Orvi Todos los pagos', codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con primas pagaderas durante toda la vida; en UDI 44% (SA<1.5M) o 35% (SA>=1.5M).' },

  // Star Dotal — Ahorro a plazo
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 5 años',  comisionPct: 11, descripcion: 'Seguro dotal a 5 años en USD que combina protección por fallecimiento y ahorro recibido en vida al vencimiento.' },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 10 años',  comisionPct: 27, descripcion: 'Seguro dotal a 10 años (USD 27% / UDI 30%) que entrega la suma asegurada al sobrevivir el plazo o a beneficiarios por fallecimiento.' },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 15 años',  comisionPct: 28, descripcion: 'Seguro dotal a 15 años en USD con protección por fallecimiento y ahorro recibido en vida al vencimiento.' },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 20 años', comisionPct: 35, descripcion: 'Seguro dotal a 20 años (USD y UDI, 35% año 1) con protección y ahorro de largo plazo.' },

  // SeguBeca — Ahorro educativo
  { ramo: 'ACUMULACION', nombre: 'SeguBeca', comisionPct: null, descripcion: 'Seguro dotal para constituir el capital de educación universitaria del menor, con pago de suma asegurada a los 18 años y exención de primas por fallecimiento/invalidez del contratante.' },

  // Vida Mujer — Vida + ahorro para mujeres
  { ramo: 'VIDA', nombre: 'Vida Mujer', comisionPct: 40, descripcion: 'Seguro de vida y ahorro diseñado para mujeres que entrega anticipos (dotales) del 5% de la SA cada 2 años desde el año 5 y 80% al final, totalizando 115% de la SA.' },

  // Imagina Ser — Retiro / PPR (deducción LISR Art. 151) — variantes por modalidad de pago
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Nivelada Plazo Largo', comisionPct: 35, descripcion: 'Plan Personal de Retiro Imagina Ser con prima nivelada, plazo largo (20+ años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70. Disponible en USD (2%TMG) y UDIs (1%TMG).' },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Nivelada Plazo Medio', comisionPct: 30, descripcion: 'Plan Personal de Retiro Imagina Ser con prima nivelada, plazo medio (10-19 años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70. Disponible en USD (2%TMG) y UDIs (1%TMG).' },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Única Plazo Largo', comisionPct: 8.5, descripcion: 'Plan Personal de Retiro Imagina Ser con prima única, plazo largo (20+ años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.' },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Única Plazo Medio', comisionPct: 8.5, descripcion: 'Plan Personal de Retiro Imagina Ser con prima única, plazo medio (10-19 años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.' },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Pagos Limitados 10', comisionPct: 27, descripcion: 'Plan Personal de Retiro Imagina Ser con pagos limitados a 10 años. Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.' },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Pagos Limitados 15', comisionPct: 30, descripcion: 'Plan Personal de Retiro Imagina Ser con pagos limitados a 15 años. Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.' },

  // Alfa Medical — Gastos Médicos Mayores (variantes comerciales)
  { ramo: 'GMM', nombre: 'Alfa Medical', comisionPct: null, descripcion: 'Seguro de Gastos Médicos Mayores que cubre gastos por accidente, enfermedad, parto o cesárea, con coberturas básicas (maternidad, trasplantes, dentales, etc.) y opcionales de extensión en el extranjero. Programa Médicos a tu lado®.' },
  { ramo: 'GMM', nombre: 'Alfa Medical Flex', comisionPct: null, descripcion: 'Variante de Gastos Médicos Mayores que permite personalizar coberturas y deducibles para adaptarse al presupuesto del cliente; usa franquicia en vez de deducible tradicional.' },
  { ramo: 'GMM', nombre: 'Alfa Medical Internacional', comisionPct: null, descripcion: 'Variante de Gastos Médicos Mayores con cobertura y acceso a hospitales y especialistas a nivel mundial (fuera de México), además de las coberturas básicas del plan.' },
];
