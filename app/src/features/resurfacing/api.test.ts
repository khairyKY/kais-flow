import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxItem, ResurfacedLogRow, Task } from '../../lib/types'

// The card's writes: each action marks the pick, logs `resurfaced.*`, and puts up ONE toast whose
// Undo takes the thing's own writes back and re-pends the pick. The task / inbox helpers are
// stand-ins that record calls (their own rules are tested beside them).
const writes: { table: string; row: Record<string, unknown> }[] = []
const events: string[] = []
const toasts: { message: string; undo: () => void }[] = []
const calls: string[] = []
const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() })
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/outbox', () => ({ writeRow: (table: string, row: Record<string, unknown>) => writes.push({ table, row }) }))
vi.mock('../../lib/activity', () => ({ logActivity: (type: string) => events.push(type) }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))
vi.mock('../tasks/api', () => ({
  completeTask: (t: Task) => (calls.push(`complete ${t.id}`), { before: t, spawned: null }),
  undoCompletion: () => calls.push('undoCompletion'),
  deleteTask: (t: Task, after?: () => void) => (calls.push(`trash ${t.id}`), after?.()),
  restoreTask: (t: Task) => calls.push(`restore ${t.id}`),
  rescheduleDue: (t: Task, iso: string | null) => (calls.push(`reschedule ${t.id} ${iso}`), () => calls.push(`unreschedule ${t.id}`)),
  setSomeday: (t: Task, on: boolean) => calls.push(`someday ${t.id} ${on}`),
  useTasks: vi.fn(),
}))
vi.mock('../inbox/api', () => ({
  fileToTask: (i: InboxItem) => (calls.push(`file ${i.id}`), { id: 'new-task' }),
  dismissInboxItem: (i: InboxItem, silent: boolean) => calls.push(`dismiss ${i.id} ${silent}`),
  useAllInboxItems: vi.fn(),
}))
const api = await import('./api')

const row = (over: Partial<ResurfacedLogRow> = {}): ResurfacedLogRow => ({
  id: 'r1', entity_type: 'task', entity_id: 't1', shown_on: '2026-10-07', action: 'pending', created_at: '2026-10-07T03:30:00Z', ...over,
})
const task = { id: 't1', title: 'Fix the gate', someday: false, status: 'todo' } as Task
const note = (status: InboxItem['status']) => ({ id: 'n1', raw_text: 'idea', status }) as InboxItem
const marks = () => writes.filter((w) => w.table === 'resurfaced_log').map((w) => w.row.action)

beforeEach(() => {
  writes.length = events.length = toasts.length = calls.length = 0
  localStorage.clear()
})

describe('settling a pick', () => {
  it('Done completes the task, marks the pick, one Undo reopens it and re-pends the pick', () => {
    api.doneResurfaced(row(), task)
    expect(calls).toEqual(['complete t1'])
    expect(marks()).toEqual(['converted']) // pre-0059 server: 'done' would be rejected
    expect(events).toEqual(['resurfaced.done'])
    expect(toasts.map((t) => t.message)).toEqual(['Done'])
    toasts[0].undo()
    expect(calls).toContain('undoCompletion')
    expect(marks()).toEqual(['converted', 'pending'])
  })
  it('Done marks "done" once the server has 0059', () => {
    api.doneResurfaced(row({ snoozed_until: null }), task)
    expect(marks()).toEqual(['done'])
  })
  it('Let it go: a task goes to Trash, Undo restores it', () => {
    api.letGoResurfaced(row(), { task })
    expect(calls).toEqual(['trash t1'])
    expect(marks()).toEqual(['dismissed'])
    expect(toasts[0].message).toBe('Moved to Trash')
    toasts[0].undo()
    expect(calls).toContain('restore t1')
    expect(marks()).toEqual(['dismissed', 'pending'])
  })
  it('Let it go: a waiting note is dismissed (silently — the card owns the toast), Undo puts it back', () => {
    api.letGoResurfaced(row({ entity_type: 'inbox_item', entity_id: 'n1' }), { item: note('pending') })
    expect(calls).toEqual(['dismiss n1 true'])
    toasts[0].undo()
    expect(writes.find((w) => w.table === 'inbox_items')?.row).toMatchObject({ id: 'n1', status: 'pending' })
  })
  it('Let it go: a filed note only stops coming back', () => {
    api.letGoResurfaced(row({ entity_type: 'inbox_item', entity_id: 'n1' }), { item: note('filed') })
    expect(calls).toEqual([])
    expect(marks()).toEqual(['dismissed'])
  })
  it('Make it a task files the note; Undo trashes the task and puts the note back', () => {
    api.convertResurfaced(row({ entity_type: 'inbox_item', entity_id: 'n1' }), note('pending'))
    expect(calls).toEqual(['file n1'])
    expect(toasts.map((t) => t.message)).toEqual(['Made it a task'])
    toasts[0].undo()
    expect(calls).toContain('trash new-task')
    expect(marks()).toEqual(['converted', 'pending'])
  })
  it('Plan… → Tomorrow: replans, marks converted, logs planned, Undo takes the plan back', () => {
    api.planResurfaced(row(), task).tomorrow()
    expect(calls[0]).toMatch(/^reschedule t1 /)
    expect(events).toEqual(['resurfaced.planned'])
    toasts[0].undo()
    expect(calls).toContain('unreschedule t1')
    expect(marks()).toEqual(['converted', 'pending'])
  })
  it('Not now: snoozes on this device always, on the row only once 0059 is there; Undo wakes it', () => {
    api.notNowResurfaced(row(), 5)
    expect(writes[0].row).not.toHaveProperty('snoozed_until')
    expect(Object.keys(JSON.parse(localStorage.getItem('kf.resurfaceSnoozes')!))).toEqual(['t1'])
    expect(toasts[0].message).toBe('Back in 5 days')
    toasts[0].undo()
    expect(JSON.parse(localStorage.getItem('kf.resurfaceSnoozes')!)).toEqual({})

    writes.length = 0
    api.notNowResurfaced(row({ snoozed_until: null }), 2)
    expect(writes[0].row).toMatchObject({ action: 'review_later' })
    expect(Date.parse(writes[0].row.snoozed_until as string) - Date.now()).toBeGreaterThan(1.9 * 86_400_000)
  })
})
