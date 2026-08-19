-- Política RBAC del rol ASISTENTE = copia exacta de la de ADMIN (mismo acceso
-- que la promotora). Se inserta con los accesos vigentes de ADMIN, no con una
-- lista hardcodeada, para que herede cualquier ajuste que ya se le haya hecho
-- a la política de promotor desde Configuración → "Roles y accesos".
-- ON CONFLICT DO NOTHING: si la fila ya existe (seed), no se pisa.
INSERT INTO "PoliticaRol" ("id", "rol", "accesos", "actualizadoEn")
SELECT 'politica_asistente', 'ASISTENTE', "accesos", CURRENT_TIMESTAMP
FROM "PoliticaRol" WHERE "rol" = 'ADMIN'
ON CONFLICT ("rol") DO NOTHING;

-- Si no hubiera fila de ADMIN (base sin seed), se crea con el acceso total a
-- las secciones vigentes, que es lo que corresponde a este rol.
INSERT INTO "PoliticaRol" ("id", "rol", "accesos", "actualizadoEn")
VALUES ('politica_asistente', 'ASISTENTE', '{"dashboard":true,"clientes":true,"citas":true,"ventas":true,"actividad":true,"metas":true,"puntos":true,"clinica":true,"candidatos":true,"asesores":true,"configuracion":true}', CURRENT_TIMESTAMP)
ON CONFLICT ("rol") DO NOTHING;
