-- Agenda propia de reclutamiento del promotor: nuevos valores de ModalidadCita
-- que no requieren asesor ni cliente (ver backend/src/routes/citas.js).
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'PRP';
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'ENTREVISTA_INICIAL';
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'ENTREVISTA_SELECCION';
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'ENTREVISTA_CARRERA';
