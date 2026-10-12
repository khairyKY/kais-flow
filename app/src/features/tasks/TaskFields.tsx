import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Checkbox, Chip } from '../../components/kit'
import { RenameField } from '../../components/RenameField'
import { durationLabel } from '../../components/pickerMath'
import { tomorrowHint } from '../../lib/dateShortcuts'
import { useToastStore } from '../../lib/toastStore'
import { uiZoom } from '../../lib/uiScale'
import type { CalendarEvent, Task } from '../../lib/types'
import { deleteEventWithUndo } from '../calendar/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { usePaperStore } from '../paper/paperStore'
import { useProjects } from '../projects/api'
import { currentTop3, deleteTasksWithUndo, duplicateTaskWithUndo, makeGoalWithUndo, renameTask, setDuration, setLabels, toggleTaskWithUndo } from './api'
import { placeName } from './move'
import { useOpenTask } from './openTask'
import { RowMenuButton } from './SwipeRow'
import { TaskMenu, type MenuSub, type TaskMenuActions } from './TaskMenu'
import { dueChip, remindChip, repeatLabel } from './taskSheetMath'
import { taskActions } from './useRowGrammar'
import type { useTaskDraft } from './useTaskDraft'
import './TaskRow.css'

// ── One set of task controls (Kai 2026-10-12: the desktop editor lagged the phone sheet). The phone
// task sheet, the desktop task popover (Overlays.dc.html "Task detail") and the editor page
// (Editor.dc.html 1a) all edit a task through these: the row ⋯ menu's actions and pickers (TaskMenu:
// Plan, Move to…, Priority, Repeat + Custom…, Remind, Duration), the chip row, the ⋯ list (Make
// goal, Duplicate, Copy link, Unschedule, Delete) and the subtask rows. Every edit writes at once. ──

type Point = { x: number; y: number }

/** Where a picker opened from a chip or field goes: under it (screen px, like DateField). */
export function anchorUnder(e: ReactMouseEvent<Element>): Point {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 * uiZoom() }
}

/** A task surface's controls: `actions` (the row menu's writes, each reporting the field it changed
 * through `onSaved` — the sheet's "Saved" flicker), `open(sub, at)` for a picker, and `menu`, the
 * picker to render while one is open. */
export function useTaskControls(task: Task, onSaved?: (field: string) => void) {
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const [picker, setPicker] = useState<{ sub: MenuSub; at: Point } | null>(null)
  const edit = (field: string, write: () => void) => {
    write()
    onSaved?.(field)
  }
  const a = taskActions(task)
  const on = <A extends unknown[]>(field: string, write: (...args: A) => void) => (...args: A) => edit(field, () => write(...args))
  const actions: TaskMenuActions = {
    ...a,
    schedule: on('date', a.schedule),
    tomorrow: on('date', a.tomorrow),
    slot: a.slot && on('date', a.slot),
    clearDate: a.clearDate && on('date', a.clearDate),
    someday: on('date', a.someday),
    move: on('project', a.move),
    priority: on('priority', a.priority),
    repeat: on('repeat', a.repeat),
    remind: on('remind', a.remind),
    duration: on('duration', (m: number | null) => setDuration(task, m)),
    labels: on('labels', (l: string[]) => setLabels(task, l)),
    top3: on('top3', a.top3),
    goal: on('top3', a.goal),
  }
  const place = placeName(task, projects, areas, domains)
  return {
    actions,
    edit,
    place,
    /** Opens a picker under the chip / field that was clicked (a phone ignores the point). */
    open: (sub: MenuSub, at: Point | ReactMouseEvent<Element> = { x: 0, y: 0 }) => setPicker({ sub, at: 'currentTarget' in at ? anchorUnder(at) : at }),
    menu: picker && (
      <TaskMenu
        key={picker.sub}
        task={task}
        anchor={{ at: picker.at, sub: picker.sub }}
        onClose={() => setPicker(null)}
        actions={actions}
        ctx={{ tomorrowHint: tomorrowHint(), projectName: place }}
      />
    ),
  }
}
export type TaskControls = ReturnType<typeof useTaskControls>

const PILL: CSSProperties = { borderRadius: 'var(--radius-pill)' }
const DASHED: CSSProperties = { ...PILL, border: '1px dashed var(--line-control)' }

/** The chip row (Task Sheet.dc.html 4a; the popover's chips): date · duration · place · priority ·
 * repeat · remind · labels (or a dashed Label). A set chip shows its value, an unset one is dashed;
 * each opens its picker — every label chip opens the Label picker (./LabelPicker), where a tap
 * adds or takes one off. `ringed`: the field whose write is still queued offline (4k). */
export function TaskChips({ task, controls, ringed, now = new Date() }: { task: Task; controls: TaskControls; ringed?: string | null; now?: Date }) {
  const { open, place } = controls
  const chip = (field: MenuSub, value: ReactNode, tone: 'date' | 'duration' | 'project' | 'priority', icon?: IconName) => (
    <Chip key={field} tone={tone} icon={icon && <Icon name={icon} size={16} />} selected={ringed === field} onClick={(e) => open(field, e)}>
      {value}
    </Chip>
  )
  const unset = (field: MenuSub, name: string, icon: IconName) => (
    <Chip key={field} tone="bordered" icon={<Icon name={icon} size={16} />} style={DASHED} onClick={(e) => open(field, e)}>
      {name}
    </Chip>
  )
  return (
    <div className="ts-chips">
      {task.due_at ? chip('date', dueChip(task.due_at, now), 'date') : unset('date', 'Date', 'calendar')}
      {task.duration_min ? chip('duration', durationLabel(task.duration_min), 'duration') : unset('duration', 'Duration', 'clock')}
      {place ? chip('project', <EmojiText text={place} />, 'project') : unset('project', 'Move to…', 'projects')}
      {task.priority ? chip('priority', `P${task.priority}`, 'priority') : unset('priority', 'Priority', 'priority')}
      {task.recurrence_rule ? chip('repeat', repeatLabel(task.recurrence_rule), 'date', 'repeat') : unset('repeat', 'Repeat', 'repeat')}
      {task.reminder_at ? chip('remind', remindChip(task.reminder_at, task.due_at), 'date', 'remind') : unset('remind', 'Remind', 'remind')}
      {task.labels.map((l) => (
        <Chip key={`label-${l}`} tone="bordered" icon={<Icon name="label" size={16} />} style={PILL} selected={ringed === 'labels'} onClick={(e) => open('labels', e)}>
          {l}
        </Chip>
      ))}
      {task.labels.length === 0 && unset('labels', 'Label', 'label')}
    </div>
  )
}

/** Copies the task's address (/tasks/:id — the editor on desktop, the sheet over Tasks on a phone). */
export function copyTaskLink(task: Task): void {
  const push = useToastStore.getState().push
  const url = `${window.location.origin}/tasks/${task.id}`
  void (navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('no clipboard'))).then(
    () => push({ message: 'Link copied' }),
    () => push({ message: "Couldn't copy the link" }),
  )
}

/** The task's ⋯ list (SCREENS §Task sheet): Make goal of the day (open, not already the goal) ·
 * Duplicate · Copy link · Unschedule (on the calendar) · Delete. Phone = action sheet; desktop = menu
 * at `at`. `onDelete` lets a surface leave before the row does (the sheet closes first). */
export function TaskMoreMenu({ task, at, meta, block, onClose, onDelete, edit }: {
  task: Task
  at: Point
  meta?: string
  block?: CalendarEvent | null
  onClose: () => void
  onDelete?: () => void
  edit: TaskControls['edit']
}) {
  const isMobile = useIsMobile()
  const done = task.status === 'done' || !!task.completed_at
  const items: { label: string; icon: IconName; hint?: string; destructive?: boolean; run: () => void }[] = [
    // Kai 2026-10-07: the goal of the day from the task itself (not on the goal, not once done).
    ...(done || currentTop3()[0]?.id === task.id ? [] : [{ label: 'Make goal of the day', icon: 'focus-ring' as const, run: () => edit('top3', () => makeGoalWithUndo(task)) }]),
    { label: 'Duplicate', icon: 'duplicate', run: () => duplicateTaskWithUndo(task) },
    { label: 'Copy link', icon: 'link', run: () => copyTaskLink(task) },
    ...(block ? [{ label: 'Unschedule', icon: 'calendar' as const, run: () => edit('schedule', () => deleteEventWithUndo(block, 'Unscheduled')) }] : []),
    { label: 'Delete', icon: 'delete', hint: 'Undo 6s', destructive: true, run: onDelete ?? (() => deleteTasksWithUndo([task])) },
  ]
  return isMobile ? (
    <ActionSheet title={task.title} meta={meta} onClose={onClose} items={items.map((i) => ({ label: i.label, icon: <Icon name={i.icon} size={24} />, hint: i.hint, destructive: i.destructive, onSelect: i.run }))} />
  ) : (
    <ContextMenu position={at} onClose={onClose} items={items.map((i) => ({ label: i.label, danger: i.destructive, icon: <Icon name={i.icon} size={16} />, onClick: i.run }))} />
  )
}

/** "From a photo of your page" (Paper capture: reopens the photo, kept 7 days) — or null. */
export function PhotoSource({ task, className, style }: { task: Task; className?: string; style?: CSSProperties }) {
  if (task.external_ref?.source !== 'photo') return null
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => {
        const [captureId, page] = task.external_ref!.id.split(':')
        usePaperStore.getState().show({ kind: 'photo', captureId, page: Number(page) || 0 })
      }}
    >
      <Icon name="camera" size={16} />
      From a photo of your page
    </button>
  )
}

/** One subtask row: its box checks it off, a tap on the title opens it (sheet / popover), ⋯ or
 * right-click → Rename · Delete (Trash + Undo). Sheet, popover and editor share it; `dense` is the
 * desktop editor's 16px box and 13.5px type (Editor.dc.html 1a). */
export function SubtaskRow({ sub, edit, dense }: { sub: Task; edit: TaskControls['edit']; dense?: boolean }) {
  const isMobile = useIsMobile()
  const openTask = useOpenTask()
  const [menu, setMenu] = useState<Point | null>(null)
  const [renaming, setRenaming] = useState(false)
  const done = sub.status === 'done'
  const items = [
    { label: 'Rename', icon: 'journal' as const, run: () => setRenaming(true) },
    { label: 'Delete', icon: 'delete' as const, destructive: true, run: () => deleteTasksWithUndo([sub]) },
  ]
  return (
    <div
      id={`sub-${sub.id}`}
      className={`ts-sub${dense ? ' is-dense' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <span className="ts-box">
        <Checkbox subtask checked={done} size={dense ? 16 : undefined} label={sub.title} onChange={() => edit('subtasks', () => toggleTaskWithUndo(sub))} />
      </span>
      {renaming ? (
        <span className="ts-sub-title" style={{ flex: 1 }}>
          <RenameField
            value={sub.title}
            ariaLabel="Subtask title"
            onDone={(next) => {
              setRenaming(false)
              if (next && next !== sub.title) edit('subtasks', () => renameTask(sub, next))
            }}
          />
        </span>
      ) : (
        <button type="button" className={`ts-sub-title ts-sub-open${done ? ' is-done' : ''}`} onClick={(e) => openTask(sub.id, undefined, e.currentTarget.closest('.ts-sub'))}>
          <EmojiText text={sub.title} />
        </button>
      )}
      {sub.duration_min != null && <span className="ts-sub-meta">{durationLabel(sub.duration_min)}</span>}
      <RowMenuButton title={sub.title} onOpen={setMenu} />
      {menu &&
        (isMobile ? (
          <ActionSheet title={sub.title} meta="Subtask" onClose={() => setMenu(null)} items={items.map((i) => ({ label: i.label, icon: <Icon name={i.icon} size={24} />, destructive: i.destructive, hint: i.destructive ? 'Undo 6s' : undefined, onSelect: i.run }))} />
        ) : (
          <ContextMenu position={menu} onClose={() => setMenu(null)} items={items.map((i) => ({ label: i.label, danger: i.destructive, icon: <Icon name={i.icon} size={16} />, onClick: i.run }))} />
        ))}
    </div>
  )
}

/** The Subtasks section: its heading (done/total), the rows, and the add line — Enter adds one.
 * One level deep: callers leave it out on a task that is itself a child. */
export function SubtaskList({ subs, draft, edit, dense }: { subs: Task[]; draft: ReturnType<typeof useTaskDraft>; edit: TaskControls['edit']; dense?: boolean }) {
  const done = subs.filter((c) => c.status === 'done').length
  // The editor says "1 of 3" (Editor.dc.html 1a), the sheet "1/3" (Task Sheet.dc.html 4b).
  const count = subs.length > 0 ? ` · ${done}${dense ? ' of ' : '/'}${subs.length}` : ''
  return (
    <>
      <div className="ts-sec">Subtasks{count}</div>
      {subs.map((c) => (
        <SubtaskRow key={c.id} sub={c} edit={edit} dense={dense} />
      ))}
      <label className={`ts-sub${dense ? ' is-dense' : ''}`}>
        <span className="ts-box">
          <Icon name="plus" size={dense ? 16 : 20} />
        </span>
        <input
          className="ts-sub-add"
          value={draft.subtask}
          placeholder={dense ? 'Add a subtask…' : 'Add a subtask'}
          enterKeyHint="done"
          onChange={(e) => draft.setSubtask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            draft.addSubtask()
          }}
        />
        {dense && <span className="ts-sub-meta">enter to add</span>}
      </label>
    </>
  )
}
