import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ACTION_ROW_CSS, ActionSheet } from '../../components/ActionSheet'
import { BottomSheet } from '../../components/BottomSheet'
import { DatePicker } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, Chip, SectionLabel, Star } from '../../components/kit'
import { DURATIONS, dayHint, durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { ProjectPicker } from '../../components/ProjectPicker'
import { LengthChips, SheetTitle, TimePicker } from '../../components/TimePicker'
import { cairoDateKey, tomorrowHint } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'
import { useAreas } from '../areas/api'
import { parseCommand } from '../command-bar/parseCommand'
import { useDomains } from '../domains/api'
import { NO_PLACE, placeName, placeTask, type MoveTarget } from '../tasks/move'
import { TaskMenu, type MenuSub, type TaskMenuActions } from '../tasks/TaskMenu'
import { remindChip, repeatLabel } from '../tasks/taskSheetMath'
import '../tasks/taskSheet.css'
import { TaskPicker } from '../focus/TaskPicker'
import { useProjects } from '../projects/api'
import { Segmented } from '../rituals/RitualChrome'
import { completeTaskWithUndo, createTask, setRecurrence, toggleTop3, uncompleteTask, useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { SAVED_MS } from '../tasks/taskSheetMath'
import { createEvent, deleteEventWithUndo, deleteSeriesWithUndo, linkTaskWithUndo, moveToDayWithUndo, retimeEventWithUndo, scheduleTask, setEventRemindWithUndo, setEventRepeat, updateEvent, type BlockRef } from './api'
import { duplicateBlockWithUndo } from './duplicate'
import { EVENT_REMIND, aiPrompts, blockMenuSpec, isSynced, isUntitled, type BlockMenuKey } from './blockMenuSpec'
import { askChat, copyBlockLink } from './blockActions'
import { RepeatMenu } from '../tasks/RepeatMenu'
import { cairoTimeKey, cairoToIso } from './eventTime'
import { SwatchTray } from './formFields'
import { DAY_MIN, eventSpan, rangeText, scheduleSlots, slotLabel, spanIso, type DragMode, type Span } from './phoneGridMath'
import { linkRef } from '../../lib/links'
import { clockText } from '../../lib/clock'
import { offerProject } from '../projects/autoProject'

// ── The phone calendar's sheets (Calendar Phone.dc.html): 7c quick create, 7d the event sheet,
// 7g / 7g2 Schedule. All on the kit BottomSheet; every write goes through calendar/api and
// tasks/api (the outbox), and every removal carries Undo. ──

type Rect = { left: number; top: number; width: number; height: number }
export type SlotRect = (day: string, start: number, end: number) => Rect | null

/** The slot or block a sheet is about, drawn over the scrim where it sits on the grid (7c, 7d).
 * Only while that sheet is the top one: a picker sheet opened over it hides it (Kai 2026-10-07 — the
 * draft drew over the time list, on its 13:15 row). */
function Held({ rect, fill, ink, edge, title, time }: { rect: Rect | null; fill: string; ink: string; edge: string; title: string; time: string }) {
  // …and never over the sheet itself: a block taller than the room above the sheet is cut at the
  // sheet's resting top edge (its layout top — the enter animation's transform doesn't count).
  const [sheetTop, setSheetTop] = useState(Infinity)
  // The keyboard rising lifts the sheet without re-rendering the parent (bj-final: the 16:00 slot drew
  // over the quick-create chips until the first key), so a visualViewport resize re-measures too.
  const [vvTick, setVvTick] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    const on = () => setVvTick((n) => n + 1)
    vv?.addEventListener('resize', on)
    return () => vv?.removeEventListener('resize', on)
  }, [])
  useLayoutEffect(() => {
    const sheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1)
    const box = sheet?.offsetParent?.getBoundingClientRect()
    setSheetTop(sheet && box ? box.top + sheet.offsetTop : Infinity)
  }, [rect, vvTick]) // a fresh rect each parent render (a title typed) — so it re-measures then
  if (!rect) return null
  const height = Math.min(rect.height, sheetTop - rect.top - 4)
  if (height < 12) return null
  return createPortal(
    <div className="pc-held" style={{ ...rect, height, '--pc-fill': fill, '--pc-ink': ink, '--pc-edge': edge } as CSSProperties} aria-hidden>
      <span className="pc-name">{title}</span>
      <span className="pc-time">{time}</span>
    </div>,
    document.body,
  )
}

/** A slot tapped earlier today opens its time list on the next quarter from now, not in the past
 * (Kai 2026-10-07: at 14:40 the 14:00 draft's list opened on 14:00). */
function notPast(day: string, start: number): number {
  if (day !== cairoDateKey(new Date())) return start
  return Math.max(start, Math.min(DAY_MIN - 15, Math.ceil(toMin(cairoTimeKey(new Date())) / 15) * 15))
}

/** A kit action row (ActionSheet's look): icon · label · hint · chevron. `quiet`: nothing set yet. */
function Row({ icon, label, hint, quiet, chevron = true, onClick }: { icon: IconName; label: string; hint?: string; quiet?: boolean; chevron?: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button type="button" className="kf-as-row" onClick={(e) => onClick(e.currentTarget)}>
      <span className="kf-as-icon" aria-hidden><Icon name={icon} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-body)', lineHeight: 'calc(20 / 15)', color: quiet ? 'var(--ink-muted)' : undefined }}>{label}</span>
      {hint && <span className="kf-as-hint">{hint}</span>}
      {chevron && <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />}
    </button>
  )
}

/** The block rows' glyphs — the desktop popover's (./BlockMenu), at the sheet's 24px. */
const ROW_ICONS: Record<BlockMenuKey, IconName> = {
  date: 'pickdate', time: 'clock', project: 'project', repeat: 'repeat', remind: 'remind', complete: 'check', open: 'tasks', replan: 'pickdate',
  link: 'plus', more: 'dots', duplicate: 'duplicate', ai: 'ai', copylink: 'link', unschedule: 'plus', delete: 'delete', google: 'calendar',
}

/** 7c / Editor 1e — tap an empty slot: Task (default), Event or Time block, 30 minutes, the keyboard up
 * at once; the slot is drawn over the scrim with the title as you type. A task takes the task sheet's
 * own chips and pickers (TaskMenu: priority, project, reminder, repeat; labels; Top 3; notes) — the
 * title's "!!" / "#project" / "*label" are caught too. A time block can hold a task (it becomes that
 * task's block). Save waits for a title (or the held task). */
export function QuickCreateSheet({ day, start: at, slotRect, onClose }: { day: string; start: number; slotRect: SlotRect; onClose: () => void }) {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const [kind, setKind] = useState<'task' | 'event' | 'block'>('task')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [start, setStart] = useState(at)
  const [dur, setDur] = useState(30)
  const [timeOpen, setTimeOpen] = useState(false)
  // undefined / null: what the title says, if it says (a pick wins).
  const [priority, setPriority] = useState<number | null | undefined>(undefined)
  const [placeTo, setPlaceTo] = useState<MoveTarget | null>(null)
  const [remindMin, setRemindMin] = useState<number | null>(null)
  const [repeatPick, setRepeat] = useState<string | null | undefined>(undefined)
  const [labels, setLabels] = useState<string[]>([])
  const [label, setLabel] = useState('')
  const [top3, setTop3] = useState(false)
  const [picker, setPicker] = useState<MenuSub | null>(null)
  const [holds, setHolds] = useState<Task | null>(null)
  const [holdsAt, setHoldsAt] = useState<{ x: number; y: number } | null>(null)

  const parsed = useMemo(() => (kind === 'task' ? parseCommand(title, domains, projects, { zone: 'cairo' }) : null), [kind, title, domains, projects])
  const name = ((kind === 'task' ? parsed?.title : null) ?? title).trim()
  const { starts_at, ends_at } = spanIso({ day, start, end: start + dur })
  const pri = priority === undefined ? (parsed?.priority ?? null) : priority
  const repeat = repeatPick === undefined ? (parsed?.recurrence ?? null) : repeatPick // "every week" in the title (P7e A5)
  const parsedProject = parsed?.projectId ? projects.find((p) => p.id === parsed.projectId) : undefined
  const to: MoveTarget = placeTo ?? (parsedProject ? { kind: 'project', id: parsedProject.id, domainId: parsedProject.domain_id ?? null, name: parsedProject.name } : NO_PLACE)
  const allLabels = [...new Set([...labels, ...(parsed?.labels ?? [])])]
  const place = placeTask({ project_id: null, area_id: null, domain_id: null, milestone_id: null }, to)
  // The draft as a task, for the task sheet's chips and pickers — nothing is written until Save.
  const draft = {
    id: 'new', title: name || 'New task', status: 'todo', someday: false, top3, due_at: starts_at, scheduled_start: null, scheduled_end: null,
    priority: pri, recurrence_rule: repeat, reminder_at: remindMin == null ? null : new Date(Date.parse(starts_at) - remindMin * 60_000).toISOString(),
    labels: allLabels, duration_min: dur, ...place,
  } as Task
  const nop = () => {}
  const actions: TaskMenuActions = {
    tomorrow: nop, schedule: nop, someday: nop, top3: nop, goal: nop, reopen: nop, delete: nop, snooze: nop, unsnooze: nop,
    move: setPlaceTo,
    priority: (p) => setPriority(p),
    repeat: setRepeat,
    remind: (iso) => setRemindMin(iso ? Math.round((Date.parse(starts_at) - Date.parse(iso)) / 60_000) : null),
  }
  const ready = kind === 'block' ? !!(name || holds) : !!name
  const save = (close: () => void) => {
    if (!ready) return
    if (kind === 'task') {
      const task = createTask({
        title: name,
        // The title's `// notes` and link leave it (the shared parse, P7e A6/A19): they land here, not nowhere.
        notes: notes.trim() || parsed?.notes || null,
        ...(parsed?.url ? { externalRef: linkRef(parsed.url) } : null),
        dueAt: starts_at,
        durationMin: dur,
        priority: pri,
        projectId: place.project_id,
        areaId: place.area_id ?? null,
        domainId: place.domain_id,
        labels: allLabels,
        reminderOffsetMin: remindMin,
      })
      if (repeat) setRecurrence(task, repeat)
      if (top3) toggleTop3(task)
      scheduleTask(task, starts_at, ends_at)
      offerProject({ kind: 'task', row: task }) // queue item 17: no place picked → its likely project
    } else if (kind === 'block' && holds) scheduleTask(holds, starts_at, ends_at)
    else {
      const event = createEvent(name || 'Time block', starts_at, ends_at, kind === 'block' ? 'time_block' : 'event')
      if (repeat) setEventRepeat(event, repeat) // p7e A13: repeat while creating, the block menu's own way
      offerProject({ kind: 'event', row: event })
    }
    close()
  }
  const placeLabel = placeName(draft, projects, areas, domains)
  const chip = (field: MenuSub, value: ReactNode, tone: 'date' | 'priority' | 'project', icon?: IconName) => (
    <Chip key={field} tone={tone} icon={icon && <Icon name={icon} size={16} />} onClick={() => setPicker(field)}>
      {value}
    </Chip>
  )
  const DASHED: CSSProperties = { borderRadius: 'var(--radius-pill)', border: '1px dashed var(--line-control)' }
  const unset = (field: MenuSub, text: string, icon: IconName) => (
    <Chip key={field} tone="bordered" icon={<Icon name={icon} size={16} />} style={DASHED} onClick={() => setPicker(field)}>
      {text}
    </Chip>
  )
  const repeatChip = repeat ? chip('repeat', repeatLabel(repeat), 'date', 'repeat') : unset('repeat', 'Repeat', 'repeat')
  const addLabel = () => {
    const l = label.trim().replace(/^\*/, '')
    setLabel('')
    if (l && !allLabels.includes(l)) setLabels((x) => [...x, l])
  }
  const placeholder = kind === 'task' ? 'New task' : kind === 'event' ? 'New event' : holds ? holds.title : 'Time block'
  return (
    <>
      <BottomSheet onClose={onClose} handleGap={8}>
        {(close) => (
          <div className="pc-qc">
            <div className="pc-qc-top">
              <Segmented label="New" options={[{ value: 'task', label: 'Task' }, { value: 'event', label: 'Event' }, { value: 'block', label: 'Block' }]} value={kind} onChange={setKind} />
              <Button disabled={!ready} onClick={() => save(close)}>Save</Button>
            </div>
            <input
              className="pc-qc-title"
              autoFocus
              aria-label="Title"
              placeholder={placeholder}
              enterKeyHint="done"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(close)
              }}
            />
            <div className="pc-qc-chips">
              <Chip tone="date" onClick={() => setTimeOpen(true)}>
                {dayHint(day, cairoDateKey(new Date()))} · {clockText(fromMin(start))}
              </Chip>
              {DURATIONS.map((m) => (
                <Chip key={m} tone="duration" icon={false} selected={dur === m} onClick={() => setDur(m)}>
                  {durationLabel(m)}
                </Chip>
              ))}
            </div>
            {kind === 'task' && (
              <>
                {/* The task sheet's own chips (4a), each opening its picker. */}
                <div className="ts-chips">
                  {pri ? chip('priority', `P${pri}`, 'priority') : unset('priority', 'Priority', 'priority')}
                  {placeLabel ? chip('project', <EmojiText text={placeLabel} />, 'project') : unset('project', 'Project', 'projects')}
                  {draft.reminder_at ? chip('remind', remindChip(draft.reminder_at, starts_at), 'date', 'remind') : unset('remind', 'Remind', 'remind')}
                  {repeatChip}
                  {allLabels.map((l) => (
                    <Chip key={`label-${l}`} tone="bordered" icon={<Icon name="label" size={16} />} style={{ borderRadius: 'var(--radius-pill)' }} onClick={() => setLabels((x) => x.filter((y) => y !== l))}>
                      {l} ✕
                    </Chip>
                  ))}
                  <input
                    className="kf-chip kf-chip--bordered ts-label-add"
                    value={label}
                    placeholder="+ Label"
                    aria-label="Add a label"
                    enterKeyHint="done"
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={addLabel}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      e.currentTarget.blur()
                    }}
                  />
                  <span className="pc-qc-star">
                    <Star on={top3} label={name || 'New task'} onChange={() => setTop3((v) => !v)} />
                    Top-3
                  </span>
                </div>
                <textarea className="ts-notes" value={notes} placeholder="Add notes…" aria-label="Notes" onChange={(e) => setNotes(e.target.value)} />
              </>
            )}
            {/* p7e A13: an event or a plain block can repeat from the start; a held task repeats through its task. */}
            {kind === 'event' && <div className="pc-qc-chips">{repeatChip}</div>}
            {kind === 'block' && (
              <div className="pc-qc-chips">
                {holds ? (
                  <Chip tone="bordered" icon={<Icon name="tasks" size={16} />} style={{ borderRadius: 'var(--radius-pill)' }} onClick={() => setHolds(null)}>
                    <EmojiText text={holds.title} /> ✕
                  </Chip>
                ) : (
                  <>
                    <Chip tone="bordered" icon={<Icon name="plus" size={16} />} style={DASHED} onClick={() => setHoldsAt({ x: 16, y: Math.round(window.innerHeight / 3) })}>
                      Holds a task…
                    </Chip>
                    {repeatChip}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
      {!timeOpen && !picker && !holdsAt && (
        <Held rect={slotRect(day, start, start + dur)} fill="var(--block-lavender)" ink="var(--acc-lavender-text)" edge="var(--acc-lavender-deep)" title={name || placeholder} time={rangeText(start, start + dur)} />
      )}
      {picker && (
        <TaskMenu key={picker} task={draft} anchor={{ at: { x: 0, y: 0 }, sub: picker }} onClose={() => setPicker(null)} actions={actions} ctx={{ tomorrowHint: tomorrowHint(), projectName: placeLabel }} />
      )}
      {holdsAt && (
        <TaskPicker
          tasks={tasks.filter((t) => t.status === 'todo' && !t.scheduled_start && !t.deleted_at)}
          position={holdsAt}
          placeholder="Hold a task…"
          label="Search tasks to hold"
          onPick={(id) => {
            const t = tasks.find((x) => x.id === id)
            if (t) {
              setHolds(t)
              if (t.duration_min) setDur(t.duration_min) // Editor 1d: pre-filled from the task's duration
            }
            setHoldsAt(null)
          }}
          onClose={() => setHoldsAt(null)}
        />
      )}
      {timeOpen && (
        <TimePicker
          day={day}
          value={fromMin(notPast(day, start))}
          duration={dur}
          lengthChips={false} // queue 15: the sheet's own chips are the length; a typed range still sets it
          title={name || undefined}
          onDone={(hhmm, d) => {
            setStart(toMin(hhmm))
            if (d) setDur(d)
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </>
  )
}

/** 7d — tap a plain event (a task block opens as its task, the Task sheet): the same rows as the
 * desktop popover (./blockMenuSpec — Calendar.dc.html §5) on the sheet's own rows, each committing as
 * it's picked. Kai 2026-10-07 ("it felt like a read-only pop-up"): the title is a field (renames on
 * Done / leaving it). Kai 2026-10-12: date, length, project, repeat, colour, task link and More here
 * too, so the phone does all the desktop does. Delete / Discard sits in the footer; a repeat asks
 * This event / All events. */
export function BlockSheet({ event, look, slotRect, pending, onMove, onRebind, onClose }: {
  event: CalendarEvent
  look: { fill: string; ink: string }
  slotRect: SlotRect
  pending: boolean
  onMove: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  /** A repeat edited from a later occurrence splits (calendar/api): the sheet follows the new block. */
  onRebind?: (ref: BlockRef) => void
  onClose: () => void
}) {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const openTask = useOpenTask()
  const [picker, setPicker] = useState<null | 'date' | 'time' | 'project' | 'repeat' | 'remind' | 'more' | 'ai' | 'delete'>(null)
  const [linkAt, setLinkAt] = useState<{ x: number; y: number } | null>(null)
  const [untitled] = useState(() => isUntitled(event))
  const [title, setTitle] = useState(untitled ? '' : event.title)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const saved = () => setSavedAt(Date.now())
  const rename = () => {
    const name = title.trim()
    if (!name || name === event.title) return setTitle(untitled && !name ? '' : event.title)
    updateEvent(event, { title: name })
    saved()
  }
  // Delete / Unschedule / Open task: the sheet leaves first, then the block goes and the Undo toast
  // lands on the page (or the task opens over it).
  const after = useRef<(() => void) | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const leave = (run: () => void) => {
    after.current = run
    closeRef.current?.()
  }
  useEffect(() => {
    if (savedAt == null) return
    const t = window.setTimeout(() => setSavedAt(null), SAVED_MS)
    return () => window.clearTimeout(t)
  }, [savedAt])
  const span = eventSpan(event)
  const len = span.end - span.start
  const task = event.task_id ? tasks.find((t) => t.id === event.task_id) : undefined
  const project = event.project_id ? projects.find((p) => p.id === event.project_id) : undefined
  const spec = blockMenuSpec(event, { task, projectName: project?.name })
  const del = spec.at(-1)!
  // A Google event (B1): read-only — its rows only say when and from which calendar; no footer.
  const synced = isSynced(event)
  const kind = synced ? 'Google event' : event.task_id ? 'Task block' : event.type === 'time_block' ? 'Time block' : 'Event'
  const meta = `${kind} · ${event.all_day ? 'All day' : durationLabel(len)}`
  const run: Partial<Record<BlockMenuKey, (el: HTMLElement) => void>> = {
    date: () => setPicker('date'),
    time: () => setPicker('time'),
    project: () => setPicker('project'),
    repeat: () => setPicker('repeat'),
    remind: () => setPicker('remind'),
    more: () => setPicker('more'),
    complete: () => {
      if (!task) return
      if (task.status === 'done') uncompleteTask(task)
      else completeTaskWithUndo(task)
    },
    open: () => leave(() => event.task_id && openTask(event.task_id)),
    duplicate: () => leave(() => duplicateBlockWithUndo(event, task)),
    ai: () => setPicker('ai'),
    copylink: () => copyBlockLink(event),
    unschedule: () => leave(() => deleteEventWithUndo(event, 'Unscheduled')),
    link: (el) => {
      const r = el.getBoundingClientRect()
      setLinkAt({ x: r.left + 16, y: r.top })
    },
  }
  const remove = del.sub ? () => setPicker('delete') : () => leave(() => deleteEventWithUndo(event, untitled ? 'Discarded' : 'Deleted'))
  const choice = (label: string, on: boolean, act: () => void) => ({ label, selected: on, onSelect: () => { if (!on) { act(); saved() } } })
  return (
    <>
      <BottomSheet
        detent="medium"
        onClose={() => {
          onClose()
          after.current?.()
        }}
        handleGap={8}
        footer={synced ? undefined : (close) => {
          closeRef.current = close
          return (
            <Button variant="ghost" className="pc-bs-delete" icon={<Icon name="delete" size={20} />} onClick={remove}>
              {del.label}
            </Button>
          )
        }}
      >
        {(close) => {
          closeRef.current = close
          return (
            <>
              <div className="pc-bs-head">
                <div className="pc-bs-title">
                  <input
                    className="pc-qc-title pc-bs-title-in"
                    aria-label="Title"
                    readOnly={synced}
                    enterKeyHint="done"
                    placeholder="Add title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={rename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </div>
                <div className="pc-bs-meta" style={{ '--pc-ink': look.ink } as CSSProperties}>{meta}</div>
              </div>
              {/* Menu B (cal-blocks, Kai 2026-10-26): the desktop menu's tray under the title — None, palette C's 16
                  swatches and "+ Custom", saved on tap, for every block (the grid draws a block's own colour first). */}
              {!synced && <div className="pc-bs-colors">
                <SwatchTray
                  value={event.color ?? null}
                  size={26}
                  columns={10}
                  onChange={(c) => {
                    if (c === (event.color ?? null)) return
                    updateEvent(event, { color: c })
                    saved()
                  }}
                />
              </div>}
              {/* Kai 2026-10-21: the length in one tap, from the start — as the Time sheet's chips do. */}
              {!synced && !event.all_day && (
                <LengthChips
                  value={len}
                  style={{ minHeight: 0, padding: '4px 0 8px' }}
                  onPick={(m) => {
                    if (m === len) return
                    const to = { ...span, end: span.start + m }
                    if (event.seriesId) {
                      const ref = retimeEventWithUndo(event, span, to)
                      if (ref) onRebind?.(ref)
                    } else onMove(event, span, to, 'bottom')
                    saved()
                  }}
                />
              )}
              <div className="pc-bs-rows">
                <style>{ACTION_ROW_CSS}</style>
                {(synced ? spec : spec.slice(0, -1)).map((e) => (
                  <Fragment key={e.key}>
                    {e.caption && (
                      <div className="pc-bs-caption">
                        <SectionLabel>{e.caption.label}</SectionLabel>
                        <EmojiText text={e.caption.text} />
                      </div>
                    )}
                    <Row icon={ROW_ICONS[e.key]} label={e.label} hint={e.key === 'unschedule' || e.key === 'delete' || e.key === 'duplicate' ? undefined : e.hint} quiet={e.unset} chevron={!!e.sub} onClick={(el) => !synced && run[e.key]?.(el)} />
                  </Fragment>
                ))}
              </div>
              {(pending || savedAt != null) && <div className={`pc-bs-save${pending ? ' is-pending' : ''}`}>{pending ? '○ Pending sync' : '✓ Saved'}</div>}
            </>
          )
        }}
      </BottomSheet>
      <Held rect={event.all_day || picker === 'date' || picker === 'time' ? null : slotRect(span.day, span.start, span.end)} fill={look.fill} ink={look.ink} edge="var(--ink-body)" title={event.title} time={rangeText(span.start, span.end)} />
      {picker === 'date' && (
        <DatePicker
          mode="day"
          title="Date"
          meta={event.title}
          value={event.all_day ? event.starts_at.slice(0, 10) : span.day}
          quick
          onPick={(day) => {
            if (event.seriesId) {
              // One occurrence leaves its series for another day: this sheet's block is gone.
              moveToDayWithUndo(event, day)
              return leave(() => {})
            }
            if (event.all_day) moveToDayWithUndo(event, day)
            else if (day !== span.day) onMove(event, span, { ...span, day }, 'move')
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'time' && (
        <TimePicker
          day={span.day}
          value={fromMin(span.start)}
          duration={len}
          lengthChips={false} // queue 15: the sheet's length chips are its one length control
          title={event.title}
          onDone={(hhmm, d) => {
            const start = toMin(hhmm)
            const to = { day: span.day, start, end: start + (d ?? len) }
            if (to.start === span.start && to.end === span.end) return
            // A repeat moves as a whole series (decision 2026-10-12); a one-off like a drag.
            if (event.seriesId) {
              const ref = retimeEventWithUndo(event, span, to)
              if (ref) onRebind?.(ref)
            }
            else onMove(event, span, to, d ? 'bottom' : 'move')
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'project' && (
        <ProjectPicker
          position={{ x: 0, y: 0 }}
          projects={projects}
          domains={domains}
          currentProjectId={event.project_id ?? null}
          meta={event.title}
          onSelect={(id) => {
            if (id === (event.project_id ?? null)) return
            updateEvent(event, { project_id: id })
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'repeat' && (
        // The one Repeat picker (tasks/RepeatMenu) — the presets and the Custom… rule editor.
        <RepeatMenu
          value={event.recurrence_rule ?? null}
          start={event.starts_at}
          meta={event.title}
          position={{ x: 0, y: 0 }}
          onClose={() => setPicker(null)}
          onChange={(r) => {
            if (r === (event.recurrence_rule ?? null)) return
            const ref = setEventRepeat(event, r)
            if (ref) onRebind?.(ref)
            saved()
          }}
        />
      )}
      {picker === 'remind' && (
        <ActionSheet
          title="Remind"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={EVENT_REMIND.map((o) => choice(o.label, (event.remind_min ?? null) === o.min, () => setEventRemindWithUndo(event, o.min)))}
        />
      )}
      {picker === 'more' && (
        <ActionSheet
          title="More"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={[
            choice('Event', event.type === 'event', () => updateEvent(event, { type: 'event' })),
            choice('Time block', event.type === 'time_block', () => updateEvent(event, { type: 'time_block' })),
            choice('Busy', event.busy, () => updateEvent(event, { busy: true })),
            choice('Free', !event.busy, () => updateEvent(event, { busy: false })),
          ]}
        />
      )}
      {picker === 'ai' && (
        // Menu B's Work with AI ›: the chat opens with a request about this block typed in (the sheet leaves first).
        <ActionSheet
          title="Work with AI"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={aiPrompts(event, !!event.task_id).map((p) => ({ label: p.label, onSelect: () => leave(() => askChat(p.text)) }))}
        />
      )}
      {picker === 'delete' && (
        <ActionSheet
          title="Delete"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={[
            { label: 'This event', destructive: true, onSelect: () => leave(() => deleteEventWithUndo(event, 'Deleted')) },
            { label: 'All events', destructive: true, onSelect: () => leave(() => deleteSeriesWithUndo(event)) },
          ]}
        />
      )}
      {linkAt && (
        <TaskPicker
          tasks={tasks.filter((t) => t.status === 'todo' && !t.scheduled_start && !t.deleted_at)}
          position={linkAt}
          placeholder="Link a task…"
          label="Search tasks to link"
          onPick={(id) => {
            const t = tasks.find((x) => x.id === id)
            if (t) linkTaskWithUndo(event, t)
            setLinkAt(null)
            saved()
          }}
          onClose={() => setLinkAt(null)}
        />
      )}
    </>
  )
}

/** 7g — tap a rail chip (Overdue · Today · Inbox): the next 3 free slots, one tap places the block
 * (the caller writes it, toast + Undo). 7g2 — nothing fits today: says so and offers the next days.
 * Or pick a time / a date. "Replan" (Kai 2026-10-07) is the same sheet for an overdue block, with
 * the way into its task. */
export function ScheduleSheet({ title, duration, events, heading = 'Schedule', onPlace, onOpen, onComplete, onClose }: {
  title: string
  duration: number
  events: readonly CalendarEvent[]
  heading?: string
  onPlace: (startsAt: string, endsAt: string) => void
  onOpen?: () => void
  /** A task chip: tick it off from here (the sheet leaves first, the Undo toast lands on the page). */
  onComplete?: () => void
  onClose: () => void
}) {
  const [picker, setPicker] = useState<'time' | 'date' | null>(null)
  const now = new Date()
  const today = cairoDateKey(now)
  const dur = duration
  const { today: fitsToday, slots } = scheduleSlots(events, now, dur)
  const place = (startsAt: string, len: number) => onPlace(startsAt, new Date(Date.parse(startsAt) + len * 60_000).toISOString())
  // Kai 2026-10-17: opening a chip's task is one tap — its title, or the first row (the sheet leaves first).
  const closeRef = useRef<(() => void) | null>(null)
  const open = onOpen && (() => { closeRef.current?.(); onOpen() })
  const head = <SheetTitle title={heading} meta={`${title} · ${durationLabel(dur)}`} />
  return (
    <>
      <BottomSheet
        onClose={onClose}
        title={open ? <button type="button" className="pc-sched-title" aria-label={`Open ${title}`} onClick={open}>{head}</button> : head}
      >
        {(close) => {
          closeRef.current = close
          return (
          <>
            {open && (
              <div className="pc-bs-rows pc-sched-open">
                <style>{ACTION_ROW_CSS}</style>
                <Row icon="tasks" label="Open task" onClick={open} />
              </div>
            )}
            <SectionLabel>{fitsToday ? 'Next free today' : 'Next free'}</SectionLabel>
            <div className="pc-slots">
              {slots.map((s) => (
                <button key={`${s.day}-${s.start}`} type="button" className="kf-pk-slot" onClick={() => { place(spanIso({ ...s, end: s.start + dur }).starts_at, dur); close() }}>
                  {slotLabel(s, dur, today)}
                </button>
              ))}
            </div>
            {!fitsToday && (
              <div className="pc-hint">
                <Icon name="clock" size={16} />
                No {durationLabel(dur)} gap left today
              </div>
            )}
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              <Row icon="clock" label="Pick a time…" onClick={() => setPicker('time')} />
              <Row icon="pickdate" label="Pick a date…" onClick={() => setPicker('date')} />
              {onComplete && <Row icon="check" label="Complete" chevron={false} onClick={() => { close(); onComplete() }} />}
            </div>
          </>
          )
        }}
      </BottomSheet>
      {picker === 'time' && (
        <TimePicker day={today} value={null} duration={dur} title={title} onDone={(hhmm, d) => { place(cairoToIso(today, hhmm), d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
      {picker === 'date' && (
        <DatePicker title={heading} meta={title} value={null} quick withTime duration={dur} onPick={(iso, d) => { place(iso, d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
    </>
  )
}
