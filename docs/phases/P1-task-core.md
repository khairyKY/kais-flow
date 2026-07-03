# P1 — Task Core (+ the Sync Engine)

**Parity rows:** 1–5 (universal inbox · command bar [local NLP; AI arrives P2] · domains→projects→tasks · Today/Top-3 · snooze/labels/priority) · **Status:** see `../ROADMAP.md`

## Goal
Kai can run his task life in the app, offline-safe, with live cross-device sync proven.

## Prereqs
P0 done (deployed app + auth + migrations pipeline).

## Scope
**In:** sync plumbing (persister + outbox + realtime), domains/projects/tasks CRUD, Inbox with manual triage, Today view + Top-3, `Ctrl+K` command bar with `chrono-node`, snooze/labels/priority, `activity_log` + `logActivity()` helper.
**Out (do NOT build):** AI parsing (P2), voice (P2), calendar/time-blocking (P3), routines (P4), recurrence execution (P4 — the column exists, ignore it).

## Steps
1. **Sync plumbing first** in `app/src/lib/`:
   - TanStack Query + IndexedDB persister (`idb-keyval`) → offline reads.
   - `outbox.ts`: queue of `{id, table, op: 'upsert'|'delete', payload, queuedAt}` persisted in IndexedDB. Mutations apply optimistically to the query cache AND enqueue. Flusher runs on `online` event + 30s interval + post-mutation; upserts by `id` (idempotent). Conflict policy: last-write-wins by flush order (single user — document, don't engineer).
   - Realtime: subscribe to postgres_changes on synced tables → invalidate affected queries.
2. Migration `0002_task_core`: tables below + RLS + `set_updated_at` triggers + indexes + add tables to `supabase_realtime` publication.
3. `logActivity(eventType, entityType, entityId, payload?)` helper — writes `activity_log` through the outbox. Call it from every mutation hook.
4. Domains & projects CRUD (`features/domains/`, `features/projects/`): create/rename/recolor/reorder; **merge domain A into B** (re-point children, delete A) and re-parent projects — Jerad's lesson: restructuring must be cheap.
5. Tasks (`features/tasks/`): CRUD, complete/uncomplete, snooze (hidden from Today until `snoozed_until`), labels, priority, Top-3 toggle (client-enforced max 3 — replacing prompts which to drop).
6. Today view (`features/today/`): Top-3 section, then due-or-scheduled-today, then overdue rollover. This page is home.
7. Inbox (`features/inbox/`): list `pending` items; triage = file→task (picker for domain/project + due) or dismiss. Manual only this phase.
8. Command bar (`features/command-bar/`): global `Ctrl+K` overlay. Free text; `chrono-node` parses dates/times inline; `#token` fuzzy-matches domain/project; live preview chips of the parse; `Enter` creates the task (or inbox item if text-only). Unit-test the parse wrapper (Vitest).

## Files
`app/src/lib/{queryClient,outbox,realtime,activity}.ts` · `app/src/features/{domains,projects,tasks,today,inbox,command-bar}/` · `supabase/migrations/0002_task_core.sql`

## Migration sketch
Columns per `../DATA_MODEL.md` (§P1): `domains`, `projects`, `tasks`, `inbox_items`, `activity_log` — all with universal columns, RLS `user_id = auth.uid()`, updated_at triggers; indexes `(status, due_at)`, `(domain_id)`, partial on `top3`; `alter publication supabase_realtime add table domains, projects, tasks, inbox_items;`.

## Edge functions
None this phase.

## Acceptance checklist
- [ ] `Ctrl+K` → "call Omar tomorrow 3pm #shaheen" → task under the right project with correct due date, visible in Today (tomorrow)
- [ ] Two browser windows: change in one appears in the other in <2s
- [ ] Airplane mode: create/edit/complete tasks → UI stays responsive → reconnect → server matches
- [ ] Snoozed task vanishes from Today until its date
- [ ] Domain merge re-points all projects/tasks, nothing orphaned
- [ ] Every mutation lands one row in `activity_log`
- [ ] Vitest passes for command-bar parse + outbox flush

## Verification
`cd app && npx vitest run` · manual checks above (use devtools offline toggle + a second window) · `select event_type, count(*) from activity_log group by 1;` in Supabase SQL editor.

## Pitfalls
- Realtime silently no-ops if tables aren't in the publication (and check replica identity if update payloads look empty).
- Don't let a stale cached row overwrite a newer server row on flush: rely on server `updated_at` trigger and refetch-on-invalidate; never merge fields client-side.
- `chrono-node` returns local-time Dates — convert to UTC ISO before storing.
- Keep Top-3 enforcement client-side only (no DB constraint — it would fight the outbox).

## Notes / deviations
_(filled during execution)_
