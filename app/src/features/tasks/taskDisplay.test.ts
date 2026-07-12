import { describe, expect, it } from 'vitest'
import { daysOverdue, formatDuration, priorityColor, priorityFlag, resolveTag } from './taskDisplay'
import type { Area, Domain, Project, Task } from '../../lib/types'

function task(patch: Partial<Task>): Task {
  return {
    id: 't1',
    project_id: null,
    domain_id: null,
    area_id: null,
    title: 'x',
    notes: null,
    status: 'todo',
    due_at: null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: null,
    labels: [],
    priority: null,
    duration_min: null,
    someday: false,
    reminder_at: null,
    reminder_sent: false,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...patch,
  }
}

describe('formatDuration', () => {
  it('renders minutes-only', () => {
    expect(formatDuration(30)).toBe('30M')
  })
  it('renders hours-only', () => {
    expect(formatDuration(60)).toBe('1H')
  })
  it('renders combined hours and minutes', () => {
    expect(formatDuration(90)).toBe('1H30M')
  })
})

describe('daysOverdue', () => {
  it('is 0 for a task due today', () => {
    const now = new Date('2026-07-08T14:00:00')
    expect(daysOverdue('2026-07-08T09:00:00', now)).toBe(0)
  })
  it('is 1 for a task due yesterday at 23:00 (calendar-day diff, not raw ms/24)', () => {
    const now = new Date('2026-07-08T01:00:00')
    expect(daysOverdue('2026-07-07T23:00:00', now)).toBe(1)
  })
  it('is 6 for a task due 6 days ago', () => {
    const now = new Date('2026-07-08T10:00:00')
    expect(daysOverdue('2026-07-02T10:00:00', now)).toBe(6)
  })
})

describe('priorityFlag', () => {
  it('maps priority 1 (most urgent) to three marks', () => {
    expect(priorityFlag(1)).toBe('!!!')
  })
  it('maps priority 3 (least urgent) to one mark', () => {
    expect(priorityFlag(3)).toBe('!')
  })
  it('returns null when unset', () => {
    expect(priorityFlag(null)).toBeNull()
  })
})

describe('priorityColor', () => {
  it('maps priority 1 (most urgent, "!!!") to the overdue/red token', () => {
    expect(priorityColor(1)).toBe('var(--sig-overdue)')
  })
  it('maps priority 2 ("!!") to the gold/yellow token', () => {
    expect(priorityColor(2)).toBe('var(--acc-gold)')
  })
  it('maps priority 3 ("!") to the hydrangea/blue token', () => {
    expect(priorityColor(3)).toBe('var(--acc-hydrangea-deep)')
  })
  it('returns null when unset', () => {
    expect(priorityColor(null)).toBeNull()
  })
})

describe('resolveTag', () => {
  const domains: Domain[] = [{ id: 'd1', name: 'Shaheen', color: '#8A9A7E', sort_order: 0, created_at: '', updated_at: '' }]
  const projects: Project[] = [{ id: 'p1', domain_id: 'd1', name: 'Pricing', type: 'standard', status: 'active', created_at: '', updated_at: '' }]
  const areas: Area[] = [{ id: 'a1', domain_id: null, name: 'Health', description: null, color: '#D4A8B0', sort_order: 0, created_at: '', updated_at: '' }]

  it('prefers area over project and domain', () => {
    const t = task({ area_id: 'a1', project_id: 'p1', domain_id: 'd1' })
    expect(resolveTag(t, domains, projects, areas)).toEqual({ label: 'Health', color: '#D4A8B0' })
  })
  it('falls back to project (using its domain color) when no area is set', () => {
    const t = task({ project_id: 'p1', domain_id: 'd1' })
    expect(resolveTag(t, domains, projects, areas)).toEqual({ label: 'Pricing', color: '#8A9A7E' })
  })
  it('falls back to domain when neither area nor project is set', () => {
    const t = task({ domain_id: 'd1' })
    expect(resolveTag(t, domains, projects, areas)).toEqual({ label: 'Shaheen', color: '#8A9A7E' })
  })
  it('returns null when nothing is tagged', () => {
    expect(resolveTag(task({}), domains, projects, areas)).toBeNull()
  })
})
