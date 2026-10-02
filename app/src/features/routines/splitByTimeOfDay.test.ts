import { describe, expect, it } from 'vitest'
import { groupRoutinesByTime, namedTimeAt, splitByTimeOfDay } from './routineGrouping'

const r = (id: string, time_of_day: string | null) => ({ id, time_of_day })
const groups = groupRoutinesByTime([r('a', 'morning'), r('b', 'afternoon'), r('c', 'evening'), r('d', null)]).filter((g) => g.items.length)

describe('splitByTimeOfDay — Today shows the routines for now', () => {
  it('names the time by the Cairo hour', () => {
    expect([0, 11, 12, 16, 17, 23].map(namedTimeAt)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening'])
  })
  it('morning: Morning + Anytime shown; Afternoon and Evening fold as Later', () => {
    const { shown, folded } = splitByTimeOfDay(groups, 8)
    expect(shown.map((g) => g.key)).toEqual(['morning', 'anytime'])
    expect(folded.map((g) => `${g.when} ${g.key}`)).toEqual(['Later afternoon', 'Later evening'])
  })
  it('evening: the earlier groups fold as Earlier, none are lost', () => {
    const { shown, folded } = splitByTimeOfDay(groups, 20)
    expect(shown.map((g) => g.key)).toEqual(['evening', 'anytime'])
    expect(folded.map((g) => `${g.when} ${g.key}`)).toEqual(['Earlier morning', 'Earlier afternoon'])
  })
  it('a time with no routines shows only Anytime and folds the rest', () => {
    const { shown, folded } = splitByTimeOfDay(groupRoutinesByTime([r('a', 'morning'), r('c', 'evening')]).filter((g) => g.items.length), 14)
    expect(shown).toEqual([])
    expect(folded.map((g) => g.when)).toEqual(['Earlier', 'Later'])
  })
})
