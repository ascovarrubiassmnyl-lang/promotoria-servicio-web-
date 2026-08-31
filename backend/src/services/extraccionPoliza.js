import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';

// Analiza el PDF de una póliza emitida por la aseguradora y devuelve los
// campos de la ficha técnica ya en la forma que espera PolizaFormModal —
// mismo shape que el formulario manual, para que el frontend pueda prellenar
// el mismo modal sin traducir nada aparte.
//
// Modelo: un Gemini Flash (nivel gratuito, lee el PDF nativo sin rasterizar
// a imagen). Requiere GEMINI_API_KEY en .env; sin ella, analizarPolizaPdf
// lanza y la ruta que la llama responde 503 — subir/ver/descargar el PDF
// sigue funcionando igual, el análisis es un extra sobre eso.
//
// LISTA de modelos, no uno solo (2026-08-27): Google retira modelos para las
// keys nuevas sin avisar y con la key vigente `gemini-2.5-flash` responde 404
// "no longer available to new users" — eso era exactamente el "No se pudo
// analizar el documento" que veía el asesor, con la causa real escondida
// detrás de un 502 genérico. Se intentan en orden y el primero que responde
// se memoriza en `modeloVigente` para no volver a pagar el 404 en cada
// análisis (se reevalúa al reiniciar el servidor). `GEMINI_MODELO` en .env
// tiene prioridad sobre la lista, para fijar uno a mano sin tocar código.
export const MODELOS_EXTRACCION = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

// Presupuesto TOTAL del análisis, compartido por todos los candidatos — no un
// timeout por modelo (2026-08-27): al asesor le da igual cuántos se
// intentaron, lo que ve es "Analizando…" y su navegador tiene su propio
// límite (TIMEOUT_ANALISIS en frontend/src/api/client.js, que va por encima de
// éste para que quien corte sea el servidor, el único que sabe por qué falló).
// Con un timeout por modelo, tres candidatos lentos sumaban minutos.
// Medido: el mismo PDF tarda entre ~7 s y ~60 s según el momento, así que el
// presupuesto es holgado a propósito — cortar a los 30 s tiraría análisis que
// iban a salir bien, y perder el trabajo es peor que esperar.
const PRESUPUESTO_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 150_000;

// Último modelo que sí respondió, para intentarlo primero la próxima vez.
let modeloVigente = null;

function modelosCandidatos() {
  const fijado = (process.env.GEMINI_MODELO || '').trim();
  if (fijado) return [fijado];
  if (modeloVigente) return [modeloVigente, ...MODELOS_EXTRACCION.filter((m) => m !== modeloVigente)];
  return MODELOS_EXTRACCION;
}

// Errores que valen la pena reintentar con OTRO modelo: 404 (ese modelo no
// existe para esta key — retirado o sin acceso), 500/503 (falla o saturación
// del lado de Google, que suele afectar a un modelo y no a los demás) y el
// timeout propio. Todo lo demás (401 de key mala, 403, 429 de cuota, 400 de
// payload) le pasaría igual a los tres candidatos, así que se propaga tal
// cual en vez de repetir la misma falla y triplicar la espera del asesor.
const REINTENTABLES = [404, 500, 503];

function vaANegarTodos(err) {
  return !REINTENTABLES.includes(err?.status) && err?.codigo !== 'TIMEOUT';
}

let cliente = null;
function clienteGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!cliente) cliente = new GoogleGenAI({ apiKey: key });
  return cliente;
}

export function extraccionDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Mismo enum RamoSeguro del schema — se le pide a la IA que elija uno de estos.
const RAMOS = ['VIDA', 'ACUMULACION', 'PROTECCION', 'SALUD', 'RETIRO', 'GMM'];
const MONEDAS = ['MXN', 'USD', 'UDI'];
const FORMAS_PAGO = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'];

// Schema de salida estructurada: Gemini devuelve exactamente esta forma, sin
// que haya que parsear/tolerar markdown ni texto libre alrededor del JSON.
const SCHEMA_EXTRACCION = {
  type: Type.OBJECT,
  properties: {
    producto: { type: Type.STRING, description: 'Nombre comercial del producto tal como aparece en la carátula de la póliza (ej. "Orvi", "Star Dotal", "Alfa Medical")' },
    plan: { type: Type.STRING, description: 'Nombre del PLAN o PROYECTO contratado, cuando la póliza lo distingue del nombre del producto (ej. "Proyecto Imagina Ser", "Plan Elite", "Nacional"). Es lo que identifica el proyecto del cliente dentro del producto.' },
    ramo: { type: Type.STRING, enum: RAMOS, description: 'Ramo del seguro' },
    moneda: { type: Type.STRING, enum: MONEDAS, description: 'Moneda en que está denominada la prima y la suma asegurada. UDI = "Unidades de Inversión"/UDIS, frecuente en dotales tipo Orvi o Star Dotal.' },
    primaAnual: { type: Type.NUMBER, description: 'Prima anual TOTAL, en la moneda del campo "moneda" (sin convertir). Si la póliza no imprime un total y solo trae la tabla de primas por cobertura, deja este campo vacío y llena "primaInicial" en cada cobertura: la suma la hace el sistema.' },
    sumaAsegurada: { type: Type.NUMBER, description: 'Suma asegurada principal, en la moneda del campo "moneda"' },
    plazo: { type: Type.STRING, description: 'Plazo de pago de primas tal como lo indica la póliza, ej. "20 pagos", "Anual renovable"' },
    formaPago: { type: Type.STRING, enum: FORMAS_PAGO, description: 'Periodicidad de pago de la prima' },
    deducible: { type: Type.NUMBER, description: 'Deducible en MXN, solo si es GMM/Salud' },
    coaseguro: { type: Type.STRING, description: 'Coaseguro tal como aparece, ej. "10% tope $50,000", solo si es GMM/Salud' },
    fechaEmision: { type: Type.STRING, description: 'Fecha de emisión / expedición de la póliza, formato YYYY-MM-DD' },
    fechaInicioVigencia: { type: Type.STRING, description: 'Inicio de vigencia (también "vigencia desde", "desde las 12 horas del"), formato YYYY-MM-DD' },
    fechaFinVigencia: { type: Type.STRING, description: 'Fin de vigencia. En la carátula suele venir junto a la fecha de emisión y con otros nombres: "fecha de vencimiento", "vigencia hasta", "vence el", "fin de vigencia", "hasta las 12 horas del". SIEMPRE búscala explícitamente: casi todas las carátulas la traen. Formato YYYY-MM-DD.' },
    numeroPoliza: { type: Type.STRING, description: 'Número de póliza asignado por la aseguradora' },
    asegurado: { type: Type.STRING, description: 'Nombre completo del asegurado tal como aparece en la carátula' },
    coberturas: {
      type: Type.ARRAY,
      description: 'TODAS las filas de la tabla de coberturas de la póliza (la básica —suele aparecer como "VM" o "Vida Mujer"/cobertura básica— y todas las adicionales/riders), en el mismo orden en que vienen impresas.',
      items: {
        type: Type.OBJECT,
        properties: {
          nombre: { type: Type.STRING },
          detalle: { type: Type.STRING, description: 'Descripción breve si la póliza la da' },
          monto: { type: Type.STRING, description: 'Suma asegurada de esa cobertura como texto, ej. "$800,000" o "Incluida"' },
          primaInicial: {
            type: Type.NUMBER,
            description: 'Valor de la columna "PRIMA INICIAL" (o "prima", "prima anual") de ESA fila de la tabla, como número y en la moneda del campo "moneda" de la póliza (frecuentemente UDIS). Ej. 2174.53. Es el dato clave: la suma de esta columna en todas las filas es la prima anual total de la póliza.',
          },
        },
        required: ['nombre'],
      },
    },
    beneficiarios: {
      type: Type.ARRAY,
      description: 'Beneficiarios listados, si la póliza los incluye',
      items: {
        type: Type.OBJECT,
        properties: {
          nombre: { type: Type.STRING, description: 'Nombre y parentesco si se indica' },
          porcentaje: { type: Type.NUMBER },
        },
        required: ['nombre'],
      },
    },
    confianza: {
      type: Type.STRING,
      enum: ['ALTA', 'MEDIA', 'BAJA'],
      description: 'Qué tan seguro estás de la lectura completa del documento (BAJA si el PDF está borroso, incompleto o es de otro tipo de documento)',
    },
    advertencias: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Campos que no pudiste leer con certeza o que parecen inconsistentes',
    },
  },
  required: ['confianza'],
};

const INSTRUCCION = `Eres un asistente que lee pólizas de seguros de vida/GMM emitidas por
Seguros Monterrey New York Life (SMNYL) para una promotoría en México y extrae
los datos de la carátula y las tablas de coberturas hacia un JSON estructurado.

Puedes recibir VARIOS documentos de una MISMA póliza (carátula, tabla de primas,
anexos, condiciones): trátalos como un solo expediente y combina la información
de todos en un único JSON. Un dato que falta en la carátula suele estar en otro
de los documentos — búscalo ahí antes de omitirlo. Si dos documentos se
contradicen, usa el de la carátula y anótalo en advertencias.

Reglas:
- Si un dato no aparece en NINGUNO de los documentos, omite esa propiedad (no
  inventes valores).
- Los montos van como número, sin el símbolo de moneda ni comas.
- Las fechas van en formato YYYY-MM-DD.
- "moneda" es la denominación de la póliza (MXN, USD o UDI, esta última es
  "Unidades de Inversión", frecuente en productos dotales tipo Orvi/Star Dotal).
- FECHAS: la carátula casi siempre trae la fecha de emisión Y la de vencimiento
  (fin de vigencia). Extrae LAS DOS; no devuelvas solo la de emisión.
- TABLA DE PRIMAS: cuando la póliza traiga una tabla con una columna de prima
  por cobertura ("PRIMA INICIAL" u homóloga), copia el valor de cada fila en
  "primaInicial" de la cobertura correspondiente, tal como está impreso y en la
  moneda de la póliza. Incluye la fila de la cobertura básica (a veces marcada
  "VM") y todas las adicionales. NO sumes tú la columna: el sistema hace la
  suma para obtener la prima anual. Solo llena "primaAnual" si el documento
  imprime explícitamente un total.
- Si el documento no es una póliza de seguro (o no se puede leer con
  confianza razonable), pon confianza "BAJA" y explica por qué en advertencias.
- No incluyas datos personales sensibles que no pidan los campos del schema.`;

// Lee los PDF ya guardados en /uploads y devuelve los campos extraídos.
// `archivos` es una lista de { ruta, mime }: una póliza real llega repartida
// entre carátula, tabla de primas y anexos, y se mandan JUNTOS en la misma
// petición para que el modelo pueda cruzarlos (la prima de un documento con el
// producto de otro) en vez de analizar cada uno a ciegas.
//
// Lanza si no hay API key configurada o si Gemini falla — el llamador decide
// cómo responder (503 / 502), nunca se guarda nada automáticamente aquí.
export async function analizarPolizaPdf(archivos) {
  const ai = clienteGemini();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY no configurada: el análisis automático está deshabilitado.');
    err.codigo = 'SIN_API_KEY';
    throw err;
  }
  const lista = (Array.isArray(archivos) ? archivos : [archivos]).filter(Boolean);
  if (!lista.length) {
    const err = new Error('No se recibió ningún documento para analizar.');
    err.codigo = 'SIN_ARCHIVOS';
    throw err;
  }
  const documentos = lista.map((a) => ({
    mime: a.mime || 'application/pdf',
    base64: fs.readFileSync(a.ruta).toString('base64'),
  }));

  const limite = Date.now() + PRESUPUESTO_MS;
  let ultimoError = null;
  for (const modelo of modelosCandidatos()) {
    // Cada intento se lleva lo que quede del presupuesto: si el primero se
    // colgó, no hay tiempo para el siguiente y se responde el error en vez de
    // dejar al asesor esperando otro tanto.
    const restante = limite - Date.now();
    if (restante <= 0) break;
    try {
      const datos = await pedirExtraccion(ai, modelo, documentos, restante);
      modeloVigente = modelo;
      return { datos, modelo };
    } catch (e) {
      ultimoError = e;
      if (vaANegarTodos(e)) throw e;
      console.warn(`[extraccionPoliza] "${modelo}" no sirvió (${e.codigo || e.status || e.message}); probando el siguiente`);
      if (modeloVigente === modelo) modeloVigente = null;
    }
  }
  throw ultimoError;
}

async function pedirExtraccion(ai, modelo, documentos, ms) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ms);
  let respuesta;
  try {
    respuesta = await ai.models.generateContent({
      model: modelo,
      contents: [{
        role: 'user',
        parts: [
          { text: INSTRUCCION },
          ...(documentos.length > 1
            ? [{ text: `Recibirás ${documentos.length} documentos de la MISMA póliza. Combínalos en un solo JSON.` }]
            : []),
          ...documentos.map((d) => ({ inlineData: { mimeType: d.mime, data: d.base64 } })),
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_EXTRACCION,
        temperature: 0,
        abortSignal: corte.signal,
      },
    });
  } catch (e) {
    if (corte.signal.aborted) {
      const err = new Error(`"${modelo}" no respondió en ${Math.round(ms / 1000)} s.`);
      err.codigo = 'TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(reloj);
  }

  const texto = respuesta.text;
  if (!texto) {
    const err = new Error('Gemini no devolvió contenido para este documento.');
    err.codigo = 'SIN_RESPUESTA';
    throw err;
  }
  try {
    return JSON.parse(texto);
  } catch {
    const err = new Error('La respuesta del modelo no fue JSON válido.');
    err.codigo = 'JSON_INVALIDO';
    throw err;
  }
}
