// Notification sound packs (Kai 2026-10-26: "include all of them and keep them separated, each in its
// pack") on the REAL app, signed in against a MOCKED backend (the user-tz recipe: VITE_SUPABASE_URL=
// http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every REST call and records
// every write). `window.Audio` is a stub that records what would have played (and can refuse, like a
// window nobody has clicked yet); the Windows app is a stub `__TAURI_INTERNALS__` recording notify_local.
//   1. Settings → Notifications & sound → Notification sounds: the pack picker, ▶ for each of the ten,
//      each WAV served; desktop day/night + phone shots.
//   2. Switching packs: the synced write, the ▶ rows follow; before the server has the column, no write.
//   3. A notification playing the chosen pack's sound: the Windows app's reminder sweep (silent toast +
//      the pack's WAV; Windows' own sound when the app can't play), a push arriving while a window is on
//      screen (sw-push.js → kf-notification-sound), a snoozed one coming back.
//   node verify.mjs [outDir] [baseUrl]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? HERE
const BASE = process.argv[3] ?? 'http://localhost:5319'
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000005a1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'sounds@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Saturday 3 Oct 2026, Cairo = UTC+3, the clock at 08:41 (tray-notify's day).
const cairo = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, 3, h - 3, m))
}
const iso = (hhmm) => cairo(hhmm).toISOString()
const CREATED = '2026-09-20T12:00:00.000Z'
const id = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// Quiet hours off so nothing depends on the hour; names on so the toast says the task.
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', quiet_hours_on: false, lock_screen_names: true, notification_sound_pack: 'felt', created_at: CREATED, updated_at: CREATED }
const SOUNDS = ['task_reminder', 'event_reminder', 'snoozed_again', 'focus_end', 'break_end', 'morning_digest', 'evening_nudge', 'paper_ready', 'terms', 'sync_problem']

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESKTOP), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(
    ([sess, uid, theme, tauri, canPlay]) => {
      localStorage.setItem('kf_theme', theme)
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
      // What would have played: the path of every Audio the app starts. canPlay false = autoplay refused.
      window.__played = []
      window.__canPlay = canPlay
      window.Audio = class {
        constructor(src) {
          this.src = src
        }
        play() {
          window.__played.push(new URL(this.src, location.href).pathname)
          return window.__canPlay ? Promise.resolve() : Promise.reject(new DOMException('no gesture yet', 'NotAllowedError'))
        }
        pause() {}
      }
      if (tauri) {
        window.__tauriCalls = []
        window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => (window.__tauriCalls.push({ cmd, args: args ?? null }), cmd === 'autostart_get' ? false : null) }
      }
    },
    [JSON.stringify(session), UID, o.theme ?? 'day', !!o.tauri, o.canPlay ?? true],
  )
  const state = { rows: { tasks: o.tasks ?? [], app_settings: [o.settings ?? SETTINGS] }, writes: [] }
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
  if (o.clock) await page.clock.install({ time: cairo(o.clock) })
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}
const played = (page) => page.evaluate(() => window.__played.slice())
const reset = (page) => page.evaluate(() => (window.__played = []))
const card = (page) => page.locator('#settings-NotificationSounds')
const settingsWrites = (state) => state.writes.filter((w) => w.table === 'app_settings').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))

// ═══ 1 + 2 — Settings: the picker, ▶ per kind, switching ═══
{
  const { ctx, page, errors, state } = await open('/settings/notify')
  const c = card(page)
  await c.scrollIntoViewIfNeeded()
  check('1 the Notification sounds card is on Notifications & sound', (await c.count()) === 1 && (await c.locator('.st-title').innerText()).includes('Notification sounds'))
  const seg = c.getByRole('group', { name: 'Notification sound pack' })
  check('1 three packs, Felt picked (the synced value)', (await seg.getByRole('button').allInnerTexts()).join(',') === 'Felt,Glass,Mixed' && (await seg.getByRole('button', { name: 'Felt' }).getAttribute('aria-pressed')) === 'true')
  const rows = await c.locator('[data-notify-sound]').evaluateAll((els) => els.map((e) => e.getAttribute('data-notify-sound')))
  check('1 a ▶ row for each of the ten kinds', JSON.stringify(rows) === JSON.stringify(SOUNDS), rows.join(','))
  check('1 the per-kind switches stay in Kinds (9 toggles there, none in this card)', (await c.getByRole('switch').count()) === 0 && (await page.locator('section', { has: page.getByRole('heading', { name: 'Kinds' }) }).getByRole('switch').count()) === 9)
  const help = await c.locator('[data-notify-sound]').first().locator('xpath=ancestor::section').locator('text=muted felt piano').count()
  check('1 the pack line says what it is and where it plays (web: "otherwise your browser’s own sound")', help > 0 && (await c.innerText()).includes('Played when the app is open; otherwise your browser’s own sound'))
  await reset(page)
  for (const s of SOUNDS) await c.locator(`[data-notify-sound="${s}"] .st-play`).click()
  const heard = await played(page)
  check('1 each ▶ plays its own sound from the Felt pack', JSON.stringify(heard) === JSON.stringify(SOUNDS.map((s) => `/notification-sounds/felt/${s}.wav`)), heard.join(' '))
  const served = await page.evaluate(async (urls) => Promise.all(urls.map(async (u) => [(await fetch(u)).status, (await fetch(u)).headers.get('content-type')])), ['felt', 'glass', 'mixed'].flatMap((p) => SOUNDS.map((s) => `/notification-sounds/${p}/${s}.wav`)))
  check('1 all 30 WAVs are served (3 packs × 10)', served.length === 30 && served.every(([st, ct]) => st === 200 && /audio/.test(ct)), JSON.stringify(served.filter(([st]) => st !== 200)))
  await page.setViewportSize({ width: 1280, height: 1600 }) // the whole card, clear of the sticky header
  await c.scrollIntoViewIfNeeded()
  await c.screenshot({ path: path.join(OUT, 'settings-desktop-day.png') })
  await page.setViewportSize(DESKTOP.viewport)

  // 2 — switching packs
  await reset(page)
  await seg.getByRole('button', { name: 'Glass' }).click()
  await sleep(600)
  const w = settingsWrites(state).at(-1)
  check('2 Glass → the synced write notification_sound_pack = glass (the whole row, as every setting)', w?.notification_sound_pack === 'glass' && w?.timezone === 'Africa/Cairo', JSON.stringify(w))
  check('2 … and you hear the new pack straight away', (await played(page))[0] === '/notification-sounds/glass/task_reminder.wav', (await played(page)).join(' '))
  check('2 the picker and the line follow', (await seg.getByRole('button', { name: 'Glass' }).getAttribute('aria-pressed')) === 'true' && (await c.innerText()).includes('soft glass bells'))
  await reset(page)
  await c.locator('[data-notify-sound="evening_nudge"] .st-play').click()
  check('2 the ▶ rows now play Glass', (await played(page)).join() === '/notification-sounds/glass/evening_nudge.wav', (await played(page)).join(' '))
  await seg.getByRole('button', { name: 'Mixed' }).click()
  await sleep(600)
  check('2 Mixed → notification_sound_pack = mixed', settingsWrites(state).at(-1)?.notification_sound_pack === 'mixed')
  check('1/2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// Before the server has the column (0088 not pushed): ▶ still auditions any pack; nothing is written.
{
  const { notification_sound_pack: _, ...older } = SETTINGS
  const { ctx, page, errors, state } = await open('/settings/notify', { settings: older })
  const c = card(page)
  await c.scrollIntoViewIfNeeded()
  check('2 unmigrated row: reads as Felt, says the choice arrives with the next server update', (await c.getByRole('button', { name: 'Felt', exact: true }).getAttribute('aria-pressed')) === 'true' && (await c.innerText()).includes('Choosing arrives with the next server update'))
  await c.getByRole('button', { name: 'Mixed', exact: true }).click()
  await sleep(500)
  await reset(page)
  await c.locator('[data-notify-sound="terms"] .st-play').click()
  check('2 … auditioning Mixed works, and no write would dead-letter', settingsWrites(state).length === 0 && (await played(page)).join() === '/notification-sounds/mixed/terms.wav', (await played(page)).join(' '))
  check('2 no page errors (unmigrated)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
for (const [view, theme, name] of [[DESKTOP, 'night', 'settings-desktop-night'], [PHONE, 'day', 'settings-phone-day']]) {
  const { ctx, page } = await open('/settings/notify', { view: { ...view, viewport: { width: view.viewport.width, height: 1600 } }, theme })
  await card(page).scrollIntoViewIfNeeded()
  await card(page).screenshot({ path: path.join(OUT, `${name}.png`) })
  await ctx.close()
}

// ═══ 3 — a notification plays the chosen pack's sound ═══
const TYRE = task(1, 'Call the tyre supplier', { due_at: iso('08:50'), reminder_at: iso('08:40') })
const calls = (page, cmd) => page.evaluate((cmd) => window.__tauriCalls.filter((c) => c.cmd === cmd), cmd)
// The Windows app: its 30 s sweep shows the reminder — the toast silent, the pack's WAV played by the app.
{
  const { ctx, page, errors } = await open('/today', { tauri: true, clock: '08:41', tasks: [TYRE], settings: { ...SETTINGS, notification_sound_pack: 'glass' } })
  await page.clock.runFor(31_000)
  await sleep(600)
  const toast = (await calls(page, 'notify_local')).find((c) => c.args?.title?.startsWith('Call the tyre'))?.args
  check('3 Windows: a reminder due → its toast goes out silent', !!toast && toast.silent === true, JSON.stringify(toast))
  check('3 … and the app plays Glass’s task reminder', (await played(page)).includes('/notification-sounds/glass/task_reminder.wav'), (await played(page)).join(' '))
  check('3 no page errors (Windows)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open('/today', { tauri: true, clock: '08:41', tasks: [TYRE], canPlay: false })
  await page.clock.runFor(31_000)
  await sleep(600)
  const toast = (await calls(page, 'notify_local')).find((c) => c.args?.title?.startsWith('Call the tyre'))?.args
  check('3 Windows, the app can’t play yet (not clicked since it started): the toast keeps Windows’ sound', !!toast && toast.silent === false, JSON.stringify(toast))
  await ctx.close()
}
// A snoozed reminder coming back (0082 remind_again_at) gets "snoozed again".
{
  const again = task(2, 'Call the tyre supplier', { due_at: iso('08:50'), reminder_at: iso('07:20'), reminder_sent: true, remind_again_at: iso('08:40') })
  const { ctx, page } = await open('/today', { tauri: true, clock: '08:41', tasks: [again], settings: { ...SETTINGS, notification_sound_pack: 'mixed' } })
  await page.clock.runFor(31_000)
  await sleep(600)
  check('3 Windows: a snoozed reminder coming back plays Mixed’s "snoozed again"', (await played(page)).includes('/notification-sounds/mixed/snoozed_again.wav'), (await played(page)).join(' '))
  await ctx.close()
}
// The web app: a push while a window is on screen — sw-push.js asks it to play (kf-notification-sound).
{
  const { ctx, page, errors } = await open('/today', { settings: { ...SETTINGS, notification_sound_pack: 'mixed' } })
  const ask = (msg) =>
    page.evaluate(
      (msg) =>
        new Promise((done) => {
          const ch = new MessageChannel()
          ch.port1.onmessage = (e) => done(e.data)
          setTimeout(() => done('no answer'), 1500)
          navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: msg, ports: [ch.port2] }))
        }),
      msg,
    )
  await reset(page)
  const answer = await ask({ type: 'kf-notification-sound', kind: 'event_reminder', again: false })
  check('3 web: a push for an event, window on screen → the app plays Mixed’s event sound and answers "played"', answer === true && (await played(page)).join() === '/notification-sounds/mixed/event_reminder.wav', `${answer} ${(await played(page)).join(' ')}`)
  await sleep(1100) // one sound a second
  await page.evaluate(() => (window.__canPlay = false))
  const refused = await ask({ type: 'kf-notification-sound', kind: 'terms', again: false })
  check('3 web: a window that can’t play answers false (the push keeps the browser’s sound)', refused === false, String(refused))
  check('3 no page errors (web)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n')
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
