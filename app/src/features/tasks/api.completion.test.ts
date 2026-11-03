import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// api.ts's completion path, end to end through its real collaborators' seams: every write it
// sends to the outbox, every activity row, and the toast it puts up.
const writes: { table: string; row: Record<string, unknown>; op: string }[] = []
const activity: { type: string; id: string }[] = []
let cache: Task[] = []

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({
  queryClient: { getQueryData: () => cache, getQueriesData: () => [] },
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
const { useSubtaskAsk, answerSubtasks } = await import('./subtaskQuestion')

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
  // Ticked on the day it's due (Sat 26 Sep, 09:45 Cairo): a repeat rolls from the later of its due
  // date and today (recurrence nextDue), so the clock is pinned. Timers stay real (flush).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T06:45:00.000Z'))
})
afterEach(() => void vi.useRealTimers())

describe('completing the goal of the day (P1 2026-10-31)', () => {
  it('an unranked goal stays the goal once done — its place goes onto the rows, no star log needed', async () => {
    const { dayTop3 } = await import('../today/top3Order')
    const goal = task({ title: 'Finish the study guide', recurrence_rule: null })
    const second = task({ title: 'Gym', recurrence_rule: null })
    cache = [goal, second]
    expect(dayTop3(cache, null, []).map((t) => t.id)).toEqual([goal.id, second.id])
    completeTask(goal)
    const after = dayTop3(cache, null, [])
    expect(after.map((t) => t.id)).toEqual([goal.id, second.id])
    expect(after[0]).toMatchObject({ status: 'done', top3: false, top3_rank: 1 })
    expect(after[1]).toMatchObject({ status: 'todo', top3: true, top3_rank: 2 })
  })

  it("Undo gives the Top 3 back exactly — every rank the tick wrote; a repeat's next round isn't a pick", async () => {
    const { dayTop3 } = await import('../today/top3Order')
    const goal = task({ title: 'Read 2 pages', top3_rank: null })
    const second = task({ title: 'Gym', recurrence_rule: null, top3_rank: null })
    cache = [goal, second]
    const undo = completeTask(goal)
    expect(undo.spawned).toMatchObject({ top3: false, top3_rank: null })
    expect(cache.find((t) => t.id === goal.id)).toMatchObject({ status: 'done', top3_rank: 1 })
    const { undoCompletion } = await import('./api')
    undoCompletion(undo)
    const byId = (x: Task) => cache.find((t) => t.id === x.id)
    expect([byId(goal), byId(second)]).toEqual([goal, second])
    expect(dayTop3(cache, null, [])[0].id).toBe(goal.id) // still the goal
  })

  it('a task that is not a pick writes no ranks', () => {
    const t = task({ top3: false, recurrence_rule: null })
    cache = [t]
    completeTask(t)
    expect(writes.filter((w) => 'top3_rank' in w.row && w.row.top3_rank != null)).toEqual([])
  })
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

describe('subtasks (Kai 2026-10-16, 4 C)', () => {
  beforeEach(() => void vi.stubGlobal('document', { getElementById: () => null }))
  const family = (parentOver: Partial<Task> = {}) => {
    const parent = task({ recurrence_rule: null, top3: false, ...parentOver })
    const a = task({ title: 'Read the notes', recurrence_rule: null, top3: false, parent_task_id: parent.id, status: 'done', completed_at: '2026-09-25T10:00:00.000Z', created_at: '2026-09-01T00:00:01.000Z' })
    const b = task({ title: 'Questions 1–5', recurrence_rule: null, top3: false, parent_task_id: parent.id, created_at: '2026-09-01T00:00:02.000Z' })
    const c = task({ title: 'Questions 6–10', recurrence_rule: null, top3: false, parent_task_id: parent.id, created_at: '2026-09-01T00:00:03.000Z' })
    cache = [parent, a, b, c]
    return { parent, a, b, c }
  }
  const row = (id: string) => cache.find((t) => t.id === id)!

  it('a parent with open subtasks is done at once and asks; "Tick them too" ticks them, one Undo takes it all back', async () => {
    const { parent, a, b, c } = family()
    const before = useToastStore.getState().toasts.length
    completeTaskWithUndo(parent)
    expect(row(parent.id).status).toBe('done')
    expect(useSubtaskAsk.getState().ask?.open.map((t) => t.id)).toEqual([b.id, c.id])
    expect(useToastStore.getState().toasts.length).toBe(before) // the toast waits for the answer
    answerSubtasks(true)
    expect(useSubtaskAsk.getState().ask).toBeNull()
    expect([row(b.id).status, row(c.id).status]).toEqual(['done', 'done'])
    expect(lastToast().message).toBe('Done, with its 2 open subtasks')
    lastToast().onUndo!()
    await flush()
    expect([row(parent.id), row(a.id), row(b.id), row(c.id)]).toEqual([parent, a, b, c])
  })

  it('"Leave them open" (and Esc, which answers the same) leaves them, and says plain Done', () => {
    const { parent, b, c } = family()
    completeTaskWithUndo(parent)
    answerSubtasks(false)
    answerSubtasks(true) // answered once only
    expect([row(b.id).status, row(c.id).status]).toEqual(['todo', 'todo'])
    expect(lastToast().message).toBe('Done')
  })

  it('with no open subtasks it just completes — nothing asked', () => {
    const parent = task({ recurrence_rule: null })
    cache = [parent, task({ recurrence_rule: null, parent_task_id: parent.id, status: 'done', completed_at: '2026-09-25T10:00:00.000Z' })]
    completeTaskWithUndo(parent)
    expect(useSubtaskAsk.getState().ask).toBeNull()
    expect(lastToast().message).toBe('Done')
  })

  it('a repeating parent carries its subtasks to the next copy, open again; nothing is asked; Undo brings them home', async () => {
    const { parent, a, b, c } = family({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=SA,TU' })
    const undo = completeTaskWithUndo(parent)
    expect(useSubtaskAsk.getState().ask).toBeNull()
    const next = undo.spawned!
    expect([a, b, c].map((s) => row(s.id))).toEqual([a, b, c].map(() => expect.objectContaining({ parent_task_id: next.id, status: 'todo', completed_at: null })))
    expect(lastToast().message).toBe('Done')
    lastToast().onUndo!()
    await flush()
    expect([row(a.id), row(b.id), row(c.id)]).toEqual([a, b, c])
    expect(cache.some((t) => t.id === next.id)).toBe(false)
  })

  it('Reopen right after takes the carry back; its Undo carries them again', async () => {
    const { parent, a } = family({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=SA,TU' })
    const undo = completeTaskWithUndo(parent)
    reopenTaskWithUndo(row(parent.id))
    expect(row(a.id)).toEqual(a)
    lastToast().onUndo!()
    await flush()
    expect(row(a.id)).toMatchObject({ parent_task_id: undo.spawned!.id, status: 'todo' })
  })

  it('deleting a parent sends its subtasks to Trash with it — one toast, one Undo — and Trash restores them together', async () => {
    const { parent, a, b, c } = family()
    const other = task({ recurrence_rule: null, parent_task_id: parent.id, deleted_at: '2026-09-20T00:00:00.000Z' }) // binned on its own, earlier
    cache.push(other)
    deleteTasksWithUndo([parent])
    expect(new Set([parent, a, b, c].map((t) => row(t.id).deleted_at)).size).toBe(1)
    expect(lastToast().message).toBe('Moved to Trash, with its 3 subtasks')
    lastToast().onUndo!()
    await flush()
    expect([parent, a, b, c].every((t) => row(t.id).deleted_at === null)).toBe(true)
    expect(row(other.id).deleted_at).toBe('2026-09-20T00:00:00.000Z')
  })
})
