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
// "File captures for me" defaults OFF since v1.5.0 (ai-chat item 7); p4's ⌘K line is about slot filing, so it's on.
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', auto_file_captures: true, help_seen: ['hint:calendar', 'notice:autofile'] }
const tables = (extra = {}) => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], ...extra })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
async function open(route = '/calendar', o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? { viewport: { width: 1440, height: 900 } }), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, quiet, uid]) => {
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true })) // its strings read the 24-hour clock (lib/clock, 2026-10-22)
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ lists: true }))
    // The phone runs (slots-phone): no tour bubble over the grid.
    if (quiet) localStorage.setItem('kf_tour_done', '1')
    if (quiet) localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [JSON.stringify(session), !!o.view, UID])
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
  state.page = page
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
/** The page's outbox (lib/outbox, idb-keyval 'kf-outbox'): how many writes still wait to go out. */
const queued = (page) =>
  page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('keyval-store')
    r.onerror = () => res(0)
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('keyval').objectStore('keyval').get('kf-outbox')
        g.onsuccess = () => res((g.result ?? []).length)
        g.onerror = () => res(0)
      } catch {
        res(0)
      }
    }
  })).catch(() => 0)
async function settle(state) {
  // slots-phone: first the outbox drains (up to 8s). The drain lagged well past 400ms, and a quiet
  // 400ms alone then read as "nothing written" (the s5 / Undo misses). The lag was not getSession
  // (0ms): every queue step re-rendered the whole calendar (outbox-speed 2026-10-14, fixed; s5 now
  // passes without this wait). Kept anyway: writes leave asynchronously by design.
  for (let i = 0; i < 40 && state.page && (await queued(state.page)) > 0; i++) await sleep(200)
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
// cal-looks: the block's title sits in its title line (.kf-ev-head) with the hover actions
const grip = async (page, n) => center(await fcBlock(page, n).locator('.kf-ev-head > .fc-event-title').first().boundingBox())
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  // cal-wave (item 18): an empty rail section only comes back once a drag is up — `to` may be read then.
  if (typeof to === 'function') {
    await page.mouse.move(from.x + 12, from.y + 4)
    await sleep(200)
    to = await to()
  }
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

// ── slots-phone (2026-10-14): the phone grid draws a slot's tasks; "Into a slot…" in the task ⋯
// menu (phone sheet + desktop submenu); the command bar's `>slot` ──
const pcBlock = (page, n) => page.locator(`.pc-block[data-id^="${eid(n)}"]`).first()
const pcRow = (page, n, taskN) => pcBlock(page, n).locator(`[data-slot-task="${id(taskN)}"]`)
const sheetRow = (page, label) => page.locator('.kf-as-row', { hasText: label })

// P1: the phone grid — the slot draws its task and fill; the box completes it (Undo); a tap opens the task.
if (want('p1')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode, view: phone })
  await pcBlock(page, CODE).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(300)
  check('p1 phone: the slot draws its task row and "1 task · 45m of 2h"', (await pcRow(page, CODE, HELD).count()) === 1 && /1 task · 45m of 2h/i.test(await pcBlock(page, CODE).innerText().catch(() => '')), await pcBlock(page, CODE).innerText().catch(() => ''))
  await shot(page, 'p1-phone-slot')
  await page.evaluate(() => (document.documentElement.dataset.theme = 'night'))
  await sleep(300)
  await shot(page, 'p1-phone-slot-night')
  await page.evaluate(() => (document.documentElement.dataset.theme = 'day'))
  let w0 = state.writes.length
  await pcRow(page, CODE, HELD).getByRole('checkbox').click()
  await settle(state)
  check('p1 phone: its box completes it ("Done" toast)', lastOf(state, 'tasks', id(HELD), w0)?.status === 'done' && (await toastSoon(page, 'Done')))
  await sleep(300)
  check('p1 phone: …drawn done, and nothing else opened', (await pcRow(page, CODE, HELD).getAttribute('class'))?.includes('is-done') && !/[?&]task=/.test(page.url()) && (await page.locator('[role="dialog"]').count()) === 0)
  await shot(page, 'p1-phone-done')
  w0 = state.writes.length
  await page.locator('.kf-toast', { hasText: 'Done' }).getByRole('button', { name: 'Undo' }).click()
  await settle(state)
  check('p1 phone: Undo reopens it', lastOf(state, 'tasks', id(HELD), w0)?.status === 'todo')
  await sleep(300)
  await pcRow(page, CODE, HELD).locator('.pc-name').click()
  await sleep(800)
  const titled = await page.evaluate(() => [...document.querySelectorAll('textarea, input')].some((el) => el.value === 'Write the slot spec'))
  check('p1 phone: a tap on the row opens the task (its sheet, ?task=)', page.url().includes(`task=${id(HELD)}`) && titled, page.url())
  await shot(page, 'p1-phone-task-sheet')
  check('p1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P2: phone — ⋯ → Into a slot… lists today's and the next days' Time blocks; picking one puts the task
// in it (Undo); a repeating slot's later occurrence is its own row.
if (want('p2')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: phone })
  const row = page.locator(`#task-${id(REVIEW)}`)
  await row.getByRole('button', { name: /More actions for/ }).click()
  await sleep(500)
  check('p2 phone: the ⋯ sheet has "Into a slot…"', (await sheetRow(page, 'Into a slot…').count()) === 1)
  await sheetRow(page, 'Into a slot…').click()
  await sleep(600)
  const rows = await page.locator('.kf-as-row').allInnerTexts()
  check('p2 phone: it lists Code block💻 (Today), then Shaheen🛞 for each of 8 days', rows.length === 9 && /Code block💻/.test(rows[0]) && /Today/i.test(rows[0]) && rows.slice(1).every((r) => /Shaheen🛞/.test(r)) && /Tomorrow/i.test(rows[2]), rows.map((r) => r.replace(/\n/g, ' ')).join(' | '))
  await shot(page, 'p2-phone-into-a-slot')
  let w0 = state.writes.length
  await sheetRow(page, 'Code block💻').click()
  await settle(state)
  const t = lastOf(state, 'tasks', id(REVIEW), w0)
  check('p2 phone: picked → in Code block💻 (slot, day, times)', t?.slot_id === eid(CODE) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('10:00') && t?.scheduled_end === iso('12:00'), JSON.stringify(t && [t.slot_id, t.slot_date, t.scheduled_start]))
  check('p2 phone: toast "In Code block💻 · Review Kai"', await toastSoon(page, 'In Code block💻 · Review Kai'))
  await sleep(300)
  check('p2 phone: the row reads "in Code block💻 · 10:00"', /in Code block💻 · 10:00/i.test(await row.innerText().catch(() => '')), await row.innerText().catch(() => ''))
  w0 = state.writes.length
  await undo(page, 'In Code block')
  await settle(state)
  check('p2 phone: Undo takes it back out', NOSLOT(lastOf(state, 'tasks', id(REVIEW), w0)))
  await sleep(300)
  await row.getByRole('button', { name: /More actions for/ }).click()
  await sleep(500)
  await sheetRow(page, 'Into a slot…').click()
  await sleep(600)
  w0 = state.writes.length
  await page.locator('.kf-as-row').nth(2).click() // Shaheen🛞, tomorrow
  await settle(state)
  const u = lastOf(state, 'tasks', id(REVIEW), w0)
  check('p2 phone: tomorrow’s Shaheen🛞 → that occurrence (series row, Tue 13)', u?.slot_id === eid(SHAHEEN) && u?.slot_date === '2026-10-13' && u?.scheduled_start === iso('13:00', 13), JSON.stringify(u && [u.slot_id, u.slot_date, u.scheduled_start]))
  check('p2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P3: desktop — right-click a task row → Into a slot… ▸ Code block💻.
if (want('p3')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const row = page.locator(`#task-${id(REVIEW)}`)
  await row.click({ button: 'right' })
  await sleep(400)
  const item = page.locator('[role="menuitem"]', { hasText: 'Into a slot…' }).first()
  check('p3 desktop: the task menu has "Into a slot…"', (await item.count()) === 1)
  await item.hover()
  await sleep(700)
  const pick = page.locator('[role="menuitem"]', { hasText: 'Code block💻' }).first()
  check('p3 desktop: its submenu lists Code block💻 with its time', (await pick.count()) === 1 && /Today · 10:00–12:00/.test(await pick.innerText().catch(() => '')), await pick.innerText().catch(() => ''))
  await shot(page, 'p3-desktop-into-a-slot')
  const w0 = state.writes.length
  await pick.click()
  await settle(state)
  const t = lastOf(state, 'tasks', id(REVIEW), w0)
  check('p3 desktop: picked → in the slot, with the toast', t?.slot_id === eid(CODE) && t?.slot_date === '2026-10-12' && (await toastSoon(page, 'In Code block💻 · Review Kai')))
  check('p3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P4: the command bar — `>code` names the slot: a chip, then Enter puts the new task in it.
if (want('p4')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await page.keyboard.press('Control+k')
  const input = page.locator('#kf-capture-input')
  await input.waitFor({ timeout: 5000 })
  await input.fill('Fix the login bug >code')
  await sleep(400)
  const chip = page.locator('[data-chip="slot"]')
  check('p4 bar: `>code` shows the "In Code block💻" chip', /In Code block/i.test(await chip.innerText().catch(() => '')), await chip.innerText().catch(() => ''))
  await shot(page, 'p4-bar-chip')
  const w0 = state.writes.length
  await input.press('Enter')
  await settle(state)
  const t = posts(state, 'tasks', w0).filter((x) => x.title === 'Fix the login bug').at(-1)
  check('p4 bar: Enter → the task, in Code block💻 (no block of its own)', t?.slot_id === eid(CODE) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('10:00') && posts(state, 'calendar_events', w0).every((e) => e.task_id !== t?.id), JSON.stringify(t && [t.title, t.slot_id, t.slot_date]))
  check('p4 bar: toast "Added to Code block💻"', await toastSoon(page, 'Added to Code block💻'))
  check('p4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── slots-ux (Kai 2026-10-16: "there is something wrong with the logic of the time slots, how do I
// remove a task from the time slot"): every flow in the handoff's table, desktop and phone. ──
// cal-looks: grabbed just past the row's check — in a week column the hover's × takes the title's room (the drawn
// row's 6px gaps), so the title's centre could land on the ×
const rowPt = async (page, slotN = CODE, taskN = HELD, day) => {
  const ck = await slotRow(page, slotN, taskN, day).locator('.kf-ev-check').boundingBox()
  return { x: ck.x + ck.width + 2.5, y: ck.y + ck.height / 2 }
}
/** The task's own blocks on the grid (a held task has none — only its row inside the slot). */
const ownBlocks = (page, title) => page.locator('.fc-timegrid-event .kf-ev-head > .fc-event-title', { hasText: title }).count()
const taskWrites = (state, taskN, from) => posts(state, 'tasks', from).filter((x) => x.id === id(taskN))
const railSec = async (page, name) => async () => {
  const b = await page.locator(`.cal-rail [data-section="${name}"]`).first().boundingBox()
  return { x: b.x + b.width / 2, y: b.y + 12 }
}
const lanePt = async (page, hhmm, day = '2026-10-12') => {
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${day}"]`).boundingBox()
  return { x: col.x + col.width / 2, y: lane.y + 5 }
}
const both = { tasks: [...inCode.tasks, task(TUEHELD, 'Tuesday slot task', { duration_min: 30, due_at: iso('09:00', 13), slot_id: eid(SHAHEEN), slot_date: '2026-10-13', scheduled_start: iso('13:00', 13), scheduled_end: iso('15:00', 13) })] }

// F1: drag a held row onto the rail (Inbox) → out of the slot, back in the rail's Today; Undo → back in.
if (want('f1')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  let w0 = state.writes.length
  await mouseDrag(page, await rowPt(page), await railSec(page, 'inbox'))
  await settle(state)
  check('f1 row → rail: out of the slot, unscheduled', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)), JSON.stringify(lastOf(state, 'tasks', id(HELD), w0)?.slot_id))
  check('f1 …the row left the slot, the card is in the rail, no block of its own', (await slotRow(page, CODE, HELD).count()) === 0 && (await card(page, HELD).count()) === 1 && (await ownBlocks(page, 'Write the slot spec')) === 0)
  check('f1 toast "Out of the slot · Write the slot spec"', await toastSoon(page, 'Out of the slot · Write the slot spec'))
  await shot(page, 'f1-dragged-to-rail')
  w0 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  check('f1 Undo: back in the slot', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1 && (await card(page, HELD).count()) === 0)
  check('f1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F2: onto the rail's Today → out of the slot and due today; onto Overdue → the soft-no (nothing).
if (want('f2')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  let w0 = state.writes.length
  await mouseDrag(page, await rowPt(page), await railSec(page, 'overdue'))
  await settle(state)
  check('f2 row → Overdue: nothing changes (the soft-no)', taskWrites(state, HELD, w0).length === 0 && (await slotRow(page, CODE, HELD).count()) === 1)
  w0 = state.writes.length
  await mouseDrag(page, await rowPt(page), await railSec(page, 'today'))
  await settle(state)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('f2 row → Today: out of the slot, due today 09:00', NOSLOT(t) && t?.due_at === iso('09:00'), JSON.stringify(t && [t.slot_id, t.due_at]))
  check('f2 toast "Out of the slot · Write the slot spec · Today"', await toastSoon(page, 'Out of the slot · Write the slot spec · Today'))
  check('f2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F3: onto an empty time (Tue 11:00) → its own block there, once; Tasks reads its block's time, not
// the slot; Undo → back in the slot, the block gone.
if (want('f3')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  let w0 = state.writes.length
  await mouseDrag(page, await rowPt(page), await lanePt(page, '11:00', '2026-10-13'))
  await settle(state)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  const blocks = posts(state, 'calendar_events', w0).filter((e) => e.task_id === id(HELD))
  check('f3 row → empty time: out of the slot, at Tue 11:00', t?.slot_id === null && t?.slot_date === null && t?.scheduled_start === iso('11:00', 13), JSON.stringify(t && [t.slot_id, t.scheduled_start]))
  check('f3 …one block of its own there, 45 minutes', blocks.length === 1 && blocks[0].starts_at === iso('11:00', 13) && blocks[0].ends_at === iso('11:45', 13), JSON.stringify(blocks.map((b) => [b.starts_at, b.ends_at])))
  await sleep(300)
  check('f3 …drawn once: its block, no row in the slot', (await ownBlocks(page, 'Write the slot spec')) === 1 && (await slotRow(page, CODE, HELD).count()) === 0)
  check('f3 toast "Scheduled · Write the slot spec"', await toastSoon(page, 'Scheduled · Write the slot spec'))
  await shot(page, 'f3-own-block')
  w0 = state.writes.length
  await undo(page, 'Scheduled · Write the slot spec')
  await settle(state)
  await sleep(300)
  check('f3 Undo: back in the slot, its block trashed', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && !!lastOf(state, 'calendar_events', blocks[0]?.id, w0)?.deleted_at && (await slotRow(page, CODE, HELD).count()) === 1 && (await ownBlocks(page, 'Write the slot spec')) === 0)
  check('f3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  // The same move, then the Tasks list: its block's time, no slot.
  const b = await open('/calendar', { tables: inCode })
  await slotPoint(b.page, '10:30')
  await mouseDrag(b.page, await rowPt(b.page), await lanePt(b.page, '11:00', '2026-10-13'))
  await settle(b.state)
  // slot-outline: the drop always lands (checked above), but the reload restores the query cache the
  // persister last saved (throttled ~1s) and reads it as fresh: give it time to save the drop first.
  await sleep(1500)
  await b.page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const row = await b.page.locator(`#task-${id(HELD)}`).innerText().catch(() => '')
  check('f3 Tasks then reads "Tue 11:00", no "in Code block"', /Tue 11:00/.test(row) && !/in Code block/.test(row), row.replace(/\n/g, ' '))
  await b.ctx.close()
}

// F4: onto another slot (Monday's Shaheen🛞) → in that one; Undo → back in Code block💻. F5: dropped
// back on its own slot → nothing changes.
if (want('f4')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '11:30')
  let w0 = state.writes.length
  await mouseDrag(page, await rowPt(page), await lanePt(page, '13:30'))
  await settle(state)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('f4 row → Shaheen🛞: in that slot (series row, Monday, its times)', t?.slot_id === eid(SHAHEEN) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('13:00'), JSON.stringify(t && [t.slot_id, t.slot_date, t.scheduled_start]))
  await sleep(300)
  check('f4 …drawn in Shaheen🛞 only, no block of its own', (await slotRow(page, SHAHEEN, HELD).count()) === 1 && (await slotRow(page, CODE, HELD).count()) === 0 && (await ownBlocks(page, 'Write the slot spec')) === 0)
  check('f4 toast "In Shaheen🛞 · Write the slot spec"', await toastSoon(page, 'In Shaheen🛞 · Write the slot spec'))
  await shot(page, 'f4-other-slot')
  w0 = state.writes.length
  await undo(page, 'In Shaheen')
  await settle(state)
  check('f4 Undo: back in Code block💻', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1)
  await sleep(500)
  w0 = state.writes.length
  const from = await rowPt(page)
  await mouseDrag(page, from, { x: from.x, y: from.y + 40 })
  await settle(state)
  check('f5 dropped back on its own slot: nothing written, still in it', taskWrites(state, HELD, w0).length === 0 && (await slotRow(page, CODE, HELD).count()) === 1)
  check('f4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F6: hover a held row → its × (Out of the slot) shows; a click takes it out; Undo puts it back.
// F7: a click on the row opens the task (not the slot's menu); a right-click its task menu.
if (want('f6')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  const x = slotRow(page, CODE, HELD).locator('.kf-ev-slot-out')
  check('f6 the × is hidden until the row is hovered', !(await x.isVisible()))
  await slotRow(page, CODE, HELD).hover()
  await sleep(200)
  check('f6 …and shows on hover, named "Out of the slot"', (await x.isVisible()) && (await x.getAttribute('title')) === 'Out of the slot')
  await shot(page, 'f6-hover-x')
  let w0 = state.writes.length
  await x.click()
  await settle(state)
  check('f6 × → out of the slot, back in the rail', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && (await card(page, HELD).count()) === 1 && (await toastSoon(page, 'Out of the slot · Write the slot spec')))
  w0 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  check('f6 Undo: back in the slot', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1)
  await sleep(300)
  await slotRow(page, CODE, HELD).locator('.kf-ev-slot-title').click()
  await sleep(800)
  check('f7 a click on the row opens the task (?task=), not the slot\'s menu', page.url().includes(`task=${id(HELD)}`) && (await page.locator('[role="menuitem"]', { hasText: 'Link a task' }).count()) === 0, page.url())
  await page.keyboard.press('Escape')
  await sleep(500)
  // Kai 2026-10-17: a click left FullCalendar's lifted copy stuck over the slot (the press forced it visible).
  check('f7 the click leaves no lifted copy behind', (await page.locator('body > .fc-event-dragging').count()) === 0, String(await page.locator('body > .fc-event-dragging').count()))
  await slotRow(page, CODE, HELD).locator('.kf-ev-slot-title').click({ button: 'right' })
  await sleep(500)
  check('f7 a right-click on the row: its task menu, with "Out of the slot"', (await page.locator('[role="menuitem"]', { hasText: 'Out of the slot' }).count()) === 1 && (await page.locator('[role="menuitem"]', { hasText: /^Edit$/ }).count()) === 0)
  await shot(page, 'f7-row-menu')
  check('f6 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/** The slot's own popover (a click on its title), then one of its rows. */
async function slotMenu(page, n, day) {
  await fcBlock(page, n, day).locator('.kf-ev-head > .fc-event-title').first().click()
  await sleep(600)
}

// F8: the slot's Link a task… → that task goes IN the slot; the slot stays a slot with what it held.
if (want('f8')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  await slotMenu(page, CODE)
  await page.locator('[role="menuitem"]', { hasText: 'Link a task' }).first().hover()
  await sleep(600)
  const w0 = state.writes.length
  await page.locator('[role="option"], [role="menuitem"]', { hasText: 'Review Kai' }).first().click()
  await settle(state)
  const t = lastOf(state, 'tasks', id(REVIEW), w0)
  check('f8 Link a task… on the slot: Review Kai IN it', t?.slot_id === eid(CODE) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('10:00'), JSON.stringify(t && [t.slot_id, t.scheduled_start]))
  check('f8 …the slot stays a Time block, no task block made', posts(state, 'calendar_events', w0).every((e) => e.type !== 'task'))
  await page.keyboard.press('Escape')
  await sleep(400)
  check('f8 …it draws both tasks', (await slotRow(page, CODE, REVIEW).count()) === 1 && (await slotRow(page, CODE, HELD).count()) === 1, await fcBlock(page, CODE).innerText().catch(() => ''))
  await shot(page, 'f8-linked-into-slot')
  check('f8 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F9: the slot made an Event (More → Event) → its task back in the rail, with Undo.
if (want('f9')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode })
  await slotPoint(page, '10:30')
  await slotMenu(page, CODE)
  await page.locator('[role="menuitem"]', { hasText: 'More' }).first().hover()
  await sleep(600)
  let w0 = state.writes.length
  await page.locator('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]', { hasText: /^Event$/ }).first().click()
  await settle(state)
  check('f9 More → Event: the task out of the slot, in the rail', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && lastOf(state, 'calendar_events', eid(CODE), w0)?.type === 'event' && (await card(page, HELD).count()) === 1)
  check('f9 toast "Out of the slot · Write the slot spec"', await toastSoon(page, 'Out of the slot · Write the slot spec'))
  await page.keyboard.press('Escape')
  w0 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  await sleep(300)
  check('f9 Undo: a Time block again, holding it', lastOf(state, 'calendar_events', eid(CODE), w0)?.type === 'time_block' && lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await slotRow(page, CODE, HELD).count()) === 1)
  check('f9 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F10: Monday's Shaheen🛞 → Repeat → Does not repeat: Tuesday's is gone, so its task comes out (Undo).
if (want('f10')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: both })
  await slotPoint(page, '14:00')
  await slotMenu(page, SHAHEEN)
  await page.locator('[role="menuitem"]', { hasText: 'Daily' }).first().hover()
  await sleep(600)
  let w0 = state.writes.length
  await page.locator('[role="menuitem"], [role="menuitemradio"]', { hasText: /Does not repeat|Never/ }).first().click()
  await settle(state)
  check('f10 Repeat → none: Tuesday\'s task out of the slot it lost', NOSLOT(lastOf(state, 'tasks', id(TUEHELD), w0)) && !lastOf(state, 'calendar_events', eid(SHAHEEN), w0)?.recurrence_rule, JSON.stringify(lastOf(state, 'tasks', id(TUEHELD), w0)?.slot_id))
  await page.keyboard.press('Escape')
  w0 = state.writes.length
  await page.locator('.kf-toast', { hasText: /Does not repeat|Never/ }).getByRole('button', { name: 'Undo' }).click()
  await settle(state)
  await sleep(300)
  check('f10 Undo: repeating again, Tuesday\'s task back in its day', lastOf(state, 'tasks', id(TUEHELD), w0)?.slot_id === eid(SHAHEEN) && (await slotRow(page, SHAHEEN, TUEHELD, '2026-10-13').count()) === 1)
  check('f10 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F11: resize the slot (its bottom edge to 12:30) → its task's end follows. F12: Tuesday's Shaheen🛞
// dragged to 15:30 on its own → its task goes with the detached copy; Monday's stays.
if (want('f11')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: both })
  await slotPoint(page, '11:30')
  const b = await fcBlock(page, CODE).boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6)
  await sleep(200)
  let w0 = state.writes.length
  await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + b.height - 3 }, { x: b.x + b.width / 2, y: (await laneY(page, '12:30')) + 2 })
  await settle(state)
  const slot = lastOf(state, 'calendar_events', eid(CODE), w0)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('f11 slot resized later: its task\'s end follows', !!slot && Date.parse(slot.ends_at) > Date.parse(iso('12:00')) && t?.scheduled_end === slot.ends_at && t?.scheduled_start === iso('10:00'), JSON.stringify([slot?.ends_at, t?.scheduled_end]))
  await slotPoint(page, '14:00')
  const g = center(await fcBlock(page, SHAHEEN, '2026-10-13').locator('.kf-ev-head > .fc-event-title').first().boundingBox())
  w0 = state.writes.length
  await mouseDrag(page, g, { x: g.x, y: g.y + (await laneY(page, '15:30')) - (await laneY(page, '13:00')) })
  // cal-clicks: a repeat asks which occurrences — "This event" moves Tuesday's on its own
  await page.locator('[role="dialog"].kf-scope-ask').getByRole('button', { name: 'This event', exact: true }).click({ timeout: 5000 })
  await settle(state)
  const copy = posts(state, 'calendar_events', w0).find((e) => e.series_id === eid(SHAHEEN))
  const u = lastOf(state, 'tasks', id(TUEHELD), w0)
  check('f12 Tuesday\'s occurrence dragged on its own: its task goes with the copy', !!copy && u?.slot_id === copy.id && u?.scheduled_start === copy.starts_at && u?.slot_date === '2026-10-13', JSON.stringify([copy?.starts_at, u?.slot_id === copy?.id, u?.scheduled_start]))
  check('f12 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F13: replan a held task (Tasks → ⋯ → Tomorrow) → out of the slot, due tomorrow; the row no longer
// says "in Code block"; the calendar no longer draws it.
if (want('f13')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { tables: inCode })
  const row = page.locator(`#task-${id(HELD)}`)
  check('f13 Tasks reads "in Code block💻 · 10:00" first', /in Code block💻 · 10:00/.test(await row.innerText().catch(() => '')))
  await row.click({ button: 'right' })
  await sleep(400)
  const w0 = state.writes.length
  await page.locator('[role="menuitem"]', { hasText: 'Tomorrow' }).first().click()
  await settle(state)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('f13 Tomorrow: out of the slot, due tomorrow 09:00', NOSLOT(t) && t?.due_at === iso('09:00', 13), JSON.stringify(t && [t.slot_id, t.due_at]))
  await sleep(400)
  check('f13 …the row no longer says "in Code block"', !/in Code block/.test(await row.innerText().catch(() => '')))
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
  await sleep(1200)
  await slotPoint(page, '10:30')
  check('f13 …nor does the calendar draw it in the slot', (await slotRow(page, CODE, HELD).count()) === 0 && (await ownBlocks(page, 'Write the slot spec')) === 0)
  check('f13 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F14: Today (desktop): a held Top 3 pick and a held "Also open" row both read "in Code block💻 · 10:00".
if (want('f14')) {
  const pick = { tasks: [...TASKS, task(HELD, 'Write the slot spec', { duration_min: 45, due_at: iso('09:00'), top3: true, top3_rank: 1, slot_id: eid(CODE), slot_date: '2026-10-12', scheduled_start: iso('10:00'), scheduled_end: iso('12:00') }), task(5, 'Also held', { due_at: iso('09:00'), slot_id: eid(CODE), slot_date: '2026-10-12', scheduled_start: iso('10:00'), scheduled_end: iso('12:00') })] }
  const { ctx, page, errors } = await open('/today', { tables: pick })
  await sleep(800)
  const top = await page.locator(`#task-${id(HELD)}`).first().innerText().catch(() => '')
  const also = await page.locator(`#task-${id(5)}`).first().innerText().catch(() => '')
  check('f14 Today: the Top 3 pick reads "in Code block💻 · 10:00"', /in Code block💻 · 10:00/.test(top), top.replace(/\n/g, ' '))
  check('f14 Today: an Also open row reads it too (not just "Due today")', /in Code block💻 · 10:00/.test(also), also.replace(/\n/g, ' '))
  await shot(page, 'f14-today')
  check('f14 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  // Phone Today: the same for the pick.
  const m = await open('/today', { tables: pick, view: phone })
  await sleep(800)
  const mtop = await m.page.locator(`#task-${id(HELD)}`).first().innerText().catch(() => '')
  check('f14 phone Today: the Top 3 pick reads "in Code block💻 · 10:00"', /in Code block💻 · 10:00/.test(mtop), mtop.replace(/\n/g, ' '))
  await shot(m.page, 'f14-phone-today')
  await m.ctx.close()
}

// M1: phone — a tap on a held row opens its sheet: the slot right under the chips with "Out of the
// slot"; a tap takes it out (Undo); the sheet then offers free times.
if (want('m1')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: inCode, view: phone })
  await pcBlock(page, CODE).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(300)
  await pcRow(page, CODE, HELD).locator('.pc-name').click()
  await sleep(900)
  const slotCard = page.locator('.ts-block.is-slot')
  check('m1 phone: the sheet shows "In Code block💻 · Mon 12 · 10:00–12:00" first', /In Code block/.test(await slotCard.innerText().catch(() => '')) && /10:00–12:00/.test(await slotCard.innerText().catch(() => '')), await slotCard.innerText().catch(() => ''))
  const btn = page.getByRole('button', { name: 'Out of the slot' })
  check('m1 phone: …with "Out of the slot" in view', (await btn.count()) === 1 && (await btn.isVisible()) && (await btn.boundingBox()).y + 40 < 844)
  await shot(page, 'm1-phone-sheet')
  let w0 = state.writes.length
  await btn.click()
  await settle(state)
  check('m1 phone: Out of the slot → unscheduled (toast with Undo)', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && (await toastSoon(page, 'Out of the slot · Write the slot spec')))
  await sleep(400)
  check('m1 phone: the card gives way to free times', (await slotCard.count()) === 0 && (await page.locator('.kf-pk-slot').count()) > 0)
  w0 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  check('m1 phone: Undo → back in the slot, the card back', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === eid(CODE) && (await page.locator('.ts-block.is-slot').count()) === 1)
  check('m1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── slot-outline (Kai 2026-10-16: "can't we drag and drop it…"): on the phone a HOLD on a task row
// inside a slot lifts THAT task, not the slot. Real CDP touch (calendar-phone's recipe). Drop on empty
// time → its own block there; on another slot → into it; on the strip → out of the slot; back on its own
// slot → nothing. Each with Undo. A hold on the slot's title still lifts the slot. ──
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
/** A finger held on `from` (550ms > the 400ms long press), moved to `to`, then let go (unless `keep`). */
async function holdDrag(cdp, from, to, { keep = false, mid, during } = {}) {
  await touch(cdp, 'touchStart', [from])
  await sleep(200)
  if (during) await during()
  await sleep(350)
  for (let i = 1; i <= 14; i++) {
    await touch(cdp, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / 14, y: from.y + ((to.y - from.y) * i) / 14 }])
    await sleep(30)
  }
  await sleep(250)
  if (mid) await mid()
  if (keep) return
  await touch(cdp, 'touchEnd', [])
  await sleep(600)
}
const pcY = (page, hhmm) =>
  page.locator('.pc-canvas').evaluate((c, t) => {
    const [h, m] = t.split(':').map(Number)
    return c.getBoundingClientRect().top + ((h * 60 + m) * 64) / 60
  }, hhmm)
async function phoneOpen() {
  const o = await open('/calendar', { tables: inCode, view: phone })
  await pcBlock(o.page, CODE).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(400)
  o.cdp = await o.ctx.newCDPSession(o.page)
  o.row = center(await pcRow(o.page, CODE, HELD).locator('.pc-name').boundingBox())
  return o
}
const colX = async (page) => {
  const b = await pcBlock(page, CODE).boundingBox()
  return b.x + b.width / 2
}

// D1: hold the row → the task lifts (the slot doesn't); the bloom shows during the hold; over empty
// time 12:30 a dashed ghost + "12:30–13:15"; let go → its own block there, out of the slot; Undo → back.
if (want('d1')) {
  const { ctx, page, errors, state, cdp, row } = await phoneOpen()
  const x = await colX(page)
  const to = { x, y: (await pcY(page, '12:30')) + 6 }
  const w0 = state.writes.length
  await holdDrag(cdp, row, to, {
    during: async () => check('d1 phone: the hold blooms under the finger on the row', (await pcRow(page, CODE, HELD).locator('.kf-press-bloom').count()) === 1),
    mid: async () => {
      check('d1 phone: the task is lifted, not the slot', (await page.locator(`.pc-held-task[data-held-task="${id(HELD)}"]`).count()) === 1 && (await page.locator('.pc-block.is-lifted').count()) === 0)
      check('d1 phone: its place in the slot stays, dashed', (await pcRow(page, CODE, HELD).getAttribute('class'))?.includes('is-gone'))
      const ghost = await page.locator('.pc-ghost.is-held').count()
      const bubble = await page.locator('.pc-bubble').innerText().catch(() => '')
      check('d1 phone: over empty time: a ghost and "12:30–13:15" (its 45 minutes)', ghost === 1 && bubble === '12:30–13:15', bubble)
      await shot(page, 'd1-phone-lifted')
    },
  })
  await settle(state)
  const blk = posts(state, 'calendar_events', w0).find((e) => e.task_id === id(HELD) && !e.deleted_at)
  check('d1 phone: let go → its own block at 12:30–13:15', blk?.starts_at === iso('12:30') && blk?.ends_at === iso('13:15'), JSON.stringify(blk && [blk.starts_at, blk.ends_at]))
  check('d1 phone: …out of the slot (no slot_id)', lastOf(state, 'tasks', id(HELD), w0)?.slot_id === null && (await pcRow(page, CODE, HELD).count()) === 0)
  check('d1 phone: the slot did not move', !lastOf(state, 'calendar_events', eid(CODE), w0))
  check('d1 phone: toast "Scheduled · Write the slot spec"', await toastSoon(page, 'Scheduled · Write the slot spec'))
  await shot(page, 'd1-phone-dropped')
  const w1 = state.writes.length
  await undo(page, 'Scheduled')
  await settle(state)
  check('d1 phone: Undo → back in the slot', lastOf(state, 'tasks', id(HELD), w1)?.slot_id === eid(CODE) && (await pcRow(page, CODE, HELD).count()) === 1)
  check('d1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D2: dragged onto Shaheen🛞 (13:00–15:00 today) → it rings while over it; let go → into it; Undo.
if (want('d2')) {
  const { ctx, page, errors, state, cdp, row } = await phoneOpen()
  const to = { x: await colX(page), y: (await pcY(page, '13:45')) }
  const w0 = state.writes.length
  await holdDrag(cdp, row, to, {
    mid: async () => {
      check('d2 phone: over another slot it rings (no ghost)', (await pcBlock(page, SHAHEEN).getAttribute('class'))?.includes('is-drop') && (await page.locator('.pc-ghost.is-held').count()) === 0)
      await shot(page, 'd2-phone-over-slot')
    },
  })
  await settle(state)
  const t = lastOf(state, 'tasks', id(HELD), w0)
  check('d2 phone: let go → in Shaheen🛞 today (13:00–15:00)', t?.slot_id === eid(SHAHEEN) && t?.slot_date === '2026-10-12' && t?.scheduled_start === iso('13:00'), JSON.stringify(t && [t.slot_id, t.slot_date, t.scheduled_start]))
  check('d2 phone: no block of its own', posts(state, 'calendar_events', w0).every((e) => e.task_id !== id(HELD)))
  check('d2 phone: toast "In Shaheen🛞 · Write the slot spec"', await toastSoon(page, 'In Shaheen🛞 · Write the slot spec'))
  const w1 = state.writes.length
  await undo(page, 'In Shaheen')
  await settle(state)
  check('d2 phone: Undo → back in Code block💻', lastOf(state, 'tasks', id(HELD), w1)?.slot_id === eid(CODE))
  check('d2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D3: dragged up onto the strip (off the grid) → out of the slot, back in Today's strip; Undo.
if (want('d3')) {
  const { ctx, page, errors, state, cdp, row } = await phoneOpen()
  const strip = await page.locator('.pc-uns').boundingBox()
  const w0 = state.writes.length
  await holdDrag(cdp, row, { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 }, {
    mid: async () => {
      const lifted = await page.locator('.pc-held-task').boundingBox()
      check('d3 phone: the lifted task follows the finger over the strip (no ghost)', !!lifted && lifted.y < strip.y + strip.height && (await page.locator('.pc-ghost.is-held').count()) === 0, JSON.stringify(lifted))
      await shot(page, 'd3-phone-over-strip')
    },
  })
  await settle(state)
  check('d3 phone: let go → out of the slot, unscheduled', NOSLOT(lastOf(state, 'tasks', id(HELD), w0)) && posts(state, 'calendar_events', w0).every((e) => e.task_id !== id(HELD)))
  check('d3 phone: toast "Out of the slot · Write the slot spec"', await toastSoon(page, 'Out of the slot · Write the slot spec'))
  await sleep(300)
  check('d3 phone: it is a chip in the strip now', (await page.locator('.pc-uns .pc-chip', { hasText: 'Write the slot spec' }).count()) === 1)
  const w1 = state.writes.length
  await undo(page, 'Out of the slot')
  await settle(state)
  check('d3 phone: Undo → back in the slot', lastOf(state, 'tasks', id(HELD), w1)?.slot_id === eid(CODE) && (await pcRow(page, CODE, HELD).count()) === 1)
  check('d3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D4: held and let go inside its own slot → nothing written, nothing opened. D5: a hold on the slot's
// title still lifts the slot (no task lifted). Night Garden shot of a lifted task.
if (want('d4')) {
  const { ctx, page, errors, state, cdp, row } = await phoneOpen()
  const w0 = state.writes.length
  await holdDrag(cdp, row, { x: row.x + 20, y: row.y + 8 })
  await settle(state)
  check('d4 phone: let go on its own slot → no write, no toast, no sheet', state.writes.length === w0 && (await page.locator('.kf-toast').count()) === 0 && !/[?&]task=/.test(page.url()) && (await page.locator('.pc-held-task').count()) === 0)
  check('d4 phone: …and the row is back as it was', !(await pcRow(page, CODE, HELD).getAttribute('class'))?.includes('is-gone'))
  const title = center(await pcBlock(page, CODE).locator('.pc-name').first().boundingBox())
  await touch(cdp, 'touchStart', [title])
  await sleep(550)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
  check('d5 phone: a hold on the slot\'s title lifts the slot, not a task', (await pcBlock(page, CODE).getAttribute('class'))?.includes('is-lifted') && (await page.locator('.pc-held-task').count()) === 0)
  // cal-clicks: the hold also opens menu B's sheet over the lifted slot — Back closes it, then puts the slot down
  for (let i = 0; i < 3 && (await page.locator('.pc-bs-colors').count()) > 0; i++) {
    await page.keyboard.press('Escape')
    await sleep(600)
  }
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.evaluate(() => (document.documentElement.dataset.theme = 'night'))
  await sleep(300)
  const r2 = center(await pcRow(page, CODE, HELD).locator('.pc-name').boundingBox())
  await holdDrag(cdp, r2, { x: r2.x, y: (await pcY(page, '12:30')) + 6 }, { keep: true })
  await shot(page, 'd6-phone-lifted-night')
  check('d6 phone (night): lifted with its ghost', (await page.locator('.pc-held-task').count()) === 1 && (await page.locator('.pc-ghost.is-held').count()) === 1)
  await touch(cdp, 'touchCancel', [])
  await sleep(500)
  check('d6 phone: a cancelled touch puts it back, nothing written', (await page.locator('.pc-held-task').count()) === 0 && !posts(state, 'tasks', w0).length)
  check('d4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── slot-outline, Kai's pick A ("Slot tasks: A"): every held task is its own soft card inside the slot —
// a 1px edge, 8px corners, the slot's wash, a gap between — on the desktop and the phone, day and Night
// Garden; the hover × stays; dragged out, the card's place stays dashed and the card itself follows the
// pointer (over the grid too). ──
/** The card look of an element: its edge, corners and fill. */
const cardOf = (loc) =>
  loc.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bw: cs.borderTopWidth, bs: cs.borderTopStyle, r: cs.borderTopLeftRadius, bg: cs.backgroundColor, bc: cs.borderTopColor }
  })
const isCard = (c) => c.bw === '1px' && c.bs === 'solid' && c.r === '8px' && c.bg !== 'rgba(0, 0, 0, 0)' && c.bc !== 'rgba(0, 0, 0, 0)'
const twoDone = { tasks: [...inCode.tasks, task(5, 'Fix the login bug', { status: 'done', completed_at: iso('07:00'), due_at: iso('09:00'), slot_id: eid(CODE), slot_date: '2026-10-12', scheduled_start: iso('10:00'), scheduled_end: iso('12:00') })] }

if (want('o1')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: twoDone })
  await slotPoint(page, '10:30')
  for (const theme of ['day', 'night']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await sleep(250)
    const a = await cardOf(slotRow(page, CODE, HELD))
    const d = await cardOf(slotRow(page, CODE, 5))
    check(`o1 desktop ${theme}: each held task is a card (1px edge, 8px corners, the slot's wash)`, isCard(a) && isCard(d), JSON.stringify(a))
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'day'))
  await sleep(250)
  const [r1, r2] = [await slotRow(page, CODE, HELD).boundingBox(), await slotRow(page, CODE, 5).boundingBox()]
  const gap = Math.round(Math.max(r2.y - (r1.y + r1.height), r1.y - (r2.y + r2.height)))
  check('o1 desktop: a small gap between the cards (4px at 100%, zoomed)', gap >= 3 && gap <= 7, gap)
  check('o1 desktop: the done card keeps its strike', (await slotRow(page, CODE, 5).getAttribute('class'))?.includes('kf-done') && /line-through/.test(await slotRow(page, CODE, 5).locator('.kf-ev-slot-title').evaluate((el) => getComputedStyle(el).textDecorationLine)))
  const rest = (await cardOf(slotRow(page, CODE, HELD))).bc
  await slotRow(page, CODE, HELD).hover()
  await sleep(250)
  check('o1 desktop hover: the × shows and the edge deepens', (await slotRow(page, CODE, HELD).locator('.kf-ev-slot-out').isVisible()) && (await cardOf(slotRow(page, CODE, HELD))).bc !== rest)
  // Drag it out without letting go: its place dashed, the lifted card under the pointer over the grid.
  const from = await rowPt(page)
  const to = await lanePt(page, '11:00', '2026-10-13')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 15, from.y + ((to.y - from.y) * i) / 15)
    await sleep(30)
  }
  await sleep(400)
  const gone = await cardOf(slotRow(page, CODE, HELD))
  check('o1 desktop drag: the card\'s place stays, dashed', (await slotRow(page, CODE, HELD).getAttribute('data-lifted')) === '' && gone.bs === 'dashed', JSON.stringify(gone))
  const mirror = page.locator('body > .kf-ev-slot-row.fc-event-dragging')
  const mb = await mirror.boundingBox().catch(() => null)
  const mc = mb && (await cardOf(mirror))
  check('o1 desktop drag: the card follows the pointer over the grid, its own outline on', !!mb && Math.abs(mb.x - to.x) < 60 && Math.abs(mb.y + mb.height / 2 - to.y) < 40 && mc.bw === '1px' && mc.r === '8px', JSON.stringify([mb, to]))
  await shot(page, 'o1-desktop-drag')
  const w0 = state.writes.length
  await page.mouse.move(from.x, from.y, { steps: 10 })
  await sleep(300)
  await page.mouse.up()
  await settle(state)
  check('o1 desktop: let go back on its own slot → nothing written, the card back as it was', state.writes.length === w0 && (await slotRow(page, CODE, HELD).getAttribute('data-lifted')) === null && (await page.locator('.kf-ev-slot-row.fc-event-dragging').count()) === 0)
  check('o1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

if (want('o2')) {
  const { ctx, page, errors, state } = await open('/calendar', { tables: twoDone, view: phone })
  await pcBlock(page, CODE).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(300)
  for (const theme of ['day', 'night']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await sleep(250)
    const a = await cardOf(pcRow(page, CODE, HELD))
    const d = await cardOf(pcRow(page, CODE, 5))
    check(`o2 phone ${theme}: each held task is a card (1px edge, 8px corners, the slot's fill)`, isCard(a) && isCard(d), JSON.stringify(a))
    await shot(page, `o2-phone-cards-${theme}`)
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'day'))
  const w0 = state.writes.length
  const cdp = await ctx.newCDPSession(page)
  const row = center(await pcRow(page, CODE, HELD).locator('.pc-name').boundingBox())
  await holdDrag(cdp, row, { x: row.x, y: (await pcY(page, '12:30')) + 6 }, { keep: true })
  const gone = await cardOf(pcRow(page, CODE, HELD))
  const lifted = await cardOf(page.locator('.pc-held-task'))
  check('o2 phone drag: its place dashed, the lifted card keeps its own outline', gone.bs === 'dashed' && lifted.bw === '1px' && lifted.r === '8px', JSON.stringify([gone, lifted]))
  await shot(page, 'o2-phone-drag')
  await touch(cdp, 'touchCancel', [])
  await sleep(500)
  check('o2 phone: a cancelled touch puts it back, nothing written', (await page.locator('.pc-held-task').count()) === 0 && state.writes.length === w0)
  check('o2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
