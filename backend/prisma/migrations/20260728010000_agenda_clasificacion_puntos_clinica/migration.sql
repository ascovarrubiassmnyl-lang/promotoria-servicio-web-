-- Agenda: nueva modalidad "Entrega de póliza" y clasificación por color
-- (productiva/gestión/personal); los eventos PERSONAL no llevan cliente.
ALTER TYPE "ModalidadCita" ADD VALUE IF NOT EXISTS 'ENTREGA_POLIZA';

CREATE TYPE "ClasificacionCita" AS ENUM ('PRODUCTIVA', 'GESTION', 'PERSONAL');

ALTER TABLE "Cita" ADD COLUMN "clasificacion" "ClasificacionCita" NOT NULL DEFAULT 'PRODUCTIVA';
ALTER TABLE "Cita" ALTER COLUMN "clienteId" DROP NOT NULL;

-- Sistema de 25 puntos: registro diario + listas de planeación semanal.
CREATE TABLE "RegistroPuntos" (
    "id" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "referidosObtenidos" INTEGER NOT NULL DEFAULT 0,
    "referidosContactados" INTEGER NOT NULL DEFAULT 0,
    "llamadasRealizadas" INTEGER NOT NULL DEFAULT 0,
    "citasObtenidas" INTEGER NOT NULL DEFAULT 0,
    "citasPlaneadas" INTEGER NOT NULL DEFAULT 0,
    "citasNuevas" INTEGER NOT NULL DEFAULT 0,
    "cuestionariosPlaneados" INTEGER NOT NULL DEFAULT 0,
    "cuestionariosRealizados" INTEGER NOT NULL DEFAULT 0,
    "cierresPlaneados" INTEGER NOT NULL DEFAULT 0,
    "cierresRealizados" INTEGER NOT NULL DEFAULT 0,
    "solicitudes" INTEGER NOT NULL DEFAULT 0,
    "comision" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroPuntos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistroPuntos_asesorId_fecha_key" ON "RegistroPuntos"("asesorId", "fecha");

ALTER TABLE "RegistroPuntos" ADD CONSTRAINT "RegistroPuntos_asesorId_fkey"
    FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlanSemanal" (
    "id" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "semanaInicio" DATE NOT NULL,
    "mejoresProspectos" JSONB,
    "desarrolloPersonal" JSONB,
    "oportunidadesVenta" JSONB,
    "oportunidadesServicio" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSemanal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanSemanal_asesorId_semanaInicio_key" ON "PlanSemanal"("asesorId", "semanaInicio");

ALTER TABLE "PlanSemanal" ADD CONSTRAINT "PlanSemanal_asesorId_fkey"
    FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Clínica telefónica: evaluador de prospectos semanal + sesiones realizadas.
CREATE TABLE "ProspectoClinica" (
    "id" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "semanaInicio" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "parentesco" TEXT,
    "edad" INTEGER,
    "estadoCivil" TEXT,
    "ocupacion" TEXT,
    "dependientes" TEXT,
    "tieneSeguro" BOOLEAN,
    "fechaEntrevista" TIMESTAMP(3),
    "planSeguimiento" TEXT,
    "resultado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "clienteId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectoClinica_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProspectoClinica_asesorId_semanaInicio_idx" ON "ProspectoClinica"("asesorId", "semanaInicio");

ALTER TABLE "ProspectoClinica" ADD CONSTRAINT "ProspectoClinica_asesorId_fkey"
    FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectoClinica" ADD CONSTRAINT "ProspectoClinica_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SesionClinica" (
    "id" TEXT NOT NULL,
    "asesorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "llamadas" INTEGER NOT NULL DEFAULT 0,
    "citasObtenidas" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionClinica_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesionClinica_asesorId_fecha_idx" ON "SesionClinica"("asesorId", "fecha");

ALTER TABLE "SesionClinica" ADD CONSTRAINT "SesionClinica_asesorId_fkey"
    FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RBAC: las nuevas secciones "puntos" y "clinica" nacen permitidas para los
-- roles existentes (accesoEfectivo falla cerrado: sin esta fila nadie las ve).
UPDATE "PoliticaRol" SET "accesos" = "accesos" || '{"puntos": true, "clinica": true}'::jsonb;
