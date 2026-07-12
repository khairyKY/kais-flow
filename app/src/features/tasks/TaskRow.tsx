import { useState } from 'react'
import './TaskRow.css'
import {
  completeTask,
  uncompleteTask,
  toggleTop3,
  snoozeTask,
  setSomeday,
  setProject,
  setRecurrence,
  setReminder,
  setPriority,
  setDuration,
  rescheduleDue,
  deleteTask,
} from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { daysOverdue, formatDuration, priorityColor, priorityFlag, resolveTag } from './taskDisplay'
import { shortcutHint } from './listShortcuts'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import {
  BellMenuIcon,
  CheckMenuIcon,
  ClockMenuIcon,
  DurationMenuIcon,
  FlagMenuIcon,
  FolderMenuIcon,
  RepeatMenuIcon,
  ScheduleMenuIcon,
  TrashMenuIcon,
  UndoMenuIcon,
} from '../../components/icons/MenuIcons'
import type { Task } from '../../lib/types'

function chip(label: string, color: string, extra?: React.CSSProperties) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        padding: '2px 8px',
        ...extra,
      }}
    >
      {label}
    </span>
  )
}

export interface BulkActions {
  count: number
  onComplete: () => void
  onSnooze: (until: string) => void
  onSomeday: () => void
  onSchedule: (iso: string) => void
  onMove: (projectId: string | null, domainId: string | null) => void
  onDelete: () => void
}

export function TaskRow({
  task,
  highlighted,
  selected,
  onToggleSelect,
  bulk,
  hideCheckbox,
}: {
  task: Task
  highlighted?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  /** When 2+ tasks are selected, the row's actions menu acts on all of them instead of just this row. */
  bulk?: BulkActions
  /** Selection still works (right-click/⋯ selects the row, bulk actions in the menu) — this only
   * hides the visible checkbox, for surfaces (the Planning board) that select without one. */
  hideCheckbox?: boolean
}) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const done = task.status === 'done'
  const tag = resolveTag(task, domains, projects, areas)
  const overdueDays = !done && !task.someday && task.due_at ? daysOverdue(task.due_at) : 0
  const overdue = overdueDays > 0
  // Right-clicking (or opening the ⋯ menu on) an unselected row selects it, so it's always clear
  // which task(s) the menu is about to act on — an already-multi-selected row is left as-is.
  const bulkActive = !!bulk && !!selected

  function openMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (!selected) onToggleSelect?.()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems: ContextMenuItem[] = done
    ? [
        { label: 'Reopen', icon: <UndoMenuIcon />, onClick: () => uncompleteTask(task) },
        { label: 'Delete', danger: true, icon: <TrashMenuIcon />, onClick: () => { if (window.confirm(`Delete "${task.title}"?`)) deleteTask(task) } },
      ]
    : [
        {
          label: bulkActive ? `Complete (${bulk!.count})` : 'Complete',
          icon: <CheckMenuIcon />,
          shortcut: shortcutHint('complete'),
          onClick: () => (bulkActive ? bulk!.onComplete() : completeTask(task)),
        },
        {
          label: 'Snooze…',
          icon: <ClockMenuIcon />,
          shortcut: shortcutHint('snooze'),
          submenu: ({ position, onClose, closeAll }) => (
            <SnoozeMenu
              position={position}
              onClose={onClose}
              onSnooze={(until) => { bulkActive ? bulk!.onSnooze(until) : snoozeTask(task, until); closeAll() }}
              onSomeday={() => { bulkActive ? bulk!.onSomeday() : setSomeday(task, true); closeAll() }}
            />
          ),
        },
        {
          label: 'Schedule',
          icon: <ScheduleMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ScheduleMenu
              position={position}
              onClose={onClose}
              onSchedule={(iso) => { bulkActive ? bulk!.onSchedule(iso) : rescheduleDue(task, iso); closeAll() }}
            />
          ),
        },
        {
          label: 'Repeat',
          icon: <RepeatMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'No repeat', onClick: () => { setRecurrence(task, null); closeAll() } },
                { label: 'Daily', onClick: () => { setRecurrence(task, 'FREQ=DAILY'); closeAll() } },
                { label: 'Weekly', onClick: () => { setRecurrence(task, 'FREQ=WEEKLY'); closeAll() } },
                { label: 'Monthly', onClick: () => { setRecurrence(task, 'FREQ=MONTHLY'); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Remind',
          icon: <BellMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => {
            const base = task.due_at || task.scheduled_start
            const offsets: { value: number | null; label: string }[] = [
              { value: null, label: 'No reminder' },
              { value: 0, label: 'At due time' },
              { value: 5, label: '5 min before' },
              { value: 15, label: '15 min before' },
              { value: 30, label: '30 min before' },
              { value: 60, label: '1 hr before' },
            ]
            return (
              <ContextMenu
                position={position}
                onClose={onClose}
                items={offsets.map((o) => ({
                  label: o.label,
                  disabled: o.value !== null && !base,
                  onClick: () => {
                    setReminder(task, o.value === null ? null : new Date(new Date(base!).getTime() - o.value * 60 * 1000).toISOString())
                    closeAll()
                  },
                }))}
              />
            )
          },
        },
        {
          label: 'Priority',
          icon: <FlagMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'None', onClick: () => { setPriority(task, null); closeAll() } },
                { label: '! Low', labelColor: priorityColor(3) ?? undefined, onClick: () => { setPriority(task, 3); closeAll() } },
                { label: '!! Medium', labelColor: priorityColor(2) ?? undefined, onClick: () => { setPriority(task, 2); closeAll() } },
                { label: '!!! Urgent', labelColor: priorityColor(1) ?? undefined, onClick: () => { setPriority(task, 1); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Duration',
          icon: <DurationMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'No duration', onClick: () => { setDuration(task, null); closeAll() } },
                { label: '15 min', onClick: () => { setDuration(task, 15); closeAll() } },
                { label: '30 min', onClick: () => { setDuration(task, 30); closeAll() } },
                { label: '1 hr', onClick: () => { setDuration(task, 60); closeAll() } },
                { label: '2 hr', onClick: () => { setDuration(task, 120); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Move to project',
          icon: <FolderMenuIcon />,
          shortcut: shortcutHint('project'),
          submenu: ({ position, onClose, closeAll }) => (
            <ProjectPicker
              position={position}
              projects={projects}
              domains={domains}
              currentProjectId={bulkActive ? null : task.project_id}
              onSelect={(projectId, domainId) => { bulkActive ? bulk!.onMove(projectId, domainId) : setProject(task, projectId, domainId); closeAll() }}
              onClose={onClose}
            />
          ),
        },
        {
          label: bulkActive ? `Delete (${bulk!.count})` : 'Delete',
          danger: true,
          icon: <TrashMenuIcon />,
          shortcut: shortcutHint('delete'),
          onClick: () => {
            if (bulkActive) { bulk!.onDelete(); return }
            const message = task.scheduled_start
              ? `Delete "${task.title}"? This also removes its scheduled calendar block.`
              : `Delete "${task.title}"?`
            if (window.confirm(message)) deleteTask(task)
          },
        },
      ]

  return (
    <div
      id={`task-${task.id}`}
      className="task-row"
      tabIndex={highlighted ? 0 : -1}
      onContextMenu={openMenu}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '12px 12px',
        margin: '0 -6px',
        borderRadius: selected ? 'var(--radius-input)' : undefined,
        borderBottom: '1px dashed var(--line-dashed)',
        boxShadow: highlighted ? '0 0 0 3px rgba(138,154,126,0.28)' : undefined,
        background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, transparent)' : undefined,
        opacity: done ? 0.55 : 1,
        outline: 'none',
      }}
    >
      {onToggleSelect && !done && !hideCheckbox && (
        <span
          onClick={onToggleSelect}
          className={selected ? undefined : 'task-row-hover'}
          style={{
            width: 15,
            height: 15,
            marginTop: 3,
            flex: 'none',
            borderRadius: 4,
            border: '1.5px solid var(--acc-sage)',
            background: selected ? 'var(--acc-sage)' : 'transparent',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bg-app)',
            fontSize: 10,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          {selected ? '✓' : ''}
        </span>
      )}
      {done ? (
        <span
          style={{
            width: 17,
            height: 17,
            borderRadius: 5,
            background: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-on-accent)',
            fontSize: 11,
            flex: 'none',
            marginTop: 2,
            cursor: 'pointer',
          }}
          onClick={() => uncompleteTask(task)}
        >
          ✓
        </span>
      ) : (
        <span
          onClick={() => completeTask(task)}
          style={{ width: 17, height: 17, border: '1.5px solid var(--line-sidebar)', borderRadius: 5, flex: 'none', marginTop: 2, cursor: 'pointer' }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, color: done ? 'var(--ink-hairline)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
            {task.title}
          </span>
          {!done && task.scheduled_start && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--acc-lavender-deep)',
                background: 'rgba(168,160,190,0.18)',
                border: '1px solid rgba(168,160,190,0.5)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {new Date(task.scheduled_start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          {!done && task.duration_min != null && chip(formatDuration(task.duration_min), 'var(--text-tertiary)')}
          {!done && tag && chip(tag.label, tag.color ?? 'var(--text-tertiary)', tag.color ? { borderColor: tag.color } : undefined)}
          {!done && priorityFlag(task.priority) && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: priorityColor(task.priority) ?? 'var(--acc-terra)' }}>
              {priorityFlag(task.priority)}
            </span>
          )}
          {!done && task.recurrence_rule && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>↻</span>}
          {overdue && chip(`${overdueDays}D AGO`, 'var(--acc-terra)', { borderColor: 'var(--acc-terra)' })}
        </div>
      </div>

      {!done && (
        <span
          onClick={() => toggleTop3(task)}
          title={task.top3 ? 'Remove from Top 3' : 'Add to Top 3'}
          style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--line-solid)', fontSize: 16, lineHeight: 1, cursor: 'pointer', flex: 'none', marginTop: 1 }}
        >
          {task.top3 ? '★' : '☆'}
        </span>
      )}

      {done ? (
        <div className="task-row-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <img src="assets/cherry/fallen.png" alt="" style={{ height: 22, width: 'auto', opacity: 0.7 }} />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hairline)' }}>a petal fell</span>
        </div>
      ) : (
        <div className="task-row-controls task-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <button
            type="button"
            onClick={openMenu}
            title="More actions"
            style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 16, letterSpacing: '0.1em', cursor: 'pointer', padding: '0 4px' }}
          >
            ⋯
          </button>
        </div>
      )}

      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} items={menuItems} />}
    </div>
  )
}
