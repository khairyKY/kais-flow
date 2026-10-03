import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet } from '../../components/BottomSheet'
import { DatePicker } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, Chip, SectionLabel } from '../../components/kit'
import { DURATIONS, dayHint, durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { SheetTitle, TimePicker } from '../../components/TimePicker'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { Segmented } from '../rituals/RitualChrome'
import { createTask } from '../tasks/api'
import { SAVED_MS } from '../tasks/taskSheetMath'
import { createEvent, deleteEvent, deleteEventWithUndo, scheduleTask } from './api'
import { cairoToIso } from './eventTime'
import { eventSpan, rangeText, scheduleSlots, slotLabel, spanIso, type DragMode, type Span } from './phoneGridMath'

// ── The phone calendar's sheets (Calendar Phone.dc.html): 7c quick create, 7d the event sheet,
// 7g / 7g2 Schedule. All on the kit BottomSheet; every write goes through calendar/api and
// tasks/api (the outbox), and every removal carries Undo. ──

type Rect = { left: number; top: number; width: number; height: number }
export type SlotRect = (day: string, start: number, end: number) => Rect | null

/** The slot or block a sheet is about, drawn over the scrim where it sits on the grid (7c, 7d). */
function Held({ rect, fill, ink, edge, title, time }: { rect: Rect | null; fill: string; ink: string; edge: string; title: string; time: string }) {
  if (!rect) return null
  return createPortal(
    <div className="pc-held" style={{ ...rect, '--pc-fill': fill, '--pc-ink': ink, '--pc-edge': edge } as CSSProperties} aria-hidden>
      <span className="pc-name">{title}</span>
      <span className="pc-time">{time}</span>
    </div>,
    document.body,
  )
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
      <Held rect={slotRect(day, start, start + dur)} fill="var(--block-lavender)" ink="var(--acc-lavender-text)" edge="var(--acc-lavender-deep)" title={name || (kind === 'task' ? 'New task' : 'New event')} time={rangeText(start, start + dur)} />
      {timeOpen && (
        <TimePicker
          day={day}
          value={fromMin(start)}
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

/** 7d — tap a plain event (a task block opens as its task, the Task sheet): Time moves it, Delete
 * removes it with Undo. An all-day event keeps its date — no Time. */
export function BlockSheet({ event, look, slotRect, pending, onMove, onClose }: {
  event: CalendarEvent
  look: { fill: string; ink: string }
  slotRect: SlotRect
  pending: boolean
  onMove: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  onClose: () => void
}) {
  const [timeOpen, setTimeOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
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
              <div className="pc-bs-title"><EmojiText text={event.title} /></div>
              <div className="pc-bs-meta" style={{ '--pc-ink': look.ink } as CSSProperties}>{meta}</div>
            </div>
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              {!event.all_day && <Row icon="clock" label="Time" hint={`${dayHint(span.day, today)} · ${rangeText(span.start, span.end)}`} onClick={() => setTimeOpen(true)} />}
            </div>
            {(pending || savedAt != null) && <div className={`pc-bs-save${pending ? ' is-pending' : ''}`}>{pending ? '○ Pending sync' : '✓ Saved'}</div>}
          </>
        )}
      </BottomSheet>
      <Held rect={event.all_day ? null : slotRect(span.day, span.start, span.end)} fill={look.fill} ink={look.ink} edge="var(--ink-body)" title={event.title} time={rangeText(span.start, span.end)} />
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

/** 7g — tap an unscheduled chip: the next 3 free slots, one tap places the block (toast + Undo).
 * 7g2 — nothing fits today: says so and offers the next days. Or pick a time / a date. */
export function ScheduleSheet({ task, events, onPlaced, onClose }: { task: Task; events: readonly CalendarEvent[]; onPlaced: (day: string) => void; onClose: () => void }) {
  const [picker, setPicker] = useState<'time' | 'date' | null>(null)
  const now = new Date()
  const today = cairoDateKey(now)
  const dur = task.duration_min || 30
  const { today: fitsToday, slots } = scheduleSlots(events, now, dur)
  const place = (startsAt: string, len: number) => {
    const ev = scheduleTask(task, startsAt, new Date(Date.parse(startsAt) + len * 60_000).toISOString())
    toastUndo(`Scheduled · ${task.title}`, () => deleteEvent(ev))
    onPlaced(cairoDateKey(new Date(startsAt)))
  }
  return (
    <>
      <BottomSheet onClose={onClose} title={<SheetTitle title="Schedule" meta={`${task.title} · ${durationLabel(dur)}`} />}>
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
            </div>
          </>
        )}
      </BottomSheet>
      {picker === 'time' && (
        <TimePicker day={today} value={null} duration={dur} title={task.title} onDone={(hhmm, d) => { place(cairoToIso(today, hhmm), d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
      {picker === 'date' && (
        <DatePicker title="Schedule" meta={task.title} value={null} quick withTime duration={dur} onPick={(iso, d) => { place(iso, d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
    </>
  )
}
