---
date: 2026-10-12 18:42 UTC
session: fix-backend (builder, branch claude/fix-backend off claude/kai-bugs-1012)
type: handoff
related: the 2026-10-12 whole-app review (server/notification drift); 2026-10-12-1752-local-decision-kai-bugs-1012.md (the Top 3 rule)
---

# fix-backend — server and notifications back in line with the app

Branch `claude/fix-backend` (pushed, not merged, no PR). Migration **0062** (`0062_notify_drift.sql`).
Edge functions changed: **notify, chat, mcp** (deploy all three after `db push`).

## What changed, by finding

| # | Finding | Fix |
|---|---|---|
| 1 | Hourly "Overdue" push nobody could turn off (0006 `overdue-sweep`; counted Trash + someday; instant compare) | 0062 unschedules `overdue-sweep`; `notify` drops the kind and `overdueNotice`; the morning digest ends "N overdue." — open, not someday, not in Trash, due date (else block) before the user's day (`.or(due_at.lt.<day start>, and(due_at.is.null, scheduled_start.lt.<day start>))`, a head count so the 1000-row cap can't truncate it) |
| 2 | Routine "Reminder" never sent | New kind **`routine`**: `notify/routine.ts` (pure: `routineDueOn`, `routinesDueAt`) + `copy.ts routineNotice` ("Stretch — 07:30" · Open → /routines; several = one notice; private "A routine — 07:30"); 0062 adds `app_settings.routine_on` + pg_cron `routine-reminder-sweep` (`*/5`). Due = active, `clock_time` set, cadence weekday of the reminder's own day on the user's clock (a 23:58 reminder on the 00:00 tick is yesterday's), no `routine_completions` row that day. Quiet hours / pause / lock-screen names via `deliver`. History row `notify.routine`. Local planner (`plan.ts`) plans the same for Windows/Android. Settings → Notifications shows it from the kinds registry (`kinds.ts`) — no SettingsPage edit |
| 3 | Digest used stale Top 3 (`top3=true order by created_at`) | `_shared/today.ts` (`isTop3Today`, `todaysTop3`, `isOverdue`) restates `features/tasks/top3Rule.ts`; digest = picks by the rule, `top3_rank` first, unranked oldest first — in `notify` and in `plan.ts` (judged at the digest's own moment, so an Android plan 3 days ahead is right per day). chat: same + prompt "Top 3 today (the first is the goal of the day)"; the snapshot's ★ only on today's picks |
| 4 | MCP today/top3 | `dayTasks` SQL: not someday, + undated picks, picks ordered first (a 500-row overdue pile can't push them out); `splitToday` uses the rule + rank; `top3Count(todayEnd)` counts only today's picks. `add_task` top3 + later due → today at its own time. `move_to_tomorrow`: reminder shifted by the due delta, re-armed if in the future (carryReminder); blocks follow replanMoves date-only (latest block on tomorrow kept, others soft-deleted + `calendar_event.deleted` logged; schedule follows the kept block / cleared). `tools.ts` uses `_shared/zone.ts` (its own DEFAULT_ZONE/userZone + day math moved there; re-exported). The `calendar` tool's code is untouched |
| 5 | Evening nudge counted someday | `someday=false` in notify and plan.ts |
| 6 | `do_resurface` picked cancelled | 0062 `create or replace` = 0059's body with `status = 'todo'`; revoke re-applied |
| 7 | chat `tomorrow + 86_400_000` | `dayStart(now, tz, 2)`; `dayStart` itself is now `_shared/zone.ts`'s `wallToInstant` |
| 8 | Stale Top 3 flags | 0062 clears `top3`/`top3_rank` where `top3` and (someday, Trash, status ≠ todo, or day > owner's today; zone from `app_settings.timezone`, Cairo when unset or unknown to `pg_timezone_names`). Flags only |
| 9 | Client notifications | `actions.ts`: a failed task read → toast "Couldn't reach that task just now" + Try again (re-runs the press). `api.ts`: re-subscribe reuses the stored row id looked up by endpoint |
| 10 | Realtime | `areas` + `time_entries` subscribed; `projects`/`areas`/`domains` in `TRASHED_TABLES`. Both tables were already in the publication (0010, 0020); 0062 adds whichever is missing (prod once ran an older 0020) |
| 11 | Docs | ROADMAP current-phase + P6 row (struck + dated), changelog lines for v1.0.22–v1.0.28 + this branch; DATA_MODEL (0052 repair, mcp_keys 0051, +20 boost removed by 0059, ai_usage `vision` + real limits from quota.ts, UTC-day exceptions, tables without `updated_at`, `books`, 0062 note, the full pg_cron list, `notify.routine`, `routine_on`); MCP.md Today/Top 3/Tomorrow rules; P6 acceptance notes + Notes entry; planMath glossary "This weekend" |

`dayBounds` (notify/ritual.ts) now delegates to the shared `dayWindow` — the nudge's "today" is right on a DST day too. `plan.ts`'s `wallTimes` uses `wallToInstant` per day key for the same reason.

## Files outside my area (each a minimal call-site / registry change)

- `app/src/lib/types.ts` — `AppSettings.routine_on?` (one line; the Settings row keys `${kind}_on`).
- `app/src/features/tray/TrayBridge.ts` — `planFor` passes cached `routines` / `routine_completions` to `localPlan`; Android replans when either changes (two lines + the type import).
- `app/src/features/activity/describe.ts` — a `notify.routine` history row gets the routine glyph and Open → /routines instead of being drawn as a morning digest.
- `app/src/features/tasks/planMath.ts` — the "This weekend" glossary line (allowed one-line copy fix).
- `supabase/tests/fix0-auth.sh` — `routine` added to the "a user may not send this kind" loop.

## Verification

- `npx vitest run` (app): **1556 passed / 127 files** (was 1530 / 125) under `TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo (PowerShell `$env:TZ`). New/extended: `notifications/today.test.ts` (server Top 3 rule, row-for-row against the app's `isTop3Today`), `notifications/routine.test.ts` (cadence, check-off, tick window, midnight, Tokyo), `plan.test.ts` (digest by the rule + overdue, nudge someday, routine planning), `copy.test.ts`, `actions.test.ts` (failed read → Try again), `push.test.ts` (id reuse), `settings/mcp.test.ts` (today/top3Count/add_task/move_to_tomorrow/tomorrowMoves), `chat/chatPrompt.test.ts` (25-hour tomorrow, goal line).
- `npm run lint`: 0 errors (warnings unchanged). `npx tsc -b` clean. `npm run build`: green.
- **0062 on PGlite** (no Docker): `docs/log/assets/fix-backend/0062-pglite-check.mjs` → `0062-pglite-check.txt`, **11/11 PASS**, run twice (idempotent): overdue job gone, routine job `*/5` with kind routine, `routine_on` default true, picks kept/cleared per owner zone (Cairo, LA, no settings row, unknown zone), finished goal keeps its rank, cancelled never resurfaced, publication has areas + time_entries. pg_cron/net/vault are stand-ins there.

**Not verified:** `deno check` (Deno isn't installed on this machine — the edge-function entry files `notify/index.ts`, `chat/index.ts`, `mcp/index.ts` were not type-checked; their pure halves are, through the app's tsc + vitest). The Docker harness suites (`supabase/tests/*.sh`, incl. `fix0-auth.sh`, whose digest-body expectations were already stale before this branch) were not run. No live run: nothing deployed, no real push sent, no browser pass (no visible UI change beyond one Settings row + one glossary line).

## For the conductor / Kai

- Release order matters: **`db push` (0062) before the frontend** — the Settings row writes `routine_on` with the whole settings row, which PostgREST rejects until the column exists. Then deploy `notify`, `chat`, `mcp`.
- 0062's data step clears stars on tasks starred before the Top 3 rule and later moved/parked/binned/cancelled. Non-destructive (flags only); a wrongly cleared pick is one tap to re-star. Worth a line in the release note.
- `routine-reminder-sweep` adds one function call every 5 minutes (≈8.6k/month), well inside the free tier.
- Conflict watch: the other builder's `calendar` tool + 0061 — my `tools.ts` changes are elsewhere in the file (top helpers moved to `_shared/zone.ts`, re-exported under the same names); `DATA_MODEL.md` both append after the 0060 bullet — keep both.
- Left alone (out of scope, noted): chat's open-task snapshot doesn't exclude someday tasks; a routine notification has no "Done" button (would need a routine action in actions.ts); the routine sweep reads every reminding routine's owner in one query (PostgREST's 1000-row cap — `ponytail:` note in notify/index.ts).
