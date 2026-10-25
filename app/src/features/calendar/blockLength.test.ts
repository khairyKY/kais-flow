import { describe, expect, it } from 'vitest'
import { spanMinutes, taskMinutes, taskOnBlock, taskWhen, withLength } from '../../../../supabase/functions/_shared/blockLength.ts'

// bugs-1023 (Kai 2026-10-23: "duration doesn't sync with the times of scheduling for events, tasks and
// time blocks"): the one rule every length / time edit goes through, in the app and the MCP server.
const at = (hhmm: string, day = 23) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m)).toISOString() // Cairo, UTC+3
}
// Kai's phone screenshot (queue item 15): a 15-minute block at 17:15, the task due 17:30.
const preWorkout = { due_at: at('17:30'), scheduled_start: at('17:15'), scheduled_end: at('17:30'), duration_min: 15, slot_id: null }

describe('a block’s length', () => {
  it('is whole minutes between its start and end', () => {
    expect(spanMinutes(at('17:15'), at('18:45'))).toBe(90)
    expect(spanMinutes(at('23:30'), at('00:15', 24))).toBe(45)
  })
  it('a new length moves the end and keeps the start', () => {
    expect(withLength(at('17:15'), 60)).toEqual({ starts_at: at('17:15'), ends_at: at('18:15') })
  })
})

describe('taskOnBlock — a task and its own block are one thing', () => {
  const inStep = { due_at: at('17:15'), scheduled_start: at('17:15'), scheduled_end: at('17:30'), duration_min: 15 }

  it('a resize is the new estimate, and the schedule follows the block', () => {
    expect(taskOnBlock(inStep, at('17:15'), at('18:00'))).toEqual({ scheduled_start: at('17:15'), scheduled_end: at('18:00'), duration_min: 45 })
  })
  it('a move keeps the length (no estimate written) and the due time that was the block’s moves with it', () => {
    expect(taskOnBlock(inStep, at('19:00'), at('19:15'))).toEqual({ scheduled_start: at('19:00'), scheduled_end: at('19:15'), due_at: at('19:00') })
  })
  it('a top-edge resize: a new start and a new length', () => {
    expect(taskOnBlock(inStep, at('17:00'), at('17:30'))).toEqual({ scheduled_start: at('17:00'), scheduled_end: at('17:30'), duration_min: 30, due_at: at('17:00') })
  })
  it('a due date that is not the block’s time stays where it is (a Friday task worked on Wednesday)', () => {
    const friday = { ...inStep, due_at: at('09:00', 25) }
    expect(taskOnBlock(friday, at('19:00'), at('19:15')).due_at).toBeUndefined()
  })
  it('an estimate nobody gave is the block’s length once it is on the calendar', () => {
    expect(taskOnBlock({ ...inStep, duration_min: null }, at('17:15'), at('17:45')).duration_min).toBe(30)
  })
  it('an all-day block’s days are never the estimate (p7e A15), nor its due time', () => {
    const patch = taskOnBlock(inStep, '2026-10-23T00:00:00.000Z', '2026-10-26T00:00:00.000Z', true)
    expect(patch.duration_min).toBeUndefined()
    expect(patch.due_at).toBeUndefined()
  })
})

describe('what a task shows', () => {
  it('its length and time are its block’s — the item-15 sheet read 17:30 for a 17:15–17:30 block', () => {
    expect(taskWhen(preWorkout)).toBe(at('17:15'))
    expect(taskMinutes({ ...preWorkout, duration_min: 30 })).toBe(15)
  })
  it('without a block: its estimate and its due date', () => {
    const loose = { ...preWorkout, scheduled_start: null, scheduled_end: null, duration_min: 30 }
    expect(taskMinutes(loose)).toBe(30)
    expect(taskWhen(loose)).toBe(at('17:30'))
  })
  it('in a Time slot: the slot’s times are not the task’s length', () => {
    const held = { ...preWorkout, slot_id: 'slot-1', scheduled_start: at('17:00'), scheduled_end: at('19:00'), duration_min: 20 }
    expect(taskMinutes(held)).toBe(20)
    expect(taskWhen(held)).toBe(at('17:30'))
  })
})
