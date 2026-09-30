-- Reserva en el calendario de la landing (Cal.com) → Cita en el CRM. Aditiva.
ALTER TYPE "ResultadoCaptura" ADD VALUE 'CITA_AGENDADA';

ALTER TABLE "CapturaLead" ADD COLUMN "citaId" TEXT;

CREATE INDEX "CapturaLead_citaId_idx" ON "CapturaLead"("citaId");

ALTER TABLE "CapturaLead" ADD CONSTRAINT "CapturaLead_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
