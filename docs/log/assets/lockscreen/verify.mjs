// Lock screen rows (lockscreen, 2026-10-26) on the REAL app, signed in against a MOCKED backend (the
// notif-sounds recipe: VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session, Playwright answers every
// REST call). "Mock Android" = `window.androidBridge` (Capacitor reports android; its plugins have no
// native side, so they throw and the device reads as an Android phone with nothing granted) plus a stub
// `window.KaisFlowLock` (native/android/.../widgets/LockScreen.java LockBridge) that records every call.
//   1. Android 16: Settings → Notifications → This phone has Now Bar (on), Day strip (off) and the
//      LockStar how-to, each marked This device; the switches write through to the shell.
//   2. Android 14: no Now Bar row (it's Android 16's); Day strip + how-to stay.
//   3. "Show task names on the lock screen" reaches the shell (off by default, on when set).
//   4. An APK from before (no KaisFlowLock): This phone without the lock rows. 5. The web: none of it.
//   6. v161 Lock screen status (This device): mock Android 16 all active; Live notifications off, a Now Bar not
//      promoted, nothing within 2 h, the widget not placed, notifications off, each with its words and its
//      Open settings screen; mock Android 15: "Android 16 needed (this phone: 15)", the Day strip off → on, a
//      lowered (silent) channel on a lock screen hiding silent ones; v1.6.0's shell (switches only): no status row.
//   node verify.mjs [outDir] [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? HERE
const BASE = process.argv[3] ?? 'http://localhost:5325'
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
      window.androidBridge = { postMessage() {} }
      if (android.old) return
      const state = { sdk: android.sdk, nowBarSupported: android.sdk >= 36, nowBar: android.sdk >= 36, dayStrip: false, names: false }
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

// ═══ 1 + 3 — Android 16 ═══
{
  const { ctx, page, errors } = await open({ android: { sdk: 36 } })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  check('1 mock Android 16: the This phone card is on Notifications & sound', (await c.count()) === 1)
  for (const label of [NOW_BAR, STRIP, HOWTO]) {
    const r = c.locator('.st-row', { has: page.locator('.st-label', { hasText: label }) })
    check(`1 "${label}" is there, marked This device`, (await r.count()) === 1 && (await r.locator('.st-device').innerText()) === 'This device')
  }
  const nowBar = c.getByRole('switch', { name: NOW_BAR })
  const strip = c.getByRole('switch', { name: STRIP })
  check('1 defaults: Now Bar on, Day strip off', (await nowBar.getAttribute('aria-checked')) === 'true' && (await strip.getAttribute('aria-checked')) === 'false')
  check('1 the Day strip says it can’t also sit in the Now Bar', (await row(page, STRIP).innerText()).includes('can’t also sit in the Now Bar'))
  const steps = await c.locator('[data-kf-lockstar-steps] li').allInnerTexts()
  check('1 the how-to is 3 short steps through Good Lock › LockStar', steps.length === 3 && steps[0].includes('Good Lock') && steps[0].includes('LockStar') && steps[2].includes('Top 3 · lock screen'), steps.join(' / '))
  await c.screenshot({ path: path.join(OUT, 'this-phone-a16-day.png') })
  await strip.click()
  await sleep(200)
  check('1 Day strip on → set(nowBar=true, dayStrip=true); both can be on', JSON.stringify((await calls(page)).filter((x) => x[0] === 'set').at(-1)) === '["set",true,true]' && (await strip.getAttribute('aria-checked')) === 'true', JSON.stringify(await calls(page)))
  await nowBar.click()
  await sleep(200)
  check('1 Now Bar off → set(false, true)', JSON.stringify((await calls(page)).filter((x) => x[0] === 'set').at(-1)) === '["set",false,true]' && (await nowBar.getAttribute('aria-checked')) === 'false')
  check('3 names off by default (Show task names on the lock screen) → setNames(false)', JSON.stringify((await calls(page)).find((x) => x[0] === 'setNames')) === '["setNames",false]', JSON.stringify(await calls(page)))
  check('1/3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open({ android: { sdk: 36 }, settings: { ...SETTINGS, lock_screen_names: true } })
  check('3 names on → setNames(true)', JSON.stringify((await calls(page)).filter((x) => x[0] === 'setNames').at(-1)) === '["setNames",true]', JSON.stringify(await calls(page)))
  await ctx.close()
}
{
  const { ctx, page } = await open({ android: { sdk: 36 }, theme: 'night' })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  await c.screenshot({ path: path.join(OUT, 'this-phone-a16-night.png') })
  await ctx.close()
}

// ═══ 2 — Android 14 ═══
{
  const { ctx, page, errors } = await open({ android: { sdk: 34 } })
  const c = card(page, 'This phone')
  await c.scrollIntoViewIfNeeded()
  check('2 mock Android 14: no Now Bar row', (await c.count()) === 1 && (await c.getByRole('switch', { name: NOW_BAR }).count()) === 0)
  check('2 … Day strip (off) and the how-to stay', (await c.getByRole('switch', { name: STRIP }).getAttribute('aria-checked')) === 'false' && (await c.locator('[data-kf-lockstar-steps]').count()) === 1)
  await c.screenshot({ path: path.join(OUT, 'this-phone-a14-day.png') })
  check('2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 4 — an APK from before the lock screen ═══
{
  const { ctx, page } = await open({ android: { sdk: 36, old: true } })
  const c = card(page, 'This phone')
  check('4 older APK: This phone is there, without the lock rows', (await c.count()) === 1 && (await c.locator('.st-label', { hasText: /^Lock screen:/ }).count()) === 0 && (await c.locator('[data-kf-lockstar-steps]').count()) === 0)
  await ctx.close()
}

// ═══ 5 — the web ═══
{
  const { ctx, page, errors } = await open()
  const seen = [await card(page, 'This phone').count(), await page.locator('.st-label', { hasText: /^Lock screen:/ }).count(), await page.locator('[data-kf-lockstar-steps]').count(), await card(page, 'This browser').count()]
  check('5 web: This browser instead of This phone, no lock rows anywhere', JSON.stringify(seen) === '[0,0,0,1]', `phone, lock rows, how-to, browser = ${seen}`)
  check('5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 6 — v161: Lock screen status ═══
const STATUS = 'Lock screen status'
/** The status row's three lines: {id: [ok, text, has button]}. */
const statusOf = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-kf-lock-status] li')].map((li) => [li.dataset.lock, [li.dataset.ok === 'true', li.querySelector('span').textContent, !!li.querySelector('button')]])))
async function statusCase(name, android, expect, opens) {
  const { ctx, page, errors } = await open({ android })
  const r = row(page, STATUS)
  await r.scrollIntoViewIfNeeded().catch(() => {})
  const st = await statusOf(page)
  const ok = (await r.count()) === 1 && (await r.locator('.st-device').innerText()) === 'This device' && Object.entries(expect).every(([id, [good, re]]) => st[id] && st[id][0] === good && re.test(st[id][1]))
  check(`6 ${name}`, ok, JSON.stringify(st))
  if (opens) {
    await r.locator(`[data-lock="${opens[0]}"] button`, { hasText: 'Open settings' }).click()
    await sleep(150)
    check(`6 ${name}: Open settings → the ${opens[1]} screen`, JSON.stringify((await calls(page)).filter((x) => x[0] === 'open').at(-1)) === JSON.stringify(['open', opens[1]]), JSON.stringify(await calls(page)))
  }
  check(`6 ${name}: no page errors`, errors.length === 0, errors.join(' | '))
  return { ctx, page, r }
}
{
  const { ctx, r } = await statusCase('Android 16, all fine: three lines, all active', { sdk: 36 }, { top3: [true, /^Top 3 widget: Active\. On your lock screen$/], nowbar: [true, /^Now Bar: Active\. In the Now Bar now$/], strip: [false, /^Day strip: Off: turn on/] })
  await r.screenshot({ path: path.join(OUT, 'status-a16-active.png') })
  await ctx.close()
}
await (await statusCase('Android 16, Live notifications off for the app', { sdk: 36, status: { promote: false } }, { nowbar: [false, /Live notifications are turned off for Kai’s Flow$/] }, ['nowbar', 'promotion'])).ctx.close()
await (await statusCase('Android 16, posted but not promoted: points at the Galaxy developer option', { sdk: 36, status: { promoted: false } }, { nowbar: [false, /not as a Live notification.*Live notifications for all apps/] }, ['nowbar', 'promotion'])).ctx.close()
{
  const { ctx, r } = await statusCase('Android 16, nothing within 2 h, the widget not placed', { sdk: 36, status: { showing: false, showFrom: Date.parse('2026-10-29T11:30:00Z'), widget: false, dayStrip: true } }, { nowbar: [false, /^Now Bar: Nothing to show until 2h before your next block \(from \d{1,2}:30( PM)?\)$/], strip: [false, /Nothing to show until 2h before your next block/], top3: [false, /Not added in LockStar yet/] })
  await r.screenshot({ path: path.join(OUT, 'status-a16-waiting.png') })
  await ctx.close()
}
await (await statusCase('Android 16, notifications off for the app (first in the way)', { sdk: 36, status: { notifications: false, promote: false } }, { nowbar: [false, /Notifications are turned off for Kai’s Flow$/] }, ['nowbar', 'notifications'])).ctx.close()
{
  const { ctx, page, r } = await statusCase('Android 15: "Android 16 needed (this phone: 15)", the Day strip off', { sdk: 35 }, { nowbar: [false, /^Now Bar: Android 16 needed \(this phone: 15\)$/], strip: [false, /^Day strip: Off: turn on/] })
  check('6 Android 15: no Open settings for the Now Bar (nothing to fix)', (await r.locator('[data-lock="nowbar"] button').count()) === 0)
  await card(page, 'This phone').getByRole('switch', { name: STRIP }).click()
  await sleep(200)
  const st = await statusOf(page)
  check('6 Android 15: Day strip on → its line turns Active', st.strip[0] === true && /^Day strip: Active\. On the lock screen now/.test(st.strip[1]), JSON.stringify(st.strip))
  await r.screenshot({ path: path.join(OUT, 'status-a15.png') })
  await ctx.close()
}
await (await statusCase('Android 15, a lowered (silent) channel on a lock screen that hides silent ones', { sdk: 35, status: { dayStrip: true, channel: 2, lockSilent: false } }, { strip: [false, /^Day strip: Lock screen hides silent notifications$/] }, ['strip', 'lockscreen'])).ctx.close()
{
  const { ctx, page } = await open({ android: { sdk: 36, v160: true } })
  check("6 v1.6.0's shell (switches only): the rows, no status row", (await row(page, NOW_BAR).count()) === 1 && (await row(page, STATUS).count()) === 0)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
