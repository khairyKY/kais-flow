import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAppZone } from '../../lib/appZone'
import { countdown, pickNowNext, progress } from './nowNext'

// Cairo, Wed 21 Oct 2026 (UTC+3). Each item: [id, from, to] on that day's clock.
const at = (hhmm: string, day = 21) => new Date(`2026-10-${day}T${hhmm}:00+03:00`)
const ev = (id: string, from: string, to: string, o: { day?: number; toDay?: number; all_day?: boolean } = {}) => ({
  id, title: id, starts_at: at(from, o.day).toISOString(), ends_at: at(to, o.toDay ?? o.day).toISOString(), all_day: !!o.all_day,
})
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

beforeEach(() => setAppZone('Africa/Cairo'))
afterEach(() => setAppZone('Africa/Cairo'))

describe('pickNowNext (the calendar Now card, option A)', () => {
  const DAY = [ev('deep', '15:00', '16:30'), ev('maghrib', '18:15', '18:40'), ev('call', '19:10', '19:30'), ev('isha', '19:58', '20:20')]

  it('nothing left today', () => {
    expect(pickNowNext(DAY, at('21:00'))).toEqual({ state: 'none' })
  })
  it('the next thing more than an hour away is a clock time ("far")', () => {
    const r = pickNowNext(DAY, at('16:40'))
    expect(r.state === 'far' && r.next.id).toBe('maghrib')
  })
  it('up next within the hour, the rest of the hour behind it', () => {
    const r = pickNowNext(DAY, at('18:03'))
    expect(r.state).toBe('soon')
    if (r.state === 'soon') {
      expect(r.main.id).toBe('maghrib')
      expect(ids(r.next)).toEqual([]) // the call at 19:10 is 67 minutes out
    }
    const r2 = pickNowNext(DAY, at('18:12'))
    expect(r2.state === 'soon' && ids(r2.next)).toEqual(['call'])
  })
  it('ongoing, with what starts within the hour as Next', () => {
    const r = pickNowNext(DAY, at('18:25'))
    expect(r.state).toBe('on')
    if (r.state === 'on') {
      expect(r.main.id).toBe('maghrib')
      expect(ids(r.next)).toEqual(['call']) // Isha at 19:58 is 93 minutes out
      expect(countdown(r.main, at('18:25'))).toBe('15m left')
      expect(countdown(r.next[0], at('18:25'))).toBe('in 45m')
    }
  })
  it('two running: the one ending soonest leads, even when it started later', () => {
    const r = pickNowNext([ev('work', '11:00', '12:30'), ev('standup', '11:15', '11:30')], at('11:20'))
    expect(r.state === 'on' && [r.main.id, ...ids(r.others)]).toEqual(['standup', 'work'])
  })
  it('a tie on the end: the later start leads, then the title', () => {
    const r = pickNowNext([ev('b', '10:00', '11:00'), ev('a', '10:30', '11:00'), ev('c', '10:30', '11:00')], at('10:45'))
    expect(r.state === 'on' && [r.main.id, ...ids(r.others)]).toEqual(['a', 'c', 'b'])
  })
  it("skips done tasks' blocks, all-day items and zero-length ones; an event drops off as it ends", () => {
    const r = pickNowNext([ev('done', '10:00', '11:00'), ev('allday', '00:00', '00:00', { toDay: 22, all_day: true }), ev('zero', '10:30', '10:30'), ev('over', '09:00', '10:20')], at('10:20'), (e) => e.id === 'done')
    expect(r).toEqual({ state: 'none' })
  })
  it('a block running over midnight is still ongoing the next morning; tomorrow is never "next"', () => {
    const r = pickNowNext([ev('night', '23:00', '01:00', { day: 21, toDay: 22 }), ev('tomorrow', '00:30', '01:00', { day: 22 })], at('23:50'))
    expect(r.state === 'on' && r.main.id).toBe('night')
    expect(r.state === 'on' && ids(r.next)).toEqual([])
    expect(pickNowNext([ev('night', '23:00', '01:00', { day: 21, toDay: 22 })], at('00:20', 22)).state).toBe('on')
  })
})

describe('countdown · progress', () => {
  const e = ev('x', '18:15', '18:40')
  it('rounds whole minutes up, never 0, hours as "1h 5m"', () => {
    expect(countdown(e, new Date(at('18:14').getTime() + 30_000))).toBe('in 1m')
    expect(countdown(e, new Date(at('18:39').getTime() + 59_000))).toBe('1m left')
    expect(countdown(ev('y', '09:00', '10:10'), at('09:05'))).toBe('1h 5m left')
  })
  it('is 0–1 through the block', () => {
    expect(progress(e, at('18:10'))).toBe(0)
    expect(progress(e, at('18:25'))).toBeCloseTo(0.4)
    expect(progress(e, at('19:00'))).toBe(1)
  })
})
