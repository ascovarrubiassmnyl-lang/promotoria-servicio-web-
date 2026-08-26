-- Ficha técnica completa de la póliza (contratante, datos de la compañía,
-- detalle del ramo) + clave de agente del asesor.
--
-- Todas las columnas son nullable: las pólizas ya registradas siguen válidas
-- y ningún cálculo de negocio depende de estos campos. `situacion` NO
-- sustituye a `estado` (EstadoVenta), que es el que decide comisión ganada vs.
-- pipeline y "póliza activa" en métricas.

CREATE TYPE "SituacionPoliza" AS ENUM ('ACTIVA', 'POR_RENOVAR', 'EN_RESCATE');

ALTER TABLE "Venta" ADD COLUMN "contratante" TEXT;
ALTER TABLE "Venta" ADD COLUMN "numeroPoliza" TEXT;
ALTER TABLE "Venta" ADD COLUMN "situacion" "SituacionPoliza";
ALTER TABLE "Venta" ADD COLUMN "plan" TEXT;
ALTER TABLE "Venta" ADD COLUMN "redMedica" TEXT;
ALTER TABLE "Venta" ADD COLUMN "asegurados" JSONB;

ALTER TABLE "Usuario" ADD COLUMN "claveAgente" TEXT;
