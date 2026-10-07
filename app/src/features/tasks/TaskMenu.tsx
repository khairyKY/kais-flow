import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { DURATIONS, durationLabel } from '../../components/pickerMath'
import { ProjectPicker } from '../../components/ProjectPicker'
import type { Domain, Project, Task } from '../../lib/types'
import { createProject } from '../projects/api'
import { currentTop3 } from './api'
import { shortcutHint } from './listShortcuts'
import { PlanMenu } from './PlanMenu'
import { isOverdue } from './planMath'
import { formatDuration, priorityColor } from './taskDisplay'
import { PRIORITY_LABELS, taskMenuSpec, type TaskMenuContext, type TaskMenuKey } from './taskMenuSpec'
import { useStartFocus } from '../today/startFocus'

// ── The ⋯ menu of every task row (MK Action Sheet): phone = ActionSheet (+ a second sheet for the
// pickers), desktop = the ContextMenu with submenus. One list (./taskMenuSpec); the writes come in
// as TaskMenuActions (./useRowGrammar builds them). ──

/** Every write the menu (and the swipe) can make for a row. */
export interface TaskMenuActions {
  tomorrow: () => void
  /** `timed`: Pick date & time… set a time — that puts the task on the calendar (calendar/replan). */
  schedule: (iso: string, timed?: boolean) => void
  someday: () => void
  move: (projectId: string | null, domainId: string | null) => void
  priority: (priority: number | null) => void
  repeat: (rule: string | null) => void
  remind: (iso: string | null) => void
  top3: () => void
  /** Make goal of the day. */
  goal: () => void
  reopen: () => void
  delete: () => void
  select?: () => void
  unschedule?: () => void
  /** The date picker's No date (single task). */
  clearDate?: () => void
  /** The task sheet's Duration chip. */
  duration?: (min: number | null) => void
  /** Plan's Next free slot → Confirm (single task). */
  slot?: (startsAt: string, endsAt: string) => void
  /** A Top 3 row's Move up / Move down. */
  reorder?: (delta: -1 | 1) => void
}

/** When 2+ tasks are selected, the date, project and delete actions of a selected row's menu act on
 * all of them (the page's bulk handlers). */
export interface BulkActions {
  count: number
  onTomorrow: () => void
  onSchedule: (iso: string, timed?: boolean) => void
  onSomeday: () => void
  onMove: (projectId: string | null, domainId: string | null) => void
  onDelete: () => void
}

/** 'date' = the Plan list (./PlanMenu), whose Pick date & time… is the date picker. */
export type MenuSub = 'date' | 'project' | 'priority' | 'repeat' | 'remind' | 'duration'
export interface MenuAnchor {
  at: { x: number; y: number }
  /** Open straight on a picker (the swipe's Plan / Project, the task sheet's chips). */
  sub?: MenuSub
}

const ICONS: Record<TaskMenuKey, IconName> = {
  plan: 'pickdate', unschedule: 'calendar', project: 'project', priority: 'priority', repeat: 'repeat', remind: 'remind',
  top3: 'star', goal: 'focus-ring', up: 'chevdown', down: 'chevdown', focus: 'focus', select: 'tasks', reopen: 'undo', delete: 'delete',
}
const ICON_STYLE: Partial<Record<TaskMenuKey, CSSProperties>> = { up: { transform: 'rotate(180deg)' } }
const KEYCAPS: Partial<Record<TaskMenuKey, string>> = {
  project: shortcutHint('project'), top3: shortcutHint('top3'), up: '⌥↑', down: '⌥↓', select: '⌃click', delete: shortcutHint('delete'),
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
  const [sub, setSub] = useState<MenuSub | undefined>(anchor.sub)
  const { at } = anchor
  const base = task.due_at || task.scheduled_start

  const options: Record<'priority' | 'repeat' | 'remind' | 'duration', Option[]> = {
    duration: [null, ...DURATIONS].map((m) => ({ label: m ? durationLabel(m) : 'None', run: () => actions.duration?.(m) })),
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
    plan: () => setSub('date'),
    unschedule: () => actions.unschedule?.(),
    project: () => setSub('project'),
    priority: () => setSub('priority'),
    repeat: () => setSub('repeat'),
    remind: () => setSub('remind'),
    top3: actions.top3,
    goal: actions.goal,
    up: () => actions.reorder?.(-1),
    down: () => actions.reorder?.(1),
    focus: () => { onClose(); startFocus(task) },
    select: () => actions.select?.(),
    reopen: actions.reopen,
    delete: actions.delete,
  }
  // Read when the menu opens: overdue → "Replan…"; the goal of the day gets no Make goal.
  const spec = taskMenuSpec(task, { ...ctx, overdue: ctx.overdue ?? isOverdue(task), goal: ctx.goal ?? currentTop3()[0]?.id === task.id })

  // One task: the Plan list offers No date when it has one, and Next free slot.
  const bulk = !!ctx.bulkCount && ctx.bulkCount > 1
  const clearDate = !bulk && task.due_at ? actions.clearDate : undefined
  const plan = (done: (run: () => void) => void, position: { x: number; y: number }, close: () => void) => (
    <PlanMenu
      task={task}
      bulkCount={ctx.bulkCount}
      position={position}
      blockTomorrow={ctx.canUnschedule ? { hint: ctx.tomorrowHint } : undefined}
      onClose={close}
      actions={{
        schedule: (iso, timed) => done(() => actions.schedule(iso, timed)),
        tomorrow: () => done(actions.tomorrow),
        slot: bulk || !actions.slot ? undefined : (s, e) => done(() => actions.slot!(s, e)),
        someday: () => done(actions.someday),
        clearDate: clearDate && (() => done(clearDate)),
      }}
    />
  )
  if (sub === 'date') return plan((w) => w(), at, onClose)
  if (sub === 'project') {
    return (
      <ProjectPicker
        position={at}
        projects={projects}
        domains={domains}
        currentProjectId={ctx.bulkCount ? null : task.project_id}
        onSelect={actions.move}
        onClose={onClose}
        meta={ctx.bulkCount ? undefined : task.title}
        onCreate={(name) => actions.move(createProject(name, null).id, null)}
      />
    )
  }
  if (sub) {
    const list = options[sub]
    const title = { priority: 'Priority', repeat: 'Repeat', remind: 'Remind', duration: 'Duration' }[sub]
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
        items={spec.map((e) => ({ label: e.label, hint: e.hint, destructive: e.destructive, chevron: e.sub, icon: <Icon name={ICONS[e.key]} size={24} style={ICON_STYLE[e.key]} />, onSelect: run[e.key] }))}
      />
    )
  }

  const submenu = (key: TaskMenuKey): ContextMenuItem['submenu'] => {
    if (key === 'plan') return ({ position, onClose: back, closeAll }) => plan((w) => { w(); closeAll() }, position, back)
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
      items={spec.map((e) => ({ label: e.label, danger: e.destructive, icon: <Icon name={ICONS[e.key]} size={16} style={ICON_STYLE[e.key]} />, shortcut: KEYCAPS[e.key], onClick: run[e.key], submenu: submenu(e.key) }))}
    />
  )
}
