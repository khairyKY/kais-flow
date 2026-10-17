---
date: 2026-10-17
session: snooze (builder, worktree .claude/worktrees/snooze, branch claude/snooze from claude/kai-bugs-1012)
type: handoff
---

# 2026-10-17 14:15 · handoff · snooze

Kai: *"build snooze"*. Built on `claude/snooze` and pushed. Not merged, no PR. **One migration: 0082.**

Gap it closes: snooze existed only for Inbox items; task Snooze had been taken out of the row menu
(ROADMAP 2026-09-28); reminders offered only Done / Tomorrow.

## 1 · Snooze a task (Akiflow / Gmail model)

No migration: it is the existing `tasks.snoozed_until`. Pure rules in `features/tasks/snooze.ts`
(`isSnoozed`, `backFromSnooze`, `snoozeWhen`, `snoozeLine`), tested in `snooze.test.ts`.

- **A snoozed task** (`snoozed_until` still ahead) is on no list (`grouping.ts` `filterByList`, All
  included), not on Today (`todayListTasks`, so not in the tray / widgets either), not on the calendar
  rail (`filterByScope`), and not a Top 3 pick. Its due date, calendar block and reminder stay: snooze
  hides, it doesn't replan. Project / area pages still show it, marked "Snoozed · back …" with Unsnooze.
- **It comes back by itself** at that instant (no write: the lists read the clock). For the rest of
  that day (the user's zone) it is marked **"Back from snooze"** and leads Today: first in Also open on
  the computer, its own short list above the folds on the phone (the phone folds everything else).
  It is kept out of the Overdue fold for that day. ponytail: no "seen" state, the marker just lasts the day.
- **Where:** the one task row menu (right-click and ⋯; the phone's action sheet) **Snooze…** after the
  plan rows, opening the Inbox's own `SnoozeMenu` (Later today +3h · This evening · Tomorrow · Next
  week · Someday · Pick a date…) as a submenu on the computer, its sheet on the phone. A snoozed task's
  row reads **Unsnooze · back 15:00** instead. Also: the task's own ⋯ (`TaskFields.tsx` `TaskMoreMenu`:
  the phone sheet and the editor page), the bulk bar's **More → Snooze…**, a selected row's menu
  ("Snooze… (3)").
- **Key: Z** (Snooze…, or Unsnooze on a snoozed row; with a selection, all of them). **S was taken**
  (Someday, P7e A18), so Z ("zzz"); it shows in the `?` cheatsheet and as the menu row's keycap.
- **Snoozed place:** a **Snoozed** tab on Tasks (`/tasks?list=snoozed`, after Someday, shown only
  while something is snoozed): single column, soonest back first, each row "Snoozed · back Tue 20 Oct
  · 09:00" with an **Unsnooze** button. Smallest diff over the list switcher: one `SmartList` value and
  one `GroupKey` in `grouping.ts`, one tab in `TasksPage`. Not added to the sidebar (the smart-lists
  builder owns it).
- **Undo toasts:** "Snoozed until 15:00" / "Snoozed until Tomorrow · 09:00" / "3 tasks snoozed until
  …"; "Unsnoozed". Ctrl+Z works. Logged `task.snoozed` (`{snoozed_until}`) / `task.unsnoozed`
  (Activity describes both).
- **Top 3 / goal decision:** snoozing gives the Top 3 place up, as any move off today does — even
  "Later today". One rule: `top3Rule.ts isTop3Today` is false while snoozed, so `writeRow`'s
  `releaseTop3` drops the star and rank on the snooze write; mirrored in `_shared/today.ts` (notify's
  digest, MCP). Undo puts the star and rank back (it was the goal → it is the goal again).

## 2 · Snooze a reminder

Migration **0082** `tasks.remind_again_at timestamptz?` + partial index. A reminder's buttons are now
**Done · In 10 min · In 1 hour · Tomorrow** (`notify/copy.ts reminderNotice`; a grouped "3 reminders"
notice: Open · In 10 min · In 1 hour). The press (actions `snooze10` / `snooze60`,
`notifications/actions.ts`) writes `remind_again_at = now + N` through the outbox, toast "Reminding you
again at 10:10 · Undo". The task, its date and its own `reminder_at` don't move.

- **Server (Web Push):** `notify`'s `task_reminder` sweep (every 5 min, 10-minute window) now picks a task
  whose `reminder_at` (not sent) **or** `remind_again_at` is due (one PostgREST `or`, also for the
  due-owners query), sends it, clears `remind_again_at`, and sets `reminder_sent` only when the task's own
  reminder was the due one.
- **Web Push buttons:** Chrome shows two, so the worker now slices to `Notification.maxActions` (2 →
  **Done · In 10 min**; "In 1 hour" and Tomorrow only where the browser has room). The snooze presses run
  in the background like Done/Tomorrow (no window brought forward); with no window open the app opens
  with `?kfAction=snooze10` and runs it, as before for every action.
- **Android (local notifications):** the planner (`notifications/plan.ts`) treats `remind_again_at` as one
  more reminder moment (its own key), so the OS schedule gets it when the press re-plans; Android shows
  the first three buttons (Done · In 10 min · In 1 hour).
- **Windows (Tauri toasts):** buttons are supported; `tray.rs notify_local` now takes up to **four**
  (was two; Windows allows five). The 30-second sweep plans `remind_again_at` the same way.
- In-app history (Activity) keeps Done · Tomorrow on a past reminder (the snooze buttons belong to the
  notification itself).
- **Skipped: event reminders** (0077, "Gym · in 15 min", button: Open). Same idea would need
  `calendar_events.remind_again_at`, the event id in the notice and per-occurrence handling in notify
  and the planner. Add when Kai asks.

## 3 · MCP

`snooze_task` (`until`: `'later today'` · `'this evening'` · `'tomorrow'` · `'next week'` on the user's
clock — the SnoozeMenu's rules, `tools.ts snoozePreset` — or a date (09:00) / local date-time / ISO;
must be in the future; bulk `ids`) and `unsnooze_task` (refuses a task that isn't snoozed). Both through
`settle()` (a pick lets its place go), logged with `source: 'mcp'`. `today` leaves snoozed tasks out
(`splitToday`); `taskOut` adds `snoozed_until` while snoozed. **49 tools per key, 55 with the personal
ones** (`mcp.test.ts`, `supabase/tests/mcp-full.sh` counts + a real-Postgres snooze section,
`docs/MCP.md`, `DATA_MODEL.md`).

## Gate

In `app/` (node_modules installed with `npm ci`):

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` × `$env:TZ` = Africa/Cairo · UTC · America/Los_Angeles · Asia/Tokyo | 166 files · **2298 / 2298** in each (was 2283; + snooze, menu spec, MCP snooze, plan, actions, worker) |
| `npm run lint` | **0 errors** (24 warnings, all pre-existing) |
| `npm run build` | ok |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | **0 new** |
| `grep -c birthday_on app/src/lib/types.ts` / `'birthday_on: false' settings.ts` | 1 / 1 |

Harnesses, mock dev server on http://localhost:5293 (`--mode mock`, stopped at the end):

| Suite | Result |
|---|---|
| **snooze (new)** `docs/log/assets/snooze/verify.mjs` | **74 / 74** — row menu → gone from All → Snoozed tab (return times) → Unsnooze; Undo (+ the goal's Top 3 place back); Z + Ctrl+Z + the cheatsheet; back at the top of Today (desktop + phone, day + night); the phone sheet; the task's own ⋯ (editor + phone sheet); a reminder's In 10 min from a closed app (`?kfAction=snooze10`) |
| fix-tasks | 70 / 70 |
| today-shell | 86 / 86 |
| undo-verbs | 88 / 88 |
| tasks-noise | 202 / 202 |
| calendar-rail | 101 / 101 |
| notify-fix | 26 / 26 — first run 25/26: its Windows toast check expected the old Done · Tomorrow pair; updated to the four buttons (a real change, not flake) |
| tray-notices | 59 / 59 |
| event-reminders | 37 / 37 |

Backend: no Deno (no `deno check`), no Supabase CLI or Docker (0082 not applied locally).

## Deploy order (release rehearsal)

1. `supabase db push` (0082) **before** the frontend — the app selects `remind_again_at` (`lib/columns.ts`).
2. `supabase functions deploy notify` and `mcp`.
3. Frontend; the Windows build picks up the `tray.rs` change (not compiled here — `cargo` exists but a
   cold Tauri build was too heavy for this loaded machine; the change is `take(2)` → `take(4)`).

## Not verified here

- Real notification buttons on devices: Chrome/Edge Web Push (2 buttons), Android (3), a Windows toast (4).
  The worker, the Android action types and the planner are unit-tested; the cold-window
  `?kfAction=snooze10` path ran in the real app (harness `n`).
- `notify` and `mcp` under Deno (`deno check`): Deno isn't installed. Migration 0082 not applied: no
  Supabase CLI or Docker. Both are additive and the release rehearsal applies / runs them
  (`mcp-full.sh` now covers snooze).
