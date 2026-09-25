-- CreateTable
CREATE TABLE "CitaInvitado" (
    "id" TEXT NOT NULL,
    "citaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "invitadoPorId" TEXT NOT NULL,
    "estado" "EstadoInvitacionCita" NOT NULL DEFAULT 'PENDIENTE',
    "respondidaEn" TIMESTAMP(3),
    "sugerenciaInicio" TIMESTAMP(3),
    "sugerenciaFin" TIMESTAMP(3),
    "sugerenciaNota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitaInvitado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CitaInvitado_usuarioId_estado_idx" ON "CitaInvitado"("usuarioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CitaInvitado_citaId_usuarioId_key" ON "CitaInvitado"("citaId", "usuarioId");

-- AddForeignKey
ALTER TABLE "CitaInvitado" ADD CONSTRAINT "CitaInvitado_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaInvitado" ADD CONSTRAINT "CitaInvitado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaInvitado" ADD CONSTRAINT "CitaInvitado_invitadoPorId_fkey" FOREIGN KEY ("invitadoPorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
