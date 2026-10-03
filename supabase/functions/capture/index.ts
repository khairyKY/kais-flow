// P6 step 7: capture from anywhere. POST { text, url? } with `Authorization: Bearer kf_…` (the
// personal capture key from Settings) → a pending text item in that user's Inbox, the same as a
// ⌘K capture. No AI step here: the item waits in the Inbox, so an automation can't spend the
// shared Groq quota. Deployed with verify_jwt = false because the key is not a JWT; the key IS the
// auth (only its SHA-256 is stored, migration 0041). Recipes: docs/CAPTURE.md.
//
//   curl -X POST <project>/functions/v1/capture -H "Authorization: Bearer kf_…" \
//        -H "Content-Type: application/json" -d '{"text":"call the tyre supplier"}'
//
// Opt-in AI filing: POST …/capture?file=1 queues the item for the app's own parse (see below).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@^4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// A leaked key can only fill its owner's own Inbox; this caps how fast.
const DAILY_CAP = 200

// Any origin: a bookmarklet runs on whatever page it's clicked on. Safe because nothing here
// rides on cookies or ambient credentials — a caller must hold the key.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const Body = z.object({
  text: z.string().trim().min(1).max(4000),
  url: z.string().trim().url().max(2000).optional(),
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!/^kf_[A-Za-z0-9_-]{32,}$/.test(key)) return json({ error: 'capture_key_required' }, 401)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json({ error: 'bad_request', expected: '{"text": "…", "url"?: "https://…"}' }, 400)
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  try {
    const { data: owner, error: keyErr } = await db
      .from('capture_keys')
      .select('id, user_id')
      .eq('key_hash', await sha256Hex(key))
      .maybeSingle()
    if (keyErr) throw keyErr
    if (!owner) return json({ error: 'capture_key_invalid' }, 401)

    const since = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count, error: countErr } = await db
      .from('inbox_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', owner.user_id)
      .eq('payload->>source', 'capture')
      .gte('created_at', since)
    if (countErr) throw countErr
    if ((count ?? 0) >= DAILY_CAP) return json({ error: 'daily_limit' }, 429)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    // ?file=1: queue it for the AI instead (needs_parse). The app files it — a task with its date
    // when the parse is confident, else it stays in the Inbox — once it reaches an open device
    // (features/capture/api.ts processQueuedCaptures), on that user's own AI allowance.
    const fileIt = new URL(req.url).searchParams.get('file') === '1'
    const rawText = body.url && !body.text.includes(body.url) ? `${body.text}\n${body.url}` : body.text
    const { error: insErr } = await db.from('inbox_items').insert({
      id,
      user_id: owner.user_id,
      kind: 'text',
      raw_text: rawText,
      status: 'pending',
      payload: { source: 'capture', ...(body.url ? { url: body.url } : {}), ...(fileIt ? { needs_parse: true } : {}) },
      created_at: now,
      updated_at: now,
    })
    if (insErr) throw insErr

    // Same trace a ⌘K capture leaves (lib/activity.ts), so streaks/Activity see it.
    await db.from('activity_log').insert({
      user_id: owner.user_id,
      event_type: 'inbox.captured',
      entity_type: 'inbox_item',
      entity_id: id,
      payload: { kind: 'text', source: 'capture' },
    })
    await db.from('capture_keys').update({ last_used_at: now }).eq('id', owner.id)

    return json({ ok: true, id }, 201)
  } catch (e) {
    console.error('capture:', e)
    return json({ error: 'capture_failed' }, 500)
  }
})
