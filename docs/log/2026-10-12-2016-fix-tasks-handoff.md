---
date: 2026-10-12 20:16 UTC
session: fix-tasks
type: handoff
related: review findings on 81a4d844 (tasks items 1–11); conductor product audit 2026-10-12 (repeats, Pause, subtasks, desktop Tomorrow, capture toasts); Kai's ruling 2026-10-12 "fix or cut" (⌘↵ AI capture → cut)
---

# fix-tasks: handoff

Branch `claude/fix-tasks` (from `origin/claude/kai-bugs-1012` @ 81a4d844, builds on d08c05fc's Top 3 rule). Pushed, not merged, no PR.

## Commits

| SHA | What |
|---|---|
| 2bc789b9 | Setters write the CACHED row (QuickCreate data loss); field edits log `task.updated`, domain carry logs `task.moved`; one-task Someday has Undo |
| 69f739fc | Repeat → Custom… opens a rule editor (`repeatRule.ts` + `RepeatMenu.tsx`) |
| 4d91d25d | Desktop task detail popover; one set of task controls (`TaskFields.tsx`); subtasks open / rename / delete |
| c1405229 | Task editor at parity with the phone sheet; user-zone dates; designed load states |
| 539cd5d2 | Tasks page: quick add parses; phone bulk Top 3; Done keys; click-away; chips on desktop; week/month phone tabs; user-zone days; shared growth stage + day-complete gate; load states |
| 8a87c50f | Cheatsheet renders the keys the page registered (+ Space, Ctrl+A, Alt+↑/↓, selection note) |
| ab4b92b1 | Browser harness 58/58 |
| 14cc7dce | Audit: repeats roll from today on the user's wall clock; undated repeat gets a date; Pause really pauses |
| ec9f4d55 | Audit: subtask rows show "↳ parent"; desktop menu has a top-level Tomorrow (2) again |
| 7f15bb5c | Kai's ruling: ⌘↵ "AI capture" cut; Enter is the one capture rule (`command-bar/quickAdd.ts`); every landing toasts where it went |
| e29082fe | Harness 70/70 |

## What changed, by finding

1. **Stale-spread data loss.** `tasks/api.ts` `patchTask()` spreads `cached(task)`; every setter (labels, priority, duration, notes, title, someday, repeat, reminder, pause/resume, skip, re-date, move, delete/restore, complete, duplicate, Top 3) goes through it. Regression test `api.setters.test.ts` replays QuickCreate's create → repeat → labels → priority → duration → someday → title with one stale object. **Call-site edit outside my folders:** `calendar/QuickCreate.tsx` — area and labels now go into `createTask` (removed the separate `writeRow` + `setLabels`); nothing else touched there.
2. **One-task Someday** → `somedayTasksWithUndo([task])` ("Parked for someday · Undo"; Undo also gives back the Top 3 place).
3. **Editor parity** (`calendar/TaskEditorPage.tsx`, now built on `tasks/TaskFields`): priority (None/!/!!/!!!), durations None + 15m–2h, Project or area → Move to… (domains, areas, new project; area carries its domain via `placeTask`), Reminder/Repeat show any value, Plan ▾ (Next free slot, This weekend…), ⋯ (Make goal, Duplicate, Copy link, Unschedule, Delete), Unschedule on the linked block, "From a photo". Due date/time, created/edited, block, capture lines use the user's zone. Loading → skeleton; offline never loaded → offline chip; failed → ErrorCard + Retry; gone → EmptyState.
4. **Desktop popover** (`tasks/TaskPopover.tsx`, Overlays.dc.html "Task detail"): opened from a row (click, or Enter on a focused row) via `?task=` (replace, not push — a close + open in one click can't race a pending Back); anchored under the row, over it when there's no room, never on it (roomier side + inner scroll). Box/title/star, italic notes, the chips (text-only, as drawn), Delete · Open full ↗. Edits commit at once; Esc / outside click / scroll behind closes (typed fields commit first); Enter on the popover or Open full ↗ → `/tasks/:id`. No row on screen (calendar block, inbox link) or a caller's own href → the editor page as before. Phone keeps the sheet (`TaskSheet` picks).
5. **Custom repeat**: `RepeatMenu` (presets + Custom…) and `RepeatEditor` (every N days/weeks/months, weekdays, day N / Nth weekday, ends never / on date / after N), `value` / `onChange` / `position` / `onClose` / `start` — reusable for calendar events. Used by the row ⋯ (incl. the desktop submenu), the sheet/popover chips and the editor field. RRULE built with `rrule`; Custom… then Done on a preset writes the preset back unchanged. No design exists for the editor: built from kit (Segmented, NumberField, Chip, DateField, Popover/BottomSheet) — **flag for Phase C**. PerennialsPage's own "Custom…" still opens the editor, which now has Custom… (not my folder; no edit).
6. **Bulk Top 3**: `BulkBar` optional `onTop3` (phone bar + desktop pill). Tasks wires it. **Today and ProjectDetailPage don't yet** — their owners pass `onTop3={…toggleTop3ManyWithUndo}`.
7. **Quick add** runs the command bar's parse (dates via chrono on the user's clock, #project, !priority, 30m, *labels) — now literally the same rule (`command-bar/quickAdd.ts` `addTypedTask`): instant land → typed time places the block → toast names where → AI fills gaps after (`enrichTypedTask`). On the Today tab a line with no day stays today's (as before).
8. Tasks: Done tab has keys (j/k, e/Space reopens, Enter, #) and registers them as "Done"; click on empty space clears the selection; domain chips on desktop; This Week / This Month in the phone tab strip (`tr-mobile-only`; desktop keeps the drawer).
9. `daysOverdue` counts the user's day (fixes TaskRow and Today's use); row times via `cairoTimeKey`; growth stage from `lib/growthStages`; day-complete burst via `today/dayComplete` (import only — note `claimDayComplete` itself still keys on the device day, `localDateKey`; Today's owner can switch it to `cairoDateKey`). Tasks load states as in 3.
10. Activity: `task.updated` {field} for labels/priority/duration/title/notes; `carryTasksToDomain` logs `task.moved` both ways. Subtask rows (sheet + editor + popover-open): title opens it, ⋯ / right-click → Rename (in place) / Delete (Trash + Undo).
11. Cheatsheet "On a task" = the mounted page's registered section (`pageShortcutsStore`) + Space, ⌘/Ctrl+A, ⌥/Alt+↑/↓, "With a selection, keys act on all selected."

### Product audit (conductor) and Kai's ruling

- **Repeats** (`tasks/recurrence.ts`): `nextDue()` rolls from max(due, today at the due's time) on the user's clock, keeping the rule's start (weekdays hold). Rules now run on the **user's wall clock** (floating time through the tz database): daily 09:00 stays 09:00 across DST, BYDAY/BYMONTHDAY read the user's weekday/date. Used by completion and Skip. Tests: Cairo April + October DST, Los Angeles November DST, Tokyo BYDAY, late/early/same-day rolls in 4 user zones. **The MCP server's `complete_task` (supabase/functions/mcp) has its own copy of the old roll — not my folder; it should get the same rule.**
- **Undated repeat**: `setRecurrence` dates it today 09:00 and toasts "Repeats from today".
- **Pause**: paused series are on no list (smart lists, Today + badge, rail scopes), give up their Top 3 place (`top3Rule`), and spawn nothing on completion. The notify side wasn't touched (handled separately).
- **Subtasks in lists**: picked the quiet marker over hiding (a dated subtask stays visible on Today): "↳ Parent title" in the row meta.
- **Desktop Tomorrow**: right-click / ⋯ has "Tomorrow  2" on top, then Plan…; phone unchanged (swipe).
- **⌘↵ cut** (Kai): handler, keycap hint and cheatsheet row removed; Ctrl+Enter now does what Enter does. `captureWithAI` stays — voice, Quick Capture page and the tray still use it. Leftover mentions outside my folders: a comment in `capture/aiFill.ts:78` and a test name in `capture/api.test.ts:312` still say "⌘↵". **The website's Capture page copy ("On a computer, ⌘/Ctrl + Enter lets the AI file it for you", `site/src/pages/features.mjs`) must change — conductor.**
- **Landing toasts**: Tasks quick add and the command bar's task path → "Added to Today / Tomorrow · Forecasting / Sat 17 Oct / Someday / Forecasting / Tasks · no date" with Undo (to Trash); command bar Inbox path → "Added to Inbox". QuickCreate (calendar) not touched.

## Verified

- `npx vitest run`: **1574 passed** (1530 at start + 44 new), green under TZ=UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo (PowerShell `$env:TZ`, offsets confirmed).
- `npm run lint`: 0 errors (warnings only, same kinds as before). `npm run build`: OK.
- Browser, real app on the mock backend (`docs/log/assets/fix-tasks/verify.mjs`, dev server from this worktree, `--mode mock`, http://localhost:5249): **70/70**, twice in a row. Desktop 1280×800 and phone 390×844, day + night screenshots in `docs/log/assets/fix-tasks/` (p1 popover, e1 editor, r1/r3 custom repeat, b0/b1 phone tabs + bulk, s1 phone sheet, q1 quick add, d4 cheatsheet, a3 context menu).
- CRLF files (`TasksPage.tsx`, `api.ts`, `CommandBar.tsx`) still CRLF (`git ls-files --eol`).

## Not verified / open

- Nothing on Kai's real account or the live site (mock backend only).
- The popover was exercised from Tasks rows; Today rows open it when they carry `id="task-…"` (TaskRow does) — Today's own Top 3 card / Up next rows were not checked.
- Phone sheet: chips, picker, subtask open checked; subtask Rename/Delete via the phone ActionSheet not clicked through (desktop path is).
- Subtask "↳" marker only on open rows (not the someday / done row variants).
- Bundle: two new task files ride in the lazy TaskSheet chunk; initial bundle not measured.
