import { describe, expect, it } from 'vitest'
import { groupRoutinesByTime } from './routineGrouping'

function r(time_of_day: string | null) {
  return { time_of_day }
}

describe('groupRoutinesByTime', () => {
  it('buckets named presets into their own group', () => {
    const groups = groupRoutinesByTime([r('morning'), r('evening')])
    expect(groups.find((g) => g.key === 'morning')?.items).toHaveLength(1)
    expect(groups.find((g) => g.key === 'evening')?.items).toHaveLength(1)
    expect(groups.find((g) => g.key === 'afternoon')?.items).toHaveLength(0)
  })

  it('sends a custom label to Anytime', () => {
    const groups = groupRoutinesByTime([r('dusk')])
    expect(groups.find((g) => g.key === 'anytime')?.items).toHaveLength(1)
  })

  it('sends a null time_of_day (clock-time-only or no-time routine) to Anytime', () => {
    const groups = groupRoutinesByTime([r(null)])
    expect(groups.find((g) => g.key === 'anytime')?.items).toHaveLength(1)
  })

  it('omits the Anytime group entirely when nothing needs it', () => {
    const groups = groupRoutinesByTime([r('morning')])
    expect(groups.find((g) => g.key === 'anytime')).toBeUndefined()
    expect(groups).toHaveLength(3)
  })
})
