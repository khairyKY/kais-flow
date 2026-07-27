import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { Person, Interaction } from '../../lib/types'

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

/* Days until the next occurrence of a "MM-DD" or freeform month-day string. Null if unparseable. */
export function getDaysUntilBirthday(val: string | undefined | null): number | null {
  if (!val) return null
  let month = 0
  let day = 0
  if (val.includes('-')) {
    const [m, d] = val.split('-')
    month = parseInt(m, 10) - 1
    day = parseInt(d, 10)
  } else {
    const d = new Date(val + ' ' + new Date().getFullYear())
    if (isNaN(d.getTime())) return null
    month = d.getMonth()
    day = d.getDate()
  }
  const today = new Date()
  const y = today.getFullYear()
  const bday = new Date(y, month, day)
  bday.setHours(0, 0, 0, 0)
  const todayZero = new Date(y, today.getMonth(), today.getDate())
  let diff = bday.getTime() - todayZero.getTime()
  if (diff < 0) {
    const next = new Date(y + 1, month, day)
    next.setHours(0, 0, 0, 0)
    diff = next.getTime() - todayZero.getTime()
  }
  return Math.ceil(diff / 86400000)
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

export function deleteInteraction(interactionId: string): void {
  writeRow('interactions', { id: interactionId } as Interaction, 'delete')
  logActivity('people.interaction_deleted', 'people', interactionId)
}
