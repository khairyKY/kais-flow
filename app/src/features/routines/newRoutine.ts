import type { Cadence, Routine } from '../../lib/types'
import { challengeDays } from './streaks'
import { addDays } from '../../components/pickerMath'
import { NAMED_TIMES } from './routineGrouping'

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

// ── Edit mode (Kai 2026-10-12: "you cannot edit a routine after it's created"). The same form
// opens prefilled from the row; saving rewrites the cached row instead of planting a new one. ──

/** Everything the form holds, not just what draftToRoutineFields reads. */
export interface RoutineFormState extends NewRoutineDraft {
  steps: string[]
  domainId: string
  isChallenge: boolean
  challengeDays: number
}

/** `key` + n calendar days (pure day-key math — no device clock, no DST). */
export { addDays }

/** Whether the form holds unsaved changes against where it started (the outside-click rule: a
 * changed form ignores a click outside it; Esc / Cancel still close). */
export function formChanged(now: RoutineFormState, start: RoutineFormState): boolean {
  return (Object.keys(start) as (keyof RoutineFormState)[]).some((k) => JSON.stringify(now[k]) !== JSON.stringify(start[k]))
}

const isNamedTime = (t: string | null) => (NAMED_TIMES as readonly string[]).includes(t ?? '')

function repeatOf(weekdays: number[]): Pick<NewRoutineDraft, 'repeatMode' | 'customWeekdays'> {
  const days = [...new Set(weekdays)].sort()
  if (days.length === 7) return { repeatMode: 'daily', customWeekdays: [] }
  if (days.join() === '1,2,3,4,5') return { repeatMode: 'weekdays', customWeekdays: [] }
  return { repeatMode: 'custom', customWeekdays: days }
}

/** An existing routine as the form's state. A custom `time_of_day` label (0019) reads as
 * "Anytime" (the list already files it there) and is kept on save unless another time is picked. */
export function routineToForm(r: Routine): RoutineFormState {
  const span = r.challenge_start && r.challenge_end ? challengeDays(r.challenge_start, r.challenge_end) : null
  return {
    name: r.name,
    timeMode: isNamedTime(r.time_of_day) ? (r.time_of_day as TimeMode) : 'anytime',
    ...repeatOf(r.cadence?.weekdays ?? []),
    reminderOn: !!r.clock_time,
    reminderTime: r.clock_time ?? NEW_ROUTINE_DEFAULTS.reminderTime,
    steps: r.steps ?? [],
    domainId: r.domain_id ?? '',
    isChallenge: span != null || r.goal_days != null,
    challengeDays: r.goal_days ?? span ?? 30,
  }
}

/** The routine with the form's edits applied, or null when the form can't save (the same rule as
 * planting). A challenge keeps its start day and moves only its end; one switched on for an
 * existing routine starts `todayKey`; switched off, its window and goal clear. */
export function applyRoutineForm(r: Routine, form: RoutineFormState, todayKey: string, nowIso: string): Routine | null {
  const fields = draftToRoutineFields(form)
  if (!fields) return null
  const keepCustomTime = fields.timeOfDay === null && !isNamedTime(r.time_of_day)
  const challenge = form.isChallenge && form.challengeDays > 0
  const start = challenge ? (r.challenge_start ?? todayKey) : null
  return {
    ...r,
    name: fields.name,
    time_of_day: keepCustomTime ? r.time_of_day : fields.timeOfDay,
    cadence: fields.cadence,
    clock_time: fields.clockTime,
    steps: form.steps.map((s) => s.trim()).filter(Boolean),
    domain_id: form.domainId || null,
    challenge_start: start,
    challenge_end: start ? addDays(start, form.challengeDays - 1) : null,
    goal_days: challenge ? form.challengeDays : null,
    updated_at: nowIso,
  }
}
