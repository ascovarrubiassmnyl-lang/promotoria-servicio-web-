import crypto from 'node:crypto';
import { EstadoCliente } from '@prisma/client';

// Helpers PUROS de la captura de leads desde landing pages (routes/captura.js).
// Sin acceso a la base de datos, para poder probarlos sueltos.

// Tope de cada campo conocido. Lo que exceda se recorta, no se rechaza: un
// lead con un nombre larguísimo sigue siendo un lead.
export const LIMITES = {
  nombre: 120,
  telefono: 30,
  email: 160,
  modalidad: 40,
  origen: 80,
  etapa: 60,
  userAgent: 300,
};
export const MAX_CAMPOS_EXTRA = 30;
export const MAX_LLAVE_EXTRA = 60;
export const MAX_VALOR_EXTRA = 1000;

// Campos con significado propio: todo lo demás va a datosExtra.
export const CAMPOS_CONOCIDOS = [
  'nombre', 'telefono', 'email', 'modalidad', 'origen', 'etapa', 'fecha',
  // Reserva confirmada en el calendario de la landing (Cal.com): ver parsearCita().
  'citaInicio', 'citaFin', 'citaUid', 'citaLink', 'citaTitulo',
];
// Honeypot: campos ocultos que un humano nunca llena. Con contenido = bot.
export const CAMPOS_HONEYPOT = ['website', '_gotcha'];

// Clave pública de la fuente: 32 bytes aleatorios → 43 caracteres base64url.
// Nunca secuencial ni derivada del id.
export const generarClave = () => crypto.randomBytes(32).toString('base64url');

// IP → hash con sal (nunca se guarda la IP en claro).
export function hashIp(ip) {
  if (!ip) return null;
  const sal = process.env.CAPTURA_IP_SALT || process.env.JWT_SECRET || 'crm-captura';
  return crypto.createHash('sha256').update(`${sal}:${ip}`).digest('hex').slice(0, 32);
}

export function recortar(valor, max) {
  if (valor === undefined || valor === null) return null;
  const s = String(valor).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

// Un valor que empieza con = + - @ (o tab/CR) se ejecuta como fórmula al abrir
// un CSV en Excel/Sheets. Se antepone un apóstrofo para neutralizarlo.
export function neutralizarCsv(valor) {
  if (typeof valor !== 'string') return valor;
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

// Teléfono → solo dígitos; 10 dígitos (México) → +52XXXXXXXXXX. Otros largos
// se guardan con + si parecen internacionales (11–15 dígitos).
export function normalizarTelefono(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length === 10) return `+52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('52')) return `+${digitos}`;
  if (digitos.length === 13 && digitos.startsWith('521')) return `+52${digitos.slice(3)}`; // formato viejo de celular MX
  if (digitos.length >= 11 && digitos.length <= 15) return `+${digitos}`;
  return digitos;
}

// Llave de comparación para deduplicar: los últimos 10 dígitos. Así
// "81 1234 5678", "+52 811 234 5678" y "8112345678" son la misma persona,
// sin importar cómo lo capturó el asesor a mano.
export function claveTelefono(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos.length >= 7 ? digitos.slice(-10) : null;
}

// "Ana María López" → { nombre: 'Ana María', apellidoP: 'López' }. Cliente
// exige apellidoP; un formulario casi siempre manda el nombre en un solo campo.
export function partirNombre(completo) {
  const partes = String(completo ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { nombre: '', apellidoP: '' };
  if (partes.length === 1) return { nombre: partes[0], apellidoP: '' };
  return { nombre: partes.slice(0, -1).join(' '), apellidoP: partes[partes.length - 1] };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailValido = (e) => Boolean(e) && EMAIL_RE.test(e);

// Etapa que manda la landing ("formulario_agenda", "cita"…) → etapa del
// embudo si coincide con una real; si no, null (se usa la de la fuente y el
// valor original se conserva en la captura).
const ETAPAS_VALIDAS = Object.values(EstadoCliente).filter((e) => e !== 'NECESITA_SEGUIMIENTO');
export function mapearEtapa(valor) {
  if (!valor) return null;
  const k = String(valor).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_');
  return ETAPAS_VALIDAS.includes(k) ? k : null;
}
export const etapaSeleccionable = (e) => ETAPAS_VALIDAS.includes(e);

// Cuerpo crudo (string, cualquier Content-Type) → objeto plano.
// Acepta JSON (aunque llegue como text/plain, que es lo que manda un fetch
// mode:"no-cors") y application/x-www-form-urlencoded.
export function parsearCuerpo(raw, contentType = '') {
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  if (!texto.trim()) return {};
  if (/x-www-form-urlencoded/i.test(contentType)) {
    return Object.fromEntries(new URLSearchParams(texto));
  }
  try {
    const obj = JSON.parse(texto);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    // Último intento: un form urlencoded que llegó sin su Content-Type.
    if (/^[^{[\s][^=]*=/.test(texto)) return Object.fromEntries(new URLSearchParams(texto));
    return null;
  }
}

export const honeypotLleno = (body) => CAMPOS_HONEYPOT.some((k) => {
  const v = body?.[k];
  return v !== undefined && v !== null && String(v).trim() !== '';
});

// Todo lo que no es campo conocido ni honeypot → datosExtra, acotado en
// número de llaves y tamaño, y neutralizado para CSV.
export function extraerExtra(body) {
  const extra = {};
  let n = 0;
  for (const [k, v] of Object.entries(body || {})) {
    if (CAMPOS_CONOCIDOS.includes(k) || CAMPOS_HONEYPOT.includes(k)) continue;
    if (n >= MAX_CAMPOS_EXTRA) break;
    const llave = String(k).slice(0, MAX_LLAVE_EXTRA);
    if (!llave || llave === '__proto__' || llave === 'constructor' || llave === 'prototype') continue;
    const valor = typeof v === 'string' ? v : JSON.stringify(v);
    if (valor === undefined) continue;
    extra[llave] = neutralizarCsv(String(valor).slice(0, MAX_VALOR_EXTRA));
    n += 1;
  }
  return n ? extra : null;
}

// Fecha ISO que manda el sitio (informativa: la fecha del lead en el CRM
// siempre es la del servidor, para que las métricas no dependan del reloj del
// visitante).
export function parsearFecha(valor) {
  if (!valor) return null;
  const d = new Date(String(valor).slice(0, 40));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Host de un Origin ("https://www.midominio.com" → "www.midominio.com").
export function hostDeOrigen(origin) {
  if (!origin) return null;
  try { return new URL(origin).host.toLowerCase(); } catch { return null; }
}

// Normaliza lo que el asesor escribe como dominio permitido: sin protocolo,
// sin ruta, en minúsculas.
export function normalizarDominio(d) {
  const s = String(d ?? '').trim().toLowerCase();
  if (!s) return null;
  const host = hostDeOrigen(/^https?:\/\//.test(s) ? s : `https://${s}`);
  return host && /^[a-z0-9.-]+(:\d+)?$/.test(host) ? host : null;
}

// Con lista vacía cualquier origen vale. Con lista, el host debe coincidir
// exacto o ser subdominio ("www.x.com" entra con "x.com").
export function origenPermitido(origin, dominios = []) {
  if (!dominios?.length) return true;
  const host = hostDeOrigen(origin);
  if (!host) return false;
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

// Reserva confirmada en el calendario de la landing (evento bookingSuccessfulV2
// del embed de Cal.com). Devuelve null si el cuerpo no trae una cita válida:
// el envío se trata entonces como un lead normal. El endpoint es público, así
// que se acotan las fechas — nadie debe poder sembrar citas en el pasado lejano
// ni a años de distancia en el calendario del asesor.
const DURACION_DEFECTO_MIN = 30;
const DURACION_MAX_MIN = 4 * 60;
export function parsearCita(body, ahora = new Date()) {
  const inicio = parsearFecha(body?.citaInicio);
  if (!inicio) return null;
  if (inicio.getTime() < ahora.getTime() - 24 * 3600_000) return null;
  if (inicio.getTime() > ahora.getTime() + 366 * 24 * 3600_000) return null;
  let fin = parsearFecha(body?.citaFin);
  const duracion = fin ? (fin - inicio) / 60000 : 0;
  if (!fin || duracion <= 0 || duracion > DURACION_MAX_MIN) {
    fin = new Date(inicio.getTime() + DURACION_DEFECTO_MIN * 60000);
  }
  const link = recortar(body?.citaLink, 500);
  return {
    inicio,
    fin,
    uid: recortar(body?.citaUid, 100),
    titulo: recortar(body?.citaTitulo, 150),
    link: link && /^https:\/\//i.test(link) ? link : null,
  };
}

// Canal de la cita según lo que la persona eligió en el formulario.
export function tipoCitaDesdeModalidad(modalidad) {
  const m = String(modalidad || '').toLowerCase();
  if (m.includes('presencial')) return 'PRESENCIAL';
  if (m.includes('virtual') || m.includes('video') || m.includes('meet') || m.includes('zoom')) return 'VIDEO';
  return 'TELEFONICA';
}

// "jue 2 oct, 3:00 p.m." en hora de México, para notificaciones.
export function fechaCitaLegible(fecha) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  }).format(fecha);
}
