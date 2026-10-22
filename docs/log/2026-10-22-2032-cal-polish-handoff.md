---
date: 2026-10-22
session: cal-polish (builder, worktree .claude/worktrees/cal-polish, branch claude/cal-polish)
type: handoff
---

# 2026-10-22 20:32 · handoff · cal-polish

This handoff covers three rounds of calendar work:

- Kai's calendar polish list (21 Oct).
- The follow-ups A–E (22 Oct).
- The motion audit's fixes (`D:\Coding\_claude-cloud\kais-flow-calendar-motion-audit-2026-10-22.md`).

All of it is on `claude/cal-polish` and pushed. It is not merged: no PR, no migration. Kai's real data was never touched; every check ran against a mocked backend.

## 0 · For Kai to answer: the options pages (looks only, nothing in the app yet)

**`design-export/Calendar blocks options.html`**: open it straight from disk.

Answer with letters, for example "blocks B, overlap A, goal C, selected B". The page's **Copy my picks** button writes that line.

- **Blocks**: five looks.
  - N: the app now, for comparison.
  - **A**: Akiflow-faithful.
  - **B**: Akiflow-inspired, ours.
  - **C**: Calm (Notion Calendar / Amie).
  - **D**: Journal card.

  Each look shows the full set of states:
  - a task and an event;
  - a Time slot holding two tasks;
  - the goal;
  - done and past;
  - "Now · 51m left" and "Ran over";
  - 15, 30, 60 and 105 minutes, with a long title;
  - two and three overlapping;
  - hover (actions);
  - two selected.

  Each is shown by day, in Night Garden, and as one column at 150%.
- **Overlapping blocks**:
  - A: side by side.
  - B: cascade.
  - C: grouped ("3 at once").
- **The goal of the day**:
  - A: gold edge.
  - B: goal paper (tape and the "✶ Goal" stamp).
  - C: gold outline and clover.
- **Selected blocks** (multi-select, added at Kai's request):
  - A: outline ring.
  - B: filled wash and a check badge.
  - C: lifted card with an accent edge.

  Each is drawn with 1, 2 and 3 picked in a real column, by day and at night. They are drawn on Kai's blocks pick (B until he picks), and an **On A / B / C / D** switch redraws them on any direction:
  - the ring keeps the block's corners;
  - the badge takes that direction's check shape;
  - the lifted edge replaces the direction's colour bar.

  The app keeps its plain outline until he picks.
- All colours are the app's own tokens (`ds-bound/styles.css` and `app/src/styles/tokens/colors*.css`). No value was changed.

`design-export/Goal block options.html` is the first, goal-only page. The goal section above supersedes it.

Screenshots are in `docs/log/assets/cal-polish/`:

- The whole page: `options-day.png` and `options-night.png`.
- By section: `options-{blocks,overlap,goal,selected}-{day,night}.png`.
- The selected looks on the other block directions: `options-selected-on-{A,C,D}-day.png`.

### What Akiflow, Notion Calendar and Amie do

This is the anatomy the block directions are built from. It comes from the products' public screenshots and docs and from what I know of them; I did not sign in to any of them.

- **Akiflow**:
  - A block is a rounded rectangle tinted in the project's colour, with a solid bar of that colour down the left.
  - It has a bold title with the time under it.
  - A task carries a small square check before its title.
  - Blocks of 15–30 minutes shrink to one line: the title, then the time.
  - Done and past blocks fade, and done titles are struck through.
  - Overlapping blocks sit side by side.
  - A Time Slot is a box in the project's colour with its name, a task count and a completion bar along the bottom, and its tasks listed inside.
- **Notion Calendar**:
  - Soft tinted fills from an eight-colour palette, 4–6px corners, no heavy edges, a hairline grid.
  - The title, then the time in grey.
  - Past events fade.
  - Overlapping events sit side by side.
  - Blocks don't move on hover; you get a tint and the resize cursor.
- **Amie**:
  - Rounder pastel blocks.
  - A to-do dragged onto the calendar becomes a block with a round check.
  - Done ones are struck through.

## 1 · The polish list (21 Oct)

| Ask | Root cause | Fix |
|---|---|---|
| 15-minute blocks on every path | Resize had `MIN = 30`, and a one-quarter drag-create was widened to 30 minutes | The floor is one snap (15m) on resize, drag-create, the menus and the phone. The phone keeps its 24px minimum drawing height for a 15m block |
| One-tap length row | — | `LengthChips` (15m · 30m · 45m · 1h · 1h30 · 2h, in `components/TimePicker.tsx`), shown in quick create, the block popover header, the phone block sheet and the task sheet's block card |
| Compact lifted drag ghost | FullCalendar's mirror is a clone placed in visual px under the root `zoom`, with no card styling. The rail row's own `:active` lift was a second ghost | `calendar/cardDrag.ts` re-centres the mirror on the pointer and lifts it once. CSS draws it as one small card (title and length) under the pointer |
| Goal block options | — | The options pages above (looks only) |
| No empty-title task | Quick create's submit fell back to "Untitled task" | Create is disabled, and Enter does nothing, until there is a title (desktop and phone) |

## 2 · A–D (22 Oct)

- **A · the checkbox sits on the title's first line.** The check was a fixed 12px box while the title scaled with the UI size.
  - The check is now `12px × --s` with no top margin, and the title's line-height is 1.2.
  - Checked on desktop, held rows and phone, day and night, at 100 / 125 / 150%. `verify.mjs` a1/a2: within 1px.
- **B · 24-hour leaks.** Only the calendar grid read the `hour24` view option. There is now one clock, in `lib/clock.ts` (`useHour24` / `clockText` / `clockRange` / `clockOptions` / `hourLabel`).
  - It is set from Settings ▸ Appearance ▸ **Time format** (12-hour / 24-hour), or from the calendar's View options, which is the same setting.
  - About 45 display sites follow it: the calendar, phone grid, sheets, task editor, snooze, rows, inbox, quick add hints, due chips, Today, focus, journal, activity, search, the tray, the morning ritual, the weekly review and paper.
  - `lib/clock.test.ts` (8 tests) passes in four time zones.
  - Tests that read times pin 24h with `beforeAll(() => setHour24(true))`.
- **C · the ⋮ between the panes only resizes.**
  - A click does nothing, and a double-click resets the width.
  - Letting go past 60% no longer swaps in planning mode.
  - **Choice:** planning mode is entered only by name, from View options ▸ **Planning mode** (a toggle). It is left with **Leave planning mode** in the planning panel's header.
- **D1 · multi-select.**
  - Ctrl/⌘/Shift + click adds or removes a block.
  - Dragging one moves them all by the same amount ("Moved · N blocks", one Undo).
  - Delete or Backspace removes them all ("Removed · N blocks", one Undo).
  - Esc, a plain click or a click on the grid clears the selection.
  - The look stays a plain outline until Kai picks one (section 0).
- **D2 · resize from both ends.** The top edge resizes too and has the same grip as the bottom. Both snap to 15 minutes and show on hover.

## 3 · The motion audit

**Done:**

- S1, S2 + M1, S3, S4 / S5, S7, S9 and S10.
- M2, M5 / M6, M7 (the paging slide) and M8 (blocks fade in and out).
- M14's gap: the reduced-motion rule now reaches `::before` / `::after`.
- M9, the way Kai chose it.

**Skipped, as asked:**

- **S8** (`lib/sounds.ts`) and **M3** (the shared Checkbox). Another builder has these.
- The selection look: the plain outline stays.
- The ghost's wobble stays, as Kai decided.

All motion uses transform and opacity, apart from the hover shadow Kai asked for. It is off under `prefers-reduced-motion` and when Effects is off.

- **S1:** `CalendarGrid` is now `memo(forwardRef)`.
  - The page hands it stable props:
    - handlers through a latest-ref wrapper;
    - memoised blocks;
    - id arrays that keep their identity;
    - hoisted FullCalendar formats.
  - FullCalendar compares `events` one object at a time. A block whose drawing didn't change keeps last time's object (`shareEvents`), so a write's server echo costs FullCalendar nothing.
- **S2 + M1:**
  - The outbox's saving and retry marks ride the block element (classes and CSS text), never FullCalendar's data.
  - After a drop, the block stays hidden under the ghost while the ghost settles onto it (160ms), then a short ring plays.
  - The flash at the old slot is gone, as is the dead snap-flash / snap-line CSS.
- **S3:** while the splitter moves, it writes the rail's own width once a frame. A variable on the shell restyled the whole page on each move. React hears about it once, on release.
- **S4 / S5:**
  - The fetch window snaps to whole weeks, so paging inside it keeps the same query.
  - Month view shows at most 3 blocks per day and uses a lighter content path.
- **S7:** a cached `Intl` time formatter per zone and clock setting; the formats are hoisted.
- **S9:** one shared clock that ticks on the minute (`lib/minuteClock.ts`).
  - Each block's time row subscribes for itself (`LiveTime`), so a tick repaints only the blocks that change phase.
  - The page re-renders on the minute only in planning mode.
- **S10:** the phone swipe offset is a CSS variable, so there is no re-render per move. Block looks are cached.
- **M2:** one popover recipe (`.kf-pop`): 140ms in from the anchor side, 100ms out.
  - It covers the block popover, quick create, the context menu, the stack's "+N more" and View options.
  - The task popover gets the entrance only: it closes through a route change, so it has no exit animation.
  - Popovers now size themselves from their layout box (`offsetWidth` / `offsetHeight`). A rect read during the entrance is 3% short, which put a tall block popover 16px past the bottom of the window. event-detail a1 caught this.
- **M5 / M6:**
  - Blocks no longer shrink when pressed.
  - The ghost and the rail card scale in once (120ms).
  - Rail rows no longer lift in place.
- **M7:** prev / next / today slide the day columns in from their side (160ms, opacity and translate).
- **M8:** a new block rings in. A removed block fades out where it was (a copy, 120ms).
- **M9 (Kai: yes):** a block under the pointer lifts 1px with a soft shadow (`--shadow-hover`, 140ms).
  - It is now one rule (it used to be defined twice).
  - It is off when Effects is off or under reduced motion.
  - Checked by harness h1 (day, night, Effects off, reduced motion).

### Before / after

How it was measured:

- Production builds of `686e0516` (items 1–5 and A–D, before the motion work) and `5302c371` (after), both against the mocked backend.
- Both were measured back to back on this laptop, desktop at 1280×800 and 100%.
- Each cell gives the long tasks in ms (with their total), then the dropped frames (over 20ms), then React commits.
- Runs on this machine vary by about ±50%; an earlier pair of runs is in the session notes and points the same way.

| Scenario | Before | After |
|---|---|---|
| Block drop (move 3h) | 164 + 142 + 126 + 80 (512) · 4 dropped · 14 commits | 206 + 203 (409) · 2 dropped · 12 commits |
| Resize drop | 264 + 219 + 119 + 118 (720) · 4 dropped · 14 commits | 110 + 80 (190) · 2 dropped · 13 commits |
| Rail card drop | 303 + 184 + 194 + 177 (858) · 4 dropped · 26 commits | 235 (235) · 2 dropped · 25 commits |
| Held task out of a slot | 237 + 179 + 146 + 221 (783) · 5 dropped · 26 commits | 128 (128) · 1 dropped · 25 commits |
| Tick a block + server echo | 181 + 129 (310) · 2 dropped · 18 commits | 259 + 132 (391) · 3 dropped · 20 commits |
| Page next | 340 · 1 dropped · 6 commits | 151 · 1 dropped · 5 commits |
| Page prev | 213 · 1 dropped · 6 commits | 113 · 2 dropped · 5 commits |
| Today | 222 · 1 dropped · 6 commits | 136 · 1 dropped · 5 commits |
| Week view | 427 · 1 dropped · 5 commits | 200 · 1 dropped · 5 commits |
| Month view | 1642 · 1 dropped · 4 commits | 182 · 1 dropped · 4 commits |
| Quick create open | 536 · 3 dropped · 9 commits | 101 · 2 dropped · 8 commits |
| Quick create close | 217 · 1 dropped · 3 commits | none · 0 dropped · 5 commits |
| Block popover open | 375 · 2 dropped · 2 commits | 97 · 1 dropped · 2 commits |
| Block popover close | 191 · 1 dropped · 2 commits | none · 0 dropped · 4 commits |
| Task popover open | 82 + 197 (279) · 3 dropped · 3 commits | none · 1 dropped · 3 commits |
| Task popover close | 223 · 1 dropped · 2 commits | none · 0 dropped · 1 commit |
| Planning mode on | 250 + 64 (314) · 3 dropped · 7 commits | 152 · 2 dropped · 9 commits |
| Planning mode off | 537 + 113 (650) · 2 dropped · 6 commits | 110 · 1 dropped · 6 commits |
| Rail splitter, 40 moves | 14.8 s, 79 long tasks (12811) · 87 dropped · 199 commits | 0.84 s, none · 0 dropped · 0 commits |
| Rail fold | 126 + 105 (231) · 2 dropped · 5 commits | none · 0 dropped · 4 commits |
| Rail unfold | 178 + 134 (312) · 2 dropped · 5 commits | none · 0 dropped · 2 commits |
| 62 s idle (minute ticks) | 160 · 2 dropped · 8 commits | none · 1 dropped · 9 commits |
| Phone day swipe (move) | none · 0 dropped · 16 commits | none · 0 dropped · 3 commits |
| Phone block drop | none · 0 dropped · 11 commits | none · 0 dropped · 12 commits |

**The drop, frame by frame** (the snapback probe, moving a block 30m earlier):

- **Before:** the block showed at its old slot from 141ms, then jumped to the new one at 249ms.
- **After:** the block stays hidden under the ghost the whole way (old slot, then new slot), and shows at 498ms when the ghost has settled. The old slot never flashes.

The measurement files are in `docs/log/assets/cal-polish/perf/`:

- `measure.mjs` (scenarios), `trace.mjs` and `compare.mjs` (this table);
- `before.log` / `after.log`;
- `results-before.json` / `results-after.json`;
- `compare.md`.

## 4 · Gate (at `5302c371`)

**Checks:**

- `npm ci`: passed.
- `npx tsc -b`: clean.
- `npx vitest run`: **170 files / 2338 tests**, passing in UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (run through PowerShell `$env:TZ`).
- `npm run lint`: **0 errors**. The 24 warnings were all there before this work.
- `npm run build`: passed (entry `index` 366.17 kB, gzip 116.78 kB).
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**, 11 fixed since.
  - The hover's shadow transition is marked `ds-ok` because Kai asked for it.
  - The lift-ins animate scale only.
- `grep -c birthday_on app/src/lib/types.ts` = 1 and `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.

**Harnesses** (mock dev server on `[::]:5294`, run one at a time):

- `cal-polish`: **229/229**.
  - The last full run was 228/229. That one failure was its own b1 expectation still reading the old unspaced range; after updating it, b1 reran 22/22. h1 (the hover lift) passed 6/6.
- `calendar-rail`: 101/101.
  - Its drop-4am-day failed once, on the first run after a burst of edits: a cold first drag made no write. It passed 10/10 alone and 101/101 twice since.
- `cal-rail-drop`: 33/33.
- `cal-wave2`: 84/84. Its e3 now reads the band's 24h labels, the clock this harness pins.
- `calendar-phone`: 180/180. The block menu's spaced "13:00 – 14:00" is back.
- `time-slots`: 153/153.
- `event-detail`: 70/70, after the popover sizing fix.
- `task-sheet`: 150/150.
- `dup-open`: 23/23.

All my dev and preview servers (5294, 5301, 5302) are stopped. A process I didn't start was listening on 5299 earlier; I left it alone.

## 5 · Choices and notes

- **Planning mode by name only (C).** The splitter is a resizer and nothing else.
- **What follows the 12h/24h setting.** MCP replies and server notification times were left as they were. They are not on-screen text in the app, and the MCP already names its time zone.
- **Phone minimum height.** The phone keeps its 24px minimum drawing height for a 15-minute block, so its title stays tappable.
- **Tests pin 24h.** Harnesses and unit tests pin the 24-hour clock, because those are the strings they read.
- **Spaced and tight ranges.** The block menu and search rows keep their spaced "09:00 – 11:00"; the grid keeps its tight "09:00–11:00".
- **The task popover has an entrance only**, no exit animation (M2).
- **Line endings restored.** Earlier commits on this branch had flipped some files' line endings; they are back as they were, with content unchanged:
  - `CalendarGrid.tsx`, `CalendarPage.tsx`, `PlanningPanel.tsx` and `blockMenuSpec.test.ts`: back to CRLF.
  - `quickAdd.ts`: back to LF, with its one CRLF line.

## 6 · Not done / not verified

- **A drop still costs two FullCalendar passes (about 100–200ms each).**
  - First, FullCalendar applies the drop to its own store. Then our write hands it a new `events` array, and it re-parses every block.
  - Removing the second pass means driving FullCalendar through its Event API instead of the `events` prop. That is a bigger change, so I didn't make it.
  - The echo that follows is now free (`shareEvents`).
- **Ticking a block plus its echo is about the same as before** (within this machine's noise). Its first tick is S8, which belongs to the other builder.
- **Opening the block popover still forces a layout** (about 90–220ms over the runs; audit S6). Only the grid side of S6 was fixed, through S1.
- **Not verified:**
  - on a real phone or touch device;
  - against the real Supabase backend;
  - at 1920 / 150% (this round measured 1280 at 100% and the phone only).
- **Waiting on Kai's letters:** blocks, overlap, goal and selected.

## Files (main)

- **Calendar:**
  - `app/src/features/calendar/`: `CalendarGrid.tsx`, `CalendarGrid.css`, `CalendarPage.tsx`, `cardDrag.ts` (new), `api.ts` (`deleteEventsWithUndo`, `moveEventsByWithUndo`), `BlockMenu.tsx`, `QuickCreate.tsx`, `PhoneSheets.tsx`, `PhoneGrid.tsx`, `PhoneCalendar.tsx`, `PlanningPanel.tsx`, `ViewOptionsPopover.tsx`, `StackMorePopover.tsx`, `blockMenuSpec.ts`, `planning.css`.
- **Shared:**
  - `app/src/lib/`: `clock.ts` (new), `clock.test.ts` (new), `minuteClock.ts` (new).
  - `app/src/components/`: `TimePicker.tsx` (`LengthChips`), `ContextMenu.tsx`, `AppLayout.tsx` (`.kf-pop`, `kf-motion-on`).
  - `app/src/styles/tokens/motion.css` (`--dur-pop-*`, `--shadow-hover`, the reduced-motion rule).
- **Other features:**
  - `app/src/features/tasks/TaskPopover.tsx`, `TaskSheet.tsx`.
  - `app/src/features/today/useMinuteNow.ts`.
  - The 12h/24h display sites, listed in commit `76b52806`.
- **Design pages:** `design-export/Calendar blocks options.html` and `design-export/Goal block options.html`.
- **Harness and measurement:** `docs/log/assets/cal-polish/verify.mjs` and `docs/log/assets/cal-polish/perf/`.

Commits since `410251f4`: 825e3807 … 5302c371 (the handoff commit is the last).
