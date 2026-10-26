// cal-clicks (Kai 2026-10-26): clicks the mainstream way (Akiflow / Google Calendar) and the recurring scope question.
// On the REAL app against a MOCKED backend (the cal-blocks recipe: dev server in `--mode mock`, a made-up session in
// localStorage, Playwright answers every REST call; writes are recorded AND applied to the mock rows, so every check
// below reads the series as stored).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]          ONLY=c,p,s,t,x to run some sections
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 12:09; the grid shows 3 days, Wed–Fri.
//   C  desktop: left-click = details, right-click = menu B, for an event, a task block, a Time block, a Google event,
//      a repeat; the hover ⋯; Enter / Shift+F10; the old quick menu gone
//   P  phone: a tap = details, a long-press or the details' ⋯ = menu B's sheet, per kind; the question as a sheet
//   S  a repeating event: rename · colour · project · move · resize · length · delete · duplicate × This / Following /
//      All, each checked in the stored rows; Undo per answer
//   T  a repeating task: complete · move · title · project · delete · duplicate × This one / Following / All; colour
//      never asks (it lives on the block)
//   X  Cancel / Esc: a drag goes back, a resize goes back, nothing is written
//   V  the menus stay on screen at 125% (800px, and a squat 480px window): Delete always reachable
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5320'
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

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the days ──
const DAY = 21
const cairo = (hhmm, day = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '12:09'
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PID = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, day, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null,
  project_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const sched = (from, to, day = DAY) => ({ scheduled_start: iso(from, day), scheduled_end: iso(to, day), due_at: iso(from, day) })
const TYRE = 2, WATER = 5, WATER_PREV = 11
const DENTIST = 3, TYRE_B = 2, WATER_B = 6, ADMIN = 30, GOOGLE = 50, STANDUP = 40
const WEEKLY = 'FREQ=WEEKLY'
const TASKS = [
  task(TYRE, 'Call the tyre supplier', { ...sched('09:30', '10:30'), duration_min: 60 }),
  task(WATER, 'Water the plants', { ...sched('14:00', '15:00'), duration_min: 60, recurrence_rule: WEEKLY }),
  // last week's round, done — "All" reaches it, "This" / "Following" never do
  task(WATER_PREV, 'Water the plants', { due_at: iso('14:00', 14), status: 'done', completed_at: iso('14:20', 14), recurrence_rule: WEEKLY }),
]
const EVENTS = [
  ev(TYRE_B, 'Call the tyre supplier', '09:30', '10:30', DAY, TYRE),
  ev(DENTIST, 'Dentist', '10:30', '11:15', DAY),
  ev(WATER_B, 'Water the plants', '14:00', '15:00', DAY, WATER),
  ev(ADMIN, 'Admin', '13:30', '15:00', 23, null, 'time_block'),
  ev(GOOGLE, 'Dhuhr', '16:00', '16:30', 22, null, 'event', { source: 'gcal', gcal_id: 'g1', external_ref: { source: 'gcal', id: 'p/g1', calendar: 'Prayer times', calendar_id: 'p' } }),
  // every day at 08:00 from Mon 19 Oct — the occurrence we act on is Thu 22's
  ev(STANDUP, 'Standup', '08:00', '08:30', 19, null, 'event', { recurrence_rule: 'FREQ=DAILY' }),
]
const PROJECT = { id: PID, user_id: UID, domain_id: null, name: 'Garden', type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [PROJECT], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(([sess, uid, now, scale]) => {
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '1')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, cairo(NOW).getTime(), o.scale ? String(o.scale) : null])
  const state = { rows: tables(), writes: [] }
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
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, errors, state, cdp }
}

const shot = (page, name, o = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...o })
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undoToast = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click()
const occId = (day) => `${eid(STANDUP)}::${iso('08:00', day)}`
const fcAt = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]:not(.fc-event-mirror)`).first()
const fcBlock = (page, n) => fcAt(page, eid(n))
const pcBlock = (page, kfId) => page.locator(`.pc-block[data-id="${kfId}"]`).first()
const details = (page) => page.locator('[role="menu"][aria-label="Block details"]')
const menuB = (page) => page.locator('[role="menu"][aria-label="Block menu"]')
const rowsOf = async (loc) => (await loc.first().locator(':scope > * [role="menuitem"], [role="menuitem"]').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim())
const ask = (page) => page.locator('[role="dialog"].kf-scope-ask')
const answer = async (page, label) => {
  await ask(page).waitFor({ timeout: 5000 }).catch(async (e) => {
    await shot(page, `no-ask-${Date.now()}`)
    throw e
  })
  await ask(page).getByRole('button', { name: label, exact: true }).click()
}
const ev$ = (state, n) => state.rows.calendar_events.find((e) => e.id === (typeof n === 'string' ? n : eid(n)))
const task$ = (state, n) => state.rows.tasks.find((t) => t.id === id(n))
const fresh = (state, table) => state.rows[table].filter((r) => !(table === 'tasks' ? TASKS : EVENTS).some((x) => x.id === r.id))
const UNTIL_22 = 'UNTIL=20261022T045959Z' // a second before Thu 22, 08:00 Cairo
const EV_WORDS = { this: 'This event', following: 'This and following events', all: 'All events' }
const TASK_WORDS = { this: 'This one', following: 'This and following', all: 'All' }

async function threeDays(page, top = '07:30') {
  await page.locator('button', { hasText: /^(Week|Day|\d days)$/ }).first().click()
  await sleep(300)
  await page.locator('[aria-label="View options"] .cal-vo-row button', { hasText: /^3$/ }).click()
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(600)
  await scrollGrid(page, top)
}
async function scrollGrid(page, hhmm) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop
  }, hhmm)
  await sleep(300)
}
const hourPx = (page) => page.evaluate(() => { const a = document.querySelector('td.fc-timegrid-slot-lane[data-time="10:00:00"]').getBoundingClientRect(), b = document.querySelector('td.fc-timegrid-slot-lane[data-time="11:00:00"]').getBoundingClientRect(); return b.top - a.top })
async function mouseDrag(page, from, to, steps = 20) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(500)
}
/** Drags a block's body down by `px`. */
async function dragDown(page, loc, px) {
  const b = await loc.boundingBox()
  await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + Math.min(10, b.height / 2) }, { x: b.x + b.width / 2, y: b.y + Math.min(10, b.height / 2) + px })
}
/** A drag of a repeat (or a repeating task's block) that must end in the question — retried when the press didn't
 * take (headless Chrome drops a FullCalendar drag now and then; a repeat's drag writes nothing before it asks). */
async function dragAsk(page, loc, px, resize = false) {
  for (let i = 0; i < 3; i++) {
    await (resize ? resizeDown(page, loc, px) : dragDown(page, loc, px))
    if (await ask(page).waitFor({ timeout: 1500 }).then(() => true, () => false)) return i
  }
  return -1
}
/** Drags a block's bottom edge down by `px`. */
async function resizeDown(page, loc, px) {
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(250)
  const h = await loc.locator('.fc-event-resizer-end').boundingBox()
  await mouseDrag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2, y: h.y + h.height / 2 + px })
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
async function tapAt(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(600)
}
async function holdAt(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(600)
  await touch(cdp, 'touchEnd', [])
  await sleep(800)
}
async function scrollPhone(page, min) {
  await page.evaluate((m) => {
    const el = document.querySelector('.pc-scroll')
    if (el) el.scrollTop = (m / 60) * 64 - 20
  }, min)
  await sleep(300)
}
const sheetRows = (page) => page.locator('.pc-bs-rows button').allInnerTexts().then((r) => r.map((x) => x.replace(/\s+/g, ' ').trim()))
const hasTray = (page, scope = page) => scope.locator('.kf-swatch-tray').count().then((n) => n > 0)

// ═══ C · desktop: left-click = details, right-click = menu B, per block kind ═══
if (want('c')) {
  const { ctx, page, errors, state } = await open()
  await threeDays(page, '08:30')
  // an event
  await fcBlock(page, DENTIST).click({ position: { x: 30, y: 12 } })
  await sleep(500)
  let rows = await rowsOf(details(page))
  check('c-event left-click opens the details: when · project · Repeat · Remind · Link a task… · More · Delete — no tray, no menu-B rows', (await details(page).count()) === 1 && ['Wed, Oct 21', 'Does not repeat', 'Link a task…', 'More', 'Delete'].every((w) => rows.some((r) => r.startsWith(w))) && !rows.some((r) => /^(Duplicate|Work with AI|Copy link)/.test(r)) && !(await hasTray(page, details(page))), JSON.stringify(rows))
  await shot(page, 'c-event-details')
  await page.keyboard.press('Escape')
  await sleep(300)
  await fcBlock(page, DENTIST).click({ button: 'right', position: { x: 30, y: 12 } })
  await sleep(500)
  rows = await rowsOf(menuB(page))
  const trayN = await menuB(page).locator('.kf-swatch-tray .kf-sw').count()
  check('c-event right-click opens menu B: the tray (17 + Custom) · Details · Duplicate Ctrl D · Work with AI › · Copy link · Delete', (await menuB(page).count()) === 1 && trayN === 17 && JSON.stringify(rows.map((r) => r.split(' ')[0])) === JSON.stringify(['Details', 'Duplicate', 'Work', 'Copy', 'Delete']) && /Ctrl.*D/.test(rows[1]), `${trayN} ${JSON.stringify(rows)}`)
  check('c-event the old quick menu is gone (no Edit / Edit Task rows anywhere)', !(await page.locator('[role="menuitem"]', { hasText: /^Edit( Task)?$/ }).count()))
  await shot(page, 'c-event-menu')
  await page.locator('[role="menuitem"]', { hasText: 'Details' }).click()
  await sleep(500)
  check('c-event menu B\'s Details opens the details in its place', (await details(page).count()) === 1 && (await menuB(page).count()) === 0)
  await page.keyboard.press('Escape')
  await sleep(300)
  // a task block: the task popover; menu B with the old quick menu's task rows
  await fcBlock(page, TYRE_B).click({ position: { x: 30, y: 12 } })
  await sleep(700)
  const pop = page.locator('[role="dialog"][aria-label="Task: Call the tyre supplier"]')
  check('c-task left-click opens its task: the task popover (title, notes, chips — the full details, editable)', (await pop.count()) === 1 && (await pop.locator('[aria-label="Title"]').count()) === 1 && (await pop.locator('.ts-chips').count()) === 1 && (await details(page).count()) === 0)
  await shot(page, 'c-task-popover')
  await page.keyboard.press('Escape')
  await sleep(500)
  await fcBlock(page, TYRE_B).click({ button: 'right', position: { x: 30, y: 12 } })
  await sleep(500)
  rows = await rowsOf(menuB(page))
  const tk = ['Complete', 'Open task', 'Replan…', 'Duplicate', 'Work with AI', 'Copy link', 'Unschedule', 'Delete'].map((w) => rows.findIndex((r) => r.startsWith(w)))
  check('c-task right-click: menu B with the tray, Complete · Open task · Replan… (it ran out) · Duplicate · Work with AI · Copy link · Unschedule · Delete', tk.every((v, i) => v >= 0 && (i === 0 || v > tk[i - 1])) && (await hasTray(page, menuB(page))), JSON.stringify(rows))
  await shot(page, 'c-task-menu')
  await page.keyboard.press('Escape')
  await sleep(300)
  // a repeating task's block: the task popover too
  await fcBlock(page, WATER_B).click({ position: { x: 30, y: 12 } }).catch(() => {})
  await scrollGrid(page, '12:30')
  await fcBlock(page, WATER_B).click({ position: { x: 30, y: 12 } })
  await sleep(700)
  check('c-repeat-task left-click opens its task popover', (await page.locator('[role="dialog"][aria-label="Task: Water the plants"]').count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(400)
  // a Time block: its details (the slot), menu B without Duplicate
  await fcBlock(page, ADMIN).click({ position: { x: 30, y: 12 } })
  await sleep(500)
  rows = await rowsOf(details(page))
  check('c-slot left-click opens the Time block\'s details (when, Repeat, Link a task…, More, Delete)', (await details(page).count()) === 1 && ['Fri, Oct 23', 'Link a task…', 'More', 'Delete'].every((w) => rows.some((r) => r.startsWith(w))), JSON.stringify(rows))
  await page.keyboard.press('Escape')
  await sleep(300)
  await fcBlock(page, ADMIN).click({ button: 'right', position: { x: 30, y: 12 } })
  await sleep(500)
  rows = await rowsOf(menuB(page))
  check('c-slot right-click: menu B — Details · Work with AI · Copy link · Delete (a slot never duplicates)', JSON.stringify(rows.map((r) => r.split(' ')[0])) === JSON.stringify(['Details', 'Work', 'Copy', 'Delete']), JSON.stringify(rows))
  await page.keyboard.press('Escape')
  await sleep(300)
  // a Google event: read-only both ways
  await fcBlock(page, GOOGLE).click({ position: { x: 30, y: 8 } })
  await sleep(500)
  rows = await rowsOf(details(page))
  check('c-google left-click: its details, read-only (when · From Google)', rows.some((r) => r.startsWith('From Google · Prayer times')) && (await details(page).locator('textarea[readonly]').count()) === 1, JSON.stringify(rows))
  await page.keyboard.press('Escape')
  await sleep(300)
  await fcBlock(page, GOOGLE).click({ button: 'right', position: { x: 30, y: 8 } })
  await sleep(500)
  rows = await rowsOf(menuB(page))
  check('c-google right-click: menu B — Details · Work with AI · Copy link; no tray, nothing to delete', JSON.stringify(rows.map((r) => r.split(' ')[0])) === JSON.stringify(['Details', 'Work', 'Copy']) && !(await hasTray(page, menuB(page))), JSON.stringify(rows))
  await page.keyboard.press('Escape')
  await sleep(300)
  // a repeat's occurrence
  await scrollGrid(page, '07:30')
  await fcAt(page, occId(22)).click({ position: { x: 30, y: 8 } })
  await sleep(500)
  rows = await rowsOf(details(page))
  check('c-repeat left-click: the occurrence\'s details (Repeats daily, Delete)', rows.some((r) => r.startsWith('Repeats daily')) && rows.some((r) => r.startsWith('Delete')), JSON.stringify(rows))
  await page.keyboard.press('Escape')
  await sleep(300)
  // the hover ⋯ is menu B
  const sb = await fcBlock(page, DENTIST).boundingBox().catch(() => null)
  await scrollGrid(page, '08:30')
  const db = await fcBlock(page, DENTIST).boundingBox()
  void sb
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2)
  await sleep(400)
  await fcBlock(page, DENTIST).locator('.kf-ev-act[title="More"]').click()
  await sleep(500)
  check('c the hover ⋯ opens menu B', (await menuB(page).count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(300)
  // the keyboard: Enter = details, Shift+F10 = menu B
  await fcBlock(page, DENTIST).focus()
  await page.keyboard.press('Enter')
  await sleep(500)
  check('c-keys Enter on a focused block opens its details', (await details(page).count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(300)
  await fcBlock(page, DENTIST).focus()
  await page.keyboard.press('Shift+F10')
  await sleep(500)
  check('c-keys Shift+F10 opens menu B, by the block', (await menuB(page).count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(300)
  await fcBlock(page, DENTIST).focus()
  await page.keyboard.press('ContextMenu')
  await sleep(500)
  check('c-keys the menu key opens menu B', (await menuB(page).count()) === 1)
  await page.keyboard.press('Escape')
  check('c nothing was written by looking', state.writes.filter((w) => w.table === 'calendar_events' || w.table === 'tasks').length === 0, JSON.stringify(state.writes.map((w) => w.table)))
  check('c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ P · phone: a tap = details, a long-press / the details' ⋯ = menu B's sheet; the question as a sheet ═══
if (want('p')) {
  const { ctx, page, errors, state, cdp } = await open('/calendar', { view: phone })
  await scrollPhone(page, 9 * 60)
  const dialogs = () => page.locator('[role="dialog"]')
  const closeSheet = async () => {
    await page.keyboard.press('Escape')
    await sleep(700)
  }
  // an event: tap → details (no tray, a ⋯); ⋯ → menu B
  await tapAt(cdp, center(await pcBlock(page, eid(DENTIST)).boundingBox()))
  let rows = await sheetRows(page)
  check('p-event a tap opens the details sheet: when · Repeat · Link a task… · More; no tray; a ⋯ in its head', ['Wed, Oct 21', 'Does not repeat', 'Link a task…', 'More'].every((w) => rows.some((r) => r.startsWith(w))) && !(await hasTray(page)) && (await page.locator('.pc-bs-more').count()) === 1, JSON.stringify(rows))
  await shot(page, 'p-event-details')
  await tapAt(cdp, center(await page.locator('.pc-bs-more').boundingBox()))
  rows = await sheetRows(page)
  check('p-event the ⋯ turns it into menu B: the tray · Details · Duplicate · Work with AI · Copy link', (await hasTray(page)) && ['Details', 'Duplicate', 'Work with AI', 'Copy link'].every((w) => rows.some((r) => r.startsWith(w))), JSON.stringify(rows))
  await shot(page, 'p-event-menu')
  await tapAt(cdp, center(await page.locator('.pc-bs-rows button', { hasText: 'Details' }).boundingBox()))
  check('p-event menu B\'s Details goes back to the details', !(await hasTray(page)) && (await page.locator('.pc-bs-more').count()) === 1)
  await closeSheet()
  // a long-press → menu B's sheet (the block stays lifted under it)
  await holdAt(cdp, center(await pcBlock(page, eid(DENTIST)).boundingBox()))
  rows = await sheetRows(page)
  check('p-event a long-press opens menu B\'s sheet', (await hasTray(page)) && rows.some((r) => r.startsWith('Duplicate')) && rows.some((r) => r.startsWith('Copy link')), JSON.stringify(rows))
  await shot(page, 'p-event-hold')
  await closeSheet()
  check('p-event …closed, the block is still lifted (its handles resize it, as before)', (await page.locator('.pc-block.is-lifted').count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(400)
  // a task block: tap → its task sheet; long-press → menu B with the task's rows
  await tapAt(cdp, center(await pcBlock(page, eid(TYRE_B)).boundingBox()))
  check('p-task a tap opens the task\'s sheet (its details)', (await dialogs().filter({ has: page.locator('.ts-top') }).count()) === 1)
  await closeSheet()
  await holdAt(cdp, center(await pcBlock(page, eid(TYRE_B)).boundingBox()))
  rows = await sheetRows(page)
  check('p-task a long-press: menu B — Complete · Open task · Duplicate · Work with AI · Copy link · Unschedule', ['Complete', 'Open task', 'Duplicate', 'Work with AI', 'Copy link', 'Unschedule'].every((w) => rows.some((r) => r.startsWith(w))) && (await hasTray(page)), JSON.stringify(rows))
  await shot(page, 'p-task-hold')
  await closeSheet()
  await page.keyboard.press('Escape')
  await sleep(400)
  // a repeat on the phone: the question is an action sheet; the details' Delete asks
  await scrollPhone(page, 7 * 60 + 30)
  await tapAt(cdp, center(await pcBlock(page, `${eid(STANDUP)}::${iso('08:00', 21)}`).boundingBox()))
  rows = await sheetRows(page)
  check('p-repeat a tap on an occurrence opens its details (Repeats daily)', rows.some((r) => r.startsWith('Repeats daily')), JSON.stringify(rows))
  await tapAt(cdp, center(await page.locator('.pc-bs-delete').boundingBox()))
  await sleep(500)
  const qs = page.locator('[role="dialog"]').filter({ hasText: 'Delete repeating event' })
  const qRows = await qs.locator('.kf-as-row').allInnerTexts()
  check('p-repeat Delete asks as an action sheet: This event · This and following events · All events', JSON.stringify(qRows.map((r) => r.trim())) === JSON.stringify(['This event', 'This and following events', 'All events']), JSON.stringify(qRows))
  await shot(page, 'p-scope-sheet')
  await tapAt(cdp, center(await qs.locator('.kf-as-row', { hasText: 'This and following events' }).boundingBox()))
  await settle(state)
  const row = ev$(state, STANDUP)
  check('p-repeat …"This and following events": the series ends before Wed 21 (UNTIL), nothing new', row.recurrence_rule.includes('UNTIL=20261021T045959Z') && fresh(state, 'calendar_events').length === 0 && (await toastSoon(page, 'this and following')), row.recurrence_rule)
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ S · a repeating event: every operation × every answer, in the stored rows ═══
async function onOcc(fn) {
  const o = await open()
  await threeDays(o.page)
  const r = await fn(o)
  await settle(o.state)
  return { ...o, r }
}
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 1000
/** What each answer leaves, for an occurrence edit that carries `fields` (and maybe new times). */
function seriesState(state, scope, { fields = {}, start = iso('08:00', 22), end = iso('08:30', 22), allStart = iso('08:00', 19), allEnd = iso('08:30', 19) } = {}) {
  const row = ev$(state, STANDUP)
  const made = fresh(state, 'calendar_events')
  const has = (r) => Object.entries(fields).every(([k, v]) => r[k] === v)
  if (scope === 'this') return made.length === 1 && made[0].series_id === eid(STANDUP) && !made[0].recurrence_rule && has(made[0]) && near(made[0].starts_at, start) && near(made[0].ends_at, end) && (row.recurrence_exdates ?? []).some((x) => near(x, iso('08:00', 22))) && row.recurrence_rule === 'FREQ=DAILY'
  if (scope === 'following') return made.length === 1 && made[0].recurrence_rule === 'FREQ=DAILY' && !made[0].series_id && has(made[0]) && near(made[0].starts_at, start) && near(made[0].ends_at, end) && row.recurrence_rule.includes(UNTIL_22) && !has(row) === Object.keys(fields).length > 0
  return made.length === 0 && has(row) && near(row.starts_at, allStart) && near(row.ends_at, allEnd) && row.recurrence_rule === 'FREQ=DAILY'
}
const dump = (state) => JSON.stringify([ev$(state, STANDUP), ...fresh(state, 'calendar_events')].map((r) => ({ id: r.id.slice(-4), t: r.title, s: r.starts_at, e: r.ends_at, rule: r.recurrence_rule, ex: r.recurrence_exdates, sid: r.series_id?.slice(-4), c: r.color, p: r.project_id?.slice(-4), del: r.deleted_at })))

if (want('s')) {
  for (const scope of ['this', 'following', 'all']) {
    const W = EV_WORDS[scope]
    // rename (the details' title)
    let o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ position: { x: 30, y: 8 } })
      await sleep(400)
      await details(page).locator('textarea').fill('Sync')
      await page.keyboard.press('Enter')
      await sleep(400)
      const head = await ask(page).getAttribute('aria-label').catch(() => null)
      const words = await ask(page).getByRole('button').allInnerTexts().catch(() => [])
      const focused = await page.evaluate(() => document.activeElement?.textContent)
      if (scope === 'this') await shot(page, 's-ask-desktop')
      await answer(page, W)
      return { head, words, focused }
    })
    if (scope === 'this') check('s the question: "Edit repeating event" — This event · This and following events · All events · Cancel, by the block; the first has the focus', o.r.head === 'Edit repeating event' && JSON.stringify(o.r.words) === JSON.stringify(['This event', 'This and following events', 'All events', 'Cancel']) && o.r.focused === 'This event', JSON.stringify(o.r))
    check(`s-rename ${scope}: ${W} → the stored series as Google leaves it`, seriesState(o.state, scope, { fields: { title: 'Sync' } }), dump(o.state))
    if (scope === 'following') {
      // Undo per answer: the split goes back — the series whole, the new row gone
      await undoToast(o.page, 'this and following')
      await settle(o.state)
      check('s-rename following: Undo puts the series back whole and removes the new row', ev$(o.state, STANDUP).recurrence_rule === 'FREQ=DAILY' && fresh(o.state, 'calendar_events').length === 0, dump(o.state))
    }
    await o.ctx.close()
    // colour (menu B's tray)
    o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ button: 'right', position: { x: 30, y: 8 } })
      await sleep(400)
      await menuB(page).locator('.kf-sw[aria-label="Fern"]').click()
      await answer(page, W)
    })
    check(`s-colour ${scope}: ${W}`, seriesState(o.state, scope, { fields: { color: '#72BF8E' } }) || seriesState(o.state, scope, { fields: { color: 'fern' } }), dump(o.state))
    await o.ctx.close()
    // project (the details' Project row)
    o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ position: { x: 30, y: 8 } })
      await sleep(400)
      await details(page).locator('[role="menuitem"]', { hasText: 'No project' }).click()
      await sleep(400)
      await page.locator('[role="menu"] button, [role="menuitem"]', { hasText: 'Garden' }).last().click()
      await answer(page, W)
    })
    check(`s-project ${scope}: ${W}`, seriesState(o.state, scope, { fields: { project_id: PID } }), dump(o.state))
    await o.ctx.close()
    // move (a drag, an hour later)
    o = await onOcc(async ({ page }) => {
      await dragAsk(page, fcAt(page, occId(22)), await hourPx(page))
      const head = await ask(page).getAttribute('aria-label').catch(() => null)
      await answer(page, W)
      return head
    })
    check(`s-move ${scope}: dragged to 09:00, "${o.r}" → ${W}`, o.r === 'Move repeating event' && seriesState(o.state, scope, { start: iso('09:00', 22), end: iso('09:30', 22), allStart: iso('09:00', 19), allEnd: iso('09:30', 19) }), dump(o.state))
    await o.ctx.close()
    // resize (the bottom edge, half an hour)
    o = await onOcc(async ({ page }) => {
      await dragAsk(page, fcAt(page, occId(22)), (await hourPx(page)) / 2, true)
      const head = await ask(page).getAttribute('aria-label').catch(() => null)
      await answer(page, W)
      return head
    })
    check(`s-resize ${scope}: to 08:00–09:00, "${o.r}" → ${W}`, o.r === 'Resize repeating event' && seriesState(o.state, scope, { end: iso('09:00', 22), allEnd: iso('09:00', 19) }), dump(o.state))
    await o.ctx.close()
    // length (the details' length chips: 45m)
    o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ position: { x: 30, y: 8 } })
      await sleep(400)
      await details(page).getByRole('button', { name: /^45m$/ }).first().click()
      await answer(page, W)
    })
    check(`s-length ${scope}: the 45m chip → ${W}`, seriesState(o.state, scope, { end: iso('08:45', 22), allEnd: iso('08:45', 19) }), dump(o.state))
    await o.ctx.close()
    // delete (menu B)
    o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ button: 'right', position: { x: 30, y: 8 } })
      await sleep(400)
      await page.locator('[role="menuitem"]', { hasText: 'Delete' }).click()
      await answer(page, W)
    })
    const row = ev$(o.state, STANDUP)
    const del = scope === 'this' ? row.recurrence_rule === 'FREQ=DAILY' && row.recurrence_exdates.some((x) => near(x, iso('08:00', 22))) && !row.deleted_at
      : scope === 'following' ? row.recurrence_rule.includes(UNTIL_22) && !row.deleted_at && fresh(o.state, 'calendar_events').length === 0
        : !!row.deleted_at
    check(`s-delete ${scope}: ${W} → ${scope === 'this' ? 'Thu 22 skipped' : scope === 'following' ? 'the series ends before Thu 22' : 'the series in Trash'}`, del, dump(o.state))
    if (scope === 'all') {
      await undoToast(o.page, 'all events')
      await settle(o.state)
      check('s-delete all: Undo brings the series back', !ev$(o.state, STANDUP).deleted_at, dump(o.state))
    }
    await o.ctx.close()
    // duplicate (menu B)
    o = await onOcc(async ({ page }) => {
      await fcAt(page, occId(22)).click({ button: 'right', position: { x: 30, y: 8 } })
      await sleep(400)
      await page.locator('[role="menuitem"]', { hasText: 'Duplicate' }).click()
      await answer(page, W)
    })
    const made = fresh(o.state, 'calendar_events')
    const dup = made.length === 1 && ev$(o.state, STANDUP).recurrence_rule === 'FREQ=DAILY' && (ev$(o.state, STANDUP).recurrence_exdates ?? []).length === 0 && (
      scope === 'this' ? !made[0].recurrence_rule && near(made[0].starts_at, iso('08:00', 22))
        : scope === 'following' ? made[0].recurrence_rule === 'FREQ=DAILY' && near(made[0].starts_at, iso('08:00', 22))
          : made[0].recurrence_rule === 'FREQ=DAILY' && near(made[0].starts_at, iso('08:00', 19)))
    check(`s-duplicate ${scope}: ${W} → ${scope === 'this' ? 'one one-off copy' : scope === 'following' ? 'a series from Thu 22' : 'the whole series copied'}; the original untouched`, dup, dump(o.state))
    await o.ctx.close()
  }
  // a Google event never asks (it isn't ours to change)
  const g = await open()
  await threeDays(g.page, '15:00')
  await fcBlock(g.page, GOOGLE).click({ button: 'right', position: { x: 30, y: 8 } })
  await sleep(400)
  check('s a Google event offers no change at all, so nothing asks', (await ask(g.page).count()) === 0 && !(await hasTray(g.page, menuB(g.page))))
  await g.ctx.close()
}

// ═══ T · a repeating task: every operation × every answer ═══
const tdump = (state) => JSON.stringify([...state.rows.tasks.filter((t) => t.title.startsWith('Water') || t.title === 'Hydrate')].map((t) => ({ id: t.id.slice(-4), t: t.title, st: t.status, due: t.due_at, rule: t.recurrence_rule, p: t.project_id?.slice(-4), del: t.deleted_at })).concat([{ blk: ev$(state, WATER_B)?.starts_at, del: ev$(state, WATER_B)?.deleted_at }]))
const spawned = (state) => fresh(state, 'tasks').filter((t) => t.title === 'Water the plants' && t.status === 'todo')
async function onWater(fn) {
  const o = await open()
  await threeDays(o.page, '12:30')
  const r = await fn(o)
  await settle(o.state)
  return { ...o, r }
}
if (want('t')) {
  for (const scope of ['this', 'following', 'all']) {
    const W = TASK_WORDS[scope]
    // complete (the block's box)
    let o = await onWater(async ({ page }) => {
      const b = await fcBlock(page, WATER_B).boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6)
      await sleep(400)
      await fcBlock(page, WATER_B).locator('.kf-ev-check').click()
      const head = await ask(page).getAttribute('aria-label').catch(() => null)
      const words = await ask(page).getByRole('button').allInnerTexts().catch(() => [])
      if (scope === 'this') await shot(page, 't-ask-complete')
      await answer(page, W)
      return { head, words }
    })
    if (scope === 'this') check('t the question for a task: "Complete repeating task" — This one · This and following · All · Cancel', o.r.head === 'Complete repeating task' && JSON.stringify(o.r.words) === JSON.stringify(['This one', 'This and following', 'All', 'Cancel']), JSON.stringify(o.r))
    let w = task$(o.state, WATER)
    const comp = w.status === 'done' && (scope === 'this' ? w.recurrence_rule === WEEKLY && spawned(o.state).length === 1 && near(spawned(o.state)[0].due_at, iso('14:00', 28)) : !w.recurrence_rule && spawned(o.state).length === 0)
    check(`t-complete ${scope}: ${W} → ${scope === 'this' ? 'done, next Wednesday\'s round spawned' : 'done, the series ends (no next round)'}`, comp && task$(o.state, WATER_PREV).status === 'done', tdump(o.state))
    if (scope === 'following') {
      await undoToast(o.page, 'the series ends here')
      await settle(o.state)
      w = task$(o.state, WATER)
      check('t-complete following: Undo — open again, still repeating weekly', w.status === 'todo' && w.recurrence_rule === WEEKLY, tdump(o.state))
    }
    await o.ctx.close()
    // move (a drag of its block, an hour later)
    o = await onWater(async ({ page }) => {
      await dragAsk(page, fcBlock(page, WATER_B), await hourPx(page))
      const head = await ask(page).getAttribute('aria-label').catch(() => null)
      await answer(page, W)
      return head
    })
    w = task$(o.state, WATER)
    // FullCalendar's placeholder can land one snap under the pointer (cal-blocks, "seen, not changed"): 15:00 or 15:15.
    const landed = Date.parse(ev$(o.state, WATER_B).starts_at) - Date.parse(iso('14:00'))
    const mv = landed >= 60 * 60_000 && landed <= 75 * 60_000 && (scope === 'this' ? !w.recurrence_rule && spawned(o.state).length === 1 && near(spawned(o.state)[0].due_at, iso('14:00', 28)) : w.recurrence_rule === WEEKLY && spawned(o.state).length === 0)
    check(`t-move ${scope}: "${o.r}" → ${W} → ${scope === 'this' ? 'this round an hour on, alone; the series goes on at 14:00 next week' : 'the round an hour on, the series with it'}`, o.r === 'Move repeating task' && mv, tdump(o.state))
    await o.ctx.close()
    // title (the task popover a click opens)
    o = await onWater(async ({ page }) => {
      await fcBlock(page, WATER_B).click({ position: { x: 30, y: 12 } })
      await sleep(700)
      const pop = page.locator('[role="dialog"][aria-label="Task: Water the plants"]')
      await pop.locator('[aria-label="Title"]').fill('Hydrate')
      await pop.locator('[aria-label="Title"]').press('Enter')
      await sleep(300)
      await pop.locator('[aria-label="Title"]').evaluate((e) => e.blur())
      await answer(page, W)
    })
    w = task$(o.state, WATER)
    const prev = task$(o.state, WATER_PREV)
    const ti = w.title === 'Hydrate' && (scope === 'this' ? !w.recurrence_rule && spawned(o.state).length === 1 && prev.title === 'Water the plants'
      : scope === 'following' ? w.recurrence_rule === WEEKLY && prev.title === 'Water the plants' && spawned(o.state).length === 0
        : w.recurrence_rule === WEEKLY && prev.title === 'Hydrate')
    check(`t-title ${scope}: ${W} → ${scope === 'this' ? 'this round renamed alone; the series goes on as "Water the plants"' : scope === 'following' ? 'this round on, last week\'s done round kept' : 'every round, the done one too'}`, ti, tdump(o.state))
    await o.ctx.close()
    // project (the popover's Move to… chip)
    o = await onWater(async ({ page }) => {
      await fcBlock(page, WATER_B).click({ position: { x: 30, y: 12 } })
      await sleep(700)
      const pop = page.locator('[role="dialog"][aria-label="Task: Water the plants"]')
      await pop.getByRole('button', { name: /Move to…/ }).click()
      await sleep(400)
      await page.locator('[role="menu"][aria-label="Move to"] [role="menuitem"]', { hasText: 'Garden' }).first().click()
      await answer(page, W)
    })
    w = task$(o.state, WATER)
    const pr = w.project_id === PID && (scope === 'this' ? !w.recurrence_rule && spawned(o.state).length === 1 && !spawned(o.state)[0].project_id : scope === 'following' ? !task$(o.state, WATER_PREV).project_id : task$(o.state, WATER_PREV).project_id === PID)
    check(`t-project ${scope}: ${W} → into Garden`, pr, tdump(o.state))
    await o.ctx.close()
    // delete (menu B)
    o = await onWater(async ({ page }) => {
      await fcBlock(page, WATER_B).click({ button: 'right', position: { x: 30, y: 12 } })
      await sleep(400)
      await page.locator('[role="menuitem"]', { hasText: /^Delete/ }).click()
      await answer(page, W)
    })
    w = task$(o.state, WATER)
    const de = scope === 'this' ? !w.deleted_at && near(w.due_at, iso('14:00', 28)) && !!ev$(o.state, WATER_B).deleted_at
      : scope === 'following' ? !!w.deleted_at && !task$(o.state, WATER_PREV).deleted_at
        : !!w.deleted_at && !!task$(o.state, WATER_PREV).deleted_at
    check(`t-delete ${scope}: ${W} → ${scope === 'this' ? 'this round skipped (next Wednesday), its block off' : scope === 'following' ? 'the open round to Trash, the done one kept' : 'every round to Trash'}`, de, tdump(o.state))
    if (scope === 'this') {
      await undoToast(o.page, 'Skipped')
      await settle(o.state)
      check('t-delete this: Undo — back on today, its block back', near(task$(o.state, WATER).due_at, iso('14:00')) && !ev$(o.state, WATER_B).deleted_at, tdump(o.state))
    }
    await o.ctx.close()
    // duplicate (menu B)
    o = await onWater(async ({ page }) => {
      await fcBlock(page, WATER_B).click({ button: 'right', position: { x: 30, y: 12 } })
      await sleep(400)
      await page.locator('[role="menuitem"]', { hasText: 'Duplicate' }).click()
      await answer(page, W)
    })
    const copies = fresh(o.state, 'tasks').filter((t) => t.title === 'Water the plants')
    const du = copies.length === 1 && (scope === 'this' ? !copies[0].recurrence_rule : copies[0].recurrence_rule === WEEKLY) && task$(o.state, WATER).recurrence_rule === WEEKLY
    check(`t-duplicate ${scope}: ${W} → ${scope === 'this' ? 'a one-off copy' : 'a repeating copy'}, blocked at 14:00`, du && fresh(o.state, 'calendar_events').some((e) => e.task_id === copies[0].id && near(e.starts_at, iso('14:00'))), tdump(o.state))
    await o.ctx.close()
  }
  // colour lives on the block: no question for a task's block
  const o = await onWater(async ({ page }) => {
    await fcBlock(page, WATER_B).click({ button: 'right', position: { x: 30, y: 12 } })
    await sleep(400)
    await menuB(page).locator('.kf-sw[aria-label="Fern"]').click()
    await sleep(600)
    return await ask(page).count()
  })
  check('t-colour a repeating task\'s block takes a colour without asking (the colour is the block\'s, not the series\')', o.r === 0 && ev$(o.state, WATER_B).color != null, JSON.stringify(ev$(o.state, WATER_B)))
  check('t no page errors', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
}

// ═══ X · Cancel / Esc: nothing is written, the block goes back ═══
if (want('x')) {
  const { ctx, page, errors, state } = await open()
  await threeDays(page)
  const top0 = (await fcAt(page, occId(22)).boundingBox()).y
  const w0 = state.writes.length
  await dragAsk(page, fcAt(page, occId(22)), await hourPx(page))
  check('x a drag of an occurrence asks before anything is written', (await ask(page).count()) === 1 && state.writes.length === w0)
  await shot(page, 'x-drag-asking')
  await page.keyboard.press('Escape')
  await sleep(600)
  const top1 = (await fcAt(page, occId(22)).boundingBox()).y
  check('x Esc: the dragged block goes back where it was; nothing written', Math.abs(top1 - top0) < 2 && state.writes.filter((w) => w.table === 'calendar_events').length === 0, `${top0} → ${top1}`)
  await dragAsk(page, fcAt(page, occId(22)), await hourPx(page))
  await ask(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await sleep(600)
  check('x Cancel: the same', Math.abs((await fcAt(page, occId(22)).boundingBox()).y - top0) < 2 && state.writes.filter((w) => w.table === 'calendar_events').length === 0)
  const h0 = (await fcAt(page, occId(22)).boundingBox()).height
  await dragAsk(page, fcAt(page, occId(22)), (await hourPx(page)) / 2, true)
  await page.keyboard.press('Escape')
  await sleep(600)
  check('x a resize, cancelled, goes back to its length', Math.abs((await fcAt(page, occId(22)).boundingBox()).height - h0) < 2 && state.writes.filter((w) => w.table === 'calendar_events').length === 0)
  // a repeating task's block too
  await scrollGrid(page, '12:30')
  const t0 = (await fcBlock(page, WATER_B).boundingBox()).y
  await dragAsk(page, fcBlock(page, WATER_B), await hourPx(page))
  await page.keyboard.press('Escape')
  await sleep(600)
  check('x a repeating task\'s block, cancelled, goes back too', Math.abs((await fcBlock(page, WATER_B).boundingBox()).y - t0) < 2 && state.writes.length === w0)
  // a click away cancels the rename's question, and the title goes back
  await scrollGrid(page, '07:30')
  await fcAt(page, occId(22)).click({ position: { x: 30, y: 8 } })
  await sleep(400)
  await details(page).locator('textarea').fill('Sync')
  await page.keyboard.press('Enter')
  await sleep(400)
  await page.keyboard.press('Escape')
  await sleep(400)
  check('x the rename\'s question, cancelled: nothing written', state.writes.length === w0)
  check('x no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ V · the block menus stay on screen at 125%: never taller than the window, their own scroll, Delete reachable ═══
if (want('v')) {
  for (const height of [800, 480]) {
    const { ctx, page, errors, state } = await open('/calendar', { scale: 1.25, view: { viewport: { width: 1280, height } } })
    await threeDays(page, '08:30')
    const fits = async (label) => {
      const m = page.locator(`[role="menu"][aria-label="${label}"]`)
      await m.waitFor({ timeout: 4000 })
      await sleep(300)
      const box = await m.boundingBox()
      const del = m.getByRole('menuitem', { name: /^Delete/ })
      await del.scrollIntoViewIfNeeded()
      await sleep(200)
      const d = await del.boundingBox()
      const scrolls = await m.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? '', [d.x + d.width / 2, d.y + d.height / 2])
      return { ok: box.y >= 0 && box.y + box.height <= height + 0.5 && d.y >= box.y - 0.5 && d.y + d.height <= box.y + box.height + 0.5 && /^Delete/.test(hit.trim()), box: [Math.round(box.y), Math.round(box.y + box.height)], del: [Math.round(d.y), Math.round(d.y + d.height)], scrolls }
    }
    // menu B of a task block low on the screen (the tray, then eight rows)
    await scrollGrid(page, '08:00')
    const tb = await fcBlock(page, TYRE_B).boundingBox()
    await page.mouse.click(tb.x + 30, tb.y + tb.height - 6, { button: 'right' })
    const a = await fits('Block menu')
    check(`v-${height} 125%: a task block's menu B stays inside the ${height}px window and Delete is on screen, clickable${a.scrolls ? ' (the menu scrolls inside itself)' : ''}`, a.ok, JSON.stringify(a))
    if (height === 480) {
      await shot(page, 'v-menu-480')
      check('v-480 …the menu is capped at the window and scrolls inside itself', a.scrolls, JSON.stringify(a))
    }
    await page.keyboard.press('Escape')
    await sleep(300)
    // the details of an event at the bottom edge of the window
    await scrollGrid(page, '10:00')
    const eb = await fcBlock(page, DENTIST).boundingBox()
    await page.mouse.click(eb.x + 30, eb.y + 10)
    const b = await fits('Block details')
    check(`v-${height} 125%: an event's details stay inside the window, Delete reachable`, b.ok, JSON.stringify(b))
    // and Delete really is pressable there
    const w0 = state.writes.length
    await page.locator('[role="menu"][aria-label="Block details"]').getByRole('menuitem', { name: /^Delete/ }).click()
    await settle(state)
    check(`v-${height} …pressing it deletes (Dentist to Trash)`, !!ev$(state, DENTIST).deleted_at && state.writes.length > w0)
    check(`v-${height} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
