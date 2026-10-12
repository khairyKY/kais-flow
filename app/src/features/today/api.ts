import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { STAR_EVENTS, type StarEvent } from './top3Today'

const KEY = ['activity_log', 'top3_stars'] as const

/** The star/unstar history of the day's picks — the open Top 3 (when each was starred: the goal
 * before anyone ordered them, ./top3Order) and the tasks finished today (whether they were picks,
 * ./top3Today). One small read: only those ids, only three columns. Keeps the last answer while the
 * id list changes, so a pick doesn't blink out of the Top 3 while the next read is in flight. */
export function useStarEvents(taskIds: readonly string[]) {
  const ids = [...taskIds].sort()
  return useQuery({
    queryKey: [...KEY, ids.join(',')],
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

/** When the weekly review was last closed (`review.week_closed`, WeeklyReviewPage) within the past
 * eight days — enough for Today's review prompt (./todayLayout reviewDue). Under ['activity_log'], so
 * the ritual / review invalidations reach it. */
export function useWeekClosedAt(now: Date) {
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['activity_log', 'week_closed', since],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_log').select('created_at').eq('event_type', 'review.week_closed').gte('created_at', since)
      if (error) throw error
      return (data as { created_at: string }[]).map((r) => r.created_at)
    },
  })
}

/** Every star event this device has read — so Make goal / Move up–down order the Top 3 exactly as
 * Today (or the tray) drew it, from outside React. */
export function cachedStarEvents(): StarEvent[] {
  return queryClient.getQueriesData<StarEvent[]>({ queryKey: [...KEY] }).flatMap(([, rows]) => rows ?? [])
}
