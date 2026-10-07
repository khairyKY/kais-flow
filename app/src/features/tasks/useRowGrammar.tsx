import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useIsMobile } from '../../components/BottomSheet'
import { tomorrowHint as defaultTomorrowHint } from '../../lib/dateShortcuts'
import type { Area, Domain, Project, Task } from '../../lib/types'
import { setTimeOf } from '../calendar/replan'
import { deleteTasksWithUndo, moveTasksWithUndo, moveToTomorrowWithUndo, reopenTaskWithUndo, rescheduleDue, setPriority, setRecurrence, setReminder, setSomeday, toggleTop3 } from './api'
import { placeName } from './move'
import type { SwipeActions } from './SwipeRow'
import { TaskMenu, type BulkActions, type MenuAnchor, type TaskMenuActions } from './TaskMenu'

// ── The one task-row grammar (Flow Audit §4), as a hook: every row that shows a task (Tasks, Today's
// Top 3 + goal card, task-backed Up next) gets its SwipeRow props, its ⋯ / right-click opener and the
// menu to render beside it from here. ──

/** The real writes for one task (the task sheet's chips open the same pickers with these). */
export function taskActions(task: Task): TaskMenuActions {
  return {
    tomorrow: () => moveToTomorrowWithUndo([task]),
    // The picker says whether a time was set (a time puts the task on the calendar — calendar/replan);
    // a path that drops its flag falls back to "not the 09:00 a date alone lands on".
    schedule: (iso: string, _min?: number, timed?: boolean) => void rescheduleDue(task, iso, timed ?? setTimeOf(iso)),
    clearDate: () => void rescheduleDue(task, null),
    someday: () => setSomeday(task, true),
    move: (to) => moveTasksWithUndo([task], to),
    priority: (p) => setPriority(task, p),
    repeat: (rule) => setRecurrence(task, rule),
    remind: (iso) => setReminder(task, iso),
    top3: () => toggleTop3(task),
    reopen: () => reopenTaskWithUndo(task),
    delete: () => deleteTasksWithUndo([task]),
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
    ...(bulk ? { tomorrow: bulk.onTomorrow, schedule: bulk.onSchedule, someday: bulk.onSomeday, move: bulk.onMove, delete: bulk.onDelete } : null),
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
        }}
      />
    ),
  }
}
