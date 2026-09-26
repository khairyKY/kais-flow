---
date: 2026-09-26T17:11Z
author: conductor (bohr)
type: test-run
topic: release-2 candidate (the daily loop)
related: DAILY-CYCLE, release-1
---

# Test run: release-2 candidate = `claude/release-2`

**Contents.**
- `claude/release-1` (acd52a7);
- Loop B (`2026-09-26-1649-loop-b-handoff.md`);
- Loop A (`2026-09-26-1705-loop-a-handoff.md`);
- the daily-cycle docs.

The frontend changes are all under `app/`: 19 files. There are **no** `supabase/` changes, no migrations and no function changes, so it needs no backend deploy of its own beyond release-1's.

## Why the conductor finished it

Both workers stopped at 13:40 UTC on an account usage limit. Their work was committed and pushed. The conductor:
- finished Loop B's last fix, evidence and handoff;
- committed Loop A's Day card;
- merged Loop B into Loop A;
- wired the Day card to the `ritual.finished` contract;
- built the section order and the fold;
- ran the whole-day evidence.

That run surfaced two UX fixes, both now shipped:
- Now prefers an open Top 3 over an event more than 30 min away;
- the ritual links show ✓ once finished.

## Gate

| Check | Result |
|---|---|
| vitest UTC / Cairo / LA / Tokyo | **53 files · 742 tests** each, all passed |
| lint | baseline only (2 errors, `ProjectsPage.tsx:23–24`) |
| build | green |
| Backend harness suites | not re-run: no `supabase/` diff vs release-1 (79 / 110 / 12 / 31 stand) |
| Route sweep (`docs/log/assets/release-2/sweep.mjs`: 20 routes × desktop/phone × day/night) | **80/80 clean** |
| Shell-fit matrix (`docs/log/assets/shell-fit/shellfit.mjs`: 5 scales × 2 viewports × 4 routes) | **40/40** |
| Whole-day flow (`docs/log/assets/loop-a/r2.mjs`) | Plan → morning ritual → Now → Done+Undo (REST) → fold → Shut down → evening seeds → Day closed → still closed at 00:30; Up next menus; Start focus → /focus; phone order. Console clean. |
| Loop B flow (`docs/log/assets/loop-b/run.json`) | seeds at 21:00 → pre-selected on a second device at 08:00 → `top3` over REST; `ritual.finished` rows |

## Status

READY, frontend only.
- **Order:** release-1 must ship first, because release-2 contains it. Once release-1's backend is deployed, release-2 can go straight in instead of release-1 (it's a superset).
- **Rollback point:** current master `fd54d42`.
