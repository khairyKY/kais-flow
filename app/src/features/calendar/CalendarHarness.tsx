import { useRef, useState } from 'react'
import { CalendarGrid, type CalendarGridHandle } from './CalendarGrid'
import { localDateKey } from '../routines/streaks'

// Unauthenticated harness for the real CalendarGrid, so grid geometry can be measured without
// a signed-in session. Kai 2026-07-21 reported a block landing an hour off where he clicked and
// "Today" not moving the view — neither is diagnosable from a screenshot, and guessing at this
// calendar has already cost three wrong attempts.
//
// ponytail: dev-only surface, deliberately dumb. Not linked from anywhere; /calendar-harness.

function at(dayOffset: number, h: number, m = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function CalendarHarness() {
  const ref = useRef<CalendarGridHandle>(null)
  const [log, setLog] = useState<string[]>([])
  const today = localDateKey(new Date())

  // Known-good fixtures: exact wall-clock times we can assert the rendered geometry against.
  const events = [
    { id: 'e10', title: 'TEN to ELEVEN THIRTY', start: at(0, 10), end: at(0, 11, 30), type: 'event' as const },
    { id: 'e14', title: 'TWO to THREE', start: at(0, 14), end: at(0, 15), type: 'event' as const, color: '#7A946E' },
    { id: 'e09', title: 'SHORT nine to nine fifteen', start: at(0, 9), end: at(0, 9, 15), type: 'event' as const },
  ]

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, fontFamily: 'monospace', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span id="harness-today">today={today}</span>
        <button id="harness-today-btn" onClick={() => ref.current?.today()}>today()</button>
        <button id="harness-next-btn" onClick={() => ref.current?.next()}>next()</button>
        <span id="harness-log">{log.join(' | ')}</span>
      </div>
      <div className="cal-motion-on" style={{ flex: 1, minHeight: 0 }}>
        <CalendarGrid
          ref={ref}
          events={events}
          initialView="timeGridWeek"
          hideToolbar
          onCreate={(i) => setLog((l) => [...l, `create:${i.start}`])}
          onMove={(id, s) => setLog((l) => [...l, `move:${id}:${s}`])}
          onResize={(id, s) => setLog((l) => [...l, `resize:${id}:${s}`])}
          onEventClick={(id) => setLog((l) => [...l, `click:${id}`])}
          onExternalDrop={() => {}}
        />
      </div>
    </div>
  )
}
