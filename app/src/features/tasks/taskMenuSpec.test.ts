import { describe, expect, it } from 'vitest'
import { taskMenuSpec } from './taskMenuSpec'
import type { Task } from '../../lib/types'

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', project_id: null, domain_id: null, area_id: null, title: 'Call the bank about the mortgage', notes: null,
  status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null,
  recurrence_rule: null, labels: [], priority: null, duration_min: 15, someday: false, reminder_at: null,
  reminder_sent: false, completed_at: null, created_at: '2026-09-20T06:00:00Z', updated_at: '2026-09-20T06:00:00Z', ...over,
})
const labels = (t: Task, ctx: Parameters<typeof taskMenuSpec>[1]) => taskMenuSpec(t, ctx).map((e) => e.label)

describe('taskMenuSpec — one ⋯ list for every task row', () => {
  // Kai 2026-10-07: Tomorrow + Pick date… became the one Plan… list; Make goal of the day joined.
  it('is MK Action Sheet, in its order, Delete last', () => {
    expect(labels(task(), { tomorrowHint: 'Mon 09:00', canSelect: true })).toEqual([
      'Plan…', 'Move to…', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Make goal of the day', 'Start focus', 'Duplicate', 'Select', 'Delete',
    ])
  })

  it('an overdue task says Replan… (Kai: "I didn\'t find one when I right-clicked something overdue")', () => {
    expect(labels(task(), { tomorrowHint: 'x', overdue: true })[0]).toBe('Replan…')
    expect(taskMenuSpec(task(), { tomorrowHint: 'x', overdue: true })[0]).toMatchObject({ key: 'plan', sub: true })
  })

  it('carries the hints: the current values, Undo on Delete', () => {
    const spec = taskMenuSpec(task({ priority: 2, recurrence_rule: 'FREQ=WEEKLY', reminder_at: '2026-09-28T05:45:00Z' }), {
      tomorrowHint: 'Mon 09:00', projectName: 'Personal', canSelect: true,
    })
    const hint = (key: string) => spec.find((e) => e.key === key)?.hint
    expect(hint('project')).toBe('Personal')
    expect(hint('priority')).toBe('High')
    expect(hint('repeat')).toBe('Weekly')
    expect(hint('remind')).toBe('08:45') // Cairo wall clock
    expect(hint('select')).toBe('or hold a row')
    expect(spec.at(-1)).toMatchObject({ key: 'delete', destructive: true, hint: 'Undo 6s' })
    expect(spec.filter((e) => e.destructive)).toHaveLength(1)
  })

  it('never offers Snooze, Complete or a confirm', () => {
    expect(labels(task(), { tomorrowHint: 'Mon 09:00' }).some((l) => /snooze|complete|…\?/i.test(l))).toBe(false)
  })

  it('says Remove from Top 3 / Deselect when that is the state', () => {
    expect(labels(task({ top3: true }), { tomorrowHint: 'x', canSelect: true, selected: true })).toEqual(
      expect.arrayContaining(['Remove from Top 3', 'Deselect']),
    )
  })

  it('a row that draws its subtasks offers Add a subtask after Plan — never on a subtask, never in bulk (Subtasks A)', () => {
    expect(labels(task(), { tomorrowHint: 'x', subtask: true }).slice(0, 2)).toEqual(['Plan…', 'Add a subtask'])
    expect(labels(task({ parent_task_id: 'p' }), { tomorrowHint: 'x', subtask: true })).not.toContain('Add a subtask')
    expect(labels(task(), { tomorrowHint: 'x', subtask: true, bulkCount: 2, selected: true })).not.toContain('Add a subtask')
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Add a subtask')
  })

  it('a row that cannot be selected has no Select', () => {
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Select')
  })

  it('bulk: the plan, move and delete rows name how many they move; no goal, no focus', () => {
    expect(labels(task(), { tomorrowHint: 'x', bulkCount: 3, selected: true, canSelect: true, overdue: true, place: { index: 1, last: 2 } })).toEqual([
      'Plan… (3)', 'Move to… (3)', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Duplicate (3)', 'Deselect', 'Delete (3)',
    ])
  })

  it('an Up next block adds Unschedule after Plan', () => {
    expect(labels(task(), { tomorrowHint: 'Mon 18:00', canUnschedule: true }).slice(0, 2)).toEqual(['Plan…', 'Unschedule'])
  })

  it('Into a slot… (Time Slots) after Plan when there are Time blocks ahead — one task, never in bulk', () => {
    expect(labels(task(), { tomorrowHint: 'x', slots: true }).slice(0, 2)).toEqual(['Plan…', 'Into a slot…'])
    expect(labels(task({ slot_id: 'e1' }), { tomorrowHint: 'x', slots: true }).slice(0, 3)).toEqual(['Plan…', 'Out of the slot', 'Into a slot…'])
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Into a slot…')
    expect(labels(task(), { tomorrowHint: 'x', slots: true, bulkCount: 2, selected: true })).not.toContain('Into a slot…')
  })

  it('the goal of the day has no Make goal', () => {
    expect(labels(task({ top3: true }), { tomorrowHint: 'x', goal: true })).not.toContain('Make goal of the day')
  })

  it('a Top 3 row on Today moves up / down within the open picks', () => {
    const at = (index: number, last = 2) => labels(task({ top3: true }), { tomorrowHint: 'x', place: { index, last } }).filter((l) => l === 'Move up' || l === 'Move down')
    expect(at(0)).toEqual(['Move down']) // the goal can only go down
    expect(at(1)).toEqual(['Move up', 'Move down'])
    expect(at(2)).toEqual(['Move up'])
    expect(at(0, 0)).toEqual([]) // the only open pick
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Move up') // not a Top 3 row
  })

  it('Duplicate (Kai 2026-10-17) sits after Start focus, before Select and Delete; in bulk it names how many', () => {
    const l = labels(task(), { tomorrowHint: 'x', canSelect: true, desktop: true })
    expect(l.slice(l.indexOf('Start focus'), l.indexOf('Start focus') + 4)).toEqual(['Start focus', 'Duplicate', 'Select', 'Delete'])
    expect(labels(task({ parent_task_id: 'p' }), { tomorrowHint: 'x' })).toContain('Duplicate') // a subtask copies under its parent
    expect(labels(task(), { tomorrowHint: 'x', bulkCount: 2, selected: true })).toContain('Duplicate (2)')
    expect(labels(task({ status: 'done', completed_at: '2026-09-27T08:00:00Z' }), { tomorrowHint: 'x' })).not.toContain('Duplicate')
  })

  it('a done row only reopens or goes to Trash', () => {
    expect(labels(task({ status: 'done', completed_at: '2026-09-27T08:00:00Z' }), { tomorrowHint: 'x', canSelect: true })).toEqual(['Reopen', 'Delete'])
  })

  it('desktop: Tomorrow is back on top, before Plan… (Kai 2026-10-12 audit); the phone swipes for it', () => {
    const desk = taskMenuSpec(task(), { tomorrowHint: 'Mon 09:00', desktop: true })
    expect(desk.slice(0, 2).map((e) => e.label)).toEqual(['Tomorrow', 'Plan…'])
    expect(desk[0]).toMatchObject({ key: 'tomorrow', hint: 'Mon 09:00' })
    expect(labels(task(), { tomorrowHint: 'x', desktop: true, bulkCount: 3, selected: true })[0]).toBe('Tomorrow (3)')
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Tomorrow')
  })

  it('desktop: Labels (the Label picker, key L) after Priority; the phone sheet stays as MK Action Sheet draws it', () => {
    const desk = labels(task(), { tomorrowHint: 'x', desktop: true })
    expect(desk.slice(desk.indexOf('Priority'), desk.indexOf('Priority') + 2)).toEqual(['Priority', 'Labels'])
    expect(taskMenuSpec(task(), { tomorrowHint: 'x', desktop: true }).find((e) => e.key === 'labels')).toMatchObject({ sub: true })
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Labels')
  })
})
