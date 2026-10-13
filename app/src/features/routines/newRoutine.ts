import type { Cadence, Routine, RoutinePlant } from '../../lib/types'
import { challengeDays } from './streaks'
import { addDays } from '../../components/pickerMath'
import { NAMED_TIMES } from './routineGrouping'
import { plantOf } from './plant'

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
  /** P7 7d: what the routine is for, in your words (routines.description, 0072); '' = none. */
  description: string
  steps: StepDraft[]
  domainId: string
  isChallenge: boolean
  challengeDays: number
  plant: RoutinePlant
}

// ── Steps (0028) + 2a's minutes (0067). Stored as two aligned columns so a build that's already
// installed keeps reading `steps` as the plain strings it always was: `steps[i]` is step i's label,
// `step_minutes[i]` its minutes or null. The form and the row fold only ever see StepDraft. ──

export interface StepDraft {
  text: string
  minutes?: number
}

/** A routine's stored steps as drafts. A missing, short or non-array `step_minutes` (a row from before
 * 0067, or one an old build reordered) just means no minutes there. Defensive: a step stored as
 * `{ text, minutes }` (never written by a release) still reads; anything else is skipped. */
export function readSteps(r: Pick<Routine, 'steps' | 'step_minutes'>): StepDraft[] {
  const steps: readonly unknown[] = Array.isArray(r.steps) ? r.steps : []
  const mins: readonly unknown[] = Array.isArray(r.step_minutes) ? r.step_minutes : []
  return steps.flatMap((s, i) => {
    const obj = s && typeof s === 'object' ? (s as { text?: unknown; minutes?: unknown }) : null
    const text = typeof s === 'string' ? s : typeof obj?.text === 'string' ? obj.text : null
    if (text === null) return []
    const minutes = cleanMinutes(mins[i]) ?? cleanMinutes(obj?.minutes)
    return [minutes ? { text, minutes } : { text }]
  })
}

/** The form's steps as stored: labels as plain strings (trimmed, blank ones dropped) and their
 * minutes aligned beside them — reordered together, since both come from the same list. No step
 * with minutes = `step_minutes: []`. */
export function writeSteps(drafts: readonly StepDraft[]): { steps: string[]; step_minutes: (number | null)[] } {
  const kept = drafts.flatMap((s) => (s.text.trim() ? [{ text: s.text.trim(), minutes: cleanMinutes(s.minutes) ?? null }] : []))
  return { steps: kept.map((s) => s.text), step_minutes: kept.some((s) => s.minutes != null) ? kept.map((s) => s.minutes) : [] }
}

/** 2a's "10 min total": the steps' minutes added up (0 when none has any). */
export function stepsTotal(steps: readonly StepDraft[]): number {
  return steps.reduce((sum, s) => sum + (cleanMinutes(s.minutes) ?? 0), 0)
}

/** What the minutes chip holds after a keystroke: digits only, empty = no minutes, at most 999. */
export function parseMinutes(typed: string): number | undefined {
  return cleanMinutes(Number(typed.replace(/\D/g, '').slice(0, 3)))
}

function cleanMinutes(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.min(999, Math.round(n)) : undefined
}

/** `list` with the item at `from` moved to `to` (a drag, Move up / down, ↑/↓). Out of range = unchanged. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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
    description: r.description ?? '',
    timeMode: isNamedTime(r.time_of_day) ? (r.time_of_day as TimeMode) : 'anytime',
    ...repeatOf(r.cadence?.weekdays ?? []),
    reminderOn: !!r.clock_time,
    reminderTime: r.clock_time ?? NEW_ROUTINE_DEFAULTS.reminderTime,
    steps: readSteps(r),
    domainId: r.domain_id ?? '',
    isChallenge: span != null || r.goal_days != null,
    challengeDays: r.goal_days ?? span ?? 30,
    plant: plantOf(r),
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
  const description = form.description.trim() || null
  return {
    ...r,
    name: fields.name,
    // Written only once there is one (or was): an untouched routine's save leaves the column alone.
    ...(description !== null || r.description != null ? { description } : {}),
    time_of_day: keepCustomTime ? r.time_of_day : fields.timeOfDay,
    cadence: fields.cadence,
    clock_time: fields.clockTime,
    ...writeSteps(form.steps),
    domain_id: form.domainId || null,
    challenge_start: start,
    challenge_end: start ? addDays(start, form.challengeDays - 1) : null,
    goal_days: challenge ? form.challengeDays : null,
    plant: form.plant,
    updated_at: nowIso,
  }
}
