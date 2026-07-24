-- CreateEnum nuevos
CREATE TYPE "TipoNota" AS ENUM ('NOTA', 'RECORDATORIO');
CREATE TYPE "FormaPago" AS ENUM ('MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO');

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "tipo" "TipoNota" NOT NULL DEFAULT 'NOTA',
    "texto" TEXT NOT NULL,
    "fechaAviso" TIMESTAMP(3),
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "notificacionEnviada" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Nota_asesorId_fechaAviso_idx" ON "Nota"("asesorId", "fechaAviso");

-- CreateIndex
CREATE INDEX "Nota_clienteId_idx" ON "Nota"("clienteId");

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_asesorId_fkey" FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE;

-- Columnas nuevas en Cliente
ALTER TABLE "Cliente" ADD COLUMN "productoInteres" "RamoSeguro";
ALTER TABLE "Cliente" ADD COLUMN "detalleInteres" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "productoComprado" "RamoSeguro";
ALTER TABLE "Cliente" ADD COLUMN "productoNombre" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "formaPago" "FormaPago";
ALTER TABLE "Cliente" ADD COLUMN "primaMonto" DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN "fechaInicioCobertura" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN "fechaRenovacion" TIMESTAMP(3);
