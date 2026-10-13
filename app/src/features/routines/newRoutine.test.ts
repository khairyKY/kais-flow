import { describe, expect, it } from 'vitest'
import { NEW_ROUTINE_DEFAULTS, addDays, applyRoutineForm, cadenceFor, draftToRoutineFields, formChanged, moveItem, parseMinutes, readSteps, routineToForm, stepsTotal, writeSteps, type RoutineFormState } from './newRoutine'
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
    step_minutes: [],
    domain_id: 'd1',
    goal_days: null,
    plant: 'vine',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }

  it('prefills every field from the routine', () => {
    expect(routineToForm(base)).toEqual({
      name: 'Stretch',
      description: '',
      timeMode: 'evening',
      repeatMode: 'custom',
      customWeekdays: [1, 3, 5],
      reminderOn: true,
      reminderTime: '21:30',
      steps: [{ text: 'Neck rolls' }, { text: 'Hamstrings' }],
      domainId: 'd1',
      isChallenge: false,
      challengeDays: 30,
      plant: 'vine',
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
    const form = { ...routineToForm(base), name: ' Long stretch ', timeMode: 'morning' as const, repeatMode: 'daily' as const, reminderOn: false, steps: [{ text: 'Neck rolls' }, { text: '  ', minutes: 4 }], domainId: '' }
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

  it('Description (P7 7d, 0072): read into the form, saved trimmed, cleared to null — never written onto a row that has none', () => {
    const about = { ...base, description: 'Before bed, every night' }
    expect(routineToForm(about).description).toBe('Before bed, every night')
    expect(applyRoutineForm(base, { ...routineToForm(base), description: '  After the gym  ' }, '2026-10-12', 'NOW')?.description).toBe('After the gym')
    expect(applyRoutineForm(about, { ...routineToForm(about), description: ' ' }, '2026-10-12', 'NOW')?.description).toBeNull()
    expect('description' in applyRoutineForm(base, routineToForm(base), '2026-10-12', 'NOW')!).toBe(false) // a build before 0072's row
  })

  it("won't save with an empty name", () => {
    expect(applyRoutineForm(base, { ...routineToForm(base), name: ' ' }, '2026-10-12', 'NOW')).toBeNull()
  })
})

// The outside-click rule (Flow Audit): a form with unsaved changes ignores a click outside it.
describe('formChanged', () => {
  const start: RoutineFormState = { ...NEW_ROUTINE_DEFAULTS, name: '', description: '', steps: [], domainId: '', isChallenge: false, challengeDays: 30, plant: 'vine' }
  it('a form as it opened is clean, whatever order its fields were built in', () => {
    const { name, steps, ...rest } = start
    expect(formChanged({ steps, ...rest, name }, start)).toBe(false)
  })
  it('typing, a step, a weekday or a toggle makes it dirty', () => {
    expect(formChanged({ ...start, name: 'S' }, start)).toBe(true)
    expect(formChanged({ ...start, steps: [{ text: '' }] }, start)).toBe(true)
    expect(formChanged({ ...start, plant: 'fern' }, start)).toBe(true)
    expect(formChanged({ ...start, description: 'Why' }, start)).toBe(true)
    expect(formChanged({ ...start, customWeekdays: [1] }, start)).toBe(true)
    expect(formChanged({ ...start, reminderOn: true }, start)).toBe(true)
  })
})

describe('the challenge end day', () => {
  it('is pure day-key math — across a month end and the DST switch, on any device zone', () => {
    expect(addDays('2026-10-03', 29)).toBe('2026-11-01')
    expect(addDays('2026-10-29', 1)).toBe('2026-10-30')
  })
})

// Routines 2 (2a/2b): a step carries its minutes, the list its total, and the order is the user's.
// Stored as two aligned columns (0067): `steps` stays plain strings for builds already installed.
describe('routine steps with minutes', () => {
  // A row as a build from before 0067 leaves it: string steps, no step_minutes column.
  const oldBuildRow = { steps: ['Neck rolls', 'Hamstrings'] }

  it('an old-build row (no step_minutes) reads as steps with no minutes', () => {
    expect(readSteps(oldBuildRow)).toEqual([{ text: 'Neck rolls' }, { text: 'Hamstrings' }])
    expect(readSteps({ ...oldBuildRow, step_minutes: null })).toEqual([{ text: 'Neck rolls' }, { text: 'Hamstrings' }])
    expect(readSteps({})).toEqual([])
  })

  it('pairs steps[i] with step_minutes[i]; a short, long or junk list means no minutes there', () => {
    expect(readSteps({ steps: ['a', 'b', 'c'], step_minutes: [2, null, 5] })).toEqual([{ text: 'a', minutes: 2 }, { text: 'b' }, { text: 'c', minutes: 5 }])
    expect(readSteps({ steps: ['a', 'b', 'c'], step_minutes: [2] })).toEqual([{ text: 'a', minutes: 2 }, { text: 'b' }, { text: 'c' }])
    expect(readSteps({ steps: ['a'], step_minutes: [2, 3, 4] })).toEqual([{ text: 'a', minutes: 2 }])
    expect(readSteps({ steps: ['a', 'b'], step_minutes: ['3' as never, 0] })).toEqual([{ text: 'a' }, { text: 'b' }])
    expect(readSteps({ steps: ['a'], step_minutes: { 0: 4 } as never })).toEqual([{ text: 'a' }])
  })

  it('defensively still reads object-shaped steps, and skips anything else', () => {
    expect(readSteps({ steps: [{ text: 'Hips', minutes: 3 }, null, { minutes: 2 }, 'Breathe'] as never })).toEqual([{ text: 'Hips', minutes: 3 }, { text: 'Breathe' }])
  })

  it('writes plain strings in steps and the minutes aligned beside them; blank steps drop with their minutes', () => {
    expect(writeSteps([{ text: ' Neck rolls ' }, { text: '   ', minutes: 5 }, { text: 'Hips', minutes: 3 }])).toEqual({ steps: ['Neck rolls', 'Hips'], step_minutes: [null, 3] })
    expect(writeSteps([{ text: 'a' }, { text: 'b' }])).toEqual({ steps: ['a', 'b'], step_minutes: [] })
  })

  it('round-trips through the edit form unchanged', () => {
    const stored = { steps: ['Neck rolls', 'Hips'], step_minutes: [null, 3] }
    expect(writeSteps(readSteps(stored))).toEqual(stored)
    expect(writeSteps(readSteps(oldBuildRow))).toEqual({ ...oldBuildRow, step_minutes: [] })
  })

  it("adds up 2a's total, ignoring steps with no minutes", () => {
    expect(stepsTotal([{ text: 'a', minutes: 2 }, { text: 'b', minutes: 3 }, { text: 'c' }, { text: 'd', minutes: 5 }])).toBe(10)
    expect(stepsTotal([{ text: 'a' }])).toBe(0)
  })

  it('the minutes chip keeps digits only; empty or 0 means no minutes; at most 999', () => {
    expect(parseMinutes('12')).toBe(12)
    expect(parseMinutes('5 min')).toBe(5)
    expect(parseMinutes('')).toBeUndefined()
    expect(parseMinutes('0')).toBeUndefined()
    expect(parseMinutes('12345')).toBe(123)
  })

  it('moves a step to a new place (drag, Move up / down, ↑/↓); out of range changes nothing', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c'])
  })

  it('a reordered step takes its minutes with it: steps and step_minutes are saved in the same order', () => {
    const r = { id: 'r1', name: 'Stretch', time_of_day: null, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: ['a', 'b'], step_minutes: [2, null], created_at: 'T', updated_at: 'T' }
    const form = routineToForm(r)
    const next = applyRoutineForm(r, { ...form, steps: moveItem([...form.steps, { text: 'c', minutes: 5 }], 2, 0) }, '2026-10-13', 'NOW')
    expect(next?.steps).toEqual(['c', 'a', 'b'])
    expect(next?.step_minutes).toEqual([5, 2, null])
  })

  it('an old-build row saved by this build gains step_minutes and keeps its steps as strings', () => {
    const r = { id: 'r1', name: 'Stretch', time_of_day: null, clock_time: null, cadence: { weekdays: [1] }, challenge_start: null, challenge_end: null, active: true, ...oldBuildRow, created_at: 'T', updated_at: 'T' }
    expect(applyRoutineForm(r, routineToForm(r), '2026-10-13', 'NOW')).toMatchObject({ steps: ['Neck rolls', 'Hamstrings'], step_minutes: [] })
  })
})

describe('the routine plant (0067)', () => {
  const r = { id: 'r1', name: 'Stretch', time_of_day: null, clock_time: null, cadence: { weekdays: [1] }, challenge_start: null, challenge_end: null, active: true, created_at: 'T', updated_at: 'T' }
  it('a row from before 0067 grew the vine, and saves it as vine', () => {
    expect(routineToForm(r).plant).toBe('vine')
    expect(applyRoutineForm(r, routineToForm(r), '2026-10-13', 'NOW')?.plant).toBe('vine')
  })
  it('the picked species is saved', () => {
    expect(applyRoutineForm(r, { ...routineToForm(r), plant: 'clover' }, '2026-10-13', 'NOW')?.plant).toBe('clover')
    expect(routineToForm({ ...r, plant: 'daisy' }).plant).toBe('daisy')
  })
})
