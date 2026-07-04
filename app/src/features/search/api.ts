import { supabase } from '../../lib/supabase'
import type { SearchHit } from '../../lib/types'

export async function searchHybrid(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search', { body: { query, limit: 20 } })
  if (error) throw error
  return (data as { results: SearchHit[] }).results
}
