# drag-fix handoff — 2026-10-26 19:39 (Cairo)

Branch `claude/drag-fix` (worktree `.claude/worktrees/drag-fix`). It is based on the release branch and has `claude/kai-bugs-1012` merged in (fast-forward, includes settings-sync).

Kai: "the calendar drag a task to schedule isn't working". The coordinator later added: it happens **on the phone**.

## Is live (v1.5.0) broken too?

Yes. This is not a regression: the phone never had the gesture.

| Where | v1.5.0 (live) | the merged branch before this fix |
|---|---|---|
| Phone (< 768px, Android app): hold a tray chip and drag it onto the grid | broken. Nothing lifts, and the release opens the chip's sheet | broken, the same way |
| Desktop layout with touch (tablet, a wide Android window): hold a rail card, then drag | lands a quarter early (14:45 for 15:00) | the same |
| Desktop mouse: rail Overdue / Today / Scheduled / Inbox / Lists, a planning card, a day-tray card, a held slot row, a block move, at 100% and 150% | works | works |

How it was checked:
- The same harness (`drag-fix/verify.mjs`) was run against a temporary worktree at tag `v1.5.0`, on its own port. That worktree has since been removed.
- v1.5.0 scored 143/168. Every phone carry failed, and the tablet case landed a quarter early. Every desktop mouse case passed.
- A probe across 100 / 110 / 125 / 150 / 175%, DPR 1.25–2, Day / 4-day / Week, Fit hours, Fit days, density and a cold first drag found no mouse failure on either tree.

## No breaking commit

No commit broke it, so there was nothing to bisect.
- The phone's tray chips (`PhoneCalendar`) have been plain `<button>`s with a tap → sheet since the tray was added. That is the same in v1.2.1 through v1.5.0.
- Nothing ever made them drag sources.
- The suspects in the brief were all cleared on desktop:
  - cal-wave's `data-dragging` sections;
  - the ResizeObserver `updateSize()`;
  - the cal-blocks ghosts and Ctrl+drag;
  - the Draggable `itemSelector` and `dragGuard`;
  - the S1 memoisation (`useStableHandlers` reads the latest render).

## Root causes and fixes

1. **The phone could not drag a task at all.**
   - **Fix:** a 400ms hold on a tray chip lifts it.
     - This works for Overdue, Today, Scheduled, Inbox and Lists. The scope chip is excluded.
     - `PhoneGrid.carry()` takes the chip under the finger. It uses the machinery a slot's held task already had: the float, the dashed ghost, the time bubble, a tick per quarter and edge scroll.
     - Let go on the grid, and the chip lands on that quarter. Let go off the grid, and nothing happens.
     - A tap still opens the sheet. A sideways move before the hold still scrolls the tray. The release after a carry is swallowed, so it is not a tap.
   - **Shared drop rule:** desktop and phone now drop through one function, `calendar/gridDrop.ts` (`dropOnGrid`).
     - A task dropped on a Time block goes into the slot. A task already in that slot stays.
     - Otherwise `scheduleTaskWithUndo` runs (the shared length rule): its own block moves if it has one, at the task's length or its missed block's length (`railMinutes`).
     - An inbox capture is filed and blocked at its own length (`fileToCalendar`).
     - There is one Undo. All writes go through the outbox.
   - Desktop `handleExternalDrop` now calls the same function.
2. **The carried chip dragged the page 40px down.**
   - Cause: the page's boundary rubber-band (`lib/motion.ts`, `useBoundaryResistance`) read the downward finger as a pull.
   - **Fix:** it now ignores a touchmove that something below has claimed (`defaultPrevented`).
   - The tray claims the touchmove with a non-passive listener that is in place from the start of the touch.
3. **The grid scrolled away as the chip came in from above.**
   - Cause: the finger crossed the grid's top edge-scroll band on its way in.
   - **Fix:** a carried chip's edge scroll arms only once the finger has been past that band.
4. **On a touch screen in the desktop layout, a held card landed a quarter early.**
   - Cause: FullCalendar's `Draggable` waits 1s on touch. A finger that was already moving when the wait ended dropped one snap above where it let go.
   - **Fix:** rail, tray and planning cards and held slot rows use the grid's own 400ms long press (`cardDrag.ts` `CARD_DRAG`).
5. **The Now card's fade swallowed the press on a rail card under it** (desktop, cal-wave).
   - Cause: the fade is a 16px transparent strip on the sticky dock.
   - **Fix:** the dock has `pointer-events: none`, and only its card takes presses.

## Files

- `app/src/features/calendar/gridDrop.ts` (new)
- `PhoneCalendar.tsx`: `holdable()`, the tray's touch guard
- `PhoneGrid.tsx`: `carry()`, the `Carry` type, the armed edge scroll
- `phoneCalendar.css`: no selection or callout on chips
- `CalendarPage.tsx`: `dropOnGrid`, the Now dock's pointer-events
- `cardDrag.ts`: `CARD_DRAG`
- `CalendarGrid.tsx`: the held row uses `CARD_DRAG`
- `lib/motion.ts`

## Permanent check: `docs/log/assets/drag-fix/verify.mjs`

Result: **176/176**. It runs on the strict mock (sync-fix's), so a write the server would refuse fails the check.

Every case checks:
- the block's time and length, and the task's schedule;
- the toast;
- that Undo puts it back;
- that the server refused nothing;
- that there are no page errors.

The cases:
- **Desktop, mouse, at 100% and 150%, Kai's Day view:**
  - rail Overdue (30m default), Today, Scheduled (its block moves, same id), Inbox (filed, 20m) and Lists;
  - a planning-mode card;
  - a day-tray card;
  - a held slot row (out of the slot, its own block);
  - a block moved in the grid.
- **Phone, 390 wide, CDP touch:** a hold, then a carry onto 15:00, for Overdue, Today, Scheduled, Inbox and Lists. Also:
  - Tasks → the Calendar tab → carry;
  - a tap still opens the sheet;
  - a carry let go over the strip writes nothing and opens nothing.
- **Tablet, 1024 wide, touch:** a held rail card lands where the finger lets go.

`ONLY=r,p,y,h,b,m,t` and `SCALES=1,1.5` pick sections.

## Gate

- `tsc -b`: clean
- `vitest`: 2575 / 185 files
- `lint`: 0 errors
- `build`: OK
- `ds:check`: 0 new
- Harnesses, one at a time on a dual-stack mock (:5316):

| Harness | Result |
|---|---|
| drag-fix | 176/176 |
| cal-rail-drop | 33/33 |
| calendar-rail | 101/101 |
| cal-blocks | 93/93 |
| cal-wave | 224/224 |
| cal-polish | 229/229 |
| cal-looks | 107/107 |
| time-slots | 153/153 |
| calendar-phone | 180/180 |

- `birthday_on` 1 / `birthday_on: false` 1.
- The servers are stopped.

Two harnesses had broken on the merged base before this work. They were retargeted:
- **`cal-blocks`:** its menu shot is now a page clip. With typing's length row, the block menu is taller than an 800px window at 125%. An element screenshot that big resizes the viewport, and the menu closes on the resize.
- **`cal-polish` b1:** Time format moved to Settings ▸ Calendar (settings-build).

## Open / for Kai

- **Block menu height (out of scope).** At 125% on an 800px-tall window, the block menu (menu B plus typing's length row) runs past the bottom of the screen, so Delete is off-screen. This came from the merges, not from this branch. It needs a max-height and its own scroll.
- **The lifted chip stays drawn in the tray while it is carried.** Dimming it is a look for Kai to decide.
