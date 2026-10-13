import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// ⌘/Ctrl+↑/↓ (p7e A22) through the real toast queue: the writes land on tasks.sort_order, and a burst
// of presses on the same rows is ONE toast whose Undo (or ⌘Z) puts every row back. An in-memory cache
// stands in for TanStack + the outbox, as in api.plan.test.ts.
const cache: { tasks: Task[] } = { tasks: [] }
function writeRow(_table: 'tasks', row: Task) {
  const i = cache.tasks.findIndex((r) => r.id === row.id)
  if (i >= 0) cache.tasks[i] = row
  else cache.tasks.push(row)
}
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: ([k]: ['tasks']) => cache[k], getQueriesData: () => [] } }))
vi.mock('../../lib/outbox', () => ({ writeRow }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/sounds', () => ({ playSound: vi.fn(), playCompletion: vi.fn() }))
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn(), replanTaskBlocks: () => () => {} }))
const { moveInListWithUndo } = await import('./api')
const { sortByOrder } = await import('./manualOrder')
const { useToastStore } = await import('../../lib/toastStore')
const { undoLatest } = await import('../../lib/undo')

const task = (id: string, due: string): Task => ({ id, title: id, status: 'todo', due_at: due, scheduled_start: null, sort_order: null }) as Task
const drawn = () => sortByOrder(cache.tasks).map((t) => t.id)

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  cache.tasks = [task('a', '2026-10-14T06:00:00Z'), task('b', '2026-10-14T07:00:00Z'), task('c', '2026-10-14T08:00:00Z')]
})

describe('moveInListWithUndo', () => {
  it('moves the row and writes only its sort_order; a burst is one toast, one Undo back to the start', async () => {
    expect(moveInListWithUndo([sortByOrder(cache.tasks)], [cache.tasks[2]], -1)).toBe(true)
    expect(drawn()).toEqual(['a', 'c', 'b'])
    expect(cache.tasks.filter((t) => t.sort_order != null).map((t) => t.id)).toEqual(['c'])
    expect(moveInListWithUndo([sortByOrder(cache.tasks)], [cache.tasks[2]], -1)).toBe(true)
    expect(drawn()).toEqual(['c', 'a', 'b'])
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Moved up'])
    expect(undoLatest()).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(drawn()).toEqual(['a', 'b', 'c'])
    expect(cache.tasks.every((t) => t.sort_order == null)).toBe(true)
  })
  it('at the edge nothing moves and no toast shows', () => {
    expect(moveInListWithUndo([sortByOrder(cache.tasks)], [cache.tasks[0]], -1)).toBe(false)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
  it('a selection moves within each of its groups', () => {
    const other = [task('x', '2026-10-15T06:00:00Z'), task('y', '2026-10-15T07:00:00Z')]
    cache.tasks.push(...other)
    moveInListWithUndo([cache.tasks.slice(0, 3), other], [cache.tasks[1], other[1]], -1)
    expect(drawn()).toEqual(['b', 'a', 'c', 'y', 'x'])
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['2 tasks moved'])
  })
})
