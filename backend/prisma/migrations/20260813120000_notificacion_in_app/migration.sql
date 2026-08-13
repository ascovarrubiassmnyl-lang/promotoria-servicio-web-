-- Notificación in-app: fuente de verdad de los avisos que hasta ahora solo
-- disparaban push "mejor esfuerzo" (invitación de acompañamiento, respuesta a
-- invitación, respuesta a sugerencia de horario, recordatorios del job). La
-- fila se crea SIEMPRE antes de intentar el push, así el aviso no se pierde
-- aunque el navegador/celular no lo reciba.

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "datos" JSONB,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMP(3),
    "pushIntentado" BOOLEAN NOT NULL DEFAULT false,
    "pushEnviado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacion_destinatarioId_leida_creadoEn_idx" ON "Notificacion"("destinatarioId", "leida", "creadoEn");

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
