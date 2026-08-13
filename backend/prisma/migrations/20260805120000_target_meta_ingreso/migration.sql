-- Meta de ingreso deseado (PRP), personal por asesor. El backend la traduce
-- a "pólizas necesarias" con la comisión promedio histórica del asesor
-- (GET /targets/resumen); no existe a nivel TargetEquipo.
ALTER TABLE "Target" ADD COLUMN "metaIngresoMonto" DOUBLE PRECISION;
