// Motor del POP propio de la promotoría: validación de plantillas y cálculo
// del puntaje. ÚNICA implementación de la regla (función pura, sin BD), mismo
// criterio que utils/semaforoCandidato.js — si la promotora cambia cómo se
// califica, se ajusta SOLO aquí.
//
// Esto NO replica el POP Screen de SMNYL: aquel lo aplica un tercero
// (Selection Testing Consultants) con instrumento y algoritmo propietarios.
// Aquí la promotora define sus preguntas y cuántos puntos vale cada opción, y
// el puntaje es la suma de lo elegido normalizada a 0–100 contra el máximo
// alcanzable. Transparente y auditable, no una caja negra.

export const TIPOS_PREGUNTA = ['OPCION', 'ESCALA', 'TEXTO'];

// Bloques sugeridos (espejo del reporte oficial, que agrupa las barras en
// "ADN en Ventas", "Experiencia" y "Compatibilidad con la Oportunidad de
// Carrera"). Es solo una etiqueta de agrupación: la promotora puede escribir
// la que quiera y el desglose se arma con los bloques que realmente aparezcan.
export const BLOQUE_LIBRE = 'General';

const esTextoUtil = (v) => typeof v === 'string' && v.trim().length > 0;

// Normaliza y valida el arreglo de preguntas de una plantilla. Devuelve
// { error } o { preguntas } ya saneadas (ids garantizados, puntos enteros).
export function validarPreguntas(entrada) {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { error: 'El cuestionario necesita al menos una pregunta' };
  }
  if (entrada.length > 100) return { error: 'Máximo 100 preguntas por cuestionario' };

  const preguntas = [];
  const idsVistos = new Set();

  for (const [i, p] of entrada.entries()) {
    const n = i + 1;
    if (!esTextoUtil(p?.texto)) return { error: `La pregunta ${n} necesita texto` };
    const tipo = TIPOS_PREGUNTA.includes(p?.tipo) ? p.tipo : 'OPCION';

    const id = esTextoUtil(p?.id) ? p.id.trim() : `p${n}`;
    if (idsVistos.has(id)) return { error: `La pregunta ${n} tiene un id repetido` };
    idsVistos.add(id);

    const pregunta = {
      id,
      texto: p.texto.trim(),
      ayuda: esTextoUtil(p?.ayuda) ? p.ayuda.trim() : null,
      bloque: esTextoUtil(p?.bloque) ? p.bloque.trim() : BLOQUE_LIBRE,
      tipo,
      opciones: [],
    };

    // Las preguntas de TEXTO son abiertas: se guardan como contexto para que
    // la promotora las lea, pero no suman puntos (no hay forma objetiva de
    // calificar texto libre y no queremos que el puntaje dependa de eso).
    if (tipo !== 'TEXTO') {
      if (!Array.isArray(p?.opciones) || p.opciones.length < 2) {
        return { error: `La pregunta ${n} necesita al menos 2 opciones de respuesta` };
      }
      if (p.opciones.length > 10) return { error: `La pregunta ${n} tiene demasiadas opciones (máximo 10)` };
      const idsOpcion = new Set();
      for (const [j, o] of p.opciones.entries()) {
        if (!esTextoUtil(o?.texto)) return { error: `La opción ${j + 1} de la pregunta ${n} necesita texto` };
        const puntos = Number(o?.puntos);
        if (!Number.isInteger(puntos) || puntos < 0 || puntos > 100) {
          return { error: `Los puntos de la opción ${j + 1} de la pregunta ${n} deben ser un entero de 0 a 100` };
        }
        const oid = esTextoUtil(o?.id) ? o.id.trim() : `o${j + 1}`;
        if (idsOpcion.has(oid)) return { error: `La pregunta ${n} tiene una opción con id repetido` };
        idsOpcion.add(oid);
        pregunta.opciones.push({ id: oid, texto: o.texto.trim(), puntos });
      }
    }
    preguntas.push(pregunta);
  }

  // Un cuestionario donde todo vale 0 no puede producir un puntaje: sería una
  // división entre cero disfrazada de resultado "0 de 0".
  const maximo = puntosPosibles(preguntas);
  if (maximo <= 0) {
    return { error: 'Al menos una opción debe otorgar puntos mayores a 0 para poder calificar' };
  }
  return { preguntas };
}

// Máximo alcanzable: la opción de mayor puntaje de cada pregunta calificable.
export function puntosPosibles(preguntas) {
  return (preguntas || []).reduce((total, p) => {
    if (p.tipo === 'TEXTO' || !p.opciones?.length) return total;
    return total + Math.max(...p.opciones.map((o) => o.puntos));
  }, 0);
}

// Umbrales: verde ≥ umbralVerde, amarillo ≥ umbralAmarillo, si no rojo. Se
// valida que estén ordenados para que no exista una franja imposible.
export function validarUmbrales(verde, amarillo) {
  const v = Number(verde);
  const a = Number(amarillo);
  if (!Number.isInteger(v) || !Number.isInteger(a)) return { error: 'Los umbrales deben ser números enteros' };
  if (v < 1 || v > 100 || a < 0 || a > 100) return { error: 'Los umbrales deben estar entre 0 y 100' };
  if (a >= v) return { error: 'El umbral verde debe ser mayor que el amarillo' };
  return { umbralVerde: v, umbralAmarillo: a };
}

export function recomendacionDesdePuntaje(puntaje, { umbralVerde = 70, umbralAmarillo = 40 } = {}) {
  if (puntaje >= umbralVerde) return 'PROCEDER';
  if (puntaje >= umbralAmarillo) return 'PRECAUCION';
  return 'NO_PROCEDER';
}

// Califica las respuestas del candidato contra la copia congelada de las
// preguntas del envío. El puntaje SIEMPRE se deriva aquí en el servidor: lo
// que manda el navegador es solo qué opción eligió, nunca cuántos puntos vale.
//
// `respuestas` de entrada: [{ preguntaId, opcionId?, texto? }]
// Devuelve { error } o el resultado completo listo para persistir.
export function calificar(preguntas, respuestas, umbrales) {
  const porId = new Map((preguntas || []).map((p) => [p.id, p]));
  const dadas = new Map();
  for (const r of Array.isArray(respuestas) ? respuestas : []) {
    if (r?.preguntaId) dadas.set(r.preguntaId, r);
  }

  const limpias = [];
  // Acumulador por bloque para el desglose tipo "ADN en Ventas".
  const porBloque = new Map();

  for (const p of preguntas || []) {
    const r = dadas.get(p.id);
    if (p.tipo === 'TEXTO') {
      limpias.push({ preguntaId: p.id, texto: esTextoUtil(r?.texto) ? r.texto.trim().slice(0, 2000) : '', puntos: 0 });
      continue;
    }
    const opcion = p.opciones.find((o) => o.id === r?.opcionId);
    // Todas las preguntas calificables son obligatorias: dejar una en blanco
    // haría que el puntaje normalizado no fuera comparable entre candidatos.
    if (!opcion) return { error: `Falta responder: "${p.texto}"` };

    limpias.push({ preguntaId: p.id, opcionId: opcion.id, puntos: opcion.puntos });

    const bloque = p.bloque || BLOQUE_LIBRE;
    const acc = porBloque.get(bloque) || { bloque, puntos: 0, posibles: 0 };
    acc.puntos += opcion.puntos;
    acc.posibles += Math.max(...p.opciones.map((o) => o.puntos));
    porBloque.set(bloque, acc);
  }

  const posibles = puntosPosibles(preguntas);
  if (posibles <= 0) return { error: 'El cuestionario no tiene preguntas que otorguen puntos' };

  const obtenidos = limpias.reduce((s, r) => s + (r.puntos || 0), 0);
  const puntaje = Math.round((obtenidos / posibles) * 100);

  const bloques = [...porBloque.values()].map((b) => ({
    ...b,
    porcentaje: b.posibles > 0 ? Math.round((b.puntos / b.posibles) * 100) : 0,
  }));

  return {
    respuestas: limpias,
    puntosObtenidos: obtenidos,
    puntosPosibles: posibles,
    puntaje,
    recomendacion: recomendacionDesdePuntaje(puntaje, umbrales),
    bloques,
  };
}
