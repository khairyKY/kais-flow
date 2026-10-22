// cal-polish (Kai 2026-10-21): 15-minute blocks on every path, a one-tap length row in the calendar's
// small popups, the drag ghost, and no empty-title task — on the REAL app against a MOCKED backend (the
// calendar-rail recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call). Writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 08:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5294'
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
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
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const EMAIL = 1, STRETCH = 2, WATER = 3, REPLY = 4, LONG = 5, DEEP = 6
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const WATERB = 1, STANDUP = 2, ADMIN = 3, LONGB = 4, DEEPB = 5
const TASKS = [
  task(EMAIL, "Kai's Flow email: Gmail App Password + 2 GitHub secrets🌸", { duration_min: 20, due_at: iso('09:00') }),
  task(STRETCH, 'Stretch', { duration_min: 15, due_at: iso('09:00') }),
  task(WATER, 'Water the plants', { duration_min: 15, due_at: iso('11:00'), scheduled_start: iso('11:00'), scheduled_end: iso('11:15') }),
  task(REPLY, 'Reply to Omar', { duration_min: 15, slot_id: eid(ADMIN), slot_date: DATE, scheduled_start: iso('13:00'), scheduled_end: iso('14:30') }),
  task(LONG, 'Write the report', { duration_min: 30, due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:30') }),
  task(DEEP, 'Deep work on the quarterly forecast numbers', { duration_min: 60, due_at: iso('17:00'), scheduled_start: iso('17:00'), scheduled_end: iso('18:00') }),
]
const EVENTS = [
  ev(WATERB, 'Water the plants', '11:00', '11:15', WATER),
  ev(STANDUP, 'Standup', '12:00', '13:00'),
  ev(ADMIN, 'Admin', '13:00', '14:30', null, 'time_block'),
  ev(LONGB, 'Write the report', '16:00', '16:30', LONG),
  ev(DEEPB, 'Deep work on the quarterly forecast numbers', '17:00', '18:00', DEEP),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, scale, uid, now, clock12]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, inbox: false, lists: true }))
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    // The strings below read the 24-hour clock unless a check asks for the 12-hour one (lib/clock, B).
    if (!clock12) localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    // "Updated to vX · What's new" sits over the day tray: this device has seen every version.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [o.theme ?? 'day', JSON.stringify(session), o.scale ? String(o.scale) : null, UID, cairo(NOW).getTime(), !!o.clock12])
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
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const mins = (e) => Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000)
const sec = (page, s) => page.locator(`.cal-rail-sec[data-section="${s}"]`)
const card = (page, s, title) => sec(page, s).locator('.unscheduled-task', { hasText: title }).first()
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]`).first()

/** Scroll the desktop grid so `hhmm` is mid-screen, and return the screen point of that slot in today's column. */
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
/** A pointer drag in 20 steps; `mid` runs with the button still down over `to`. */
async function mouseDrag(page, from, to, mid) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  if (mid) await mid()
  await page.mouse.up()
  await sleep(700)
}

const dialog = (page) => page.locator('[role="dialog"]').last()
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click()
/** The block menu's / quick create's one-tap length row. */
const lengthRow = (page) => page.locator('[aria-label="Length"]').last()
const chipRe = (label) => new RegExp(`^\\s*${label}\\s*$`)
const lenChip = (page, label) => lengthRow(page).locator('button', { hasText: chipRe(label) })
const chipLabels = async (loc) => (await loc.locator('button').allInnerTexts()).map((l) => l.trim()).join(' · ')
const ROW = '15m · 30m · 45m · 1h · 1h30 · 2h'

// ═══ Desktop: a 15-minute block from every path ═══

// D1 — rail cards onto the grid: the 15m task makes a 15-minute block, the 20m one a 20-minute block.
if (want('d1')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  await mouseDrag(page, center(await card(page, 'today', 'Stretch').boundingBox()), await slotPoint(page, '09:00'))
  await settle(state)
  const b = posts(state, 'calendar_events', w0).find((e) => e.task_id === id(STRETCH))
  check('d1 rail "Stretch" (15m) → a 15-minute block at 09:00', b && b.starts_at === iso('09:00') && mins(b) === 15, JSON.stringify(b && [b.starts_at, mins(b)]))
  const w1 = state.writes.length
  await mouseDrag(page, center(await card(page, 'today', 'Gmail').boundingBox()), await slotPoint(page, '10:00'))
  await settle(state)
  const b2 = posts(state, 'calendar_events', w1).find((e) => e.task_id === id(EMAIL))
  check('d1 rail "Kai\'s Flow email" (20m) → a 20-minute block at 10:00', b2 && b2.starts_at === iso('10:00') && mins(b2) === 20, JSON.stringify(b2 && [b2.starts_at, mins(b2)]))
  check('d1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D2 — a task held in a slot dragged out onto empty time: its own 15-minute block.
if (want('d2')) {
  const { ctx, page, errors, state } = await open()
  const row = page.locator(`.kf-ev-slot-row[data-slot-task="${id(REPLY)}"]`)
  await slotPoint(page, '13:30')
  const w0 = state.writes.length
  const from = await row.boundingBox()
  const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="11:30:00"]').boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${DATE}"]`).boundingBox()
  // the row's title, clear of its check and its × / ⋯
  await mouseDrag(page, { x: from.x + from.width * 0.45, y: from.y + from.height / 2 }, { x: col.x + col.width / 2, y: lane.y + 3 }, () => shot(page, 'd2-mid'))
  await settle(state)
  const b = posts(state, 'calendar_events', w0).find((e) => e.task_id === id(REPLY))
  check('d2 a held 15m task dragged out → a 15-minute block at 11:30', b && b.starts_at === iso('11:30') && mins(b) === 15, JSON.stringify(b && [b.starts_at, mins(b)]))
  check('d2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/** Drags block n's bottom edge into the first quarter of the `hhmm` half hour (the end lands on its quarter past). */
async function resizeTo(page, n, hhmm) {
  await slotPoint(page, hhmm)
  const blk = fcBlock(page, n)
  const bb = await blk.boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(250)
  const handle = await blk.locator('.fc-event-resizer-end').boundingBox()
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  await mouseDrag(page, center(handle), { x: handle.x + handle.width / 2, y: lane.y + lane.height * 0.3 })
}
// D3 — resize: Standup (12:00–13:00) by its bottom edge up to 12:15 stays 15 minutes (no 30-minute clamp).
if (want('d3')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  await resizeTo(page, STANDUP, '12:00')
  await settle(state)
  const b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(STANDUP))
  check('d3 Standup resized by its bottom edge to 12:00–12:15 (15 minutes kept)', b && b.starts_at === iso('12:00') && mins(b) === 15, JSON.stringify(b && [b.starts_at, mins(b)]))
  // A task block resized down to 15 writes its estimate back.
  const w1 = state.writes.length
  await resizeTo(page, LONGB, '16:00')
  await settle(state)
  const b2 = posts(state, 'calendar_events', w1).find((e) => e.id === eid(LONGB))
  const t2 = posts(state, 'tasks', w1).filter((t) => t.id === id(LONG)).at(-1)
  check('d3 the task block "Write the report" resized to 16:00–16:15; its estimate → 15', b2 && mins(b2) === 15 && t2?.duration_min === 15, JSON.stringify([b2 && mins(b2), t2?.duration_min]))
  check('d3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D8 — the top edge resizes too (15-minute snap, a visible grip); the bottom grip shows on hover.
/** Drags block n's top edge into the first quarter of the `hhmm` half hour (the start lands on hhmm). */
async function resizeTopTo(page, n, hhmm, quarter = 0) {
  const blk = fcBlock(page, n)
  const bb = await blk.boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(250)
  const handle = await blk.locator('.fc-event-resizer-start').boundingBox()
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  await mouseDrag(page, center(handle), { x: handle.x + handle.width / 2, y: lane.y + lane.height * (quarter ? 0.55 : 0.05) })
}
if (want('d8')) {
  const { ctx, page, errors, state } = await open()
  await slotPoint(page, '12:00')
  const blk = fcBlock(page, STANDUP)
  const bb = await blk.boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(300)
  const grips = await blk.evaluate((e) => ['.fc-event-resizer-start', '.fc-event-resizer-end'].map((s) => { const g = getComputedStyle(e.querySelector(s), '::after'); return [g.opacity, g.width, getComputedStyle(e.querySelector(s)).cursor] }))
  check('d8 on hover both edges show the grip and a resize cursor', grips.every(([o, w, c]) => o === '1' && w !== 'auto' && /resize/.test(c)), JSON.stringify(grips))
  await shot(page, 'd8-grips')
  let w0 = state.writes.length
  await resizeTopTo(page, STANDUP, '12:00', 1)
  await settle(state)
  let b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(STANDUP))
  check('d8 Standup by its top edge down a quarter → 12:15–13:00', b && b.starts_at === iso('12:15') && b.ends_at === iso('13:00'), JSON.stringify(b && [b.starts_at, b.ends_at]))
  w0 = state.writes.length
  await resizeTopTo(page, STANDUP, '11:30', 1)
  await settle(state)
  b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(STANDUP))
  check('d8 …and up to 11:45 → 11:45–13:00 (the end stays)', b && b.starts_at === iso('11:45') && b.ends_at === iso('13:00'), JSON.stringify(b && [b.starts_at, b.ends_at]))
  w0 = state.writes.length
  await resizeTopTo(page, STANDUP, '12:30', 1)
  await settle(state)
  b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(STANDUP))
  check('d8 …down to 12:45 → a 15-minute block 12:45–13:00', b && b.starts_at === iso('12:45') && mins(b) === 15, JSON.stringify(b && [b.starts_at, mins(b)]))
  check('d8 "Resized" toasts carry Undo', (await page.locator('.kf-toast', { hasText: 'Resized' }).getByRole('button', { name: 'Undo' }).count()) >= 1)
  check('d8 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

const qcTimes = (page) => page.locator('.kf-quickcreate input').evaluateAll((els) => els.map((e) => e.value))
// D4 — a click-drag across one quarter (10:00 → 10:10): quick create reads 10:00–10:15 and makes 15.
if (want('d4')) {
  const { ctx, page, errors, state } = await open()
  const p = await slotPoint(page, '10:00')
  const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="10:00:00"]').boundingBox()
  await mouseDrag(page, { x: p.x, y: lane.y + 2 }, { x: p.x, y: lane.y + lane.height * 0.4 })
  const qc = page.locator('.kf-quickcreate')
  const times = await qcTimes(page)
  check('d4 the drag opens quick create on 10:00–10:15', times.includes('10:00 AM') && times.includes('10:15 AM'), JSON.stringify(times))
  await qc.locator('button', { hasText: /^Event$/ }).first().click()
  await qc.getByLabel('Title').fill('Quick sync')
  const w0 = state.writes.length
  await qc.getByLabel('Title').press('Enter')
  await settle(state)
  const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Quick sync')
  check('d4 Enter → the event "Quick sync" 10:00–10:15', e && e.starts_at === iso('10:00') && mins(e) === 15, JSON.stringify(e && [e.starts_at, mins(e)]))
  // A plain click still opens on the half hour (30 minutes).
  const p2 = await slotPoint(page, '15:00')
  await page.mouse.click(p2.x, p2.y + 4)
  await sleep(500)
  const t2 = await qcTimes(page)
  check('d4 a plain click opens 15:00–15:30 (the half hour, as before)', t2.includes('3:00 PM') && t2.includes('3:30 PM'), JSON.stringify(t2))
  check('d4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D5 — quick create's length row: one tap sets the end (and the task's estimate).
if (want('d5')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    const p = await slotPoint(page, '15:00')
    await page.mouse.click(p.x, p.y + 4)
    await sleep(500)
    const qc = page.locator('.kf-quickcreate')
    const labels = await chipLabels(lengthRow(page))
    check(`d5-${theme} quick create shows the length row ${ROW}, 30m picked`, labels === ROW && (await lenChip(page, '30m').getAttribute('aria-pressed')) === 'true', labels)
    await lenChip(page, '15m').click()
    await sleep(200)
    const times = await qcTimes(page)
    check(`d5-${theme} 15m → the end reads 15:15, 15m picked`, times.includes('3:15 PM') && (await lenChip(page, '15m').getAttribute('aria-pressed')) === 'true', JSON.stringify(times))
    await shot(page, `d5-quickcreate-${theme}`)
    if (theme === 'day') {
      await qc.locator('button', { hasText: /^Task$/ }).first().click()
      await qc.getByLabel('Title').fill('Call mum')
      const w0 = state.writes.length
      await qc.getByLabel('Title').press('Enter')
      await settle(state)
      const t = posts(state, 'tasks', w0).find((x) => x.title === 'Call mum')
      const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Call mum')
      check('d5 Enter → the task "Call mum", 15 minutes, and its block 15:00–15:15', t?.duration_min === 15 && e && e.task_id === t.id && e.starts_at === iso('15:00') && mins(e) === 15, JSON.stringify([t?.duration_min, e && [e.starts_at, mins(e)]]))
    }
    check(`d5-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// D6 — the block popover's length row: a task block → 15m (its estimate follows, Undo); an event → 45m.
if (want('d6')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    await slotPoint(page, '16:00')
    await fcBlock(page, LONGB).click()
    await sleep(500)
    const labels = await chipLabels(lengthRow(page))
    check(`d6-${theme} the block popover shows the length row, 30m picked`, labels === ROW && (await lenChip(page, '30m').getAttribute('aria-pressed')) === 'true', labels)
    await shot(page, `d6-blockmenu-${theme}`)
    if (theme === 'day') {
      const w0 = state.writes.length
      await lenChip(page, '15m').click()
      await settle(state)
      const b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(LONGB))
      const t = posts(state, 'tasks', w0).filter((x) => x.id === id(LONG)).at(-1)
      check('d6 15m → the block 16:00–16:15 and the task\'s estimate 15', b && b.starts_at === iso('16:00') && mins(b) === 15 && t?.duration_min === 15, JSON.stringify([b && [b.starts_at, mins(b)], t?.duration_min]))
      check('d6 …"Resized to 16:00–16:15" with Undo; the popover stays, 15m picked', (await toastSoon(page, 'Resized to 16:00–16:15')) && (await lenChip(page, '15m').getAttribute('aria-pressed')) === 'true')
      const w1 = state.writes.length
      await undo(page, 'Resized to 16:00–16:15')
      await settle(state)
      const b1 = posts(state, 'calendar_events', w1).find((e) => e.id === eid(LONGB))
      const t1 = posts(state, 'tasks', w1).filter((x) => x.id === id(LONG)).at(-1)
      check('d6 Undo → 16:00–16:30 and 30 again', b1 && mins(b1) === 30 && t1?.duration_min === 30, JSON.stringify([b1 && mins(b1), t1?.duration_min]))
      await page.keyboard.press('Escape')
      await sleep(300)
      await slotPoint(page, '12:00')
      await fcBlock(page, STANDUP).click()
      await sleep(500)
      const w2 = state.writes.length
      await lenChip(page, '45m').click()
      await settle(state)
      const s = posts(state, 'calendar_events', w2).find((e) => e.id === eid(STANDUP))
      check('d6 an event: Standup 45m → 12:00–12:45', s && s.starts_at === iso('12:00') && mins(s) === 45, JSON.stringify(s && [s.starts_at, mins(s)]))
    }
    check(`d6-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// D7 — drawn honestly: a 15-minute block is half a 30-minute one's height (desktop, 100 / 125 / 150%).
if (want('d7')) {
  for (const scale of [1, 1.25, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale })
    await slotPoint(page, '11:00')
    const h15 = (await fcBlock(page, WATERB).boundingBox()).height
    await slotPoint(page, '16:00')
    const h30 = (await fcBlock(page, LONGB).boundingBox()).height
    check(`d7 at ${scale * 100}% a 15m block draws half a 30m one (${h15.toFixed(1)} / ${h30.toFixed(1)}px)`, Math.abs(h15 / h30 - 0.5) < 0.08, (h15 / h30).toFixed(3))
    if (scale === 1.25) {
      await slotPoint(page, '12:00')
      await shot(page, 'd7-blocks')
    }
    check(`d7 at ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ Phone ═══
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tapAt(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(450)
}
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await tapAt(cdp, center(await loc.boundingBox()))
}
const yOf = (page, hhmm) =>
  page.locator('.pc-canvas').evaluate((c, t) => {
    const [h, m] = t.split(':').map(Number)
    return c.getBoundingClientRect().top + ((h * 60 + m) * 64) / 60
  }, hhmm)
const pcBlock = (page, n) => page.locator(`.pc-block[data-id="${eid(n)}"]`)
async function scrollPhone(page, minute) {
  await page.locator('.pc-scroll').evaluate((e, m) => (e.scrollTop = (m * 64) / 60 - 200), minute)
  await sleep(300)
}

// P1 — tap an empty slot: the sheet's 15m chip, then Save: a task and its 15-minute block.
if (want('p1')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  await scrollPhone(page, 15 * 60)
  await tapAt(cdp, { x: 200, y: (await yOf(page, '15:00')) + 8 })
  const d = dialog(page)
  await tap(cdp, d.locator('.kf-chip', { hasText: chipRe('15m') }))
  await d.locator('.pc-qc-title').fill('Floss')
  const w0 = state.writes.length
  await tap(cdp, d.getByRole('button', { name: 'Save' }))
  await settle(state)
  const t = posts(state, 'tasks', w0).find((x) => x.title === 'Floss')
  const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Floss')
  check('p1 phone quick create 15m → the task (15) and its block 15:00–15:15', t?.duration_min === 15 && e && e.starts_at === iso('15:00') && mins(e) === 15, JSON.stringify([t?.duration_min, e && [e.starts_at, mins(e)]]))
  check('p1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P2 — the phone event sheet's length row: Standup → 30m.
if (want('p2')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone, theme })
    await scrollPhone(page, 12 * 60)
    await tap(cdp, pcBlock(page, STANDUP).locator('.pc-name'))
    await sleep(400)
    const row = dialog(page).locator('[aria-label="Length"]')
    const labels = await chipLabels(row)
    check(`p2-${theme} the event sheet shows the length row, 1h picked`, labels === ROW && (await row.locator('button', { hasText: chipRe('1h') }).getAttribute('aria-pressed')) === 'true', labels)
    await shot(page, `p2-eventsheet-${theme}`)
    if (theme === 'day') {
      const w0 = state.writes.length
      await tap(cdp, row.locator('button', { hasText: chipRe('30m') }))
      await settle(state)
      const s = posts(state, 'calendar_events', w0).find((e) => e.id === eid(STANDUP))
      check('p2 30m → Standup 12:00–12:30, "Resized to 12:00–12:30"', s && s.starts_at === iso('12:00') && mins(s) === 30 && (await toastSoon(page, 'Resized to 12:00–12:30')), JSON.stringify(s && [s.starts_at, mins(s)]))
    }
    check(`p2-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}
// P3 — a task block's sheet: its block card's length row → 15m (the estimate follows).
if (want('p3')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  await scrollPhone(page, 16 * 60)
  await tap(cdp, pcBlock(page, LONGB).locator('.pc-name'))
  await sleep(500)
  const row = dialog(page).locator('[aria-label="Length"]')
  await row.scrollIntoViewIfNeeded().catch(() => {})
  check('p3 the task sheet\'s block card has the length row, 30m picked', (await row.locator('button', { hasText: chipRe('30m') }).getAttribute('aria-pressed').catch(() => null)) === 'true')
  await shot(page, 'p3-tasksheet-day')
  const w0 = state.writes.length
  await tap(cdp, row.locator('button', { hasText: chipRe('15m') }))
  await settle(state)
  const b = posts(state, 'calendar_events', w0).find((e) => e.id === eid(LONGB))
  const t = posts(state, 'tasks', w0).filter((x) => x.id === id(LONG)).at(-1)
  check('p3 15m → the block 16:00–16:15 and the estimate 15', b && mins(b) === 15 && t?.duration_min === 15, JSON.stringify([b && mins(b), t?.duration_min]))
  check('p3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P4 — the phone draws a 15-minute block shorter than a 30-minute one.
if (want('p4')) {
  const { ctx, page, errors } = await open('/calendar', { view: phone })
  await scrollPhone(page, 11 * 60)
  const h15 = (await pcBlock(page, WATERB).boundingBox()).height
  await scrollPhone(page, 16 * 60)
  const h30 = (await pcBlock(page, LONGB).boundingBox()).height
  check(`p4 phone: a 15m block ${h15}px vs a 30m one ${h30}px — not drawn 30 minutes tall`, h15 < h30 * 0.8, (h15 / h30).toFixed(3))
  await scrollPhone(page, 11 * 60)
  await shot(page, 'p4-phone-blocks')
  check('p4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ The drag ghost ═══
/** What's lifted mid-drag: every visible body-level copy, and the source row's state. */
const ghostInfo = (page, srcSel) =>
  page.evaluate((sel) => {
    const vis = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0
    const copies = [...document.querySelectorAll('body > .fc-event-dragging')].filter(vis)
    const src = document.querySelector(sel)
    const g = copies[0]
    const cs = g && getComputedStyle(g)
    return {
      count: copies.length,
      rect: g?.getBoundingClientRect().toJSON(),
      bg: cs?.backgroundColor, bgImage: cs?.backgroundImage, radius: cs?.borderRadius, shadow: cs?.boxShadow, border: cs?.borderTopStyle,
      shown: g ? `${getComputedStyle(g, '::before').content} ${getComputedStyle(g, '::after').content} ${[...g.children].filter(vis).map((e) => e.textContent).join(' ')}` : '',
      controls: g ? [...g.querySelectorAll('*')].filter((e) => vis(e) && (e.getAttribute('role') === 'checkbox' || e.tagName === 'BUTTON' || e.tagName === 'INPUT')).length : -1,
      srcRect: src?.getBoundingClientRect().toJSON(),
      srcLifted: src?.hasAttribute('data-lifted'),
      srcOutline: src && getComputedStyle(src).outlineStyle,
      srcBorder: src && getComputedStyle(src).borderTopStyle,
      srcTransform: src && getComputedStyle(src).transform,
      placeholder: !!document.querySelector('.fc .fc-event-mirror'),
      scale: Number(getComputedStyle(document.documentElement).getPropertyValue('--kf-ui-scale')) || 1,
    }
  }, srcSel)
const inside = (p, r) => !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
async function ghostChecks(name, page, srcSel, src, title, len, over) {
  for (const where of over) {
    const to = where === 'rail' ? { x: src.x + 40, y: src.y + 70 } : await slotPoint(page, '10:00')
    let g
    await mouseDrag(page, src, to, async () => {
      g = await ghostInfo(page, srcSel)
      await shot(page, `${name}-over-${where}`)
    })
    check(`${name} over the ${where}: one lifted copy (no second ghost)`, g.count === 1, g.count)
    check(`${name} over the ${where}: a card — filled, rounded, shadowed, edged`, (g.bg !== 'rgba(0, 0, 0, 0)' || g.bgImage !== 'none') && parseFloat(g.radius) > 0 && g.shadow !== 'none' && g.border === 'solid', JSON.stringify([g.bg, g.bgImage, g.radius, g.shadow, g.border]))
    check(`${name} over the ${where}: the pointer is on it (no zoom offset)`, inside(to, g.rect), JSON.stringify([to, g.rect]))
    check(`${name} over the ${where}: compact — at most 200px (at 100%), never the full row`, g.rect && g.rect.width <= 200 * g.scale + 1 && (g.rect.width < g.srcRect.width || g.srcRect.width <= 200 * g.scale), JSON.stringify([g.rect?.width, g.srcRect?.width, g.scale]))
    check(`${name} over the ${where}: the title and "${len}", no checkbox or buttons`, g.shown.includes(title) && g.shown.includes(len) && g.controls === 0, `${g.shown} / ${g.controls}`)
    check(`${name} over the ${where}: the row's place is a quiet dashed outline, not lifted in place`, g.srcLifted && (g.srcOutline === 'dashed' || g.srcBorder === 'dashed') && g.srcTransform === 'none', JSON.stringify([g.srcLifted, g.srcOutline, g.srcBorder, g.srcTransform]))
    if (where === 'grid') check(`${name} over the grid: FullCalendar's placeholder shows where it lands`, g.placeholder)
  }
}
if (want('g1')) {
  for (const theme of ['day', 'night']) {
    for (const scale of [1.25, 1.5]) {
      const name = `g1-rail-${theme}-${scale * 100}`
      const { ctx, page, errors } = await open('/calendar', { theme, scale })
      const sel = `.cal-rail .unscheduled-task[data-task-id="${id(EMAIL)}"]`
      await ghostChecks(name, page, sel, center(await page.locator(sel).boundingBox()), "Kai's Flow email", '20m', ['rail', 'grid'])
      check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}
// The day tray's rows, planning mode's cards and a held slot task lift the same card.
if (want('g2')) {
  {
    const { ctx, page, errors } = await open('/calendar', { scale: 1.25 })
    const sel = `.cal-tray .unscheduled-task[data-task-id="${id(STRETCH)}"]`
    await ghostChecks('g2-tray', page, sel, center(await page.locator(sel).boundingBox()), 'Stretch', '15m', ['grid'])
    check('g2-tray no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/calendar', { scale: 1.25 })
    await enterPlanning(page)
    const sel = `.cal-plan .unscheduled-task[data-task-id="${id(EMAIL)}"]`
    const b = await page.locator(sel).boundingBox()
    await ghostChecks('g2-plan', page, sel, { x: b.x + 60, y: b.y + 14 }, "Kai's Flow email", '20m', ['grid'])
    check('g2-plan no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/calendar', { scale: 1.25 })
    await slotPoint(page, '13:30')
    const sel = `.kf-ev-slot-row[data-slot-task="${id(REPLY)}"]`
    const b = await page.locator(sel).boundingBox()
    let g
    const to = { x: b.x + b.width / 2 + 120, y: b.y - 60 }
    await mouseDrag(page, { x: b.x + b.width * 0.45, y: b.y + b.height / 2 }, to, async () => {
      g = await ghostInfo(page, sel)
      await shot(page, 'g2-held-drag')
    })
    check('g2-held a held task lifts the same card, with its length (Kai\'s slot-outline A)', g.count === 1 && inside(to, g.rect) && g.shown.includes('Reply to Omar') && g.shown.includes('15m') && g.shadow !== 'none', JSON.stringify([g.count, g.rect, g.shown]))
    check('g2-held no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ A: a block's checkbox sits on its title's first line ═══
/** Vertical centres of the check and of the title's first line, inside `sel` (the first match). */
const checkVsTitle = (page, sel, checkSel, titleSel) =>
  page.evaluate(([sel, checkSel, titleSel]) => {
    const host = document.querySelector(sel)
    const c = host?.querySelector(checkSel)?.getBoundingClientRect()
    const t = host?.querySelector(titleSel)
    if (!c || !t) return null
    const r = document.createRange()
    r.selectNodeContents(t)
    const line = [...r.getClientRects()].filter((x) => x.height > 0)[0]
    return { check: c.top + c.height / 2, line: line.top + line.height / 2, ch: c.height, lh: line.height }
  }, [sel, checkSel, titleSel])
if (want('a1')) {
  for (const theme of ['day', 'night']) {
    for (const scale of [1, 1.25, 1.5]) {
      const tag = `a1-${theme}-${scale * 100}`
      const { ctx, page, errors } = await open('/calendar', { theme, scale })
      for (const [n, what] of [[LONGB, '30m task block'], [DEEPB, '1h task block (wraps)']]) {
        await slotPoint(page, n === LONGB ? '16:00' : '17:00')
        const m = await checkVsTitle(page, `.fc-event[data-kf-id="${eid(n)}"]`, '.kf-ev-check', '.fc-event-title')
        check(`${tag} ${what}: the check sits on the title's first line`, m && Math.abs(m.check - m.line) <= 1.5, JSON.stringify(m))
      }
      await slotPoint(page, '13:30')
      const h = await checkVsTitle(page, `.kf-ev-slot-row[data-slot-task="${id(REPLY)}"]`, '.kf-ev-check', '.kf-ev-slot-title')
      check(`${tag} a held slot row: the check sits on its title's line`, h && Math.abs(h.check - h.line) <= 1.5, JSON.stringify(h))
      if (scale === 1.25) {
        await slotPoint(page, '16:30')
        await fcBlock(page, DEEPB).hover()
        await sleep(300)
        await shot(page, `a1-checks-${theme}`)
      }
      check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}
if (want('a2')) {
  for (const theme of ['day', 'night']) {
    for (const scale of [1, 1.25, 1.5]) {
      const tag = `a2-phone-${theme}-${scale * 100}`
      const { ctx, page, errors } = await open('/calendar', { view: phone, theme, scale })
      for (const [n, what, min] of [[LONGB, '30m task block', 16 * 60], [DEEPB, '1h task block', 17 * 60]]) {
        await scrollPhone(page, min)
        const m = await checkVsTitle(page, `.pc-block[data-id="${eid(n)}"]`, '.pc-check', '.pc-name')
        check(`${tag} ${what}: the check sits on the title's first line`, m && Math.abs(m.check - m.line) <= 1.5, JSON.stringify(m))
      }
      await scrollPhone(page, 13 * 60 + 30)
      const h = await checkVsTitle(page, `.pc-slot-row[data-slot-task="${id(REPLY)}"]`, '.pc-check', '.pc-name')
      check(`${tag} a held slot row: the check sits on its title's line`, h && Math.abs(h.check - h.line) <= 1.5, JSON.stringify(h))
      if (scale === 1) {
        await scrollPhone(page, 16 * 60 + 30)
        await shot(page, `a2-phone-checks-${theme}`)
      }
      check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// ═══ B: one clock — 12-hour by default, every surface; the 24-hour switch flips them all ═══
/** Visible text that can only be a 24-hour time (13:00–23:59) — a leak on the 12-hour clock. */
const leaks = (page) => page.evaluate(() => [...new Set((document.body.innerText.match(/(?<![\d:])(1[3-9]|2[0-3]):[0-5]\d(?!\s?[AP]M)/g) ?? []))])
if (want('b1')) {
  {
    const { ctx, page, errors, state } = await open('/calendar', { clock12: true })
    await slotPoint(page, '12:00')
    check('b1 calendar (12h): the gutter and block times read 12 PM / 12:00 PM', /12 PM/.test(await page.locator('.fc-timegrid-slot-label').allInnerTexts().then((x) => x.join(' '))) && /12:00 PM/.test(await fcBlock(page, STANDUP).innerText()), await fcBlock(page, STANDUP).innerText())
    check('b1 calendar (12h): no 24-hour time anywhere on the page', (await leaks(page)).length === 0, JSON.stringify(await leaks(page)))
    await slotPoint(page, '16:00')
    await fcBlock(page, LONGB).click()
    await sleep(500)
    const menu = await page.locator('[role="menu"]').last().innerText()
    check('b1 the block popover: "4:00–4:30 PM"', /4:00–4:30 PM/.test(menu), menu.replace(/\n/g, ' | '))
    check('b1 …and no 24-hour time in it', (await leaks(page)).length === 0, JSON.stringify(await leaks(page)))
    await lenChip(page, '15m').click()
    check('b1 the resize toast: "Resized to 4:00–4:15 PM"', await toastSoon(page, 'Resized to 4:00–4:15 PM'))
    await page.keyboard.press('Escape')
    await sleep(300)
    await page.locator('.cal-head button[aria-haspopup="dialog"]').click()
    await sleep(300)
    await shot(page, 'b1-viewoptions-12h')
    await page.getByRole('switch', { name: '24-hour time' }).click()
    await sleep(500)
    await page.keyboard.press('Escape')
    await sleep(300)
    await slotPoint(page, '12:00')
    check('b1 View options ▸ 24-hour time: the blocks read 12:00', /12:00(?! PM)/.test(await fcBlock(page, STANDUP).innerText()), await fcBlock(page, STANDUP).innerText())
    for (const route of ['/today', '/tasks']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
      await sleep(1200)
      check(`b1 …and ${route} follows it (24-hour times show)`, (await leaks(page)).length > 0 || !/[AP]M/.test(await page.locator('body').innerText()), JSON.stringify(await leaks(page)))
    }
    check('b1 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  for (const route of ['/today', '/tasks', '/inbox']) {
    const { ctx, page, errors } = await open(route, { clock12: true })
    await shot(page, `b1-${route.slice(1)}-12h`)
    check(`b1 ${route} (12h): no 24-hour time on the page`, (await leaks(page)).length === 0, JSON.stringify(await leaks(page)))
    check(`b1 ${route} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/settings', { clock12: true })
    const row = page.getByRole('group', { name: 'Time format' })
    check('b1 Settings ▸ Appearance has "Time format" 12-hour (picked) · 24-hour', (await row.getByRole('button', { name: '12-hour' }).getAttribute('aria-pressed')) === 'true')
    await row.getByRole('button', { name: '24-hour' }).click()
    await sleep(300)
    await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
    await sleep(1200)
    await slotPoint(page, '16:00')
    check('b1 Settings ▸ 24-hour: the calendar reads 16:00', /16:00(?! PM)/.test(await fcBlock(page, LONGB).innerText()), await fcBlock(page, LONGB).innerText())
    check('b1 settings no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/calendar', { view: phone, clock12: true })
    await scrollPhone(page, 16 * 60)
    const gutter = await page.locator('.pc-hour span').allInnerTexts()
    check('b1 phone (12h): the gutter reads 9 AM … 4 PM', gutter.includes('9 AM') && gutter.includes('4 PM'), gutter.slice(0, 6).join(','))
    check('b1 phone (12h): a block reads 4:00–4:30 PM', /4:00–4:30 PM/.test(await pcBlock(page, LONGB).innerText()), await pcBlock(page, LONGB).innerText())
    check('b1 phone (12h): no 24-hour time on screen', (await leaks(page)).length === 0, JSON.stringify(await leaks(page)))
    await shot(page, 'b1-phone-12h')
    check('b1 phone no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ C: the ⋮ between the panes only resizes; planning mode by name ═══
async function enterPlanning(page) {
  await page.locator('.cal-head button[aria-haspopup="dialog"]').click()
  await sleep(300)
  await page.getByRole('switch', { name: 'Planning mode' }).click()
  await sleep(800)
}
if (want('c1')) {
  const { ctx, page, errors } = await open()
  const split = page.locator('.cal-railsplit')
  const railW = () => page.locator('.cal-rail').evaluate((e) => Math.round(e.getBoundingClientRect().width))
  const w0 = await railW()
  const grip = await split.locator('.cal-plan-handle').boundingBox()
  await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await sleep(600)
  check('c1 a click on the ⋮ does nothing — no planning mode, same width', (await page.locator('.cal-plan').count()) === 0 && (await page.locator('.cal-head').count()) === 1 && (await railW()) === w0, `${w0} → ${await railW()}`)
  const g = center(await split.boundingBox())
  await mouseDrag(page, { x: g.x, y: grip.y + grip.height / 2 }, { x: g.x + 520, y: grip.y + grip.height / 2 })
  check('c1 dragged far right (past 60%): it only widens the rail, no planning mode', (await page.locator('.cal-plan').count()) === 0 && (await railW()) > w0 + 100, `${w0} → ${await railW()}`)
  const g2 = center(await split.boundingBox())
  await page.mouse.dblclick(g2.x, grip.y + grip.height / 2 + 60)
  await sleep(500)
  check('c1 double-click resets the width', Math.abs((await railW()) - w0) <= 2, `${await railW()} vs ${w0}`)
  await enterPlanning(page)
  check('c1 View options ▸ Planning mode opens it, by name', (await page.locator('.cal-plan').count()) === 1)
  await shot(page, 'c1-planning')
  await page.getByRole('button', { name: 'Leave planning mode' }).click()
  await sleep(800)
  check('c1 "Leave planning mode" brings the grid back', (await page.locator('.cal-plan').count()) === 0 && (await page.locator('.cal-head').count()) === 1)
  check('c1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ No empty-title task ═══
if (want('e1')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  // Ctrl-click (a task there) and the rail's "Quick add task…": Enter / Create with no title.
  const p = await slotPoint(page, '15:00')
  await page.keyboard.down('Control')
  await page.mouse.click(p.x, p.y + 4)
  await page.keyboard.up('Control')
  await sleep(500)
  const qc = page.locator('.kf-quickcreate')
  check('e1 Ctrl-click opens quick create on Task', (await qc.count()) === 1 && (await qc.locator('button[aria-pressed="true"], [role="radio"][aria-checked="true"]').first().innerText().catch(() => '')).trim() === 'Task', await qc.locator('button[aria-pressed="true"], [role="radio"][aria-checked="true"]').first().innerText().catch(() => ''))
  await qc.getByLabel('Title').press('Enter')
  await sleep(300)
  check('e1 Enter with no title: nothing made, the popover stays', (await qc.count()) === 1 && posts(state, 'tasks', w0).length === 0, JSON.stringify(state.writes.slice(w0).map((w) => w.table + ':' + (w.body?.title ?? ''))))
  check('e1 …Create is disabled until there is a title', await qc.getByRole('button', { name: /^Create/ }).isDisabled())
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.locator('.cal-rail-extra').click()
  await sleep(400)
  await page.locator('.kf-quickcreate').getByLabel('Title').press('Enter')
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(400)
  await settle(state)
  const made = posts(state, 'tasks', w0)
  check('e1 the rail\'s Quick add: Enter, then Esc — no task at all ("Untitled task" never made)', made.length === 0, JSON.stringify(made.map((t) => t.title)))
  await page.locator('.cal-rail-extra').click()
  await sleep(400)
  await page.locator('.kf-quickcreate').getByLabel('Title').fill('Buy stamps')
  await page.locator('.kf-quickcreate').getByLabel('Title').press('Enter')
  await settle(state)
  check('e1 …with a title it is made as before', posts(state, 'tasks', w0).some((t) => t.title === 'Buy stamps'))
  check('e1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('e2')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  await scrollPhone(page, 15 * 60)
  await tapAt(cdp, { x: 200, y: (await yOf(page, '15:00')) + 8 })
  const d = dialog(page)
  const w0 = state.writes.length
  await d.locator('.pc-qc-title').press('Enter')
  await sleep(300)
  check('e2 phone quick create: Save disabled and Enter makes nothing with no title', (await d.getByRole('button', { name: 'Save' }).isDisabled()) && posts(state, 'tasks', w0).length === 0)
  check('e2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
