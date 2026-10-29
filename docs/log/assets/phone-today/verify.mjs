// phone-today (Kai 2026-10-26, "phone B"): the phone's Today home — B "Now + next" by default, the Now / Day
// view (remembered per device under kf-phone-today-view; since today-v2, 2026-10-29, set in Settings → Appearance
// "Phone home shows", not on Today), on the real /today page against a MOCKED backend
// (the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9; Playwright answers every REST call). The day
// is today-looks' (audit.mjs): Monday 26 Oct 2026, 10:40 Cairo (UTC+3, DST until 29 Oct), two lectures, the CNN
// goal block, the gym, a study group, a Karpathy block; Top 3, Today's tasks, 2 overdue, 6 also open, 5 routines.
// The morning ritual was finished at 07:55 (planned), except in today-v2's "nothing planned" scenes, where the
// Plan my day card takes the Now card's place.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Checks: B at 360 / 390 / 430; the task rows wholly on screen (inside the scroller, above the tab bar: B >= 7,
// Day >= 9 at 390); Settings → Appearance "Phone home shows" (This device) going to Day (Day strip options 4, "Day
// bar"), surviving a reload, and back; no switch on Today, the picker back in the strip's middle, the title opening
// the picker, the bar opening the calendar's own Day column for today; the Plan my day card in the Now card's place
// while nothing is planned (and the Now card once planned); completing a task in both views; no label chips on the
// rows; the over warning (option D) on the Top 3 header — a normal day, an over day, the tap (how it's counted,
// Tomorrow on each pick), hidden while nothing is planned, and its one line at 360 / 390 / 430; no sideways page
// scroll; no page errors. Shots: B and Day at 3 widths, day and night; Plan; Over; Settings.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5321'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
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
const TASKS = [
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
const ev = (n, title, from, to, taskN = null) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
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
const PLANNED = [act(30, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '07:55')]
const tables = (planned = true) => ({
  tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), projects: PROJECTS, app_settings: [{ ...SETTINGS }], routines: ROUTINES,
  routine_completions: [{ id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') }],
  inbox_items: [], activity_log: [...[1, 2, 3].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50')), ...(planned ? PLANNED : [])], time_entries: [], domains: [], areas: [], people: [], books: [], journal_entries: [], slipping: [], resurfaced_log: [],
})

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
const SIZES = [[360, 780], [390, 844], [430, 932]]

/** A fresh device (empty storage unless `view` is set) at 10:40 on the sample day. */
async function open({ w, h, theme = 'day', view = null, settings = null, planned = true, at = '10:40', labels = false, over = false, ready = '.tp-home' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 768, isMobile: w < 768, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, v]) => {
    if (sessionStorage.getItem('kf-pt-seeded')) return // a reload keeps what the page wrote
    sessionStorage.setItem('kf-pt-seeded', '1')
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo'); localStorage.setItem('kf-help:' + uid, JSON.stringify(['hint:swipe', 'hint:calendar', 'hint:inbox', 'row']))
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
    if (v) localStorage.setItem('kf-phone-today-view', v)
  }, [theme, JSON.stringify(session), UID, view])
  const state = { rows: tables(planned), writes: [] }
  if (labels) state.rows.tasks.find((t) => t.id === id(4)).labels = ['uni', 'exam', 'reading']
  if (over) Object.assign(state.rows.tasks.find((t) => t.id === id(2)), { duration_min: 240 }), Object.assign(state.rows.tasks.find((t) => t.id === id(3)), { duration_min: 40 })
  if (settings) Object.assign(state.rows.app_settings[0], settings)
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
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await page.waitForSelector(ready, { timeout: 15000 })
  await sleep(1500)
  return { ctx, page, errors, state }
}

/** Task rows wholly on screen: inside the scroller's box and above the tab bar (the goal card counts). */
const measure = (page) => page.evaluate(() => {
  const sc = document.querySelector('.app-main-content')
  const box = sc.getBoundingClientRect()
  const tab = document.querySelector('.kf-tabbar, nav[aria-label="Main"], [class*="tabbar"]')
  const bottom = Math.min(box.bottom, tab ? tab.getBoundingClientRect().top : innerHeight)
  const rows = [...document.querySelectorAll('[id^="task-"]')].filter((e) => e.getBoundingClientRect().height > 0 && !e.parentElement.closest('[id^="task-"]'))
  const full = rows.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= box.top - 0.5 && r.bottom <= bottom + 0.5 })
  const de = document.scrollingElement
  return {
    fully: full.length,
    titles: full.map((e) => (e.querySelector('.tp-slim-t, .tp-gs-title')?.textContent ?? '').slice(0, 24)),
    hScroll: Math.max(de.scrollWidth - de.clientWidth, sc.scrollWidth - sc.clientWidth),
    rowH: rows.slice(1, 4).map((e) => Math.round(e.getBoundingClientRect().height)),
  }
})
const shot = async (page, name) => {
  await page.evaluate(() => document.querySelector('.app-main-content')?.scrollTo(0, 0))
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
/** The done write the outbox sends for a task: its row upserted with status done (+ the task.completed log). */
const doneWrite = (state, taskId) => state.writes.find((w) => w.table === 'tasks' && [].concat(w.body).some((b) => b?.id === taskId && b.status === 'done' && b.completed_at))
const counts = {}

// ── B at three widths (a fresh device opens on Now), day and night ──
for (const theme of ['day', 'night']) for (const [w, h] of SIZES) {
  const { ctx, page, errors } = await open({ w, h, theme })
  const b = await page.evaluate(() => ({
    now: !!document.querySelector('section[aria-label="Now"] .kf-now'),
    then: document.querySelectorAll('.tp-then .tp-bk').length,
    goal: !!document.querySelector('.tp-gs'),
    panels: [...document.querySelectorAll('.tp-pt')].map((e) => e.textContent.trim()),
    rituals: !!document.querySelector('section[aria-label="Rituals"] [data-ritual="morning"]'),
    plan: !!document.querySelector('.tp-ritual'),
  }))
  const m = await measure(page)
  if (theme === 'day') {
    counts[`B-${w}`] = m.fully
    check(`B renders at ${w} (planned: the Now card, no Plan card)`, b.now && b.goal && b.rituals && !b.plan && b.then === 2, JSON.stringify(b))
    check(`B at ${w}: no sideways page scroll`, m.hScroll <= 0, `overflow ${m.hScroll}px`)
    console.log(`  B ${w}: ${m.fully} rows fully on screen (${m.titles.join(' | ')}) rows ${m.rowH}`)
  }
  check(`B ${w} ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await shot(page, `B-${w}-${theme}`)
  await ctx.close()
}
check('B at 390: at least 7 tasks fully visible', counts['B-390'] >= 7, `${counts['B-360']} / ${counts['B-390']} / ${counts['B-430']} at 360 / 390 / 430`)

// ── today-v2: the Now / Day setting lives in Settings → Appearance ("Phone home shows", This device) ──
{
  const { ctx, page, errors } = await open({ w: 390, h: 844 })
  const onToday = await page.evaluate(() => ({ seg: !!document.querySelector('.tp-home .kf-seg, .tp-home [role="radiogroup"], .tp-view'), picker: !!document.querySelector('.tp-daynav .tp-daynav-mid [aria-label="Pick a day"]') }))
  check('Today has no Now · Day switch; the strip’s middle is the date picker again', !onToday.seg && onToday.picker, JSON.stringify(onToday))
  await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' })
  const row = page.locator('[data-st-key="Phone home shows"]')
  await row.waitFor({ timeout: 10000 })
  await sleep(500)
  const pressedOf = () => row.evaluate((e) => e.querySelector('[aria-pressed="true"], [aria-checked="true"]')?.textContent ?? '')
  const r0 = { device: await row.evaluate((e) => e.querySelector('.st-device')?.textContent ?? ''), pressed: await pressedOf() }
  check('Settings → Appearance has "Phone home shows: Now / Day", labelled This device, on Now', r0.device === 'This device' && r0.pressed === 'Now', JSON.stringify(r0))
  await page.screenshot({ path: path.join(OUT, 'Settings-390-day.png') })
  await row.locator('button:has-text("Day")').click()
  await sleep(400)
  const key = await page.evaluate(() => localStorage.getItem('kf-phone-today-view'))
  // In-app back to Today (no reload): Today reads the setting when it mounts.
  await page.evaluate(() => { history.pushState({}, '', '/today'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.waitForSelector('.tp-home')
  await sleep(1200)
  const before = await page.evaluate(() => ({ strip: !!document.querySelector('.tp-dbar'), now: !!document.querySelector('section[aria-label="Now"]') }))
  check('Day in Settings → Today opens on the Day bar (kf-phone-today-view = day)', key === 'day' && before.strip && !before.now, JSON.stringify({ key, ...before }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.tp-home')
  await sleep(1200)
  const after = await page.evaluate(() => ({ strip: !!document.querySelector('.tp-dbar'), now: !!document.querySelector('section[aria-label="Now"]') }))
  check('Day survives a reload', after.strip && !after.now, JSON.stringify(after))
  await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' })
  await row.waitFor({ timeout: 10000 })
  await sleep(400)
  const r1 = await pressedOf()
  await row.locator('button:has-text("Now")').click()
  await sleep(400)
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.tp-home')
  await sleep(1200)
  const back = await page.evaluate(() => ({ now: !!document.querySelector('section[aria-label="Now"]'), strip: !!document.querySelector('.tp-dbar'), key: localStorage.getItem('kf-phone-today-view') }))
  check('…the row reads Day, and Now takes Today back to the Now card', r1 === 'Day' && back.now && !back.strip && back.key === 'now', JSON.stringify({ r1, ...back }))
  check('the setting: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// Desktop has no such row (it sets the phone home only).
{
  const { ctx, page, errors } = await open({ w: 1280, h: 800, ready: 'main' })
  await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-st-key="Theme"]', { timeout: 10000 })
  check('no "Phone home shows" row at 1280', (await page.locator('[data-st-key="Phone home shows"]').count()) === 0)
  check('desktop settings: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── today-v2: Plan my day in the Now card's place while nothing is planned ──
for (const theme of ['day', 'night']) for (const [w, h] of theme === 'day' ? SIZES : [[390, 844]]) {
  const { ctx, page, errors } = await open({ w, h, theme, planned: false })
  const p = await page.evaluate(() => {
    const card = document.querySelector('.tp-home-in > .tp-ritual.is-panel')
    const first = document.querySelector('.tp-home-in')?.firstElementChild
    return {
      card: !!card,
      first: first === card,
      title: card?.querySelector('.tp-ritual-title')?.textContent ?? '',
      caption: card?.querySelector('.tp-caption')?.textContent ?? '',
      btn: card?.querySelector('button')?.textContent ?? '',
      now: !!document.querySelector('section[aria-label="Now"]'),
      begin: document.querySelector('section[aria-label="Rituals"] [data-ritual="morning"] .tp-pbtn')?.textContent ?? '',
    }
  })
  const m = await measure(page)
  check(`Plan ${w} ${theme}: nothing planned → Plan my day in the Now card's place (no Now card), Rituals · Begin stays`, p.card && p.first && p.title === 'Plan my day' && /Morning · not planned/.test(p.caption) && p.btn === 'Plan' && !p.now && p.begin === 'Begin', JSON.stringify(p))
  check(`Plan ${w} ${theme}: no sideways scroll, no page errors`, m.hScroll <= 0 && errors.length === 0, `${m.hScroll} ${errors.join(' | ')}`)
  await shot(page, `Plan-${w}-${theme}`)
  if (theme === 'day' && w === 390) {
    await page.click('.tp-ritual.is-panel button:has-text("Plan")')
    await sleep(900)
    const dlg = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.slice(0, 80) ?? '')
    check('Plan opens the morning ritual (Plan my day)', !!dlg, dlg)
  }
  await ctx.close()
}
// The same unplanned morning with Day chosen: the Plan card stands in for the Day bar too.
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, planned: false, view: 'day' })
  const p = await page.evaluate(() => ({ card: !!document.querySelector('.tp-ritual.is-panel'), bar: !!document.querySelector('.tp-dbar') }))
  check('Plan with Day chosen: the Plan card in the Day bar’s place', p.card && !p.bar, JSON.stringify(p))
  check('Plan (Day): no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// Planned by the Top 3 alone (three picked, past 12:00): the Now card is back, no Plan card.
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, planned: false, at: '12:10' })
  const p = await page.evaluate(() => ({ card: !!document.querySelector('.tp-ritual'), now: !!document.querySelector('section[aria-label="Now"] .kf-now') }))
  check('planned by the Top 3 at 12:10 → the Now card, no Plan card', !p.card && p.now, JSON.stringify(p))
  check('12:10: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// Unplanned, but a block is running (11:10, the CV lecture): something is on, so the Now card shows.
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, planned: false, at: '11:10' })
  const p = await page.evaluate(() => ({ card: !!document.querySelector('.tp-ritual'), now: !!document.querySelector('section[aria-label="Now"] .kf-now') }))
  check('unplanned but a block running (11:10, the CV lecture) → the Now card, not Plan', !p.card && p.now, JSON.stringify(p))
  check('11:10: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── today-v2 (Kai 2026-10-29): no label chips on the phone home's rows (one fact per row) ──
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, labels: true })
  const n = await page.evaluate((i) => ({ row: !!document.querySelector(`#task-${i}`), chips: document.querySelectorAll('.tp-home .kf-chip--bordered').length }), id(4))
  check('a labelled task’s phone row shows no label chips', n.row && n.chips === 0, JSON.stringify(n))
  check('labels: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

for (const theme of ['day', 'night']) for (const [w, h] of SIZES) {
  const { ctx, page, errors } = await open({ w, h, theme, view: 'day' })
  const c = await page.evaluate(() => ({
    bar: !!document.querySelector('section[aria-label="The day"] .tp-dbar'),
    pills: document.querySelectorAll('.tp-dbar-sg').length,
    lane2: document.querySelectorAll('.tp-dbar-sg.is-l1').length,
    goal: document.querySelectorAll('.tp-dbar-sg.is-goal').length,
    now: !!document.querySelector('.tp-dbar-now'),
    next: document.querySelector('.tp-dnext-btn')?.textContent ?? '',
    nowCard: !!document.querySelector('section[aria-label="Now"]'),
    restIsB: !!document.querySelector('.tp-gs') && !!document.querySelector('section[aria-label="Top 3"] .tp-pn') && !!document.querySelector('section[aria-label="Rituals"]'),
  }))
  const m = await measure(page)
  if (theme === 'day') {
    counts[`Day-${w}`] = m.fully
    check(`Day bar renders at ${w}`, c.bar && c.pills === 6 && c.goal === 1 && c.now && /Next.*Lecture — Computer Vision.*in 20m/.test(c.next) && !c.nowCard && c.restIsB, JSON.stringify(c))
    check(`Day at ${w}: no sideways page scroll`, m.hScroll <= 0, `overflow ${m.hScroll}px`)
    console.log(`  Day ${w}: ${m.fully} rows fully on screen (${m.titles.join(' | ')})`)
  }
  check(`Day ${w} ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await shot(page, `Day-${w}-${theme}`)
  await ctx.close()
}
check('Day at 390: at least 9 tasks fully visible', counts['Day-390'] >= 9, `${counts['Day-360']} / ${counts['Day-390']} / ${counts['Day-430']} at 360 / 390 / 430`)

// ── today-v2 (Kai 2026-10-29): the over warning, option D — on the Top 3 header ──
// The sample day at 10:40: free 10:40–6:00 PM = 7h 20m. Planned = the goal's block 2h + DL set 1h 30m + email 20m +
// the CV lecture 1h 30m + the gym's 1h before 6 PM = 6h 20m. Over: DL set 4h and the email 40m → 9h 10m, 1h 50m over.
const loadOf = (page) => page.evaluate(() => {
  const head = document.querySelector('.tp-load')
  const l = head?.querySelector('.tp-load-l')
  const parts = l ? [...l.children].map((e) => ({ text: e.textContent, shown: e.getBoundingClientRect().top - l.getBoundingClientRect().top < 2 })) : []
  const chip = document.querySelector('.tp-over-chip')
  const z = Number(document.documentElement.style.zoom) || 1
  return {
    head: !!head,
    over: head?.classList.contains('is-over') ?? false,
    shown: parts.filter((p) => p.shown).map((p) => p.text).join(''),
    all: parts.map((p) => p.text).join(''),
    oneLine: head ? head.getBoundingClientRect().height / z <= 30 : false,
    headW: head ? Math.round(head.getBoundingClientRect().right) <= innerWidth : false,
    chip: chip?.textContent ?? '',
    chipInk: chip ? getComputedStyle(chip).color : '',
    ranInk: (() => { const p = document.createElement('i'); p.style.color = 'var(--blk-ran-ink)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c })(),
    nInk: head?.querySelector('.tp-load-n') ? getComputedStyle(head.querySelector('.tp-load-n')).color : '',
    expanded: head?.querySelector('.tp-load-btn')?.getAttribute('aria-expanded'),
    why: document.querySelector('.tp-load-why')?.textContent ?? '',
    tomorrow: document.querySelectorAll('section[aria-label="Top 3"] .tp-tmrw').length,
  }
})
for (const [w, h] of SIZES) {
  const { ctx, page, errors } = await open({ w, h })
  const l = await loadOf(page)
  check(`over D normal ${w}: "Top 3 · 6h 20m planned · 7h 20m free" (free dropped first if narrow), one line, no chip`, l.head && !l.over && l.all === 'Top 3 · 6h 20m planned · 7h 20m free' && l.shown.startsWith('Top 3 · 6h 20m planned') && l.oneLine && l.headW && !l.chip, JSON.stringify(l))
  console.log(`  normal ${w}: shows "${l.shown}"`)
  check(`over D normal ${w}: no page errors`, errors.length === 0, errors.join(' | '))
  if (w === 390) await shot(page, 'Over-normal-390-day')
  if (w === 360) {
    // Narrower than any phone here (a bigger interface size, a longer figure): the free part goes first.
    await page.evaluate(() => { document.querySelector('.tp-load').style.width = '250px' })
    await sleep(200)
    const n = await loadOf(page)
    check('over D normal, squeezed to 250px: the free part is dropped, "Top 3 · 6h 20m planned" stays on one line', n.shown === 'Top 3 · 6h 20m planned' && n.oneLine, JSON.stringify(n))
  }
  await ctx.close()
}
for (const theme of ['day', 'night']) for (const [w, h] of theme === 'day' ? SIZES : [[390, 844]]) {
  const { ctx, page, errors } = await open({ w, h, theme, over: true })
  const l = await loadOf(page)
  check(`over D over ${w} ${theme}: "Top 3 · 9h 10m planned · 7h 20m free" + the chip "1h 50m more than today can fit" in Ran over's ink`, l.head && l.over && l.all === 'Top 3 · 9h 10m planned · 7h 20m free' && l.shown.startsWith('Top 3 · 9h 10m planned') && l.oneLine && l.headW && l.chip === '1h 50m more than today can fit' && l.chipInk === l.ranInk, JSON.stringify(l))
  console.log(`  over ${w} ${theme}: shows "${l.shown}"`)
  const m = await measure(page)
  check(`over D over ${w} ${theme}: no sideways scroll, no page errors`, m.hScroll <= 0 && errors.length === 0, `${m.hScroll} ${errors.join(' | ')}`)
  await shot(page, `Over-${w}-${theme}`)
  await ctx.close()
}
// The tap: how it's counted, and Tomorrow on each Top 3 row; Tomorrow moves the pick (due tomorrow, off the Top 3).
{
  const { ctx, page, errors, state } = await open({ w: 390, h: 844, over: true })
  await page.click('.tp-load-btn')
  await sleep(500)
  const l = await loadOf(page)
  check('over D tap: the header opens (aria-expanded), says how it’s counted, and both Top 3 rows offer Tomorrow', l.expanded === 'true' && /^Top 3 and today’s blocks, against the free time left today \(9:00 AM–6:00 PM\)/.test(l.why) && l.tomorrow === 2, JSON.stringify(l))
  await shot(page, 'Over-tap-390-day')
  const w0 = state.writes.length
  await page.click(`#task-${id(2)} .tp-tmrw`)
  await sleep(1200)
  const wr = state.writes.slice(w0).find((x) => x.table === 'tasks' && [].concat(x.body).some((b) => b?.id === id(2)))
  const body = wr && [].concat(wr.body).find((b) => b?.id === id(2))
  check('over D tap: Tomorrow moves "Deep Learning problem set 4" to tomorrow and off the Top 3', !!body && String(body.due_at).startsWith('2026-10-27') && body.top3 === false, JSON.stringify(body ?? state.writes.slice(w0).map((x) => x.table)))
  const after = await loadOf(page)
  check('over D tap: after the move it fits (no chip)', !after.chip && !after.over, JSON.stringify(after))
  await page.click('.tp-load-btn')
  await sleep(400)
  check('over D tap again: closed, the rows get their ⋯ back', (await loadOf(page)).tomorrow === 0 && (await page.locator(`#task-${id(3)} .kf-row-more`).count()) === 1)
  check('over D tap: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// Nothing planned: none of it (the Plan my day card shows); the title keeps its plain note.
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, planned: false, over: true })
  const l = await loadOf(page)
  const pt = await page.evaluate(() => [...document.querySelectorAll('.tp-pt')].map((e) => e.textContent)[0] ?? '')
  check('over D hidden while nothing is planned (Plan card showing): no load line, no chip', !l.head && !l.chip && !!(await page.locator('.tp-ritual.is-panel').count()) && pt.startsWith('Top 3 · '), JSON.stringify({ ...l, pt }))
  check('over D hidden: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the title opens the picker; the bar opens today's Day column ──
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, view: 'day', settings: { calendar_default_view: 'week' } })
  await page.click('.tp-bar-title button')
  await sleep(700)
  const picker = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  check('tapping the date title opens the date picker', picker)
  await page.keyboard.press('Escape')
  await sleep(500)
  await page.click('.tp-dbar', { position: { x: 30, y: 6 } })
  await page.waitForURL(/\/calendar\?/, { timeout: 8000 }).catch(() => {})
  await sleep(1500)
  const cal = await page.evaluate(() => ({ url: location.pathname + location.search, title: document.querySelector('.pc-title')?.textContent ?? '' }))
  check('tapping the bar opens the calendar’s own Day column for today (with Week as the default view)', cal.url === '/calendar?date=2026-10-26&view=day' && /26/.test(cal.title) && !/[–-]/.test(cal.title), JSON.stringify(cal))
  await shot(page, 'Day-open-390-day')
  check('bar and title: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// ── completing a task, in both views ──
for (const [view, n, title] of [['now', 4, 'Review lecture 7 slides'], ['day', 6, 'Pay the internet bill']]) {
  const { ctx, page, state, errors } = await open({ w: 390, h: 844, view })
  const row = page.locator(`#task-${id(n)}`)
  await row.locator('[role="checkbox"], input[type="checkbox"], button[aria-pressed]').first().click()
  await sleep(1500)
  const struck = await page.evaluate((i) => !!document.querySelector(`#task-${i} .tp-slim-t.is-done`), id(n))
  const w = doneWrite(state, id(n))
  check(`complete in ${view === 'now' ? 'B (Now)' : 'the Day view'}: "${title}" is struck and written done`, struck && !!w, `struck=${struck} write=${w ? w.method + ' ' + w.query : 'none: ' + state.writes.map((x) => `${x.method} ${x.table}${x.query} ${JSON.stringify(x.body).slice(0, 80)}`).join(' ; ')}`)
  check(`complete in ${view}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── opening a task and a ritual from B ──
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, planned: false })
  await page.click(`#task-${id(2)} .tp-slim-t`)
  await sleep(900)
  const sheet = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  check('B: tapping a row opens the task', sheet)
  await page.keyboard.press('Escape')
  await sleep(500)
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.tp-home')
  await sleep(900)
  await page.click('section[aria-label="Rituals"] [data-ritual="morning"]')
  await sleep(900)
  const ritual = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  check('B: Morning · Begin opens Plan my day', ritual)
  check('opening: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ counts, results }, null, 1))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
