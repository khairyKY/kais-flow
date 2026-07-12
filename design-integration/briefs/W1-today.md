# W1 — Today

> Read `_SHARED.md` first. Effort: L. Anchor page — the highest-fidelity surface.

**Pixel contract:** `design-export/Today.dc.html` — options **1a** (Field Journal,
full botanical) and **1b** (iPhone, thumb-first). Both ship; 1a is desktop, 1b is the
phone-width variant. Two botanical intensities, both keep.
**Species / growth:** Terrarium = clover; the day's overall state. Assets under
`/ds/assets/clover/` incl. `four_leaf.png`. Never show a stage that contradicts the day's data.

**You own:** `app/src/features/today/**` (TodayPage, Terrarium, terrariumStore, goalStore).
**Route:** `/today` (already live — you replace the current TodayPage visuals).

**Data (reuse as-is, do not touch):** `useTasks()` (tasks/api), the Top-3 / goal-of-day
via `goalStore`, terrarium visibility via `terrariumStore`, routines + slipping readers
the current page already calls. Rebuild the view; keep every data call.

**Kit:** `SectionLabel` for the day's sections (≤4), `TapeCard` goal variant for the
gold Goal-of-the-day card (one per view), `Checkbox` for Top-3 rows, `Chip` for tags.
**Overlays:** task rows open Task detail (Enter) / Snooze (S) / Schedule — already built.
**Effects/motion:** Effects 2b time-of-day paper (root warms/cools) · Effects 2d day-complete
(petal-burst + quiet banner on the last check) · Motion 1b Today petal-fall as the last of
the Top-3 is checked · 5a checkbox bloom. Gate all via `useMotionEnabled()`; petal-fall
uses the `petalFall` keyframe (tokens/motion.css). The Terrarium is the clover growth widget.

**Empty/first-run state:** `States.dc.html` 1a (Empty Today — seedling clover + one hand
line + one "Plan today" action) and 1b (Done Today — petal pile, no action). Wire both as
real reachable states (no tasks planned / all done).

**Options to reproduce:**
- 1a — desktop Field Journal (day-phase header, goal card, Top-3, sections) → `/today`
- 1b — iPhone thumb-first layout → `/today` at phone width (≤767px)
- States 1a Empty Today, 1b Done Today → real empty/all-done states

**Done when:** 1a + 1b pixel-faithful on real tasks, day+night, empty+done states reachable,
build green, fidelity note. (See `_SHARED.md` DoD.)
