-- CreateEnum
CREATE TYPE "ModalidadCita" AS ENUM ('CITA_UNICA', 'ACOMPANAMIENTO');

-- AlterTable: añadir modalidad (default CITA_UNICA) y promotorId opcional
ALTER TABLE "Cita" ADD COLUMN "modalidad" "ModalidadCita" NOT NULL DEFAULT 'CITA_UNICA';
ALTER TABLE "Cita" ADD COLUMN "promotorId" TEXT;

-- CreateIndex
CREATE INDEX "Cita_promotorId_idx" ON "Cita"("promotorId");

-- AddForeignKey: promotor referencia Usuario (onDelete SetNull, ya que el promotor es opcional)
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_promotorId_fkey" FOREIGN KEY ("promotorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
