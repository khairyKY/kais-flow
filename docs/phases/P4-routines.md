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
_(filled during execution)_
