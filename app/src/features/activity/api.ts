import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { ActivityLogEntry } from '../../lib/types'

export function useRecentActivity(limit = 50) {
  return useQuery({
    queryKey: ['activity_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as ActivityLogEntry[]
    },
  })
}
