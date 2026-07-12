# W2 — Tasks

> Read `_SHARED.md` first. Effort: L. **You also own the shared TaskRow** (W1/W3 import it).

**Pixel contract:** `design-export/Tasks.dc.html` — options **1a** (Desktop: list +
right-rail sticky notes), **1b** (iPhone: list + filter chips), **2a** (Done: fallen
petals; check → fade + petal drop), **2b** (Someday: quiet shelf), **2c** (iPhone Done:
petals falling). All ship.
**Species / growth:** Cherry blossom = tasks by completion — `bud` (not started) ·
`opening` (in motion) · `bloom` (waiting) · `fallen` (done, petal falls). Assets
`/ds/assets/cherry/`.

**You own:** `app/src/features/tasks/**` **and** `app/src/features/tasks/TaskRow.tsx`
(the shared row primitive — build it first from Tasks.dc.html + DS §04 task-row spec;
W1 Today and W3 Planning import it, so land it early and keep its props stable).

**Route:** `/tasks` (live; smart-list filters `?list=today|week|month|upcoming|someday`
already wired by the shell's Plan drawer).

**Data (reuse as-is):** `tasks/api.ts` (~15 mutations via `writeRow`), pure logic
`grouping.ts` / `taskDisplay.ts` / `listShortcuts.ts` (reuse verbatim). Done = completion
filter; Someday = `list=someday`.

**Kit:** `Checkbox` (bloom) in TaskRow, `Chip` for status/priority/project tags,
`SectionLabel` for list groups, `Button` for the compose CTA.
**Overlays:** Snooze (S), Schedule (1·2·3), Project picker (P), Priority (!·!!·!!!),
Task detail (Enter expands), Bulk bar (multi-select, X toggles) — all built; rewire.
**Effects/motion:** Motion 3b task-complete (box fills, check pops, strike draws, row dips) ·
5a checkbox bloom · Tasks 2a Done petal-drop on check · 3e list breathing (rows grow in /
slide out, list heals) · Effects 2k boundary resistance on overscroll. Gate via `useMotionEnabled()`.

**Options to reproduce:**
- 1a — desktop list + sticky-note right rail → `/tasks`
- 1b — iPhone list + filter chips → `/tasks` phone width
- 2a — Done (fallen petals) → completed filter
- 2b — Someday (quiet shelf) → `?list=someday`
- 2c — iPhone Done → phone width, completed

**Done when:** all 5 options pixel-faithful on real tasks, shared TaskRow landed with
stable props, day+night, mobile variants, build green, fidelity note. (See `_SHARED.md` DoD.)
