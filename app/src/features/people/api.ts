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
