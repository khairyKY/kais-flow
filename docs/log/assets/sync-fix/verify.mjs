// sync-fix (2026-10-25, queue item 11: "One change couldn't be saved — set aside so the rest sync on" on
// every create). The REAL app against a STRICT mock PostgREST: the tables, columns, foreign keys, CHECK
// lists, NOT NULLs and uuid types come from supabase/migrations (all of them, in order), and a write the
// real server would refuse is refused here the same way (PGRST204 / 23503 / 23514 / 23502 / 22P02), with
// the server's rows kept so a block whose task isn't there yet fails like it does live. Then Kai's flows:
// quick create on the grid with the length row, the rail's Quick add, ⌘K and Tasks' quick add with a time,
// Duplicate (a block; a parent's block with its subtasks; a row), a multi-move, ticking a slot's task,
// snooze, complete. Every flow must leave no refused write and no dead letter. Then the parked-write UX:
// the toast names what failed, Try again / Discard, the popover's rows, the code kept in the record.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=a,b,c,u to pick sections)
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 08:00.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5307'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ═══ The schema, from the migrations ═══
const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations')
const schema = {} // table → { cols: Map(col → { uuid, notNull, hasDefault }), fks: Map(col → { table, onDelete }), checks: Map(col → Set) }
const T = (t) => (schema[t] ??= { cols: new Map(), fks: new Map(), checks: new Map() })
const listOf = (s) => new Set([...s.matchAll(/'([^']*)'/g)].map((m) => m[1]))
function column(t, def) {
  const name = def.trim().split(/\s+/)[0]?.replace(/"/g, '')
  if (!/^[a-z_][a-z0-9_]*$/.test(name) || ['unique', 'primary', 'constraint', 'check', 'foreign', 'exclude'].includes(name)) return
  const rest = def.trim().slice(name.length)
  T(t).cols.set(name, { uuid: /^\s*uuid\b/.test(rest) && !/\[\]/.test(rest.split(/\s/)[1] ?? ''), notNull: /not null|primary key/.test(rest), hasDefault: /\bdefault\b|primary key|generated/.test(rest) })
  const fk = rest.match(/references ([a-z_.]+)\s*\(id\)(?:\s+on delete (cascade|set null))?/)
  if (fk && !fk[1].startsWith('auth.')) T(t).fks.set(name, { table: fk[1].replace('public.', ''), onDelete: fk[2] ?? 'no action' })
  const ck = rest.match(new RegExp(`check \\(${name} in \\(([^)]*)\\)\\)`))
  if (ck) T(t).checks.set(name, listOf(ck[1]))
}
for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(MIG, f), 'utf8').replace(/--[^\n]*/g, '').toLowerCase()
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
    // split the body on top-level commas
    let depth = 0, cur = ''
    for (const ch of m[2] + ',') {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { column(m[1], cur); cur = '' } else cur += ch
    }
  }
  for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?([a-z_]+)\s+([\s\S]*?);/g)) {
    const t = m[1]
    for (const a of m[2].split(/,\s*(?=add |drop |alter |rename )/)) {
      const add = a.match(/^\s*add column (?:if not exists )?([\s\S]*)$/)
      if (add) column(t, add[1])
      const drop = a.match(/drop column (?:if exists )?([a-z_][a-z0-9_]*)/)
      if (drop) T(t).cols.delete(drop[1])
      const fk = a.match(/foreign key \(([a-z_]+)\) references ([a-z_.]+)\s*\(id\)(?:\s+on delete (cascade|set null))?/)
      if (fk) T(t).fks.set(fk[1], { table: fk[2].replace('public.', ''), onDelete: fk[3] ?? 'no action' })
      const dc = a.match(/drop constraint (?:if exists )?(\w+)/)
      if (dc) for (const c of T(t).checks.keys()) if (dc[1] === `${t}_${c}_check`) T(t).checks.delete(c)
      const ck = a.match(/add constraint \w+\s+check\s*\(\(?([a-z_]+) in \(([^)]*)\)/)
      if (ck) T(t).checks.set(ck[1], listOf(ck[2]))
      const nn = a.match(/alter column ([a-z_]+) (set|drop) not null/)
      if (nn && T(t).cols.has(nn[1])) T(t).cols.get(nn[1]).notNull = nn[2] === 'set'
      const def = a.match(/alter column ([a-z_]+) set default/)
      if (def && T(t).cols.has(def[1])) T(t).cols.get(def[1]).hasDefault = true
    }
  }
}
if (process.env.SCHEMA_ONLY) {
  for (const [t, s] of Object.entries(schema)) console.log(t, 'fks', JSON.stringify([...s.fks]), 'checks', JSON.stringify([...s.checks].map(([c, v]) => [c, [...v]])), 'required', [...s.cols].filter(([, m]) => m.notNull && !m.hasDefault).map(([c]) => c).join(','))
  process.exit(0)
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SERVER_SET = new Set(['user_id', 'created_at', 'updated_at']) // defaults / triggers on every table

/** What the real PostgREST answers for an upsert of `row` into `table` given the server's `rows`, or null when it lands. */
function refuse(rows, table, row) {
  const s = schema[table]
  if (!s) return { status: 404, code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }
  for (const k of Object.keys(row)) if (!s.cols.has(k)) return { status: 400, code: 'PGRST204', message: `Could not find the '${k}' column of '${table}' in the schema cache` }
  const existing = (rows[table] ?? []).find((r) => r.id === row.id)
  for (const [c, meta] of s.cols) {
    const v = row[c]
    if (meta.uuid && v != null && !UUID.test(String(v))) return { status: 400, code: '22P02', message: `invalid input syntax for type uuid: "${v}"` }
    // the insert tuple is checked even when the row exists (ON CONFLICT DO UPDATE)
    if (meta.notNull && (v === null || (v === undefined && !meta.hasDefault && !SERVER_SET.has(c)))) {
      return { status: 400, code: '23502', message: `null value in column "${c}" of relation "${table}" violates not-null constraint` }
    }
  }
  for (const [c, allowed] of s.checks) {
    if (row[c] != null && !allowed.has(String(row[c]))) return { status: 400, code: '23514', message: `new row for relation "${table}" violates check constraint "${table}_${c}_check"` }
  }
  for (const [c, fk] of s.fks) {
    const v = row[c] ?? (row[c] === undefined ? existing?.[c] : null)
    if (v == null) continue
    if (!(rows[fk.table] ?? []).some((r) => r.id === v)) {
      return { status: 409, code: '23503', message: `insert or update on table "${table}" violates foreign key constraint "${table}_${c}_fkey"`, details: `Key (${c})=(${v}) is not present in table "${fk.table}".` }
    }
  }
  return null
}
/** A delete with the FKs' on-delete rules; an error when a no-action reference still points at it. */
function remove(rows, table, id) {
  for (const [t, s] of Object.entries(schema)) {
    for (const [c, fk] of s.fks) {
      if (fk.table !== table) continue
      for (const child of [...(rows[t] ?? [])].filter((r) => r[c] === id)) {
        if (fk.onDelete === 'cascade') remove(rows, t, child.id)
        else if (fk.onDelete === 'set null') child[c] = null
        else return { status: 409, code: '23503', message: `update or delete on table "${table}" violates foreign key constraint "${t}_${c}_fkey" on table "${t}"` }
      }
    }
  }
  rows[table] = (rows[table] ?? []).filter((r) => r.id !== id)
  return null
}

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000051f0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day ──
const DAY = 21
const DATE = '2026-10-21'
const cairo = (hhmm, day = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '08:00'
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P1 = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, sort_order: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const EMAIL = 1, STRETCH = 2, WATER = 3, REPLY = 4, LONG = 5, DEEP = 6, DEEP_A = 7, DEEP_B = 8
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, recurrence_rule: null, recurrence_exdates: [], deleted_at: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const WATERB = 1, STANDUP = 2, ADMIN = 3, LONGB = 4, DEEPB = 5
const TASKS = [
  task(EMAIL, 'Send the invoice to Omar', { duration_min: 20, due_at: iso('09:00') }),
  task(STRETCH, 'Stretch', { duration_min: 15, due_at: iso('09:00') }),
  task(WATER, 'Water the plants', { duration_min: 15, due_at: iso('11:00'), scheduled_start: iso('11:00'), scheduled_end: iso('11:15') }),
  task(REPLY, 'Reply to Omar', { duration_min: 15, slot_id: eid(ADMIN), slot_date: DATE, scheduled_start: iso('13:00'), scheduled_end: iso('14:30') }),
  task(LONG, 'Write the report', { duration_min: 30, due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:30'), project_id: P1 }),
  task(DEEP, 'Deep work on the forecast', { duration_min: 60, due_at: iso('17:00'), scheduled_start: iso('17:00'), scheduled_end: iso('18:00') }),
  task(DEEP_A, 'Pull last quarter', { parent_task_id: id(DEEP), created_at: iso('07:01', 1) }),
  task(DEEP_B, 'Draft the numbers', { parent_task_id: id(DEEP), created_at: iso('07:02', 1) }),
]
const EVENTS = [
  ev(WATERB, 'Water the plants', '11:00', '11:15', WATER),
  ev(STANDUP, 'Standup', '12:00', '13:00'),
  ev(ADMIN, 'Admin', '13:00', '14:30', null, 'time_block'),
  ev(LONGB, 'Write the report', '16:00', '16:30', LONG),
  ev(DEEPB, 'Deep work on the forecast', '17:00', '18:00', DEEP),
]
const PROJECT = { id: P1, user_id: UID, domain_id: null, area_id: null, name: 'Forecasting', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], deleted_at: null, created_at: CREATED, updated_at: CREATED }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', help_seen: ['hint:calendar'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [PROJECT], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route = '/calendar', o = {}) {
  const ctx = await browser.newContext({ ...desktop, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, now]) => {
    if (sessionStorage.getItem('kf-verify-booted')) return
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, inbox: false, lists: true }))
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, cairo(NOW).getTime()])
  // `refuseNext(table, row)`: a test hook that makes the server refuse one write the strict rules would let through.
  const state = { rows: tables(), writes: [], refused: [], refuseNext: o.refuseNext ?? null }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (p.startsWith('/functions/v1/')) return r.fulfill({ status: 503, json: { error: 'offline in the harness' } }).catch(() => {})
    if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] }).catch(() => {})
    if (!p.startsWith('/rest/v1/')) return r.fulfill({ json: {} }).catch(() => {})
    const table = p.replace('/rest/v1/', '')
    if (req.method() === 'POST') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      const list = Array.isArray(body) ? body : [body]
      state.writes.push({ method: 'POST', table, body })
      for (const row of list) {
        const no = state.refuseNext?.(table, row) ? { status: 400, code: '23514', message: `new row for relation "${table}" violates check constraint "harness_says_no"` } : refuse(state.rows, table, row)
        if (no) {
          if (state.refuseNext?.(table, row)) state.refuseNext = null
          state.refused.push({ table, row, ...no })
          return r.fulfill({ status: no.status, json: { code: no.code, message: no.message, details: no.details ?? null, hint: null } }).catch(() => {})
        }
      }
      for (const row of list) {
        const rows = (state.rows[table] ??= [])
        const i = rows.findIndex((x) => x.id === row.id)
        if (i === -1) rows.push({ user_id: UID, ...row })
        else rows[i] = { ...rows[i], ...row }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '' }).catch(() => {})
    }
    if (req.method() === 'DELETE') {
      const gone = url.searchParams.get('id')?.replace(/^eq\./, '')
      state.writes.push({ method: 'DELETE', table, query: url.search })
      const no = remove(state.rows, table, gone)
      if (no) {
        state.refused.push({ table, row: { id: gone }, ...no })
        return r.fulfill({ status: no.status, json: { code: no.code, message: no.message, details: null, hint: null } }).catch(() => {})
      }
      return r.fulfill({ status: 204, body: '' }).catch(() => {})
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 204, body: '' }).catch(() => {})
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(600)
  }
}
const server = (state, table, f) => (state.rows[table] ?? []).filter(f)
/** The outbox's dead letters (idb-keyval's default store). */
const deadLetters = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('keyval-store')
  r.onsuccess = () => {
    try {
      const g = r.result.transaction('keyval').objectStore('keyval').get('kf-outbox-dead')
      g.onsuccess = () => res(g.result ?? [])
      g.onerror = () => res([])
    } catch { res([]) }
  }
  r.onerror = () => res([])
}))
const refusedText = (state, from = 0) => JSON.stringify(state.refused.slice(from).map((x) => `${x.table}:${x.code}:${x.row?.title ?? x.row?.event_type ?? x.row?.id}`))
/** Nothing refused since `from`, and no dead letter on the device. */
async function clean(page, state, name, from = 0) {
  await settle(state)
  const dead = await deadLetters(page)
  check(`${name}: the server refused nothing, no dead letter`, state.refused.length === from && dead.length === 0, `${refusedText(state, from)} dead=${JSON.stringify(dead.map((d) => `${d.table}:${d.code ?? d.error}`))}`)
}
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]`).first()
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const mins = (e) => Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000)
async function slotPoint(page, hhmm, date = DATE) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop - scroller.clientHeight / 2
  }, hhmm)
  await sleep(250)
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${date}"]`).boundingBox()
  return { x: col.x + col.width / 2, y: lane.y + 3 }
}
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(700)
}
const blockMenuItem = (page, label) => page.locator('[role="menu"][aria-label="Block details"] [role="menuitem"]', { hasText: new RegExp(`^${label}`) }).first()

// ═══ A · the calendar: every create path, Duplicate, a multi-move, a slot's tick ═══
if (want('a')) {
  const { ctx, page, errors, state } = await open('/calendar')
  // a1 — Ctrl-click the grid → quick create (Task), a title, the length row's 45m, Enter.
  let r0 = state.refused.length
  const p = await slotPoint(page, '15:00')
  await page.keyboard.down('Control')
  await page.mouse.click(p.x, p.y + 4)
  await page.keyboard.up('Control')
  await sleep(500)
  const qc = page.locator('.kf-quickcreate')
  await qc.getByLabel('Title').fill('Gym')
  await qc.locator('[aria-label="Length"] button', { hasText: /^\s*45m\s*$/ }).first().click()
  await sleep(200)
  await qc.getByLabel('Title').press('Enter')
  await settle(state)
  const gym = server(state, 'tasks', (t) => t.title === 'Gym')[0]
  const gymBlock = gym && server(state, 'calendar_events', (e) => e.task_id === gym.id)[0]
  check('a1 grid quick create + 45m: the task AND its block reach the server', !!gym && !!gymBlock && gymBlock.starts_at === iso('15:00') && mins(gymBlock) === 45, JSON.stringify([gym?.title, gymBlock && [gymBlock.starts_at, mins(gymBlock)]]))
  await clean(page, state, 'a1', r0)

  // a2 — the rail's "Quick add task…"
  r0 = state.refused.length
  await page.locator('.cal-rail-extra').click()
  await sleep(400)
  await page.locator('.kf-quickcreate').getByLabel('Title').fill('Buy stamps')
  await page.locator('.kf-quickcreate').getByLabel('Title').press('Enter')
  await settle(state)
  check('a2 the rail\'s Quick add: the task reaches the server', server(state, 'tasks', (t) => t.title === 'Buy stamps').length === 1)
  await clean(page, state, 'a2', r0)

  // a3 — the block menu's Duplicate on a task's block
  r0 = state.refused.length
  await slotPoint(page, '11:00')
  await fcBlock(page, WATERB).click()
  await sleep(400)
  await blockMenuItem(page, 'Duplicate').click()
  await settle(state)
  const waterCopy = server(state, 'tasks', (t) => t.title === 'Water the plants' && t.id !== id(WATER))[0]
  const waterCopyBlock = waterCopy && server(state, 'calendar_events', (e) => e.task_id === waterCopy.id)[0]
  check('a3 Duplicate a task\'s block: the copy AND its block (11:00–11:15) reach the server', !!waterCopyBlock && waterCopyBlock.starts_at === iso('11:00') && mins(waterCopyBlock) === 15, JSON.stringify([waterCopy?.id, waterCopyBlock?.starts_at]))
  await clean(page, state, 'a3', r0)

  // a4 — Duplicate a parent's block: the copy, its two subtasks, its block
  r0 = state.refused.length
  await page.keyboard.press('Escape')
  await slotPoint(page, '17:00')
  await fcBlock(page, DEEPB).click()
  await sleep(400)
  await blockMenuItem(page, 'Duplicate').click()
  await settle(state)
  const deepCopy = server(state, 'tasks', (t) => t.title === 'Deep work on the forecast' && t.id !== id(DEEP))[0]
  const subs = deepCopy ? server(state, 'tasks', (t) => t.parent_task_id === deepCopy.id) : []
  const deepBlock = deepCopy && server(state, 'calendar_events', (e) => e.task_id === deepCopy.id)[0]
  check('a4 Duplicate a parent\'s block: the copy, its 2 subtasks and its block all reach the server', !!deepCopy && subs.length === 2 && !!deepBlock, JSON.stringify([deepCopy?.id, subs.map((s) => s.title), deepBlock?.starts_at]))
  await clean(page, state, 'a4', r0)

  // a6 — tick the task a Time slot holds
  r0 = state.refused.length
  await page.keyboard.press('Escape')
  await slotPoint(page, '13:30')
  await page.locator(`.kf-ev-slot-row[data-slot-task="${id(REPLY)}"] .kf-ev-check`).first().click()
  await settle(state)
  check('a6 ticking a slot\'s task: done on the server', server(state, 'tasks', (t) => t.id === id(REPLY))[0]?.status === 'done')
  await clean(page, state, 'a6', r0)

  // a5 — multi-select move: Ctrl+click Standup, Shift+click Water the plants, drag Standup an hour
  r0 = state.refused.length
  await page.keyboard.press('Escape')
  await slotPoint(page, '13:00')
  await page.keyboard.down('Control')
  await fcBlock(page, STANDUP).click()
  await page.keyboard.up('Control')
  await fcBlock(page, WATERB).click({ modifiers: ['Shift'] })
  await sleep(300)
  const sb = await fcBlock(page, STANDUP).boundingBox()
  const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="13:00:00"]').boundingBox()
  await mouseDrag(page, { x: sb.x + sb.width / 2, y: sb.y + 10 }, { x: sb.x + sb.width / 2, y: lane.y + 10 })
  await settle(state)
  const st = server(state, 'calendar_events', (e) => e.id === eid(STANDUP))[0]
  const wa = server(state, 'calendar_events', (e) => e.id === eid(WATERB))[0]
  check('a5 a multi-move lands on the server: both blocks moved by the same amount', st && wa && Date.parse(st.starts_at) - Date.parse(iso('12:00')) >= 3_600_000 && Date.parse(st.starts_at) - Date.parse(iso('12:00')) === Date.parse(wa.starts_at) - Date.parse(iso('11:00')), JSON.stringify([st?.starts_at, wa?.starts_at]))
  await clean(page, state, 'a5', r0)

  // a7 — ⌘K with a time: the task and its block
  r0 = state.refused.length
  await page.keyboard.press('Control+k')
  await sleep(500)
  const bar = page.locator('#kf-capture-input')
  await bar.fill('call the dentist tomorrow 3pm')
  await bar.press('Enter')
  await settle(state)
  const dentist = server(state, 'tasks', (t) => t.title === 'call the dentist')[0]
  const dentistBlock = dentist && server(state, 'calendar_events', (e) => e.task_id === dentist.id)[0]
  check('a7 ⌘K "call the dentist tomorrow 3pm": the task AND its block reach the server', !!dentistBlock && dentistBlock.starts_at === iso('15:00', 22), JSON.stringify([dentist?.due_at, dentistBlock?.starts_at]))
  await clean(page, state, 'a7', r0)
  await shot(page, 'a-calendar-after')
  check('a· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ B · Tasks' quick add with a time ═══
if (want('b')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const input = page.getByPlaceholder(/Quick add task/)
  await input.fill('submit the report tomorrow 3pm #forecasting')
  await input.press('Enter')
  await settle(state)
  const made = server(state, 'tasks', (t) => t.title === 'submit the report')[0]
  const block = made && server(state, 'calendar_events', (e) => e.task_id === made.id)[0]
  check('b1 quick add with a time: the task (in Forecasting) AND its block reach the server', made?.project_id === P1 && block?.starts_at === iso('15:00', 22), JSON.stringify([made?.project_id, block?.starts_at]))
  await clean(page, state, 'b1')
  check('b· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ C · Today: Duplicate a row, snooze, complete ═══
if (want('c')) {
  const { ctx, page, errors, state } = await open('/today')
  const rowEl = (n) => page.locator(`[id="task-${id(n)}"]`).first()
  await rowEl(STRETCH).click({ button: 'right', position: { x: 60, y: 14 } })
  await sleep(300)
  await page.locator('[role="menu"] [role="menuitem"]', { hasText: /^Duplicate/ }).first().click()
  await settle(state)
  check('c1 Duplicate a row: the copy reaches the server', server(state, 'tasks', (t) => t.title === 'Stretch').length === 2)
  await clean(page, state, 'c1')
  let r0 = state.refused.length
  await rowEl(STRETCH).click({ button: 'right', position: { x: 60, y: 14 } })
  await sleep(300)
  await page.getByRole('menuitem', { name: 'Snooze…' }).last().click()
  await sleep(400)
  await page.locator('.kf-overlay-card button', { hasText: 'Later today' }).first().click()
  await settle(state)
  check('c2 Snooze → Later today: snoozed_until on the server', !!server(state, 'tasks', (t) => t.id === id(STRETCH))[0]?.snoozed_until)
  await clean(page, state, 'c2', r0)
  r0 = state.refused.length
  await rowEl(EMAIL).getByRole('checkbox').first().click()
  await settle(state)
  check('c3 Complete: done on the server', server(state, 'tasks', (t) => t.id === id(EMAIL))[0]?.status === 'done')
  await clean(page, state, 'c3', r0)
  check('c· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ U · a write the server refuses: the toast names it, Try again / Discard, the popover, the record ═══
if (want('u')) {
  // The server refuses the first write of the task "Stretch" (a stand-in for any refusal).
  const once = (table, row) => table === 'tasks' && row.id === id(STRETCH)
  const { ctx, page, errors, state } = await open('/today', { refuseNext: once })
  const rowEl = (n) => page.locator(`[id="task-${id(n)}"]`).first()
  await rowEl(STRETCH).click({ button: 'right', position: { x: 60, y: 14 } })
  await sleep(300)
  await page.getByRole('menuitem', { name: 'Snooze…' }).last().click()
  await sleep(400)
  await page.locator('.kf-overlay-card button', { hasText: 'Later today' }).first().click()
  await settle(state)
  const t = page.locator('.kf-toast', { hasText: "Couldn't save" }).first()
  await t.waitFor({ timeout: 6000 }).catch(() => {})
  const text = await t.innerText().catch(() => '')
  check('u1 the toast says WHAT failed: "Couldn\'t save: task \'Stretch\'"', /Couldn't save: task 'Stretch'/.test(text), text.replace(/\n/g, ' | '))
  check('u1 …and offers Try again and Discard', (await t.getByRole('button', { name: 'Try again' }).count()) === 1 && (await t.getByRole('button', { name: 'Discard' }).count()) === 1)
  check('u1 …no raw server words in it', !/23514|constraint|tasks|error/i.test(text), text)
  await shot(page, 'u1-parked-toast')
  const dead = await deadLetters(page)
  check('u2 the dead letter keeps the server\'s code and message', dead.length === 1 && dead[0].code === '23514' && /check constraint/.test(dead[0].error ?? ''), JSON.stringify(dead.map((d) => [d.table, d.code, d.error])))
  // The sidebar's name menu → "1 not saved" → the popover lists it with its own Try again / Discard.
  await page.locator('.kf-side-me').click()
  await page.getByRole('menuitem', { name: /not saved/ }).click()
  await sleep(400)
  const pop = page.locator('.kf-sync-pop')
  const popText = await pop.innerText().catch(() => '')
  check('u3 the popover names it, with Try again and Discard', /Not saved/.test(popText) && /'Stretch'/.test(popText) && (await pop.getByRole('button', { name: 'Try again' }).count()) === 1 && (await pop.getByRole('button', { name: 'Discard' }).count()) === 1, popText.replace(/\n/g, ' / '))
  await shot(page, 'u3-not-saved-popover')
  const w0 = state.writes.length
  await pop.getByRole('button', { name: 'Try again' }).click()
  await settle(state)
  const after = server(state, 'tasks', (x) => x.id === id(STRETCH))[0]
  check('u4 Try again sends it again; it lands (snoozed on the server), the dead letter is gone', state.writes.length > w0 && !!after?.snoozed_until && (await deadLetters(page)).length === 0, JSON.stringify([after?.snoozed_until, (await deadLetters(page)).length]))
  await sleep(400)
  check('u4 …and the row leaves the popover (its last row: the popover closes)', (await pop.count()) === 0, await pop.innerText().catch(() => 'closed'))

  // Discard: refuse a completion, then let it go.
  state.refuseNext = (table, row) => table === 'tasks' && row.id === id(EMAIL)
  await rowEl(EMAIL).getByRole('checkbox').first().click()
  await settle(state)
  const t2 = page.locator('.kf-toast', { hasText: "Couldn't save: task 'Send the invoice to Omar'" }).first()
  await t2.waitFor({ timeout: 6000 }).catch(() => {})
  const w1 = state.writes.length
  await t2.getByRole('button', { name: 'Discard' }).click().catch(() => {})
  await settle(state)
  await sleep(800)
  check('u5 Discard lets it go: no dead letter, nothing sent again, the server row as it was', (await deadLetters(page)).length === 0 && state.writes.length === w1 && server(state, 'tasks', (x) => x.id === id(EMAIL))[0]?.status === 'todo', JSON.stringify([(await deadLetters(page)).length, state.writes.length - w1]))
  check('u· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
