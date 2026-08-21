import { prisma } from '../prisma.js';

// ——— "Referido obtenido": DEFINICIÓN ÚNICA del sistema ———
//
// Un referido es una PERSONA que llegó por recomendación, y se cuenta una sola
// vez sin importar por dónde entró al CRM. Hay dos entradas posibles y el CRM
// las usa las dos, así que la métrica es la unión de ambas (antes solo contaba
// la segunda y por eso "Referidos obtenidos" de Metas salía en 0 para quien
// captura sus prospectos por el alta normal):
//
//  A) Alta de prospecto con fuente "Referido" (o con "Referido por" apuntando a
//     otro cliente). Es el flujo normal: se registra al prospecto y se elige de
//     dónde llegó. Se cuenta con la fecha de alta del cliente.
//  B) Fila `Referido` de la ficha de un cliente que aún NO existe como cliente
//     (solo se tiene nombre/teléfono). Se cuenta con la fecha del referido.
//
// La deduplicación es por identidad de la persona y NO depende del orden ni del
// mes: una fila `Referido` YA ligada a un cliente (`clienteReferidoId`) nunca
// suma por su cuenta, porque ese cliente ya se cuenta en (A) — es destino de un
// referido — en el mes en que se dio de alta.
//
// `fuente` es String? con texto libre legacy ("Referido de Ana"), así que se
// compara con `contains` insensible en vez de igualdad exacta.
const FUENTE_REFERIDO = { fuente: { contains: 'REFERIDO', mode: 'insensitive' } };

export const WHERE_CLIENTE_REFERIDO = {
  OR: [
    FUENTE_REFERIDO,
    { referidoPorId: { not: null } },
    { referidosComoReferido: { some: {} } },
  ],
};

// Una venta viva convierte al referido en cliente. Mismo criterio que el
// segmento prospecto/cliente de `GET /clientes` (cancelada/rechazada no cuentan).
const VENTA_VIVA = ['PENDIENTE_PAGAR', 'FIRMADA', 'APROBADA', 'PAGADA'];

// Filas de referido obtenido en el rango: [{ asesorId, fecha, convertido }].
// Los callers agrupan/cuentan; aquí vive la regla, no la presentación.
// `whereBase` acota el alcance (p. ej. `{ asesorId }`) y aplica a ambas fuentes.
export async function referidosObtenidos(rango, whereBase = {}) {
  const [clientes, sueltos] = await Promise.all([
    prisma.cliente.findMany({
      where: { ...whereBase, archivadoEn: null, creadoEn: rango, ...WHERE_CLIENTE_REFERIDO },
      select: { asesorId: true, creadoEn: true, ventas: { where: { estado: { in: VENTA_VIVA } }, select: { id: true }, take: 1 } },
    }),
    prisma.referido.findMany({
      where: { ...whereBase, creadoEn: rango, clienteReferidoId: null },
      select: { asesorId: true, creadoEn: true, estado: true },
    }),
  ]);
  return [
    // Convertido = el referido ya tiene póliza viva (dejó de ser prospecto).
    ...clientes.map((c) => ({ asesorId: c.asesorId, fecha: c.creadoEn, convertido: c.ventas.length > 0 })),
    ...sueltos.map((r) => ({ asesorId: r.asesorId, fecha: r.creadoEn, convertido: r.estado === 'CONVERTIDO' })),
  ];
}
