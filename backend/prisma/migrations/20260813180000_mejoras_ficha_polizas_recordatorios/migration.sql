-- Mejoras de ficha de cliente, pólizas y recordatorios (mejoras.md, 2026-08-13)

-- CreateEnum
CREATE TYPE "DestinatarioNota" AS ENUM ('ASESOR', 'CLIENTE');

-- CreateEnum
CREATE TYPE "MonedaPoliza" AS ENUM ('MXN', 'USD', 'UDI');

-- CreateEnum
CREATE TYPE "MetodoPagoPoliza" AS ENUM ('TARJETA_CREDITO', 'TARJETA_CREDITO_MSI', 'TARJETA_DEBITO', 'TRANSFERENCIA', 'EFECTIVO', 'CARGO_NOMINA');

-- CreateEnum
CREATE TYPE "EstadoPagoPoliza" AS ENUM ('PAGADO', 'PENDIENTE', 'CANCELADO');

-- AlterTable: CURP en la ficha del cliente
ALTER TABLE "Cliente" ADD COLUMN "curp" TEXT;

-- AlterTable: recordatorios segmentados + segunda ventana de aviso (1 día antes)
ALTER TABLE "Nota" ADD COLUMN "destinatario" "DestinatarioNota" NOT NULL DEFAULT 'ASESOR',
ADD COLUMN "avisoPrevioEnviado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: moneda, domiciliación, método de pago y fecha de emisión de la póliza.
-- primaAnual sigue en MXN: es la que suman métricas, comisiones, metas y ranking.
ALTER TABLE "Venta" ADD COLUMN "moneda" "MonedaPoliza" NOT NULL DEFAULT 'MXN',
ADD COLUMN "primaMoneda" DOUBLE PRECISION,
ADD COLUMN "tipoCambio" DOUBLE PRECISION,
ADD COLUMN "domiciliada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "metodoPago" "MetodoPagoPoliza",
ADD COLUMN "fechaEmision" TIMESTAMP(3);

-- CreateTable: historial de cobros (fuente del semáforo de pagos)
CREATE TABLE "PagoPoliza" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoPagoPoliza" NOT NULL DEFAULT 'PAGADO',
    "montoEsperado" DOUBLE PRECISION,
    "montoPagado" DOUBLE PRECISION,
    "justificacion" TEXT,
    "registradoPor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoPoliza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoPoliza_ventaId_periodo_idx" ON "PagoPoliza"("ventaId", "periodo");

-- AddForeignKey
ALTER TABLE "PagoPoliza" ADD CONSTRAINT "PagoPoliza_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoPoliza" ADD CONSTRAINT "PagoPoliza_registradoPor_fkey" FOREIGN KEY ("registradoPor") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
