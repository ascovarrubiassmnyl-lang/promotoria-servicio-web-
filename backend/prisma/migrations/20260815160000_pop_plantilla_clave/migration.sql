-- Clave estable para el cuestionario POP de fábrica ("estandar"), que se
-- siembra solo. Nullable + unique: los cuestionarios que cree la promotora van
-- con NULL y Postgres permite varios NULL en un índice único.
ALTER TABLE "PopPlantilla" ADD COLUMN "clave" TEXT;
CREATE UNIQUE INDEX "PopPlantilla_clave_key" ON "PopPlantilla"("clave");
