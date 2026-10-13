-- Migration: 0073_time_slots.sql
-- Time Slots (Kai 2026-10-13, parity audit B2 → a): a Time block (calendar_events type 'time_block')
-- HOLDS tasks, as Akiflow's slots do ("Code block💻", "Shaheen🛞"). A task dropped on one is in it —
-- no task block of its own; its scheduled_start/end are the slot's.
--
-- `slot_id`: the Time block's stored row (a repeating slot's series row, never an occurrence id).
-- `slot_date`: the occurrence it sits in, the slot's day on the user's clock (app_settings.timezone).
-- A hard delete of the slot (Trash compost) lets go of its tasks; the app clears them itself on a
-- soft delete. RLS is tasks' own (user_id = auth.uid()). Additive and idempotent: run it twice,
-- nothing changes. Old app builds never select or write these columns, so they keep working.
--
-- Release order: this BEFORE the app and `npx supabase functions deploy mcp` — both select the column.

alter table tasks add column if not exists slot_id uuid references calendar_events(id) on delete set null;
alter table tasks add column if not exists slot_date date;

create index if not exists tasks_slot_id_idx on tasks (slot_id) where slot_id is not null;
