---
date: 2026-10-14 00:31 (Cairo)
session: event-reminders
type: handoff
related: parity audit A12 (`2026-10-13-0808-p7e-parity-audit.md`)
---

# 2026-10-14 00:31 · handoff · event-reminders (A12: per-event reminders — the gym, a meal)

Branch `claude/event-reminders`, from `claude/kai-bugs-1012`. Not merged and not released.

## What it does

- **Migration 0077** (additive, idempotent): `calendar_events.remind_min int?` (0–1440, minutes before each
  start; an offset, so it follows a moved event and every occurrence of a series), `app_settings.event_reminder_on
  bool default true`, a partial unique index `activity_log_event_reminder_once`, and pg_cron
  `event-reminder-sweep` (every 5 min, `{kind:'event_reminder'}`). DATA_MODEL.md updated.
- **Event menu** (desktop popover and phone sheet, `blockMenuSpec.ts` → `BlockMenu.tsx` / `PhoneSheets.tsx`): a
  Remind row after Repeat — No reminder / At start / 5 / 10 / 15 / 30 min / 1 hr before — with Undo
  (`calendar/api.ts setEventRemindWithUndo`). On an occurrence it sets the series row. Not offered on task blocks
  (their task reminds), all-day blocks (no start time) or Google events (read-only).
- **One rule** `supabase/functions/_shared/eventReminder.ts` (`eventRemindersDue`): which occurrences' reminder
  moments fall in a window; never `source 'gcal'`, all-day or trashed rows. Used by both senders.
- **notify** `event_reminder`: push users with a reminding event; the occurrences due in the last 10 minutes →
  "Gym · in 15 min" / "18:00–19:30" · Open (the calendar on that day); several at once = "2 events"; private =
  "An event · in 15 min" / "Unlock to see it". Its switch, pause and quiet hours apply. **Once per occurrence:**
  each is claimed with its `notify.event_reminder` history row (`entity_id` = event row, `payload.starts_at`)
  before the push; the unique index turns a repeat sweep into a 23505 → skipped. Off/paused = nothing sent or
  claimed. Uses `npm:rrule@2` like chat/mcp.
- **Device planner** (`notifications/plan.ts`, Windows sweep + Android schedule) plans them from the cached
  `calendar_events` (TrayBridge loads them on any page, Android re-plans when they change).
- Settings → Notifications → Kinds gets **Event reminder** (from `kinds.ts`); Activity's history shows the row with Open.

## Evidence

- `npx vitest run` ×4 TZ (UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo; PowerShell `$env:TZ`): 155 files,
  2119 tests green each. New: `app/src/features/notifications/eventReminder.test.ts` (one-off window edges, a moved
  event, series occurrences + exdate, gcal/all-day/trashed/no-reminder, New York DST, key normalising, planner
  wording/private/quiet/grouped/switch); `blockMenuSpec.test.ts` updated.
- `npm run lint` 0 errors (21 warnings, none in touched files) · `npm run build` ok · `npm run ds:check -- --baseline
  scripts/ds-baseline.json` 0 new.
- Browser (mock backend, dev server :5281, from this worktree): `docs/log/assets/event-reminders/verify.mjs`
  **37/37** — desktop Remind row + submenu (day/night) with Undo; set from an occurrence lands on the series row;
  none on Google events or task blocks; phone sheet (day/night); the Windows planner toasts "Gym · in 15 min" at
  10:45 and the daily walk's occurrence at 11:00, each once, the Google event never; switch off = silent; Settings
  switch writes `event_reminder_on`; Activity history row + Open → `/calendar?date=2026-10-12`. Reruns:
  `event-detail` **68/68** (a1/p1 now expect the Remind row), `tray-notices` **59/59**.
- No deno locally: `notify/index.ts` is mirrored on the existing task/routine branches, not type-checked or run.

## Deploy order ([KAI])

1. `npx supabase db push --include-all` — 0077 (schedules the cron; until step 2 the old notify answers 400
   "unknown kind", harmless).
2. `npx supabase functions deploy notify`
3. Frontend (merge → master). The client writes `remind_min` / `event_reminder_on`, so it must not ship before 0077.

## Left out

- QuickCreate / the phone create sheet have no Remind field yet (the brief named the event menu only).
- Web Push latency is the 5-minute cron (as task reminders); the Windows/Android planners are exact.
