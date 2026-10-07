import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'
import type { MoveTarget } from './move'

// moveTasksWithUndo is the one write behind every "Move to…" (menu, swipe, `p`, sheet, bulk), and
// carryTasksToDomain the tasks half of moving a project or area to another domain.
const writes: Record<string, unknown>[] = []
let cache: Task[] = []
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => cache } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (_t: string, row: Record<string, unknown>) => writes.push(row) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn() }))
const { moveTasksWithUndo, carryTasksToDomain } = await import('./api')

const task = (over: Partial<Task>): Task => ({ id: 't1', project_id: null, domain_id: null, area_id: null, milestone_id: null, title: 'x', ...over }) as Task
const last = () => writes.at(-1)!
const SITE: MoveTarget = { kind: 'project', id: 'p2', domainId: 'd2', name: 'Site' }
const HEALTH: MoveTarget = { kind: 'area', id: 'a2', domainId: 'd3', name: 'Health' }
const WORK: MoveTarget = { kind: 'domain', id: 'd9', name: 'Work' }

beforeEach(() => {
  writes.length = 0
  toasts.length = 0
  cache = []
})

describe('moveTasksWithUndo — one task', () => {
  it('into a project: its project and domain, out of any area', () => {
    moveTasksWithUndo([task({ area_id: 'a1' })], SITE)
    expect(last()).toMatchObject({ project_id: 'p2', domain_id: 'd2', area_id: null })
    expect(toasts.at(-1)!.message).toBe('Moved to Site')
  })
  it('into an area: its area and domain, out of the project', () => {
    moveTasksWithUndo([task({ project_id: 'p1', domain_id: 'd1', milestone_id: 'm1' })], HEALTH)
    expect(last()).toMatchObject({ project_id: null, area_id: 'a2', domain_id: 'd3', milestone_id: null })
  })
  it('into a domain: only the domain', () => {
    moveTasksWithUndo([task({ project_id: 'p1', area_id: 'a1' })], WORK)
    expect(last()).toMatchObject({ project_id: null, area_id: null, domain_id: 'd9' })
  })
  it('None clears all three', () => {
    moveTasksWithUndo([task({ project_id: 'p1', area_id: 'a1', domain_id: 'd1' })], { kind: 'none', name: 'None' })
    expect(last()).toMatchObject({ project_id: null, area_id: null, domain_id: null })
    expect(toasts.at(-1)!.message).toBe('Unfiled')
  })
  it('Undo puts back project, area, domain and milestone — and keeps an edit made since', () => {
    const before = task({ project_id: 'p1', domain_id: 'd1', milestone_id: 'm1', title: 'old' })
    moveTasksWithUndo([before], HEALTH)
    cache = [{ ...(last() as unknown as Task), title: 'renamed since' }]
    toasts.at(-1)!.undo()
    expect(last()).toMatchObject({ project_id: 'p1', area_id: null, domain_id: 'd1', milestone_id: 'm1', title: 'renamed since' })
  })
})

describe('moveTasksWithUndo — bulk', () => {
  it('moves every task, one toast, one Undo for all', () => {
    const a = task({ id: 'a', project_id: 'p1', domain_id: 'd1' })
    const b = task({ id: 'b', area_id: 'a1', domain_id: 'd3' })
    moveTasksWithUndo([a, b], WORK)
    expect(writes).toHaveLength(2)
    expect(writes.every((w) => w.domain_id === 'd9' && w.project_id === null && w.area_id === null)).toBe(true)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('2 tasks moved to Work')
    toasts[0].undo()
    expect(writes.slice(2)).toEqual([
      expect.objectContaining({ id: 'a', project_id: 'p1', area_id: null, domain_id: 'd1' }),
      expect.objectContaining({ id: 'b', project_id: null, area_id: 'a1', domain_id: 'd3' }),
    ])
  })
})

describe('carryTasksToDomain — an area or project changing domain takes its tasks', () => {
  it('moves the tasks in it (and only those) to the new domain; Undo brings each back', () => {
    cache = [
      task({ id: 'in1', area_id: 'a1', domain_id: 'd1' }),
      task({ id: 'in2', area_id: 'a1', domain_id: null }),
      task({ id: 'out', area_id: 'a2', domain_id: 'd1' }),
      task({ id: 'there', area_id: 'a1', domain_id: 'd2' }),
    ]
    const undo = carryTasksToDomain('area_id', 'a1', 'd2')
    expect(writes.map((w) => [w.id, w.domain_id])).toEqual([['in1', 'd2'], ['in2', 'd2']])
    undo()
    expect(writes.slice(2).map((w) => [w.id, w.domain_id])).toEqual([['in1', 'd1'], ['in2', null]])
  })
  it('works for a project the same way', () => {
    cache = [task({ id: 'p', project_id: 'p1', domain_id: 'd1' })]
    carryTasksToDomain('project_id', 'p1', null)
    expect(last()).toMatchObject({ id: 'p', domain_id: null })
  })
})
