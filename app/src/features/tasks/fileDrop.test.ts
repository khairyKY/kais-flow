import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'
import type { MoveTarget } from './move'

// The verdicts are pure; the writes behind them are api's own (api.move.test.ts and friends).
vi.mock('./api', () => ({ moveTasksWithUndo: vi.fn(), rescheduleDue: vi.fn(), somedayTasksWithUndo: vi.fn() }))
vi.mock('../../lib/undo', () => ({ toastUndo: vi.fn() }))
const { taskVerdict, inboxVerdict, projectVerdict } = await import('./fileDrop')

// Monday 12 Oct 2026, 10:00 in Cairo (UTC+3).
const NOW = new Date('2026-10-12T07:00:00Z')
const task = (over: Partial<Task>): Task => ({ id: 't', project_id: null, area_id: null, domain_id: null, someday: false, due_at: null, ...over }) as Task
const SITE: MoveTarget = { kind: 'project', id: 'p1', domainId: 'd1', name: 'Site' }
const HEALTH: MoveTarget = { kind: 'area', id: 'a1', domainId: 'd2', name: 'Health' }
const today = { kind: 'today', label: 'Today' } as const
const someday = { kind: 'someday', label: 'Someday' } as const
const site = { kind: 'place', label: 'Site', to: SITE } as const
const health = { kind: 'place', label: 'Health', to: HEALTH } as const
const career = { kind: 'domain', label: 'Career', id: 'd1' } as const

describe('taskVerdict — where a task drag lands', () => {
  it('Today takes a task that is not due today, and says no when every one already is', () => {
    expect(taskVerdict([task({ due_at: '2026-10-13T06:00:00Z' })], today, NOW)).toBe(true)
    expect(taskVerdict([task({})], today, NOW)).toBe(true)
    expect(taskVerdict([task({ due_at: '2026-10-12T12:00:00Z' })], today, NOW)).toBe(false)
    expect(taskVerdict([task({ due_at: '2026-10-12T12:00:00Z' }), task({ due_at: null })], today, NOW)).toBe(true)
  })

  it("Today reads the user's day, not UTC's: 01:00 Cairo on the 13th is tomorrow", () => {
    expect(taskVerdict([task({ due_at: '2026-10-12T22:00:00Z' })], today, NOW)).toBe(true)
  })

  it('a someday task dated today is still not "on Today"', () => {
    expect(taskVerdict([task({ due_at: '2026-10-12T12:00:00Z', someday: true })], today, NOW)).toBe(true)
  })

  it('Someday says no only when every one is parked already', () => {
    expect(taskVerdict([task({ someday: true })], someday, NOW)).toBe(false)
    expect(taskVerdict([task({ someday: true }), task({})], someday, NOW)).toBe(true)
  })

  it('a project or area says no when every one already lives there', () => {
    expect(taskVerdict([task({ project_id: 'p1' })], site, NOW)).toBe(false)
    expect(taskVerdict([task({ project_id: 'p2' })], site, NOW)).toBe(true)
    expect(taskVerdict([task({ area_id: 'a1' })], health, NOW)).toBe(false)
    expect(taskVerdict([task({ area_id: 'a1' }), task({ project_id: 'p1' })], health, NOW)).toBe(true)
  })

  it('a board column is not a place for tasks, and nothing in hand is not a load', () => {
    expect(taskVerdict([task({})], career, NOW)).toBeNull()
    expect(taskVerdict([], today, NOW)).toBeNull()
  })
})

describe('inboxVerdict / projectVerdict', () => {
  it('a capture files to Today and nowhere else in reach', () => {
    expect(inboxVerdict(today)).toBe(true)
    expect(inboxVerdict(someday)).toBeNull()
    expect(inboxVerdict(site)).toBeNull()
  })

  it("a project card moves to another domain's column; its own column is the soft no", () => {
    expect(projectVerdict({ domain_id: 'd2' }, career)).toBe(true)
    expect(projectVerdict({ domain_id: 'd1' }, career)).toBe(false)
    expect(projectVerdict({ domain_id: null }, career)).toBe(true)
    expect(projectVerdict({ domain_id: 'd2' }, today)).toBeNull()
  })
})
