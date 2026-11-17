// Now / Next on the lock screen (v165-nownext, 2026-11-17) on the REAL app, signed in against a MOCKED backend
// (same recipe as ../lockscreen/verify.mjs: VITE_SUPABASE_URL=http://127.0.0.1:9, Playwright answers every REST
// call; mock Android = window.androidBridge + a stub window.KaisFlowLock that records every call). Capacitor's
// LocalNotifications is answered by the fake bridge (checkPermissions / requestPermissions), so Android 13+'s
// POST_NOTIFICATIONS ask can be both granted and denied.
//   1. Settings → Notifications → This phone has "Now / Next on the lock screen", off by default, marked This device.
//   2. Turning it on asks for notifications first (requestPermissions called), then setNowNext(true); off → false.
//   3. Notifications denied: the switch stays off, nothing reaches the shell, the note says why + Open settings.
//   4. Names off: the note explains "A task" / "Busy"; names on: no note.
//   5. The app's quiet hours reach the shell (setQuiet(on, from, to) in minutes): default 22:30–07:00, a custom
//      window, and off.
//   6. Lock screen status lists Now / Next first, with the first thing in the way and its screen.
//   7. An APK from before (no setNowNext): no row. The web: nothing.
//   node verify.mjs [outDir] [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? HERE
const BASE = process.argv[3] ?? 'http://localhost:5277'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/rea-agents/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000007c1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'lock@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const CREATED = '2026-09-20T12:00:00.000Z'
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', quiet_hours_on: false, notification_sound_pack: 'felt', created_at: CREATED, updated_at: CREATED }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { viewport: { width: 390, height: 1400 }, hasTouch: true, isMobile: true }

/** o.android: undefined = the web; { sdk } = mock Android with the lock bridge; { sdk, old: true } = without it. */
async function open(o = {}) {
  const ctx = await browser.newContext({ ...PHONE, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(
    ([sess, uid, theme, android]) => {
      localStorage.setItem('kf_theme', theme)
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
      if (!android) return
      // Capacitor answers LocalNotifications from this fake bridge: checkPermissions / requestPermissions -> android.perm.
      window.__perm = android.perm ?? 'granted'
      window.__permCalls = []
      window.Capacitor = {
        PluginHeaders: [{ name: 'LocalNotifications', methods: [{ name: 'checkPermissions', rtype: 'promise' }, { name: 'requestPermissions', rtype: 'promise' }, { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] }],
        nativePromise: async (plugin, method) => {
          window.__permCalls.push(method)
          return { display: method === 'requestPermissions' && window.__perm === 'prompt' ? 'granted' : window.__perm }
        },
        nativeCallback: () => 'cb',
      }
      window.androidBridge = { postMessage() {} }
      if (android.old) return
      const state = { sdk: android.sdk, nowBarSupported: android.sdk >= 36, nowBar: android.sdk >= 36, dayStrip: false, names: false, ...(android.v164 ? {} : { nowNext: false, nowNextPosted: false, nowNextChannel: -1 }) }
      // v161's status facts (LockBridge.state): all fine, a block on now; `status` overrides; `v160` = none of them.
      if (!android.v160) {
        Object.assign(state, { release: String(android.sdk - 20), notifications: true, channel: 3, lock: true, lockSilent: null, widget: true, showing: true, showFrom: Date.now(), nowBarPosted: android.sdk >= 36, stripPosted: false, promoted: android.sdk >= 36 ? true : null })
        if (android.sdk >= 36) state.promote = true
        Object.assign(state, android.status ?? {})
      }
      window.__lockCalls = []
      window.KaisFlowLock = {
        state: () => JSON.stringify(state),
        set: (nowBar, dayStrip) => (window.__lockCalls.push(['set', nowBar, dayStrip]), Object.assign(state, { nowBar, dayStrip })),
        ...(android.v164 ? {} : { setNowNext: (on) => (window.__lockCalls.push(['setNowNext', on]), Object.assign(state, { nowNext: on, nowNextPosted: on, nowNextChannel: on ? 2 : -1 })), setQuiet: (on, from, to) => window.__lockCalls.push(['setQuiet', on, from, to]) }),
        setNames: (on) => (window.__lockCalls.push(['setNames', on]), (state.names = on)),
        ...(android.v160 ? {} : { open: (which) => window.__lockCalls.push(['open', which]) }),
      }
    },
    [JSON.stringify(session), UID, o.theme ?? 'day', o.android ?? null],
  )
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = url.pathname.replace('/rest/v1/', '')
    const rows = table === 'app_settings' ? [o.settings ?? SETTINGS] : []
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  // Mock Android has no native side: Capacitor's own plugins (App, LocalNotifications) reject. Not ours.
  page.on('pageerror', (e) => /plugin is not implemented on android/.test(e.message) || errors.push(e.message))
  await page.goto(`${BASE}/settings/notify`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors }
}
// The title also holds its This device tag and note ("This phoneThis deviceAndroid app only").
const card = (page, title) => page.locator('section.st-sec', { has: page.locator('.st-title', { hasText: new RegExp(`^${title}`) }) })
const row = (page, label) => page.locator('.st-row', { has: page.locator('.st-label', { hasText: label }) })
const calls = (page) => page.evaluate(() => window.__lockCalls ?? [])
const NOW_BAR = 'Lock screen: Now Bar'
const STRIP = 'Lock screen: Day strip notification'
const HOWTO = 'How to add the Top 3 to your lock screen'


const NN = 'Now / Next on the lock screen'
const last = async (page, name) => (await calls(page)).filter((x) => x[0] === name).at(-1)
const J = JSON.stringify

// ═══ 1 + 2 + 4 — Android 14, notifications "prompt" (Android 13+ asks) ═══
{
  const { ctx, page, errors } = await open({ android: { sdk: 34, perm: 'prompt' } })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  const r = c.locator('.st-row', { has: page.locator('.st-label', { hasText: NN }) })
  check('1 the row is there, marked This device', (await r.count()) === 1 && (await r.locator('.st-device').innerText()) === 'This device')
  const sw = c.getByRole('switch', { name: NN })
  check('1 off by default', (await sw.getAttribute('aria-checked')) === 'false')
  check('1 says what it is (quiet, Samsung too)', /quiet/.test(await r.innerText()) && /Samsung/.test(await r.innerText()))
  await c.screenshot({ path: path.join(OUT, 'row-off.png') })
  await sw.click()
  await sleep(500)
  const perm = await page.evaluate(() => window.__permCalls)
  check('2 on: asked for notifications first (check, then request)', perm.includes('requestPermissions'), J(perm))
  check('2 then setNowNext(true) and the switch is on', J(await last(page, 'setNowNext')) === '["setNowNext",true]' && (await sw.getAttribute('aria-checked')) === 'true', J(await calls(page)))
  const note = c.locator('[data-kf-nownext-note]')
  check('4 names off: the note says names show as "A task" / "Busy" and it is hidden in quiet hours', (await note.count()) === 1 && /A task/.test(await note.innerText()) && /quiet hours/.test(await note.innerText()), await note.allInnerTexts())
  await c.screenshot({ path: path.join(OUT, 'row-on-names-off.png') })
  await sw.click()
  await sleep(300)
  check('2 off sends setNowNext(false)', J(await last(page, 'setNowNext')) === '["setNowNext",false]' && (await sw.getAttribute('aria-checked')) === 'false')
  check('1/2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 4 — names on: no note ═══
{
  const { ctx, page } = await open({ android: { sdk: 34 }, settings: { ...SETTINGS, lock_screen_names: true } })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  await c.getByRole('switch', { name: NN }).click()
  await sleep(400)
  check('4 names on: switch on, no note', (await c.getByRole('switch', { name: NN }).getAttribute('aria-checked')) === 'true' && (await c.locator('[data-kf-nownext-note]').count()) === 0)
  await c.screenshot({ path: path.join(OUT, 'row-on-names-on.png') })
  await ctx.close()
}

// ═══ 3 — notifications denied ═══
{
  const { ctx, page } = await open({ android: { sdk: 34, perm: 'denied' } })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  await c.getByRole('switch', { name: NN }).click()
  await sleep(500)
  check('3 denied: the switch stays off and nothing reaches the shell', (await c.getByRole('switch', { name: NN }).getAttribute('aria-checked')) === 'false' && !(await last(page, 'setNowNext')), J(await calls(page)))
  const note = c.locator('[data-kf-nownext-note]')
  check('3 the note says notifications are off, with Open settings', /turned off/.test(await note.innerText()) && (await note.getByRole('button', { name: 'Open settings' }).count()) === 1, await note.allInnerTexts())
  await c.screenshot({ path: path.join(OUT, 'row-denied.png') })
  await note.getByRole('button', { name: 'Open settings' }).click()
  check('3 Open settings goes to the app’s notification screen', J(await last(page, 'open')) === '["open","notifications"]')
  await ctx.close()
}

// ═══ 5 — quiet hours reach the shell ═══
for (const [name, settings, want] of [
  ['default 22:30–07:00', SETTINGS, '["setQuiet",true,1350,420]'],
  ['custom 23:00–06:30', { ...SETTINGS, quiet_hours_on: true, quiet_from: '23:00:00', quiet_to: '06:30:00' }, '["setQuiet",true,1380,390]'],
  ['off', { ...SETTINGS, quiet_hours_on: false }, '["setQuiet",false,1350,420]'],
]) {
  const { ctx, page } = await open({ android: { sdk: 34 }, settings: name.startsWith('default') ? { ...SETTINGS, quiet_hours_on: undefined } : settings })
  check(`5 quiet hours ${name} sends ${want}`, J(await last(page, 'setQuiet')) === want, J(await calls(page)))
  await ctx.close()
}

// ═══ 6 — Lock screen status lists Now / Next first ═══
{
  const { ctx, page } = await open({ android: { sdk: 34, status: { nowNext: true, nowNextPosted: true, nowNextChannel: 2 } } })
  const li = page.locator('[data-kf-lock-status] li')
  const ids = await li.evaluateAll((l) => l.map((x) => x.getAttribute('data-lock')))
  check('6 status: Now / Next first, then Top 3, Now Bar, Day strip', J(ids) === '["nownext","top3","nowbar","strip"]', J(ids))
  check('6 active', (await li.first().getAttribute('data-ok')) === 'true' && /On the lock screen now/.test(await li.first().innerText()))
  await page.locator('[data-kf-lock-status]').scrollIntoViewIfNeeded()
  await page.locator('[data-kf-lock-status]').screenshot({ path: path.join(OUT, 'status-active.png') })
  await ctx.close()
}
{
  const { ctx, page } = await open({ android: { sdk: 34, status: { nowNext: true, nowNextPosted: false, lockSilent: false } } })
  const first = page.locator('[data-kf-lock-status] li').first()
  check('6 a lock screen hiding silent notifications: says so', /silent/.test(await first.innerText()))
  await first.getByRole('button', { name: 'Open settings' }).click()
  check('6 Open settings goes to the phone’s notification settings', J(await last(page, 'open')) === '["open","lockscreen"]')
  await page.locator('[data-kf-lock-status]').screenshot({ path: path.join(OUT, 'status-silent-hidden.png') })
  await ctx.close()
}

// ═══ 7 — an APK from before (no setNowNext), and the web ═══
{
  const { ctx, page } = await open({ android: { sdk: 34, v164: true } })
  const c = card(page, 'This phone')
  check('7 an older shell: no Now / Next row (the Day strip is still there)', (await c.getByRole('switch', { name: NN }).count()) === 0 && (await c.getByRole('switch', { name: 'Lock screen: Day strip notification' }).count()) === 1)
  await ctx.close()
}
{
  const { ctx, page } = await open({})
  check('7 the web: no Now / Next row', (await page.getByText(NN).count()) === 0)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
