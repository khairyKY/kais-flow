---
date: 2026-10-16
session: mcp-slots (builder, worktree .claude/worktrees/mcp-slots, branch claude/mcp-slots from claude/bound-journal 6c821d2b)
type: handoff
related: 2026-10-16-1302-slots-ux-handoff.md
---

# 2026-10-16 16:20 · handoff · mcp-slots

From slots-ux's "Still open": the MCP's `edit_event` only moved a Time slot's held tasks when the slot's time changed. A repeat change, a kind change (Time block → event) or a move to all-day left them held by a day or a kind that holds none, so they were off the calendar and out of the rail. Branch `claude/mcp-slots` is pushed. Not merged, no PR. No migration.

## The rule (the app's, calendar/api), now in MCP

| Edit via `edit_event` | Held tasks | `changed` adds |
|---|---|---|
| Series re-timed | each keeps its day, at the new time | "N tasks in it moved with it" |
| Repeat set / changed / ended / null | each goes to its day's occurrence of what's left, else out | "N task(s) it held … back unscheduled" |
| kind → event (whole row) | all out, any day | same |
| kind → event (one `occurrence`) | that occurrence's tasks out | same |
| One-off moved | they go with it | "moved with it" |
| One-off (or one occurrence) to all-day | out | "back unscheduled" |

- Only the tasks that actually change are written. Each one is settled like any task write and logged: `task.scheduled` {slot_id, slot_date} or `task.unscheduled` {slot_id}, with `source: 'mcp'`.
- **Shared, not mirrored:** `occurrenceOn` moved to `supabase/functions/_shared/slots.ts`, with rrule handed in as for `_shared/series.ts`. The app's `calendar/slots.ts` `occurrenceOn` is now a thin wrapper over it (appZone + ruleBetween). The MCP calls the same function. The one-line `occ ? intoSlot : OUT_OF_SLOT` is mirrored in each, because the app and the MCP already had their own `intoSlot`.
- `delete_event` was not touched: it already let tasks go.
- `docs/MCP.md`: the `edit_event` row and the Time slots rule are updated.

## Gates

- `npx vitest run`: 162 files, **2239 tests** pass (+3 in `mcpFull.test.ts`: a series re-timed → re-ruled → not repeating; kind → event for a whole row and for one occurrence; all-day). All 3 fail on the old `tools.ts`.
- `npm run lint`: 0 errors (22 warnings, all old). `npm run build`: OK.
- CI `rehearsal.yml` on `claude/mcp-slots`, run **38906682523**: green, both jobs, on the first run.
  - mcp-full.sh: **321/321**, was 290. The 31 new checks cover the same three cases against real Postgres, with rows, `changed` and activity_log.
  - mcp-week 158, fix0-auth 85, sec2 110, notify-prune 12, fix5-search 31.

## Notes

- MCP has no "this and following" split, so `repeat` is always whole-series there. The app's split case doesn't arise.
- `edit_event` with `occurrence` + `kind: "event"` detaches that one occurrence as an event. Its tasks come out and the rest of the series keeps its own.
