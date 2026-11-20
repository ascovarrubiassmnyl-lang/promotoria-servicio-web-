-- Medición de uso de Inicio (auditoría de Inicio, 2026-11-20): un registro por
-- clic en cada bloque/acción. Tabla nueva, no toca datos existentes.

-- CreateTable
CREATE TABLE "EventoInicio" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "bloque" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoInicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoInicio_creadoEn_idx" ON "EventoInicio"("creadoEn");

-- CreateIndex
CREATE INDEX "EventoInicio_bloque_accion_idx" ON "EventoInicio"("bloque", "accion");

-- AddForeignKey
ALTER TABLE "EventoInicio" ADD CONSTRAINT "EventoInicio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
