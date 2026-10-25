// bugs-1023 (Kai 2026-10-23, live on v1.4.1) on the REAL app against a MOCKED backend (the calendar-rail
// recipe: dev server in --mode mock (VITE_SUPABASE_URL=http://127.0.0.1:9), a made-up session in
// localStorage, Playwright answers every REST call; writes are recorded AND applied to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=d1,p1 runs a subset)
// 1. "duration doesn't sync with the times of scheduling" — every path a length or a time changes:
//    d1 editor Duration · d2 popover chips (date = the block's start, Duration stretches) · d3 drag ·
//    d4 resize (both edges) · d5 the block popover's length row (task block + Time slot, its time row) ·
//    d6 Plan ▸ Next free slot · d7 quick create's length row · d8 rows / rail read the block's length ·
//    p1 the phone task sheet (item 15: date chip + Duration chip) · p2 its length chips · p3 a Time slot's sheet.
// 2. "main + button isn't tappable to capture" — c1 the phone tab bar's + (and the field it opens, with a
//    toast up) · c2 the sidebar's Capture open and on the rail, 100/125/150% · c3 Today's add row, ⌘K,
//    the Inbox's Capture.
// 3. "the inbox only shows scanned pages, not captured entries" — i1 both kinds listed (desktop + phone),
//    the counts and the badge · i2 pages alone: no "Inbox zero" beside them · i3 triage and bulk still act
//    on the captures.
// The day: Friday 23 Oct 2026, Cairo (UTC+3), the clock at 12:00, on the 12-hour clock (the default).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5304'
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
  await ctx.addInitScript(([t, sess, scale, uid, now, collapsed]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, inbox: false, lists: true }))
    localStorage.setItem('kf.sidebarCollapsed', collapsed ? '1' : '0')
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [o.theme ?? 'day', JSON.stringify(session), o.scale ? String(o.scale) : null, UID, cairo(NOW).getTime(), !!o.collapsed])
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

// ═══ 1 · Duration ↔ times ═══

// D1 — the editor page's Duration: the block keeps its start and takes the length; Undo puts it back.
if (want('d1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open(`/tasks/${id(PRE)}`, { theme })
    const group = page.locator('[role="group"][aria-label="Duration"]')
    const w0 = state.writes.length
    await group.locator('button', { hasText: chipRe('1h') }).click()
    await settle(state)
    check(`d1-${theme} editor Duration 1h → the block 5:15–6:15 PM and the task's schedule + estimate with it`, inStep(state, '17:15', '18:15', 60, PRE, PREB), show(state, PRE, PREB))
    const line = flat(await text(page.getByText(/^Block ·/)))
    check(`d1-${theme} …the editor's Block line reads it`, /5:15\s*–\s*6:15\s*PM/.test(line), line)
    await shot(page, `d1-editor-${theme}`)
    if (theme === 'day') {
      check('d1 one task write for the pick (the block carries the estimate)', posts(state, 'tasks', w0).filter((t) => t.id === id(PRE)).length === 1, posts(state, 'tasks', w0).length)
      await undo(page, 'Duration')
      await settle(state)
      check('d1 Undo → 5:15–5:30 PM and 15 again', inStep(state, '17:15', '17:30', 15, PRE, PREB), show(state, PRE, PREB))
    }
    check(`d1-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// D2 — the desktop popover's chips: the date chip is the block's start (item 15: it read the due, 5:30 PM);
// Duration → 45m stretches the block.
if (want('d2')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
    const r = page.locator(`#task-${id(PRE)}`)
    await r.scrollIntoViewIfNeeded()
    await r.getByText('Pre workout', { exact: true }).first().click()
    await sleep(600)
    const pop = page.locator('.tp-pop')
    const chips = (await pop.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
    check(`d2-${theme} the popover's date chip says the block's start: Today · 5:15 PM; Duration 15m`, chips[0] === 'Today · 5:15 PM' && chips[1] === '15m', JSON.stringify(chips))
    await shot(page, `d2-popover-${theme}`)
    if (theme === 'day') {
      await pop.locator('.ts-chips .kf-chip', { hasText: chipRe('15m') }).click()
      await sleep(300)
      await page.getByRole('menuitem', { name: '45m' }).click()
      await settle(state)
      check('d2 Duration 45m → the block 5:15–6:00 PM, schedule and estimate in step', inStep(state, '17:15', '18:00', 45, PRE, PREB), show(state, PRE, PREB))
      const after = (await pop.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
      check('d2 …the chips read Today · 5:15 PM · 45m', after[0] === 'Today · 5:15 PM' && after[1] === '45m', JSON.stringify(after))
    }
    check(`d2-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// D3 — drag a task block: the length stays, the schedule follows, and a due time that was its start moves with it.
if (want('d3')) {
  const { ctx, page, errors, state } = await open()
  // Grab the block's middle (its top edge is a resize grip) and move it two hours down.
  await slotPoint(page, '15:00')
  const from = await fcBlock(page, LONGB).boundingBox()
  const grab = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const lane14 = await page.locator('td.fc-timegrid-slot-lane[data-time="14:00:00"]').boundingBox()
  const lane16 = await page.locator('td.fc-timegrid-slot-lane[data-time="16:00:00"]').boundingBox()
  // settle the hover lift first: a press during the block's lift transition can read as a click
  await page.mouse.move(grab.x, grab.y)
  await sleep(600)
  await mouseDrag(page, grab, { x: grab.x, y: grab.y + (lane16.y - lane14.y) })
  if (row(state, 'calendar_events', eid(LONGB)).starts_at === iso('14:00')) {
    await page.keyboard.press('Escape') // a popover from a press that read as a click
    await sleep(400)
    await mouseDrag(page, grab, { x: grab.x, y: grab.y + (lane16.y - lane14.y) })
  }
  const b = from
  await settle(state)
  check('d3 "Write the report" dragged 2:00 → 4:00 PM: 30 minutes kept, schedule + estimate in step', inStep(state, '16:00', '16:30', 30, LONG, LONGB), show(state, LONG, LONGB))
  check('d3 …its due time (it was the block\'s start) moved with it', row(state, 'tasks', id(LONG)).due_at === iso('16:00'), row(state, 'tasks', id(LONG)).due_at)
  check('d3 no page errors', errors.length === 0, errors.join(' | ') + (b ? '' : ' (no block)'))
  await ctx.close()
}

// D4 — resize from either edge: the new length is the estimate.
async function resizeEdge(page, n, edge, hhmm, frac) {
  await slotPoint(page, hhmm)
  const blk = fcBlock(page, n)
  const bb = await blk.boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(250)
  const handle = await blk.locator(edge === 'end' ? '.fc-event-resizer-end' : '.fc-event-resizer-start').boundingBox()
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  await mouseDrag(page, center(handle), { x: handle.x + handle.width / 2, y: lane.y + lane.height * frac })
}
if (want('d4')) {
  const { ctx, page, errors, state } = await open()
  await resizeEdge(page, LONGB, 'end', '15:00', 0.3)
  await settle(state)
  check('d4 bottom edge 2:30 → 3:15 PM: a 75-minute block, estimate 75', inStep(state, '14:00', '15:15', 75, LONG, LONGB), show(state, LONG, LONGB))
  await resizeEdge(page, LONGB, 'start', '13:30', 0.05)
  await settle(state)
  check('d4 top edge 2:00 → 1:30 PM: 1:30–3:15 PM, estimate 105, and the due (its start) with it', inStep(state, '13:30', '15:15', 105, LONG, LONGB) && row(state, 'tasks', id(LONG)).due_at === iso('13:30'), show(state, LONG, LONGB))
  check('d4 "Resized" carries Undo', (await page.locator('.kf-toast', { hasText: 'Resized' }).getByRole('button', { name: 'Undo' }).count()) >= 1)
  check('d4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D5 — the block popover: a task block's length row → the estimate; a Time slot's → its times, and its time row reads them.
if (want('d5')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    await slotPoint(page, '17:00')
    await fcBlock(page, PREB).click()
    await sleep(500)
    await shot(page, `d5-blockmenu-${theme}`)
    if (theme === 'day') {
      await lenChip(page, '30m').click()
      await settle(state)
      check('d5 task block 30m → 5:15–5:45 PM, the estimate 30', inStep(state, '17:15', '17:45', 30, PRE, PREB), show(state, PRE, PREB))
      await page.keyboard.press('Escape')
      await sleep(400)
    }
    await slotPoint(page, '18:00')
    await fcBlock(page, GYM).click()
    await sleep(500)
    const timeRow = flat(await text(page.locator('[role="menu"] [role="menuitem"]', { hasText: /\d:\d\d/ })))
    check(`d5-${theme} the Gym slot's time row: 6:00 – 7:00 PM · 1h`, /6:00\s*–\s*7:00\s*PM/.test(timeRow) && /1h\b/.test(timeRow), timeRow)
    if (theme === 'day') {
      await lenChip(page, '1h30').click()
      await settle(state)
      const g = row(state, 'calendar_events', eid(GYM))
      const h = row(state, 'tasks', id(HELD))
      check('d5 the slot 1h30 → 6:00–7:30 PM; "Stretch" inside keeps its 20 minutes at the slot\'s new times', g.starts_at === iso('18:00') && mins(g) === 90 && h.duration_min === 20 && h.scheduled_end === iso('19:30'), JSON.stringify([g.starts_at, mins(g), h.duration_min, h.scheduled_end]))
      const again = flat(await text(page.locator('[role="menu"] [role="menuitem"]', { hasText: /\d:\d\d/ })))
      check('d5 …its time row reads 6:00 – 7:30 PM · 1h30', /6:00\s*–\s*7:30\s*PM/.test(again) && /1h30/.test(again), again)
    }
    check(`d5-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// D6 — Plan ▸ Next free slot (the rail's Plan ▾): a block of the task's estimate, estimate and block in step.
if (want('d6')) {
  const { ctx, page, errors, state } = await open()
  const card = page.locator('.cal-rail-sec[data-section="today"] .unscheduled-task', { hasText: 'Call mum' }).first()
  await card.hover()
  await card.locator('.cal-plan-btn').click()
  await sleep(300)
  const w0 = state.writes.length
  await menuItem(page, 'Next free slot').click()
  await sleep(600)
  // A confirm step (one task): Confirm.
  const confirm = page.getByRole('button', { name: 'Confirm' })
  if (await confirm.count()) await confirm.first().click()
  await settle(state)
  const b = posts(state, 'calendar_events', w0).find((e) => e.task_id === id(LOOSE))
  const t = row(state, 'tasks', id(LOOSE))
  check('d6 Next free slot → a 20-minute block; the task\'s schedule and estimate match it', b && mins(b) === 20 && t.scheduled_start === b.starts_at && t.scheduled_end === b.ends_at && t.duration_min === 20, JSON.stringify(b && [b.starts_at, mins(b), t.scheduled_start, t.duration_min]))
  check('d6 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D7 — quick create's length row: the task's estimate is its block's length.
if (want('d7')) {
  const { ctx, page, errors, state } = await open()
  const p = await slotPoint(page, '20:00')
  await page.mouse.click(p.x, p.y + 4)
  await sleep(500)
  const qc = page.locator('.kf-quickcreate')
  await lenChip(page, '45m').click()
  await qc.locator('button', { hasText: /^Task$/ }).first().click()
  await qc.getByLabel('Title').fill('Floss teeth')
  await shot(page, 'd7-quickcreate')
  const w0 = state.writes.length
  await qc.getByLabel('Title').press('Enter')
  await settle(state)
  const t = posts(state, 'tasks', w0).filter((x) => x.title === 'Floss teeth').at(-1)
  const e = posts(state, 'calendar_events', w0).find((x) => x.title === 'Floss teeth')
  check('d7 quick create 45m → the task "Floss teeth" (45) and its block 8:00–8:45 PM', t?.duration_min === 45 && e && e.starts_at === iso('20:00') && mins(e) === 45 && t.scheduled_end === e.ends_at, JSON.stringify([t?.duration_min, e && [e.starts_at, mins(e)]]))
  check('d7 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// D8 — what a row says is the block: "Read the paper" (45-minute block, 30 left in duration_min by an older app).
if (want('d8')) {
  const { ctx, page, errors } = await open('/tasks?list=all')
  const meta = flat(await text(page.locator(`#task-${id(STALE)}`)))
  check('d8 the Tasks row says 45m (its block), not the stale 30m', /45m/.test(meta) && !/\b30m\b/.test(meta), meta)
  const held = flat(await text(page.locator(`#task-${id(HELD)}`)))
  check('d8 a task in a Time slot keeps its own 20m (not the slot\'s hour)', /20m/.test(held) && !/\b1h\b/.test(held), held)
  await shot(page, 'd8-rows')
  check('d8 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P1 — the phone task sheet (queue item 15): the date chip is the block's start; the Duration chip changes
// the length — the block, its card and the chips all say it.
if (want('p1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open(`/tasks?list=all&task=${id(PRE)}`, { view: phone, theme })
    const sheet = page.locator('[role="dialog"]').last()
    const chips = (await sheet.locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
    check(`p1-${theme} the sheet's chips: Today · 5:15 PM (the block's start, not the 5:30 due) · 15m`, chips[0] === 'Today · 5:15 PM' && chips[1] === '15m', JSON.stringify(chips))
    await shot(page, `p1-sheet-${theme}`)
    if (theme === 'day') {
      await tap(cdp, sheet.locator('.ts-chips .kf-chip', { hasText: chipRe('15m') }))
      await sleep(400)
      await tap(cdp, page.locator('[role="dialog"]').last().locator('.kf-as-row', { hasText: chipRe('1h') }).first())
      await settle(state)
      check('p1 Duration chip 1h → the block 5:15–6:15 PM, schedule and estimate in step', inStep(state, '17:15', '18:15', 60, PRE, PREB), show(state, PRE, PREB))
      const card = flat(await text(page.locator('.ts-block small')))
      const after = (await page.locator('[role="dialog"]').last().locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
      check('p1 …the block card reads 5:15–6:15 PM · 1h and the chips Today · 5:15 PM · 1h', /5:15\s*–\s*6:15\s*PM/.test(card) && /1h/.test(card) && after[0] === 'Today · 5:15 PM' && after[1] === '1h', `${card} | ${JSON.stringify(after)}`)
      await shot(page, 'p1-sheet-1h')
    }
    check(`p1-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// P2 — the phone task sheet's length chips under its block card: 30m → block and estimate.
if (want('p2')) {
  const { ctx, page, cdp, errors, state } = await open(`/tasks?list=all&task=${id(LONG)}`, { view: phone })
  const lr = page.locator('[role="dialog"]').last().locator('[aria-label="Length"]')
  await tap(cdp, lr.locator('button', { hasText: chipRe('45m') }))
  await settle(state)
  check('p2 the sheet\'s length chip 45m → 2:00–2:45 PM, estimate 45', inStep(state, '14:00', '14:45', 45, LONG, LONGB), show(state, LONG, LONGB))
  const after = (await page.locator('[role="dialog"]').last().locator('.ts-chips .kf-chip').allInnerTexts()).map(flat)
  check('p2 …the Duration chip reads 45m', after[1] === '45m', JSON.stringify(after))
  check('p2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// P3 — a Time slot on the phone: its sheet's length row sets its times; the sheet's meta says that length.
if (want('p3')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = (18 * 60 * 64) / 60 - 200))
  await sleep(300)
  await tap(cdp, page.locator(`.pc-block[data-id="${eid(GYM)}"] .pc-name`).first())
  await sleep(500)
  const d = page.locator('[role="dialog"]').last()
  const lr = d.locator('[aria-label="Length"]')
  await tap(cdp, lr.locator('button', { hasText: chipRe('30m') }))
  await settle(state)
  const g = row(state, 'calendar_events', eid(GYM))
  check('p3 the Gym slot\'s sheet 30m → 6:00–6:30 PM', g.starts_at === iso('18:00') && mins(g) === 30, JSON.stringify([g.starts_at, mins(g)]))
  const meta = flat(await text(page.locator('[role="dialog"]').last()))
  check('p3 …and its sheet says 30m', /30m/.test(meta), meta.slice(0, 160))
  check('p3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 2 · The main + / Capture ═══

// C1 — the phone tab bar's +: nothing over it; a tap opens the capture sheet with its field focused — and after
// a capture (its "Added to Inbox · Undo" toast up), the next + opens a field no toast covers.
if (want('c1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors } = await open('/today', { view: phone, theme })
    const plus = page.locator('.app-tabbar .kf-capture')
    check(`c1-${theme} the tab bar's + is hit-clean`, allOk(await hitClean(plus)), JSON.stringify(await hitClean(plus)))
    await tap(cdp, plus)
    check(`c1-${theme} a tap opens the capture sheet, its field focused`, await captureOpen(page))
    await page.keyboard.type('buy milk')
    await page.keyboard.press('Enter')
    await sleep(900)
    check(`c1-${theme} the capture landed with its toast`, await toastSoon(page, 'Added to Inbox'))
    await tap(cdp, plus)
    await sleep(500)
    const field = page.locator('#kf-capture-input')
    const pts = await hitClean(field)
    const onToast = await field.evaluate((e) => { const t = document.querySelector('.kf-toast')?.getBoundingClientRect(); const r = e.getBoundingClientRect(); return !!t && t.bottom > r.top && t.top < r.bottom })
    check(`c1-${theme} the + again (toast still up): the field is open, its middle takes the tap, no toast over it`, (await captureOpen(page)) && pts[0] === 'ok' && !pts.some((p) => /kf-toast/.test(p)) && !onToast && (await page.locator('.kf-toast').count()) >= 1, JSON.stringify(pts))
    await shot(page, `c1-phone-capture-toast-${theme}`)
    check(`c1-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// C2 — the sidebar's Capture, open and on the rail, at 100 / 125 / 150%: hit-clean, opens the bar focused.
if (want('c2')) {
  for (const scale of [1, 1.25, 1.5]) {
    for (const collapsed of [false, true]) {
      const tag = `c2 ${scale * 100}% ${collapsed ? 'rail' : 'open'}`
      const { ctx, page, errors } = await open('/today', { scale, collapsed })
      const btn = page.locator('.app-sidebar-footer .kf-side-capture')
      check(`${tag}: Capture is hit-clean`, allOk(await hitClean(btn)), JSON.stringify(await hitClean(btn)))
      await btn.click()
      check(`${tag}: a click opens the capture bar, focused`, await captureOpen(page))
      if (scale === 1.5) await shot(page, `c2-${collapsed ? 'rail' : 'open'}-150`)
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// C3 — every other way in: Today's "+ Add a task…", ⌘K, the Inbox's Capture (desktop).
if (want('c3')) {
  {
    const { ctx, page, errors } = await open('/today')
    const pill = page.locator('.td-pill-field')
    check('c3 Today\'s add row is hit-clean', allOk(await hitClean(pill)), JSON.stringify(await hitClean(pill)))
    await pill.click()
    check('c3 Today\'s add row opens the capture bar, focused', await captureOpen(page))
    await page.keyboard.press('Escape')
    await sleep(400)
    await page.keyboard.press('Control+k')
    check('c3 Ctrl+K opens the capture bar, focused', await captureOpen(page))
    check('c3 no page errors (Today)', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/inbox', { inbox: INBOX })
    const cta = page.locator('.ib-head-acts button', { hasText: 'Capture' }).first()
    check('c3 the Inbox\'s Capture is hit-clean', allOk(await hitClean(cta)), JSON.stringify(await hitClean(cta)))
    await cta.click()
    check('c3 the Inbox\'s Capture opens the capture bar, focused', await captureOpen(page))
    check('c3 no page errors (Inbox)', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ 3 · The Inbox lists both kinds ═══

const inboxCards = (page) => page.locator('.ib-list [id^="inbox-"]')
// I1 — a read page and two captures: the page's row above, both captures below; Waiting 3, the summary and the badge agree.
if (want('i1')) {
  for (const [view, vname] of [[desktop, 'desktop'], [phone, 'phone']]) {
    for (const theme of ['day', 'night']) {
      const { ctx, page, errors } = await open('/inbox', { view, theme, inbox: INBOX, captures: [READY()] })
      const ready = await page.locator('.pp-ready').count()
      const cards = (await inboxCards(page).allInnerTexts()).map(flat)
      check(`i1-${vname}-${theme} the page waiting for review AND both captures are listed`, ready === 1 && cards.length === 2 && cards.some((c) => /printer ink/.test(c)) && cards.some((c) => /Call the bank/.test(c)), `${ready} page · ${JSON.stringify(cards.map((c) => c.slice(0, 40)))}`)
      const order = await page.evaluate(() => {
        const r = document.querySelector('.pp-ready')?.getBoundingClientRect().top ?? 1e9
        const c = document.querySelector('.ib-list [id^="inbox-"]')?.getBoundingClientRect().top ?? -1
        return r < c
      })
      check(`i1-${vname}-${theme} …the page first, then the captures`, order)
      check(`i1-${vname}-${theme} no "Inbox zero" beside them`, (await page.getByText('Inbox zero').count()) === 0)
      if (vname === 'desktop') {
        const toggle = flat(await text(page.locator('.ib-toggle')))
        const sum = flat(await text(page.locator('.ib-sum')))
        const badge = flat(await text(page.locator('.app-sidebar a[href="/inbox"] .app-nav-badge')))
        check(`i1-desktop-${theme} Waiting 3 (2 captures + 1 page) · the summary says both · the badge 3`, /Waiting 3/.test(toggle) && /2 to sort/.test(sum) && /1 page to review/.test(sum) && badge === '3', `${toggle} | ${sum} | badge ${badge}`)
      } else {
        const badge = flat(await text(page.locator('.app-tabbar .kf-tab-badge')))
        check(`i1-phone-${theme} the Inbox tab's badge 3`, badge === '3', badge)
      }
      await shot(page, `i1-inbox-${vname}-${theme}`)
      check(`i1-${vname}-${theme} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// I2 — pages alone: the row and the counts, never "Inbox zero · Nothing waits on you" under it; nothing at all = Inbox zero.
if (want('i2')) {
  {
    const { ctx, page, errors } = await open('/inbox', { captures: [READY()] })
    const sum = flat(await text(page.locator('.ib-sum')))
    check('i2 a page alone: its row, "1 page to review", Waiting 1, no Inbox zero', (await page.locator('.pp-ready').count()) === 1 && /1 page to review/.test(sum) && /Waiting 1/.test(flat(await text(page.locator('.ib-toggle')))) && (await page.getByText('Inbox zero').count()) === 0, sum)
    await shot(page, 'i2-pages-alone')
    check('i2 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/inbox')
    check('i2 nothing waiting: Inbox zero', (await page.getByText('Inbox zero').count()) === 1)
    check('i2 no page errors (zero)', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// I3 — triage and bulk still act on the captures beside a page: select both, Dismiss → one toast, the page stays.
if (want('i3')) {
  const { ctx, page, errors, state } = await open('/inbox', { inbox: INBOX, captures: [READY()] })
  // Each capture's select box (it shows on hover; a click on it selects).
  await page.locator(`#inbox-${iid(1)} [aria-label="Select capture"]`).click({ force: true })
  await page.locator(`#inbox-${iid(2)} [aria-label="Select capture"]`).click({ force: true })
  await sleep(300)
  const bar = flat(await text(page.locator('.kf-bulkbar')))
  const w0 = state.writes.length
  await page.keyboard.press('d')
  await settle(state)
  const dismissed = posts(state, 'inbox_items', w0).filter((x) => x.status === 'dismissed').map((x) => x.id)
  check('i3 two captures selected ("2 selected"), D dismisses both with one toast; the page\'s row stays', /2 selected/i.test(bar) && dismissed.length === 2 && (await toastSoon(page, '2 captures dismissed')) && (await page.locator('.pp-ready').count()) === 1, `${bar} | ${JSON.stringify(dismissed)}`)
  check('i3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  ${f.name} — ${f.detail}`).join('\n'))
  process.exitCode = 1
}
