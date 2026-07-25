-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "beneficiarios" JSONB,
ADD COLUMN     "coaseguro" TEXT,
ADD COLUMN     "coberturas" JSONB,
ADD COLUMN     "deducible" DOUBLE PRECISION,
ADD COLUMN     "plazo" TEXT,
ADD COLUMN     "sumaAsegurada" DOUBLE PRECISION;
