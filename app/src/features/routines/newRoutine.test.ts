import { describe, expect, it } from 'vitest'
import { NEW_ROUTINE_DEFAULTS, cadenceFor, draftToRoutineFields } from './newRoutine'

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
