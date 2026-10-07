import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// api.ts's completion path, end to end through its real collaborators' seams: every write it
// sends to the outbox, every activity row, and the toast it puts up.
const writes: { table: string; row: Record<string, unknown>; op: string }[] = []
const activity: { type: string; id: string }[] = []
let cache: Task[] = []

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({
  queryClient: { getQueryData: () => cache },
}))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>, op = 'upsert') => {
    writes.push({ table, row, op })
    if (table !== 'tasks') return
    // Mirror writeRow's optimistic cache update, so later reads see earlier writes.
    cache = op === 'delete' ? cache.filter((t) => t.id !== row.id) : [...cache.filter((t) => t.id !== row.id), row as unknown as Task]
  },
}))
vi.mock('../../lib/activity', () => ({
  logActivity: (type: string, _entity: string, id: string) => activity.push({ type, id }),
}))
// rescheduleDue's blocks follow it (calendar/replan) — no calendar here, so nothing to move.
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn(), replanTaskBlocks: () => () => {} }))

const { completeTask, completeTaskWithUndo, uncompleteTask, skipNextOccurrence, reopenTaskWithUndo, toggleTaskWithUndo, deleteTasksWithUndo, moveToTomorrowWithUndo } = await import('./api')
const { scheduleTomorrow } = await import('../../lib/dateShortcuts')
const { useToastStore } = await import('../../lib/toastStore')

function task(over: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(), project_id: null, domain_id: null, area_id: null, title: 'Water the plants', notes: null,
    status: 'todo', due_at: '2026-09-26T06:00:00.000Z', scheduled_start: null, scheduled_end: null, top3: true,
    snoozed_until: null, recurrence_rule: 'FREQ=WEEKLY;BYDAY=SA,TU', labels: [], priority: null, duration_min: null,
    someday: false, reminder_at: null, reminder_sent: false, completed_at: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', ...over,
  }
}
const lastToast = () => useToastStore.getState().toasts.at(-1)!
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  writes.length = 0
  activity.length = 0
  cache = []
})

describe('completeTaskWithUndo — punch 6 on a single check', () => {
  it('toasts "Done" with an Undo', () => {
    const t = task({ recurrence_rule: null })
    cache = [t]
    completeTaskWithUndo(t)
    expect(lastToast().message).toBe('Done')
    expect(lastToast().onUndo).toBeTypeOf('function')
  })

  it('Undo on a one-off task restores status, completed_at and top3 exactly', async () => {
    const t = task({ recurrence_rule: null, top3: true })
    cache = [t]
    completeTaskWithUndo(t)
    expect(cache[0]).toMatchObject({ status: 'done', top3: false })
    lastToast().onUndo!()
    await flush()
    expect(cache).toEqual([t])
    expect(activity.map((a) => a.type)).toEqual(['task.completed', 'task.reopened'])
  })

  it('Undo on a recurring task removes the occurrence the check spawned — nothing left behind', async () => {
    const t = task()
    cache = [t]
    completeTaskWithUndo(t)
    const spawned = writes.find((w) => w.table === 'tasks' && w.row.id !== t.id && w.op === 'upsert')!.row
    expect(spawned).toMatchObject({ status: 'todo', due_at: '2026-09-29T06:00:00.000Z' })
    lastToast().onUndo!()
    await flush()
    expect(writes.at(-1)).toEqual({ table: 'tasks', row: { id: spawned.id }, op: 'delete' })
    expect(cache).toEqual([t])
  })

  it('runs the caller\'s afterUndo (TasksPage puts the animated row back)', async () => {
    const t = task({ recurrence_rule: null })
    cache = [t]
    let putBack = false
    completeTaskWithUndo(t, () => { putBack = true })
    lastToast().onUndo!()
    await flush()
    expect(putBack).toBe(true)
  })
})

describe('uncompleteTask ("Reopen")', () => {
  it('right after a check this session, also takes the spawned occurrence back', () => {
    const t = task()
    cache = [t]
    completeTask(t)
    expect(cache).toHaveLength(2)
    uncompleteTask(cache.find((x) => x.id === t.id)!)
    expect(cache).toEqual([t])
  })

  it('a task this session never completed just reopens (no delete sent)', () => {
    const t = task({ status: 'done', completed_at: '2026-09-20T06:00:00.000Z' })
    cache = [t]
    uncompleteTask(t)
    expect(writes).toEqual([{ table: 'tasks', row: { ...t, status: 'todo', completed_at: null }, op: 'upsert' }])
  })

  it('check → Reopen → check again leaves ONE next occurrence', () => {
    const t = task()
    cache = [t]
    completeTask(t)
    uncompleteTask(cache.find((x) => x.id === t.id)!)
    completeTask(cache.find((x) => x.id === t.id)!)
    expect(cache.filter((x) => x.status === 'todo' && x.due_at === '2026-09-29T06:00:00.000Z')).toHaveLength(1)
  })
})

describe('reopenTaskWithUndo — a second click on a just-checked row (Polish F2a)', () => {
  const row = (id: string) => cache.find((x) => x.id === id)!

  it('check → second click reopens: the task is open again and the spawned copy is gone', () => {
    const t = task()
    cache = [t]
    completeTaskWithUndo(t)
    expect(cache).toHaveLength(2)
    reopenTaskWithUndo(t) // the row may still hand over its pre-check props
    expect(cache).toEqual([t])
    expect(lastToast().message).toBe('Reopened')
    expect(activity.map((a) => a.type)).toEqual(['task.completed', 'task.created', 'task.reopened'])
  })

  it('the "Reopened" Undo puts the check back exactly — same completed_at, same next occurrence', async () => {
    const t = task()
    cache = [t]
    completeTaskWithUndo(t)
    const afterCheck = [...cache].sort((a, b) => a.id.localeCompare(b.id))
    reopenTaskWithUndo(row(t.id))
    lastToast().onUndo!()
    await flush()
    expect([...cache].sort((a, b) => a.id.localeCompare(b.id))).toEqual(afterCheck)
  })

  it('after that Undo, reopening again still takes the next occurrence back (no stray copy)', async () => {
    const t = task()
    cache = [t]
    completeTaskWithUndo(t)
    reopenTaskWithUndo(row(t.id))
    lastToast().onUndo!()
    await flush()
    reopenTaskWithUndo(row(t.id))
    expect(cache).toEqual([t])
  })

  it('a task done in an earlier session reopens, and Undo puts its completed_at back', async () => {
    const t = task({ status: 'done', completed_at: '2026-09-20T06:00:00.000Z', recurrence_rule: null, top3: false })
    cache = [t]
    reopenTaskWithUndo(t)
    expect(cache).toEqual([{ ...t, status: 'todo', completed_at: null }])
    lastToast().onUndo!()
    await flush()
    expect(cache).toEqual([t])
    expect(writes.filter((w) => w.op === 'delete')).toEqual([])
  })

  it('reads the task from the cache, so a row still drawn open (Tasks\' grace window) reopens the real one', () => {
    const t = task({ recurrence_rule: null })
    cache = [t]
    completeTaskWithUndo(t)
    const drawnOpen = { ...row(t.id), status: 'todo' as const } // TasksPage's grace override
    reopenTaskWithUndo(drawnOpen)
    expect(cache).toEqual([t])
  })

  it('runs the caller\'s afterUndo', async () => {
    const t = task({ status: 'done', completed_at: '2026-09-20T06:00:00.000Z' })
    cache = [t]
    let ran = false
    reopenTaskWithUndo(t, () => { ran = true })
    lastToast().onUndo!()
    await flush()
    expect(ran).toBe(true)
  })
})

describe('toggleTaskWithUndo — a box bound to the status (Up next, task editor)', () => {
  it('an open task completes with "Done"; a done one reopens with "Reopened"', () => {
    const t = task({ recurrence_rule: null })
    cache = [t]
    toggleTaskWithUndo(t)
    expect(lastToast().message).toBe('Done')
    expect(cache[0].status).toBe('done')
    toggleTaskWithUndo(cache[0])
    expect(lastToast().message).toBe('Reopened')
    expect(cache).toEqual([t])
  })
})

describe('a repeating task keeps reminding (Polish F2a)', () => {
  // Saturday 09:00 Cairo, reminder 15 min before — the notify sweep already sent it.
  const reminded = () => task({ reminder_at: '2026-09-26T05:45:00.000Z', reminder_sent: true })

  it('completing writes the next occurrence with its own reminder, not yet sent', () => {
    const t = reminded()
    cache = [t]
    completeTask(t)
    const spawned = writes.find((w) => w.table === 'tasks' && w.row.id !== t.id)!.row
    expect(spawned).toMatchObject({ due_at: '2026-09-29T06:00:00.000Z', reminder_at: '2026-09-29T05:45:00.000Z', reminder_sent: false })
  })

  it('skipping an occurrence moves the reminder with it', () => {
    const t = reminded()
    cache = [t]
    skipNextOccurrence(t)
    expect(writes).toHaveLength(1)
    expect(writes[0].row).toMatchObject({ id: t.id, due_at: '2026-09-29T06:00:00.000Z', reminder_at: '2026-09-29T05:45:00.000Z', reminder_sent: false })
  })

  it('skipping a task with no reminder leaves it without one', () => {
    const t = task({ reminder_at: null })
    cache = [t]
    skipNextOccurrence(t)
    expect(writes[0].row).toMatchObject({ due_at: '2026-09-29T06:00:00.000Z', reminder_at: null, reminder_sent: false })
  })
})

describe("the row grammar's delete and Tomorrow (Flow Audit §4)", () => {
  // deleteTask looks the row up to animate its exit; with no row on screen it writes at once.
  beforeEach(() => void vi.stubGlobal('document', { getElementById: () => null }))

  it('delete goes straight to Trash — no confirm — and says so with an Undo that restores it', async () => {
    const t = task({ recurrence_rule: null })
    cache = [t]
    deleteTasksWithUndo([t])
    expect(cache[0].deleted_at).toBeTruthy()
    expect(lastToast().message).toBe('Moved to Trash')
    lastToast().onUndo!()
    await flush()
    expect(cache).toEqual([{ ...t, deleted_at: null }])
    expect(activity.map((a) => a.type)).toEqual(['task.deleted', 'task.restored'])
  })

  it('a bulk delete is one toast, and its Undo brings every row back', async () => {
    const a = task({ recurrence_rule: null })
    const b = task({ recurrence_rule: null })
    cache = [a, b]
    deleteTasksWithUndo([a, b])
    expect(lastToast().message).toBe('2 tasks moved to Trash')
    lastToast().onUndo!()
    await flush()
    expect(cache.every((t) => t.deleted_at === null)).toBe(true)
  })

  it('Tomorrow is tomorrow 09:00, and Undo puts the old date and someday flag back', async () => {
    const t = task({ recurrence_rule: null, due_at: null, someday: true })
    cache = [t]
    moveToTomorrowWithUndo([t])
    expect(cache[0]).toMatchObject({ due_at: scheduleTomorrow(), someday: false })
    expect(lastToast().message).toBe('Moved to tomorrow')
    lastToast().onUndo!()
    await flush()
    expect(cache).toEqual([t])
  })
})
