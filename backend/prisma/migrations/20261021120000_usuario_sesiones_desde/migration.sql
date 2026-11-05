-- Cierre de sesiones por usuario (cambio de contraseña / cerrar en otros dispositivos).
ALTER TABLE "Usuario" ADD COLUMN "sesionesDesde" TIMESTAMP(3);
