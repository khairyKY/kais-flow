import { useEffect } from 'react'
import { supabase } from './supabase'
import { queryClient } from './queryClient'

const SYNCED_TABLES = ['domains', 'projects', 'tasks', 'inbox_items'] as const

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
        },
      )
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])
}
