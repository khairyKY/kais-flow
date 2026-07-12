import { describe, expect, it } from 'vitest'
import { hasStructure, parseCommand, stripPriorityAndDuration } from './parseCommand'
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
})
