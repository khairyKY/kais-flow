import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// Every single-field setter writes the row the cache has NOW, never the object it was handed.
// QuickCreate (calendar) created a task and then called five setters with that same `task`; each
// spread the stale copy, and the outbox keeps only the newest write per row — so area + repeat +
// labels came out as labels only. The mocked writeRow below applies each write to the cache and
// keeps the outbox's last-write-per-row rule, like lib/outbox does.
let cache: Task[] = []
const outbox = new Map<string, Record<string, unknown>>()
const events: { type: string; id: string; payload: unknown }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => cache } }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Task) => {
    if (table !== 'tasks') return
    const i = cache.findIndex((t) => t.id === row.id)
    cache = i === -1 ? [...cache, row] : cache.map((t, j) => (j === i ? row : t))
    outbox.set(row.id, row as unknown as Record<string, unknown>)
  },
}))
vi.mock('../../lib/activity', () => ({ logActivity: (type: string, _e: string, id: string, payload: unknown) => events.push({ type, id, payload }) }))
vi.mock('../../lib/undo', () => ({ toastUndo: vi.fn(), toastAction: vi.fn() }))
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn(), replanTaskBlocks: () => () => {} }))
const api = await import('./api')

beforeEach(() => {
  cache = []
  outbox.clear()
  events.length = 0
})

describe('setters write the current row (QuickCreate regression)', () => {
  it('create, then repeat, labels, priority, duration, someday, title — all with the stale task — keeps every field', () => {
    const task = api.createTask({ title: 'Pay rent', areaId: 'area-home', labels: ['money'] })
    api.setRecurrence(task, 'FREQ=MONTHLY')
    api.setLabels(task, ['money', 'home'])
    api.setPriority(task, 2)
    api.setDuration(task, 15)
    api.setSomeday(task, true)
    api.renameTask(task, 'Pay the rent')
    const queued = outbox.get(task.id)!
    expect(queued).toMatchObject({
      title: 'Pay the rent',
      area_id: 'area-home',
      recurrence_rule: 'FREQ=MONTHLY',
      labels: ['money', 'home'],
      priority: 2,
      duration_min: 15,
      someday: true,
    })
    expect(cache).toHaveLength(1)
  })

  it('a re-date and a move after a stale copy keep the earlier edits', () => {
    const task = api.createTask({ title: 'Call Omar' })
    api.setLabels(task, ['calls'])
    api.rescheduleDue(task, '2026-10-13T06:00:00.000Z')
    api.moveTasksWithUndo([task], { kind: 'area', id: 'a1', domainId: 'd1', name: 'Work' })
    expect(outbox.get(task.id)).toMatchObject({ labels: ['calls'], due_at: '2026-10-13T06:00:00.000Z', area_id: 'a1', domain_id: 'd1' })
  })

  it('field edits log task.updated (the slipping view reads task activity)', () => {
    const task = api.createTask({ title: 'x' })
    api.setLabels(task, ['a'])
    api.setPriority(task, 1)
    api.setDuration(task, 30)
    api.renameTask(task, 'y')
    api.setNotes(task, 'note')
    expect(events.filter((e) => e.type === 'task.updated').map((e) => (e.payload as { field: string }).field)).toEqual(['labels', 'priority', 'duration', 'title', 'notes'])
  })

  it('carrying tasks to a domain logs each as moved', () => {
    cache = [{ id: 't1', title: 'a', project_id: 'p1', area_id: null, domain_id: 'd1' } as Task]
    const undo = api.carryTasksToDomain('project_id', 'p1', 'd2')
    expect(events.at(-1)).toMatchObject({ type: 'task.moved', id: 't1', payload: { domain_id: 'd2' } })
    undo()
    expect(outbox.get('t1')).toMatchObject({ domain_id: 'd1' })
    expect(events.at(-1)).toMatchObject({ type: 'task.moved', payload: { domain_id: 'd1' } })
  })
})
