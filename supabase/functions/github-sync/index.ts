// P6 step 2: GitHub issues → Inbox. Two callers:
//  - pg_cron every 30 min (service-role key from Vault, migration 0042): syncs every user whose
//    GitHub integration is connected and not failing.
//  - a signed-in user's "Sync now" (Settings › Integrations): syncs only that user.
// Anyone else gets 401.
//
//   { action: 'sync' } → { fetched, new, updated, dismissed }            (user)
//                      → { users, failed, fetched, new, updated, dismissed } (cron)
//
// Per user: one search for open issues assigned to them, plus one (rarely two) for their watched
// repos — the search API allows 30 requests/min per token, and every user syncs with their own
// token. New issues become pending `github_issue` inbox items, deduped by
// external_ref {source: 'github', id: node_id} (0027's unique index is the backstop). Pending
// items whose issue dropped out of the results are checked one by one; closed or deleted ones
// are dismissed with payload.dismiss_reason. A 401 from GitHub flips integrations.data.status to
// 'failing' so Settings can say "token expired — reconnect".
//
// ponytail: no AI ranking (P6 step 3). The GitHub section is ordered by the issue's updated_at.
// Upgrade path: rank only `plan.insert` (new issues), in ONE batched parse call per sync,
// counted against the global parse cap via takeAiAllowance (_shared/quota.ts) — ranking every
// user's backlog every 30 min would burn the shared Groq free quota by itself.
//
// Errors are stable codes (SEC-3). The PAT is never logged or returned.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { ghGet, parseRepos, planSync, searchQueries, toPayload, type GhIssue, type PendingRow } from '../_shared/github.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Users synced at once by the cron run. Each uses its own token, so GitHub's limits don't
// interact; this only keeps 100 users inside the function's wall-clock limit.
const CONCURRENCY = 4

interface GithubData {
  token?: string
  login?: string
  repos?: string[]
  status?: 'ok' | 'failing'
  synced_at?: string
}

interface Counts {
  fetched: number
  new: number
  updated: number
  dismissed: number
}

class GithubError extends Error {
  constructor(readonly status: number) {
    super(`github ${status}`)
  }
}

async function searchAll(token: string, login: string, repos: string[]): Promise<GhIssue[]> {
  const out: GhIssue[] = []
  for (const q of searchQueries(login, repos)) {
    // ponytail: one page of 100 per query, most recently updated first. Past 100 open issues the
    // oldest ones aren't imported; add paging if someone really has that many.
    const res = await ghGet(`/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100`, token)
    // 422 = a watched repo was deleted/renamed/lost from the token's scope since connecting.
    // Skip that query rather than fail the whole sync; its items get rechecked and dismissed.
    if (res.status === 422) {
      await res.body?.cancel()
      continue
    }
    if (!res.ok) {
      await res.body?.cancel()
      throw new GithubError(res.status)
    }
    out.push(...((await res.json()) as { items: GhIssue[] }).items)
  }
  return out
}

function must<T>(res: { data: T | null; error: { code?: string } | null }): T {
  if (res.error) throw new Error(`db ${res.error.code ?? 'error'}`)
  return res.data as T
}

interface IntegrationRow {
  user_id: string
  data: GithubData
  updated_at: string
}

async function syncUser(db: SupabaseClient, { user_id: userId, data, updated_at }: IntegrationRow): Promise<Counts> {
  const startedAt = new Date().toISOString()
  const token = data.token ?? ''
  // Every write below is filtered by user_id: the service role bypasses RLS.
  const saveData = (patch: Partial<GithubData>) =>
    db.from('integrations').update({ data: { ...data, ...patch } })
      .eq('user_id', userId).eq('provider', 'github')
      // Only if the row is unchanged since we read it — a reconnect (new token) or a concurrent
      // sync mid-run must not be clobbered. (Not a filter on the token: filters are URL query
      // params, and URLs end up in the API gateway's logs.)
      .eq('updated_at', updated_at)

  try {
    const fetched = await searchAll(token, data.login ?? '', data.repos ?? [])
    const ids = [...new Set(fetched.map((i) => i.node_id))]

    const pending = must(
      await db.from('inbox_items').select('id, raw_text, payload, external_ref')
        .eq('user_id', userId).eq('kind', 'github_issue').eq('status', 'pending').is('deleted_at', null)
        .eq('external_ref->>source', 'github'),
    ) as PendingRow[]
    // Rows in ANY status (filed, dismissed, trashed) block a re-insert.
    const known = ids.length === 0 ? [] : must(
      await db.from('inbox_items').select('ref:external_ref->>id')
        .eq('user_id', userId).eq('external_ref->>source', 'github').in('external_ref->>id', ids),
    ) as { ref: string }[]

    const plan = planSync(fetched, pending, new Set(known.map((k) => k.ref)), data.synced_at ?? null)
    const counts: Counts = { fetched: ids.length, new: 0, updated: 0, dismissed: 0 }

    const inserted = await insertNew(db, plan.insert.map((i) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      kind: 'github_issue',
      raw_text: i.title,
      status: 'pending',
      payload: toPayload(i),
      external_ref: { source: 'github', id: i.node_id },
    })))
    counts.new = inserted.length
    if (inserted.length > 0) {
      must(await db.from('activity_log').insert(inserted.map((id) => ({
        user_id: userId, event_type: 'inbox.captured', entity_type: 'inbox_item', entity_id: id, payload: { kind: 'github_issue' },
      }))))
    }

    for (const u of plan.update) {
      must(await db.from('inbox_items').update({ raw_text: u.raw_text, payload: u.payload })
        .eq('id', u.id).eq('user_id', userId).eq('status', 'pending'))
      counts.updated++
    }

    for (const row of plan.recheck) {
      const verdict = await recheck(token, row)
      if (verdict === 'stop') break
      const payload = verdict === 'open'
        ? { ...row.payload, checked_at: startedAt }
        : { ...row.payload, dismiss_reason: verdict }
      must(await db.from('inbox_items').update(verdict === 'open' ? { payload } : { payload, status: 'dismissed' })
        .eq('id', row.id).eq('user_id', userId).eq('status', 'pending'))
      if (verdict !== 'open') {
        counts.dismissed++
        must(await db.from('activity_log').insert({
          user_id: userId, event_type: 'inbox.dismissed', entity_type: 'inbox_item', entity_id: row.id, payload: { reason: verdict },
        }))
      }
    }

    must(await saveData({ status: 'ok', synced_at: startedAt }))
    return counts
  } catch (e) {
    if (e instanceof GithubError && e.status === 401) await saveData({ status: 'failing' })
    throw e
  }
}

/** Was this pending item's issue closed or deleted? 'stop' = GitHub is rate-limiting or down;
 * leave the rest for the next sync. */
async function recheck(token: string, row: PendingRow): Promise<'open' | 'closed on GitHub' | 'gone from GitHub' | 'stop'> {
  const repo = parseRepos(String(row.payload?.repo ?? ''))?.[0]
  const number = Number(row.payload?.number)
  if (!repo || !Number.isInteger(number) || number <= 0) return 'open' // not ours to judge; stamped so it rotates out
  const res = await ghGet(`/repos/${repo}/issues/${number}`, token)
  if (res.status === 401) {
    await res.body?.cancel()
    throw new GithubError(401)
  }
  if (res.status === 404 || res.status === 410) {
    await res.body?.cancel()
    return 'gone from GitHub'
  }
  if (!res.ok) {
    await res.body?.cancel()
    return 'stop'
  }
  const issue = (await res.json()) as { state?: string }
  return issue.state === 'closed' ? 'closed on GitHub' : 'open'
}

/** Inserts the batch; returns the ids that landed. If a concurrent sync (cron + "Sync now") got
 * there first, the unique index rejects the batch — then row by row, skipping the duplicates. */
async function insertNew(db: SupabaseClient, rows: { id: string }[]): Promise<string[]> {
  if (rows.length === 0) return []
  const { error } = await db.from('inbox_items').insert(rows)
  if (!error) return rows.map((r) => r.id)
  if (error.code !== '23505') throw new Error(`db ${error.code}`)
  const ids: string[] = []
  for (const row of rows) {
    const { error: e } = await db.from('inbox_items').insert(row)
    if (!e) ids.push(row.id)
    else if (e.code !== '23505') throw new Error(`db ${e.code}`)
  }
  return ids
}

function describe(e: unknown): string {
  return e instanceof GithubError ? e.message : e instanceof Error ? e.message : 'error'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── pg_cron: every connected, non-failing user ──
  if (await isServiceRole(req)) {
    const { data: rows, error } = await db.from('integrations').select('user_id, data, updated_at')
      .eq('provider', 'github').eq('data->>status', 'ok')
    if (error) {
      console.error('github-sync: listing integrations failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    const totals = { users: 0, failed: 0, fetched: 0, new: 0, updated: 0, dismissed: 0 }
    const queue = [...(rows as IntegrationRow[])]
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        totals.users++
        try {
          const c = await syncUser(db, row)
          totals.fetched += c.fetched
          totals.new += c.new
          totals.updated += c.updated
          totals.dismissed += c.dismissed
        } catch (e) {
          totals.failed++
          console.error('github-sync: user sync failed', describe(e))
        }
      }
    }))
    return jsonResponse(req, totals)
  }

  // ── A signed-in user's "Sync now" ──
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const { data: row, error } = await db.from('integrations').select('user_id, data, updated_at')
    .eq('user_id', auth.user.id).eq('provider', 'github').maybeSingle()
  if (error) return jsonResponse(req, { error: 'server_error' }, 500)
  if (!row) return jsonResponse(req, { error: 'not_connected' }, 404)
  try {
    return jsonResponse(req, await syncUser(db, row as IntegrationRow))
  } catch (e) {
    console.error('github-sync: sync failed', describe(e))
    if (e instanceof GithubError) {
      return jsonResponse(req, { error: e.status === 401 ? 'token_expired' : 'github_unavailable' }, e.status === 401 ? 409 : 502)
    }
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
