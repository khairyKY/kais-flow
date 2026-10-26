// drag-fix (Kai 2026-10-26: "the calendar drag a task to schedule isn't working"). EVERY way a task reaches the
// desktop grid by drag, at 100% and 150% interface size, on the REAL app against the STRICT mock PostgREST
// (sync-fix's: tables, columns, FKs, CHECKs, NOT NULLs from supabase/migrations; a write the real server
// would refuse is refused here, and the server's rows are kept):
//   rail Overdue · Today · Scheduled · Inbox · Lists, a planning-mode card, a day-tray card, a task held in a
//   Time slot, and a block moved within the grid (which must keep working).
// Each drop must land where the pointer let go, at the task's length (calendar/blockLength's rule: its own
// length, else 30m; an inbox capture its own), say "Scheduled · …" with an Undo that puts it back, and leave
// no refused write. The phone's tray chips don't drag (a tap opens the schedule sheet) — checked as such.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=r,p,y,h,b,m,t  SCALES=1,1.5)
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 08:00; the calendar opens on Day (Kai's).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5316'
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
const SCALES = (process.env.SCALES ?? '1,1.5').split(',')

// ═══ The schema, from the migrations (sync-fix/verify.mjs's strict mock) ═══
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
const UID = '00000000-0000-4000-8000-0000000d4a90'
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
const IID = 'a1000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, sort_order: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, recurrence_rule: null, recurrence_exdates: [], deleted_at: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const PAPERS = 1, STRETCH = 2, EMAIL = 3, WATER = 4, DENTIST = 5, REPLY = 6
const WATERB = 1, STANDUP = 2, ADMIN = 3
const TASKS = [
  task(PAPERS, 'File the tax papers', { due_at: iso('09:00', 19) }), // Overdue 2d, no length → 30m
  task(STRETCH, 'Stretch', { duration_min: 15, due_at: iso('09:00') }), // Today, 15m
  task(EMAIL, 'Send the invoice to Omar', { duration_min: 45, due_at: iso('10:00') }), // Today, 45m
  task(WATER, 'Water the plants', { duration_min: 15, due_at: iso('11:00'), scheduled_start: iso('11:00'), scheduled_end: iso('11:15') }), // Scheduled
  task(DENTIST, 'Book the dentist', { duration_min: 20, due_at: iso('09:00', 23) }), // Lists (This week)
  task(REPLY, 'Reply to Omar', { duration_min: 15, slot_id: eid(ADMIN), slot_date: DATE, scheduled_start: iso('13:00'), scheduled_end: iso('14:30') }), // held in Admin
]
const EVENTS = [
  ev(WATERB, 'Water the plants', '11:00', '11:15', WATER),
  ev(STANDUP, 'Standup', '12:00', '13:00'),
  ev(ADMIN, 'Admin', '13:00', '14:30', null, 'time_block'),
]
const INBOX = [{
  id: IID, user_id: UID, kind: 'text', raw_text: 'buy printer ink 20m', transcript: null, ai_parse: { cleaned_text: 'Buy printer ink', confidence: 0.9 }, confidence: null,
  status: 'pending', filed_task_id: null, payload: { duration_override: 20 }, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('07:30'), updated_at: iso('07:30'),
}]
const SETTINGS = {
  id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo',
  calendar_default_view: 'day', help_seen: ['hint:calendar', 'notice:autofile'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: INBOX, projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, now, scale, planning]) => {
    if (sessionStorage.getItem('kf-verify-booted')) return
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', planning ? '1' : '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, scheduled: false, inbox: false, lists: false }))
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, cairo(NOW).getTime(), o.scale ?? '1', !!o.planning])
  const state = { rows: tables(), writes: [], refused: [] }
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
        const no = refuse(state.rows, table, row)
        if (no) {
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
  await page.goto(`${BASE}${o.route ?? '/calendar'}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

/** The outbox goes through IndexedDB before it sends: wait until no write has landed for 1.5s. */
async function settle(state) {
  let n = -1
  let still = 0
  while (still < 3) {
    still = n === state.writes.length ? still + 1 : 0
    n = state.writes.length
    await sleep(500)
  }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name.replace(/%/g, '').replace(/ +/g, '-')}.png`) })
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const server = (state, table, f) => (state.rows[table] ?? []).filter(f)
const live = (e) => !e.deleted_at
const hm = (isoStr) => (isoStr ? new Date(Date.parse(isoStr) + 3 * 3600e3).toISOString().slice(11, 16) : null)
const refusedText = (state, from = 0) => JSON.stringify(state.refused.slice(from).map((x) => `${x.table}:${x.code}:${x.row?.title ?? x.row?.id}`))
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click({ timeout: 4000 }).catch(() => {})

/** Scroll the grid so `hhmm` sits mid-scroller; the screen point just inside that slot in `date`'s column. */
async function slotPoint(page, hhmm, date = DATE) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop - scroller.clientHeight / 2
  }, hhmm)
  await sleep(250)
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${date}"]`).first().boundingBox()
  return { x: col.x + col.width / 2, y: lane.y + 4 }
}
/** A mouse drag: press, a short move past FullCalendar's 5px threshold, then 20 steps to `to`, release. */
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await sleep(120)
  await page.mouse.down()
  await sleep(120)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(800)
}
/** The task's live blocks on the server. */
const blocksOf = (state, taskN) => server(state, 'calendar_events', (e) => e.task_id === id(taskN) && live(e))
const taskRow = (state, taskN) => server(state, 'tasks', (t) => t.id === id(taskN))[0]

/** One drop: `src` → the 15:00 slot (clear of the Admin Time block, 13:00–14:30), then the checks. `card` finds the dragged element; `expect` names the
 * task and the length; Undo puts it back. */
async function dropCase(name, o) {
  const { ctx, page, errors, state } = await open({ scale: o.scale, planning: o.planning })
  if (o.prep) await o.prep(page)
  const el = o.card(page)
  if (!(await el.count())) {
    check(`${name} the source is there`, false, 'not found')
    await shot(page, `${name}-missing`)
    return ctx.close()
  }
  await el.first().evaluate((e) => e.scrollIntoView({ block: 'center' })) // clear of the rail's sticky Now card
  await sleep(200)
  const to = await slotPoint(page, o.at ?? '15:00', o.date)
  const from = o.from ? await o.from(page) : center(await el.first().boundingBox())
  const r0 = state.refused.length
  await mouseDrag(page, from, to)
  await settle(state)
  const at = o.at ?? '15:00'
  const tid = o.taskId ? o.taskId(state) : id(o.task)
  const blocks = server(state, 'calendar_events', (e) => e.task_id === tid && live(e))
  const b = blocks[0]
  const t = server(state, 'tasks', (x) => x.id === tid)[0]
  check(`${name} one block for the task at ${at}–${o.end} (its length)`, blocks.length === 1 && hm(b.starts_at) === at && hm(b.ends_at) === o.end, JSON.stringify(blocks.map((e) => [hm(e.starts_at), hm(e.ends_at)])))
  check(`${name} the task is scheduled there${o.slotOut ? ', out of its slot' : ''}`, hm(t?.scheduled_start) === at && (!o.slotOut || t?.slot_id === null), JSON.stringify(t && [hm(t.scheduled_start), t.slot_id]))
  if (o.blockId) check(`${name} its own block moved (same id, no second block)`, b?.id === o.blockId, b?.id)
  check(`${name} toast "${o.toast}"`, await toastSoon(page, o.toast))
  check(`${name} the block is drawn on the grid`, (await page.locator(`.fc-timegrid-event[data-kf-id="${b?.id}"]`).count()) >= 1)
  await shot(page, name)
  if (o.undo !== false) {
    await undo(page, o.toast)
    await sleep(600)
    await settle(state)
    const back = server(state, 'calendar_events', (e) => e.task_id === tid && live(e))
    const t2 = server(state, 'tasks', (x) => x.id === tid)[0]
    check(`${name} Undo puts it back`, o.undone(back, t2), JSON.stringify([back.map((e) => [hm(e.starts_at), hm(e.ends_at)]), t2 && [hm(t2.scheduled_start), t2.slot_id, t2.deleted_at]]))
  }
  check(`${name} the server refused nothing`, state.refused.length === r0, refusedText(state, r0))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
const sec = (page, s) => page.locator(`.cal-rail-sec[data-section="${s}"]`)
const railCard = (s, title) => (page) => sec(page, s).locator('.unscheduled-task', { hasText: title })
const unplanned = (back, t) => back.length === 0 && t?.scheduled_start == null

for (const scale of SCALES) {
  const pc = `${Math.round(Number(scale) * 100)}%`
  // ── R: the calendar rail, every section ──
  if (want('r')) {
    await dropCase(`r-overdue ${pc}`, { scale, card: railCard('overdue', 'File the tax papers'), task: PAPERS, end: '15:30', toast: 'Scheduled · File the tax papers', undone: unplanned })
    await dropCase(`r-today ${pc}`, { scale, card: railCard('today', 'Stretch'), task: STRETCH, end: '15:15', toast: 'Scheduled · Stretch', undone: unplanned })
    await dropCase(`r-scheduled ${pc}`, {
      scale, card: railCard('scheduled', 'Water the plants'), task: WATER, end: '15:15', blockId: eid(WATERB), toast: 'Scheduled · Water the plants',
      undone: (back, t) => back.length === 1 && hm(back[0].starts_at) === '11:00' && hm(t?.scheduled_start) === '11:00',
    })
    await dropCase(`r-inbox ${pc}`, {
      scale, card: railCard('inbox', 'Buy printer ink'), end: '15:20', toast: 'Scheduled · Buy printer ink',
      taskId: (state) => server(state, 'tasks', (t) => t.title === 'Buy printer ink').at(-1)?.id,
      undone: (back, t) => back.length === 0 && (!t || !!t.deleted_at),
    })
    await dropCase(`r-lists ${pc}`, {
      scale, card: railCard('lists', 'Book the dentist'), task: DENTIST, end: '15:20', toast: 'Scheduled · Book the dentist', undone: unplanned,
      prep: async (page) => {
        if (await page.locator('.cal-rail-more', { hasText: 'Lists…' }).count()) await page.locator('.cal-rail-more', { hasText: 'Lists…' }).click()
        await sleep(300)
      },
    })
  }
  // ── P: a planning-mode card onto the agenda strip ──
  if (want('p')) {
    await dropCase(`p-planning ${pc}`, { scale, planning: true, card: (page) => page.locator('.cal-plan-list .unscheduled-task', { hasText: 'Stretch' }), task: STRETCH, end: '15:15', toast: 'Scheduled · Stretch', undone: unplanned })
  }
  // ── Y: a day-tray card (today's tasks with no time, under the grid) ──
  if (want('y')) {
    await dropCase(`y-tray ${pc}`, { scale, card: (page) => page.locator('.cal-tray .unscheduled-task', { hasText: 'Send the invoice' }), task: EMAIL, end: '15:45', toast: 'Scheduled · Send the invoice to Omar', undone: unplanned })
  }
  // ── H: a task held in a Time slot, out onto an empty time ──
  if (want('h')) {
    const row = (page) => page.locator(`.fc-timegrid-event[data-kf-id="${eid(ADMIN)}"] [data-slot-task="${id(REPLY)}"]`)
    await dropCase(`h-held ${pc}`, {
      scale, card: row, task: REPLY, at: '16:00', end: '16:15', slotOut: true, toast: 'Reply to Omar', undo: false,
      // the row's own grab spot, just past its check (cal-looks: the hover's × takes the title's room)
      from: async (page) => {
        const ck = await row(page).locator('.kf-ev-check').boundingBox()
        return { x: ck.x + ck.width + 3, y: ck.y + ck.height / 2 }
      },
    })
  }
  // ── B: a block moved within the grid still moves ──
  if (want('b')) {
    const { ctx, page, errors, state } = await open({ scale })
    const blk = page.locator(`.fc-timegrid-event[data-kf-id="${eid(STANDUP)}"]`).first()
    // 12:00 → 10:00: both in view with 11:00 mid-scroller, at 150% too
    await slotPoint(page, '11:00')
    const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="10:00:00"]').boundingBox()
    const b = await blk.boundingBox() // its middle: the top and bottom edges resize
    const r0 = state.refused.length
    await mouseDrag(page, center(b), { x: center(b).x, y: lane.y + b.height / 2 + 2 })
    await settle(state)
    const e = server(state, 'calendar_events', (x) => x.id === eid(STANDUP))[0]
    check(`b-move ${pc} the block moved to 10:00–11:00 (same id, its hour kept)`, hm(e?.starts_at) === '10:00' && hm(e?.ends_at) === '11:00', JSON.stringify(e && [hm(e.starts_at), hm(e.ends_at)]))
    check(`b-move ${pc} toast "Moved · Standup"`, await toastSoon(page, 'Moved · Standup'))
    check(`b-move ${pc} the server refused nothing`, state.refused.length === r0, refusedText(state, r0))
    check(`b-move ${pc} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── M: the phone (Kai's case — Android / any width under 768): a hold on a tray chip lifts it, the finger
// carries it onto the grid and lets go → scheduled there. A tap still opens the schedule sheet; a hold let
// go over the strip schedules nothing. Touch only (CDP touch events, as the Android WebView gets them). ──
const touch = (cdp, type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y) }] : [] })
async function tap(cdp, loc) {
  const p = center(await loc.boundingBox())
  await touch(cdp, 'touchStart', p)
  await sleep(40)
  await touch(cdp, 'touchEnd')
  await sleep(600)
}
/** Hold `from` past the long press (400ms), then carry it to `to` in 16 moves, and let go. */
async function holdDrag(cdp, from, to, hold = 650) {
  await touch(cdp, 'touchStart', from)
  await sleep(hold)
  for (let i = 1; i <= 16; i++) {
    await touch(cdp, 'touchMove', { x: from.x + ((to.x - from.x) * i) / 16, y: from.y + ((to.y - from.y) * i) / 16 })
    await sleep(30)
  }
  await sleep(250)
  await touch(cdp, 'touchEnd')
  await sleep(800)
}
/** The phone grid scrolled so `hhmm` sits a third down; the point just inside that quarter in the day column. */
async function phoneSlot(page, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  await page.evaluate((min) => {
    const s = document.querySelector('.pc-scroll')
    if (s) s.scrollTop = (min / 60) * 64 - s.clientHeight / 3
  }, h * 60 + m)
  await sleep(250)
  const r = await page.locator('.pc-track').boundingBox()
  const z = await page.evaluate(() => Number(document.documentElement.style.zoom) || 1)
  return { x: r.x + r.width / 2, y: r.y + ((h * 60 + m) / 60) * 64 * z + 6 }
}
const chip = (page, title) => page.locator('.pc-uns .pc-chip', { hasText: title }).first()
async function pickSeg(page, label) {
  const seg = page.locator('.pc-segs [role="radio"]', { hasText: label }).first()
  if ((await seg.count()) && (await seg.getAttribute('aria-checked')) !== 'true') await seg.click()
  await sleep(300)
}
async function phoneCase(name, o) {
  const { ctx, page, cdp, errors, state } = await open({ view: phone, route: o.route })
  if (o.route) {
    // from a task list to the calendar by its tab, as Kai goes
    await tap(cdp, page.locator('a[href="/calendar"]').last())
    await sleep(1200)
  }
  await pickSeg(page, o.seg)
  const c = chip(page, o.title)
  if (!(await c.count())) {
    check(`${name} the chip is there`, false, 'not found')
    await shot(page, `${name}-missing`)
    return ctx.close()
  }
  const to = await phoneSlot(page, '15:00')
  const from = center(await c.boundingBox())
  const r0 = state.refused.length
  await touch(cdp, 'touchStart', from)
  await sleep(650)
  for (let i = 1; i <= 16; i++) {
    await touch(cdp, 'touchMove', { x: from.x + ((to.x - from.x) * i) / 16, y: from.y + ((to.y - from.y) * i) / 16 })
    await sleep(30)
  }
  await sleep(250)
  const lifted = await page.locator('.pc-held-task').count()
  const bubble = await page.locator('.pc-bubble').innerText().catch(() => '')
  await shot(page, `${name}-carried`)
  await touch(cdp, 'touchEnd')
  await sleep(800)
  await settle(state)
  check(`${name} a hold lifts the chip and it follows the finger, the landing time showing`, lifted === 1 && bubble.startsWith('15:00'), `${lifted} ${JSON.stringify(bubble)}`)
  const tid = o.taskId ? o.taskId(state) : id(o.task)
  const blocks = server(state, 'calendar_events', (e) => e.task_id === tid && live(e))
  const t = server(state, 'tasks', (x) => x.id === tid)[0]
  check(`${name} let go at 15:00 → one block 15:00–${o.end} (its length)`, blocks.length === 1 && hm(blocks[0].starts_at) === '15:00' && hm(blocks[0].ends_at) === o.end, JSON.stringify(blocks.map((e) => [hm(e.starts_at), hm(e.ends_at)])))
  check(`${name} the task is scheduled there`, hm(t?.scheduled_start) === '15:00', JSON.stringify(t && hm(t.scheduled_start)))
  if (o.blockId) check(`${name} its own block moved (same id)`, blocks[0]?.id === o.blockId, blocks[0]?.id)
  check(`${name} toast "${o.toast}", no sheet opened by the release`, (await toastSoon(page, o.toast)) && (await page.locator('.kf-sheet, [role="dialog"]').count()) === 0)
  check(`${name} the block is drawn on the grid`, (await page.locator(`.pc-block[data-id="${blocks[0]?.id}"]`).count()) === 1)
  await shot(page, name)
  await undo(page, o.toast)
  await sleep(600)
  await settle(state)
  const back = server(state, 'calendar_events', (e) => e.task_id === tid && live(e))
  const t2 = server(state, 'tasks', (x) => x.id === tid)[0]
  check(`${name} Undo puts it back`, o.undone(back, t2), JSON.stringify([back.map((e) => [hm(e.starts_at), hm(e.ends_at)]), t2 && [hm(t2.scheduled_start), t2.deleted_at]]))
  check(`${name} the server refused nothing`, state.refused.length === r0, refusedText(state, r0))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('m')) {
  await phoneCase('m-today', { seg: 'Today', title: 'Stretch', task: STRETCH, end: '15:15', toast: 'Scheduled · Stretch', undone: unplanned })
  await phoneCase('m-overdue', { seg: 'Overdue', title: 'File the tax papers', task: PAPERS, end: '15:30', toast: 'Scheduled · File the tax papers', undone: unplanned })
  await phoneCase('m-scheduled', {
    seg: 'Scheduled', title: 'Water the plants', task: WATER, end: '15:15', blockId: eid(WATERB), toast: 'Scheduled · Water the plants',
    undone: (back, t) => back.length === 1 && hm(back[0].starts_at) === '11:00' && hm(t?.scheduled_start) === '11:00',
  })
  await phoneCase('m-inbox', {
    seg: 'Inbox', title: 'Buy printer ink', end: '15:20', toast: 'Scheduled · Buy printer ink',
    taskId: (state) => server(state, 'tasks', (t) => t.title === 'Buy printer ink').at(-1)?.id,
    undone: (back, t) => back.length === 0 && (!t || !!t.deleted_at),
  })
  await phoneCase('m-route', { route: '/tasks', seg: 'Today', title: 'Send the invoice to Omar', task: EMAIL, end: '15:45', toast: 'Scheduled · Send the invoice to Omar', undone: unplanned })
  await phoneCase('m-lists', { seg: 'Lists', title: 'Book the dentist', task: DENTIST, end: '15:20', toast: 'Scheduled · Book the dentist', undone: unplanned })

  // A tap still opens the schedule sheet; a hold carried back over the strip schedules nothing; the tray still scrolls.
  const { ctx, page, cdp, errors, state } = await open({ view: phone })
  await pickSeg(page, 'Today')
  await tap(cdp, chip(page, 'Stretch'))
  check('m-tap a tap on a chip opens its schedule sheet (as before)', (await chip(page, 'Stretch').getAttribute('aria-expanded')) === 'true')
  await shot(page, 'm-tap-sheet')
  await page.keyboard.press('Escape')
  await sleep(500)
  if ((await chip(page, 'Stretch').getAttribute('aria-expanded')) === 'true') await page.goBack().catch(() => {})
  await sleep(500)
  const w0 = state.writes.length
  const from = center(await chip(page, 'Stretch').boundingBox())
  await holdDrag(cdp, from, { x: from.x + 40, y: from.y - 60 })
  await settle(state)
  check('m-strip a hold let go off the grid (over the strip) writes nothing and opens nothing', state.writes.slice(w0).filter((w) => w.table !== 'app_settings').length === 0 && (await page.locator('.pc-held-task').count()) === 0 && (await chip(page, 'Stretch').getAttribute('aria-expanded')) !== 'true')
  check('m-strip no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── T: a touch screen on the desktop layout (a tablet, an Android window wider than 768): a hold on a rail
// card, then the finger carries it — the grid's own 400ms long press, not FullCalendar's 1s default. ──
if (want('t')) {
  const { ctx, page, cdp, errors, state } = await open({ view: { viewport: { width: 1024, height: 768 }, hasTouch: true } })
  const c = sec(page, 'today').locator('.unscheduled-task', { hasText: 'Stretch' })
  if (!(await c.count())) check('t-tablet the rail card is there', false)
  else {
    const to = await slotPoint(page, '15:00')
    const r0 = state.refused.length
    await holdDrag(cdp, center(await c.boundingBox()), to, 600)
    await settle(state)
    const blocks = blocksOf(state, STRETCH).filter(live)
    check('t-tablet a held rail card carried onto 15:00 → its block 15:00–15:15', blocks.length === 1 && hm(blocks[0].starts_at) === '15:00' && hm(blocks[0].ends_at) === '15:15', JSON.stringify(blocks.map((e) => [hm(e.starts_at), hm(e.ends_at)])))
    check('t-tablet toast "Scheduled · Stretch"', await toastSoon(page, 'Scheduled · Stretch'))
    check('t-tablet the server refused nothing', state.refused.length === r0, refusedText(state, r0))
    await shot(page, 't-tablet')
  }
  check('t-tablet no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
