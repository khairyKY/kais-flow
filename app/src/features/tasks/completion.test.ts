import { describe, expect, it } from 'vitest'
import { planCompletion, planUndo } from './completion'
import type { Task } from '../../lib/types'

// Sat 26 Sep 2026 09:00 Cairo (UTC+3) — a "Water the plants" that repeats Saturdays and Tuesdays.
const DUE = '2026-09-26T06:00:00.000Z'
const NEXT_DUE = '2026-09-29T06:00:00.000Z' // Tue 29 Sep, same wall-clock time
const NOW = '2026-09-26T06:45:00.000Z'
const LATER = '2026-09-26T06:46:00.000Z'

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'orig',
    project_id: null,
    domain_id: null,
    area_id: null,
    title: 'Water the plants',
    notes: null,
    status: 'todo',
    due_at: DUE,
    scheduled_start: null,
    scheduled_end: null,
    top3: true,
    snoozed_until: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=SA,TU',
    labels: [],
    priority: null,
    duration_min: null,
    someday: false,
    reminder_at: null,
    reminder_sent: false,
    completed_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}
let n = 0
const newId = () => `spawn-${++n}`

/** A tiny stand-in for the tasks table: applies the same writes api.ts sends through the outbox. */
function table(rows: Task[]) {
  const map = new Map(rows.map((r) => [r.id, r]))
  return {
    rows: () => [...map.values()],
    upsert: (r: Task) => map.set(r.id, r),
    remove: (id: string) => map.delete(id),
  }
}

describe('planCompletion', () => {
  it('a one-off task is marked done, leaves the Top 3, and spawns nothing', () => {
    const { done, next } = planCompletion(task({ recurrence_rule: null }), [], NOW, newId)
    expect(done).toMatchObject({ status: 'done', completed_at: NOW, top3: false })
    expect(next).toBeNull()
  })

  it('a recurring task spawns exactly its next occurrence as a fresh open task', () => {
    const { next } = planCompletion(task(), [], NOW, () => 'fresh')
    expect(next).toMatchObject({ id: 'fresh', title: 'Water the plants', status: 'todo', completed_at: null, due_at: NEXT_DUE, top3: false, created_at: NOW, updated_at: NOW })
  })

  it('never copies an imported row\'s external_ref (0027 unique key) onto the new occurrence', () => {
    const imported = { ...task(), external_ref: { source: 'akiflow', id: 'a1' } } as Task
    const { next } = planCompletion(imported, [], NOW, newId)
    expect(next).not.toBeNull()
    expect(next).not.toHaveProperty('external_ref')
  })

  it('does not spawn a second copy when that occurrence is already open (reopen → complete again)', () => {
    const openCopy = task({ id: 'copy', top3: false, due_at: '2026-09-29T06:00:00+00:00' }) // server's format
    expect(planCompletion(task(), [openCopy], NOW, newId).next).toBeNull()
  })

  it('a done or trashed copy of that occurrence does not block the spawn', () => {
    const doneCopy = task({ id: 'd', due_at: NEXT_DUE, status: 'done' })
    const trashed = task({ id: 't', due_at: NEXT_DUE, deleted_at: NOW })
    expect(planCompletion(task(), [doneCopy, trashed], NOW, newId).next).not.toBeNull()
  })
})

describe('planUndo', () => {
  it('puts status, completed_at and top3 back exactly, on the task as it is now', () => {
    const before = task({ top3: true })
    const current = { ...planCompletion(before, [], NOW, newId).done, notes: 'edited meanwhile' }
    const { restore } = planUndo(current, before, null, undefined)
    expect(restore).toMatchObject({ status: 'todo', completed_at: null, top3: true, notes: 'edited meanwhile' })
  })

  it('removes the spawned occurrence while it is untouched (or not in the list yet)', () => {
    const before = task()
    const { next } = planCompletion(before, [], NOW, newId)
    expect(planUndo(before, before, next, next!).removeId).toBe(next!.id)
    expect(planUndo(before, before, next, { ...next!, updated_at: NOW.replace('.000Z', '+00:00') }).removeId).toBe(next!.id)
    expect(planUndo(before, before, next, undefined).removeId).toBe(next!.id)
  })

  it('keeps a spawned occurrence the user has since edited or ticked', () => {
    const before = task()
    const { next } = planCompletion(before, [], NOW, newId)
    expect(planUndo(before, before, next, { ...next!, updated_at: LATER }).removeId).toBeNull()
    expect(planUndo(before, before, next, { ...next!, status: 'done' }).removeId).toBeNull()
  })
})

describe('complete → undo on the table', () => {
  function complete(db: ReturnType<typeof table>, id: string, now = NOW) {
    const t = db.rows().find((r) => r.id === id)!
    const plan = planCompletion(t, db.rows(), now, newId)
    db.upsert(plan.done)
    if (plan.next) db.upsert(plan.next)
    return { before: t, spawned: plan.next }
  }
  function undo(db: ReturnType<typeof table>, u: { before: Task; spawned: Task | null }) {
    const rows = db.rows()
    const { restore, removeId } = planUndo(rows.find((r) => r.id === u.before.id)!, u.before, u.spawned, rows.find((r) => r.id === u.spawned?.id))
    db.upsert(restore)
    if (removeId) db.remove(removeId)
  }
  const openOccurrences = (db: ReturnType<typeof table>) => db.rows().filter((r) => r.status === 'todo' && r.due_at === NEXT_DUE)

  it('leaves the table exactly as it was — no extra occurrence behind', () => {
    const original = task()
    const db = table([original])
    undo(db, complete(db, 'orig'))
    expect(db.rows()).toEqual([original])
  })

  it('check → undo → check again ends with ONE next occurrence', () => {
    const db = table([task()])
    undo(db, complete(db, 'orig'))
    complete(db, 'orig')
    expect(openOccurrences(db)).toHaveLength(1)
  })

  it('check → plain reopen (no undo) → check again still ends with ONE next occurrence', () => {
    const db = table([task()])
    complete(db, 'orig')
    const orig = db.rows().find((r) => r.id === 'orig')!
    db.upsert({ ...orig, status: 'todo', completed_at: null }) // e.g. Reopen after a reload
    complete(db, 'orig', LATER)
    expect(openOccurrences(db)).toHaveLength(1)
  })
})
