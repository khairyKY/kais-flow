// delete-account (2026-10-25, docs/LEGAL.md): Settings → Your data → Delete account, and the way out of
// the "We've updated our terms" notice. The signed-in user deletes their own account, for good:
//   1. their photos in Storage (paper pages in `captures`, journal photos in `journal`: `<uid>/…`) —
//      Storage objects don't cascade, so they go first;
//   2. the auth user, with the service role: every table's user_id is `on delete cascade`, so all
//      their rows go with it (tasks … consents, push devices, keys, integrations).
// The app disconnects Google first (google-connect `disconnect` removes the busy events it wrote).
// POST { confirm: 'DELETE' } — the word they typed, so a stray call can't delete anyone.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKETS = ['captures', 'journal']

/** Every object under `prefix` (folders walked), a page of 1000 at a time. */
async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const item of data) {
      const path = `${prefix}/${item.name}`
      // A folder has no id (Storage's list).
      if (item.id) out.push(path)
      else out.push(...(await listAll(db, bucket, path)))
    }
    if (data.length < 1000) return out
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== 'DELETE') return jsonResponse(req, { error: 'confirm' }, 400)

  const uid = auth.user.id
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    for (const bucket of BUCKETS) {
      const paths = await listAll(db, bucket, uid)
      for (let i = 0; i < paths.length; i += 1000) {
        const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 1000))
        if (error) throw error
      }
    }
    const { error } = await db.auth.admin.deleteUser(uid)
    if (error) throw error
    return jsonResponse(req, { deleted: true })
  } catch (e) {
    // Details stay in the function log; the app gets a stable code. Nothing half-done matters here:
    // photos gone and the account still there is safe to retry.
    console.error('delete-account:', e)
    return jsonResponse(req, { error: 'failed' }, 500)
  }
})
