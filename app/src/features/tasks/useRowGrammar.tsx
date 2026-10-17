import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useIsMobile } from '../../components/BottomSheet'
import { tomorrowHint as defaultTomorrowHint } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import type { Area, Domain, Project, Task } from '../../lib/types'
import { deleteTasksWithUndo, duplicateTasksWithUndo, editWithUndo, makeGoalWithUndo, moveInTop3Order, moveTasksWithUndo, moveToTomorrowWithUndo, planWithUndo, prioritizeWithUndo, reopenTaskWithUndo, rescheduleDue, setDuration, setRecurrence, setReminder, snoozeTasksWithUndo, somedayTasksWithUndo, toggleTop3, unsnoozeTasksWithUndo } from './api'
import { durationLabel } from '../../components/pickerMath'
import { placeName } from './move'
import type { SwipeActions } from './SwipeRow'
import { dueChip, remindChip, repeatLabel } from './taskSheetMath'
import { TaskMenu, type BulkActions, type MenuAnchor, type TaskMenuActions } from './TaskMenu'
import { cairoTimeKey } from '../calendar/eventTime'
import { outOfSlotWithUndo } from '../calendar/api'
import { useSubtaskUi } from './subtaskStore'

// ── The one task-row grammar (Flow Audit §4), as a hook: every row that shows a task (Tasks, Today's
// Top 3 + goal card, task-backed Up next) gets its SwipeRow props, its ⋯ / right-click opener and the
// menu to render beside it from here. ──

/** The real writes for one task (the task sheet's chips open the same pickers with these). A Plan
 * pick says where the task went, with Undo — blocks it took off the calendar come back too. Every
 * field edit here says what it set, with Undo (P7e A17: priority, repeat, remind and duration were silent). */
export function taskActions(task: Task): TaskMenuActions {
  return {
    tomorrow: () => moveToTomorrowWithUndo([task]),
    // `timed`: Pick date & time… set a time, which puts the task on the calendar (calendar/replan).
    schedule: (iso, timed) => planWithUndo(task, iso, timed),
    clearDate: () => planWithUndo(task, null),
    someday: () => somedayTasksWithUndo([task]), // Undo like every other plan move
    move: (to) => moveTasksWithUndo([task], to),
    priority: (p) => prioritizeWithUndo([task], p),
    repeat: (rule) => editWithUndo([task], rule ? `Repeats · ${repeatLabel(rule)}` : 'Repeat off', (t) => setRecurrence(t, rule)),
    remind: (iso) => editWithUndo([task], iso ? `Reminder · ${remindChip(iso, task.due_at)}` : 'Reminder off', (t) => setReminder(t, iso)),
    duration: (m) => editWithUndo([task], m ? `Duration · ${durationLabel(m)}` : 'Duration off', (t) => setDuration(t, m)),
    top3: () => toggleTop3(task),
    goal: () => makeGoalWithUndo(task),
    reopen: () => reopenTaskWithUndo(task),
    delete: () => deleteTasksWithUndo([task]),
    duplicate: () => duplicateTasksWithUndo([task]),
    snooze: (iso) => snoozeTasksWithUndo([task], iso),
    unsnooze: () => unsnoozeTasksWithUndo([task]),
    // Next free slot's Confirm = a timed replan into the slot: the task's block moves there (or one
    // is placed) and it is due then (calendar/replan's rule, through rescheduleDue).
    slot: (startsAt, endsAt) => toastUndo(`Planned · ${dueChip(startsAt, new Date())}–${cairoTimeKey(new Date(endsAt))}`, rescheduleDue(task, startsAt, true)),
    // In a Time slot (0073): ⋯ → Out of the slot (taskMenuSpec).
    ...(task.slot_id ? { unschedule: () => outOfSlotWithUndo(task) } : null),
  }
}

export interface RowGrammarOptions {
  projects: Project[]
  domains: Domain[]
  /** Names the menu's "Move to…" hint when the task lives in an area. */
  areas?: Area[]
  selected?: boolean
  onToggleSelect?: () => void
  /** Something on this page is selected: a phone then taps to select instead of opening. */
  selecting?: boolean
  bulk?: BulkActions
  /** Per-surface writes (Tasks' grace-window reopen, an Up next block's Tomorrow). */
  actions?: Partial<TaskMenuActions>
  tomorrowHint?: string
  canUnschedule?: boolean
  /** A Top 3 row on Today: its place, for Move up / Move down. */
  place?: { index: number; last: number }
  /** Whether this row is the goal, where the surface decides it (Plan my day's draft). */
  goal?: boolean
  /** The row draws its subtasks under it (Subtasks A): ⋯ → Add a subtask opens its add line. */
  nest?: boolean
}

/** Everything a task row needs for the one grammar: SwipeRow props, the ⋯ / right-click opener and
 * the menu to render beside the row. */
export function useRowGrammar(task: Task, o: RowGrammarOptions) {
  const isMobile = useIsMobile()
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const done = task.status === 'done' || !!task.completed_at
  const bulk = o.bulk && o.selected && o.bulk.count > 1 ? o.bulk : undefined
  const actions: TaskMenuActions = {
    ...taskActions(task),
    ...(bulk ? { tomorrow: bulk.onTomorrow, schedule: bulk.onSchedule, someday: bulk.onSomeday, move: bulk.onMove, delete: bulk.onDelete, duplicate: bulk.onDuplicate, snooze: bulk.onSnooze, ...(bulk.onTop3 ? { top3: bulk.onTop3 } : null) } : null),
    ...(o.place ? { reorder: (d: -1 | 1) => void moveInTop3Order(task, o.place!.index + d) } : null),
    ...(o.nest && !task.parent_task_id && !done ? { addSubtask: () => useSubtaskUi.getState().setAdding(task.id) } : null),
    ...o.actions,
    select: o.onToggleSelect,
  }
  const hint = o.tomorrowHint ?? defaultTomorrowHint()
  const swipeActions: SwipeActions = {
    tomorrow: actions.tomorrow,
    pickDate: (at) => setMenu({ at, sub: 'date' }),
    project: (at) => setMenu({ at, sub: 'project' }),
    delete: actions.delete,
  }
  return {
    /** A phone in selection mode: the row shows a select circle and every tap toggles it. */
    selecting: isMobile && !!o.selecting,
    menuOpen: !!menu,
    openMenu: (at: { x: number; y: number }) => setMenu({ at }),
    /** Straight to the Plan list (a someday row's "pick a date"). */
    openPlan: (at: { x: number; y: number }) => setMenu({ at, sub: 'date' }),
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault()
      setMenu({ at: { x: e.clientX, y: e.clientY } })
    },
    swipeProps: {
      actions: done ? undefined : swipeActions,
      tomorrowHint: hint,
      onLongPress: done ? undefined : o.onToggleSelect,
      selecting: isMobile && !!o.selecting,
      onSelectTap: o.onToggleSelect,
    },
    menuNode: menu && (
      <TaskMenu
        task={task}
        anchor={menu}
        onClose={() => setMenu(null)}
        actions={actions}
        ctx={{
          tomorrowHint: hint,
          projectName: placeName(task, o.projects, o.areas ?? [], o.domains),
          bulkCount: bulk?.count,
          selected: o.selected,
          canSelect: !!o.onToggleSelect,
          canUnschedule: o.canUnschedule,
          place: o.place,
          goal: o.goal,
        }}
      />
    ),
  }
}
