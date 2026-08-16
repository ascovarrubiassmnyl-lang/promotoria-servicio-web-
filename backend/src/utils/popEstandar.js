// Cuestionario POP ESTÁNDAR de la promotoría, listo para enviar sin que nadie
// tenga que capturarlo. La promotora no debe perder tiempo armando preguntas:
// abre la ficha del candidato, oprime "Enviar POP" y sale el link.
//
// Las 12 preguntas son las mismas que aplica SMNYL en su "POP Screen" (sección
// "Información general"), replicadas aquí para dejar de depender de la
// compañía. Lo que NO se replica es su algoritmo: el POP Screen lo califica un
// tercero (Selection Testing Consultants) con un modelo propietario que no
// conocemos. Los puntos de cada opción son criterio propio de la promotoría
// —transparente y auditable, en utils/pop.js— y se pueden ajustar editando
// este archivo (o el cuestionario desde la UI, que crea su propia copia).
//
// Los bloques son los del "Gráfico del Potencial de Ventas" del reporte
// oficial, para que el desglose se lea igual que el que ya conocen.

export const BLOQUE_ADN = 'ADN en Ventas';
export const BLOQUE_EXPERIENCIA = 'Experiencia';
export const BLOQUE_CARRERA = 'Compatibilidad con la Carrera';

export const NOMBRE_POP_ESTANDAR = 'POP · Potencial de ventas';

export const DESCRIPCION_POP_ESTANDAR =
  'Cuestionario de la promotoría para medir tu potencial en una carrera de servicios financieros. '
  + 'Son 12 preguntas y no hay respuestas correctas o incorrectas: contesta con lo que realmente aplica a ti. '
  + 'Toma menos de 10 minutos.';

// `id` estable por pregunta y por opción: si mañana se reordenan o se cambia
// el texto, los POP ya contestados siguen siendo legibles (guardan su copia
// congelada, pero los ids permiten comparar entre versiones).
export const PREGUNTAS_POP_ESTANDAR = [
  {
    id: 'escolaridad',
    bloque: BLOQUE_CARRERA,
    tipo: 'OPCION',
    texto: '¿Cuál es el mayor nivel de escolaridad que has obtenido?',
    opciones: [
      { id: 'e1', texto: 'Secundaria o menos', puntos: 2 },
      { id: 'e2', texto: 'Preparatoria o bachillerato', puntos: 5 },
      { id: 'e3', texto: 'Carrera técnica', puntos: 7 },
      { id: 'e4', texto: 'Licenciatura o Postgrado', puntos: 10 },
    ],
  },
  {
    id: 'ingresos',
    bloque: BLOQUE_EXPERIENCIA,
    tipo: 'OPCION',
    texto: '¿Cuáles son tus ingresos mensuales?',
    ayuda: 'Considera tu ingreso total antes de impuestos.',
    opciones: [
      { id: 'i1', texto: 'Menos de $10,000.00', puntos: 3 },
      { id: 'i2', texto: 'De $10,001.00 a $20,000.00', puntos: 6 },
      { id: 'i3', texto: 'De $20,001.00 a $50,000.00', puntos: 10 },
      { id: 'i4', texto: 'De $50,001.00 a $100,000.00', puntos: 8 },
      { id: 'i5', texto: 'Más de $100,000.00', puntos: 5 },
    ],
  },
  {
    id: 'fuentes_ingreso',
    bloque: BLOQUE_EXPERIENCIA,
    tipo: 'OPCION',
    texto: '¿Cuántas fuentes de ingresos tienes actualmente?',
    opciones: [
      { id: 'f0', texto: 'Ninguna', puntos: 2 },
      { id: 'f1', texto: '1', puntos: 6 },
      { id: 'f2', texto: '2', puntos: 10 },
      { id: 'f3', texto: '3 o más', puntos: 8 },
    ],
  },
  {
    id: 'rol_laboral',
    bloque: BLOQUE_ADN,
    tipo: 'OPCION',
    texto: 'Entre las categorías siguientes, ¿cuál describiría mejor tu rol laboral actual?',
    opciones: [
      { id: 'r1', texto: 'Empleado(a)', puntos: 6 },
      { id: 'r2', texto: 'Empleado(a) con personal a mi cargo', puntos: 8 },
      { id: 'r3', texto: 'Vendedor(a) o asesor(a) comercial', puntos: 10 },
      { id: 'r4', texto: 'Dueño(a) de negocio o independiente', puntos: 9 },
      { id: 'r5', texto: 'Estudiante', puntos: 4 },
      { id: 'r6', texto: 'Sin empleo en este momento', puntos: 3 },
    ],
  },
  {
    id: 'estudio_trabajo',
    bloque: BLOQUE_CARRERA,
    tipo: 'OPCION',
    texto: 'Si eres estudiante y tienes trabajo, ¿qué tan relacionado está tu trabajo con tus estudios?',
    ayuda: 'Si no eres estudiante, elige la última opción.',
    opciones: [
      { id: 'et1', texto: 'Nada relacionado', puntos: 3 },
      { id: 'et2', texto: 'Poco relacionado', puntos: 5 },
      { id: 'et3', texto: 'Muy relacionado', puntos: 8 },
      { id: 'et4', texto: 'No soy estudiante', puntos: 8 },
    ],
  },
  {
    id: 'interes_financieros',
    bloque: BLOQUE_CARRERA,
    tipo: 'OPCION',
    texto: 'En una escala del 1 (mínimo) al 10 (máximo), ¿cuál es tu nivel de interés, en este momento, en tener una carrera dentro de los servicios financieros?',
    opciones: [
      { id: 'n12', texto: '1 a 2 · Prácticamente nulo', puntos: 0 },
      { id: 'n34', texto: '3 a 4 · Bajo', puntos: 3 },
      { id: 'n56', texto: '5 a 6 · Medio, lo estoy explorando', puntos: 6 },
      { id: 'n78', texto: '7 a 8 · Alto', puntos: 12 },
      { id: 'n910', texto: '9 a 10 · Es justo lo que busco', puntos: 15 },
    ],
  },
  {
    id: 'razon_cambio',
    bloque: BLOQUE_ADN,
    tipo: 'OPCION',
    texto: '¿Cuál es la razón principal por la cual estás considerando cambiar de trabajo?',
    opciones: [
      { id: 'rc1', texto: 'Necesito más ganancias', puntos: 10 },
      { id: 'rc2', texto: 'Quiero crecer profesionalmente', puntos: 10 },
      { id: 'rc3', texto: 'Busco independencia y manejar mi tiempo', puntos: 9 },
      { id: 'rc4', texto: 'No estoy a gusto en mi trabajo actual', puntos: 5 },
      { id: 'rc5', texto: 'Me quedé sin empleo', puntos: 4 },
      { id: 'rc6', texto: 'No estoy considerando cambiar de trabajo', puntos: 2 },
    ],
  },
  {
    id: 'expectativa_ingreso',
    bloque: BLOQUE_ADN,
    tipo: 'OPCION',
    texto: '¿Cuánto crees que un profesional de ventas de seguros con un nivel mediano de experiencia gane anualmente?',
    opciones: [
      { id: 'ei1', texto: 'Menos que profesionales de ventas de otras industrias', puntos: 3 },
      { id: 'ei2', texto: 'Igual que profesionales de ventas de otras industrias', puntos: 6 },
      { id: 'ei3', texto: 'Más que profesionales de ventas de otras industrias', puntos: 10 },
      { id: 'ei4', texto: 'No tengo idea', puntos: 4 },
    ],
  },
  {
    id: 'permanencia',
    bloque: BLOQUE_EXPERIENCIA,
    tipo: 'OPCION',
    texto: '¿Cuál fue el periodo más largo en el que trabajaste por tiempo completo para la misma organización o para ti mismo(a)?',
    opciones: [
      { id: 'p1', texto: 'Menos de 1 año', puntos: 2 },
      { id: 'p2', texto: 'De 1 a 2 años', puntos: 5 },
      { id: 'p3', texto: 'De 3 a 5 años', puntos: 8 },
      { id: 'p4', texto: 'Más de 5 años', puntos: 10 },
    ],
  },
  {
    id: 'ascenso',
    bloque: BLOQUE_EXPERIENCIA,
    tipo: 'OPCION',
    texto: '¿Cómo evaluarías tus posibilidades de ascenso en tu trabajo actual?',
    opciones: [
      { id: 'a1', texto: 'Nulas', puntos: 10 },
      { id: 'a2', texto: 'Limitadas', puntos: 8 },
      { id: 'a3', texto: 'Buenas', puntos: 5 },
      { id: 'a4', texto: 'Excelentes', puntos: 3 },
    ],
  },
  {
    id: 'horas_semana',
    bloque: BLOQUE_ADN,
    tipo: 'OPCION',
    texto: '¿Cuántas horas a la semana trabajas actualmente?',
    ayuda: 'Si trabajas medio tiempo o estás sin empleo en este momento, usa tu trabajo más reciente como referencia.',
    opciones: [
      { id: 'h1', texto: 'Menos de 20 horas', puntos: 3 },
      { id: 'h2', texto: 'Entre 20 y 35 horas', puntos: 6 },
      { id: 'h3', texto: 'Entre 36 y 44 horas', puntos: 9 },
      { id: 'h4', texto: 'Más de 44 horas', puntos: 10 },
    ],
  },
  {
    id: 'incremento_salario',
    bloque: BLOQUE_EXPERIENCIA,
    tipo: 'OPCION',
    texto: '¿Has incrementado tu salario en los últimos 5 años?',
    opciones: [
      { id: 's0', texto: 'No he tenido ningún incremento', puntos: 4 },
      { id: 's1', texto: 'Incremento del 1% al 15%', puntos: 6 },
      { id: 's2', texto: 'Incremento del 16% al 30%', puntos: 9 },
      { id: 's3', texto: 'Incremento mayor al 30%', puntos: 10 },
    ],
  },
];

// Umbrales del semáforo (mismos colores del reporte oficial: verde
// "Proceder", ámbar "Precaución", rojo "No proceder").
//
// Calibrados contra la escala real de este cuestionario, no a ojo: como
// ninguna pregunta puede valer 0 en todas sus opciones, el piso alcanzable es
// ~24/100 y no 0. Con los umbrales genéricos (70/40) casi cualquier perfil
// salía verde. Referencias medidas: eligiendo siempre la mejor opción = 100;
// siempre la segunda mejor = 83; siempre la peor = 24.
export const UMBRAL_VERDE_ESTANDAR = 85;
export const UMBRAL_AMARILLO_ESTANDAR = 62;
