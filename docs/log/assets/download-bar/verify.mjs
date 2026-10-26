// download-bar (2026-10-14, Kai: "why is there no download bar for both apps"): the slim bar over the
// page in a plain browser tab — "Get Kai's Flow for" + Android / Windows, the device's own first — its
// × remembered per device, its absence in the Windows app (Tauri), the Android app (Capacitor) and the
// installed PWA (display-mode standalone), and Settings → App → "Download the apps" with the same links.
// The real app signed in against a mocked backend (today-shell's recipe), desktop 1280×800 + phone
// 390×844 with an Android user agent, day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5285'
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
// The account has agreed to the current Terms / Privacy versions (legal, 0083) — otherwise the app's
// "We've updated our terms" notice covers the page. The versions come from the one file that holds them.
const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const CONSENTS = ['terms', 'privacy'].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, document: d, version: LEGAL_TS.match(new RegExp(`${d.toUpperCase()}_VERSION = '([0-9-]+)'`))[1], accepted_at: '2026-10-25T00:00:00Z' }))
const T = '2026-10-01T09:00:00Z'
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }
const TASK = { id: '10000000-0000-4000-8000-000000000001', title: 'Renew the domain', user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T }

const APK = 'https://github.com/khairyKY/kais-flow/releases/latest/download/kais-flow.apk'
const EXE = 'https://github.com/khairyKY/kais-flow/releases/latest/download/kais-flow-windows-setup.exe'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 }, userAgent: WINDOWS_UA }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID_UA }

/** A fresh device (own localStorage) unless `ctx` is passed; `shell` simulates a native shell / the PWA. */
async function open(at, o = {}) {
  const ctx = o.ctx ?? (await browser.newContext({ ...(o.view ?? desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' }))
  if (!o.ctx) {
    await ctx.addInitScript(([t, sess, uid, shell]) => {
      if (!localStorage.getItem('kf-seeded')) {
        localStorage.setItem('kf-seeded', '1')
        localStorage.setItem('kf_theme', t)
        localStorage.setItem('sb-127-auth-token', sess)
        localStorage.setItem('kf-app-zone', 'Africa/Cairo')
        localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
      }
      if (shell === 'tauri') window.__TAURI_INTERNALS__ = { invoke: async () => null, transformCallback: () => 0, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } } }
      if (shell === 'capacitor') window.androidBridge = { postMessage() {} }
      if (shell === 'pwa') {
        const mm = window.matchMedia.bind(window)
        window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { ...mm(q), matches: true, media: q } : mm(q))
      }
    }, [o.theme ?? 'day', JSON.stringify(session), UID, o.shell ?? null])
    await ctx.route('http://127.0.0.1:9/**', async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
      const table = url.pathname.replace('/rest/v1/', '')
      const rows = table === 'app_settings' ? [SETTINGS] : table === 'tasks' ? [TASK] : table === 'consents' ? CONSENTS : []
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
      return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
    })
    // Never reach GitHub from a harness (the update check, a stray download).
    await ctx.route('https://*.github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
    await ctx.route('https://github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  }
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${at}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors }
}

const bar = (page) => page.locator('.kf-dl-bar')
const links = (loc) => loc.locator('a.kf-dl-link').evaluateAll((as) => as.map((a) => ({ text: a.textContent.trim(), href: a.href })))
const fit = (page) => page.evaluate(() => ({ win: innerHeight, doc: document.scrollingElement.scrollHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
const shot = async (page, name) => {
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

// ── B · the bar on a plain browser tab: desktop + phone, day + night ──
for (const [size, view] of [['desktop', desktop], ['phone', phone]]) for (const theme of ['day', 'night']) {
  const tag = `b-${size}-${theme}`
  const { ctx, page, errors } = await open('/today', { view, theme })
  check(`${tag} the bar shows in a plain browser tab`, (await bar(page).count()) === 1)
  check(`${tag} its line reads "Get Kai’s Flow for"`, (await bar(page).locator('.kf-dl-text').innerText().catch(() => '')) === 'Get Kai’s Flow for')
  const l = await links(bar(page))
  const want = size === 'phone' ? [['Android', APK], ['Windows', EXE]] : [['Windows', EXE], ['Android', APK]]
  check(`${tag} two buttons, the device's own first, on the stable latest links`, JSON.stringify(l.map((x) => [x.text, x.href])) === JSON.stringify(want), JSON.stringify(l))
  const x = await bar(page).locator('.kf-dl-x').boundingBox()
  check(`${tag} the × is ${size === 'phone' ? 'a 44px+ touch target' : 'there'}`, x && (size === 'phone' ? x.width >= 44 && x.height >= 44 : x.width >= 24), JSON.stringify(x))
  const bb = await bar(page).boundingBox()
  check(`${tag} the bar sits at the top of the page column, one slim row`, bb && bb.y <= 1 && bb.height <= (size === 'phone' ? 72 : 60), JSON.stringify(bb))
  const m = await fit(page)
  check(`${tag} shell fit: no page scroll, no sideways scroll`, m.doc <= m.win + 1 && m.sw <= m.iw + 1, JSON.stringify(m))
  await shot(page, tag)
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D · dismissed with ×, remembered on this device; Settings → App keeps the links ──
for (const [size, view] of [['desktop', desktop], ['phone', phone]]) {
  const tag = `d-${size}`
  const { ctx, page, errors } = await open('/today', { view })
  await bar(page).locator('.kf-dl-x').click()
  await sleep(300)
  check(`${tag} × hides the bar`, (await bar(page).count()) === 0)
  check(`${tag} the dismissal is stored on this device`, (await page.evaluate(() => localStorage.getItem('kf-download-bar-dismissed'))) === '1')
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1200)
  check(`${tag} still gone after a reload`, (await bar(page).count()) === 0)
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
  await sleep(1000)
  check(`${tag} and on another page`, (await bar(page).count()) === 0)
  const s = await open('/settings/about', { ctx }) // settings-build: App & updates is its own page
  const card = s.page.locator('#settings-App')
  const row = card.locator('.st-row', { hasText: 'Download the apps' })
  check(`${tag} Settings → App has "Download the apps"`, (await row.count()) === 1)
  const l = await links(row)
  check(`${tag} with the same two links`, l.length === 2 && l.some((a) => a.text === 'Android' && a.href === APK) && l.some((a) => a.text === 'Windows' && a.href === EXE), JSON.stringify(l))
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: path.join(OUT, `${tag}-settings-app.png`) })
  check(`${tag} no page errors`, errors.length + s.errors.length === 0, [...errors, ...s.errors].join(' | '))
  await ctx.close()
}

// ── D · Settings → App night, on a computer ──
{
  const { ctx, page } = await open('/settings/about', { theme: 'night' })
  const card = page.locator('#settings-App')
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: path.join(OUT, 'd-desktop-settings-app-night.png') })
  await ctx.close()
}

// ── H · hidden inside the shells and the installed PWA ──
for (const [shell, view] of [['tauri', desktop], ['capacitor', phone], ['pwa', desktop], ['pwa', phone]]) {
  const tag = `h-${shell}-${view === phone ? 'phone' : 'desktop'}`
  const { ctx, page } = await open('/today', { view, shell })
  const ready = await page.locator('main').count()
  check(`${tag} no download bar (the app shell rendered: ${ready === 1})`, ready === 1 && (await bar(page).count()) === 0)
  if (shell !== 'capacitor') {
    await page.goto(`${BASE}/settings/about`, { waitUntil: 'networkidle' })
    await sleep(1200)
    check(`${tag} Settings → App still has "Download the apps"`, (await page.locator('#settings-App .st-row', { hasText: 'Download the apps' }).count()) === 1)
  }
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
