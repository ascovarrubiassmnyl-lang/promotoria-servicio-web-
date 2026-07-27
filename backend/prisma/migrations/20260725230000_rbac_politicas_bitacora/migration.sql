-- RBAC: política de acceso por rol + bitácora de cambios de permisos.

-- CreateTable
CREATE TABLE "PoliticaRol" (
    "id" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "accesos" JSONB NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliticaRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermisoLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorNombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermisoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoliticaRol_rol_key" ON "PoliticaRol"("rol");

-- CreateIndex
CREATE INDEX "PermisoLog_creadoEn_idx" ON "PermisoLog"("creadoEn");

-- AddForeignKey
ALTER TABLE "PermisoLog" ADD CONSTRAINT "PermisoLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Políticas iniciales = comportamiento vigente del sistema (asesores y
-- configuración solo para promotores). SUPERADMIN no tiene fila: acceso total
-- hardcodeado (anti-lockout).
INSERT INTO "PoliticaRol" ("id", "rol", "accesos", "actualizadoEn") VALUES
  ('politica_asesor', 'ASESOR', '{"dashboard":true,"clientes":true,"citas":true,"ventas":true,"actividad":true,"metas":true,"asesores":false,"configuracion":false}', CURRENT_TIMESTAMP),
  ('politica_admin', 'ADMIN', '{"dashboard":true,"clientes":true,"citas":true,"ventas":true,"actividad":true,"metas":true,"asesores":true,"configuracion":true}', CURRENT_TIMESTAMP);
