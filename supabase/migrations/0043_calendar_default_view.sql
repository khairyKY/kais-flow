-- Kai 2026-10-03: the day-count view the calendar opens on (Settings → Calendar), per user so it
-- follows him from the desktop to the phone. The views both calendars have: day · 3 days · week.
-- null = never chosen → each platform keeps its own default (desktop: week, phone: day).
-- app_settings already carries RLS (`user_id = auth.uid()`, 0003) and a per-user pk (0030).
alter table app_settings
  add column if not exists calendar_default_view text
  check (calendar_default_view in ('day', '3day', 'week'));
