// today-looks audit (Kai 2026-10-26: "redesign the homescreen … too spacious"): Today as it is now,
// on Kai's kind of day — desktop 1280/1920 at 100/125/150 %, the phone, day and night — and how many
// task rows are wholly on screen above the fold. Read-only: it only measures and shoots.
//   node audit.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 26 Oct 2026, Cairo (UTC+3, DST until 29 Oct), 10:40. Setup copied from today-scale/verify.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5317'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 26) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const TODAY = '2026-10-26'
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
const DL = pid(1), UNI = pid(2), FLOW = pid(3), HEALTH = pid(4)
function tasksFor() {
  return [
    task(1, 'Finish the CNN backprop notes for the DL midterm', { top3: true, top3_rank: 1, project_id: DL, duration_min: 120 }),
    task(2, 'Deep Learning problem set 4 (Q1–Q3)', { top3: true, top3_rank: 2, project_id: DL, duration_min: 90 }),
    task(3, 'Email Dr. Hany the project proposal', { top3: true, top3_rank: 3, project_id: UNI, duration_min: 20 }),
    task(4, 'Review lecture 7 slides — Attention', { due_at: iso('09:00'), project_id: DL }),
    task(5, 'Watch Karpathy: makemore part 3', { duration_min: 60, scheduled_start: iso('21:00'), scheduled_end: iso('22:00'), project_id: DL }),
    task(6, 'Pay the internet bill', { due_at: iso('09:00'), recurrence_rule: 'FREQ=MONTHLY' }),
    task(7, 'Prepare the DL study group', { due_at: iso('19:00'), project_id: DL }),
    task(8, 'Pick three past-paper questions', { parent_task_id: id(7) }),
    task(9, 'Submit the CV lab report', { due_at: iso('09:00'), status: 'done', completed_at: iso('08:10'), project_id: UNI }),
    task(10, 'Email the TA about the quiz grade', { due_at: iso('09:00', 23), project_id: UNI }),
    task(11, 'Back up the laptop', { due_at: iso('09:00', 24) }),
    task(12, 'Read "Attention Is All You Need"', { project_id: DL }),
    task(13, "Fix the tray icon in Kai's Flow", { project_id: FLOW }),
    task(14, 'Buy whey protein', { project_id: HEALTH }),
    task(15, 'Renew the gym membership', { due_at: iso('09:00', 30), project_id: HEALTH }),
    task(16, 'Tidy the Drive folders'),
    task(17, 'Book the dentist'),
  ]
}
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const EVENTS = [
  ev(1, 'Lecture — Machine Learning', '08:30', '10:00'),
  ev(2, 'Lecture — Computer Vision', '11:00', '12:30'),
  ev(3, 'CNN backprop notes', '13:30', '15:30', 1),
  ev(4, 'Gym — push day', '17:00', '18:15'),
  ev(5, 'DL study group', '19:00', '20:00', 7),
  ev(6, 'Watch Karpathy: makemore part 3', '21:00', '22:00', 5),
]
const project = (p, name) => ({ id: p, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(DL, 'Deep Learning'), project(UNI, 'University'), project(FLOW, "Kai's Flow"), project(HEALTH, 'Health')]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Read 10 pages', 'morning'], ['Tidy the desk', 'evening'], ['Journal', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
function tables() {
  const log = [1, 2, 3].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  return {
    tasks: tasksFor(), calendar_events: structuredClone(EVENTS), projects: PROJECTS, app_settings: [SETTINGS], routines: ROUTINES,
    routine_completions: [{ id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') }],
    inbox_items: [], activity_log: log, time_entries: [], domains: [], areas: [], people: [], books: [], journal_entries: [], slipping: [], resurfaced_log: [],
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
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(at, o = {}) {
  const view = o.view ?? { viewport: { width: 1280, height: 800 } }
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, scale, collapsed]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo'); localStorage.setItem('kf-help:' + uid, JSON.stringify(['hint:swipe', 'hint:calendar', 'hint:inbox', 'row']))
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    if (collapsed) localStorage.setItem('kf.sidebarCollapsed', '1')
  }, [o.theme ?? 'day', JSON.stringify(session), UID, o.scale ? String(o.scale) : null, !!o.collapsed])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
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
  return { ctx, page, errors, state }
}


const shot = async (page, name) => {
  await page.evaluate(() => document.querySelector('.app-main-content')?.scrollTo(0, 0))
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
// Task rows wholly on screen (Top 3 + every list row, folded ones aren't drawn) and the page's length in screens.
const measure = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('[id^="task-"], .kf-goal-row, .tp-goal, [id^="top3-"]')].filter((e) => e.getBoundingClientRect().height > 0 && !e.parentElement.closest('[id^="task-"]'))
  let vis = 0
  for (const e of rows) { const r = e.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= innerHeight) vis++ }
  const sc = document.querySelector('.app-main-content') ?? document.scrollingElement
  const sections = [...document.querySelectorAll('section[aria-label]')].map((s) => `${s.getAttribute('aria-label')}@${Math.round(s.getBoundingClientRect().top)}`)
  return { visibleRows: vis, drawnRows: rows.length, screens: +(sc.scrollHeight / innerHeight).toFixed(2), sections }
})
const report = []
const SIZES = [['1280', { width: 1280, height: 800 }], ['1920', { width: 1920, height: 1080 }]]
for (const theme of ['day', 'night']) {
  for (const [sz, viewport] of SIZES) for (const scale of [1, 1.25, 1.5]) {
    const tag = `now-${sz}-${Math.round(scale * 100)}-${theme}`
    const { ctx, page, errors } = await open('10:40', { theme, scale, view: { viewport } })
    const m = await measure(page)
    report.push({ tag, ...m, errors })
    console.log(tag, JSON.stringify(m))
    await shot(page, tag)
    await ctx.close()
  }
  const tag = `now-phone-${theme}`
  const { ctx, page, errors } = await open('10:40', { theme, view: phone })
  const m = await measure(page)
  report.push({ tag, ...m, errors })
  console.log(tag, JSON.stringify(m))
  await shot(page, tag)
  await ctx.close()
}
// The rest of the app, for comparison: Calendar (blocks palette C, now card A) and Settings (rows A).
for (const theme of ['day', 'night']) for (const [name, at] of [['calendar', '/calendar?view=day'], ['settings', '/settings']]) {
  const { ctx, page } = await open('10:40', { theme, scale: 1, path: at })
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `app-${name}-1280-100-${theme}.png`) })
  await ctx.close()
}
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 1))
await browser.close()
