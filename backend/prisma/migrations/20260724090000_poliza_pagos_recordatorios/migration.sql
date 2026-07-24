-- Migration: Poliza, pagos y recordatorios automáticos
-- 1. Quitamos "aseguradora" de Venta (siempre Seguros Monterrey New York Life)
-- 2. Añadimos campos de formaPago/vigencia/fechaProximoPago a Venta
-- 3. Añadimos enum TipoNota.RECORDATORIO_PAGO + relación Nota -> Venta

-- AlterEnum: añadir RECORDATORIO_PAGO al tipo TipoNota existente
ALTER TYPE "TipoNota" ADD VALUE IF NOT EXISTS 'RECORDATORIO_PAGO';

-- Añadir nueva columna a Nota con FK a Venta
ALTER TABLE "Nota" ADD COLUMN IF NOT EXISTS "ventaId" TEXT;

-- Borrar columna aseguradora de Venta (curso ya no la usa)
ALTER TABLE "Venta" DROP COLUMN IF EXISTS "aseguradora";

-- Añadir campos de vigencia y pagos a Venta
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "formaPago" "FormaPago" NOT NULL DEFAULT 'ANUAL';
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "fechaInicioVigencia" TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "fechaFinVigencia" TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "fechaProximoPago" TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "diaPago" INTEGER;
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "montoPago" DOUBLE PRECISION;

-- FK Nota.ventaId -> Venta.id
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_ventaId_fkey"
  FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice para la nueva relación
CREATE INDEX IF NOT EXISTS "Nota_ventaId_idx" ON "Nota"("ventaId");

-- Backfill: en ventas existentes sin formaPago, inferir ANUAL
UPDATE "Venta" SET "formaPago" = 'ANUAL' WHERE "formaPago" IS NULL OR "formaPago"::text = '';
