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
