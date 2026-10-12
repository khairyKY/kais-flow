-- Repeating calendar events (Kai 2026-10-12: "You cannot set the recurrence of them no matter what you
-- do"; decision docs/log/2026-10-12-1752-local-decision-kai-bugs-1012.md — a real series, not the
-- tasks' roll-forward). One stored row is the series:
--   recurrence_rule     RRULE body ("FREQ=WEEKLY", "FREQ=WEEKLY;BYDAY=MO,WE"), read on the user's wall
--                       clock (app_settings.timezone) and anchored at starts_at; null = a one-off event.
--                       The app and the MCP/chat functions expand it for display
--                       (supabase/functions/_shared/series.ts); nothing is materialised here.
--   recurrence_exdates  occurrence start instants (ISO, UTC) the series skips — "Delete this event",
--                       and one occurrence dragged elsewhere.
--   series_id           on a detached occurrence (one dragged to a new time): the series it came from.
--   project_id          the block's project (the popover's Project row), like tasks.project_id.
-- RLS (calendar_events_all, 0004) and the updated_at trigger already cover the new columns.

alter table calendar_events
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_exdates text[] not null default '{}',
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists series_id uuid references calendar_events(id) on delete set null;

create index if not exists calendar_events_project_id_idx on calendar_events (project_id) where project_id is not null;
create index if not exists calendar_events_series_id_idx on calendar_events (series_id) where series_id is not null;
