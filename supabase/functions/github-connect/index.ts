// P6 step 1: connect GitHub. A signed-in user posts a fine-grained PAT (+ optional watched repos);
// the token is checked against GitHub and stored in integrations.data with the service role.
// The client only ever gets `{ login }` back — the token never leaves the server again.
//
//   { token: string, repos?: 'owner/a, owner/b' } → { login }
//
// Errors are stable codes (SEC-3): bad_request · invalid_token · repo_not_found (+ repo) ·
// github_unavailable · server_error. Details stay in the function log, never the token.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { ghGet, parseRepos } from '../_shared/github.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Classic (ghp_…) and fine-grained (github_pat_…) tokens are both [A-Za-z0-9_].
const TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => null)) as { token?: unknown; repos?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const repos = parseRepos(body?.repos)
  if (!TOKEN_RE.test(token) || !repos) return jsonResponse(req, { error: 'bad_request' }, 400)

  try {
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

    // A typo'd or out-of-scope repo would make its search query fail on every sync — catch it now.
    for (const repo of repos) {
      const r = await ghGet(`/repos/${repo}`, token)
      await r.body?.cancel()
      // Private repos the token can't see answer 404 too, not 403 (403 is a rate limit).
      if (r.status === 404) return jsonResponse(req, { error: 'repo_not_found', repo }, 400)
      if (!r.ok) return jsonResponse(req, { error: 'github_unavailable' }, 502)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    // No synced_at: the first sync after (re)connecting is a full one (see planSync's watermark).
    const { error } = await supabase
      .from('integrations')
      .upsert({ user_id: auth.user.id, provider: 'github', data: { token, login, repos, status: 'ok' } }, { onConflict: 'user_id,provider' })
    if (error) {
      console.error('github-connect: upsert failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    return jsonResponse(req, { login })
  } catch (e) {
    console.error('github-connect:', e instanceof Error ? e.name : 'error')
    return jsonResponse(req, { error: 'github_unavailable' }, 502)
  }
})
