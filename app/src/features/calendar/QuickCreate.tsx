import { useEffect, useMemo, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import * as chrono from 'chrono-node'
import { Select } from '../../components/Select'
import { DateInput, TimeInput, Seg, ColorDots, FLabel, FHelp } from './formFields'
import { createEvent, scheduleTask, updateEvent } from './api'
import { localTimeKey, localToIso } from './eventTime'
import { localDateKey } from '../routines/streaks'
import { createTask, setRecurrence, setLabels, toggleTop3, setSomeday, useTasks } from '../tasks/api'
import { parseCommand } from '../command-bar/parseCommand'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { writeRow } from '../../lib/outbox'

// ── Editor.dc.html 2a/2b (compact popover) · 2c (phone sheet) · 1b/1c/1d field
// content (expanded, via "More options ↗"). One component: the kind switcher
// (Task/Event/Block) picks which field set renders below the title. ──

export type QuickCreateKind = 'task' | 'event' | 'block'

export interface QuickCreateProps {
  initialKind: QuickCreateKind
  /** The grid slot that was clicked/dragged — null when opened from the rail's bare "quick add". */
  slot: { date: string; start: string; end: string; allDay: boolean } | null
  /** Screen position to anchor the compact popover near. Ignored on phone widths (bottom sheet). */
  anchor: { x: number; y: number } | null
  onClose: () => void
}

const KIND_META: Record<QuickCreateKind, { label: string; desc: string; cta: string; hand: string }> = {
  task: { label: 'Task', desc: 'something to do — lives in your lists', cta: 'Create task', hand: 'plant it — the blossom grows a bud ✿' },
  event: { label: 'Event', desc: 'a moment in time — lives on the calendar', cta: 'Create event', hand: 'the daisy opens a petal for it ✿' },
  block: { label: 'Time block', desc: 'reserved focus — usually holds a task', cta: 'Block time', hand: 'two hours fenced off, just for this ✿' },
}

function todayKey(): string {
  return localDateKey(new Date())
}

function diffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

function nextDayIso(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '10', label: '10 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

const REPEAT_OPTIONS = [
  { value: '', label: "Doesn't repeat" },
  { value: 'FREQ=DAILY', label: '↻ Daily' },
  { value: 'FREQ=WEEKLY', label: '↻ Weekly' },
  { value: 'FREQ=MONTHLY', label: '↻ Monthly' },
]

const DURATION_CHIPS = [15, 30, 60, 120]

export function QuickCreate({ initialKind, slot, anchor, onClose }: QuickCreateProps) {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: domains = [] } = useDomains()

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const [kind, setKind] = useState<QuickCreateKind>(initialKind)
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(slot?.date ?? todayKey())
  const [startTime, setStartTime] = useState(slot?.start ?? '09:00')
  const [endTime, setEndTime] = useState(slot?.end ?? '09:30')
  const [allDay, setAllDay] = useState(slot?.allDay ?? false)
  const [busy, setBusy] = useState(true)
  const [color, setColor] = useState<string | null>(null)
  const [priority, setPriority] = useState<number | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [holdsTaskId, setHoldsTaskId] = useState<string | null>(null)
  const [holdsQuery, setHoldsQuery] = useState('')
  const [reminderOffset, setReminderOffset] = useState('30')
  const [repeat, setRepeat] = useState('')
  const [labelsText, setLabelsText] = useState('')
  const [top3, setTop3] = useState(false)
  const [someday, setSomedayFlag] = useState(false)

  // Whether the slot-provided date/time is still authoritative, or the user (or the NL
  // title parse) has taken it over — a click on the grid should not get silently
  // repositioned by whatever the title happens to parse to.
  const [dateTouched, setDateTouched] = useState(Boolean(slot))
  const [priorityTouched, setPriorityTouched] = useState(false)
  const [projectTouched, setProjectTouched] = useState(false)

  useEscapeStack(true, onClose)
  useBodyScrollLock(true)

  const parsed = useMemo(() => (kind === 'task' ? parseCommand(title, domains, projects) : null), [kind, title, domains, projects])
  const eventDate = useMemo(() => {
    if (kind === 'task' || !title.trim()) return null
    const hits = chrono.parse(title, new Date(), { forwardDate: true })
    return hits[0]?.start.date() ?? null
  }, [kind, title])

  // A stale end time from before the NL parse can land before the newly-caught start —
  // bump it forward by the default 30 min whenever that would happen.
  function applyParsedTime(d: Date) {
    const newStart = localTimeKey(d)
    setDate(localDateKey(d))
    setStartTime(newStart)
    if (diffMinutes(newStart, endTime) <= 0) {
      const total = d.getHours() * 60 + d.getMinutes() + 30
      setEndTime(`${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`)
    }
  }

  useEffect(() => {
    if (parsed?.dueAt && !dateTouched) applyParsedTime(new Date(parsed.dueAt))
    if (parsed?.priority != null && !priorityTouched) setPriority(parsed.priority)
    if (parsed?.projectId && !projectTouched) { setProjectId(parsed.projectId); setAreaId(null) }
  }, [parsed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (eventDate && !dateTouched) applyParsedTime(eventDate)
  }, [eventDate]) // eslint-disable-line react-hooks/exhaustive-deps

  function markDateTouched() { setDateTouched(true) }

  const holdsMatches = holdsQuery.trim()
    ? tasks.filter((t) => !t.scheduled_start && t.title.toLowerCase().includes(holdsQuery.trim().toLowerCase())).slice(0, 5)
    : []
  const holdsTask = holdsTaskId ? tasks.find((t) => t.id === holdsTaskId) : null

  function submit() {
    if (kind === 'task') {
      const dueAt = date ? localToIso(date, startTime || '09:00') : null
      const task = createTask({
        title: title.trim() || 'Untitled task',
        dueAt,
        projectId,
        priority,
        durationMin: startTime && endTime && diffMinutes(startTime, endTime) > 0 ? diffMinutes(startTime, endTime) : null,
        reminderOffsetMin: reminderOffset ? Number(reminderOffset) : null,
      })
      if (areaId) writeRow('tasks', { ...task, area_id: areaId, project_id: null })
      if (repeat) setRecurrence(task, repeat)
      const labels = labelsText.split(',').map((s) => s.trim()).filter(Boolean)
      if (labels.length) setLabels(task, labels)
      if (top3) toggleTop3(task)
      if (someday) setSomeday(task, true)
      if (slot && date && startTime && endTime) {
        scheduleTask(task, localToIso(date, startTime), localToIso(date, endTime))
      }
    } else if (kind === 'event') {
      const startsAt = allDay ? `${date}T00:00:00.000Z` : localToIso(date, startTime)
      const endsAt = allDay ? nextDayIso(date) : localToIso(date, endTime)
      const event = createEvent(title.trim() || 'New event', startsAt, endsAt, 'event', color)
      if (!busy) updateEvent(event, { busy: false })
    } else {
      const startsAt = localToIso(date, startTime)
      const endsAt = localToIso(date, endTime)
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

  // ── Field blocks (shared by popover / expanded / sheet) ──
  const kindSwitcher = expanded ? (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
      {(Object.keys(KIND_META) as QuickCreateKind[]).map((k) => {
        const on = k === kind
        return (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            style={{
              position: 'relative',
              textAlign: 'left',
              background: on ? 'var(--paper-parchment)' : 'var(--paper-bone)',
              border: '1px solid var(--line-card)',
              borderRadius: 3,
              boxShadow: on ? 'var(--shadow-card)' : 'none',
              opacity: on ? 1 : 0.75,
              padding: '13px 14px',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {k === 'block' ? (
                <span style={{ width: 16, height: 16, borderLeft: '3px solid var(--acc-lavender)', background: 'color-mix(in srgb, var(--acc-lavender) 20%, transparent)', borderRadius: 2 }} />
              ) : (
                <img src={`/ds/assets/${k === 'task' ? 'cherry/bud' : 'daisy/midday'}.png`} alt="" style={{ height: 20, opacity: on ? 1 : 0.8 }} />
              )}
              <span style={{ fontSize: 14, fontWeight: on ? 600 : 400, color: on ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{KIND_META[k].label}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.4, color: on ? 'var(--ink-muted)' : 'var(--ink-faint)' }}>{KIND_META[k].desc}</div>
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

  const titleField = (
    <div
      // Editor.dc.html 2a:98 — compact title is bare text over the popover paper with only a
      // dashed underline; the boxed treatment (border/shadow) is the expanded editor's. The old
      // always-on box + zero horizontal padding put the placeholder right on the border line.
      style={{
        background: expanded ? 'var(--paper-parchment)' : 'none',
        border: expanded ? '1px solid var(--line-card)' : 'none',
        borderRadius: expanded ? 6 : 0,
        boxShadow: expanded ? 'var(--shadow-card)' : 'none',
        padding: expanded ? '16px 18px' : '0 0 9px',
        borderBottom: expanded ? undefined : '1px dashed var(--line-dashed)',
        marginBottom: 11,
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder={kind === 'task' ? 'Call Omar re: pricing friday 3pm !!' : kind === 'event' ? 'Dinner with Salma & the cousins' : 'What is this time for?'}
        style={{
          width: '100%',
          fontFamily: 'var(--font-display)',
          fontSize: expanded ? 19 : 17,
          color: 'var(--ink-body)',
          background: 'none',
          border: 'none',
          outline: 'none',
        }}
      />
      {(parsed?.dueAt || parsed?.projectMatch || parsed?.priority != null || eventDate) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 9, borderTop: '1px dashed var(--line-dashed)' }}>
          {(parsed?.dueAt || eventDate) && (
            <span style={chipStyle('color-mix(in srgb, var(--acc-lavender) 22%, transparent)', 'var(--acc-lavender-text)')}>
              → {new Date(parsed?.dueAt ?? eventDate!).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          {parsed?.projectMatch && <span style={chipStyle('color-mix(in srgb, var(--acc-moss) 20%, transparent)', 'var(--acc-sage-text)')}>→ {parsed.projectMatch}</span>}
          {parsed?.priority != null && <span style={chipStyle('color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', 'var(--acc-gold)')}>{'!'.repeat(4 - parsed.priority)} {parsed.priority === 1 ? 'Critical' : parsed.priority === 2 ? 'High' : 'Medium'}</span>}
          {expanded && kind === 'task' && <FHelp style={{ marginLeft: 'auto', marginTop: 0 }}>the title types it, the fields catch it</FHelp>}
        </div>
      )}
    </div>
  )

  function chipStyle(bg: string, color: string) {
    return { fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '4px 9px', borderRadius: 999, background: bg, color }
  }

  const gridCols = expanded ? '1fr 1fr' : '1fr'

  const dateTimeRow = (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
      <div>
        <FLabel>{kind === 'task' ? 'Due' : 'Date'}</FLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <DateInput value={date} onChange={(v) => { setDate(v); markDateTouched() }} />
          {!allDay && kind === 'task' && <TimeInput value={startTime} onChange={(v) => { setStartTime(v); markDateTouched() }} />}
        </div>
      </div>
      {!allDay && (
        <div>
          <FLabel>{kind === 'task' ? 'Block' : 'From — to'}</FLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {kind !== 'task' && <TimeInput value={startTime} onChange={(v) => { setStartTime(v); markDateTouched() }} />}
            {kind === 'task' && <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{startTime}</span>}
            <span style={{ color: 'var(--ink-hairline)', fontSize: 11 }}>–</span>
            <TimeInput value={endTime} onChange={(v) => { setEndTime(v); markDateTouched() }} />
            {durationMin > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{durationMin >= 60 ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? durationMin % 60 + 'm' : ''}` : `${durationMin}m`}</span>}
          </div>
        </div>
      )}
    </div>
  )

  const taskFields = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, marginTop: 12 }}>
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
            style={{ fontSize: 12.5, padding: '8px 10px', width: '100%' }}
          />
        </div>
      </div>
      {expanded && (
        <>
          <div style={{ marginTop: 12 }}>
            <FLabel>Duration</FLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DURATION_CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { const [eh, em] = startTime.split(':').map(Number); const total = eh * 60 + em + m; setEndTime(`${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`) }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, border: durationMin === m ? 'none' : '1px solid var(--line-solid)', background: durationMin === m ? 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' : 'transparent', color: durationMin === m ? 'var(--acc-lavender-text)' : 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  {m >= 60 ? `${m / 60}h` : `${m}m`}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, marginTop: 12 }}>
            <div>
              <FLabel>Reminder</FLabel>
              <Select value={reminderOffset} onChange={setReminderOffset} options={REMINDER_OPTIONS} ariaLabel="Reminder" style={{ fontSize: 12.5, padding: '8px 10px', width: '100%' }} />
            </div>
            <div>
              <FLabel>Repeat</FLabel>
              <Select value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} ariaLabel="Repeat" style={{ fontSize: 12.5, padding: '8px 10px', width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <FLabel>Labels</FLabel>
            <input
              value={labelsText}
              onChange={(e) => setLabelsText(e.target.value)}
              placeholder="deep-work, q3"
              style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }}>
              <input type="checkbox" checked={top3} onChange={(e) => setTop3(e.target.checked)} style={{ accentColor: 'var(--acc-terra)' }} />
              <span style={{ color: 'var(--acc-terra)', fontSize: 15 }}>★</span> Top-3 today
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-faint)', cursor: 'pointer' }}>
              <input type="checkbox" checked={someday} onChange={(e) => setSomedayFlag(e.target.checked)} style={{ accentColor: 'var(--acc-terra)' }} />
              <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 13, opacity: 0.7 }} /> Someday
            </label>
          </div>
        </>
      )}
      {!expanded && slot && (
        <FHelp style={{ marginTop: 9 }}>lands in Tasks · this slot becomes its time block, blush-edged</FHelp>
      )}
    </>
  )

  const eventFields = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <ColorDots value={color} onChange={setColor} size={expanded ? 22 : 16} />
        <Seg options={[{ value: 'busy', label: 'Busy' }, { value: 'free', label: 'Free' }]} value={busy ? 'busy' : 'free'} onChange={(v) => setBusy(v === 'busy')} style={{ flex: 'none', padding: 2, marginLeft: 'auto' }} />
      </div>
      {expanded && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 12.5, color: 'var(--ink-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ accentColor: 'var(--acc-lavender)' }} />
            All day
          </label>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--acc-hydrangea) 12%, transparent)', borderRadius: 6, padding: '9px 12px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>mirrors quietly to Google Calendar · never shown as its own UI</span>
          </div>
        </>
      )}
    </>
  )

  const blockFields = (
    <>
      <div style={{ marginTop: 12 }}>
        <FLabel>Holds</FLabel>
        {holdsTask ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-body)', flex: 1 }}>{holdsTask.title}</span>
            <span onClick={() => { setHoldsTaskId(null); setHoldsQuery('') }} style={{ color: 'var(--ink-hairline)', fontSize: 13, cursor: 'pointer' }}>✕</span>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={holdsQuery}
              onChange={(e) => setHoldsQuery(e.target.value)}
              placeholder="swap for a task — or leave empty for pure focus time"
              style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontStyle: 'italic', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px' }}
            />
            {holdsMatches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-popover)', zIndex: 5 }}>
                {holdsMatches.map((t) => (
                  <div key={t.id} onClick={() => { setHoldsTaskId(t.id); setHoldsQuery(t.title) }} style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--ink-body)', cursor: 'pointer', borderBottom: '1px dashed var(--line-dashed)' }}><EmojiText text={t.title} /></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <ColorDots value={color ?? '#A8A0BE'} onChange={setColor} size={expanded ? 22 : 16} />
        <Seg options={[{ value: 'busy', label: 'Busy' }, { value: 'free', label: 'Free' }]} value={busy ? 'busy' : 'free'} onChange={(v) => setBusy(v === 'busy')} style={{ flex: 'none', padding: 2, marginLeft: 'auto' }} />
      </div>
    </>
  )

  // Editor.dc.html 2c — the phone sheet gets a full-width terra CTA with the editor link
  // centered under it, not the desktop's left/right footer row.
  const footer = isMobile && !expanded ? (
    <>
      <button
        type="button"
        onClick={submit}
        style={{ width: '100%', border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 14.5, padding: 14, borderRadius: 999, boxShadow: 'var(--shadow-cta)', marginTop: 16, cursor: 'pointer' }}
      >
        {KIND_META[kind].cta}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 10 }}>
        <button type="button" onClick={() => setExpanded(true)} style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          Full editor ↗
        </button>
        {/* deviation(2026-07-18 audit): export says "swipe down to dismiss" but the sheet has
            no swipe gesture — the hint names the dismiss that actually works. */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>tap outside to dismiss</span>
      </div>
    </>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: expanded ? 22 : 14, paddingTop: expanded ? 16 : 11, borderTop: '1px dashed var(--line-dashed)' }}>
      {expanded ? (
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>{KIND_META[kind].hand}</span>
      ) : (
        <button type="button" onClick={() => setExpanded(true)} style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          More options ↗
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {expanded ? (
          <button type="button" onClick={onClose} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}>Cancel</button>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>esc</span>
        )}
        <button
          type="button"
          onClick={submit}
          style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: expanded ? 13 : 12.5, padding: expanded ? '10px 22px' : '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
        >
          {expanded ? `${KIND_META[kind].cta} ⏎` : 'Create ⏎'}
        </button>
      </div>
    </div>
  )

  const body = (
    <>
      {kindSwitcher}
      {titleField}
      {dateTimeRow}
      {kind === 'task' && taskFields}
      {kind === 'event' && eventFields}
      {kind === 'block' && blockFields}
      {footer}
    </>
  )

  // ── Container: mobile bottom sheet · desktop popover (near click) · expanded modal (centered) ──
  // Motion 3c — scrim and card arrive together, 210ms up-and-settle (entryFadeUp is the
  // token keyframe; qcFadeIn is the scrim's plain fade). Exits stay instant for now —
  // delayed-unmount helper is a foundation-level ask.
  const overlayAnim = <style>{'@keyframes qcFadeIn{from{opacity:0}}'}</style>

  if (isMobile) {
    return (
      <>
        {overlayAnim}
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,32,0.3)', zIndex: 998, animation: 'qcFadeIn 210ms var(--ease-out)' }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderBottom: 'none', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 40px rgba(60,52,38,0.28)', padding: '14px 20px calc(22px + env(safe-area-inset-bottom))', maxHeight: '88dvh', overflowY: 'auto', overscrollBehavior: 'contain', animation: 'entryFadeUp 210ms var(--ease-out)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 10px' }}>
            <span style={{ width: 38, height: 4.5, borderRadius: 3, background: 'var(--line-solid)' }} />
          </div>
          {body}
        </div>
      </>
    )
  }

  if (expanded || !anchor) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,32,0.3)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'qcFadeIn 210ms var(--ease-out)' }}>
        {overlayAnim}
        <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: '100%', maxHeight: '88dvh', overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-popover)', padding: '26px 30px', animation: 'entryFadeUp 210ms var(--ease-out)' }}>
          {body}
        </div>
      </div>
    )
  }

  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - 350))
  const top = Math.min(anchor.y, window.innerHeight - 420)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        // deviation(2026-07-18 audit): export 2a tilts the popover rotate(-0.3deg), but the
        // sub-pixel transform blurred all popover text — dropped for crisp rendering.
        style={{ position: 'fixed', left, top, width: 330, maxWidth: 'calc(100vw - 16px)', zIndex: 999, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '15px 16px', animation: 'entryFadeUp 210ms var(--ease-out)' }}
      >
        {body}
      </div>
    </>
  )
}
