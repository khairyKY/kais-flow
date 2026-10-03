---
date: 2026-10-03T02:16+03:00
session: builder Q (phone calendar follow-ups, Kai 2026-10-03)
type: handoff
related: docs/log/2026-09-29-0518-calendar-phone-handoff.md (7a–7n) · design-export/Calendar Phone.dc.html 7d/7e/7f · Task Sheet.dc.html 4b · CALENDAR.md §6
---

# Phone calendar follow-ups: a task block opens as its task, "+N", edge auto-scroll

Branch `claude/calendar-followups`, cut from `origin/claude/decisions` (048c6c5 = v1.0.14 + two decisions). Not merged, not deployed. Desktop (≥ 768px) is unchanged.

## What changed

- **Tap a task block → the Task sheet** (`PhoneCalendar.tapBlock`):
  - A block whose task is loaded opens it with `openTask`: the Task sheet over /calendar (`?task=`), in one tap.
  - A plain event opens the event sheet (7d). So does a block whose task isn't in the cache, so an orphan block can still be deleted.
  - The tapped block still scrolls 80px under the grid's top edge, so it stays visible above the sheet. All-day chips no longer scroll the grid; before, they scrolled it to 03:00.
  - Long-press (lift, move, resize) is unchanged.
- **The Task sheet's block card** (`TaskSheet.tsx`, `taskSheet.css`). It no longer opens /calendar; that link was a stopgap until the phone calendar existed. It now reads "On your calendar" and the block line, with two ghost buttons:
  - **Change time** opens our `TimePicker` for the block's day, with its duration chips.
    - Done → `calendar/api.moveEventWithUndo`: one write and "Moved to 16:15 · Undo".
    - If the duration changed, the toast reads "Resized to …", as 7d's Time did.
    - The footer flickers "Saved".
  - **Unschedule** calls `deleteEventWithUndo(block, 'Unscheduled')`, the same helper the 7d sheet used.
    - The block leaves the calendar, the task stays, and its sheet stays open.
    - The card turns into the Suggest-a-time slots. Undo brings the block and the card back.
- **The event sheet** (`PhoneSheets.BlockSheet`) lost its task half: the checkbox, Open the task, Remind, Unschedule, the TaskMenu, and their props and imports.
  - What's left: the title, "Event · 1h" / "Time block · …" / "Event · All day", the Time row (not for all-day), Delete, the block held over the scrim, and Saved / Pending.
  - The header lost its −13px checkbox offset. A plain event's title now sits on the sheet's 20px gutter; before, it sat 13px left of it.
- **`calendar/api.moveEventWithUndo(event, from, to, mode)`**: the move/resize write plus its Undo toast. `PhoneCalendar.commit` used to do this inline. Now the drop, the resize, the event sheet's Time and the Task sheet's Change time all share it.
- **"+N" for 4+ blocks at once** (`PhoneGrid`, `PhoneCalendar`):
  - `layoutOverlaps` is unchanged: its topmost shingle (lane 2) already listed the blocks hidden under it. The phone used to drop them.
  - Now three are drawn and the rest sit behind a kit `Chip` ("+N"), placed at the top-right of the topmost shingle that hides them, 2px in. The chip is the bordered tone at 24px tall with a parchment fill and a 48px `kf-hit` target. It is hidden while that shingle is lifted.
  - Tapping it opens an `ActionSheet`: "N more · At the same time", one row per hidden block (title + "11:45–12:45", with a tasks or calendar icon).
  - A row opens its block the way a tap does: the Task sheet or the event sheet.
  - `tapGrid` ignores `.pc-more`, so tapping the chip never opens quick create.
- **Edge auto-scroll while dragging** (`PhoneGrid`; the pure part is in `phoneGridMath`):
  - `edgeScrollSpeed(y, top, bottom)`: 48px zones (`EDGE_PX`). Speed grows with how deep the finger is in the zone, capped at `EDGE_MAX_SPEED` = 0.8 px/ms (~13 px a frame). A finger past the edge, on the tab bar, gets full speed.
  - A press records the grid's `scrollTop`. `track()` computes the draft from the finger's movement plus the scroll since the press. So the block and the bubble stay under the finger through the scroll, on the same 15-minute snap with a tick per step.
  - The rAF loop:
    - It starts on the first drag move and keeps going while the finger rests in a zone (no pointermove needed).
    - It scrolls in whole pixels from an accumulator, with each frame's time capped at 50ms.
    - It stops when the finger leaves the zone, on release, and on unmount.
  - **Bounds:** the browser stops at 00:00. We stop with 24:00 on the bottom edge, because a lifted block's bottom handle hangs 54px below the canvas and would otherwise let the grid scroll past the day. `dragSpan` already keeps the block inside the day.
  - It works for moves (7e) and both resize handles (7f), and in 3 days and Week (vertical only).

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 70 files / 958 tests pass under each of TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo. 3 new tests for `edgeScrollSpeed`: nothing outside the zones, faster deeper, capped at and past the edge.
  - `npm run lint`: 0 errors, 19 warnings. That's the base count, and none are in the touched files.
  - `npm run build`: ok.
- **Browser setup:**
  - Mocked backend (`app/.env.mock.local`, untracked). Dev server on http://localhost:5245 with `--mode mock`, warmed first.
  - Real CDP touch at 390×844, day and night.
  - Results JSON and screenshots are in `docs/log/assets/calendar-followups/`.
- **`calendar-phone/verify.mjs`: 175/175** (was 157). 7d was rewritten, and `more` and `edge` are new scenes (`ONLY=7d,more,edge`).
  - **7d / 7l-d:**
    - A task block → the Task sheet straight over /calendar (`?task=`): one dialog, no block sheet.
    - Its card reads "SUN 27 · 15:00–15:30 · 30M" with Change time and Unschedule.
    - Change time → Time sheet (meta: the task) → 16:15 → Done:
      - one event write 16:15–16:45, plus the task's schedule
      - the "Moved to 16:15" toast with Undo
      - the card reads 16:15–16:45, and the footer says "Saved"
      - Undo → 15:00.
    - Unschedule:
      - the block is deleted and the task unscheduled (not deleted)
      - "Unscheduled · Call the tyre supplier" with Undo
      - the sheet stays and the card goes
      - Undo → the block and the card come back.
    - Esc leaves /calendar with no `?task`.
  - **Plain event:**
    - The event sheet: "EVENT · 1H", Time only, Delete; no checkbox, no Unschedule.
    - The event is held above the sheet, and the title sits on the 20px gutter.
    - Time → 14:30 → one write, "Moved to 14:30", "✓ Saved". Delete → "Deleted · Lunch with Omar".
  - **more:**
    - 4 at once (Design review · Budget · Call Omar · Review Kai): 3 drawn, Review Kai not.
    - One "+1" chip, 24 tall, at Call Omar's top-right (±1px).
    - Tap → "1 more", with the row "Review Kai 11:45–12:45". No quick create and no write.
    - The row → the Task sheet for Review Kai over /calendar, and the list closes.
  - **edge:**
    - A lifted block held 12px from the bottom edge scrolls the grid (579 → 944 in 500ms, the day's end). Moved out of the zone, it stops.
    - The bubble equals the snapped time under the finger (19:15), and the block's start is within one snap of the finger (7px).
    - The drop writes 19:15–19:45 and toasts "Moved to 19:15".
    - Held in the top zone, it scrolls up (945 → 653), and the drop lands earlier, on the 15-minute grid.
    - With the finger past the bottom edge, it runs at full speed to the end of the day and stops with 24:00 on the bottom edge. The bubble reads 23:30, and the drop writes 23:30–24:00.
    - The bottom resize handle in the zone scrolls the grid. The bubble reads the new end, and release writes 15:00–18:45 with "Resized to 15:00–18:45" (the run's numbers).
  - **Every other scene** (7a, 7b, 7c, 7e, 7f, 7g, 7g2, 7h, 7i, 7j, 7k, 7n, week, desktop) passes unchanged.
- **`task-sheet/verify.mjs`: 147/147.**
  - from-calendar now checks that a task block opens the sheet in one tap (one dialog, `?task=`) instead of going through "Open the task".
  - 4b's card text now includes Change time and Unschedule.
- **`today-phone/verify.mjs`: 153/153.**
- **Screenshots:**
  - `7d-day.png`, `7l-d-night.png`, `7d-change-time-day.png`, `7d-unschedule-day.png`, `7d-event-day.png`
  - `more-day.png`, `more-list-day.png`
  - `edge-day.png` (mid-scroll), `edge-resize-day.png`
  - `task-sheet-from-calendar.png`

## Deviations

- **Where the "+N" chip sits:** at the top-right of the topmost shingle that hides the blocks, at that shingle's start. That isn't always the earliest start in the overlap group. `layoutOverlaps` assigns hidden blocks to the topmost block that covers them, and a long group can have more than one. With a single stack (the normal case), it is the stack's top-right.
- **"At most 3 columns"** keeps the phone's existing three-shingle geometry (56% wide, 22% steps, as in v1.0.13), not three equal side-by-side columns.
- **The list shows only the N hidden blocks.** The desktop popover also lists the topmost.
- **The Task sheet card no longer opens the calendar** (e.g. from Today). Change time and Unschedule replace that.
- **Unschedule keeps the Task sheet open,** because the task stays. 7d closed its sheet first. The Undo toast shows over the sheet.
- **No block-only "Delete" for a task block on the phone now.** 7d's Delete did the same thing as Unschedule under another verb. Remind lives on the Task sheet's own chip.
- **The edge speed and zone** (0.8 px/ms, 48px) aren't drawn anywhere. Tune them with `EDGE_MAX_SPEED` / `EDGE_PX`.

## Risks / not done

- **Hardware not tested:** headless Chrome with CDP touch only. Not checked on an Android WebView:
  - rAF scrolling during a non-passive touchmove
  - Capacitor haptic ticks while the grid auto-scrolls
- **Auto-scroll starts on the first move inside a zone.** Lifting a block that already sits in the bottom 48px and nudging it scrolls at once.
- **No sideways edge paging** (dragging to a side edge to change the day): not asked for.
- **An Undo toast covers the bottom of the grid.** It docks over the grid's last ~56px, so a block just dropped at 23:30 sits under it until the toast leaves. The harness does the top-edge pass before the day's-end pass for this reason.
- **`ActionSheet` keys its rows by label.** Two hidden blocks with the same title in one stack would share a React key (a console warning). Not fixed.
- **Past blocks in a stack overprint each other's titles** (55% opacity; visible in `more-day.png`). This predates this branch.
- **Disk:** D: hit 100% mid-session, and one commit failed with "No space left on device" before succeeding on retry. I deleted my `app/dist` and scratch screenshots. This worktree's `app/node_modules` (445MB, `npm ci`) can go once nobody needs to re-run the gate here.
- No ROADMAP or `docs/log/INDEX.md` edits (the conductor adds them).
