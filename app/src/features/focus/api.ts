import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { TimeEntry } from '../../lib/types'

export function useTimeEntries() {
  return useQuery({
    queryKey: ['time_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .order('started_at', { ascending: false })
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function logTimeEntry(
  projectId: string | null,
  taskId: string | null,
  note: string | null,
  durationMin: number,
  startedAt: string
): TimeEntry {
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    user_id: '', // Overridden by DB default auth.uid()
    project_id: projectId,
    task_id: taskId,
    note,
    duration_min: durationMin,
    started_at: startedAt,
    ended_at: nowIso(),
    created_at: nowIso(),
    updated_at: nowIso(),
  }

  writeRow('time_entries', entry)
  
  // Log activity. Use projectId if available, else taskId, else a new UUID
  logActivity('project.work_logged', 'project', projectId || taskId || crypto.randomUUID(), {
    note,
    duration_min: durationMin,
  })

  return entry
}
