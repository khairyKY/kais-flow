---
date: 2026-10-17
session: dup-open (builder, worktree .claude/worktrees/dup-open, branch claude/dup-open from claude/kai-bugs-1012 = master v1.2.1)
type: handoff
---

# 2026-10-17 13:03 · handoff · dup-open

Two of Kai's asks, built on `claude/dup-open` and pushed. Not merged, no PR, no migration.

- *"why can't I open the task if I am pressing it in the calendar before I plan it"*
- *"we need to add duplicating options"*

## 1 · A click on a not-yet-planned task opens it

Akiflow / Sunsama / Todoist: a click opens, a drag schedules.

- **Computer, calendar rail and the day tray** (`RailTaskCard`): a click with no drag opens the task
  popover anchored at the card, as a block does. Enter on a focused card opens it too (cards now take
  focus, with the focus ring). Drag still schedules. The checkbox, Plan ▾ and ⋯ keep their own
  behaviour (they are dragGuard'd, so their clicks never reach the card). A click inside the card's
  own menu is ignored (the menu is portalled but still its React child). Shared hook:
  `calendar/cardOpen.ts`.
- **Planning mode** (`PlanningPanel` cards): a click opens the task (it used to open the Plan menu).
  The cards get the rail's **Plan ▾** button for that, shown on hover or focus like the rail's.
  `PlanButton` moved to its own file, `calendar/PlanButton.tsx`.
- **Phone**: a tap on a chip still opens the Schedule sheet (planning is the tray's job). **Open
  task** is now its first row, and a tap on the sheet's title opens the task too.
- Harnesses updated: `cal-wave2` (planning card click → popover; Plan ▾ → Plan menu),
  `calendar-rail` (click and Enter open the task), `calendar-phone` (Open task first, title opens).

## 2 · Duplicate, everywhere

Pure logic in `tasks/duplicate.ts` (tested in `duplicate.test.ts`):

- **A copy** is open, keeps the title, notes, date, place, labels, priority, duration, repeat and
  reminder. It is not on the calendar, not in the Top 3 or a Time slot, and has no import key.
- **Subtasks**: a parent's subtasks come along as open subtasks of the copy, in their order. A
  subtask's copy stays under the same parent. A subtask picked together with its parent is copied
  once, with the parent. Undo removes them all.

Where it is:

- **Task row menu** (right-click and ⋯ on every task row: Today, Tasks, projects, the calendar rail):
  **Duplicate**, after Start focus and before Select / Delete, with the ⌃D keycap. With a selection it
  reads "Duplicate (N)" and copies all of them. Not on a done row (Reopen / Delete only, as before).
- **Keyboard: Ctrl/Cmd+D** on the focused row, or on every selected row. The bare D is still Plan….
  The key is a new `mod` list binding (`listShortcuts.ts` LIST_SHORTCUTS, matched in
  `useListKeys.ts` bindingFor), so it shows in the `?` cheatsheet's Lists section. Ctrl + any other
  letter is left to the browser, as before.
- **Bulk**: the bulk bar's More (Priority…, Labels…, Duplicate) and a selected row's menu. One Undo:
  "N tasks duplicated · Undo" (", with their N subtasks" when some came along). The selection clears.
- **Task sheet / popover ⋯ → Duplicate** (already there) now copies subtasks too.
- **Calendar** (`calendar/duplicate.ts`; desktop `BlockMenu`, phone event sheet):
  - A plain event copies to the same time (it shows side by side) with Undo. An occurrence of a
    repeat copies as a one-off.
  - A task's block duplicates the task (subtasks along) and blocks the copy at the same time. One
    Undo removes both.
  - Not offered on a Time block (a slot repeats instead) or a Google event.
- **Projects**: the Projects row menu (right-click / ⋯) **Duplicate**, and **Duplicate project** in the
  project page's footer next to Archive project. Templates (`projects/templates.ts`) only cover the
  checklist, so the copy is its own pure function (`duplicateProjectRows`). It makes:
  - "<name> (copy)", active;
  - its milestones and checklist afresh (unticked, new ids; a task-linked line points at its task's
    copy);
  - every live task (subtasks along) as an open, undated, unscheduled copy out of the Top 3, on the
    copy's milestone.

  One Undo removes the project copy and its tasks outright.
- **MCP**: `duplicate_task` (bulk; subtasks along) and `duplicate_event` (`occurrence` for a repeat;
  a task's block copies the task and blocks it; refuses Time blocks; Google events aren't reachable).
  Each copy is logged as `task.created` / `calendar_event.created` with `duplicate_of`. **53 tools**
  now (47 for every key). Updated: `docs/MCP.md`, `docs/DATA_MODEL.md`, `mcp.test.ts`,
  `supabase/tests/mcp-full.sh` (counts 47 / 53 / 47, both names in the listed loop).

## Gate

- `npx tsc -b`: clean
- `npx vitest run`: 165 files, **2283 tests** passed
- `npm run lint`: **0 errors** (24 warnings, all pre-existing)
- `npm run build`: OK
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new** (5 fixed since)
- `deno check`: **not run**, deno isn't installed on this machine. The MCP tools run under vitest
  through `mcp.test.ts` (the fake Store), and that passes.
- `grep -c birthday_on app/src/lib/types.ts` = 1; `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1

Harnesses (mock server on :5290):

| Harness | Result | Note |
|---|---|---|
| calendar-rail | 101/101 | + a click and Enter on a rail card open the task |
| cal-wave2 | 84/84 | a planning card click opens the task; its Plan ▾ opens the Plan menu |
| calendar-phone | 180/180 | Open task is the Schedule sheet's first row; the title opens the task; Back closes it |
| cal-rail-drop | 33/33 | |
| task-sheet | 150/150 | 4e: the sheet's Duplicate now copies the 2 subtasks ("Duplicated, with its 2 subtasks") |
| event-detail | 70/70 | a1 / p1: the block menu and the phone event sheet list Duplicate |
| fix-tasks | 70/70 | |
| subtasks | 47/47 | |
| tasks-noise (bulk bar) | 202/202 | |
| undo-verbs | 88/88 | |
| time-slots | 152/152 | |
| p7e-audit | 17 + 1 fail, 26 notes | c2 "recurrence typed in the bar is NOT parsed (gap)" is an old audit note. The bar parses it since P7e A5. Not touched here |
| **dup-open** (new) | **23/23** | row-menu Duplicate + Undo, a parent with its 3 subtasks, Ctrl+D, bulk More → Duplicate, a calendar event and a task's block, Projects → Duplicate |

`docs/log/assets/dup-open/verify.mjs` is the new harness. Run it with
`node verify.mjs <outDir> http://localhost:5290`.

The first runs of task-sheet, event-detail and calendar-phone failed because their checks still
expected the old rows and toast. The checks were updated and all three were re-run alone; they pass.
dup-open's first run lost 2 checks to timing: it read the writes before the outbox's second batch
arrived. It now waits for them and passes.

## Not done / notes

- `duplicate_event` over MCP: the copy takes the column defaults for colour, project and busy.
  The MCP `EventRow` doesn't carry them. The app's own Duplicate keeps them.
- The planning-mode Plan ▾ is shown on hover or focus, like the rail's. Kai may want it always
  visible on those bigger cards.
- `design-export/Delete task options.html` showed up untracked in this worktree during the session.
  It isn't mine, so I left it alone. The TaskEditorPage Delete footer is untouched.
