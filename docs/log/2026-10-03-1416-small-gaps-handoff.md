---
date: 2026-10-03T14:16+03:00
session: builder Z (small gaps — Library at 150%, onboarding date chip, first-Today hint, labels, routine streak goal, retainer roll)
type: handoff
related: design-export/First Run.dc.html (9h, 9i) · design-export/SCREENS-2026-09-28-sheets.md §First run · design-export/Routines.dc.html (2a) · docs/DATA_MODEL.md (0046, 0047)
---

# Small gaps: six items, one commit each

Branch `claude/small-gaps`, cut from `origin/master` (a3a7413, v1.0.16). Not merged, not deployed. Out of bounds and untouched: `SettingsPage.tsx`, `supabase/functions/notify`, `supabase/functions/capture`, `app/native`, `.github/workflows`, `docs/ROADMAP.md`, `docs/log/INDEX.md`.

| # | Commit | What |
|---|---|---|
| 1 | `78e18b5` | Library: no sideways scroll at 150% |
| 2 | `c5d6de0` | Onboarding: the date chip opens the date picker (9h) |
| 3 | `8d31f6b` | Today: the first-visit hint (9i) |
| 4 | `a0a5061` | Labels on rows, a Label filter, `*label` in quick add |
| 5 | `6c2bb9f` | Routine streak goal: `goal_days` (0046), "12 / 30" |
| 6 | `14aa778` | Retainer reload rolls unfinished tasks forward (0047) |

Nothing was skipped.

## What changed

1. **Library at 150%** (`LibraryPage.tsx`).
   - Root cause: the reader column was a flex item with no `min-width: 0`. Its widest unbreakable run held the page wider than `.app-main-content`, which scrolled sideways. It now has `minWidth: 0`, and so do the two "add a thought" inputs.
   - That alone left the reader ~160px wide at 1280×720 / 150% (the page is 611 CSS px there: shelf 230 + list 220 + reader). At 125% (782 px) the book view was crushed too, with its title clipped and still 32px of sideways scroll.
   - So a page narrower than 880 CSS px now takes the Library's existing single-column layout (the phone's). `useIsMobile` measures `.app-main-content` with a ResizeObserver, so changing the interface size switches it live.
   - At 100% on 1280 (1038 px) the three panes stay.
2. **Onboarding date chip** (`OnboardingPage.tsx`, `firstThings.ts`).
   - The 9h chip is now a button. It opens our `DatePicker` (quick picks, month, Set time, No date), anchored under the chip on desktop and as a sheet on a phone.
   - The pick rides on its line for as long as the line still parses to the date it was picked over (`withPicked`): more title words keep it, and typing a different date takes over. No date removes the chip and keeps the cleaned title.
   - Start creates the task with the picked date.
   - The kit `Chip`'s `onClick` now receives the click event, so a picker can anchor on the chip. This is additive: existing `() => void` handlers still type-check.
3. **First-Today hint** (`firstTodayHint.ts`, `TodayPage.tsx`, `today.css`).
   - The drawing's exact copy, "↑ this card always shows your next move", in Caveat 18. It sits under the card that holds the next move:
     - phone: the NOW slip or the ritual card;
     - desktop: the Day card.
   - Finishing onboarding (Start, Skip or Import; not a Replant) sets `kf-first-today-hint:<uid>` in localStorage. Today shows the line while that flag is set, and the first pointerdown anywhere clears it.
   - The listener only exists while the line is on screen.
4. **Labels.**
   - **Rows.** Up to two labels show as the kit's bordered chip, sized to the meta line, then "+N" (`rowLabels`). This covers the shared `TaskRow` (Tasks, Project detail, Planning board) and Today's rows on phone and desktop. The goal card, done rows and someday rows don't show them.
   - **Filter.** Tasks' tools have "Label · All ▾" beside Sort, using the same `Select` popover. It lists every label once, A–Z, and narrows the list. It shows only once a label exists.
   - **Quick add.** `*label` is the star the app already shows labels with (task editor `*calls`, Library `*tag`), and `#` stays project/domain.
     - `parseCommand` pulls every `*word` out before the date parse, so `*today` stays a label.
     - It works in the command bar (preview chips; a label alone now makes a task instead of an Inbox capture), Tasks' own quick add, and onboarding's lines.
5. **Streak goal** (migration **0046**, `streaks.ts`, `api.ts`, `RoutinesPage.tsx`, `StreakTrellis.tsx`).
   - `routines.goal_days int?` (1–3650, null = no goal). Existing challenges are backfilled from their window.
   - The form's only goal field is "Challenge (optional) · N day streak" (Routines.dc.html 2a). It now writes `goal_days` alongside the window.
   - Where the streak shows:
     - the Routines row reads "🔥 12 / 30";
     - the trellis reads "12 / 30 days";
     - the Challenge card reads the goal, falling back to the window until 0046 is pushed.
   - Today's routine rows show no streak, so they're unchanged.
6. **Retainer reload** (migration **0047**).
   - `reload_retainers()` keeps the same pg_cron job (`0 0 1 * *`) and the same hardening. It still clears the checklist ticks.
   - It now also moves each active, untrashed retainer's open tasks still due before this month to the 1st, at their own Cairo time of day. The same rows move: they stay open and nothing is copied.
   - Not moved: done, cancelled, trashed, someday, undated, recurring (their rule already moves them) and this-month tasks.
   - A reminder moves by the same amount and is re-armed (`reminder_sent = false`).
   - The activity row gains `tasks_rolled`, and a trashed retainer no longer reloads.
   - `supabase/tests/retainer-reload.sql` checks all of this in one rolled-back transaction on a local stack.

**Pure logic, tested** (+1 file, +13 tests):
- `withPicked`: 3
- first-Today flag: 2
- `*labels` and `hasStructure`: 4
- `rowLabels` / `labelOptions`: 2
- `challengeDays` / `streakOfGoal`: 2

## Evidence

- **Gate** (no `app/.env.local` in this worktree, so nothing to move aside):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run` from PowerShell: **83 files / 1068 tests pass** under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo. Each run's offset was checked: 0 / −180 / 420 / −540.
  - `npm run lint`: 0 errors, 19 warnings, the same 19 as before; none is new.
  - `npm run build`: ok.
- **Browser**: `docs/log/assets/small-gaps/verify.mjs`, the task-sheet recipe, against the mocked backend (`npm run dev -- --port 5252 --strictPort --mode mock`, http://localhost:5252). **154/154 pass**, covering phone 390 and desktop 1280, day and night, with no page errors in any scene:
  - **1, Library** at 1280×720:
    - 150% and 125%: no sideways scroll on the list, note, quote and book views, and the single column shows.
    - 100%: three panes.
    - 100% → 150% live: the layout switches with no reload.
  - **2, Onboarding:**
    - The chip is a button, and a tap opens the picker titled Due date, with the line's title and tomorrow selected.
    - Picking 1 Oct then Done → "Thu, Oct 1 · 09:00". More title words keep it.
    - Start writes `due_at 2026-10-01T06:00Z` and Top 3. The undated line has no date.
    - No date → the chip goes and Start writes no date.
  - **3, Hint:**
    - Onboarding Start → Today, with the flag set. The hint's copy is the drawing's, in Caveat, under the Plan-my-day card.
    - The first tap clears the line and the flag, and after a reload it stays gone.
    - It sits under the NOW slip while a block runs.
    - Midday with no card: no hint, and a tap doesn't spend the flag.
    - An existing account never sees it.
    - Desktop: under the Day card, and a click clears it.
  - **4, Labels:**
    - Rows show "calls · admin · +1", one chip for one label, none for none. Each chip is bordered, ≤22 CSS px tall, in the meta line's own type (≥12px on a phone).
    - The Label filter lists All labels, admin, calls, home, q3. "home" narrows the list and "All labels" restores it.
    - Tasks quick add `Book the dentist *health *calls` → labels `[health, calls]`.
    - Command bar `call Omar *calls tomorrow 3pm *q3` → `*calls` and `*q3` preview chips, then labels `[calls, q3]`, due 28 Sep 15:00 Cairo. "buy milk *errands" is not "→ Inbox".
    - Today's rows (phone and desktop) show calls, admin, +1 and home.
  - **5, Routines:**
    - "Cold showers" (goal 30, 12-day streak) reads 12 / 30. "Read" (no goal) reads 3.
    - The trellis reads "12 / 30 days".
    - + Start a challenge → Plant writes `goal_days 30`, window 27 Sep–26 Oct.
    - A pre-0046 challenge (no `goal_days`) reads 6 / 14 days from its window.
- **Regression** (same server): `today-phone` **157/157** · `task-sheet` **147/147** · `desktop-polish` **150/150**, which includes Library's scroll checks at 150%.
- **Screenshots** in `docs/log/assets/small-gaps/`: `1-library-*`, `2-onboarding-*` (with `-picker`), `3-first-today-*`, `4-labels-*` (with `-filter` and `command-bar`), `5-routines-*` (with `-trellis` and `-form`). Results are in `verify-results.json`.
- The dev server is stopped.

## Deviations

- **Library**: the single column below 880 px also applies at 125% on a 1280 window, which is Kai's default size on a 1280-wide WebView. The three panes didn't fit there either: the book title was clipped and the page still scrolled sideways. The single column drops the shelf tree's Journal / Recent rows; it is the phone layout as built.
- **First-Today hint**:
  - 9i draws a "Free · nothing planned yet" NOW slip. The app has no free slip: ruling 3 and Today Phone 2c show no card at midday with nothing running.
  - Rather than invent one, the line attaches to the next-move card that exists. In that midday case on a phone it waits for the next visit that has a card (the Plan / Shut down card, or a running block).
  - **Kai to judge** whether the free slip should exist.
- **Streak goal**:
  - Only the Challenge field sets a goal; it is the one goal field drawn in 2a. An ongoing routine with a goal and no end (the older SCREENS-PART-TWO "Ongoing / Custom" select) isn't offered.
  - Routines have no edit form, so a goal can't be added later.
- **Labels**:
  - Tasks' own quick add only takes `*label`. Its placeholder promises "tomorrow 3pm #forecasting", but it has never parsed dates or `#` (it creates the raw title). That is a separate, pre-existing gap.
  - QuickCreate (calendar) keeps its own Labels field and its unparsed title.
- **Migrations** use the repo's `00NN_name.sql` numbering, not `supabase migration new`'s timestamps, as 0043/0044 did.

## Risks / not done

- **Migration numbers**:
  - Builder X's `claude/cleanup` adds `0045_ritual_reminders.sql`, so these are **0046** and **0047**. If Y adds one, renumber on merge.
  - Both must be pushed before this ships; release.yml pushes migrations before the deploy.
  - Before 0046, a challenge's routine write carries `goal_days` and would be rejected. Plain routines don't carry it.
- **SQL not executed**: there is no Postgres or Docker on this machine.
  - 0046 and 0047 were reviewed, not run.
  - `supabase/tests/retainer-reload.sql` is written for a local stack (`psql "$DB_URL" -v ON_ERROR_STOP=1 -f …`) and has not been run.
  - 0047 deliberately doesn't read `tasks.paused` (0020), because 0038 found production on an older 0020 copy and nothing in the app sets it.
- **The retainer roll uses Cairo's month**, like every clock rule in the app (B2), not `app_settings.timezone`.
- **No ROADMAP or INDEX line** (conductor).
