// Birthday notices (Tray and Notifications.dc.html 12k/12j): "Omar’s birthday is today" at 08:00 on
// the user's clock, and a week before, "Omar’s birthday is in a week" (P7 7b: "7-day + day-of"). notify sends it on a 15-minute cron (migration 0065) and the Windows/Android apps
// plan it themselves (app/src/features/notifications/plan.ts). Pure — no Deno APIs — so the app's
// vitest runs it (app/src/features/notifications/birthday.test.ts), the ritual.ts pattern.
import { addDays, dateKey } from '../_shared/zone.ts'
import type { BirthdayPerson } from './copy.ts'
import { TICK_MIN, wallMinutes } from './ritual.ts'

/** 12j draws it at 08:00. */
export const BIRTHDAY_AT = 8 * 60

/** P7 7b: the heads-up comes this many days before the day itself. */
export const BIRTHDAY_AHEAD_DAYS = 7

export interface PersonFacts {
  id: string
  name: string
  /** people.facts: the Birthday fact's `date` ("07-17") or, failing that, its words ("July 17"). */
  facts?: readonly { label: string; value?: string | null; date?: string | null }[] | null
}

export interface Spoke {
  person_id: string
  occurred_at: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Month (1–12) and day of someone's birthday, from their Birthday fact as the People page keeps it
 * (people/api.ts getDaysUntilBirthday): its date, else its value — "MM-DD" (a leading year is ignored),
 * or a month name and a day ("July 17", "17 July", "Jul 17th, 1990"). Null when there's none. Read by
 * hand, not by `new Date(words)`: that turns "someday in spring 2000" into 1 January. */
export function birthdayOf(p: PersonFacts): { month: number; day: number } | null {
  const fact = p.facts?.find((f) => f.label === 'Birthday')
  const raw = (fact?.date || fact?.value || '').trim()
  const md = /(\d{1,2})-(\d{1,2})$/.exec(raw)
  const named = md ? null : /([a-z]{3,})\.?\s+(\d{1,2})(?!\d)|(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})/i.exec(raw)
  const month = md ? Number(md[1]) : named ? MONTHS.indexOf((named[1] ?? named[4]).slice(0, 3).toLowerCase()) + 1 : 0
  const day = md ? Number(md[2]) : named ? Number(named[2] ?? named[3]) : 0
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null
}

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Is a birthday on day `key` (YYYY-MM-DD)? A 29 February one falls on 1 March in other years — the
 * day the People page and Today count down to (a JS Date rolls 29 Feb over). */
export function birthdayOn(b: { month: number; day: number }, key: string): boolean {
  const [y, m, d] = key.split('-').map(Number)
  if (b.month === 2 && b.day === 29 && !leap(y)) return m === 3 && d === 1
  return b.month === m && b.day === d
}

const dayNumber = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000

/** The people whose birthday is day `key` on `zone`'s clock, each with the days since their newest
 * interaction on or before `asOf` (that day, unless said otherwise). In the order given. */
export function birthdaysOn(people: readonly PersonFacts[], spoke: readonly Spoke[], key: string, zone: string, asOf = key): BirthdayPerson[] {
  return people.flatMap((p) => {
    const b = birthdayOf(p)
    if (!b || !birthdayOn(b, key)) return []
    const last = spoke
      .filter((s) => s.person_id === p.id)
      .map((s) => dateKey(new Date(s.occurred_at), zone))
      .filter((k) => k <= asOf)
      .sort()
      .pop()
    return [{ id: p.id, name: p.name, lastSpokeDays: last ? dayNumber(asOf) - dayNumber(last) : null }]
  })
}

/** What 08:00 on day `today` says, for notify and the apps alike: today's birthdays (`inDays` 0), then
 * the ones a week out (`inDays` 7, "last spoke" counted to today). Empty groups are left out. */
export function birthdayGroups(people: readonly PersonFacts[], spoke: readonly Spoke[], today: string, zone: string): { inDays: number; people: BirthdayPerson[] }[] {
  return [0, BIRTHDAY_AHEAD_DAYS]
    .map((inDays) => ({ inDays, people: birthdaysOn(people, spoke, addDays(today, inDays), zone, today) }))
    .filter((g) => g.people.length > 0)
}

/** Is 08:00 on this 15-minute cron tick, on `zone`'s clock? (ritual.ts ritualDue's rule.) */
export function birthdayDue(now: Date, zone: string): boolean {
  return (wallMinutes(now, zone) - BIRTHDAY_AT + 1440) % 1440 < TICK_MIN
}
