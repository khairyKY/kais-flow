import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { localDateKey } from './streaks'
import type { Cadence, Routine, RoutineCompletion, TimeOfDay } from '../../lib/types'

export function useRoutines() {
  return useQuery({
    queryKey: ['routines'],
    queryFn: async () => {
      const { data, error } = await supabase.from('routines').select('*').order('name')
      if (error) throw error
      return data as Routine[]
    },
  })
}

export function useRoutineCompletions() {
  return useQuery({
    queryKey: ['routine_completions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('routine_completions').select('*')
      if (error) throw error
      return data as RoutineCompletion[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

const DAILY_CADENCE: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6] }

export function createRoutine(name: string, timeOfDay: TimeOfDay, cadence: Cadence = DAILY_CADENCE): Routine {
  const routine: Routine = {
    id: crypto.randomUUID(),
    name,
    time_of_day: timeOfDay,
    cadence,
    challenge_start: null,
    challenge_end: null,
    active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('routines', routine)
  logActivity('routine.created', 'routine', routine.id, { name, time_of_day: timeOfDay })
  return routine
}

export function createChallenge(
  name: string,
  timeOfDay: TimeOfDay,
  cadence: Cadence,
  startDate: string,
  endDate: string,
): Routine {
  const routine: Routine = {
    id: crypto.randomUUID(),
    name,
    time_of_day: timeOfDay,
    cadence,
    challenge_start: startDate,
    challenge_end: endDate,
    active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('routines', routine)
  logActivity('routine.created', 'routine', routine.id, { name, challenge: true })
  return routine
}

export function archiveRoutine(routine: Routine): void {
  writeRow('routines', { ...routine, active: false })
  logActivity('routine.archived', 'routine', routine.id, {})
}

/** Toggles today's completion for a routine (idempotent upsert/delete on the unique (routine_id, date)). */
export function toggleCompletion(routine: Routine, date: Date = new Date()): void {
  const dateKey = localDateKey(date)
  const completions = queryClient.getQueryData<RoutineCompletion[]>(['routine_completions']) ?? []
  const existing = completions.find((c) => c.routine_id === routine.id && c.completed_on === dateKey)

  if (existing) {
    writeRow('routine_completions', existing, 'delete')
    logActivity('routine.unchecked', 'routine', routine.id, { date: dateKey })
  } else {
    const completion: RoutineCompletion = {
      id: crypto.randomUUID(),
      routine_id: routine.id,
      completed_on: dateKey,
      created_at: nowIso(),
    }
    writeRow('routine_completions', completion)
    logActivity('routine.checked', 'routine', routine.id, { date: dateKey })
  }
}
