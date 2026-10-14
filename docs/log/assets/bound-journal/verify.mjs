// Bound Journal (direction B, Kai 2026-10-14) on the REAL app against a MOCKED backend: the key
// screens plus every calendar format (Day · 3 days · Week · Month, desktop and phone) and the
// calendar's states, in day and Night Garden. Recipe as calendar-phone/verify.mjs: the dev server
// runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens), a made-up session sits in
// localStorage, Playwright answers every REST call. Writes are answered 201 and go nowhere.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
//   ONLY=cal-week,today runs just those shots (prefix match); THEME=night runs one theme.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5280'
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
const THEMES = process.env.THEME ? [process.env.THEME] : ['day', 'night']

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day: Wednesday 14 Oct 2026, Cairo = UTC+3, the clock at 12:10 ──
const cairo = (hhmm, day = 14, month = 9) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month, day, h - 3, m))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const NOW = cairo('12:10')
const T = '2026-09-01T09:00:00Z'
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const SHAHEEN = { id: id('4', 1), user_id: UID, name: 'Shaheen', color: '#C9A961', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const STUDY = { id: id('4', 2), user_id: UID, name: 'Study', color: '#7E9A76', sort_order: 1, deleted_at: null, created_at: T, updated_at: T }
const project = (n, name, d, over = {}) => ({ id: id('2', n), user_id: UID, domain_id: d.id, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], deleted_at: null, created_at: T, updated_at: T, ...over })
const SITE = project(1, 'Shaheen Website', SHAHEEN)
const FORECAST = project(2, 'Forecasting app', STUDY)
const DS = project(3, 'Data Structures', STUDY)
const GCI = project(4, 'GCI course', STUDY, { status: 'archived', completion_summary: 'Fourteen tasks over six weeks. Done before the deadline.', updated_at: '2026-10-03T10:00:00Z' })
const SPRING = project(5, 'Spring reading list', STUDY, { status: 'archived', completion_summary: 'Nine books, one a fortnight.', updated_at: '2026-09-12T10:00:00Z' })

const task = (n, title, over = {}) => ({
  id: id('1', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null, slot_date: null,
  created_at: T, updated_at: T, ...over,
})
const ev = (n, title, from, to, o = {}) => ({
  id: id('e', n), user_id: UID, title, starts_at: iso(from, o.day ?? 14, o.month), ends_at: iso(to, o.day ?? 14, o.month), all_day: false, task_id: o.task ? id('1', o.task) : null,
  source: o.gcal ? 'gcal' : 'native', gcal_id: o.gcal ? `g-${n}` : null, gcal_etag: null, busy: o.busy ?? true, type: o.type ?? (o.task ? 'task' : 'event'), color: null,
  deleted_at: null, created_at: T, updated_at: T,
})
const allDay = (n, title, fromDay, toDay) => ({ ...ev(n, title, '03:00', '03:00'), starts_at: `2026-10-${String(fromDay).padStart(2, '0')}T00:00:00.000Z`, ends_at: `2026-10-${String(toDay).padStart(2, '0')}T00:00:00.000Z`, all_day: true })

const SLOT = 7 // the Study slot — a Time block that holds two tasks (0073)
const TASKS = [
  task(1, 'Call the tyre supplier about the invoice', { top3: true, top3_rank: 1, project_id: SITE.id, domain_id: SHAHEEN.id, duration_min: 30, due_at: iso('17:00'), scheduled_start: iso('11:15'), scheduled_end: iso('11:45') }),
  task(2, 'Finish the Data Structures sheet', { top3: true, top3_rank: 2, project_id: DS.id, domain_id: STUDY.id, duration_min: 90, due_at: iso('23:00') }),
  task(3, 'Reply to Omar about Thursday', { top3: true, top3_rank: 3, duration_min: 15, due_at: iso('18:00', 13), scheduled_start: iso('14:30'), scheduled_end: iso('15:00') }),
  task(4, 'Deep work: forecasting', { project_id: FORECAST.id, domain_id: STUDY.id, duration_min: 120, scheduled_start: iso('09:00'), scheduled_end: iso('11:00'), status: 'done', completed_at: iso('11:02') }),
  task(5, 'Revise linked lists', { project_id: DS.id, slot_id: id('e', SLOT), slot_date: '2026-10-14', scheduled_start: iso('12:30'), scheduled_end: iso('14:00'), duration_min: 45 }),
  task(6, 'Read chapter 4', { project_id: DS.id, slot_id: id('e', SLOT), slot_date: '2026-10-14', scheduled_start: iso('12:30'), scheduled_end: iso('14:00'), duration_min: 30 }),
  task(7, 'Book the dentist', { due_at: iso('17:00', 16), duration_min: 10 }),
  task(8, 'Pay the internet bill', { due_at: iso('17:00', 12), duration_min: 10 }),
  task(9, 'Plan the Shaheen launch post', { project_id: SITE.id, domain_id: SHAHEEN.id, due_at: iso('17:00', 16), duration_min: 45 }),
  task(10, 'Dentist', { duration_min: 60, scheduled_start: iso('16:00', 15), scheduled_end: iso('17:00', 15), due_at: iso('16:00', 15) }),
  task(11, 'Send the Q3 numbers', { status: 'done', completed_at: iso('08:40'), project_id: SITE.id }),
  ...Array.from({ length: 14 }, (_, i) => task(40 + i, `GCI task ${i + 1}`, { project_id: GCI.id, status: 'done', completed_at: '2026-10-02T10:00:00Z' })),
]
const EVENTS = [
  ev(1, 'Fajr & a walk', '05:00', '05:45', { type: 'time_block' }),
  ev(2, 'Standup', '08:30', '08:45'),
  ev(3, 'Deep work: forecasting', '09:00', '11:00', { task: 4 }),
  ev(4, 'Call with Omar', '10:15', '11:00'),
  ev(5, 'Call the tyre supplier about the invoice', '11:15', '11:45', { task: 1 }),
  ev(6, 'Lunch with Sam', '12:00', '13:00', { gcal: true }),
  ev(SLOT, 'Study slot', '12:30', '14:00', { type: 'time_block' }),
  ev(8, 'Data Structures lecture', '14:00', '15:30', { gcal: true }),
  ev(9, 'Reply to Omar about Thursday', '14:30', '15:00', { task: 3 }),
  ev(10, 'Pick up the laptop', '14:45', '15:15'),
  ev(11, 'Gym, upper body', '15:30', '16:30', { type: 'time_block' }),
  ev(12, 'Insulin check', '16:40', '16:50'),
  ev(13, 'Weekly review', '18:00', '19:00', { type: 'time_block' }),
  allDay(14, "Mum's birthday", 14, 15),
  allDay(15, 'Midterms week', 12, 17),
  ev(16, 'Shaheen sync', '10:00', '11:00', { day: 13 }),
  ev(17, 'Gym', '15:30', '16:30', { day: 13, type: 'time_block' }),
  ev(18, 'Exam: Algorithms', '09:00', '11:00', { day: 15, gcal: true }),
  ev(19, 'Dentist', '16:00', '17:00', { day: 15, task: 10 }),
  ev(20, 'Coffee with Priya', '18:30', '19:30', { day: 15 }),
  ev(21, "Jumu'ah", '12:00', '13:00', { day: 16, type: 'time_block' }),
  ev(22, 'Office hours', '10:00', '11:00', { day: 12 }),
  // a crowded day for the month view's "+N more"
  ...['Standup', 'Design review', 'Lunch with Sam', 'Lab report', 'Gym', 'Call Mum'].map((t, i) => ev(30 + i, t, `${String(9 + i * 2).padStart(2, '0')}:00`, `${String(10 + i * 2).padStart(2, '0')}:00`, { day: 21 })),
  ev(40, 'Shaheen sync', '10:00', '11:00', { day: 28 }),
  ev(41, 'Dentist follow-up', '16:00', '16:30', { day: 6 }),
  ev(42, 'Weekly review', '18:00', '19:00', { day: 7, type: 'time_block' }),
]
const ENTRY = { id: id('6', 1), user_id: UID, body: 'The forecasting build finally clicked this morning. Two hours of real deep work before the dorm woke up. I want to protect these early mornings.', entry_date: '2026-10-14', mood: 'focused', transcript: null, media_paths: [], gratitude: ['Fajr on time, then a quiet walk', 'A working forecast, finally'], deleted_at: null, created_at: iso('07:10'), updated_at: iso('07:10') }
const BOOK = { id: id('8', 1), user_id: UID, title: 'Pilgrim at Tinker Creek', author: 'Annie Dillard', published_year: 1974, current_page: 120, total_pages: 290, status: 'reading', created_at: T, updated_at: T }
const QUOTE = { id: id('8', 3), user_id: UID, text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard', source: 'The Writing Life', tags: [], book_id: BOOK.id, page: '32', created_at: T, updated_at: T }
const NOTE = { id: id('8', 2), user_id: UID, title: 'Protect the mornings', body: 'Deep work before 9, meetings after.', tags: ['pace'], domain_id: null, book_id: null, created_at: T, updated_at: T }
const settings = (view) => ({ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', calendar_default_view: view ?? null, created_at: T, updated_at: T })
const tables = (o = {}) => structuredClone({
  tasks: TASKS, calendar_events: EVENTS, projects: [SITE, FORECAST, DS, GCI, SPRING], domains: [SHAHEEN, STUDY], app_settings: [settings(o.calView)],
  journal_entries: [ENTRY], books: [BOOK], quotes: [QUOTE], notes: [NOTE], commentary: [], inbox_items: [], activity_log: [], routines: [], routine_completions: [],
  time_entries: [], people: [], interactions: [], areas: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
// Kai's screen: 1920×1080 (the app lays it out at the default 125% interface size).
const desktop = { viewport: { width: 1920, height: 1080 } }

/** Opens `route` signed in, with the day's data. o: { view, theme, calView, hold, local } */
async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, local, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() + 864e5 }))
    localStorage.setItem('sb-127-auth-token', sess)
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
  }, [o.theme ?? 'day', JSON.stringify(session), o.local ?? {}, UID])
  const rows = tables(o)
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/storage/')) return r.fulfill({ status: 200, json: {} })
    if (o.hold) await sleep(o.hold)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const list = rows[table] ?? []
    if (one) return list.length ? r.fulfill({ json: list[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: list, headers: { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install({ time: NOW })
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  // wait past the lazy route's loading dot: the page column has real text
  if (!o.hold) await page.waitForFunction(() => (document.querySelector('.app-main-content')?.innerText.trim().length ?? 0) > 60, null, { timeout: 25000 }).catch(() => {})
  await sleep(o.hold ? 900 : 1600)
  return { page, ctx, errors }
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

// ── EXPLORE=route prints the buttons on a page, to find a control's name ──
if (process.env.EXPLORE) {
  const { page, ctx } = await open(process.env.EXPLORE, { view: process.env.PHONE ? phone : desktop })
  if (process.env.CLICK) {
    await page.getByText(process.env.CLICK, { exact: true }).first().click()
    await sleep(700)
    await page.screenshot({ path: path.join(OUT, 'explore.png') })
  }
  const names = await page.$$eval('button, [role=button], a, [role=tab], [role=menuitemradio]', (els) => els.map((e) => `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 50)}"`))
  console.log([...new Set(names)].join('\n'))
  await ctx.close(); await browser.close(); process.exit(0)
}

// ── SCAN=1 lists short labels that start lower-case: copy written for CSS caps, which B no longer
// applies. Handwriting (Caveat) and inputs are skipped; the rest is for a human to judge. ──
if (process.env.SCAN) {
  const routes = ['/today', '/calendar', '/journal', '/herbarium', '/tasks', '/inbox', '/library', '/notebook', '/settings', '/projects', '/routines', '/people', '/focus', '/weekly-review', '/activity', '/trash', '/search']
  const found = new Map()
  for (const v of [desktop, phone]) {
    for (const r of routes) {
      const { page, ctx } = await open(r, { view: v })
      if (process.env.SCAN === 'caps') await page.evaluate(() => (window.__capsOnly = true))
      const hits = await page.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll('body *')) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
          if (!own || own.length > 40 || !/^[a-z]/.test(own)) continue
          const cs = getComputedStyle(el)
          if (window.__capsOnly && cs.textTransform !== 'uppercase') continue
          if (/Caveat/.test(cs.fontFamily) || cs.display === 'none' || cs.visibility === 'hidden' || el.closest('input,textarea,[contenteditable],script,style')) continue
          out.push(own)
        }
        return out
      })
      for (const h of hits) found.set(h, (found.get(h) ?? new Set()).add(r))
      await ctx.close()
    }
  }
  for (const [t, rs] of [...found].sort()) console.log(`${JSON.stringify(t).padEnd(44)} ${[...rs].join(' ')}`)
  await browser.close(); process.exit(0)
}

const SCENES = []
const scene = (name, fn) => SCENES.push({ name, fn })

// ── the key screens ──
for (const [n, route] of [['today', '/today'], ['journal', '/journal'], ['herbarium', '/herbarium'], ['tasks', '/tasks'], ['inbox', '/inbox'], ['library', '/library'], ['notebook', '/notebook'], ['settings', '/settings']]) {
  scene(`screen-${n}-phone`, async (theme) => open(route, { theme }))
  scene(`screen-${n}-desktop`, async (theme) => open(route, { theme, view: desktop }))
}

// ── calendar formats ──
for (const v of ['day', '3day', 'week']) {
  scene(`cal-${v}-desktop`, async (theme) => open('/calendar', { theme, view: desktop, calView: v }))
  scene(`cal-${v}-phone`, async (theme) => open('/calendar', { theme, calView: v }))
}
async function deskMonth(s) {
  await s.page.getByText('Week', { exact: true }).first().click()
  await sleep(400)
  await s.page.getByText('M', { exact: true }).first().click()
  await s.page.keyboard.press('Escape')
  await sleep(900)
}
scene('cal-month-desktop', async (theme) => {
  const s = await open('/calendar', { theme, view: desktop, calView: 'week' })
  await deskMonth(s)
  return s
})
scene('cal-month-phone', async (theme) => {
  const s = await open('/calendar', { theme, calView: 'day' })
  await s.page.getByRole('button', { name: 'Wednesday, Oct 14', exact: true }).click()
  await sleep(500)
  await s.page.getByText('Month', { exact: true }).first().click()
  await sleep(900)
  return s
})

// ── calendar states ──
scene('cal-empty-day-phone', async (theme) => open('/calendar?date=2026-10-17', { theme, calView: 'day' }))
scene('cal-loading-phone', async (theme) => open('/calendar', { theme, calView: 'day', hold: 6000 }))
scene('cal-loading-desktop', async (theme) => open('/calendar', { theme, view: desktop, calView: 'week', hold: 6000 }))
scene('cal-planning-desktop', async (theme) => open('/calendar', { theme, view: desktop, calView: 'day', local: { 'kf.calPlanning': '1' } }))
scene('cal-details-desktop', async (theme) => {
  const s = await open('/calendar', { theme, view: desktop, calView: 'day' })
  await s.page.locator('.fc-timegrid-event', { hasText: 'Call with Omar' }).first().click().catch(() => {})
  await sleep(900)
  return s
})
scene('cal-create-desktop', async (theme) => {
  const s = await open('/calendar', { theme, view: desktop, calView: 'day' })
  // the free hour under Lunch with Sam, left half of the lane (13:00–14:00)
  const lane = await s.page.locator('.fc-timegrid-slot-lane[data-time="13:00:00"]').first().boundingBox()
  await s.page.mouse.move(lane.x + lane.width * 0.15, lane.y + 3)
  await s.page.mouse.down()
  await s.page.mouse.move(lane.x + lane.width * 0.15, lane.y + 55, { steps: 8 })
  await s.page.mouse.up()
  await sleep(900)
  return s
})
scene('cal-drag-desktop', async (theme) => {
  const s = await open('/calendar', { theme, view: desktop, calView: 'day' })
  const b = await s.page.locator('.fc-timegrid-event', { hasText: 'Call with Omar' }).first().boundingBox()
  await s.page.mouse.move(b.x + b.width / 2, b.y + 12)
  await s.page.mouse.down()
  for (let i = 1; i <= 24; i++) { await s.page.mouse.move(b.x + b.width / 2 - i, b.y + 12 + i * 6); await sleep(25) }
  await sleep(600)
  return s // screenshot mid-drag (button still held)
})
scene('cal-more-desktop', async (theme) => {
  const s = await open('/calendar', { theme, view: desktop, calView: 'week' })
  await deskMonth(s)
  await s.page.locator('.fc-daygrid-more-link').first().click()
  await sleep(700)
  return s
})
scene('cal-block-sheet-phone', async (theme) => {
  const s = await open('/calendar', { theme, calView: 'day' })
  await s.page.locator('.pc-block', { hasText: 'Gym' }).first().click().catch(() => {})
  await sleep(900)
  return s
})
scene('cal-create-phone', async (theme) => {
  const s = await open('/calendar', { theme, calView: 'day' })
  // the free half-hour at 13:30, left of the Study slot (Lunch ends 13:00, the lecture starts 14:00)
  const h = await s.page.getByText('13:00', { exact: true }).first().boundingBox()
  await s.page.touchscreen.tap(h.x + 110, h.y + 34)
  await sleep(900)
  return s
})
scene('cal-unscheduled-phone', async (theme) => {
  const s = await open('/calendar', { theme, calView: 'day' })
  await s.page.locator('button', { hasText: /^Today\s*1$/ }).first().click()
  await sleep(900)
  return s
})

for (const { name, fn } of SCENES) {
  for (const theme of THEMES) {
    const key = `${name}-${theme}`
    if (!want(key)) continue
    let s
    try {
      s = await fn(theme)
      await shot(s.page, key)
      const err = s.errors.filter((e) => !/ResizeObserver|AbortError/.test(e))
      check(key, err.length === 0, err[0] ?? '')
    } catch (e) {
      check(key, false, e.message.split('\n')[0])
    } finally {
      await s?.ctx.close().catch(() => {})
    }
  }
}

fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
process.exit(failed ? 1 : 0)
