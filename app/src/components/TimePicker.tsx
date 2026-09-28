import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cairoDateKey } from '../lib/dateShortcuts'
import { tick } from '../lib/haptics'
import { queryClient } from '../lib/queryClient'
import type { CalendarEvent } from '../lib/types'
import { BottomSheet } from './BottomSheet'
import { Button, Chip, SectionLabel } from './kit'
import { DURATIONS, QUARTERS, busyAt, busyOnDay, dayTitle, durationLabel, freeSlots, fromMin, toMin } from './pickerMath'
import './pickers.css'

// ── MK Time Picker (DS-CHANGELOG §3): free slots from the day's calendar as 48 pills · a 15-minute
// list (rows 48, Courier 15; busy times --ink-faint + the meeting's chip, still selectable; the
// selected row --block-sage + check) · duration chips when the caller has a duration · opens
// scrolled to the current value or 09:00. `TimePanel` is the content (the date picker's Set time
// stage shows it too); `TimePicker` is the phone sheet features/calendar/TimeField opens. ──

/** A sheet header: title (Source Serif, from BottomSheet) + the mono meta line, as MK draws it. */
export function SheetTitle({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <>
      {title}
      {meta != null && <div className="kf-pk-meta">{meta}</div>}
    </>
  )
}

export function TimePanel({ day, value, onValue, duration, onDuration, events }: {
  /** Cairo day whose calendar gives the slots and busy rows; null = a time with no date (a routine). */
  day: string | null
  /** "HH:mm" — any minute; only a quarter shows as a selected row. */
  value: string | null
  onValue: (hhmm: string) => void
  duration?: number | null
  /** Shows the duration chips. */
  onDuration?: (min: number) => void
  events?: readonly CalendarEvent[]
}) {
  const listRef = useRef<HTMLDivElement>(null)
  // The cached calendar (TanStack, restored from IndexedDB at boot) — no fetch of its own.
  // ponytail: never-loaded cache = no slots/busy rows; add a day query if that ever shows up.
  const busy = useMemo(() => (day ? busyOnDay(events ?? queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? [], day) : []), [day, events])
  const slots = day ? freeSlots(busy, day, new Date(), duration || 30) : []

  // Open with the value (or 09:00) as the third row, as drawn.
  useLayoutEffect(() => {
    const el = listRef.current
    const row = el?.firstElementChild as HTMLElement | null | undefined
    if (el && row) el.scrollTop = Math.max(0, Math.floor(toMin(value || '09:00') / 15) - 2) * row.offsetHeight
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- opening position only

  const pick = (t: string) => {
    tick()
    onValue(t)
  }

  return (
    <div className="kf-pk-tp">
      {slots.length > 0 && (
        <>
          <div className="kf-pk-sl"><SectionLabel>Free on your calendar</SectionLabel></div>
          <div className="kf-pk-slots">
            {slots.map((s) => (
              <button key={s.start} type="button" className="kf-pk-slot" aria-pressed={value === fromMin(s.start)} onClick={() => pick(fromMin(s.start))}>
                {fromMin(s.start)}–{fromMin(s.end)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="kf-pk-sl"><SectionLabel>Every 15 minutes</SectionLabel></div>
      <div ref={listRef} className="kf-pk-times" role="listbox" aria-label="Time">
        {QUARTERS.map((t, i) => {
          const b = busyAt(busy, i * 15)
          const on = t === value
          return (
            <button key={t} type="button" role="option" aria-selected={on} className={`kf-pk-time${b ? ' is-busy' : ''}`} onClick={() => pick(t)}>
              <b>{t}</b>
              {b && b.start >= i * 15 && <Chip tone="bordered">{b.title}</Chip>}
              <span style={{ flex: 1 }} />
              {on && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acc-sage-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </button>
          )
        })}
      </div>
      {onDuration && (
        <>
          <div className="kf-pk-sl"><SectionLabel>Duration</SectionLabel></div>
          <div className="kf-pk-durs">
            {DURATIONS.map((m) => (
              <Chip key={m} tone="duration" icon={false} selected={duration === m} onClick={() => { tick(); onDuration(m) }}>
                {durationLabel(m)}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** The phone time sheet. Done hands back "HH:mm" (09:00 if nothing was picked) and the duration
 * when the caller passed one and it changed. Dismissing it changes nothing. `onClear` adds the
 * footer's ghost "No time", like the date sheet's "No date" (SCREENS-2026-09-28 §Plan ruling 5). */
export function TimePicker({ day, value, duration, onDone, onClose, onClear, events, title }: {
  day?: string | null
  value: string | null
  /** Pass the current duration (null = none) to show the chips. */
  duration?: number | null
  onDone: (hhmm: string, durationMin?: number) => void
  onClose: () => void
  onClear?: () => void
  events?: readonly CalendarEvent[]
  /** The meta line under "Time" — what is being timed ("Search for a good node.js source · today"). */
  title?: string
}) {
  const [time, setTime] = useState(value || '09:00')
  const [dur, setDur] = useState(duration ?? null)
  const hasDuration = duration !== undefined
  return (
    <BottomSheet
      detent="full"
      onClose={onClose}
      title={<SheetTitle title="Time" meta={day ? (title ? `${title} · ${dayTitle(day, cairoDateKey(new Date())).split(' · ')[0]}` : dayTitle(day, cairoDateKey(new Date()))) : title} />}
      footer={(close) => (
        <>
          {onClear && <Button type="button" variant="ghost" onClick={() => { onClear(); close() }}>No time</Button>}
          <Button type="button" onClick={() => { onDone(time, dur != null && dur !== duration ? dur : undefined); close() }}>Done</Button>
        </>
      )}
    >
      {() => <TimePanel day={day ?? null} value={time} onValue={setTime} duration={hasDuration ? dur : undefined} onDuration={hasDuration ? setDur : undefined} events={events} />}
    </BottomSheet>
  )
}
