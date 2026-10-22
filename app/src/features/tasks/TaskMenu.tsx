import { useState, type CSSProperties } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { DURATIONS, durationLabel } from '../../components/pickerMath'
import type { Task } from '../../lib/types'
import { createProject } from '../projects/api'
import { currentTop3 } from './api'
import { MovePicker } from './MovePicker'
import { placeKey, type MoveTarget } from './move'
import { shortcutHint } from './listShortcuts'
import { PlanMenu } from './PlanMenu'
import { RepeatEditor, RepeatMenu } from './RepeatMenu'
import { isOverdue } from './planMath'
import { LabelPicker } from './LabelPicker'
import { formatDuration, priorityColor } from './taskDisplay'
import { PRIORITY_LABELS, taskMenuSpec, type TaskMenuContext, type TaskMenuKey } from './taskMenuSpec'
import { useStartFocus } from '../today/startFocus'
import { putInSlotWithUndo, useCalendarRows } from '../calendar/api'
import { inSlot, upcomingSlots } from '../calendar/slots'
import { slotChip } from './taskSheetMath'

// ── The ⋯ menu of every task row (MK Action Sheet): phone = ActionSheet (+ a second sheet for the
// pickers), desktop = the ContextMenu with submenus. One list (./taskMenuSpec); the writes come in
// as TaskMenuActions (./useRowGrammar builds them). ──

/** Every write the menu (and the swipe) can make for a row. */
export interface TaskMenuActions {
  tomorrow: () => void
  /** `timed`: Pick date & time… set a time — that puts the task on the calendar (calendar/replan). */
  schedule: (iso: string, timed?: boolean) => void
  someday: () => void
  /** "Move to…": a project, an area, a domain or none (./move.ts). */
  move: (to: MoveTarget) => void
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
  /** After a Label picker tap (the task sheet's "Saved"); the picker writes itself (labels.ts
   * toggleLabel, with its Undo — P7e A17). */
  labels?: () => void
  /** Plan's Next free slot → Confirm (single task). */
  slot?: (startsAt: string, endsAt: string) => void
  /** A Top 3 row's Move up / Move down. */
  reorder?: (delta: -1 | 1) => void
  /** Opens the add line under the row (Subtasks A). */
  addSubtask?: () => void
  /** Duplicate: an open copy, its subtasks along (tasks/api duplicateTasksWithUndo). */
  duplicate?: () => void
  /** Snooze until `iso` (the SnoozeMenu) / back now (tasks/api snoozeTasksWithUndo, unsnoozeTasksWithUndo). */
  snooze: (iso: string) => void
  unsnooze: () => void
}

/** When 2+ tasks are selected, the date, project and delete actions of a selected row's menu act on
 * all of them (the page's bulk handlers). */
export interface BulkActions {
  count: number
  onTomorrow: () => void
  onSchedule: (iso: string, timed?: boolean) => void
  onSomeday: () => void
  onMove: (to: MoveTarget) => void
  onDelete: () => void
  /** Add to / Remove from Top 3 for the selection (Kai 2026-10-12). */
  onTop3?: () => void
  /** Duplicate every selected task, one Undo (Kai 2026-10-17). */
  onDuplicate: () => void
  /** Snooze every selected task until `iso`, one Undo (Kai 2026-10-17). */
  onSnooze: (iso: string) => void
}

/** 'date' = the Plan list (./PlanMenu), whose Pick date & time… is the date picker. */
export type MenuSub = 'date' | 'project' | 'priority' | 'repeat' | 'remind' | 'duration' | 'labels' | 'slot' | 'snooze'
export interface MenuAnchor {
  at: { x: number; y: number }
  /** Open straight on a picker (the swipe's Plan / Project, the task sheet's chips). */
  sub?: MenuSub
}

const ICONS: Record<TaskMenuKey, IconName> = {
  tomorrow: 'tomorrow', plan: 'pickdate', unschedule: 'calendar', intoSlot: 'clock', subtask: 'plus', snooze: 'moon', unsnooze: 'moon', project: 'project', priority: 'priority', repeat: 'repeat', remind: 'remind',
  labels: 'label', top3: 'star', goal: 'focus-ring', up: 'chevdown', down: 'chevdown', focus: 'focus', duplicate: 'duplicate', select: 'tasks', reopen: 'undo', delete: 'delete',
}
const ICON_STYLE: Partial<Record<TaskMenuKey, CSSProperties>> = { up: { transform: 'rotate(180deg)' } }
const KEYCAPS: Partial<Record<TaskMenuKey, string>> = {
  tomorrow: shortcutHint('tomorrow'), project: shortcutHint('project'), top3: shortcutHint('top3'), up: '⌥↑', down: '⌥↓', select: '⌃click', delete: shortcutHint('delete'),
  // P7e A18
  plan: shortcutHint('plan'), priority: shortcutHint('priority'), labels: shortcutHint('labels'), goal: shortcutHint('goal'), focus: shortcutHint('focus'),
  duplicate: shortcutHint('duplicate'), snooze: shortcutHint('snooze'), unsnooze: shortcutHint('snooze'),
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
  hint?: string
  selected?: boolean
}

export function TaskMenu({ task, anchor, onClose, actions, ctx }: {
  task: Task
  anchor: MenuAnchor
  onClose: () => void
  actions: TaskMenuActions
  ctx: TaskMenuContext
}) {
  const isMobile = useIsMobile()
  const startFocus = useStartFocus()
  const [sub, setSub] = useState<MenuSub | 'repeat-custom' | undefined>(anchor.sub)
  const { at } = anchor
  const base = task.due_at || task.scheduled_start
  // Time Slots (0073): the Time blocks of today and the next 7 days — "Into a slot…" puts the task in
  // one through the drop's own write (calendar/api putInSlotWithUndo), with Undo.
  const { data: rows = [] } = useCalendarRows()
  const slots = upcomingSlots(rows)
  const slotOptions: Option[] = slots.map((s) => ({ label: s.title, hint: slotChip(s.starts_at, s.ends_at, new Date()), selected: inSlot(task, s), run: () => putInSlotWithUndo(task, s) }))

  const options: Record<'priority' | 'remind' | 'duration' | 'slot', Option[]> = {
    slot: slotOptions,
    duration: [null, ...DURATIONS].map((m) => ({ label: m ? durationLabel(m) : 'None', run: () => actions.duration?.(m) })),
    priority: [null, 3, 2, 1].map((p) => ({ label: p ? PRIORITY_LABELS[p] : 'None', color: priorityColor(p) ?? undefined, run: () => actions.priority(p) })),
    remind: base
      ? REMIND_OFFSETS.map((o) => ({ label: o.label, run: () => actions.remind(o.min === null ? null : new Date(new Date(base).getTime() - o.min * 60_000).toISOString()) }))
      : [{ label: 'No reminder', run: () => actions.remind(null) }, { label: 'Pick a date first…', run: () => setSub('date') }],
  }
  const run: Record<TaskMenuKey, () => void> = {
    tomorrow: actions.tomorrow,
    plan: () => setSub('date'),
    unschedule: () => actions.unschedule?.(),
    intoSlot: () => setSub('slot'),
    subtask: () => actions.addSubtask?.(),
    snooze: () => setSub('snooze'),
    unsnooze: actions.unsnooze,
    project: () => setSub('project'),
    priority: () => setSub('priority'),
    labels: () => setSub('labels'),
    repeat: () => setSub('repeat'),
    remind: () => setSub('remind'),
    top3: actions.top3,
    goal: actions.goal,
    up: () => actions.reorder?.(-1),
    down: () => actions.reorder?.(1),
    focus: () => { onClose(); startFocus(task) },
    duplicate: () => actions.duplicate?.(),
    select: () => actions.select?.(),
    reopen: actions.reopen,
    delete: actions.delete,
  }
  // Read when the menu opens: overdue → "Replan…"; the goal of the day gets no Make goal.
  const spec = taskMenuSpec(task, { ...ctx, subtask: ctx.subtask ?? !!actions.addSubtask, slots: slots.length > 0, desktop: !isMobile, overdue: ctx.overdue ?? isOverdue(task), goal: ctx.goal ?? currentTop3()[0]?.id === task.id })

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
  // Snooze… — the Inbox's own menu (Later today · This evening · Tomorrow · Next week · Someday · Pick a date…).
  const snooze = (position: { x: number; y: number }, close: () => void, done: (run: () => void) => void) => (
    <SnoozeMenu position={position} title={ctx.bulkCount ? undefined : task.title} onClose={close} onSnooze={(iso) => done(() => actions.snooze(iso))} onSomeday={() => done(actions.someday)} />
  )
  if (sub === 'snooze') return snooze(at, onClose, (w) => w())
  const here = ctx.bulkCount ? null : placeKey(task)
  if (sub === 'project') {
    return (
      <MovePicker
        position={at}
        current={here}
        onPick={actions.move}
        onClose={onClose}
        meta={ctx.bulkCount ? undefined : task.title}
        onCreate={(name) => actions.move({ kind: 'project', id: createProject(name, null).id, domainId: null, name })}
      />
    )
  }
  // Repeat's presets and its Custom… rule editor (./RepeatMenu) — one picker for every surface.
  const repeat = { value: task.recurrence_rule, start: base, meta: task.title }
  if (sub === 'repeat') return <RepeatMenu {...repeat} position={at} onClose={onClose} onChange={actions.repeat} />
  if (sub === 'repeat-custom') return <RepeatEditor {...repeat} position={at} onClose={onClose} onChange={actions.repeat} />
  if (sub === 'labels') return <LabelPicker taskIds={[task.id]} position={at} onClose={onClose} meta={task.title} onSet={actions.labels} />
  if (sub) {
    const list = options[sub]
    const title = { priority: 'Priority', remind: 'Remind', duration: 'Duration', slot: 'Into a slot' }[sub]
    return isMobile
      ? <ActionSheet key={sub} title={title} meta={task.title} items={list.map((o) => ({ label: o.label, hint: o.hint, selected: o.selected, onSelect: o.run }))} onClose={onClose} />
      : <ContextMenu position={at} onClose={onClose} items={list.map((o) => ({ label: o.label, labelColor: o.color, hint: o.hint, onClick: o.run }))} />
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
    if (key === 'snooze') return ({ position, onClose: back, closeAll }) => snooze(position, back, (w) => { w(); closeAll() })
    if (key === 'project') return ({ position, onClose: back, closeAll }) => <MovePicker position={position} current={here} onPick={(to) => { actions.move(to); closeAll() }} onClose={back} />
    if (key === 'labels') return ({ position, onClose: back }) => <LabelPicker taskIds={[task.id]} position={position} onClose={back} onSet={actions.labels} />
    if (key === 'repeat') return ({ position, onClose: back, closeAll }) => <RepeatMenu {...repeat} position={position} onClose={back} onChange={(r) => { actions.repeat(r); closeAll() }} onCustom={() => setSub('repeat-custom')} />
    if (key === 'priority' || key === 'remind' || key === 'intoSlot') {
      const list = options[key === 'intoSlot' ? 'slot' : key]
      return ({ position, onClose: back, closeAll }) => <ContextMenu position={position} onClose={back} items={list.map((o) => ({ label: o.label, labelColor: o.color, hint: o.hint && (o.selected ? `✓ ${o.hint}` : o.hint), onClick: () => { o.run(); closeAll() } }))} />
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
