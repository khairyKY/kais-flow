// GitHub rules (Settings 2a), 2026-10-13: github-connect + github-sync run for real under Deno with
// every fetch answered in memory — a tiny PostgREST over five tables, the auth server, and GitHub.
// Checks what the rules change on the server: scope (onlyRepos), Straight to Tasks (+ dedupe across
// inbox/tasks, the recheck ticking synced tasks off, hand-filed tasks untouched), Pause (cron skips,
// "Sync now" answers `paused`), the rules save (merge, watermark reset, updated_at guard + retry),
// the repo list, a reconnect keeping repos/rules, and the token never leaving the server.
//
//   cd supabase/functions && npx deno@2 run --allow-env --allow-net --allow-read --allow-sys \
//     ../../docs/log/assets/github-rules/functions-check.ts
/* eslint-disable */

Deno.env.set('SUPABASE_URL', 'http://db.test')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key')

const TOKEN = 'github_pat_SECRETSECRETSECRET123'
const U1 = '00000000-0000-4000-8000-000000000001'
const U2 = '00000000-0000-4000-8000-000000000002'

let pass = 0, fail = 0
const check = (name: string, ok: unknown, detail = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── in-memory PostgREST ──
type Row = Record<string, any>
const db: Record<string, Row[]> = { integrations: [], inbox_items: [], tasks: [], activity_log: [] }
let clock = Date.parse('2026-10-13T08:00:00Z')
const tick = () => new Date((clock += 1000)).toISOString()
const path = (row: Row, p: string): any => {
  const parts = p.split(/->>|->/)
  let v: any = row
  for (const k of parts) v = v == null ? undefined : v[k]
  return p.includes('->>') && v != null && typeof v !== 'string' ? String(v) : v
}
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'on_conflict' || k === 'columns') continue
    const v = path(row, k)
    const [op, ...rest] = raw.split('.')
    const arg = rest.join('.')
    if (op === 'eq' && String(v) !== arg) return false
    if (op === 'is' && arg === 'null' && v != null) return false
    if (op === 'in') {
      const list = arg.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
      if (!list.includes(String(v))) return false
    }
  }
  return true
}
function project(row: Row, select: string | null): Row {
  if (!select || select === '*') return row
  const out: Row = {}
  for (const col of select.split(',')) {
    const [alias, p] = col.includes(':') ? col.split(':') : [col.split(/->>|->/).pop()!, col]
    out[alias] = path(row, p)
  }
  return out
}
const UNIQUE: Record<string, (r: Row) => string | null> = {
  inbox_items: (r) => (r.external_ref ? `${r.user_id}|${r.external_ref.source}|${r.external_ref.id}` : null),
  tasks: (r) => (r.external_ref ? `${r.user_id}|${r.external_ref.source}|${r.external_ref.id}` : null),
  integrations: (r) => `${r.user_id}|${r.provider}`,
}
/** Called before an UPDATE lands — lets a test change the row underneath the function. */
let beforeUpdate: ((table: string) => void) | null = null

async function rest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const table = url.pathname.replace('/rest/v1/', '')
  const rows = db[table]
  const params = url.searchParams
  const single = (req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')
  const wantRows = (req.headers.get('Prefer') ?? '').includes('return=representation')
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (req.method === 'GET') {
    const hit = rows.filter((r) => matches(r, params)).map((r) => project(r, params.get('select')))
    if (single) return hit.length === 1 ? json(hit[0]) : json({ code: 'PGRST116', message: 'no rows', details: '', hint: '' }, 406)
    return json(hit)
  }
  const body = await req.json()
  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body]
    const upsert = (req.headers.get('Prefer') ?? '').includes('resolution=merge-duplicates')
    const key = UNIQUE[table]
    // all-or-nothing, like one INSERT statement
    const staged = [...rows]
    for (const r of list) {
      const now = tick()
      const row = { created_at: now, updated_at: now, deleted_at: null, ...r }
      if (table === 'tasks') Object.assign(row, { status: r.status ?? 'todo', top3: false, completed_at: null, ...r })
      const k = key?.(row)
      const dup = k ? staged.findIndex((x) => key!(x) === k) : -1
      if (dup >= 0 && upsert) staged[dup] = { ...staged[dup], ...row, created_at: staged[dup].created_at }
      else if (dup >= 0) return json({ code: '23505', message: 'duplicate key value violates unique constraint', details: '', hint: '' }, 409)
      else staged.push(row)
    }
    db[table] = staged
    return wantRows ? json(list) : new Response(null, { status: 201 })
  }
  if (req.method === 'PATCH') {
    beforeUpdate?.(table)
    const hit = rows.filter((r) => matches(r, params))
    for (const r of hit) Object.assign(r, body, { updated_at: tick() })
    return wantRows ? json(hit.map((r) => project(r, params.get('select')))) : new Response(null, { status: 204 })
  }
  return json({ message: 'unsupported' }, 400)
}

// ── GitHub ──
type Issue = { node_id: string; number: number; title: string; repo: string; assignee?: string; state: 'open' | 'closed' | 'gone'; updated_at: string; created_at: string }
let issues: Issue[] = []
const ghCalls: string[] = []
const toSearch = (i: Issue) => ({
  node_id: i.node_id, number: i.number, title: i.title, html_url: `https://github.com/${i.repo}/issues/${i.number}`,
  repository_url: `https://api.github.com/repos/${i.repo}`, updated_at: i.updated_at, created_at: i.created_at, labels: [],
})
function github(req: Request): Response {
  const url = new URL(req.url)
  ghCalls.push(decodeURIComponent(url.pathname + url.search))
  const auth = req.headers.get('Authorization')
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (auth !== `Bearer ${TOKEN}`) return json({ message: 'Bad credentials' }, 401)
  if (url.pathname === '/user') return json({ login: 'kai' })
  if (url.pathname === '/user/repos') return json([{ full_name: 'acme/app' }, { full_name: 'acme/web' }, { full_name: 'not a repo' }])
  if (url.pathname === '/search/issues') {
    const q = url.searchParams.get('q')!
    const assignee = /assignee:(\S+)/.exec(q)?.[1]
    const repos = [...q.matchAll(/repo:(\S+)/g)].map((m) => m[1])
    const items = issues.filter((i) => i.state === 'open' && (assignee ? i.assignee === assignee : repos.includes(i.repo)))
    return json({ items: items.map(toSearch) })
  }
  const m = /^\/repos\/(.+\/.+)\/issues\/(\d+)$/.exec(url.pathname)
  if (m) {
    const i = issues.find((x) => x.repo === m[1] && x.number === Number(m[2]))
    if (!i || i.state === 'gone') return json({ message: 'Not Found' }, 404)
    return json({ state: i.state })
  }
  return json({ message: 'Not Found' }, 404)
}

const users: Record<string, string> = { 'jwt-u1': U1, 'jwt-u2': U2 }
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const req = new Request(input, init)
  const url = new URL(req.url)
  if (url.host === 'api.github.com') return github(req)
  if (url.pathname === '/auth/v1/user') {
    const id = users[(req.headers.get('Authorization') ?? '').replace('Bearer ', '')]
    return id
      ? new Response(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ message: 'invalid JWT' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  if (url.pathname.startsWith('/rest/v1/')) return rest(req)
  throw new Error(`unexpected fetch ${req.url}`)
}) as typeof fetch

// ── load both functions, keeping their handlers ──
const handlers: ((req: Request) => Promise<Response>)[] = []
;(Deno as any).serve = (h: (req: Request) => Promise<Response>) => (handlers.push(h), { finished: Promise.resolve() })
await import('../../../../supabase/functions/github-sync/index.ts')
await import('../../../../supabase/functions/github-connect/index.ts')
const [syncFn, connectFn] = handlers
const call = async (fn: (r: Request) => Promise<Response>, bearer: string, body: unknown) => {
  const res = await fn(new Request('http://fn.test/', { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const text = await res.text()
  return { status: res.status, text, body: JSON.parse(text) }
}

const ISO = (d: string) => `2026-10-${d}T00:00:00Z`
const gh = (n: number, repo: string, over: Partial<Issue> = {}): Issue => ({ node_id: `I_${repo}_${n}`, number: n, title: `${repo}#${n}`, repo, state: 'open', updated_at: ISO('12'), created_at: ISO('01'), ...over })
const integ = (user_id: string, data: Row) => ({ id: crypto.randomUUID(), user_id, provider: 'github', data: { token: TOKEN, login: 'kai', status: 'ok', ...data }, created_at: ISO('01'), updated_at: tick() })
const rowOf = (u: string) => db.integrations.find((r) => r.user_id === u)!

// ════ 1. No rules saved: today's behaviour (assigned anywhere + watched repos → Inbox) ════
issues = [gh(1, 'acme/app'), gh(2, 'other/lib', { assignee: 'kai' }), gh(3, 'acme/web')]
db.integrations.push(integ(U1, { repos: ['acme/app'] }))
ghCalls.length = 0
let r = await call(syncFn, 'jwt-u1', { action: 'sync' })
check('legacy: sync answers 200 with counts', r.status === 200 && r.body.new === 2 && r.body.completed === 0, r.text)
check('legacy: both the assignee query and the repo query ran', ghCalls.some((c) => c.includes('assignee:kai')) && ghCalls.some((c) => c.includes('repo:acme/app')), ghCalls.join(' | '))
check('legacy: the issues landed as pending inbox letters', db.inbox_items.length === 2 && db.inbox_items.every((i) => i.kind === 'github_issue' && i.status === 'pending'))
check('legacy: no tasks were made', db.tasks.length === 0)
check('legacy: synced_at stamped, status ok', rowOf(U1).data.synced_at && rowOf(U1).data.status === 'ok')

// ════ 2. The rules save (github-connect) ════
r = await call(connectFn, 'jwt-u1', { action: 'repos' })
check('repos: the list comes back without the token, malformed names dropped', r.status === 200 && JSON.stringify(r.body.repos) === '["acme/app","acme/web"]' && !r.text.includes(TOKEN), r.text)
r = await call(connectFn, 'jwt-u1', { action: 'rules', repos: 'acme/app,acme/web', rules: { land: 'tasks', priority: 'high', paused: false, junk: 1 } })
check('rules: saved and echoed (unknown keys dropped)', r.status === 200 && JSON.stringify(r.body) === '{"repos":["acme/app","acme/web"],"rules":{"land":"tasks","priority":"high","paused":false}}', r.text)
check('rules: the token, login and status survive the merge', rowOf(U1).data.token === TOKEN && rowOf(U1).data.login === 'kai' && rowOf(U1).data.status === 'ok')
check('rules: a newly watched repo clears the watermark (next sync is a full one)', rowOf(U1).data.synced_at === null)
check('rules: the response never carries the token', !r.text.includes(TOKEN))
r = await call(connectFn, 'jwt-u1', { action: 'rules', repos: 'acme/app; drop table', rules: {} })
check('rules: a malformed repo list is refused', r.status === 400 && r.body.error === 'bad_request', r.text)
r = await call(connectFn, 'jwt-u2', { action: 'rules', repos: '', rules: {} })
check('rules: not connected answers not_connected', r.status === 404 && r.body.error === 'not_connected', r.text)
// updated_at guard: a sync stamps the row between the function's read and its write → it re-reads and wins on the retry
let raced = 0
beforeUpdate = (t) => { if (t === 'integrations' && raced++ === 0) rowOf(U1).updated_at = tick() }
r = await call(connectFn, 'jwt-u1', { action: 'rules', repos: 'acme/app,acme/web', rules: { land: 'tasks', priority: 'high', paused: false } })
beforeUpdate = null
check('rules: a row changed mid-save is not clobbered — retried and saved', r.status === 200 && raced === 2, `updates tried ${raced}`)
beforeUpdate = (t) => { if (t === 'integrations') rowOf(U1).updated_at = tick() }
r = await call(connectFn, 'jwt-u1', { action: 'rules', repos: 'acme/app,acme/web', rules: { land: 'tasks', priority: 'high', paused: false } })
beforeUpdate = null
check('rules: losing the race twice answers busy, nothing written', r.status === 409 && r.body.error === 'busy', r.text)

// ════ 3. Rules saved: only the picked repos, Straight to Tasks, dedupe across inbox/tasks ════
// the user filed acme/app#1's letter by hand earlier → a hand-made task with the github ref (no `synced`)
const letter1 = db.inbox_items.find((i) => i.external_ref.id === 'I_acme/app_1')!
letter1.status = 'filed'
db.tasks.push({ id: crypto.randomUUID(), user_id: U1, title: 'by hand', status: 'todo', deleted_at: null, top3: false, completed_at: null, external_ref: { source: 'github', id: 'I_acme/app_1', url: 'https://github.com/acme/app/issues/1' } })
issues.push(gh(4, 'acme/web', { updated_at: ISO('01') })) // old issue: only a full sync picks it up
ghCalls.length = 0
r = await call(syncFn, 'jwt-u1', { action: 'sync' })
check('only-repos: no assignee query any more, one query for the two repos', !ghCalls.some((c) => c.includes('assignee:')) && ghCalls.some((c) => c.includes('repo:acme/app repo:acme/web')), ghCalls.filter((c) => c.startsWith('/search')).join(' | '))
const synced = db.tasks.filter((t) => t.external_ref?.synced)
check('tasks: acme/web#3 and #4 (old, full sync after the add) landed as tasks', synced.map((t) => t.title).sort().join(',') === 'acme/web#3,acme/web#4', synced.map((t) => t.title).join(','))
check('tasks: the task row is unfiled todo with the issue link', synced.every((t) => t.status === 'todo' && t.project_id === undefined && t.external_ref.url?.startsWith('https://github.com/acme/web/issues/') && t.external_ref.repo === 'acme/web'))
check('tasks: acme/app#1 (already a letter + hand-filed task) was not landed again', db.tasks.filter((t) => t.external_ref?.id === 'I_acme/app_1').length === 1)
check('tasks: no new inbox letters while landing in Tasks', db.inbox_items.length === 2)
check('tasks: task.created logged for each, source github', db.activity_log.filter((a) => a.event_type === 'task.created' && a.payload.source === 'github').length === 2)
check('tasks: other/lib#2 (assigned, unwatched repo) stays a pending letter — not dismissed', db.inbox_items.find((i) => i.external_ref.id === 'I_other/lib_2')?.status === 'pending')
r = await call(syncFn, 'jwt-u1', { action: 'sync' })
check('tasks: a second sync adds nothing', r.body.new === 0 && db.tasks.length === 3, r.text)

// ════ 4. Closing issues: synced tasks tick off, hand-filed ones don't ════
issues.find((i) => i.node_id === 'I_acme/web_3')!.state = 'closed'
issues.find((i) => i.node_id === 'I_acme/web_4')!.state = 'gone'
issues.find((i) => i.node_id === 'I_acme/app_1')!.state = 'closed'
r = await call(syncFn, 'jwt-u1', { action: 'sync' })
const t3 = db.tasks.find((t) => t.external_ref?.id === 'I_acme/web_3')!
const t4 = db.tasks.find((t) => t.external_ref?.id === 'I_acme/web_4')!
check('closed: the synced task for a closed issue is done, with completed_at, off Top 3', t3.status === 'done' && !!t3.completed_at && t3.top3 === false)
check('closed: a deleted issue ticks its synced task off too', t4.status === 'done')
check('closed: counted as completed', r.body.completed === 2, r.text)
check('closed: task.completed logged with the reason', db.activity_log.filter((a) => a.event_type === 'task.completed').map((a) => a.payload.reason).sort().join(',') === 'closed on GitHub,gone from GitHub')
check('closed: the hand-filed task is never touched', db.tasks.find((t) => t.title === 'by hand')?.status === 'todo')
// still-open but out of scope: un-watch acme/web, reopen #3's sibling
issues.push(gh(5, 'acme/web', { updated_at: ISO('13') }))
await call(syncFn, 'jwt-u1', { action: 'sync' }) // lands #5 as a task
rowOf(U1).data.repos = ['acme/app']
await call(syncFn, 'jwt-u1', { action: 'sync' })
const t5 = db.tasks.find((t) => t.external_ref?.id === 'I_acme/web_5')!
check('out of scope: an open issue in an unwatched repo keeps its task open, stamped checked_at', t5.status === 'todo' && !!t5.external_ref.checked_at)

// ════ 5. Pause ════
db.integrations.push(integ(U2, { repos: [], rules: { land: 'inbox', priority: 'normal', paused: true } }))
issues.push(gh(9, 'u2/repo', { assignee: 'kai' }))
r = await call(syncFn, 'jwt-u2', { action: 'sync' })
check('pause: "Sync now" answers paused (409)', r.status === 409 && r.body.error === 'paused', r.text)
const before = db.inbox_items.length + db.tasks.length
r = await call(syncFn, 'service-key', { action: 'sync' })
check('pause: the cron syncs only the unpaused user', r.status === 200 && r.body.users === 1, r.text)
check('pause: nothing landed for the paused user', db.inbox_items.concat(db.tasks).filter((x) => x.user_id === U2).length === 0 && db.inbox_items.length + db.tasks.length === before)
check('pause: the paused row keeps its old synced_at (no stamp)', rowOf(U2).data.synced_at === undefined)
r = await call(connectFn, 'jwt-u2', { action: 'rules', repos: '', rules: { paused: false } })
r = await call(syncFn, 'jwt-u2', { action: 'sync' })
check('unpause: syncs again (assigned issue lands in the Inbox)', r.status === 200 && db.inbox_items.some((i) => i.user_id === U2), r.text)

// ════ 6. Reconnect keeps repos and rules; an old client's repos still count ════
r = await call(connectFn, 'jwt-u1', { token: TOKEN })
check('reconnect: answers only the login', r.status === 200 && r.text === '{"login":"kai"}', r.text)
check('reconnect: watched repos and rules kept', JSON.stringify(rowOf(U1).data.repos) === '["acme/app"]' && rowOf(U1).data.rules?.land === 'tasks')
check('reconnect: watermark cleared (first sync after a reconnect is full)', rowOf(U1).data.synced_at === undefined)
r = await call(connectFn, 'jwt-u1', { token: TOKEN, repos: 'acme/web' })
check('old client: repos sent with the token replace the list, rules still kept', JSON.stringify(rowOf(U1).data.repos) === '["acme/web"]' && rowOf(U1).data.rules?.land === 'tasks')
r = await call(connectFn, 'jwt-u1', { token: 'short' })
check('connect: a malformed token is refused', r.status === 400 && r.body.error === 'bad_request')
r = await call(connectFn, 'nobody', { action: 'repos' })
check('auth: no signed-in user → 401', r.status === 401)

// ════ the token only ever went to GitHub ════
const leaked = [...db.activity_log, ...db.inbox_items, ...db.tasks].some((x) => JSON.stringify(x).includes(TOKEN))
check('token: never written into inbox/tasks/activity rows', !leaked)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) Deno.exit(1)
