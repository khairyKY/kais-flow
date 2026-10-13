# Time Slots: handoff (2026-10-13 17:20 UTC)

Branch `claude/time-slots` (from `claude/kai-bugs-1012` at `511557a8`). Feature commit `98d74719`. Not merged, no PR.
Kai's decision: parity audit B2, option (a). Build Akiflow-style slots ("Code block💻", "Shaheen🛞") that hold tasks.

## What works

- **Data, migration 0073** (`supabase/migrations/0073_time_slots.sql`). Adds `tasks.slot_id uuid → calendar_events on delete set null` and `tasks.slot_date date`, plus a partial index. It is additive and idempotent. `slot_id` is the slot's stored row; for a repeating slot that is the series row. `slot_date` is the occurrence's day on the user's clock. RLS is unchanged. Old builds never select or write the columns. `DATA_MODEL.md` and `MCP.md` are updated.
- **Putting a task in a slot.** Drop a rail card, or a task's own block, on a Time block. The task goes into the slot: it gets `slot_id`, `slot_date` and the slot's start and end. It gets no task block, and a missed block it had comes off. A missed due date follows, the same as for a block. The write goes through the outbox and is logged as `task.scheduled` with `{slot_id, slot_date}`. The toast reads "In Code block💻 · Review Kai" and has Undo. Inbox items dropped on a slot still get a block, as before.
- **Showing it.** The Time block draws the tasks it holds as rows. Each row has a checkbox (completes with the usual "Done" Undo) and a ⋯ that opens that task's own menu. The fill line reads "N tasks · Xm of Ym", with 30m counted for a task that has no estimate. It uses the existing block classes and tokens, with no new visual language.
- **Moving and removing.** Moving or resizing a slot moves its tasks with it. Re-timing a repeating slot from its popover does too, and a "this and following" split takes the later tasks to the new row. Dragging one occurrence out of a series takes its tasks with the detached copy. Other ways a task leaves its slot:
  - ⋯ → **Out of the slot** (shown everywhere the task menu shows) sends it back to the rail, unscheduled, with Undo.
  - Deleting the slot, deleting all events of a series, or dragging the slot onto the rail unschedules its tasks, with Undo.
  - A replan (Plan, Tomorrow, a picked date) or a block of its own also takes the task out of the slot.
- **Repeating slots.** A task belongs to one occurrence, matched by `slot_date`, and shows only in that occurrence. A slot holds a task when three things match: its row, its day, and the task's `scheduled_start` falls inside it. So a task an old build replanned elsewhere is not drawn in the slot it left.
- **The rest of the app.**
  - The Tasks list, and Today's rows and Top 3 meta, read "in Code block💻 · 10:00". The day is added when it isn't today.
  - The rail counts a slotted task as planned. If the slot's day went by unfinished, the task is Overdue.
  - Repeat copies and duplicates never carry the slot.
  - MCP `calendar` and `today`: each Time block lists the tasks its occurrence holds, as `tasks: [{id, title, done}]`. This uses one extra query, `Store.slotTasks`.

## Gates

- `npx vitest run`: 153 files, 2089 tests pass. New: `features/calendar/slots.test.ts` has 11 tests (assignment, occurrence matching, a move restamps tasks, fill, and the real writes with Undo for drop, move, resize, detach, delete, Out of the slot and replan). `mcp.test.ts` has 1 new test.
- `npm run lint`: 0 errors.
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: 0 new.
- Browser runs against the mock backend, dev server from this worktree on :5276:
  - `docs/log/assets/time-slots/verify.mjs`: **30/30**.
  - `cal-rail-drop`: **33/33**.
  - `event-detail`: **68/68**.
- One run had all three harnesses in parallel. In it, one write-timing check failed in time-slots s5 and cal-rail-drop r2 crashed: the writes landed after `settle`. Each was green when re-run alone, and time-slots s5 passed 2 of its 3 runs.

## Deploy order

1. `npx supabase db push` (0073). It must go first: the app's task select and the MCP function both name the columns, and the task list fails without them.
2. `npx supabase functions deploy mcp`.
3. The app: merge and push. Cloudflare Pages builds it.

Migration 0074 and `functions/google-*` belong to the parallel `claude/google-sync` builder and were not touched.

## Not done (say so if wanted)

- **The phone grid** (`PhoneGrid`) doesn't draw a slot's tasks yet, and there is no drop into a slot on the phone. The data and every other surface work there: Tasks, Today, and Out of the slot from the task menu.
- **`>` in the command bar** doesn't target a slot yet (B2's "and `>` targets it").
- **Changing a slot's Repeat** from a later occurrence (a split) leaves that occurrence's tasks on the old row. They stay scheduled but aren't drawn in the slot. Re-timing and dragging are handled.
- Tasks in a slot can't be reordered or dragged out of the block. Use ⋯ → Out of the slot.
- **A drop inside a slot always goes into the slot,** even where an event overlaps it. It picks the latest-starting slot.
