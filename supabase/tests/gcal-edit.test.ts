// gcal-events (2026-11-03): editing a Google event from the app, end to end through the REAL google-sync function —
// auth, the read-only gates, the plan, the Calendar API calls, the re-read that lands the answer in calendar_events, and
// Undo — against a fake Calendar API and a fake PostgREST, in plain Deno. No database, no network: the point is the
// function's own logic (supabase/functions/google-sync/index.ts, _shared/gcalEdit.ts, _shared/google.ts).
//
//   deno test --no-lock --allow-env --allow-net=127.0.0.1,localhost --allow-read supabase/tests/gcal-edit.test.ts
//
// Rehearsal runs it (.github/workflows/rehearsal.yml). The sync that stocks calendar_events is the real one, so the
// `edit` / `url` / `link` / `master` that google-sync stamps on each row are checked on the way.
import assert from 'node:assert/strict'
import rrulePkg from 'npm:rrule@2'

const { RRule } = rrulePkg
const UID = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000bb'
const DAY = 86_400_000
const WRITE = 'https://www.googleapis.com/auth/calendar.events.owned'
const READ = 'https://www.googleapis.com/auth/calendar.readonly'

// ── the fake Supabase: auth + the three tables google-sync touches ──────────────────────────────

type Row = Record<string, unknown>
const db = { integrations: [] as Row[], app_settings: [] as Row[], calendar_events: [] as Row[] }

function pick(row: Row, key: string): unknown {
  const [col, path] = key.split('->>')
  const v = row[col]
  return path ? (v as Row | null)?.[path] : v
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, expr] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue
    const [op, ...rest] = expr.split('.')
    const val = rest.join('.')
    const have = pick(row, key)
    if (op === 'eq' && String(have) !== val) return false
    if (op === 'gt' && !(String(have) > val)) return false
    if (op === 'in' && !val.slice(1, -1).split(',').includes(String(have))) return false
  }
  return true
}

const supabase = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: () => {} }, async (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/auth/v1/user') {
    return req.headers.get('Authorization') === `Bearer user-${UID}`
      ? Response.json({ id: UID, aud: 'authenticated', role: 'authenticated', is_anonymous: false })
      : Response.json({ message: 'bad' }, { status: 401 })
  }
  const table = url.pathname.replace('/rest/v1/', '') as keyof typeof db
  const rows = db[table]
  if (!rows) return new Response('no such table', { status: 404 })
  const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json() : null
  const hit = rows.filter((r) => matches(r, url.searchParams))
  if (req.method === 'GET') {
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1e9)
    const page = [...hit].sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(offset, offset + limit)
    if ((req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')) return page.length === 1 ? Response.json(page[0]) : Response.json({ code: 'PGRST116' }, { status: 406 })
    return Response.json(page)
  }
  if (req.method === 'POST') {
    for (const r of body as Row[]) {
      if (table === 'calendar_events' && rows.some((x) => x.user_id === r.user_id && pick(x, 'external_ref->>id') === pick(r, 'external_ref->>id'))) return Response.json({ code: '23505' }, { status: 409 })
      rows.push({ ...r })
    }
    return new Response(null, { status: 201 })
  }
  if (req.method === 'PATCH') {
    for (const r of hit) Object.assign(r, body, table === 'integrations' ? { updated_at: new Date(Date.now() + rows.length).toISOString() } : null)
    return (req.headers.get('Prefer') ?? '').includes('representation') ? Response.json(hit) : new Response(null, { status: 204 })
  }
  if (req.method === 'DELETE') {
    db[table] = rows.filter((r) => !hit.includes(r))
    return new Response(null, { status: 204 })
  }
  return new Response('?', { status: 405 })
})
const SUPABASE_URL = `http://127.0.0.1:${(supabase.addr as Deno.NetAddr).port}`

// ── the fake Google: token, calendar list, events (a weekly master expands to instances) ────────

interface GEvent extends Record<string, any> { id: string }
const google = {
  scope: `${READ} ${WRITE}`,
  events: new Map<string, GEvent>(), // `${calendar}/${id}`
  calls: [] as { method: string; path: string; query: string; body: any }[],
  counter: 0,
  calendars: [
    { id: 'kai@gmail.com', summary: 'Kai', accessRole: 'owner', primary: true, backgroundColor: '#4986e7' },
    { id: 'team@group.calendar.google.com', summary: 'Team', accessRole: 'writer', backgroundColor: '#16a765' },
  ],
}
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const instanceId = /^(.*)_(\d{8}T\d{6}Z)$/

/** A weekly master's instances inside the window, each from `events` when it was an exception, else made up. */
function expand(cal: string, m: GEvent, from: number, to: number): GEvent[] {
  const rule = RRule.parseString(String(m.recurrence[0]).replace(/^RRULE:/, ''))
  const s0 = Date.parse(m.start.dateTime)
  const len = Date.parse(m.end.dateTime) - s0
  const out: GEvent[] = []
  for (const at of new RRule({ ...rule, dtstart: new Date(s0) }).between(new Date(from - len), new Date(to), true)) {
    const id = `${m.id}_${stamp(at.getTime())}`
    const stored = google.events.get(`${cal}/${id}`)
    if (stored) {
      if (stored.status !== 'cancelled') out.push(stored)
      continue
    }
    out.push({ id, etag: `"i${at.getTime()}"`, status: 'confirmed', summary: m.summary, recurringEventId: m.id, originalStartTime: { dateTime: at.toISOString() }, start: { dateTime: at.toISOString(), timeZone: m.start.timeZone }, end: { dateTime: new Date(at.getTime() + len).toISOString(), timeZone: m.start.timeZone }, organizer: m.organizer })
  }
  return out
}

function find(cal: string, id: string): GEvent | undefined {
  const stored = google.events.get(`${cal}/${id}`)
  if (stored) return stored
  const m = instanceId.exec(id)
  const master = m && google.events.get(`${cal}/${m[1]}`)
  return master?.recurrence ? expand(cal, master, Date.parse(m![2].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) - 1, Date.parse(m![2].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) + 1).find((e) => e.id === id) : undefined
}

function merge(into: GEvent, patch: Record<string, unknown>): GEvent {
  for (const [k, v] of Object.entries(patch)) {
    if ((k === 'start' || k === 'end') && v && typeof v === 'object') {
      const next = { ...(into[k] ?? {}), ...(v as Row) }
      for (const f of Object.keys(next)) if (next[f] === null) delete next[f]
      into[k] = next
    } else into[k] = v
  }
  into.etag = `"e${++google.counter}"`
  return into
}

async function fakeGoogle(url: URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body && typeof init.body === 'string' && init.headers && JSON.stringify(init.headers).includes('json') ? JSON.parse(init.body) : null
  if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'at-1', scope: google.scope })
  const path = url.pathname.replace('/calendar/v3', '')
  google.calls.push({ method, path, query: url.search, body })
  if (path === '/users/me/calendarList') return Response.json({ items: google.calendars })
  const m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path)
  if (!m) return Response.json({ error: 'nope' }, { status: 404 })
  const cal = decodeURIComponent(m[1])
  const id = m[2] ? decodeURIComponent(m[2]) : null
  if (cal === 'primary') return Response.json({ items: [] }) // our own busy events: none
  if (!id && method === 'GET') {
    const from = Date.parse(url.searchParams.get('timeMin')!)
    const to = Date.parse(url.searchParams.get('timeMax')!)
    const items: GEvent[] = []
    for (const [key, e] of google.events) {
      if (!key.startsWith(`${cal}/`) || e.status === 'cancelled') continue
      if (e.recurrence) items.push(...expand(cal, e, from, to))
      else if (!e.recurringEventId && Date.parse(e.end?.dateTime ?? `${e.end.date}T00:00:00Z`) > from && Date.parse(e.start?.dateTime ?? `${e.start.date}T00:00:00Z`) < to) items.push(e)
    }
    return Response.json({ items })
  }
  if (!id && method === 'POST') {
    const made = { ...body, id: `made${++google.counter}`, etag: '"n"', status: 'confirmed', organizer: { self: true } }
    google.events.set(`${cal}/${made.id}`, made)
    return Response.json(made)
  }
  const cur = find(cal, id!)
  if (!cur) return Response.json({ error: 'gone' }, { status: 404 })
  if (method === 'GET') return Response.json(cur)
  if (method === 'PATCH') {
    google.events.set(`${cal}/${id}`, merge(cur, body))
    return Response.json(google.events.get(`${cal}/${id}`))
  }
  if (method === 'DELETE') {
    cur.status = 'cancelled'
    google.events.set(`${cal}/${id}`, cur)
    return new Response(null, { status: 204 })
  }
  return new Response('?', { status: 405 })
}

const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  return /(^|\.)googleapis\.com$/.test(url.hostname) ? fakeGoogle(url, init) : realFetch(input, init)
}

// ── the real function, its Deno.serve captured ──────────────────────────────────────────────────

Deno.env.set('SUPABASE_URL', SUPABASE_URL)
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
Deno.env.set('GOOGLE_CLIENT_ID', 'cid')
Deno.env.set('GOOGLE_CLIENT_SECRET', 'secret')
let handler: (req: Request) => Response | Promise<Response> = () => new Response('not served', { status: 500 })
const realServe = Deno.serve
;(Deno as any).serve = (h: any) => {
  handler = typeof h === 'function' ? h : h.handler
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }
}
await import('../functions/google-sync/index.ts')
;(Deno as any).serve = realServe

async function call(body: unknown, token = `user-${UID}`): Promise<{ status: number; json: any }> {
  const res = await handler(new Request('http://fn/google-sync', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json().catch(() => null) }
}
const sync = () => call({ action: 'sync' })
const edit = (id: string, change: unknown, scope?: string) => call({ action: 'edit', id, scope, change })
const rowOf = (gcalId: string) => db.calendar_events.find((r) => r.gcal_id === gcalId)
const writes = () => google.calls.filter((c) => c.method !== 'GET')
const gev = (cal: string, id: string) => google.events.get(`${cal}/${id}`)!

// ── fixtures: a Monday in the future so the sync window holds it ────────────────────────────────

const TODAY = new Date()
const at = (days: number, hour: number, min = 0) => new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate() + days, hour, min)).toISOString()
const KAI = 'kai@gmail.com'
const TEAM = 'team@group.calendar.google.com'
// The weekly master starts 3 days ago so there are earlier and later occurrences inside the window.
const MASTER_START = Date.parse(at(-3, 7))

function reset(over: { scope?: string; canWrite?: boolean } = {}) {
  google.scope = over.scope ?? `${READ} ${WRITE}`
  google.events.clear()
  google.calls.length = 0
  google.counter = 0
  const put = (cal: string, e: GEvent) => google.events.set(`${cal}/${e.id}`, { etag: '"1"', status: 'confirmed', organizer: { self: true }, ...e })
  put(KAI, { id: 'solo', summary: 'Dentist', start: { dateTime: at(2, 9), timeZone: 'Africa/Cairo' }, end: { dateTime: at(2, 10), timeZone: 'Africa/Cairo' }, hangoutLink: 'https://meet.google.com/abc-defg-hij', htmlLink: 'https://www.google.com/calendar/event?eid=solo' })
  put(KAI, { id: 'bday', summary: 'Omar’s birthday', eventType: 'birthday', start: { date: at(4, 0).slice(0, 10) }, end: { date: at(5, 0).slice(0, 10) } })
  put(KAI, { id: 'invite', summary: 'Their meeting', organizer: { self: false }, start: { dateTime: at(3, 12) }, end: { dateTime: at(3, 13) } })
  put(KAI, { id: 'weekly', summary: 'Standup', recurrence: ['RRULE:FREQ=WEEKLY'], start: { dateTime: new Date(MASTER_START).toISOString(), timeZone: 'Africa/Cairo' }, end: { dateTime: new Date(MASTER_START + 30 * 60_000).toISOString(), timeZone: 'Africa/Cairo' }, description: 'Daily sync' })
  put(TEAM, { id: 'team1', summary: 'Team offsite', start: { dateTime: at(2, 14) }, end: { dateTime: at(2, 16) } })
  db.integrations = [{ user_id: UID, provider: 'google', updated_at: '2026-11-01T00:00:00.000Z', data: { refresh_token: 'r1', login: KAI, status: 'ok', can_write: over.canWrite ?? true, mirror: false, chosen: [KAI, TEAM], calendars: [{ id: KAI, name: 'Kai', color: '#4986e7' }, { id: TEAM, name: 'Team', color: '#16a765' }] } }]
  db.app_settings = [{ user_id: UID, timezone: 'Africa/Cairo' }]
  db.calendar_events = []
}

// ── the suite ───────────────────────────────────────────────────────────────────────────────────

Deno.test('sync stamps what editing needs: edit on owned calendars only, the Meet link, the page, the series', async () => {
  reset()
  const r = await sync()
  assert.equal(r.status, 200)
  const solo = rowOf('solo')!
  assert.deepEqual((solo.external_ref as Row), { source: 'gcal', id: `${KAI}/solo`, calendar: 'Kai', calendar_id: KAI, edit: true, url: 'https://meet.google.com/abc-defg-hij', link: 'https://www.google.com/calendar/event?eid=solo' })
  assert.equal((rowOf('team1')!.external_ref as Row).edit, undefined, 'a writer calendar is not ours: the owned scope does not reach it')
  assert.equal((rowOf('bday')!.external_ref as Row).edit, undefined, 'a birthday is not a plain event')
  assert.equal((rowOf('invite')!.external_ref as Row).edit, undefined, 'someone else’s meeting')
  const weekly = db.calendar_events.filter((r) => String(r.gcal_id).startsWith('weekly_'))
  assert.ok(weekly.length >= 8, `a weekly series is one row per occurrence (${weekly.length})`)
  assert.ok(weekly.every((r) => (r.external_ref as Row).master === 'weekly' && (r.external_ref as Row).edit === true))
  assert.equal(db.integrations[0].data && ((db.integrations[0].data as Row).calendars as Row[])[0].role, 'owner', 'the calendar list’s role is saved for the next edit')
})

Deno.test('a grant without the write scope: reading carries on, nothing is editable, an edit is refused', async () => {
  reset({ scope: READ, canWrite: false })
  await sync()
  assert.ok(db.calendar_events.length > 0)
  assert.ok(db.calendar_events.every((r) => (r.external_ref as Row).edit === undefined))
  const r = await edit(String(rowOf('solo')!.id), { title: 'x' })
  assert.deepEqual([r.status, r.json.error], [403, 'read_only'])
  assert.equal(writes().length, 0)
})

Deno.test('rename and move a one-off: Google first (sendUpdates=none), then the row follows; Undo puts both back', async () => {
  reset()
  await sync()
  const id = String(rowOf('solo')!.id)
  let r = await edit(id, { title: 'Dentist — Dr. Omar' })
  assert.equal(r.status, 200)
  assert.equal(gev(KAI, 'solo').summary, 'Dentist — Dr. Omar')
  assert.equal(rowOf('solo')!.title, 'Dentist — Dr. Omar', 'the calendar was re-read right after')
  const patch = writes().find((c) => c.method === 'PATCH')!
  assert.match(patch.query, /sendUpdates=none/)
  assert.deepEqual(patch.body, { summary: 'Dentist — Dr. Omar' })

  r = await edit(id, { starts_at: at(2, 10), ends_at: at(2, 11, 30) })
  assert.equal(r.status, 200)
  assert.equal(gev(KAI, 'solo').start.dateTime, at(2, 10))
  assert.equal(gev(KAI, 'solo').start.timeZone, 'Africa/Cairo')
  assert.equal(rowOf('solo')!.starts_at, at(2, 10))
  assert.equal(rowOf('solo')!.ends_at, at(2, 11, 30))

  const back = await call({ action: 'undo', calendar: r.json.undo.calendar, ops: r.json.undo.ops })
  assert.equal(back.status, 200)
  assert.equal(gev(KAI, 'solo').start.dateTime, at(2, 9))
  assert.equal(rowOf('solo')!.starts_at, at(2, 9))
})

Deno.test('delete a one-off: cancelled in Google, gone from the rows; Undo confirms it again and it returns', async () => {
  reset()
  await sync()
  const r = await edit(String(rowOf('solo')!.id), { delete: true })
  assert.equal(r.status, 200)
  assert.equal(gev(KAI, 'solo').status, 'cancelled')
  assert.equal(rowOf('solo'), undefined)
  const back = await call({ action: 'undo', calendar: r.json.undo.calendar, ops: r.json.undo.ops })
  assert.equal(back.status, 200)
  assert.equal(gev(KAI, 'solo').status, 'confirmed')
  assert.ok(rowOf('solo'))
})

Deno.test('read-only is read-only: another calendar, someone else’s event, a stranger’s row — nothing reaches Google', async () => {
  reset()
  await sync()
  for (const g of ['team1', 'bday', 'invite']) {
    const r = await edit(String(rowOf(g)!.id), { title: 'hijacked' })
    assert.deepEqual([r.status, r.json.error], [403, 'read_only'], g)
  }
  db.calendar_events.push({ ...rowOf('solo')!, id: 'someone-elses', user_id: OTHER, gcal_id: 'solo-b', external_ref: { ...(rowOf('solo')!.external_ref as Row), id: `${KAI}/solo-b` } })
  const r = await edit('someone-elses', { title: 'hijacked' })
  assert.deepEqual([r.status, r.json.error], [404, 'gone'], 'another user’s row is not ours to find')
  assert.equal(writes().length, 0)
})

Deno.test('bad requests: no token, an unknown change, a malformed undo, a change the app would never send', async () => {
  reset()
  await sync()
  const id = String(rowOf('solo')!.id)
  assert.equal((await call({ action: 'edit', id, change: { title: 'x' } }, 'nobody')).status, 401)
  assert.equal((await edit(id, {})).status, 400)
  assert.equal((await edit(id, { title: '' })).status, 400)
  assert.equal((await edit(id, { starts_at: at(2, 11), ends_at: at(2, 10) })).status, 400)
  assert.equal((await call({ action: 'undo', calendar: KAI, ops: [{ op: 'patch', id: 'solo', body: { attendees: [] } }] })).status, 400)
  assert.equal((await call({ action: 'undo', calendar: TEAM, ops: [{ op: 'delete', id: 'team1' }] })).status, 400, 'an undo reaches only calendars we own')
  assert.equal(writes().length, 0)
})

Deno.test('a repeating event, This event: just that occurrence is patched; the rest are untouched', async () => {
  reset()
  await sync()
  const occ = db.calendar_events.filter((r) => String(r.gcal_id).startsWith('weekly_')).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
  const target = occ[2]
  const r = await edit(String(target.id), { title: 'Standup (moved room)' }, 'this')
  assert.equal(r.status, 200)
  assert.equal(gev(KAI, String(target.gcal_id)).summary, 'Standup (moved room)')
  assert.equal(gev(KAI, 'weekly').summary, 'Standup')
  const titles = db.calendar_events.filter((x) => String(x.gcal_id).startsWith('weekly_')).map((x) => x.title)
  assert.equal(titles.filter((t) => t === 'Standup (moved room)').length, 1)
})

Deno.test('a repeating event, All events: the master changes and every occurrence follows; a move shifts the master by the same time', async () => {
  reset()
  await sync()
  const occ = () => db.calendar_events.filter((r) => String(r.gcal_id).startsWith('weekly_')).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
  const target = occ()[1]
  let r = await edit(String(target.id), { title: 'Retro' }, 'all')
  assert.equal(r.status, 200)
  assert.equal(gev(KAI, 'weekly').summary, 'Retro')
  assert.ok(occ().every((x) => x.title === 'Retro'))

  // An hour later and 20 minutes longer, on the same day.
  const fresh = occ()[1]
  const start = Date.parse(String(fresh.starts_at)) + 3600_000
  r = await edit(String(fresh.id), { starts_at: new Date(start).toISOString(), ends_at: new Date(start + 50 * 60_000).toISOString() }, 'all')
  assert.equal(r.status, 200)
  assert.equal(Date.parse(gev(KAI, 'weekly').start.dateTime), MASTER_START + 3600_000)
  assert.equal(Date.parse(gev(KAI, 'weekly').end.dateTime) - Date.parse(gev(KAI, 'weekly').start.dateTime), 50 * 60_000)
  assert.ok(occ().every((x) => Date.parse(String(x.ends_at)) - Date.parse(String(x.starts_at)) === 50 * 60_000))
  const undone = await call({ action: 'undo', calendar: r.json.undo.calendar, ops: r.json.undo.ops })
  assert.equal(undone.status, 200)
  assert.equal(Date.parse(gev(KAI, 'weekly').start.dateTime), MASTER_START)
})

Deno.test('a repeating event, This and following: delete ends the series before it; rename splits it in two; Undo puts it back', async () => {
  reset()
  await sync()
  const occ = () => db.calendar_events.filter((r) => String(r.gcal_id).startsWith('weekly_')).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
  const before = occ().length
  const third = occ()[2]
  let r = await edit(String(third.id), { delete: true }, 'following')
  assert.equal(r.status, 200)
  assert.match(String(gev(KAI, 'weekly').recurrence[0]), /UNTIL=\d{8}T\d{6}Z/)
  assert.equal(occ().length, 2, 'the occurrences from the third on are gone; the first two stay')
  const back = await call({ action: 'undo', calendar: r.json.undo.calendar, ops: r.json.undo.ops })
  assert.equal(back.status, 200)
  assert.equal(gev(KAI, 'weekly').recurrence[0], 'RRULE:FREQ=WEEKLY')
  assert.equal(occ().length, before)

  // A rename from the third: the old series ends before it, a new one (with the master's details) starts on it.
  r = await edit(String(occ()[2].id), { title: 'Retro' }, 'following')
  assert.equal(r.status, 200)
  const made = [...google.events.values()].find((e) => e.id.startsWith('made'))!
  assert.equal(made.summary, 'Retro')
  assert.equal(made.description, 'Daily sync')
  assert.equal(made.start.dateTime, String(third.starts_at))
  assert.equal(made.recurrence[0], 'RRULE:FREQ=WEEKLY')
  const both = db.calendar_events.filter((x) => /^(weekly|made\d+)_/.test(String(x.gcal_id))).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
  assert.deepEqual(both.map((x) => x.title), ['Standup', 'Standup', ...Array(before - 2).fill('Retro')], 'the first two stay on the old series, the rest are the new one')
  assert.ok(both.slice(2).every((x) => String(x.gcal_id).startsWith('made')))
  assert.match(writes().filter((c) => c.method === 'POST')[0].query, /sendUpdates=none/)
})

Deno.test('a failure half way puts back what it did: the new series fails to start, the old one keeps its rule', async () => {
  reset()
  await sync()
  const third = db.calendar_events.filter((r) => String(r.gcal_id).startsWith('weekly_')).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[2]
  const fetchWas = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' && String(input).includes('/calendars/kai%40gmail.com/events') ? Promise.resolve(new Response('{}', { status: 500 })) : fetchWas(input, init))
  const r = await edit(String(third.id), { title: 'Retro' }, 'following')
  globalThis.fetch = fetchWas
  assert.equal(r.status, 502)
  assert.equal(gev(KAI, 'weekly').recurrence[0], 'RRULE:FREQ=WEEKLY')
})
