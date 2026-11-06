import { useEffect } from 'react'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useAuth } from '../features/auth/AuthProvider'
import { useAppSettings } from './settings'

const SYNCED_TABLES = [
  'domains',
  'projects',
  'areas',
  'tasks',
  'inbox_items',
  'calendar_events',
  'journal_entries',
  'routines',
  'routine_completions',
  'resurfaced_log',
  'time_entries',
  'smart_lists',
] as const

// Tables carrying `deleted_at` that the Trash page (features/trash/api.ts) unions over —
// any change to them can move rows in/out of the trash list.
const TRASHED_TABLES = new Set(['tasks', 'inbox_items', 'calendar_events', 'journal_entries', 'projects', 'areas', 'domains'])

/** A burst of changes is ONE refetch (gcal-events). google-sync lands a hundred rows at a time (a first sync, a calendar
 * ticked on), Realtime sends a message per row, and each used to cancel the refetch before it and start another — a hundred
 * reads of every row, the screen redrawn on the last. Now a table's invalidation waits for a quiet moment (DEBOUNCE_MS),
 * and for no longer than MAX_WAIT_MS however steady the stream: the screen stays within a second or two of the data. */
export const DEBOUNCE_MS = 300
export const MAX_WAIT_MS = 2000
const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; since: number }>()

export function invalidateSoon(table: string): void {
  const now = Date.now()
  const w = waiting.get(table)
  if (w) clearTimeout(w.timer)
  const since = w?.since ?? now
  const timer = setTimeout(() => {
    waiting.delete(table)
    void queryClient.invalidateQueries({ queryKey: [table] })
    if (TRASHED_TABLES.has(table)) void queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
  }, Math.max(0, Math.min(DEBOUNCE_MS, since + MAX_WAIT_MS - now)))
  waiting.set(table, { timer, since })
}

/** Subscribes to realtime changes on every synced table and invalidates the matching query cache.
 * Scale (free tier: 200 concurrent connections, 2M messages/month): only this user's rows
 * (`filter`, so Realtime doesn't RLS-check every user's change against every subscriber), and no
 * connection while the tab is hidden — returning refetches on focus anyway (TanStack default). */
export function useRealtimeSync() {
  const uid = useAuth().session?.user.id
  // app_settings too once migration 0087 has put it in the publication (its row then carries `prefs`): a
  // setting changed on one device shows on the others while they're open. Not before — a table outside
  // the publication could fail the whole channel.
  const settingsLive = useAppSettings().data?.prefs !== undefined
  useEffect(() => {
    if (!uid) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    const open = () => {
      if (channel) return
      channel = supabase.channel('kf-realtime')
      for (const table of settingsLive ? [...SYNCED_TABLES, 'app_settings'] : SYNCED_TABLES) {
        channel.on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
          () => invalidateSoon(table),
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
  }, [uid, settingsLive])
}
