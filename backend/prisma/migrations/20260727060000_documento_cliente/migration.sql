-- La tabla DocumentoCliente estaba en schema.prisma (feature de archivos
-- adjuntos a la ficha de cliente, routes/documentos.js) desde antes de que
-- las migraciones se empezaran a versionar a mano, pero nunca tuvo su propia
-- migración: existía en algunos entornos de desarrollo por drift (creada
-- fuera de banda) y por eso el hueco no se notó hasta ahora en producción.
-- CreateTable
CREATE TABLE "DocumentoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "mime" TEXT,
    "tamano" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoCliente_clienteId_idx" ON "DocumentoCliente"("clienteId");

-- AddForeignKey
ALTER TABLE "DocumentoCliente" ADD CONSTRAINT "DocumentoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoCliente" ADD CONSTRAINT "DocumentoCliente_asesorId_fkey" FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
