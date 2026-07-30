-- Plantilla de coberturas por producto del catálogo, para autocompletar
-- Venta.coberturas al crear una póliza (mismo shape: [{nombre, detalle, monto}]).
ALTER TABLE "ProductoCatalogo" ADD COLUMN "coberturas" JSONB;
