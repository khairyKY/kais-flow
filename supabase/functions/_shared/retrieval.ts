// Shared by `chat` and `search`: embed a query string with the edge-runtime's built-in gte-small
// model (Supabase.ai — no external API, Groq has no embeddings endpoint) and run search_hybrid.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface SearchHit {
  // Migration 0031 widened search_hybrid past tasks/inbox to people, events, projects, journal.
  entity_type: 'task' | 'inbox_item' | 'person' | 'calendar_event' | 'project' | 'area' | 'journal_entry'
  entity_id: string
  title: string
  snippet: string | null
  score: number
}

declare const Supabase: { ai: { Session: new (model: string) => { run: (text: string, opts?: any) => Promise<number[]> } } }

let session: InstanceType<typeof Supabase.ai.Session> | null = null

export async function embedText(text: string): Promise<number[]> {
  session ??= new Supabase.ai.Session('gte-small')
  return await session.run(text, { mean_pool: true, normalize: true })
}

export async function hybridSearch(
  supabase: SupabaseClient,
  queryText: string,
  matchLimit = 20,
): Promise<SearchHit[]> {
  const queryEmbedding = await embedText(queryText)
  const { data, error } = await supabase.rpc('search_hybrid', {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_limit: matchLimit,
  })
  if (error) throw error
  return (data ?? []) as SearchHit[]
}
