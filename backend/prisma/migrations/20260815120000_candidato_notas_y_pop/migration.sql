-- CreateEnum
CREATE TYPE "EstadoPopEnvio" AS ENUM ('PENDIENTE', 'RESPONDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RecomendacionPop" AS ENUM ('PROCEDER', 'PRECAUCION', 'NO_PROCEDER');

-- DropForeignKey
ALTER TABLE "Nota" DROP CONSTRAINT "Nota_asesorId_fkey";

-- DropForeignKey
ALTER TABLE "Nota" DROP CONSTRAINT "Nota_clienteId_fkey";

-- AlterTable
ALTER TABLE "Nota" ADD COLUMN     "candidatoId" TEXT,
ALTER COLUMN "clienteId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PopPlantilla" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "preguntas" JSONB NOT NULL DEFAULT '[]',
    "umbralVerde" INTEGER NOT NULL DEFAULT 70,
    "umbralAmarillo" INTEGER NOT NULL DEFAULT 40,
    "archivadaEn" TIMESTAMP(3),
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopPlantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopEnvio" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "plantillaId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPopEnvio" NOT NULL DEFAULT 'PENDIENTE',
    "preguntas" JSONB NOT NULL DEFAULT '[]',
    "respuestas" JSONB NOT NULL DEFAULT '[]',
    "puntaje" INTEGER,
    "puntosObtenidos" INTEGER,
    "puntosPosibles" INTEGER,
    "recomendacion" "RecomendacionPop",
    "bloques" JSONB NOT NULL DEFAULT '[]',
    "respondidoEn" TIMESTAMP(3),
    "abiertoEn" TIMESTAMP(3),
    "enviadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PopPlantilla_creadoPorId_idx" ON "PopPlantilla"("creadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "PopEnvio_token_key" ON "PopEnvio"("token");

-- CreateIndex
CREATE INDEX "PopEnvio_candidatoId_idx" ON "PopEnvio"("candidatoId");

-- CreateIndex
CREATE INDEX "PopEnvio_plantillaId_idx" ON "PopEnvio"("plantillaId");

-- CreateIndex
CREATE INDEX "PopEnvio_estado_idx" ON "PopEnvio"("estado");

-- CreateIndex
CREATE INDEX "Nota_candidatoId_idx" ON "Nota"("candidatoId");

-- AddForeignKey
ALTER TABLE "PopPlantilla" ADD CONSTRAINT "PopPlantilla_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopEnvio" ADD CONSTRAINT "PopEnvio_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopEnvio" ADD CONSTRAINT "PopEnvio_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PopPlantilla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopEnvio" ADD CONSTRAINT "PopEnvio_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_asesorId_fkey" FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sujeto de la nota: exactamente uno de cliente o candidato (excluyentes).
-- Prisma no puede expresar esta regla en el schema; sin ella una nota podría
-- quedar huérfana de sujeto o apuntar a los dos a la vez.
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_sujeto_unico"
  CHECK (("clienteId" IS NOT NULL) <> ("candidatoId" IS NOT NULL));
