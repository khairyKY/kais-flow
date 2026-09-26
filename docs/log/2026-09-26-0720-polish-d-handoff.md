---
date: 2026-09-26 07:20 UTC
session: polish-d-worker
type: handoff
related: audit-newuser (gap table #13, #14, #16, #19, #11 Today rail, runners-up), punch 6
---

# Polish D: layouts at 125%, Up next, Today routines, Review trellis, Undo on a check · handoff

Branch `claude/polish-d` off `origin/claude/release-1` (`3f84169`). Pushed after every item. Not merged, no PR.
Screenshots: `docs/log/assets/polish-d/` (named `<item>-<surface>-<before|after>-<theme>-<viewport>.png`).

| Commit | Item |
|---|---|
| `f855f10` | 1 · Tasks tab row fits at every width (zoom-aware rail, tools wrap, tabs scroll on phone) |
| `03d0703` | 2 · Calendar week reads at 1280 (§6 narrow columns; rail folds only when the week can't fit) |
| `c9b80cd` | 3 · Today "Up next" says Now only while the event runs |
| `86947f6` | 4 · Today's routines rail counts and lists only today's routines |
| `a104bb0` | 5 · Weekly Review trellis (and its %) start on the day a routine was planted |
| `307b982` | 6 · A single check toasts "Done" with Undo; Undo takes a repeat's next copy back (punch 6) |
| (this entry) | handoff |

Every width below is measured at the **default 125% interface size** (`lib/uiScale.ts`): a 1280px window lays the page out at ~1024 CSS px.

## 1. Tasks at 1280: the Organize rail covered the tab row

**Root cause.** Two things together:
- The list/rail switch was `@media (max-width: 767px)`. Media queries read the window, and the root `zoom` doesn't shrink it. So at 1280 the fixed 288px rail kept its column and the list got ~414 CSS px.
- The tab row was one unbreakable ~640px line: six tabs with counts, Repeating and Sort. It overflowed the 414px column, and the sticky rail (painted later) covered it.

  I checked with a throwaway page: under `zoom:1.25` at a 1280 window, `@media (min-width:1200px)` matches, but a container query on a 702px box sees 702. A `position:fixed` child of a `container-type:inline-size` box stays viewport-fixed.

**Change** (`features/tasks/TasksPage.tsx`, CRLF kept):
- The rail now shows through a container query on the page's own width: `@container tasks-page (min-width: 760px)`, so the list keeps at least 472px. Below that the page is single-column, the same layout Someday, Done and phone already use.
- The tab bar is `flex-wrap: wrap-reverse`. When Repeating and Sort don't fit beside the tabs, they move to their own right-aligned line above the tabs, and the tabs stay on the bar's border.
- Only if the six tabs alone are too wide (phones) does their strip scroll sideways inside itself. The active tab is kept scrolled into view.

**Evidence** (prod build, Playwright, `elementFromPoint` at each control's centre):

| Width | Before | After |
|---|---|---|
| 1280 | All, Repeating and Sort under the rail, not clickable | single column, one line, all 8 controls clickable |
| 1440 | Sort under the rail | rail kept; tools line above the tabs; all clickable |
| 1600 | OK | OK (one line, as `Tasks.dc.html` 1a) |
| 390 | Someday, Done, All, Repeating and Sort off-screen; the main column panned sideways (`scrollWidth > clientWidth`) | tools on their own line; every tab reachable in its strip; no sideways pan |

- Both themes were checked, and the BulkBar still centres on the list (anchor positioning inside the container).
- Shots: `1-tasks-before-day-{d1280,d1440,p390}`, `1-tasks-after-{day,night}-{d1280,d1440,d1600,p390}`.

## 2. Calendar week at 1280 showed 2 of 7 days

**Root cause.**
- The grid wrapper kept every day column at ≥170 CSS px (`minWidth: 58 + days*170`).
- The Unscheduled rail kept its 244px beside it.
- Measured before, fully visible days: **2 at 1280, 2 at 1440, 3 at 1600.**

**What the export implies, and what I chose.** `design-export/CALENDAR.md` §6: *"Narrow column (< 170px): short-tier type scale, start time only. Width never changes what the block is."*
- So 170 is where a column turns narrow. It is not a floor.
- `Calendar.dc.html` 1a keeps the 244px rail on desktop. Its own 1300px artboard would give a week ~102px columns beside that rail.
- At 1280 on 125% even that doesn't fit, so I chose **both** mechanisms, in this order:
  1. **Columns** shrink to `MIN_COL_W = 80` and draw §6's narrow tier: the overlap tier's 11px one-line title and the start time only. Below 80 the grid still scrolls sideways (Kai 2026-07-21: scroll rather than crush).
  2. **The rail folds only where the visible days can't keep 80px beside it.** At 125% that is 1280 and 1440 (week view). It never folds in Day or Month, never on phones (they keep 1b's rail-above-grid), and not at 1600.
     - Folded, it's a 34px strip: the sidebar's own round `›` button (`.kf-collapse-btn` look) and the rail's mono label, "UNSCHEDULED · N", read upward.
     - Open, a `‹` on the divider folds it.
     - An explicit show/hide is remembered per device (`kf.calRailFolded`).
- `weekFit.ts` is pure and holds the arithmetic, with 10 tests. `CalendarGrid.tsx` and `.css` stay CRLF.

**Evidence** (fully visible days / column width in visual px):

| Width | Before | After |
|---|---|---|
| 1280 | 2 / 212 | **7 / 100**, rail folded |
| 1440 | 2 / 212 | **7 / 123**, rail folded |
| 1600 | 3 / 212 | **7 / 107**, rail open |
| 390 | day view, 1 / 233 | unchanged |

- Interaction run at 1280:
  1. Auto-folded.
  2. **Show** opens the rail; the grid scrolls at 80px, so 4 days are fully visible.
  3. `‹` folds it again.
  4. After a reload the choice sticks.
  5. The Day view keeps the rail open.
- Dragging a rail card onto the grid after unfolding still schedules it: toast shown, Undo removes the block. Both themes were checked, with no page overflow.
- Shots: `2-calendar-before-day-{d1280,d1440,d1600}`, `2-calendar-after-{day,night}-{d1280,d1440,d1600,p390}`, `2-calendar-after-day-d1280-rail-open`, `…-dayview`.

## 3. Today "Up next" called a 10:00 event "Now" at 08:38

**Root cause.** `EventRow` labelled the **first** event of the day "Now" (`first ? 'Now' : clock`), whatever the time.

**Change.**
- `features/today/upNext.ts` is pure: "Now" while `start ≤ now < end`, otherwise the start time in the export's style ("1:00 PM", `Today.dc.html` 1a/1b), in Cairo time. The row styles Now in terra and a time faint, as drawn.
- The code had no "in 1h 22m" style. The export has it only in an Overlays reminder ("in 15m"), so I used the time style.
- The row re-reads the clock every minute.
- 6 tests, green under UTC, Africa/Cairo and America/Los_Angeles.

**Evidence** (Cairo 09:45):
- Before: "**Now** | Morning walk 7:00–7:30" and "9:00 AM | Standup (running)".
- After: "7:00 AM | Morning walk" and "**Now** | Standup".
- Playwright's clock fast-forwarded on the open page: Now left the standup at 10:00 and moved to Deep work at 11:30, with no reload.
- Shots: `3-upnext-before-day-d1280`, `3-upnext-after-{day,night}-{d1280,p390}`.

## 4. Today's routine count ignored schedules

**Change.**
- `streaks.ts` gets `routinesForToday()`: active, and scheduled today or already checked off today. `todayTally()` now counts exactly that list, so there is one definition.
- Today's rail header uses `todayTally` and its rows use `routinesForToday`.
- On a day when every routine rests, it reads "nothing on repeat today ✿" instead of the first-routine invite.
- +3 tests.

**Evidence** (Saturday):
- Before: "Routines · **1/5**", with Mon/Wed/Fri Swim and Sunday-only Plan the week listed.
- After: "Routines · **1/3**": Stretch, Water herbs ✓, Journal pages.
- The Routines page says "1 of 3 tended" in both runs.
- Shots: `4-routines-rail-before-day-d1280`, `4-routines-rail-after-{day,night}-{d1280,p390}`, `4-routines-page-after-d1280`.

## 5. Weekly Review trellis showed pre-planting days as misses

**Change.**
- `WeeklyReviewPage.tsx` (CRLF kept) passes `routineStartKey(r.created_at, dates)` to `computeTrellisDays`.
- It also passes it to `completionRate`, which now takes the same optional `since`. Without it the % beside the cells kept counting those days as misses. Only the review calls `completionRate`.
- +1 test.

**Evidence** ("Journal pages", planted Sep 23, tended Sep 23–25):
- Before: 3 grew / **26 missed** / 10%.
- After: 3 grew / 0 missed / 27 off / **75%**.
- Routines that existed all month are unchanged: Plan the week has 4 real misses, Stretch 23.
- Shots: `5-review-trellis-before-day-d1600`, `5-review-trellis-after-{day,night}-d1600`, `…-after-day-p390`.

## 6. Undo on a single task completion (punch 6)

**How completion spawns the next copy.** `completeTask` marks the row done. If it has a `recurrence_rule` and a `due_at`, it writes the next occurrence as a new task row (rrule `after(due)`). The existing undos (Evening ritual, project bulk complete) only flipped the status back. The new row stayed, so check → undo → check left two copies of next Tuesday.

**Change.**
- `features/tasks/completion.ts` is pure:
  - `planCompletion`: the done row, plus the next occurrence.
  - `planUndo`: puts status, completed_at and top3 back on the task's **current** row, and removes the spawned occurrence unless the user has since edited or ticked it.
  - Removal is a hard delete through the outbox. The copy never should have existed, so it doesn't go to Trash.
  - A completion never spawns a second copy of an occurrence that is already open. This covers reopen → complete again, even after a reload.
- **Found and fixed on the way:**
  - The spawn copied an imported row's `external_ref`, which is unique per user + source + id (0027).
  - Completing an imported task that Import's "tidy them" tool gave a repeat therefore 409'd, and the next occurrence was dead-lettered ("One change couldn't be saved").
  - I reproduced this on the local stack before the fix. Now the spawn drops the key.
- `api.ts` (CRLF kept):
  - `completeTask` returns `CompletionUndo`.
  - New `undoCompletion`.
  - New `completeTaskWithUndo`: `toastUndo('Done', …)`, the same `lib/undo` + `ToastHost` path bulk complete uses. The copy is the export's: `BEHAVIOR/PAGE_BEHAVIORS.md`, "Check → check pop (3b) + toast 'Done — Undo'".
  - "Reopen" right after a check in the same session runs the same undo.
- Wired:
  - Today: row checkbox, goal checkbox, row menu, the Up next checkbox and the `x` key.
  - Tasks: row, menu and `x`.
  - TaskRow's default, so project pages get it too.
  - Bulk complete on Today and Tasks now carries the same Undo.
  - The Evening ritual and project bulk undos use `undoCompletion`.
- Tasks: an Undo that lands while the row is sliding out cancels its exit (`lib/motion.ts` `cancelRowRemoval`: the fill-forward animations are cancelled and the inline styles cleared).
- The check, "just now ✿" and the loose petal still play.
- +18 tests: `completion.test.ts` (table simulation) and `api.completion.test.ts` (writes, activity and toast through mocked outbox/queryClient).

**Evidence.** Prod build on the local stack, Cairo, desktop day and phone night. Each database row below was read back over REST with the user's own JWT.

| Flow | Before | After |
|---|---|---|
| Tasks: check "Call the dentist" (Top 3) | no toast | toast **"Done · Undo"**; grace row shows "just now ✿" + petal |
| …Undo pressed mid-collapse (row h=34, opacity 0) | n/a | row back at h=70, opacity 1, unchecked; DB `todo`, `completed_at` null, **top3 true** again |
| Tasks: check recurring "Water the plants" | no toast; DB: done Sat 26 + todo Tue 29 | toast; DB: done + todo Tue 29 → **Undo → only the original, `todo`** |
| Today: check imported repeat "Weekly team report" | **409** on `/rest/v1/tasks`, "One change couldn't be saved"; spawn missing | spawn lands (Oct 3); Undo → only the original, `todo` |
| Tasks: check recurring, then Reopen from "Done today" (✓) | DB keeps **2 open rows** (orig + Tue 29) | DB: only the original, `todo` |
| Today, phone 390, night: check + Undo | no toast | toast above the tab bar; Undo → DB `todo` |

- Console: only the known `api.open-meteo.com` failures, plus `net::ERR_ABORTED` on assets that a navigation or the service-worker precache cut off mid-load. No app errors.
- Shots: `6-undo-before-{tasks-check-toast,today-check-toast}-d1280` (the latter shows the dead-letter toast), and `6-undo-after-{tasks-check-toast,tasks-after-undo,tasks-recurring-toast,today-check-toast}-d1280`, `6-undo-after-today-phone-night-toast`.

## Automated checks (HEAD `307b982`, from `app/`)

- `TZ=UTC npx vitest run`: **Test Files 33 passed (33) · Tests 339 passed (339)**. Baseline was 29 / 301.
- `TZ=Africa/Cairo npx vitest run`: **Test Files 33 passed (33) · Tests 339 passed (339)**.
- New tests, 38 in all:
  - `weekFit.test.ts` (10)
  - `upNext.test.ts` (6)
  - `streaks.test.ts` +4
  - `completion.test.ts` (11)
  - `api.completion.test.ts` (7)
- `npm run lint`: **2 errors**, the baseline `features/projects/ProjectsPage.tsx:23–24`, and 30 warnings. Both counts are the same as on the base.
- `npm run build` (tsc -b + vite + PWA): green.
- Bundle, gzip:
  - Entry `index-*.js` 97,400 → 97,789 B (+389 B: shared `streaks` / `tasks/api` / `motion`).
  - CalendarPage +967 B, TasksPage +435 B, TodayPage +197 B.

## Real-run setup

- Shared local stack at `http://127.0.0.1:54321`. It was not reset or stopped.
- `app/.env.local` is gitignored.
- Account `polish-d@example.com`, seeded over REST with its own JWT (RLS applies):
  - 11 tasks, including one recurring (Sat/Tue) and one imported repeat carrying `external_ref`.
  - 9 events: one that ended today, one running now, one later today, and the rest of the week.
  - 5 routines on mixed weekdays, one planted three days ago, plus completions.
- Two preview servers: `vite preview` of this branch on :5234, and the base build on :5235 for "before".
- Playwright used Chromium 1194, `timezoneId: Africa/Cairo` and `reducedMotion: 'no-preference'` (so the check/exit animations run as for a normal user).
- The scripts (adapted from the conductor's `smoke.mjs`) stay in my scratchpad: `seed.mjs`, `layout.mjs`, `calrail.mjs`, `caldrag.mjs`, `today.mjs`, `tick.mjs`, `routinesHero.mjs`, `review.mjs`, `undo.mjs`.
- Both servers were stopped at the end.

## Taste calls for Kai

1. **Tasks, narrower than ~760 CSS px of page** (≤ ~1350px windows at 125%; ~1080px at 100%): the Organize rail hides and the page goes single-column. The alternative was to keep a narrower rail beside a ~414px list, which would have needed the tabs to scroll at 1280.
2. **Tasks at 1440**: Repeating and Sort sit on their own right-aligned line above the tabs. **Phone**: the six tabs scroll sideways in their own strip. 1b shows four tabs without counts; with six tabs plus counts at 125% they can't fit in 280 CSS px.
3. **Calendar columns** now go down to 80px with the §6 narrow tier before the grid scrolls, instead of holding 170px.
4. **Calendar rail auto-fold** at 1280/1440. The folded look is a 34px strip with the round `›` and a vertical "UNSCHEDULED · N". Other options: never auto-fold (keep the rail and scroll), or put the rail above the grid as on phone (costs ~350px of height on a laptop).
5. **Up next** keeps listing events that already ended today, now labelled with their start time. Should ended events drop off or dim? The export only draws the running and future rows.
6. **Today routines rail** lists only today's routines. On an all-resting day it shows "nothing on repeat today ✿" (my copy, echoing "nothing on repeat yet — plant one ✿").
7. **Undo toast copy** is "Done" (export). Bulk reads "N tasks completed." with Undo.
8. **Undo and immediate Reopen hard-delete** the spawned next occurrence (it never reaches Trash).
9. **Reopen after a reload** leaves the next occurrence (there's no persisted link to it), but completing again won't add a second copy.

## Found, not fixed (outside this brief)

- **Recurring reminders don't carry over.**
  - The next occurrence inherits the completed task's `reminder_at` (already past) and `reminder_sent: true`. The notify sweep (`reminder_sent = false`) never fires it.
  - This was true before this branch. `planCompletion` is now the one place to fix it: shift `reminder_at` by `next − due` and reset `reminder_sent`. The notify edge function is server-side, so it needs a decision and a live check.
- **Today: a second click on a just-checked row re-runs completion.** `useBloomCheck` keeps the bloom "checked" and ignores the next value.
  - With this branch the second click no longer spawns a duplicate, but it toasts "Done" again.
  - Making the second click reopen would be the natural fix.
- **Tasks: the live checkbox petal (`.tr-petal-live`) never renders.** Completion clears `top3` before the re-render. The done row's "just now ✿" + petal does render. This was true before this branch.
- **Other completions still without Undo**: the Calendar block checkbox, Focus "Done — check it off", the task editor, and the Planning board bulk. Punch 6's other actions (snooze, schedule, delete…) are also still open.
- **Weekly Review "Routine consistency" card**: at 1280 and 390 the 30-cell rows are crushed to ~1px cells, before and after this branch. They are visible at 1600.
- **The 125% default applies on phones too**: a 390px phone lays out 312 CSS px. That's why six tabs can't fit. `index.html` and `uiScale` are shared, so this is a product call, not mine.

## Not done here

- No ROADMAP, TEST-LEDGER, phase-Notes or `INDEX.md` edits; the brief limited me to the listed files plus this entry.
- Suggested ledger rows:
  - "Tasks tab row at 1280/1440/390 at 125%"
  - "Calendar week 7/7 at 1280 at 125%, rail fold/unfold"
  - "Up next Now = running event"
  - "Today routines = today's"
  - "Review trellis since"
  - "Check → Done · Undo; recurring undo leaves no copy"
