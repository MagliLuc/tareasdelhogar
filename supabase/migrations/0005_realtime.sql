-- ============================================================
-- Habilita Realtime (gratis) para que los cambios se reflejen al
-- instante en todos los celulares. No confundir con
-- "Replication → Destinations" del dashboard, que es un servicio
-- pago de exportación a sistemas externos y no se usa acá.
-- ============================================================

alter publication supabase_realtime add table public.task_instances;

-- Con esto los eventos de borrado también llegan completos
alter table public.task_instances replica identity full;
