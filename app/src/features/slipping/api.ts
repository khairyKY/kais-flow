import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { logActivity } from '../../lib/activity'
import type { SlippingRow } from '../../lib/types'

const DEFAULT_THRESHOLD_DAYS = 7

// The `slipping` view isn't in the realtime publication (Postgres logical replication only
// covers tables, not views) and activity_log itself is deliberately excluded from realtime too —
// so this refetches periodically rather than expecting a live push.
export function useSlipping(thresholdDays: number = DEFAULT_THRESHOLD_DAYS) {
  return useQuery({
    queryKey: ['slipping'],
    queryFn: async () => {
      const { data, error } = await supabase.from('slipping').select('*')
      if (error) throw error
      return data as SlippingRow[]
    },
    refetchInterval: 60_000,
    select: (rows) => rows.filter((r) => r.days_since > thresholdDays).sort((a, b) => b.days_since - a.days_since),
  })
}

/** Logs a review event and optimistically drops the row now — the underlying view will
 * catch up once the activity_log write actually syncs. */
export function markReviewed(row: SlippingRow): void {
  logActivity('entity.reviewed', row.entity_type, row.entity_id, {})
  queryClient.setQueryData<SlippingRow[]>(['slipping'], (old) =>
    (old ?? []).filter((r) => !(r.entity_type === row.entity_type && r.entity_id === row.entity_id)),
  )
}
