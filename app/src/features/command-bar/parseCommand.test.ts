import { describe, expect, it } from 'vitest'
import { parseCommand } from './parseCommand'
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
})
