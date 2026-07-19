import { useEffect } from 'react'
import { supabase } from './supabase'
import { queryClient } from './queryClient'

const SYNCED_TABLES = [
  'domains',
  'projects',
  'tasks',
  'inbox_items',
  'calendar_events',
  'journal_entries',
  'routines',
  'routine_completions',
  'resurfaced_log',
] as const

// Tables carrying `deleted_at` that the Trash page (features/trash/api.ts) unions over —
// any change to them can move rows in/out of the trash list.
const TRASHED_TABLES = new Set(['tasks', 'inbox_items', 'calendar_events', 'journal_entries'])

/** Subscribes once to realtime changes on every synced table and invalidates the matching query cache. */
export function useRealtimeSync() {
  useEffect(() => {
    const channel = supabase.channel('kf-realtime')
    for (const table of SYNCED_TABLES) {
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table },
        () => {
          void queryClient.invalidateQueries({ queryKey: [table] })
          if (TRASHED_TABLES.has(table)) void queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
        },
      )
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])
}
