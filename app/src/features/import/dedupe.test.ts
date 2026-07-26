import { describe, expect, it } from 'vitest'
import { findDuplicateClusters, guessCadence, MIN_CLUSTER } from './dedupe'
import type { Task } from '../../lib/types'

const NOW = new Date('2026-07-26T12:00:00')

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? crypto.randomUUID(),
    project_id: null,
    domain_id: null,
    area_id: null,
    title: 'x',
    notes: null,
    status: 'todo',
    due_at: null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: null,
    labels: [],
    priority: null,
    duration_min: null,
    someday: false,
    reminder_at: null,
    reminder_sent: false,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

/** n same-title tasks spaced `gapDays` apart, starting `startOffset` days from NOW. */
function series(title: string, n: number, gapDays: number, startOffset = -10): Task[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW)
    d.setDate(d.getDate() + startOffset + i * gapDays)
    return task({ title, due_at: d.toISOString() })
  })
}

describe('guessCadence', () => {
  it('1-day median gap reads as daily', () => {
    const dates = series('t', 10, 1).map((t) => new Date(t.due_at!))
    expect(guessCadence(dates)).toBe('daily')
  })

  it('7-day median gap reads as weekly', () => {
    const dates = series('t', 6, 7).map((t) => new Date(t.due_at!))
    expect(guessCadence(dates)).toBe('weekly')
  })

  it('irregular spacing or too few dates yields no guess', () => {
    const dates = series('t', 5, 17).map((t) => new Date(t.due_at!))
    expect(guessCadence(dates)).toBeNull()
    expect(guessCadence(dates.slice(0, 2))).toBeNull()
  })
})

describe('findDuplicateClusters', () => {
  it('clusters by normalized title (trim/lowercase), MIN_CLUSTER minimum, open tasks only', () => {
    const tasks = [
      ...series(' Shower + breakfast ', MIN_CLUSTER - 1, 1),
      task({ title: 'shower + BREAKFAST', due_at: NOW.toISOString() }), // 5th, different casing
      task({ title: 'shower + breakfast', status: 'done', due_at: NOW.toISOString() }), // done — ignored
      ...series('one-off', 2, 1), // below threshold
    ]
    const clusters = findDuplicateClusters(tasks, NOW)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].tasks).toHaveLength(MIN_CLUSTER)
    expect(clusters[0].cadence).toBe('daily')
    expect(clusters[0].rule).toBe('FREQ=DAILY')
  })

  it('keeper is the next upcoming occurrence, and the cluster title is the keeper trimmed', () => {
    const tasks = series(' Water plants ', 8, 7, -21) // weekly, some past + some future
    const clusters = findDuplicateClusters(tasks, NOW)
    expect(clusters[0].cadence).toBe('weekly')
    expect(clusters[0].title).toBe('Water plants')
    expect(new Date(clusters[0].keep.due_at!).getTime()).toBeGreaterThanOrEqual(NOW.getTime())
    // and it's the EARLIEST upcoming one, not just any future one
    const upcoming = tasks.filter((t) => new Date(t.due_at!) >= NOW)
    expect(clusters[0].keep.due_at).toBe(upcoming[0].due_at)
  })

  it('all-past cluster keeps the latest occurrence; undated cluster still merges without a rule', () => {
    const past = findDuplicateClusters(series('old habit', 6, 1, -30), NOW)
    expect(past[0].keep.due_at).toBe(past[0].tasks[5].due_at)
    const undated = findDuplicateClusters(Array.from({ length: 5 }, () => task({ title: 'loose note' })), NOW)
    expect(undated[0].cadence).toBeNull()
    expect(undated[0].rule).toBeNull()
    expect(undated[0].keep).toBe(undated[0].tasks[0])
  })

  it('largest cluster first', () => {
    const tasks = [...series('small', 5, 1), ...series('big', 9, 1)]
    const clusters = findDuplicateClusters(tasks, NOW)
    expect(clusters.map((c) => c.title)).toEqual(['big', 'small'])
  })
})
