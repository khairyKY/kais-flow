// User time zones (2026-10-04) on the REAL app, signed in against a MOCKED backend — the task-sheet recipe
// (docs/log/assets/task-sheet/verify.mjs): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, and Playwright answers every REST call.
// The user lives in New York (app_settings.timezone = America/New_York) and so does the browser; the clock
// is Sat 3 Oct 2026, 21:30 EDT — already Sunday 04:30 in Cairo, so every Cairo leftover would show.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5255'
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
const UID = '00000000-0000-4000-8000-0000000000e5'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'ny@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// New York is EDT (UTC-4) on these dates.
const ny = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h + 4, m)).toISOString()
}
const NOW = ny(3, '21:30') // 2026-10-04T01:30Z
const CREATED = '2026-09-20T12:00:00.000Z'
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const RENT = 1, LATE = 2, SUNDAY = 3
const TASKS = [
  task(RENT, 'Pay the rent', { top3: true, due_at: ny(3, '22:00'), duration_min: 15 }),
  task(LATE, 'Email the landlord', { due_at: ny(3, '23:00') }),
  task(SUNDAY, 'Sunday brunch booking', { due_at: ny(4, '10:00') }), // Sunday in NY — but "today" (17:00) in Cairo
]
const ev = (n, title, day, from, to) => ({
  id: `e1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: ny(day, from), ends_at: ny(day, to), all_day: false,
  task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [ev(1, 'Dinner with Sam', 3, '20:00', '21:00'), ev(2, 'Late call with Cairo', 3, '22:30', '23:00'), ev(3, 'Farmers market', 4, '08:00', '09:00')]
const settings = (timezone) => ({ user_id: UID, timezone, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', workspace_name: 'Personal', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = o.ctx ?? (await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: o.deviceZone ?? 'America/New_York', locale: 'en-US' }))
  if (!o.ctx) {
    await ctx.addInitScript((sess) => {
      localStorage.setItem('kf_theme', 'day')
      localStorage.setItem('sb-127-auth-token', sess)
    }, JSON.stringify(session))
  }
  const state = o.state ?? { rows: { tasks: TASKS, calendar_events: EVENTS, app_settings: [settings(o.zone ?? 'America/New_York')] }, writes: [] }
  if (!o.ctx) {
    await ctx.route('http://127.0.0.1:9/**', async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      const table = url.pathname.replace('/rest/v1/', '')
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        let body = null
        try { body = req.postDataJSON() } catch { body = req.postData() }
        state.writes.push({ method: req.method(), table, body })
        return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      }
      if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
      const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const rows = state.rows[table] ?? []
      if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
      return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
    })
  }
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
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
  await sleep(450)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const zoneLabel = (page) => page.locator('.app-topbar-zone').first().textContent().catch(() => '')
const writesTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => w.body)
const sheetOf = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('.ts-top') })

// 1 — Today on a phone: New York's date; tonight's tasks are today's, Sunday's are not.
{
  const name = 'today-ny'
  const { ctx, page, errors } = await open('/today')
  await shot(page, name)
  check(`${name} header is New York's date (Saturday, Oct 3 — Cairo is already Sunday)`, (await text(page.locator('.tp-bar-title'))) === 'Saturday, Oct 3', await text(page.locator('.tp-bar-title')))
  check(`${name} Top 3 holds tonight's rent (due 22:00 NY)`, (await page.locator(`.tp [id="task-${id(RENT)}"]`).count()) === 1)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 1b — Tasks: tonight's two are Today, Sunday 10:00 is Tomorrow (on Cairo's clock all three are today).
{
  const name = 'tasks-ny'
  const { ctx, page, errors } = await open('/tasks')
  await shot(page, name)
  const body = (await page.locator('main').innerText()).toUpperCase()
  check(`${name} the shell's date is Sat 3 Oct`, body.includes('SAT 3 OCT'), body.slice(0, 40))
  check(`${name} TODAY · 2 (rent 22:00, landlord 23:00) · TOMORROW · 1 (Sunday brunch)`, body.includes('TODAY · 2') && body.includes('TOMORROW · 1') && body.indexOf('SUNDAY BRUNCH BOOKING') > body.indexOf('TOMORROW · 1'), body.match(/(TODAY|TOMORROW) · \d/g)?.join(' '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 2 — the date picker: quick picks on New York days; Tomorrow = Sun 4 Oct 09:00 New York (13:00Z).
{
  const name = 'tomorrow-ny'
  const { ctx, page, cdp, errors, state } = await open(`/tasks?task=${id(RENT)}`)
  await tap(cdp, sheetOf(page).locator('.ts-chips .kf-chip').first())
  await sleep(400)
  const picker = page.locator('[role="dialog"]').last()
  const rows = (await picker.locator('.kf-as-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  await shot(page, `${name}-picks`)
  check(`${name} quick picks: Today · Tomorrow · Next week (no "This weekend" on a Saturday)`, rows.some((r) => r.startsWith('Today')) && rows.some((r) => r.startsWith('Tomorrow')) && rows.some((r) => r.startsWith('Next week')) && !rows.some((r) => r.startsWith('This weekend')), JSON.stringify(rows.slice(0, 5)))
  const w0 = state.writes.length
  // plan-replan (2026-10-07): the date chip opens the Plan list, where "Next free slot" can read
  // "Tomorrow 08:00…" too — tap the Tomorrow row itself.
  await tap(cdp, picker.locator('.kf-as-row', { hasText: 'Tomorrow, first thing' }).first())
  await sleep(500)
  const w = writesTo(state, 'tasks', w0)
  check(`${name} Tomorrow → due Sun 4 Oct 09:00 New York (2026-10-04T13:00Z)`, w.length === 1 && w[0].due_at === '2026-10-04T13:00:00.000Z', JSON.stringify(w.map((x) => x.due_at)))
  check(`${name} the chip reads Tomorrow · 09:00`, (await text(sheetOf(page).locator('.ts-chips .kf-chip').first())).toUpperCase() === 'TOMORROW · 09:00', await text(sheetOf(page).locator('.ts-chips .kf-chip').first()))
  await shot(page, name)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 3 — the phone calendar: the now line at 21:30 New York, on Saturday's column.
{
  const name = 'calendar-ny'
  const { ctx, page, errors } = await open('/calendar')
  await page.locator('.pc-nowtag').scrollIntoViewIfNeeded().catch(() => {})
  await sleep(300)
  await shot(page, name)
  check(`${name} now tag reads 21:30 (New York), not 04:30 (Cairo)`, (await text(page.locator('.pc-nowtag'))) === '21:30', await text(page.locator('.pc-nowtag')))
  check(`${name} tonight's events are drawn on today`, (await page.locator('.pc-block', { hasText: 'Dinner with Sam' }).count()) === 1 && (await page.locator('.pc-block', { hasText: 'Late call with Cairo' }).count()) === 1)
  check(`${name} Sunday's market is not on today's column`, (await page.locator('.pc-block', { hasText: 'Farmers market' }).count()) === 0)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 4 — Settings → Timezone (desktop): the zone shows in the shell; search + tap writes; the shell follows.
{
  const name = 'settings-ny'
  const { ctx, page, errors, state } = await open('/settings', { view: desktop })
  check(`${name} topbar zone is America/New_York`, (await zoneLabel(page)) === 'America/New_York', await zoneLabel(page))
  check(`${name} sidebar reads "Personal · New York"`, /personal · new york/i.test(await text(page.locator('.app-sidebar-header'))), await text(page.locator('.app-sidebar-header')))
  const card = page.locator('#settings-Timezone')
  await card.scrollIntoViewIfNeeded()
  check(`${name} current · America/New_York · GMT-4`, /current · America\/New_York · GMT-4/.test(await text(card)), await text(card))
  check(`${name} no "Use this device's zone" when the device is already there`, (await card.getByRole('button', { name: /Use this device/ }).count()) === 0)
  await card.getByRole('searchbox', { name: 'Search time zones' }).fill('tokyo')
  await sleep(300)
  await shot(page, `${name}-search`)
  const w0 = state.writes.length
  await card.getByRole('option', { name: /Asia\/Tokyo/ }).click()
  await sleep(800)
  const w = writesTo(state, 'app_settings', w0)
  check(`${name} picking Asia/Tokyo writes app_settings.timezone`, w.length >= 1 && w.at(-1).timezone === 'Asia/Tokyo' && w.at(-1).user_id === UID, JSON.stringify(w.map((x) => x.timezone)))
  check(`${name} the shell follows at once (topbar Asia/Tokyo)`, (await zoneLabel(page)) === 'Asia/Tokyo', await zoneLabel(page))
  await page.locator('#settings-Timezone').scrollIntoViewIfNeeded()
  await shot(page, name)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 5 — a default (Cairo) account signing in on a New York device: asked once, never switched silently.
{
  const name = 'offer-ny-device'
  const env = await open('/today', { view: desktop, zone: 'Africa/Cairo' })
  const { ctx, page, errors, state } = env
  const msgs = await page.locator('.kf-toast-msg').allInnerTexts()
  await shot(page, name)
  check(`${name} toast: "Your device is in America/New_York — use it?"`, msgs.includes('Your device is in America/New_York — use it?'), JSON.stringify(msgs))
  check(`${name} nothing written until asked`, writesTo(state, 'app_settings').length === 0)
  check(`${name} the topbar still says Africa/Cairo`, (await zoneLabel(page)) === 'Africa/Cairo', await zoneLabel(page))
  const w0 = state.writes.length
  await page.locator('.kf-toast').getByRole('button', { name: 'Use it' }).click()
  await sleep(800)
  const w = writesTo(state, 'app_settings', w0)
  check(`${name} Use it → timezone America/New_York written`, w.length >= 1 && w.at(-1).timezone === 'America/New_York', JSON.stringify(w.map((x) => x.timezone)))
  check(`${name} …and the shell follows`, (await zoneLabel(page)) === 'America/New_York', await zoneLabel(page))
  await page.close()
  // Same device again, the account still on the default (say they dismissed it): no second ask.
  state.rows.app_settings = [settings('Africa/Cairo')]
  const again = await open('/today', { view: desktop, ctx, state })
  check(`${name} asked once per device — no toast on the next visit`, !(await again.page.locator('.kf-toast-msg').allInnerTexts()).some((m) => m.startsWith('Your device is in')))
  check(`${name} no page errors`, errors.length === 0 && again.errors.length === 0, [...errors, ...again.errors].join(' | '))
  await ctx.close()
  const fresh = await open('/settings', { view: desktop, zone: 'Africa/Cairo' })
  const card = fresh.page.locator('#settings-Timezone')
  await card.scrollIntoViewIfNeeded()
  check(`${name} Settings offers "Use this device’s zone (America/New_York)" first`, (await card.getByRole('button', { name: 'Use this device’s zone (America/New_York)' }).count()) === 1)
  await shot(fresh.page, `${name}-settings`)
  const w1 = fresh.state.writes.length
  await card.getByRole('button', { name: 'Use this device’s zone (America/New_York)' }).click()
  await sleep(800)
  check(`${name} …which writes it`, writesTo(fresh.state, 'app_settings', w1).at(-1)?.timezone === 'America/New_York')
  await fresh.ctx.close()
}

// 6 — the phone has the same picker (it was a read-out row).
{
  const name = 'settings-phone'
  const { ctx, page, errors } = await open('/settings')
  const search = page.getByRole('searchbox', { name: 'Search time zones' })
  await search.scrollIntoViewIfNeeded()
  await shot(page, name)
  check(`${name} the Timezone card with its search is on the phone`, (await search.count()) === 1)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
