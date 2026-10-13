import { uiZoom } from '../../lib/uiScale'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { placeAtPointer } from '../../components/selectPlacement'
import { EmojiText } from '../../components/EmojiText'
import { Select } from '../../components/Select'
import { BackLink, TapeCard, Toggle } from '../../components/kit'
import { DateInput, TimeInput, Seg, ColorDots, FLabel, FHelp } from './formFields'
import { createEvent, scheduleTask, updateEvent } from './api'
import { cairoTimeKey, cairoToIso } from './eventTime'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { createTask, setRecurrence, toggleTop3, setSomeday, useTasks } from '../tasks/api'
import { RepeatEditor, RepeatMenu } from '../tasks/RepeatMenu'
import { repeatLabel } from '../tasks/taskSheetMath'
import { parseCommand } from '../command-bar/parseCommand'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { appZone } from '../../lib/appZone'

// ── Editor.dc.html 2a/2b — the compact popover a click on the grid opens — and 1b/1c/1d, the full
// create page its "More options ↗" lands on (CreatePage, route /new: the sidebar folds to the rail,
// nothing is saved until Create). One form: the kind switcher (Task / Event / Time block) picks
// which fields render; the popover hands what's typed to the page. Phones: PhoneSheets. ──

export type QuickCreateKind = 'task' | 'event' | 'block'

/** Every field of the form — what the popover hands the full page. */
export interface CreateDraft {
  kind: QuickCreateKind
  title: string
  notes: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  busy: boolean
  color: string | null
  priority: number | null
  projectId: string | null
  areaId: string | null
  holdsTaskId: string | null
  reminderOffset: string
  repeat: string | null
  labels: string[]
  top3: boolean
  someday: boolean
  /** Opened on a grid slot: a task gets its block there. */
  slot: boolean
  /** The date / time came from the slot or a hand — a parsed title no longer moves them. */
  dateTouched: boolean
}

export interface QuickCreateProps {
  initialKind: QuickCreateKind
  /** The grid slot that was clicked/dragged — null when opened from the rail's bare "quick add". */
  slot: { date: string; start: string; end: string; allDay: boolean } | null
  /** Screen position to anchor the compact popover near. */
  anchor: { x: number; y: number } | null
  onClose: () => void
  /** Editor 1b–1d: the full page instead of the popover. */
  page?: boolean
  /** What the popover had (the page starts from it). */
  draft?: CreateDraft
  /** The popover's "More options ↗": the page takes over with what's typed so far. */
  onExpand?: (draft: CreateDraft) => void
}

const KIND_META: Record<QuickCreateKind, { label: string; desc: string; cta: string; hand: string }> = {
  task: { label: 'Task', desc: 'something to do — lives in your lists', cta: 'Create task', hand: 'plant it — the blossom grows a bud ✿' },
  event: { label: 'Event', desc: 'a moment in time — lives on the calendar', cta: 'Create event', hand: 'the daisy opens a petal for it ✿' },
  block: { label: 'Time block', desc: 'reserved focus — usually holds a task', cta: 'Block time', hand: 'two hours fenced off, just for this ✿' },
}

// T-4 (Polish F2b): every date and time in this form is the user's wall clock, on any device — what
// "10am" means in the command bar (Polish E). Slots arrive already converted (CalendarPage), times
// typed or parsed from the title are read on that clock, and cairoToIso turns the fields back into
// the exact instant they came from.
function todayKey(): string {
  return cairoDateKey(new Date())
}

function diffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

const plus = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + min
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function nextDayIso(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '10', label: '10 min before due' },
  { value: '30', label: '30 min before due' },
  { value: '60', label: '1 hour before due' },
  { value: '1440', label: '1 day before due' },
]

const DURATION_CHIPS = [15, 30, 60, 120]
/** 1d's Length chips. */
const LENGTH_CHIPS = [30, 60, 90, 120]
const lenLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`)

/** Editor's .chip: mono, a pill, tinted or bordered. */
function chipStyle(bg: string, color: string, border?: string): CSSProperties {
  return { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 'var(--radius-pill)', background: bg, color, border: border ?? 'none', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }
}
const CHIP_ON = chipStyle('color-mix(in srgb, var(--acc-lavender) 22%, transparent)', 'var(--acc-lavender-text)')
const CHIP_OFF = chipStyle('transparent', 'var(--ink-muted)', '1px solid var(--line-solid)')
const CHIP_ADD = chipStyle('transparent', 'var(--ink-faint)', '1px dashed var(--ink-hairline)')
const FIELD: CSSProperties = { fontSize: 'var(--fs-caption)', padding: '8px 10px', width: '100%' }

/** Editor's .fsel: a field that opens a picker. */
function PickField({ children, onClick, label }: { children: ReactNode; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ ...FIELD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, font: 'inherit', fontSize: 'var(--fs-caption)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', cursor: 'pointer', textAlign: 'left' }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      <span aria-hidden style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-meta)' }}>▾</span>
    </button>
  )
}

export function QuickCreate({ initialKind, slot, anchor, onClose, page = false, draft, onExpand }: QuickCreateProps) {
  const motion = useMotionEnabled()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: domains = [] } = useDomains()

  const [kind, setKind] = useState<QuickCreateKind>(draft?.kind ?? initialKind)
  const [title, setTitle] = useState(draft?.title ?? '')
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [date, setDate] = useState(draft?.date ?? slot?.date ?? todayKey())
  const [startTime, setStartTime] = useState(draft?.startTime ?? slot?.start ?? '09:00')
  const [endTime, setEndTime] = useState(draft?.endTime ?? slot?.end ?? '09:30')
  const [allDay, setAllDay] = useState(draft?.allDay ?? slot?.allDay ?? false)
  const [busy, setBusy] = useState(draft?.busy ?? true)
  const [color, setColor] = useState<string | null>(draft?.color ?? null)
  const [priority, setPriority] = useState<number | null>(draft?.priority ?? null)
  const [projectId, setProjectId] = useState<string | null>(draft?.projectId ?? null)
  const [areaId, setAreaId] = useState<string | null>(draft?.areaId ?? null)
  const [holdsTaskId, setHoldsTaskId] = useState<string | null>(draft?.holdsTaskId ?? null)
  const [holdsQuery, setHoldsQuery] = useState('')
  const [reminderOffset, setReminderOffset] = useState(draft?.reminderOffset ?? '30')
  const [repeat, setRepeat] = useState<string | null>(draft?.repeat ?? null)
  const [repeatAt, setRepeatAt] = useState<{ x: number; y: number; custom?: boolean } | null>(null)
  const [labels, setLabels] = useState<string[]>(draft?.labels ?? [])
  const [labelInput, setLabelInput] = useState('')
  const [top3, setTop3] = useState(draft?.top3 ?? false)
  const [someday, setSomedayFlag] = useState(draft?.someday ?? false)
  const fromSlot = draft?.slot ?? Boolean(slot)

  // Whether the slot-provided date/time is still authoritative, or the user (or the NL
  // title parse) has taken it over — a click on the grid should not get silently
  // repositioned by whatever the title happens to parse to.
  const [dateTouched, setDateTouched] = useState(draft?.dateTouched ?? Boolean(slot))
  const [priorityTouched, setPriorityTouched] = useState(false)
  const [projectTouched, setProjectTouched] = useState(false)

  useEscapeStack(!repeatAt, onClose)
  useBodyScrollLock(!page)

  // The compact popover's place, from its measured size (VISUAL px ÷ zoom = layout px, lib/uiScale).
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el || !anchor) return
    const place = () => {
      const z = uiZoom()
      const r = el.getBoundingClientRect()
      setPos(placeAtPointer({ x: anchor.x / z, y: anchor.y / z }, { width: r.width / z, height: r.height / z }, { width: window.innerWidth / z, height: window.innerHeight / z }))
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [anchor])

  // T-4: the title's "friday 3pm" is read on the user's clock too (parseCommand's zone option).
  const parsed = useMemo(() => (kind === 'task' ? parseCommand(title, domains, projects, { zone: 'cairo' }) : null), [kind, title, domains, projects])
  const eventDate = useMemo(() => {
    if (kind === 'task' || !title.trim()) return null
    const due = parseCommand(title, [], [], { zone: 'cairo' }).dueAt
    return due ? new Date(due) : null
  }, [kind, title])

  // A stale end time from before the NL parse can land before the newly-caught start —
  // bump it forward by the default 30 min whenever that would happen.
  function applyParsedTime(d: Date) {
    const newStart = cairoTimeKey(d)
    setDate(cairoDateKey(d))
    setStartTime(newStart)
    if (diffMinutes(newStart, endTime) <= 0) setEndTime(plus(newStart, 30))
  }

  // "every week" in the title fills Repeat (P7e A5) when the typed rule changes; a pick stands till then.
  const typedRule = useRef<string | null>(null)
  useEffect(() => {
    if ((parsed?.recurrence ?? null) !== typedRule.current) {
      typedRule.current = parsed?.recurrence ?? null
      if (typedRule.current) setRepeat(typedRule.current)
    }
    if (parsed?.dueAt && !dateTouched) applyParsedTime(new Date(parsed.dueAt))
    if (parsed?.priority != null && !priorityTouched) setPriority(parsed.priority)
    if (parsed?.projectId && !projectTouched) { setProjectId(parsed.projectId); setAreaId(null) }
  }, [parsed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (eventDate && !dateTouched) applyParsedTime(eventDate)
  }, [eventDate]) // eslint-disable-line react-hooks/exhaustive-deps

  function markDateTouched() { setDateTouched(true) }

  const holdsMatches = holdsQuery.trim()
    ? tasks.filter((t) => !t.scheduled_start && t.status === 'todo' && t.title.toLowerCase().includes(holdsQuery.trim().toLowerCase())).slice(0, 5)
    : []
  const holdsTask = holdsTaskId ? tasks.find((t) => t.id === holdsTaskId) : null
  const holdsPlace = holdsTask?.project_id ? projects.find((p) => p.id === holdsTask.project_id)?.name : null

  // The title's `*labels` join the hand-added ones.
  const allLabels = [...new Set([...labels, ...(parsed?.labels ?? [])])]

  const snapshot = (): CreateDraft => ({
    kind, title, notes, date, startTime, endTime, allDay, busy, color, priority, projectId, areaId, holdsTaskId, reminderOffset, repeat, labels: allLabels, top3, someday, slot: fromSlot, dateTouched,
  })

  function submit(from?: HTMLElement) {
    seedPlant(from, motion) // Motion 5f — every calendar create lands with the drop+puff
    if (kind === 'task') {
      const dueAt = date ? cairoToIso(date, startTime || '09:00') : null
      const task = createTask({
        // "the title types it, the fields catch it": what the parse caught leaves the title.
        title: parsed?.title.trim() || title.trim() || 'Untitled task',
        notes: notes.trim() || null,
        dueAt,
        // A task is in a project OR an area (0052); both go in with the row, not as later writes.
        projectId: areaId ? null : projectId,
        areaId,
        labels: allLabels,
        priority,
        durationMin: startTime && endTime && diffMinutes(startTime, endTime) > 0 ? diffMinutes(startTime, endTime) : null,
        reminderOffsetMin: reminderOffset ? Number(reminderOffset) : null,
      })
      if (repeat) setRecurrence(task, repeat)
      if (top3) toggleTop3(task)
      if (someday) setSomeday(task, true)
      if (fromSlot && date && startTime && endTime) {
        scheduleTask(task, cairoToIso(date, startTime), cairoToIso(date, endTime))
      }
    } else if (kind === 'event') {
      const startsAt = allDay ? `${date}T00:00:00.000Z` : cairoToIso(date, startTime)
      const endsAt = allDay ? nextDayIso(date) : cairoToIso(date, endTime)
      const event = createEvent(title.trim() || 'New event', startsAt, endsAt, 'event', color, allDay)
      if (!busy) updateEvent(event, { busy: false })
    } else {
      const startsAt = cairoToIso(date, startTime)
      const endsAt = cairoToIso(date, endTime)
      if (holdsTask) {
        scheduleTask(holdsTask, startsAt, endsAt)
      } else {
        const event = createEvent(title.trim() || 'Time block', startsAt, endsAt, 'time_block', color)
        if (!busy) updateEvent(event, { busy: false })
      }
    }
    onClose()
  }

  const durationMin = diffMinutes(startTime, endTime)
  const durationText = durationMin > 0 ? lenLabel(durationMin) : null

  // ── Field blocks (shared by the popover and the page) ──
  const kindSwitcher = page ? (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 18 }}>
      {(Object.keys(KIND_META) as QuickCreateKind[]).map((k, i) => {
        const on = k === kind
        const inner = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {k === 'block' ? (
                <span style={{ width: 16, height: 16, borderLeft: '3px solid var(--acc-lavender)', background: 'color-mix(in srgb, var(--acc-lavender) 20%, transparent)', borderRadius: 'var(--radius-sharp)' }} />
              ) : (
                <img src={`/ds/assets/${k === 'task' ? 'cherry/bud' : 'daisy/midday'}.png`} alt="" style={{ height: 20, opacity: on ? 1 : 0.8 }} />
              )}
              <span style={{ fontSize: 'var(--fs-body-s)', fontWeight: on ? 600 : 400, color: on ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{KIND_META[k].label}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 'var(--fs-caption)', lineHeight: 1.4, color: on ? 'var(--ink-muted)' : 'var(--ink-faint)' }}>{KIND_META[k].desc}</div>
          </>
        )
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)} style={{ padding: 0, border: 'none', background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
            {on ? (
              // The chosen kind is a placed card: the kit's TapeCard, tilted the way 1b/1c/1d tilt it.
              <TapeCard tilt={i === 1 ? 0.5 : -0.5} tape={k === 'task' ? 'color-mix(in srgb, var(--acc-blossom) 55%, transparent)' : 'color-mix(in srgb, var(--acc-lavender) 55%, transparent)'} style={{ padding: '13px 14px' }}>
                {inner}
              </TapeCard>
            ) : (
              <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-sharp)', padding: '13px 14px', opacity: 0.75 }}>{inner}</div>
            )}
          </button>
        )
      })}
    </div>
  ) : (
    <Seg
      options={(Object.keys(KIND_META) as QuickCreateKind[]).map((k) => ({ value: k, label: KIND_META[k].label }))}
      value={kind}
      onChange={setKind}
      style={{ marginBottom: 13 }}
    />
  )

  const caught = parsed?.dueAt || parsed?.projectMatch || parsed?.priority != null || eventDate || (page && !!parsed?.labels.length)
  const titleField = (
    <div
      // Editor.dc.html 2a:98 — compact title is bare text over the popover paper with only a
      // dashed underline; the boxed treatment (border/shadow) is the page's.
      style={{
        background: page ? 'var(--paper-parchment)' : 'none',
        border: page ? '1px solid var(--line-card)' : 'none',
        borderRadius: page ? 'var(--radius-input)' : 0,
        boxShadow: page ? 'var(--shadow-card)' : 'none',
        padding: page ? '16px 18px' : '0 0 9px',
        borderBottom: page ? undefined : '1px dashed var(--line-dashed)',
        marginTop: page ? 22 : 0,
        marginBottom: page ? 0 : 11,
      }}
    >
      <input
        autoFocus
        value={title}
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder={kind === 'task' ? 'Review the pricing sheet friday 3pm !!' : kind === 'event' ? 'Dinner with family' : 'What is this time for?'}
        style={{ width: '100%', fontFamily: 'var(--font-display)', fontSize: page ? 'var(--fs-lead)' : 'var(--fs-body-l)', color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none' }}
      />
      {caught && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: page ? 12 : 10, paddingTop: page ? 11 : 9, borderTop: '1px dashed var(--line-dashed)' }}>
          {(parsed?.dueAt || eventDate) && (
            <span style={chipStyle('color-mix(in srgb, var(--acc-lavender) 22%, transparent)', 'var(--acc-lavender-text)')}>
              → {new Date(parsed?.dueAt ?? eventDate!).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: appZone() })}
            </span>
          )}
          {parsed?.projectMatch && <span style={chipStyle('color-mix(in srgb, var(--acc-moss) 20%, transparent)', 'var(--acc-sage-text)')}>→ {parsed.projectMatch}</span>}
          {parsed?.priority != null && <span style={chipStyle('color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', 'var(--acc-gold)')}>{'!'.repeat(4 - parsed.priority)} {parsed.priority === 1 ? 'Critical' : parsed.priority === 2 ? 'High' : 'Medium'}</span>}
          {page && parsed?.labels.map((l) => <span key={l} style={CHIP_OFF}>*{l}</span>)}
          {page && <FHelp style={{ marginLeft: 'auto', marginTop: 0 }}>{kind === 'task' ? 'the title types it, the fields catch it' : 'caught from the title'}</FHelp>}
        </div>
      )}
    </div>
  )

  // Kai 2026-10-03: the compact popover overran a 150% window. One "when" row instead: date ·
  // start–end · duration. A task's due time and its block start are the same field (startTime).
  const whenRow = (
    <div>
      <FLabel>{kind === 'task' ? 'Due · block' : 'When'}</FLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <DateInput value={date} title={kind === 'task' ? 'Due date' : 'Date'} onChange={(v) => { setDate(v); markDateTouched() }} style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} />
        {!allDay && (
          <>
            <TimeInput value={startTime} day={date} onChange={(v) => { setStartTime(v); markDateTouched() }} style={{ flex: '0 0 78px' }} />
            <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-meta)' }}>–</span>
            <TimeInput value={endTime} day={date} onChange={(v) => { setEndTime(v); markDateTouched() }} style={{ flex: '0 0 78px' }} />
            {durationText && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{durationText}</span>}
          </>
        )}
      </div>
    </div>
  )

  const priorityField = (
    <div>
      <FLabel>Priority</FLabel>
      <Seg
        options={[
          { value: '', label: 'none' },
          { value: '3', label: '!', color: 'var(--acc-hydrangea-deep)' },
          { value: '2', label: '!!', color: 'var(--acc-gold)' },
          { value: '1', label: '!!!', color: 'var(--acc-terra)' },
        ]}
        value={priority == null ? '' : String(priority)}
        onChange={(v) => { setPriority(v ? Number(v) : null); setPriorityTouched(true) }}
      />
    </div>
  )
  const projectField = (
    <div>
      <FLabel>Project or area</FLabel>
      <Select
        value={projectId ?? areaId ?? ''}
        onChange={(v) => {
          setProjectTouched(true)
          const project = projects.find((p) => p.id === v)
          if (project) { setProjectId(v); setAreaId(null) } else { setAreaId(v || null); setProjectId(null) }
        }}
        options={[{ value: '', label: '—' }, ...projects.map((p) => ({ value: p.id, label: p.name })), ...areas.map((a) => ({ value: a.id, label: a.name }))]}
        ariaLabel="Project or area"
        style={FIELD}
      />
    </div>
  )

  // ── The popover (2a / 2b) ──
  const compactTask = (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, marginTop: 12 }}>
      {priorityField}
      {projectField}
    </div>
  )
  const busyColor = (size: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <ColorDots value={color} onChange={setColor} size={size} />
      <Seg options={[{ value: 'busy', label: 'Busy' }, { value: 'free', label: 'Free' }]} value={busy ? 'busy' : 'free'} onChange={(v) => setBusy(v === 'busy')} style={{ flex: 'none', padding: 2, marginLeft: 'auto' }} />
    </div>
  )

  const holdsField = (
    <div style={{ marginTop: page ? 22 : 12 }}>
      <FLabel style={page ? { marginBottom: 8 } : undefined}>Holds</FLabel>
      <div style={page ? { background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', boxShadow: 'var(--shadow-card)', padding: '13px 15px' } : undefined}>
        {holdsTask && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, ...(page ? null : { background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '8px 10px' }) }}>
            <span style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', flex: 1, minWidth: 0 }}><EmojiText text={holdsTask.title} /></span>
            {holdsPlace && <span style={chipStyle('color-mix(in srgb, var(--acc-moss) 20%, transparent)', 'var(--acc-sage-text)')}>{holdsPlace}</span>}
            <button type="button" aria-label="Clear the task" onClick={() => { setHoldsTaskId(null); setHoldsQuery('') }} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 'var(--fs-body-s)' }}>✕</button>
          </div>
        )}
        <div style={{ position: 'relative', ...(page && holdsTask ? { marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line-dashed)' } : null) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {page && <span aria-hidden style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-faint)' }}>⌕</span>}
            <input
              value={holdsQuery}
              aria-label="Find a task"
              onChange={(e) => setHoldsQuery(e.target.value)}
              placeholder="swap for a task — or leave empty for pure focus time"
              style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-caption)', fontStyle: 'italic', color: 'var(--ink-body)', ...(page ? { background: 'none', border: 'none', outline: 'none', padding: 0 } : { background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '8px 10px', marginTop: holdsTask ? 6 : 0 }) }}
            />
          </div>
          {holdsMatches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', boxShadow: 'var(--shadow-popover)', zIndex: 5 }}>
              {holdsMatches.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setHoldsTaskId(t.id)
                    setHoldsQuery('')
                    if (page && t.duration_min) setEndTime(plus(startTime, t.duration_min)) // 1d: "pre-filled from the task's duration"
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', padding: '8px 10px', fontSize: 'var(--fs-caption)', color: 'var(--ink-body)', cursor: 'pointer', border: 'none', borderBottom: '1px dashed var(--line-dashed)', background: 'none' }}
                >
                  <EmojiText text={t.title} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {page && <FHelp>finishing the block offers to check the task off</FHelp>}
    </div>
  )

  // ── The page (1b / 1c / 1d) ──
  const grid = (children: ReactNode) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px', marginTop: 20 }}>{children}</div>
  const dateField = (label: string) => (
    <div>
      <FLabel>{label}</FLabel>
      <div style={{ display: 'grid', gridTemplateColumns: kind === 'task' && !allDay ? '1.5fr 1fr' : '1fr', gap: 8 }}>
        <DateInput value={date} title={label} onChange={(v) => { setDate(v); markDateTouched() }} />
        {kind === 'task' && !allDay && <TimeInput value={startTime} day={date} onChange={(v) => { setStartTime(v); markDateTouched() }} />}
      </div>
    </div>
  )
  const fromTo = (
    <div>
      <FLabel>From — to</FLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <TimeInput value={startTime} day={date} onChange={(v) => { setStartTime(v); markDateTouched() }} />
        <TimeInput value={endTime} day={date} onChange={(v) => { setEndTime(v); markDateTouched() }} />
      </div>
    </div>
  )
  const chips = (list: number[], extra?: ReactNode) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {list.map((m) => (
        <button key={m} type="button" aria-pressed={durationMin === m} onClick={() => setEndTime(plus(startTime, m))} style={durationMin === m ? CHIP_ON : CHIP_OFF}>
          {lenLabel(m)}
        </button>
      ))}
      {extra}
    </div>
  )
  const showsAs = (
    <div>
      <FLabel>Shows you as</FLabel>
      <Seg options={[{ value: 'busy', label: 'Busy' }, { value: 'free', label: 'Free' }]} value={busy ? 'busy' : 'free'} onChange={(v) => setBusy(v === 'busy')} />
    </div>
  )
  const colorField = (help?: string) => (
    <div style={{ gridColumn: '1 / -1' }}>
      <FLabel style={{ marginBottom: 8 }}>Color</FLabel>
      <ColorDots value={color} onChange={setColor} size={22} />
      {help && <FHelp>{help}</FHelp>}
    </div>
  )
  const addLabel = () => {
    const l = labelInput.trim().replace(/^\*/, '')
    setLabelInput('')
    if (l && !allLabels.includes(l)) setLabels((x) => [...x, l])
  }

  const pageTask = (
    <>
      <FLabel style={{ margin: '20px 0 8px' }}>Notes</FLabel>
      <textarea
        value={notes}
        aria-label="Notes"
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything worth remembering when you sit down to do it…"
        rows={3}
        style={{ width: '100%', minHeight: 74, resize: 'vertical', font: 'inherit', fontSize: 'var(--fs-body-s)', lineHeight: 1.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '13px 15px' }}
      />
      {grid(
        <>
          {dateField('Due')}
          {priorityField}
          {projectField}
          <div>
            <FLabel>Duration</FLabel>
            {chips(DURATION_CHIPS, !DURATION_CHIPS.includes(durationMin) && durationText ? <span style={CHIP_ON}>{durationText}</span> : null)}
          </div>
          <div>
            <FLabel>Reminder</FLabel>
            <Select value={reminderOffset} onChange={setReminderOffset} options={REMINDER_OPTIONS} ariaLabel="Reminder" style={FIELD} />
            <FHelp>{reminderOffset ? 'sends a push · needs a due time ✓' : 'no push'}</FHelp>
          </div>
          <div>
            <FLabel>Repeat</FLabel>
            <PickField label="Repeat" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setRepeatAt({ x: r.left, y: r.bottom + 4 }) }}>
              {repeat ? repeatLabel(repeat) : "Doesn't repeat"}
            </PickField>
            <FHelp>daily · weekly · monthly · custom rule</FHelp>
          </div>
          <div>
            <FLabel>Labels</FLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allLabels.map((l) => (
                <button key={l} type="button" aria-label={`Remove label ${l}`} onClick={() => setLabels((x) => x.filter((y) => y !== l))} style={CHIP_OFF}>
                  *{l} ✕
                </button>
              ))}
              <input
                value={labelInput}
                aria-label="Add a label"
                placeholder="+ label"
                onChange={(e) => setLabelInput(e.target.value)}
                onBlur={addLabel}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addLabel() } }}
                style={{ ...CHIP_ADD, width: 96, outline: 'none', cursor: 'text' }}
              />
            </div>
          </div>
          <div>
            <FLabel>Starts as</FLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 2px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', cursor: 'pointer' }}>
                <Toggle on={top3} label="Top-3 today" onToggle={() => setTop3((v) => !v)} />
                <span style={{ color: 'var(--acc-terra)' }}>★</span> Top-3 today
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--fs-body-s)', color: 'var(--ink-faint)', cursor: 'pointer' }}>
                <Toggle on={someday} label="Someday" onToggle={() => setSomedayFlag((v) => !v)} />
                <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 13, opacity: 0.7 }} /> Someday
              </label>
            </div>
          </div>
        </>,
      )}
    </>
  )
  const pageEvent = grid(
    <>
      {dateField('Date')}
      {!allDay ? fromTo : <div />}
      <div>
        <FLabel>All day</FLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px', fontSize: 'var(--fs-caption)', color: 'var(--ink-faint)', cursor: 'pointer' }}>
          <Toggle on={allDay} label="All day" onToggle={() => setAllDay((v) => !v)} />
          {allDay ? 'on — the whole day' : 'off — times shown'}
        </label>
      </div>
      {showsAs}
      {colorField()}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--acc-hydrangea) 12%, transparent)', borderRadius: 'var(--radius-input)', padding: '9px 12px' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>mirrors quietly to Google Calendar · never shown as its own UI</span>
      </div>
    </>,
  )
  const pageBlock = (
    <>
      {holdsField}
      {grid(
        <>
          {dateField('Date')}
          {fromTo}
          <div style={{ gridColumn: '1 / -1' }}>
            <FLabel>Length</FLabel>
            {chips(LENGTH_CHIPS)}
            <FHelp>{holdsTask?.duration_min ? "pre-filled from the task's duration" : 'or set the times above'}</FHelp>
          </div>
          {showsAs}
          <div />
          {colorField('lavender by default — a blush edge marks its task')}
        </>,
      )}
    </>
  )

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: page ? 30 : 14, paddingTop: page ? 16 : 11, borderTop: '1px dashed var(--line-dashed)' }}>
      {page ? (
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 'var(--fs-hand)', color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>{KIND_META[kind].hand}</span>
      ) : (
        <button type="button" onClick={() => onExpand?.(snapshot())} style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono-tight)', textTransform: 'uppercase', color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          More options ↗
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: page ? 12 : 10 }}>
        {page ? (
          <button type="button" onClick={onClose} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: 'var(--fs-body-s)', padding: '10px 18px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>Cancel</button>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>esc</span>
        )}
        <button
          type="button"
          onClick={(e) => submit(e.currentTarget)}
          style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: page ? 'var(--fs-body-s)' : 'var(--fs-caption)', padding: page ? '10px 22px' : '8px 16px', borderRadius: 'var(--radius-pill)', boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
        >
          {page ? `${KIND_META[kind].cta} ⏎` : 'Create ⏎'}
        </button>
      </div>
    </div>
  )

  const repeatPicker = repeatAt && (
    repeatAt.custom ? (
      <RepeatEditor value={repeat} start={date ? cairoToIso(date, startTime || '09:00') : null} position={repeatAt} onClose={() => setRepeatAt(null)} onChange={setRepeat} />
    ) : (
      <RepeatMenu value={repeat} start={date ? cairoToIso(date, startTime || '09:00') : null} position={repeatAt} onClose={() => setRepeatAt(null)} onChange={(r) => { setRepeat(r); setRepeatAt(null) }} onCustom={() => setRepeatAt((at) => at && { ...at, custom: true })} />
    )
  )

  if (page) {
    return (
      <div className="kf-quickcreate" style={{ display: 'flex', justifyContent: 'center', padding: '34px 40px 48px' }}>
        <div style={{ width: 680, maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <BackLink onClick={onClose}>Back</BackLink>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>esc closes · nothing saved until create</span>
          </div>
          {/* Editor 1b draws 32px; the nearest display token. */}
          <h1 style={{ margin: '18px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-display-l)', letterSpacing: 'var(--ls-display)', color: 'var(--ink-body)' }}>Something new</h1>
          {kindSwitcher}
          {titleField}
          {kind === 'task' && pageTask}
          {kind === 'event' && pageEvent}
          {kind === 'block' && pageBlock}
          {footer}
        </div>
        {repeatPicker}
      </div>
    )
  }

  // R4-14 / Kai 2026-10-03: the popover is measured (pre-paint, and whenever its content changes
  // height) and placed beside the pointer, flipped/shifted to fit (placeAtPointer); it scrolls only
  // when the window is shorter than it. anchor is VISUAL px (clientX/Y); fixed left/top are LAYOUT
  // px — divided by the UI zoom (lib/uiScale).
  const z = uiZoom()
  const vw = window.innerWidth / z
  const vh = window.innerHeight / z
  const at = anchor ? pos ?? { left: Math.max(8, Math.min(anchor.x / z, vw - 368)), top: Math.max(8, anchor.y / z) } : { left: Math.max(8, (vw - 360) / 2), top: Math.max(8, vh / 5) }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
      <div
        ref={popRef}
        className="kf-quickcreate" onClick={(e) => e.stopPropagation()}
        // deviation(2026-07-18 audit): export 2a tilts the popover rotate(-0.3deg), but the
        // sub-pixel transform blurred all popover text — dropped for crisp rendering.
        style={{ position: 'fixed', left: at.left, top: at.top, width: 360, maxWidth: vw - 16, maxHeight: vh - 16, overflowY: 'auto', overscrollBehavior: 'contain', zIndex: 999, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', boxShadow: 'var(--shadow-popover)', padding: '15px 16px', animation: 'entryFadeUp 210ms var(--ease-out)' }}
      >
        {kindSwitcher}
        {titleField}
        {whenRow}
        {kind === 'task' && compactTask}
        {kind === 'event' && busyColor(16)}
        {kind === 'block' && (
          <>
            {holdsField}
            {busyColor(16)}
          </>
        )}
        {footer}
      </div>
    </>
  )
}
