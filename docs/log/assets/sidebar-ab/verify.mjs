// sidebar-ab: Kai's picks from design-export/Sidebar options.html (2026-10-22) — icons A (one kf line icon on
// every nav row, open and on the rail; no dots, flowers or species art) and bottom B (a wide Capture button with
// Search and Chat at the foot, tooltips with keycaps; Settings, Guide, Sign out, the streak and the sync status in
// the menu under the name). Day and night × 100 / 125 / 150% × open and rail, plus the keys, the open Plan drawer
// and the phone. Mocked backend and fixture copied verbatim from today-shell/verify.mjs (open() also takes the
// interface size, the rail and the Plan drawer).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3). Desktop 1280×800; phone 390×844.
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
  await ctx.addInitScript(([t, sess, uid, scale, collapsed, planOpen]) => {
    localStorage.setItem('kf_ui_scale', scale); localStorage.setItem('kf.sidebarCollapsed', collapsed); localStorage.setItem('kf.planOpen', planOpen)
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, String(o.scale ?? 1.25), o.collapsed ? '1' : '0', o.planOpen ? '1' : '0'])
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


const shot = async (page, name) => {
  await page.mouse.move(640, 400)
  await page.locator('.app-sidebar').screenshot({ path: path.join(OUT, `${name}.png`) })
}
const inView = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5
}, sel)
const menuItems = (page) => page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
async function openMenu(page) {
  await page.locator('.kf-side-me').click()
  await page.locator('[role="menu"]').waitFor({ timeout: 4000 })
}
const esc = async (page) => { await page.keyboard.press('Escape'); await sleep(350) }

// ── 1 · every combination: icons A on every row, bottom B in view, each part does its job ──
const SCALES = [1, 1.25, 1.5]
for (const theme of ['day', 'night']) {
  for (const scale of SCALES) {
    for (const collapsed of [false, true]) {
      const tag = `${theme} @${scale * 100}% ${collapsed ? 'rail' : 'open'}`
      const { ctx, page, errors } = await open('10:00', {}, { theme, scale, collapsed })

      // Icons A: one kf line icon per nav row; no image of any kind in the nav, the Plan drawer or the foot.
      const nav = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('nav[data-tour="sidebar"] a')]
        const sb = document.querySelector('.app-sidebar')
        return {
          rows: rows.length,
          withIcon: rows.filter((a) => a.querySelector('.kf-nav-icon > svg[viewBox="0 0 24 24"]')).length,
          imgs: [...sb.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter((src) => src !== '/icon-192.png'),
          dots: rows.filter((a) => [...a.querySelectorAll('span')].some((s) => getComputedStyle(s).borderRadius === '50%' && s.offsetWidth === 8)).length,
          active: document.querySelector('nav[data-tour="sidebar"] a.kf-active')?.textContent.trim(),
        }
      })
      check(`${tag}: 13 nav rows, each with its line icon`, nav.rows === 13 && nav.withIcon === 13, JSON.stringify(nav))
      check(`${tag}: no watercolour / species image and no plain dot in the sidebar`, nav.imgs.length === 0 && nav.dots === 0, JSON.stringify(nav.imgs))
      check(`${tag}: Today is the active row`, /Today/.test(nav.active ?? ''), nav.active)

      // Bottom B: Capture (wide when open), Search, Chat, in view; the header button in view.
      const tools = await page.evaluate(() => [...document.querySelectorAll('.app-sidebar-footer button')].map((b) => b.getAttribute('aria-label')))
      check(`${tag}: the foot is Capture · Search · Chat`, JSON.stringify(tools) === '["Capture","Search","Chat"]', JSON.stringify(tools))
      check(`${tag}: the foot and the name button are in view`, (await inView(page, '.app-sidebar-footer .kf-side-capture')) && (await inView(page, '.app-sidebar-footer button:last-child')) && (await inView(page, '.kf-side-me')))
      check(`${tag}: the sync dot rides the app icon`, (await page.locator('.kf-side-me-icon .kf-side-sync-dot').count()) === 1)
      if (!collapsed) check(`${tag}: Capture reads "Capture ⌘ K"`, /Capture/.test(await page.locator('.kf-side-capture').innerText()) && (await page.locator('.kf-side-capture kbd').count()) === 2)
      await shot(page, `sidebar-${theme}-${scale * 100}-${collapsed ? 'rail' : 'open'}`)

      // Hover a tool: its name and keys float beside it (above when open, to the right on the rail).
      await page.locator('.app-sidebar-footer button[aria-label="Search"]').hover()
      await sleep(250)
      const tip = await page.evaluate(() => {
        const t = document.querySelector('.kf-tool-tip'), b = document.querySelector('.app-sidebar-footer button[aria-label="Search"]')
        if (!t) return null
        const r = t.getBoundingClientRect(), br = b.getBoundingClientRect()
        return { text: t.textContent, keys: t.querySelectorAll('kbd').length, above: r.bottom <= br.top + 1, right: r.left >= br.right - 1, inWin: r.top >= 0 && r.right <= innerWidth }
      })
      check(`${tag}: hovering Search shows "Search" + its keycaps, ${collapsed ? 'to the right' : 'above'}`, tip && /^Search/.test(tip.text) && tip.keys === 2 && (collapsed ? tip.right : tip.above) && tip.inWin, JSON.stringify(tip))
      if (theme === 'day' && scale === 1.25) await page.screenshot({ path: path.join(OUT, `tip-${collapsed ? 'rail' : 'open'}.png`), clip: { x: 0, y: 560, width: 480, height: 240 } }) // the pointer stays on Search
      await page.mouse.move(640, 400)

      // A press on a row's icon is a click, even with its label floating out (rail) — React 19 used to
      // re-write the glyph under the press (components/Icon.tsx).
      await page.locator('nav[data-tour="sidebar"] a[href="/calendar"] .kf-nav-icon svg').hover()
      await sleep(200)
      await page.locator('nav[data-tour="sidebar"] a[href="/calendar"] .kf-nav-icon svg').click()
      check(`${tag}: a click on Calendar's icon goes to /calendar`, await page.waitForURL(/\/calendar$/, { timeout: 4000 }).then(() => true, () => false), page.url())
      await page.locator('nav[data-tour="sidebar"] a[href="/today"]').click()
      await page.waitForURL(/\/today$/, { timeout: 4000 }).catch(() => {})
      await sleep(400)

      // Capture / Search / Chat open what they opened before.
      await page.locator('.app-sidebar-footer button[aria-label="Capture"]').click()
      check(`${tag}: Capture opens the capture bar, focused`, await page.locator('#kf-capture-input').waitFor({ timeout: 4000 }).then(() => page.evaluate(() => document.activeElement?.id === 'kf-capture-input'), () => false))
      await esc(page)
      await page.locator('.app-sidebar-footer button[aria-label="Search"]').click()
      check(`${tag}: Search opens search`, await page.getByPlaceholder('Search the garden…').waitFor({ timeout: 4000 }).then(() => true, () => false))
      await esc(page)
      await page.locator('.app-sidebar-footer button[aria-label="Chat"]').click()
      check(`${tag}: Chat opens chat`, await page.getByPlaceholder('Ask about your day…').waitFor({ timeout: 4000 }).then(() => true, () => false))
      await esc(page)

      // The name menu: the streak, Settings, Guide, the sync status, Sign out — each works.
      await openMenu(page)
      const items = await menuItems(page)
      const streak = await page.locator('[role="menu"] .kf-side-streak').innerText().catch(() => '')
      check(`${tag}: the name menu holds the streak, Settings, Guide, Synced, Sign out`,
        /1-day streak/.test(streak) && /best 1 · day 12/.test(streak) && items.length === 4 && /^Settings/.test(items[0]) && /^Guide/.test(items[1]) && /^Synced/.test(items[2]) && /^Sign out/.test(items[3]),
        JSON.stringify({ streak, items }))
      const menuIn = await page.evaluate(() => { const r = document.querySelector('[role="menu"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth })
      check(`${tag}: the menu sits in the window`, menuIn)
      check(`${tag}: the menu's sync row has its dot`, (await page.locator('[role="menu"] .kf-side-sync-dot[data-sync]').count()) === 1)
      await shot(page, `menu-${theme}-${scale * 100}-${collapsed ? 'rail' : 'open'}`)
      if (theme === 'day' && scale === 1.25 && !collapsed) await page.screenshot({ path: path.join(OUT, 'menu-window-day-125.png') })
      await page.getByRole('menuitem', { name: /^Synced/ }).click()
      check(`${tag}: Synced opens the sync popover ("All caught up.")`, await page.locator('.kf-sync-pop', { hasText: 'All caught up.' }).waitFor({ timeout: 3000 }).then(() => true, () => false))
      if (theme === 'night' && scale === 1.25 && !collapsed) { await sleep(300); await page.screenshot({ path: path.join(OUT, 'sync-pop-night-125.png') }) }
      await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))) // a press elsewhere
      await sleep(250)
      check(`${tag}: a press elsewhere closes it`, (await page.locator('.kf-sync-pop').count()) === 0)
      await openMenu(page)
      await page.getByRole('menuitem', { name: /^Settings/ }).click()
      check(`${tag}: Settings goes to /settings`, await page.waitForURL(/\/settings$/, { timeout: 4000 }).then(() => true, () => false))
      await openMenu(page)
      await page.getByRole('menuitem', { name: /^Guide/ }).click()
      check(`${tag}: Guide goes to /guide`, await page.waitForURL(/\/guide$/, { timeout: 4000 }).then(() => true, () => false))
      await openMenu(page)
      await page.getByRole('menuitem', { name: /^Sign out/ }).click()
      check(`${tag}: Sign out signs out`, await page.waitForURL(/\/sign-in/, { timeout: 6000 }).then(() => true, () => false), page.url())
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// ── 2 · the keys still work (⌘K, ⌘/, ⌘J, ⌘,) ──
{
  const { ctx, page, errors } = await open('10:00', {}, { scale: 1.25 })
  await page.keyboard.press('Control+k')
  check('keys Ctrl+K opens the capture bar', await page.locator('#kf-capture-input').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await esc(page)
  await page.keyboard.press('Control+/')
  check('keys Ctrl+/ opens search', await page.getByPlaceholder('Search the garden…').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await esc(page)
  await page.keyboard.press('Control+j')
  check('keys Ctrl+J opens chat', await page.getByPlaceholder('Ask about your day…').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await esc(page)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+,')
  check('keys Ctrl+, goes to Settings', await page.waitForURL(/\/settings$/, { timeout: 4000 }).then(() => true, () => false), page.url())
  // Esc closes the name menu; Tab reaches the name button and Enter opens it.
  await page.locator('.kf-side-me').focus()
  await page.keyboard.press('Enter')
  check('keys Enter on the name button opens its menu', await page.locator('[role="menu"]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await esc(page)
  check('keys Esc closes it', (await page.locator('[role="menu"]').count()) === 0)
  check('keys no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3 · the Plan drawer open: Someday and the + are line icons too ──
{
  const { ctx, page, errors } = await open('10:00', {}, { scale: 1.25, planOpen: true })
  const plan = await page.evaluate(() => {
    const box = document.querySelector('.app-smartlist')
    return { imgs: box.querySelectorAll('img').length, svgs: box.querySelectorAll('svg').length, someday: !!box.querySelector('a[href="/tasks?list=someday"] svg'), plus: !!box.querySelector('button[aria-label="New smart list"] svg') }
  })
  check('plan the open drawer: Plan, Someday and + are line icons, no images', plan.imgs === 0 && plan.someday && plan.plus && plan.svgs >= 3, JSON.stringify(plan))
  await page.locator('.app-sidebar').screenshot({ path: path.join(OUT, 'plan-open-day-125.png') })
  check('plan no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4 · the phone keeps its own tab bar; the sidebar stays hidden ──
{
  const { ctx, page, errors } = await open('10:00', {}, { view: phone })
  const m = await page.evaluate(() => ({ sidebar: getComputedStyle(document.querySelector('.app-sidebar')).display, tabbar: !!document.querySelector('.app-tabbar') && getComputedStyle(document.querySelector('.app-tabbar')).display }))
  check('phone the sidebar is hidden, the tab bar shows', m.sidebar === 'none' && m.tabbar === 'flex', JSON.stringify(m))
  check('phone no second sync dot (the top bar has the words)', (await page.locator('.kf-side-sync-dot').count()) === 0)
  await page.screenshot({ path: path.join(OUT, 'phone-day.png') })
  check('phone no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
