import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../lib/types'
import { allDayOn, bubbleText, dayBlocks, dragSpan, edgeScrollSpeed, EDGE_MAX_SPEED, eventSpan, movedText, pxToMin, scheduleSlots, slotLabel, spanIso, swipeStep, tapStart, viewTitle, visibleDays, weekPage, weekdayRange, columnLabel } from './phoneGridMath'

// The drawing's day: Sunday 27 Sep 2026, Cairo = UTC+3. Every `now` is an explicit instant and every
// expectation Cairo wall-clock, so these hold under any device zone (UTC, Cairo, LA, Tokyo).
const at = (hhmm: string, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm: string, day = 27) => at(hhmm, day).toISOString()
const ev = (from: string, to: string, day = 27, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${day}-${from}`, title: 'Busy', starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: null, source: 'native', gcal_id: null,
  gcal_etag: null, busy: true, type: 'event', color: null, created_at: '', updated_at: '', ...over,
})

describe('days on screen and the header title', () => {
  it('the week strip pages in sevens from today (rolling week)', () => {
    expect(weekPage('2026-10-01', '2026-09-27')).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weekPage('2026-10-04', '2026-09-27')[0]).toBe('2026-10-04')
    expect(weekPage('2026-09-26', '2026-09-27')[6]).toBe('2026-09-26')
  })
  it('day · 3 days · week', () => {
    expect(visibleDays('day', '2026-09-28', '2026-09-27')).toEqual(['2026-09-28'])
    expect(visibleDays('3day', '2026-09-27', '2026-09-27')).toEqual(['2026-09-27', '2026-09-28', '2026-09-29'])
    expect(visibleDays('week', '2026-09-29', '2026-09-27')).toHaveLength(7)
  })
  it('titles: "Sunday, Sep 27" · "Sep 27 – 29" · "Sep 27 – Oct 3"', () => {
    expect(viewTitle(['2026-09-27'])).toBe('Sunday, Sep 27')
    expect(viewTitle(visibleDays('3day', '2026-09-27', '2026-09-27'))).toBe('Sep 27 – 29')
    expect(viewTitle(weekPage('2026-09-27', '2026-09-27'))).toBe('Sep 27 – Oct 3')
    expect(weekdayRange(visibleDays('3day', '2026-09-27', '2026-09-27'))).toBe('Sun–Tue')
    expect(columnLabel('2026-09-28', false)).toBe('Mon 28')
    expect(columnLabel('2026-09-28', true)).toBe('M 28')
  })
})

describe('blocks: spans, clipping, the 15-minute drag', () => {
  it('an event\'s span is Cairo wall-clock minutes', () => {
    expect(eventSpan(ev('15:00', '15:30'))).toEqual({ day: '2026-09-27', start: 900, end: 930 })
  })
  it('a span round-trips to the same instants; 24:00 is the next day', () => {
    expect(spanIso({ day: '2026-09-27', start: 975, end: 1005 })).toEqual({ starts_at: iso('16:15'), ends_at: iso('16:45') })
    expect(spanIso({ day: '2026-09-27', start: 1380, end: 1440 }).ends_at).toBe(iso('00:00', 28))
  })
  it('all-day events are dates: on their days only (end exclusive)', () => {
    const off = ev('00:00', '00:00', 27, { all_day: true, starts_at: '2026-10-02T00:00:00.000Z', ends_at: '2026-10-03T00:00:00.000Z' })
    expect(allDayOn([off], ['2026-10-02'])).toEqual([off])
    expect(allDayOn([off], ['2026-10-01', '2026-10-03'])).toEqual([])
  })
  it('a day\'s blocks are clipped to it; all-day and deleted are not drawn', () => {
    const late = ev('23:00', '01:00', 27, { ends_at: iso('01:00', 28) })
    expect(dayBlocks([late], '2026-09-27').map((b) => [b.start, b.end])).toEqual([[1380, 1440]])
    expect(dayBlocks([late], '2026-09-28').map((b) => [b.start, b.end])).toEqual([[0, 60]])
    expect(dayBlocks([ev('09:00', '10:00', 27, { all_day: true }), ev('10:00', '11:00', 27, { deleted_at: iso('08:00') })], '2026-09-27')).toEqual([])
  })
  const tyre = { day: '2026-09-27', start: 900, end: 930 }
  it('a move keeps the length and snaps to 15 minutes (16px)', () => {
    expect(dragSpan(tyre, 'move', pxToMin(80))).toEqual({ day: '2026-09-27', start: 975, end: 1005 }) // +75 → 16:15
    expect(dragSpan(tyre, 'move', pxToMin(7))).toEqual(tyre) // under half a quarter stays put
    expect(dragSpan(tyre, 'move', pxToMin(9)).start).toBe(915)
  })
  it('a move stays inside the day and can change column (3-day view)', () => {
    expect(dragSpan(tyre, 'move', -2000).start).toBe(0)
    expect(dragSpan(tyre, 'move', 2000)).toMatchObject({ start: 1410, end: 1440 })
    expect(dragSpan(tyre, 'move', 0, 1).day).toBe('2026-09-28')
  })
  it('a resize moves only its edge, never under one snap', () => {
    expect(dragSpan(tyre, 'bottom', 45)).toEqual({ ...tyre, end: 975 }) // 7f: 15:00–16:15
    expect(dragSpan(tyre, 'bottom', -60)).toEqual({ ...tyre, end: 915 })
    expect(dragSpan(tyre, 'top', -30)).toEqual({ ...tyre, start: 870 })
    expect(dragSpan(tyre, 'top', 60)).toEqual({ ...tyre, start: 915 })
  })
  it('the gutter bubble and the drop toast', () => {
    expect(bubbleText({ ...tyre, start: 975, end: 1005 }, 'move')).toBe('16:15')
    expect(bubbleText({ ...tyre, end: 975 }, 'bottom')).toBe('16:15 · 1h15')
    expect(movedText(tyre, { ...tyre, start: 975, end: 1005 }, '2026-09-27')).toBe('Moved to 16:15')
    expect(movedText(tyre, { day: '2026-09-28', start: 600, end: 630 }, '2026-09-27')).toBe('Moved to Mon 28 10:00')
  })
  it('a tap lands on its quarter, with room for 30 minutes', () => {
    expect(tapStart(963)).toBe(960)
    expect(tapStart(1435)).toBe(1410)
  })
})

describe('day swipe: 40% or a fling commits', () => {
  it('past 40% of the column', () => {
    expect(swipeStep(-131, 0, 326)).toBe(1)
    expect(swipeStep(131, 0, 326)).toBe(-1)
    expect(swipeStep(-120, 0, 326)).toBe(0)
  })
  it('a fling the same way commits short of the line; against it, springs back', () => {
    expect(swipeStep(-40, -0.8, 326)).toBe(1)
    expect(swipeStep(40, 0.8, 326)).toBe(-1)
    expect(swipeStep(40, -0.8, 326)).toBe(0)
  })
})

describe('auto-scroll while dragging a lifted block', () => {
  // The grid's scroll area: 200 → 776 on screen.
  it('nothing outside the 48px edge zones', () => {
    expect(edgeScrollSpeed(400, 200, 776)).toBe(0)
    expect(edgeScrollSpeed(248, 200, 776)).toBe(0)
    expect(edgeScrollSpeed(728, 200, 776)).toBe(0)
  })
  it('deeper into a zone is faster: up near the top, down near the bottom', () => {
    expect(edgeScrollSpeed(752, 200, 776)).toBeCloseTo(EDGE_MAX_SPEED / 2)
    expect(edgeScrollSpeed(764, 200, 776)).toBeCloseTo((EDGE_MAX_SPEED * 3) / 4)
    expect(edgeScrollSpeed(224, 200, 776)).toBeCloseTo(-EDGE_MAX_SPEED / 2)
  })
  it('capped: at the edge or past it (a finger on the tab bar) is full speed', () => {
    expect(edgeScrollSpeed(776, 200, 776)).toBe(EDGE_MAX_SPEED)
    expect(edgeScrollSpeed(840, 200, 776)).toBe(EDGE_MAX_SPEED)
    expect(edgeScrollSpeed(120, 200, 776)).toBe(-EDGE_MAX_SPEED)
  })
})

describe('Schedule sheet: the next 3 free slots', () => {
  const day = [ev('09:00', '10:30'), ev('13:00', '14:00'), ev('15:00', '15:30'), ev('18:00', '19:00')]
  it('7g: today, stepping through each gap by the duration', () => {
    const s = scheduleSlots(day, at('13:40'), 30)
    expect(s.today).toBe(true)
    expect(s.slots.map((x) => slotLabel(x, 30, '2026-09-27'))).toEqual(['14:00–14:30', '14:30–15:00', '15:30–16:00'])
  })
  it('7g2: too long for today → the first gap on each next day', () => {
    const busy = [...day, ev('08:00', '11:00', 29), ev('08:00', '13:00', 30)]
    const s = scheduleSlots(busy, at('13:40'), 210)
    expect(s.today).toBe(false)
    expect(s.slots.map((x) => slotLabel(x, 210, '2026-09-27'))).toEqual(['Tomorrow 08:00', 'Tue 29 11:00', 'Wed 30 13:00'])
  })
})
