-- Invitación al promotor para acompañar una cita (2026-08).
-- Mientras la invitación está PENDIENTE la cita no bloquea la agenda del
-- promotor (no cuenta para sus empalmes); al ACEPTADA se vuelve firme.
CREATE TYPE "EstadoInvitacionCita" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

ALTER TABLE "Cita" ADD COLUMN "invitacionEstado" "EstadoInvitacionCita";
ALTER TABLE "Cita" ADD COLUMN "invitacionRespondidaEn" TIMESTAMP(3);

-- Las citas de acompañamiento que ya existían con promotor asignado se
-- consideran ACEPTADAS: fueron agendadas bajo el acuerdo previo de la
-- promotoría y no deben aparecerle al promotor como pendientes de responder.
UPDATE "Cita"
SET "invitacionEstado" = 'ACEPTADA', "invitacionRespondidaEn" = "creadoEn"
WHERE "promotorId" IS NOT NULL;
