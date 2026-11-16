import { describe, expect, it } from 'vitest'
import { reviewClosed, reviewWeekKey, reviewWeekOn, weekStartDay, weeklyReviewDue, type ReviewRow } from '../../../../supabase/functions/notify/review.ts'
import { reviewNotice, deliver } from '../../../../supabase/functions/notify/copy.ts'
import { weekStartDay as appWeekStartDay } from '../rituals/reviewWeek'
import { localPlan, type PlanInput } from './plan'

const CAIRO = 'Africa/Cairo'
// Cairo is UTC+3 from 24 Apr to 29 Oct 2026, UTC+2 around it. Nov 2026: Fri 20, Sat 21.
const at = (iso: string) => new Date(iso)
const FRIDAY = { review_day: 5, review_time: '17:30:00', weekend_days: [5, 6] }
const closed = (week: string, created_at = '2026-11-20T15:00:00Z', event_type = 'review.week_closed'): ReviewRow => ({ event_type, payload: { week }, created_at })

describe('weeklyReviewDue — which cron tick sends the reminder', () => {
  it('Friday 17:30 on the user’s clock: that tick, once', () => {
    expect(weeklyReviewDue(FRIDAY, at('2026-11-20T15:30:00Z'), CAIRO)).toBe(true) // 17:30 EET
    expect(weeklyReviewDue(FRIDAY, at('2026-11-20T15:44:59Z'), CAIRO)).toBe(true)
    expect(weeklyReviewDue(FRIDAY, at('2026-11-20T15:45:00Z'), CAIRO)).toBe(false) // the next tick's
    expect(weeklyReviewDue(FRIDAY, at('2026-11-20T15:29:00Z'), CAIRO)).toBe(false)
    expect(weeklyReviewDue(FRIDAY, at('2026-11-21T15:30:00Z'), CAIRO)).toBe(false) // Saturday
  })

  it('no time set: 18:00', () => {
    const s = { review_day: 5, weekend_days: [5, 6] }
    expect(weeklyReviewDue(s, at('2026-11-20T16:00:00Z'), CAIRO)).toBe(true)
    expect(weeklyReviewDue(s, at('2026-11-20T15:30:00Z'), CAIRO)).toBe(false)
  })

  it('no day set: the weekend’s first day (Sat + Sun → Saturday; no weekend → never)', () => {
    expect(weeklyReviewDue({}, at('2026-11-21T16:00:00Z'), CAIRO)).toBe(true) // Saturday 18:00, the default weekend
    expect(weeklyReviewDue({}, at('2026-11-22T16:00:00Z'), CAIRO)).toBe(false)
    expect(weeklyReviewDue({ weekend_days: [5, 6] }, at('2026-11-20T16:00:00Z'), CAIRO)).toBe(true)
    expect(weeklyReviewDue({ weekend_days: [] }, at('2026-11-20T16:00:00Z'), CAIRO)).toBe(false)
  })

  it('the switch', () => {
    expect(weeklyReviewDue({ ...FRIDAY, review_reminder_on: false }, at('2026-11-20T15:30:00Z'), CAIRO)).toBe(false)
    expect(weeklyReviewDue({ ...FRIDAY, review_reminder_on: true }, at('2026-11-20T15:30:00Z'), CAIRO)).toBe(true)
  })

  it('the day turns over at 04:00: a 01:00 review belongs to the evening before', () => {
    const s = { review_day: 5, review_time: '01:00', weekend_days: [5, 6] }
    expect(weeklyReviewDue(s, at('2026-11-20T23:00:00Z'), CAIRO)).toBe(true) // Sat 01:00 Cairo = still Friday's loop day
    expect(weeklyReviewDue(s, at('2026-11-19T23:00:00Z'), CAIRO)).toBe(false) // Fri 01:00 = Thursday's
  })

  it('across Cairo’s DST changes the wall time holds', () => {
    const s = { review_day: 5, review_time: '18:00', weekend_days: [5, 6] }
    expect(weeklyReviewDue(s, at('2026-04-24T15:00:00Z'), CAIRO)).toBe(true) // the Friday summer time starts: 18:00 EEST
    expect(weeklyReviewDue(s, at('2026-04-17T16:00:00Z'), CAIRO)).toBe(true) // the Friday before: 18:00 EET
    expect(weeklyReviewDue(s, at('2026-10-30T16:00:00Z'), CAIRO)).toBe(true) // the Friday after it ends
  })

  it('reads the user’s own zone', () => {
    const s = { review_day: 5, review_time: '17:30' }
    expect(weeklyReviewDue(s, at('2026-11-20T22:30:00Z'), 'America/New_York')).toBe(true) // 17:30 EST
    expect(weeklyReviewDue(s, at('2026-11-20T15:30:00Z'), 'America/New_York')).toBe(false)
  })
})

describe('the review week and whether it is closed', () => {
  it('the week starts the day after the weekend, as the app’s does', () => {
    for (const w of [[5, 6], [0, 6], [0], [], [4, 5], [1, 3]]) expect(weekStartDay(w)).toBe(appWeekStartDay(w))
    expect(reviewWeekKey('2026-11-20', [5, 6])).toBe('2026-11-15') // Fri, weekend Fri + Sat → Sunday
    expect(reviewWeekKey('2026-11-21', [0, 6])).toBe('2026-11-16') // Sat, weekend Sat + Sun → Monday
    expect(reviewWeekOn(FRIDAY, at('2026-11-20T15:30:00Z'), CAIRO)).toBe('2026-11-15')
    expect(reviewWeekOn(FRIDAY, at('2026-11-21T15:30:00Z'), CAIRO)).toBeNull()
  })

  it('a close for this week silences it; a reopen brings it back; another week’s close does not', () => {
    const w = '2026-11-15'
    expect(reviewClosed([], w, FRIDAY, CAIRO)).toBe(false)
    expect(reviewClosed([closed(w)], w, FRIDAY, CAIRO)).toBe(true)
    expect(reviewClosed([closed(w), closed(w, '2026-11-20T15:05:00Z', 'review.week_reopened')], w, FRIDAY, CAIRO)).toBe(false)
    expect(reviewClosed([closed('2026-11-08')], w, FRIDAY, CAIRO)).toBe(false)
  })

  it('a row without a week counts for the week of the loop day it was written on', () => {
    const row = { event_type: 'review.week_closed', payload: null, created_at: '2026-11-20T10:00:00Z' }
    expect(reviewClosed([row], '2026-11-15', FRIDAY, CAIRO)).toBe(true)
    // 00:30 Saturday is still Friday's loop day
    expect(reviewClosed([{ ...row, created_at: '2026-11-20T22:30:00Z' }], '2026-11-15', FRIDAY, CAIRO)).toBe(true)
  })
})

describe('the notice and the device plan', () => {
  it('words, tag per week, Start review → /weekly-review; the switch, pause and quiet hours', () => {
    const n = reviewNotice('2026-11-15')
    expect(n).toMatchObject({ kind: 'weekly_review', title: 'Weekly review', body: 'Ten quiet minutes to close the week.', tag: 'weekly-review-2026-11-15', url: '/weekly-review' })
    expect(n.actions).toEqual([{ action: 'open', title: 'Start review' }])
    const noon = at('2026-11-20T10:00:00Z')
    expect(deliver(n, { review_reminder_on: false }, noon, CAIRO)).toBeNull()
    expect(deliver(n, null, noon, CAIRO)).toEqual(n)
    expect(deliver(n, { notify_paused_until: '2026-11-21T00:00:00Z' }, noon, CAIRO)).toBeNull()
    expect(deliver(n, null, at('2026-11-20T21:00:00Z'), CAIRO)?.silent).toBe(true) // 23:00 Cairo: quiet hours
  })

  const plan = (over: Partial<PlanInput> = {}) =>
    localPlan({ tasks: [], prefs: FRIDAY, from: at('2026-11-20T00:00:00Z'), to: at('2026-11-20T23:59:00Z'), now: at('2026-11-20T00:00:00Z'), zone: CAIRO, ...over }).filter((p) => p.notice.kind === 'weekly_review')

  it('the device plan fires it once, at the review time, with the server’s tag', () => {
    const [p, ...rest] = plan()
    expect(rest).toEqual([])
    expect([p.at.toISOString(), p.key, p.notice.tag]).toEqual(['2026-11-20T15:30:00.000Z', 'weekly-review-2026-11-15', 'weekly-review-2026-11-15'])
    expect(plan({ prefs: { ...FRIDAY, review_time: null } })[0].at.toISOString()).toBe('2026-11-20T16:00:00.000Z') // 18:00
  })

  it('not when the week is closed, the switch is off, or it is another day', () => {
    expect(plan({ reviewRows: [closed('2026-11-15')] })).toEqual([])
    expect(plan({ prefs: { ...FRIDAY, review_reminder_on: false } })).toEqual([])
    expect(plan({ from: at('2026-11-21T00:00:00Z'), to: at('2026-11-21T23:59:00Z') })).toEqual([])
  })
})
