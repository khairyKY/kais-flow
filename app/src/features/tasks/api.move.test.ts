import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// setProject is the one write behind every "Move to project…" (menu, swipe, `p`, sheet, bulk).
const writes: Record<string, unknown>[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => [] } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (_t: string, row: Record<string, unknown>) => writes.push(row) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn() }))
const { setProject } = await import('./api')

const task = (over: Partial<Task>): Task => ({ id: 't1', project_id: null, domain_id: null, area_id: null, milestone_id: null, title: 'x', ...over }) as Task
const last = () => writes.at(-1)!

describe('setProject — a task lives in a project or an area, not both', () => {
  it('project → another project', () => {
    setProject(task({ project_id: 'p1', domain_id: 'd1' }), 'p2', 'd2')
    expect(last()).toMatchObject({ project_id: 'p2', domain_id: 'd2', area_id: null })
  })
  it('area → a project leaves the area', () => {
    setProject(task({ area_id: 'a1' }), 'p2', null)
    expect(last()).toMatchObject({ project_id: 'p2', area_id: null })
  })
  it('a task written both ways (before 0050) ends up in the project only', () => {
    setProject(task({ project_id: 'p1', area_id: 'a1' }), 'p2', null)
    expect(last()).toMatchObject({ project_id: 'p2', area_id: null })
  })
  it('"No project" keeps an area task in its area', () => {
    setProject(task({ area_id: 'a1' }), null, null)
    expect(last()).toMatchObject({ project_id: null, area_id: 'a1' })
  })
  it('a milestone stays behind with its project; re-filing in place keeps it', () => {
    setProject(task({ project_id: 'p1', milestone_id: 'm1' }), 'p2', null)
    expect(last().milestone_id).toBeNull()
    setProject(task({ project_id: 'p1', milestone_id: 'm1' }), 'p1', null)
    expect(last().milestone_id).toBe('m1')
  })
})
