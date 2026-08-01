-- CreateEnum
CREATE TYPE "EtapaCandidato" AS ENUM ('ENTREVISTA_INICIAL', 'SELECCION', 'CARRERA', 'ENTREVISTA_ADICIONAL', 'PRECONTRATO_MC', 'FIRMA_CONTRATO_FC');

-- CreateEnum
CREATE TYPE "SemaforoCandidato" AS ENUM ('SIN_EVALUAR', 'VERDE', 'AMARILLO', 'ROJO');

-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "candidatoId" TEXT;

-- CreateTable
CREATE TABLE "Candidato" (
    "id" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "reclutadorId" TEXT,
    "oficina" TEXT,
    "nombre" TEXT NOT NULL,
    "apellidoP" TEXT NOT NULL,
    "apellidoM" TEXT,
    "telefono" TEXT NOT NULL,
    "ciudad" TEXT,
    "email" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "sexo" TEXT,
    "rfc" TEXT,
    "fuente" TEXT NOT NULL,
    "referidoPor" TEXT,
    "notas" TEXT,
    "calle" TEXT,
    "colonia" TEXT,
    "codigoPostal" TEXT,
    "estadoDireccion" TEXT,
    "profesion" TEXT,
    "gradoEstudios" TEXT,
    "antiguedadResidencia" TEXT,
    "estadoCivil" TEXT,
    "numeroHijos" INTEGER,
    "ingresosAnuales" DOUBLE PRECISION,
    "etapa" "EtapaCandidato" NOT NULL DEFAULT 'ENTREVISTA_INICIAL',
    "semaforo" "SemaforoCandidato" NOT NULL DEFAULT 'SIN_EVALUAR',
    "archivadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluacionCandidato" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "evaluadorId" TEXT NOT NULL,
    "caracterIntegridad" INTEGER NOT NULL DEFAULT 0,
    "agilidadMental" INTEGER NOT NULL DEFAULT 0,
    "empuje" INTEGER NOT NULL DEFAULT 0,
    "nivelEnergia" INTEGER NOT NULL DEFAULT 0,
    "motivacionDinero" INTEGER NOT NULL DEFAULT 0,
    "posibilidadPermanencia" INTEGER NOT NULL DEFAULT 0,
    "imagenProfesional" INTEGER NOT NULL DEFAULT 0,
    "enfoqueSocial" INTEGER NOT NULL DEFAULT 0,
    "autoGestionable" INTEGER NOT NULL DEFAULT 0,
    "orientadoProcesos" INTEGER NOT NULL DEFAULT 0,
    "claridadMetas" INTEGER NOT NULL DEFAULT 0,
    "enfoqueActividad" INTEGER NOT NULL DEFAULT 0,
    "vitalesCompletadosEn" TIMESTAMP(3),
    "valoresCompletadosEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluacionCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidato_etapa_idx" ON "Candidato"("etapa");

-- CreateIndex
CREATE INDEX "Candidato_reclutadorId_idx" ON "Candidato"("reclutadorId");

-- CreateIndex
CREATE INDEX "Candidato_creadoPorId_idx" ON "Candidato"("creadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluacionCandidato_candidatoId_key" ON "EvaluacionCandidato"("candidatoId");

-- CreateIndex
CREATE INDEX "Cita_candidatoId_idx" ON "Cita"("candidatoId");

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidato" ADD CONSTRAINT "Candidato_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidato" ADD CONSTRAINT "Candidato_reclutadorId_fkey" FOREIGN KEY ("reclutadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluacionCandidato" ADD CONSTRAINT "EvaluacionCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluacionCandidato" ADD CONSTRAINT "EvaluacionCandidato_evaluadorId_fkey" FOREIGN KEY ("evaluadorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RBAC: la sección "candidatos" es de administración (piso de rol como
-- asesores/configuracion): nace concedida a ADMIN y negada a ASESOR — la
-- captura de un candidato por un asesor pasa por POST /api/candidatos, que
-- solo exige autenticación (ver routes/candidatos.js).
UPDATE "PoliticaRol" SET "accesos" = "accesos" || '{"candidatos": true}'::jsonb WHERE "rol" <> 'ASESOR';
UPDATE "PoliticaRol" SET "accesos" = "accesos" || '{"candidatos": false}'::jsonb WHERE "rol" = 'ASESOR';
