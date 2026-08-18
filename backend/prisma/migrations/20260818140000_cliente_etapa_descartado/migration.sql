-- Etapa terminal "Descartado" para clientes que ya no van a comprar.
-- ALTER TYPE ... ADD VALUE agrega el valor al final del enum (igual que en
-- schema.prisma) y en PostgreSQL 12+ puede correr dentro de la transacción de
-- la migración mientras no se use el valor nuevo en la misma transacción.
ALTER TYPE "EstadoCliente" ADD VALUE IF NOT EXISTS 'DESCARTADO';
