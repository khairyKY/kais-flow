# P3 — Calendar & Time-Blocking

**Parity rows:** 9–11 (our own themed calendar · drag-task-to-block · optional Google mirror/push) · **Status:** see `../ROADMAP.md`

## Goal
Akiflow's signature loop — drag tasks onto YOUR calendar. Native events are first-class; Google is optional invisible plumbing. **Hard rule: never an embedded Google widget.**

## Prereqs
P1 done. (P2 not required.)

## Scope
**In (3a):** `calendar_events` table, week/day grid component, drag-task-to-block, move/resize/delete, Today day-timeline.
**In (3b — OPTIONAL, guardrail: skip unless Kai explicitly asks):** Google Calendar OAuth + `gcal-sync` (incremental pull mirror, push our blocks).
**Out:** recurring events (only recurring *tasks*, P4), attendees/invites, multiple calendars UI, any Google iframe/embed ever.

## Steps — 3a Native
1. Migration `000x_calendar`: `calendar_events` + `integrations` per `../DATA_MODEL.md`; realtime publication; RLS.
2. `features/calendar/CalendarGrid.tsx`: wrap FullCalendar (`@fullcalendar/react` + `timegrid` + `interaction`) behind our own props interface (`events`, `onCreate/onMove/onResize/onDrop`). **The wrapper is the contract** — it gets restyled or replaced with a hand-rolled grid in the design phase without touching callers. Strip FullCalendar's default look with CSS from day one (plain, neutral).
3. Week + day views; click-drag empty slot = new native event.
4. Unscheduled-tasks sidebar; drag a task onto the grid (`@dnd-kit` external drag → FullCalendar receive) → creates `calendar_events` row with `task_id`, sets the task's `scheduled_start/end`. Moving/resizing the block updates both.
5. Task cards show their scheduled block; Today gets a compact day timeline.
6. Deleting a task deletes its block (confirm dialog); deleting a block un-schedules the task (task survives).

## Steps — 3b Google (optional)
1. `[KAI]` Google Cloud project + OAuth client (Calendar scope); accept the unverified-app warning (personal use; documented in PLAN.md risks).
2. Store tokens in `integrations` via a settings connect flow (authorization-code exchange in an edge function — tokens never touch the client).
3. `gcal-sync` edge function: incremental `syncToken` pull → upsert `source='gcal'` mirror events (display read-only, visually distinct); push `source='native'` blocks to a dedicated "Kai's Flow" Google calendar (store `gcal_id`/`gcal_etag`). pg_cron every 15 min + manual refresh button. Disconnect keeps native data, removes mirrors.

## Files
`app/src/features/calendar/` (`CalendarGrid.tsx`, week/day pages, unscheduled sidebar, dnd glue) · `supabase/migrations/000x_calendar.sql` · (3b) `supabase/functions/gcal-sync/`

## Edge-function contracts
(3b only) `gcal-sync`: `{ action: 'pull'|'push'|'full' }` → `{ pulled: n, pushed: n, nextSyncToken }`; invoked by cron (pg_net) and the refresh button.

## Acceptance checklist
- [ ] Drag task → block appears <1s, persists after reload, syncs to the other device
- [ ] Move/resize updates the task's scheduled times
- [ ] Deleting a task removes its block after confirmation; deleting a block keeps the task (unscheduled)
- [ ] Grid shows correct local times (Africa/Cairo) for events stored in UTC
- [ ] Zero Google branding/iframes anywhere
- [ ] (3b) A GCal event appears mirrored ≤15 min; our block shows as busy in Google

## Verification
Manual drag/move/resize matrix on laptop + phone · reload + second-device checks · `select source, count(*) from calendar_events group by 1;` · (3b) create an event in Google → watch it mirror.

## Pitfalls
- Timezones: store UTC ISO; let FullCalendar render local; never persist local strings. DST edges: verify a block at 23:30.
- FullCalendar standard timeGrid is MIT/free — do not touch premium plugins.
- dnd-kit ↔ FullCalendar external drop needs FullCalendar's `Draggable` receive API — test on touch (phone PWA) too.
- 3b: `syncToken` can expire (410) → fall back to full re-pull; dedupe by `gcal_id`.

## Notes / deviations
_(filled during execution)_
