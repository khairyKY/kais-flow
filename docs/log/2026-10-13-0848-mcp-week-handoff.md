---
date: 2026-10-13 08:48 UTC
session: mcp-week (builder)
type: handoff
related: 2026-10-13-0808-p7e-parity-audit.md (§3 A list: A1, A14, A20); docs/MCP.md
supersedes: none
---

# MCP plans the week (A1) + paused stays paused (A14) + hand-filed GitHub tasks tick (A20): handoff

Branch `claude/mcp-week`, from `origin/claude/kai-bugs-1012` (1c5bfb3f). Pushed. **Not merged, no PR.**
No migration. Backend only: nothing in `app/src` changed except tests, so the frontend build is unchanged.

| Item | Commit | Result |
|---|---|---|
| A14 · a paused series stays paused on the server and in MCP | `ada3b8ac` | done |
| A20 · a GitHub task filed by hand is ticked when its issue closes | `58d41272` | done |
| A1 · MCP can plan a week | `e9b158d2` | done |

## A1 · MCP can plan a week

Five new tools (15 in all), on the user's clock (`_shared/zone.ts`), with the app's rules restated:

| Tool | Does | The app's rule it follows |
|---|---|---|
| `reschedule_task` | `when` = a day → 09:00 that day, off the calendar (a block already on that day stays, any other comes off); = a day and time → on the calendar there (its latest block moves, keeping its length, else a new one of its estimate or 30 min; any other block comes off) | `calendar/replan.ts` replanMoves ("THE RULE"), `tasks/api` rescheduleDue → `calendar/api` applyMoves / touchTaskSchedule |
| `edit_task` | title, notes, duration, project, repeat — only what's given; `null` clears; a project brings its domain, leaves the area, leaves a milestone behind; a repeat on an undated task dates it today 09:00 | `tasks/move.ts` placeTask, `tasks/api` setRecurrence / renameTask / setNotes / setDuration |
| `add_task` (extended) | + `duration_min`, + `repeat`; a due **time** puts a block on the calendar (duration, else 30 min) and sets the task's schedule | command bar `quickAdd` → `capture/api` blockIfTimed |
| `add_event` | an event or Time block (`kind`), timed or all-day (a date `start`; `end` = last day), 30 min unless told; `repeat` must fall on `start` | `calendar/api` createEvent; 0061 series |
| `edit_event` | an event: title, kind, time (keeps its length when only `start` moves), repeat. A whole series: title, kind, repeat, and a new **time of day** / length on all its days (the dates of `start`/`end` aren't used; skipped starts move with it). With `occurrence`: only that one, to any day and time — the series skips it and a one-off copy (`series_id`) takes the change | `calendar/series.ts` retimeSeries, `calendar/api` detach |
| `delete_event` | an event to Trash; with `occurrence` one start skipped (exdate); a whole series with every one-off moved out of it | `calendar/api` deleteEvent / deleteSeriesWithUndo |

- **Every task write settles like `lib/outbox` writeRow** (`tools.ts` `settle`): a reminder keeps its lead
  when the task moves (re-armed in the future — `lib/carryReminder.ts`), a Top 3 pick moved to a later day
  gives its place up (`top3Rule` releaseTop3); a date clears Someday. `move_to_tomorrow` is now the same
  replan to tomorrow 09:00 (behaviour unchanged; its tests still pass as written).
- **Every write says what it changed** (`changed`: due, the block placed, blocks removed, Top 3 given up,
  reminder moved, fields edited…) and logs the app's activity events with `source: 'mcp'`:
  `task.rescheduled`, `task.scheduled`, `task.updated {field}`, `task.moved`, `task.recurrence_set`,
  `calendar_event.created / .deleted`, plus `calendar_event.updated {title, changed}` for event edits
  (the app logs none; Activity's calendar default line "Updated X" renders it).
- **Input checked at the boundary**: ids are UUIDs, dates are real dates, lengths 1–1440 min, events at
  most 31 days, `end` xor `duration_min`, all-day vs timed `end` must match, `kind` ∈ event/time_block,
  repeats part by part (FREQ DAILY…YEARLY, INTERVAL, COUNT xor UNTIL, BYDAY, BYMONTHDAY, BYMONTH,
  BYSETPOS, WKST; no HOURLY/MINUTELY; "RRULE:" and lower case accepted) and then through rrule. Every
  argument is read before anything is written. A task's block is refused by edit/delete_event with a
  pointer to `reschedule_task`.
- **A series must start on its rule**: rrule never counts a start the rule skips, so the block would
  silently not exist. MCP refuses it and names the first day it would fall on (the app's block menu
  instead keeps the block as a one-off and starts the series there — `alignToRule`; an assistant gets
  told instead of surprised). To change a series "from a day on", the assistant ends it (`UNTIL`) and
  adds a new one — said in the tool description and the error.
- `calendar` / `today` now say an event's `kind` (time_block / task) and show an **all-day event as its
  days** (`start`/`end` dates, last day included). Before, an all-day event showed its UTC midnight on
  the user's clock — e.g. "2026-10-03 17:00" for a 4 Oct all-day event in Los Angeles.
- Compact task output now carries `duration_min` and `paused`.
- Store (`index.ts`, SQL as the user): `updateTask`, `getEvent`, `insertEvent`, `updateEvent`,
  `deleteEvents` (soft; takes a series' moved-out copies along) replace `reschedule` / `clearBlocks`;
  `taskBlocks` and `events` read `type` too. Server instructions name every writer; `serverInfo.version`
  1.0.0 → 1.1.0.

## A14 · a paused series stays paused on the server

- `_shared/today.ts`: the Top 3 and overdue rules skip `paused` (as `top3Rule` / `grouping.ts` do). Read by
  notify's digest, chat and mcp.
- `notify`: task reminders (both queries) `.eq('paused', false)`; the digest's picks select `paused`; its
  overdue count and the evening nudge's "left" skip paused.
- `chat`: the snapshot's picks select `paused`; its open tasks skip paused.
- `mcp`: `complete_task` never spawns a paused series' next copy; `today` (SQL + `splitToday`) and the Top 3
  cap skip paused; `list_tasks` shows `paused: true`.

## A20 · GitHub: a hand-filed task is ticked when its issue closes

- `_shared/github.ts`: `taskRechecks` turns every open GitHub-linked task whose issue left the search
  results into a recheck row — repo/number from the ref, else parsed from its `https://github.com/o/r/issues/N`
  url (a hand-filed task keeps only `{source, id, url}`); a task naming no issue is skipped. `ticksOff`:
  a **close** ticks any of them off; **gone** (404/410 — deleted, or out of the token's reach) only the
  sync's own (`synced`) — a hand-filed one waits for a real close and is just stamped `checked_at`.
- `github-sync`: the task recheck reads every `external_ref->>source = 'github'` open task (was: only
  `synced`). Same write as before (`done`, `completed_at`, `top3 false`, `task.completed {source:'github', reason}`).
- `docs/DATA_MODEL.md`: the old "a task filed by hand is never touched" struck, the new rule added.

## Files

- `supabase/functions/mcp/tools.ts` — the five tools, `settle`, `replanMoves`, span / series / occurrence helpers, paused.
- `supabase/functions/mcp/index.ts` — the new Store methods (SQL), paused in `dayTasks` / `top3Count`.
- `supabase/functions/mcp/server.ts` — instructions, version.
- `supabase/functions/_shared/today.ts` — paused (A14).
- `supabase/functions/notify/index.ts`, `supabase/functions/chat/index.ts` — paused (A14).
- `supabase/functions/_shared/github.ts`, `supabase/functions/github-sync/index.ts` — A20.
- `app/src/features/settings/mcp.test.ts` (37 → 57 tests), `app/src/features/settings/githubPlan.test.ts`
  (19 → 22), `app/src/features/notifications/today.test.ts` (paused cases).
- `docs/MCP.md` (tools table, rules, developer notes), `docs/DATA_MODEL.md` (`mcp_keys` writes, the `mcp`
  row's tool list, GitHub rules).

## Deploy (Kai's machine — no db push)

No migration. Functions only, any order (no schema dependency; they don't call each other):

1. `npx supabase functions deploy mcp` — A1 + A14's MCP half. After it, reconnect / reload the assistant
   (`/mcp` in Claude Code) so it fetches the new tool list (2026-07-28 clients cache it 5 min).
2. `npx supabase functions deploy notify` — A14 (reminders, digest, nudge).
3. `npx supabase functions deploy chat` — A14 (snapshot).
4. `npx supabase functions deploy github-sync` — A20.

`github-connect` imports `_shared/github.ts` too but uses none of what changed; redeploying it is harmless
and not needed. Frontend: nothing to ship for these items.

## Tests run (all from `app/`)

- `npx vitest run` under `$env:TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo (PowerShell):
  **150 files, 2010 tests passed in each** (base 1987; +23: A14 2, A20 3, A1 18 — plus paused cases added
  to today.test's existing ones, and the old `tomorrowMoves` test rewritten for `settle` + `replanMoves`).
- `npm run lint`: 0 errors (21 warnings, none in touched files). `npx tsc -p tsconfig.app.json --noEmit`
  clean (it type-checks `tools.ts` / `server.ts` / `_shared/*` through the tests). `npm run build`: ok.
  `npm run ds:check -- --baseline scripts/ds-baseline.json`: 0 new.
- Zone edge cases in the new tests: a date-only reschedule in Tokyo keeps the block that is on the user's
  day but on the previous UTC day; Cairo's autumn change (09:00 = 06:00Z on 29 Oct, 07:00Z on 30 Oct);
  LA wall times both ways; a Top 3 pick at 00:30 Cairo tomorrow still today's in LA; all-day events read
  back as the same days in Tokyo, LA and Cairo; a series re-timed keeps its skipped week skipped.

## Not verified

- **`deno check` not run** (no Deno here). `index.ts` is not reached by the app's tsc; its new SQL
  (`updateTask`, `getEvent`, `insertEvent`, `updateEvent`, `deleteEvents`) mirrors the existing casts and
  the labels `jsonb → text[]` pattern but has **never run against Postgres**. CI's rehearsal "Type-check
  every function" is the real gate; a smoke run on the local stack (`supabase start`, a key, the curl in
  docs/MCP.md) before release is the honest check.
- The notify / chat / github-sync query edits were not executed (Deno + DB + GitHub). The pure rules they
  read are tested.
- No live MCP call from a real assistant; no check of how Claude renders the nullable `["string","null"]`
  schema types (valid JSON Schema; the app's own tests only list them).

## Notes for the conductor / Kai

- **Out of A14's scope, same bug on the device:** the app's local planners (Windows tray, Android) still
  remind about a paused task — `app/src/features/tray/trayState.ts` `dueReminders` doesn't read `paused`
  (one-line fix there covers both). Not touched: the brief was the server and MCP.
- Renaming a task (app or MCP) leaves its calendar block's title as it was — the app's own behaviour,
  mirrored, not changed.
- MCP accepts `FREQ=YEARLY`; the app's Repeat editor still opens a yearly rule as weekly (A13).
- No "this and following" split over MCP (whole series, or one occurrence); ending a series with `UNTIL`
  and adding a new one covers it. `busy`, colour and project on events aren't settable over MCP (not asked).
- Hand-filed GitHub tasks are rechecked inside the existing 20-a-sync cap, least recently checked first.
