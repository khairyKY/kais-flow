import { describe, expect, it } from 'vitest'
import { hasStructure, parseCommand, stripLabels, stripPriorityAndDuration } from './parseCommand'
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

describe('stripPriorityAndDuration', () => {
  it('strips a priority-only token, leaving the date untouched', () => {
    const result = stripPriorityAndDuration('buy milk !!')
    expect(result.text).toBe('buy milk')
    expect(result.priority).toBe(2)
    expect(result.durationMin).toBeNull()
  })

  it('strips a duration-only token', () => {
    const result = stripPriorityAndDuration('deep work 1h30m')
    expect(result.text).toBe('deep work')
    expect(result.durationMin).toBe(90)
    expect(result.priority).toBeNull()
  })

  it('leaves dates and tags alone — that is the AI parse’s job', () => {
    // Only the flag itself is removed; unlike the full `parseCommand` pipeline, this helper
    // doesn't re-collapse whitespace, since the AI parse doesn't care about a double space.
    const result = stripPriorityAndDuration('call Omar tomorrow 3pm !!! #shaheen')
    expect(result.text).toBe('call Omar tomorrow 3pm  #shaheen')
    expect(result.priority).toBe(1)
  })

  it('returns the input unchanged when neither token is present', () => {
    const result = stripPriorityAndDuration('water the plants')
    expect(result.text).toBe('water the plants')
    expect(result.priority).toBeNull()
    expect(result.durationMin).toBeNull()
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
    expect(stripLabels('*calls')).toEqual({ text: '', labels: ['calls'] })
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
