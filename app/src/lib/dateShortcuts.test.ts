import { describe, expect, it } from 'vitest'
import { scheduleNextWeek, scheduleThisWeek, scheduleToday, scheduleTomorrow } from './dateShortcuts'

describe('scheduleToday', () => {
  it('lands at 9am the same day', () => {
    const now = new Date('2026-07-08T14:00:00')
    expect(scheduleToday(now)).toBe(new Date('2026-07-08T09:00:00').toISOString())
  })
})

describe('scheduleTomorrow', () => {
  it('lands at 9am the next calendar day', () => {
    const now = new Date('2026-07-08T14:00:00')
    expect(scheduleTomorrow(now)).toBe(new Date('2026-07-09T09:00:00').toISOString())
  })
})

describe('scheduleNextWeek', () => {
  it('lands on next Monday 9am when today is a weekday', () => {
    const wednesday = new Date('2026-07-08T14:00:00') // Wed
    expect(scheduleNextWeek(wednesday)).toBe(new Date('2026-07-13T09:00:00').toISOString())
  })
  it('rolls a full 7 days when today is already Monday', () => {
    const monday = new Date('2026-07-06T09:00:00')
    expect(scheduleNextWeek(monday)).toBe(new Date('2026-07-13T09:00:00').toISOString())
  })
})

describe('scheduleThisWeek', () => {
  it('lands 2 days out at 9am', () => {
    const now = new Date('2026-07-08T14:00:00')
    expect(scheduleThisWeek(now)).toBe(new Date('2026-07-10T09:00:00').toISOString())
  })
})
