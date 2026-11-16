// The weekly review's reminder (0095): who gets "Ten quiet minutes to close the week" on a cron tick.
// Pure — no Deno APIs — so the app's vitest runs it (notifications/review.test.ts) and the Windows/Android
// planner (app notifications/plan.ts) asks the same questions. The day and the week are the app's own
// (todayLayout reviewDue, rituals/reviewWeek): the loop day turns over at 04:00, the week starts the day
// after the weekend, and a close (activity `review.week_closed`) silences that week's reminder.
import { addDays, loopDay } from '../_shared/zone.ts'
import { TICK_MIN, minutesOf, wallMinutes } from './ritual.ts'

/** The app_settings columns it reads: 0091's day and time, 0095's switch, 0055's weekend. */
export interface ReviewSettings {
  review_day?: number | null
  review_time?: string | null
  review_reminder_on?: boolean | null
  weekend_days?: number[] | null
}

/** 18:00 on the user's clock — the reminder's time when the review has none set. */
export const REVIEW_AT = 18 * 60

const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()

/** weekend_days as lib/weekend.ts parseWeekend reads it: 0–6 once each; unset = Sat + Sun. */
function weekendOf(s: ReviewSettings | null | undefined): number[] {
  const raw = s?.weekend_days
  if (!Array.isArray(raw)) return [0, 6]
  return [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
}

/** The weekday a review week starts on: the day after the weekend's last day (rituals/reviewWeek weekStartDay). */
export function weekStartDay(weekend: readonly number[]): number {
  const on = new Set(weekend)
  const last = [...on].find((d) => !on.has((d + 1) % 7))
  return last === undefined ? 0 : (last + 1) % 7
}

/** The review week's first day ("YYYY-MM-DD") that loop day `key` belongs to — the week's key. */
export function reviewWeekKey(key: string, weekend: readonly number[]): string {
  return addDays(key, -((weekdayOf(key) - weekStartDay(weekend) + 7) % 7))
}

/** Is `weekday` the first day of the weekend? (lib/weekend.ts daysToWeekend(…) === 0.) */
function firstWeekendDay(weekday: number, weekend: readonly number[]): boolean {
  const on = new Set(weekend)
  return on.has(weekday) && !on.has((weekday + 6) % 7)
}

/** The review week `at` belongs to when its loop day is the review day (review_day, else the weekend's
 * first day), else null. */
export function reviewWeekOn(s: ReviewSettings | null | undefined, at: Date, zone: string): string | null {
  const weekend = weekendOf(s)
  const key = loopDay(at, zone)
  const weekday = weekdayOf(key)
  const day = typeof s?.review_day === 'number' && Number.isInteger(s.review_day) && s.review_day >= 0 && s.review_day <= 6 ? s.review_day : null
  if (day !== null ? weekday !== day : !firstWeekendDay(weekday, weekend)) return null
  return reviewWeekKey(key, weekend)
}

/** Is the review reminder due on the tick at `now`: on its day, at its time (18:00 when it has none)? */
export function weeklyReviewDue(s: ReviewSettings | null | undefined, now: Date, zone: string): boolean {
  if (s?.review_reminder_on === false) return false
  if (reviewWeekOn(s, now, zone) === null) return false
  const at = minutesOf(s?.review_time) ?? REVIEW_AT
  return (wallMinutes(now, zone) - at + 1440) % 1440 < TICK_MIN
}

/** A review event as notify and the app hold it (activity_log rows, oldest first). */
export interface ReviewRow {
  event_type: string
  payload: unknown
  created_at: string
}

/** Was the review week `weekKey` closed? The latest close / reopen for it wins (rituals/reviewWeek
 * weekClosedAt); a row names its week (`payload.week`), else it is the week of the loop day it was written on. */
export function reviewClosed(rows: readonly ReviewRow[], weekKey: string, s: ReviewSettings | null | undefined, zone: string): boolean {
  const weekend = weekendOf(s)
  let closed = false
  for (const e of rows) {
    if (e.event_type !== 'review.week_closed' && e.event_type !== 'review.week_reopened') continue
    const week = (e.payload as { week?: string } | null)?.week ?? reviewWeekKey(loopDay(new Date(e.created_at), zone), weekend)
    if (week === weekKey) closed = e.event_type === 'review.week_closed'
  }
  return closed
}
