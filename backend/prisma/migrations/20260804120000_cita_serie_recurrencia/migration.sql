-- Cita repetida: las instancias generadas por una regla de recurrencia
-- comparten serieId (solo informativo, sin cascada entre ellas).
ALTER TABLE "Cita" ADD COLUMN     "serieId" TEXT;

-- CreateIndex
CREATE INDEX "Cita_serieId_idx" ON "Cita"("serieId");
