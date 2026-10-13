import { describe, expect, it } from 'vitest'
import { birthdayDue, birthdayGroups, birthdayOf, birthdayOn, birthdaysOn, type PersonFacts } from '../../../../supabase/functions/notify/birthday.ts'

// Birthday notices (Tray and Notifications.dc.html 12k/12j): whose birthday is "today" on the user's
// clock, read from the People page's Birthday fact, with "Last spoke N days ago".
const person = (id: string, birthday: { value?: string; date?: string | null } | null, name = id): PersonFacts => ({
  id,
  name,
  facts: birthday ? [{ label: 'Interest', value: 'tea' }, { label: 'Birthday', value: birthday.value ?? '', date: birthday.date ?? null }] : [],
})

describe('birthdayOf — the Birthday fact, read as the People page reads it', () => {
  it('its MM-DD date first (a leading year is ignored), else its words', () => {
    expect(birthdayOf(person('a', { value: 'July 17', date: '07-17' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: 'whatever', date: '1990-07-17' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: 'July 17' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: '17 July' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: 'July 17, 1990' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: 'Jul 17th' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: '17th of July' }))).toEqual({ month: 7, day: 17 })
    expect(birthdayOf(person('a', { value: 'Sept 5' }))).toEqual({ month: 9, day: 5 })
    expect(birthdayOf(person('a', { value: 'February 29' }))).toEqual({ month: 2, day: 29 })
    expect(birthdayOf(person('a', { value: 'March 3', date: '' }))).toEqual({ month: 3, day: 3 })
  })

  it('no Birthday fact, or nothing a date can be read from: none', () => {
    expect(birthdayOf(person('a', null))).toBeNull()
    expect(birthdayOf({ id: 'a', name: 'a' })).toBeNull()
    expect(birthdayOf(person('a', { value: 'someday in spring' }))).toBeNull()
    expect(birthdayOf(person('a', { value: '', date: '13-40' }))).toBeNull()
    expect(birthdayOf(person('a', { value: '' }))).toBeNull()
  })
})

describe('birthdayOn — the day itself', () => {
  it('month and day match', () => {
    expect(birthdayOn({ month: 7, day: 17 }, '2026-07-17')).toBe(true)
    expect(birthdayOn({ month: 7, day: 17 }, '2026-07-18')).toBe(false)
  })

  it('29 February: on the day in a leap year, on 1 March otherwise (what the People page counts down to)', () => {
    const leapling = { month: 2, day: 29 }
    expect(birthdayOn(leapling, '2028-02-29')).toBe(true)
    expect(birthdayOn(leapling, '2028-03-01')).toBe(false)
    expect(birthdayOn(leapling, '2027-02-28')).toBe(false)
    expect(birthdayOn(leapling, '2027-03-01')).toBe(true)
    expect(birthdayOn(leapling, '2100-03-01')).toBe(true) // 2100 isn't a leap year
    expect(birthdayOn(leapling, '2000-02-29')).toBe(true) // 2000 is
    expect(birthdayOn({ month: 3, day: 1 }, '2027-03-01')).toBe(true) // a real 1 March birthday still is
  })
})

describe('birthdaysOn — who, and when you last spoke, on the user’s clock', () => {
  const omar = person('omar', { value: 'July 17' }, 'Omar')
  const salma = person('salma', { date: '07-18' }, 'Salma')

  it('only today’s, each with the days since their newest interaction up to that day', () => {
    const spoke = [
      { person_id: 'omar', occurred_at: '2026-07-01T10:00:00Z' },
      { person_id: 'omar', occurred_at: '2026-07-05T10:00:00Z' },
      { person_id: 'omar', occurred_at: '2026-07-20T10:00:00Z' }, // after the day: not "last spoke"
      { person_id: 'salma', occurred_at: '2026-07-16T10:00:00Z' },
    ]
    expect(birthdaysOn([omar, salma], spoke, '2026-07-17', 'Africa/Cairo')).toEqual([{ id: 'omar', name: 'Omar', lastSpokeDays: 12 }])
    expect(birthdaysOn([omar, salma], spoke, '2026-07-18', 'Africa/Cairo')).toEqual([{ id: 'salma', name: 'Salma', lastSpokeDays: 2 }])
    expect(birthdaysOn([omar], [], '2026-07-17', 'Africa/Cairo')).toEqual([{ id: 'omar', name: 'Omar', lastSpokeDays: null }])
  })

  it('"today" and "yesterday" are the user’s days, not the server’s', () => {
    const late = [{ person_id: 'omar', occurred_at: '2026-07-16T22:30:00Z' }] // Cairo 17 Jul 01:30 · LA 16 Jul 15:30
    expect(birthdaysOn([omar], late, '2026-07-17', 'Africa/Cairo')[0].lastSpokeDays).toBe(0)
    expect(birthdaysOn([omar], late, '2026-07-17', 'America/Los_Angeles')[0].lastSpokeDays).toBe(1)
    expect(birthdaysOn([omar], late, '2026-07-17', 'Asia/Tokyo')[0].lastSpokeDays).toBe(0)
  })
})

describe('birthdayGroups — what 08:00 says: the day’s birthdays, then the ones a week out (P7 7b)', () => {
  const omar = person('omar', { value: 'July 17' }, 'Omar')
  const salma = person('salma', { date: '07-24' }, 'Salma')
  const spoke = [
    { person_id: 'salma', occurred_at: '2026-07-10T10:00:00Z' },
    { person_id: 'salma', occurred_at: '2026-07-20T10:00:00Z' }, // after today: not "last spoke" yet
  ]

  it('today’s first, then the week-ahead one — "last spoke" counted to today, not to the birthday', () => {
    expect(birthdayGroups([omar, salma], spoke, '2026-07-17', 'Africa/Cairo')).toEqual([
      { inDays: 0, people: [{ id: 'omar', name: 'Omar', lastSpokeDays: null }] },
      { inDays: 7, people: [{ id: 'salma', name: 'Salma', lastSpokeDays: 7 }] },
    ])
  })

  it('only the day and exactly seven days before it; nothing else, no empty groups', () => {
    expect(birthdayGroups([salma], spoke, '2026-07-17', 'Africa/Cairo').map((g) => g.inDays)).toEqual([7])
    expect(birthdayGroups([salma], spoke, '2026-07-18', 'Africa/Cairo')).toEqual([])
    expect(birthdayGroups([salma], spoke, '2026-07-16', 'Africa/Cairo')).toEqual([])
    expect(birthdayGroups([omar, salma], spoke, '2026-07-01', 'Africa/Cairo')).toEqual([])
  })

  it('a 29 February birthday: a week before 1 March in other years, a week before the 29th in a leap year', () => {
    const leapling = person('l', { value: 'February 29' }, 'Leila')
    expect(birthdayGroups([leapling], [], '2027-02-22', 'Africa/Cairo').map((g) => g.inDays)).toEqual([7])
    expect(birthdayGroups([leapling], [], '2028-02-22', 'Africa/Cairo').map((g) => g.inDays)).toEqual([7])
    expect(birthdayGroups([leapling], [], '2028-02-23', 'Africa/Cairo')).toEqual([])
  })
})

describe('birthdayDue — the 15-minute tick that is 08:00 on the user’s clock', () => {
  const utc = (iso: string) => new Date(iso)
  it('Cairo (UTC+3): 05:00–05:14 UTC', () => {
    expect(birthdayDue(utc('2026-10-12T05:00:00Z'), 'Africa/Cairo')).toBe(true)
    expect(birthdayDue(utc('2026-10-12T05:14:00Z'), 'Africa/Cairo')).toBe(true)
    expect(birthdayDue(utc('2026-10-12T05:15:00Z'), 'Africa/Cairo')).toBe(false)
    expect(birthdayDue(utc('2026-10-12T04:59:00Z'), 'Africa/Cairo')).toBe(false)
  })
  it('Tokyo is the day before in UTC; Kolkata’s half hour still gets exactly one tick; LA in daylight time', () => {
    expect(birthdayDue(utc('2026-10-11T23:00:00Z'), 'Asia/Tokyo')).toBe(true)
    expect(birthdayDue(utc('2026-10-12T02:30:00Z'), 'Asia/Kolkata')).toBe(true)
    expect(birthdayDue(utc('2026-10-12T02:15:00Z'), 'Asia/Kolkata')).toBe(false)
    expect(birthdayDue(utc('2026-10-12T15:00:00Z'), 'America/Los_Angeles')).toBe(true)
    expect(birthdayDue(utc('2026-12-12T16:00:00Z'), 'America/Los_Angeles')).toBe(true) // standard time
  })
})
