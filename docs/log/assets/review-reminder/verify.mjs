// v1.6.4 F2: the weekly review reminder, on the REAL app signed in against a MOCKED backend (the notif-sounds
// recipe: VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session, Playwright answers every REST call and
// records every write; the Windows app is a stub __TAURI_INTERNALS__ recording notify_local).
//   1. Settings → Notifications → Kinds: a "Weekly review" switch bound to review_reminder_on.
//   2. Settings → Time → Weekly review: the help line says when the reminder comes (12-hour, 6:00 PM with no time set).
//   3. The Windows sweep fires it on the review day at its time, once; not when that week is closed, not when
//      switched off, not on another day; 18:00 with no time set.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5254] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'http://localhost:5254'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000095f2'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'review@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Friday 20 Nov 2026, Cairo = UTC+2.
const cairo = (hhmm, day = 20) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h - 2, m))
}
const CREATED = '2026-09-20T12:00:00.000Z'
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', quiet_hours_on: false, lock_screen_names: true, weekend_days: [5, 6], review_day: 5, review_time: '17:30:00', review_reminder_on: true, morning_digest_on: false, evening_nudge_on: false, created_at: CREATED, updated_at: CREATED }
const CLOSED = { id: '95000000-0000-4000-8000-000000000001', user_id: UID, event_type: 'review.week_closed', entity_type: 'review', entity_id: 'x', payload: { week: '2026-11-15' }, created_at: cairo('12:00').toISOString() }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(route, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(
    ([sess, uid, tauri]) => {
      localStorage.setItem('kf_theme', 'day')
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
      window.Audio = class { play() { return Promise.resolve() } pause() {} }
      if (tauri) {
        window.__tauriCalls = []
        window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => (window.__tauriCalls.push({ cmd, args: args ?? null }), cmd === 'autostart_get' ? false : null) }
      }
    },
    [JSON.stringify(session), UID, !!o.tauri],
  )
  const state = { rows: { tasks: [], app_settings: [o.settings ?? SETTINGS], activity_log: o.activity ?? [] }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
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
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (o.clock) await page.clock.install({ time: cairo(o.clock, o.day) })
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}
const settingsWrites = (state) => state.writes.filter((w) => w.table === 'app_settings').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))

// ═══ 1 — Kinds: the switch ═══
{
  const { ctx, page, errors, state } = await open('/settings/notify')
  const sw = page.getByRole('switch', { name: 'Weekly review', exact: true })
  check('1 a "Weekly review" switch in Kinds, on', (await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'true')
  await sw.scrollIntoViewIfNeeded()
  await sw.click()
  await sleep(600)
  check('1 turning it off writes review_reminder_on = false', settingsWrites(state).at(-1)?.review_reminder_on === false, JSON.stringify(settingsWrites(state).at(-1)))
  await page.screenshot({ path: path.join(OUT, 'kinds-desktop-day.png') })
  check('1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 2 — Time: the help line ═══
const helpOf = async (settings) => {
  const { ctx, page, errors } = await open('/settings/calendar', { settings })
  const row = page.locator('text=/Today asks until the week is closed/').first()
  const text = (await row.count()) ? await row.innerText() : ''
  if (settings === SETTINGS) await page.screenshot({ path: path.join(OUT, 'time-desktop-day.png') })
  await ctx.close()
  return { text, errors }
}
{
  const a = await helpOf(SETTINGS)
  check('2 a set time: "You’ll get a reminder at 5:30 PM"', a.text.includes('You’ll get a reminder at 5:30 PM'), a.text)
  const b = await helpOf({ ...SETTINGS, review_time: null })
  check('2 no time: 6:00 PM', b.text.includes('You’ll get a reminder at 6:00 PM'), b.text)
  const c = await helpOf({ ...SETTINGS, review_reminder_on: false })
  check('2 switched off: no reminder line', c.text !== '' && !c.text.includes('reminder'), c.text)
  check('2 no page errors', a.errors.length + b.errors.length + c.errors.length === 0, [...a.errors, ...b.errors, ...c.errors].join(' | '))
}

// ═══ 3 — the Windows sweep ═══
const toasts = (page) => page.evaluate(() => window.__tauriCalls.filter((c) => c.cmd === 'notify_local').map((c) => c.args))
const reviewToasts = async (o) => {
  const { ctx, page, errors } = await open('/today', { tauri: true, ...o })
  await page.clock.runFor(31_000)
  await sleep(500)
  const t = (await toasts(page)).filter((x) => x.title === 'Weekly review')
  await ctx.close()
  return { t, errors }
}
{
  const r = await reviewToasts({ clock: '17:31' })
  const t = r.t[0]
  check('3 Friday 17:31, review at 17:30: one "Weekly review" toast', r.t.length === 1 && t.body === 'Ten quiet minutes to close the week.', JSON.stringify(r.t))
  check('3 … with Start review, opening /weekly-review', JSON.stringify(t?.actions) === JSON.stringify([['open', 'Start review']]) && JSON.parse(t?.payload ?? '{}').url === '/weekly-review', JSON.stringify(t))
  check('3 no page errors', r.errors.length === 0, r.errors.join(' | '))
}
check('3 week already closed: nothing', (await reviewToasts({ clock: '17:31', activity: [CLOSED] })).t.length === 0)
check('3 switched off: nothing', (await reviewToasts({ clock: '17:31', settings: { ...SETTINGS, review_reminder_on: false } })).t.length === 0)
check('3 another day (Thursday 17:31): nothing', (await reviewToasts({ clock: '17:31', day: 19 })).t.length === 0)
check('3 no time set: not at 17:31, at 18:01', (await reviewToasts({ clock: '17:31', settings: { ...SETTINGS, review_time: null } })).t.length === 0 && (await reviewToasts({ clock: '18:01', settings: { ...SETTINGS, review_time: null } })).t.length === 1)

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
