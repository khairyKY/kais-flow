// Per-event reminders (parity audit A12, migration 0077) on the REAL app against a MOCKED backend (the
// event-detail / tray-notices recipe: dev server in `--mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every REST call and applies every write to the
// mock rows). The Windows app is a stub `window.__TAURI_INTERNALS__` recording each tray.rs command
// (notify_local = a toast), so the device planner's reminders are seen as they'd reach the PC.
//   node verify.mjs <outDir> [baseUrl]      (ONLY=menu,phone runs some)
// The day: Monday 12 Oct 2026, Cairo (UTC+3).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5281'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m, s = 0] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m, s))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const tid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TYRE = 1
const TASKS = [{
  id: tid(TYRE), title: 'Call the tyre supplier', user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso('09:00', 14),
  scheduled_start: iso('12:00'), scheduled_end: iso('12:30'), top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: CREATED, updated_at: CREATED,
}]
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: [], remind_min: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const LUNCH = 1, STANDUP = 2, FAJR = 3, TYREB = 4, GYM = 5, WALK = 6
const MENU_EVENTS = [
  ev(LUNCH, 'Lunch with Omar', '10:30', '11:30'),
  ev(STANDUP, 'Standup', '08:00', '08:30', { recurrence_rule: 'FREQ=DAILY' }),
  ev(FAJR, 'Dhuhr', '12:45', '13:00', { source: 'gcal', gcal_id: 'g1', external_ref: { source: 'gcal', id: 'p/g1', calendar: 'Prayer times', calendar_id: 'p' } }),
  ev(TYREB, 'Call the tyre supplier', '12:00', '12:30', { task_id: tid(TYRE), type: 'task' }),
]
// The Windows planner's day: Gym at 11:00 (15 min before → 10:45), a daily walk from 1 Oct at 11:30
// (30 min before → 11:00), and a Google event at 11:00 that somehow carries 15 — it must stay quiet.
const PLAN_EVENTS = [
  ev(GYM, 'Gym', '11:00', '12:00', { type: 'time_block', remind_min: 15 }),
  ev(WALK, 'Lunch walk', '11:30', '11:45', { starts_at: iso('11:30', 1), ends_at: iso('11:45', 1), recurrence_rule: 'FREQ=DAILY', remind_min: 30 }),
  ev(FAJR, 'Dhuhr', '11:00', '11:15', { source: 'gcal', remind_min: 15, external_ref: { source: 'gcal', id: 'p/g1', calendar: 'Prayer times', calendar_id: 'p' } }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: CREATED, updated_at: CREATED }
const HISTORY = [{
  id: 'f0000000-0000-4000-8000-000000000001', user_id: UID, event_type: 'notify.event_reminder', entity_type: 'notification', entity_id: eid(GYM),
  payload: { title: 'Gym · in 15 min', body: '11:00–12:00', event_id: eid(GYM), starts_at: iso('11:00') }, created_at: iso('10:45'),
}]
const tables = (s) => structuredClone({
  tasks: TASKS, calendar_events: s.events ?? MENU_EVENTS, projects: [], domains: [], areas: [], inbox_items: [], routines: [], routine_completions: [], people: [], interactions: [],
  app_settings: [{ ...SETTINGS, ...(s.settings ?? {}) }], activity_log: s.history ?? [], push_subscriptions: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const view = o.view ?? DESKTOP
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, tauri]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '1')
    localStorage.setItem('kf-whats-new:00000000-0000-4000-8000-00000000d3e0', JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 }))
    if (tauri) {
      document.hasFocus = () => false // the window sits in the tray
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => { window.__tauriCalls.push({ cmd, args: args ?? null }); return cmd === 'autostart_get' ? false : null } }
    }
  }, [o.theme ?? 'day', JSON.stringify(session), !!o.tauri])
  const state = { rows: tables(o), writes: [], reads: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      const rows = (state.rows[table] ??= [])
      if (body && typeof body === 'object') for (const row of Array.isArray(body) ? body : [body]) {
        const i = rows.findIndex((x) => x.id === row.id)
        if (i === -1) rows.push(row)
        else rows[i] = { ...rows[i], ...row }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    state.reads.push(table)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(o.at ?? '10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  const start = state.writes.length
  for (let i = 0; i < 15 && state.writes.length === start; i++) await sleep(200)
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(500)
  }
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const fc = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]`).first()
const occId = (n, hhmm, day) => `${eid(n)}::${iso(hhmm, day)}`
const menu = (page, label = 'Block details') => page.locator(`[role="menu"][aria-label="${label}"]`).last()
const item = (page, label, menuLabel) => menu(page, menuLabel).getByRole('menuitem', { name: label, exact: false }).first()
async function openBlock(page, kfId) {
  await fc(page, kfId).scrollIntoViewIfNeeded()
  await sleep(150)
  await fc(page, kfId).click()
  await menu(page).waitFor({ timeout: 4000 })
  await sleep(250)
}
const REMIND = 'No reminder|At start|5 min before|10 min before|15 min before|30 min before|1 hr before'

// ── M1: desktop — the Remind row, its submenu, a pick with Undo ──
if (want('menu')) for (const theme of ['day', 'night']) {
  const { ctx, page, errors, state } = await open('/calendar', { theme })
  await openBlock(page, eid(LUNCH))
  const labels = await menu(page).getByRole('menuitem').allInnerTexts()
  check(`m1 ${theme}: Remind sits after Repeat, quiet "No reminder"`, /Does not repeat/.test(labels[3]) && /No reminder/.test(labels[4]), JSON.stringify(labels))
  await item(page, 'No reminder').click()
  await sleep(300)
  const choices = (await menu(page, 'Remind').getByRole('menuitem').allInnerTexts()).map((t) => t.trim())
  check(`m1 ${theme}: None · at start · 5 · 10 · 15 · 30 min · 1 hr`, choices.join('|') === REMIND, JSON.stringify(choices))
  await shot(page, `m1-remind-submenu-${theme}`)
  if (theme === 'day') {
    let w = state.writes.length
    await item(page, '15 min before', 'Remind').click()
    await settle(state)
    const wrote = posts(state, 'calendar_events', w).find((e) => e.id === eid(LUNCH))
    check('m1 15 min before → remind_min 15 on the event row', wrote?.remind_min === 15, JSON.stringify(wrote?.remind_min))
    check('m1 toast "Remind 15 min before · Lunch with Omar" with Undo', await toastSoon(page, 'Remind 15 min before · Lunch with Omar'))
    await openBlock(page, eid(LUNCH))
    check('m1 the row now reads "Remind 15 min before"', /Remind 15 min before/.test(await item(page, 'Remind 15 min before').innerText().catch(() => '')))
    await page.keyboard.press('Escape')
    await sleep(300)
    w = state.writes.length
    await page.locator('.kf-toast', { hasText: 'Remind 15 min before' }).getByRole('button', { name: 'Undo' }).first().click()
    await settle(state)
    check('m1 Undo → remind_min back to null', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.remind_min === null))
  }
  check(`m1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── M2: a repeating event — set from an occurrence, it lands on the series row (every repeat) ──
if (want('series')) {
  const { ctx, page, errors, state } = await open('/calendar')
  await openBlock(page, occId(STANDUP, '08:00', 14))
  const w = state.writes.length
  await item(page, 'No reminder').click()
  await sleep(300)
  await item(page, '10 min before', 'Remind').click()
  await settle(state)
  const wrote = posts(state, 'calendar_events', w)
  check('m2 10 min before on Wednesday → the series row carries remind_min 10, no occurrence id written', wrote.some((e) => e.id === eid(STANDUP) && e.remind_min === 10) && wrote.every((e) => !String(e.id).includes('::')), JSON.stringify(wrote.map((e) => [e.id, e.remind_min])))
  await openBlock(page, occId(STANDUP, '08:00', 16))
  check('m2 …and Friday’s occurrence reads "Remind 10 min before"', (await item(page, 'Remind 10 min before').count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(300)
  // A Google event: no Remind row (read-only). A task block: none either (its task reminds).
  await openBlock(page, eid(FAJR))
  const g = await menu(page).getByRole('menuitem').allInnerTexts()
  check('m2 a Google event offers no Remind', !g.some((l) => /remind/i.test(l)), JSON.stringify(g))
  await page.keyboard.press('Escape')
  await sleep(300)
  await openBlock(page, eid(TYREB))
  const t = await menu(page).getByRole('menuitem').allInnerTexts()
  check('m2 a task block offers no Remind', !t.some((l) => /remind/i.test(l)), JSON.stringify(t))
  check('m2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P1: phone — the event sheet's Remind row and its action sheet ──
if (want('phone')) for (const theme of ['day', 'night']) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: PHONE, theme })
  const tap = async (loc) => {
    const p = center(await loc.boundingBox())
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
    await sleep(40)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(700)
  }
  const block = page.locator(`.pc-block[data-id="${eid(LUNCH)}"]`)
  await block.scrollIntoViewIfNeeded().catch(() => {})
  await tap(block)
  const rows = await page.locator('.pc-bs-rows .kf-as-row').allInnerTexts()
  check(`p1 ${theme}: the sheet has "No reminder" after the repeat row`, /Does not repeat/.test(rows[3]) && /No reminder/.test(rows[4]), JSON.stringify(rows))
  await tap(page.locator('.pc-bs-rows .kf-as-row', { hasText: 'No reminder' }))
  const sheet = (await page.locator('.kf-as-row').allInnerTexts()).map((t) => t.trim())
  check(`p1 ${theme}: the Remind sheet lists the seven choices`, REMIND.split('|').every((c) => sheet.some((s) => s.startsWith(c))), JSON.stringify(sheet))
  await shot(page, `p1-remind-sheet-${theme}`)
  if (theme === 'day') {
    const w = state.writes.length
    await tap(page.locator('.kf-as-row', { hasText: 'At start' }).last())
    await settle(state)
    check('p1 At start → remind_min 0', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.remind_min === 0))
    check('p1 toast "Remind at start · Lunch with Omar"', await toastSoon(page, 'Remind at start · Lunch with Omar'))
  }
  check(`p1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── W1: the Windows app's own sweep (device planner) — each occurrence once; never a Google event ──
const calls = (page, cmd) => page.evaluate((c) => (window.__tauriCalls ?? []).filter((x) => !c || x.cmd === c), cmd)
const toasts = async (page) => (await calls(page, 'notify_local')).map((c) => c.args)
if (want('windows')) {
  const { ctx, page, errors, state } = await open('/today', { tauri: true, at: '10:44:40', events: PLAN_EVENTS, settings: { lock_screen_names: true, quiet_hours_on: false } })
  check('w1 the calendar rows are read on Today (whatever page is open)', state.reads.includes('calendar_events'), JSON.stringify([...new Set(state.reads)]))
  check('w1 nothing before 10:45', (await toasts(page)).length === 0, JSON.stringify(await toasts(page)))
  await page.clock.runFor(31_000)
  await sleep(600)
  const gym = (await toasts(page)).filter((t) => /Gym|events/.test(t?.title ?? ''))
  check('w1 10:45 → "Gym · in 15 min" / "11:00–12:00" · Open, with sound — alone (the Google event at 11:00 stays quiet)', gym.length === 1 && gym[0].title === 'Gym · in 15 min' && gym[0].body === '11:00–12:00' && JSON.stringify(gym[0].actions) === JSON.stringify([['open', 'Open']]) && gym[0].silent === false, JSON.stringify(gym))
  await page.clock.runFor(15 * 60_000)
  await sleep(600)
  const all = await toasts(page)
  const walk = all.filter((t) => /Lunch walk/.test(t?.title ?? ''))
  check('w1 11:00 → today’s occurrence of the daily walk: "Lunch walk · in 30 min" / "11:30–11:45"', walk.length === 1 && walk[0].body === '11:30–11:45' && walk[0].title === 'Lunch walk · in 30 min', JSON.stringify(walk))
  check('w1 each once, not every 30-second sweep; nothing from Google', all.filter((t) => /Gym/.test(t?.title ?? '')).length === 1 && !all.some((t) => /Dhuhr|events/.test(`${t?.title} ${t?.body}`)), JSON.stringify(all.map((t) => t?.title)))
  const payload = JSON.parse(gym[0]?.payload ?? '{}')
  check('w1 the toast carries kind event_reminder and the calendar on that day', payload.kind === 'event_reminder' && payload.url === '/calendar?date=2026-10-12', JSON.stringify(payload))
  check('w1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  // Event reminder switched off: the same morning says nothing.
  const off = await open('/today', { tauri: true, at: '10:44:40', events: PLAN_EVENTS, settings: { lock_screen_names: true, event_reminder_on: false } })
  await off.page.clock.runFor(31_000)
  await sleep(600)
  check('w1 Event reminder off → no toast', !(await toasts(off.page)).some((t) => /Gym/.test(t?.title ?? '')))
  await off.ctx.close()
}

// ── S1: Settings → Notifications → Kinds: Event reminder, on by default, its own switch ──
if (want('settings')) {
  const { ctx, page, errors, state } = await open('/settings')
  await page.getByRole('button', { name: 'Send a test notification' }).scrollIntoViewIfNeeded()
  const sw = page.locator('div').filter({ has: page.getByText('Event reminder', { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last().locator('[role="switch"]')
  check('s1 an "Event reminder" switch, on (no column in the row yet = its default)', (await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'true')
  await sw.scrollIntoViewIfNeeded()
  await shot(page, 's1-settings-kinds')
  const w = state.writes.length
  await sw.click()
  await settle(state)
  check('s1 the switch writes event_reminder_on false', posts(state, 'app_settings', w).some((r) => r.event_reminder_on === false))
  check('s1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── H1: Activity's notification history shows a sent event reminder, and Open lands on that day ──
if (want('history')) {
  const { ctx, page, errors } = await open('/activity', { history: HISTORY })
  await page.locator('.afilter', { hasText: 'Notifications' }).click()
  await sleep(400)
  const rows = (await page.locator('.aitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
  check('h1 the history row says what was sent: "Gym · in 15 min" / "11:00–12:00"', rows.some((r) => r.includes('Gym · in 15 min') && r.includes('11:00–12:00')), JSON.stringify(rows))
  await shot(page, 'h1-history')
  await page.locator('.anotice button', { hasText: 'Open' }).first().click()
  await sleep(800)
  check('h1 Open → the calendar on Monday 12 Oct', new URL(page.url()).pathname === '/calendar' && new URL(page.url()).searchParams.get('date') === '2026-10-12', page.url())
  check('h1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
