// Kai 2026-10-07: "When they capture something, every property is extracted — date, time, priority,
// description — like Akiflow… Let the AI understand the intent and decide." A typed capture is
// written at once from the local parse (never waits on the network); the AI parse then fills in
// only what is still empty. Pure, so the merge rule is unit-tested (aiFill.test.ts).
import type { ParseResult } from './parseSchema'
import type { CreateTaskInput } from '../tasks/api'
import type { Task } from '../../lib/types'

/** At or above this, the AI may place a capture (project/domain) or file it as a task by itself. */
export const CONFIDENCE_THRESHOLD = 0.75 // TODO(P4): app_settings.confidence_threshold

/** The places that exist here — a model can make up an id, and a write naming one would park. */
export interface KnownPlaces {
  projects: { id: string; domain_id: string | null }[]
  domainIds: string[]
}

export type AiFields = Pick<Task, 'title' | 'notes' | 'due_at' | 'priority' | 'duration_min' | 'project_id' | 'domain_id' | 'reminder_at'>

const validIso = (s: string | null | undefined): s is string => !!s && !Number.isNaN(Date.parse(s))
const priorityOf = (p: number | null | undefined) => (p === 1 || p === 2 || p === 3 ? p : null)
const durationOf = (m: number | null | undefined) => (m != null && Number.isFinite(m) && m > 0 && m <= 24 * 60 ? Math.round(m) : null)
const textOf = (s: string | null | undefined) => s?.trim() || null

/** The AI's project (with its own domain) or domain — only ids that exist, only when it's confident. */
export function aiPlace(ai: ParseResult, known: KnownPlaces): { project_id: string | null; domain_id: string | null } {
  if (ai.confidence < CONFIDENCE_THRESHOLD) return { project_id: null, domain_id: null }
  const project = ai.project_id ? known.projects.find((p) => p.id === ai.project_id) : undefined
  if (project) return { project_id: project.id, domain_id: project.domain_id }
  return { project_id: null, domain_id: ai.domain_id && known.domainIds.includes(ai.domain_id) ? ai.domain_id : null }
}

/**
 * What the AI may change on a task a typed capture just created. The rule: **it only fills empties.**
 * An explicit token (`!`, `30m`, `#tag`, the date the preview chip showed) already set its field, so
 * it always beats the AI — as does anything the person changed since. The title is the one value it
 * may replace, and only when it pulled something else out of the words (a priority from "asap", a
 * description) and the title is still the one typed: the words it turned into fields leave the title.
 * Returns the patch and, for the toast, the fields it filled.
 */
export function aiFill(current: AiFields, ai: ParseResult, known: KnownPlaces, typedTitle: string): { patch: Partial<AiFields>; filled: string[] } {
  const patch: Partial<AiFields> = {}
  const filled: string[] = []
  if (current.due_at == null && validIso(ai.due_at)) {
    patch.due_at = new Date(ai.due_at).toISOString()
    filled.push('date')
  }
  const priority = priorityOf(ai.priority)
  if (current.priority == null && priority != null) {
    patch.priority = priority
    filled.push('priority')
  }
  const duration = durationOf(ai.duration_min)
  if (current.duration_min == null && duration != null) {
    patch.duration_min = duration
    filled.push('duration')
  }
  const place = aiPlace(ai, known)
  if (current.project_id == null && current.domain_id == null && (place.project_id || place.domain_id)) {
    Object.assign(patch, place)
    filled.push(place.project_id ? 'project' : 'domain')
  }
  const due = patch.due_at ?? current.due_at
  if (current.reminder_at == null && due && ai.reminder_offset_min != null && ai.reminder_offset_min > 0) {
    patch.reminder_at = new Date(Date.parse(due) - ai.reminder_offset_min * 60_000).toISOString()
    filled.push('reminder')
  }
  const notes = textOf(ai.description)
  if (!textOf(current.notes) && notes) {
    patch.notes = notes
    filled.push('notes')
  }
  const title = textOf(ai.title)
  if (filled.length && title && current.title === typedTitle && title !== current.title) patch.title = title
  return { patch, filled }
}

/** A capture the AI filed by itself (voice, ⌘↵, a queued or typed Inbox line): everything it read,
 * with the locally typed `!` / `30m` (overrides) beating its own reading. */
export function taskFromParse(ai: ParseResult, known: KnownPlaces, overrides: { priority?: number | null; durationMin?: number | null } = {}): CreateTaskInput {
  const place = aiPlace(ai, known)
  return {
    title: textOf(ai.title) ?? ai.cleaned_text,
    domainId: place.domain_id,
    projectId: place.project_id,
    dueAt: validIso(ai.due_at) ? new Date(ai.due_at).toISOString() : null,
    reminderOffsetMin: ai.reminder_offset_min ?? null,
    durationMin: overrides.durationMin ?? durationOf(ai.duration_min),
    priority: overrides.priority ?? priorityOf(ai.priority),
    notes: textOf(ai.description),
  }
}
