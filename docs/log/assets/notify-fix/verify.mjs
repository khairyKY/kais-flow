// notify-fix (2026-10-08): "Notifs are not working for phone and PC." The REAL app, signed in against
// a MOCKED backend (the tray-notify recipe): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session sits in localStorage, Playwright answers every REST call and records every write.
// "Windows" = a stub window.__TAURI_INTERNALS__ that records each tray.rs command (notify_local…).
// Android's path (Capacitor local notifications) is proven on the emulator, not here.
//   node verify.mjs <outDir> [baseUrl]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5278'
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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

// ── Saturday 3 Oct 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 3) => {
  const [h, m, s = 0] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m, s))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const FIRST = '2026-07-12T06:00:00.000Z'
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: FIRST, updated_at: FIRST, ...over,
})
const TYRE = 5
const TASKS = [
  task(1, 'GCI homework 1 — NumPy', { top3: true }),
  task(2, 'Do GCI lecture 2’s survey', { top3: true, created_at: iso('09:00', 1) }),
  task(3, 'Skim OS lectures 1 + 2', { top3: true, created_at: iso('09:00', 1) }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('08:50'), reminder_at: iso('08:40'), project_id: 'p0000000-0000-4000-8000-000000000001' }),
  task(6, 'Trashed one', { reminder_at: iso('08:40'), deleted_at: iso('07:00') }),
]
const PROJECTS = [{ id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, name: 'Car', type: 'project', status: 'active', created_at: FIRST, updated_at: FIRST }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: FIRST, updated_at: FIRST, help_seen: ['tour'] }
const SUB = { id: 's1', user_id: UID, endpoint: 'https://fcm.googleapis.com/x', keys: {}, device_label: 'Pixel', created_at: FIRST }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }

async function app(s = {}, o = {}) {
  const ctx = await browser.newContext({ ...DESKTOP, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  if (o.grant) await ctx.grantPermissions(['notifications'], { origin: BASE })
  await ctx.addInitScript(([sess, uid, tauri, deny]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    if (deny && typeof Notification !== 'undefined') Object.defineProperty(Notification, 'permission', { get: () => 'denied' })
    if (tauri) {
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          window.__tauriCalls.push({ cmd, args: args ?? null })
          if (cmd === 'autostart_get') return false
          return null
        },
      }
    }
  }, [JSON.stringify(session), UID, !!o.tauri, !!o.deny])
  const rows = {
    tasks: TASKS,
    calendar_events: [],
    projects: PROJECTS,
    routines: [],
    inbox_items: [],
    domains: [],
    app_settings: [{ ...SETTINGS, ...(s.settings ?? {}) }],
    activity_log: [],
    push_subscriptions: s.subs ?? [],
  }
  const state = { writes: [], fn: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice('/functions/v1/'.length)
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.fn.push({ name, body })
      if (name === 'notify') return r.fulfill({ json: { sent: 1, pruned: 0, users: [] } })
      return r.fulfill({ status: 500, json: { error: 'mock' } })
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
    const list = rows[table] ?? []
    if (one) return list.length ? r.fulfill({ json: list[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: list, headers: { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` } }).catch(() => {})
  })
  const errors = []
  async function open(route, at) {
    const page = await ctx.newPage()
    await page.clock.install({ time: at })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await sleep(900)
    return page
  }
  return { ctx, state, errors, open }
}
const calls = (page, cmd) => page.evaluate((c) => (window.__tauriCalls ?? []).filter((x) => !c || x.cmd === c), cmd)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const status = (page) => page.locator('[data-kf-notify-status] li').allInnerTexts()
async function toTest(page) {
  await page.getByRole('button', { name: 'Send a test notification' }).scrollIntoViewIfNeeded()
  await sleep(500)
}

// ── Windows: a reminder that comes due while the app runs → notify_local (tray.rs), once ──
{
  const { ctx, errors, open } = await app({ settings: { lock_screen_names: true } }, { tauri: true })
  const main = await open('/today', cairo('08:41'))
  await main.clock.runFor(31_000)
  await sleep(500)
  const toasts = (await calls(main, 'notify_local')).map((c) => c.args)
  const tyre = toasts.filter((t) => t.title?.startsWith('Call the tyre'))
  check('Windows: a due reminder → notify_local, worded at the real clock, with its project', tyre.length === 1 && /^Call the tyre supplier · in [89] min$/.test(tyre[0].title) && tyre[0].body === '08:50 · Car' && JSON.stringify(tyre[0].actions) === JSON.stringify([['done', 'Done'], ['tomorrow', 'Tomorrow']]), JSON.stringify(tyre))
  check('Windows: a trashed task never reminds', !toasts.some((t) => /Trashed|2 reminders/.test(t.title)), JSON.stringify(toasts.map((t) => t.title)))
  check('Windows: the payload carries the task for Done/Tomorrow', JSON.parse(tyre[0]?.payload ?? '{}').taskIds?.[0] === id(TYRE), tyre[0]?.payload)
  await main.clock.runFor(61_000)
  await sleep(300)
  check('Windows: …and only once', (await calls(main, 'notify_local')).filter((c) => c.args.title?.startsWith('Call the tyre')).length === 1)
  check('Windows reminder: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Windows: the morning digest and the evening nudge now toast too (WebView2 has no Web Push) ──
{
  const { ctx, errors, open } = await app({ settings: { lock_screen_names: true, evening_nudge_at: '08:01:00', quiet_hours_on: false } }, { tauri: true })
  const main = await open('/today', cairo('07:59:20'))
  await main.clock.runFor(31_000) // the first sweep after load, before 08:00
  await sleep(300)
  check('Windows rituals: nothing before 08:00', !(await calls(main, 'notify_local')).some((c) => /Good morning/.test(c.args.title)))
  await main.clock.runFor(60_000) // 08:00:20 → the 08:00 digest
  await sleep(300)
  const digest = (await calls(main, 'notify_local')).map((c) => c.args).find((t) => /Good morning/.test(t.title))
  check('Windows rituals: the 08:00 digest → "Good morning — 3 to tend today" · Plan my day · Open, silent', digest?.title === 'Good morning — 3 to tend today' && digest?.body.startsWith('✶ GCI homework 1 — NumPy') && digest?.silent === true && JSON.stringify(digest?.actions) === JSON.stringify([['plan', 'Plan my day'], ['open', 'Open']]), JSON.stringify(digest))
  await main.clock.runFor(60_000) // 08:01:50 → the nudge at its own (moved) time
  await sleep(300)
  const nudge = (await calls(main, 'notify_local')).map((c) => c.args).find((t) => /garden/.test(t.title))
  check('Windows rituals: the nudge at the user’s own time → "The garden’s ready to close" · Shut down', nudge?.title === 'The garden’s ready to close' && /done · \d+ left/.test(nudge?.body) && nudge?.actions?.[0]?.[0] === 'shutdown', JSON.stringify(nudge))
  check('Windows rituals: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Windows: paused → nothing; the kind off → nothing ──
for (const [label, settings] of [['paused', { notify_paused_until: iso('10:00') }], ['Task reminder off', { task_reminder_on: false }]]) {
  const { ctx, open } = await app({ settings }, { tauri: true })
  const main = await open('/today', cairo('08:41'))
  await main.clock.runFor(31_000)
  await sleep(300)
  check(`Windows: ${label} → no reminder toast`, !(await calls(main, 'notify_local')).some((c) => /tyre|reminder/i.test(c.args.title)), JSON.stringify((await calls(main, 'notify_local')).map((c) => c.args.title)))
  await ctx.close()
}

// ── Windows: the test button goes through notify_local and says what's in the way ──
{
  const { ctx, state, errors, open } = await app({ settings: { quiet_hours_on: false } }, { tauri: true })
  const page = await open('/settings', cairo('10:00'))
  await toTest(page)
  check('Test (Windows): nothing in the way', JSON.stringify(await status(page)) === JSON.stringify(['Nothing in the way on this device.']), JSON.stringify(await status(page)))
  await page.getByRole('button', { name: 'Send a test notification' }).click()
  await sleep(500)
  const t = (await calls(page, 'notify_local')).at(-1)?.args
  check('Test (Windows): notify_local with the test notice, not a push', t?.title === 'Kai’s Flow' && t?.body === 'Test notification — this device can show them.' && !state.fn.some((f) => f.name === 'notify'), JSON.stringify(t))
  check('Test (Windows): points at Windows Settings if nothing shows', (await page.getByText('Check Windows Settings → System → Notifications → Kai’s Flow', { exact: false }).count()) === 1)
  await shot(page, 'test-windows-clear')
  check('Test (Windows): no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, open } = await app({ settings: { notify_paused_until: iso('23:41'), task_reminder_on: false, evening_nudge_on: false } }, { tauri: true })
  const page = await open('/settings', cairo('23:00'))
  await toTest(page)
  const lines = await status(page)
  check('Test (Windows): paused · quiet hours · kinds off, in plain words', JSON.stringify(lines) === JSON.stringify(['Notifications are paused until 23:41.', 'Quiet hours are on — notifications come without a sound.', 'Turned off: Task reminder, Evening nudge.']), JSON.stringify(lines))
  await page.getByRole('button', { name: 'Send a test notification' }).click()
  await sleep(400)
  check('Test (Windows): the test still goes while paused', (await calls(page, 'notify_local')).some((c) => c.args.title === 'Kai’s Flow'))
  await shot(page, 'test-windows-blocked')
  await ctx.close()
}

// ── Web: reminders come by Web Push (server) — the open tab never toasts one itself ──
{
  const { ctx, errors, open } = await app({ settings: { lock_screen_names: true } }, { grant: true })
  const page = await open('/today', cairo('08:41'))
  await page.evaluate(() => {
    window.__shown = []
    const reg = { showNotification: async (title, opts) => window.__shown.push({ title, opts }) }
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, addEventListener() {}, removeEventListener() {} } })
  })
  await page.clock.runFor(61_000)
  await sleep(300)
  check('Web: no local reminder from the tab (the push is the one)', (await page.evaluate(() => window.__shown.length)) === 0)
  // The worker's side: sw-push.js shows exactly what notify sends (copy.ts reminderNotice).
  const shown = await page.evaluate(async () => {
    const code = await (await fetch('/sw-push.js')).text()
    const listeners = {}
    const out = []
    const self = { location: { origin: location.origin }, addEventListener: (t, f) => (listeners[t] = f), registration: { showNotification: async (title, o) => out.push({ title, ...o }) }, clients: { matchAll: async () => [] } }
    new Function('self', code)(self)
    let done
    const payload = { kind: 'task_reminder', title: 'Call the tyre supplier · in 10 min', body: '08:50 · Car', tag: 'reminder-x', actions: [{ action: 'done', title: 'Done' }, { action: 'tomorrow', title: 'Tomorrow' }], url: '/tasks?focus=x', silent: false, taskIds: ['x'] }
    listeners.push({ data: { json: () => payload }, waitUntil: (p) => (done = p) })
    await done
    return out[0]
  })
  check('Web: the service worker shows the pushed reminder with Done · Tomorrow', shown?.title === 'Call the tyre supplier · in 10 min' && shown?.actions?.length === 2 && shown?.data?.taskIds?.[0] === 'x', JSON.stringify(shown))
  check('Web reminder: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Web: the test button = a push through notify; the status names what's in the way ──
{
  const { ctx, state, errors, open } = await app({ subs: [SUB], settings: { quiet_hours_on: false } }, { grant: true })
  const page = await open('/settings', cairo('10:00'))
  await toTest(page)
  const lines = await status(page)
  check('Test (web, allowed, this browser not subscribed): says so', JSON.stringify(lines) === JSON.stringify(['This device isn’t subscribed — tap “Subscribe this device” first.']), JSON.stringify(lines))
  await page.getByRole('button', { name: 'Send a test notification' }).click()
  await sleep(600)
  check('Test (web): notify {kind:"test"} → "Sent to 1 device."', state.fn.some((f) => f.name === 'notify' && f.body?.kind === 'test') && (await page.getByText('Sent to 1 device.').count()) === 1)
  await shot(page, 'test-web-sent')
  check('Test (web): no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, state, open } = await app({ settings: { quiet_hours_on: false } })
  const page = await open('/settings', cairo('10:00'))
  await toTest(page)
  const lines = await status(page)
  check('Test (web, never asked, no devices): "the test will ask" + not subscribed', lines[0] === 'Notifications aren’t allowed yet — the test will ask.' && lines[1]?.startsWith('This device isn’t subscribed'), JSON.stringify(lines))
  await page.getByRole('button', { name: 'Send a test notification' }).click()
  await sleep(500)
  check('Test (web, no devices): nothing sent, and it says why', !state.fn.some((f) => f.name === 'notify') && (await page.getByText('Not sent — no device is subscribed yet.', { exact: false }).count()) === 1)
  await ctx.close()
}
{
  const { ctx, open } = await app({ settings: { quiet_hours_on: false } }, { deny: true })
  const page = await open('/settings', cairo('10:00'))
  await toTest(page)
  const lines = await status(page)
  check('Test (web, denied): "Permission denied"', lines[0] === 'Permission denied — allow notifications for this site in the browser’s site settings.', JSON.stringify(lines))
  await shot(page, 'test-web-denied')
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
