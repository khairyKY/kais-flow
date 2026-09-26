import { describe, expect, it } from 'vitest'
import {
  MAX_SEEDS,
  SEED_EVENT,
  UNSEED_EVENT,
  addDaysToKey,
  liveSeeds,
  loopDayKey,
  morningPreselection,
  seedPayload,
  seedTargetDate,
  seededTaskIds,
  top3Diff,
} from './loopDay'
import type { ActivityLogEntry, Task } from '../../lib/types'

// Every instant is written in UTC with its Cairo wall clock beside it, so these pass under any
// TZ (the suite runs under UTC, Africa/Cairo and America/Los_Angeles). Egypt is UTC+3 from
// Fri 24 Apr to Thu 29 Oct 2026 and UTC+2 outside it.
const at = (iso: string) => new Date(iso)

describe('addDaysToKey', () => {
  it('crosses month and year ends', () => {
    expect(addDaysToKey('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('loopDayKey — the Cairo day, turning over at 04:00', () => {
  it('evening is that day', () => {
    expect(loopDayKey(at('2026-09-26T18:00:00Z'))).toBe('2026-09-26') // Sat 21:00 Cairo
  })
  it('00:30 Cairo is still the day before', () => {
    expect(loopDayKey(at('2026-09-26T21:30:00Z'))).toBe('2026-09-26') // Sun 00:30 Cairo
  })
  it('03:59 is the day before, 04:00 is the new day', () => {
    expect(loopDayKey(at('2026-09-27T00:59:00Z'))).toBe('2026-09-26') // Sun 03:59
    expect(loopDayKey(at('2026-09-27T01:00:00Z'))).toBe('2026-09-27') // Sun 04:00
  })
  it('the morning is the new day', () => {
    expect(loopDayKey(at('2026-09-27T05:00:00Z'))).toBe('2026-09-27') // Sun 08:00
  })
  it('is Cairo, not UTC or the device: 23:30 UTC is already 02:30 Cairo', () => {
    expect(loopDayKey(at('2026-09-26T23:30:00Z'))).toBe('2026-09-26') // Sun 02:30 Cairo → still Sat
    expect(loopDayKey(at('2026-09-26T20:30:00Z'))).toBe('2026-09-26') // Sat 23:30 Cairo
  })
  it('spring-forward night (no 00:00–01:00): 03:30 is the day before, 04:30 the new day', () => {
    expect(loopDayKey(at('2026-04-24T00:30:00Z'))).toBe('2026-04-23') // Fri 03:30 EEST
    expect(loopDayKey(at('2026-04-24T01:30:00Z'))).toBe('2026-04-24') // Fri 04:30 EEST
  })
  it('fall-back night (23:00 twice): the repeated hour and 03:30 stay on Thursday', () => {
    expect(loopDayKey(at('2026-10-29T20:30:00Z'))).toBe('2026-10-29') // Thu 23:30 EEST
    expect(loopDayKey(at('2026-10-29T21:30:00Z'))).toBe('2026-10-29') // Thu 23:30 EET (again)
    expect(loopDayKey(at('2026-10-30T01:30:00Z'))).toBe('2026-10-29') // Fri 03:30 EET
    expect(loopDayKey(at('2026-10-30T02:30:00Z'))).toBe('2026-10-30') // Fri 04:30 EET
  })
})

describe('seedTargetDate — the morning a shutdown seeds', () => {
  it('21:00 seeds the next day', () => {
    expect(seedTargetDate(at('2026-09-26T18:00:00Z'))).toBe('2026-09-27') // Sat 21:00 → Sun
  })
  it('00:30 seeds the morning about to come, not the day after it', () => {
    expect(seedTargetDate(at('2026-09-26T21:30:00Z'))).toBe('2026-09-27') // Sun 00:30 → Sun
  })
  it('winter time, and a year end', () => {
    expect(seedTargetDate(at('2026-12-31T19:00:00Z'))).toBe('2027-01-01') // Thu 31 Dec 21:00 EET
    expect(seedTargetDate(at('2026-12-31T22:30:00Z'))).toBe('2027-01-01') // Fri 1 Jan 00:30 EET
  })
  it('the payload names both days', () => {
    expect(seedPayload(at('2026-09-26T21:30:00Z'))).toEqual({ ritual: 'evening', step: 'seeds', for_date: '2026-09-27', date: '2026-09-26' })
  })
})

let seq = 0
function row(event_type: string, entity_id: string, for_date: string): ActivityLogEntry {
  seq += 1
  return {
    id: `row-${seq}`,
    event_type,
    entity_type: 'task',
    entity_id,
    payload: { ritual: 'evening', step: 'seeds', for_date, date: addDaysToKey(for_date, -1) },
    created_at: new Date(Date.UTC(2026, 8, 26, 18, seq)).toISOString(),
  }
}
const seed = (id: string, d = '2026-09-27') => row(SEED_EVENT, id, d)
const unseed = (id: string, d = '2026-09-27') => row(UNSEED_EVENT, id, d)

describe('seededTaskIds', () => {
  it('keeps seeding order', () => {
    expect(seededTaskIds([seed('a'), seed('b')], '2026-09-27')).toEqual(['a', 'b'])
  })
  it('the last word per task wins: an unseed takes it out, a re-seed puts it back at the end', () => {
    expect(seededTaskIds([seed('a'), seed('b'), unseed('a')], '2026-09-27')).toEqual(['b'])
    expect(seededTaskIds([seed('a'), seed('b'), unseed('a'), seed('a')], '2026-09-27')).toEqual(['b', 'a'])
  })
  it('ignores seeds planted for any other morning', () => {
    const rows = [seed('old', '2026-09-26'), seed('a'), seed('later', '2026-09-28')]
    expect(seededTaskIds(rows, '2026-09-27')).toEqual(['a'])
    expect(seededTaskIds(rows, '2026-09-28')).toEqual(['later'])
  })
  it('ignores other events and rows without a date', () => {
    const other: ActivityLogEntry = { ...seed('x'), event_type: 'task.starred' }
    const bare: ActivityLogEntry = { ...seed('y'), payload: null }
    expect(seededTaskIds([other, bare, seed('a')], '2026-09-27')).toEqual(['a'])
  })
})

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    project_id: null,
    domain_id: null,
    area_id: null,
    title: id,
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
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

describe('liveSeeds', () => {
  const tasks = [
    task('a'),
    task('done', { status: 'done', completed_at: '2026-09-27T05:00:00Z' }),
    task('cancelled', { status: 'cancelled' }),
    task('trashed', { deleted_at: '2026-09-26T20:00:00Z' }),
    task('b'),
    task('c'),
    task('d'),
  ]
  it('skips done, cancelled, deleted and unknown tasks, keeping order', () => {
    expect(liveSeeds(['done', 'b', 'gone', 'trashed', 'a', 'cancelled'], tasks).map((t) => t.id)).toEqual(['b', 'a'])
  })
  it('keeps at most three', () => {
    expect(liveSeeds(['a', 'b', 'c', 'd'], tasks).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(MAX_SEEDS).toBe(3)
  })
})

describe('morningPreselection', () => {
  it('seeds first, then open starred tasks, up to three', () => {
    const tasks = [task('s1'), task('s2'), task('star1', { top3: true }), task('star2', { top3: true }), task('plain')]
    expect(morningPreselection([tasks[0], tasks[1]], tasks)).toEqual(['s1', 's2', 'star1'])
  })
  it('a seed that is already starred is not counted twice', () => {
    const tasks = [task('s1', { top3: true }), task('star1', { top3: true })]
    expect(morningPreselection([tasks[0]], tasks)).toEqual(['s1', 'star1'])
  })
  it('three seeds leave no room for older stars', () => {
    const tasks = [task('s1'), task('s2'), task('s3'), task('star1', { top3: true })]
    expect(morningPreselection(tasks.slice(0, 3), tasks)).toEqual(['s1', 's2', 's3'])
  })
})

describe('top3Diff', () => {
  it('stars the picks that are not starred and unstars the stars that were not picked', () => {
    const tasks = [task('s1'), task('s2'), task('keep', { top3: true }), task('drop', { top3: true })]
    const diff = top3Diff(['s1', 's2', 'keep'], tasks)
    expect(diff.star.map((t) => t.id)).toEqual(['s1', 's2'])
    expect(diff.unstar.map((t) => t.id)).toEqual(['drop'])
  })
  it('confirming what is already starred changes nothing', () => {
    const tasks = [task('a', { top3: true }), task('b', { top3: true })]
    expect(top3Diff(['a', 'b'], tasks)).toEqual({ unstar: [], star: [] })
  })
  it('never stars a task that is done, deleted or unknown', () => {
    const tasks = [task('done', { status: 'done' }), task('trashed', { deleted_at: 'x' })]
    expect(top3Diff(['done', 'trashed', 'gone'], tasks).star).toEqual([])
  })
})
