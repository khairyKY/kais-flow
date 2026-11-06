// quiet-undo (Kai 2026-11-06: "too many notifications when changing any event or stuff. Keep Ctrl+Z global"):
// routine edits (move, resize, tick) make NO toast on a computer; Ctrl+Z / ⌘Z undoes the newest action from
// anywhere, Ctrl+Shift+Z / Ctrl+Y redoes it, a text field keeps its own undo; delete still toasts; Settings →
// "Undo toasts: All" brings every toast back; on a phone a run of quiet edits shares one "N changes" toast.
// Real app, STRICT mock PostgREST (drag-fix's), Chromium.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=m,d,i,a,p)
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 08:00; the calendar opens on Day.
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
    localStorage.setItem('kf_ui_scale', scale); localStorage.setItem('kf_undo_hints', '9') // the first-times hint has its own check
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

const taskRow = (state, n) => server(state, 'tasks', (t) => t.id === id(n))[0]
const undoBtns = (page) => page.locator('.kf-toast .kf-toast-act', { hasText: 'Undo' })
const standup = (state) => server(state, 'calendar_events', (x) => x.id === eid(STANDUP))[0]
const standupAt = (state) => { const e = standup(state); return e && `${hm(e.starts_at)}-${hm(e.ends_at)}` }
const block = (page) => page.locator(`.fc-timegrid-event[data-kf-id="${eid(STANDUP)}"]`).first()
/** Standup 12:00–13:00 → 10:00–11:00, by dragging the block (as drag-fix b-move does). */
async function moveStandup(page, state) {
  await slotPoint(page, '11:00')
  const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="10:00:00"]').boundingBox()
  const b = await block(page).boundingBox()
  await mouseDrag(page, center(b), { x: center(b).x, y: lane.y + b.height / 2 + 2 })
  await settle(state)
}
const press = async (page, keys) => { await page.keyboard.press(keys); await sleep(1500); await settle({ writes: [] }) }
/** j until the list's focus ring sits on `elId` (useListKeys moves real focus). */
async function focusRow(page, elId, max = 8) {
  for (const key of ['j', 'k']) {
    for (let i = 0; i < max; i++) {
      if ((await page.evaluate(() => document.activeElement?.id)) === elId) return true
      await page.keyboard.press(key)
      await sleep(120)
    }
  }
  return (await page.evaluate(() => document.activeElement?.id)) === elId
}

// ── M: a drag-move and a resize make no toast; Ctrl+Z walks them back, Ctrl+Shift+Z / Ctrl+Y forward again. ──
if (want('m')) {
  const { ctx, page, errors, state } = await open({})
  check('m0 Standup starts 12:00–13:00', standupAt(state) === '12:00-13:00', standupAt(state))
  await moveStandup(page, state)
  check('m1 the drag moved it to 10:00–11:00', standupAt(state) === '10:00-11:00', standupAt(state))
  check('m2 …with no toast at all (no Undo button, no "Moved")', (await undoBtns(page).count()) === 0 && (await page.locator('.kf-toast-msg', { hasText: 'Moved' }).count()) === 0)
  // resize: the bottom edge down
  await slotPoint(page, '11:00')
  const b = await block(page).boundingBox()
  await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + b.height - 2 }, { x: b.x + b.width / 2, y: b.y + b.height + 40 })
  await settle(state)
  const resized = standupAt(state)
  check('m3 a resize changed the end', resized !== '10:00-11:00' && resized?.startsWith('10:00-'), resized)
  check('m4 …also silent', (await undoBtns(page).count()) === 0 && (await page.locator('.kf-toast-msg', { hasText: 'Resized' }).count()) === 0)
  await shot(page, 'm-silent')
  await press(page, 'Control+z')
  check('m5 Ctrl+Z undid the resize only', standupAt(state) === '10:00-11:00', standupAt(state))
  await press(page, 'Control+z')
  check('m6 Ctrl+Z again undid the move → 12:00–13:00', standupAt(state) === '12:00-13:00', standupAt(state))
  await press(page, 'Control+Shift+z')
  check('m7 Ctrl+Shift+Z redid the move', standupAt(state) === '10:00-11:00', standupAt(state))
  await press(page, 'Control+y')
  check('m8 Ctrl+Y redid the resize', standupAt(state) === resized, standupAt(state))
  await press(page, 'Control+z')
  check('m9 undo again after redo → back to the move only', standupAt(state) === '10:00-11:00', standupAt(state))
  check('m10 no refused writes, no page errors', state.refused.length === 0 && errors.length === 0, refusedText(state) + errors.join(' | '))
  await ctx.close()
}

// ── X: global — the edit is on the calendar, Ctrl+Z is pressed on another page. ──
if (want('x')) {
  const { ctx, page, errors, state } = await open({})
  await moveStandup(page, state)
  check('x1 moved to 10:00–11:00', standupAt(state) === '10:00-11:00', standupAt(state))
  await page.locator('a[href="/tasks"]').first().click()
  await page.waitForURL('**/tasks**', { timeout: 6000 }).catch(() => {})
  await sleep(1200)
  check('x2 now on Tasks (client-side, history kept)', new URL(page.url()).pathname === '/tasks', page.url())
  await press(page, 'Control+z')
  check('x3 Ctrl+Z on another page restored the calendar block', standupAt(state) === '12:00-13:00', standupAt(state))
  check('x4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D: delete is still loud. ──
if (want('d')) {
  const { ctx, page, errors, state } = await open({})
  await slotPoint(page, '12:00')
  const b = await block(page).boundingBox()
  await page.mouse.click(b.x + 30, b.y + 10)
  await sleep(500)
  await page.locator('[role="menu"][aria-label="Block details"]').getByRole('menuitem', { name: /^Delete/ }).click()
  await settle(state)
  check('d1 Standup deleted on the server', !!standup(state)?.deleted_at)
  check('d2 a toast says so, with Undo', (await toastSoon(page, 'Deleted')) && (await undoBtns(page).count()) >= 1)
  await shot(page, 'd-toast')
  await press(page, 'Control+z')
  check('d3 Ctrl+Z brings it back', !standup(state)?.deleted_at)
  check('d4 …and the toast went with it', (await undoBtns(page).count()) === 0)
  check('d5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── I: a text field keeps its own Ctrl+Z. ──
if (want('i')) {
  const { ctx, page, errors, state } = await open({})
  await moveStandup(page, state)
  await page.locator('a[href="/tasks"]').first().click()
  await sleep(1500)
  const quick = page.getByPlaceholder(/Quick add task/)
  await quick.click()
  await page.keyboard.type('abc')
  await page.keyboard.press('Control+z')
  await sleep(800)
  const v = await quick.inputValue()
  check('i1 Ctrl+Z in the field undid the typing (native)', v !== 'abc', JSON.stringify(v))
  check('i2 …and did not touch the calendar edit', standupAt(state) === '10:00-11:00', standupAt(state))
  await quick.fill('')
  await page.evaluate(() => document.activeElement?.blur())
  await press(page, 'Control+z')
  check('i3 blurred, Ctrl+Z undoes the edit', standupAt(state) === '12:00-13:00', standupAt(state))
  check('i4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A: "Undo toasts: All" gives the toast back; the first-times hint shows, with no Undo button. ──
if (want('a')) {
  const { ctx, page, errors, state } = await open({})
  await page.evaluate(() => { localStorage.setItem('kf_undo_toasts', 'all') })
  await moveStandup(page, state)
  check('a1 with "All", the move says "Moved" with an Undo', (await toastSoon(page, 'Moved')) && (await undoBtns(page).count()) >= 1)
  await undoBtns(page).first().click()
  await settle(state)
  check('a2 …and that Undo works', standupAt(state) === '12:00-13:00', standupAt(state))
  await page.evaluate(() => { localStorage.setItem('kf_undo_toasts', 'fewer'); localStorage.setItem('kf_undo_hints', '0') })
  await moveStandup(page, state)
  check('a3 "Fewer": the first quiet edit shows the one-line hint, with no Undo button', (await toastSoon(page, 'Undo with')) && (await undoBtns(page).count()) === 0)
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await page.getByText('Notifications & sound', { exact: true }).first().click().catch(() => {})
  await sleep(800)
  const row = page.getByText('Undo toasts', { exact: true }).first()
  await row.scrollIntoViewIfNeeded().catch(() => {})
  check('a4 Settings → Notifications & sound has the "Undo toasts" row (Fewer / All)', (await row.count()) === 1 && (await page.getByText('Fewer', { exact: true }).count()) >= 1)
  await shot(page, 'a-settings')
  check('a5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: a phone has no keyboard — quiet edits share one toast with Undo: "2 changes". ──
if (want('p')) {
  const { ctx, page, errors, state } = await open({ view: phone, route: '/tasks?list=today' })
  for (const n of [STRETCH, EMAIL]) {
    await focusRow(page, `task-${id(n)}`)
    await page.keyboard.press('e')
    await sleep(500)
  }
  await settle(state)
  const st = (n) => taskRow(state, n)?.status
  check('p1 both ticked', st(STRETCH) === 'done' && st(EMAIL) === 'done', `${st(STRETCH)} ${st(EMAIL)}`)
  const msgs = (await page.locator('.kf-toast-msg').allInnerTexts()).join('|')
  check('p2 ONE toast, "2 changes", with Undo', (await page.locator('.kf-toast').count()) === 1 && msgs.includes('2 changes'), msgs)
  await shot(page, 'p-coalesced')
  await undoBtns(page).first().click()
  await settle(state)
  check('p3 its Undo took both back', st(STRETCH) === 'todo' && st(EMAIL) === 'todo', `${st(STRETCH)} ${st(EMAIL)}`)
  check('p4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
