import { prisma } from '../prisma.js';

// Helpers compartidos de Clínica telefónica, usados desde dos rutas distintas:
//  - routes/clinica.js  → "Traer de mi cartera" (importación manual).
//  - routes/clientes.js → alta de un prospecto sin contactar (entra solo).
// Viven aquí para que la fila del evaluador se arme igual en ambos casos.

// Lunes de la semana de `fecha` (la clínica opera lunes–domingo, igual que
// 25 puntos). Se normaliza a medianoche UTC porque `semanaInicio` es @db.Date.
export function inicioSemana(fecha = new Date()) {
  const d = new Date(fecha);
  const dia = d.getDay(); // 0=domingo
  const desdeLunes = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - desdeLunes);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function edadDeFechaNacimiento(f) {
  if (!f) return null;
  const n = new Date(f);
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e -= 1;
  return e >= 0 && e < 130 ? e : null;
}

// Fila del evaluador a partir de un Cliente ya creado.
export function filaProspectoDesdeCliente(cliente, { asesorId, semanaInicio }) {
  return {
    asesorId,
    semanaInicio,
    clienteId: cliente.id,
    nombre: `${cliente.nombre} ${cliente.apellidoP} ${cliente.apellidoM || ''}`.trim(),
    contacto: cliente.telefono || cliente.email || null,
    edad: edadDeFechaNacimiento(cliente.fechaNacimiento),
    resultado: 'PENDIENTE',
  };
}

// Mete al cliente en el evaluador de la semana en curso si no está ya ahí.
// Anti-duplicación por (clienteId, semanaInicio), igual que la importación
// manual. Devuelve la fila creada o null si ya existía.
export async function agregarClienteAClinica(cliente, { asesorId, semanaInicio } = {}) {
  const semana = semanaInicio || inicioSemana();
  const yaEsta = await prisma.prospectoClinica.findFirst({
    where: { clienteId: cliente.id, semanaInicio: semana },
    select: { id: true },
  });
  if (yaEsta) return null;
  return prisma.prospectoClinica.create({
    data: filaProspectoDesdeCliente(cliente, { asesorId: asesorId || cliente.asesorId, semanaInicio: semana }),
  });
}
