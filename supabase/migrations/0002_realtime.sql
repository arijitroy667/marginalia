-- 0002_realtime.sql — FR-SYN-06 (P1): stream annotation and reading-position changes to the user's other devices.
-- Realtime applies RLS to postgres_changes, so each subscriber receives only its own rows.
alter publication supabase_realtime add table public.annotations, public.reading_positions;
