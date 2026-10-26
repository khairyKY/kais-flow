// typing (queue items 15 + 16, Kai 2026-10-23) on the REAL app against a MOCKED backend (the bugs-1023 recipe:
// dev server in --mode mock, a made-up session in localStorage, Playwright answers every REST call; writes
// are recorded AND applied to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=t1,p1 runs a subset)
// 16 — a typed field wherever a time, length or range is chosen; it echoes what it read, Enter applies,
//      nonsense explains itself, the pickers stay:
//   t1 the desktop block popover (12h) · t2 its Time ▸ panel · t3 the task popover's Duration list and
//   Plan ▸ Pick date & time · t4 the task editor · t5 desktop quick create · t6 the 24-hour clock ·
//   p1–p4 the phone: task sheet (on / off the calendar), block sheet, quick create (and its Time sheet).
// 15 — one length control per surface: the block popover's chips (no Duration submenu, no chips in Time ▸),
//      the phone task sheet (no ⏱ chip while on the calendar; the chip is the estimate off it), the Time
//      sheets under a surface that has its own chips.
// The day: Friday 23 Oct 2026, Cairo (UTC+3), the clock at 12:00; day and night.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5313'
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
const DAY = 23
const DATE = '2026-10-23'
const cairo = (hhmm, day = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '12:00'
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const PRE = 1, LONG = 2, STALE = 3, LOOSE = 4, HELD = 5
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const PREB = 1, LONGB = 2, STALEB = 3, STANDUP = 4, GYM = 5
const TASKS = [
  // Kai's phone screenshot (queue item 15): a 15-minute block 5:15–5:30 PM, the task due 5:30 PM (the block's end).
  task(PRE, 'Pre workout', { duration_min: 15, due_at: iso('17:30'), scheduled_start: iso('17:15'), scheduled_end: iso('17:30') }),
  task(LONG, 'Write the report', { duration_min: 30, due_at: iso('14:00'), scheduled_start: iso('14:00'), scheduled_end: iso('14:30') }),
  // Out of step from an older app: a 45-minute block, a 30-minute estimate.
  task(STALE, 'Read the paper', { duration_min: 30, due_at: iso('15:00'), scheduled_start: iso('15:00'), scheduled_end: iso('15:45') }),
  task(LOOSE, 'Call mum', { duration_min: 20, due_at: iso('09:00') }),
  task(HELD, 'Stretch', { duration_min: 20, slot_id: eid(GYM), slot_date: DATE, scheduled_start: iso('18:00'), scheduled_end: iso('19:00') }),
]
const EVENTS = [
  ev(PREB, 'Pre workout', '17:15', '17:30', PRE),
  ev(LONGB, 'Write the report', '14:00', '14:30', LONG),
  ev(STALEB, 'Read the paper', '15:00', '15:45', STALE),
  ev(STANDUP, 'Standup', '13:00', '13:30'),
  ev(GYM, 'Gym', '18:00', '19:00', null, 'time_block'),
]
const inboxItem = (n, raw, over = {}) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00'), ...over,
})
const INBOX = [inboxItem(1, 'buy printer ink'), inboxItem(2, 'Call the bank about the card', { kind: 'voice', created_at: iso('09:00') })]
const cid = (n) => `c0000000-0000-4000-8000-00000000000${n}`
const READY = () => ({
  id: cid(1), user_id: UID, storage_paths: [`${UID}/${cid(1)}/0.jpg`], pages: 1, pages_read: 1, status: 'done', error: null, title: 'Monday notes',
  items: [{ text: 'Assignment 2 due Thu', type: 'task', when: null, project: null, confidence: 0.9, priority: null, box: [0.1, 0.1, 0.8, 0.1], page: 0 }, { text: 'buy blue pens', type: 'task', when: null, project: null, confidence: 0.9, priority: null, box: [0.1, 0.3, 0.8, 0.1], page: 0 }],
  drawings: [], reviewed_at: null, expires_at: '2026-10-30T06:40:00Z', photos_deleted_at: null, created_at: iso('07:40'), updated_at: iso('07:45'),
})
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar', 'hint:inbox', 'hint:today', 'hint:tasks'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, scale, uid, now, collapsed, h24]) => {
    if (h24) localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, inbox: false, lists: true }))
    localStorage.setItem('kf.sidebarCollapsed', collapsed ? '1' : '0')
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [o.theme ?? 'day', JSON.stringify(session), o.scale ? String(o.scale) : null, UID, cairo(NOW).getTime(), !!o.collapsed, !!o.h24])
  const state = { rows: structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: o.inbox ?? [], captures: o.captures ?? [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] }), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') {
      const body = req.postDataJSON()
      const paths = body.paths ?? [p.replace(/^\/storage\/v1\/object\/sign\/[^/]+\//, '')]
      const signed = paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/captures/${x}?token=t` }))
      return r.fulfill({ json: body.paths ? signed : { signedURL: signed[0].signedURL } })
    }
    if (p.startsWith('/storage/v1/object/sign/')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    if (p.startsWith('/storage/v1/') || p.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = p.replace('/rest/v1/', '')
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
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (table === 'ai_usage') return one ? r.fulfill({ json: { count: 0 } }) : r.fulfill({ json: [{ count: 0 }] })
    let rows = state.rows[table] ?? []
    if (table === 'captures' && url.searchParams.get('reviewed_at') === 'is.null') rows = rows.filter((c) => !c.reviewed_at)
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
const flat = (s) => s.replace(/\s+/g, ' ').trim()
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const last = (state, table, rowId, from = 0) => posts(state, table, from).filter((x) => x.id === rowId).at(-1)
const row = (state, table, rowId) => state.rows[table].find((x) => x.id === rowId)
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const mins = (e) => Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000)
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]`).first()
const menuItem = (page, label) => page.locator('[role="menu"] [role="menuitem"]', { hasText: label }).first()
const lengthRow = (page) => page.locator('[aria-label="Length"]').last()
const chipRe = (label) => new RegExp(`^\\s*${label}\\s*$`)
const lenChip = (page, label) => lengthRow(page).locator('button', { hasText: chipRe(label) })
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click()
/** The block, the task's schedule and its estimate in one line: [start, end, block minutes, duration_min, due]. */
function trio(state, taskN, blockN) {
  const b = row(state, 'calendar_events', eid(blockN))
  const t = row(state, 'tasks', id(taskN))
  return { b: [b.starts_at, b.ends_at, mins(b)], t: [t.scheduled_start, t.scheduled_end, t.duration_min], due: t.due_at }
}
const inStep = (s, from, to, m, taskN, blockN) => {
  const x = trio(s, taskN, blockN)
  return JSON.stringify(x.b) === JSON.stringify([iso(from), iso(to), m]) && JSON.stringify(x.t) === JSON.stringify([iso(from), iso(to), m])
}
const show = (s, taskN, blockN) => JSON.stringify(trio(s, taskN, blockN))

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
/** Is `loc`'s middle (and four points around it) the element itself to a pointer — nothing over it? */
const hitClean = (loc) =>
  loc.first().evaluate((e) => {
    const r = e.getBoundingClientRect()
    return [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]].map(([fx, fy]) => {
      const h = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)
      return h === e || e.contains(h) ? 'ok' : `${h?.tagName}.${String(h?.className).slice(0, 50)}`
    })
  })
const allOk = (pts) => pts.every((p) => p === 'ok')
const captureOpen = (page) => page.locator('#kf-capture-input').waitFor({ timeout: 4000 }).then(() => page.evaluate(() => document.activeElement?.id === 'kf-capture-input'), () => false)

const typedIn = (scope, label = 'Type a time or length') => scope.getByLabel(label, { exact: true }).first()
const echoOf = async (scope) => flat(await text(scope.locator('.kf-pk-typed output')))
async function typeIn(field, s) {
  await field.fill('')
  await field.fill(s)
  await sleep(150)
}
const blockMenu = (page) => page.locator('[role="menu"][aria-label="Block details"]')
async function openBlock(page, n, hhmm) {
  await slotPoint(page, hhmm)
  await fcBlock(page, n).click()
  await sleep(500)
  return blockMenu(page)
}
const isLength = (c) => /^(\d+m|\d+h(\d\d)?)$/.test(c)

// ═══ Desktop ═══

// T1 — the block popover: ONE length control (the chips) and the typed field above it.
if (want('t1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    const menu = await openBlock(page, PREB, '17:00')
    check(`t1-${theme} the popover has one length control (one Length row)`, (await menu.locator('[aria-label="Length"]').count()) === 1, await menu.locator('[aria-label="Length"]').count())
    const f = typedIn(menu)
    await typeIn(f, '7–8:30')
    check(`t1-${theme} "7–8:30" echoes 7:00–8:30 PM · 1h30 (the half of the day nearest the 5:15 PM block)`, (await echoOf(menu)) === '7:00–8:30 PM · 1h30', await echoOf(menu))
    await shot(page, `t1-popover-typed-${theme}`)
    await typeIn(f, 'banana')
    const why = await echoOf(menu)
    check(`t1-${theme} nonsense explains itself and is marked invalid`, /Didn't catch “banana”/.test(why) && (await f.getAttribute('aria-invalid')) === 'true', why)
    await shot(page, `t1-popover-why-${theme}`)
    if (theme === 'day') {
      const w0 = state.writes.length
      await f.press('Enter')
      await sleep(400)
      check('t1 Enter on nonsense writes nothing', state.writes.length === w0, state.writes.length - w0)
      await typeIn(f, '7–8:30')
      await f.press('Enter')
      await settle(state)
      check("t1 Enter → the block 7:00–8:30 PM, the task's schedule + estimate in step", inStep(state, '19:00', '20:30', 90, PRE, PREB), show(state, PRE, PREB))
      check('t1 …with an Undo toast', await toastSoon(page, 'Moved'))
      await typeIn(f, '50m')
      check("t1 \"50m\" echoes the block's new start: 7:00–7:50 PM · 50m", (await echoOf(menu)) === '7:00–7:50 PM · 50m', await echoOf(menu))
      await f.press('Enter')
      await settle(state)
      check('t1 "50m" + Enter → 7:00–7:50 PM, estimate 50', inStep(state, '19:00', '19:50', 50, PRE, PREB), show(state, PRE, PREB))
      await typeIn(f, 'in 2h')
      check('t1 "in 2h" → 2:00–2:50 PM (now 12:00)', (await echoOf(menu)) === '2:00–2:50 PM · 50m', await echoOf(menu))
      await typeIn(f, 'noon')
      check('t1 "noon" → 12:00–12:50 PM · 50m', (await echoOf(menu)) === '12:00–12:50 PM · 50m', await echoOf(menu))
      await typeIn(f, '1h20')
      check('t1 "1h20" → 7:00–8:20 PM · 1h20', (await echoOf(menu)) === '7:00–8:20 PM · 1h20', await echoOf(menu))
      await typeIn(f, '7:10 pm')
      check('t1 "7:10 pm" → 7:10–8:00 PM · 50m', (await echoOf(menu)) === '7:10–8:00 PM · 50m', await echoOf(menu))
      check('t1 the length chips are still there (the picker stays)', (await menu.locator('[aria-label="Length"] button').count()) === 6)
    }
    check(`t1-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// T2 — Time ▸ is the start: the panel opens at once (no Duration submenu), no chips of its own; typed works.
if (want('t2')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    const menu = await openBlock(page, PREB, '17:00')
    await menu.locator('[role="menuitem"]', { hasText: /\d:\d\d/ }).first().click()
    await sleep(500)
    const pop = page.locator('.kf-pk-pop').last()
    check(`t2-${theme} Time ▸ opens the time panel straight away — no Duration list (Quick · Short · Standard · Deep)`, (await pop.count()) === 1 && (await page.locator('[role="menu"][aria-label="Duration"]').count()) === 0 && (await page.getByText('Standard', { exact: true }).count()) === 0)
    check(`t2-${theme} …and no length chips in it (the popover's chips are the length)`, (await pop.locator('[aria-label="Length"]').count()) === 0 && !/Duration/.test(await text(pop)))
    const f = typedIn(pop)
    await typeIn(f, '4pm')
    check(`t2-${theme} "4pm" echoes 4:00–4:15 PM · 15m`, (await echoOf(pop)) === '4:00–4:15 PM · 15m', await echoOf(pop))
    await shot(page, `t2-time-panel-${theme}`)
    if (theme === 'day') {
      await f.press('Enter')
      await settle(state)
      check('t2 Enter → the block 4:00–4:15 PM (length kept) and the panel closes', inStep(state, '16:00', '16:15', 15, PRE, PREB) && (await page.locator('.kf-pk-pop').count()) === 0, show(state, PRE, PREB))
    }
    check(`t2-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// T3 — the task popover: one length chip (the block's); its Duration list takes "1h20"; Plan ▸ Pick date
// & time ▸ Set time takes a range for a task with no block.
if (want('t3')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
    const r = page.locator(`#task-${id(PRE)}`)
    await r.scrollIntoViewIfNeeded()
    await r.getByText('Pre workout', { exact: true }).first().click()
    await sleep(600)
    const pop = page.locator('.tp-pop')
    const chips = (await pop.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
    check(`t3-${theme} the popover keeps one length chip (15m — the block's)`, chips.filter(isLength).length === 1 && chips[1] === '15m', JSON.stringify(chips))
    await pop.locator('.ts-chips .kf-chip', { hasText: chipRe('15m') }).click()
    await sleep(300)
    const dm = page.locator('[role="menu"]').last()
    const f = typedIn(dm, 'Type a length')
    await typeIn(f, '1h20')
    check(`t3-${theme} the Duration list's typed field echoes 1h20`, (await echoOf(dm)) === '1h20', await echoOf(dm))
    await shot(page, `t3-duration-typed-${theme}`)
    if (theme === 'day') {
      await f.press('Enter')
      await settle(state)
      check('t3 "1h20" + Enter → the block 5:15–6:35 PM, estimate 80', inStep(state, '17:15', '18:35', 80, PRE, PREB), show(state, PRE, PREB))
      await page.keyboard.press('Escape')
      await sleep(300)
      const r2 = page.locator(`#task-${id(LOOSE)}`)
      await r2.scrollIntoViewIfNeeded()
      await r2.getByText('Call mum', { exact: true }).first().click()
      await sleep(600)
      await page.locator('.tp-pop .ts-chips .kf-chip').first().click()
      await sleep(400)
      await page.getByRole('button', { name: /Pick date & time/ }).first().click()
      await sleep(400)
      await page.getByRole('button', { name: 'Set time' }).click()
      await sleep(400)
      const tp = page.locator('.kf-pk-pop').last()
      check('t3 Pick date & time ▸ Set time: a typed field, no length chips', (await typedIn(tp).count()) === 1 && (await tp.locator('[aria-label="Length"]').count()) === 0)
      await typeIn(typedIn(tp), '7-8:30pm')
      check('t3 "7-8:30pm" echoes 7:00–8:30 PM · 1h30', (await echoOf(tp)) === '7:00–8:30 PM · 1h30', await echoOf(tp))
      await shot(page, 't3-plan-typed')
      const w0 = state.writes.length
      await typedIn(tp).press('Enter')
      await settle(state)
      const b = posts(state, 'calendar_events', w0).find((e) => e.task_id === id(LOOSE))
      const t = row(state, 'tasks', id(LOOSE))
      check('t3 Enter → "Call mum" gets its block 7:00–8:30 PM; estimate 90 in step', b && b.starts_at === iso('19:00') && mins(b) === 90 && t.duration_min === 90 && t.scheduled_start === iso('19:00'), JSON.stringify(b && [b.starts_at, mins(b), t.duration_min]))
    }
    check(`t3-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// T4 — the task editor's Schedule card: a range places the block, a length is the length.
if (want('t4')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open(`/tasks/${id(PRE)}`, { theme })
    const f = typedIn(page)
    await typeIn(f, '7:10pm-8:30')
    check(`t4-${theme} the editor echoes 7:10–8:30 PM · 1h20`, (await echoOf(page)) === '7:10–8:30 PM · 1h20', await echoOf(page))
    await shot(page, `t4-editor-typed-${theme}`)
    if (theme === 'day') {
      await f.press('Enter')
      await settle(state)
      check('t4 Enter → the block 7:10–8:30 PM, estimate 80', inStep(state, '19:10', '20:30', 80, PRE, PREB), show(state, PRE, PREB))
      const line = flat(await text(page.getByText(/^Block ·/)))
      check('t4 …the Block line reads it', /7:10\s*–\s*8:30\s*PM/.test(line), line)
      await typeIn(f, '45m')
      await f.press('Enter')
      await settle(state)
      check('t4 "45m" → 7:10–7:55 PM, estimate 45', inStep(state, '19:10', '19:55', 45, PRE, PREB), show(state, PRE, PREB))
    }
    check(`t4-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// T5 — desktop quick create: typed beside the time fields and chips; Save writes what it set.
if (want('t5')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    const p = await slotPoint(page, '20:00')
    await page.mouse.click(p.x, p.y + 4)
    await sleep(500)
    const qc = page.locator('.kf-quickcreate')
    const f = typedIn(qc)
    await typeIn(f, '7–8:30')
    check(`t5-${theme} quick create echoes 7:00–8:30 PM · 1h30 (nearest the 8 PM slot)`, (await echoOf(qc)) === '7:00–8:30 PM · 1h30', await echoOf(qc))
    await f.press('Enter')
    await sleep(300)
    const times = await qc.locator('input[aria-label="Time"]').evaluateAll((els) => els.map((e) => e.value))
    check(`t5-${theme} Enter sets the fields: 7:00 PM – 8:30 PM; the 1h30 chip lit`, times[0] === '7:00 PM' && times[1] === '8:30 PM' && (await lenChip(page, '1h30').getAttribute('aria-pressed')) === 'true', JSON.stringify(times))
    await shot(page, `t5-quickcreate-${theme}`)
    if (theme === 'day') {
      await qc.locator('button', { hasText: /^Task$/ }).first().click()
      await qc.getByLabel('Title').fill('Floss teeth')
      const w0 = state.writes.length
      await qc.getByLabel('Title').press('Enter')
      await settle(state)
      const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Floss teeth')
      const t = posts(state, 'tasks', w0).filter((x) => x.title === 'Floss teeth').at(-1)
      check('t5 Save → "Floss teeth" 7:00–8:30 PM, estimate 90', e && e.starts_at === iso('19:00') && mins(e) === 90 && t?.duration_min === 90, JSON.stringify([e && [e.starts_at, mins(e)], t?.duration_min]))
    }
    check(`t5-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// T6 — the 24-hour clock: a bare hour is as typed, the echo reads 24-hour.
if (want('t6')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme, h24: true })
    const menu = await openBlock(page, PREB, '17:00')
    const f = typedIn(menu)
    await typeIn(f, '7-8:30')
    check(`t6-${theme} 24h: "7-8:30" echoes 07:00–08:30 · 1h30 (not the evening)`, (await echoOf(menu)) === '07:00–08:30 · 1h30', await echoOf(menu))
    await typeIn(f, '19:10-20')
    check(`t6-${theme} 24h: "19:10-20" echoes 19:10–20:00 · 50m`, (await echoOf(menu)) === '19:10–20:00 · 50m', await echoOf(menu))
    await shot(page, `t6-24h-${theme}`)
    if (theme === 'day') {
      await f.press('Enter')
      await settle(state)
      check('t6 Enter → 19:10–20:00, estimate 50', inStep(state, '19:10', '20:00', 50, PRE, PREB), show(state, PRE, PREB))
      await typeIn(f, '22-1')
      check('t6 24h: "22-1" says it ends before it starts', (await echoOf(menu)) === 'It ends before it starts', await echoOf(menu))
    }
    check(`t6-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ Phone ═══

// P1 — the task sheet ON the calendar: no ⏱ chip (the card's chips are the length); Change time's sheet has
// no chips but takes a typed time; Enter applies and closes. 12h and 24h.
if (want('p1')) {
  for (const [theme, h24] of [['day', false], ['night', false], ['day', true]]) {
    const tag = `${theme}${h24 ? '-24h' : ''}`
    const { ctx, page, cdp, errors, state } = await open(`/tasks?list=all&task=${id(PRE)}`, { view: phone, theme, h24 })
    const sheet = page.locator('[role="dialog"]').last()
    const chips = (await sheet.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
    check(`p1-${tag} on the calendar: the chip row has no ⏱ length chip; the date chip is the block's start`, !chips.some(isLength) && chips[0] === (h24 ? 'Today · 17:15' : 'Today · 5:15 PM'), JSON.stringify(chips))
    check(`p1-${tag} …one length control: the card's Length row`, (await sheet.locator('[aria-label="Length"]').count()) === 1)
    await shot(page, `p1-sheet-${tag}`)
    await tap(cdp, sheet.getByRole('button', { name: 'Change time' }))
    await sleep(500)
    const ts = page.locator('[role="dialog"]').last()
    check(`p1-${tag} Change time's sheet: a typed field, no length chips of its own`, (await typedIn(ts).count()) === 1 && (await ts.locator('[aria-label="Length"]').count()) === 0)
    const typed = h24 ? '18' : '6pm'
    const want1 = h24 ? '18:00–18:15 · 15m' : '6:00–6:15 PM · 15m'
    await typeIn(typedIn(ts), typed)
    check(`p1-${tag} "${typed}" echoes ${want1}`, (await echoOf(ts)) === want1, await echoOf(ts))
    await shot(page, `p1-timesheet-${tag}`)
    if (theme === 'day') {
      await typedIn(ts).press('Enter')
      await settle(state)
      await sleep(400)
      check(`p1-${tag} Enter → the block 6:00–6:15 PM and the Time sheet closes`, inStep(state, '18:00', '18:15', 15, PRE, PREB) && (await page.locator('.kf-pk-typed').count()) === 0, show(state, PRE, PREB))
    }
    check(`p1-${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// P2 — the task sheet OFF the calendar: the ⏱ chip is the estimate; its Duration sheet takes "1:45".
if (want('p2')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open(`/tasks?list=all&task=${id(LOOSE)}`, { view: phone, theme })
    const sheet = page.locator('[role="dialog"]').last()
    const chips = (await sheet.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
    check(`p2-${theme} off the calendar: the ⏱ chip stays as the estimate (20m), no Length row`, chips.filter(isLength).length === 1 && chips[1] === '20m' && (await sheet.locator('[aria-label="Length"]').count()) === 0, JSON.stringify(chips))
    await tap(cdp, sheet.locator('.ts-chips .kf-chip', { hasText: chipRe('20m') }))
    await sleep(500)
    const ds = page.locator('[role="dialog"]').last()
    const f = typedIn(ds, 'Type a length')
    await typeIn(f, '1:45')
    check(`p2-${theme} the Duration sheet's typed field: "1:45" echoes 1h45`, (await echoOf(ds)) === '1h45', await echoOf(ds))
    await shot(page, `p2-duration-${theme}`)
    if (theme === 'day') {
      await f.press('Enter')
      await settle(state)
      check('p2 Enter → the estimate 105, no block made', row(state, 'tasks', id(LOOSE)).duration_min === 105 && !state.rows.calendar_events.some((e) => e.task_id === id(LOOSE)), row(state, 'tasks', id(LOOSE)).duration_min)
    }
    check(`p2-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// P3 — the block sheet (Standup): one Length row; the Time row's sheet has no chips, takes "2-3:30".
if (want('p3')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone, theme })
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = (13 * 60 * 64) / 60 - 200))
    await sleep(300)
    await tap(cdp, page.locator(`.pc-block[data-id="${eid(STANDUP)}"] .pc-name`).first())
    await sleep(500)
    const d = page.locator('[role="dialog"]').last()
    check(`p3-${theme} the block sheet has one Length row`, (await d.locator('[aria-label="Length"]').count()) === 1)
    await tap(cdp, d.locator('.kf-as-row', { hasText: /\d:\d\d/ }).first())
    await sleep(500)
    const ts = page.locator('[role="dialog"]').last()
    check(`p3-${theme} its Time sheet: typed, no length chips`, (await typedIn(ts).count()) === 1 && (await ts.locator('[aria-label="Length"]').count()) === 0)
    await typeIn(typedIn(ts), '2-3:30')
    check(`p3-${theme} "2-3:30" echoes 2:00–3:30 PM · 1h30`, (await echoOf(ts)) === '2:00–3:30 PM · 1h30', await echoOf(ts))
    await shot(page, `p3-blocksheet-time-${theme}`)
    if (theme === 'day') {
      await typedIn(ts).press('Enter')
      await settle(state)
      const s = row(state, 'calendar_events', eid(STANDUP))
      check('p3 Enter → Standup 2:00–3:30 PM', s.starts_at === iso('14:00') && mins(s) === 90, JSON.stringify([s.starts_at, mins(s)]))
    }
    check(`p3-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// P4 — phone quick create: its chips are the length; the time chip's sheet has none, takes "7pm 45m".
if (want('p4')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone, theme })
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = (20 * 60 * 64) / 60 - 300))
    await sleep(300)
    const y = await page.locator('.pc-canvas').evaluate((c) => c.getBoundingClientRect().top + (20 * 60 * 64) / 60)
    await tapAt(cdp, { x: 200, y: y + 8 })
    await sleep(600)
    const d = page.locator('[role="dialog"]').last()
    await tap(cdp, d.locator('.pc-qc-chips .kf-chip').first())
    await sleep(500)
    const ts = page.locator('[role="dialog"]').last()
    check(`p4-${theme} quick create's Time sheet: typed, no length chips of its own`, (await typedIn(ts).count()) === 1 && (await ts.locator('[aria-label="Length"]').count()) === 0)
    await typeIn(typedIn(ts), '7pm 45m')
    check(`p4-${theme} "7pm 45m" echoes 7:00–7:45 PM · 45m`, (await echoOf(ts)) === '7:00–7:45 PM · 45m', await echoOf(ts))
    await shot(page, `p4-qc-time-${theme}`)
    await typedIn(ts).press('Enter')
    await sleep(700)
    const qc = page.locator('[role="dialog"]').last()
    const chips = (await qc.locator('.pc-qc-chips').first().locator('.kf-chip').allInnerTexts()).map(flat)
    const on = (await qc.locator('.pc-qc-chips').first().locator('.kf-chip').evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').map((e) => e.textContent.trim())))
    check(`p4-${theme} back on quick create: the time chip reads 7:00 PM, 45m picked`, /7:00 PM/.test(chips[0]) && on.includes('45m'), `${JSON.stringify(chips)} | ${JSON.stringify(on)}`)
    if (theme === 'day') {
      await qc.locator('.pc-qc-title').fill('Stretch break')
      const w0 = state.writes.length
      await qc.locator('.pc-qc-title').press('Enter')
      await settle(state)
      const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Stretch break')
      check('p4 Save → "Stretch break" 7:00–7:45 PM', e && e.starts_at === iso('19:00') && mins(e) === 45, JSON.stringify(e && [e.starts_at, mins(e)]))
    }
    check(`p4-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  ${f.name} — ${f.detail}`).join('\n'))
  process.exitCode = 1
}
