import { useState } from 'react'
import { TimeField } from '../features/calendar/TimeField'
import { cairoDateKey, scheduleTomorrow } from '../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../lib/types'
import { DateField, DatePicker } from './DatePicker'
import { Button, SectionLabel } from './kit'
import { addDays, atDay } from './pickerMath'
import { TimePicker } from './TimePicker'

// Pickers (Wave M) on /design-system (dev only): the real DatePicker / TimePicker / DateField /
// TimeField over MK's sample day — every value stays in this component's state.

// Built on first render, not at module scope: top-level calls would survive tree-shaking into dist/.
function sampleDay() {
  const today = cairoDateKey(new Date())
  const tomorrow = addDays(today, 1)
  const ev = (title: string, from: string, to: string): CalendarEvent => ({
    id: `pk-${title}`, title, starts_at: atDay(tomorrow, from), ends_at: atDay(tomorrow, to), all_day: false, task_id: null, source: 'native',
    gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, created_at: '', updated_at: '',
  })
  return {
    tomorrow,
    // MK Time Picker's day: free 09:00–09:30, 11:00–12:00, 14:30–16:00, a Standup at 09:30.
    events: [ev('Gym', '08:00', '09:00'), ev('Standup', '09:30', '09:45'), ev('Deep work', '09:45', '11:00'), ev('Lunch with Omar', '12:00', '14:30'), ev('Quarterly review', '16:00', '20:00')],
    tasks: [3, 8, 14, 21, 29].map((d) => ({ id: `pk-t${d}`, due_at: atDay(`${today.slice(0, 7)}-${String(d).padStart(2, '0')}`), status: 'todo' }) as Task),
  }
}

const meta = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' } as const

export function KitPickersDemo() {
  const [{ tomorrow, events: EVENTS, tasks: TASKS }] = useState(sampleDay)
  const [open, setOpen] = useState<null | 'date' | 'time'>(null)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const [due, setDue] = useState<string | null>(scheduleTomorrow())
  const [dur, setDur] = useState<number | null>(30)
  const [someday, setSomeday] = useState(false)
  const [day, setDay] = useState(tomorrow)
  const [time, setTime] = useState('09:00')

  const shown = someday ? 'Someday' : due ? new Date(due).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No date'
  return (
    <section>
      <SectionLabel>Pickers — date &amp; time</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
        <Button variant="secondary" data-demo="pick-date" onClick={(e) => { setAt({ x: e.clientX, y: e.clientY }); setOpen('date') }}>Pick date… (due)</Button>
        <Button variant="secondary" data-demo="time-sheet" onClick={() => setOpen('time')}>Time sheet</Button>
        <span style={meta} data-demo="due">due: {shown} · {dur ?? '—'}m</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
        <DateField value={day} onChange={setDay} title="Date" style={{ minWidth: 150, height: 40, padding: '0 12px', font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 8 }} />
        <TimeField value={time} onChange={setTime} day={day} style={{ width: 110, height: 40, padding: '0 12px', font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 8 }} />
        <span style={meta} data-demo="field">field: {day || '—'} {time}</span>
      </div>
      {open === 'date' && (
        <DatePicker
          title="Due date"
          meta="Call the bank about the mortgage"
          value={someday ? null : due}
          quick
          withTime
          duration={dur}
          position={at}
          events={EVENTS}
          tasks={TASKS}
          onPick={(iso, min) => { setDue(iso); setSomeday(false); if (min !== undefined) setDur(min) }}
          onSomeday={() => setSomeday(true)}
          onClear={() => { setDue(null); setSomeday(false) }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'time' && (
        <TimePicker day={tomorrow} value="09:00" duration={dur} events={EVENTS} onDone={(t, min) => { setDue(atDay(tomorrow, t)); if (min !== undefined) setDur(min) }} onClose={() => setOpen(null)} />
      )}
    </section>
  )
}
