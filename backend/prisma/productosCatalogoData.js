// Catálogo de productos SMNYL (fuente: bóveda Obsidian, 10_Seguros_SMYNL/Productos).
// Compartido entre el seed de desarrollo (seed.js) y el script one-off de
// producción (scripts/seed-productos-catalogo.mjs) para no duplicar la lista.
//
// `coberturas`: mismo shape que Venta.coberturas ([{nombre, detalle, monto}]) para
// poder copiarse directo al formulario de póliza (PolizaFormModal). `monto` es una
// etiqueta breve de costo (el costo real depende de edad/suma asegurada/salud, no
// se puede fijar en el catálogo): 'Incluida' | 'Costo adicional' | 'Costo adicional,
// opcional' | 'Costo adicional, obligatoria' | 'Costo adicional (aportación)'.

// Orvi 99 — coberturas compartidas por las 6 variantes de vida vitalicio.
const COBERTURAS_ORVI = [
  { nombre: 'Fallecimiento', detalle: 'Pago de la suma asegurada a los beneficiarios si el asegurado fallece durante la vigencia.', monto: 'Incluida' },
  { nombre: 'AV — Apoyo en Vida', detalle: 'Anticipa 25% de la suma asegurada si se diagnostica una enfermedad terminal (infarto, cáncer, insuficiencia renal crónica, etc.).', monto: 'Incluida' },
  { nombre: 'BAM — Asistencia Médica en EE.UU.', detalle: 'Asesoría para elegir médicos/hospitales y trámite de segunda opinión médica en Estados Unidos.', monto: 'Incluida' },
  { nombre: 'BIT — Exención de primas por invalidez', detalle: 'Exime del pago de primas del seguro básico si el asegurado sufre invalidez total y permanente.', monto: 'Costo adicional' },
  { nombre: 'BAIT — Pago de suma asegurada por invalidez', detalle: 'Paga la suma asegurada (una exhibición o 24 mensualidades) si hay invalidez total y permanente.', monto: 'Costo adicional' },
  { nombre: 'BITAE — Pago de SA y exención de primas por invalidez', detalle: 'Combina BAIT y BIT: paga la suma asegurada y además exime del pago de primas durante la invalidez.', monto: 'Costo adicional' },
  { nombre: 'BMA — Muerte Accidental', detalle: 'Paga una suma adicional a los beneficiarios si el fallecimiento es por accidente; se duplica en accidente colectivo.', monto: 'Costo adicional' },
  { nombre: 'DI — Doble Indemnización', detalle: 'Indemnización por pérdidas orgánicas por accidente, además del pago por fallecimiento accidental; se duplica en accidente colectivo.', monto: 'Costo adicional' },
  { nombre: 'Adapta', detalle: 'Incrementa la protección por fallecimiento a bajo costo; permite asegurar también a cónyuge, hijos o padres en la misma póliza.', monto: 'Costo adicional' },
  { nombre: 'BIT Adapta', detalle: 'Exención de pago de primas de la cobertura Adapta si el asegurado sufre invalidez total y permanente.', monto: 'Costo adicional' },
  { nombre: 'AVE / AVE CP — Aumento de Valor en Efectivo', detalle: 'Genera ahorro adicional e incrementa el valor en efectivo/suma asegurada mediante aportaciones extra.', monto: 'Costo adicional (aportación)' },
];

const COBERTURAS_VIDA_MUJER = [
  { nombre: 'Fallecimiento (básica, dotal)', detalle: 'Protección por fallecimiento (100% de la SA) más anticipos periódicos por supervivencia (dotales) del 5% cada 2 años y 80% al año 20.', monto: 'Incluida' },
  { nombre: 'AV — Apoyo en Vida', detalle: 'Anticipa 25% de la SA (tope $700,000 MXN) si se diagnostica enfermedad terminal.', monto: 'Incluida' },
  { nombre: 'BAM — Asistencia Médica en EE.UU.', detalle: 'Asesoría de médicos/hospitales, segunda opinión y traductores en Estados Unidos para padecimientos graves.', monto: 'Incluida' },
  { nombre: 'PCF — Protección por Cáncer Femenino', detalle: 'Paga % de la SA según el padecimiento (mama, ovario, útero, etc.), con 6 meses de carencia.', monto: 'Costo adicional, obligatoria' },
  { nombre: 'BIT-C — Invalidez o fallecimiento del contratante', detalle: 'Si el contratante (persona distinta a la asegurada) queda inválido o fallece, se cubren las primas del seguro básico.', monto: 'Costo adicional, obligatoria' },
  { nombre: 'PEP — Complicaciones del embarazo y padecimientos femeninos', detalle: 'Paga % de la SA por parto prematuro, eclampsia, embarazo ectópico y otras complicaciones específicas.', monto: 'Costo adicional, opcional' },
  { nombre: 'PII — Pérdida del ingreso por invalidez temporal', detalle: 'Renta mensual hasta 12 meses si hay invalidez total y temporal por accidente o enfermedad.', monto: 'Costo adicional, opcional' },
  { nombre: 'CLP — Cuidados a Largo Plazo', detalle: 'Paga la SA si el asegurado no puede realizar por sí mismo al menos 3 de 6 actividades básicas de la vida diaria.', monto: 'Costo adicional, opcional' },
  { nombre: 'CPV — Protección por Viudez', detalle: 'Protección independiente si fallece el cónyuge de la asegurada; incluye AV y BAM adicionales.', monto: 'Costo adicional, opcional' },
  { nombre: 'Adapta', detalle: 'Protección adicional por fallecimiento a menor costo, convertible sin requisitos médicos tras 2 años.', monto: 'Costo adicional, opcional' },
  { nombre: 'BIT — Exención de primas por invalidez', detalle: 'Exime del pago de primas del seguro básico si la asegurada queda inválida total y permanente.', monto: 'Costo adicional, opcional' },
  { nombre: 'BAIT — Pago de SA por invalidez', detalle: 'Paga la SA en 24 mensualidades o una exhibición por invalidez total/permanente (tope $6,500,000 MXN).', monto: 'Costo adicional, opcional' },
  { nombre: 'BITAE — Pago de SA y exención de primas por invalidez', detalle: 'Combina BAIT y exención de primas del seguro básico.', monto: 'Costo adicional, opcional' },
  { nombre: 'BMA — Muerte Accidental', detalle: 'Paga la SA si el fallecimiento ocurre por accidente dentro de 90 días; se duplica en accidente colectivo.', monto: 'Costo adicional, opcional' },
  { nombre: 'DI — Doble Indemnización', detalle: 'SA por muerte accidental o indemnización por pérdidas orgánicas dentro de 90 días del accidente.', monto: 'Costo adicional, opcional' },
  { nombre: 'AVE — Aumento de Valor en Efectivo', detalle: 'Incrementa ahorro y protección por fallecimiento mediante aportaciones libres.', monto: 'Costo adicional (aportación)' },
];

const COBERTURAS_STAR_DOTAL = [
  { nombre: 'Protección por fallecimiento y supervivencia', detalle: 'Si el asegurado fallece dentro del plazo, los beneficiarios reciben la SA; si sobrevive al plazo, la recibe el propio asegurado.', monto: 'Incluida' },
  { nombre: 'AV — Apoyo en Vida', detalle: 'Anticipa 25% de la SA si se diagnostica una enfermedad terminal.', monto: 'Incluida' },
  { nombre: 'BAM — Asistencia Médica', detalle: 'Asesoría en trámites médicos y hospitalarios en EE.UU., con traductores.', monto: 'Incluida' },
  { nombre: 'BAIT — Pago de SA por invalidez', detalle: 'Paga la SA en una exhibición o 24 mensualidades por invalidez total y permanente.', monto: 'Costo adicional' },
  { nombre: 'BIT — Exención de primas por invalidez', detalle: 'Exime del pago de primas del seguro básico durante la invalidez total y permanente.', monto: 'Costo adicional, opcional' },
  { nombre: 'BMA — Muerte Accidental', detalle: 'Paga la SA al beneficiario si el contratante fallece por accidente; se duplica en accidente colectivo.', monto: 'Costo adicional, opcional' },
  { nombre: 'DI — Doble Indemnización', detalle: 'Indemnización por pérdidas orgánicas por accidente además del pago por fallecimiento accidental.', monto: 'Costo adicional, opcional' },
  { nombre: 'Adapta', detalle: 'Incrementa la protección por fallecimiento a bajo costo.', monto: 'Costo adicional, opcional' },
  { nombre: 'AVE — Aumento de Suma Asegurada', detalle: 'Genera ahorro adicional e incrementa el valor en efectivo/SA mediante aportaciones extra.', monto: 'Costo adicional (aportación)' },
  { nombre: 'Opción mancomunada', detalle: 'Permite asegurar al cónyuge en la misma póliza; al fallecer cualquiera de los dos se paga la SA correspondiente.', monto: 'Sin costo — opción de contratación' },
];

const COBERTURAS_SEGUBECA = [
  { nombre: 'Supervivencia', detalle: 'Entrega la SA contratada (el ahorro) el año en que el menor cumple 18 años.', monto: 'Incluida' },
  { nombre: 'Fallecimiento del menor', detalle: 'Si el menor fallece antes de los 12 años se devuelven las primas del ahorro pagadas; después, se paga la SA contratada.', monto: 'Incluida' },
  { nombre: 'Fallecimiento del contratante', detalle: 'Se paga la SA a beneficiarios y, al cumplir 18 el menor, se entrega también el ahorro (vía CPA/CPA OV/Adapta).', monto: 'Costo adicional' },
  { nombre: 'PPS — Protección Patrimonial SeguBeca', detalle: 'Permite contratar un nuevo seguro de vida sin requisitos de suscripción hasta 2 años antes del vencimiento.', monto: 'Incluida' },
  { nombre: 'AV — Anticipo por enfermedad terminal', detalle: 'Adelanta 25% de la SA del beneficio básico o de CPA/CPAOV.', monto: 'Incluida' },
  { nombre: 'BAM — Asistencia médica', detalle: 'Asesoría y traductores para trámites médicos en EE.UU.', monto: 'Incluida' },
  { nombre: 'Anticipo para gastos funerarios', detalle: 'Adelanto de hasta 15% de la SA del plan básico.', monto: 'Incluida' },
  { nombre: 'CGC — Certificado de Garantía de Contratación', detalle: 'Permite al menor adquirir su propio seguro de vida sin requisitos médicos a ciertas edades o eventos de vida (boda, hijo, casa, estudios).', monto: 'Incluida' },
  { nombre: 'CPA', detalle: 'Protección del contratante hasta que el menor cumple 18 años (también asegurable la pareja, costo adicional).', monto: 'Costo adicional' },
  { nombre: 'CPA OV', detalle: 'Protección del contratante de por vida.', monto: 'Costo adicional' },
  { nombre: 'Adapta', detalle: 'Protección por periodos de 5 años con renovación automática, convertible en nuevo seguro de vida entre el año 2 y 10.', monto: 'Costo adicional' },
  { nombre: 'PIM — Invalidez total y permanente del contratante', detalle: 'Cubre las primas restantes si el contratante queda inválido total y permanente.', monto: 'Costo adicional' },
  { nombre: 'BAIT — Pago de SA por invalidez', detalle: 'Paga la SA de invalidez en una exhibición o 24 mensualidades.', monto: 'Costo adicional' },
  { nombre: 'BMA — Muerte Accidental', detalle: 'SA al beneficiario si el contratante fallece por accidente; se duplica en accidente colectivo (excluyente con DI).', monto: 'Costo adicional, opcional' },
  { nombre: 'DI — Doble Indemnización', detalle: 'Igual que BMA más indemnización por pérdidas orgánicas; se duplica en accidente colectivo.', monto: 'Costo adicional, opcional' },
  { nombre: 'DES — Exención de primas por desempleo', detalle: 'Exime el pago total de la prima hasta 3 meses si el contratante queda desempleado sin causa justificada.', monto: 'Costo adicional, opcional' },
  { nombre: 'PII — Pérdida del ingreso por invalidez temporal', detalle: 'Renta mensual hasta 12 meses por invalidez total y temporal (se desactiva si se activa DES).', monto: 'Costo adicional, opcional' },
];

// Imagina Ser PPR — coberturas compartidas por las 6 variantes de retiro.
const COBERTURAS_IMAGINA_SER = [
  { nombre: 'Retiro (Supervivencia)', detalle: 'Al llegar a la edad de retiro elegida (60/65/70), entrega el ahorro generado en una sola exhibición o en rentas mensuales de por vida.', monto: 'Incluida' },
  { nombre: 'Fallecimiento (seguro de vida)', detalle: 'Si el asegurado fallece antes del retiro, los beneficiarios reciben la SA contratada (fondo más monto neto en riesgo).', monto: 'Incluida' },
  { nombre: 'Corredor', detalle: 'Garantiza que la SA por fallecimiento sea siempre al menos 5% mayor al valor del fondo, ajustándose automáticamente.', monto: 'Incluida' },
  { nombre: 'AV — Apoyo en Vida', detalle: 'Indemniza con 25% de la SA (tope $700,000 MXN) si se diagnostica una enfermedad terminal.', monto: 'Incluida' },
  { nombre: 'BAM — Asistencia Médica en EE.UU.', detalle: 'Asesoría para elegir médicos/hospitales y segunda opinión médica en Estados Unidos.', monto: 'Incluida' },
  { nombre: 'BIT — Exención de primas por invalidez', detalle: 'Cubre el pago de las primas básicas si el asegurado sufre invalidez total y permanente.', monto: 'Costo adicional, obligatoria si el asegurado es el mismo contratante (no prima única)' },
  { nombre: 'BITC — Exención por invalidez o muerte del contratante', detalle: 'Exenta el pago de las primas básicas si el contratante (persona distinta al asegurado) fallece o queda inválido.', monto: 'Costo adicional, obligatoria si el contratante es persona distinta al asegurado' },
  { nombre: 'BAIT — Pago de SA por invalidez', detalle: 'Paga la SA contratada (exhibición o rentas) si el asegurado queda con invalidez total y permanente; requiere tener BIT.', monto: 'Costo adicional, opcional' },
  { nombre: 'BMA — Muerte Accidental', detalle: 'Paga SA adicional si el fallecimiento es por accidente dentro de 90 días; se duplica en accidente colectivo.', monto: 'Costo adicional, opcional' },
  { nombre: 'DI — Doble Indemnización y Accidente', detalle: 'Igual que BMA más cobertura por pérdidas orgánicas a consecuencia de un accidente.', monto: 'Costo adicional, opcional' },
  { nombre: 'Adapta', detalle: 'Incrementa la protección por fallecimiento de forma independiente al ahorro; permite asegurar también a otras personas.', monto: 'Costo adicional, opcional' },
  { nombre: 'BIT Adapta', detalle: 'Exenta el pago de la prima de Adapta si el asegurado sufre invalidez total y permanente por más de 4 meses.', monto: 'Costo adicional, opcional' },
];

// Alfa Medical / Flex / Internacional — mismas Condiciones Generales para las 3
// variantes; lo que cambia entre ellas es deducible/coaseguro/zona/nivel hospitalario
// (parámetros de la carátula, ya capturados en Venta.deducible/coaseguro), no las coberturas.
const COBERTURAS_ALFA_MEDICAL = [
  { nombre: 'Maternidad', detalle: 'Cubre parto/cesárea con 10+ meses de cobertura continua; incluye complicaciones del embarazo y del recién nacido.', monto: 'Incluida' },
  { nombre: 'Maternidad por Reproducción Asistida', detalle: 'Para mujeres de 20-35 años con diagnóstico de infertilidad/esterilidad; máximo 2 embriones transferidos.', monto: 'Incluida' },
  { nombre: 'Circuncisión', detalle: 'Circuncisión médicamente necesaria (tope $5,000 MXN si el bebé nace en vigencia).', monto: 'Incluida' },
  { nombre: 'Enfermedades Congénitas y Genéticas (nacidos fuera de vigencia)', detalle: 'Cubiertas a partir del 3er año de cobertura continua si no hubo diagnóstico o gasto previo.', monto: 'Incluida' },
  { nombre: 'Nariz y Senos Paranasales', detalle: 'Por accidente (primeros 30 días) o enfermedad con 2+ años de cobertura continua.', monto: 'Incluida' },
  { nombre: 'Trasplantes', detalle: 'Trasplante de órganos/tejidos, incluyendo cultivo de médula ósea y el proceso de obtención del donante.', monto: 'Incluida' },
  { nombre: 'Accidentes Dentales', detalle: 'Reposición de piezas dañadas por accidente dentro de los primeros 30 días.', monto: 'Incluida' },
  { nombre: 'Hernias', detalle: 'Incluye hernias de disco a partir del 3er año de cobertura continua.', monto: 'Incluida' },
  { nombre: 'Deportes o Actividades Peligrosas', detalle: 'Cubierto siempre que no se practiquen de forma profesional o remunerada.', monto: 'Incluida' },
  { nombre: 'Protección Patrimonial', detalle: 'Si el titular fallece o queda inválido total/permanente, se cubren las primas de cónyuge/concubina/hijos menores de 25 por 5 años.', monto: 'Incluida' },
  { nombre: 'Reducción de Deducible por Accidente', detalle: 'Reduce 50% el deducible si la primera atención es dentro de 30 días del accidente.', monto: 'Incluida' },
  { nombre: 'Cirugía Reconstructiva por Cáncer de Mama', detalle: 'Cirugía programada tras un cáncer de mama cubierto (tope $100,000 MXN).', monto: 'Incluida' },
  { nombre: 'Cirugía Bariátrica', detalle: 'A partir del 6º año, única vez en la vida; requiere IMC>45 y diabetes tipo 2/hipertensión/dislipidemia.', monto: 'Incluida' },
  { nombre: 'Estudios Genómicos', detalle: 'Estudios oncológicos especializados (tope $100,000 MXN por estudio), solo vía Pago Directo.', monto: 'Incluida' },
  { nombre: 'Células Madre', detalle: 'Trasplante autólogo/alogénico para leucemias específicas y mieloma múltiple.', monto: 'Incluida' },
  { nombre: 'Cámara Hiperbárica', detalle: 'Hasta 20 sesiones para intoxicación por monóxido, quemaduras graves o gangrena gaseosa.', monto: 'Incluida' },
  { nombre: 'Rodilla, hombro y/o columna', detalle: 'Evento programado o reembolso, sujeto a exclusiones y periodos de espera generales.', monto: 'Incluida' },
  { nombre: 'Cirugía Fetal', detalle: 'Corrección de mielomeningocele, hernia diafragmática o síndrome de transfusión feto-fetal (tope $500,000 MXN, requiere autorización previa).', monto: 'Incluida' },
  { nombre: 'Terapias Génicas y Drogas Huérfanas', detalle: 'Tratamientos aprobados por COFEPRIS hace 5+ años; requiere evento programado y segunda valoración médica.', monto: 'Incluida' },
  { nombre: 'Ambulancia Terrestre o Aérea', detalle: 'Traslado domicilio-hospital vía Asistencia Alfa Medical.', monto: 'Incluida' },
  { nombre: 'Servicios de Asistencia Alfa Medical', detalle: 'Orientación médica a domicilio, hospedaje/traslado para familiar, orientación nutricional/psicológica y asesoría médica virtual.', monto: 'Incluida' },
  { nombre: 'Dental Básica', detalle: 'Consulta de diagnóstico, limpieza, flúor, radiografías y selladores (copago 0%, con límites de eventos).', monto: 'Incluida' },
  { nombre: 'SIDA/VIH', detalle: 'Cubre tratamiento del VIH (tope $500,000 MXN en los primeros 60 meses, después la SA completa).', monto: 'Costo adicional, opcional' },
  { nombre: 'Incremento en el Catálogo de Honorarios Médicos y Quirúrgicos', detalle: 'Incrementa 25% o 50% la base de honorarios médicos en cirugía.', monto: 'Costo adicional, opcional' },
  { nombre: 'Cobertura de Extensión en el Extranjero', detalle: 'Indemniza gastos por atención de accidentes/enfermedades fuera de México.', monto: 'Costo adicional, opcional' },
  { nombre: 'Enfermedades Catastróficas en el Extranjero', detalle: 'Cubre en el extranjero cirugía cardíaca, cáncer, trasplantes mayores y trauma mayor, entre otras.', monto: 'Costo adicional, opcional' },
  { nombre: 'Protección por Fallecimiento', detalle: 'Gastos funerarios y traslado/repatriación del cuerpo o cenizas.', monto: 'Costo adicional, opcional' },
  { nombre: 'Estudiantes y Trabajadores Temporales en el Extranjero', detalle: 'Cubre urgencias médicas hasta 12 meses continuos en el extranjero.', monto: 'Costo adicional, opcional' },
  { nombre: 'Eliminación de Deducible por Accidente', detalle: 'Elimina por completo el deducible en accidente atendido dentro de 30 días (a diferencia de la reducción incluida en el básico).', monto: 'Costo adicional, opcional' },
  { nombre: 'Alfa Medical Cash por Diagnóstico', detalle: 'Paga la SA completa sin deducible/coaseguro al diagnosticarse una enfermedad grave (infarto, cáncer, EVC, Parkinson, insuficiencia renal, entre otras).', monto: 'Costo adicional, opcional' },
  { nombre: 'Asistencia en el Extranjero', detalle: 'Transferencia de fondos, asistencia por robo/pérdida de documentos y búsqueda de equipaje; ligada a contratar la cobertura de extranjero.', monto: 'Incluida (si se contrata Extensión en el Extranjero)' },
  { nombre: 'Dental Premium', detalle: 'Amplía la Dental Básica con mantenimiento periodontal, restauraciones, extracciones y endodoncias (copago 30%).', monto: 'Costo adicional, opcional' },
];

export const productosCatalogoSeed = [
  // Orvi 99 — Vida vitalicio (nombre interno en la plataforma CDP de la aseguradora)
  { ramo: 'VIDA', nombre: 'Orvi 6 pagos',         codigo: 'Orvi 99', comisionPct: 20, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 6 años; protección de por vida con reserva garantizada.', monedas: ['USD'], coberturas: COBERTURAS_ORVI },
  { ramo: 'VIDA', nombre: 'Orvi 10 pagos',        codigo: 'Orvi 99', comisionPct: 36, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 10 años; disponible en USD (36%) y UDI (35%).', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_ORVI },
  { ramo: 'VIDA', nombre: 'Orvi 15 pagos',        codigo: 'Orvi 99', comisionPct: 35, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 15 años; protección de por vida.', monedas: ['USD'], coberturas: COBERTURAS_ORVI },
  { ramo: 'VIDA', nombre: 'Orvi 20 pagos',        codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con primas niveladas pagaderas en 20 años; en UDI 44% (SA<1.5M) o 35% (SA>=1.5M).', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_ORVI },
  { ramo: 'VIDA', nombre: 'Orvi Edad 60',         codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con pago de primas hasta edad alcanzada de 60 años; 44% si edad<=41 al contratar, 35% si edad>41.', monedas: ['USD'], coberturas: COBERTURAS_ORVI },
  { ramo: 'VIDA', nombre: 'Orvi Todos los pagos', codigo: 'Orvi 99', comisionPct: 44, descripcion: 'Seguro de vida vitalicio con primas pagaderas durante toda la vida; en UDI 44% (SA<1.5M) o 35% (SA>=1.5M).', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_ORVI },

  // Star Dotal — Ahorro a plazo
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 5 años',  comisionPct: 11, descripcion: 'Seguro dotal a 5 años en USD que combina protección por fallecimiento y ahorro recibido en vida al vencimiento.', monedas: ['USD'], coberturas: COBERTURAS_STAR_DOTAL },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 10 años',  comisionPct: 27, descripcion: 'Seguro dotal a 10 años (USD 27% / UDI 30%) que entrega la suma asegurada al sobrevivir el plazo o a beneficiarios por fallecimiento.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_STAR_DOTAL },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 15 años',  comisionPct: 28, descripcion: 'Seguro dotal a 15 años en USD con protección por fallecimiento y ahorro recibido en vida al vencimiento.', monedas: ['USD'], coberturas: COBERTURAS_STAR_DOTAL },
  { ramo: 'ACUMULACION', nombre: 'Star Dotal 20 años', comisionPct: 35, descripcion: 'Seguro dotal a 20 años (USD y UDI, 35% año 1) con protección y ahorro de largo plazo.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_STAR_DOTAL },

  // SeguBeca — Ahorro educativo
  { ramo: 'ACUMULACION', nombre: 'SeguBeca', comisionPct: null, descripcion: 'Seguro dotal para constituir el capital de educación universitaria del menor, con pago de suma asegurada a los 18 años y exención de primas por fallecimiento/invalidez del contratante.', monedas: ['MXN', 'UDI'], coberturas: COBERTURAS_SEGUBECA },

  // Vida Mujer — Vida + ahorro para mujeres
  { ramo: 'VIDA', nombre: 'Vida Mujer', comisionPct: 40, descripcion: 'Seguro de vida y ahorro diseñado para mujeres que entrega anticipos (dotales) del 5% de la SA cada 2 años desde el año 5 y 80% al final, totalizando 115% de la SA.', monedas: ['MXN'], coberturas: COBERTURAS_VIDA_MUJER },

  // Imagina Ser — Retiro / PPR (deducción LISR Art. 151) — variantes por modalidad de pago
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Nivelada Plazo Largo', comisionPct: 35, descripcion: 'Plan Personal de Retiro Imagina Ser con prima nivelada, plazo largo (20+ años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70. Disponible en USD (2%TMG) y UDIs (1%TMG).', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Nivelada Plazo Medio', comisionPct: 30, descripcion: 'Plan Personal de Retiro Imagina Ser con prima nivelada, plazo medio (10-19 años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70. Disponible en USD (2%TMG) y UDIs (1%TMG).', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Única Plazo Largo', comisionPct: 8.5, descripcion: 'Plan Personal de Retiro Imagina Ser con prima única, plazo largo (20+ años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Prima Única Plazo Medio', comisionPct: 8.5, descripcion: 'Plan Personal de Retiro Imagina Ser con prima única, plazo medio (10-19 años). Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Pagos Limitados 10', comisionPct: 27, descripcion: 'Plan Personal de Retiro Imagina Ser con pagos limitados a 10 años. Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },
  { ramo: 'RETIRO', nombre: 'Imagina Ser PPR — Pagos Limitados 15', comisionPct: 30, descripcion: 'Plan Personal de Retiro Imagina Ser con pagos limitados a 15 años. Deducción fiscal LISR Art. 151 y 185. Renta vitalicia a los 60/65/70.', monedas: ['USD', 'UDI'], coberturas: COBERTURAS_IMAGINA_SER },

  // Alfa Medical — Gastos Médicos Mayores (variantes comerciales)
  { ramo: 'GMM', nombre: 'Alfa Medical', comisionPct: null, descripcion: 'Seguro de Gastos Médicos Mayores que cubre gastos por accidente, enfermedad, parto o cesárea, con coberturas básicas (maternidad, trasplantes, dentales, etc.) y opcionales de extensión en el extranjero. Programa Médicos a tu lado®.', monedas: ['MXN', 'USD'], coberturas: COBERTURAS_ALFA_MEDICAL },
  { ramo: 'GMM', nombre: 'Alfa Medical Flex', comisionPct: null, descripcion: 'Variante de Gastos Médicos Mayores que permite personalizar coberturas y deducibles para adaptarse al presupuesto del cliente; usa franquicia en vez de deducible tradicional.', monedas: ['MXN'], coberturas: COBERTURAS_ALFA_MEDICAL },
  { ramo: 'GMM', nombre: 'Alfa Medical Internacional', comisionPct: null, descripcion: 'Variante de Gastos Médicos Mayores con cobertura y acceso a hospitales y especialistas a nivel mundial (fuera de México), además de las coberturas básicas del plan.', monedas: ['MXN', 'USD'], coberturas: COBERTURAS_ALFA_MEDICAL },
];
