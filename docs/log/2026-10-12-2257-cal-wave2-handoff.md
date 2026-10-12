---
date: 2026-10-12 22:57 UTC
session: cal-wave2
type: handoff
related: decision 2026-10-12-1839-local-decision-unbuilt-designs.md (this wave's mandate); 2026-10-12-1950-event-detail-handoff.md (block menu + repeating events, built on); 2026-10-12-1919-ds-check-audit.md; Kai 2026-10-12 "build the unbuilt designs" / "every feature meant to be and not drift from the design system"
---

# cal-wave2: handoff

Branch `claude/cal-wave2` (from `origin/claude/kai-bugs-1012` at 199c341c, merged up to its head three
times while building — the Repeat picker, the Label picker and the Today shell are in). Pushed, not
merged, no PR.

| Commit | What |
|---|---|
| `e073feb8` | Repeating events: a change from a LATER occurrence splits the series (Google's "this and following"), one Undo; BlockMenu / PhoneSheets / phoneCalendar.css drift fixed |
| `312a3085` | Calendar 3e: multi-day spans « » in the all-day band, midnight cuts ⌄ / ⌃ — desktop + phone |
| `10889ec6` | Events take the tasks' shared Repeat picker (RepeatMenu + Custom… editor); UNTIL is read as UTC |
| `65fff148` | Calendar §4 planning mode (4a / 4b); PlanningBoard.tsx, `/planning` and its pageLoaders entry cut |
| `386b0fc6` | Editor 1b–1d: the full create page (`/new`), Notes on create |
| `a800cd85` | Phone parity: create sheet kinds + task fields (1e / 7c), Month, Lists, chip Complete / Open; TaskEditorPage drift |
| `2ebfcd4d` | RepeatMenu's menu labelled "Repeat"; event-detail harness b3 follows the split |
| `f98ff942` | The task editor's labels open the shared Label picker |
| (this) | handoff + evidence |

**[KAI] when this ships:** deploy the `mcp` and `chat` edge functions with the frontend
(`npx supabase functions deploy mcp` / `chat`) — `_shared/series.ts` now reads a rule's UNTIL as a
UTC instant (RFC 5545). No migration.

## 1. Calendar §4 — planning mode (4a 1-day, 4b 2-day)

The redesign of the parked Planning board, as the frames draw it. **Enter:** the three dots on the
rail's right edge (a button; `aria-pressed`), or drag the rail past 60% of the calendar. **Leave:** the
same dots on the strip's left edge (click, or drag them back left). Remembered per device
(`kf.calPlanning`). Day view → one day in the strip (4a); any other view → two (4b).

- **The swollen rail** (`PlanningPanel.tsx`, `planning.css`): "Unscheduled · N tasks", the hand line
  (4a / 4b copy), All · Today · Overdue (the kit Segmented in the strip's mono), Sort ↕ (Due date ·
  Priority · Shortest first · A–Z, remembered), the bigger Quick add (opens the create popover; the
  key hint reads **N**, the app's real New task key — the frame says ⌘N), per-project groups with
  "Shaheen · 3 tasks · 1h 30m" (4a; a group shows 8 then "+N more") or one line a task with the
  project dot (4b), and the footer "12 tasks · 5h 25m total" over "3 blocked today · 7h 30m free" /
  "… · 1 blocked tomorrow". Cards: checkbox, title, "30M · DUE TOMORROW" / terra "OVERDUE 3D" /
  "↻ WEEKLY", the ⠿ grip. **A card drags onto the strip** (FullCalendar's Draggable, as the rail's);
  **a click opens the Plan menu** (Today · Next free slot · Tomorrow · Pick date…); right-click the
  task menu. A block dragged back off the strip onto the panel unschedules (Today tab: due today).
- **The strip**: the same `CalendarGrid` in a `strip` mode (no daisy day row; "FRI · TODAY" / "SAT"
  for two days; no empty all-day band), its header as drawn (daisy · "TODAY · FRI" · "Jul 10" · Today
  · ›; 4b "‹ Fri 10 — Sat 11 › Today"), and the free stretches as FullCalendar background events —
  dashed sage, "2H FREE".
- Pure half `planningMode.ts` (tested): which tasks (All = every open, unplaced, not-Someday task;
  Today / Overdue = the rail's own lists), sorts, groups + totals, free gaps (≥ 90 min inside the
  08:00–20:00 free window, from now on), the footer lines, the due words.
- **Cut:** `PlanningBoard.tsx`, its route and its `pageLoaders` entry (it was preloaded on every start).
  **Now dead (owned elsewhere, left in place):** `tasks/grouping.ts planningColumns` (+ its tests) and
  `lib/dateShortcuts.ts scheduleThisWeek`; stale comments naming the board in
  `components/AppLayout.tsx` (R4-27) and `components/useListKeys.ts`.

## 2. Calendar 3e — blocks crossing a day boundary

`daySpans.ts` (pure, tested in 4 zones): an all-day block over 2+ dates, or a timed one lasting a day
or more, is a **multi-day span** — in the all-day band, one piece per day on screen: only the outer
corners round, the open edges read « / », the title on the first piece in view, the last says
"« ends 3:00 PM". A timed block shorter than a day that runs past midnight is **cut**: square dashed
edge, "⌄ 1:30 AM" at the bottom of its first day, "⌃ from 11:00 PM" at the top of the next.
Desktop: `CalendarGrid` feeds FullCalendar one all-day piece per day (`<id>§<day>`, not draggable;
clicks / right-click / double-click act on the block) and labels FC's own cut segments. Phone:
`dayBlocks` carries `from` / `into`, `allDayOn` takes the timed spans, the chip reads « / » for the
shown stretch. A span no longer counts as a grid conflict.

## 3. Editor 1b–1d and 1e / 7c — creating

- **Desktop:** the popover's "More options ↗" opens the full page **`/new`** with what was typed
  (router state; `/new?kind=event` opens on a kind) instead of the centred modal. "Something new",
  ← Back, "esc closes · nothing saved until create"; the kind chooser is the kit `TapeCard` for the
  chosen kind; Task: title (the parse's chips) · **Notes** · Due · Priority · Project or area ·
  Duration chips · Reminder · **Repeat (the shared RepeatMenu + Custom… editor)** · label chips ·
  Top-3 / Someday; Event: date · from–to · all day · Busy/Free · colour · the Google note; Time
  block: Holds (its length pre-fills) · date · from–to · Length chips · Busy/Free · colour. The task's
  saved title drops what the parse caught ("…friday 3pm !! *deep-work" → "…"). **The sidebar folds to
  the rail** for the visit by pressing the shell's own collapse button (a frame later — StrictMode
  safe), pressed back on the way out (`CreatePage.tsx`; AppLayout untouched).
- **Phone (1e / 7c):** the create sheet offers **Task · Event · Block**. A task gets the task sheet's
  own chips and pickers (TaskMenu on a draft task: Priority, Project, Remind, Repeat), label chips,
  the Top-3 star and notes; the title's !! / #project / *label are caught. A block can **hold a task**
  (`TaskPicker`; that task's block, its length pre-filled).

## 4. Repeating events

- **(a) The split.** `series.splitSeries` (pure): from a later occurrence, the original row ends a
  second before it (UNTIL, COUNT carried as what's left), a new row starts the series there with the
  later skips; from the first live occurrence the row is edited in place as before. Used by
  **Repeat** (`setEventRepeat`) and **time of day / length** (`retimeEventWithUndo`); one Undo puts the
  original row back and deletes the new one. Title / colour / project / kind / busy still apply to
  the whole series (no split — they erase nothing). The new row is its own series (`series_id` null;
  "All events" on either half leaves the other). The phone sheet re-finds its block (`BlockRef`).
- **(b) Options.** The conductor's newer instruction: the block menu's Repeat submenu and the phone
  sheet use the tasks' **RepeatMenu** (Never · Daily · Weekly · Monthly · Custom…) — "Every weekday" is
  Custom… ▸ Weekly ▸ Mon–Fri; the Repeat row words a custom rule ("Every weekday", "Every month on
  the 2nd Tuesday"). The expansion reads **UNTIL as UTC** (`_shared/series.floatingRule`) so the
  editor's end dates, Google's and the split's agree; tests run the editor's BYDAY, Nth weekday,
  BYSETPOS, COUNT, INTERVAL and UNTIL rules through `_shared/series.ts` in Cairo and LA.

## 5. Phone parity

Month (the View sheet's 4th row; 3e's month form at phone size: the date in the week strip's circle +
up to three kind dots and "+N"; a tap opens that day; ‹ › page months); the rail's **Lists** as a
fourth strip segment (a scope chip opens Lists ▸ smart list / Project… / Area… / Domain…); a strip
chip's sheet now offers **Complete** and **Open task** beside the slots; the calendar's daisies (desktop
header, rail footer, day headers) read the **user's** hour (`eventTime.zoneHour`), not the device's.

## 6. Design-system drift

`npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 NEW in features/calendar** (BlockMenu,
PhoneSheets, phoneCalendar.css, the merged TaskEditorPage, and everything added). New code: type /
tracking / radius tokens only, `--ink-faint` for text.

## Verified

- `npx vitest run`: **1958 passed** under TZ = UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo
  (PowerShell `$env:TZ`). New tests: `planningMode.test.ts` (16), `daySpans.test.ts` (11),
  `series.test.ts` +14 (split, UNTIL in UTC, COUNT, all-day, DST, the editor's rules),
  `series.flow.test.ts` (split + Undo through the real api), `phoneGridMath.test.ts` (cuts, spans,
  month), `blockMenuSpec.test.ts`.
- `npm run lint`: 0 errors (20 warnings, none in new files). `npm run build`: green. ds:check: 0 NEW
  in features/calendar.
- **Browser** (mock backend, dev server from this worktree `--mode mock` on http://localhost:5256):
  `docs/log/assets/cal-wave2/verify.mjs` **78/78** (`results.json` + screenshots) — 4a/4b day + night
  (groups, totals, footer, free boxes, tabs, sort, a card dragged onto the strip lands at 16:30, a
  click opens Plan, leave), 3e desktop + phone day + night, the create page (More options ↗ → /new,
  sidebar folded, Notes / priority / label / clean title / block at the clicked slot, back with the
  sidebar open), the repeat split from Wed in the browser (UNTIL written, Mon/Tue stay, one Undo),
  Custom… editor, phone create (kinds, chips, save with notes + weekly repeat, a block holding a
  task), Month, Lists ▸ Project ▸ Shaheen, chip Complete, the editor's label picker.
  `docs/log/assets/event-detail/verify.mjs` **68/68**. `docs/log/assets/cal-rail-drop/verify.mjs`
  r1–r4 + p1: 32/33 — **r4 "Overdue: the soft-no shake" is flaky**: it passed 2 of 5 runs here, and
  failed 6 of 6 against the unchanged base branch (`git archive` of `origin/claude/kai-bugs-1012`,
  same harness), so it isn't this branch's; c1 drove the deleted details panel (superseded, per the
  event-detail handoff).
- **Side-by-sides** (frame rendered from its `.dc.html` beside the app, day + night):
  `sbs-4a-planning-1day.png`, `sbs-4b-planning-2day.png`, `sbs-3e-desktop.png`, `sbs-3e-phone.png`,
  `sbs-1b-create-task.png`, `sbs-1c-create-event.png`, `sbs-1d-create-block.png`,
  `sbs-1e-phone-create.png`, `sbs-7c-phone-create.png` (`sbs.mjs` makes them). 1280×800 at the 125%
  default; phone 390×844.

**Not verified:** a real device; Kai's real account; the MCP / chat functions against the UNTIL change
(the shared code is unit-tested; the functions aren't deployed from here).

## Deviations

- **4a free boxes:** the frame also marks a gap before the now-line; a past gap can't be planted
  into, so only gaps from now are marked (`deviation(2026-10-13)` in `planningMode.freeGaps`). The
  threshold (90 min) is read off the frame (2h marked, 1h15 not).
- **4a nav:** ‹ shows once the strip is off today (the frame, on today, draws only ›).
- **4b range title** 16px instead of 18 so "Fri 10 — Sat 11" stays on one line in a ~300px strip at
  125% (`deviation(2026-10-13)` in `planning.css`).
- **4a card click** opens the Plan menu (the frame has no tap path besides the drag).
- **Planning mode lists tasks only**, as the frames do — inbox captures stay in the normal rail.
- **"⌘N" → "N"**, the key the app actually binds.
- **Editor 1b** "Something new" at `--fs-display-l` (26) — the frame's 32 has no token.
- **1e:** the frame lays the phone create out as a labelled form; per this wave's instruction it
  reuses the task sheet's chips and pickers instead (the 7c sheet, extended). "or hold ● to speak it
  instead" isn't drawn.
- **The create forms keep a label text input** (desktop page, phone sheet): the shared Label picker
  works on saved tasks (`taskIds`); a draft-mode prop on it (tasks-owned) would let them use it.
- **Phone Month** has no frame: 3e's month form at phone size (dots, no title pills — a 52px cell
  can't hold a 16px titled pill at the phone's 12px floor).
- `tasks/RepeatMenu.tsx` (tasks-owned) got `label="Repeat"` on its menu — an accessible name, and the
  event-detail harness finds the submenu by it. `docs/log/assets/event-detail/verify.mjs` b3's last
  check now expects the split (earlier days keep their length).

## Open questions for Kai

- Planning mode's "All" is every open, unscheduled, not-Someday task. With a big imported list it is
  long (groups show 8 then "+N more"). Should All mean "due within two weeks + undated", or stay all?
- Should the free boxes start at 60 minutes instead of 90?
- A weekly / weekday rule chosen on a Saturday block: rrule doesn't count a start that the rule
  doesn't match, so the clicked Saturday drops out of a Mon–Fri series (RFC 5545 leaves it undefined;
  Google moves the block). Keep, or move the block to the first matching day?
- Title / colour / project edits on a later occurrence still change the whole series (no prompt).
  Want Google's "This event / This and following / All events" question there too?
