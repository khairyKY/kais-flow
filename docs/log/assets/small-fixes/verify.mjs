// small-fixes (Kai 2026-11-03): four small fixes on the REAL app against a MOCKED backend (phone-today's day:
// Monday 26 Oct 2026, Cairo). 1) Chat answers: "[t1]" / "[e1]" tags become chips that open the item; a tag the
// answer can't resolve shows nothing. 2) Notification words follow the 12h / 24h setting (the device's own
// planner, notifications/plan.ts, run in the page under both settings; the server half is copy.test.ts).
// 3) Phone Today's Day bar is gone on a day with nothing scheduled. 4) Settings → Calendar & time → Weekly
// review: a day and a time, written to app_settings (review_day / review_time) and driving Today's prompt.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// while nothing is planned (and the Now card once planned); completing a task in both views; no label chips on the
// rows; the over warning (option D) on the Top 3 header — a normal day, an over day, the tap (how it's counted,
// Tomorrow on each pick), hidden while nothing is planned, and its one line at 360 / 390 / 430; no sideways page
// scroll; no page errors; v161: the change animates the same both ways (the Settings thumb, and Today's views fading
// out / in, live or on coming back), and not with Effects off or reduced motion. Shots: B and Day at 3 widths, day and night; Plan; Over; Settings.
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
async function open({ w, h, theme = 'day', view = null, settings = null, planned = true, at = '10:40', labels = false, over = false, ready = '.tp-home', path: at_ = '/today', events = null, chat = null } = {}) {
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
  if (events) state.rows.calendar_events = events
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname === '/functions/v1/chat' && chat) {
      return r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: chat })
    }
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
  await page.goto(`${BASE}${at_}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(ready, { timeout: 15000 })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = async (page, name) => {
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '')
const drawer = (page) => page.locator('.kf-drawer')
const settingsWrites = (state) => state.writes.filter((w) => w.table === 'app_settings').map((w) => [].concat(w.body)[0]).filter(Boolean)

// ── 1. Chat: tags -> chips ──
{
  const answer = 'Today: Finish the CNN backprop notes [t1], and Gym — push day [e4]. Also a ghost [t9] and an old one [i2].'
  const done = { citations: [], refs: { t1: { entity_type: 'task', entity_id: id(1), title: 'Finish the CNN backprop notes for the DL midterm' }, e4: { entity_type: 'calendar_event', entity_id: eid(4), title: 'Gym — push day' } } }
  const sse = `data: ${JSON.stringify({ delta: answer })}\n\nevent: done\ndata: ${JSON.stringify(done)}\n\n`
  const { ctx, page, errors, state } = await open({ w: 1280, h: 800, ready: 'body', chat: sse })
  await page.keyboard.press('Control+j')
  await drawer(page).waitFor({ timeout: 6000 })
  const input = drawer(page).locator('form input')
  await input.fill("What's on today?")
  await input.press('Enter')
  await page.waitForSelector('.kf-chat-ref', { timeout: 8000 })
  const info = await page.evaluate(() => ({ text: document.querySelector('.kf-md')?.innerText ?? '', chips: [...document.querySelectorAll('.kf-chat-ref')].map((b) => [b.textContent, b.getAttribute('aria-label')]) }))
  check('chat: no raw [t1] / [e1] tag shows', !/\[[tei]\d+\]/i.test(info.text), info.text)
  check('chat: the two known tags are chips (task, event) named for their item', info.chips.length === 2 && info.chips[0][0].includes('task') && info.chips[1][0].includes('event') && /CNN/.test(info.chips[0][1]) && /Gym/.test(info.chips[1][1]), JSON.stringify(info.chips))
  check('chat: an unresolved tag (t9, i2) is dropped, not left raw', /ghost and an old one ?\./.test(info.text.replace(/\s+/g, ' ').replace(/ ?↗ (task|event)/g, '')), info.text)
  await page.screenshot({ path: path.join(OUT, '1-chat-chips.png') })
  // history sent back to the model carries no stale tags: the second question's history has the answer, tags intact on screen only
  await page.locator('.kf-chat-ref').first().click()
  await sleep(700)
  check('chat: a task chip opens that task (the panel closes, the task is on screen)', await page.evaluate(() => !document.querySelector('.kf-drawer') && /Finish the CNN backprop notes/.test(document.body.innerText)), '')
  check('chat: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Notification words follow the 12h / 24h setting ──
for (const h24 of [false, true]) {
  const { ctx, page } = await open({ w: 1280, h: 800, ready: 'body' })
  await page.evaluate((on) => localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: on })), h24)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(800)
  const out = await page.evaluate(async () => {
    const plan = await import('/src/features/notifications/plan.ts')
    const local = await import('/src/features/notifications/local.ts')
    const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, 26, h - 3, m)) }
    const prefs = { ...local.noticePrefs(), lock_screen_names: true, morning_digest_on: false, evening_nudge_on: false }
    const tasks = [{ id: 't', title: 'Pay rent', status: 'todo', due_at: at('15:00').toISOString(), reminder_at: at('09:50').toISOString() }]
    const routines = [{ id: 'r', name: 'Stretch', clock_time: '07:30:00', cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, active: true }]
    const events = [{ id: 'g', title: 'Gym', starts_at: at('18:00').toISOString(), ends_at: at('19:30').toISOString(), all_day: false, source: 'native', remind_min: 15, recurrence_rule: null, recurrence_exdates: [] }]
    const p = plan.localPlan({ tasks, events, routines, completions: [], prefs, from: at('07:00'), to: at('18:00'), now: at('07:00'), zone: 'Africa/Cairo' })
    return p.map((x) => `${x.notice.kind}: ${x.notice.title} | ${x.notice.body}`)
  })
  const all = out.join('\n')
  const want = h24 ? [/Stretch — 07:30/, /18:00–19:30/, /09:50|15:00/] : [/Stretch — 7:30 AM/, /6:00–7:30 PM/, /9:50 AM|3:00 PM/]
  check(`notifications, ${h24 ? '24' : '12'}-hour setting: routine, event and reminder words`, want.every((re) => re.test(all)) && (h24 ? !/ AM| PM/.test(all) : true), all.replace(/\n/g, ' // '))
  await ctx.close()
}

// ── 3. Phone Today: no Day bar on an empty day ──
for (const [name, evs, bar] of [['a day with blocks', null, true], ['an empty day', [], false]]) {
  const { ctx, page, errors } = await open({ w: 390, h: 844, view: 'day', events: evs, ready: '.tp-home' })
  const has = await page.evaluate(() => ({ bar: !!document.querySelector('.tp-dbar'), card: !!document.querySelector('.tp-dbar-card'), empty: /Nothing else today/.test(document.body.innerText) }))
  check(`phone Day view, ${name}: the Day bar ${bar ? 'shows' : 'is gone (no bar, no "Nothing else today")'}`, has.bar === bar && has.card === bar && (bar || !has.empty), JSON.stringify(has))
  check(`phone Day view, ${name}: no page errors`, errors.length === 0, errors.join(' | '))
  await shot(page, `3-phone-day-${bar ? 'blocks' : 'empty'}`)
  await ctx.close()
}

// ── 4. Weekly review day and time ──
{
  // Mon 26 Oct 2026. A Fri + Sat weekend: by default the review day is Friday, so not today. Choose Monday.
  const week = { weekend_days: [5, 6], review_day: null, review_time: null }
  const { ctx, page, state, errors } = await open({ w: 1280, h: 800, settings: week, ready: 'body' })
  await page.goto(`${BASE}/settings/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Weekly review', { timeout: 8000 })
  const body0 = await page.evaluate(() => document.body.innerText)
  check('settings: a Weekly review row; default is the first day of the weekend, all day', /first day of your weekend/.test(body0) && /all day/.test(body0), '')
  await page.screenshot({ path: path.join(OUT, '4-settings-review.png') })
  await page.locator('[aria-label="Weekly review day"]').first().click()
  await page.getByRole('option', { name: 'Monday' }).click()
  await sleep(800)
  const w1 = settingsWrites(state).pop()
  check('settings: choosing Monday writes review_day 1 to app_settings', w1?.review_day === 1, JSON.stringify(w1 && { review_day: w1.review_day, review_time: w1.review_time }))
  await page.locator('[aria-label="Weekly review at a set time"]').first().click()
  await sleep(800)
  const w2 = settingsWrites(state).pop()
  check('settings: the time switch writes review_time 18:00 (and keeps the day)', w2?.review_time === '18:00' && w2?.review_day === 1, JSON.stringify(w2 && { review_day: w2.review_day, review_time: w2.review_time }))
  await page.screenshot({ path: path.join(OUT, '4-settings-review-set.png') })
  check('settings: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()

  for (const [name, settings, at, due] of [
    ['default (Fri + Sat weekend, a Monday)', week, '10:40', false],
    ['Monday picked, all day', { ...week, review_day: 1 }, '10:40', true],
    ['Monday picked, from 18:00, at 10:40', { ...week, review_day: 1, review_time: '18:00:00' }, '10:40', false],
    ['Monday picked, from 18:00, at 18:05', { ...week, review_day: 1, review_time: '18:00:00' }, '18:05', true],
    ['Tuesday picked, on Monday', { ...week, review_day: 2 }, '10:40', false],
  ]) {
    const { ctx: c, page: p } = await open({ w: 1280, h: 800, settings, at, ready: 'body' })
    await sleep(800)
    const on = await p.evaluate(() => !!document.querySelector('section[aria-label="Weekly review"], [data-ritual="review"]'))
    check(`Today's review prompt, ${name}: ${due ? 'shown' : 'not shown'}`, on === due, String(on))
    if (name.includes('at 18:05')) await p.screenshot({ path: path.join(OUT, '4-today-review-prompt.png') })
    await c.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} checks passed`)
process.exit(bad.length ? 1 : 0)
