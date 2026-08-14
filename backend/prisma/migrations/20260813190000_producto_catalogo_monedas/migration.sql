-- Monedas en que la compañía ofrece cada producto, ej. ["USD","UDI"].
-- Solo sugiere la moneda al crear la póliza; Venta.moneda sigue mandando.
ALTER TABLE "ProductoCatalogo" ADD COLUMN "monedas" JSONB;
