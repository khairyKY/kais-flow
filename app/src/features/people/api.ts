import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { queryClient } from '../../lib/queryClient'
import { toastUndo } from '../../lib/undo'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { Person, Interaction, Fact } from '../../lib/types'

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Person[]
    },
  })
}

export function useInteractions() {
  return useQuery({
    queryKey: ['interactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data as Interaction[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

// ── Punch 46: the nudge "later" chip ──────────────────────────────────────────
// Snooze ledger `{personId: wakeAt ISO}` on this device. ponytail: a parked nudge is a UI
// suggestion about data, not data — not worth a table + RLS + migration. Same ledger shape as
// resurfacing's "Later" (features/resurfacing/api.ts). Upgrade path: a `nudge_snoozed_until`
// column on `people` if a park has to follow Kai across devices.
const NUDGE_SNOOZE_KEY = 'kf.peopleNudgeSnoozes'
export const NUDGE_SNOOZE_DAYS = 7

export function readNudgeSnoozes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NUDGE_SNOOZE_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Park (`wakeAt` ISO) or un-park (`null`) a person's nudge. Returns the new map, for React state. */
export function setNudgeSnooze(personId: string, wakeAt: string | null): Record<string, string> {
  const map = readNudgeSnoozes()
  if (wakeAt) map[personId] = wakeAt
  else delete map[personId]
  try {
    localStorage.setItem(NUDGE_SNOOZE_KEY, JSON.stringify(map))
  } catch {
    /* storage full — the park just won't survive a reload */
  }
  return map
}

export function isNudgeSnoozed(map: Record<string, string>, personId: string, now = Date.now()): boolean {
  const wake = map[personId]
  return !!wake && Date.parse(wake) > now
}

/* Days until the next occurrence of a "MM-DD" / "YYYY-MM-DD" (the date picker's) or freeform
 * month-day string ("July 17"), counted on the user's calendar (lib/appZone). Null if unparseable. */
export function getDaysUntilBirthday(val: string | undefined | null, now: Date = new Date()): number | null {
  if (!val) return null
  let month: number
  let day: number
  const parts = val.trim().split('-')
  if (parts.length >= 2 && parts.every((p) => /^\d+$/.test(p))) {
    month = Number(parts[parts.length - 2])
    day = Number(parts[parts.length - 1])
  } else {
    const d = new Date(`${val} 2000`) // parsed and read in one (device) zone: just a month + day
    if (isNaN(d.getTime())) return null
    month = d.getMonth() + 1
    day = d.getDate()
  }
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  const [y, m, d] = zoneDateKey(now).split('-').map(Number)
  const today = Date.UTC(y, m - 1, d)
  let next = Date.UTC(y, month - 1, day)
  if (next < today) next = Date.UTC(y + 1, month - 1, day)
  return Math.round((next - today) / 86400000)
}

export function upsertPerson(
  person: Partial<Person> & { name: string },
  isNew: boolean
): Person {
  const finalPerson: Person = {
    id: person.id || crypto.randomUUID(),
    user_id: person.user_id || '',
    name: person.name,
    facts: person.facts ?? [],
    domain_id: person.domain_id ?? null,
    created_at: person.created_at || nowIso(),
    updated_at: nowIso(),
  }

  writeRow('people', finalPerson)
  logActivity(
    isNew ? 'people.created' : 'people.updated',
    'people',
    finalPerson.id,
    { name: finalPerson.name }
  )
  return finalPerson
}

export function deletePerson(personId: string): void {
  writeRow('people', { id: personId } as Person, 'delete')
  logActivity('people.deleted', 'people', personId)
}

/** Delete = Undo toast, no confirm (Flow Audit §4). The server cascades a person's interactions,
 * so both are captured first; Undo puts the person back, then every interaction (outbox order). */
export function deletePersonWithUndo(person: Person): void {
  const touches = (queryClient.getQueryData<Interaction[]>(['interactions']) ?? []).filter((i) => i.person_id === person.id)
  deletePerson(person.id)
  queryClient.setQueryData<Interaction[]>(['interactions'], (old) => old?.filter((i) => i.person_id !== person.id))
  toastUndo(`Deleted · ${person.name}`, () => restorePerson(person, touches))
}

export function restorePerson(person: Person, touches: Interaction[]): void {
  writeRow('people', person)
  for (const i of touches) writeRow('interactions', i)
  logActivity('people.restored', 'people', person.id, { name: person.name })
}

/** `facts` with `fact` put back at `index` (a removal's Undo) — unless it's already there. */
export function withFactRestored(facts: Fact[], fact: Fact, index: number): Fact[] {
  if (facts.some((f) => f.id === fact.id)) return facts
  const next = [...facts]
  next.splice(Math.min(Math.max(index, 0), next.length), 0, fact)
  return next
}

/** `facts` with `fact` replacing the one with its id, or added at the end. */
export function withFactSaved(facts: Fact[], fact: Fact): Fact[] {
  return facts.some((f) => f.id === fact.id) ? facts.map((f) => (f.id === fact.id ? fact : f)) : [...facts, fact]
}

export function removeFactWithUndo(person: Person, factId: string): void {
  const facts = person.facts ?? []
  const index = facts.findIndex((f) => f.id === factId)
  if (index < 0) return
  const fact = facts[index]
  upsertPerson({ ...person, facts: facts.filter((f) => f.id !== factId) }, false)
  toastUndo(`Removed · ${fact.label}`, () => {
    // Write back onto the person as it is NOW (a rename since then stays).
    const current = queryClient.getQueryData<Person[]>(['people'])?.find((p) => p.id === person.id) ?? person
    upsertPerson({ ...current, facts: withFactRestored(current.facts ?? [], fact, index) }, false)
  })
}

export const TOUCH_SUMMARY = { call: 'Phone call catch up', text: 'Text message catch up', meet: 'Met in person' } as const
export type TouchChannel = keyof typeof TOUCH_SUMMARY

/** The one-tap call / text / met chips: logged now, with Undo. */
export function logTouchWithUndo(person: Pick<Person, 'id' | 'name'>, channel: TouchChannel): void {
  const row = createInteraction({ person_id: person.id, summary: TOUCH_SUMMARY[channel], occurred_at: nowIso() })
  toastUndo(`${channel === 'call' ? 'Call' : channel === 'text' ? 'Text' : 'Meeting'} logged · ${person.name}`, () => deleteInteraction(row.id))
}

export function createInteraction(
  interaction: Partial<Interaction> & { person_id: string; summary: string; occurred_at: string }
): Interaction {
  const finalInteraction: Interaction = {
    id: interaction.id || crypto.randomUUID(),
    user_id: interaction.user_id || '',
    person_id: interaction.person_id,
    summary: interaction.summary,
    occurred_at: interaction.occurred_at,
    created_at: interaction.created_at || nowIso(),
    updated_at: nowIso(),
  }

  writeRow('interactions', finalInteraction)
  logActivity(
    'people.interaction_logged',
    'people',
    interaction.person_id,
    { summary: interaction.summary }
  )
  return finalInteraction
}

/** An interaction's summary or day, edited on the person's page (Kai 2026-10-12). */
export function updateInteraction(interaction: Interaction, fields: Partial<Pick<Interaction, 'summary' | 'occurred_at'>>): void {
  writeRow('interactions', { ...interaction, ...fields, updated_at: nowIso() })
  logActivity('people.interaction_edited', 'people', interaction.person_id, { summary: fields.summary ?? interaction.summary })
}

export function deleteInteraction(interactionId: string): void {
  writeRow('interactions', { id: interactionId } as Interaction, 'delete')
  logActivity('people.interaction_deleted', 'people', interactionId)
}

export function deleteInteractionWithUndo(interaction: Interaction): void {
  deleteInteraction(interaction.id)
  toastUndo('Interaction removed', () => writeRow('interactions', interaction))
}
