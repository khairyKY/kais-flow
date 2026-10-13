// Time Slots (Kai 2026-10-13, parity audit B2 → a; migration 0073) on the REAL app against a MOCKED
// backend (the cal-rail-drop recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up
// session in localStorage, Playwright answers every REST call). Writes are recorded AND applied to the
// mock rows, so a refetch can't hide a bug behind the optimistic cache.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 08:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5276'
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, over.day), ends_at: iso(to, over.day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
  recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, ...over,
})
const REVIEW = 1, TYRE = 2, HELD = 3, TUEHELD = 4
const CODE = 1, TYREB = 2, SHAHEEN = 3
const TASKS = [
  task(REVIEW, 'Review Kai', { duration_min: 30, due_at: iso('09:00') }),
  task(TYRE, 'Call the tyre supplier', { duration_min: 30, due_at: iso('09:00'), scheduled_start: iso('16:30'), scheduled_end: iso('17:00') }),
]
// "Code block💻" today 10:00–12:00; "Shaheen🛞" every day 13:00–15:00 (one row, 0061).
const EVENTS = [
  ev(CODE, 'Code block💻', '10:00', '12:00', null, 'time_block'),
  ev(TYREB, 'Call the tyre supplier', '16:30', '17:00', TYRE),
  ev(SHAHEEN, 'Shaheen🛞', '13:00', '15:00', null, 'time_block', { recurrence_rule: 'FREQ=DAILY' }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', help_seen: ['hint:calendar'] }
const tables = (extra = {}) => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], ...extra })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(route = '/calendar', o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ lists: true }))
  }, [JSON.stringify(session)])
  const state = { rows: tables(o.tables), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      const rows = (state.rows[table] ??= [])
      if (req.method() === 'DELETE') {
        const gone = url.searchParams.get('id')?.replace(/^eq\./, '')
        state.rows[table] = rows.filter((x) => x.id !== gone)
      } else if (body && typeof body === 'object') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const i = rows.findIndex((x) => x.id === row.id)
          if (i === -1) rows.push(row)
          else rows[i] = { ...rows[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('08:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const lastOf = (state, table, rowId, from = 0) => posts(state, table, from).filter((x) => x.id === rowId).at(-1)
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const fcBlock = (page, n, day = '2026-10-12') => page.locator(`td.fc-timegrid-col[data-date="${day}"] .fc-event[data-kf-id^="${eid(n)}"]`).first()
const slotRow = (page, n, taskN, day) => fcBlock(page, n, day).locator(`[data-slot-task="${id(taskN)}"]`)
const card = (page, taskN) => page.locator(`.cal-rail .unscheduled-task[data-task-id="${id(taskN)}"]`)
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).click()
const NOSLOT = (t) => t && t.slot_id === null && t.slot_date === null && t.scheduled_start === null

/** Scroll the grid so `hhmm` is mid-screen; the screen point of that slot in `day`'s column. */
async function slotPoint(page, hhmm, day = '2026-10-12') {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop - scroller.clientHeight / 2
  }, hhmm)
  await sleep(250)
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${day}"]`).boundingBox()
  return { x: col.x + col.width / 2, y: lane.y + 5 }
}
/** A lane's top on screen (no scrolling). */
const laneY = async (page, hhmm) => (await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()).y
/** Where to pick a block up: its own title (the slot's task rows and the checkbox swallow a press). */
const grip = async (page, n) => center(await fcBlock(page, n).locator('.kf-ev-text > .fc-event-title').first().boundingBox())
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

// ── S1: a rail card dropped on "Code block💻" goes IN it: no task block, the slot's times; the slot
// draws it with "1 task · 30m of 2h"; Undo takes it back out ──
if (want('s1')) {
  const { ctx, page, errors, state } = await open()
  const to = await slotPoint(page, '10:30')
  const from = center(await card(page, REVIEW).boundingBox())
  const w0 = state.writes.length
  await mouseDrag(page, from, to)
  await settle(state)
  const t = lastOf(state, 'tasks', id(REVIEW), w0)
  check('s1 the task is in the slot: slot_id, slot_date, the slot\'s times', t?.slot_id === eid(CODE) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('10:00') && t?.scheduled_end === iso('12:00'), JSON.stringify(t && [t.slot_id, t.slot_date, t.scheduled_start]))
  check('s1 no task block was made', posts(state, 'calendar_events', w0).filter((e) => e.task_id === id(REVIEW)).length === 0)
  check('s1 toast "In Code block💻 · Review Kai"', await toastSoon(page, 'In Code block💻 · Review Kai'))
  await sleep(300)
  check('s1 the slot draws its row and fill', (await slotRow(page, CODE, REVIEW).count()) === 1 && /1 task · 30m of 2h/i.test(await fcBlock(page, CODE).locator('.kf-ev-fill').innerText().catch(() => '')), await fcBlock(page, CODE).innerText().catch(() => ''))
  check('s1 the card left the rail', (await card(page, REVIEW).count()) === 0)
  await shot(page, 's1-in-slot')
  const w1 = state.writes.length
  await undo(page, 'In Code block')
  await sleep(500)
  await settle(state)
  check('s1 Undo: out of the slot, back in the rail', NOSLOT(lastOf(state, 'tasks', id(REVIEW), w1)) && (await slotRow(page, CODE, REVIEW).count()) === 0 && (await card(page, REVIEW).count()) === 1)
  check('s1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// Already in the slot, for the rest.
const inCode = { tasks: [...TASKS, task(HELD, 'Write the slot spec', { duration_min: 45, due_at: iso('09:00'), slot_id: eid(CODE), slot_date: '2026-10-12', scheduled_start: iso('10:00'), scheduled_end: iso('12:00') })] }

// ── S2: tick a slot task's checkbox → done (Undo); ⋯ → Out of the slot → the rail (Undo) ──
if (want('s2')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  check('s2 a slotted task is drawn inside its slot with the fill', (await slotRow(page, CODE, HELD).count()) === 1 && /1 task · 45m of 2h/i.test(await fcBlock(page, CODE).innerText().catch(() => '')))
  let w0 = state.writes.length
  await slotRow(page, CODE, HELD).locator('.kf-ev-check').click()
  await settle(state)
  check('s2 its checkbox completes it ("Done" toast)', lastOf(state, 'tasks', id(HELD), w0)?.status === 'done' && (await toastSoon(page, 'Done')))
  await sleep(300)
  check('s2 …drawn done in the slot', (await slotRow(page, CODE, HELD).getAttribute('class'))?.includes('kf-done'))
  await shot(page, 's2-done')
  w0 = state.writes.length
  await page.locator('.kf-toast', { hasText: 'Done' }).getByRole('button', { name: 'Undo' }).click()
  await settle(state)
  check('s2 Undo reopens it', lastOf(state, 'tasks', id(HELD), w0)?.status === 'todo')
  await sleep(300)
  await slotRow(page, CODE, HELD).locator('.kf-ev-slot-more').click()
  await sleep(400)
  await shot(page, 's2-menu')
  const item = page.locator('[role="menuitem"]', { hasText: 'Out of the slot' }).first()
  check('s2 ⋯ is the task menu with "Out of the slot"', (await item.count()) === 1)
  w0 = state.writes.length
  await item.click()
  await settle(state)
  check('s2 Out of the slot: unscheduled, back in the rail\'s Today', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && (await card(page, HELD).count()) === 1 && (await slotRow(page, CODE, HELD).count()) === 0)
  check('s2 toast "Out of the slot · Write the slot spec"', await toastSoon(page, 'Out of the slot · Write the slot spec'))
  w0 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  check('s2 Undo: back in the slot', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1)
  check('s2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S3: drag the slot to 15:30 → its task's times move with it; Undo moves them back ──
if (want('s3')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '11:30')
  const from = await grip(page, CODE)
  const w0 = state.writes.length
  await mouseDrag(page, from, { x: from.x, y: from.y + (await laneY(page, '12:30')) - (await laneY(page, '10:00')) })
  await settle(state)
  const slot = lastOf(state, 'calendar_events', eid(CODE), w0)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('s3 the slot moved later (≈12:30; the drag lands on a quarter)', !!slot && Date.parse(slot.starts_at) >= Date.parse(iso('12:00')), slot?.starts_at)
  check('s3 its task moved with it (start = the slot\'s new start)', !!slot && t?.scheduled_start === slot.starts_at && t?.scheduled_end === slot.ends_at && t?.slot_id === eid(CODE), JSON.stringify(t && [t.scheduled_start, slot?.starts_at]))
  await shot(page, 's3-moved')
  const w1 = state.writes.length
  await undo(page, 'Moved · Code block')
  await settle(state)
  check('s3 Undo: the task back at 10:00', lastOf(state, 'tasks', id(HELD), w1)?.scheduled_start === iso('10:00'))
  check('s3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S4: delete the slot (right-click → Delete) → its task is unscheduled; Undo brings both back ──
if (want('s4')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  const b = await fcBlock(page, CODE).boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + 8, { button: 'right' })
  await sleep(300)
  const w0 = state.writes.length
  await page.locator('[role="menuitem"]', { hasText: 'Delete' }).first().click()
  await settle(state)
  check('s4 the slot is trashed and its task unscheduled (back in the rail)', !!lastOf(state, 'calendar_events', eid(CODE), w0)?.deleted_at && NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && (await card(page, HELD).count()) === 1)
  const w1 = state.writes.length
  await undo(page, 'Deleted · Code block')
  await settle(state)
  await sleep(300)
  const back = lastOf(state, 'calendar_events', eid(CODE), w1), backT = lastOf(state, 'tasks', id(HELD), w1)
  check('s4 Undo: the slot back, the task in it', back?.deleted_at === null && backT?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1, JSON.stringify([back?.deleted_at, backT?.slot_id, backT?.scheduled_start, await slotRow(page, CODE, HELD).count()]))
  check('s4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S5: a repeating slot: the task shows only in its own occurrence (Tuesday's), and a task block
// dragged onto Monday's occurrence goes into THAT one (its block trashed) ──
if (want('s5')) {
  const tue = { tasks: [...TASKS, task(TUEHELD, 'Tuesday slot task', { duration_min: 30, due_at: iso('09:00', 13), slot_id: eid(SHAHEEN), slot_date: '2026-10-13', scheduled_start: iso('13:00', 13), scheduled_end: iso('15:00', 13) })] }
  const { ctx, page, errors, state } = await open('/calendar', { tables: tue })
  await slotPoint(page, '14:00')
  check('s5 Tuesday\'s occurrence holds it, Monday\'s doesn\'t', (await slotRow(page, SHAHEEN, TUEHELD, '2026-10-13').count()) === 1 && (await slotRow(page, SHAHEEN, TUEHELD, '2026-10-12').count()) === 0)
  await shot(page, 's5-occurrence')
  await slotPoint(page, '15:00')
  const from = await grip(page, TYREB)
  const w0 = state.writes.length
  await mouseDrag(page, from, { x: from.x, y: from.y + (await laneY(page, '13:30')) - (await laneY(page, '16:30')) })
  await settle(state)
  const t = lastOf(state, 'tasks', id(TYRE), w0)
  check('s5 a task block dropped on Monday\'s Shaheen: the task in that occurrence', t?.slot_id === eid(SHAHEEN) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('13:00'), JSON.stringify(t && [t.slot_id, t.slot_date, t.scheduled_start]))
  check('s5 …its own block trashed', !!lastOf(state, 'calendar_events', eid(TYREB), w0)?.deleted_at)
  await sleep(300)
  check('s5 …drawn in Monday\'s occurrence only', (await slotRow(page, SHAHEEN, TYRE, '2026-10-12').count()) === 1 && (await slotRow(page, SHAHEEN, TYRE, '2026-10-13').count()) === 0)
  await shot(page, 's5-block-into-slot')
  check('s5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S6: the Tasks list reads a slotted task's time as the slot's ──
if (want('s6')) {
  const { ctx, page, errors } = await open('/tasks', { tables: inCode })
  await sleep(800)
  const row = page.locator('[data-task-id], .kf-task-row, li, div').filter({ hasText: 'Write the slot spec' }).last()
  const txt = await page.locator('body').innerText()
  check('s6 Tasks shows "in Code block💻 · 10:00"', /in Code block💻 · 10:00/i.test(txt), (await row.innerText().catch(() => '')).slice(0, 120))
  await shot(page, 's6-tasks')
  check('s6 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
