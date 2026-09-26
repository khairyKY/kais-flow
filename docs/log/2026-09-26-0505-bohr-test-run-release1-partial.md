---
date: 2026-09-26 05:05 UTC
session: bohr
type: test-run
related: T-1, T-2, T-3, release-1
supersedes: none
---

# release-1 (partial): T-1 + T-2 + T-3 + conductor docs, on `origin/master` d14962f

Integration branch `claude/release-1` at `cdc55c8`. The only conflict was comment wording in `grouping.test.ts` (T-1 vs T-2, identical code), resolved to T-2's version.

| Check | Result |
|---|---|
| `TZ=UTC npx vitest run` | 218/218 |
| `TZ=Africa/Cairo` | 218/218 |
| `TZ=America/Los_Angeles` | 218/218 (was 2 failures on master) |
| `TZ=Asia/Tokyo` | 218/218 |
| `npm run lint` | 2 errors = baseline (`ProjectsPage.tsx:23–24`) |
| `npm run build` | green; `dist/version.json` = `{"commit":"cdc55c8…"}` |

Not yet done for this batch: code review of the combined diff, a real run of the schedule shortcuts on a non-Cairo device, and Kai's OK. It will also absorb FIX-0 / FIX-2 / J-11 / FIX-6 when they land.
