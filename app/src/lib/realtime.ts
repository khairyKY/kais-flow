import { useEffect } from 'react'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useAuth } from '../features/auth/AuthProvider'

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

/** Subscribes to realtime changes on every synced table and invalidates the matching query cache.
 * Scale (free tier: 200 concurrent connections, 2M messages/month): only this user's rows
 * (`filter`, so Realtime doesn't RLS-check every user's change against every subscriber), and no
 * connection while the tab is hidden — returning refetches on focus anyway (TanStack default). */
export function useRealtimeSync() {
  const uid = useAuth().session?.user.id
  useEffect(() => {
    if (!uid) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    const open = () => {
      if (channel) return
      channel = supabase.channel('kf-realtime')
      for (const table of SYNCED_TABLES) {
        channel.on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
          () => {
            void queryClient.invalidateQueries({ queryKey: [table] })
            if (TRASHED_TABLES.has(table)) void queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
          },
        )
      }
      channel.subscribe()
    }
    const close = () => {
      if (channel) void supabase.removeChannel(channel)
      channel = null
    }
    const onVisibility = () => (document.hidden ? close() : open())
    if (!document.hidden) open()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      close()
    }
  }, [uid])
}
