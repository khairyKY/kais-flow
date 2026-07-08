-- Issue #3: app_settings gains notifications_last_seen_at for bell badge unread count.

alter table app_settings add column notifications_last_seen_at timestamptz;
