---
date: 2026-10-07T05:45+03:00
session: builder calendar-rail (Kai's calendar feedback, 2026-10-07)
type: handoff
related: docs/log/assets/calendar-rail/ · app/src/features/calendar/replan.ts
---

# The calendar's planning rail, replanning that moves the block, and the 4am bug

Branch `claude/calendar-rail`, cut from `origin/master` (71675dd, v1.0.21). A feedback wave, not a ROADMAP phase. No migration. Not merged, not deployed.

## What changed

### 1 · The planning rail (desktop)

The rail has four sections. Each one folds on its own header, shows a count, and remembers its fold per device (`kf.calRailSections`).

- **Overdue** (terra). Open tasks whose due date is before today, **or whose calendar block ended before today unfinished** (the block that used to sit "stuck" in the past). Oldest miss first, with "Overdue Nd".
- **Today.** Due today or in the Top 3, with no time on the calendar yet.
- **Inbox.** Exactly what the Inbox page lists as waiting (`usePendingInboxItems`), shown with the AI's cleaned title.
- **Lists** (folded by default). This is the old scope picker (smart list / project / area / domain), kept so nothing is lost. It defaults to This Week, minus whatever Overdue and Today already hold.

A task on the calendar today or later counts as planned, and appears in neither Overdue nor Today. The bucketing is pure and tested (`replan.ts` `railBuckets`).

**Dragging a card onto the grid**
- A task's existing block **moves** there, including a missed block (same row, same length). The rail never adds a second block.
- An inbox card is filed the way its AI suggestion says (`fileToCalendar`) and blocked there for its typed length (30m by default). One toast covers both, and its Undo takes back the block, the task and the filing.

**Plan ▾** on every card: Today · Next free slot · Tomorrow first thing · Pick date…
- The hints come from the real calendar: "Next free slot · 14:45", "Tomorrow first thing · 08:00".
- A time places the block, and the grid scrolls to it. A date alone plans the day.
- Each choice has an Undo.

**Right-click on a task card** opens the existing task menu, untouched. Its Pick date… and Tomorrow now move or clear the block (see §3). A card with a missed block also offers Unschedule.

**When the rail opens**
- With an overdue pile, the rail opens by itself, even where the week would otherwise fold it.
- If Kai folds it by hand, that choice wins. The folded tab then reads **"Overdue · N"** in terra. Otherwise it reads "To plan · N".

### 2 · Phone calendar

- The "Unscheduled" strip is now a kit Segmented row, **Overdue N · Today N · Inbox N**. It opens on the first segment with anything in it. Under it is that segment's chips, with an overdue chip reading "2D".
- A chip still opens the 7g sheet (next 3 free slots · Pick a time… · Pick a date…). A task chip moves its missed block. An inbox chip files and blocks.
- All targets are ≥ 48: the segment row is 48 and the chips are 40 plus a 48 hit area.

### 3 · Overdue stuck on the grid, and every replan path

**How it looks**
- **Desktop:** a task block that ended before today and isn't done gets `kf-overdue`. It is past-muted (opacity .55), and its time row reads "Overdue · **Replan**" in terra. In a narrow column it reads just "Replan", so the link is never cut off.
- Replan opens the Plan menu, and the block's right-click also has "Replan…".
- A block that ran over earlier today keeps the "Ran over" terra state.
- **Phone:** the same block is muted and reads "Overdue · Replan" in terra. A tap opens the **Replan** sheet (7g, plus an "Open task" row) instead of the task sheet.

**Every replan path reachable from the calendar now moves or clears the old block:**

| Path | What happens to the block |
|---|---|
| Rail drag · Plan ▸ Next free slot / Tomorrow first thing / Pick date + time · phone 7g slot / Pick a time · Morning plan · QuickCreate "holds task" | `scheduleTask` → `placeTask`: the task's latest block moves; any other block comes off. Never a duplicate. |
| ⋯ / right-click Pick date…, Tomorrow, No date · task sheet date chip · editor date/time · swipes, keys, bulk bars, rituals, Planning board | `rescheduleDue`: its blocks follow **the rule** below. |
| Grid drag · details panel Save (date now editable too) | Moves the block itself, as before. |

On top of that, `touchTaskSchedule` (the funnel every block write passes through) now lets a **missed due date follow a block placed today or later**. A replanned task therefore stops reading "Overdue 3d" on Tasks and Today as well.

`rescheduleDue` now returns an exact Undo covering the task row and its blocks. `moveToTomorrowWithUndo`, the Project page's bulk schedule and the evening ritual's un-roll use it.

### 4 · The 4am bug: root cause and the rule

**Root cause.** A time given through the date picker ("Set time"), the task sheet's date chip or the editor wrote only `tasks.due_at`. The calendar draws only `calendar_events` blocks, so a due *time* never reached the grid. The crypto session also already had a block (the one Kai missed), and the replan left that block where it was, stuck on the missed day. Because the task still had `scheduled_start`, the old rail (`!scheduled_start`) hid it too. The replanned task was nowhere on the calendar page.

A second, smaller cause: the desktop grid opens 2h above *now*, so in the afternoon a 04:00 block sits above the fold. A Plan now scrolls the grid to where the block landed (`gotoDate` only scrolls when the day is already in view).

**The rule** (Akiflow's), written in `calendar/replan.ts` `replanMoves`. **A task given a time is on the calendar; a date alone isn't.**
- **A time** puts one block at that time. The task's latest block moves there and keeps its length; if it has none, a new block is made from its estimate (30m by default). Any other block comes off.
- **A date alone** (Today / Tomorrow / Next week, a day without Set time) puts it in that day's list. A block already on that day stays; a block on any other day (the stuck one) comes off.
- **No date** takes its blocks off.
- **How "a time was set" is known.** `DatePicker` now passes a third `onPick` argument, `timed`, and `ScheduleMenu` passes it through. The per-task `taskActions.schedule` reads it.
  - The desktop ⋯ submenu in `TaskMenu.tsx` (line 172, not edited, it belongs to `claude/plan-replan`) drops that argument. For that one path, `setTimeOf` falls back to "the time isn't the 09:00 every date-only pick lands on".
  - **Ceiling:** an explicit 09:00 on that path reads as a date alone.

**Regression test:** `calendar/replan.flow.test.ts` runs the real `calendar/api` and `tasks/api` against an optimistic in-memory cache. It replans the overdue crypto session to 04:00 through each path:
- task sheet / Pick date… with the flag;
- the desktop submenu without the flag;
- the editor's time field;
- the details panel;
- grid drag and rail drop;
- a task with no block yet.

Each time it asserts one block, at 04:00 today, nothing left yesterday, and the task out of Overdue. It also covers Tomorrow, No date, the exact Undos, and a leftover duplicate being cleaned up. With the fix turned off (`rescheduleDue` ignoring blocks, `placeTask` always creating), **9 of its 13 tests fail**. With the fix on, all pass.

### 5 · Details panel reads as editable

- **Desktop `EventDetailsPanel`.** Title, date and both times wear the kit's field chrome (formFields' bone fill, card line, radius 6). The border darkens on hover, and focus shows the focus ring. Date and times show the pointer cursor; the title shows a text cursor.
  - Clicking a time opens its 15-minute list in place (TimeField's own list). The date is now a DateField and is editable.
  - Times are read and written on the user's clock (`cairoDateKey` / `cairoTimeKey` / `cairoToIso`), no longer the device's.
  - A missed task block shows "Overdue" (or "Ran over") with **Replan ▾**.
  - Layout and actions are unchanged. There is no pencil glyph because the kit has none.
- **Phone `BlockSheet`** (plain events).
  - The title is a field: the quick-create field's chrome, renaming on Done or blur, with "✓ Saved".
  - There are **Date** and **Time** rows (kit action rows with chevrons).
  - An all-day event still keeps its date.

### 6 · Kai's Android screenshots (coordinator, same branch)

1. **The draft no longer bleeds through the Time sheet.**
   - Cause: the held slot/block (`Held`, `z-index 1001`, portaled) sat above every sheet, including a picker opened over its own sheet.
   - It now hides while a picker sheet is open (quick create's Time; the event sheet's Date and Time).
   - It is also cut at its own sheet's resting top edge, so a tall block never covers the sheet.
   - The grid's "slot in view above the sheet" lead went from 80 to 32 (`SHEET_LEAD`). The new segment row moved the grid down 48px, and this keeps the block where it was drawn.
   - A slot tapped earlier today opens its time list on the **next quarter** (14:40 → 14:45), not in the past.
2. **Short blocks are readable.**
   - Every phone block draws at least 24px: one line of title.
   - Under 25 minutes it uses a compact one-line layout (title and time, no wrap), with a whole 18px checkbox.
   - The resize grips sit outside the text: verified above and below the title on a lifted 10-minute block.
3. **Tall blocks wrap their title.** From 56px (task blocks too, which used to keep one row), the title wraps over as many 18px lines as fit above the time line, up to 3, and the time sits on its own line. A 1h30 block shows "Deep work — forecasting the quarterly / numbers" with "09:00–10:30" under it.

## Evidence

**Unit tests:** vitest from PowerShell, 4 zones (Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata): **105 files / 1265 tests, all green in each**.
- New: `replan.test.ts` (15) covers rail bucketing (incl. past unfinished blocks and all-day storage), the rule, `placeMoves`, `setTimeOf`, `dueFollows`, Next free slot and Tomorrow first thing.
- New: `replan.flow.test.ts` (13) is the 4am regression plus block move/clear/undo.
- Changed: `api.completion.test.ts` gains `replanTaskBlocks` in its calendar mock. That is a seam, not an expectation.

**Lint and build:** `npm run lint` exits 0; its 22 warnings are all pre-existing, none in touched files. `npm run build` is green.

**Browser harness** `docs/log/assets/calendar-rail/verify.mjs` (mock backend, `localhost:5272`, Chrome, desktop 1280 and phone 390, day and night): **115/115**. It covers:
- **Rail:** sections and counts, fold per section and for the whole rail, the overdue tab.
- **The 4am case, five ways:**
  - rail drag onto 04:00 moves the missed block (same id) and the due date follows; Undo is exact;
  - Plan ▸ Pick date… Set time 04:00, and the grid scrolls to it;
  - the right-click Pick date… path;
  - phone 7g Pick a time 04:00;
  - phone task-sheet date chip → Set time 04:00.
- **Overdue block:** "Replan", muted, the link whole; Replan → Next free slot moves *that* block to today 16:30–18:00; right-click offers Replan….
- **Plan ▸ Today** clears the stuck block.
- **Inbox:** drop and slot both file and block; Undo restores.
- **Details panel:** field chrome, hover, list in place, Save on the user's clock, a missed block's Replan, and the date moving it to today, day and night.
- **Phone:** segments and 48px targets; compact 10-minute block; wrapped 1h30 title; handles clear of the text; draft hidden under the Time sheet; next-quarter opening; event-sheet title field and Date/Time rows.

**Existing harnesses on this build:**
- **calendar-phone: 175/175.** This is after 3 intentional expectation updates, listed below.
- **desktop-polish: 150/150.**
- **task-sheet: 147/147.**
- **today-phone: 157/157.**
- **user-tz: 33/33.**
- **gestures:** demo 94/104 and real pages 48/56. Every failure is a stale expectation that predates this branch:
  - the task ⋯ list it expects has no "Start focus", which came back in 57f4530 after the harness was written;
  - its `window.__buzz` haptic stub isn't what `lib/haptics` calls any more.

  This branch doesn't touch `taskMenuSpec` or haptics. Those harness lines should be refreshed by whoever owns the menu (plan-replan).

**Intentional expectation updates in `calendar-phone/verify.mjs`:**
- 7a and 7l-a: "Unscheduled · 2" is now "Overdue 0 · Today 2 · Inbox 0" (Today chosen).
- 7d: the plain-event sheet has Date + Time (2 rows), not Time only.

## Deviations (and why)

- **The Lists section was kept** (folded) instead of deleting the scope picker. The brief asks for three sections; dropping it would have removed the only desktop way to drag a this-week or project task onto the grid. One line to remove if Kai doesn't want it.
- **A missed due date follows a placed block** (`touchTaskSchedule`). This wasn't in the brief, but without it a replanned task kept "Overdue 3d" on Tasks and Today.
  - **Ceiling:** a grid drag's Undo moves the block back but leaves the due date on today. The rail's and the menus' Undos are exact.
- **Tomorrow / Today / a date alone now clears a block on another day** (Akiflow's rule). Before, "Tomorrow" on a task blocked today left the block on today.
- **The phone tap on an overdue block opens the Replan sheet**, not the task sheet. Its "Open task" row is one tap more to reach the task.
- **Shared components touched:**
  - `DatePicker` (third `onPick` arg) and `ScheduleMenu` (type).
  - `ScheduleSheet`'s props are now `{title, duration, onPlace, heading?, onOpen?}`; the caller writes.
  - `scheduleTask` moves instead of duplicating; `scheduleTaskWithUndo` and `placeTask` are new.
  - `rescheduleDue` takes `timed` and returns an Undo.
  - `CalendarGrid.gotoDate` keeps the range when the date is already on screen.
- **Not edited:** `taskMenuSpec.ts`, `TaskMenu.tsx`, `pickerMath.ts`, `dateShortcuts.ts`.

## Follow-ups

- **At the plan-replan merge:**
  - `TaskMenu.tsx`'s desktop date submenu should pass `(iso, min, timed)` through to `actions.schedule`.
  - Then delete `replan.setTimeOf` and its fallback in `useRowGrammar.taskActions`.
  - The shared Plan/Replan menu can take over this rail's Plan ▾ (the items are `planFor` in `CalendarPage.tsx`).
- **Paths that stay date-only:**
  - The command bar / NLP ("crypto session 4am") still creates a task with a due time and no block. Decide whether the rule applies at capture.
  - Bulk-bar date picks with a time are also treated as date-only.
- **The desktop FullCalendar grid still lays out in the device's zone**, while the details panel and rail now use the user's zone. They are identical on Kai's machine but differ on a device abroad. This was pre-existing; the fix would be FullCalendar's `timeZone` plus the luxon plugin, which would need a new dependency.
- **At 1280 / 125%, the rail opened for an overdue pile squeezes the week** to about 4½ visible days, which then scroll sideways. That trade-off is the brief's ("never hide a fresh overdue pile").

## Kai decides

1. **The rule:** a time puts a task on the calendar; a date alone (Today / Tomorrow / a day) takes it off the calendar into that day's list. Does that match how he plans?
2. **Should a replan carry a missed due date forward?** It does now.
3. **Lists:** keep the fourth rail section or drop it.
4. **Phone:** should tapping an overdue block open Replan (now) or the task sheet (before)?
