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
  it('is MK Action Sheet, in its order, Delete last', () => {
    expect(labels(task(), { tomorrowHint: 'Mon 09:00', canSelect: true })).toEqual([
      'Tomorrow', 'Pick date…', 'Move to…', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Start focus', 'Select', 'Delete',
    ])
  })

  it('carries the hints: Tomorrow’s day and time, the current values, Undo on Delete', () => {
    const spec = taskMenuSpec(task({ priority: 2, recurrence_rule: 'FREQ=WEEKLY', reminder_at: '2026-09-28T05:45:00Z' }), {
      tomorrowHint: 'Mon 09:00', projectName: 'Personal', canSelect: true,
    })
    const hint = (key: string) => spec.find((e) => e.key === key)?.hint
    expect(hint('tomorrow')).toBe('Mon 09:00')
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

  it('a row that cannot be selected has no Select', () => {
    expect(labels(task(), { tomorrowHint: 'x' })).not.toContain('Select')
  })

  it('bulk: the date, project and delete rows name how many they move', () => {
    expect(labels(task(), { tomorrowHint: 'x', bulkCount: 3, selected: true, canSelect: true })).toEqual([
      'Tomorrow (3)', 'Pick date… (3)', 'Move to… (3)', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Deselect', 'Delete (3)',
    ])
  })

  it('an Up next block adds Unschedule after Pick date', () => {
    expect(labels(task(), { tomorrowHint: 'Mon 18:00', canUnschedule: true }).slice(0, 3)).toEqual(['Tomorrow', 'Pick date…', 'Unschedule'])
  })

  it('a done row only reopens or goes to Trash', () => {
    expect(labels(task({ status: 'done', completed_at: '2026-09-27T08:00:00Z' }), { tomorrowHint: 'x', canSelect: true })).toEqual(['Reopen', 'Delete'])
  })
})
