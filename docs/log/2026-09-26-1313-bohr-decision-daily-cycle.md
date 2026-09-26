---
date: 2026-09-26 13:13 UTC
session: bohr
type: decision
related: docs/DAILY-CYCLE.md, release-2, release-1
supersedes: none
---

# Daily cycle decided; release-2 = "the loop"; release-1 still ships first

**Kai (2026-09-26), with a screenshot of the live calendar:**
- "are we done looping? the app is still buggy"
- "I cant right click what is in the up next section"
- "take a step back and decide the user productivity journey, what will be the cycle daily and make the app a little more focused on that"

**About the screenshot:** it is the **live** site, which still runs master's old app code (`d14962f`). Its two visible bugs are fixed in the release-1 candidate, verified in code:
- Today's column is labelled "FRI 25", with "· TODAY" one column late. On live, `CalendarGrid.tsx:292-303` reads the header date with `getUTC*`; the candidate uses `gridClock.headerDay` (J-15).
- "test" prints over the long block because live has no overlap layout (candidate: `overlapLayout.ts`, J-13).

**Decision:** the loop in `docs/DAILY-CYCLE.md` — Capture → Plan → Do → Shut down, plus the weekly review. Today becomes its home: one Day card with the next move, then actionable Top 3 and Up next, today's routines, and a quiet fold.

**Sequencing:**
1. release-1 (ready, fully gated) ships as soon as Kai runs the runbook and says "push it". It fixes what he is seeing.
2. release-2 = the loop, built now on top of release-1 by two workers on non-overlapping files:
   - **Loop A (Today):** Day card, section order and fold, actionable Top 3 / Up next (click, right-click, focus, check). This includes Kai's Up next right-click.
   - **Loop B (nav + rituals):** loop-order nav, and the evening seeds pre-filling the morning Top 3.
3. release-2 is frontend-only: no migrations, no functions. Kai only needs "push it".

**"Are we done looping?"** No. The loop runs until live is verified and Kai stops it.
