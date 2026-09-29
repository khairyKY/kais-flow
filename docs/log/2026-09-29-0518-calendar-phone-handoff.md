---
date: 2026-09-29T05:18+03:00
session: Wave N builder J (the calendar on the phone)
type: handoff
related: design-export/SCREENS-2026-09-28-sheets.md §Calendar Phone.dc.html 7a–7n + §Decisions → Calendar (phone) · design-export/Calendar Phone.dc.html · CALENDAR.md §3/§5 · DS-CHANGELOG §3 (Week strip, Now line, Bottom sheet, Action sheet, Undo toast, --dur-longpress, --swipe-commit, Android Back)
---

# The calendar on a phone: our own touch grid

Branch `claude/calendar-phone`, cut from `origin/claude/wave-n2` (9937c97). Not merged, not deployed. Desktop (≥ 768px) keeps the FullCalendar layout unchanged.

## What changed

- **The split** (`features/calendar/CalendarPage.tsx`): < 768px renders `PhoneCalendar`, otherwise the desktop layout as before.
  - The desktop component lost its phone branches: the 1b week strip, the phone rail and fold bar, the phone CSS, `window.innerWidth` day default.
  - `CalendarGrid` lost `phone` and `gotoDate`, and CalendarGrid.css lost `.kf-cal-phone`.
  - `QuickCreate` lost its phone sheet (Editor 2c).
  - `gridClock` lost `SCROLL_LEAD_PHONE_MIN`.
  - All of these were dead code once the phone stopped rendering FullCalendar.
- **The page** (`PhoneCalendar.tsx` + `phoneCalendar.css`, 7a):
  - **Header:** 56px, like Today's. The shell's mono top bar steps aside on this page.
    - The title (Source Serif 26 + chevron) is the view switch. Tapping it opens an ActionSheet (7n) with Day / 3 days (hint "Sun–Tue") / Week (hint "Sep 27 – Oct 3"). The current view gets a sage wash and a check, and the chevron turns up.
    - "Today" (ghost) goes back to today and re-centres the now line.
  - **Offline:** the kit OfflineChip under the title (7k).
  - **MK Week Strip:** 7 × 48×76 targets; the day letter mono 12; a 40px circle with the date.
    - Today has the terra-ink ring, the shown day is ink-filled, and a day holding something gets the 4px dot (`pickerMath.daysWithItems`).
    - It shows the rolling week that holds the shown day, paged in sevens from today. 3 days washes its range with `--select-bg` (7h).
  - **Unscheduled strip:** 56px, "Unscheduled · N", 40px paper cards (title + mono duration).
    - It shows the desktop rail's default scope (the Today smart list, not on the calendar). It is hidden when empty, and skeleton cards show while loading.
    - Tapping a card opens Schedule (7g). The tapped card keeps an ink outline.
- **The grid** (`PhoneGrid.tsx`): our own, not FullCalendar.
  - **Geometry:**
    - 64px hours, a 60px gutter, dashed hour lines, times in Cairo wall-clock (B2).
    - Blocks are fills with radius 3. The hue comes from the kind (CALENDAR.md §3): a colour set on the block, else the task's project hue (its own, else its domain's), else a plain event in blossom, else lavender.
    - Task blocks always draw the 18px checkbox, which toggles done with the Done + Undo toast.
    - Past blocks: 55% opacity, saturate 0.6. The block in progress reads "Now · 20m left".
    - A block half scrolled off keeps its title in view (sticky row).
    - From 56px a block shows two lines (title, then time): always in 3 days / Week, and in Day for blocks without a checkbox.
  - **MK Now line:** 1.5px terra-ink, a 10px dot at the gutter, a 22px time tag.
  - **3 days** adds a 32px day-header row. **Week** gives the ~47px columns their title (no checkbox, 4px padding).
  - **All-day events:** a chip row over the hours, only on their days. Tapping one opens its sheet, which has no Time row: an all-day event stays a date.
  - **Day swipe (7b):** only the columns slide, under a clip at the gutter; the hour labels stay put.
    - Past 40% (`--swipe-commit`) or a fling the same way, it commits. Short of that it springs back (200ms).
    - The title and the strip change after the commit. 3 days pages by 3, Week by 7.
    - A vertical drag is a scroll (`tasks/swipe.lockAxis`, `touch-action: pan-y`).
  - **Tap an empty slot (7c):**
    - The quarter you tapped becomes a 30-minute slot. The grid scrolls it 80px under the top edge, and the quick-create sheet opens with the keyboard up.
    - The slot is drawn over the scrim, with the live title.
  - **Hold 400ms (7e):**
    - The block lifts: scale 1.04, +1.2°, `--shadow-popover`. Its old place stays as a dashed outline.
    - It follows the finger in 15-minute (16px) steps, with a haptic tick per step (Capacitor only).
    - The time bubble sits in the gutter in the inverted `--toast-bg` / `--toast-ink` pair.
    - In 3 days it moves across columns.
    - A non-passive `touchmove` guard keeps the page from scrolling under the drag.
  - **Drop (7m):** one write (`moveOrResizeEvent`, which also moves the task's schedule), then the toast "Moved to 16:15 · Undo". Another day reads "Moved to Mon 28 15:00".
  - **Released without moving:** the block stays lifted until a tap elsewhere (which only puts it down) or Back / Esc (overlay stack).
  - **Resize (7f):**
    - The handles sit outside the top and bottom edges, each with its own 48px target (96 wide), so a 30-minute block still has a body to drag.
    - While you drag, the bubble reads the dragged edge and the length: "16:15 · 1h15".
    - Release writes `resizeEvent`, whose new length becomes the task's estimate, and toasts "Resized to 15:00–16:15 · Undo".
  - **7i:** an empty day (Day view, no blocks, no all-day) shows `daisy/future.png`, "A clear day — tap any time to plan" and "Plan my day", which opens the Morning ritual (lazy). The hours around it stay tappable.
  - **7j:** skeleton blocks and cards only while nothing is cached; the now line still shows.
  - **7k:** a queued block shows the 7px `--sig-offline` pending ring (outbox marks).
- **The sheets** (`PhoneSheets.tsx`):
  - **7c Quick create:**
    - Segmented Task (the default) | Event, and Save (the terra CTA), which is disabled until there is a title.
    - The title field is focused at once; Enter saves.
    - The date chip ("SUN 27 · 16:00") opens the MK Time Picker. The duration chips run 15m – 2h, with 30m chosen.
    - Task writes `createTask` and then `scheduleTask`; Event writes `createEvent`.
  - **7d Block sheet** (medium):
    - Header: the checkbox (done / reopen), the serif title, and "Task block · <project>" with its hue dot.
    - Rows:
      - Time: the MK Time Picker, with duration. Done moves the block with the same write and toast as a drop, and the block stays in view above the sheet.
      - Open the task: "Notes · 2 subtasks", then `openTask`, which opens the Task sheet over /calendar.
      - Remind: the task's own Remind picker (TaskMenu, opened on that picker).
    - After an edit it reads "✓ Saved"; offline with the row queued, "○ Pending sync".
    - Footer: Delete (terra ghost) and Unschedule (secondary). The sheet leaves first, then the block goes, with an Undo toast. The task stays and returns to the strip.
    - A plain event's sheet reads "Event · 1h" and has only Time and Delete.
    - The block is drawn over the scrim where it sits.
  - **7g / 7g2 Schedule:**
    - "Schedule" + "<task> · <duration>". "Next free today" lists the next 3 slots that fit (the gaps stepped by the duration, as Suggest a time does).
    - If nothing fits today, it says "No 3h30 gap left today" and lists the first gap on each of the next days.
    - One tap places the block ("Scheduled · <task>" + Undo) and moves the grid to that day if it isn't on screen.
    - Pick a time… opens the Time Picker for today; Pick a date… opens the Date Picker, with Set time.
- **Pure logic, tested** (`phoneGridMath.ts` + 16 tests, all under the four zones):
  - `weekPage`, `visibleDays`, `viewTitle`, `weekdayRange`, `columnLabel`
  - `eventSpan`, `spanIso` (24:00 becomes the next day's 00:00), `dayBlocks` (clipped at midnight), `allDayOn`
  - `dragSpan` (15-minute snap, clamps, never shorter than one snap, column shift), `bubbleText`, `movedText`, `tapStart`, `rangeText`
  - `swipeStep` (40% or a same-way fling), `scheduleSlots`, `slotLabel`
- **Kit / shared:**
  - `ActionSheet` items take `selected` (a sage wash, `aria-current`, and a check).
  - `calendar/api.deleteEventWithUndo(event, 'Unscheduled' | 'Deleted')`. The desktop's two private copies now call it too.
  - `Segmented` is imported from `rituals/RitualChrome`.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 69 files / 951 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (+1 file, `phoneGridMath.test.ts`, 16 tests; one gridClock test rewritten for the removed phone lead).
  - `npm run lint`: 0 errors, 19 warnings, none in the touched files.
  - `npm run build`: ok.
- **Browser** (`docs/log/assets/calendar-phone/verify.mjs`: **157/157**). How it runs:
  - Playwright + system Chrome, 390×844, with real CDP touch (`Input.dispatchTouchEvent`) for the taps, swipes, 400ms holds and drags.
  - The backend is mocked with the task-sheet recipe. The clock is Sun 27 Sep 13:40 Cairo, and every write is recorded.
  - `ONLY=7d,7e` runs single scenes.
- **What it checks, frame by frame:**
  - **7a / 7l-a:**
    - Title, header 56, the shell bar hidden.
    - Strip 7 × 76, "Unscheduled · 2" with 40px cards, 64px hours, 4 blocks.
    - Lunch: "Now · 20m left", blossom. Tyre: 15:00–15:30, 32px, the project hue, an 18px checkbox. Gym: lavender, no checkbox.
    - Past block at 0.55 / saturate 0.6. The now tag 13:40 sits on the line. The sticky title stays in view. The grid ends at the tab bar.
  - **7d / 7l-d:**
    - Medium 506. Meta line, rows and hints as drawn. The block held over the scrim, above the sheet.
    - Time → 16:15 → one write + "Moved to 16:15" + "✓ Saved".
    - The checkbox marks the task done. Unschedule: block deleted, task unscheduled, the card back in the strip, Undo restores, and the sheet stays closed.
    - Open the task → `?task=` over /calendar. The plain event reads "Event · 1h" with Time only; Delete → "Deleted · Lunch with Omar".
  - **7b:**
    - Mid-swipe the columns follow the finger (−150) and Monday's blocks slide in. The hour labels don't move, and the track clips.
    - The title changes after the commit. A slow short swipe springs back; a fling commits; a vertical drag scrolls.
  - **7n / 7h / week:**
    - The view list and chevron.
    - 3 days: "Sep 27 – 29", columns "SUN 27 · MON 28 · TUE 29", the 27–29 wash, short blocks title-only, the 32px header row.
    - A lifted block moved one column right → Mon 28 15:00, with its toast. A checkbox tapped right after a drag still ticks.
    - A 3-day swipe → "Sep 30 – Oct 2". Week → "Sep 27 – Oct 3" with 7 columns. Today re-centres the now line (±2px).
  - **7c:**
    - Task chosen, Save disabled, the field focused. The date chip and 30M.
    - With a 300px keyboard the sheet sits on the keyboard. The slot 16:00–16:30 sits over the scrim with the live title, and grows with 45M.
    - Save → a task + a linked block 16:00–16:45 (duration 45). Event + Enter → a plain event 17:00–17:30 with no task.
  - **7g:**
    - "Review Kai · 30M", "Next free today", 14:00–14:30 · 14:30–15:00 · 15:30–16:00, the card marked.
    - One tap → a block at 14:30, "Scheduled" + Undo, the card leaves. Undo brings it back.
  - **7g2:**
    - "Next free", Tomorrow 16:30 · Tue 29 11:00 · Wed 30 13:00, "No 3h30 gap left today".
    - Tue 29 → placed 11:00–14:30 and the grid goes to Tuesday. Pick a time… → 19:00 placed.
  - **7e / 7m:**
    - Moving before 400ms scrolls and nothing lifts.
    - A 400ms hold lifts (transform + shadow). The bubble reads 16:15 in the gutter, the old place is dashed, the page doesn't scroll under the drag, and nothing is written mid-drag.
    - The drop writes 16:15–16:45 + the task's schedule; "Moved to 16:15 · Undo"; Undo → 15:00.
    - Released without moving, it stays lifted. A tap elsewhere puts it down (no sheet, no write). Esc (the Android Back path) puts it down.
  - **7f:**
    - The handles sit outside the edges with ≥ 48px targets.
    - The bottom handle → "16:15 · 1H15" → 15:00–16:15, the task's estimate 75, "Resized to 15:00–16:15".
    - The top handle up 32px → 14:30.
  - **7i:** Thu Oct 1: the daisy and the line, 27 ringed. The hours stay tappable. Plan my day → the ritual sheet.
  - **All-day:** "Company offsite" on Fri Oct 2 only, not a clear day. Its sheet reads "Event · All day" with no Time row.
  - **7j:** 3 skeleton blocks + 2 skeleton cards + the now line, then the 4 blocks.
  - **7k:** the offline chip. A move queues (nothing sent), the block moves, and it shows its pending ring.
  - **Every phone scene:** no horizontal scroll, no text under 12px (page + sheets), no page errors.
  - **Desktop 1280, day + night:** FullCalendar week + the rail, no phone grid, the shell top bar present. A block click still opens the details panel. Right-click → Unschedule still writes the delete and toasts "Unscheduled" (now through the shared helper).
- **Screenshots:**
  - `7a…7n-day.png`, `7l-a-night.png`, `7l-d-night.png`, `week-day.png` and `desktop-{day,night}.png`.
  - 16 `side-<frame>.png` (design frame | build). The design frames were rendered from `Calendar Phone.dc.html` with `support.js`.
- **Regression** — `task-sheet/verify.mjs` against this branch vs. the base (9937c97, served from a scratch worktree on :5245):
  - Every result through `from-inbox` is identical: 118 pass, and the same 2 fail on both (4b Focus → /focus, 4e Copy link — this machine's headless run, not this branch).
  - The harness then stops at `from-calendar`. That scene looks for FullCalendar's phone block (`.fc-event` + "Open task"), which this branch replaces. The same path is covered here by 7d "Open the task", so that scene is stale.

## Deviations

- **Tap a task block → the 7d block sheet, as drawn.** Its "Open the task" row is `openTask` (the Task sheet).
  - The brief's shorthand read "task blocks → the Task sheet via openTask". This sheet is the only home the design gives Unschedule, block-only Delete and Time for a task block (Task sheet decisions: "Unschedule … lives in the block sheet").
  - **Kai / conductor:** for the direct route, the one-line switch is `onTapBlock` in PhoneCalendar (open `openTask(e.task_id)` when there is one).
- **Ritual kind (sage + hatch) isn't drawn.** `calendar_events` carries no ritual/routine link, so the sample "Gym" is a time block (lavender) and the night hatch flag has nothing to show yet.
- **No ⋯ in the block sheet header.** The drawing doesn't say what's in it.
- **The week strip and Week view are the rolling week from today** (Kai 2026-07-21), which matches every frame. The desktop-only `weekStartsMon` option isn't read on the phone.
- **The shortest block is one snap (15 min)** on the phone. CALENDAR.md §7's 30 was written for the 30-min desktop grid.
- **The phone grid is Cairo wall-clock** (B2), like the pickers. The desktop FullCalendar still lays out in device time.
- **Two lines from 56px**, except task blocks in Day, which keep one row (7f). 7b's transition frame stacks the Monday task block, and 7a draws Gym (a ritual) on one row.
- **7g2's slots come from the pickers' 08:00–20:00 free window**, so tomorrow's first fit in the sample is 16:30. The drawing's "Tomorrow 09:00" assumes a freer Monday.
- **Toast wording not in the drawings:**
  - A resize reads "Resized to 15:00–16:15 · Undo".
  - Scheduling reads "Scheduled · <task>".
  - Quick create has no toast (not drawn).
- **The empty-day daisy is drawn 50px wide.** The kit EmptyState's 120 would make this 132 × 318 stem 289 tall; it's drawn ~120 tall.
- **`Segmented` is imported from `rituals/RitualChrome`,** which brings rituals.css into the calendar chunk. It belongs in the kit: move it there when someone next touches either.

## Risks / not done

- **Hardware not tested:** CDP touch in headless Chrome only. Not checked:
  - an Android WebView long-press (the contextmenu is suppressed)
  - the Capacitor haptics
  - the real IME inset (simulated through `visualViewport`)
  - real Android Back (it calls the same `closeTopOverlay`)
- **No edge auto-scroll while dragging a block.** To move a block beyond the visible hours, release (it stays lifted), scroll, and drag again.
- **4+ blocks overlapping at once:** the 4th+ is not drawn on the phone (no "+N more" yet). `overlapLayout` is shared with the desktop.
- **Flings are judged over the last 100ms of movement.** One harness run read a 70px CDP fling as a stop; the check now uses 100px and has passed every run since.
- **A desktop window narrower than 768px** now gets the phone calendar. A hold with a mouse lifts too.
- **Stale harness:** `task-sheet/verify.mjs` from-calendar (above). It is not updated here.
- No `docs/log/INDEX.md` line and no ROADMAP edit (the conductor adds them).
