-- Migration: 0086_capture_choices.sql
-- Two choices about what the AI does on its own (queue items 7 and 17, Kai 2026-10-23/25), on the
-- app_settings row so every device follows them. Additive and idempotent — every step can re-run.
--
-- 1. "File captures for me" (Settings → Capture & AI): off by default (Kai decided). Off, every
--    capture — ⌘K, voice, the tray, share, widgets, the capture key, paper, an assistant's
--    add_to_inbox — lands in the Inbox with the AI's guess as a one-tap suggestion; on, a confident
--    guess becomes a task by itself, with Undo (the behaviour until now). The capture endpoint and the
--    MCP/chat add_to_inbox queue a capture for the AI (payload.needs_parse) while it's on.
alter table app_settings add column if not exists auto_file_captures boolean not null default false;

-- 2. A project for new tasks and events made without one (Akiflow-like): 'suggest' (the default — a
--    quiet "→ Forecasting App?" chip that applies in one tap), 'assign' (put it there, with Undo) or
--    'off'. Read from the user's own history on the device (features/projects/autoProject.ts); never
--    on journal or people content.
alter table app_settings add column if not exists auto_project text not null default 'suggest';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_auto_project_known') then
    alter table app_settings add constraint app_settings_auto_project_known check (auto_project in ('off', 'suggest', 'assign'));
  end if;
end $$;
