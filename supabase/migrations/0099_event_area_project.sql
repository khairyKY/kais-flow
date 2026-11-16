-- "Colour follows where it lives" (Kai 2026-11-16): an event can belong to an area or a project, like a task, and
-- takes that place's colour unless it has one of its own (own colour -> project -> area -> default).
--   project_id  already there since 0061 (the block popover's Project row): `if not exists`, so this is a no-op on it
--   area_id     new
-- Both are FKs that fall back to null if the project or area is ever deleted for good (Trash only hides them).
-- RLS (calendar_events_all, 0004) and the updated_at trigger cover the new column; nothing else changes.
-- (0097 is reserved and unused.)

alter table calendar_events
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists area_id uuid references areas(id) on delete set null;

create index if not exists calendar_events_area_id_idx on calendar_events (area_id) where area_id is not null;
