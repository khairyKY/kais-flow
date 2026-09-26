# Test Ledger — Kai's Flow

> Append-only (see `docs/CONDUCTOR.md` → DOCUMENTATION RULES). Update a row's state by adding a dated note, never by erasing. 🆕 = added or changed since the conductor loop started (2026-09-26).
> Columns: steps · expected · covered by (test file or "manual") · state (branch / merged / live) · last verified.

## 🆕 Test these first (check by hand on the live app)

_Nothing user-visible has changed since the loop started. The 2026-09-24 changes below are shipped but not yet re-judged by Kai on live._

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| L-1 | Open Today on a cold load (clear the tab, reopen) | A loading state first, never the "nothing here" empty garden before tasks arrive (J-10) | manual | live since `d14962f` (per FIX-PLAN flow; not verified live by this loop) | — |
| L-2 | On Tasks or Today, click a task's title; double-click a row | The task editor opens (J-8) | manual | live since `d14962f` (unverified by loop) | — |
| L-3 | Tasks page when imported repeating duplicates exist | A "tidy them →" link to Settings › Import dedupe (J-18) | manual | live since `d14962f` (unverified by loop) | — |
| L-4 | Around midnight Cairo time, look at Today / Overdue | A task due 23:00 today is in Today; 23:00 yesterday is Overdue (B2) | `features/tasks/grouping.test.ts` + manual | live since `d14962f` (unverified by loop) | 2026-09-26 unit (UTC + Cairo) |
| L-5 | Queue a change offline, let the session expire, come back online and sign in | The queued change lands; nothing is silently dropped (S7 follow-up) | manual | live since `3ff5c86` (unverified by loop) | — |
| L-6 | With the app open in a tab, deploy a new build | The tab reloads itself onto the new build within a visit/focus (`e96cdde`) | manual | live since `e96cdde` (unverified by loop) | — |

## Automated baseline

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| A-1 | `cd app && TZ=UTC npx vitest run` and `TZ=Africa/Cairo npx vitest run` | 204/204 both | all `*.test.ts` | branch `claude/inspiring-bohr-e2vhqo` (T-1) | 2026-09-26 |
| A-2 | `cd app && npm run lint` | no new errors vs baseline (2 known: `ProjectsPage.tsx:23–24`, D2) | oxlint | master | 2026-09-26 |
| A-3 | `cd app && npm run build` | tsc + vite + PWA green | build | master | 2026-09-26 |
| A-4 | `TZ=America/Los_Angeles npx vitest run` | 204/204 once T-2 lands; today 1 known failure (schedule shortcuts are device-local) | `grouping.test.ts` "stays in Next week" | open (T-2) | 2026-09-26 |

## By area
_Rows get added as each area is audited (Phase A) or changed._
