---
date: 2026-10-12 17:52 UTC
session: local (kai-bugs-1012)
type: decision
related: Kai's bug report 2026-10-12 (Top 3, bulk T, events, routines, journal, rail drop, Plan → Today)
---

# Kai's 2026-10-12 bug report — intake and the decisions taken

Kai, in chat: a moved Top 3 pick keeps its slot; select 3 + `T` does nothing; events still open
the popup he redesigned, can't repeat, can't be recoloured; routines (and other things) can't be
edited after creation; the journal's "Talk it out" / "+ Photo" do nothing; a rail task vanished
after Plan → Today; an event dragged onto the rail is refused with a wiggle. Then: "do everything,
and also review, because I feel like there are fixes made in the past that drifted from the entire
project and are not 100% polished."

Base: `origin/master` = v1.0.28 (`366ac69`). The laptop's main checkout was on `claude/wave-r`,
147 commits behind; its uncommitted files were left untouched (none of it is lost: `mcp/` is an
older copy of master's, `retrieval.ts` is on master; the `realtime.ts` `time_entries` line and the
`launch.json` `kais-flow-integ` entry are the only local-only edits).

## Root causes (verified in code)

| Report | Cause |
|---|---|
| Moved pick keeps its slot | No date-changing write cleared `tasks.top3`; the 3-cap counted every flag in the raw cache (incl. moved, someday, Trash); Today drew any flagged row regardless of date |
| Select + `T` dead | Keys acted only on the arrow-key-focused row; a mouse selection focuses nothing. Key match was case/layout-sensitive. No bulk Top 3 anywhere |
| Event popup | `design-export/Calendar.dc.html` §5 "Block detail — a menu, not a form" was never planned or built; `EventDetailsPanel` is the rejected modal |
| Event repeat | `calendar_events` has no recurrence column (cut in P3, never revisited) |
| Event colour | Saves, but `CalendarGrid` paints colour only in `eventDidMount`, which FullCalendar doesn't re-run → no repaint until reload |
| Routines not editable | No update function, create-only form |
| Edit-after-create pattern | Six `update*` functions exist with no callers (notes, quotes, area colour, project target date/engagement, area merge) + several fields create-only |
| Journal Talk / Photo | Plain `<span>`s copied from the mock; schema (`transcript`, `media_paths`) unused |
| Event → rail refused | `handleDragToRail` returns false for anything without `task_id`; sections never consulted |
| Plan → Today vanish | **Not reproduced** — that exact path is a no-op in code. Asked Kai which menu/item |

## Decisions (conductor, per the standing 2026-09-26 delegation)

| Topic | Decision | Why |
|---|---|---|
| Which picks keep a Top 3 place (`features/tasks/top3Rule.ts`) | Kept: dated today or earlier, or undated. Released: moved to a later day, someday, Trash, cancelled. Enforced once in `writeRow`; read by the cap, Today, the rail and the Today list | The Top 3 is today's. Yesterday's unfinished pick stays so the morning ritual can offer it again (existing `loopDay` behaviour) |
| Starring a task dated another day | It comes to today (at its own time) | Otherwise the star is given straight back |
| Keys with a selection | `T`, `E`, `1`, `2`, `3`, `#` act on the whole selection, one Undo; Enter / `p` / `x` stay per-row | Akiflow behaviour; a mouse selection is what the key is about |
| Event dropped on the rail | Inbox → becomes an inbox item; Today → a task due today; Lists → a task in the rail's scope; Overdue → refused (computed bucket). Task blocks: unschedule (+ due today on Today). One Undo | Events have no unscheduled state; a drop must mean a conversion |
| Event repeat model | A real series (RRULE on `calendar_events`, wall-clock in the user's zone, expanded for display) with skipped dates; not the tasks' roll-forward | A meeting repeats on the calendar ahead of time; roll-forward only shows the next one |
| Journal photos | New private `journal` bucket (owner-folder RLS), compressed client-side; never the 7-day `captures` bucket | Journal photos are kept; captures are swept |
| Release | Prepared as one candidate; lands on `master` only after Kai's own test + "looks good, push it" (CONDUCTOR rule) | Standing rule |
