# sync-fix handoff — 2026-10-25 04:34 (Cairo)

Branch `claude/sync-fix` (from v1.4.1). Queue item 11: "One change couldn't be saved — set aside so the rest sync on" on almost every create.

## Root cause
- `lib/outbox.ts` `enqueue()`: when a row was written again, it dropped the queued write and put the new one at the back of the queue.
- `placeTask` (calendar/api `applyMoves`) writes the new block first, then the task again (`scheduled_start`). So a task made and placed in the same tick went out in this order: [block → task]. The server refused the block with **23503** (`calendar_events.task_id` foreign key) because its task wasn't there yet. The outbox parked the block, and the task landed without it.
- This hit every create-with-a-time: grid quick create, ⌘K / quick add with a time, AI-filed captures with a time, Duplicate on a task's block. When the block's task was a parent, its subtasks were refused too (`tasks.parent_task_id`). That is the "3 changes couldn't be saved" on the server: copy + 2 subtasks + block.
- The ordering has been in place since 95673c15 (2026-10-07). Nothing in types/columns/migrations was wrong: the strict-mock column diff and the new guard test are both clean.

## Fix
- **Order kept.** A newer write for the same row replaces the queued one only while nothing but `activity_log` rows sit behind it (nothing references those). Otherwise both stay in place: the old write keeps its spot, and the new one goes last. Back-to-back offline edits still fold into one.
- **Exact removal.** `queuedAt` now rises strictly, and the drain removes exactly the entry it sent (table + id + queuedAt). Before, a newer write queued while the old one was in flight was removed along with it, so the latest edit was lost silently.
- **Louder and kinder.**
  - The toast names the change: `Couldn't save: block 'Gym'. Set aside so the rest sync on.` (also task / Time block / event / settings…).
  - The toast offers **Try again** and **Discard** (new `Toast.secondary`).
  - The sync popover's Not-saved rows each get Try again / Discard. The popover closes when the last row is dealt with.
  - Try again re-sends the row as this device has it now (a later edit wins). Discard drops the dead letter and refetches.
  - Dead letters now keep `code`, `error` (message), `details` and `hint`.
- `unsyncedChanges()` / `syncRows()` count a row that's owed twice as one change.

## Guard
In `lib/columns.test.ts`, with the column map built from every migration at test time (multi-`add column` alters and `drop column` now parsed):
- every row type the app writes (22 interfaces, incl. paper's `CaptureRow`) must have only real columns. The single allow-listed client key is `CalendarEvent.seriesId`.
- every object literal handed to `writeRow('<table>', { … })` (scanned over all of `src/`) must name only that table's columns. `writeRow` is generic, so TypeScript never checked this.

Both were mutation-tested: an injected `colour` key fails each.

## Files
- `app/src/lib/outbox.ts`
- `app/src/lib/toastStore.ts`
- `app/src/components/ToastHost.tsx`
- `app/src/components/syncQueue.ts`
- `app/src/components/AppLayout.tsx`
- tests: `app/src/lib/outbox.test.ts` (+4), `app/src/lib/columns.test.ts` (+23), `app/src/components/syncQueue.test.ts` (+1)
- harness: `docs/log/assets/sync-fix/verify.mjs`
- `docs/log/assets/tasks-noise/verify.mjs`: its toast regex now expects the new copy.

No migration was needed.

## Harness: `docs/log/assets/sync-fix/verify.mjs`
- The strict mock PostgREST builds its tables, columns, FKs (with on-delete rules), CHECK lists, NOT NULLs and uuid types from `supabase/migrations`, and keeps server rows.
- It refuses writes the way the real server does: PGRST204 / 23503 / 23514 / 23502 / 22P02.
- `SCHEMA_ONLY=1` prints what it enforces.
- Flows covered: grid quick create + 45m length row, the rail's Quick add, Duplicate on a task's block, Duplicate on a parent's block (with subtasks), ticking a slot's task, multi-move, ⌘K with a time, Tasks quick add with a time, row Duplicate, Snooze, Complete. Then the parked UX (u1–u5).
- **On v1.4.1 (before the fix):** a1, a3 and a4 failed exactly as live, with `calendar_events:23503`, and a4 also had `tasks:23503` ×2. That is 3 refusals.
- **After the fix: 34/34.**

## Gate
- `tsc -b`: clean.
- `vitest`: 2379 / 172 files. Not run ×4 TZ, since no date code was touched.
- `lint`: 0 errors.
- `build`: OK.
- `ds:check`: 0 new.
- Harnesses, one at a time on :5307:
  - sync-fix 34/34
  - tasks-noise sync section 62/62
  - fix-tasks 70/70
  - cal-polish 229/229
  - snooze 74/74
  - paper-review 97/97
  - dup-open 23/23
  - time-slots 153/153. A first run died when its dev server went away; the re-run was clean.
  - **cal-looks 105/107.** The two `o` drag checks ("Lunch with Omar" / "Review Kai's PR" drags) fail the same way on an untouched v1.4.1 checkout (its own server on :5391), so this is not a regression. The drag's write arrives after the harness stops waiting. Worth a look by the cal-looks owner.
- `grep -c birthday_on app/src/lib/types.ts` = 1; `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.

## Notes / not done
- Blocks parked on Kai's devices before this fix stay parked. The popover shows only rows newer than the last time it was opened. They are not auto-replayed: many were re-made by hand, and a replay would duplicate them.
- The toast names the kind of change, not the field (e.g. "block", not "block colour"). The dead letter's code/message says which column if it's ever a PGRST204.
- The scratchpad is shared with other builders: use unique file names and check ports first (5308 belonged to someone else).
