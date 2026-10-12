// P6 step 1: connect GitHub, plus Settings 2a's rules. A signed-in user:
//
//   { token: string, repos?: string }                  → { login }   (connect / reconnect)
//   { action: 'repos' }                                → { repos }   (the repos the stored token sees,
//                                                                     for the "+ add repo" chip)
//   { action: 'rules', repos: 'owner/a, owner/b', rules: { land, priority, paused } }
//                                                      → { repos, rules }
//
// The token is checked against GitHub and stored in integrations.data with the service role; the
// client never gets it back. A reconnect keeps the watched repos and rules already saved (the client
// can't write `data` itself — that would mean holding the token).
//
// Errors are stable codes (SEC-3): bad_request · invalid_token · token_expired · not_connected ·
// busy · github_unavailable · server_error. Details stay in the function log, never the token.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { ghGet, parseRepos, readRules } from '../_shared/github.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Classic (ghp_…) and fine-grained (github_pat_…) tokens are both [A-Za-z0-9_].
const TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/

type Row = { data: Record<string, unknown>; updated_at: string }

async function readRow(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await db.from('integrations').select('data, updated_at')
    .eq('user_id', userId).eq('provider', 'github').maybeSingle()
  if (error) throw new Error(`db ${error.code ?? 'error'}`)
  return data as Row | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const userId = auth.user.id
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const body = (await req.json().catch(() => null)) as { action?: unknown; token?: unknown; repos?: unknown; rules?: unknown } | null

  try {
    // ── the repo list for the chips — fetched here so the token never leaves the server ──
    if (body?.action === 'repos') {
      const row = await readRow(db, userId)
      const token = typeof row?.data.token === 'string' ? row.data.token : ''
      if (!token) return jsonResponse(req, { error: 'not_connected' }, 404)
      // ponytail: one page of 100, most recently pushed first. Add paging for someone with more.
      const res = await ghGet('/user/repos?per_page=100&sort=pushed', token)
      if (res.status === 401) {
        await res.body?.cancel()
        return jsonResponse(req, { error: 'token_expired' }, 409)
      }
      if (!res.ok) {
        console.error('github-connect: /user/repos answered', res.status)
        await res.body?.cancel()
        return jsonResponse(req, { error: 'github_unavailable' }, 502)
      }
      const list = (await res.json()) as { full_name?: string }[]
      return jsonResponse(req, { repos: list.flatMap((r) => parseRepos(r.full_name ?? '') ?? []) })
    }

    // ── Settings 2a: watched repos + where issues land + inbox priority + pause ──
    if (body?.action === 'rules') {
      const repos = parseRepos(body.repos)
      if (!repos) return jsonResponse(req, { error: 'bad_request' }, 400)
      const rules = readRules(body.rules)
      // Read, merge, write only if the row hasn't changed since the read (a sync stamping synced_at
      // or a reconnect mid-save would otherwise be clobbered); one retry on a lost race.
      for (let attempt = 0; attempt < 2; attempt++) {
        const row = await readRow(db, userId)
        if (!row) return jsonResponse(req, { error: 'not_connected' }, 404)
        const before = Array.isArray(row.data.repos) ? (row.data.repos as string[]) : []
        // A newly watched repo's older issues sit before the sync watermark — clear it so the next
        // sync is a full one (as after a reconnect; known issues are still never re-added).
        const added = repos.some((r) => !before.includes(r))
        const data = { ...row.data, repos, rules, ...(added ? { synced_at: null } : {}) }
        const { data: saved, error } = await db.from('integrations').update({ data })
          .eq('user_id', userId).eq('provider', 'github').eq('updated_at', row.updated_at).select('id')
        if (error) throw new Error(`db ${error.code ?? 'error'}`)
        if (saved?.length) return jsonResponse(req, { repos, rules })
      }
      return jsonResponse(req, { error: 'busy' }, 409)
    }

    // ── connect / reconnect ──
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    // Installed app versions from before the chips still send the watched repos with the token.
    const given = body?.repos === undefined ? undefined : parseRepos(body.repos)
    if (!TOKEN_RE.test(token) || given === null) return jsonResponse(req, { error: 'bad_request' }, 400)

    const me = await ghGet('/user', token)
    if (me.status === 401) {
      await me.body?.cancel()
      return jsonResponse(req, { error: 'invalid_token' }, 400)
    }
    if (!me.ok) {
      console.error('github-connect: /user answered', me.status)
      await me.body?.cancel()
      return jsonResponse(req, { error: 'github_unavailable' }, 502)
    }
    const { login } = (await me.json()) as { login?: string }
    if (!login) return jsonResponse(req, { error: 'github_unavailable' }, 502)

    // Keep what the user already chose (watched repos, rules); a first connect starts with none.
    const prior = (await readRow(db, userId))?.data ?? {}
    const keep = { repos: given ?? (Array.isArray(prior.repos) ? prior.repos : []), ...(prior.rules ? { rules: prior.rules } : {}) }
    // No synced_at: the first sync after (re)connecting is a full one (see planSync's watermark).
    const { error } = await db
      .from('integrations')
      .upsert({ user_id: userId, provider: 'github', data: { token, login, ...keep, status: 'ok' } }, { onConflict: 'user_id,provider' })
    if (error) {
      console.error('github-connect: upsert failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    return jsonResponse(req, { login })
  } catch (e) {
    const dbFail = e instanceof Error && e.message.startsWith('db ')
    console.error('github-connect:', dbFail ? (e as Error).message : e instanceof Error ? e.name : 'error')
    return dbFail ? jsonResponse(req, { error: 'server_error' }, 500) : jsonResponse(req, { error: 'github_unavailable' }, 502)
  }
})
