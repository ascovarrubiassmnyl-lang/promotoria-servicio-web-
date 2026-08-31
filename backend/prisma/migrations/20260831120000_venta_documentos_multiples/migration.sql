-- Permite adjuntar VARIOS documentos a una póliza (antes, 1:1 vía
-- Venta.documentoPolizaId). documentoPolizaId se conserva tal cual para el
-- documento "principal"; esta columna nueva es la lista completa.
--
-- Nullable y sin tocar datos existentes: los documentos ya subidos antes de
-- este cambio simplemente no tienen ventaId (quedan huérfanos de esta lista,
-- pero siguen intactos vía documentoPolizaId si eran el principal).

ALTER TABLE "DocumentoCliente" ADD COLUMN "ventaId" TEXT;

CREATE INDEX "DocumentoCliente_ventaId_idx" ON "DocumentoCliente"("ventaId");

ALTER TABLE "DocumentoCliente" ADD CONSTRAINT "DocumentoCliente_ventaId_fkey"
  FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
