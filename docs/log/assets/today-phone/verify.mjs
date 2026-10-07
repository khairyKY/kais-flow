// Today on the phone (Today Phone.dc.html 2a–2n) on the REAL /today page, signed in against a MOCKED
// backend — builder D's recipe (docs/log/assets/gestures/verify-pages.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST call with the design's sample day (Sunday 27 Sep
// 2026, Day 84). The browser clock is fixed to each scene's Cairo time. No real account, token or
// network; writes are answered 201 and go nowhere.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:5237'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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
const DAY0 = new Date(Date.UTC(2026, 8, 27 - 83, 6)).toISOString() // Day 84
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_FLOW = 'p0000000-0000-4000-8000-000000000001'
const P_HOME = 'p0000000-0000-4000-8000-000000000002'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const done = (at) => ({ status: 'done', completed_at: iso(at), top3: false })
const GOAL = 1, REVIEW = 2, NODE = 3, DEEP = 4, MILK = 5, OMAR = 6, PLANTS = 7
function tasksFor(s) {
  return [
    task(GOAL, "Finish the Kai's Flow flow audit", { top3: true, duration_min: 120, project_id: P_FLOW, ...(s.goalDone ? done('14:20') : null) }),
    task(REVIEW, 'Review Kai', { top3: true, duration_min: 30, due_at: iso('09:00', 27 - 64), ...(s.reviewDone ? done('11:05') : null) }),
    task(NODE, 'Search for a good node.js source', { top3: true, duration_min: 45, project_id: P_FLOW, ...(s.nodeDone ? done('16:10') : null) }),
    task(DEEP, 'Deep work — forecasting', { duration_min: 90 }),
    task(MILK, 'Buy milk', { duration_min: 10, project_id: P_HOME }),
    task(OMAR, 'Reply to Omar about lunch', { duration_min: 5 }),
    task(PLANTS, 'Water the balcony plants', { duration_min: 10, due_at: iso('09:00') }),
  ]
}
const ev = (n, title, from, to, taskN = null) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, created_at: DAY0, updated_at: DAY0,
})
const EVENTS = [ev(1, 'Deep work — forecasting', '09:00', '10:30', DEEP), ev(2, "Finish the Kai's Flow flow audit", '13:30', '15:00', GOAL), ev(3, 'Call the tyre supplier', '15:00', '15:30'), ev(4, 'Gym — upper body', '18:00', '19:00')]
const PROJECTS = [
  { id: P_FLOW, user_id: UID, domain_id: null, name: "Kai's Flow", type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 },
  { id: P_HOME, user_id: UID, domain_id: null, name: 'Personal', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 },
]
const ROUTINES = [['Glass of water', 'morning'], ['Stretch', 'morning'], ['Read 20 pages', 'morning'], ['Tidy the desk', 'evening'], ['Phone on the charger', 'evening']].map(([name, t], i) => ({
  id: `r0000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: DAY0, updated_at: DAY0,
}))
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const INBOX = [
  { id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'idea: dark mode for the herbarium', transcript: null, ai_parse: null, confidence: null, status: 'pending', created_at: iso('07:10'), updated_at: iso('07:10') },
  { id: 'i0000000-0000-4000-8000-000000000002', user_id: UID, kind: 'text', raw_text: 'book dentist', transcript: null, ai_parse: null, confidence: null, status: 'pending', created_at: iso('07:12'), updated_at: iso('07:12') },
  { id: 'i0000000-0000-4000-8000-000000000003', user_id: UID, kind: 'text', raw_text: 'Write the audit as a letter to future Kai.', transcript: null, ai_parse: null, confidence: null, status: 'filed', created_at: '2026-07-12T09:00:00Z', updated_at: '2026-07-12T09:00:00Z' },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

// Each scene: its clock and what the backend holds (SCREENS-2026-09-28 §Today Phone).
const S = {
  '2a': { at: '07:40' },
  '2b': { at: '09:40', morningDone: true },
  '2c': { at: '13:10', morningDone: true, reviewDone: true },
  '2d': { at: '19:30', morningDone: true, reviewDone: true, goalDone: true, focused: true },
  '2e': { at: '21:50', morningDone: true, reviewDone: true, goalDone: true, focused: true, eveningDone: true, seeds: true },
  '2i': { at: '16:20', morningDone: true, reviewDone: true, goalDone: true, nodeDone: true },
  '2n': { at: '13:10', morningDone: true, reviewDone: true, fold: true },
  '2f': { at: '08:15', empty: true },
}
function tables(s) {
  if (s.empty) return { app_settings: [SETTINGS] }
  const today = '2026-09-27'
  const log = []
  ;[GOAL, REVIEW, NODE].forEach((n, i) => log.push(act(20 + i, 'task.starred', 'task', id(n), {}, '07:50')))
  if (s.morningDone) log.push(act(1, 'ritual.finished', 'ritual', `morning-${today}`, { ritual: 'morning', date: today, steps: ['overdue', 'top3', 'inbox', 'block'] }, '07:55'))
  if (s.eveningDone) log.push(act(2, 'ritual.finished', 'ritual', `evening-${today}`, { ritual: 'evening', date: today, steps: ['sweep', 'garden', 'line', 'seeds', 'goodnight'] }, '21:40'))
  if (s.seeds) [NODE, MILK, OMAR].forEach((n, i) => log.push(act(10 + i, 'ritual.seeded', 'task', id(n), { ritual: 'evening', step: 'seeds', for_date: '2026-09-28', date: today }, '21:35')))
  return {
    tasks: tasksFor(s),
    calendar_events: EVENTS,
    projects: PROJECTS,
    app_settings: [SETTINGS],
    routines: ROUTINES,
    routine_completions: [{ id: 'c0000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: today, created_at: iso('07:10') }],
    inbox_items: INBOX,
    activity_log: log,
    time_entries: s.focused ? [{ id: 't1', user_id: UID, project_id: P_FLOW, task_id: id(GOAL), note: null, duration_min: 80, started_at: iso('13:30'), ended_at: iso('14:50'), created_at: iso('14:50'), updated_at: iso('14:50') }, { id: 't2', user_id: UID, project_id: null, task_id: id(DEEP), note: null, duration_min: 50, started_at: iso('09:00'), ended_at: iso('09:50'), created_at: iso('09:50'), updated_at: iso('09:50') }] : [],
    slipping: s.fold ? [{ entity_type: 'project', entity_id: P_HOME, entity_name: 'Portfolio site', last_touch: iso('09:00', 18), days_since: 9 }] : [],
    resurfaced_log: s.fold ? [{ id: 'z0000000-0000-4000-8000-000000000001', user_id: UID, entity_type: 'inbox_item', entity_id: INBOX[2].id, shown_on: today, action: 'pending', created_at: iso('06:00') }] : [],
  }
}
// PostgREST's event_type filter (eq.x / in.(a,b)) on the mocked activity_log.
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

/** Opens /today at scene `key`. `hold` delays REST answers (loading / syncing states). */
async function open(key, theme, view = phone, o = {}) {
  const s = S[key]
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, fold, goal]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.today.more-open', fold ? '1' : '0')
    localStorage.setItem('kf_goal_task_id', goal)
  }, [theme, JSON.stringify(session), !!s.fold, id(GOAL)])
  const state = { hold: o.hold ?? 0, rows: tables(s) }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (state.hold) await sleep(state.hold)
    const table = url.pathname.replace('/rest/v1/', '')
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(s.at) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/today`, { waitUntil: o.hold ? 'domcontentloaded' : 'networkidle' })
  await sleep(o.hold ? 900 : 700)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

async function tap(cdp, loc) {
  const b = await loc.boundingBox()
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await t('touchEnd', [])
  await sleep(400)
}
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '')
const count = (page, sel) => page.locator(sel).count()
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
// Layout checks every phone scene gets: no sideways scroll; no text under 12px inside the page.
async function phoneBasics(page, name, errors) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  const small = await page.evaluate(() => {
    const out = []
    const walk = document.createTreeWalker(document.querySelector('.tp') ?? document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue
      if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
    }
    return out
  })
  check(`${name} no text under 12px`, small.length === 0, small.slice(0, 4).join(' | '))
  check(`${name} shell sync strip hidden (the page has its own top bar)`, !(await page.locator('.app-topbar').isVisible()))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}
const labels = async (page) => (await page.locator('.tp .tp-label').allInnerTexts()).map((l) => l.toUpperCase())
const upnextIds = (page) => page.locator('.tp [id^="upnext-"]').evaluateAll((els) => els.map((e) => e.id.replace('upnext-', '')))
const E = (n) => EVENTS[n - 1].id

for (const theme of ['day', 'night']) {
  const tag = (k) => `${theme === 'night' ? { '2a': '2j', '2b': '2k', '2e': '2l' }[k] ?? k : k}-${theme}`

  // 2a / 2j — morning, not planned: ritual card with Plan on the right.
  {
    const name = tag('2a')
    const { ctx, page, errors } = await open('2a', theme)
    await shot(page, name)
    check(`${name} header line`, (await text(page, '.tp-sum')) === 'Day 84 · not planned yet', await text(page, '.tp-sum'))
    const card = page.locator('.tp-ritual')
    check(`${name} ritual card "Plan my day", no slip`, (await card.innerText()).includes('Plan my day') && (await count(page, '[id^="slip-"]')) === 0)
    const btn = await card.getByRole('button', { name: 'Plan' }).boundingBox()
    const title = await card.locator('.tp-ritual-title').boundingBox()
    check(`${name} Plan sits to the right of the card text`, btn && title && btn.x > title.x + title.width - 1 && Math.abs(btn.y + btn.height / 2 - (title.y + title.height / 2)) < 30, JSON.stringify({ btn, title }))
    check(`${name} card is flat (no tilt)`, (await card.evaluate((e) => getComputedStyle(e).transform)) === 'none')
    check(`${name} four section labels`, JSON.stringify(await labels(page)) === JSON.stringify(['TOP 3', 'UP NEXT', 'ROUTINES · 1/5', 'MORE FOR TODAY · 3']), JSON.stringify(await labels(page)))
    // Kai 2026-10-03: at 07:40 only the morning routines show; the evening folds into one line that opens in place.
    const seen = async (n) => (await page.getByText(n, { exact: true }).count()) > 0
    const fold = page.locator('.tp-fold-line')
    check(`${name} routines: morning shown, evening folded into "Later · Evening 0/2"`, (await seen('Glass of water')) && (await seen('Read 20 pages')) && !(await seen('Tidy the desk')) && (await fold.count()) === 1 && (await fold.innerText()).replace(/\s+/g, ' ').trim().toUpperCase() === 'LATER · EVENING 0/2', await fold.innerText().catch(() => 'no fold line'))
    await fold.scrollIntoViewIfNeeded()
    await fold.click()
    check(`${name} tapping the fold line opens the evening routines in place`, (await seen('Tidy the desk')) && (await seen('Phone on the charger')) && (await fold.count()) === 0)
    const up = await upnextIds(page)
    check(`${name} Up next = deep work, call, gym (goal's block skipped)`, JSON.stringify(up) === JSON.stringify([E(1), E(3), E(4)]), JSON.stringify(up))
    check(`${name} goal card carries its block time`, (await text(page, `[id="task-${id(GOAL)}"] .tp-meta`)).includes('13:30–15:00'), await text(page, `[id="task-${id(GOAL)}"] .tp-meta`))
    check(`${name} first event says how far off it is`, /IN 1H20M/i.test(await text(page, `[id="upnext-${E(1)}"] .tp-meta`)), await text(page, `[id="upnext-${E(1)}"] .tp-meta`))
    const evRow = page.locator(`[id="upnext-${E(3)}"]`)
    check(`${name} event row: time · lavender rule · no checkbox, no ⋯`, (await evRow.locator('.tp-ev-time').innerText()) === '15:00' && (await evRow.locator('.tp-ev-rule').count()) === 1 && (await evRow.locator('.kf-checkbox, .kf-row-more').count()) === 0 && (await evRow.evaluate((e) => e.getBoundingClientRect().height)) >= 56)
    check(`${name} task rows are ≥ 56 tall with 48 targets`, await page.locator(`[id="task-${id(REVIEW)}"]`).evaluate((e) => e.getBoundingClientRect().height >= 56 && [...e.querySelectorAll('.kf-star, .kf-row-more')].every((b) => b.getBoundingClientRect().width >= 48)))
    check(`${name} each item once: deep work's task is its Up next row, not also a task row`, (await count(page, `[id="task-${id(DEEP)}"]`)) === 0 && (await count(page, `[id="upnext-${E(1)}"] .kf-checkbox`)) === 1)
    check(`${name} fold closed, no fold rows`, (await count(page, '.tp-fold[aria-expanded="false"]')) === 1 && (await count(page, `[id="task-${id(MILK)}"]`)) === 0)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2b / 2k — a block is running: the NOW slip replaces the ritual card.
  {
    const name = tag('2b')
    const { ctx, page, cdp, errors } = await open('2b', theme)
    await shot(page, name)
    const slip = page.locator(`[id="slip-${E(1)}"]`)
    check(`${name} slip shows the running block`, (await slip.count()) === 1 && /NOW · UNTIL 10:30/i.test(await slip.innerText()) && (await slip.innerText()).includes('Deep work — forecasting'), (await slip.innerText().catch(() => '')).replace(/\n/g, ' '))
    check(`${name} ring = minutes left (50M)`, (await slip.locator('.tp-ring').innerText()) === '50M', await slip.locator('.tp-ring').innerText())
    check(`${name} slip and ritual card never together`, (await count(page, '.tp-ritual')) === 0)
    check(`${name} slip is taped and tilted`, (await slip.locator('.tp-tape').count()) === 1 && /matrix/.test(await slip.locator('.kf-swipe-fg').evaluate((e) => getComputedStyle(e).transform)))
    check(`${name} header: planned · finish`, /^Day 84 · ~\dh planned · you'll finish ~\d\d:\d0$/.test(await text(page, '.tp-sum')), await text(page, '.tp-sum'))
    const up = await upnextIds(page)
    check(`${name} Up next = only what's still to come (call, gym)`, JSON.stringify(up) === JSON.stringify([E(3), E(4)]), JSON.stringify(up))
    check(`${name} goal meta: block time + length`, /^13:30–15:00 · 1H30M$/.test(await text(page, `[id="task-${id(GOAL)}"] .tp-meta`)), await text(page, `[id="task-${id(GOAL)}"] .tp-meta`))
    const doneBtn = slip.getByRole('button', { name: /^Done:/ })
    check(`${name} ✓ is a 40 circle in a 48 target`, (await doneBtn.evaluate((b) => [b.offsetWidth, b.firstElementChild.offsetWidth].join('/'))) === '48/40')
    await tap(cdp, doneBtn)
    check(`${name} ✓ → Done + Undo toast`, (await toasts(page)).includes('Done'), JSON.stringify(await toasts(page)))
    await sleep(300)
    check(`${name} slip leaves once its task is done`, (await slip.count()) === 0)
    await shot(page, `${name}-slip-done`)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2e / 2l — day closed.
  {
    const name = tag('2e')
    const { ctx, page, errors } = await open('2e', theme)
    await shot(page, name)
    const card = page.locator('.tp-ritual')
    const t = await card.innerText().catch(() => '')
    check(`${name} "Day closed ✿" + seeds for Mon + sign-off, no action`, t.includes('Day closed ✿') && /3 SEEDS PLANTED FOR MON/i.test(t) && t.includes("The garden's closed.") && (await card.locator('button').count()) === 0, t.replace(/\n/g, ' '))
    check(`${name} header: done · focused`, /^Day 84 · \d+ done · 2h 10m focused$/.test(await text(page, '.tp-sum')), await text(page, '.tp-sum'))
    check(`${name} Up next empty line`, (await text(page, '.tp-quiet')) === 'Nothing else on the calendar today', await text(page, '.tp-quiet'))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }
  if (theme === 'night') continue

  // 2c — midday, nothing running; a checkbox tap keeps the row, struck, with Undo.
  {
    const name = '2c-day'
    const { ctx, page, cdp, errors } = await open('2c', theme)
    check(`${name} no slip, no ritual card`, (await count(page, '[id^="slip-"], .tp-ritual')) === 0)
    check(`${name} header: left · finish`, /^Day 84 · ~\d+[hm] left · you'll finish ~\d\d:\d0$/.test(await text(page, '.tp-sum')), await text(page, '.tp-sum'))
    check(`${name} goal: starts in 20M`, /STARTS IN 20M/i.test(await text(page, `[id="task-${id(GOAL)}"] .tp-meta`)), await text(page, `[id="task-${id(GOAL)}"] .tp-meta`))
    check(`${name} done Top 3 row: struck, "Done 11:05", star kept`, (await text(page, `[id="task-${id(REVIEW)}"] .tp-meta`)) === 'DONE 11:05' && (await page.locator(`[id="task-${id(REVIEW)}"] .kf-star[aria-pressed="true"]`).count()) === 1)
    await tap(cdp, page.locator(`[id="task-${id(NODE)}"] .kf-checkbox`))
    await sleep(300)
    check(`${name} check → "Done" toast + Undo`, (await toasts(page)).includes('Done') && (await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(await toasts(page)))
    check(`${name} the row stays, struck through`, (await count(page, `[id="task-${id(NODE)}"] .tp-title.is-done`)) === 1)
    await shot(page, name)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2d — evening: Shut down card.
  {
    const name = '2d-day'
    const { ctx, page, errors } = await open('2d', theme)
    await shot(page, name)
    const t = await text(page, '.tp-ritual')
    check(`${name} "Shut down the day" + Shut down on the right`, t.includes('Shut down the day') && (await page.locator('.tp-ritual').getByRole('button', { name: 'Shut down' }).count()) === 1 && /EVENING · 19:30/i.test(t), t.replace(/\n/g, ' '))
    check(`${name} header: 2 of 3 done · 2h 10m focused`, (await text(page, '.tp-sum')) === 'Day 84 · 2 of 3 done · 2h 10m focused', await text(page, '.tp-sum'))
    check(`${name} Up next empty line`, (await text(page, '.tp-quiet')) === 'Nothing else on the calendar today')
    check(`${name} done goal: four-leaf, gold check, struck`, (await count(page, `[id="task-${id(GOAL)}"] .tp-goal-title.is-done`)) === 1 && /four_leaf/.test(await page.locator(`[id="task-${id(GOAL)}"] img`).last().getAttribute('src')))
    await page.locator('.tp-ritual').getByRole('button', { name: 'Shut down' }).click()
    await sleep(600)
    // v1.0.11 redrew Shut down (Shutdown.dc.html): the sheet's title replaced "Closing · 1 of 5".
    check(`${name} Shut down opens the evening ritual`, await page.getByRole('dialog').filter({ hasText: /Shut down/ }).first().waitFor({ timeout: 5000 }).then(() => true, () => false))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2i — all three done, quiet.
  {
    const name = '2i-day'
    const { ctx, page, errors } = await open('2i', theme)
    await shot(page, name)
    check(`${name} "All three tended" line, no ritual card`, (await text(page, '.tp-tended')).includes('All three tended.') && (await count(page, '.tp-ritual')) === 0)
    check(`${name} header: all three done by 16:10 (the last one)`, (await text(page, '.tp-sum')) === 'Day 84 · all three done by 16:10', await text(page, '.tp-sum'))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2f — empty day (new user).
  {
    const name = '2f-day'
    const { ctx, page, errors } = await open('2f', theme)
    await shot(page, name)
    check(`${name} header: Day 1 · a fresh page`, (await text(page, '.tp-sum')) === 'Day 1 · a fresh page', await text(page, '.tp-sum'))
    check(`${name} seedling + one line, no Top 3 / Up next`, (await page.getByText('Nothing here yet. A day starts with three things.').count()) === 1 && !(await labels(page)).some((l) => l.startsWith('TOP 3') || l.startsWith('UP NEXT')), JSON.stringify(await labels(page)))
    const b = page.getByRole('button', { name: 'Add your first three things' })
    check(`${name} secondary (not terra) action`, /kf-button--secondary/.test(await b.getAttribute('class')))
    await b.click()
    await sleep(500)
    check(`${name} it opens capture`, (await count(page, '[placeholder^="Send the quote"]')) >= 1)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // 2g — loading with no cache: skeletons (a fresh context, answers held back).
  {
    const name = '2g-day'
    const { ctx, page, state } = await open('2c', theme, phone, { hold: 6000 })
    await shot(page, name)
    check(`${name} skeleton rows + goal-card loading`, (await count(page, '.tp [role="status"][aria-busy="true"]')) >= 3, await count(page, '.tp [role="status"][aria-busy="true"]'))
    check(`${name} no ritual card / slip while loading`, (await count(page, '.tp-ritual, [id^="slip-"]')) === 0)
    state.hold = 0
    await ctx.close()
  }

  // 2m — cached data with a Syncing dot: load once so the cache persists (IndexedDB), then open the
  // app again two minutes later — the cache is stale, paints at once and refetches (answers held).
  {
    const name = '2m-day'
    const first = await open('2c', theme)
    await sleep(1500)
    first.state.hold = 5000
    const page = await first.ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.clock.install({ time: new Date(cairo(S['2c'].at).getTime() + 120_000) })
    await first.page.close()
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await sleep(1500)
    await shot(page, name)
    check(`${name} cache paints at once (no skeleton)`, (await count(page, `[id="task-${id(GOAL)}"]`)) === 1 && (await count(page, '.tp [role="status"][aria-busy="true"]')) === 0)
    // tasks-noise (Kai 2026-10-07): the dot no longer blinks on for every refetch — only a fetch still
    // going after ~4s shows it (components/syncQueue.ts useLingering). The answers here are held 5s.
    check(`${name} no Syncing dot for the first seconds of a refetch`, (await count(page, '.tp-syncing')) === 0)
    await sleep(2900)
    check(`${name} Syncing dot beside the header line once the refetch is slow (~4s)`, (await text(page, '.tp-syncing')) === 'SYNCING', await text(page, '.tp-syncing'))
    first.state.hold = 0
    await phoneBasics(page, name, errors)
    await first.ctx.close()
  }

  // 2h — offline: the chip, and a change made offline carries the pending ring.
  {
    const name = '2h-day'
    const { ctx, page, cdp, errors } = await open('2c', theme)
    await ctx.setOffline(true)
    await sleep(400)
    await tap(cdp, page.locator(`[id="task-${id(NODE)}"] .kf-checkbox`))
    await sleep(800)
    await shot(page, name)
    check(`${name} offline chip replaces the header line`, (await text(page, '.tp')).includes('Offline — changes will sync') && (await count(page, '.tp-sum')) === 0)
    check(`${name} the unsynced row: Pending sync`, (await text(page, `[id="task-${id(NODE)}"] .tp-pending`)) === 'PENDING SYNC', await text(page, `[id="task-${id(NODE)}"] .tp-meta`))
    await ctx.setOffline(false)
    await phoneBasics(page, name, errors.filter((e) => !/fetch|network/i.test(e)))
    await ctx.close()
  }

  // 2n — scrolled, fold open; the small-title bar; re-tap Today → top.
  {
    const name = '2n-day'
    const { ctx, page, cdp, errors } = await open('2n', theme)
    const subs = await page.locator('.tp .tp-sub').allInnerTexts()
    check(`${name} fold: Open · Slipping · From a while ago (mono sub-headers)`, JSON.stringify(subs.filter((s) => !/MORNING|EVENING/.test(s))) === JSON.stringify(['OPEN · 4', 'SLIPPING', 'FROM A WHILE AGO']), JSON.stringify(subs))
    check(`${name} fold's Open: the rest of today, Top 3 once (deep work's block is over, so its task is back here)`, (await count(page, `[id="task-${id(MILK)}"]`)) === 1 && (await count(page, `[id="task-${id(DEEP)}"]`)) === 1 && (await count(page, `[id="task-${id(GOAL)}"]`)) === 1)
    check(`${name} still four section labels`, (await labels(page)).length === 4, JSON.stringify(await labels(page)))
    const size = () => page.locator('.tp-bar-title').evaluate((e) => getComputedStyle(e).fontSize)
    check(`${name} title at rest: 26px serif`, (await size()) === '26px', await size())
    await page.locator('.app-main-content').evaluate((m) => m.scrollTo({ top: m.scrollHeight }))
    await sleep(400)
    await shot(page, name)
    check(`${name} scrolled → small title (18px) pinned on top`, (await size()) === '18px' && (await page.locator('.tp-bar').evaluate((e) => Math.round(e.getBoundingClientRect().top))) === 0, `${await size()} top=${await page.locator('.tp-bar').evaluate((e) => e.getBoundingClientRect().top)}`)
    await tap(cdp, page.locator('.app-tabbar a[href="/today"]'))
    await sleep(900)
    check(`${name} re-tap Today → back to the top`, (await page.locator('.app-main-content').evaluate((m) => m.scrollTop)) === 0 && (await size()) === '26px')
    await tap(cdp, page.locator('.tp-bar').getByRole('button', { name: 'Today menu' }))
    const items = (await page.locator('.kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    check(`${name} ⋯ keeps both rituals one tap away`, JSON.stringify(items) === JSON.stringify(['Morning ritual', 'Evening ritual']), JSON.stringify(items))
    await page.keyboard.press('Escape')
    await sleep(300)
    await tap(cdp, page.locator('.tp-bar').getByRole('button', { name: 'Search' }))
    await sleep(500)
    check(`${name} search opens the shell's search`, (await count(page, '[placeholder="Search the garden…"]')) >= 1)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }
}

// ── Desktop 1280: Today keeps its layout; each-item-once applies. ──
for (const theme of ['day', 'night']) {
  for (const key of ['2a', '2b']) {
    const name = `desktop-${key}-${theme}`
    const { ctx, page, errors } = await open(key, theme, desktop)
    await shot(page, name)
    check(`${name} desktop layout (no phone page, shell strip shown)`, (await count(page, '.tp')) === 0 && (await page.locator('.app-topbar').isVisible()) && (await page.getByRole('heading', { name: 'Sunday, September 27' }).count()) === 1)
    const up = await page.locator('[id^="upnext-"]').evaluateAll((els) => els.map((e) => e.id.replace('upnext-', '')))
    check(`${name} Up next skips the Top 3 block, keeps the rest`, JSON.stringify(up) === JSON.stringify([E(1), E(3), E(4)]), JSON.stringify(up))
    if (key === '2a') check(`${name} Day card: Plan your day`, (await text(page, '[data-day-card]')).includes('Plan your day'))
    if (key === '2b') check(`${name} running block reads "Now" in Up next (no slip on desktop)`, (await text(page, `[id="upnext-${E(1)}"]`)).startsWith('Now') && (await count(page, '[id^="slip-"]')) === 0)
    check(`${name} goal card shows its block time`, (await text(page, `[id="task-${id(GOAL)}"]`)).includes('13:30–15:00'))
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── Side by side: the design frame (design-export/_check/2026-09-28) | this build, same state. ──
{
  const DESIGN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../../../design-export/_check/2026-09-28')
  const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f, type) => `data:${type};base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, ours] of [['2a', '2a-day'], ['2b', '2b-day'], ['2c', '2c-day'], ['2d', '2d-day'], ['2e', '2e-day'], ['2f', '2f-day'], ['2g', '2g-day'], ['2h', '2h-day'], ['2i', '2i-day'], ['2k', '2k-night'], ['2l', '2l-night'], ['2m', '2m-day'], ['2n', '2n-day']]) {
    const d = path.join(DESIGN, `today-${frame}.jpg`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(d) || !fs.existsSync(o)) continue
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff"><div><div>design ${frame}</div><img src="${uri(d, 'image/jpeg')}" style="width:390px"></div><div><div>build ${ours}</div><img src="${uri(o, 'image/png')}" style="width:390px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
