---
date: 2026-09-26 04:00 UTC
session: bohr (claude/inspiring-bohr-e2vhqo, cloud)
type: audit
related: FIX-PLAN FIX-0…FIX-8, K-b/K-c/K-i, B2, D2, T-1, T-2, T-3
supersedes: none
---

# Phase 0 — what already exists (conductor loop start)

## Rules layers
| Layer | Path | Read here? |
|---|---|---|
| Kai's global rules | personal CLAUDE.md (delivered as user preferences) | yes |
| Workspace rules | `D:\Coding\CLAUDE.md`, `D:\Coding\.claude\skills\SKILL.md` | **no — Kai's machine only** |
| Project rules | `CLAUDE.md`, `AGENTS.md` (Supabase deploy commands, token in gitignored `supabase/.env`) | yes |
| Launch configs | `.claude/launch.json` — dev :5195 (Kai's), audit :5199, preview :4174 | yes |
| Hooks / project skills / agents | none in repo | — |
| Auto-memory | cloud memory dir empty; local one not reachable | no |
| Notes vault | Obsidian (local); FIX-PLAN cites a vault screenshot; ROADMAP cites a 2026-09-23 vault session | **no — local only** |

## Codebase
- `app/` — React 19 + TS + Vite 8 PWA, 28 feature folders, `lib/outbox.ts` offline writes. Clean tree.
- `supabase/` — 34 migrations (0001–0034), 6 edge functions (transcribe, notify, search, chat, embed, parse-capture).
- `design-export/` — read-only pixel contract (`*.dc.html`, `SPEC.md`, `BEHAVIOR/`, `ds/`). `design/`, `docs/DESIGN_SYSTEM.md`, `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md` are superseded (banners).
- `design-integration/` — PLAN, V1-PLAN/PUNCHLIST/DISPATCH, judging registers 1–3, **FIX-PLAN.md (the live work list)**.
- Branches: `master` = `feature/botanical-integration` = `claude/inspiring-bohr-e2vhqo` = `d14962f` at session start. Old July branches `feature/context-menu-49`, `feature/day-count-views-50`, `feature/event-types-modal-47`, `fix/calendar-bugs-48` — not investigated, not touched.
- Local-only, gitignored: `akiflow-dump.json`, `akiflow-screenshots/`, `.claude/worktrees/` (343MB stale copies, audit H4). Can't see them from cloud.

## Tracker + history
- GitHub `khairyKY/kais-flow`: **0 open PRs, no CI workflows, 65 open issues all last touched ≤ 2026-07-08** — stale; several are shipped (see correction entry).
- Real work list: `design-integration/FIX-PLAN.md`. As of its 2026-09-24 status: FIX-1 shipped + live-verified by the prior session. Since then on master: `e96cdde` (auto-refresh on deploy), `3ff5c86` (S7 follow-up), `d14962f` (J-10, J-8, J-18, B2 — FIX-3 minus J-16).
- Remaining: FIX-0 security code (S1/S3/S5/S6/S9 no gate; S4 ruled yes), J-16 (needs K-b), FIX-2 calendar, FIX-4 + FIX-5 (need K-c), FIX-6 visual, FIX-7 pickers (design half is Kai's), Group C cleanups, FIX-8 re-judge.
- Still Kai-physical per FIX-PLAN: **K-b** (dead-letter console dump), **K-c** (`supabase db push` 0030–0034), **K-i** (dashboard auth settings). Unknown whether any happened after 09-24.

## Deploy path
- Frontend: push `master` → Cloudflare Workers Builds → `app/dist` static assets (`app/wrangler.jsonc`) → https://kais-flow.kaidagoat.workers.dev. No build stamp.
- Backend: manual CLI from Kai's machine only (`AGENTS.md`).
- Past incidents: generated-column write 400s (`search_tsv`, later `embedding`), stale-cached PWA during re-judge (fixed `e96cdde`).

## Baseline run (this container, UTC, from `app/`)
- `npx vitest run`: **2 failed / 202 passed** on master. Root cause: `grouping.test.ts` fixtures built in device-local time while B2 (`d14962f`) moved bucketing to Cairo days → fails on any non-Cairo machine. With `TZ=Africa/Cairo`: 204/204. → fixed as **T-1** (fixture pinned to Cairo).
- Under `TZ=America/Los_Angeles` one more test fails, before and after T-1: `lib/dateShortcuts.ts` (`scheduleToday/Tomorrow/NextWeek/ThisWeek`, `daysUntilNextMonday`) still compute on device-local days, while grouping uses Cairo days. Latent B2 gap for any device not on Cairo time → **T-2** (not fixed; changes scheduling behaviour).
- `npm run lint`: **2 errors** (`ProjectsPage.tsx:23–24`, `localUseIsMobile`, audit D2) + warnings.
- `npm run build`: green; precache 206 entries / 8.35MB; `index` 97KB + `CalendarPage` 91KB gzip.

## Limits of this environment
- Live URL blocked by the cloud network policy (proxy 403) → no live checks from here.
- No Supabase env vars and no access token → no logged-in real runs, no `db push`, no function deploys from here.

## New tickets
- **T-1** grouping test fixtures pinned to Cairo — done this session (branch `claude/inspiring-bohr-e2vhqo`).
- **T-2** schedule shortcuts on Cairo days (B2 follow-up) — open, needs a worker + K-h scope confirmation.
- **T-3** expose a build stamp (commit SHA) on the live site so "live = merged commit" is provable — open, small.
