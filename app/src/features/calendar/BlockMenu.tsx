import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { DatePicker, Popover } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, KeyCombo } from '../../components/kit'
import { fromMin, toMin } from '../../components/pickerMath'
import { ProjectPicker } from '../../components/ProjectPicker'
import { LengthChips, SheetTitle, TimePanel } from '../../components/TimePicker'
import { TypedTime } from '../../components/TypedTime'
import type { CalendarEvent, CalendarEventType, Task } from '../../lib/types'
import { useDomains } from '../domains/api'
import { TaskPicker } from '../focus/TaskPicker'
import { useProjects } from '../projects/api'
import { uncompleteTask, useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { deleteEventWithUndo, linkTaskWithUndo, setEventRepeat } from './api'
import { completeBlockTask, deleteBlock, duplicateBlock, editEvent, moveToDay, remindEvent, retimeBlock } from './scoped'
import { BLOCK_MENU_WIDTH, EVENT_REMIND, aiPrompts, blockMenuSpec, isRepeatingBlock, isSynced, isUntitled, remindLabel, type BlockMenuEntry, type BlockMenuKey, type BlockMenuMode } from './blockMenuSpec'
import { RepeatEditor, RepeatMenu } from '../tasks/RepeatMenu'
import { SwatchTray } from './formFields'
import { blockSwatch } from './blockHue'
import { askChat, copyBlockLink } from './blockActions'
import { eventSpan } from './phoneGridMath'

// ── design-export/Calendar.dc.html §5 "Block detail — a menu, not a form" (desktop): a 238px popover
// beside the clicked block in the Tasks context menu's own language — it IS the kit ContextMenu,
// with the block's title row on top. Every row commits on selection; Esc or a click outside closes
// it and the block is already updated (the title saves as the popover goes). The rows are
// ./blockMenuSpec, shared with the phone's event sheet. Replaced EventDetailsPanel (the rejected
// form). ──

const ICONS: Record<BlockMenuKey, IconName> = {
  date: 'calendar', time: 'clock', project: 'project', repeat: 'repeat', remind: 'remind', complete: 'check', open: 'tasks', replan: 'pickdate',
  link: 'plus', more: 'dots', duplicate: 'duplicate', ai: 'ai', copylink: 'link', unschedule: 'plus', delete: 'delete', google: 'calendar', details: 'info',
}

// B (D5): a caption is metadata — sentence case, untracked, even digits.
const CAPTION: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-faint)' }
const check = <Icon name="check" size={13} style={{ color: 'var(--acc-terra)' }} />


/** The open, unplaced tasks Link a task… offers. */
const linkable = (tasks: readonly Task[]) => tasks.filter((t) => t.status === 'todo' && !t.scheduled_start && !t.deleted_at)

function TitleRow({ event, untitled, gone, readOnly }: { event: CalendarEvent; untitled: boolean; gone: React.RefObject<boolean>; readOnly?: boolean }) {
  const [draft, setDraft] = useState(untitled ? '' : event.title)
  const latest = useRef({ draft, event })
  latest.current = { draft, event }
  const commit = () => {
    const name = latest.current.draft.trim()
    // cal-clicks: a repeat asks This / Following / All (./scoped); the question outlives the popover.
    if (!gone.current && name && name !== latest.current.event.title) void editEvent(latest.current.event, { title: name }, `Renamed · ${name}`)
  }
  useEffect(() => commit, []) // eslint-disable-line react-hooks/exhaustive-deps -- closing (Esc, a click outside) saves it
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 9px 7px' }}>
      <style>{'.kf-bm-title::placeholder { color: var(--ink-faint); }'}</style>
      {/* Menu B (cal-blocks): the block's colour as a dot before its title; the swatches sit in the tray under it. */}
      <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, margin: '6px 0 0', borderRadius: '50%', background: blockSwatch(event) }} />
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
    </div>
  )
}

/** The block to a new start and length, with Undo (a repeat asks which occurrences — cal-clicks). */
function retime(event: CalendarEvent, start: number, len: number) {
  const span = eventSpan(event)
  if (start !== span.start || start + len !== span.end) void retimeBlock(event, span, { ...span, start, end: start + len })
}

/** Time ▸: the MK Time Picker's panel in the date picker's popover — the start (free slots, the
 * 15-minute list, or typed). Queue 15: no Duration list or chips of its own — the length is the
 * popover's one row of chips (a typed range still sets both). */
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
            retime(event, toMin(time), len)
            onDone()
          }}
        >
          Done
        </Button>
      }
    >
      <TimePanel day={span.day} value={time} onValue={setTime} duration={len} onDuration={setLen} lengthChips={false} onSubmit={(t, d) => { retime(event, toMin(t), d ?? len); onDone() }} />
    </Popover>
  )
}

export function BlockMenu({ event, position, onClose, onReplan, onDetails, closing, mode = 'details' }: {
  event: CalendarEvent
  /** cal-clicks: the details a click opens, or menu B a right-click opens. */
  mode?: BlockMenuMode
  /** Menu B's Details row: the block's details in its place. */
  onDetails?: () => void
  /** Screen px — besideBlock() of the block. */
  position: { x: number; y: number }
  onClose: () => void
  /** A missed task block's Replan…: the calendar's Plan menu at this point. */
  onReplan?: (x: number, y: number) => void
  /** M2: on its way out (100ms). */
  closing?: boolean
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
  const spec = blockMenuSpec(event, { task, projectName: project?.name, missed, mode })
  const menu = mode === 'menu'
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
  // cal-clicks: a repeat (or a repeating task's round) asks This / Following / All first.
  const del = () => remove(() => void deleteBlock(event, untitled ? 'Discarded' : 'Deleted'))

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

  // Ctrl+D / ⌘D (Menu B, Akiflow's): Duplicate, where the menu offers it — with Undo, as its row.
  useEffect(() => {
    if (synced || !spec.some((e) => e.key === 'duplicate')) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key.toLowerCase() !== 'd' && e.code !== 'KeyD')) return
      e.preventDefault() // the browser's bookmark
      void duplicateBlock(event, task)
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
          <DatePicker mode="day" title="Date" meta={event.title} value={event.all_day ? event.starts_at.slice(0, 10) : span.day} quick position={at} onPick={(day) => { void moveToDay(event, day); closeAll() }} onClose={back} />
        )
      case 'time':
        // Queue 15: Time ▸ is the start; the Duration list (Quick · Short · Standard · Deep · Custom…) is
        // gone — the length chips under the title are the popover's one length control.
        return event.all_day ? undefined : ({ position: at, onClose: back, closeAll }) => <CustomTime event={event} position={at} onDone={closeAll} onClose={back} />
      case 'project':
        return ({ position: at, onClose: back, closeAll }) => (
          <ProjectPicker position={at} projects={projects} domains={domains} currentProjectId={event.project_id ?? null} onSelect={(id) => { if (id !== (event.project_id ?? null)) void editEvent(event, { project_id: id }, `Project changed · ${event.title}`); closeAll() }} onClose={back} />
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
            items={choices(EVENT_REMIND.map((o) => ({ label: o.label, on: (event.remind_min ?? null) === o.min, run: () => void remindEvent(event, o.min, `${remindLabel(o.min)} · ${event.title}`) })), closeAll)}
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
                ...kinds.map((k) => ({ label: k.label, on: event.type === k.type, run: () => { if (event.type !== k.type) void editEvent(event, { type: k.type }, `${k.label} · ${event.title}`) } })),
                { label: 'Busy', on: event.busy, divider: true, run: () => { if (!event.busy) void editEvent(event, { busy: true }, `Busy · ${event.title}`) } },
                { label: 'Free', on: !event.busy, run: () => { if (event.busy) void editEvent(event, { busy: false }, `Free · ${event.title}`) } },
              ],
              closeAll,
            )}
          />
        )
      }
      case 'ai':
        // Menu B: each row opens the chat with a request about this block typed in (the chat acts, with a confirm card).
        return ({ position: at, onClose: back, closeAll }) => (
          <ContextMenu
            position={at}
            onClose={back}
            width={230}
            label="Work with AI"
            header={<div style={{ ...CAPTION, padding: '4px 9px 2px' }}>Work with AI · opens the chat</div>}
            items={aiPrompts(event, !!event.task_id).map((p) => ({ label: p.label, onClick: () => { closeAll(); askChat(p.text) } }))}
          />
        )
      default:
        return undefined
    }
  }

  const run: Partial<Record<BlockMenuKey, () => void>> = {
    complete: () => task && (task.status === 'done' ? uncompleteTask(task) : void completeBlockTask(task, event.id)),
    open: () => event.task_id && openTask(event.task_id),
    replan: () => onReplan?.(position.x, position.y),
    duplicate: () => void duplicateBlock(event, task),
    copylink: () => copyBlockLink(event),
    details: () => onDetails?.(),
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
      // Menu B draws Duplicate's keys as "Ctrl D" (the cheatsheet's ⌘/Ctrl rows; ⌘D works on a Mac too).
      e.key === 'duplicate' ? <KeyCombo keys={['Ctrl', 'D']} size="sm" /> : e.key === 'project' && project ? (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: project.color || domains.find((d) => d.id === project.domain_id)?.color || 'var(--ink-hairline)' }} />
      ) : e.key !== 'unschedule' && e.key !== 'delete' ? e.hint : undefined,
    before: e.caption && (
      <>
        <div style={{ ...CAPTION, padding: '4px 9px 5px' }}>{e.caption.label}</div>
        <div style={{ padding: '0 9px 7px', fontSize: 'var(--fs-caption)', lineHeight: 1.45, color: 'var(--ink-muted)' }}><EmojiText text={e.caption.text} /></div>
      </>
    ),
    // A Google event's menu B still opens its details, the chat and its link (nothing there changes it).
    onClick: synced && !['details', 'copylink'].includes(e.key) ? undefined : run[e.key],
    submenu: synced && e.key !== 'ai' ? undefined : submenu(e.key),
  })

  if (customAt) return <RepeatEditor {...repeat} position={customAt} onClose={onClose} onChange={setRepeat} />
  return (
    <ContextMenu
      position={position}
      onClose={onClose}
      closing={closing}
      width={BLOCK_MENU_WIDTH}
      label={menu ? 'Block menu' : 'Block details'}
      header={
        <>
          <TitleRow event={event} untitled={untitled} gone={gone} readOnly={synced} />
          {/* Menu B (Kai 2026-10-26): the swatches in a quiet tray under the title, with "+ Custom". */}
          {menu && !synced && (
            <div style={{ padding: '0 9px 8px' }}>
              <SwatchTray value={event.color ?? null} onChange={(c) => { if (c !== (event.color ?? null)) void editEvent(event, { color: c }, `Colour changed · ${event.title}`) }} />
            </div>
          )}
          {/* Kai 2026-10-21: the length in one tap — the block resizes from its start (a task's estimate
              follows, calendar/api resizeEvent), with Undo. Queue 15: the popover's ONE length control.
              Queue 16: or type it — "7–8:30", "50m", "7:10 pm", "in 2h" (Time ▸ keeps the list). */}
          {!menu && !synced && !event.all_day && (
            <>
              <TypedTime dense start={span.start} minutes={len} onApply={(r) => retime(event, r.start ?? span.start, r.minutes ?? len)} style={{ padding: '0 9px 6px' }} />
              <LengthChips value={len} onPick={(m) => retime(event, span.start, m)} style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 5, padding: '0 9px 8px' }} />
            </>
          )}
        </>
      }
      items={spec.map(item)}
    />
  )
}
