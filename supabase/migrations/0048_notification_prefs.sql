-- Migration: 0048_notification_prefs.sql
-- Settings › Notifications (design-export/Tray and Notifications.dc.html 12i), per account. The
-- digest/nudge on-off + times are 0045's; this adds the rest of the card. `notify` reads them through
-- supabase/functions/notify/copy.ts (`deliver`): a kind switched off, or a pause still running, sends
-- nothing; quiet hours send silently; with lock_screen_names off no task name is in any payload.
-- Times are Cairo wall-clock, like 0045's. RLS and the per-user pk are already on app_settings.
alter table app_settings
  add column if not exists task_reminder_on boolean not null default true,
  -- Focus done is local (the app's own timer); stored here so every device agrees.
  add column if not exists focus_done_on boolean not null default true,
  add column if not exists quiet_hours_on boolean not null default true,
  add column if not exists quiet_from time not null default '22:30',
  add column if not exists quiet_to time not null default '07:00',
  -- Off by default, as drawn (12g): "Kai's Flow · A reminder" until turned on.
  add column if not exists lock_screen_names boolean not null default false,
  -- The tray's "Pause notifications for 1 hour"; null = not paused.
  add column if not exists notify_paused_until timestamptz;
