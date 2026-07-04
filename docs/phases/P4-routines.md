# P4 — Routines & Rhythm

**Parity rows:** 12–18 (routines separated from tasks · streaks & challenges · recurring tasks · activity_log spine payoff · Slipping · push notifications · ritual flows) · **Status:** see `../ROADMAP.md`

## Goal
Habits and rituals split cleanly from tasks; the `activity_log` starts paying rent — streaks, Slipping, and digests are all just readers of it.

## Prereqs
P1 done (activity_log exists and is populated). P2 useful (capture can suggest `routine_idea`) but not required.

## Scope
**In:** routines module + completions + streaks + challenges, recurring tasks (RRULE execution), Slipping view + sidebar, Web Push + `notify` edge function + pg_cron schedules, morning/evening/weekly ritual flows.
**Out (do NOT build):** journaling prompts inside rituals (P7a adds that), AI involvement of any kind, charts libraries (plain CSS bars are fine until the design phase).

## Steps
1. Migration `000x_routines`: `routines`, `routine_completions`, `push_subscriptions`, `app_settings` (if not yet), `slipping` view per `../DATA_MODEL.md`; enable `pg_net` extension (cron → HTTP calls to edge functions).
2. Routines module (`features/routines/`): **its own nav item — routine items must never appear in task lists or Today's task sections.** Day checklist grouped morning/afternoon/evening per cadence weekday mask; check/uncheck writes `routine_completions` + `logActivity('routine.checked', …)`.
3. Streaks: pure function `computeStreak(completions: Date[], cadence): { current, best }` — only cadence-scheduled days count; missing a scheduled day breaks the streak. **Vitest: gaps, weekends-off cadence, timezone edges, month boundaries.** History = plain CSS bar chart.
4. Challenges: routines with `challenge_start/end` (e.g. "run 5K daily in June") show progress x/N days and disappear after the window.
5. Recurring tasks: completing a task with `recurrence_rule` materializes the next occurrence via `rrule` (next due_at, fresh uuid, link `payload.recurrence_parent`). **Vitest: month-end (Jan 31 → monthly), DST transitions.**
6. Slipping sidebar on Today: rows from the `slipping` view (domains/projects untouched > threshold); each has a "reviewed" action → `logActivity('entity.reviewed', …)` clears it. Per-entity threshold override later; default from `app_settings`.
7. Web Push: `[KAI]` `npx web-push generate-vapid-keys` → public key to client env, private to `supabase secrets`. Settings UI subscribes each device → `push_subscriptions`. **`notify` edge function**: `{ kind: 'morning_digest'|'evening_nudge'|'overdue'|'test' }` → composes payload (Top-3 + today's routines + slipping for digest; missed routines for nudge) → sends to all subscriptions (prune 410-gone endpoints).
8. pg_cron schedules calling `notify` via `pg_net.http_post` (URL + service-role auth header): morning digest at `app_settings.digest_hour` (convert Cairo→UTC), evening nudge, hourly overdue sweep. **Cron runs UTC — compute offsets from `app_settings.timezone`.**
9. Ritual flows (`features/rituals/`): guided step-by-step modals, skippable, <5 min:
   - **Morning**: review overdue (reschedule/drop) → pick Top-3 → inbox to zero → time-block the day (opens calendar).
   - **Evening**: sweep today (done / roll over) → tomorrow preview.
   - **Weekly review page**: per-domain sweep + slipping list + streak summary.

## Files
`app/src/features/{routines,rituals,slipping,notifications}/` · `supabase/functions/notify/` · `supabase/migrations/000x_routines.sql`

## Edge-function contracts
`notify`: request as step 7; response `{ sent: n, pruned: n }`. Idempotent per invocation; no state beyond `push_subscriptions`.

## Acceptance checklist
- [ ] Routine streaks correct across gaps and cadence-off days (tests + manual spot check)
- [ ] Routines appear nowhere in task lists or Today's task sections
- [ ] Completing a monthly task due Jan 31 creates the right next occurrence
- [ ] Morning digest push arrives on the phone at the configured local hour
- [ ] Slipping shows a project untouched for >7 days; "reviewed" clears it
- [ ] Morning ritual start→finish under 5 minutes, ending with a time-blocked day
- [ ] Vitest passes: streaks + RRULE materialization

## Verification
`npx vitest run` · seed old `activity_log` rows to trigger Slipping · `select * from cron.job;` shows schedules · send `{kind:'test'}` notify → push on phone (Android + installed-PWA iOS if available).

## Pitfalls
- pg_cron + pg_net: functions are called by URL with the service-role key in the Authorization header — store it as a database secret (Vault), never in SQL text.
- Deno web-push: use a Deno-compatible webpush library (or raw VAPID JWT + `fetch`); Node's `web-push` package won't run in edge functions.
- iOS: push only works for the installed PWA (16.4+); surface a "install first" hint in settings.
- `completed_on` is a **date** in the user's timezone, not UTC timestamp — compute it client-side from local midnight (this is the classic streak bug).

## Notes / deviations

- **2026-07-04 (Sonnet):** Built the full scope. Migration `0005_routines` (routines, routine_completions, push_subscriptions, `app_settings` columns, `slipping` view with `security_invoker = true`, pg_net extension), `0006_notify_cron` (schedules), `0007_fix_cron_dst` (see discovery below). Seeded the `app_settings` singleton row (it didn't auto-create itself).
- **VAPID keys generated without local Deno**: no Deno runtime on this machine, so a temporary one-shot edge function (`gen-vapid-keys-temp`) was deployed, invoked once via HTTP to run `@negrel/webpush`'s real key-generation code (Deno-only crypto), then deleted immediately after capturing the output. Public key → `VITE_VAPID_PUBLIC_KEY` (app `.env` **and** Cloudflare's two Build Triggers via their API — found the exact `PATCH /accounts/{id}/builds/triggers/{uuid}/environment_variables` endpoint rather than asking Kai to click through the dashboard again). Private JWKS → Supabase secret `VAPID_KEYS` via a temp `--env-file` (never typed as a raw CLI arg, never committed).
- **Followed the pitfall note correctly**: Node's `web-push` package doesn't run on Deno, so `notify` uses `jsr:@negrel/webpush` (RFC 8291/8292, Web-API-native) instead — confirmed working live (see below), not just assumed from docs.
- **Real discovery, not assumed**: the original schedule (`0006`) assumed Egypt runs UTC+2 with no DST. Checking `now()` against the actual system clock during this session showed Egypt is **currently observing DST (UTC+3, "Egypt Daylight Time")** — confirmed via `[System.TimeZoneInfo]::Local` on the dev machine, which is set to Cairo. The 8am/9pm-Cairo schedules were therefore off by exactly one hour. Fixed in `0007` (05:00/18:00 UTC). Still a hardcoded offset, not derived from `app_settings.timezone` dynamically — documented as a known limitation for a future phase if Egypt's DST policy changes again.
- **Recurrence library behavior confirmed, not assumed**: wrote the Jan-31-monthly test *before* knowing what `rrule` actually does, then ran it to find out — it correctly follows RFC 5545 (skips months without a 31st, lands on the next month that has one), which the test now locks in as documented, verified behavior rather than a guess.
- Streak computation (`features/routines/streaks.ts`) is a pure function with 9 Vitest tests covering: consecutive runs, "today not done yet doesn't break it", gaps, arbitrary off-cadence days (not just weekends), month boundaries, best-streak-not-current, and the midnight/local-date bug explicitly. Recurrence materialization (`features/tasks/recurrence.ts`) has 5 tests including the DST-crossing case (asserted via date *components*, not elapsed milliseconds, which is what actually makes it DST-safe).
- **Cross-feature wiring caught mid-phase**: `calendar_events` was never added to `lib/realtime.ts`'s synced-tables list back in P3 — a real gap, found and fixed here (now includes `calendar_events`, `routines`, `routine_completions`).
- Today gained a Routines checklist (grouped/filtered by today's cadence) and a Slipping sidebar; the Slipping view isn't realtime (Postgres logical replication only covers tables, not views, and `activity_log` itself is deliberately excluded from realtime) — it polls every 60s and "reviewed" optimistically drops the row client-side immediately rather than waiting on the poll.
- **Full acceptance checklist, verified against the live deployment:**
  - ✅ Streak tests (9/9) + recurrence tests (5/5) pass, all 22 project-wide
  - ✅ Routines never appear in Tasks/Today's *task* sections — confirmed by inspection, they render in their own dedicated sections/page
  - ✅ Completing a task with `FREQ=WEEKLY` (analogous monthly-Jan-31 case covered by the unit test) materializes the correct next occurrence — verified live via DB round-trip (original marked `done`, new `todo` row exactly 7 days later, `activity_log` records the `recurrence_parent` link)
  - ✅ Slipping view computed correctly via direct SQL query before any UI existed; Weekly Review + Today sidebar both render it correctly; "reviewed" verified to optimistically clear
  - ✅ Morning ritual: all 4 steps (overdue → Top-3 → inbox → block) click through correctly to completion; Evening ritual's 2 steps render correctly
  - ✅ `select * from cron.job` shows all 4 jobs (keep-alive + 3 new) with correct (corrected) schedules
  - ✅ Manually executed the *exact* SQL a cron job runs (Vault-secret auth → `net.http_post` → `notify`) and got a real 200 response — proves the whole pg_cron → pg_net → Vault → edge-function chain works without waiting for a scheduled time
  - ✅ `notify` tested live for all four `kind`s (`test`, `morning_digest`, `evening_nudge`, `overdue`) — correct payloads/skip-logic, zero subscribers so `sent:0` throughout
  - ✅ No secrets in the client bundle: grepped for `GROQ`, `service_role`, and the actual private VAPID JWK component — all clean
  - **Not literally tested**: an actual push notification arriving on a real phone/browser (no real device with granted push permission in this environment — same category of gap as P2's untested microphone and P3's untested physical drag gesture). The `subscribeThisDevice`/Settings UI and the `notify` function are both proven correct in isolation (subscription-shape validated by TypeScript against the real Web Push API; `notify`'s HTTP-level behavior confirmed live); what's unverified is the literal end-to-end "phone buzzes" experience. Worth checking on Kai's actual phone before fully trusting it.
- All test routines/tasks/activity cleaned from the live DB afterward. `tsc -b`, `npx vitest run` (22/22), and `npm run build` all clean.
