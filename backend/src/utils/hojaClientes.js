// Exportar e importar la cartera en Excel (2026-11-19). Única implementación
// del formato de la hoja: qué columnas salen, cuáles se aceptan de regreso y
// cómo se lee cada celda. Las rutas (routes/clientes.js) solo resuelven el
// alcance por rol y escriben en la base.
//
// El archivo que se exporta se puede volver a importar tal cual: los
// encabezados son los mismos y las columnas que el CRM calcula (Tipo, pólizas,
// prima, fechas de llamada/cita/alta, Archivado, Asesor) simplemente se ignoran.
import ExcelJS from 'exceljs';
import { normalizarTelefono, claveTelefono, partirNombre } from './captura.js';

export const MAX_FILAS_IMPORTACION = 2000;
export const FUENTE_IMPORTACION = 'Importado de Excel';

// Espejo de ESTADOS_CLIENTE_LABEL y RAMOS_LABEL (frontend/src/lib/format.js):
// la hoja habla con los mismos nombres que ve el asesor en pantalla.
const ETAPAS_LABEL = {
  PROSPECTO: 'Prospecto',
  CONTACTADO: 'Contactado',
  CITA: 'Cita',
  PROPUESTA: 'Propuesta',
  CIERRE_FIRMA: 'Cierre y firma',
  ENTREGA_POLIZA: 'Entrega de póliza',
  REFERIDOS: 'Referidos',
  POST_VENTA_SEGUIMIENTO: 'Post venta y seguimiento',
  DESCARTADO: 'Descartado',
  STANDBY: 'Standby',
  RETARGETING: 'Retargeting',
};
const RAMOS_LABEL = {
  VIDA: 'Vida',
  ACUMULACION: 'Acumulación',
  PROTECCION: 'Protección',
  SALUD: 'Salud',
  RETIRO: 'Retiro',
  GMM: 'Gastos Médicos Mayores',
};

const VENTA_VIVA = ['PENDIENTE_PAGAR', 'FIRMADA', 'APROBADA', 'PAGADA'];
const VENTA_ACTIVA = ['FIRMADA', 'APROBADA', 'PAGADA'];

// "Teléfono " / "TELEFONO" / "telefono" → "telefono"
const plano = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const nombreCompleto = (u) => [u?.nombre, u?.apellidoP, u?.apellidoM].map((p) => (p || '').trim()).filter(Boolean).join(' ');

// Fecha "de calendario" (nacimiento): se guarda a medianoche UTC, se escribe igual.
const diaUtc = (d) => (d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null);
// Instante (alta, última llamada): el día que fue en México, no en UTC.
const fmtMx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const diaMx = (d) => (d ? new Date(`${fmtMx.format(d)}T00:00:00.000Z`) : null);

// importar: true = la columna se lee al importar.
const COLUMNAS = [
  { titulo: 'Asesor', ancho: 28, valor: (c) => nombreCompleto(c.asesor) },
  { titulo: 'Nombre', ancho: 20, importar: true, valor: (c) => c.nombre },
  { titulo: 'Apellido paterno', ancho: 18, importar: true, valor: (c) => c.apellidoP },
  { titulo: 'Apellido materno', ancho: 18, importar: true, valor: (c) => c.apellidoM },
  { titulo: 'Teléfono', ancho: 17, importar: true, valor: (c) => c.telefono },
  { titulo: 'Correo', ancho: 28, importar: true, valor: (c) => c.email },
  { titulo: 'Tipo', ancho: 11, valor: (c) => (c.ventas.some((v) => VENTA_VIVA.includes(v.estado)) ? 'Cliente' : 'Prospecto') },
  { titulo: 'Etapa', ancho: 24, importar: true, valor: (c) => ETAPAS_LABEL[c.estado] || 'Prospecto' },
  { titulo: 'Necesita seguimiento', ancho: 13, importar: true, valor: (c) => (c.necesitaSeguimiento || c.estado === 'NECESITA_SEGUIMIENTO' ? 'Sí' : 'No') },
  { titulo: 'Fuente', ancho: 22, importar: true, valor: (c) => c.fuente },
  { titulo: 'Producto de interés', ancho: 22, importar: true, valor: (c) => RAMOS_LABEL[c.productoInteres] || null },
  { titulo: 'Pólizas vigentes', ancho: 10, valor: (c) => c.ventas.filter((v) => VENTA_VIVA.includes(v.estado)).length },
  { titulo: 'Productos contratados', ancho: 30, valor: (c) => c.ventas.filter((v) => VENTA_VIVA.includes(v.estado)).map((v) => v.producto).filter(Boolean).join(', ') },
  {
    titulo: 'Prima anual activa (MXN)', ancho: 17, formato: '"$"#,##0.00',
    valor: (c) => c.ventas.filter((v) => VENTA_ACTIVA.includes(v.estado)).reduce((s, v) => s + (v.primaAnual || 0), 0) || null,
  },
  { titulo: 'Fecha de nacimiento', ancho: 14, importar: true, formato: 'dd/mm/yyyy', valor: (c) => diaUtc(c.fechaNacimiento) },
  { titulo: 'RFC', ancho: 16, importar: true, valor: (c) => c.rfc },
  { titulo: 'CURP', ancho: 21, importar: true, valor: (c) => c.curp },
  { titulo: 'Dirección', ancho: 34, importar: true, valor: (c) => c.direccion },
  { titulo: 'Última llamada', ancho: 14, formato: 'dd/mm/yyyy', valor: (c) => diaMx(c.fechaUltimaLlamada) },
  { titulo: 'Última cita', ancho: 14, formato: 'dd/mm/yyyy', valor: (c) => diaMx(c.fechaUltimaCita) },
  { titulo: 'Fecha de alta', ancho: 14, formato: 'dd/mm/yyyy', valor: (c) => diaMx(c.creadoEn) },
  { titulo: 'Archivado', ancho: 11, valor: (c) => (c.archivadoEn ? 'Sí' : 'No') },
  { titulo: 'Notas', ancho: 46, importar: true, valor: (c) => c.notas },
];

// Lo que `GET /clientes/exportar` debe traer de cada cliente.
export const INCLUDE_EXPORTACION = {
  asesor: { select: { nombre: true, apellidoP: true, apellidoM: true } },
  ventas: { select: { estado: true, producto: true, primaAnual: true }, orderBy: { creadoEn: 'asc' } },
};

function hojaConEncabezados(libro, nombre, columnas) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }));
  const fila = hoja.getRow(1);
  fila.height = 30;
  fila.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    celda.alignment = { vertical: 'middle', wrapText: true };
  });
  return hoja;
}

export async function libroDeClientes(clientes) {
  const libro = new ExcelJS.Workbook();
  const hoja = hojaConEncabezados(libro, 'Clientes', COLUMNAS);
  for (const c of clientes) {
    hoja.addRow(COLUMNAS.map((col) => {
      const v = col.valor(c);
      return typeof v === 'string' ? (v.trim() || null) : (v ?? null);
    }));
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, clientes.length + 1), column: COLUMNAS.length } };
  return Buffer.from(await libro.xlsx.writeBuffer());
}

export async function libroPlantilla() {
  const libro = new ExcelJS.Workbook();
  hojaConEncabezados(libro, 'Clientes', COLUMNAS.filter((c) => c.importar));
  const ayuda = libro.addWorksheet('Instrucciones');
  ayuda.getColumn(1).width = 100;
  [
    'Cómo llenar esta plantilla',
    '',
    '• Escribe un contacto por fila en la hoja "Clientes". No cambies los encabezados.',
    '• Solo el Nombre es obligatorio. Lo demás puede ir vacío.',
    '• Teléfono: 10 dígitos (ej. 4441234567). Con o sin espacios, guiones o +52.',
    `• Etapa: ${Object.values(ETAPAS_LABEL).join(', ')}. Vacía = Prospecto.`,
    `• Producto de interés: ${Object.values(RAMOS_LABEL).join(', ')}.`,
    '• Fecha de nacimiento: día/mes/año (ej. 15/03/1988).',
    '• Necesita seguimiento: Sí o No.',
    '• Un contacto que ya está en tu cartera (mismo teléfono) no se duplica: se omite.',
    `• Máximo ${MAX_FILAS_IMPORTACION.toLocaleString('es-MX')} filas por archivo.`,
  ].forEach((t, i) => {
    ayuda.getCell(i + 1, 1).value = t;
    if (i === 0) ayuda.getCell(1, 1).font = { bold: true, size: 13 };
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ── Importación ────────────────────────────────────────────────────────────

// Encabezados aceptados → campo. Incluye los nombres más comunes de las hojas
// que los asesores ya traen armadas a mano.
const ALIAS = {
  nombre: ['nombre', 'nombres', 'nombre s'],
  nombreCompleto: ['nombre completo', 'cliente', 'contacto', 'prospecto', 'nombre y apellidos', 'nombre y apellido'],
  apellidoP: ['apellido paterno', 'apellido p', 'apellidop', 'primer apellido', 'apellido', 'apellidos', 'paterno'],
  apellidoM: ['apellido materno', 'apellido m', 'apellidom', 'segundo apellido', 'materno'],
  telefono: ['telefono', 'tel', 'celular', 'cel', 'movil', 'whatsapp', 'numero', 'numero de telefono', 'telefono celular'],
  email: ['correo', 'email', 'e mail', 'mail', 'correo electronico'],
  estado: ['etapa', 'estado', 'estatus', 'status', 'etapa del pipeline'],
  necesitaSeguimiento: ['necesita seguimiento', 'seguimiento'],
  fuente: ['fuente', 'origen', 'fuente de captacion'],
  productoInteres: ['producto de interes', 'interes', 'ramo', 'producto'],
  fechaNacimiento: ['fecha de nacimiento', 'nacimiento', 'fecha nacimiento', 'cumpleanos'],
  rfc: ['rfc'],
  curp: ['curp'],
  direccion: ['direccion', 'domicilio'],
  notas: ['notas', 'nota', 'comentarios', 'observaciones'],
};
const CAMPO_POR_ENCABEZADO = new Map(Object.entries(ALIAS).flatMap(([campo, lista]) => lista.map((a) => [a, campo])));

const ETAPA_POR_TEXTO = new Map([
  ...Object.entries(ETAPAS_LABEL).flatMap(([k, label]) => [[plano(k), k], [plano(label), k]]),
  [plano('Post venta'), 'POST_VENTA_SEGUIMIENTO'],
  [plano('Cierre'), 'CIERRE_FIRMA'],
]);
const RAMO_POR_TEXTO = new Map([
  ...Object.entries(RAMOS_LABEL).flatMap(([k, label]) => [[plano(k), k], [plano(label), k]]),
  [plano('Gastos médicos'), 'GMM'],
]);

function textoDeCelda(celda) {
  const v = celda.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.result instanceof Date) return v.result;
    if (v.result !== undefined) return String(v.result ?? '').trim();
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.text !== undefined) return String(v.text?.richText ? v.text.richText.map((t) => t.text).join('') : v.text).trim();
    if (v.error) return '';
  }
  return String(v).trim();
}

function fechaDeEntrada(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : diaUtc(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let a; let mes; let d;
  if (m) [, a, mes, d] = m.map(Number);
  else {
    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // día/mes/año, como se escribe en México
    if (!m) return null;
    [, d, mes, a] = m.map(Number);
    if (a < 100) a += a > 30 ? 1900 : 2000;
  }
  const f = new Date(Date.UTC(a, mes - 1, d));
  const valida = f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d && a >= 1900 && f <= new Date();
  return valida ? f : null;
}

const recortar = (v, max) => {
  const s = (v instanceof Date ? '' : String(v ?? '')).trim();
  return s ? s.slice(0, max) : null;
};

// Lee el .xlsx y devuelve { filas: [{fila, datos}|{fila, error}], sinNombre }.
// Lanza Error con `status` 400 si el archivo no se puede usar.
export async function leerHojaDeClientes(buffer) {
  const mal = (msg) => Object.assign(new Error(msg), { status: 400 });
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw mal('No se pudo leer el archivo. Debe ser un Excel (.xlsx); si lo tienes en Google Sheets, descárgalo como "Microsoft Excel".');
  }
  const hoja = libro.worksheets.find((h) => h.actualRowCount > 0);
  if (!hoja) throw mal('El archivo está vacío.');

  // El encabezado es la primera de las 10 primeras filas que trae una columna de nombre.
  let filaEncabezado = 0; let campos = null;
  for (let n = 1; n <= Math.min(10, hoja.rowCount); n += 1) {
    const mapa = new Map();
    hoja.getRow(n).eachCell((celda, col) => {
      const campo = CAMPO_POR_ENCABEZADO.get(plano(textoDeCelda(celda)));
      if (campo && ![...mapa.values()].includes(campo)) mapa.set(col, campo);
    });
    const hallados = [...mapa.values()];
    if (hallados.includes('nombre') || hallados.includes('nombreCompleto')) { filaEncabezado = n; campos = mapa; break; }
  }
  if (!campos) throw mal('No encontré la columna "Nombre". Usa la plantilla o pon ese encabezado en la primera fila.');
  if (hoja.rowCount - filaEncabezado > MAX_FILAS_IMPORTACION * 2) throw mal(`El archivo es demasiado grande (máximo ${MAX_FILAS_IMPORTACION} contactos por archivo).`);

  const filas = [];
  for (let n = filaEncabezado + 1; n <= hoja.rowCount; n += 1) {
    const crudo = {};
    for (const [col, campo] of campos) crudo[campo] = textoDeCelda(hoja.getRow(n).getCell(col));
    if (Object.values(crudo).every((v) => v === '')) continue; // fila vacía

    let nombre = recortar(crudo.nombre, 80);
    let apellidoP = recortar(crudo.apellidoP, 80) || '';
    if (!nombre && crudo.nombreCompleto) {
      const p = partirNombre(crudo.nombreCompleto);
      nombre = recortar(p.nombre, 80);
      if (!apellidoP) apellidoP = recortar(p.apellidoP, 80) || '';
    }
    if (!nombre) { filas.push({ fila: n, error: 'Falta el nombre' }); continue; }

    let telefono = null;
    const tel = crudo.telefono instanceof Date ? '' : String(crudo.telefono ?? '').trim();
    if (tel) {
      if (/[a-z]/i.test(tel) || tel.replace(/\D/g, '').length < 10) {
        filas.push({ fila: n, error: `Teléfono inválido ("${tel.slice(0, 20)}"): deben ser al menos 10 dígitos`, nombre: `${nombre} ${apellidoP}`.trim() });
        continue;
      }
      telefono = normalizarTelefono(tel);
    }

    const etapaTexto = plano(crudo.estado instanceof Date ? '' : crudo.estado);
    const seguimiento = ['si', 'x', 'true', '1', 'yes'].includes(plano(crudo.necesitaSeguimiento instanceof Date ? '' : crudo.necesitaSeguimiento));
    filas.push({
      fila: n,
      datos: {
        nombre,
        apellidoP,
        apellidoM: recortar(crudo.apellidoM, 80),
        telefono,
        email: recortar(crudo.email, 160)?.toLowerCase() || null,
        estado: ETAPA_POR_TEXTO.get(etapaTexto) || 'PROSPECTO',
        necesitaSeguimiento: seguimiento || etapaTexto === 'necesita seguimiento',
        fuente: recortar(crudo.fuente, 120) || FUENTE_IMPORTACION,
        productoInteres: RAMO_POR_TEXTO.get(plano(crudo.productoInteres instanceof Date ? '' : crudo.productoInteres)) || null,
        fechaNacimiento: fechaDeEntrada(crudo.fechaNacimiento),
        rfc: recortar(crudo.rfc, 13)?.toUpperCase() || null,
        curp: recortar(crudo.curp, 18)?.toUpperCase() || null,
        direccion: recortar(crudo.direccion, 300),
        notas: recortar(crudo.notas, 2000),
      },
    });
  }
  if (filas.length === 0) throw mal('El archivo no trae ningún contacto debajo de los encabezados.');
  if (filas.length > MAX_FILAS_IMPORTACION) throw mal(`El archivo trae ${filas.length} contactos; el máximo por archivo es ${MAX_FILAS_IMPORTACION}. Divídelo en partes.`);
  return filas;
}

// Llaves para saber si un contacto ya está en la cartera. Con teléfono manda
// el teléfono (últimos 10 dígitos, igual que la captura de landings); sin él,
// el correo; y sin ninguno de los dos, el nombre completo.
export function llavesDeContacto(c) {
  const tel = claveTelefono(c.telefono);
  if (tel) return [`tel:${tel}`];
  if (c.email) return [`mail:${String(c.email).trim().toLowerCase()}`];
  return [`nom:${plano(nombreCompleto(c))}`];
}

// Separa las filas leídas en nuevas / duplicadas contra la cartera existente
// (y contra el propio archivo: la misma persona dos veces entra una sola).
export function clasificarFilas(filas, existentes) {
  const vistas = new Set(existentes.flatMap(llavesDeContacto));
  const nuevos = []; const duplicados = []; const errores = [];
  for (const f of filas) {
    if (f.error) { errores.push({ fila: f.fila, motivo: f.error, nombre: f.nombre || null }); continue; }
    const llaves = llavesDeContacto(f.datos);
    if (llaves.some((k) => vistas.has(k))) { duplicados.push({ fila: f.fila, nombre: `${f.datos.nombre} ${f.datos.apellidoP}`.trim() }); continue; }
    llaves.forEach((k) => vistas.add(k));
    nuevos.push(f.datos);
  }
  return { nuevos, duplicados, errores };
}
