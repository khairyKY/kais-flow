import { describe, expect, it } from 'vitest'
import type { Task } from '../../lib/types'
import { nestOut, subCount, subtaskWhen, subtasksOf, timedToday } from './subtasks'

const t = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(), project_id: null, domain_id: null, area_id: null, title: 'x', notes: null, status: 'todo', due_at: null,
  scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null,
  duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null,
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...over,
})
// Fri 16 Oct 2026, 13:10 on the user's clock (Cairo, UTC+3).
const NOW = new Date('2026-10-16T10:10:00.000Z')

describe('subtasks', () => {
  it('lists a parent\'s live subtasks in the order they were added', () => {
    const p = t({})
    const b = t({ parent_task_id: p.id, created_at: '2026-10-02T00:00:00.000Z' })
    const a = t({ parent_task_id: p.id, created_at: '2026-10-01T00:00:00.000Z' })
    const gone = t({ parent_task_id: p.id, deleted_at: '2026-10-03T00:00:00.000Z' })
    expect(subtasksOf([p, b, a, gone], p.id)).toEqual([a, b])
    expect(subCount([a, { ...b, status: 'done' }])).toEqual({ done: 1, total: 2 })
  })

  it('takes a subtask out of a list when its parent is drawn there (A); else it stays, "↳ parent"', () => {
    const p = t({})
    const nested = t({ parent_task_id: p.id })
    const alone = t({ parent_task_id: 'elsewhere' })
    expect(nestOut([p, nested, alone], new Set([p.id]))).toEqual([p, alone])
  })

  it('says when a subtask is (C): its time today, its day and time later, a date alone, nothing unplanned', () => {
    expect(subtaskWhen(t({ scheduled_start: '2026-10-16T13:00:00.000Z' }), NOW)).toBe('16:00')
    expect(subtaskWhen(t({ scheduled_start: '2026-10-17T06:00:00.000Z' }), NOW)).toBe('Tomorrow 09:00')
    expect(subtaskWhen(t({ scheduled_start: '2026-10-20T15:30:00.000Z' }), NOW)).toBe('Tue 18:30')
    expect(subtaskWhen(t({ due_at: '2026-10-17T06:00:00.000Z' }), NOW)).toBe('Tomorrow')
    expect(subtaskWhen(t({ due_at: '2026-10-16T06:00:00.000Z' }), NOW)).toBeNull()
    expect(subtaskWhen(t({}), NOW)).toBeNull()
    expect(subtaskWhen(t({ status: 'done', scheduled_start: '2026-10-16T13:00:00.000Z' }), NOW)).toBeNull()
  })

  it('names the first open subtask on today\'s calendar for the question', () => {
    const later = t({ title: 'Later', scheduled_start: '2026-10-18T13:00:00.000Z' })
    const q = t({ title: 'Questions 1–5', scheduled_start: '2026-10-16T13:00:00.000Z' })
    expect(timedToday([later, q], NOW)).toEqual({ title: 'Questions 1–5', at: '16:00' })
    expect(timedToday([later], NOW)).toBeNull()
  })
})
