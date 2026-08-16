// Tipo de cambio oficial desde Banxico (SIE API).
//
// Por qué Banxico y no una API de FX genérica: las pólizas de SMNYL en dólares
// se liquidan al **tipo de cambio FIX** que publica el Banco de México, y las
// UDIS son un valor que **solo** Banxico calcula y publica — no existe un
// "precio de mercado" de la UDI que otra fuente pueda dar. Cualquier otra
// fuente sería una aproximación de la primera y una invención de la segunda.
//
// Series SIE usadas:
//   SF43718 — Tipo de cambio FIX (pesos por dólar), publicado cada día hábil.
//   SP68257 — Valor de la UDI en pesos, publicado para TODOS los días del mes
//             (incluye fines de semana y festivos, a diferencia del FIX).
//
// Requiere BANXICO_TOKEN en .env (gratuito, se obtiene en
// https://www.banxico.org.mx/SieAPIRest/service/v1/token). SIN TOKEN NO SE
// ROMPE NADA: `tipoCambioDisponible()` devuelve false, el endpoint responde
// {disponible:false} y el asesor captura el tipo de cambio a mano igual que
// antes — la automatización es una ayuda sobre el flujo manual, nunca un
// bloqueo para registrar una póliza.

const SERIES = {
  USD: 'SF43718', // FIX pesos por dólar
  UDI: 'SP68257', // valor de la UDI en pesos
};

const BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series';

// El FIX se publica una vez al día y la UDI tampoco cambia intradía, así que
// cachear en memoria por horas evita pegarle a Banxico en cada apertura del
// modal. Es cache de proceso: se pierde al reiniciar, que es aceptable.
const TTL_MS = 3 * 60 * 60 * 1000; // 3 horas
const cache = new Map(); // moneda -> { valor, fecha, obtenidoEn }

export function tipoCambioDisponible() {
  return Boolean(process.env.BANXICO_TOKEN);
}

// Consulta el dato más reciente de una serie. Devuelve { valor, fecha } o null
// si Banxico no responde / no hay dato utilizable. Nunca lanza: la falta de
// tipo de cambio automático degrada a captura manual, no a un error de la app.
async function consultarSerie(moneda) {
  const token = process.env.BANXICO_TOKEN;
  const serie = SERIES[moneda];
  if (!token || !serie) return null;

  const url = `${BASE}/${serie}/datos/oportuno?token=${encodeURIComponent(token)}`;
  try {
    // Timeout explícito: si Banxico tarda, el modal no se queda colgado
    // esperando — cae a captura manual.
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      console.warn(`[tipoCambio] Banxico respondió ${res.status} para ${moneda}`);
      return null;
    }
    const json = await res.json();
    const dato = json?.bmx?.series?.[0]?.datos?.[0];
    if (!dato) return null;
    // El dato viene como string ("17.0854") y puede ser "N/E" (no existe) en
    // días sin publicación.
    const valor = Number(String(dato.dato).replace(/,/g, ''));
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return { valor, fecha: dato.fecha || null };
  } catch (e) {
    console.warn(`[tipoCambio] No se pudo consultar Banxico (${moneda}):`, e.message);
    return null;
  }
}

// Tipo de cambio vigente de una moneda a MXN. MXN siempre es 1 (no se
// consulta nada). Devuelve null si no hay token o Banxico no respondió.
export async function tipoCambioVigente(moneda) {
  if (moneda === 'MXN') return { moneda: 'MXN', valor: 1, fecha: null, fuente: 'fijo' };
  if (!SERIES[moneda]) return null;

  const enCache = cache.get(moneda);
  if (enCache && Date.now() - enCache.obtenidoEn < TTL_MS) {
    return { moneda, valor: enCache.valor, fecha: enCache.fecha, fuente: 'banxico' };
  }

  const dato = await consultarSerie(moneda);
  if (!dato) {
    // Si Banxico falla pero teníamos un valor cacheado (aunque vencido), es
    // mejor dato que ninguno: se devuelve marcado para que la UI lo advierta.
    if (enCache) return { moneda, valor: enCache.valor, fecha: enCache.fecha, fuente: 'cache-vencido' };
    return null;
  }

  cache.set(moneda, { valor: dato.valor, fecha: dato.fecha, obtenidoEn: Date.now() });
  return { moneda, valor: dato.valor, fecha: dato.fecha, fuente: 'banxico' };
}

// Todas las monedas de una vez, para el endpoint que consume el formulario.
export async function tiposDeCambioVigentes() {
  const [usd, udi] = await Promise.all([tipoCambioVigente('USD'), tipoCambioVigente('UDI')]);
  return {
    disponible: tipoCambioDisponible(),
    MXN: { valor: 1, fecha: null, fuente: 'fijo' },
    USD: usd ? { valor: usd.valor, fecha: usd.fecha, fuente: usd.fuente } : null,
    UDI: udi ? { valor: udi.valor, fecha: udi.fecha, fuente: udi.fuente } : null,
  };
}
