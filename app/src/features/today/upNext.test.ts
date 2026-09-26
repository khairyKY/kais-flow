import { describe, expect, it } from 'vitest'
import { isInProgress, upNextEvents, upNextLabel } from './upNext'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-26 (EEST).
const at = (cairoHHMM: string) => {
  const [h, m] = cairoHHMM.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, 26, h - 3, m))
}
const iso = (cairoHHMM: string) => at(cairoHHMM).toISOString()
const tenToEleven = [iso('10:00'), iso('11:00')] as const

describe('upNextLabel', () => {
  it('the audit case: at 08:38 a 10:00 event reads its start time, not "Now"', () => {
    expect(upNextLabel(...tenToEleven, at('08:38'))).toEqual({ text: '10:00 AM', tone: 'time' })
  })
  it('reads "Now" from the minute it starts until just before it ends', () => {
    expect(upNextLabel(...tenToEleven, at('10:00'))).toEqual({ text: 'Now', tone: 'now' })
    expect(upNextLabel(...tenToEleven, at('10:59'))).toEqual({ text: 'Now', tone: 'now' })
  })
  it('an event that has ended reads its start time again', () => {
    expect(upNextLabel(...tenToEleven, at('11:00'))).toEqual({ text: '10:00 AM', tone: 'time' })
    expect(upNextLabel(iso('07:00'), iso('07:30'), at('08:38'))).toEqual({ text: '7:00 AM', tone: 'time' })
  })
  it('two overlapping events are both "Now" while both run', () => {
    const now = at('10:15')
    expect(upNextLabel(iso('10:00'), iso('11:00'), now).tone).toBe('now')
    expect(upNextLabel(iso('10:10'), iso('10:40'), now).tone).toBe('now')
  })
  it('prints Cairo time whatever the device zone', () => {
    expect(upNextLabel(iso('13:00'), iso('14:00'), at('08:00')).text).toBe('1:00 PM')
  })
})

describe('isInProgress', () => {
  it('is start-inclusive and end-exclusive', () => {
    expect(isInProgress(...tenToEleven, at('09:59'))).toBe(false)
    expect(isInProgress(...tenToEleven, at('10:00'))).toBe(true)
    expect(isInProgress(...tenToEleven, at('11:00'))).toBe(false)
  })
})

describe('upNextEvents — running and upcoming only (Polish F2a)', () => {
  const DAY = 86_400_000
  const ev = (id: string, from: string, to: string, all_day = false) => ({ id, starts_at: iso(from), ends_at: iso(to), all_day })
  const shifted = (id: string, from: string, to: string, days: number) => ({
    id,
    starts_at: new Date(at(from).getTime() + days * DAY).toISOString(),
    ends_at: new Date(at(to).getTime() + (to < from ? days + 1 : days) * DAY).toISOString(),
    all_day: false,
  })
  const walk = ev('walk', '07:00', '07:30')
  const standup = ev('standup', '09:00', '10:00')
  const deep = ev('deep', '11:30', '13:00')
  const dinner = ev('dinner', '19:00', '20:30')
  const ids = (list: { id: string }[]) => list.map((e) => e.id)

  it('drops an event that has ended, keeps the running one and the rest of the day', () => {
    expect(ids(upNextEvents([walk, standup, deep, dinner], at('09:45')))).toEqual(['standup', 'deep', 'dinner'])
  })
  it('an event leaves the minute it ends (end-exclusive)', () => {
    expect(ids(upNextEvents([standup, deep], at('09:59')))).toEqual(['standup', 'deep'])
    expect(ids(upNextEvents([standup, deep], at('10:00')))).toEqual(['deep'])
  })
  it('an event that has not started yet is listed', () => {
    expect(ids(upNextEvents([deep], at('08:00')))).toEqual(['deep'])
  })
  it('after the last event ends, nothing is left', () => {
    expect(upNextEvents([walk, standup, deep, dinner], at('21:00'))).toEqual([])
  })
  it("tomorrow's events and all-day events are not \"next\" today", () => {
    const tomorrow = shifted('tmrw', '10:00', '11:00', 1)
    const allDay = ev('holiday', '00:00', '23:59', true)
    expect(ids(upNextEvents([tomorrow, allDay, deep], at('08:00')))).toEqual(['deep'])
  })
  it('an event that began before today (Cairo) and is still running shows, as "Now"', () => {
    const overnight = shifted('night', '23:00', '01:00', -1)
    const list = upNextEvents([overnight, deep], at('00:30'))
    expect(ids(list)).toEqual(['night', 'deep'])
    expect(upNextLabel(list[0].starts_at, list[0].ends_at, at('00:30')).text).toBe('Now')
  })
  it('sorts by start time, whatever order the events arrive in', () => {
    expect(ids(upNextEvents([dinner, deep, standup], at('08:00')))).toEqual(['standup', 'deep', 'dinner'])
  })
  it('the Cairo day decides "today", not the UTC or device day', () => {
    // 00:20 Cairo is 21:20 UTC the day before — tonight's 23:30 Cairo is still today.
    expect(ids(upNextEvents([ev('late', '23:30', '23:50')], at('00:20')))).toEqual(['late'])
    // 22:00 Cairo is 19:00 UTC — 01:00 Cairo tomorrow is the same UTC day, but not today.
    expect(upNextEvents([shifted('early', '01:00', '02:00', 1)], at('22:00'))).toEqual([])
  })
})
