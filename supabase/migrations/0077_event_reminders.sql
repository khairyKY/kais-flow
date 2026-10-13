-- Migration: 0077_event_reminders.sql
-- Per-event reminders (parity audit A12 — the gym, a meal): "remind me N minutes before" on a calendar
-- event. Additive and idempotent — every step can re-run.
--
-- 1. calendar_events.remind_min: minutes before each start; null = no reminder. An offset, not a
--    timestamp, so it follows a moved event and holds for every occurrence of a repeating series (one
--    row, 0061). Set from the event menu's Remind row (None / at start / 5 / 10 / 15 / 30 min / 1 hr).
--    Never on a Google event (source 'gcal', read-only): the app writes none there, and every reader
--    (_shared/eventReminder.ts) skips them anyway.
alter table calendar_events add column if not exists remind_min int
  check (remind_min is null or remind_min between 0 and 1440);

-- 2. Its switch (Settings → Notifications → Kinds, the 0048/0065 pattern): on by default.
alter table app_settings add column if not exists event_reminder_on boolean not null default true;

-- 3. Sent once per occurrence. notify claims each occurrence with its history row
--    (`notify.event_reminder`, entity_id = the event's row, payload.starts_at = that occurrence's start)
--    BEFORE it pushes; a second sweep over the same 10-minute window hits this index and sends nothing.
--    Per user, so nobody's rows can claim someone else's reminder.
create unique index if not exists activity_log_event_reminder_once
  on activity_log (user_id, entity_id, (payload->>'starts_at'))
  where event_type = 'notify.event_reminder';

-- 4. The sweep: every 5 minutes, like `task-reminder-sweep` (0016). cron.schedule with an existing
--    name replaces that job, so a re-run is harmless.
select cron.schedule(
  'event-reminder-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'event_reminder')
  );
  $$
);
