-- Migration: 0067_routine_plant.sql
-- Routines 2 (Routines.dc.html 2a/2b, the New Routine form). RLS on routines is 0005's.
--
-- 1. "Its plant": each routine grows one of the five species the picker lists, and that species is
--    what its garden card and streak trellis draw (features/routines/plant.ts maps the streak to each
--    species' stage). Every routine planted before this keeps the vine it always grew.
-- 2. Per-step minutes ("2 min", "10 min total"): a column beside routines.steps (0028), aligned by
--    position — step_minutes[i] is steps[i]'s minutes or null; [] = no step has minutes. steps stays
--    an array of plain strings, so builds already installed (which read it as strings and never
--    write step_minutes) keep working; their upserts leave this column as it is.
--
-- Release order: this BEFORE the frontend — the new client writes both columns on every routine save,
-- and PostgREST rejects an unknown column.
alter table routines
  add column if not exists plant text not null default 'vine'
  constraint routines_plant_check check (plant in ('vine', 'cherry', 'fern', 'clover', 'daisy'));

alter table routines
  add column if not exists step_minutes jsonb not null default '[]'::jsonb
  constraint routines_step_minutes_array check (jsonb_typeof(step_minutes) = 'array');
