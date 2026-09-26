import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { STAR_EVENTS, type StarEvent } from './top3Today'

/** The star/unstar history of the tasks finished today (./top3Today explains why). One small read:
 * only ids finished today, only three columns. Keeps the last answer while a new completion changes
 * the id list, so a finished pick doesn't blink out of the Top 3 while the next read is in flight. */
export function useStarEvents(taskIds: readonly string[]) {
  const ids = [...taskIds].sort()
  return useQuery({
    queryKey: ['activity_log', 'top3_stars', ids.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('entity_id, event_type, created_at')
        .in('event_type', [...STAR_EVENTS])
        .in('entity_id', ids)
      if (error) throw error
      return data as StarEvent[]
    },
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  })
}
