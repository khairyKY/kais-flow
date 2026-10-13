// today-shell: the shell side of Today 2a — the sidebar foot (streak · best · day), "● synced" on the
// Settings row, no top bar on a computer's Today / Inbox (their frames), the top bar kept on Tasks /
// Calendar — plus Today's keys (N = New task, Shift+N = Notebook, in the cheatsheet), Worth a look's
// Plan a step / Snooze a week, and the bulk bar's Top 3. Same mocked backend as fix-today/verify.mjs
// (its setup is copied verbatim; only open() takes a path).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3). Desktop 1280×800 at the 125% default zoom; phone 390×844.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5258'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').some((p) => k.startsWith(p))

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
const TODAY = '2026-10-12'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pid = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// Today 2a's sample day, on our calendar.
const GOAL = 1, LOGIC = 2, EMAILS = 3, GITHUB = 4, ADS = 5, BUG = 6, BANK = 7, CHECKED = 13
const FORECAST = pid(1), SHAHEEN = pid(2), PORTFOLIO = pid(3), GARDEN = pid(4)
function tasksFor(s) {
  const big = s.heavy ? 240 : 30
  return [
    task(GOAL, 'Deliver the MVP of the forecasting app', { top3: true, top3_rank: 1, project_id: FORECAST, duration_min: big, due_at: iso('09:00') }),
    task(LOGIC, 'Plan & implement the forecasting logic', { top3: true, top3_rank: 2, project_id: FORECAST, duration_min: big }),
    task(EMAILS, 'Create official emails for Shaheen', { top3: true, top3_rank: 3, project_id: SHAHEEN, duration_min: big }),
    task(GITHUB, 'Figure out linking multiple GitHub accounts', { due_at: iso('09:00', 9) }),
    task(ADS, 'Audit ads performance', { due_at: iso('09:00'), recurrence_rule: 'FREQ=WEEKLY' }),
    task(BUG, '[BUG] Deactivating a vendor store', { project_id: SHAHEEN }),
    task(BANK, 'Call the bank about the mortgage', { duration_min: 30, scheduled_start: iso('11:30'), scheduled_end: iso('12:00'), ...(s.bankDone ? { status: 'done', completed_at: iso('11:50') } : null) }),
    task(8, 'Renew the domain'),
    task(9, 'Reply to Salma about Thursday'),
    task(10, 'Order printer ink'),
    task(11, 'Book the dentist'),
    task(12, 'Sketch the garden bed layout'),
    task(CHECKED, 'Check the invoices', { status: 'done', completed_at: iso('08:30') }),
  ]
}
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const DEEP = 1, BANKB = 2, SYNC = 3, REVIEWB = 4
const EVENTS = [
  ev(DEEP, 'Deep work — Forecasting', '09:00', '11:00', null, 'time_block'),
  ev(BANKB, 'Call the bank about the mortgage', '11:30', '12:00', BANK),
  ev(SYNC, 'Sync with Omar', '13:00', '13:30'),
  ev(REVIEWB, 'Review the portfolio site', '15:00', '16:00'),
]
const project = (p, name) => ({ id: p, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(FORECAST, 'Forecasting App'), project(SHAHEEN, 'Shaheen'), project(PORTFOLIO, 'Portfolio site'), project(GARDEN, 'Garden club')]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Tidy the desk', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const INBOX = [{ id: 'a2000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Buy printer ink', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00') }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(s) {
  const log = [GOAL, LOGIC, EMAILS].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  if (s.morning) {
    log.push(act(1, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '08:20'))
    ;['overdue', 'inbox', 'top3', 'block'].forEach((step, i) => log.push(act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '08:15')))
  } else if (s.morningHalf) {
    ;['overdue', 'inbox'].forEach((step, i) => log.push(act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '07:58')))
  }
  if (s.closed) log.push(act(3, 'review.week_closed', 'review', iso('00:00', 6), {}, '18:00'))
  if (s.evening) log.push(act(2, 'ritual.finished', 'ritual', `evening-${TODAY}`, { ritual: 'evening', date: TODAY, steps: ['sweep', 'line', 'seeds', 'goodnight'] }, '21:00'))
  return {
    tasks: tasksFor(s),
    calendar_events: structuredClone(EVENTS),
    projects: PROJECTS,
    app_settings: [s.weekend ? { ...SETTINGS, weekend_days: s.weekend } : SETTINGS],
    routines: ROUTINES,
    routine_completions: [{ id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') }],
    inbox_items: INBOX,
    activity_log: log,
    time_entries: [],
    domains: [],
    areas: [],
    slipping: [
      { entity_type: 'project', entity_id: PORTFOLIO, entity_name: 'Portfolio site', last_touch: iso('09:00', 3), days_since: 9 },
      { entity_type: 'project', entity_id: GARDEN, entity_name: 'Garden club', last_touch: iso('09:00', 1), days_since: 11 },
      // the goal's own project — 2a rule 7: never flagged beside the goal
      { entity_type: 'project', entity_id: FORECAST, entity_name: 'Forecasting App', last_touch: iso('09:00', 4), days_since: 8 },
    ],
    resurfaced_log: [],
  }
}

/** PostgREST filters the app sends (eq / neq / in / gte / gt / lte / lt / is), enough for the mock. */
function filterRows(rows, url) {
  let out = rows
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const m = v.match(/^(not\.)?(eq|neq|in|gte|gt|lte|lt|is)\.(.*)$/)
    if (!m) continue
    const [, not, op, raw] = m
    const val = (x) => (x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : x)
    const test = (r) => {
      const a = r[k]
      if (op === 'eq') return String(a) === raw
      if (op === 'neq') return String(a) !== raw
      if (op === 'is') return a === val(raw)
      if (op === 'in') return raw.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(a))
      if (a == null) return false
      return op === 'gte' ? a >= raw : op === 'gt' ? a > raw : op === 'lte' ? a <= raw : a < raw
    }
    out = out.filter((r) => (not ? !test(r) : test(r)))
  }
  return out
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(at, s = {}, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(s), writes: [] }
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
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(at) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${o.path ?? '/today'}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = async (page, name, top = true) => {
  if (top) await page.evaluate(() => document.querySelector(".app-main-content")?.scrollTo(0, 0))
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const text = (loc) => loc.first().innerText().catch(() => '')
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
async function tap(cdp, page, loc) {
  const p = center(await loc.boundingBox())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
}
/** Shell fit (shell-fit harness): the document never scrolls (the shell does) and nothing runs sideways. */
const fit = (page) => page.evaluate(() => ({ win: innerHeight, doc: document.scrollingElement.scrollHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
async function fitCheck(page, tag) {
  const m = await fit(page)
  check(`${tag} shell fit: no page scroll, no sideways scroll`, m.doc <= m.win + 1 && m.sw <= m.iw + 1, JSON.stringify(m))
}
const now = (page) => page.locator('.td-now')
const slip = (page) => page.locator('.tp-slip-wrap')


/** The sidebar, measured in the page's own (zoomed) px: which nav rows a short window still shows. */
async function sidebar(page) {
  return page.evaluate(() => {
    const col = document.querySelector('.app-sidebar-col').getBoundingClientRect()
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.bottom <= col.bottom + 1 && r.top >= col.top - 1 }
    const rows = [...document.querySelectorAll('nav[data-tour="sidebar"] a')].map((a) => ({ label: a.textContent.trim(), visible: vis(a) }))
    const vine = document.querySelector('.app-vine')
    const vr = vine?.getBoundingClientRect()
    return { rows, vine: vine ? { text: vine.innerText.replace(/\n/g, ' / '), inView: vr.bottom <= innerHeight && vr.top >= 0 && vr.height > 0 } : null }
  })
}

// ── S · the shell on each page, desktop day + night ──
const PAGES = [['today', '/today', false], ['inbox', '/inbox', false], ['tasks', '/tasks', true], ['calendar', '/calendar', true]]
for (const theme of ['day', 'night']) for (const [key, at, topBar] of PAGES) {
  if (!want(`s-${key}`)) continue
  const tag = `s-${key}-${theme}`
  const { ctx, page, errors } = await open('09:40', { morning: true }, { theme, path: at })
  const bar = page.locator('.app-topbar')
  check(`${tag} top bar ${topBar ? "kept (the page's frame)" : 'gone (2a / 3a)'}`, (await bar.count()) === (topBar ? 1 : 0))
  if (topBar) check(`${tag} the top bar: owner · date, no sync words on a computer (they're on the Settings row)`, /Demo's Flow · Mon 12 Oct/i.test(await text(bar)) && (await bar.locator('.app-topbar-sync').count()) === 0, await text(bar))
  const sb = await sidebar(page)
  check(`${tag} sidebar foot: "1-day streak / best 1 · day 12", in view`, sb.vine?.inView && /1-day streak \/ best 1 · day 12/.test(sb.vine.text), JSON.stringify(sb.vine))
  check(`${tag} Settings row: ● synced`, (await page.locator('.kf-settings-row .kf-side-sync[data-sync="quiet"]').count()) === 1 && (await page.locator('.kf-side-sync').getAttribute('title')) === 'Sync: synced')
  check(`${tag} Tend rows all in view (Today · Inbox · Calendar · Tasks · Projects)`, sb.rows.slice(0, 5).every((r) => r.visible), sb.rows.map((r) => `${r.label}:${r.visible ? 'in' : 'out'}`).join(' '))
  if (key === 'today') check(`${tag} the app icon beside the wordmark`, (await page.locator('.app-sidebar-header img[src="/icon-192.png"]').count()) === 1)
  await fitCheck(page, tag)
  await shot(page, tag)
  await page.locator('.app-sidebar').screenshot({ path: path.join(OUT, `sidebar-${key}-${theme}.png`) })
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S · a tall window (the footer rows labelled): "● synced" sits on the Settings row ──
if (want('s-tall')) {
  const { ctx, page, errors } = await open('09:40', { morning: true }, { view: { viewport: { width: 1280, height: 1100 } } })
  const sync = page.locator('.kf-side-sync')
  check('s-tall Settings row reads "Settings … ● synced"', /Settings/.test(await text(page.locator('.kf-settings-row'))) && /synced/.test(await text(sync)) && (await sync.locator('.app-footer-label').isVisible()), await text(page.locator('.kf-settings-row')))
  await shot(page, 's-tall-today-day')
  await page.locator('.app-sidebar').screenshot({ path: path.join(OUT, 'sidebar-tall-day.png') })
  check('s-tall no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S · offline: the sidebar says so, and its popover opens above the Settings row, in view ──
if (want('s-offline')) {
  const { ctx, page, errors } = await open('09:40', { morning: true }, { view: { viewport: { width: 1280, height: 1100 } } })
  await ctx.setOffline(true)
  await sleep(800)
  const sync = page.locator('.kf-side-sync')
  check('s-offline the Settings row says "offline", hollow dot', (await sync.getAttribute('data-sync')) === 'offline' && /offline/.test(await text(sync)), await text(sync))
  await sync.click()
  await sleep(400)
  const pop = page.locator('.kf-sync-pop--side')
  const box = await pop.boundingBox()
  const vp = page.viewportSize()
  check('s-offline …its popover opens above the row, inside the window', !!box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width, JSON.stringify(box))
  check('s-offline …"All caught up." (nothing queued)', /All caught up/.test(await text(pop)), await text(pop))
  await shot(page, 's-offline-popover-day', false)
  await ctx.setOffline(false)
  check('s-offline no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S · the collapsed rail: the sync dot rides the gear; the streak folds away with the labels ──
if (want('s-collapsed')) {
  const { ctx, page, errors } = await open('09:40', { morning: true })
  await page.evaluate(() => localStorage.setItem('kf.sidebarCollapsed', '1'))
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  const dot = await page.locator('.kf-side-sync-dot').boundingBox()
  const gear = await page.locator('.kf-settings-row a').boundingBox()
  check('s-collapsed the sync dot sits on the gear row, inside the 64px rail', !!dot && !!gear && dot.x >= gear.x && dot.x + dot.width <= gear.x + gear.width + 1 && dot.y >= gear.y - 1 && dot.y <= gear.y + gear.height, JSON.stringify({ dot, gear }))
  check('s-collapsed the label is hidden, the streak folds away', !(await page.locator('.kf-side-sync .app-footer-label').isVisible()) && !(await page.locator('.app-vine').isVisible()))
  await shot(page, 's-collapsed-today-day')
  check('s-collapsed no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S · phone: the top bar keeps the sync words (no sidebar there) ──
if (want('s-phone')) {
  const { ctx, page, errors } = await open('09:40', { morning: true }, { view: phone, path: '/tasks' })
  check('s-phone Tasks: the shell top bar shows (owner · date)', (await page.locator('.app-topbar').isVisible()) && /Mon 12 Oct/i.test(await text(page.locator('.app-topbar'))))
  await ctx.setOffline(true)
  await sleep(800)
  check('s-phone …offline, the strip says so', /Offline/i.test(await text(page.locator('.app-topbar .app-topbar-sync'))), await text(page.locator('.app-topbar')))
  await shot(page, 's-phone-tasks-offline-day')
  await ctx.setOffline(false)
  check('s-phone no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K · keys: N = New task everywhere, Shift+N = the Notebook page, the pill's keycap, the cheatsheet ──
if (want('k')) {
  const { ctx, page, errors } = await open('09:40', { morning: true })
  const cap = (await text(page.locator('.td-pill-field'))).replace('Add a task…', '').trim()
  check("k the pill's keycap reads N (2a)", cap === 'N', cap)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('?')
  await sleep(500)
  const sheetText = await text(page.locator('[role="dialog"][aria-label="Shortcuts"]'))
  check("k the cheatsheet: \"n New task\" (Anywhere) and \"⇧ N Notebook page\" (Today's section)", /n\s*New task/.test(sheetText) && /⇧\s*N\s*Notebook page/.test(sheetText), sheetText.replace(/\n/g, ' | ').slice(0, 600))
  await shot(page, 'k-cheatsheet-day', false)
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('n')
  await sleep(500)
  check('k N on Today → the capture bar', page.url().endsWith('/today') && (await page.evaluate(() => document.activeElement?.id === 'kf-capture-input')))
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('Shift+N')
  await sleep(600)
  check('k Shift+N on Today → /notebook?day=today', page.url().includes('/notebook?day=today'), page.url())
  // N on another page is New task too (one meaning per key).
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
  await sleep(1200)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('n')
  await sleep(500)
  check('k N on Tasks → the capture bar', await page.evaluate(() => document.activeElement?.id === 'kf-capture-input'))
  check('k no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── L · the Label picker key on Today, as on Tasks: the focused row, or every selected one ──
if (want('l')) {
  const { ctx, page, errors, state } = await open('09:40', { morning: true })
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('j') // focus the first row (the goal)
  await sleep(200)
  await page.keyboard.press('l')
  await sleep(400)
  const lp = page.getByRole('dialog', { name: 'Labels' })
  check('l L on a focused row → the Label picker', (await lp.count()) === 1)
  let w0 = state.writes.length
  await page.keyboard.type('errand')
  await page.keyboard.press('Enter')
  await settle(state)
  let wrote = posts(state, 'tasks', w0)
  check('l …Enter creates "errand" on that task', wrote.some((t) => t.id === id(GOAL) && (t.labels ?? []).includes('errand')), JSON.stringify(wrote.map((t) => [t.title, t.labels])))
  await shot(page, 'l-label-picker-day', false)
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.locator(`#task-${id(LOGIC)}`).click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(EMAILS)}`).click({ modifiers: ['Control'] })
  await sleep(200)
  await page.keyboard.press('l')
  await sleep(400)
  check('l L with two rows selected → one picker for both', (await lp.count()) === 1)
  w0 = state.writes.length
  await page.keyboard.type('calls')
  await page.keyboard.press('Enter')
  await settle(state)
  wrote = posts(state, 'tasks', w0)
  check('l …"calls" goes on both selected tasks', wrote.some((t) => t.id === id(LOGIC) && (t.labels ?? []).includes('calls')) && wrote.some((t) => t.id === id(EMAILS) && (t.labels ?? []).includes('calls')), JSON.stringify(wrote.map((t) => [t.title, t.labels])))
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.keyboard.press('Escape')
  await page.keyboard.press('?')
  await sleep(500)
  check("l the cheatsheet lists \"l Labels…\" in Today's section", /l\s*Labels…/.test(await text(page.locator('[role="dialog"][aria-label="Shortcuts"]'))))
  check('l no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── W · Worth a look: Plan a step writes the step in place; Snooze a week says so ──
if (want('w')) {
  const { ctx, page, errors, state } = await open('09:40', { morning: true })
  const worth = page.locator('section[aria-label="Worth a look"]')
  const first = await text(worth.locator('.td-nudge-name'))
  const tag = first === 'Garden club' ? '#Garden ' : '#Portfolio '
  await worth.getByRole('button', { name: 'Plan a step' }).click()
  await sleep(600)
  const field = await page.evaluate(() => { const el = document.getElementById('kf-capture-input'); return el && { value: el.value, caret: el.selectionStart, focused: document.activeElement === el } })
  check(`w Plan a step (${first}) → the capture bar on "${tag}", caret after it, still on Today`, field?.focused && field.value === tag && field.caret === tag.length && page.url().endsWith('/today'), JSON.stringify(field))
  await page.keyboard.type('Sketch the beds')
  await shot(page, 'w-plan-a-step-day', false)
  await page.keyboard.press('Enter')
  await settle(state)
  const made = posts(state, 'tasks').find((t) => /Sketch the beds/.test(t.title ?? ''))
  check('w …Enter files the step into that project', made && made.project_id === (first === 'Garden club' ? pid(4) : pid(3)) && made.title === 'Sketch the beds', JSON.stringify(made && { title: made.title, project_id: made.project_id }))
  await page.keyboard.press('Escape')
  await sleep(300)
  await worth.getByRole('button', { name: 'Snooze a week' }).click()
  check('w Snooze a week → toast "Snoozed a week"', await toastSoon(page, 'Snoozed a week'))
  check('w …not "Marked reviewed"', (await page.locator('.kf-toast-msg', { hasText: 'Marked reviewed' }).count()) === 0)
  check('w no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B · the bulk bar's Top 3 on Today (the picks are full: take two out, then put one in) ──
if (want('b')) {
  const { ctx, page, errors, state } = await open('09:40', { morning: true })
  const bar = page.locator('[role="toolbar"]')
  await page.locator(`#task-${id(LOGIC)}`).click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(EMAILS)}`).click({ modifiers: ['Control'] })
  await sleep(300)
  check('b the bulk bar has Top 3', (await bar.getByRole('button', { name: /Top 3/ }).count()) >= 1, await text(bar))
  await shot(page, 'b-bulk-top3-day', false)
  let w0 = state.writes.length
  await bar.getByRole('button', { name: /Top 3/ }).first().click()
  await settle(state)
  let flipped = posts(state, 'tasks', w0)
  check('b …two picks selected → Top 3 takes both out, the selection clears', flipped.some((t) => t.id === id(LOGIC) && t.top3 === false) && flipped.some((t) => t.id === id(EMAILS) && t.top3 === false) && (await bar.count()) === 0, flipped.map((t) => `${t.title}:${t.top3}`).join(', '))
  check('b …with an Undo toast', await toastSoon(page, 'removed from Top 3'))
  await page.locator('section[aria-label="Also open"] button.td-more').click().catch(() => {})
  await sleep(300)
  await page.locator(`#task-${id(BUG)}`).click({ modifiers: ['Control'] })
  await sleep(300)
  w0 = state.writes.length
  await bar.getByRole('button', { name: /Top 3/ }).first().click()
  await settle(state)
  flipped = posts(state, 'tasks', w0)
  check('b …an open row selected → Top 3 puts it in', flipped.some((t) => t.id === id(BUG) && t.top3 === true) && (await bar.count()) === 0, flipped.map((t) => `${t.title}:${t.top3}`).join(', '))
  check('b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
