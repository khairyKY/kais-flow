// P5 addendum #11: dedicated keyword/semantic Search UI — same hybrid retrieval as `chat` but no
// Groq round-trip, so it's cheap enough to call on every keystroke-debounce.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { hybridSearch } from '../_shared/retrieval.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S3: a signed-in user, not merely the public anon key. Retrieval below still runs as
  // that user (their JWT is forwarded), so RLS scopes every row.
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  try {
    const authHeader = `Bearer ${auth.token}`
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { query, limit } = (await req.json()) as { query: string; limit?: number }
    if (!query || !query.trim()) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await hybridSearch(supabase, query, limit ?? 20)
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('search:', e)
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
