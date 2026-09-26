import type { Cadence } from '../../lib/types'

// The New routine form's state → the fields createRoutine/createChallenge take. Kept out of the
// view so the defaults can't quietly drift back to Routines.dc.html #2a's *filled sample*
// (Evening · Custom M/W/F · reminder on at 21:30 — the mock shows a routine being typed, not an
// empty form). Polish B (audit-newuser, "Create routine").

export type TimeMode = 'morning' | 'afternoon' | 'evening' | 'anytime'
export type RepeatMode = 'daily' | 'weekdays' | 'custom'

export interface NewRoutineDraft {
  name: string
  timeMode: TimeMode
  repeatMode: RepeatMode
  customWeekdays: number[]
  reminderOn: boolean
  reminderTime: string
}

/** A fresh form: nothing chosen for the user. "Anytime" is the control's no-time option
 * (time_of_day null), "Every day" is createRoutine's own default cadence, and no reminder is
 * scheduled unless it's switched on. `reminderTime` is only the value the picker shows once the
 * switch is turned on (the export's 21:30); with the switch off it is never saved. */
export const NEW_ROUTINE_DEFAULTS: Omit<NewRoutineDraft, 'name'> = {
  timeMode: 'anytime',
  repeatMode: 'daily',
  customWeekdays: [],
  reminderOn: false,
  reminderTime: '21:30',
}

export function cadenceFor(mode: RepeatMode, custom: number[]): Cadence {
  if (mode === 'daily') return { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  if (mode === 'weekdays') return { weekdays: [1, 2, 3, 4, 5] }
  return { weekdays: [...custom].sort() }
}

export interface NewRoutineFields {
  name: string
  timeOfDay: string | null
  cadence: Cadence
  clockTime: string | null
}

/** Null when the draft can't be planted yet: no name, or "Custom" with no day picked (that
 * would save a routine no day ever schedules). */
export function draftToRoutineFields(draft: NewRoutineDraft): NewRoutineFields | null {
  const name = draft.name.trim()
  if (!name) return null
  const cadence = cadenceFor(draft.repeatMode, draft.customWeekdays)
  if (cadence.weekdays.length === 0) return null
  return {
    name,
    timeOfDay: draft.timeMode === 'anytime' ? null : draft.timeMode,
    cadence,
    clockTime: draft.reminderOn && draft.reminderTime ? draft.reminderTime : null,
  }
}
