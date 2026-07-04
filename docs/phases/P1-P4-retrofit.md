# Retrofit — Areas, Per-Task Reminders & Notification History

**Parity rows:** 33–34, 39 (areas entity · per-task reminders · in-app notification history — routines schema expansion, row 35, is NOT in this batch, see note below) · **Status:** see `../ROADMAP.md`

> This is not a numbered phase — it is retrofit debt against two already-shipped phases (P1, P4), scheduled as its own session ahead of P6 per `docs/PLAN_ADDENDUM.md` §3, §4, §9 and the 2026-07-04 decision changelog entry in `../ROADMAP.md`. P1/P4 are marked "done" but were validated against Kai's real life after shipping and found short three ways. Source of every schema/behavior detail below: `../PLAN_ADDENDUM.md` §3 (areas), §4 (reminders), §9 (notification history) — read those sections for full rationale; this file is the executable distillation.

**Note on scope:** PLAN_ADDENDUM.md §5 (routines schema expansion — `any_time`, `scheduled_time`, per-routine `notify` toggle) and §6/§10 (Settings UI, external capture endpoint) are explicitly OUT of this batch — not part of Kai's "build next" decision, stay parked in the addendum. Don't build them opportunistically just because adjacent files are being touched — stay in scope.

## Goal
Close the three retrofit gaps Kai explicitly asked to prioritize ahead of P6: a real `areas` container entity (ongoing, no end date, no milestones — his IT-admin work, warehouse pain points at the family business), per-task reminders independent of due date, and a persistent in-app notification/capture history feed. All three directly address Kai's stated pain point: he forgets planning/reminder steps most of the time.

## Prereqs
P1 done (domains/projects/tasks, `activity_log` + `logActivity()` helper). P4 done (`notify` edge function, pg_cron + pg_net wiring, Slipping view, `push_subscriptions`). P2 done (`parse-capture` contract, to extend with the new optional output field).

## Scope
**In:**
- `areas` entity: table, CRUD feature slice, `tasks.area_id`, rename/merge parity with domains.
- Slipping extended to cover `areas` (decided, not optional — see Steps §3).
- Per-task reminders: `tasks.reminder_at`, `parse-capture`'s new optional `reminder_offset_min` output, a `notify` sweep of kind `task_reminder`.
- In-app notification/capture history: `features/notifications/` reading `activity_log`, bell icon + unread badge.

**Out (do NOT build in this batch):**
- Routines schema expansion (`any_time`/`scheduled_time`/per-routine `notify` toggle) — addendum §5, not selected for this batch.
- Settings UI, external Android capture endpoint — addendum §6/§10, P6 additions, stay in P6's own scope.
- Diabetes/glucose or any health tracking — explicitly parked indefinitely; do not add anything to the data model or any doc for this.
- Books/CRM/content/journal/anything P7 — untouched.

## Steps
1. **Migration `0010_areas`:**
   - New table `areas`: `domain_id uuid FK`, `name text`, `description text?`, `color text?`, `sort_order int` — plus universal columns (`id`, `user_id` default `auth.uid()`, `created_at`, `updated_at` w/ `set_updated_at()` trigger), RLS `user_id = auth.uid()`.
   - `alter table tasks add column area_id uuid references areas(id)` — nullable; a task belongs to a project, an area, or neither (bare domain-level), never both project and area simultaneously (client-enforced, not a DB constraint — same philosophy as Top-3's client-only cap in P1).
   - Add `areas` to the `supabase_realtime` publication.
   - Index `(domain_id)` on `areas`, matching the `projects` pattern.
2. **Areas CRUD** (`features/areas/`): list/create/rename/recolor/reorder under a domain; **merge area A into B** (re-point tasks, delete A) — same cheap-restructuring affordance P1 built for domains (Jerad's lesson #1). Own nav entry or nested under domains (implementer's call, consistent with how projects are surfaced).
3. **Extend `slipping` view to cover `areas`** (decided this session — no longer an open question): modify the `slipping` view (originally P4, `0005_routines.sql`) to union in `areas` rows using the identical last-`activity_log`-touch-vs-threshold logic already applied to `domains`/`projects`. Slipping sidebar (Today) and Weekly Review's slipping list both already render whatever the view returns — no new UI code needed here beyond confirming an `entity_type = 'area'` row renders sensibly (label/link to the area). "Reviewed" action (`logActivity('entity.reviewed', …)`) must work identically for an area row.
4. **Migration `0011_reminders`:**
   - `alter table tasks add column reminder_at timestamptz` — nullable; no forced default, no silent auto-reminder (per addendum §4 — this was explicitly *not* committed to as a decision).
   - `alter table tasks add column reminder_sent bool default false` — pick this over an `activity_log`-check per addendum §4's "either is fine, pick whichever is less schema" — a flag column is simpler to sweep against with an indexed query than scanning `activity_log` per task on every cron tick.
5. **`parse-capture` extension** (P2's edge function, additive only): output schema gains optional `reminder_offset_min?: number` (e.g. 5 for "5 minutes before"). Client capture pipeline (`features/capture/`) resolves this to an absolute `reminder_at` from the task's `due_at`/`scheduled_start` at write time (if neither exists, drop the offset — nothing to offset from — leave `reminder_at` null). Update the shared Zod schema (`features/capture/parseSchema.ts`, mirrored in the edge function) and the system prompt to mention the new field with the same "prefer null over guessing" discipline as every other optional field.
6. **`notify` retrofit** (P4's edge function, additive): new `kind: 'task_reminder'`. New pg_cron schedule (e.g. `*/5 * * * *`) calling `notify` (or a dedicated sweep the function performs internally when invoked on this schedule) → query `tasks where reminder_at <= now() and reminder_at > now() - interval '10 minutes' and reminder_sent = false and status != 'done'` → push to `push_subscriptions` → mark `reminder_sent = true` → `logActivity('task.reminder_sent', 'task', task.id, {...})`.
7. **Notification history** (`features/notifications/`, P4 retrofit, reuses `activity_log` — no new table beyond what step 4 adds):
   - A page/panel reading `activity_log` filtered to a curated allow-list of user-facing `event_type`s: `capture.autofiled`, `task.reminder_sent`, `notify.sent` (if that event type doesn't already exist, add a `logActivity('notify.sent', …)` call inside `notify` itself for digest/nudge sends — check first, don't duplicate), `routine.checked`, `entity.reviewed`. Hide noisy internal events (e.g. plain CRUD `*.created`/`*.updated` on domains/projects/areas — those aren't "notifications").
   - Bell icon + unread badge: count of allow-listed events with `created_at > app_settings.notifications_last_seen_at`. Add `app_settings.notifications_last_seen_at timestamptz?` column (one new column, per addendum §9's stated preference over localStorage, since `app_settings` already exists and is the natural home for this kind of single-row user state).
   - Opening the panel updates `notifications_last_seen_at` to `now()`.

## Files
`app/src/features/{areas,notifications}/` · `app/src/features/capture/parseSchema.ts` (extend) · `app/src/features/tasks/` (reminder field on task form/detail) · `supabase/functions/parse-capture/index.ts` (extend) · `supabase/functions/notify/index.ts` (extend) · `supabase/migrations/0010_areas.sql` · `supabase/migrations/0011_reminders.sql` · `supabase/migrations/0012_notification_history.sql` (or fold the `app_settings` column into 0011 if smaller — implementer's call) · `../DATA_MODEL.md` (update §P1 areas/reminders block, §P4 notify/slipping block — after migrations land, not before)

## Edge-function contracts
- `parse-capture`: existing contract (P2) gains one optional output field, `reminder_offset_min?: number`. No request-shape change.
- `notify`: existing contract (P4) gains `{ kind: 'task_reminder' }` as a valid request kind (or is invoked with no body on the new cron schedule if the sweep is self-contained — match whichever pattern the existing `morning_digest`/`evening_nudge`/`overdue` kinds already use); response shape unchanged (`{ sent, pruned }`), extended with a count of reminders sent if useful.

## Acceptance checklist
- [ ] Creating an area under a domain, then a task under that area, both persist and sync across two windows
- [ ] Merging area A into area B re-points all of A's tasks to B and deletes A, nothing orphaned
- [ ] An area untouched (no `activity_log` events) past the Slipping threshold appears in the Slipping sidebar/Weekly Review alongside stale domains/projects; "reviewed" clears it
- [ ] A task with `reminder_at` 5 minutes in the future triggers a push within one cron tick, sets `reminder_sent = true`, and logs `task.reminder_sent`
- [ ] A capture like "call the dentist, remind me 10 min before" resolves `reminder_offset_min` into a correct absolute `reminder_at` once a due/scheduled time exists; with no due/scheduled time, no `reminder_at` is silently invented
- [ ] Notification history panel shows autofiled captures, reminders sent, routine checks, reviewed entities — and nothing noisier (no raw CRUD events)
- [ ] Bell badge count reflects events since last-viewed and clears on open
- [ ] Vitest passes for any new pure logic (Slipping union query is SQL-only — no unit test needed beyond a direct SQL check; reminder-offset resolution is a good candidate for a unit test since it's client-side date math)

## Verification
`npx vitest run` · two-window sync check for areas · seed an old area's fake `activity_log` timestamp to confirm it surfaces in Slipping · set a task's `reminder_at` a few minutes out, wait for the cron tick (or invoke `notify` manually with the same payload the cron sends), confirm push + `activity_log` row · `select event_type, count(*) from activity_log where event_type = any(array[...allow-list...]) group by 1;` to sanity-check the notification-history filter · manual click-through of the notifications panel + bell badge.

## Pitfalls
- Don't let `tasks.area_id` and `tasks.project_id` both get set by the UI at once — client-side guard, not a DB constraint (matches the project's existing "don't fight the outbox with DB constraints" philosophy from P1).
- The Slipping view is not realtime (views aren't in logical replication, `activity_log` itself is deliberately excluded from realtime per the P4 Notes) — it already polls every 60s; the areas union doesn't change that, just confirm the union doesn't break the existing poll/optimistic-clear pattern.
- Reminder cron sweep must not re-notify: the `reminder_sent` flag is the whole guard — double check the window logic (`> now() - interval '10 minutes'`) doesn't skip tasks if the cron itself is briefly delayed, and doesn't re-fire for tasks whose reminder time has long passed and were correctly never sent (e.g. app was offline) — decide and document the "stale reminder" behavior (silently mark sent without pushing, vs. still push late) rather than leaving it ambiguous.
- `parse-capture`'s new field must fail soft: if Groq omits `reminder_offset_min` or returns nonsense, Zod validation must not reject the whole parse — treat it as absent, same "prefer null over guessing" discipline as every other optional field.
- Notification-history allow-list will drift as new `event_type`s get added in future phases — leave a one-line comment in the code pointing back to this list so future phases remember to extend it (P7 will add `journal.created`, `interaction.logged`, etc.).

## Notes / deviations
_(filled during execution)_
