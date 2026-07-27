import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import type { SlippingRow } from '../../lib/types'

const DEFAULT_THRESHOLD_DAYS = 7

// Punch 20 — entities reviewed this session. The slipping view recomputes from activity_log,
// but the review event is committed AFTER the undo window (see markReviewed), so a refetch
// inside that window would resurrect the dismissed card without this filter. Never cleared:
// once reviewed, the entity stays un-slipping for days anyway, and a reload re-reads the view.
const locallyReviewed = new Set<string>()
const rowKey = (r: Pick<SlippingRow, 'entity_type' | 'entity_id'>) => `${r.entity_type}:${r.entity_id}`

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
    select: (rows) =>
      rows
        .filter((r) => r.days_since > thresholdDays && !locallyReviewed.has(rowKey(r)))
        .sort((a, b) => b.days_since - a.days_since),
  })
}

// Toast dwell 4s + 160ms exit (Motion 3d) — the review event commits once undo is no longer possible.
const UNDO_WINDOW_MS = 4200

/** Punch 20: optimistically drops the row now and toasts with a working Undo. activity_log has
 * no delete policy (RLS: select + insert only), so a written review event can't be unwound —
 * committing it immediately would make Undo cosmetic (the view re-hides the restored card on the
 * next refetch). The event is therefore written only after the toast's undo window closes.
 * ponytail: closing the tab inside the 4.2s window loses the review; a true server-side undo
 * needs a deletable review marker (migration) — not worth it for a 4-second window. */
export function markReviewed(row: SlippingRow): void {
  locallyReviewed.add(rowKey(row))
  queryClient.setQueryData<SlippingRow[]>(['slipping'], (old) =>
    (old ?? []).filter((r) => rowKey(r) !== rowKey(row)),
  )
  const timer = setTimeout(() => logActivity('entity.reviewed', row.entity_type, row.entity_id, {}), UNDO_WINDOW_MS)
  toastUndo('Marked reviewed', () => {
    clearTimeout(timer)
    locallyReviewed.delete(rowKey(row))
    queryClient.setQueryData<SlippingRow[]>(['slipping'], (old) => {
      const rows = old ?? []
      return rows.some((r) => rowKey(r) === rowKey(row)) ? rows : [...rows, row]
    })
  })
}
