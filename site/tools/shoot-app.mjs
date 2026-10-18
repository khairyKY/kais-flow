// The homepage's app screenshots: the REAL app (../app) against a MOCKED backend, one believable day
// (Friday 16 Oct 2026, a CS student in Cairo), day + night → site/public/shots/<name>-<theme>.webp.
// Re-run it each release so the pictures match the app.
//
//   1. app/.env.shots.local (gitignored):  VITE_SUPABASE_URL=https://kaisflow.supabase.co
//                                          VITE_SUPABASE_ANON_KEY=mock-anon-key
//      (not a real project — a plausible address for Settings → AI assistants to show; any URL works)
//   2. cd app && npx vite --mode shots --port 5246 --strictPort       (leave it running)
//   3. PW=<path to playwright-core/index.mjs> node site/tools/shoot-app.mjs [baseUrl=http://localhost:5246] [only=today-desk,week-desk,…]
//
// Nothing leaves the machine: Playwright answers every call to that address (REST, auth, edge
// functions) from the tables below, keeps writes in memory, and never opens its realtime socket. PNGs are kept in <tmp>/kf-shots/ for checking; the
// WebPs (Python + Pillow: quality 86, method 6) go to site/public/shots/. Phones are 390×844 @2x,
// desktop 1440×900 @1.5x. Use http://localhost (Vite binds IPv6), not 127.0.0.1.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PNG = path.join(os.tmpdir(), 'kf-shots'), OUT = path.join(ROOT, 'public', 'shots')
const BASE = process.argv[2] ?? 'http://localhost:5246'
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null
// The backend the dev server was started with (= its VITE_SUPABASE_URL).
const BACKEND = fs.readFileSync(path.join(ROOT, '..', 'app', '.env.shots.local'), 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim().replace(/\/$/, '')
const { chromium } = await import(process.env.PW ? pathToFileURL(process.env.PW).href : 'playwright-core')
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(PNG, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── the session (made up; the mock answers /auth/v1/user) ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000051e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'kai@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'shots', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const AUTH_KEY = `sb-${new URL(BACKEND).hostname.split('.')[0]}-auth-token`

// ── the clock: Cairo is UTC+3 in October 2026 ──
const cairo = (hhmm, day = 16) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const dayKey = (day) => `2026-10-${String(day).padStart(2, '0')}`
const T0 = '2026-08-20T09:00:00.000Z'
const uuid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── where things live ──
const STUDY = { id: uuid('d', 1), user_id: UID, name: 'Study', color: '#7E9A76', sort_order: 1, created_at: T0, updated_at: T0 }
const WORK = { id: uuid('d', 2), user_id: UID, name: 'Work', color: '#B07A5A', sort_order: 2, created_at: T0, updated_at: T0 }
const HOME = { id: uuid('d', 3), user_id: UID, name: 'Home', color: '#8A8FB8', sort_order: 3, created_at: T0, updated_at: T0 }
const project = (n, name, domain) => ({ id: uuid('b', n), user_id: UID, domain_id: domain.id, area_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: T0, updated_at: T0 })
const DS = project(1, 'Data Structures', STUDY), GCI = project(2, 'GCI course', STUDY), SHAHEEN = project(3, 'Shaheen', WORK)
const inP = (p) => ({ project_id: p.id, domain_id: p.domain_id })

// ── tasks ──
const tid = (n) => uuid('1', n)
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, sort_order: null, created_at: iso('20:00', 13), updated_at: iso('20:00', 13), ...over,
})
const done = (at, day = 16) => ({ status: 'done', completed_at: iso(at, day) })
const SHEET = 1, NOTES = 2, Q1 = 3, Q2 = 4, TYRE = 5, OMAR = 6, PLANTS = 7, DENTIST = 8, LECT4 = 9, TREES = 10, REPORT = 11, PAPER = 12, INVOICES = 13, LAB = 14, MUM = 15, RENT = 16
const SLOT = 6 // the Study slot's event number
const PARENT = 'Finish the Data Structures sheet'
const inSlot = { slot_id: uuid('e', SLOT), slot_date: dayKey(16), scheduled_start: iso('16:45'), scheduled_end: iso('19:15') }

/** The day's tasks; `top` = the Top 3 is already picked (after the morning plan). */
function tasks({ top = true } = {}) {
  const t3 = (rank) => (top ? { top3: true, top3_rank: rank } : {})
  return [
    task(SHEET, PARENT, { due_at: iso('09:00'), ...inP(DS), ...t3(1) }),
    task(NOTES, 'Read the linked lists notes', { parent_task_id: tid(SHEET), ...done('10:20'), ...inP(DS) }),
    task(Q1, 'Questions 1–5', { parent_task_id: tid(SHEET), due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:45'), duration_min: 45, ...inP(DS), created_at: iso('20:01', 13) }),
    task(Q2, 'Questions 6–10', { parent_task_id: tid(SHEET), duration_min: 45, ...inP(DS), created_at: iso('20:02', 13), ...inSlot }),
    task(TYRE, 'Call the tyre supplier about the invoice', { due_at: iso('09:00'), duration_min: 15, ...inP(SHAHEEN), ...t3(2) }),
    task(OMAR, 'Reply to Omar about Thursday', { due_at: iso('09:00'), duration_min: 10, ...t3(3) }),
    task(PLANTS, 'Water the plants', { due_at: iso('09:00'), duration_min: 10, domain_id: HOME.id }),
    task(DENTIST, 'Book the dentist', { due_at: iso('09:00'), duration_min: 5, domain_id: HOME.id }),
    task(LECT4, 'Watch GCI lecture 4', { duration_min: 40, ...inP(GCI), ...inSlot }),
    task(TREES, 'Revise trees for Sunday’s quiz', { duration_min: 30, ...inP(DS), ...inSlot }),
    task(REPORT, 'Send the lab report to Dr. Hany', { due_at: iso('09:00'), ...inP(DS), ...done('11:05') }),
    task(PAPER, 'Buy printer paper', { due_at: iso('09:00'), domain_id: HOME.id, ...done('12:40') }),
    task(INVOICES, 'Check October invoices', { due_at: iso('09:00', 18), duration_min: 30, ...inP(SHAHEEN) }),
    task(LAB, 'Prepare the lab groups list', { due_at: iso('09:00', 17), duration_min: 20, ...inP(DS) }),
    task(MUM, 'Pick up Mum’s cake', { due_at: iso('09:00'), domain_id: HOME.id, ...done('12:10') }),
    task(RENT, 'Transfer the rent', { due_at: iso('09:00', 19), domain_id: HOME.id }),
  ]
}

// ── the calendar: ours (native), Time blocks, and Google's (read-only, their own colours) ──
const PRAYER = { id: 'prayer@group.calendar.google.com', name: 'Prayer times', color: '#9fe1e7' }
const FAMILY = { id: 'family0123@group.calendar.google.com', name: 'Family', color: '#f691b2' }
const KAI = { id: 'kai@example.com', name: 'Kai', color: '#4986e7' }
const ev = (n, title, from, to, day = 16, over = {}) => ({
  id: uuid('e', n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: T0, updated_at: T0,
  recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, ...over,
})
const block = (n, title, from, to, day, over = {}) => ev(n, title, from, to, day, { type: 'time_block', ...over })
const taskBlock = (n, taskN, title, from, to, day = 16) => ev(n, title, from, to, day, { type: 'task', task_id: tid(taskN) })
const google = (n, title, from, to, day, cal, over = {}) => ev(n, title, from, to, day, {
  source: 'gcal', gcal_id: `g${n}`, gcal_etag: '"1"', color: cal.color, external_ref: { source: 'gcal', id: `${cal.id}/g${n}`, calendar: cal.name, calendar_id: cal.id }, ...over,
})
const allDay = (day) => ({ all_day: true, starts_at: `${dayKey(day)}T00:00:00.000Z`, ends_at: `${dayKey(day + 1)}T00:00:00.000Z` })
const EVENTS = [
  // Friday 16 — today
  ev(1, 'Data Structures lecture', '14:00', '15:30', 16, { project_id: DS.id }),
  taskBlock(2, Q1, 'Questions 1–5', '16:00', '16:45'),
  google(3, 'Jumu’ah', '12:00', '12:45', 16, PRAYER),
  google(4, 'Mum’s birthday', '00:00', '00:00', 16, FAMILY, allDay(16)),
  ev(5, 'Gym, upper body', '19:30', '20:30'),
  block(SLOT, 'Study slot', '16:45', '19:15', 16, { project_id: DS.id }),
  google(7, 'Dinner at Mum’s', '20:45', '21:20', 16, FAMILY),
  // the rest of the week
  block(10, 'GCI course · module 3', '10:00', '12:00', 19, { project_id: GCI.id }),
  ev(11, 'Lunch with Omar', '13:30', '14:30', 19),
  ev(12, 'Gym, legs', '18:00', '19:15', 19),
  block(13, 'Shaheen · supplier calls', '09:30', '11:30', 20, { project_id: SHAHEEN.id }),
  ev(14, 'Data Structures lab', '15:00', '17:00', 20, { project_id: DS.id }),
  google(15, 'Dhuhr', '12:00', '12:20', 21, PRAYER),
  ev(16, 'Data Structures lecture', '14:00', '15:30', 21, { project_id: DS.id }),
  block(17, 'Study slot', '19:00', '20:30', 21, { project_id: DS.id }),
  block(18, 'Shaheen · invoices', '10:00', '12:00', 22, { project_id: SHAHEEN.id }),
  google(19, 'Coffee with Youssef', '17:00', '18:00', 22, KAI),
  ev(20, 'Gym, back', '18:30', '19:45', 22),
  google(21, 'Family lunch', '14:00', '16:00', 17, FAMILY),
  block(22, 'Revise for the quiz', '10:00', '11:30', 17, { project_id: DS.id }),
  ev(23, 'Data Structures quiz', '10:00', '11:00', 18, { project_id: DS.id }),
  google(24, 'Dhuhr', '12:00', '12:20', 18, PRAYER),
  block(25, 'GCI course · module 4', '13:00', '15:00', 18, { project_id: GCI.id }),
  google(26, 'Dhuhr', '12:00', '12:20', 19, PRAYER),
  google(27, 'Dhuhr', '12:00', '12:20', 20, PRAYER),
  google(28, 'Dhuhr', '12:00', '12:20', 22, PRAYER),
  google(29, 'Dhuhr', '12:00', '12:20', 17, PRAYER),
]

// ── routines with real streaks ──
const R = { user_id: UID, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, domain_id: null, goal_days: null, steps: [], step_minutes: [], created_at: T0, updated_at: T0 }
const ROUTINES = [
  { ...R, id: uuid('7', 1), name: 'Morning pages', time_of_day: 'morning', plant: 'fern', steps: ['One page, no editing'] },
  { ...R, id: uuid('7', 2), name: 'Walk', time_of_day: 'afternoon', plant: 'daisy', steps: ['Shoes on', 'Out the door'], step_minutes: [null, 20] },
  { ...R, id: uuid('7', 3), name: 'Read 20 pages', time_of_day: 'evening', plant: 'cherry' },
]
/** `n` days in a row ending `fromDay` (Oct), for routine `r`. */
const streak = (r, n, fromDay) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, fromDay - i))
  return { id: `${r.id.slice(0, 30)}${String(i).padStart(6, '0')}`, user_id: UID, routine_id: r.id, completed_on: d.toISOString().slice(0, 10), created_at: T0 }
})
const completions = (today) => [...streak(ROUTINES[0], today ? 15 : 14, today ? 16 : 15), ...streak(ROUTINES[1], 9, 15), ...streak(ROUTINES[2], 6, 15)]

const act = (n, event_type, entity_type, entity_id, payload, at, day = 16) => ({ id: uuid('a', n), user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at, day) })
const SETTINGS = {
  id: uuid('5', 1), user_id: UID, onboarded_at: '2026-08-20T09:00:00Z', display_name: 'Kai', workspace_name: 'Kai’s Flow', timezone: 'Africa/Cairo',
  weekend_days: [5, 6], help_seen: ['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox'], created_at: T0, updated_at: T0, notifications_last_seen_at: iso('21:00', 16),
}
const GOOGLE_ROW = { provider: 'google', updated_at: iso('07:00'), login: 'kai@example.com', status: 'ok', synced_at: iso('13:02'), repos: null, rules: null, calendars: [KAI, PRAYER, FAMILY], chosen: [KAI.id, PRAYER.id, FAMILY.id], can_write: true, mirror: null }
const journal = (n, day, body) => ({ id: uuid('6', n), user_id: UID, entry_date: dayKey(day), body, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: iso('22:00', day), updated_at: iso('22:00', day) })
const inbox = (n, raw_text, kind, at, day) => ({ id: uuid('9', n), user_id: UID, kind, raw_text, transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: iso(at, day), updated_at: iso(at, day) })
const MCP_KEY = { id: uuid('c', 1), scope: 'read_write', scopes: ['journal'], created_at: iso('20:00', 3), updated_at: iso('20:00', 3), last_used_at: iso('12:58') }

/** The tables for one scene. */
function tables(scene) {
  const plan = scene === 'plan', shut = scene === 'shut'
  const t = tasks({ top: !plan })
  // By 21:30: these got done too; the Top 3's goal, the dentist and the slot's tasks are left.
  const doneBy = { [tid(TYRE)]: '15:40', [tid(OMAR)]: '13:20', [tid(PLANTS)]: '19:50', [tid(Q1)]: '16:40' }
  if (shut) for (const x of t) if (doneBy[x.id]) Object.assign(x, done(doneBy[x.id]))
  // This week's review was closed at lunch, so Today doesn't ask for it.
  const log = [act(2, 'review.week_closed', 'review', `week-${dayKey(11)}`, { week: dayKey(11) }, '12:50')]
  if (plan) {
    // Last night's Shut down planted two seeds for today.
    log.push(...[SHEET, TYRE].map((n, i) => act(10 + i, 'ritual.seeded', 'task', tid(n), { ritual: 'evening', step: 'seeds', for_date: dayKey(16), date: dayKey(15) }, '21:40', 15)))
  } else {
    log.push(act(1, 'ritual.finished', 'ritual', `morning-${dayKey(16)}`, { ritual: 'morning', date: dayKey(16), steps: ['overdue', 'inbox', 'top3', 'block'] }, '07:52'))
  }
  return {
    app_settings: [SETTINGS], domains: [STUDY, WORK, HOME], areas: [], projects: [DS, GCI, SHAHEEN], tasks: t, calendar_events: EVENTS,
    routines: ROUTINES, routine_completions: completions(!plan), activity_log: log, integrations: [GOOGLE_ROW], mcp_keys: [MCP_KEY],
    inbox_items: plan ? [inbox(1, 'idea: flashcards for the graph algorithms', 'voice', '23:10', 15), inbox(2, 'ask Omar for the lab slides', 'text', '18:30', 15)] : [],
    journal_entries: [journal(1, 15, 'Got the lab working. Tired, but a good day.'), journal(2, 14, 'Lecture ran long; the trees finally clicked.')],
    time_entries: shut ? [
      { id: uuid('8', 1), user_id: UID, project_id: DS.id, task_id: tid(Q1), note: null, duration_min: 45, started_at: iso('16:00'), ended_at: iso('16:45'), created_at: iso('16:45'), updated_at: iso('16:45') },
      { id: uuid('8', 2), user_id: UID, project_id: DS.id, task_id: null, note: null, duration_min: 75, started_at: iso('09:30'), ended_at: iso('10:45'), created_at: iso('10:45'), updated_at: iso('10:45') },
    ] : [],
    people: [], interactions: [], notes: [], books: [], quotes: [], captures: [], capture_keys: [], push_subscriptions: [], slipping: [], resurfaced_log: [], commentary: [], ai_usage: [],
  }
}

// PostgREST's event_type filter on activity_log (the rituals read their own events).
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 }

async function open({ view, theme, route, at, scene = 'day', init = {} }) {
  const ctx = await browser.newContext({ ...view, timezoneId: 'Africa/Cairo', locale: 'en-US', permissions: ['microphone'], colorScheme: theme === 'night' ? 'dark' : 'light' })
  await ctx.addInitScript(([t, key, sess, uid, extra]) => {
    if (sessionStorage.getItem('kf-shots')) return
    sessionStorage.setItem('kf-shots', '1')
    const ls = {
      kf_theme: t, [key]: sess, 'kf-app-zone': 'Africa/Cairo', 'kf-download-bar-dismissed': '1', kf_tour_done: '1', 'kf.captureHint': '9',
      [`kf-whats-new:${uid}`]: JSON.stringify({ seen: 'v999.0.0', notified: 'v999.0.0', checkedAt: Date.now() }),
      [`kf-help:${uid}`]: JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']),
      ...extra,
    }
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
    // A quiet fake mic for the voice shot: a soft tone the pill's bars follow.
    const real = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    if (real) navigator.mediaDevices.getUserMedia = async (c) => {
      if (!c || !c.audio) return real(c)
      const ac = new AudioContext(), osc = ac.createOscillator(), gain = ac.createGain(), dst = ac.createMediaStreamDestination()
      osc.frequency.value = 180
      gain.gain.value = 0.35
      osc.connect(gain).connect(dst)
      osc.start()
      await ac.resume()
      return dst.stream
    }
  }, [theme, AUTH_KEY, JSON.stringify(session), UID, init])
  const state = { rows: tables(scene), hold: null }
  // No realtime socket: nothing to subscribe to.
  await ctx.routeWebSocket(/.*/, (ws) => { if (!ws.url().startsWith(BACKEND.replace('http', 'ws'))) ws.connectToServer() })
  await ctx.route(`${BACKEND}/**`, async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    const CORS = { 'access-control-allow-origin': '*' }
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (p.startsWith('/functions/v1/')) {
      if (state.hold && p.endsWith('/transcribe')) await state.hold
      return r.fulfill({ json: p.endsWith('/transcribe') ? { text: 'Call Omar Friday at 5 about the lab groups' } : {}, headers: CORS }).catch(() => {})
    }
    const table = p.replace('/rest/v1/', '')
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try { body = JSON.parse(req.postData() ?? '[]') } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        if (i >= 0) list[i] = { ...list[i], ...row }
        else list.push({ created_at: new Date().toISOString(), ...row })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(at) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
}
/** No toasts, no dev overlays in a picture. */
async function clean(page) {
  await page.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove()))
  for (let i = 0; i < 30 && (await page.locator('.kf-toast-msg').count()); i++) await sleep(250)
}
const written = []
async function shoot(page, name, theme, errors) {
  await clean(page)
  const file = path.join(PNG, `${name}-${theme}.png`)
  await page.screenshot({ path: file })
  written.push(file)
  console.log(`${name}-${theme}${errors.length ? '  ! page errors: ' + errors.join(' | ') : ''}`)
}

// ═══ the shots ═══
const SHOTS = {
  // 1 · desktop Today at 13:10: the goal page, Top 3 with the sheet's subtasks, the day strip, rituals
  'today-desk': async (theme) => {
    const s = await open({ view: DESK, theme, route: '/today', at: '13:10' })
    await shoot(s.page, 'today-desk', theme, s.errors)
    await s.ctx.close()
  },
  // 2 · the same day on the phone, top of the page
  'today-phone': async (theme) => {
    const s = await open({ view: PHONE, theme, route: '/today', at: '13:10' })
    await shoot(s.page, 'today-phone', theme, s.errors)
    await s.ctx.close()
  },
  // 3 · Plan my day at 07:40: the picks (last night's seeds + one more) with their suggested times
  'plan-phone': async (theme) => {
    const s = await open({ view: PHONE, theme, route: '/today', at: '07:40', scene: 'plan' })
    const { page, cdp } = s
    await tap(cdp, page.locator('.tp-ritual').getByRole('button', { name: /^(Plan|Resume)$/ }))
    await sleep(600)
    await tap(cdp, page.locator(`[id="rt-${tid(OMAR)}"] .kf-star`))
    await sleep(400)
    await page.locator('.rt-sec:has(.rt-label:text-matches("Suggested", "i"))').first().evaluate((e) => e.scrollIntoView({ block: 'start' }))
    await sleep(500)
    await shoot(page, 'plan-phone', theme, s.errors)
    await s.ctx.close()
  },
  // 4 · the desktop week: blocks, the Study slot holding its tasks, Google's events, the now-line
  'week-desk': async (theme) => {
    const s = await open({ view: DESK, theme, route: '/calendar', at: '13:10', init: { 'kf.calRailFolded': '1', 'kf.calTrayFolded': '1' } })
    await s.page.locator('.fc-timegrid-slot[data-time="12:00:00"]').first().evaluate((e) => e.scrollIntoView({ block: 'start' }))
    await sleep(500)
    await shoot(s.page, 'week-desk', theme, s.errors)
    await s.ctx.close()
  },
  // 5 · the phone's day with the Study slot and the tasks in it
  'slot-phone': async (theme) => {
    const s = await open({ view: PHONE, theme, route: '/calendar', at: '13:10' })
    await s.page.getByText('Study slot').first().evaluate((e) => e.scrollIntoView({ block: 'center' }))
    await sleep(500)
    await shoot(s.page, 'slot-phone', theme, s.errors)
    await s.ctx.close()
  },
  // 6 · Sotto: hold the capture button, slide up → hands-free, the pill listening over Today
  'voice-phone': async (theme) => {
    const s = await open({ view: PHONE, theme, route: '/today', at: '13:10' })
    const { page, cdp } = s
    const b = await page.locator('.kf-capture').boundingBox()
    const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await touch(cdp, 'touchStart', [p])
    await sleep(700)
    for (let dy = 20; dy <= 120; dy += 20) {
      await touch(cdp, 'touchMove', [{ x: p.x, y: p.y - dy }])
      await sleep(30)
    }
    await touch(cdp, 'touchEnd', [])
    await sleep(3200)
    await shoot(page, 'voice-phone', theme, s.errors)
    await s.ctx.close()
  },
  // 7 · Shut down at 21:30: what got done, the sweep, tomorrow's 3
  'shutdown-phone': async (theme) => {
    const s = await open({ view: PHONE, theme, route: '/today', at: '21:30', scene: 'shut' })
    const { page, cdp } = s
    await tap(cdp, page.locator('.tp-ritual').getByRole('button', { name: /^(Shut down|Resume)$/ }))
    await sleep(800)
    await shoot(page, 'shutdown-phone', theme, s.errors)
    await s.ctx.close()
  },
  // 8 · Settings → Integrations → AI assistants: the key (no secret shown — only its hash is stored)
  'assistant-desk': async (theme) => {
    const s = await open({ view: DESK, theme, route: '/settings', at: '13:10' })
    const { page } = s
    await page.locator('.st-nav-item', { hasText: /^Integrations$/ }).first().click()
    await sleep(700)
    await page.getByText('Connect an assistant', { exact: true }).first().click()
    await page.getByText('AI assistants (MCP)', { exact: true }).first().evaluate((e) => {
      e.scrollIntoView({ block: 'start' })
      let p = e.parentElement
      while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement
      ;(p ?? document.scrollingElement).scrollTop -= 96 // the card's title clear of the top bar
    })
    await sleep(400)
    await shoot(page, 'assistant-desk', theme, s.errors)
    await s.ctx.close()
  },
}

for (const [name, run] of Object.entries(SHOTS)) {
  if (ONLY && !ONLY.has(name)) continue
  for (const theme of ['day', 'night']) await run(theme)
}
await browser.close()

// PNG → WebP (Pillow), and the sizes
const py = `import sys, os
from PIL import Image
out = sys.argv[1]
for f in sys.argv[2:]:
    w = os.path.join(out, os.path.basename(f)[:-4] + '.webp')
    Image.open(f).convert('RGB').save(w, 'WEBP', quality=86, method=6)
    print(f'{os.path.basename(w)}  {os.path.getsize(w) // 1024} KB')`
const r = spawnSync(process.env.PYTHON || 'python', ['-c', py, OUT, ...written], { encoding: 'utf8' })
process.stdout.write(r.stdout || '')
if (r.status !== 0) { console.error(r.stderr); process.exit(1) }
