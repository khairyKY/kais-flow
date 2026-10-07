import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet } from '../../components/BottomSheet'
import { DatePicker } from '../../components/DatePicker'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, Chip, SectionLabel } from '../../components/kit'
import { DURATIONS, dayHint, durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { SheetTitle, TimePicker } from '../../components/TimePicker'
import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { Segmented } from '../rituals/RitualChrome'
import { createTask } from '../tasks/api'
import { SAVED_MS } from '../tasks/taskSheetMath'
import { createEvent, deleteEventWithUndo, scheduleTask, updateEvent } from './api'
import { cairoTimeKey, cairoToIso } from './eventTime'
import { DAY_MIN, eventSpan, rangeText, scheduleSlots, slotLabel, spanIso, type DragMode, type Span } from './phoneGridMath'

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
  useLayoutEffect(() => {
    const sheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1)
    const box = sheet?.offsetParent?.getBoundingClientRect()
    setSheetTop(sheet && box ? box.top + sheet.offsetTop : Infinity)
  }, [rect]) // a fresh rect each parent render (a title typed, the keyboard up) — so it re-measures then
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

/** A kit action row (ActionSheet's look): icon · label · hint · chevron. */
function Row({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" className="kf-as-row" onClick={onClick}>
      <span className="kf-as-icon" aria-hidden><Icon name={icon} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px' }}>{label}</span>
      {hint && <span className="kf-as-hint">{hint}</span>}
      <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />
    </button>
  )
}

/** 7c — tap an empty slot: Task (default) or Event, 30 minutes, the keyboard up at once. The slot is
 * drawn over the scrim with the title as you type. Save waits for a title. */
export function QuickCreateSheet({ day, start: at, slotRect, onClose }: { day: string; start: number; slotRect: SlotRect; onClose: () => void }) {
  const [kind, setKind] = useState<'task' | 'event'>('task')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(at)
  const [dur, setDur] = useState(30)
  const [timeOpen, setTimeOpen] = useState(false)
  const name = title.trim()
  const save = (close: () => void) => {
    if (!name) return
    const { starts_at, ends_at } = spanIso({ day, start, end: start + dur })
    if (kind === 'task') scheduleTask(createTask({ title: name, dueAt: starts_at, durationMin: dur }), starts_at, ends_at)
    else createEvent(name, starts_at, ends_at, 'event')
    close()
  }
  return (
    <>
      <BottomSheet onClose={onClose} handleGap={8}>
        {(close) => (
          <div className="pc-qc">
            <div className="pc-qc-top">
              <Segmented label="New" options={[{ value: 'task', label: 'Task' }, { value: 'event', label: 'Event' }]} value={kind} onChange={setKind} />
              <Button disabled={!name} onClick={() => save(close)}>Save</Button>
            </div>
            <input
              className="pc-qc-title"
              autoFocus
              aria-label="Title"
              placeholder={kind === 'task' ? 'New task' : 'New event'}
              enterKeyHint="done"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(close)
              }}
            />
            <div className="pc-qc-chips">
              <Chip tone="date" onClick={() => setTimeOpen(true)}>
                {dayHint(day, cairoDateKey(new Date()))} · {fromMin(start)}
              </Chip>
              {DURATIONS.map((m) => (
                <Chip key={m} tone="duration" icon={false} selected={dur === m} onClick={() => setDur(m)}>
                  {durationLabel(m)}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
      {!timeOpen && <Held rect={slotRect(day, start, start + dur)} fill="var(--block-lavender)" ink="var(--acc-lavender-text)" edge="var(--acc-lavender-deep)" title={name || (kind === 'task' ? 'New task' : 'New event')} time={rangeText(start, start + dur)} />}
      {timeOpen && (
        <TimePicker
          day={day}
          value={fromMin(notPast(day, start))}
          duration={dur}
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

/** 7d — tap a plain event (a task block opens as its task, the Task sheet): Date and Time move it,
 * Delete removes it with Undo. An all-day event keeps its date — no Date, no Time. Kai 2026-10-07
 * ("it felt like a read-only pop-up"): the title is a field (renames on Done / leaving it). */
export function BlockSheet({ event, look, slotRect, pending, onMove, onClose }: {
  event: CalendarEvent
  look: { fill: string; ink: string }
  slotRect: SlotRect
  pending: boolean
  onMove: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  onClose: () => void
}) {
  const [timeOpen, setTimeOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [title, setTitle] = useState(event.title)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const rename = () => {
    const name = title.trim()
    if (!name || name === event.title) return setTitle(event.title)
    updateEvent(event, { title: name })
    setSavedAt(Date.now())
  }
  // Delete: the sheet leaves first, then the block goes and the Undo toast lands on the page.
  const after = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (savedAt == null) return
    const t = window.setTimeout(() => setSavedAt(null), SAVED_MS)
    return () => window.clearTimeout(t)
  }, [savedAt])
  const span = eventSpan(event)
  const len = span.end - span.start
  const today = cairoDateKey(new Date())
  const kind = event.task_id ? 'Task block' : event.type === 'time_block' ? 'Time block' : 'Event'
  const meta = `${kind} · ${event.all_day ? 'All day' : durationLabel(len)}`
  return (
    <>
      <BottomSheet
        detent="medium"
        onClose={() => {
          onClose()
          after.current?.()
        }}
        handleGap={8}
        footer={(close) => (
          <Button
            variant="ghost"
            className="pc-bs-delete"
            icon={<Icon name="delete" size={20} />}
            onClick={() => {
              after.current = () => deleteEventWithUndo(event, 'Deleted')
              close()
            }}
          >
            Delete
          </Button>
        )}
      >
        {() => (
          <>
            <div className="pc-bs-head">
              <div className="pc-bs-title">
                <input
                  className="pc-qc-title pc-bs-title-in"
                  aria-label="Title"
                  enterKeyHint="done"
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
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              {!event.all_day && (
                <>
                  <Row icon="pickdate" label="Date" hint={dayHint(span.day, today)} onClick={() => setDateOpen(true)} />
                  <Row icon="clock" label="Time" hint={rangeText(span.start, span.end)} onClick={() => setTimeOpen(true)} />
                </>
              )}
            </div>
            {(pending || savedAt != null) && <div className={`pc-bs-save${pending ? ' is-pending' : ''}`}>{pending ? '○ Pending sync' : '✓ Saved'}</div>}
          </>
        )}
      </BottomSheet>
      <Held rect={event.all_day || timeOpen || dateOpen ? null : slotRect(span.day, span.start, span.end)} fill={look.fill} ink={look.ink} edge="var(--ink-body)" title={event.title} time={rangeText(span.start, span.end)} />
      {dateOpen && (
        <DatePicker
          mode="day"
          title="Date"
          meta={event.title}
          value={span.day}
          quick
          onPick={(day) => {
            if (day === span.day) return
            onMove(event, span, { ...span, day }, 'move')
            setSavedAt(Date.now())
          }}
          onClose={() => setDateOpen(false)}
        />
      )}
      {timeOpen && (
        <TimePicker
          day={span.day}
          value={fromMin(span.start)}
          duration={len}
          title={event.title}
          onDone={(hhmm, d) => {
            const start = toMin(hhmm)
            const to = { day: span.day, start, end: start + (d ?? len) }
            if (to.start === span.start && to.end === span.end) return
            onMove(event, span, to, d ? 'bottom' : 'move')
            setSavedAt(Date.now())
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </>
  )
}

/** 7g — tap a rail chip (Overdue · Today · Inbox): the next 3 free slots, one tap places the block
 * (the caller writes it, toast + Undo). 7g2 — nothing fits today: says so and offers the next days.
 * Or pick a time / a date. "Replan" (Kai 2026-10-07) is the same sheet for an overdue block, with
 * the way into its task. */
export function ScheduleSheet({ title, duration, events, heading = 'Schedule', onPlace, onOpen, onClose }: {
  title: string
  duration: number
  events: readonly CalendarEvent[]
  heading?: string
  onPlace: (startsAt: string, endsAt: string) => void
  onOpen?: () => void
  onClose: () => void
}) {
  const [picker, setPicker] = useState<'time' | 'date' | null>(null)
  const now = new Date()
  const today = cairoDateKey(now)
  const dur = duration
  const { today: fitsToday, slots } = scheduleSlots(events, now, dur)
  const place = (startsAt: string, len: number) => onPlace(startsAt, new Date(Date.parse(startsAt) + len * 60_000).toISOString())
  return (
    <>
      <BottomSheet onClose={onClose} title={<SheetTitle title={heading} meta={`${title} · ${durationLabel(dur)}`} />}>
        {(close) => (
          <>
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
              {onOpen && <Row icon="tasks" label="Open task" onClick={() => { close(); onOpen() }} />}
            </div>
          </>
        )}
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
