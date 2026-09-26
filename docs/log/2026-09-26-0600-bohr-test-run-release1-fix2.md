---
date: 2026-09-26 06:00 UTC
session: bohr
type: test-run
related: FIX-2, J-13, J-15, J-11, T-1, T-2, T-3, release-1
supersedes: none
---

# release-1 now holds T-1, T-2, T-3, J-11, FIX-2

**FIX-2 review (conductor):**
- Real change is 82 lines in `CalendarGrid.tsx`, plus pure `overlapLayout.ts` and `gridClock.ts` (15 tests), `StackMorePopover.tsx` (Float-based) and CSS.
- The worker had rewritten `CalendarGrid.tsx` from CRLF to LF (~1,100-line diff noise). Restored to CRLF in the batch.
- J-15's real root cause (day headers read local-midnight Dates with UTC getters → every label one day back in Cairo) is well-evidenced.
- Bonus fix: "Show weekends" off crashed the page (new array every render → infinite update loop).
- Verdict: OK.

**Batch checks at the CRLF-restore commit:**

| Check | Result |
|---|---|
| vitest UTC / Cairo / Los Angeles | 259/259 each |
| lint | 2 errors (baseline) |
| build | green |

**Real run** (production build via `vite preview`, local stack, user `fix2@example.com`, browser timezone Africa/Cairo, desktop 1280 + phone 390):
- `/calendar`: header "SAT · TODAY 26", now-line under today, grid opens ≈06:30 (now 08:35), pair side by side, trio shingled, 4+ → "+2 more".
- `/today` renders.
- Console: only the known open-meteo tunnel errors.
- Screenshot: `docs/log/assets/release-1/desktop-calendar-cairo.png`.

**Open FIX-2 questions for Kai's re-judge** (from the handoff `2026-09-26-0532-fix2-handoff.md`):
1. `+N more` replaces the top block's title (per the export).
2. A dropped block can vanish into `+N more` as the 4th overlap.
3. Phone: the grid is ~211px tall under the stacked rail; the now-line starts behind the tab bar.
4. Safari (`:has()`) untested.
5. A tab left open over midnight stays on yesterday until Today is pressed.
