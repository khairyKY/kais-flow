-- Issue #2: per-task reminders — independent of due date, with a sentinel flag for the notify sweep.

alter table tasks add column reminder_at timestamptz;
alter table tasks add column reminder_sent bool not null default false;

create index idx_tasks_reminder_sweep on tasks(reminder_at) where reminder_sent = false and status != 'done';
