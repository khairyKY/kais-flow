# 2026-10-14 01:00 · handoff · manual-order (parity audit A22)

- date: 2026-10-14 01:00 Cairo (2026-10-13 22:00 UTC)
- session: manual-order builder
- type: handoff
- related: `2026-10-13-0808-p7e-parity-audit.md` row A22 (Akiflow's "Move task up/down")

Branch `claude/manual-order`, from `claude/kai-bugs-1012`. Not merged and not released.

## What works

- **⌘/Ctrl+↑/↓** moves the focused task, or the selection (as a block), one place within its group:
  - **Tasks**: inside the row's group (Today, Tomorrow, No date…). Only with Sort · Smart; Due / Priority / A–Z are explicit sorts, so the key does nothing there.
  - **Today**: inside the overdue fold or More for today. On a Top 3 row it moves the row in the Top 3, the same as Alt+↑/↓ (0055 ranks; moving into first place makes it the goal). Up next follows the calendar, so it has no order to change.
  - **Project and area pages**: inside the list. An area's repeats are their own group.
  - At the edge nothing moves and no toast shows. Focus stays on the moved row.
- **One Undo.** A burst of presses on the same rows is one toast ("Moved up", "2 tasks moved"). Its Undo, or ⌘Z, puts every row back where it was before the first press.
- **Cheatsheet:** "⌘/Ctrl ↑/↓ · Move task up / down" under the list keys (`LIST_EXTRAS`).

## How the order works

- **0076:** `tasks.sort_order double precision`, nullable, with no default, no index and no constraint. It is additive and idempotent.
- The key is on **the same scale as the date** the lists already sorted by: epoch ms of `due_at`, else `scheduled_start`; undated rows sort last (`features/tasks/manualOrder.ts` `orderKey`).
  - A row nobody moved (null) keeps exactly the old order.
  - A move writes **one row**: the midpoint of its new neighbours' keys.
  - Rows tied on one date (for example the No date group) have no room between them. The first move among them gives the tied run its own keys, on the shorter side only (`planListMove`). After that, moves are one write again. The same widening covers a gap that ran out of float precision.
- `groupTasks` sorts inside a group by `orderKey`. With no `sort_order` this is the old `dateValue`, unchanged. Today's list and project/area pages use `sortByOrder` too.
  - Small side effect on those two pages: a row with only a calendar block, and no due date, now sorts by its block time instead of last.
- **One column for every list.** A task ordered on a project page sits near the same date neighbours on Tasks.
  - A replan keeps the key, so the task then sorts by it in its new group (usually first there).
- Writes go through the outbox (`tasks/api.ts moveInListWithUndo`, `patchTask`). Old builds never select or write the column, and their upserts leave it alone (checked in PGlite).
- **No `activity_log` event.** Reordering isn't a domain event, and a burst would flood Activity and Slipping.

## Checks

- **Unit tests:** `manualOrder.test.ts` has 10 (one-write midpoint, edges, blocks, tied runs, no float room, 200 ping-pong moves stay distinct). `api.order.test.ts` has 3 (burst = one toast, Undo back to null, selection across groups).
- **Full suite, ×4 TZ in PowerShell** (UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo): 2122/2122 each.
- **Static checks:**
  - `npm run lint`: 0 errors (21 warnings, all from before this branch).
  - `npm run build`: OK.
  - `ds:check --baseline`: 0 new.
- **PGlite:** `docs/log/assets/manual-order/0076-pglite-check.mjs` 4/4. It covers: runs twice; a nullable double with no default; old rows read null; a fractional key round-trips; an old build's upsert keeps it.
- **Browser** (mock backend, :5280): `docs/log/assets/manual-order/verify.mjs` **25/25**. It covers: Tasks (one-row move, burst, ⌘Z, selection block, No date tie run ≤ 2 writes, other group untouched, cheatsheet), Today (Also open, Top 3 row) and a project page.
- **Re-runs:**
  - fix-tasks 70/70.
  - today-shell 87/88. `l …"calls" on both selected` failed once in the 3-lane run and passed 6/6 alone.
  - fix-today 114/116. `d2-running-0940-night` (Now card) failed once and passed 10/10 alone twice.
  - The first fix-today lane died on `ENOSPC`: drive D: was nearly full, with about 3.5 GB free afterwards. **Disk space is low on Kai's machine.**

## Deploy order

1. `npx supabase db push --include-all` (0076) **before** the app. The app selects `sort_order`; without the column every task load fails.
2. Then the frontend. No edge functions changed.

## Not done

- **Drag-to-reorder within a list (the stretch goal):** skipped. The drag kit (`components/drag.tsx`) files rows onto spots, such as the sidebar and projects. Sorting rows within a list needs droppable rows plus an insertion marker, which is visual work for Kai. Add it with `@dnd-kit/sortable` or per-row `DropZone`s calling `moveInListWithUndo`.
- **No phone path:** keys only, the same as Akiflow. A "Move up / down" item in the row menu could reuse `moveInListWithUndo`.
- **No interaction with claude/undo-verbs:** its keys (priority, focus, goal, someday, duration, Plan, l, ⇧F, ⇧S) are untouched. The imports in TasksPage, TodayPage and ProjectDetailPage are separate lines, so that branch's import edits merge cleanly.
