-- "Necesita seguimiento" deja de ser una etapa del embudo y pasa a ser una
-- bandera independiente: un cliente puede estar en cualquier etapa Y necesitar
-- seguimiento a la vez.
ALTER TABLE "Cliente" ADD COLUMN "necesitaSeguimiento" BOOLEAN NOT NULL DEFAULT false;

-- Migración sin pérdida: las filas cuyo "estado" era la pseudo-etapa
-- NECESITA_SEGUIMIENTO conservan esa información en la bandera. Su etapa real
-- ya no existía (fue sobrescrita al marcarlas), así que regresan al inicio del
-- embudo (PROSPECTO). El valor NECESITA_SEGUIMIENTO se conserva en el tipo
-- enum de PostgreSQL (quitarlo es destructivo) pero la app ya no lo usa.
UPDATE "Cliente"
SET "necesitaSeguimiento" = true, "estado" = 'PROSPECTO'
WHERE "estado" = 'NECESITA_SEGUIMIENTO';
