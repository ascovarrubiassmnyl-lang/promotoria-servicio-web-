-- Tres etapas nuevas para la columna Etapa de clientes:
--   CONTACTADO  → paso del embudo entre PROSPECTO y CITA ("ya le hablé, aún
--                 no me da cita"). Se inserta con BEFORE 'CITA' para que el
--                 orden del enum en Postgres coincida con schema.prisma.
--   STANDBY     → pausado a propósito ("búscame en 3 meses"), fuera del embudo.
--   RETARGETING → se enfrió, hay que volver a trabajarlo; también fuera del
--                 embudo (no es progreso, es re-contacto).
-- ALTER TYPE ... ADD VALUE puede correr dentro de la transacción de la
-- migración en PostgreSQL 12+ mientras el valor nuevo no se use en la misma
-- transacción (igual que la migración de DESCARTADO).
ALTER TYPE "EstadoCliente" ADD VALUE IF NOT EXISTS 'CONTACTADO' BEFORE 'CITA';
ALTER TYPE "EstadoCliente" ADD VALUE IF NOT EXISTS 'STANDBY';
ALTER TYPE "EstadoCliente" ADD VALUE IF NOT EXISTS 'RETARGETING';
