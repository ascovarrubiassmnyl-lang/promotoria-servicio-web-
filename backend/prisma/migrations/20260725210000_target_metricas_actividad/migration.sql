-- Metas detalladas: además de ventas y prima, cada meta (individual y de
-- promotoría) puede fijar citas realizadas, prospectos nuevos, referidos
-- obtenidos y llamadas del mes.
ALTER TABLE "Target"
  ADD COLUMN "metaCitasNum" INTEGER,
  ADD COLUMN "metaProspectosNum" INTEGER,
  ADD COLUMN "metaReferidosNum" INTEGER,
  ADD COLUMN "metaLlamadasNum" INTEGER;

ALTER TABLE "TargetEquipo"
  ADD COLUMN "metaCitasNum" INTEGER,
  ADD COLUMN "metaProspectosNum" INTEGER,
  ADD COLUMN "metaReferidosNum" INTEGER,
  ADD COLUMN "metaLlamadasNum" INTEGER;
