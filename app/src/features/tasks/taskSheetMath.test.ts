import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../lib/types'
import { blockLine, createdLine, doneLine, dueChip, nextDates, remindChip, repeatLabel, saveLine, SAVED_MS, suggestHint, suggestTimes } from './taskSheetMath'

// The drawing's day: Sunday 27 Sep 2026, Cairo = UTC+3. Every `now` is an explicit instant and every
// expectation Cairo wall-clock, so these hold under any device zone (UTC, Cairo, LA, Tokyo).
const at = (hhmm: string, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm: string, day = 27) => at(hhmm, day).toISOString()
const ev = (from: string, to: string, day = 27): CalendarEvent => ({
  id: from, title: 'Busy', starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: null, source: 'native', gcal_id: null,
  gcal_etag: null, busy: true, type: 'event', color: null, created_at: '', updated_at: '',
})
const row = (over: Partial<{ created_at: string; updated_at: string; completed_at: string | null }> = {}) => ({
  created_at: iso('09:00', 21), updated_at: iso('09:00', 21), completed_at: null, ...over,
})

describe('saveLine — the footer: Saved flicker, then Edited HH:MM; offline Pending sync', () => {
  const now = at('15:02')
  it('an untouched task shows no line', () => {
    expect(saveLine(row(), null, now, false)).toBeNull()
  })
  it('"Saved" for 1.5s after an edit, then the edit time', () => {
    const t = now.getTime()
    expect(saveLine(row(), t, now, false)).toEqual({ tone: 'saved', text: 'Saved' })
    expect(saveLine(row(), t, new Date(t + SAVED_MS - 1), false)?.text).toBe('Saved')
    expect(saveLine(row(), t, new Date(t + SAVED_MS), false)).toEqual({ tone: 'quiet', text: 'Edited 15:02' })
  })
  it('offline with the row still queued: Pending sync, over everything', () => {
    expect(saveLine(row(), now.getTime(), now, true)).toEqual({ tone: 'pending', text: 'Pending sync' })
  })
  it('the row\'s own updated_at counts when later than its creation (an edit elsewhere / earlier)', () => {
    expect(saveLine(row({ updated_at: iso('11:40') }), null, now, false)?.text).toBe('Edited 11:40')
    expect(saveLine(row({ updated_at: iso('11:40', 22) }), null, now, false)?.text).toBe('Edited 22 Sep')
  })
  it('a done task reads its done time', () => {
    expect(saveLine(row({ completed_at: iso('15:24', 26) }), null, now, false)?.text).toBe('Done 26 Sep')
    expect(saveLine(row({ completed_at: iso('14:24') }), null, now, false)?.text).toBe('Done 14:24')
  })
  it('created + done lines', () => {
    expect(createdLine(iso('09:00', 21))).toBe('Created 21 Sep')
    expect(createdLine('2026-09-20T22:30:00Z')).toBe('Created 21 Sep') // 01:30 Cairo on the 21st
    expect(doneLine(iso('15:24'), now)).toBe('Done · Sun 27 · 15:24')
  })
})

describe('chips', () => {
  const now = at('15:02')
  it('date: Today / Tomorrow / the day, with the Cairo time', () => {
    expect(dueChip(iso('15:00'), now)).toBe('Today · 15:00')
    expect(dueChip(iso('09:00', 28), now)).toBe('Tomorrow · 09:00')
    expect(dueChip(iso('09:00', 30), now)).toBe('Wed 30 Sep · 09:00')
    expect(dueChip('2026-09-27T22:30:00Z', now)).toBe('Tomorrow · 01:30') // past UTC midnight, still Cairo's 28th
  })
  it('remind: minutes before the due time', () => {
    expect(remindChip(iso('14:50'), iso('15:00'))).toBe('10m before')
    expect(remindChip(iso('14:00'), iso('15:00'))).toBe('1h before')
    expect(remindChip(iso('15:00'), iso('15:00'))).toBe('At due time')
    expect(remindChip(iso('08:30'), null)).toBe('08:30')
  })
  it('repeat: the menu\'s names, rrule\'s words for anything else', () => {
    expect(repeatLabel('FREQ=DAILY')).toBe('Daily')
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Every weekday')
    expect(repeatLabel('nonsense')).toBe('Repeats')
  })
})

describe('nextDates — what "Done for today" spawns, and the one after', () => {
  it('every weekday from Fri 25 Sep 15:00 skips the weekend', () => {
    expect(nextDates('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', iso('15:00', 25))).toBe('Next · Mon 28 Sep 15:00 · then Tue 29')
  })
  it('crossing a month shows the month on the second date', () => {
    expect(nextDates('FREQ=DAILY', iso('09:00', 29))).toBe('Next · Wed 30 Sep 09:00 · then Thu 1 Oct')
  })
  it('a finished series has nothing next', () => {
    expect(nextDates('FREQ=DAILY;COUNT=1', iso('09:00'))).toBeNull()
  })
})

describe('suggestTimes — Suggest a time (4m)', () => {
  const now = at('12:50')
  it('three starts that fit the duration and end by the due time, stepping through a long gap', () => {
    // free 13:00–13:30 and 14:00–15:00 before a 15:00 due
    const s = suggestTimes([ev('09:00', '10:30'), ev('13:30', '14:00'), ev('15:00', '15:30')], iso('15:00'), now, 30)
    expect(s).toEqual({ day: '2026-09-27', starts: [13 * 60, 14 * 60, 14 * 60 + 30], before: 15 * 60 })
  })
  it('nothing fits before the due time → no starts (the line says so)', () => {
    expect(suggestTimes([ev('13:00', '15:00')], iso('15:00'), now, 30).starts).toEqual([])
  })
  it('a past due time no longer binds; an odd duration steps on the quarter grid', () => {
    const s = suggestTimes([], iso('09:00'), now, 20)
    expect(s.before).toBeNull()
    expect(s.starts).toEqual([13 * 60, 13 * 60 + 30, 14 * 60])
  })
  it('a due day still ahead is the day to look at', () => {
    expect(suggestTimes([], iso('17:00', 29), now, 60)).toEqual({ day: '2026-09-29', starts: [8 * 60, 9 * 60, 10 * 60], before: 17 * 60 })
  })
  it('late in the evening, with no due time, it looks at tomorrow', () => {
    expect(suggestTimes([], null, at('19:50'), 30)).toEqual({ day: '2026-09-28', starts: [8 * 60, 8 * 60 + 30, 9 * 60], before: null })
  })
  it('the line under the slots', () => {
    expect(suggestHint({ day: '2026-09-27', starts: [780], before: 900 }, now)).toBe('Free before 15:00 · tap one to place it')
    expect(suggestHint({ day: '2026-09-28', starts: [480], before: null }, now)).toBe('Free tomorrow · tap one to place it')
    expect(suggestHint({ day: '2026-09-27', starts: [], before: 900 }, now)).toBe('No free time before 15:00')
    expect(suggestHint({ day: '2026-09-27', starts: [], before: null }, now)).toBe('No free time today or tomorrow')
  })
})

describe('blockLine — the block card', () => {
  it('day · start–end · length', () => {
    expect(blockLine({ starts_at: iso('15:00'), ends_at: iso('15:30') }, at('09:00'))).toBe('Sun 27 · 15:00–15:30 · 30m')
    expect(blockLine({ starts_at: iso('09:00', 30), ends_at: iso('10:30', 30) }, at('09:00'))).toBe('Wed 30 · 09:00–10:30 · 1h30')
  })
})
