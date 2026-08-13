-- Sugerencia de otro horario en la invitación de acompañamiento: el promotor
-- puede proponer un horario distinto en vez de solo aceptar/rechazar.

ALTER TYPE "EstadoInvitacionCita" ADD VALUE 'SUGERIDA';

ALTER TABLE "Cita" ADD COLUMN "sugerenciaInicio" TIMESTAMP(3);
ALTER TABLE "Cita" ADD COLUMN "sugerenciaFin" TIMESTAMP(3);
ALTER TABLE "Cita" ADD COLUMN "sugerenciaNota" TEXT;
