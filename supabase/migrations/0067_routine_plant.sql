-- Migration: 0067_routine_plant.sql
-- The New Routine form's "Its plant" picker (Routines.dc.html 2a/2b): each routine grows one of the
-- five species the picker lists, and that species is what its garden card and streak trellis draw
-- (features/routines/plant.ts maps the streak to each species' stage). Every routine planted before
-- this keeps the vine it always grew. RLS on routines is 0005's.
--
-- No schema change for 2a's per-step minutes: routines.steps (0028) is jsonb, and a step is now
-- either the old bare string or { "text": …, "minutes": n } (lib/types.ts RoutineStep).
--
-- Release order: this BEFORE the frontend — the new client writes `plant` on every routine save,
-- and PostgREST rejects an unknown column.
alter table routines
  add column if not exists plant text not null default 'vine'
  constraint routines_plant_check check (plant in ('vine', 'cherry', 'fern', 'clover', 'daisy'));
