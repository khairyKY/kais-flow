---
date: 2026-10-03T06:41+03:00
session: builder V (Plan my day fixes, Kai's feedback 2026-10-03)
type: handoff
related: docs/log/2026-09-28-1744-rituals-handoff.md · design-export/SCREENS-2026-09-28.md §Plan my day rulings 3–6
---

# Plan my day: pick from every task in place, and times without the ✓

Branch `claude/plan-fixes`, cut from `c1b3446` (claude/decisions). Not merged, not deployed.

Kai's feedback:
- He pressed Begin and not all of his tasks were there.
- Picking one meant leaving the sheet through a shortcut.
- He couldn't search.
- The ✓ after each suggested time confused him.

## What changed (`app/src/features/rituals/`)

- **Pick your 3 searches every open task, in place.**
  - A kit input (`.rt-input`, `type="search"`, "Search all tasks…") sits at the top of the section. It is hidden only when there are no open tasks at all (6f).
  - The search filters every open task: title matches first, then project-name matches. Every word must match, case-insensitive.
  - Results are the same kit rows with the star. Starring a result picks it right there, and a 4th star shows the same swap toast.
  - A carried task is found too. It renders with its own DOM id (`rt-found-<id>`), so the Carry-over row keeps `rt-<id>`.
  - No match shows one quiet line: `No open task matches "…".`
  - **Esc clears the search first** (an `useEscapeStack` entry while the query is non-empty). The next Esc goes to the sheet as before. Android Back follows the same stack.
  - **`/` focuses the search on desktop.** It is ignored when focus is already in a field, while the Time Picker is open, and on a phone.
  - Nothing autofocuses, so on a phone the keyboard stays down until the field is tapped.
- **"Show all N open tasks"** is a quiet `rt-link` expander under the suggestions, shown when there are more open tasks than suggestions; it toggles to "Show fewer".
  - Order: the suggestions, then every other open task by due date (none last).
  - N counts open tasks outside Carry-over, because carried rows are already listed above.
  - So every overdue task (Carry-over) and every due-today task (suggestions, or one tap away) is reachable without leaving Plan.
- **The "All tasks >" link that left the sheet is removed.**
- **Suggested times have no ✓.**
  - Each pick has one pill. It is dashed while the time is our suggestion (`.is-suggested`) and solid sage once you set it through the Time Picker (`.is-set`). A booked block counts as set.
  - "No time" (the picker's footer ghost) and "no free slot" keep the secondary "Pick one".
  - A plain line sits above the timeline: "Times are suggestions — tap one to change it. Start the day puts them on your calendar."
  - The legend reads Calendar · Suggested · Set by you.
- **Start the day** places every pick that has a time, suggested or set (`toPlace`). "No time", "no free slot" and an already-booked pick are left alone.
- **The footer status counts suggested times as timed.** Example: "3 picked · 2 timed" once one pick is set to No time.
- **Pure helpers in `ritualLogic.ts`, tested:**
  - `searchOpen(tasks, projects, suggested, query)`
  - `toPlace(slots)`
  - `planStatus(carry, slots)`, which now takes the slots instead of two counts.
- **CSS:** `.rt-ok` is gone. Added `.rt-search`, `.rt-more`, `.rt-hint` and `.rt-pill.is-suggested`. `.is-accepted` is renamed `.is-set`.

Unchanged write paths:
- Carry-over choices.
- Drop → Trash + Undo.
- Inbox File/Dismiss.
- Seeds pre-selection.
- The goal (first pick).
- Top 3 via `top3Diff`.
- Step logging and `ritual.finished`.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 71 files / 963 tests pass under each of UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo. `ritualLogic.test.ts` now has 33 tests: the footer test was reworked and the search and placement tests are new.
  - `npm run lint`: 0 errors, 19 warnings, none in rituals.
  - `npm run build`: ok. `dist/` was deleted afterwards.
- **Browser** (`docs/log/assets/rituals/verify.mjs`, extended, mocked backend on `http://localhost:5248`): **207/207** (the base harness had 155). Results are in `docs/log/assets/plan-fixes/verify-results.json`.
  - **6s, phone 390×844 touch, day + night.** The scene adds three tasks (`more: true`): a car licence with no date, a Finance bill, and an invoice due today. Checks:
    - The search does not take focus on open.
    - No "All tasks" link.
    - "Show all 7 open tasks". Every open task, overdue and due today included, is then in the sheet. "Show fewer" folds it back.
    - "licence" finds a task that isn't a suggestion. Starring it picks it in place: 3/3, a dashed pill, "3 picked · 3 timed".
    - "finance" matches by project.
    - A 4th star from the results shows the swap toast. Swap puts the bill in, takes the licence out, and the goal stays first.
    - "review" finds the carried task with no duplicate id.
    - "dentist" shows the quiet line.
    - Esc clears the search and the sheet stays.
    - phoneBasics: no horizontal scroll, no text under 12px, controls ≥ 40, no page errors.
  - **6t, desktop 1280, day + night:**
    - Not focused on open.
    - `/` focuses the search and types nothing.
    - Type, then star.
    - Esc clears the search, and a second Esc closes the panel.
    - Reopening keeps the searched pick.
  - **6c/6d/6l (reworked):**
    - No `.rt-ok` or Accept button.
    - Three dashed pills.
    - The explaining line and legend; "3 picked · 3 timed".
    - Picker → 14:00 turns that pill solid (dashed, dashed, solid).
    - No time → "Pick one" and "3 picked · 2 timed".
    - After the Swap, the plants pick is set to No time.
    - **Start the day writes exactly 2 blocks:** audit 10:30–12:30 and tyre 12:30, both untouched suggestions. Nothing is written for the No-time pick.
  - **6a:** the footer now reads "2 picked · 2 timed".
  - The rest of the harness (6b, 6e, 6f, 6j, 6m, 6k, 6h, all of Shut down) passes unchanged.
  - Screenshots in `docs/log/assets/plan-fixes/`:
    - `6s-search-{day,night}`
    - `6s-search-day-all`
    - `6d-day` (dashed + solid pills)
    - `6t-desktop-search-{day,night}`
    - `6a-day`
  - The old `docs/log/assets/rituals/*.png` frames were left as they were (they still show the ✓).
- The dev server is stopped, and no node processes are left from this worktree.

## Deviations / decisions

- **When the Suggested times step logs.** It logs once every pick's time is yours: set, No time, or already booked. Before, it logged when every pick was ✓-accepted. Untouched suggestions don't log the step mid-plan, so a plan closed half-way still reads "2 of 4 done". Start the day logs all four as before.
- **Search scope.**
  - The search covers *every* open task: someday tasks and carried ones included.
  - "Show all" leaves carried rows out, because they're listed just above.
- **"Show all N" vs the suggestions.** N counts open tasks outside Carry-over, so the number can be lower than Tasks' total.
- **Carried rows found by the search** are a second row for the same task, with id `rt-found-<id>`. Starring one there also sets its Carry-over choice to Today (ruling 3, unchanged).
- **`type="search"`.** On desktop Chrome it shows its native clear ✕ on hover/focus. That is not a kit control.

## Risks / not done

- **A booked pick's pill is solid.** Tapping it opens the picker, but a new time doesn't move the existing block. This is pre-existing behaviour (`suggestTimes` keeps booked first).
- **Desktop Day card copy unchanged:** "Plan your day · ~5 min" / "Begin".
- **Not checked on hardware:** the soft keyboard over the full-height sheet while searching.
- **This worktree's `app/node_modules` was installed for the gate and deleted afterwards** to save disk. Run `npm ci` (about 15s) before re-running anything here.
- No `docs/ROADMAP.md` or `docs/log/INDEX.md` edits.
