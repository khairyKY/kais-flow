import { describe, expect, it } from 'vitest'
import { hasStructure, parseCommand, quickAddTask } from './parseCommand'
import type { Domain, Project } from '../../lib/types'

const domains: Domain[] = [
  { id: 'd1', name: 'Shaheen', color: null, sort_order: 0, created_at: '', updated_at: '' },
  { id: 'd2', name: 'Home', color: null, sort_order: 1, created_at: '', updated_at: '' },
]

const projects: Project[] = [
  {
    id: 'p1',
    domain_id: 'd1',
    name: 'Shaheen Pricing',
    type: 'standard',
    status: 'active',
    created_at: '',
    updated_at: '',
  },
]

describe('parseCommand', () => {
  it('extracts a date, a project tag, and cleans the title', () => {
    const result = parseCommand('call Omar tomorrow 3pm #shaheen', domains, projects)
    expect(result.title).toBe('call Omar')
    expect(result.dueAt).not.toBeNull()
    expect(result.projectId).toBe('p1')
    expect(result.domainId).toBe('d1')
  })

  it('falls back to a domain match when no project matches the tag', () => {
    const result = parseCommand('buy groceries #home', domains, projects)
    expect(result.title).toBe('buy groceries')
    expect(result.domainId).toBe('d2')
    expect(result.projectId).toBeNull()
  })

  it('returns no date/domain/project for plain free text', () => {
    const result = parseCommand('think about mom’s gift sometime', domains, projects)
    expect(result.dueAt).toBeNull()
    expect(result.domainId).toBeNull()
    expect(result.projectId).toBeNull()
    expect(result.title.length).toBeGreaterThan(0)
  })

  it('parses a bare date with no tag', () => {
    const result = parseCommand('submit report friday', domains, projects)
    expect(result.title).toBe('submit report')
    expect(result.dueAt).not.toBeNull()
  })

  it('parses a minutes-only duration', () => {
    const result = parseCommand('quick sync 30m', domains, projects)
    expect(result.title).toBe('quick sync')
    expect(result.durationMin).toBe(30)
  })

  it('parses an hours-only duration', () => {
    const result = parseCommand('call Omar tomorrow 3pm 1h', domains, projects)
    expect(result.title).toBe('call Omar')
    expect(result.durationMin).toBe(60)
  })

  it('parses a combined hours+minutes duration', () => {
    const result = parseCommand('deep work 1h30m', domains, projects)
    expect(result.title).toBe('deep work')
    expect(result.durationMin).toBe(90)
  })

  it('returns null duration when none is present', () => {
    const result = parseCommand('buy groceries #home', domains, projects)
    expect(result.durationMin).toBeNull()
  })

  it('parses !/!!/!!! into priority 3/2/1', () => {
    expect(parseCommand('water plants !', domains, projects).priority).toBe(3)
    expect(parseCommand('water plants !!', domains, projects).priority).toBe(2)
    expect(parseCommand('water plants !!!', domains, projects).priority).toBe(1)
  })

  it('returns null priority when no ! is present', () => {
    expect(parseCommand('water plants', domains, projects).priority).toBeNull()
  })

  it('strips the priority flag from the title without leaking into a tag match', () => {
    const result = parseCommand('call Omar tomorrow 3pm 1h !! #shaheen', domains, projects)
    expect(result.title).toBe('call Omar')
    expect(result.durationMin).toBe(60)
    expect(result.priority).toBe(2)
    expect(result.projectId).toBe('p1')
  })
})

describe('hasStructure', () => {
  it('is true when only priority is set (no date/project) — "buy milk !!" still creates a task', () => {
    expect(hasStructure({ dueAt: null, domainId: null, projectId: null, priority: 2, durationMin: null })).toBe(true)
  })

  it('is true when only duration is set', () => {
    expect(hasStructure({ dueAt: null, domainId: null, projectId: null, priority: null, durationMin: 30 })).toBe(true)
  })

  it('is true when a date/domain/project is set, unchanged from before', () => {
    expect(hasStructure({ dueAt: '2026-01-01T00:00:00.000Z', domainId: null, projectId: null, priority: null, durationMin: null })).toBe(true)
    expect(hasStructure({ dueAt: null, domainId: 'd1', projectId: null, priority: null, durationMin: null })).toBe(true)
  })

  it('is false for plain free text with no structure at all', () => {
    expect(hasStructure({ dueAt: null, domainId: null, projectId: null, priority: null, durationMin: null })).toBe(false)
  })

  it('a label alone is structure: "buy milk *errands" is a task with that label', () => {
    expect(hasStructure({ dueAt: null, domainId: null, projectId: null, priority: null, durationMin: null, labels: ['errands'] })).toBe(true)
    expect(hasStructure({ dueAt: null, domainId: null, projectId: null, priority: null, durationMin: null, labels: [] })).toBe(false)
  })
})

describe('*labels (Kai 2026-10-03)', () => {
  it('every *word becomes a label, once, and leaves the title', () => {
    const r = parseCommand('call Omar *calls tomorrow 3pm *q3-review #shaheen *calls', domains, projects)
    expect(r.labels).toEqual(['calls', 'q3-review'])
    expect(r.title).toBe('call Omar')
    expect(r.projectId).toBe('p1')
    expect(r.dueAt).not.toBeNull()
  })

  it('a label that reads like a date stays a label', () => {
    const r = parseCommand('water the plants *today', domains, projects)
    expect(r.labels).toEqual(['today'])
    expect(r.dueAt).toBeNull()
    expect(r.title).toBe('water the plants')
  })

  it('a * inside a word or on its own is text, and none means []', () => {
    expect(parseCommand('5*3 is 15', domains, projects)).toMatchObject({ labels: [], title: '5*3 is 15' })
    expect(parseCommand('rate it * stars', domains, projects).labels).toEqual([])
    expect(parseCommand('*calls', domains, projects)).toMatchObject({ title: '', labels: ['calls'] })
  })
})

// T-4: the command bar reads a typed time on Cairo's clock, whatever zone the device is in.
// Every expectation here is an exact UTC instant, so the suite proves it under TZ=UTC,
// TZ=Africa/Cairo and TZ=America/Los_Angeles alike. Cairo is UTC+3 until the last Thursday of
// October 2026 (Oct 29), UTC+2 after.
describe('parseCommand, zone: cairo (T-4)', () => {
  const cairo = (input: string, now: Date) => parseCommand(input, domains, projects, { now, zone: 'cairo' }).dueAt
  const morning = new Date('2026-09-26T06:00:00Z') // 09:00 Cairo, Sat Sep 26

  it('"10am" is 10:00 in Cairo, not 10:00 on the device', () => {
    expect(cairo('call Omar 10am', morning)).toBe('2026-09-26T07:00:00.000Z')
  })

  it('"tomorrow 3pm" is 15:00 Cairo the next Cairo day', () => {
    expect(cairo('call Omar tomorrow 3pm #shaheen', morning)).toBe('2026-09-27T12:00:00.000Z')
  })

  it('a time already past in Cairo today rolls to tomorrow (forwardDate)', () => {
    const lateMorning = new Date('2026-09-26T08:00:00Z') // 11:00 Cairo
    expect(cairo('call Omar 10am', lateMorning)).toBe('2026-09-27T07:00:00.000Z')
  })

  it('"tomorrow" counts from the Cairo day, even when the device is still on yesterday', () => {
    // 00:30 Sun Sep 27 in Cairo = 14:30 Sat Sep 26 in Los Angeles, 21:30 Sat in UTC.
    const afterCairoMidnight = new Date('2026-09-26T21:30:00Z')
    expect(cairo('pay rent tomorrow 9am', afterCairoMidnight)).toBe('2026-09-28T06:00:00.000Z')
  })

  it('a date across the October DST switch uses that date’s own offset (UTC+2)', () => {
    expect(cairo('dentist nov 5 10am', morning)).toBe('2026-11-05T08:00:00.000Z')
  })

  it('a relative time is an exact offset from now', () => {
    expect(cairo('stretch in 2 hours', morning)).toBe('2026-09-26T08:00:00.000Z')
  })

  it('a date with no time keeps the noon default, in Cairo', () => {
    expect(cairo('submit report friday', morning)).toBe('2026-10-02T09:00:00.000Z')
  })

  it('dueTimed: only a typed clock time counts (Kai 2026-10-07: a timed capture is a calendar block)', () => {
    const timed = (input: string) => parseCommand(input, domains, projects, { now: morning, zone: 'cairo' }).dueTimed
    expect(timed('crypto session 4am')).toBe(true)
    expect(timed('call Omar tomorrow 3pm')).toBe(true)
    expect(timed('dentist nov 5 10:30')).toBe(true)
    expect(timed('stretch in 2 hours')).toBe(true)
    expect(timed('call Omar tomorrow')).toBe(false)
    expect(timed('submit report friday')).toBe(false)
    expect(timed('buy milk')).toBe(false)
  })

  it('still strips the date from the title', () => {
    const result = parseCommand('call Omar tomorrow 3pm #shaheen', domains, projects, { now: morning, zone: 'cairo' })
    expect(result.title).toBe('call Omar')
    expect(result.projectId).toBe('p1')
  })

  it('the default (device) reading is unchanged for the calendar’s QuickCreate', () => {
    const device = parseCommand('call Omar 10am', domains, projects, { now: morning }).dueAt
    const expected = new Date(morning)
    expected.setHours(10, 0, 0, 0)
    if (expected < morning) expected.setDate(expected.getDate() + 1)
    expect(device).toBe(expected.toISOString())
  })
})

describe('quickAddTask (the Tasks page and command bar quick add)', () => {
  // Monday 12 Oct 2026, 10:00 in Cairo (UTC+3).
  const now = new Date('2026-10-12T07:00:00Z')
  const forecasting: Project = { id: 'p9', domain_id: 'd1', name: 'Forecasting', type: 'standard', status: 'active', created_at: '', updated_at: '' }
  it('reads the placeholder example: a date, a time, a #project — on the user clock', () => {
    const typed = 'submit the report tomorrow 3pm #forecasting'
    const parsed = parseCommand(typed, domains, [forecasting], { now, zone: 'cairo' })
    expect(quickAddTask(parsed, typed)).toEqual({
      title: 'submit the report',
      domainId: 'd1',
      projectId: 'p9',
      dueAt: '2026-10-13T12:00:00.000Z',
      durationMin: null,
      priority: null,
      labels: [],
      recurrenceRule: null,
      notes: null,
    })
    expect(parsed.dueTimed).toBe(true)
  })
  it('priority, duration and labels too; a date alone is not timed', () => {
    const typed = 'pay rent friday !! 15m *home'
    const parsed = parseCommand(typed, domains, projects, { now, zone: 'cairo' })
    expect(quickAddTask(parsed, typed)).toMatchObject({ title: 'pay rent', priority: 2, durationMin: 15, labels: ['home'] })
    expect(parsed.dueTimed).toBe(false)
  })
  it('a line that is all tokens keeps what was typed as its title', () => {
    expect(quickAddTask(parseCommand('tomorrow 9am', domains, projects, { now, zone: 'cairo' }), 'tomorrow 9am').title).toBe('tomorrow 9am')
  })
})

// P7e A5: "Stretch every day 7am" used to land as a one-off titled "Stretch every day".
describe('repeats typed in the bar (P7e A5)', () => {
  const monday = new Date('2026-10-12T07:00:00Z') // Mon 12 Oct, 10:00 Cairo (UTC+3)
  const tuesday = new Date('2026-10-13T07:00:00Z')
  const p = (input: string, now = monday) => parseCommand(input, domains, projects, { now, zone: 'cairo' })

  it('sets the rule and leaves the title; a passed time starts tomorrow', () => {
    expect(p('Stretch every day 7am')).toMatchObject({ title: 'Stretch', recurrence: 'FREQ=DAILY', dueAt: '2026-10-13T04:00:00.000Z', dueTimed: true })
  })

  it('a weekday rule starts on its own day, at the typed time', () => {
    expect(p('Gym every monday 6pm')).toMatchObject({ title: 'Gym', recurrence: 'FREQ=WEEKLY;BYDAY=MO', dueAt: '2026-10-12T15:00:00.000Z' })
    expect(p('Gym every monday 6pm', tuesday).dueAt).toBe('2026-10-19T15:00:00.000Z')
    expect(p('Review every mon, fri', tuesday)).toMatchObject({ title: 'Review', recurrence: 'FREQ=WEEKLY;BYDAY=MO,FR', dueAt: '2026-10-16T06:00:00.000Z', dueTimed: false })
  })

  it('no date: from today, first thing (not timed — no block)', () => {
    expect(p('Water plants every 2 weeks')).toMatchObject({ title: 'Water plants', recurrence: 'FREQ=WEEKLY;INTERVAL=2', dueAt: '2026-10-12T06:00:00.000Z', dueTimed: false })
    expect(p('Pay rent every month #home')).toMatchObject({ title: 'Pay rent', recurrence: 'FREQ=MONTHLY', domainId: 'd2' })
    expect(p('every weekday standup 9am').title).toBe('standup')
    expect(p('every other week call grandma').recurrence).toBe('FREQ=WEEKLY;INTERVAL=2')
  })

  it('only "every …" — a bare "weekly" and other "every"s stay words', () => {
    expect(p('Weekly review')).toMatchObject({ title: 'Weekly review', recurrence: null, dueAt: null })
    expect(p('every time it rains')).toMatchObject({ title: 'every time it rains', recurrence: null })
    expect(p('read everything')).toMatchObject({ title: 'read everything', recurrence: null })
  })

  it('rides into the task', () => {
    const typed = 'Stretch every day 7am'
    expect(quickAddTask(p(typed), typed)).toMatchObject({ title: 'Stretch', recurrenceRule: 'FREQ=DAILY' })
  })
})

// P7e A6 (audit p7e c3): "// include the VAT line" stayed in the title, and "<friday" left its "<".
describe('// notes and <date (P7e A6)', () => {
  const now = new Date('2026-10-12T07:00:00Z') // Mon 12 Oct, 10:00 Cairo
  const p = (input: string) => parseCommand(input, domains, projects, { now, zone: 'cairo' })

  it('// makes the rest the notes, read as written — its words are not tokens', () => {
    expect(p('Send the quote tomorrow 3pm // include the VAT line')).toMatchObject({ title: 'Send the quote', notes: 'include the VAT line', dueTimed: true })
    expect(p('call Omar // maybe tomorrow #shaheen !!')).toMatchObject({ title: 'call Omar', notes: 'maybe tomorrow #shaheen !!', dueAt: null, projectId: null, priority: null })
    expect(p('plain line').notes).toBeNull()
    expect(p('empty notes //').notes).toBeNull()
  })

  it('a link keeps its slashes', () => {
    expect(p('read https://example.com/a//b').notes).toBeNull()
  })

  it('notes alone are structure: the line becomes a task with them', () => {
    expect(hasStructure(p('idea for the site // a calmer hero'))).toBe(true)
    const typed = 'Send the quote friday // include the VAT line'
    expect(quickAddTask(p(typed), typed)).toMatchObject({ title: 'Send the quote', notes: 'include the VAT line' })
  })

  it('<date is the date, and the < leaves the title', () => {
    expect(p('file taxes <friday')).toMatchObject({ title: 'file taxes', dueAt: '2026-10-16T09:00:00.000Z' })
    expect(p('<friday file taxes').title).toBe('file taxes')
    expect(p('a < b').title).toBe('a < b')
  })
})

// P7e A10: the bar's first Esc hands the last recognised token back to the title.
describe('tokens and ignore (P7e A10)', () => {
  const now = new Date('2026-10-12T07:00:00Z')
  const p = (input: string, ignore: string[] = []) => parseCommand(input, domains, projects, { now, zone: 'cairo', ignore })

  it('lists the words each chip took, in line order (an unmatched #tag has no chip)', () => {
    expect(p('call Omar tomorrow 3pm #shaheen').tokens).toEqual(['tomorrow 3pm', '#shaheen'])
    expect(p('Sync every week !! *calls 30m #nowhere // agenda').tokens).toEqual(['every week', '!!', '*calls', '30m', '// agenda'])
    expect(p('file taxes <friday').tokens).toEqual(['<friday'])
    expect(p('buy milk').tokens).toEqual([])
  })

  it('ignored words stay in the title and set nothing', () => {
    expect(p('call Omar tomorrow 3pm #shaheen', ['#shaheen'])).toMatchObject({ title: 'call Omar #shaheen', projectId: null, tokens: ['tomorrow 3pm'] })
    const plain = p('Read Monday notes', ['Monday'])
    expect(plain).toMatchObject({ title: 'Read Monday notes', dueAt: null, tokens: [] })
    expect(hasStructure(plain)).toBe(false)
    expect(p('Gym every monday 6pm', ['every monday'])).toMatchObject({ title: 'Gym every monday', recurrence: null, dueTimed: true })
    expect(p('wow !! nice // later', ['// later', '!!'])).toMatchObject({ title: 'wow !! nice // later', priority: null, notes: null })
  })
})
