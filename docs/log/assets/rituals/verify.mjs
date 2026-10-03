// Plan my day (Plan.dc.html 6a–6m) and Shut down (Shutdown.dc.html 8a–8h) on the REAL app, signed in
// against a MOCKED backend — builder D/F's recipe (docs/log/assets/today-phone/verify.mjs): the dev
// server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session
// sits in localStorage, and Playwright answers every REST call with the design's sample day (Sunday
// 27 Sep 2026). The browser clock is fixed to each scene's Cairo time. Writes are kept in memory for
// the scene (so a refetch sees them) and inspected by the checks; nothing leaves the machine.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:5241'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the sample day: Sunday 27 Sep 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const DAY0 = new Date(Date.UTC(2026, 8, 27 - 83, 6)).toISOString()
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_FLOW = 'p0000000-0000-4000-8000-000000000001'
const P_HOME = 'p0000000-0000-4000-8000-000000000002'
const P_HEALTH = 'p0000000-0000-4000-8000-000000000003'
const P_FIN = 'p0000000-0000-4000-8000-000000000004'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const done = (at) => ({ status: 'done', completed_at: iso(at), top3: false })
const REVIEW = 1, UNTITLED = 2, AUDIT = 3, TYRE = 4, NODE = 5, PLANTS = 6, OMAR = 7, MILK = 8, BUDGET = 9, GYMT = 10, D1 = 11, D2 = 12, D3 = 13, D4 = 14
const LICENCE = 15, BILL = 16, INVOICE = 17
const ev = (n, title, from, to, taskN = null, day = 27) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, created_at: DAY0, updated_at: DAY0, deleted_at: null,
})
const PROJECTS = [[P_FLOW, "Kai's Flow"], [P_HOME, 'Personal'], [P_HEALTH, 'Health'], [P_FIN, 'Finance']].map(([pid, name]) => ({ id: pid, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 }))
const act = (n, event_type, entity_type, entity_id, payload, at, day = 27) => ({ id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at, day) })
const inbox = (n, raw_text, kind, at, day, project_id) => ({ id: `i0000000-0000-4000-8000-00000000000${n}`, user_id: UID, kind, raw_text, transcript: null, ai_parse: project_id ? { project_id } : null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: iso(at, day), updated_at: iso(at, day) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const journal = (n, date, body) => ({ id: `j0000000-0000-4000-8000-00000000000${n}`, user_id: UID, entry_date: date, body, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: `${date}T19:00:00Z`, updated_at: `${date}T19:00:00Z` })

// Plan my day, 07:40 (6a): two carried over, two in the inbox, last night's two seeds, the calendar.
function planDay(o = {}) {
  const tasks = [
    task(REVIEW, 'Review Kai', { duration_min: 30, due_at: iso('09:00', 27 - 64) }),
    task(UNTITLED, 'Untitled task', { due_at: iso('09:00', 26) }),
    ...(o.omarCarry ? [task(OMAR, 'Reply to Omar about lunch', { duration_min: 5, due_at: iso('12:00', 26) })] : []),
    task(AUDIT, 'Finish the flow audit', { duration_min: 120, project_id: P_FLOW }),
    task(TYRE, 'Call the tyre supplier', { duration_min: 30 }),
    task(NODE, 'Search for a good node.js source', { duration_min: o.budget ? 240 : 45, project_id: o.budget ? P_FIN : P_FLOW, due_at: iso('09:00', 29), ...(o.budget ? { title: 'Draft the Q4 budget' } : null) }),
    task(PLANTS, 'Water the balcony plants', { duration_min: 10, due_at: iso('09:00') }),
    // Plan fixes (Kai 2026-10-03): more open tasks than the suggestions hold.
    ...(o.more ? [task(LICENCE, 'Renew the car licence', { duration_min: 60 }), task(BILL, 'Pay the electricity bill', { duration_min: 15, project_id: P_FIN }), task(INVOICE, 'Send the September invoice', { duration_min: 20, due_at: iso('17:00') })] : []),
  ]
  const events = o.busy
    ? [ev(1, 'Deep work — forecasting', '09:00', '12:00'), ev(2, 'Workshop', '12:00', '13:30'), ev(3, 'Client day', '13:30', '16:00'), ev(4, 'Reviews', '16:00', '18:00')]
    : o.budget
      ? [ev(1, 'Deep work — forecasting', '09:00', '10:30'), ev(2, 'Lunch with Omar', '13:00', '14:30')]
      : [ev(1, 'Deep work — forecasting', '09:00', '10:30'), ev(2, 'Lunch with Omar', '13:00', '14:00'), ev(3, 'Gym — upper body', '18:00', '19:00')]
  const log = [AUDIT, TYRE].map((n, i) => act(10 + i, 'ritual.seeded', 'task', id(n), { ritual: 'evening', step: 'seeds', for_date: '2026-09-27', date: '2026-09-26' }, '21:35', 26))
  return {
    tasks,
    calendar_events: events,
    inbox_items: [inbox(1, 'idea: dark mode for the herbarium', 'voice', '23:10', 26, P_FLOW), inbox(2, 'book dentist', 'text', '10:00', 25, P_HEALTH)],
    activity_log: log,
  }
}
// Shut down, 21:40 (8a): the sweep, four done today, 2h 10m focused, tomorrow's call.
function shutDay(o = {}) {
  const tasks = o.allDone
    ? [task(TYRE, 'Call the tyre supplier', { duration_min: 30, due_at: iso('09:00', 28) }), task(OMAR, 'Reply to Omar about lunch', { duration_min: 5, due_at: iso('09:00', 30) }), task(PLANTS, 'Water the balcony plants', { duration_min: 10, due_at: iso('09:00', 29) }),
      ...[D1, D2, D3, D4, REVIEW, NODE, MILK].map((n, i) => task(n, `Done thing ${i + 1}`, done(`1${i}:00`)))]
    : [
        task(REVIEW, 'Review Kai', { duration_min: 30, top3: true, due_at: iso('09:00', 27 - 64) }),
        task(NODE, 'Search for a node.js source', { duration_min: 45, top3: true, project_id: P_FLOW }),
        task(MILK, 'Buy milk', { duration_min: 10, project_id: P_HOME, due_at: iso('09:00') }),
        ...(o.omar ? [task(OMAR, 'Reply to Omar about lunch', { duration_min: 5, due_at: iso('12:00') })] : []),
        task(TYRE, 'Call the tyre supplier', { duration_min: 30, due_at: iso('09:00', 28) }),
        task(PLANTS, 'Water the balcony plants', { duration_min: 10, due_at: iso('09:00', 29) }),
        ...[D1, D2, D3, D4].map((n, i) => task(n, `Done thing ${i + 1}`, done(`1${i}:00`))),
      ]
  return {
    tasks,
    calendar_events: [],
    inbox_items: [],
    activity_log: [act(1, 'ritual.finished', 'ritual', 'morning-2026-09-27', { ritual: 'morning', date: '2026-09-27', steps: ['overdue', 'inbox', 'top3', 'block'] }, '07:55')],
    journal_entries: [journal(1, '2026-09-26', 'Slow start, good finish.'), journal(2, '2026-09-25', 'The audit took longer than I planned.')],
    time_entries: [{ id: 't1', user_id: UID, project_id: P_FLOW, task_id: null, note: null, duration_min: 80, started_at: iso('13:30'), ended_at: iso('14:50'), created_at: iso('14:50'), updated_at: iso('14:50') }, { id: 't2', user_id: UID, project_id: null, task_id: null, note: null, duration_min: 50, started_at: iso('09:00'), ended_at: iso('09:50'), created_at: iso('09:50'), updated_at: iso('09:50') }],
  }
}
function tables(s) {
  if (s.empty) return { app_settings: [SETTINGS], projects: PROJECTS }
  return { app_settings: [SETTINGS], projects: PROJECTS, routines: [], routine_completions: [], journal_entries: [], time_entries: [], ...(s.kind === 'plan' ? planDay(s) : shutDay(s)) }
}
// PostgREST's event_type filter (eq.x / in.(a,b)) on the mocked activity_log.
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const TALL = (h) => ({ viewport: { width: 390, height: h }, hasTouch: true, isMobile: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }

/** Opens /today at `at` (Cairo) with scene `s`; writes land in `state.rows` and `state.writes`. */
async function open(s, theme, view = PHONE) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
  }, [theme, JSON.stringify(session)])
  const state = { rows: tables(s), writes: [] }
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try {
        body = JSON.parse(req.postData() ?? '[]')
      } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        const full = { created_at: new Date(cairo(s.at).getTime() + ++seq * 1000).toISOString(), ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') {
      const rid = (url.searchParams.get('id') ?? '').replace('eq.', '')
      state.rows[table] = (state.rows[table] ?? []).filter((x) => x.id !== rid)
      return r.fulfill({ status: 204, body: '' })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(s.at) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(700)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(350)
}
/** A right swipe on a row; `hold` = stop mid-way (returns a release fn). */
async function swipe(cdp, loc, dx, hold) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const y = b.y + Math.min(28, b.height / 2)
  const x0 = b.x + 40
  await touch(cdp, 'touchStart', [{ x: x0, y }])
  for (let i = 1; i <= 12; i++) {
    await touch(cdp, 'touchMove', [{ x: x0 + (dx * i) / 12, y }])
    await sleep(16)
  }
  const release = async () => {
    await sleep(150)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
  }
  if (hold) return release
  await release()
}
async function longPress(cdp, loc) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + Math.min(28, b.height / 2) }])
  await sleep(600)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.innerText().catch(() => '')
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const sheet = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('.rt') }).last()
const labels = async (page) => (await page.locator('.rt .rt-label').allInnerTexts()).map((l) => l.toUpperCase())
const row = (page, n) => page.locator(`[id="rt-${id(n)}"]`)
const scrollSheet = (page, sel) => page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'start' }))
async function phoneBasics(page, name, errors) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  const small = await page.evaluate(() => {
    const out = []
    for (const root of document.querySelectorAll('.rt')) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px in the sheet`, small.length === 0, small.slice(0, 4).join(' | '))
  const targets = await page.evaluate(() => [...document.querySelectorAll('.rt button')].filter((b) => b.getClientRects().length && !b.closest('.kf-swipe-bg') && !b.classList.contains('kf-checkbox') && !b.classList.contains('kf-chip')).map((b) => [b.textContent.trim().slice(0, 16) || b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)]).filter(([, h]) => h < 40))
  check(`${name} every control ≥ 40 tall (48 hit)`, targets.length === 0, JSON.stringify(targets.slice(0, 4)))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}
async function openPlan(page, cdp) {
  const b = page.locator('.tp-ritual').getByRole('button', { name: /^(Plan|Resume)$/ })
  if (cdp) await tap(cdp, b)
  else await b.click()
  await sleep(600)
}
async function openShut(page, cdp) {
  const b = page.locator('.tp-ritual').getByRole('button', { name: /^(Shut down|Resume)$/ })
  if (cdp) await tap(cdp, b)
  else await b.click()
  await sleep(600)
}
const want = (k) => !ONLY || ONLY.has(k)


// ═════════════════════════ Plan my day ═════════════════════════
for (const theme of ['day', 'night']) {
  if (!want(theme === 'day' ? '6a' : '6i')) continue
  const name = theme === 'day' ? '6a-day' : '6i-night'
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '07:40' }, theme)
  const card = page.locator('.tp-ritual')
  check(`${name} Today at 07:40 offers Plan`, (await text(card)).includes('Plan my day'), await text(card))
  await openPlan(page, cdp)
  await shot(page, name)
  const dlg = sheet(page)
  check(`${name} full-height kit sheet with ✕ and the title`, (await dlg.count()) === 1 && (await dlg.getByRole('button', { name: 'Close' }).count()) === 1 && (await text(dlg)).includes('Plan my day') && /SUN 27 SEP · ABOUT 3 MINUTES/i.test(await text(dlg)), (await text(dlg)).slice(0, 80))
  check(`${name} four sections in order`, JSON.stringify(await labels(page)) === JSON.stringify(['CARRY-OVER · 2', 'INBOX · 2', 'PICK YOUR 3 · 2/3', 'SUGGESTED TIMES']), JSON.stringify(await labels(page)))
  check(`${name} carry rows: overdue meta + Segmented + Drop`, /OVERDUE 64D/i.test(await text(row(page, REVIEW))) && /FROM YESTERDAY/i.test(await text(row(page, UNTITLED))) && (await row(page, REVIEW).getByRole('radio').count()) === 3 && (await row(page, REVIEW).getByRole('button', { name: 'Drop' }).count()) === 1)
  check(`${name} inbox rows: capture meta, project chip, Dismiss, File`, /VOICE · LAST NIGHT 23:10/i.test(await text(page.locator('.rt-inbox').first())) && /TYPED · FRI/i.test(await text(page.locator('.rt-inbox').nth(1))) && /KAI.S FLOW/i.test(await text(page.locator('.rt-inbox').first())), (await text(page.locator('.rt-inbox').first())).replace(/\n/g, ' '))
  check(`${name} footer: workload + status (suggested times count as timed) + Start the day`, /~\d+h.* planned · you'll finish around \d\d:\d0/.test(await text(page.locator('.rt-wl'))) && /2 PICKED · 2 TIMED/i.test(await text(page.locator('.rt-foot'))) && (await page.getByRole('button', { name: 'Start the day' }).count()) === 1, await text(page.locator('.rt-foot')))
  await phoneBasics(page, name, errors)
  await ctx.close()
}

// 6b — carry-over: Today chosen stays on the row; a row mid-swipe right reads Tomorrow · Mon 09:00.
if (want('6b')) {
  const name = '6b-day'
  const { ctx, page, cdp, errors, state } = await open({ kind: 'plan', at: '07:40', omarCarry: true }, 'day')
  await openPlan(page, cdp)
  await tap(cdp, row(page, REVIEW).getByRole('radio', { name: 'Today' }))
  check(`${name} Today applies at once (due today 09:00) and stays selected`, state.writes.some((w) => w.table === 'tasks' && w.row.id === id(REVIEW) && w.row.due_at === iso('09:00')) && (await row(page, REVIEW).getByRole('radio', { name: 'Today' }).getAttribute('aria-checked')) === 'true')
  check(`${name} status: 1 of 3 decided`, /1 OF 3 DECIDED/i.test(await text(page.locator('.rt-foot'))), await text(page.locator('.rt-foot')))
  const release = await swipe(cdp, row(page, OMAR), 230, true)
  await shot(page, name)
  check(`${name} mid-swipe right shows Tomorrow · Mon 09:00`, /Tomorrow\s*Mon 09:00/i.test(await text(row(page, OMAR).locator('.kf-swipe-bg'))), await text(row(page, OMAR).locator('.kf-swipe-bg')))
  await release()
  check(`${name} swipe past the line = Tomorrow, the row stays showing it`, state.writes.some((w) => w.row.id === id(OMAR) && w.row.due_at === iso('09:00', 28)) && (await row(page, OMAR).getByRole('radio', { name: 'Tomorrow' }).getAttribute('aria-checked')) === 'true')
  await tap(cdp, row(page, UNTITLED).getByRole('button', { name: 'Drop' }))
  await sleep(400)
  check(`${name} Drop → Trash + "Moved to Trash · Undo", no confirm`, (await toasts(page)).includes('Moved to Trash') && state.writes.some((w) => w.row.id === id(UNTITLED) && w.row.deleted_at) && (await page.locator('[role="alertdialog"]').count()) === 0, JSON.stringify(await toasts(page)))
  await phoneBasics(page, name, errors)
  await ctx.close()
}

// 6c · 6d · 6l — picks (seeds pre-selected, goal first), suggested times + Time Picker, 4th star.
if (want('6c')) {
  const { ctx, page, cdp, errors, state } = await open({ kind: 'plan', at: '07:40' }, 'day')
  await openPlan(page, cdp)
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
  await sleep(200)
  await shot(page, '6c-day')
  const audit = row(page, AUDIT)
  check('6c seeds pre-selected: stars on, sprout "Seed", the first is "✶ Goal"', (await audit.locator('.kf-star[aria-pressed="true"]').count()) === 1 && /✶ GOAL/i.test(await text(audit)) && /SEED/i.test(await text(audit)) && /SEED/i.test(await text(row(page, TYRE))) && !/GOAL/i.test(await text(row(page, TYRE))), (await text(audit)).replace(/\n/g, ' '))
  check('6c unstarred rows: node.js, plants (due today)', (await row(page, NODE).locator('.kf-star[aria-pressed="false"]').count()) === 1 && /DUE TODAY/i.test(await text(row(page, PLANTS))))
  check('6c carried rows are not listed again under Pick your 3', (await page.locator(`[id="rt-${id(REVIEW)}"]`).count()) === 1)
  // 6d: third pick → every pick has a dashed suggested pill; change the third → the time picker.
  await tap(cdp, row(page, NODE).locator('.kf-star'))
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Suggested", "i"))')
  const times = page.locator('.rt-trow')
  check('6d every pick gets a suggested time (always suggests)', (await times.count()) === 3 && (await page.locator('.rt-trow .rt-pill').count()) === 3, await times.count())
  check('6d the first slot follows Deep work', /10:30–12:30/.test(await text(times.first())) && /AFTER DEEP WORK/i.test(await text(times.first())), (await text(times.first())).replace(/\n/g, ' '))
  const borders = () => page.locator('.rt-trow .rt-pill').evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopStyle))
  check('6d no ✓ / Accept button on any row (plan fixes)', (await page.locator('.rt-ok').count()) === 0 && (await sheet(page).getByRole('button', { name: /accept/i }).count()) === 0)
  check('6d suggested pills read as proposals: dashed', (await page.locator('.rt-pill.is-suggested').count()) === 3 && JSON.stringify(await borders()) === JSON.stringify(['dashed', 'dashed', 'dashed']), JSON.stringify(await borders()))
  check('6d one plain line explains it; legend Calendar · Suggested · Set by you; 3 picked · 3 timed', (await text(sheet(page))).includes('Times are suggestions — tap one to change it. Start the day puts them on your calendar.') && /CALENDAR\s*SUGGESTED\s*SET BY YOU/i.test(await text(page.locator('.rt-legend'))) && /3 PICKED · 3 TIMED/i.test(await text(page.locator('.rt-foot'))), (await text(page.locator('.rt-legend'))).replace(/\n/g, ' ') + ' | ' + (await text(page.locator('.rt-foot'))))
  await tap(cdp, times.nth(2).locator('.rt-pill'))
  await sleep(400)
  check('6d the pill being changed wears the focus ring; the timeline shows it', (await page.locator('.rt-pill.is-changing').count()) === 1 && (await page.locator('.rt-tl-b.rt-k-changing').count()) === 1)
  await shot(page, '6d-day-picker')
  const picker = page.locator('[role="dialog"]').last()
  check('6d Time Picker: free slots, 15-min list, duration, footer No time (ghost) + Done', /Free on your calendar/i.test(await text(picker)) && (await picker.locator('.kf-pk-time').count()) === 96 && (await picker.getByRole('button', { name: 'No time' }).getAttribute('class')).includes('kf-button--ghost') && (await picker.getByRole('button', { name: 'Done' }).count()) === 1)
  await tap(cdp, picker.locator('.kf-pk-slot', { hasText: /^14:00/ }))
  await tap(cdp, picker.getByRole('button', { name: 'Done' }))
  await sleep(400)
  await scrollSheet(page, '.rt-tl')
  await shot(page, '6d-day')
  check('6d Done → the set pill turns solid (the others stay dashed), after Lunch', /14:00–14:45/.test(await text(times.nth(2))) && /AFTER LUNCH WITH OMAR/i.test(await text(times.nth(2))) && (await times.nth(2).locator('.rt-pill.is-set').count()) === 1 && JSON.stringify(await borders()) === JSON.stringify(['dashed', 'dashed', 'solid']) && /3 PICKED · 3 TIMED/i.test(await text(page.locator('.rt-foot'))), JSON.stringify(await borders()) + ' ' + (await text(page.locator('.rt-foot'))))
  // No time: the ghost in the picker's footer.
  await tap(cdp, times.nth(2).locator('.rt-pill'))
  await tap(cdp, page.locator('[role="dialog"]').last().getByRole('button', { name: 'No time' }))
  await sleep(400)
  check('6d "No time" → the row turns into "Pick one"; 3 picked · 2 timed', /NO TIME/i.test(await text(times.nth(2))) && (await times.nth(2).getByRole('button', { name: 'Pick one' }).count()) === 1 && /3 PICKED · 2 TIMED/i.test(await text(page.locator('.rt-foot'))), await text(page.locator('.rt-foot')))
  // 6l: a 4th star → the swap toast.
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
  await tap(cdp, row(page, PLANTS).locator('.kf-star'))
  await sleep(300)
  await shot(page, '6l-day')
  check('6l 4th star → "Top 3 is full — swap one out?" with Swap', (await toasts(page)).includes('Top 3 is full — swap one out?') && (await page.locator('.kf-toast').getByRole('button', { name: 'Swap' }).count()) === 1, JSON.stringify(await toasts(page)))
  await tap(cdp, page.locator('.kf-toast').getByRole('button', { name: 'Swap' }))
  check('6l Swap: the goal stays, the last pick gives way', (await row(page, PLANTS).locator('.kf-star[aria-pressed="true"]').count()) === 1 && (await row(page, NODE).locator('.kf-star[aria-pressed="false"]').count()) === 1 && /✶ GOAL/i.test(await text(row(page, AUDIT))))
  // The swapped-in pick gets "No time": it stays a pick, but nothing goes on the calendar for it.
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Suggested", "i"))')
  await tap(cdp, times.nth(2).locator('.rt-pill'))
  await tap(cdp, page.locator('[role="dialog"]').last().getByRole('button', { name: 'No time' }))
  await sleep(400)
  check('6l the plants pick set to No time; 3 picked · 2 timed', /Water the balcony plants/.test(await text(times.nth(2))) && /NO TIME/i.test(await text(times.nth(2))) && /3 PICKED · 2 TIMED/i.test(await text(page.locator('.rt-foot'))), await text(page.locator('.rt-foot')))
  // Start the day writes the picks, the goal, every timed pick (no ✓ needed), the ritual.
  await tap(cdp, page.getByRole('button', { name: 'Start the day' }))
  await sleep(900)
  const starred = (state.rows.tasks ?? []).filter((t) => t.top3).map((t) => t.id).sort()
  check('Start the day: the picks become the Top 3', JSON.stringify(starred) === JSON.stringify([id(AUDIT), id(TYRE), id(PLANTS)].sort()), JSON.stringify(starred))
  const blocks = (state.rows.calendar_events ?? []).filter((e) => e.task_id && !e.id.startsWith('e0'))
  check('Start the day: the timed picks go on the calendar as suggested (2 blocks, Cairo 10:30 / 12:30), untouched', blocks.length === 2 && blocks.some((b) => b.task_id === id(AUDIT) && b.starts_at === iso('10:30') && b.ends_at === iso('12:30')) && blocks.some((b) => b.task_id === id(TYRE) && b.starts_at === iso('12:30')), JSON.stringify(blocks.map((b) => b.starts_at)))
  check('Start the day: the "No time" pick stays unscheduled', !blocks.some((b) => b.task_id === id(PLANTS)), JSON.stringify(blocks.map((b) => b.task_id)))
  check('Start the day: ritual.finished (morning) logged; the sheet is gone', state.writes.some((w) => w.row.event_type === 'ritual.finished' && w.row.payload?.ritual === 'morning') && (await page.locator('.rt').count()) === 0)
  check('Start the day: Today no longer offers Plan', (await page.locator('.tp-ritual').count()) === 0 || !(await text(page.locator('.tp-ritual'))).includes('Plan my day'), await text(page.locator('.tp-ritual')))
  check('Start the day: the goal is the first pick', (await page.evaluate(() => localStorage.getItem('kf_goal_task_id'))) === id(AUDIT))
  await phoneBasics(page, '6c-6d-6l', errors)
  await ctx.close()
}

// 6e — over-full: a 4-hour third pick runs past 18:00 → amber, "Xh over".
if (want('6e')) {
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '07:40', budget: true }, 'day')
  await openPlan(page, cdp)
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
  await tap(cdp, row(page, NODE).locator('.kf-star'))
  await scrollSheet(page, '.rt-tl')
  await sleep(200)
  await shot(page, '6e-day')
  check('6e workload line amber with alert + "… over"', (await page.locator('.rt-wl.is-over').count()) === 1 && /\d+[HM] OVER$/i.test(await text(page.locator('.rt-wl'))) && /you'd finish/.test(await text(page.locator('.rt-wl'))), await text(page.locator('.rt-wl')))
  check('6e the long pick: "Runs past 18:00"', /RUNS PAST 18:00/i.test(await text(page.locator('.rt-trow').nth(2))), await text(page.locator('.rt-trow').nth(2)))
  await phoneBasics(page, '6e-day', errors)
  await ctx.close()
}

// 6f — everything empty: sections collapse to one line; type three things.
if (want('6f')) {
  const { ctx, page, cdp, errors, state } = await open({ kind: 'plan', at: '07:40', empty: true }, 'day')
  // An empty day has no ritual card on Today (2f) — the ⋯ keeps the ritual one tap away.
  await tap(cdp, page.locator('.tp-bar').getByRole('button', { name: 'Today menu' }))
  await tap(cdp, page.locator('.kf-as-row', { hasText: 'Morning ritual' }))
  await sleep(600)
  await shot(page, '6f-day')
  const t = await text(sheet(page))
  check('6f collapsed lines: Nothing carried over ✿ · Inbox zero ✿ · Pick something first', t.includes('Nothing carried over ✿') && t.includes('Inbox zero ✿') && t.includes('Pick something first'), t.replace(/\n/g, ' ').slice(0, 200))
  check('6f "Clear morning — pick your 3." + an input; footer "Nothing planned yet · the day is open" · 0 picked', t.includes('Clear morning — pick your 3.') && (await page.locator('.rt-input').count()) === 1 && (await text(page.locator('.rt-wl'))).includes('Nothing planned yet · the day is open') && /0 PICKED/i.test(await text(page.locator('.rt-foot'))))
  await page.locator('.rt-input').fill('Call the bank')
  await page.locator('.rt-input').press('Enter')
  await sleep(400)
  check('6f a typed thing becomes a task and a pick with a suggested time', state.writes.some((w) => w.table === 'tasks' && w.row.title === 'Call the bank') && /1 PICKED/i.test(await text(page.locator('.rt-foot'))) && (await page.locator('.rt-trow').count()) === 1, await text(page.locator('.rt-foot')))
  await phoneBasics(page, '6f-day', errors)
  await ctx.close()
}

// 6j — calendar busy all day: "No free slot", "Pick one", amber.
if (want('6j')) {
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '07:40', busy: true }, 'day')
  await openPlan(page, cdp)
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
  await tap(cdp, row(page, NODE).locator('.kf-star'))
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Suggested", "i"))')
  await sleep(200)
  await shot(page, '6j-day')
  check('6j "Your calendar is full from 09:00 to 18:00."', (await text(page.locator('.rt-warn'))).includes('Your calendar is full from 09:00 to 18:00.'))
  check('6j every pick: "No free slot" + a secondary "Pick one"', (await page.locator('.rt-trow').count()) === 3 && (await page.locator('.rt-trow', { hasText: /No free slot/i }).count()) === 3 && (await page.locator('.rt-trow .kf-button--secondary', { hasText: 'Pick one' }).count()) === 3)
  check("6j workload: meetings · the 3 picks don't fit · over", /~9h of meetings · the 3 picks don't fit/.test(await text(page.locator('.rt-wl'))) && /3H 15M OVER/i.test(await text(page.locator('.rt-wl'))), await text(page.locator('.rt-wl')))
  await phoneBasics(page, '6j-day', errors)
  await ctx.close()
}

// 6m — closed half-way: Today reads "2 of 4 done" + Resume; reopening resumes the choices.
if (want('6m')) {
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '08:05' }, 'day')
  await openPlan(page, cdp)
  await tap(cdp, row(page, REVIEW).getByRole('radio', { name: 'Today' }))
  await tap(cdp, row(page, UNTITLED).getByRole('radio', { name: 'Someday' }))
  await tap(cdp, page.locator('.rt-inbox').first().getByRole('button', { name: 'File' }))
  await tap(cdp, page.locator('.rt-inbox').first().getByRole('button', { name: 'Dismiss' }))
  await sleep(300)
  // Back (Esc) closes the sheet and keeps progress — the Undo toasts sit over the ✕ while a sheet is up.
  await page.keyboard.press('Escape')
  await sleep(900)
  check('6m Back closes the sheet', (await page.locator('.rt').count()) === 0)
  await shot(page, '6m-day')
  const card = page.locator('.tp-ritual')
  const t = await text(card)
  check('6m Today card: "Morning · 2 of 4 done", "~1 min left · Pick your 3 next", Resume + hairline', /MORNING · 2 OF 4 DONE/i.test(t) && /~1 MIN LEFT/i.test(t) && /PICK YOUR 3 NEXT/i.test(t) && (await card.getByRole('button', { name: 'Resume' }).count()) === 1 && (await card.locator('.tp-hairline').count()) === 1, t.replace(/\n/g, ' '))
  await openPlan(page, cdp)
  await shot(page, '6m-day-resumed')
  check('6m Resume keeps the choices (Today / Someday still selected)', (await row(page, REVIEW).getByRole('radio', { name: 'Today' }).getAttribute('aria-checked')) === 'true' && (await row(page, UNTITLED).getByRole('radio', { name: 'Someday' }).getAttribute('aria-checked')) === 'true')
  await phoneBasics(page, '6m-day', errors)
  await ctx.close()
}

// 6k — the whole scroll on one tall phone.
if (want('6k')) {
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '07:40' }, 'day', TALL(1540))
  await openPlan(page, cdp)
  await shot(page, '6k-day')
  check('6k whole plan fits a tall phone, footer pinned', (await page.locator('.rt-trow').count()) === 2 && (await page.getByRole('button', { name: 'Start the day' }).isVisible()))
  check('6k no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 6h — desktop: a centred panel, two columns, Esc closes and keeps progress.
for (const theme of ['day', 'night']) {
  if (!want('6h')) continue
  const name = `6h-desktop-${theme}`
  const { ctx, page, errors } = await open({ kind: 'plan', at: '07:40' }, theme, DESKTOP)
  await page.locator('[data-day-card]').getByRole('button', { name: 'Begin' }).click()
  await sleep(600)
  await shot(page, name)
  const panel = page.locator('.rt-desk')
  const box = await panel.boundingBox()
  const cssWidth = await panel.evaluate((e) => e.offsetWidth) // CSS px (the app's root UI zoom scales it on screen)
  const cols = await page.locator('.rt-desk-cols > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  check(`${name} centred panel ≤ 1080 CSS px, two columns`, box && Math.abs(box.x + box.width / 2 - 640) < 2 && cssWidth <= 1080 && cols.length === 2 && cols[0] > 400, JSON.stringify({ box, cssWidth, cols }))
  check(`${name} footer: workload · "Esc closes · keeps progress" · Start the day`, /Esc closes · keeps progress/i.test(await text(page.locator('.rt-desk-foot'))) && (await page.locator('.rt-desk-foot').getByRole('button', { name: 'Start the day' }).count()) === 1)
  check(`${name} kit at phone size: buttons 48, meta 12px`, (await page.getByRole('button', { name: 'Start the day' }).evaluate((b) => b.getBoundingClientRect().height)) >= 48 && (await page.locator('.rt-meta').first().evaluate((e) => getComputedStyle(e).fontSize)) === '12px')
  await page.locator('[id="rt-' + id(REVIEW) + '"]').getByRole('radio', { name: 'Tomorrow' }).click()
  await page.keyboard.press('Escape')
  await sleep(400)
  check(`${name} Esc closes`, (await page.locator('.rt-desk').count()) === 0)
  await page.locator('[data-day-card]').getByRole('button', { name: 'Begin' }).click()
  await sleep(500)
  check(`${name} …and keeps progress`, (await page.locator('[id="rt-' + id(REVIEW) + '"]').getByRole('radio', { name: 'Tomorrow' }).getAttribute('aria-checked')) === 'true')
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Plan fixes (Kai 2026-10-03): pick from every open task without leaving Plan — search + Show all. ──
const ALL_OPEN = ['Review Kai', 'Untitled task', 'Finish the flow audit', 'Call the tyre supplier', 'Search for a good node.js source', 'Water the balcony plants', 'Renew the car licence', 'Pay the electricity bill', 'Send the September invoice']
for (const theme of ['day', 'night']) {
  if (!want('6s')) continue
  const name = `6s-search-${theme}`
  const { ctx, page, cdp, errors } = await open({ kind: 'plan', at: '07:40', more: true }, theme)
  await openPlan(page, cdp)
  const dlg = sheet(page)
  const search = dlg.getByRole('searchbox', { name: 'Search all tasks' })
  check(`${name} Pick your 3 opens with "Search all tasks…"; the keyboard stays down (no focus)`, (await search.count()) === 1 && (await search.getAttribute('placeholder')) === 'Search all tasks…' && !(await search.evaluate((e) => e === document.activeElement)))
  check(`${name} no "All tasks" link out of the sheet`, (await dlg.getByRole('button', { name: /All tasks/i }).count()) === 0)
  const more = dlg.getByRole('button', { name: /Show all \d+ open tasks/i })
  check(`${name} suggestions stop at 4; "Show all 7 open tasks" under them`, /SHOW ALL 7 OPEN TASKS/i.test(await text(more)) && (await row(page, LICENCE).count()) === 0 && (await row(page, NODE).count()) === 0, await text(more))
  await tap(cdp, more)
  const all = await text(dlg)
  check(`${name} Show all: every open task is in Plan — carry-over (overdue), due today, the rest`, ALL_OPEN.every((t) => all.includes(t)) && (await row(page, LICENCE).count()) === 1 && (await row(page, INVOICE).count()) === 1, ALL_OPEN.filter((t) => !all.includes(t)).join(', '))
  if (theme === 'day') {
    await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
    await shot(page, `${name}-all`)
  }
  await tap(cdp, dlg.getByRole('button', { name: 'Show fewer' }))
  check(`${name} Show fewer folds back to the suggestions`, (await row(page, LICENCE).count()) === 0)
  // Search: a task the suggestions don't hold; star it right there.
  await tap(cdp, search)
  await search.fill('licence')
  await sleep(300)
  check(`${name} search "licence" finds it (not a suggestion); only matches are listed`, (await row(page, LICENCE).count()) === 1 && (await row(page, AUDIT).count()) === 0 && (await dlg.getByRole('button', { name: /Show all/i }).count()) === 0)
  await tap(cdp, row(page, LICENCE).locator('.kf-star'))
  check(`${name} starring a result picks it in place: 3/3, a suggested time, 3 picked · 3 timed`, (await row(page, LICENCE).locator('.kf-star[aria-pressed="true"]').count()) === 1 && (await labels(page)).includes('PICK YOUR 3 · 3/3') && (await page.locator(`[id="rt-time-${id(LICENCE)}"] .rt-pill.is-suggested`).count()) === 1 && /3 PICKED · 3 TIMED/i.test(await text(page.locator('.rt-foot'))), JSON.stringify(await labels(page)))
  await scrollSheet(page, '.rt-sec:has(.rt-label:text-matches("Pick your 3", "i"))')
  await shot(page, name)
  // By project name, then a 4th star from the results → the swap toast.
  await search.fill('finance')
  await sleep(300)
  check(`${name} search matches the project name too ("finance" → the electricity bill)`, (await row(page, BILL).count()) === 1 && /FINANCE/i.test(await text(row(page, BILL))))
  await tap(cdp, row(page, BILL).locator('.kf-star'))
  await sleep(300)
  check(`${name} a 4th star from the search → "Top 3 is full — swap one out?"`, (await toasts(page)).includes('Top 3 is full — swap one out?'), JSON.stringify(await toasts(page)))
  await tap(cdp, page.locator('.kf-toast').getByRole('button', { name: 'Swap' }))
  check(`${name} Swap: the bill in, the licence out, the goal (first) stays`, (await row(page, BILL).locator('.kf-star[aria-pressed="true"]').count()) === 1 && (await page.locator(`[id="rt-time-${id(BILL)}"]`).count()) === 1 && (await page.locator(`[id="rt-time-${id(LICENCE)}"]`).count()) === 0 && /Finish the flow audit/.test(await text(page.locator('.rt-trow').first())))
  // A carried row is found too (its own id), and an empty search says so.
  await search.fill('review')
  await sleep(300)
  check(`${name} search finds a carried task too, without a duplicate id`, (await page.locator(`[id="rt-found-${id(REVIEW)}"]`).count()) === 1 && (await row(page, REVIEW).count()) === 1)
  await search.fill('dentist')
  await sleep(300)
  check(`${name} nothing matches → one quiet line`, (await text(dlg)).includes('No open task matches “dentist”.'))
  // Back/Esc clears the search first; the sheet stays.
  await page.keyboard.press('Escape')
  await sleep(300)
  check(`${name} Esc clears the search first; the sheet stays`, (await search.inputValue()) === '' && (await page.locator('.rt').count()) === 1)
  await phoneBasics(page, name, errors)
  await ctx.close()
}

// Desktop: "/" focuses the search, Esc clears it, a second Esc closes (progress kept).
for (const theme of ['day', 'night']) {
  if (!want('6t')) continue
  const name = `6t-desktop-search-${theme}`
  const { ctx, page, errors } = await open({ kind: 'plan', at: '07:40', more: true }, theme, DESKTOP)
  await page.locator('[data-day-card]').getByRole('button', { name: 'Begin' }).click()
  await sleep(600)
  const search = page.locator('.rt-desk').getByRole('searchbox', { name: 'Search all tasks' })
  check(`${name} opens without focusing the search`, !(await search.evaluate((e) => e === document.activeElement)))
  await page.keyboard.press('/')
  check(`${name} "/" focuses the search (and types nothing)`, (await search.evaluate((e) => e === document.activeElement)) && (await search.inputValue()) === '')
  await page.keyboard.type('licence')
  await sleep(300)
  await row(page, LICENCE).locator('.kf-star').click()
  await sleep(200)
  await shot(page, name)
  check(`${name} found + starred in place: 3/3, a dashed suggested pill`, (await labels(page)).includes('PICK YOUR 3 · 3/3') && (await page.locator(`[id="rt-time-${id(LICENCE)}"] .rt-pill.is-suggested`).count()) === 1, JSON.stringify(await labels(page)))
  await page.keyboard.press('Escape')
  await sleep(300)
  check(`${name} Esc clears the search first; the panel stays`, (await search.inputValue()) === '' && (await page.locator('.rt-desk').count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(400)
  check(`${name} a second Esc closes the panel`, (await page.locator('.rt-desk').count()) === 0)
  await page.locator('[data-day-card]').getByRole('button', { name: 'Begin' }).click()
  await sleep(500)
  check(`${name} …and the searched pick is kept`, (await row(page, LICENCE).locator('.kf-star[aria-pressed="true"]').count()) === 1)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═════════════════════════ Shut down ═════════════════════════
for (const theme of ['night', 'day']) {
  if (!want(theme === 'night' ? '8a' : '8g')) continue
  const name = theme === 'night' ? '8a-night' : '8g-day'
  const { ctx, page, cdp, errors } = await open({ kind: 'shut', at: '21:40' }, theme)
  const card = page.locator('.tp-ritual')
  check(`${name} Today at 21:40 offers Shut down`, (await card.getByRole('button', { name: 'Shut down' }).count()) === 1, await text(card))
  await openShut(page, cdp)
  await shot(page, name)
  const t = await text(sheet(page))
  check(`${name} header: Shut down · Sun 27 Sep · 4 done · 2h 10m focused`, t.includes('Shut down') && /SUN 27 SEP · 4 DONE · 2H 10M FOCUSED/i.test(t), t.slice(0, 80))
  check(`${name} sections: Sweep · 3 left, One line, Tomorrow's 3 · 3/3`, JSON.stringify(await labels(page)) === JSON.stringify(['SWEEP · 3 LEFT', 'ONE LINE', "TOMORROW'S 3 · 3/3"]), JSON.stringify(await labels(page)))
  const sw = row(page, REVIEW)
  check(`${name} sweep row: checkbox + meta (overdue · Top 3) + Tomorrow; no ⋯, no star`, (await sw.locator('.kf-checkbox').count()) === 1 && /OVERDUE 64D/i.test(await text(sw)) && /TOP 3/i.test(await text(sw)) && (await sw.getByRole('button', { name: 'Tomorrow' }).count()) === 1 && (await sw.locator('.kf-row-more, .kf-star').count()) === 0)
  check(`${name} the last two lines in Caveat with mono dates`, (await page.locator('.rt-past').count()) === 2 && /SAT 26/i.test(await text(page.locator('.rt-past').first())) && /Caveat/.test(await page.locator('.rt-past .rt-hand').first().evaluate((e) => getComputedStyle(e).fontFamily)))
  const seeds = page.locator('.rt-seedrow')
  check(`${name} Tomorrow's 3: due tomorrow → left today; first star is the goal; no checkbox, no ⋯`, /Call the tyre supplier/.test(await text(seeds.first())) && /✶ GOAL/i.test(await text(seeds.first())) && /DUE TOMORROW/i.test(await text(seeds.first())) && /LEFT TODAY/i.test(await text(seeds.nth(1))) && (await page.locator('.rt-seedrow .kf-star[aria-pressed="true"]').count()) === 3 && (await page.locator('.rt-seedrow .kf-checkbox, .rt-seedrow .kf-row-more').count()) === 0)
  check(`${name} seedling + "Planted for Monday…"`, (await text(page.locator('.rt-planted'))).includes('Planted for Monday — the morning plan opens with these ✿'))
  check(`${name} footer: 3 seeds for Mon · Close the day`, /3 SEEDS FOR MON/i.test(await text(page.locator('.rt-foot'))) && (await page.getByRole('button', { name: 'Close the day' }).count()) === 1)
  await phoneBasics(page, name, errors)
  await ctx.close()
}

// 8b — sweep: one rolled (Tomorrow toggle), one done; swipe right = Tomorrow; no swipe-left; bulk.
if (want('8b')) {
  const { ctx, page, cdp, errors, state } = await open({ kind: 'shut', at: '21:40', omar: true }, 'night')
  await openShut(page, cdp)
  await tap(cdp, row(page, REVIEW).getByRole('button', { name: 'Tomorrow' }))
  await tap(cdp, row(page, OMAR).locator('.kf-checkbox'))
  await sleep(300)
  await shot(page, '8b-night')
  check('8b Tomorrow → selected (sage + check), meta "→ Mon 09:00", due tomorrow 09:00', (await row(page, REVIEW).getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')) === 'true' && /→ MON 09:00/i.test(await text(row(page, REVIEW))) && state.writes.some((w) => w.row.id === id(REVIEW) && w.row.due_at === iso('09:00', 28)))
  check('8b checkbox = Done: the row stays, struck, + Done toast', (await row(page, OMAR).locator('.rt-title.is-done').count()) === 1 && (await toasts(page)).includes('Done'), JSON.stringify(await toasts(page)))
  check('8b label: Sweep · 2 of 4 left', (await labels(page))[0] === 'SWEEP · 2 OF 4 LEFT', (await labels(page))[0])
  await tap(cdp, row(page, REVIEW).getByRole('button', { name: 'Tomorrow' }))
  check('8b a second tap takes the roll back', (await row(page, REVIEW).getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')) === 'false' && state.writes.filter((w) => w.row.id === id(REVIEW)).pop()?.row.due_at === iso('09:00', 27 - 64))
  await swipe(cdp, row(page, MILK), -200)
  check('8b no swipe-left (nothing here deletes)', !state.writes.some((w) => w.row.id === id(MILK) && w.row.deleted_at) && (await row(page, MILK).locator('.kf-swipe-bg.is-left').count()) === 0)
  await swipe(cdp, row(page, MILK), 300)
  check('8b swipe right past the line = Tomorrow', (await row(page, MILK).getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')) === 'true')
  await longPress(cdp, row(page, NODE))
  check('8b long-press selects: select circles on the open rows (not the done one) + "1 selected" bulk footer', (await page.locator('.rt .kf-select-circle').count()) === 3 && (await row(page, OMAR).locator('.kf-checkbox').count()) === 1 && /1 SELECTED/i.test(await text(page.locator('[role="dialog"]').last())))
  await tap(cdp, row(page, REVIEW))
  await shot(page, '8b-night-bulk')
  await tap(cdp, page.getByRole('button', { name: 'Done', exact: true }))
  await sleep(1200) // the outbox sends on its own beat
  check('8b bulk Done completes both, one toast', state.writes.some((w) => w.row.id === id(NODE) && w.row.status === 'done') && state.writes.some((w) => w.row.id === id(REVIEW) && w.row.status === 'done') && (await toasts(page)).includes('2 done'), JSON.stringify(await toasts(page)))
  await longPress(cdp, row(page, MILK))
  await page.keyboard.press('Escape')
  await sleep(400)
  check('8b Back leaves selection mode first; the sheet stays', (await page.locator('.rt .kf-select-circle').count()) === 0 && (await page.locator('.rt').count()) === 1)
  await phoneBasics(page, '8b-night', errors)
  await ctx.close()
}

// 8c — everything already done: Sweep collapses; the line saves to the journal (+ Edit).
if (want('8c')) {
  const { ctx, page, cdp, errors, state } = await open({ kind: 'shut', at: '21:40', allDone: true }, 'night')
  await openShut(page, cdp)
  await page.locator('.rt-input').fill('Tired, but the audit finally has a shape.')
  await tap(cdp, page.getByRole('button', { name: 'Save' }))
  await sleep(300)
  await shot(page, '8c-night')
  const t = await text(sheet(page))
  check('8c Sweep collapses to "Everything tended ✿"', t.includes('Everything tended ✿'))
  check('8c saved: Caveat line + "Saved to journal ✓" + Edit; a journal entry was written', /SAVED TO JOURNAL ✓/i.test(t) && (await page.getByRole('button', { name: 'Edit' }).count()) === 1 && state.writes.some((w) => w.table === 'journal_entries' && w.row.body === 'Tired, but the audit finally has a shape.' && w.row.entry_date === '2026-09-27'))
  check("8c Tomorrow's 3: due tomorrow, then due later this week (Tue, Wed)", /DUE TOMORROW/i.test(await text(page.locator('.rt-seedrow').first())) && /DUE TUE/i.test(await text(page.locator('.rt-seedrow').nth(1))) && /DUE WED/i.test(await text(page.locator('.rt-seedrow').nth(2))), (await page.locator('.rt-seedrow .rt-meta').allInnerTexts()).join(' | '))
  await tap(cdp, page.getByRole('button', { name: 'Edit' }))
  await page.locator('.rt-input').fill('Tired, but the audit has a shape.')
  await tap(cdp, page.getByRole('button', { name: 'Save' }))
  const jw = state.writes.filter((w) => w.table === 'journal_entries')
  check('8c Edit updates the same entry (no second one)', jw.length === 2 && jw[0].row.id === jw[1].row.id && jw[1].row.body === 'Tired, but the audit has a shape.')
  await phoneBasics(page, '8c-night', errors)
  await ctx.close()
}

// 8d · 8e — a 4th star → swap toast; Close the day → the summary → Day closed on Today.
if (want('8d')) {
  const { ctx, page, cdp, errors, state } = await open({ kind: 'shut', at: '21:40' }, 'night')
  await openShut(page, cdp)
  await page.locator('.rt-input').fill('Tired, but the audit finally has a shape.')
  await tap(cdp, page.getByRole('button', { name: 'Save' }))
  await tap(cdp, page.locator('.rt-seedrow', { hasText: 'Buy milk' }).locator('.kf-star'))
  await sleep(300)
  await shot(page, '8d-night')
  check("8d 4th star → \"Tomorrow's 3 is full — swap one out?\" with Swap", (await toasts(page)).includes("Tomorrow's 3 is full — swap one out?") && (await page.locator('.kf-toast').getByRole('button', { name: 'Swap' }).count()) === 1, JSON.stringify(await toasts(page)))
  await tap(cdp, page.locator('.kf-toast').getByRole('button', { name: 'Swap' }))
  check('8d Swap: Buy milk in, the goal stays', (await page.locator('.rt-seedrow', { hasText: 'Buy milk' }).locator('.kf-star[aria-pressed="true"]').count()) === 1 && /✶ GOAL/i.test(await text(page.locator('.rt-seedrow').first())))
  await tap(cdp, page.getByRole('button', { name: 'Close the day' }))
  await sleep(500)
  await shot(page, '8e-night-summary')
  const t = await text(sheet(page))
  check("8e summary: clover, \"The garden's closed.\", See you in the morning ✿, stats, Goodnight", (await page.locator('.rt-summary img[src*="clover/resting"]').count()) === 1 && t.includes("The garden's closed.") && t.includes('See you in the morning ✿') && /4 DONE · 2H 10M FOCUSED · 3 SEEDED/i.test(t.replace(/\n/g, ' · ')) && (await page.getByRole('button', { name: 'Goodnight' }).count()) === 1, t.replace(/\n/g, ' · '))
  const seeded = state.writes.filter((w) => w.row.event_type === 'ritual.seeded').map((w) => w.row.entity_id).sort()
  check('8e seeds planted for Mon (the three stars)', JSON.stringify(seeded) === JSON.stringify([id(TYRE), id(REVIEW), id(MILK)].sort()) && state.writes.filter((w) => w.row.event_type === 'ritual.seeded').every((w) => w.row.payload.for_date === '2026-09-28'), JSON.stringify(seeded))
  check('8e starred sweep rows roll to Mon 09:00 on close (Review Kai, Buy milk)', [REVIEW, MILK].every((n) => state.writes.some((w) => w.row.id === id(n) && w.row.due_at === iso('09:00', 28))))
  await sleep(3600)
  check('8e ritual.finished (evening) logged', state.writes.some((w) => w.row.event_type === 'ritual.finished' && w.row.payload?.ritual === 'evening'))
  await shot(page, '8e-night-today')
  const card = page.locator('.tp-ritual')
  check('8e closes by itself (~3s) → Today shows "Day closed ✿" + 3 seeds for Mon', (await page.locator('.rt').count()) === 0 && (await text(card)).includes('Day closed ✿') && /3 SEEDS PLANTED FOR MON/i.test(await text(card)), (await text(card)).replace(/\n/g, ' '))
  await phoneBasics(page, '8d-8e-night', errors)
  await ctx.close()
}

// 8h — the whole scroll, night.
if (want('8h')) {
  const { ctx, page, cdp, errors } = await open({ kind: 'shut', at: '21:40' }, 'night', TALL(1200))
  await openShut(page, cdp)
  await shot(page, '8h-night')
  check('8h whole shut-down fits a tall phone, footer pinned', (await page.locator('.rt-seedrow').count()) >= 4 && (await page.getByRole('button', { name: 'Close the day' }).isVisible()))
  check('8h no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 8f — desktop: centred panel, night (and day).
for (const theme of ['night', 'day']) {
  if (!want('8f')) continue
  const name = `8f-desktop-${theme}`
  const { ctx, page, errors } = await open({ kind: 'shut', at: '21:40' }, theme, DESKTOP)
  await page.locator('[data-day-card]').getByRole('button', { name: 'Begin' }).click()
  await sleep(600)
  await shot(page, name)
  const cols = await page.locator('.rt-desk-cols > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  const left = await text(page.locator('.rt-desk-cols > div').first())
  check(`${name} centred two-column panel: Sweep + One line | Tomorrow's 3`, cols.length === 2 && /SWEEP/i.test(left) && /ONE LINE/i.test(left) && /TOMORROW'S 3/i.test(await text(page.locator('.rt-desk-cols > div').nth(1))), JSON.stringify(cols))
  check(`${name} footer: 3 seeds for Mon · Esc closes · keeps progress · Close the day`, /3 SEEDS FOR MON/i.test(await text(page.locator('.rt-desk-foot'))) && /ESC CLOSES/i.test(await text(page.locator('.rt-desk-foot'))) && (await page.locator('.rt-desk-foot').getByRole('button', { name: 'Close the day' }).count()) === 1)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Side by side: the design frame (design-export/_check/2026-09-28) | this build, same state. ──
{
  const DESIGN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../../../design-export/_check/2026-09-28')
  const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f, type) => `data:${type};base64,${fs.readFileSync(f).toString('base64')}`
  const pairs = [['plan-6a', '6a-day'], ['plan-6b', '6b-day'], ['plan-6c', '6c-day'], ['plan-6d', '6d-day-picker'], ['plan-6e', '6e-day'], ['plan-6f', '6f-day'], ['plan-6j', '6j-day'], ['plan-6l', '6l-day'], ['plan-6m', '6m-day'], ['plan-6i', '6i-night'], ['plan-6k', '6k-day'], ['plan-6h', '6h-desktop-day'],
    ['shutdown-8a', '8a-night'], ['shutdown-8b', '8b-night'], ['shutdown-8c', '8c-night'], ['shutdown-8d', '8d-night'], ['shutdown-8e', '8e-night-summary'], ['shutdown-8g', '8g-day'], ['shutdown-8h', '8h-night'], ['shutdown-8f', '8f-desktop-night']]
  for (const [frame, ours] of pairs) {
    const d = path.join(DESIGN, `${frame}.jpg`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(d) || !fs.existsSync(o)) continue
    const wide = frame.endsWith('6h') || frame.endsWith('8f')
    const w = wide ? 760 : 390
    await page.setViewportSize({ width: wide ? 1560 : 820, height: 900 })
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff;align-items:flex-start"><div><div>design ${frame}</div><img src="${uri(d, 'image/jpeg')}" style="width:${w}px"></div><div><div>build ${ours}</div><img src="${uri(o, 'image/png')}" style="width:${w}px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
