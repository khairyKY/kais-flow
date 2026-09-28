import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { ProjectPicker } from '../../components/ProjectPicker'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import type { Domain, Project, Task } from '../../lib/types'
import { shortcutHint } from './listShortcuts'
import { formatDuration, priorityColor } from './taskDisplay'
import { PRIORITY_LABELS, taskMenuSpec, type TaskMenuContext, type TaskMenuKey } from './taskMenuSpec'
import { useStartFocus } from '../today/startFocus'

// ── The ⋯ menu of every task row (MK Action Sheet): phone = ActionSheet (+ a second sheet for the
// pickers), desktop = the ContextMenu with submenus. One list (./taskMenuSpec); the writes come in
// as TaskMenuActions (./useRowGrammar builds them). ──

/** Every write the menu (and the swipe) can make for a row. */
export interface TaskMenuActions {
  tomorrow: () => void
  schedule: (iso: string) => void
  someday: () => void
  move: (projectId: string | null, domainId: string | null) => void
  priority: (priority: number | null) => void
  repeat: (rule: string | null) => void
  remind: (iso: string | null) => void
  top3: () => void
  reopen: () => void
  delete: () => void
  select?: () => void
  unschedule?: () => void
  /** The date picker's No date (single task). */
  clearDate?: () => void
}

/** When 2+ tasks are selected, the date, project and delete actions of a selected row's menu act on
 * all of them (the page's bulk handlers). */
export interface BulkActions {
  count: number
  onTomorrow: () => void
  onSchedule: (iso: string) => void
  onSomeday: () => void
  onMove: (projectId: string | null, domainId: string | null) => void
  onDelete: () => void
}

type Sub = 'date' | 'project' | 'priority' | 'repeat' | 'remind'
export interface MenuAnchor {
  at: { x: number; y: number }
  /** Open straight on a picker (the swipe's Pick date / Project). */
  sub?: Sub
}

const ICONS: Record<TaskMenuKey, IconName> = {
  tomorrow: 'tomorrow', date: 'pickdate', unschedule: 'calendar', project: 'project', priority: 'priority',
  repeat: 'repeat', remind: 'remind', top3: 'star', focus: 'focus', select: 'tasks', reopen: 'undo', delete: 'delete',
}
const KEYCAPS: Partial<Record<TaskMenuKey, string>> = {
  tomorrow: shortcutHint('tomorrow'), project: shortcutHint('project'), top3: shortcutHint('top3'), select: '⌃click', delete: shortcutHint('delete'),
}
const REMIND_OFFSETS: { min: number | null; label: string }[] = [
  { min: null, label: 'No reminder' },
  { min: 0, label: 'At due time' },
  { min: 5, label: '5 min before' },
  { min: 15, label: '15 min before' },
  { min: 30, label: '30 min before' },
  { min: 60, label: '1 hr before' },
]

interface Option {
  label: string
  run: () => void
  color?: string
}

export function TaskMenu({ task, anchor, onClose, actions, ctx, projects, domains }: {
  task: Task
  anchor: MenuAnchor
  onClose: () => void
  actions: TaskMenuActions
  ctx: TaskMenuContext
  projects: Project[]
  domains: Domain[]
}) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const startFocus = useStartFocus()
  const [sub, setSub] = useState<Sub | undefined>(anchor.sub)
  const { at } = anchor
  const base = task.due_at || task.scheduled_start

  const options: Record<'priority' | 'repeat' | 'remind', Option[]> = {
    priority: [null, 3, 2, 1].map((p) => ({ label: p ? PRIORITY_LABELS[p] : 'None', color: priorityColor(p) ?? undefined, run: () => actions.priority(p) })),
    repeat: [
      { label: 'Never', run: () => actions.repeat(null) },
      { label: 'Daily', run: () => actions.repeat('FREQ=DAILY') },
      { label: 'Weekly', run: () => actions.repeat('FREQ=WEEKLY') },
      { label: 'Monthly', run: () => actions.repeat('FREQ=MONTHLY') },
      // No rrule editor yet: Custom… opens the task, whose Repeat field has the rest.
      { label: 'Custom…', run: () => navigate(`/tasks/${task.id}`) },
    ],
    remind: base
      ? REMIND_OFFSETS.map((o) => ({ label: o.label, run: () => actions.remind(o.min === null ? null : new Date(new Date(base).getTime() - o.min * 60_000).toISOString()) }))
      : [{ label: 'No reminder', run: () => actions.remind(null) }, { label: 'Pick a date first…', run: () => setSub('date') }],
  }
  const run: Record<TaskMenuKey, () => void> = {
    tomorrow: actions.tomorrow,
    date: () => setSub('date'),
    unschedule: () => actions.unschedule?.(),
    project: () => setSub('project'),
    priority: () => setSub('priority'),
    repeat: () => setSub('repeat'),
    remind: () => setSub('remind'),
    top3: actions.top3,
    focus: () => { onClose(); startFocus(task) },
    select: () => actions.select?.(),
    reopen: actions.reopen,
    delete: actions.delete,
  }
  const spec = taskMenuSpec(task, ctx)

  // One task: the picker shows its day and offers No date; a bulk pick starts blank.
  const due = ctx.bulkCount ? null : task.due_at
  const clearDate = due ? actions.clearDate : undefined
  if (sub === 'date') {
    return <ScheduleMenu position={at} title={ctx.bulkCount ? undefined : task.title} value={due} onClose={onClose} onSchedule={actions.schedule} onSomeday={actions.someday} onClear={clearDate} />
  }
  if (sub === 'project' && !isMobile) {
    return <ProjectPicker position={at} projects={projects} domains={domains} currentProjectId={ctx.bulkCount ? null : task.project_id} onSelect={actions.move} onClose={onClose} />
  }
  if (sub) {
    const list: Option[] = sub === 'project'
      ? [{ label: 'No project', run: () => actions.move(null, null) }, ...projects.map((p) => ({ label: p.name, run: () => actions.move(p.id, p.domain_id ?? null) }))]
      : options[sub]
    const title = { project: 'Move to project', priority: 'Priority', repeat: 'Repeat', remind: 'Remind' }[sub]
    return isMobile
      ? <ActionSheet key={sub} title={title} meta={task.title} items={list.map((o) => ({ label: o.label, onSelect: o.run }))} onClose={onClose} />
      : <ContextMenu position={at} onClose={onClose} items={list.map((o) => ({ label: o.label, labelColor: o.color, onClick: o.run }))} />
  }

  if (isMobile) {
    const meta = [ctx.projectName, task.duration_min != null ? formatDuration(task.duration_min) : null].filter(Boolean).join(' · ')
    return (
      // Keyed: a picker chosen from this sheet mounts a fresh sheet instead of inheriting this one's exit.
      <ActionSheet
        key="menu"
        title={task.title}
        meta={meta || undefined}
        onClose={onClose}
        items={spec.map((e) => ({ label: e.label, hint: e.hint, destructive: e.destructive, chevron: e.sub, icon: <Icon name={ICONS[e.key]} size={24} />, onSelect: run[e.key] }))}
      />
    )
  }

  const submenu = (key: TaskMenuKey): ContextMenuItem['submenu'] => {
    if (key === 'date') return ({ position, onClose: back, closeAll }) => <ScheduleMenu position={position} value={due} onClose={back} onSchedule={(iso) => { actions.schedule(iso); closeAll() }} onSomeday={() => { actions.someday(); closeAll() }} onClear={clearDate && (() => { clearDate(); closeAll() })} />
    if (key === 'project') return ({ position, onClose: back, closeAll }) => <ProjectPicker position={position} projects={projects} domains={domains} currentProjectId={ctx.bulkCount ? null : task.project_id} onSelect={(p, d) => { actions.move(p, d); closeAll() }} onClose={back} />
    if (key === 'priority' || key === 'repeat' || key === 'remind') {
      const list = options[key]
      return ({ position, onClose: back, closeAll }) => <ContextMenu position={position} onClose={back} items={list.map((o) => ({ label: o.label, labelColor: o.color, onClick: () => { o.run(); closeAll() } }))} />
    }
    return undefined
  }
  return (
    <ContextMenu
      position={at}
      onClose={onClose}
      items={spec.map((e) => ({ label: e.label, danger: e.destructive, icon: <Icon name={ICONS[e.key]} size={16} />, shortcut: KEYCAPS[e.key], onClick: run[e.key], submenu: submenu(e.key) }))}
    />
  )
}
