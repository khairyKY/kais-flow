import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { cairoTimeKey } from '../features/calendar/eventTime'
import { cairoDateKey } from '../lib/dateShortcuts'
import { tick } from '../lib/haptics'
import { useEscapeStack } from '../lib/overlayStack'
import { queryClient } from '../lib/queryClient'
import type { CalendarEvent, Task } from '../lib/types'
import { uiZoom } from '../lib/uiScale'
import { ACTION_ROW_CSS } from './ActionSheet'
import { BottomSheet, useIsMobile } from './BottomSheet'
import { Float } from './Float'
import { Icon } from './Icon'
import type { IconName } from './icons/kf'
import { Button } from './kit'
import { MONTHS, addDays, atDay, dayLabel, dayShort, dayTitle, daysWithItems, monthGrid, monthOf, quickPicks, shiftDay, type QuickKey } from './pickerMath'
import { SheetTitle, TimePanel } from './TimePicker'
import './pickers.css'

// ── MK Date Picker (DS-CHANGELOG §3). Phone: a full-height BottomSheet — quick picks 6 × 52, month
// header Source Serif 18 + prev/next 48, weekday row mono 12, day cells 48 × 44 with a 40 circle
// (today = 1.5px --acc-terra-ink ring, selected = --acc-lavender-text fill, has items = 4px dot),
// footer Set time + Done. Desktop: the same content in a popover (arrows move, Enter picks,
// PageUp/PageDown change month, Esc closes). A quick pick schedules at once; a day is chosen,
// then Done. Set time swaps in the time sheet for that day (Back returns to the month), whose Done
// hands back day + time. Nothing is written until the caller's onPick. ──

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const QUICK_ICONS: Record<QuickKey | 'someday' | 'none', IconName> = { today: 'today', tomorrow: 'tomorrow', weekend: 'calendar', nextweek: 'pickdate', someday: 'journal', none: 'close' }

export interface DatePickerProps {
  /** Sheet / popover title: "Due date", "Snooze until", "Target date". */
  title: string
  /** Mono line under it — the task's title. */
  meta?: string
  /** 'iso' (default): value and result are instants; a day lands at 09:00 Cairo unless a time is set.
   * 'day': "YYYY-MM-DD" in and out, no time. */
  mode?: 'iso' | 'day'
  value: string | null
  /** `timed`: the time sheet chose the time (a date alone lands at 09:00 and isn't). */
  onPick: (value: string, durationMin?: number, timed?: boolean) => void
  onClose: () => void
  /** Today · Tomorrow · This weekend · Next week (those after `max` drop out). */
  quick?: boolean
  /** Adds Someday. */
  onSomeday?: () => void
  /** Adds No date. */
  onClear?: () => void
  /** Set time (iso mode). */
  withTime?: boolean
  /** Shows the time sheet's duration chips; onPick's second argument when it changed. */
  duration?: number | null
  /** Last pickable day, "YYYY-MM-DD". */
  max?: string
  /** Desktop anchor, screen px (a menu position, or under a field). */
  position?: { x: number; y: number }
  /** The field that opened it: clicks on it don't count as outside. */
  trigger?: RefObject<HTMLElement | null>
  /** Demo data; otherwise the cached tasks and events. */
  tasks?: readonly Task[]
  events?: readonly CalendarEvent[]
}

export function DatePicker(p: DatePickerProps) {
  const { title, meta, mode = 'iso', value, onPick, onClose, quick, onSomeday, onClear, withTime, duration, max, position, trigger, tasks, events } = p
  const isMobile = useIsMobile()
  const monthId = useId()
  const now = new Date()
  const today = cairoDateKey(now)
  const initialDay = value ? (mode === 'day' ? value : cairoDateKey(new Date(value))) : null
  const [day, setDay] = useState(initialDay)
  // Rescheduling an overdue task means picking a day from now on, so a past value opens on this month
  // (its day stays selected — Done without a tap keeps it).
  const opensOn = initialDay && initialDay >= today ? initialDay : today
  const [focusKey, setFocusKey] = useState(opensOn)
  const [month, setMonth] = useState(() => monthOf(opensOn))
  const [stage, setStage] = useState<'date' | 'time'>('date')
  const [time, setTime] = useState<string | null>(null)
  const [dur, setDur] = useState(duration ?? null)
  const gridRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  useEscapeStack(stage === 'time', () => setStage('date')) // Back: time sheet → month, then the sheet
  const marks = useMemo(
    () => daysWithItems(tasks ?? queryClient.getQueryData<Task[]>(['tasks']) ?? [], events ?? queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []),
    [tasks, events],
  )

  const disabled = (k: string) => !!max && k > max
  const emit = (d: string, t: string | null) => {
    const out = mode === 'day' ? d : atDay(d, t ?? '09:00')
    const min = dur != null && dur !== duration ? dur : undefined
    const same = value != null && (mode === 'day' ? out === value : Date.parse(out) === Date.parse(value))
    if (!same || min !== undefined) onPick(out, min, mode === 'iso' && t != null) // Done on an unchanged value writes nothing
  }
  const done = () => {
    if (stage === 'time') emit(day ?? today, time)
    else if (day && day !== initialDay) emit(day, null)
  }
  const choose = (k: string) => {
    tick()
    setDay(k)
    setFocusKey(k)
  }
  const openTime = () => {
    const d = day ?? today
    setDay(d)
    // opens on the value's own time when it's that day's, else 09:00 (drawn selected)
    setTime((t) => t ?? (mode === 'iso' && value && d === initialDay ? cairoTimeKey(new Date(value)) : '09:00'))
    setStage('time')
  }
  const goMonth = (n: number) => {
    const k = shiftDay(focusKey, n)
    setFocusKey(k)
    setMonth(monthOf(k))
  }

  // Keyboard moves focus with the roving cell.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus()
  }, [focusKey])

  function onGridKey(e: KeyboardEvent, close: () => void) {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key]
    const next = step ? addDays(focusKey, step) : e.key === 'PageUp' ? shiftDay(focusKey, -1) : e.key === 'PageDown' ? shiftDay(focusKey, 1) : null
    if (e.key === 'Enter') {
      e.preventDefault()
      if (disabled(focusKey)) return
      if (focusKey !== initialDay) emit(focusKey, null)
      close()
      return
    }
    if (!next) return
    e.preventDefault()
    if (disabled(next)) return // past `max`: stay put (a disabled button can't hold focus)
    moved.current = true
    setFocusKey(next)
    setMonth(monthOf(next))
  }

  const picks = quick ? quickPicks(now, mode === 'iso').filter((q) => !disabled(q.day)) : []
  const checked = picks.find((q) => q.day === initialDay)?.key
  const rows = [
    ...picks.map((q) => ({ key: q.key as QuickKey | 'someday' | 'none', label: q.label, hint: q.hint, run: () => onPick(mode === 'day' ? q.day : q.iso) })),
    ...(onSomeday ? [{ key: 'someday' as const, label: 'Someday', hint: undefined, run: onSomeday }] : []),
    ...(onClear ? [{ key: 'none' as const, label: 'No date', hint: undefined, run: onClear }] : []),
  ]

  const content = (close: () => void) =>
    stage === 'time' ? (
      <TimePanel day={day ?? today} value={time} onValue={setTime} duration={duration !== undefined ? dur : undefined} onDuration={duration !== undefined ? setDur : undefined} events={events} />
    ) : (
      <>
        <style>{ACTION_ROW_CSS}</style>
        {rows.length > 0 && (
          <div className="kf-pk-picks">
            {rows.map((r) => (
              <button key={r.key} type="button" className="kf-as-row" aria-current={r.key === checked || undefined} onClick={() => { r.run(); close() }}>
                <span className="kf-as-icon" aria-hidden><Icon name={QUICK_ICONS[r.key]} size={24} /></span>
                <span className="kf-pk-label">{r.label}</span>
                {r.hint && <span className="kf-as-hint">{r.hint}</span>}
                {r.key === checked && <Icon name="check" size={20} className="kf-pk-check" />}
              </button>
            ))}
          </div>
        )}
        <div className="kf-pk-cal">
          <div className="kf-pk-month">
            <span id={monthId} aria-live="polite">{MONTHS[month.m - 1]} {month.y}</span>
            <button type="button" className="kf-pk-nav" aria-label="Previous month" onClick={() => goMonth(-1)}>
              <Icon name="chevright" size={24} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button type="button" className="kf-pk-nav" aria-label="Next month" onClick={() => goMonth(1)}>
              <Icon name="chevright" size={24} />
            </button>
          </div>
          <div ref={gridRef} role="grid" aria-labelledby={monthId} onKeyDown={(e) => onGridKey(e, close)}>
            <div role="row" className="kf-pk-row kf-pk-wk">
              {WEEKDAYS.map((w) => <span key={w} role="columnheader" aria-label={w}>{w[0]}</span>)}
            </div>
            {monthGrid(month).map((week, i) => (
              <div key={i} role="row" className="kf-pk-row">
                {week.map((k, j) =>
                  k ? (
                    <button
                      key={k}
                      type="button"
                      role="gridcell"
                      data-day={k}
                      tabIndex={k === focusKey ? 0 : -1}
                      disabled={disabled(k)}
                      aria-selected={k === day}
                      aria-current={k === today ? 'date' : undefined}
                      aria-label={`${dayLabel(k)}${marks.has(k) ? ', has items' : ''}`}
                      className={`kf-pk-day${k.slice(0, 7) !== `${month.y}-${String(month.m).padStart(2, '0')}` ? ' is-out' : ''}${k === today ? ' is-today' : ''}${marks.has(k) ? ' has-items' : ''}`}
                      onClick={() => choose(k)}
                    >
                      <span>{Number(k.slice(8))}</span>
                    </button>
                  ) : (
                    <span key={`b${j}`} role="gridcell" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </>
    )

  const footer = (close: () => void) => (
    <>
      {stage === 'date' && withTime && mode === 'iso' && (
        <Button type="button" variant="secondary" icon={<Icon name="clock" size={20} />} onClick={openTime}>Set time</Button>
      )}
      <Button type="button" onClick={() => { done(); close() }}>Done</Button>
    </>
  )
  const heading = stage === 'time' ? 'Time' : title
  const sub = stage === 'time' ? dayTitle(day ?? today, today) : meta

  if (isMobile) {
    return (
      <BottomSheet detent="full" onClose={onClose} title={<SheetTitle title={heading} meta={sub} />} footer={footer}>
        {content}
      </BottomSheet>
    )
  }
  return (
    <Popover title={<SheetTitle title={heading} meta={sub} />} position={position} trigger={trigger} onClose={onClose} footer={footer(onClose)} focusKey={stage === 'date' ? focusKey : null}>
      {content(onClose)}
    </Popover>
  )
}

/** The desktop dialect: a kf-overlay-card popover at `position`, clamped to the viewport; outside
 * click and Esc close it; focus starts on the day cell and goes back where it came from. */
function Popover({ title, position = { x: 0, y: 0 }, trigger, onClose, footer, focusKey, children }: {
  title: ReactNode
  position?: { x: number; y: number }
  trigger?: RefObject<HTMLElement | null>
  onClose: () => void
  footer: ReactNode
  focusKey: string | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [place, setPlace] = useState<{ h: number; above: number | null }>({ h: 0, above: null })
  useEscapeStack(true, onClose)

  // Re-measured every render (the time stage is taller); an unchanged box bails out. `above` = the
  // top that would sit the popover over its field instead of under it.
  useLayoutEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const h = ref.current?.offsetHeight ?? 0
    const r = trigger?.current?.getBoundingClientRect()
    const above = r ? r.top / uiZoom() - 4 - h : null
    setPlace((p) => (p.h === h && p.above === above ? p : { h, above }))
  })
  useEffect(() => {
    const prev = document.activeElement
    if (focusKey) ref.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !trigger?.current?.contains(t)) closeRef.current()
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  const z = uiZoom() // screen px → layout px under the root zoom
  const vw = window.innerWidth / z
  const vh = window.innerHeight / z
  const { h, above } = place
  const below = position.y / z
  const style: CSSProperties = {
    left: Math.max(8, Math.min(position.x / z, vw - 340 - 8)),
    top: Math.max(12, Math.min(below + h > vh - 12 && above != null && above >= 12 ? above : below, vh - h - 12)),
    maxHeight: vh - 24,
  }
  return (
    <Float>
      {/* Presses stop here, like BottomSheet: React bubbles portal events up the component tree,
          and a picker opened from a row would otherwise hand the row its clicks. Keys too (all but
          Esc, which overlayStack owns): the list shortcuts (arrows, 1/2/3, #) listen on window. */}
      <div
        ref={ref}
        role="dialog"
        aria-labelledby={titleId}
        className="kf-pk-pop kf-overlay-card"
        style={style}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation() }}
      >
        <div id={titleId} className="kf-pk-pop-head">{title}</div>
        <div className="kf-pk-pop-body">{children}</div>
        <div className="kf-pk-pop-foot">{footer}</div>
      </div>
    </Float>
  )
}

/** A form's date field (replaces <input type="date">): shows the day, opens the picker — a sheet on
 * a phone, a popover under the field on desktop. "YYYY-MM-DD" in and out, "" when cleared. */
export function DateField({ value, onChange, title = 'Date', max, clearable = true, placeholder = 'Pick a date', ariaLabel, style }: {
  value: string
  onChange: (v: string) => void
  title?: string
  max?: string
  clearable?: boolean
  placeholder?: string
  ariaLabel?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={!!at}
        aria-label={`${ariaLabel ?? title}: ${value ? dayLabel(value) : 'not set'}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 4 * uiZoom() })
        }}
        style={{ textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', ...style }}
      >
        {value ? `${dayShort(value)} ${value.slice(0, 4)}` : <span style={{ color: 'var(--ink-faint)' }}>{placeholder}</span>}
      </button>
      {at && (
        <DatePicker
          mode="day"
          title={title}
          value={value || null}
          quick
          max={max}
          position={at}
          trigger={ref}
          onPick={onChange}
          onClear={clearable && value ? () => onChange('') : undefined}
          onClose={() => setAt(null)}
        />
      )}
    </>
  )
}
