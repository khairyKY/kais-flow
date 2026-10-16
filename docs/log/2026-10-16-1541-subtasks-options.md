---
date: 2026-10-16
session: subtasks (designer-builder, worktree .claude/worktrees/subtasks, branch claude/subtasks from claude/bound-journal b8efb595)
type: options
related: Kai 16 Oct, "introduce and design sub tasks"; migration 0029 (tasks.parent_task_id)
---

# 2026-10-16 15:41 · options · subtasks

Step 1 only: a page for Kai to pick from by eye. **Nothing is built.** The page is
`design-export/Subtasks options.html`. Open it from disk, or serve `design-export/` if the fonts or
tokens don't load. It draws three options, A, B and C, in Design System B's day colours. Each option
shows four scenes on the computer and on the phone:

1. Today with a parent that has 3 subtasks (1 done).
2. The open task (the popover on the computer, the sheet on the phone).
3. Adding a subtask.
4. Ticking the parent.

Kai presses "This one", then "Copy my pick" (for example "Subtasks: B").

## How others do it (flows first)

| App | In a list | Add a subtask | Tick the parent |
|---|---|---|---|
| Todoist | Nested under the parent, with an arrow and a count; click the count to fold or unfold (1 tap). A subtask dated today also shows in Today, at the parent's indent. | Open the task (1) → Add sub-task (2) → type → submit (3). Same on the computer. | 1 tap. The open subtasks are ticked too. |
| Things 3 | A checklist inside the to-do, not separate tasks. The list shows no count. Checklist items can't be dated. | Open the to-do (1) → checklist button (2) → type; Return adds the next item. | 1 tap. Nothing is asked. |
| Akiflow (v2.77, summer 2026) | Nested, with a live "2/5" counter. A setting shows subtasks as their own rows in the Inbox. Any subtask can be dragged onto the calendar on its own. | Open the task (1) → Add subtask (2) → type → Enter. On the computer you can also Shift-drag a task onto another (1 drag). | If subtasks are still open, Akiflow asks what to do with them (+1 tap). |
| Kai's Flow today | A subtask is its own row with "↳ parent". The parent shows nothing. | Phone: tap the row (1) → Add a subtask (2) → type → Enter. Computer: the popover has no subtasks, so it is click the row (1) → Open full ↗ (2) → Add a subtask… (3) → type → Enter. | 1 tap. The children are never ticked (0029). |

Sources:
- [Todoist, sub-tasks](https://www.todoist.com/help/todoist/features/use-sub-tasks-in-todoist-kMamDo)
- [Akiflow changelog](https://product.akiflow.com/changelog)
- [Things 3, checklists](https://apps.apple.com/us/story/id1437833617)

## The three options

| | In a list | Add a subtask | Tick the parent |
|---|---|---|---|
| **A**, nested (Todoist) | Under the parent, with a "1/3 ⌄" fold on the parent's meta line. | From the row: hover → **+** on the computer, ⋯ → Add a subtask on the phone (1) → type → Enter. | 1 tap: the open subtasks are ticked too, the group folds, "Done, with its 2 open subtasks · Undo". |
| **B**, inside only (Things) | Never as rows. The parent shows "☑ 1/3". | Open the task (1) → Add a subtask (2) → type → Enter, on both. The computer popover gains the subtask list, which saves Open full. | As A. |
| **C**, B + its own time (Akiflow's best part) | As B. A subtask with a time also shows by itself in Up next, on the Now card and on the calendar ("↳ parent"). | As B. Typing "at 6pm" in the line gives it a time ("Today 18:00 · on your calendar"), with no extra tap. Unplanned rows show a faint clock. | If subtasks are still open, it asks: **Tick them too** or **Leave them open** ("Questions 1–5 stays on your day at 16:00"). +1 tap only then. |

## Notes for whoever builds the pick

- **A and B change a recorded rule.** Ticking the parent then ticks its open children. DATA_MODEL.md
  (0029) says "completing the parent never completes children", and MCP `complete_task` must follow
  whatever rule replaces it.
- **B and C** take subtasks out of every list surface (Today, Tasks, Inbox views) unless a subtask is
  timed (C). Today a subtask is its own row with "↳ parent" (TaskRow.tsx).
- **A** needs nesting in `grouping.ts` and in Today's sections.
- **The popover:** every option adds `SubtaskList` (dense) to `TaskPopover`, which has none today.
- **C's add line** reuses the chrono parse that capture already does.

## Verification

The page was served from `design-export/` (python http.server, 127.0.0.1:5311) and shot with
Playwright at 1360 wide. All 24 frames render. Two fixes were made from the shots:

- The done row's title wrapped on the computer.
- The phone sheet with the keyboard up cut the date header in half.

A script checked the pick:

- Copy starts disabled.
- Picking C rings its 8 frames and presses both C buttons.
- Switching to B and pressing Copy puts "Subtasks: B" on the clipboard.
- The pick survives a reload.
