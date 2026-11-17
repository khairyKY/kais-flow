# v1.6.5 · Other days in the new Today look — handoff (2026-11-16)

Branch `claude/v165-other-days` (from `origin/claude/kai-bugs-1012` @ `84f13d8d`). Not merged, not released. No migration, no new colour or token; frontend only.

Kai's picks from `design-export/Other days.html`: **look A "Today's page, another day"** and **navigation A "‹ Today · picker · ›"** (as it was). ‹ ›, Tomorrow and a picked past or future day now render on Today's own page: the phone's slim rows, paper goal card, Top 3 panel and Day bar; the desktop's header, Now card, goal card, Top 3 and tasks with the rail.

## What changed
- **`OtherDay` (TodayPage.tsx) rewritten over Today's components.** `TaskRow`, `GoalCard`, `NowCard`, `DayStripView`, `BlockLine`, `PlanMenu`, `RoutineRow`, `AddTaskPill`, `DayHead`, `PhoneBar`, `PhoneDayStrip` are the same ones Today draws; the page is Today's layout with the day's data. What only Today has (Now card, rituals, Overdue, Worth a look, birthdays, spans) is left off.
- **Phone, top to bottom:** bar (**Tomorrow** / **Yesterday** + the date beside it; a far day "Tue, Nov 3 · in 8 days") → ‹ Today · picker · › (the **Today pill** shows from two days away) → *Plan tomorrow* card (Tomorrow, nothing planted, tasks waiting; Plan opens the Shut down ritual, whose seeds step plants a day's three) → the **day panel** (title line "3 blocks · first at 10:00 AM" / "1 of 3 done", the Day bar, up to 3 block lines + "+N more", "Free all day · Add a block" when empty) → goal card → Top 3 → tasks → routines.
- **Future day.** Goal + Top 3 = that date's seeds (`ritual.seeded` for_date, max 3, as before); ☆ plants / ★ unplants (Undo; a fourth is refused); the goal card has the star too. "Tomorrow's tasks · N" with an add row when empty. Routines is one row "Morning · Evening" with dots, to the Routines page. Hint under the Top 3: "Tonight's Shut down starts from these three."
- **Past day (read-only).** Goal card (done: struck, "Done 11:00 AM"), Top 3 "2 of 3 done" (the picks done that day plus a still-starred open one, **Slipped**, with **Move ▾**), Also done, Left open (**Move ▾**), the day's line (stamp + italic sentence + Open journal), routines 2/3. A finished row's ✓ still reopens (Undo); an open row's check is disabled (it would finish it today, not that day); no stars.
- **Desktop.** Title + date caption, ‹ › (Today chip on past days and from two days out, as in the design), summary line, add pill (future days), the Now card's ribbon and block list for the day (`NowCard` got a `day` prop: blocks, no now line, Calendar → on that date), the same sections as above, rail = Rituals note (+ Plan tomorrow button) or the day's line, and Routines (read-only).
- The Day bar still follows the shown day (drag onto it, swipe it — v1.6.4 F1). It is now always the day panel on another day, whatever the phone's Now/Day setting, so the drop target is always there on a future day.
- `dayView.ts`: `dayTitle` (replaces `dayHeading`) and `pastPlan` (new, tested). `TaskRow` got `fact` / `frozen` / `end`, `GoalCard` `star` / `frozen`, `DayStripView` `head` / `foot`, `DayCard` `PlanTomorrowCard`.

## Deleted (dead code)
The old `OtherDay` body and its helpers `PastRow`, `DayBlockItem`, `PhoneSection`; `dayHeading`; CSS `.tp-sec`, `.tp-ev*`, `.tp-day-rituals`, `.tp-sum` (and its parasol fade + `is-over`).

## Choices the design left open
- **Past Top 3.** There's no per-day star log, so a past day's picks = tasks done that day that kept `top3_rank`, plus open tasks still starred ("Slipped"). A task starred since will read as that day's slipped pick (comment in `pastPlan`).
- **A far day's title is the design's** ("Tue, Nov 3 · in 8 days"), also on desktop.
- **Desktop keeps Today's current look** (flat sections, not the design's rounded panels): the instruction was the same components as Today; the design's desktop panels would be a separate Today redesign.
- **Plant star on the goal card** (not in the design, which has ⋯ only): without it the first seed could only be removed in Shut down.
- Block lines in the panel list every block, task blocks included (as drawn), so a task can show in the panel and in its list; Today dedups, the design doesn't.

## Checks
- Unit: `dayView.test.ts` (dayTitle, pastPlan); today feature suite 13 files / 195 tests.
- Gate (`gate.ps1`): green. vitest 213 files / 2974 tests in each of Cairo, UTC, Los Angeles and Tokyo; lint exit 0; build exit 0; ds:check 0 new.
- Harness **`docs/log/assets/v165-other-days/verify.mjs`: 128/128** (phone + desktop, day + night): yesterday, tomorrow, an empty day, a seeded day, Plan tomorrow → Shut down, a picked date through the picker, Today-only parts absent, plant / Undo (Ctrl+Z on desktop) / fourth refused / reload, past reopen + Move ▾ + disabled checks, no sideways scroll, no page errors. It also draws the design page's look A from `design-export/Other days.html` into `design-A-*.png` next to the app's `app-*.png`.
- Re-runs against the base (`84f13d8d`) and this branch, same machine, same harness files:
  - `phone-today` 94/94 on both.
  - `today-shell` 83/84 on both: the same failure "Snooze a week → toast" (present on the base).
  - `v164-daybar` 46/46 on both (drag onto the bar and its swipe still work on Tomorrow).
  - `today-days`: on the base it stopped at 12/13 (desktop checks expect a "Planted for Tomorrow" toast, but desktop undo edits are toast-free since v1.6.x; the run then timed out). It tests the OLD other-day DOM, so I **updated it to the new look** (titles with the date beside them, Top 3 as the three, the day's blocks in the Now card, goal card as the first seed, Ctrl+Z for undo, the past day's new sections, dropped a stale `.tp-view` check): 90/90.

## Left over
- Phone "Add a block" goes to the calendar on that date (no direct create sheet from here).
- The ⋯ menu of a planted row (reachable by swipe / right-click) still has Today's own Top 3 toggle, which acts on today's star, as the old other-day rows did.
