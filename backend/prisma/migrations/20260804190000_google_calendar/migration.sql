-- Integración con Google Calendar (2026-08): cada usuario conecta su propia
-- cuenta de Google desde Configuración y guardamos su refresh token para
-- escribir eventos en su calendario (acompañamientos aceptados).
CREATE TABLE "GoogleCalendarCuenta" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiraEn" TIMESTAMP(3),
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarCuenta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarCuenta_usuarioId_key" ON "GoogleCalendarCuenta"("usuarioId");

ALTER TABLE "GoogleCalendarCuenta" ADD CONSTRAINT "GoogleCalendarCuenta_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Espejo del evento en Google para poder actualizarlo/borrarlo después.
ALTER TABLE "Cita" ADD COLUMN "googleEventId" TEXT;
ALTER TABLE "Cita" ADD COLUMN "googleEventUsuarioId" TEXT;
