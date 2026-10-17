import { describe, expect, it } from 'vitest'
import type { Project, Task } from '../../lib/types'
import { duplicateMessage, duplicateProjectRows, duplicateRows } from './duplicate'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, project_id: null, domain_id: null, area_id: null, title: id, notes: 'n', status: 'todo', due_at: '2026-10-20T06:00:00Z',
  scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: ['x'], priority: 2,
  duration_min: 30, someday: false, reminder_at: null, reminder_sent: false, completed_at: null,
  created_at: '2026-10-01T06:00:00Z', updated_at: '2026-10-01T06:00:00Z', ...over,
})
const NOW = new Date('2026-10-17T10:00:00Z')
const ids = () => {
  let n = 0
  return () => `new-${++n}`
}

describe('duplicateRows — Duplicate (Kai 2026-10-17)', () => {
  it('an open copy: same fields, off the calendar, out of the Top 3 and its slot, the import key stays behind', () => {
    const t = task('a', { status: 'done', completed_at: '2026-10-16T09:00:00Z', top3: true, top3_rank: 1, scheduled_start: '2026-10-20T07:00:00Z', scheduled_end: '2026-10-20T07:30:00Z', slot_id: 's', slot_date: '2026-10-20', reminder_sent: true, external_ref: { source: 'akiflow', id: 'k' } })
    const [r] = duplicateRows([t], [t], NOW, ids())
    expect(r.of).toBe('a')
    expect(r.copy).toMatchObject({ id: 'new-1', title: 'a', notes: 'n', due_at: t.due_at, labels: ['x'], priority: 2, duration_min: 30, status: 'todo', completed_at: null, top3: false, top3_rank: null, scheduled_start: null, scheduled_end: null, slot_id: null, slot_date: null, reminder_sent: false, created_at: NOW.toISOString() })
    expect('external_ref' in r.copy).toBe(false)
  })

  it("a parent's subtasks come along as open subtasks of the copy, in their order; Trash's stay behind", () => {
    const p = task('p')
    const s1 = task('s1', { parent_task_id: 'p', created_at: '2026-10-02T06:00:00Z', status: 'done', completed_at: '2026-10-03T06:00:00Z' })
    const s2 = task('s2', { parent_task_id: 'p', created_at: '2026-10-03T06:00:00Z' })
    const gone = task('s3', { parent_task_id: 'p', deleted_at: '2026-10-04T06:00:00Z' })
    const rows = duplicateRows([p], [s2, p, gone, s1], NOW, ids())
    expect(rows.map((r) => [r.of, r.copy.id, r.copy.parent_task_id ?? null, r.copy.status])).toEqual([
      ['p', 'new-1', null, 'todo'],
      ['s1', 'new-2', 'new-1', 'todo'],
      ['s2', 'new-3', 'new-1', 'todo'],
    ])
    // A millisecond apart: subtasksOf (by created_at) draws them in the same order.
    expect(rows.map((r) => r.copy.created_at)).toEqual(['2026-10-17T10:00:00.000Z', '2026-10-17T10:00:00.001Z', '2026-10-17T10:00:00.002Z'])
    expect(duplicateMessage(rows)).toBe('Duplicated, with its 2 subtasks')
  })

  it('a subtask copies under the same parent; picked with its parent it rides along once', () => {
    const p = task('p')
    const s = task('s', { parent_task_id: 'p' })
    expect(duplicateRows([s], [p, s], NOW, ids()).map((r) => r.copy.parent_task_id)).toEqual(['p'])
    const both = duplicateRows([p, s], [p, s], NOW, ids())
    expect(both.map((r) => [r.of, r.copy.parent_task_id ?? null])).toEqual([['p', null], ['s', 'new-1']])
  })

  it('says how many: "3 tasks duplicated", with their subtasks', () => {
    const all = [task('a'), task('b'), task('c'), task('c1', { parent_task_id: 'c' })]
    expect(duplicateMessage(duplicateRows(all.slice(0, 3), all, NOW, ids()))).toBe('3 tasks duplicated, with their 1 subtask')
    expect(duplicateMessage(duplicateRows(all.slice(0, 2), all, NOW, ids()))).toBe('2 tasks duplicated')
    expect(duplicateMessage(duplicateRows([all[0]], all, NOW, ids()))).toBe('Duplicated')
  })
})

describe('duplicateProjectRows — Duplicate project', () => {
  const project: Project = {
    id: 'P', domain_id: 'D', name: 'Launch', type: 'standard', status: 'archived', color: '#abc', target_date: '2026-12-01',
    milestones: [{ id: 'm1', title: 'Beta', weight: 2, completed: true }],
    checklist: [
      { id: 'c1', title: 'Write copy', type: 'task-linked', completed: true, task_id: 't1' },
      { id: 'c2', title: 'Check fonts', type: 'one-shot', completed: true, task_id: null },
    ],
    completion_summary: 'shipped', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  const t1 = task('t1', { project_id: 'P', domain_id: 'D', milestone_id: 'm1', status: 'done', completed_at: '2026-09-01T00:00:00Z', top3: true, reminder_at: '2026-10-20T05:45:00Z', sort_order: 5 })
  const sub = task('t1a', { parent_task_id: 't1', project_id: 'P' })
  const other = task('x', { project_id: 'Q' })
  const trashed = task('t2', { project_id: 'P', deleted_at: '2026-10-01T00:00:00Z' })

  it('"(copy)", active, milestones and checklist afresh; its tasks open, undated, unscheduled, out of the Top 3', () => {
    const { project: copy, tasks } = duplicateProjectRows(project, [t1, sub, other, trashed], NOW, ids())
    expect(copy).toMatchObject({ name: 'Launch (copy)', status: 'active', domain_id: 'D', color: '#abc', completion_summary: null, created_at: NOW.toISOString() })
    expect(copy.id).not.toBe('P')
    expect(copy.milestones).toEqual([{ id: 'new-1', title: 'Beta', weight: 2, completed: false }])
    expect(tasks.map((r) => r.of)).toEqual(['t1', 't1a']) // not another project's, not Trash's; the subtask once
    const [c1, c2] = tasks.map((r) => r.copy)
    expect(c1).toMatchObject({ project_id: copy.id, milestone_id: 'new-1', status: 'todo', completed_at: null, top3: false, due_at: null, reminder_at: null, scheduled_start: null, sort_order: null })
    expect(c2).toMatchObject({ project_id: copy.id, parent_task_id: c1.id, status: 'todo' })
    expect(copy.checklist?.map((l) => [l.title, l.completed, l.task_id])).toEqual([['Write copy', false, c1.id], ['Check fonts', false, null]])
    expect(copy.checklist?.every((l) => !['c1', 'c2'].includes(l.id))).toBe(true)
  })
})
