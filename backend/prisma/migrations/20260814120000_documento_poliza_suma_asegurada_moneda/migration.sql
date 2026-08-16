-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "documentoPolizaId" TEXT,
ADD COLUMN     "extraccionConfirmada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extraccionEn" TIMESTAMP(3),
ADD COLUMN     "extraccionModelo" TEXT,
ADD COLUMN     "sumaAseguradaMoneda" "MonedaPoliza" NOT NULL DEFAULT 'MXN';

-- CreateIndex
CREATE UNIQUE INDEX "Venta_documentoPolizaId_key" ON "Venta"("documentoPolizaId");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_documentoPolizaId_fkey" FOREIGN KEY ("documentoPolizaId") REFERENCES "DocumentoCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
