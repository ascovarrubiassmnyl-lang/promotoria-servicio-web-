import { prisma } from '../prisma.js';
import {
  NOMBRE_POP_ESTANDAR, DESCRIPCION_POP_ESTANDAR, PREGUNTAS_POP_ESTANDAR,
  UMBRAL_VERDE_ESTANDAR, UMBRAL_AMARILLO_ESTANDAR,
} from './popEstandar.js';
import { validarPreguntas } from './pop.js';

export const CLAVE_POP_ESTANDAR = 'estandar';

// Garantiza que el cuestionario POP de fábrica exista en la base. La promotora
// nunca tiene que capturarlo: la primera vez que abre la sección o manda un
// POP, esto lo crea solo.
//
// Es CREATE-ONLY sobre el contenido (mismo criterio que el seed de productos):
// si la promotora editó las preguntas o los umbrales desde la UI, un redeploy
// NO le pisa sus cambios. Solo restaura las preguntas si la fila quedó vacía
// (estado imposible de enviar, así que recuperarlo siempre es lo correcto).
export async function asegurarPlantillaEstandar(creadoPorId) {
  const existente = await prisma.popPlantilla.findUnique({ where: { clave: CLAVE_POP_ESTANDAR } });

  if (existente) {
    const sinPreguntas = !Array.isArray(existente.preguntas) || existente.preguntas.length === 0;
    if (!sinPreguntas) {
      // Estaba archivada (alguien la archivó por error): se reactiva, porque es
      // el cuestionario base del que depende "Enviar POP".
      if (existente.archivadaEn) {
        return prisma.popPlantilla.update({ where: { id: existente.id }, data: { archivadaEn: null } });
      }
      return existente;
    }
    const { preguntas } = validarPreguntas(PREGUNTAS_POP_ESTANDAR);
    return prisma.popPlantilla.update({
      where: { id: existente.id },
      data: { preguntas, archivadaEn: null },
    });
  }

  // `creadoPorId` es obligatorio en el modelo. Al crearse desde una request se
  // usa quien la disparó; desde el seed, el primer admin disponible.
  const autorId = creadoPorId || (await primerAdmin());
  if (!autorId) return null; // base sin usuarios todavía (seed muy temprano)

  const val = validarPreguntas(PREGUNTAS_POP_ESTANDAR);
  if (val.error) throw new Error(`El POP estándar no es válido: ${val.error}`);

  return prisma.popPlantilla.create({
    data: {
      clave: CLAVE_POP_ESTANDAR,
      nombre: NOMBRE_POP_ESTANDAR,
      descripcion: DESCRIPCION_POP_ESTANDAR,
      preguntas: val.preguntas,
      umbralVerde: UMBRAL_VERDE_ESTANDAR,
      umbralAmarillo: UMBRAL_AMARILLO_ESTANDAR,
      creadoPorId: autorId,
    },
  });
}

async function primerAdmin() {
  const admin = await prisma.usuario.findFirst({
    where: { rol: { in: ['SUPERADMIN', 'ADMIN'] } },
    orderBy: { creadoEn: 'asc' },
    select: { id: true },
  });
  return admin?.id || null;
}
