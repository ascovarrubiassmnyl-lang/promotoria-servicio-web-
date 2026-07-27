-- Normaliza los tipos de evento de actividad a un único conjunto canónico.
-- "VENTA_CREADA" (seed antiguo) y "POLIZA_CREADA" (código actual) eran el mismo
-- evento contado como dos tipos distintos en la UI. Se unifican en POLIZA_CREADA
-- preservando el valor original en metadata.tipoOriginal (no se borra nada).
UPDATE "Actividad"
SET "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{tipoOriginal}', to_jsonb("tipo")),
    "tipo" = 'POLIZA_CREADA'
WHERE "tipo" = 'VENTA_CREADA';

-- Los eventos nuevos se guardan estructurados (tipo + metadata) y el texto se
-- arma en el frontend; descripcion queda solo como fallback de los históricos.
ALTER TABLE "Actividad" ALTER COLUMN "descripcion" DROP NOT NULL;
