-- Multi-moneda en toda la póliza (2026-08-15).
--
-- Antes solo la PRIMA tenía moneda propia (`moneda` + `primaMoneda` +
-- `tipoCambio`) y la suma asegurada tenía su denominación (`sumaAseguradaMoneda`)
-- pero sin equivalente en pesos. El resto de los montos (monto por pago,
-- deducible, costo extra de coberturas) estaban forzados a MXN, lo cual no
-- refleja cómo se venden Orvi / Star Dotal / Alfa Medical Internacional, que se
-- contratan en USD o UDIS.
--
-- Todas las columnas son aditivas y con default, así que las pólizas ya
-- registradas quedan exactamente como estaban: MXN.

-- Moneda del monto de cada recibo recurrente.
ALTER TABLE "Venta" ADD COLUMN "montoPagoMoneda" "MonedaPoliza" NOT NULL DEFAULT 'MXN';

-- Moneda del deducible (GMM internacional lo cobra en dólares).
ALTER TABLE "Venta" ADD COLUMN "deducibleMoneda" "MonedaPoliza" NOT NULL DEFAULT 'MXN';

-- Tipo de cambio con el que se mostró el equivalente en pesos de la suma
-- asegurada al capturarla. Informativo (foto del día), no alimenta métricas.
ALTER TABLE "Venta" ADD COLUMN "sumaAseguradaTC" DOUBLE PRECISION;

-- Nota: `Venta.coberturas` es Json y crece con `costoMoneda` por fila sin
-- necesitar DDL. Las filas ya guardadas no lo traen y se leen como MXN.
