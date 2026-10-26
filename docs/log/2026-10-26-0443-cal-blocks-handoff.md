# cal-blocks handoff — 2026-10-26 04:43 (Cairo)

Branch `claude/cal-blocks` (worktree `.claude/worktrees/cal-blocks`, based on v1.5.0). It builds Kai's picks on `design-export/Calendar extras options.html`: **palette C, menu B, check B and repeat B**. It also builds queue item 10, **live multi-drag** (`D:\Coding\_claude-cloud\kais-flow-queue-2026-10-23.md`).

- The options page and `docs/log/assets/looks2/palettes.json` are brought over from `claude/looks2` byte for byte, so they merge cleanly.
- Every write goes through the existing outbox paths: `updateEvent`, `copyEvent`, `duplicateTasks` + `placeTask`, `moveEventsByWithUndo`, `completeTaskWithUndo`.
- There is no migration.
- typing's time and length rows are untouched: `LengthChips` and the Time row are as they were.

## Palette C

- **Tokens.** `--blk-<swatch>` and `--blk-<swatch>-ink` for the 16 swatches (a clear row and a deep row), plus:
  - `--blk-fill`: 24% by day, 20% at night;
  - `--blk-ran-ink`: #7C341D by day, #FFE0D3 at night;
  - `--blk-night`: 0% by day, 100% at night.
  - Day values are in `colors.css`, night values in `colors.dark.css`, exactly as `palettes.json` has them.
  - No other token changed.
- **`blockHue.ts`** holds the palette. `ACCENT_COLORS` is None plus the 16, and a swatch draws as its token.
- **Old colours.** The 9 colours saved before palette C draw as their nearest new swatch (OKLab distance, at render time, no data rewrite):
  - Lavender → Iris
  - Sage and Moss → Moss
  - Terra → Rust
  - Blossom and Clover → Rose
  - Hydrangea → Lagoon
  - Buttercream and Gold → Ochre

  The swatch pickers show the mapped one as picked.
- **Custom and project colours** keep their hex. Their time-row and check tone is worked out per colour to clear 4.6:1 on every fill, by day and at night. This is the options page's method, and one CSS value picks the day or night tone through `--blk-night`.
- **Blocks with no colour:**
  - a task or a Time block is Iris;
  - a plain event is Rose (palette C's roles).

  This covers the desktop grid, the phone grid, the all-day band, the Now card, the tray card and Today's squares (`blockSwatch`).
- **"Ran over"** uses palette C's terra on desktop and phone. The terra edge is kept.
- **Measured AA** (harness P), lowest across every block kind:
  - time row 4.61 by day, 4.61 at night;
  - titles ≥ 4.98;
  - "Ran over" 5.38 by day, 4.80 at night.

  Per-block numbers: `docs/log/assets/cal-blocks/p-contrast-{day,night}.txt`.

## Menu B

- **Layout.** The title comes first, after a dot in the block's colour. Under it is a quiet bone tray: None, the 16 swatches in 8 columns (drawn in the theme's own value), and "+ Custom".
- **"+ Custom"** is the system colour picker. It saves on the picker's `change` event, not on every drag step.
- **Width.** The popover is 272px, as drawn (`BLOCK_MENU_WIDTH`), so the tray fits.
- **New rows**, in the drawing's order:
  - **Duplicate** with Ctrl D keycaps. Ctrl+D / ⌘D works while the menu is open, with Undo.
  - **Work with AI ›**: Break into subtasks (tasks only), Find a better time, Reschedule…, Summarise. Each one opens the chat with the request about this block typed in, not sent. The chat already acts, with its confirm card.
  - **Copy link**: `/calendar?event=<id>`, then "Link copied". The link turns the calendar to the block and opens its menu.
- **New glyph:** kf `ai`, a spark with a small plus.
- **Phone.** The event sheet gets the same tray and rows. Work with AI › is an action sheet.
  - The phone tray is 10 columns of 26px (two rows), so the sheet stays short. Even so, at the half-height detent the Repeat row now sits under the fold, one swipe away.
- **Cheatsheet** gains two rows: ⌘/Ctrl D and ⌘/Ctrl drag.
- **Not changed: right-click** still opens the small quick menu (Edit / Complete / Unschedule / Delete). Menu B is the block menu a click opens. cal-looks, calendar-rail and google-sync check that quick menu. Moving menu B onto right-click is a small change if Kai wants it.

## Ctrl+drag duplicates

- **How it works.** Drag a block with Ctrl (or ⌘) held. The original stays drawn, the cursor reads copy, and a copy lands where you drop it, with one Undo.
- **What gets copied.** Duplicate's own rule:
  - an event copies;
  - a task block copies its task (and its block);
  - a Time block or a Google event gets the soft-no.
- **Mechanism.** FullCalendar won't start a drag with Ctrl held (its `isPrimaryMouseButton`), so a Ctrl-press on a block is re-sent without the key, and the drop reads the key.
  - A Ctrl-click without a move still multi-selects.
  - A Ctrl+drag's release no longer counts as a Ctrl-click on an empty slot. That used to open a "new task" popover.

## Check B and repeat B

- **Check B:** 13 × scale, a 2px edge, 38% corners, on the title's first line.
  - Measured within 0.9px at 100, 125 and 150%.
  - The edge is 2px at every scale, because the drawing's 1.6px at 100% snaps to 1 device pixel.
  - Slot rows: 13px.
  - Phone: the kit check at 18px, 2px edge, 38% corners.
- **Repeat B** applies to a task whose task repeats, on desktop and phone.
  - The box outline is two chasing arrows in the block's ink, with a 2px non-scaling stroke.
  - Ticked, the box fills with the tick and the heads stay.
  - Name: "Complete this occurrence (repeats weekly)" / "Reopen this occurrence (…)".
  - Ticking completes this occurrence, as before: the task is written done and the next one spawns.
  - It still only shows on hover or once ticked, as before.

## Item 10 · Live multi-drag

- **While dragging** one of several picked blocks, every picked block on screen travels as its own ghost under the pointer.
  - Each keeps its offset, and the 2c wobble is kept.
  - The others stay faded where they were.
- **On drop** they all land with the dragged block's snapped move (quarter hours, across days in multi-day views), with one Undo: "3 blocks moved · Undo".
  - The toast wording changed from "Moved · N blocks" to "N blocks moved".
- **Refused moves.** If any picked block would land outside the days on screen, nothing moves and every ghost does the soft-no shake.
- **Ghost position.** Ghosts are now placed from the press point, not from the move that crossed FullCalendar's threshold. The grabbed block's ghost no longer lags the pointer either.

## Also fixed

- **Chat starter.** The chat picks up its starter after mount. A first render thrown away by Suspense (the chat's lazy chunk) used to take the Ask widget's question with it, leaving an empty field on desktop.

## Seen, not changed

- **FullCalendar's snap and the pointer.** FullCalendar's placeholder can sit one snap (15 min) below the pointer: a 30-minute pointer move lands +45. The same happens at 100% scale and for single-block drags, so it is not from this work. The placeholder still shows where the block lands.

## Gate

- `npx tsc -b`: clean.
- `npx vitest run`: 182 files / 2521 tests. ×4 TZ in PowerShell (UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo): all green.
- `npm run lint`: 0 errors.
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
  - The intended palette hits are marked `ds-ok` in `blockHue.ts`: the stored swatch values, the contrast grounds, and the `--blk-<name>` token names.
  - Swatch hexes otherwise live only in the token files.
- birthday_on greps: 1 / 1.

## Harnesses

All were run on `vite --mode mock` at http://localhost:5314, one at a time.

- **cal-blocks** (new, `docs/log/assets/cal-blocks/verify.mjs`): **93/93**. It covers:
  - P: palette tokens vs `palettes.json`, every block kind with its contrast, old colours mapped, phone, day and night;
  - K: check B geometry and alignment at 3 scales, repeat B open, named and ticked, phone;
  - M: menu B order, tray, a swatch, Ctrl+D, Copy link and the link, Work with AI → chat prefilled, phone sheet;
  - D: Ctrl+drag an event and a task block, Undo, Ctrl-click still picks;
  - X: mid-drag ghost positions for all 3 picked blocks, wobble, faded originals, landing together, one Undo, refusal;
  - V: side-by-sides with the drawing.
- **Screenshots** (`docs/log/assets/cal-blocks/`):
  - side-by-sides: `side-by-side-{palette-day,palette-night,menu-day,menu-night,check,repeat}.png`;
  - `x-mid-drag.png`, `d-ctrl-drag-event.png`, `m-phone-sheet.png`, `m-chat-prefilled.png`.
- **Older suites**, each run alone; the final runs are all green:
  - cal-looks 107/107
  - cal-polish 229/229
  - cal-wave 224/224
  - calendar-rail 101/101
  - cal-rail-drop 33/33
  - cal-wave2 84/84
  - calendar-phone 180/180
  - time-slots 153/153
  - event-detail 70/70
  - dup-open 23/23
  - google-sync 101/101
- **Old checks updated** because the behaviour changed on purpose:
  - cal-looks c1 no longer compares hue and check against the old "Now" drawing. Palette C and check B replace it, and cal-blocks P and K check them. The geometry and type comparisons are kept.
  - cal-polish d9: toast "2 blocks moved".
  - cal-rail-drop p1 and event-detail a1/a2/p1: the tray (17 + Custom), Moss instead of Sage, menu width 272, the new rows. event-detail's phone taps now scroll the row into view.
  - calendar-phone 7a: Rose / Iris instead of blossom / lavender.
  - google-sync g2: a Google event shows no tray (it used to show a disabled dot).
