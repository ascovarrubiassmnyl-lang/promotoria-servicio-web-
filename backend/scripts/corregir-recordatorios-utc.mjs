// Corrige los recordatorios que se guardaron con la hora corrida por el bug de
// zona horaria de `NotaFormModal` (arreglado el 2026-08-18).
//
// Qué pasaba: el modal mandaba la fecha del `<input type="datetime-local">`
// SIN zona ("2026-08-19T10:00") y el servidor la leía con SU zona. En Railway
// (UTC) las 10:00 del asesor quedaban como 10:00Z y se veían a las 04:00 hora
// de México: todo el offset corrido.
//
// Qué corrige (y solo eso):
//   - `tipo = RECORDATORIO` con `fechaAviso`, creados ANTES del corte.
//   - NO toca `RECORDATORIO_PAGO` ni las notas del job: esas nacen de un Date
//     que el servidor ya calculó bien (`venta.fechaProximoPago`).
//   - NO toca `NOTA` (no tiene fechaAviso) ni las banderas de aviso: mover la
//     fecha con `notificacionEnviada` intacto no vuelve a notificar nada.
//
// OJO: solo aplica a una base escrita por un servidor en UTC (producción). En
// desarrollo, con el servidor en hora de México, el string sin zona se
// interpretaba bien y estas filas NO están mal — correrlo ahí las rompería.
// Por eso el modo por defecto es simulación: revisa la lista (ninguna hora
// "corregida" debería sorprenderte) y recién entonces corre con --aplicar.
//
//   DATABASE_URL=<url> node backend/scripts/corregir-recordatorios-utc.mjs
//   DATABASE_URL=<url> node backend/scripts/corregir-recordatorios-utc.mjs --aplicar
//
// En Railway: railway run --service <servicio-app> node backend/scripts/corregir-recordatorios-utc.mjs
//
// Opciones:
//   --aplicar            escribe los cambios (sin ella solo simula)
//   --forzar             aplica aunque ninguna fila muestre la huella del bug
//   --antes-de=<ISO>     corte de `creadoEn` (default: ahora)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TZ = 'America/Mexico_City';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
// Sin huella del bug el script se niega a escribir; --forzar es la salida
// cuando el operador ya revisó la simulación fila por fila.
const forzar = args.includes('--forzar');
const argCorte = args.find((a) => a.startsWith('--antes-de='))?.split('=')[1];
const corte = argCorte ? new Date(argCorte) : new Date();
if (Number.isNaN(corte.getTime())) {
  console.error(`Fecha inválida en --antes-de: ${argCorte}`);
  process.exit(1);
}

// Minutos que la zona va adelante de UTC en ese instante (negativo en México).
function offsetMinutos(fecha) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(fecha).reduce((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  const comoUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return (comoUTC - fecha.getTime()) / 60000;
}

const enMexico = (d) => d.toLocaleString('es-MX', {
  timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const HORA = 60 * 60 * 1000;
const TOLERANCIA = 5 * 60 * 1000;

// Huella para saber si esta base la escribió un servidor en UTC (filas mal) o
// en hora de México (filas bien), sin tener que confiar en dónde se corre el
// script: el modal proponía por defecto "mañana a esta misma hora", así que
// una fila guardada bien tiene fechaAviso ~ creadoEn + 24h, y una corrida por
// el bug ~ creadoEn + 24h - offset (18h). Las filas con hora elegida a mano no
// dicen nada y se ignoran para el diagnóstico.
function huella(nota) {
  const delta = nota.fechaAviso.getTime() - nota.creadoEn.getTime();
  const desfase = -offsetMinutos(nota.fechaAviso) * 60000;
  if (Math.abs(delta - 24 * HORA) < TOLERANCIA) return 'sana';
  if (Math.abs(delta - (24 * HORA - desfase)) < TOLERANCIA) return 'corrida';
  return null;
}

async function main() {
  const notas = await prisma.nota.findMany({
    where: { tipo: 'RECORDATORIO', fechaAviso: { not: null }, creadoEn: { lt: corte } },
    include: {
      cliente: { select: { nombre: true, apellidoP: true } },
      candidato: { select: { nombre: true, apellidoP: true } },
      asesor: { select: { nombre: true, apellidoP: true } },
    },
    orderBy: { fechaAviso: 'asc' },
  });

  if (notas.length === 0) {
    console.log('No hay recordatorios que corregir.');
    return;
  }

  const sanas = notas.filter((n) => huella(n) === 'sana').length;
  const corridas = notas.filter((n) => huella(n) === 'corrida').length;
  console.log(`Diagnóstico por huella: ${corridas} con la hora corrida, ${sanas} correctas, ${notas.length - corridas - sanas} sin señal.`);
  if (aplicar && corridas === 0 && !forzar) {
    console.error(
      '\nAbortado: ninguna fila muestra la huella del bug' + (sanas > 0 ? ' y sí hay filas correctas' : '') + '.\n' +
      'Puede ser una base escrita por un servidor en hora de México (la de desarrollo):\n' +
      'ahí los recordatorios NO están mal y la corrección los rompería.\n' +
      'Si revisaste la simulación y las horas de arriba sí están corridas, repite con --forzar.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n${notas.length} recordatorio(s) creados antes de ${enMexico(corte)}${aplicar ? '' : ' — SIMULACIÓN (agrega --aplicar para escribir)'}\n`);

  let corregidos = 0;
  for (const nota of notas) {
    // El valor guardado trae la hora de pared que eligió el asesor, pero
    // marcada como UTC: se le resta el offset para devolverla a su instante.
    const actual = nota.fechaAviso;
    const corregida = new Date(actual.getTime() - offsetMinutos(actual) * 60000);
    const sujeto = nota.cliente || nota.candidato;
    const quien = sujeto ? `${sujeto.nombre} ${sujeto.apellidoP}` : '—';
    const señal = { corrida: '[corrida]', sana: '[¿correcta?]' }[huella(nota)] || '[sin señal]';
    console.log(
      `  ${señal} ${enMexico(actual)}  →  ${enMexico(corregida)}   ${quien} · ${nota.asesor.nombre} ${nota.asesor.apellidoP}` +
      `\n      "${nota.texto.slice(0, 70)}${nota.texto.length > 70 ? '…' : ''}"`,
    );
    if (aplicar) {
      // Solo la fecha: las banderas de aviso se conservan a propósito, para no
      // volver a notificar recordatorios que el asesor ya vio.
      await prisma.nota.update({ where: { id: nota.id }, data: { fechaAviso: corregida } });
    }
    corregidos += 1;
  }

  console.log(`\n${aplicar ? `${corregidos} recordatorio(s) corregidos.` : `${corregidos} se corregirían. Nada se escribió.`}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
