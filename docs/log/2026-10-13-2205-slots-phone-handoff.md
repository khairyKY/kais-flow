---
date: 2026-10-13 22:05 UTC
session: slots-phone
type: handoff
related: parity audit B2 (Time Slots), 2026-10-13-1720-time-slots-handoff.md ("Not done")
supersedes: none
---

# Time Slots on the phone: handoff (2026-10-13 22:05 UTC)

Branch `claude/slots-phone`, from `claude/kai-bugs-1012` at `ab728417` (v1.1.5). Commits: `7c59ffe0` is the feature and `10cf98df` is the harness. Not merged, no PR. No migration: this uses 0073 as shipped in v1.1.4.

## What works

- **The phone grid** (`PhoneGrid` and `PhoneCalendar.look`). A Time block draws the tasks it holds as rows under its title, plus its fill line ("1 task · 45m of 2h"), the same as the desktop. The rows use the block's own check, name and mono type, with no new look. Each part:
  - The box completes the task with the usual "Done" Undo.
  - A tap on a row opens the task's sheet.
  - A hold on a row still lifts the slot.
  - The rows show from the stacked height (56px) up and clip with the block.
- **"Into a slot…"** in the shared task ⋯ menu. On the phone it is an action sheet; on desktop it is a submenu. It lists the Time blocks of today and the next 7 days that aren't over yet, soonest first. A repeating slot shows each of its occurrences. Each row reads "Code block💻 · Today · 10:00–12:00". A pick goes through `putInSlotWithUndo` (the drop's own write) and its toast has Undo. The entry shows only when there is a slot ahead, and only for a single task, never in bulk. On the phone the slot holding the task gets a check. This is the phone's way into a slot.
- **The command bar's `>`.** There was no `>` token before. `>code` or `>Code block` names a Time block ahead. The bar takes the longest run of words that still matches a block's name (a contains match, like `#tag`), soonest block first. The token is read before chrono, so a slot called "Morning focus" isn't read as a time. A `>` that names no slot stays a plain word, and Esc hands the token back.
  - The chip reads "In Code block💻".
  - Enter creates the task and puts it in that block's next occurrence. A typed day ("thursday >code") picks the first occurrence on or after that day.
  - The task gets no block of its own. One toast: "Added to Code block💻", whose Undo deletes the task.
  - The AI fill no longer gives a slotted task a block, so it stays in its slot.
  - The tray's quick capture doesn't read `>`, because it passes no slots.
- **Code changes.** `slots.upcomingSlots` is pure and tested. In `api`, `putInSlot` is the write without a toast, and `cachedSlots` was added. `ActionSheet` rows are now keyed by place as well as label, because a repeating slot's days share a name.

## Gates

- `npx vitest run`: 154 files, **2116 tests** pass. New tests:
  - `slots.test.ts`: upcomingSlots.
  - `parseCommand.test.ts`: 4 tests for `>`.
  - `quickAdd.test.ts`: `>` into the slot, including a typed day.
  - `taskMenuSpec.test.ts`: Into a slot….
- `npm run lint`: 0 errors (21 warnings, none of them in these files).
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: 0 new.
- Browser runs against the mock backend, dev server from this worktree on :5278 (since stopped):
  - `time-slots/verify.mjs`: **52/52**. That is the original 30 plus 22 new p1–p4 checks; results are in `assets/slots-phone/results.json`, with screenshots `p1`–`p4` (day and night).
  - `cal-wave2`: **83/83**.
  - `fix-tasks`: **70/70**.
- **Harness fix.** `settle()` now waits for the page's outbox (idb `kf-outbox`) to drain before its 400ms quiet check. s5's write checks were failing 3 out of 3 on the base source too, run alone. The drop had worked in the UI, but the outbox drain lagged several seconds, so the writes landed after `settle`. With the fix, s5 passed 3/3 alone and the full run is 52/52.

## Not done / notes

- **Drag into a slot on the phone:** not built, because a hold lifts the block there. The way in is ⋯ → Into a slot….
- **A slow outbox drain in the mock runs.** Entries sat queued for seconds with a valid uid. One suspect is `supabase.auth.getSession()` in `lib/outbox` `drain`. Real use isn't known to be affected; I only saw it in the harness. Worth a look if "saving ◌" ever lingers.
- **Still open from the time-slots handoff:** changing a slot's Repeat from a later occurrence; reordering a slot's tasks.
