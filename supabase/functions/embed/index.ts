// P5: drains embed_queue in batches (Supabase.ai gte-small, no external API) + one-off backfill.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { embedText } from '../_shared/retrieval.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BATCH_SIZE = 50
const MAX_BATCHES = 20 // safety cap so a large backfill can't run away in one invocation

async function enqueueMissing(supabase: any, table: string, entityType: 'task' | 'inbox_item') {
  const { data: rows } = await supabase.from(table).select('*').is('embedding', null)
  for (const row of rows ?? []) {
    const content = entityType === 'task' ? `${row.title ?? ''} ${row.notes ?? ''}` : (row.raw_text as string)
    await supabase.from('embed_queue').upsert(
      { entity_type: entityType, entity_id: row.id, content, user_id: row.user_id, status: 'pending' },
      { onConflict: 'entity_type,entity_id' },
    )
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S5: only pg_cron (service-role key from Vault, 0009_search_cron.sql) may drain the
  // queue or trigger a backfill — both are cross-tenant service-role work.
  if (!isServiceRole(req)) return jsonResponse(req, { error: 'unauthorized' }, 401)

  try {
    const { backfill } = (await req.json().catch(() => ({}))) as { backfill?: boolean }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    if (backfill) {
      await enqueueMissing(supabase, 'tasks', 'task')
      await enqueueMissing(supabase, 'inbox_items', 'inbox_item')
    }

    let embedded = 0
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { data: batch } = await supabase.from('embed_queue').select('*').eq('status', 'pending').limit(BATCH_SIZE)
      if (!batch || batch.length === 0) break

      for (const row of batch) {
        try {
          const vector = await embedText(row.content as string)
          const table = row.entity_type === 'task' ? 'tasks' : 'inbox_items'
          const { error: updateError } = await supabase.from(table).update({ embedding: vector }).eq('id', row.entity_id)
          if (updateError) throw updateError
          await supabase.from('embed_queue').update({ status: 'done' }).eq('id', row.id)
          embedded++
        } catch {
          await supabase.from('embed_queue').update({ status: 'error' }).eq('id', row.id)
        }
      }
      if (batch.length < BATCH_SIZE) break
    }

    const { count: remaining } = await supabase
      .from('embed_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return new Response(JSON.stringify({ embedded, remaining: remaining ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
