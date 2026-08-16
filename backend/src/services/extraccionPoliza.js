import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';

// Analiza el PDF de una póliza emitida por la aseguradora y devuelve los
// campos de la ficha técnica ya en la forma que espera PolizaFormModal —
// mismo shape que el formulario manual, para que el frontend pueda prellenar
// el mismo modal sin traducir nada aparte.
//
// Modelo: Gemini 2.5 Flash (nivel gratuito, lee el PDF nativo sin rasterizar
// a imagen). Requiere GEMINI_API_KEY en .env; sin ella, analizarPolizaPdf
// lanza y la ruta que la llama responde 503 — subir/ver/descargar el PDF
// sigue funcionando igual, el análisis es un extra sobre eso.
export const MODELO_EXTRACCION = 'gemini-2.5-flash';

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
    producto: { type: Type.STRING, description: 'Nombre comercial del producto/plan tal como aparece en la carátula de la póliza' },
    ramo: { type: Type.STRING, enum: RAMOS, description: 'Ramo del seguro' },
    moneda: { type: Type.STRING, enum: MONEDAS, description: 'Moneda en que está denominada la prima y la suma asegurada' },
    primaAnual: { type: Type.NUMBER, description: 'Prima anual total, en la moneda del campo "moneda" (sin convertir)' },
    sumaAsegurada: { type: Type.NUMBER, description: 'Suma asegurada principal, en la moneda del campo "moneda"' },
    plazo: { type: Type.STRING, description: 'Plazo de pago de primas tal como lo indica la póliza, ej. "20 pagos", "Anual renovable"' },
    formaPago: { type: Type.STRING, enum: FORMAS_PAGO, description: 'Periodicidad de pago de la prima' },
    deducible: { type: Type.NUMBER, description: 'Deducible en MXN, solo si es GMM/Salud' },
    coaseguro: { type: Type.STRING, description: 'Coaseguro tal como aparece, ej. "10% tope $50,000", solo si es GMM/Salud' },
    fechaEmision: { type: Type.STRING, description: 'Fecha de emisión de la póliza, formato YYYY-MM-DD' },
    fechaInicioVigencia: { type: Type.STRING, description: 'Inicio de vigencia, formato YYYY-MM-DD' },
    fechaFinVigencia: { type: Type.STRING, description: 'Fin de vigencia, formato YYYY-MM-DD' },
    numeroPoliza: { type: Type.STRING, description: 'Número de póliza asignado por la aseguradora' },
    asegurado: { type: Type.STRING, description: 'Nombre completo del asegurado tal como aparece en la carátula' },
    coberturas: {
      type: Type.ARRAY,
      description: 'Coberturas listadas en la póliza (básica y adicionales/riders)',
      items: {
        type: Type.OBJECT,
        properties: {
          nombre: { type: Type.STRING },
          detalle: { type: Type.STRING, description: 'Descripción breve si la póliza la da' },
          monto: { type: Type.STRING, description: 'Suma asegurada de esa cobertura como texto, ej. "$800,000" o "Incluida"' },
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

Reglas:
- Si un dato no aparece en el documento, omite esa propiedad (no inventes valores).
- Los montos van como número, sin el símbolo de moneda ni comas.
- Las fechas van en formato YYYY-MM-DD.
- "moneda" es la denominación de la póliza (MXN, USD o UDI, esta última es
  "Unidades de Inversión", frecuente en productos dotales tipo Orvi/Star Dotal).
- Si el documento no es una póliza de seguro (o no se puede leer con
  confianza razonable), pon confianza "BAJA" y explica por qué en advertencias.
- No incluyas datos personales sensibles que no pidan los campos del schema.`;

// Lee el PDF ya guardado en /uploads y devuelve los campos extraídos.
// Lanza si no hay API key configurada o si Gemini falla — el llamador decide
// cómo responder (503 / 502), nunca se guarda nada automáticamente aquí.
export async function analizarPolizaPdf(rutaAbsoluta, { mime = 'application/pdf' } = {}) {
  const ai = clienteGemini();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY no configurada: el análisis automático está deshabilitado.');
    err.codigo = 'SIN_API_KEY';
    throw err;
  }
  const bytes = fs.readFileSync(rutaAbsoluta);
  const base64 = bytes.toString('base64');

  const respuesta = await ai.models.generateContent({
    model: MODELO_EXTRACCION,
    contents: [{
      role: 'user',
      parts: [
        { text: INSTRUCCION },
        { inlineData: { mimeType: mime || 'application/pdf', data: base64 } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMA_EXTRACCION,
      temperature: 0,
    },
  });

  const texto = respuesta.text;
  if (!texto) {
    const err = new Error('Gemini no devolvió contenido para este documento.');
    err.codigo = 'SIN_RESPUESTA';
    throw err;
  }
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    const err = new Error('La respuesta del modelo no fue JSON válido.');
    err.codigo = 'JSON_INVALIDO';
    throw err;
  }
  return { datos, modelo: MODELO_EXTRACCION };
}
