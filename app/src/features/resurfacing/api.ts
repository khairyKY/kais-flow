import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { fileToTask } from '../inbox/api'
import type { InboxItem, ResurfacedLogRow } from '../../lib/types'

// `writeRow`'s optimistic update assumes the cache under `[table]` is the raw array (it does
// findIndex/filter on it), so the array is cached as-is and reduced to "latest" via `select` —
// same split as usePendingInboxItems/useSlipping — rather than pre-reducing inside queryFn.
// `daily-resurface` writes at most one row/day (unique on (user_id, shown_on)), so the latest
// row is always today's pick — reading "latest" instead of filtering on an exact date sidesteps
// any UTC-vs-Cairo date-boundary mismatch between the cron's `current_date` and the client.
export function useLatestResurfaced() {
  return useQuery({
    queryKey: ['resurfaced_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resurfaced_log').select('*').order('shown_on', { ascending: false })
      if (error) throw error
      return data as ResurfacedLogRow[]
    },
    select: (rows) => rows[0] ?? null,
  })
}

/** Inbox-item resurfacing → files it as a real task, same as manual Inbox triage. */
export function convertResurfaced(row: ResurfacedLogRow, item: InboxItem): void {
  fileToTask(item)
  writeRow('resurfaced_log', { ...row, action: 'converted' })
  logActivity('resurfaced.converted', row.entity_type, row.entity_id, {})
}

/** Boosts this entity's weight in future resurfacing picks (see do_resurface's +20 boost). */
export function reviewLaterResurfaced(row: ResurfacedLogRow): void {
  writeRow('resurfaced_log', { ...row, action: 'review_later' })
  logActivity('resurfaced.review_later', row.entity_type, row.entity_id, {})
}

export function dismissResurfaced(row: ResurfacedLogRow): void {
  writeRow('resurfaced_log', { ...row, action: 'dismissed' })
  logActivity('resurfaced.dismissed', row.entity_type, row.entity_id, {})
}
