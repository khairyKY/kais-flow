import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { DatePicker, Popover } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button } from '../../components/kit'
import { durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { ProjectPicker } from '../../components/ProjectPicker'
import { SheetTitle, TimePanel } from '../../components/TimePicker'
import { uiZoom } from '../../lib/uiScale'
import type { CalendarEvent, CalendarEventType, Task } from '../../lib/types'
import { useDomains } from '../domains/api'
import { TaskPicker } from '../focus/TaskPicker'
import { useProjects } from '../projects/api'
import { completeTaskWithUndo, uncompleteTask, useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { deleteEventWithUndo, deleteSeriesWithUndo, linkTaskWithUndo, moveToDayWithUndo, retimeEventWithUndo, setEventRemindWithUndo, setEventRepeat, updateEvent } from './api'
import { BLOCK_MENU_WIDTH, EVENT_REMIND, blockMenuSpec, isRepeatingBlock, isSynced, isUntitled, type BlockMenuEntry, type BlockMenuKey } from './blockMenuSpec'
import { RepeatEditor, RepeatMenu } from '../tasks/RepeatMenu'
import { ColorDots } from './formFields'
import { eventSpan } from './phoneGridMath'

// ── design-export/Calendar.dc.html §5 "Block detail — a menu, not a form" (desktop): a 238px popover
// beside the clicked block in the Tasks context menu's own language — it IS the kit ContextMenu,
// with the block's title row on top. Every row commits on selection; Esc or a click outside closes
// it and the block is already updated (the title saves as the popover goes). The rows are
// ./blockMenuSpec, shared with the phone's event sheet. Replaced EventDetailsPanel (the rejected
// form). ──

const ICONS: Record<BlockMenuKey, IconName> = {
  date: 'calendar', time: 'clock', project: 'project', repeat: 'repeat', remind: 'remind', complete: 'check', open: 'tasks', replan: 'pickdate',
  link: 'plus', more: 'dots', unschedule: 'plus', delete: 'delete', google: 'calendar',
}

/** §5c's Duration submenu. */
const LENGTHS: { min: number; label: string }[] = [
  { min: 15, label: 'Quick' },
  { min: 30, label: 'Short' },
  { min: 60, label: 'Standard' },
  { min: 120, label: 'Deep' },
]

// B (D5): a caption is metadata — sentence case, untracked, even digits.
const CAPTION: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-faint)' }
const check = <Icon name="check" size={13} style={{ color: 'var(--acc-terra)' }} />

/** The swatch a block wears: its own colour, else its kind's (a meeting blossom, a task / block lavender). */
function blockDot(e: CalendarEvent): string {
  return e.color ?? (e.type === 'event' && !e.task_id ? 'var(--acc-blossom)' : 'var(--acc-lavender)')
}

/** The open, unplaced tasks Link a task… offers. */
const linkable = (tasks: readonly Task[]) => tasks.filter((t) => t.status === 'todo' && !t.scheduled_start && !t.deleted_at)

function TitleRow({ event, untitled, gone, readOnly }: { event: CalendarEvent; untitled: boolean; gone: React.RefObject<boolean>; readOnly?: boolean }) {
  const [draft, setDraft] = useState(untitled ? '' : event.title)
  const [colourAt, setColourAt] = useState<{ x: number; y: number } | null>(null)
  const latest = useRef({ draft, event })
  latest.current = { draft, event }
  const commit = () => {
    const name = latest.current.draft.trim()
    if (!gone.current && name && name !== latest.current.event.title) updateEvent(latest.current.event, { title: name })
  }
  useEffect(() => commit, []) // eslint-disable-line react-hooks/exhaustive-deps -- closing (Esc, a click outside) saves it
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 9px 7px' }}>
      <style>{'.kf-bm-title::placeholder { color: var(--ink-faint); } .kf-bm-dot:focus-visible { outline: none; box-shadow: var(--focus-ring); }'}</style>
      {/* Kai 2026-10-12: the colour changes after creation — the title's dot opens the swatches. */}
      <button
        type="button"
        className="kf-bm-dot"
        aria-label="Colour"
        disabled={readOnly}
        aria-haspopup="menu"
        aria-expanded={!!colourAt}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setColourAt((at) => (at ? null : { x: r.left, y: r.bottom + 4 * uiZoom() }))
        }}
        style={{ flex: 'none', width: 15, height: 15, margin: '1px -4px 0', padding: 0, border: 'none', borderRadius: '50%', background: 'none', cursor: readOnly ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: blockDot(event) }} />
      </button>
      <textarea
        className="kf-bm-title"
        aria-label="Title"
        readOnly={readOnly}
        rows={1}
        autoFocus={untitled}
        value={draft}
        placeholder="Add title"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          e.currentTarget.blur()
        }}
        style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'none', padding: 0, margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-s)', fontWeight: 500, lineHeight: 1.35, color: 'var(--ink-body)', fieldSizing: 'content' } as CSSProperties}
      />
      {colourAt && (
        <ContextMenu
          position={colourAt}
          onClose={() => setColourAt(null)}
          items={[]}
          label="Colour"
          width={196}
          header={
            <div style={{ padding: 6 }}>
              <ColorDots
                value={event.color ?? null}
                size={18}
                onChange={(c) => {
                  if (c !== (event.color ?? null)) updateEvent(event, { color: c })
                  setColourAt(null)
                }}
              />
            </div>
          }
        />
      )}
    </div>
  )
}

/** §5c Custom…: the MK Time Picker's panel (start · duration) in the date picker's popover. */
function CustomTime({ event, position, onDone, onClose }: { event: CalendarEvent; position: { x: number; y: number }; onDone: () => void; onClose: () => void }) {
  const span = eventSpan(event)
  const [time, setTime] = useState(fromMin(span.start))
  const [len, setLen] = useState(span.end - span.start)
  return (
    <Popover
      title={<SheetTitle title="Time" meta={event.title} />}
      position={position}
      focusKey={null}
      onClose={onClose}
      footer={
        <Button
          type="button"
          onClick={() => {
            const start = toMin(time)
            if (start !== span.start || start + len !== span.end) retimeEventWithUndo(event, span, { ...span, start, end: start + len })
            onDone()
          }}
        >
          Done
        </Button>
      }
    >
      <TimePanel day={span.day} value={time} onValue={setTime} duration={len} onDuration={setLen} />
    </Popover>
  )
}

export function BlockMenu({ event, position, onClose, onReplan }: {
  event: CalendarEvent
  /** Screen px — besideBlock() of the block. */
  position: { x: number; y: number }
  onClose: () => void
  /** A missed task block's Replan…: the calendar's Plan menu at this point. */
  onReplan?: (x: number, y: number) => void
}) {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const openTask = useOpenTask()
  const gone = useRef(false)
  const [untitled] = useState(() => isUntitled(event))
  const task = event.task_id ? tasks.find((t) => t.id === event.task_id) : undefined
  const project = event.project_id ? projects.find((p) => p.id === event.project_id) : undefined
  const missed = !!task && task.status === 'todo' && Date.parse(event.ends_at) < Date.now()
  const spec = blockMenuSpec(event, { task, projectName: project?.name, missed })
  // A Google event (B1): its rows say when and where from; nothing opens, nothing changes.
  const synced = isSynced(event)
  const span = eventSpan(event)
  const len = span.end - span.start

  // Repeat: from a later occurrence the series splits there (calendar/api).
  const repeat = { value: event.recurrence_rule ?? null, start: event.starts_at, meta: event.title }
  const setRepeat = (r: string | null) => {
    if ((event.recurrence_rule ?? null) !== r) setEventRepeat(event, r)
  }
  const [customAt, setCustomAt] = useState<{ x: number; y: number } | null>(null)

  const remove = (run: () => void) => {
    gone.current = true
    run()
  }
  const unschedule = () => remove(() => deleteEventWithUndo(event, 'Unscheduled'))
  const del = () => remove(() => deleteEventWithUndo(event, untitled ? 'Discarded' : 'Deleted'))

  // ⌫ while the popover is open and nothing is being typed: a task block's Unschedule, a plain
  // one-off's Delete (p7e A4, Akiflow's Backspace) — each with Undo. A repeat asks This / All on its
  // Delete row instead, so the key leaves it alone.
  useEffect(() => {
    const act = synced ? null : event.task_id ? unschedule : isRepeatingBlock(event) ? null : del
    if (!act) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      act()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const choices = (list: { label: string; on: boolean; run: () => void; icon?: ReactNode; divider?: boolean; danger?: boolean }[], closeAll: () => void): ContextMenuItem[] =>
    list.map((c) => ({ label: c.label, icon: c.icon, divider: c.divider, danger: c.danger, hint: c.on ? check : undefined, onClick: () => { c.run(); closeAll() } }))

  const submenu = (key: BlockMenuKey): ContextMenuItem['submenu'] => {
    switch (key) {
      case 'date':
        return ({ position: at, onClose: back, closeAll }) => (
          <DatePicker mode="day" title="Date" meta={event.title} value={event.all_day ? event.starts_at.slice(0, 10) : span.day} quick position={at} onPick={(day) => { moveToDayWithUndo(event, day); closeAll() }} onClose={back} />
        )
      case 'time':
        return event.all_day ? undefined : ({ position: at, onClose: back, closeAll }) => (
          <ContextMenu
            position={at}
            onClose={back}
            width={150}
            label="Duration"
            header={<div style={{ ...CAPTION, padding: '4px 9px 2px' }}>Duration</div>}
            items={[
              ...choices(
                LENGTHS.map((l) => ({
                  label: l.label,
                  on: len === l.min,
                  icon: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontVariantNumeric: 'tabular-nums', width: 32, color: len === l.min ? 'var(--acc-lavender-deep)' : 'var(--ink-faint)' }}>{durationLabel(l.min)}</span>,
                  run: () => { if (len !== l.min) retimeEventWithUndo(event, span, { ...span, end: span.start + l.min }) },
                })),
                closeAll,
              ),
              { label: 'Custom…', divider: true, submenu: ({ position: p, onClose: b }) => <CustomTime event={event} position={p} onDone={closeAll} onClose={b} /> },
            ]}
          />
        )
      case 'project':
        return ({ position: at, onClose: back, closeAll }) => (
          <ProjectPicker position={at} projects={projects} domains={domains} currentProjectId={event.project_id ?? null} onSelect={(id) => { if (id !== (event.project_id ?? null)) updateEvent(event, { project_id: id }); closeAll() }} onClose={back} />
        )
      case 'repeat':
        // The one Repeat picker (tasks/RepeatMenu): the presets, and Custom… — the rule editor, which
        // takes this popover's place (a submenu can't hold it).
        return ({ position: at, onClose: back, closeAll }) => (
          <RepeatMenu {...repeat} position={at} onClose={back} onChange={(r) => { setRepeat(r); closeAll() }} onCustom={() => setCustomAt(at)} />
        )
      case 'remind':
        // A12: tasks' Remind submenu, counted back from the event's start; one Undo.
        return ({ position: at, onClose: back, closeAll }) => (
          <ContextMenu
            position={at}
            onClose={back}
            width={170}
            label="Remind"
            header={<div style={{ ...CAPTION, padding: '4px 9px 2px' }}>Remind</div>}
            items={choices(EVENT_REMIND.map((o) => ({ label: o.label, on: (event.remind_min ?? null) === o.min, run: () => setEventRemindWithUndo(event, o.min) })), closeAll)}
          />
        )
      case 'link':
        return ({ position: at, onClose: back, closeAll }) => (
          <TaskPicker
            tasks={linkable(tasks)}
            position={at}
            placeholder="Link a task…"
            label="Search tasks to link"
            onPick={(id) => {
              const t = tasks.find((x) => x.id === id)
              if (t) linkTaskWithUndo(event, t)
              closeAll()
            }}
            onClose={back}
          />
        )
      case 'more': {
        const kinds: { type: CalendarEventType; label: string }[] = [{ type: 'event', label: 'Event' }, { type: 'time_block', label: 'Time block' }]
        return ({ position: at, onClose: back, closeAll }) => (
          <ContextMenu
            position={at}
            onClose={back}
            label="More"
            items={choices(
              [
                ...kinds.map((k) => ({ label: k.label, on: event.type === k.type, run: () => { if (event.type !== k.type) updateEvent(event, { type: k.type }) } })),
                { label: 'Busy', on: event.busy, divider: true, run: () => { if (!event.busy) updateEvent(event, { busy: true }) } },
                { label: 'Free', on: !event.busy, run: () => { if (event.busy) updateEvent(event, { busy: false }) } },
              ],
              closeAll,
            )}
          />
        )
      }
      case 'delete':
        return event.seriesId || event.recurrence_rule
          ? ({ position: at, onClose: back, closeAll }) => (
              <ContextMenu
                position={at}
                onClose={back}
                label="Delete"
                items={choices(
                  [
                    { label: 'This event', on: false, danger: true, run: () => remove(() => deleteEventWithUndo(event, 'Deleted')) },
                    { label: 'All events', on: false, danger: true, run: () => remove(() => deleteSeriesWithUndo(event)) },
                  ],
                  closeAll,
                )}
              />
            )
          : undefined
      default:
        return undefined
    }
  }

  const run: Partial<Record<BlockMenuKey, () => void>> = {
    complete: () => task && (task.status === 'done' ? uncompleteTask(task) : completeTaskWithUndo(task)),
    open: () => event.task_id && openTask(event.task_id),
    replan: () => onReplan?.(position.x, position.y),
    unschedule,
    delete: del,
  }

  const item = (e: BlockMenuEntry): ContextMenuItem => ({
    label: e.label,
    icon: <Icon name={ICONS[e.key]} size={14} />,
    danger: e.destructive,
    labelColor: e.unset ? 'var(--ink-muted)' : undefined,
    divider: e.divider ?? false,
    shortcut: e.key === 'unschedule' || e.key === 'delete' ? e.hint : undefined,
    hint:
      e.key === 'project' && project ? (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: project.color || domains.find((d) => d.id === project.domain_id)?.color || 'var(--ink-hairline)' }} />
      ) : e.key !== 'unschedule' && e.key !== 'delete' ? e.hint : undefined,
    before: e.caption && (
      <>
        <div style={{ ...CAPTION, padding: '4px 9px 5px' }}>{e.caption.label}</div>
        <div style={{ padding: '0 9px 7px', fontSize: 'var(--fs-caption)', lineHeight: 1.45, color: 'var(--ink-muted)' }}><EmojiText text={e.caption.text} /></div>
      </>
    ),
    onClick: synced ? undefined : run[e.key],
    submenu: synced ? undefined : submenu(e.key),
  })

  if (customAt) return <RepeatEditor {...repeat} position={customAt} onClose={onClose} onChange={setRepeat} />
  return (
    <ContextMenu
      position={position}
      onClose={onClose}
      width={BLOCK_MENU_WIDTH}
      label="Block details"
      header={<TitleRow event={event} untitled={untitled} gone={gone} readOnly={synced} />}
      items={spec.map(item)}
    />
  )
}
