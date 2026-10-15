-- Reunión de equipo (junta de arranque, capacitación): evento de la promotoría
-- sin cliente, con invitados. Ver CLAUDE.md → Sección Citas / Calendario.
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'REUNION_EQUIPO';
