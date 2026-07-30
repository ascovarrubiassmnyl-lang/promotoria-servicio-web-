// Siembra/actualiza el catálogo de productos SMNYL contra la base de datos
// apuntada por DATABASE_URL (uso pensado para producción, donde el seed
// normal no toca ProductoCatalogo). Es upsert por [ramo, nombre]: no borra
// ni pisa productos que ya existan con otros datos si no están en la lista.
//
//   DATABASE_URL=<url> node backend/scripts/seed-productos-catalogo.mjs
//
// En Railway: railway run --service <servicio-app> node backend/scripts/seed-productos-catalogo.mjs
import { PrismaClient } from '@prisma/client';
import { productosCatalogoSeed } from '../prisma/productosCatalogoData.js';

const prisma = new PrismaClient();

async function main() {
  let creados = 0;
  let actualizados = 0;
  for (const p of productosCatalogoSeed) {
    const existente = await prisma.productoCatalogo.findUnique({ where: { ramo_nombre: { ramo: p.ramo, nombre: p.nombre } } });
    if (existente) {
      await prisma.productoCatalogo.update({ where: { id: existente.id }, data: p });
      actualizados++;
      console.log(`  actualizado: ${p.ramo} / ${p.nombre}`);
    } else {
      await prisma.productoCatalogo.create({ data: p });
      creados++;
      console.log(`  creado:      ${p.ramo} / ${p.nombre}`);
    }
  }
  console.log(`\nListo: ${creados} creados, ${actualizados} actualizados (de ${productosCatalogoSeed.length} en el catálogo).`);
}

main()
  .catch((e) => {
    console.error('Error sembrando catálogo de productos:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
