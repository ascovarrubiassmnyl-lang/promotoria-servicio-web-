// Zona horaria de la promotoría (un solo país, mismo criterio que el candado
// de `routes/puntos.js`).
const TZ = 'America/Mexico_City';

// Un `<input type="datetime-local">` produce un string SIN zona
// ("2026-08-19T10:00"). Node lo interpreta con la zona del SERVIDOR, que en
// producción (Railway) es UTC: el dato quedaba corrido el offset completo.
const SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

// Minutos que la zona va adelante de UTC en ese instante (respeta horario de
// verano si algún día vuelve a aplicar).
function offsetMinutos(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(fecha).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const comoUTC = Date.UTC(
    Number(partes.year), Number(partes.month) - 1, Number(partes.day),
    Number(partes.hour) % 24, Number(partes.minute), Number(partes.second),
  );
  return (comoUTC - fecha.getTime()) / 60000;
}

// Convierte a Date lo que llega del cliente. Un ISO con zona ("…Z", "…-06:00")
// se respeta tal cual; un string sin zona se lee como hora de la promotoría,
// nunca como hora del servidor. Devuelve null si no es una fecha válida.
export function parseFechaEntrada(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'string' && SIN_ZONA.test(valor)) {
    const comoUTC = new Date(`${valor}Z`);
    if (Number.isNaN(comoUTC.getTime())) return null;
    return new Date(comoUTC.getTime() - offsetMinutos(comoUTC) * 60000);
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// Fecha y hora legibles para el texto de una notificación ("jueves 16 oct,
// 10:00 a.m."). Siempre en la zona de la promotoría: `toLocaleString()` a secas
// usa la zona del servidor, y en Railway (UTC) los avisos salían con la hora
// corrida seis horas.
export function fechaHoraAviso(fecha) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(fecha));
}

// Meses y días de calendario en la zona de la promotoría (2026-11-20,
// auditoría de Inicio). `new Date(anio, mes - 1, 1)` arma el mes con la zona
// del SERVIDOR: en Railway (UTC) el mes empezaba a las 6 p.m. del día 31 de
// México, y una llamada de esa noche contaba en el mes siguiente. Toda métrica
// "del mes" debe pedir su rango aquí.

// Año, mes (1-12) y día de un instante, leídos en hora de México.
export function partesMx(fecha = new Date()) {
  const [anio, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(fecha).split('-').map(Number);
  return { anio, mes, dia };
}

// Instante real en que empieza ese día en México. `mes` es 1-12 y puede
// desbordarse (13 = enero del año siguiente), igual que Date.UTC.
export function inicioDiaMx(anio, mes, dia = 1) {
  const comoUTC = new Date(Date.UTC(anio, mes - 1, dia));
  return new Date(comoUTC.getTime() - offsetMinutos(comoUTC) * 60000);
}

// Rango [ini, fin] (inclusivo, al milisegundo) de un mes de México.
export function rangoMesMx(mes, anio) {
  return { ini: inicioDiaMx(anio, mes, 1), fin: new Date(inicioDiaMx(anio, mes + 1, 1).getTime() - 1) };
}

// "2026-11": mes de México al que pertenece un instante (para agrupar).
export function claveMesMx(fecha) {
  const { anio, mes } = partesMx(fecha);
  return `${anio}-${mes}`;
}
