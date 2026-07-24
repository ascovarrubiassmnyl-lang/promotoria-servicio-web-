-- Pipeline de ventas: nuevos enums, campos y tablas

-- 1) Reemplazar enum EstadoCliente por el pipeline de 8 etapas
ALTER TABLE "Cliente" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Cliente" ALTER COLUMN "estado" TYPE TEXT USING "estado"::text;
DROP TYPE "EstadoCliente";
CREATE TYPE "EstadoCliente" AS ENUM ('PROSPECTO', 'CITA', 'PROPUESTA', 'CIERRE_FIRMA', 'ENTREGA_POLIZA', 'REFERIDOS', 'POST_VENTA_SEGUIMIENTO', 'NECESITA_SEGUIMIENTO');
ALTER TABLE "Cliente" ALTER COLUMN "estado" TYPE "EstadoCliente" USING 'PROSPECTO'::"EstadoCliente";
ALTER TABLE "Cliente" ALTER COLUMN "estado" SET DEFAULT 'PROSPECTO';

-- 2) Reemplazar enum EstadoVenta por el nuevo conjunto
ALTER TABLE "Venta" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Venta" ALTER COLUMN "estado" TYPE TEXT USING "estado"::text;
DROP TYPE "EstadoVenta";
CREATE TYPE "EstadoVenta" AS ENUM ('PENDIENTE_PAGAR', 'FIRMADA', 'PAGADA', 'CANCELADA', 'APROBADA', 'RECHAZADA');
ALTER TABLE "Venta" ALTER COLUMN "estado" TYPE "EstadoVenta" USING 'PENDIENTE_PAGAR'::"EstadoVenta";
ALTER TABLE "Venta" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE_PAGAR';

-- 3) Cliente: tracking de cartera y referidos por auto-relación
ALTER TABLE "Cliente" ADD COLUMN "fechaUltimaLlamada" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN "fechaUltimaCita"    TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN "referidoPorId"     TEXT;

CREATE INDEX "Cliente_asesorId_estado_idx" ON "Cliente"("asesorId", "estado");
CREATE INDEX "Cliente_referidoPorId_idx"   ON "Cliente"("referidoPorId");

ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_referidoPorId_fkey"
  FOREIGN KEY ("referidoPorId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Venta: pipeline financiero y enlace al catálogo de productos
ALTER TABLE "Venta" ADD COLUMN "productoCatalogoId" TEXT;
ALTER TABLE "Venta" ADD COLUMN "fechaFirma"          TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN "fechaPago"           TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN "fechaEntregaPoliza"  TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN "fechaCancelacion"    TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN "montoCancelado"       DOUBLE PRECISION;
ALTER TABLE "Venta" ADD COLUMN "motivoCancelacion"    TEXT;

-- 5) Tabla ProductoCatalogo: catálogo de productos Seguros Monterrey NYL
CREATE TABLE "ProductoCatalogo" (
    "id"              TEXT NOT NULL,
    "ramo"            "RamoSeguro" NOT NULL,
    "nombre"          TEXT NOT NULL,
    "codigo"          TEXT,
    "descripcion"     TEXT,
    "comisionPct"     DOUBLE PRECISION,
    "comisionBonoPct" DOUBLE PRECISION,
    "activo"          BOOLEAN NOT NULL DEFAULT true,
    "creadoEn"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoCatalogo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductoCatalogo_ramo_nombre_key" ON "ProductoCatalogo"("ramo", "nombre");

ALTER TABLE "Venta" ADD CONSTRAINT "Venta_productoCatalogoId_fkey"
  FOREIGN KEY ("productoCatalogoId") REFERENCES "ProductoCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Tabla Referido: relación origen→referido para gestión de referidos
CREATE TABLE "Referido" (
    "id"                  TEXT NOT NULL,
    "asesorId"            TEXT NOT NULL,
    "clienteOrigenId"     TEXT NOT NULL,
    "clienteReferidoId"   TEXT,
    "nombreReferido"      TEXT,
    "telefonoReferido"    TEXT,
    "emailReferido"       TEXT,
    "estado"              TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fecha"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas"               TEXT,
    "creadoEn"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Referido_asesorId_estado_idx"     ON "Referido"("asesorId", "estado");
CREATE INDEX "Referido_clienteOrigenId_idx"     ON "Referido"("clienteOrigenId");

ALTER TABLE "Referido" ADD CONSTRAINT "Referido_asesorId_fkey"
  FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referido" ADD CONSTRAINT "Referido_clienteOrigenId_fkey"
  FOREIGN KEY ("clienteOrigenId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referido" ADD CONSTRAINT "Referido_clienteReferidoId_fkey"
  FOREIGN KEY ("clienteReferidoId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) Tabla Bono: bonos de producción por asesor y período (PENDIENTE / COBRADO)
CREATE TABLE "Bono" (
    "id"          TEXT NOT NULL,
    "asesorId"    TEXT NOT NULL,
    "mes"         INTEGER NOT NULL,
    "anio"        INTEGER NOT NULL,
    "concepto"    TEXT NOT NULL,
    "monto"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado"      TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fechaCobro"  TIMESTAMP(3),
    "notas"       TEXT,
    "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bono_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bono_asesorId_mes_anio_concepto_key" ON "Bono"("asesorId", "mes", "anio", "concepto");
CREATE INDEX "Bono_asesorId_estado_idx" ON "Bono"("asesorId", "estado");

ALTER TABLE "Bono" ADD CONSTRAINT "Bono_asesorId_fkey"
  FOREIGN KEY ("asesorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
