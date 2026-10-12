---
date: 2026-10-12 19:50 UTC
session: event-detail
type: handoff
related: Kai's report 2026-10-12 (events open the rejected popup, can't repeat, lag tasks); decision 2026-10-12-1752-local-decision-kai-bugs-1012.md (event repeat model); conductor review 2026-10-12 (4 items)
---

# event-detail: handoff

Branch `claude/event-detail` (from `origin/claude/kai-bugs-1012` at eb78e567). Not merged, no PR.
Commits: `33ffb9cb` (popover + series, app) · `7b490173` (MCP + chat read series) ·
`f6ddc080` (conductor review items) · this handoff + evidence.

Kai: "events still open the same popup that I hated and redesigned, but that design was not
implemented. You cannot set the recurrence of them no matter what you do. … events are lacking a
lot of functionality compared to tasks."

**[KAI] before this ships: `npx supabase db push --include-all` (migration 0061), then deploy the
`mcp` and `chat` functions, THEN the frontend.** The client writes the new columns only when a
row repeats / has a project, so a one-off event keeps working against the old schema — but
Repeat / Project / a dragged occurrence would dead-letter until 0061 is live.

## A. Block detail — Calendar.dc.html §5, "a menu, not a form"

`features/calendar/BlockMenu.tsx` replaces `EventDetailsPanel.tsx` (deleted — it was the rejected
form; git has it). A 238px popover beside the clicked block (right, else left; clamped into the
window), and it IS the kit `ContextMenu` — extended with `header`, `width`, `label` and per-row
`hint` / `divider` / `before` (old menus unchanged: unset `divider` keeps the danger-row rule).

Rows, one list shared with the phone (`blockMenuSpec.ts`, pure, tested):

| Row | Does | Notes |
|---|---|---|
| title + 7px dot | edited in place; Enter / Esc / outside click saves | the dot opens the swatches (`ColorDots`, None clears) — Kai: colour after creation |
| 📅 "Mon, Oct 12" ▸ | the MK Date Picker (day mode, quick picks) | one occurrence of a repeat moves alone |
| 🕐 "10:30 – 11:30 · 1h" ▸ | Duration: 15m Quick · 30m Short · 1h Standard · 2h Deep · Custom… (MK Time Picker panel: start + length) | a repeat's whole series; all-day reads "All day", no picker |
| 📁 project ▸ | `ProjectPicker` | new `project_id` column; "No project" quiet |
| ↻ "Does not repeat" ▸ | Never / Daily / Weekly / Monthly — `REPEAT_RULES` now shared with the task ⋯ menu | hidden on task blocks (their task repeats) |
| From task · title, Complete / Open task (+ Replan… when missed) | task blocks | Replan… opens the calendar's Plan menu |
| Link a task… | plain one-off blocks: Focus's `TaskPicker` (now also anchors at a point) over open unplaced tasks | the block becomes the task's (type task, its schedule), one Undo |
| More ▸ | Event / Time block, Busy / Free | **deviation(2026-10-12)**: §5 drops them; one quiet row keeps them reachable |
| Unschedule ⌫ | task blocks; ⌫ works while the popover is open | |
| Delete (terra, last) / Discard | one click + Undo; on a repeat a submenu This event / All events | Discard = a block made < 10 min ago with QuickCreate's default title |

Dropped: the overlap banner (the grid's ⚠ badge says it). Right-click Edit opens the same popover.

**Phone** (`PhoneSheets.tsx` BlockSheet, Calendar Phone.dc.html 7d kept): the same rows from the
same spec as kit sheet rows; colour swatches for every block; Repeat / More / Delete-this-or-all
as ActionSheets; Time = the MK Time Picker (series-wide on a repeat). Tapping a task block still
opens its task (Kai 2026-10-03), so the task rows show only when the sheet does.

## B. Repeating events — a real series (migration 0061)

`calendar_events` + `recurrence_rule text` (RRULE body, wall clock on `app_settings.timezone`,
anchored at `starts_at`), `recurrence_exdates text[] default '{}'`, `series_id uuid → calendar_events
on delete set null`, `project_id uuid → projects on delete set null`, partial indexes on the two
uuids. RLS / trigger: 0004's `for all` policy and `set_updated_at` already cover them. DATA_MODEL
updated; `lib/types.ts` fields optional (rows cached before 0061 have none). `lib/columns.ts`
doesn't list calendar columns (select `*`).

**Expansion** — `supabase/functions/_shared/series.ts` (pure, dependency-free; rrule handed in):
the rule runs in floating wall time, each start placed on the zone by Intl (two-pass, like
`dateShortcuts.wallToIso`); all-day rows are dates in no zone. Occurrence ids
`<row id>::<start ISO>` + client-only `seriesId`. One-off rows pass through untouched; idempotent.
App wrapper `features/calendar/series.ts` (+ the row edits: withExdate, detachedCopy,
retimeSeries, rerule, findBlock).

**Every reader:** `useCalendarEvents(range?)` now returns occurrences (a grid's visible range, else
the year around today: −120d…+370d) — Today (Up next, Now, Day card), tray, widgets, Focus, Weekly
Review, Morning ritual, Plan menu, Task sheet all read it unchanged. `useCalendarRows()` = stored
rows (Activity, the `?event=` deep link — a search hit opens the series' next occurrence).
`busyOnDay` / `daysWithItems` expand internally, so every free-slot reader (Plan's next free slot,
Spread, Suggest a time, Schedule sheet, the time sheet's busy rows) counts a repeat even from the
raw cache. Desktop + phone grids expand over what they show (+ a week / a day of margin) and draw
the ↻ badge (CALENDAR-BLOCK-STATES C10, the kit `repeat` glyph). Server: MCP `today` / `calendar`
(store fetches series rows that began before the window; `ruleBetween` injected like
`nextOccurrence`) and the chat snapshot. Search SQL lists the row once (unchanged). Notify doesn't
read events.

**Writes** (`calendar/api.ts`, all through `writeRow`, so no occurrence id ever reaches the wire):
`updateEvent` on an occurrence → the series row (times stripped); `moveOrResizeEvent` /
`resizeEvent` on an occurrence → detach (exdate + one-off copy with `series_id`), both now
**return their Undo** (callers toast it; `rowMenus.moveBlockToTomorrow` too); `deleteEvent` /
`restoreEvent` on an occurrence → add / remove the exdate (so the rail drop, Today's Up next
Delete, the phone sheet all just work); new `retimeEventWithUndo` (series-wide time / length),
`setEventRepeat` (from an occurrence the series re-anchors there — the clicked block keeps its
place; earlier repeats go), `deleteSeriesWithUndo` (row + detached copies), `linkTaskWithUndo`,
`moveToDayWithUndo`. An occurrence whose row is gone writes nothing.

## C. Conductor review items (folded in, `f6ddc080`)

1. **Desktop grid on the user's zone.** FullCalendar needs a named-zone plugin; instead of
   `@fullcalendar/luxon` (new dep), `zonePlugin.ts` implements FC's `NamedTimeZoneImpl` on Intl
   (~20 lines, tested). `timeZone={useAppZone()}`; `headerDay`, `scrollTimeNear`, the slot
   right-click resolver, the range title / week number, the footer load and every clock label
   read the same zone. Verified with the device in Los Angeles and the user in Cairo. Not changed:
   the daisy stage still reads device hours (cosmetic); all-day rows dropped on the grid are still
   stored as the zone's midnight instant (pre-existing; shows right).
2. **Rail Plan ▾** — Today = `todayFor` (own time, else 09:00), Tomorrow, first thing = tomorrow
   09:00 via `moveToTomorrowWithUndo` (no block). `replan.tomorrowFirst` had no other caller —
   removed with its test lines.
3. **⋯ on rail cards** — `RowMenuButton` beside Plan ▾ (dragGuard'd).
4. **QuickCreate** — Top-3 today / Someday / All day are the kit `Toggle` (label still toggles).
   The task save path (:185–190) untouched.

## Verified

- Unit: 1551 tests green under TZ=UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo (PowerShell
  `$env:TZ`). New: `series.test.ts` (Cairo end-of-October fall-back incl. the repeated hour, LA
  PDT→PST, exdates, all-day, monthly-31st skips, idempotency, bad rule), `series.flow.test.ts` (the
  real api against an outbox-like cache: detach + Undo, This/All + Undo, series-wide edits/retime,
  repeat set/cleared, task blocks never repeat, no `::` id written), `blockMenuSpec.test.ts`,
  `zonePlugin.test.ts`, busyOnDay + MCP calendar series cases.
- `npm run lint` 0 errors, no new warnings; `npm run build` green.
- Browser: `docs/log/assets/event-detail/verify.mjs` against the mock backend (dev server from this
  worktree, `--mode mock`, http://localhost:5247), **68/68** — `results.json` + screenshots: the
  popover anchored (day + night, 1280×800 at the 125% default), every row commits (title, colour
  + None, duration, project, More ▸ Free, date), Esc closes; task block (From task, ⌫, Complete),
  Link a task; Repeat ▸ Weekly → next weeks show it with ↻; drag one occurrence of a daily series
  → only it moves, one Undo; Delete This / All + Undo; Duration on one occurrence → every day;
  phone 390×844 day + night sheet rows, Repeat, This/All; conductor items (device LA / user Cairo,
  kit switches, rail ⋯, Plan ▾ Tomorrow). The previous `cal-rail-drop/verify.mjs` r1–r4 + p1 still
  pass here; its c1 drove the deleted panel (Save button) — superseded by this harness's a2.

## Open questions for Kai

- Repeat options are the tasks' (Never / Daily / Weekly / Monthly). No "every weekday" or custom
  RRULE editor yet; an imported custom rule shows "Repeats custom" and expands correctly.
- "Does not repeat" / a new rule from a later occurrence re-anchors the series on it (earlier
  repeats vanish). The alternative is Google's "this and following" split — say if you want it.
- Linked tasks can't be linked to a repeating block (hidden), and a task block can't repeat.
- Pending-sync dashes on a repeat show on all its occurrences (the write is the one row).
