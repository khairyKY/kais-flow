---
date: 2026-10-16
session: subtasks-build (builder, worktree .claude/worktrees/subtasks-build, branch claude/subtasks-build from claude/bound-journal 4eb904f4 + claude/subtasks)
type: handoff
related: 2026-10-16-1541-subtasks-options.md, design-export/Subtasks options.html
---

# 2026-10-16 17:44 · handoff · subtasks-build

Kai's pick (16 Oct): **"I want A and C for add a task, and the time display for sub tasks too, 4 C".**
Built on branch `claude/subtasks-build` and pushed. Not merged, no PR. **No migration**: subtasks
already use `tasks.parent_task_id` (0029). DATA_MODEL.md's 0029 note now states the new rules.

## What works

**Lists (A).** Today, Tasks, and project and area pages.
- A subtask sits nested under its parent's row (`tasks/SubtaskNest.tsx`).
- The parent's meta line carries **"1/3 ⌄"**. A tap folds or unfolds the subtasks. The fold is
  remembered per parent on this device (`kf.subtasks.folded`).
- A subtask due another day still nests under its parent, with its own day or time ("Tomorrow").
- A subtask whose parent isn't on the page stays a row of its own, marked "↳ parent". This now
  covers Today's rows too.
- A parent ticked today that still has open subtasks (Leave them open) keeps them nested under its
  struck row. Once they're all ticked, the group folds away.

**Adding (A + C).**
- Computer: hover a row and press its **+**. Phone: **⋯ → Add a subtask**. Either opens an add line
  under the parent. Enter adds and keeps the line open for the next one. Esc closes it.
- The desktop **popover now has its Subtasks section** ("Subtasks · 1 of 3", rows, an add line).
  The phone sheet and the editor already had one.
- Every add line goes through the one capture parse (`command-bar/quickAdd` `addTypedSubtask`):
  - "Hand it in at 6pm" gives the subtask 18:00 on the calendar, and "at 6pm" leaves the title.
  - "tomorrow" gives it a date.
  - `>slot` puts it in a slot.
  - The line underneath says what will happen while you type, e.g. "Today 18:00 · on your calendar".
  - A subtask always lives where its parent does. No toast, no AI read.

**Time display (C).**
- A subtask with a time shows it on its row as a lavender pill ("16:00", "Tomorrow 09:00").
- In the sheet, popover and editor, an unplanned subtask shows a faint clock. The clock and the pill
  both open its Plan list.
- A timed subtask also shows by itself, marked "↳ parent":
  - in Up next (computer and phone),
  - on its own calendar block (desktop grid and phone grid),
  - in search result lines.
- A subtask can go into the Top 3 on its own: its ⋯ has Add to Top 3, and so do its sheet and
  popover.

**Ticking the parent (4 C).**
- With subtasks still open, the parent is done at once and the app asks **"N subtasks are still
  open"**. It names the first one on today's calendar ("Questions 1–5 is on your day at 16:00").
  - Computer: a small card under the row.
  - Phone: the action sheet. "Leave them open" there carries the note "… stays on your day at 16:00".
- **Tick them too** completes them all. The toast reads "Done, with its N open subtasks", and its
  one Undo takes the whole thing back.
- **Leave them open**, Esc, or a click away: plain "Done".
- With no open subtasks, nothing is asked.
- Every single tick goes through `completeTaskWithUndo`, so they all ask: rows, swipe, ⋯, sheet,
  popover, calendar block, tray, Focus. Bulk completes don't ask, and their subtasks stay open.

**MCP.**
- `complete_task` takes `subtasks: 'leave' | 'complete'`. The default is `'leave'`.
- Its answer always says what happened, e.g. "left its 2 subtasks open: … (subtasks: 'complete'
  ticks them)" or "ticked its 2 subtasks still open too: …".
- `move_to_trash` and `restore_from_trash` follow the Trash rule below (`with_subtasks`).
- `docs/MCP.md` is updated.

## Decisions to note

- **A repeating parent.** Its subtasks are its checklist. When it's ticked and its next occurrence
  is made, all its subtasks move to that copy, open again (Todoist's model). Nothing is asked.
  - Undo, or Reopen right after, brings them home exactly as they were.
  - The MCP does the same ("its N subtasks went with it to the next occurrence, open again").
  - A paused or finished series makes no next copy, so it asks like any other parent.
- **Trash.** Deleting a parent sends its subtasks to Trash with it, at the same instant, under one
  toast ("Moved to Trash, with its 2 subtasks") and one Undo. Restoring the parent from Trash brings
  back the subtasks that went with it, and only those. The MCP does the same.
- **Slots.** A subtask goes into a slot through `>slot` on its add line, or through its Plan list.
- **Search.** A subtask's result line starts with "↳ parent". A search jump to a folded subtask
  unfolds its parent.

## Gates

- `npx vitest run` in 4 time zones (PowerShell `$env:TZ`: Cairo, Los Angeles, Tokyo, UTC):
  163 files, **2259 tests**, all pass. New tests:
  - `subtasks.test.ts`
  - `api.completion.test.ts` (+6: ask, tick, leave, repeat carry, reopen, Trash)
  - `quickAdd.test.ts` (+3)
  - `taskMenuSpec.test.ts` (+1)
  - `searchView.test.ts` (+1)
  - `mcp.test.ts` (+5)
- `npm run lint`: 0 errors.
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- CI `rehearsal.yml` on `claude/subtasks-build`: green on the MCP commit (38913770948) and again at the final commit (**38918270626**). **mcp-full 347/347** (was 321), mcp-week
  158, fix0-auth 85, sec2 110, notify-prune 12, fix5-search 31.
- Browser, mock backend, port 5295. `docs/log/assets/subtasks/verify.mjs` passes **47/47** on
  desktop and phone. It covers: nest, the fold (kept across a reload), add from the row ("at 6pm" →
  18:00 block), Up next and both calendars' "↳ parent", the popover's subtasks, and Tick them too /
  Leave them open / Esc with the one Undo. Screenshots are in `docs/log/assets/subtasks/`.
- Reruns:

  | Harness | Result | Note |
  |---|---|---|
  | fix-today | 116/116 | |
  | today-shell | 86/86 | |
  | fix-tasks | 70/70 | a2 updated: a subtask with its parent on the page now sits nested |
  | task-sheet | 149/149 | 4f updated: "Moved to Trash, with its 2 subtasks" |
  | capture-rules | 42/42 | |
  | time-slots | 109/110 | See below |

  The one time-slots miss is **f3 "Tasks then reads Tue 11:00"**. It fails the same way on the
  untouched `claude/bound-journal` app, so it was there before this branch. It's left for the slots
  owner.

## Not done / for Kai

- On a narrow calendar block, "↳ parent" shares the time line and gets cut short with an ellipsis.
- Bulk complete doesn't ask; it leaves subtasks open. Adding the question there would be a one-line
  change if Kai wants it.
- Since this branch began, `claude/bound-journal` has moved on (it merged slot-outline). A merge of
  the two has two small conflicts:
  - `PhoneGrid.tsx` `BlockLook`: keep both, i.e. slot-outline's `minutes` in `held` and this
    branch's `parent?`.
  - `docs/log/INDEX.md`: keep both lines.
  Rerun time-slots after that merge. It is 138 checks there, and f3 may already be fixed.

## After the merge (83a13d43)

calendar-phone failed at "7h-day a swipe pages three days" on the merged tree. The cause was not
PhoneGrid. Just before the swipe, the harness ticks the tyre call's block, and the tyre call has two
open subtasks. Ticking it now asks "2 subtasks are still open" (4 C, by design). The harness never
answered, so the open sheet's scrim took the swipe, and then the title tap.

The harness now checks that the question is asked and answers "Leave them open". Results on the
merged tree:

| Harness | Result |
|---|---|
| calendar-phone | 177/177 (176 + that check) |
| time-slots | 152/152 (f3 is fixed there) |
| subtasks | 47/47 |
| cal-wave2 | 83/83 |

Tests: 2260 pass. Lint: 0 errors.
