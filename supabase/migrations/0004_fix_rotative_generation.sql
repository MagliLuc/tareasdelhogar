-- ============================================================
-- Fix: el trigger on_task_created generaba las instancias en el
-- mismo insert de la tarea, antes de que la app pudiera cargar
-- los miembros de la rotación (task_rotation_members), por lo que
-- las tareas rotativas quedaban sin asignar.
--
-- Ahora la app llama a generate_task_instances(7, task_id) después
-- de insertar la tarea Y sus miembros de rotación.
-- ============================================================

drop trigger if exists on_task_created on public.tasks;
drop function if exists public.handle_new_task();
