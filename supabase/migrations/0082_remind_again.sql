-- Migration: 0082_remind_again.sql
-- Reminder snooze (Kai 2026-10-17, "build snooze"): a task reminder's "In 10 min" / "In 1 hour" buttons
-- (Web Push, the Android app, the Windows app). Additive and idempotent — every step can re-run.
--
-- tasks.remind_again_at: one more reminder at this instant. The task's own reminder_at (its lead before
-- the due time, which every replan and repeat carries — lib/carryReminder.ts, recurrence nextReminderAt)
-- is left alone, and the task itself doesn't move. notify's task_reminder sweep sends it when it falls in
-- the last 10 minutes (the reminder_at window), then clears it; the Windows and Android apps plan it from
-- the same column (app/src/features/notifications/plan.ts). Null = none.
alter table tasks add column if not exists remind_again_at timestamptz;

-- The every-5-minutes sweep looks these up across all users (notify runForAllUsers): only the few set.
create index if not exists idx_tasks_remind_again on tasks (remind_again_at) where remind_again_at is not null;
