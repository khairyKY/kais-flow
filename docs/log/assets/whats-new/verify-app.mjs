// What's new in the app (builder WN, 2026-10-07) on the REAL app, signed in against a MOCKED backend —
// the task-sheet / tray-notify recipe: the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, and Playwright answers every REST
// call. The update check's two sources are answered here too: /version.json (web) and GitHub's
// releases/latest (the release notes; Android/Windows). The web build stamp a deploy carries is added
// as a <meta>, and the Windows app is a stub window.__TAURI_INTERNALS__ that records each tray.rs
// command (notify_local, tray_open…), as in tray-notify.
//   cd app && npm run dev -- --port 5261 --strictPort --mode mock
//   node docs/log/assets/whats-new/verify-app.mjs <outDir> [baseUrl]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5261'
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const NOTES = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../site/src/releases.json'), 'utf8'))
const CUR = NOTES[0] // the bundled newest (the version this build is)
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
const OLD_USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const sessionFor = (user) => ({ access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user })
const MEM = `kf-whats-new:${UID}`
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

// ── the next release, as GitHub would serve it once release.yml wrote its body from releases.json ──
const NEXT = CUR.v.replace(/\d+$/, (n) => String(Number(n) + 1)) // the release after the bundled one
const NEXT_LINES = ['A morning page that waits for you', 'Undo on every swipe']
const exe = `https://github.com/khairyKY/kais-flow/releases/download/${NEXT}/kais-flow-${NEXT}-windows-setup.exe`
const releaseOf = (tag, lines) => ({
  tag_name: tag,
  body: `Calmer mornings\r\n\r\n${lines.map((l) => `- ${l}`).join('\r\n')}\r\n\r\nLive at https://kais-flow.kaidagoat.workers.dev · Android APK and Windows installer attached below once built (docs/INSTALL.md).`,
  assets: [
    { name: `kais-flow-${tag}.apk`, browser_download_url: `https://github.com/khairyKY/kais-flow/releases/download/${tag}/kais-flow-${tag}.apk` },
    { name: `kais-flow-${tag}-windows-setup.exe`, browser_download_url: `https://github.com/khairyKY/kais-flow/releases/download/${tag}/kais-flow-${tag}-windows-setup.exe` },
  ],
})
const SAME = releaseOf(CUR.v, CUR.highlights)
const NEWER = releaseOf(NEXT, NEXT_LINES)

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const cairo = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, 7, h - 3, m)) }

/** One "device": a context with its own storage. `memory` seeds what this device remembers (once —
 * reloads keep what the app wrote). `web` = what /version.json says (a newer deploy), `gh` = GitHub's
 * latest release, `stamp` = a deployed build of this same commit, `tauri` = play the Windows app at that installed version. */
async function device(o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESKTOP), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', colorScheme: o.theme === 'night' ? 'dark' : 'light' })
  await ctx.addInitScript(([theme, sess, mem, memKey, stamp, tauri, unfocused]) => {
    localStorage.setItem('kf_theme', theme)
    localStorage.setItem('sb-127-auth-token', sess)
    if (!sessionStorage.getItem('kf-seeded')) {
      sessionStorage.setItem('kf-seeded', '1')
      if (mem) localStorage.setItem(memKey, mem)
      else localStorage.removeItem(memKey)
    }
    // a deployed build carries its stamp (vite.config buildStamp); the dev server has none
    if (stamp) document.addEventListener('DOMContentLoaded', () => { const m = document.createElement('meta'); m.name = 'kf-build'; m.content = 'abc1234aaaaaaaa 2026-10-06T20:00:00Z'; document.head.append(m) })
    if (unfocused) Document.prototype.hasFocus = () => false // the Windows app sitting in the tray
    if (tauri) {
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          window.__tauriCalls.push({ cmd, args: args ?? null })
          if (cmd === 'plugin:app|version') return tauri
          if (cmd === 'autostart_get') return false
          return null
        },
      }
    }
  }, [o.theme ?? 'day', JSON.stringify(sessionFor(o.user ?? OLD_USER)), o.memory ? JSON.stringify(o.memory) : null, MEM, !!(o.web || o.stamp), o.tauri ?? null, !!o.unfocused])
  const net = { versionJson: 0, github: 0, downloads: [] }
  await ctx.route('**/version.json*', (r) => { net.versionJson++; return r.fulfill({ json: { commit: o.web ? 'def5678bbbbbbbbb' : 'abc1234aaaaaaaa', builtAt: '2026-10-07T20:00:00Z', version: o.web ?? CUR.v } }) })
  await ctx.route('https://api.github.com/**', (r) => { net.github++; return r.fulfill({ json: o.gh ?? SAME }) })
  await ctx.route('https://github.com/**', (r) => { net.downloads.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'exe' }) })
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: o.user ?? OLD_USER })
    const table = url.pathname.replace('/rest/v1/', '')
    const rows = table === 'app_settings' ? [{ ...SETTINGS, ...(o.settings ?? {}) }] : []
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (o.time) await page.clock.install({ time: cairo(o.time) })
  await page.goto(`${BASE}${o.route ?? '/today'}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, net, errors }
}

const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const memory = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), MEM)
const calls = (page, cmd) => page.evaluate((c) => (window.__tauriCalls ?? []).filter((x) => x.cmd === c), cmd)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const dialog = (page) => page.locator('[role="dialog"][aria-modal="true"]').last()
const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await sleep(1200) }

// warm the dev server (first compile)
{
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/today`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {})
  await ctx.close()
}

// ── 1 · after an update: "Updated to v1.0.21 · What's new", once — desktop, day ──
{
  const { ctx, page, errors } = await device({ memory: { seen: 'v1.0.20', checkedAt: Date.now() } })
  const t = await toasts(page)
  check('desktop day: first launch of a newer version → “Updated to v1.0.21” with a What’s new action', t.includes(`Updated to ${CUR.v}`) && (await page.locator('.kf-toast-act', { hasText: 'What’s new' }).count()) === 1, JSON.stringify(t))
  await shot(page, '1-updated-toast-desktop-day')
  await page.locator('.kf-toast-act', { hasText: 'What’s new' }).click()
  await sleep(500)
  const d = dialog(page)
  const text = await d.innerText()
  const items = await d.locator('li').allInnerTexts()
  check('desktop day: the sheet is a centred card: title, “Your version · 7 Oct 2026”, the release’s title', text.includes(`What’s new in ${CUR.v}`) && text.toUpperCase().includes(`YOUR VERSION · ${new Date(CUR.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}`) && text.includes(CUR.title), text.split('\n').slice(0, 3).join(' | '))
  const box = await d.boundingBox()
  check('desktop day: centred on the screen, not a bottom sheet', Math.abs(box.x + box.width / 2 - 640) < 2 && box.y > 40 && box.y + box.height < 780, JSON.stringify(box))
  check(`desktop day: its ${CUR.highlights.length} highlights, from the bundled notes`, JSON.stringify(items) === JSON.stringify(CUR.highlights), items.length)
  const link = d.locator('a', { hasText: 'All release notes →' })
  check('desktop day: “All release notes →” opens the site’s What’s new outside the app', (await link.getAttribute('href')) === 'https://kais-flow-site.pages.dev/whats-new/' && (await link.getAttribute('target')) === '_blank')
  check('desktop day: the running version’s primary button is “Got it” (no Update)', (await d.getByRole('button', { name: 'Got it' }).count()) === 1 && (await d.getByRole('button', { name: 'Update' }).count()) === 0)
  await shot(page, '1-sheet-current-desktop-day')
  await page.keyboard.press('Escape')
  await sleep(300)
  check('desktop day: Esc closes it', (await page.locator('[role="dialog"]').count()) === 0)
  check('desktop day: the device now remembers v1.0.21 as seen', (await memory(page))?.seen === CUR.v, JSON.stringify(await memory(page)))
  await reload(page)
  check('desktop day: once per version — no “Updated” toast on the next launch', !(await toasts(page)).some((x) => x.startsWith('Updated')), JSON.stringify(await toasts(page)))
  check('desktop day: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 1b · nothing seen yet: an older account hears once, a brand-new one doesn't ──
{
  const a = await device({ memory: null })
  check('first launch here, older account → “Updated to v1.0.21” once', (await toasts(a.page)).includes(`Updated to ${CUR.v}`))
  await a.ctx.close()
  const fresh = { ...OLD_USER, created_at: new Date(Date.now() - 3_600_000).toISOString() }
  const b = await device({ memory: null, user: fresh })
  const t = await toasts(b.page)
  check('first launch, brand-new account (signed up an hour ago) → no “Updated” toast, version recorded', !t.some((x) => x.startsWith('Updated')) && (await memory(b.page))?.seen === CUR.v, JSON.stringify(t))
  await b.ctx.close()
  const c = await device({ memory: { seen: NEXT } })
  check('an older bundle than one already seen → nothing, and “seen” stays v1.0.22', !(await toasts(c.page)).some((x) => x.startsWith('Updated')) && (await memory(c.page))?.seen === NEXT)
  await c.ctx.close()
}

// ── 2 · phone, day: the toast above the tab bar, the sheet as a bottom sheet ──
{
  const { ctx, page, errors } = await device({ view: PHONE, memory: { seen: 'v1.0.20', checkedAt: Date.now() } })
  check('phone day: “Updated to v1.0.21 · What’s new”', (await toasts(page)).includes(`Updated to ${CUR.v}`))
  await shot(page, '2-updated-toast-phone-day')
  await page.locator('.kf-toast-act', { hasText: 'What’s new' }).click()
  await sleep(700)
  const d = dialog(page)
  const box = await d.boundingBox()
  check('phone day: a bottom sheet (full width, on the bottom edge)', box.x <= 1 && Math.abs(box.width - 390) < 2 && Math.abs(box.y + box.height - 844) < 2, JSON.stringify(box))
  check('phone day: the six highlights + All release notes + Got it in its footer', (await d.locator('li').count()) === CUR.highlights.length && (await d.locator('[data-sheet-footer] a', { hasText: 'All release notes' }).count()) === 1 && (await d.locator('[data-sheet-footer]').getByRole('button', { name: 'Got it' }).count()) === 1)
  await shot(page, '2-sheet-current-phone-day')
  await d.locator('[data-sheet-footer]').getByRole('button', { name: 'Got it' }).click()
  await sleep(500)
  check('phone day: Got it closes the sheet', (await page.locator('[role="dialog"]').count()) === 0)
  check('phone day: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3 · web: a newer version is live — the quiet check, the toast once, the sheet with Update — desktop, night ──
{
  const { ctx, page, net, errors } = await device({ theme: 'night', web: NEXT, gh: NEWER, memory: { seen: CUR.v } })
  const t = await toasts(page)
  check('web night: the quiet check on start finds v1.0.22 → “v1.0.22 is out · See what’s new”', t.includes(`${NEXT} is out`) && (await page.locator('.kf-toast-act', { hasText: 'See what’s new' }).count()) === 1, JSON.stringify(t))
  check('web night: it asked /version.json once and GitHub once (for the notes)', net.versionJson === 1 && net.github === 1, JSON.stringify(net))
  const m = await memory(page)
  check('web night: remembers it told about v1.0.22, and when it checked', m?.notified === NEXT && Math.abs(m.checkedAt - Date.now()) < 60_000, JSON.stringify(m))
  await shot(page, '3-available-toast-desktop-night')
  await page.locator('.kf-toast-act', { hasText: 'See what’s new' }).click()
  await sleep(500)
  const d = dialog(page)
  const text = await d.innerText()
  check('web night: the sheet is v1.0.22’s, “Ready to update”, notes read from its GitHub Release body', text.includes(`What’s new in ${NEXT}`) && /READY TO UPDATE/i.test(text) && JSON.stringify(await d.locator('li').allInnerTexts()) === JSON.stringify(NEXT_LINES), text.replace(/\n/g, ' | ').slice(0, 160))
  check('web night: its primary button is Update', (await d.getByRole('button', { name: 'Update' }).isEnabled()))
  check('web night: night theme', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'night')
  await shot(page, '3-sheet-update-desktop-night')
  const nav = page.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true, () => false)
  await d.getByRole('button', { name: 'Update' }).click()
  check('web night: Update reloads the page onto the new version (lib/appUpdate reloadToUpdate)', await nav)
  await sleep(1500)
  check('web night: once per version — after the reload, no second “is out” toast', !(await toasts(page)).some((x) => x.endsWith('is out')), JSON.stringify(await toasts(page)))
  await page.evaluate((k) => { const m = JSON.parse(localStorage.getItem(k)); m.checkedAt = Date.now() - 2 * 86_400_000; localStorage.setItem(k, JSON.stringify(m)) }, MEM)
  const before = net.versionJson
  await reload(page)
  check('web night: two days later the check runs again, but v1.0.22 is not toasted twice', net.versionJson === before + 1 && !(await toasts(page)).some((x) => x.endsWith('is out')), `checks ${before} → ${net.versionJson}`)
  await reload(page)
  check('web night: and not more than once a day (a reload the same day doesn’t check)', net.versionJson === before + 1, `${net.versionJson}`)
  check('web night: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3b · a newer DEPLOY of the same version (just a commit) is not news ──
{
  const { ctx, page, net } = await device({ web: CUR.v, memory: { seen: CUR.v } })
  check('web: a newer deploy of v1.0.21 → no toast, no GitHub call', !(await toasts(page)).some((x) => x.endsWith('is out')) && net.github === 0, JSON.stringify(net))
  await ctx.close()
}

// ── 4 · phone, night: the toast and the update sheet ──
{
  const { ctx, page, errors } = await device({ view: PHONE, theme: 'night', web: NEXT, gh: NEWER, memory: { seen: CUR.v } })
  check('phone night: “v1.0.22 is out”', (await toasts(page)).includes(`${NEXT} is out`))
  await shot(page, '4-available-toast-phone-night')
  await page.locator('.kf-toast-act', { hasText: 'See what’s new' }).click()
  await sleep(700)
  const d = dialog(page)
  check('phone night: bottom sheet with v1.0.22’s notes and Update in its footer', (await d.locator('li').count()) === NEXT_LINES.length && (await d.locator('[data-sheet-footer]').getByRole('button', { name: 'Update' }).count()) === 1)
  await shot(page, '4-sheet-update-phone-night')
  check('phone night: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 5 · Settings → App: checks when it opens; “Coming in v1.0.22” + Update; “What’s new in your version” folded ──
for (const [view, vname] of [[DESKTOP, 'desktop'], [PHONE, 'phone']]) {
  for (const theme of ['day', 'night']) {
    const tag = `${vname} ${theme}`
    // the daily check already ran today and already told about v1.0.22 — Settings still checks, quietly
    const { ctx, page, net, errors } = await device({ view, theme, route: '/settings', web: NEXT, gh: NEWER, memory: { seen: CUR.v, notified: NEXT, checkedAt: Date.now() } })
    const card = page.locator('div', { has: page.getByRole('button', { name: /Check for updates|Checking/ }) }).filter({ hasText: 'App · Kai' }).last()
    await card.scrollIntoViewIfNeeded()
    const text = await card.innerText()
    check(`${tag}: opening Settings ran the check (version.json + GitHub), with no repeat toast`, net.versionJson === 1 && net.github === 1 && !(await toasts(page)).some((x) => x.endsWith('is out')), JSON.stringify(net))
    check(`${tag}: “v1.0.22 is out”, the web version number shown`, text.includes(`${NEXT} is out`) && text.includes(`${CUR.v} · build abc1234`), text.split('\n').slice(0, 4).join(' | '))
    const coming = card.locator(`section[aria-label="Coming in ${NEXT}"]`)
    check(`${tag}: “Coming in v1.0.22” lists its notes, with Update`, (await coming.count()) === 1 && JSON.stringify(await coming.locator('li').allInnerTexts()) === JSON.stringify(NEXT_LINES) && (await coming.getByRole('button', { name: 'Update' }).count()) === 1)
    check(`${tag}: no separate Reload button beside it`, (await card.getByRole('button', { name: 'Reload' }).count()) === 0)
    const det = card.locator('details')
    check(`${tag}: “What’s new in your version (v1.0.21)” starts folded`, (await det.locator('summary').innerText()).includes(`What’s new in your version (${CUR.v})`) && !(await det.evaluate((e) => e.open)))
    await det.locator('summary').click()
    await sleep(200)
    check(`${tag}: unfolded, it lists v1.0.21’s ${CUR.highlights.length} highlights`, JSON.stringify(await det.locator('li').allInnerTexts()) === JSON.stringify(CUR.highlights))
    await card.evaluate((e) => e.scrollIntoView({ block: 'start' }))
    await sleep(200)
    await shot(page, `5-settings-app-${vname}-${theme}`)
    if (vname === 'desktop' && theme === 'day') {
      const nav = page.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true, () => false)
      await coming.getByRole('button', { name: 'Update' }).click()
      check(`${tag}: Update in Settings reloads onto the new version`, await nav)
    }
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}
{
  // up to date: the card says so, and only “What’s new in your version” shows
  const { ctx, page } = await device({ route: '/settings', stamp: true, gh: SAME, memory: { seen: CUR.v, checkedAt: Date.now() } })
  const card = page.locator('div', { has: page.getByRole('button', { name: /Check for updates|Checking/ }) }).filter({ hasText: 'App · Kai' }).last()
  const text = await card.innerText()
  check('up to date: “You’re on the latest (v1.0.21)”, no “Coming in”', text.includes(`You're on the latest (${CUR.v})`) && !text.includes('Coming in'), text.split('\n').slice(0, 3).join(' | '))
  // a first Settings visit that finds the new version toasts it (once)
  await ctx.close()
  const b = await device({ route: '/settings', web: NEXT, gh: NEWER, memory: { seen: CUR.v, checkedAt: Date.now() } })
  check('Settings opening finds v1.0.22 first → the one toast comes from there', (await toasts(b.page)).includes(`${NEXT} is out`))
  await b.ctx.close()
}

// ── 6 · the Windows app: the native toast through tray.rs notify_local, quiet hours, pause, looking ──
{
  const { ctx, page, net, errors } = await device({ tauri: CUR.v.slice(1), unfocused: true, time: '13:00', gh: NEWER, memory: { seen: CUR.v } })
  const n = await calls(page, 'notify_local')
  const a = n[0]?.args
  check('windows (in the tray, 13:00): one native toast, same copy, a See what’s new button', n.length === 1 && a.title === `${NEXT} is out` && a.body === 'See what’s new' && JSON.stringify(a.actions) === JSON.stringify([['whats-new', 'See what’s new']]) && JSON.parse(a.payload).version === NEXT, JSON.stringify(a))
  check('windows: the in-app toast too, and one GitHub call (installed version from the shell)', (await toasts(page)).includes(`${NEXT} is out`) && net.github === 1 && (await calls(page, 'plugin:app|version')).length >= 1, JSON.stringify(net))
  // the toast's button, as tray.rs runs it: window.__kfNotifyAction("whats-new", payload)
  await page.evaluate((p) => window.__kfNotifyAction('whats-new', JSON.parse(p)), a.payload)
  await sleep(600)
  const d = dialog(page)
  check('windows: the button brings the window forward (tray_open) and opens v1.0.22’s sheet', (await calls(page, 'tray_open')).length === 1 && (await d.innerText()).includes(`What’s new in ${NEXT}`))
  await shot(page, '6-windows-sheet-from-native-toast')
  await d.getByRole('button', { name: 'Update' }).click()
  await sleep(800)
  check('windows: Update downloads this platform’s installer (lib/appUpdate openDownload)', net.downloads.includes(exe), net.downloads.join(', '))
  check('windows: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
for (const [label, o] of [
  ['in quiet hours (23:30)', { time: '23:30' }],
  ['while notifications are paused', { time: '13:00', settings: { notify_paused_until: new Date(cairo('13:00').getTime() + 3_600_000).toISOString() } }],
  ['while someone is looking at the window', { time: '13:00', unfocused: false }],
]) {
  const { ctx, page } = await device({ tauri: CUR.v.slice(1), unfocused: true, gh: NEWER, memory: { seen: CUR.v }, ...o })
  check(`windows ${label}: no native toast, the in-app toast still says it`, (await calls(page, 'notify_local')).length === 0 && (await toasts(page)).includes(`${NEXT} is out`))
  await ctx.close()
}
{
  // a release whose installer is still building: shown in Settings, not toasted yet (and not marked told)
  const pending = { ...NEWER, assets: [] }
  const { ctx, page } = await device({ tauri: CUR.v.slice(1), unfocused: true, time: '13:00', gh: pending, memory: { seen: CUR.v } })
  check('windows: a release without its installer yet → no toast, not marked as told', !(await toasts(page)).some((x) => x.endsWith('is out')) && (await calls(page, 'notify_local')).length === 0 && !(await memory(page))?.notified)
  await ctx.close()
}

await browser.close()
const pass = results.filter((r) => r.ok).length
fs.writeFileSync(path.join(OUT, 'app-results.json'), JSON.stringify({ pass, total: results.length, results }, null, 1))
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
