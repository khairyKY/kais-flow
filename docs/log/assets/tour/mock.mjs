// The mocked backend both tour scripts share (verify.mjs proves the tour, hints, Guide and chat;
// crops.mjs makes the Guide's step crops). The today-phone / calendar-rail recipe: the dev server
// runs in `--mode mock` (VITE_SUPABASE_URL=http://127.0.0.1:9, nothing listens there), a made-up
// session sits in localStorage, and Playwright answers every REST call with the day below. Writes are
// answered 201 and go nowhere (recorded on `state.writes`).
// The day: Wednesday 7 Oct 2026, Cairo (UTC+3), 08:20 — not planned yet, so Today offers Plan my day.
import { pathToFileURL } from 'node:url'

export const BASE = process.argv[3] ?? 'http://localhost:5276'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
export const SEEN = `kf-help:${UID}`
export const PENDING = `kf-tour-pending:${UID}`

// ── the day ──
export const cairo = (hhmm, day = 7) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
export const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
export const NOW = '08:20'
const CREATED = iso('07:00', 1)
export const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
export const GOAL = 1, OS = 2, OMAR = 3, TYRE = 4, LAMP = 5, BRIEF = 6, PLANTS = 7
export const P_GCI = 'p0000000-0000-4000-8000-000000000001'
export const P_FLOW = 'p0000000-0000-4000-8000-000000000002'
export const TASKS = [
  task(GOAL, 'Finish GCI homework 2', { top3: true, duration_min: 90, project_id: P_GCI, milestone_id: 'm2', scheduled_start: iso('13:30'), scheduled_end: iso('15:00') }),
  task(OS, 'OS midterm revision — ch. 5', { top3: true, duration_min: 60 }),
  task(OMAR, 'Reply to Omar about lab groups', { top3: true, duration_min: 10 }),
  task(TYRE, 'Call the tyre supplier', { duration_min: 15, due_at: iso('16:00') }),
  task(LAMP, 'Buy a desk lamp', { due_at: iso('09:00') }),
  task(BRIEF, 'Write the Tour & help brief', { duration_min: 60, scheduled_start: iso('09:30'), scheduled_end: iso('10:30') }),
  task(PLANTS, 'Water the balcony plants', { duration_min: 10, due_at: iso('09:00', 8), recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TH' }),
]
const ev = (n, title, from, to, taskN = null) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
export const EVENTS = [ev(1, 'Write the Tour & help brief', '09:30', '10:30', BRIEF), ev(2, 'Finish GCI homework 2', '13:30', '15:00', GOAL), ev(3, 'Lunch with Omar', '12:00', '13:00'), ev(4, 'Call the tyre supplier', '16:00', '16:15', TYRE)]
const inboxItem = (n, raw) => ({
  id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status: 'pending',
  filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('07:10'), updated_at: iso('07:10'),
})
export const INBOX = [inboxItem(1, 'idea: a guide page for the garden'), inboxItem(2, 'book the dentist')]
const project = (pid, name, over) => ({ id: pid, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, ...over })
export const PROJECTS = [
  project(P_GCI, 'GCI', { milestones: [{ id: 'm1', title: 'Homework 1', weight: 2, completed: true }, { id: 'm2', title: 'Homework 2', weight: 2, completed: false }, { id: 'm3', title: 'Final project', weight: 4, completed: false }] }),
  project(P_FLOW, 'Kai’s Flow v1', { status: 'archived', completion_summary: 'Shipped the garden.', updated_at: iso('18:00', 1) }),
]
const routine = (n, name, t) => ({ id: `r0000000-0000-4000-8000-00000000000${n}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED })
export const ROUTINES = [routine(0, 'Glass of water', 'morning'), routine(1, 'Stretch', 'morning'), routine(2, 'Read 20 pages', 'evening')]
const COMPLETIONS = [1, 2, 3, 4, 5, 6].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i}`, user_id: UID, routine_id: ROUTINES[0].id, completed_on: `2026-10-0${d}`, created_at: iso('07:30', d) }))
export const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const act = (n, event_type, entity_id, at) => ({ id: `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type: 'task', entity_id, payload: {}, created_at: iso(at) })
export const tables = (o = {}) =>
  structuredClone(
    o.empty
      ? { app_settings: [SETTINGS] }
      : {
          tasks: TASKS,
          calendar_events: EVENTS,
          inbox_items: INBOX,
          projects: PROJECTS,
          domains: [],
          areas: [],
          routines: ROUTINES,
          routine_completions: COMPLETIONS,
          app_settings: [SETTINGS],
          activity_log: [GOAL, OS, OMAR].map((n, i) => act(i + 1, 'task.starred', id(n), '07:50')),
          ...(o.rows ?? {}),
        },
  )
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

export const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  // Hold-to-talk in a crop needs a microphone: Chrome's fake one, no prompt.
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
export const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
export const desktop = { viewport: { width: 1440, height: 900 } }

// WebP: Chrome encodes it (canvas.toDataURL), so there's no extra dependency.
const enc = await browser.newPage()
export async function toWebp(png, quality = 0.82) {
  const data = await enc.evaluate(async ([src, q]) => {
    const img = new Image()
    img.src = `data:image/png;base64,${src}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/webp', q).split(',')[1]
  }, [png.toString('base64'), quality])
  return Buffer.from(data, 'base64')
}

/** A signed-in page at `route` on the mocked day. o: view, theme, at, storage, reduced, empty, rows, scale, dpr. */
export async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: o.dpr ?? 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference', permissions: ['microphone'] })
  const storage = {
    kf_theme: o.theme ?? 'day',
    'sb-127-auth-token': JSON.stringify(session),
    'kf.today.more-open': '0',
    kf_goal_task_id: id(GOAL),
    // What's new has nothing to say (it would toast over the notes otherwise).
    [`kf-whats-new:${UID}`]: JSON.stringify({ seen: 'v999.0.0', checkedAt: cairo(o.at ?? NOW).getTime() }),
    ...(o.scale ? { kf_ui_scale: String(o.scale) } : {}),
    ...(o.storage ?? {}),
  }
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('kf-seeded')) return // a reload keeps what the app wrote
    sessionStorage.setItem('kf-seeded', '1')
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
  }, storage)
  const state = { rows: tables(o), writes: [], chat: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname === '/functions/v1/chat') {
      state.chat.push(req.postDataJSON())
      return r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"delta":"Three things today: GCI homework, the OS revision and Omar."}\n\nevent: done\ndata: {"citations":[]}\n\n' })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(o.at ?? NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The mock has no realtime socket: its connection noise is the one console error allowed.
  page.on('console', (m) => m.type() === 'error' && !/127\.0\.0\.1:9|WebSocket|realtime/i.test(m.text()) && errors.push(m.text()))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

/** A finger on the screen: press at `from`, optionally move to `to`, hold `holdMs`, and (unless
 * `keep`) lift. Returns `lift` to finish a kept touch later. */
export async function touch(cdp, from, { to, holdMs = 60, keep = false } = {}) {
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: from.x, y: from.y }])
  if (to) {
    for (let i = 1; i <= 12; i++) {
      await t('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }])
      await sleep(16)
    }
  }
  await sleep(holdMs)
  const lift = () => t('touchEnd', [])
  if (!keep) await lift()
  return lift
}
export const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
