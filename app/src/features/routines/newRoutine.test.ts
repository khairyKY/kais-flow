import { describe, expect, it } from 'vitest'
import { NEW_ROUTINE_DEFAULTS, applyRoutineForm, cadenceFor, draftToRoutineFields, routineToForm } from './newRoutine'
import type { Routine } from '../../lib/types'

// Polish B (audit-newuser, "Create routine"): typing only a name used to save the export's
// sample — Evening · Mon/Wed/Fri · a 21:30 push reminder.
describe('New routine form defaults', () => {
  it('a name alone plants a plain routine: every day, no time of day, no reminder', () => {
    expect(draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: '  Drink water ' })).toEqual({
      name: 'Drink water',
      timeOfDay: null,
      cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      clockTime: null,
    })
  })

  it('opens with no custom days and the reminder off', () => {
    expect(NEW_ROUTINE_DEFAULTS.customWeekdays).toEqual([])
    expect(NEW_ROUTINE_DEFAULTS.reminderOn).toBe(false)
  })

  it('saves a reminder time only when the reminder is switched on', () => {
    expect(draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: 'Stretch', reminderTime: '07:15' })?.clockTime).toBeNull()
    expect(draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: 'Stretch', reminderOn: true, reminderTime: '07:15' })?.clockTime).toBe('07:15')
  })

  it('keeps an explicit choice of time and days', () => {
    const fields = draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: 'Swim', timeMode: 'evening', repeatMode: 'custom', customWeekdays: [5, 1, 3] })
    expect(fields).toMatchObject({ timeOfDay: 'evening', cadence: { weekdays: [1, 3, 5] } })
  })

  it("won't plant with no name, or Custom with no day picked (a routine no day would ever schedule)", () => {
    expect(draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: '   ' })).toBeNull()
    expect(draftToRoutineFields({ ...NEW_ROUTINE_DEFAULTS, name: 'Swim', repeatMode: 'custom', customWeekdays: [] })).toBeNull()
  })

  it('weekdays means Monday to Friday', () => {
    expect(cadenceFor('weekdays', [])).toEqual({ weekdays: [1, 2, 3, 4, 5] })
  })
})

// Kai 2026-10-12: a routine couldn't be edited after it was planted. The form now opens prefilled.
describe('Edit routine form', () => {
  const base: Routine = {
    id: 'r1',
    name: 'Stretch',
    time_of_day: 'evening',
    clock_time: '21:30',
    cadence: { weekdays: [1, 3, 5] },
    challenge_start: null,
    challenge_end: null,
    active: true,
    steps: ['Neck rolls', 'Hamstrings'],
    domain_id: 'd1',
    goal_days: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }

  it('prefills every field from the routine', () => {
    expect(routineToForm(base)).toEqual({
      name: 'Stretch',
      timeMode: 'evening',
      repeatMode: 'custom',
      customWeekdays: [1, 3, 5],
      reminderOn: true,
      reminderTime: '21:30',
      steps: ['Neck rolls', 'Hamstrings'],
      domainId: 'd1',
      isChallenge: false,
      challengeDays: 30,
    })
  })

  it('reads 7 days as Every day and Mon–Fri as Weekdays', () => {
    expect(routineToForm({ ...base, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] } }).repeatMode).toBe('daily')
    expect(routineToForm({ ...base, cadence: { weekdays: [5, 4, 3, 2, 1] } }).repeatMode).toBe('weekdays')
  })

  it('saving an untouched form changes nothing but updated_at', () => {
    expect(applyRoutineForm(base, routineToForm(base), '2026-10-12', 'NOW')).toEqual({ ...base, updated_at: 'NOW' })
  })

  it('applies edits and keeps id, active and created_at', () => {
    const form = { ...routineToForm(base), name: ' Long stretch ', timeMode: 'morning' as const, repeatMode: 'daily' as const, reminderOn: false, steps: ['Neck rolls', '  '], domainId: '' }
    expect(applyRoutineForm(base, form, '2026-10-12', 'NOW')).toEqual({
      ...base,
      name: 'Long stretch',
      time_of_day: 'morning',
      cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      clock_time: null,
      steps: ['Neck rolls'],
      domain_id: null,
      updated_at: 'NOW',
    })
  })

  it('keeps a custom time-of-day label unless another time is picked', () => {
    const dusk = { ...base, time_of_day: 'dusk' }
    expect(routineToForm(dusk).timeMode).toBe('anytime')
    expect(applyRoutineForm(dusk, routineToForm(dusk), '2026-10-12', 'NOW')?.time_of_day).toBe('dusk')
    expect(applyRoutineForm(dusk, { ...routineToForm(dusk), timeMode: 'morning' }, '2026-10-12', 'NOW')?.time_of_day).toBe('morning')
    // a named time switched to Anytime does clear
    expect(applyRoutineForm(base, { ...routineToForm(base), timeMode: 'anytime' }, '2026-10-12', 'NOW')?.time_of_day).toBeNull()
  })

  it('a challenge keeps its start and moves its end with the day count', () => {
    const ch = { ...base, challenge_start: '2026-10-01', challenge_end: '2026-10-30', goal_days: 30 }
    expect(routineToForm(ch)).toMatchObject({ isChallenge: true, challengeDays: 30 })
    expect(applyRoutineForm(ch, { ...routineToForm(ch), challengeDays: 10 }, '2026-10-12', 'NOW')).toMatchObject({ challenge_start: '2026-10-01', challenge_end: '2026-10-10', goal_days: 10 })
  })

  it('turning the challenge on starts it today; off clears it', () => {
    expect(applyRoutineForm(base, { ...routineToForm(base), isChallenge: true, challengeDays: 3 }, '2026-10-12', 'NOW')).toMatchObject({ challenge_start: '2026-10-12', challenge_end: '2026-10-14', goal_days: 3 })
    const ch = { ...base, challenge_start: '2026-10-01', challenge_end: '2026-10-30', goal_days: 30 }
    expect(applyRoutineForm(ch, { ...routineToForm(ch), isChallenge: false }, '2026-10-12', 'NOW')).toMatchObject({ challenge_start: null, challenge_end: null, goal_days: null })
  })

  it("won't save with an empty name", () => {
    expect(applyRoutineForm(base, { ...routineToForm(base), name: ' ' }, '2026-10-12', 'NOW')).toBeNull()
  })
})
