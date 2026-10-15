-- AlterTable
ALTER TABLE "PagoPoliza" ADD COLUMN     "anioPoliza" INTEGER,
ADD COLUMN     "comisionMonto" DOUBLE PRECISION,
ADD COLUMN     "comisionPct" DOUBLE PRECISION,
ADD COLUMN     "tipoCambio" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "esquemaComision" JSONB;

-- CreateIndex
CREATE INDEX "PagoPoliza_fechaPago_idx" ON "PagoPoliza"("fechaPago");

