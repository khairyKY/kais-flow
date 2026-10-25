# cal-wave handoff — 2026-10-25 12:40 (Cairo)

Branch `claude/cal-wave` (worktree `.claude/worktrees/cal-wave`, based on v1.4.1). Queue items 8, 13, 18 and 19 from `D:\Coding\_claude-cloud\kais-flow-queue-2026-10-23.md`, with Kai's pick **now card A** (`design-export/Calendar extras options.html` §4, in the looks2 worktree). No colour values changed. Every write goes through the outbox (the only new writes are the existing completeTaskWithUndo / deleteEventWithUndo / Plan paths).

## 8 · The calendar fills its width

- **Root cause of Kai's blank strip:** FullCalendar sizes its tables to its box only on a *window* resize. The rail folding on its own (narrow window), the splitter and the sidebar changed the box without one, so the columns kept the old width. `CalendarGrid` now calls `updateSize()` from its ResizeObserver, once a frame.
- **Narrow windows:** the rail folds first, then the days drop.
  - The grid always keeps 320px beside the rail. A wide rail gives way to the window. Where even the narrowest rail won't fit, it folds, even if the person opened it. Its tab still opens it at that width for this visit.
  - The N-day view drops days rather than going under the 80px minimum column. Week keeps its seven and scrolls (Kai's 2026-07-21 wish).
- **The header stays on one line** (container queries on `.cal-head`). The week/daisy note goes first, then the date steps down a size, then the controls tighten. Under 380px the date reads "25–28".
- **Narrow day headers** clip with an ellipsis and drop their daisy. Before, "Wed · Today 21" wrote over the next column.

## 13 · View options (Akiflow's)

All of these are in View options and persisted with the other view options (`kf.calViewOptions`, per device):

- **Days fit the width** (Responsive): N-day and Week show as many 150px days as fit. The header reads "N days".
- **Hours fit the day** (Dynamic): the shown days' blocks set the hours, with an hour of room either side and at least 6 hours. The rows stretch to the screen with no scroll (`fitHours` in `weekFit.ts`).
- **Density** now reads Small · Medium · Large. It already worked; only the labels changed.
- **Second time zone:** a typed zone (the browser's suggestions over every Intl zone) adds a second clock in the gutter. The corner names both zones.
- **Now card** on/off.
- **Single keys:** d / 1, 2–6, w / 7, m, t, 0 and ← → - = were already bound (p7e A4) and are listed in the ? cheatsheet. No collisions were found, and nothing new was bound.

## 18 · The rail

- Order: Overdue → Today → **Scheduled** → Inbox → Lists.
- **Empty sections step aside.**
  - When everything is empty, one line reads "Nothing to plan".
  - While a block or a held row is dragged, the empty sections come back as drop targets. The grid marks the rail `data-dragging`, and they appear *after* the shown sections, so nothing moves under the pointer.
  - Lists with nothing in it leaves a quiet "Lists…" that brings back it and its scope picker. It stays once a scope is picked.
- **Scheduled:** today's open tasks with a timed block, by start, with their times.
  - A click jumps to the block (its details open, and the grid turns to its day if needed).
  - Plan ▾ reschedules it. Right-click or ⋯ → Unschedule. Dragging one onto the grid moves its block, keeping its length.
  - A block dropped on Scheduled is the soft-no.
- **Phone tray:** the same rule. Empty segments step aside, Scheduled is added, and "Nothing to plan" shows when all are empty. Tapping a Scheduled chip opens the task sheet, which has Change time and Unschedule.

## 19 · The Now card, option A

- **Code:**
  - `NowCard.tsx` and `nowCard.css`.
  - The logic is `nowNext.ts`, built on Today's `upNextEvents` / `isInProgress`. Up next = within 60 minutes. When several run at once, the one that **ends soonest** leads.
- **The clock:** it reads the one minute clock itself (`useMinuteNow`), so the page and grid never re-render on the minute.
- **Placement:**
  - Docked at the foot of the rail (sticky, with the list scrolling behind it).
  - Floating 16px in from the grid's bottom-left when the rail is folded.
  - Hidden in planning mode.
  - On the phone: a one-line strip over the grid's foot. A tap opens the card.
- **States (each one checked with a frozen clock):**
  - nothing left today;
  - next more than an hour away, as a clock time;
  - up next in N minutes;
  - ongoing with Next under it;
  - two running, with the other behind ⌄;
  - several upcoming, where one at the same minute shows its clock time;
  - folded to one line (the label folds it, remembered per device).
- **The bar:** one compositor `transform` animation from start to end, so it is smooth with no re-renders. Under reduced motion or with Effects off, it shows the minute's share instead.
- **Times and titles:** 12h/24h follows the app's clock. Arabic titles get `dir="auto"` and are right-aligned in their line.
- **Actions:**
  - The checkbox ticks the task (completeTaskWithUndo).
  - A click opens the block.
  - Join shows for an event with a link.
  - Focus shows on hover for task blocks (always on touch).

## Deviations / for Kai

- **Join:** events have no meeting-link column, and google-sync doesn't store Meet links. Join reads a link in the event's title (or `external_ref.url`). Storing `hangoutLink` in google-sync would make it real.
- **Synced settings:** the view options stay per device, as they were. Syncing them would need an `app_settings` migration, and 0083/0084 are taken by other builders.
- **Responsive resize:** crossing a day-count threshold remounts FullCalendar, so a page you paged to returns to today. Same as picking a view today.
- **Phone Lists:** the phone has no "Lists…" opener yet. With Lists empty on its default scope, its scope sheet isn't reachable there.
- **Arabic alignment:** titles are right-aligned (the brief). The drawing showed them left, next to the ring.

## Harness changes (intended behaviour changes)

- `calendar-rail`, `calendar-phone`: the section/segment lists now expect item 18's rule.
- `cal-rail-drop`, `time-slots`: their drop helpers read a rail section's box after the drag starts, because an empty section only appears then. `cal-rail-drop` r3 clicks "Lists…" first.

## Gate

- `npx tsc -b`: clean.
- `npx vitest run`: **173 files / 2369 tests**, passing in Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo (PowerShell `$env:TZ`). New: `nowNext.test.ts`, plus `fitDays` / `fitHours` in `weekFit.test.ts`, `scheduledToday` in `replan.test.ts` and Scheduled in `railDrop.test.ts`.
- `npm run lint`: **0 errors**. The 24 warnings were there before.
- `npm run build`: passed. Entry `index` 365.43 kB (gzip 117.18), was 363.82.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- `grep -c birthday_on app/src/lib/types.ts` = 1, and `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1. A duplicated block appeared in the WIP commit and was removed in `16d44936`.

**Harnesses** (mock dev server `--mode mock --host ::` on 5309, warmed, one at a time, final code):

| Harness | Result |
|---|---|
| `cal-wave` (new) | **224/224** |
| `cal-looks` | 107/107 |
| `cal-polish` | 229/229 |
| `calendar-rail` | 101/101 |
| `cal-rail-drop` | 33/33 |
| `cal-wave2` | 84/84 |
| `calendar-phone` | 180/180 |
| `time-slots` | 153/153 (alone) |
| `desktop-polish` | 150/150 |

In the sequential run, `time-slots` once timed out waiting for the "Moved · Code block" Undo toast. Alone it passed 153/153, so that was timing, not a bug.

**What the `cal-wave` harness covers:**

- Width fill at 840, 1280 and 1920 × 100, 125 and 150%, in Day, 2/4/6 days, Week and Month. Also the rail toggled, Kai's 840@125 4-day case, a window resize, and planning mode.
- The one-line header.
- Every view option.
- The rail's empty case, Scheduled, jump, Plan and Unschedule.
- All the Now card states, RTL, the bar, the actions, 12h and reduced motion.
- The phone.

**Screenshots:** `docs/log/assets/cal-wave/shots/`

- `beside-drawing.png`: the app's card states next to the options page's §4 A drawing (`drawing-now-card-A.png`).
- `n1…n18-*.png`: the card states.
- `w-*.png`: widths and scales, including `w-kai-840-125-4days.png`.
- `v*-*.png`: the view options.
- `r1/r2-*.png`: the rail.
- `p3/p4-*.png`: the phone.
