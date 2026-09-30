-- CreateEnum
CREATE TYPE "ResultadoCaptura" AS ENUM ('CREADO', 'DUPLICADO', 'SPAM');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "fuenteCapturaId" TEXT,
ADD COLUMN     "leadSinVer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FuenteCaptura" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "etapaInicial" "EstadoCliente" NOT NULL DEFAULT 'PROSPECTO',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "dominiosPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEn" TIMESTAMP(3),
    "totalRecibidos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FuenteCaptura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapturaLead" (
    "id" TEXT NOT NULL,
    "fuenteId" TEXT,
    "clienteId" TEXT,
    "resultado" "ResultadoCaptura" NOT NULL,
    "nombre" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "modalidad" TEXT,
    "origen" TEXT,
    "etapaOriginal" TEXT,
    "fechaEnvio" TIMESTAMP(3),
    "datosExtra" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapturaLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuenteCaptura_clave_key" ON "FuenteCaptura"("clave");

-- CreateIndex
CREATE INDEX "FuenteCaptura_usuarioId_idx" ON "FuenteCaptura"("usuarioId");

-- CreateIndex
CREATE INDEX "CapturaLead_fuenteId_recibidoEn_idx" ON "CapturaLead"("fuenteId", "recibidoEn");

-- CreateIndex
CREATE INDEX "CapturaLead_clienteId_idx" ON "CapturaLead"("clienteId");

-- CreateIndex
CREATE INDEX "Cliente_fuenteCapturaId_idx" ON "Cliente"("fuenteCapturaId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_fuenteCapturaId_fkey" FOREIGN KEY ("fuenteCapturaId") REFERENCES "FuenteCaptura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuenteCaptura" ADD CONSTRAINT "FuenteCaptura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturaLead" ADD CONSTRAINT "CapturaLead_fuenteId_fkey" FOREIGN KEY ("fuenteId") REFERENCES "FuenteCaptura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturaLead" ADD CONSTRAINT "CapturaLead_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
