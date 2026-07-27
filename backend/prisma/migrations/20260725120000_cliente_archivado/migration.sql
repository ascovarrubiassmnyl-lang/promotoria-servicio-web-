-- Borrado lógico de clientes: en vez de borrar físicamente (perdiendo pólizas,
-- citas y referidos en cascada), DELETE /api/clientes/:id ahora archiva.
-- null = cliente activo; con fecha = archivado (reversible).
ALTER TABLE "Cliente" ADD COLUMN "archivadoEn" TIMESTAMP(3);
