import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useIsMobile } from '../../components/BottomSheet'
import { tomorrowHint as defaultTomorrowHint } from '../../lib/dateShortcuts'
import type { Domain, Project, Task } from '../../lib/types'
import { deleteTasksWithUndo, moveToTomorrowWithUndo, reopenTaskWithUndo, rescheduleDue, setPriority, setProject, setRecurrence, setReminder, setSomeday, toggleTop3 } from './api'
import type { SwipeActions } from './SwipeRow'
import { TaskMenu, type BulkActions, type MenuAnchor, type TaskMenuActions } from './TaskMenu'

// ── The one task-row grammar (Flow Audit §4), as a hook: every row that shows a task (Tasks, Today's
// Top 3 + goal card, task-backed Up next) gets its SwipeRow props, its ⋯ / right-click opener and the
// menu to render beside it from here. ──

/** The real writes for one task. */
function taskActions(task: Task): TaskMenuActions {
  return {
    tomorrow: () => moveToTomorrowWithUndo([task]),
    schedule: (iso) => rescheduleDue(task, iso),
    someday: () => setSomeday(task, true),
    move: (projectId, domainId) => setProject(task, projectId, domainId),
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
          projectName: o.projects.find((p) => p.id === task.project_id)?.name,
          bulkCount: bulk?.count,
          selected: o.selected,
          canSelect: !!o.onToggleSelect,
          canUnschedule: o.canUnschedule,
        }}
        projects={o.projects}
        domains={o.domains}
      />
    ),
  }
}
