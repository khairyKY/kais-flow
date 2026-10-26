// settings-sync (2026-10-26, Kai: "the settings should always be the same for both the phone version and
// desktop") on the REAL app against a MOCKED backend shared by three devices: a computer (web), a phone
// (390, touch) and a second computer (the Windows app, stubbed). One app_settings row lives here; a write
// merges into it per key the way migration 0087's trigger does (newest `at` wins) and goes out to every
// device over a stand-in for Supabase Realtime (Phoenix v2 frames on a routed WebSocket) — so a change
// travels the real path: outbox → row → realtime → refetch → lib/prefsSync → the store → the screen.
// Checks: the one-time seed (first device sends, the others adopt) · every synced setting changed on one
// device shows on another while its Settings page is open, no reload · the interface size per device
// class · columns already on the row (quiet hours, captures) now live too · device-only settings stay
// local and wear "This device".
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5318'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Polls `fn` (on the page) until it returns truthy, up to `ms`. Returns the last value. */
async function until(page, fn, arg, ms = 6000) {
  const t0 = Date.now()
  let v
  while (Date.now() - t0 < ms) {
    v = await page.evaluate(fn, arg).catch(() => undefined)
    if (v) return v
    await sleep(120)
  }
  return v
}

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const CONSENTS = ['terms', 'privacy'].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, document: d, version: LEGAL_TS.match(new RegExp(`${d.toUpperCase()}_VERSION = '([0-9-]+)'`))[1], accepted_at: '2026-10-25T00:00:00Z' }))
const SYNCED = [...fs.readFileSync(new URL('../../../../app/src/lib/prefs.ts', import.meta.url), 'utf8').matchAll(/^ {2}'([^']+)',/gm)].map((m) => m[1])
const SEED_AT = '1970-01-01T00:00:00.000Z'

// ── the one server ──
const T = '2026-09-01T09:00:00Z'
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const server = {
  settings: { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', timezone: 'Africa/Cairo', auto_file_captures: false, auto_project: 'suggest', quiet_hours_on: true, quiet_from: '22:30', quiet_to: '07:00', help_seen: ['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox', 'notice:autofile'], prefs: {}, created_at: T, updated_at: T },
  sockets: new Set(),
  writes: [],
}
const DOMAINS = [['Work', '#7A9CC6'], ['Health', '#8FB18C']].map(([name, color], i) => ({ id: id('4', i + 1), user_id: UID, name, color, sort_order: i, deleted_at: null, created_at: T, updated_at: T }))
const tables = { domains: DOMAINS, integrations: [], consents: CONSENTS, tasks: [], projects: [], areas: [], calendar_events: [], inbox_items: [], journal_entries: [], activity_log: [], routines: [], routine_completions: [] }

/** 0087's trigger: per key, the newer `at` wins (a tie takes the incoming). */
function mergePrefs(old = {}, incoming = {}) {
  const out = { ...old }
  for (const [k, e] of Object.entries(incoming ?? {})) if (!out[k] || (e?.at ?? '') >= (out[k].at ?? '')) out[k] = e
  return out
}
function writeSettings(body) {
  const row = Array.isArray(body) ? body[0] : body
  if (!row || typeof row !== 'object') return
  server.settings = { ...server.settings, ...row, prefs: mergePrefs(server.settings.prefs, row.prefs), updated_at: new Date().toISOString() }
  setTimeout(broadcast, 120) // the realtime hop
}
function broadcast() {
  for (const s of server.sockets) {
    for (const [topic, ch] of s.channels) {
      for (const b of ch.bindings) {
        if (b.table !== 'app_settings') continue
        const data = { schema: 'public', table: 'app_settings', commit_timestamp: new Date().toISOString(), type: 'UPDATE', columns: [], record: server.settings, old_record: {}, errors: null }
        try {
          s.ws.send(JSON.stringify([ch.joinRef, null, topic, 'postgres_changes', { ids: [b.id], data }]))
        } catch {
          /* closed */
        }
      }
    }
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
const errors = {}

async function device(name, o) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', isMobile: phone, hasTouch: phone })
  await ctx.addInitScript(([sess, seed, tauri, uid]) => {
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem('kf-download-bar-dismissed', '1')
    if (!localStorage.getItem('h-seeded')) {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
      localStorage.setItem('h-seeded', '1')
    }
    if (tauri) window.__TAURI_INTERNALS__ = { invoke: async (cmd) => (cmd === 'plugin:app|version' ? tauri : cmd === 'autostart_get' ? false : null) }
  }, [JSON.stringify(session), o.seed, o.tauri ?? null, UID])
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, json: {} }))
  await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const s = { ws, channels: new Map() }
    server.sockets.add(s)
    const reply = (jr, ref, topic, response = {}) => ws.send(JSON.stringify([jr, ref, topic, 'phx_reply', { status: 'ok', response }]))
    ws.onMessage((raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const [jr, ref, topic, event, payload] = msg
      if (event === 'phx_join') {
        const bindings = (payload?.config?.postgres_changes ?? []).map((f, i) => ({ ...f, id: 1000 + i }))
        s.channels.set(topic, { joinRef: jr, bindings })
        return reply(jr, ref, topic, { postgres_changes: bindings })
      }
      if (event === 'phx_leave') s.channels.delete(topic)
      if (ref) reply(jr, ref, topic)
    })
    ws.onClose(() => server.sockets.delete(s))
  })
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      server.writes.push({ device: name, method: req.method(), table, body })
      if (table === 'app_settings') writeSettings(body)
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = table === 'app_settings' ? [server.settings] : (tables[table] ?? [])
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  errors[name] = []
  page.on('pageerror', (e) => errors[name].push(e.message))
  await page.goto(`${BASE}${o.route}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => (window.__h = 'never reloaded'))
  return { name, ctx, page }
}

/** In-app navigation (no reload): the router follows a pushState + popstate. */
async function nav(d, path) {
  await d.page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await d.page.waitForTimeout(350)
}
const local = (d, key) => d.page.evaluate((k) => localStorage.getItem(k), key)
const pressed = (d, group, label) => d.page.evaluate(([g, l]) => [...document.querySelectorAll(`[role="group"][aria-label="${g}"] button`)].find((b) => b.textContent.trim() === l)?.getAttribute('aria-pressed') === 'true', [group, label])
const switchOn = (d, label) => d.page.evaluate((l) => document.querySelector(`[role="switch"][aria-label="${l}"]`)?.getAttribute('aria-checked'), label)
const clickSeg = (d, group, label) => d.page.locator(`[role="group"][aria-label="${group}"] button`, { hasText: label }).first().click()
const clickSwitch = (d, label) => d.page.locator(`[role="switch"][aria-label="${label}"]`).first().click()
async function slide(d, aria, value) {
  await d.page.evaluate(([a, v]) => {
    const el = document.querySelector(`input[type="range"][aria-label="${a}"]`)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, [aria, value])
}
const waitPressed = (d, group, label) => until(d.page, ([g, l]) => [...document.querySelectorAll(`[role="group"][aria-label="${g}"] button`)].find((b) => b.textContent.trim() === l)?.getAttribute('aria-pressed') === 'true', [group, label])
const waitSwitch = (d, label, want) => until(d.page, ([l, w]) => document.querySelector(`[role="switch"][aria-label="${l}"]`)?.getAttribute('aria-checked') === w, [label, String(want)])

// ── 1 · one-time migration: each device's pre-sync values; the first to open seeds, the rest adopt ──
const desk = await device('desk', { view: DESKTOP, route: '/settings/appearance', seed: { kf_theme: 'night', kf_theme_mode: 'dark', kf_sound_pack: 'glass', kf_ui_scale: '1.25', 'kf.calViewOptions': JSON.stringify({ density: 'm', nowCard: true }) } })
await until(desk.page, () => true)
const t0 = Date.now()
while (Date.now() - t0 < 6000 && !server.settings.prefs.kf_theme_mode) await sleep(100)
check('seed · the first device sends its own values', server.settings.prefs.kf_theme_mode?.v === 'dark' && server.settings.prefs.kf_sound_pack?.v === 'glass', JSON.stringify(Object.keys(server.settings.prefs)))
check('seed · stamped 1970 so any real change beats them', server.settings.prefs.kf_theme_mode?.at === SEED_AT)
check('seed · the computer\u2019s size goes up under its class', server.settings.prefs['kf_ui_scale.computer']?.v === '1.25' && !server.settings.prefs.kf_ui_scale)

const phone = await device('phone', { view: PHONE, route: '/settings/appearance', seed: { kf_theme: 'day', kf_theme_mode: 'light', kf_ui_scale: '1' } })
check('seed · the second device adopts the first\u2019s theme', await until(phone.page, () => document.documentElement.dataset.theme === 'night' && localStorage.getItem('kf_theme_mode') === 'dark'))
check('seed · …and its sound pack', (await local(phone, 'kf_sound_pack')) === 'glass')
check('seed · …but keeps its own class\u2019s size (phone 100%)', (await local(phone, 'kf_ui_scale')) === '1' && server.settings.prefs['kf_ui_scale.phone']?.v === '1')
check('seed · Settings on the phone shows Dark', await pressed(phone, 'Theme', 'Dark'))

const win = await device('win', { view: DESKTOP, route: '/settings/appearance', tauri: '1.5.0', seed: { kf_ui_scale: '1', kf_tray_shown: '1' } })
check('seed · a second computer adopts the computers\u2019 size (125%)', await until(win.page, () => document.documentElement.style.zoom === '1.25'))
await desk.page.screenshot({ path: `${OUT}/1-desk-appearance-seeded.png` })
await phone.page.screenshot({ path: `${OUT}/1-phone-appearance-seeded.png` })

// ── 2 · every synced setting: changed on one device, shown on another while its Settings is open ──
// Appearance
await clickSeg(desk, 'Theme', 'Light')
check('Theme · computer → phone (Light), the page and the picker', (await until(phone.page, () => document.documentElement.dataset.theme === 'day')) && (await waitPressed(phone, 'Theme', 'Light')))
await clickSeg(phone, 'Theme', 'Dark')
check('Theme · phone → computer (Dark)', (await until(desk.page, () => document.documentElement.dataset.theme === 'night')) && (await waitPressed(desk, 'Theme', 'Dark')))
await clickSeg(desk, 'Theme', 'Auto')
check('Theme · Auto reaches the phone, which follows its own system', (await waitPressed(phone, 'Theme', 'Auto')) && (await until(phone.page, () => document.documentElement.dataset.theme === (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'))))

await desk.page.locator('button[aria-label="Interface size"]').click()
await desk.page.locator('[role="option"]', { hasText: '150%' }).click()
check('Interface size · computer → the other computer (150%)', await until(win.page, () => document.documentElement.style.zoom === '1.5'))
await sleep(800)
check('Interface size · …not the phone (its own class, 100%)', (await phone.page.evaluate(() => document.documentElement.style.zoom)) === '' && (await local(phone, 'kf_ui_scale')) === '1')
await phone.page.locator('button[aria-label="Interface size"]').click()
await phone.page.locator('[role="option"]', { hasText: '125%' }).click()
await sleep(1200)
check('Interface size · a phone\u2019s pick stays with phones', server.settings.prefs['kf_ui_scale.phone']?.v === '1.25' && (await desk.page.evaluate(() => document.documentElement.style.zoom)) === '1.5')
await phone.page.locator('button[aria-label="Interface size"]').click()
await phone.page.locator('[role="option"]', { hasText: '100%' }).click()

await slide(desk, 'Paper texture', 80)
check('Paper texture · computer → phone (80%)', await until(phone.page, () => getComputedStyle(document.documentElement).getPropertyValue('--kf-grain-opacity').trim() === '0.8' && [...document.querySelectorAll('.st-help')].some((e) => e.textContent.includes('80%'))))

await clickSwitch(phone, 'Botanical animations')
check('Botanical animations · phone → computer (off)', await waitSwitch(desk, 'Botanical animations', false))
await clickSwitch(desk, 'Botanical animations')
check('Botanical animations · computer → phone (on)', await waitSwitch(phone, 'Botanical animations', true))
await phone.page.screenshot({ path: `${OUT}/2-phone-appearance-after.png` })

// Calendar & time
await nav(desk, '/settings/calendar')
await nav(phone, '/settings/calendar')
await clickSeg(desk, 'Time format', '24-hour')
check('Time format · computer → phone (24-hour)', await waitPressed(phone, 'Time format', '24-hour'))
await clickSeg(phone, 'Week starts on', 'Sun')
check('Week starts on · phone → computer (Sun)', await waitPressed(desk, 'Week starts on', 'Sun'))
await clickSwitch(desk, 'Fit days to the window')
check('Fit days to the window · computer → phone', await waitSwitch(phone, 'Fit days to the window', true))
await clickSwitch(phone, 'Fit hours to my day')
check('Fit hours to my day · phone → computer', await waitSwitch(desk, 'Fit hours to my day', true))
await clickSeg(desk, 'Density', 'Large')
check('Density · computer → phone (Large)', await waitPressed(phone, 'Density', 'Large'))
await phone.page.locator('button[aria-label="Second time zone"]').click()
await phone.page.locator('input[aria-label="Search time zones"]').fill('London')
await phone.page.locator('[role="listbox"][aria-label="Time zones"] [role="option"]', { hasText: 'Europe/London' }).first().click()
check('Second time zone · phone → computer (London)', await until(desk.page, () => document.querySelector('button[aria-label="Second time zone"]')?.textContent.includes('London')))
await clickSwitch(desk, 'Now card')
check('Now card · computer → phone (off)', await waitSwitch(phone, 'Now card', false))
await desk.page.screenshot({ path: `${OUT}/3-desk-calendar-after.png` })
await phone.page.screenshot({ path: `${OUT}/3-phone-calendar-after.png` })

// Notifications & sound
await nav(desk, '/settings/notify')
await nav(phone, '/settings/notify')
await clickSeg(desk, 'Sound pack', 'Kalimba')
check('Sound pack · computer → phone (Kalimba)', await waitPressed(phone, 'Sound pack', 'Kalimba'))
await clickSeg(phone, 'Volume', 'Full')
check('Sound (volume) · phone → computer (Full)', await waitPressed(desk, 'Volume', 'Full'))
await clickSwitch(desk, 'Sound')
check('Sound (off) · computer → phone', await waitSwitch(phone, 'Sound', false))
await clickSwitch(phone, 'Sound')
check('Sound (on) · phone → computer', await waitSwitch(desk, 'Sound', true))
const SOUNDS = await desk.page.evaluate(() => [...document.querySelectorAll('[data-sound-event]')].map((r) => r.querySelector('[role="switch"]').getAttribute('aria-label')))
let flip = 0
for (const label of SOUNDS) {
  const [from, to] = flip++ % 2 ? [phone, desk] : [desk, phone]
  const before = await switchOn(from, label)
  await clickSwitch(from, label)
  check(`Sound · ${label} · ${from.name === 'desk' ? 'computer → phone' : 'phone → computer'}`, await waitSwitch(to, label, before !== 'true'))
}
await clickSwitch(phone, 'Silent after you close the garden')
check('Silent after Shut down · phone → computer', await waitSwitch(desk, 'Silent after you close the garden', false))
// Columns already on the row: live now too (realtime on app_settings).
await clickSwitch(desk, 'Quiet hours')
check('Quiet hours (a row column) · computer → phone, no refocus', await waitSwitch(phone, 'Quiet hours', false))

// Organize — "Not now" comes back after
await nav(desk, '/settings/organize')
await nav(phone, '/settings/organize')
for (const [label, v, from, to] of [['High priority', 4, desk, phone], ['Medium priority', 9, phone, desk], ['Low priority', 21, desk, phone]]) {
  await slide(from, `${label} cooldown in days`, v)
  check(`“Not now” · ${label} · ${from.name === 'desk' ? 'computer → phone' : 'phone → computer'} (${v} days)`, await until(to.page, ([a, n]) => document.querySelector(`input[type="range"][aria-label="${a}"]`)?.closest('.st-row')?.querySelector('.st-value')?.textContent.startsWith(`${n} `), [`${label} cooldown in days`, v]))
}

// Capture & AI (a row column)
await nav(desk, '/settings/capture')
await nav(phone, '/settings/capture')
await clickSwitch(phone, 'File captures for me')
check('File captures for me (a row column) · phone → computer', await waitSwitch(desk, 'File captures for me', true))

// Focus (its own page) and the ritual pins (Routines)
await nav(desk, '/focus')
await nav(phone, '/focus')
for (const d of [desk, phone]) await d.page.locator('[title="pomodoro settings"]').first().click() // the round lengths' card
await desk.page.locator('button.kf-chip', { hasText: /^45m$/ }).first().click()
check('Focus round · computer → phone (45m)', await until(phone.page, () => JSON.parse(localStorage.getItem('kf_focus_settings') ?? '{}').focusRoundMin === 45 && [...document.querySelectorAll('button.kf-chip')].some((b) => b.textContent.trim() === '45m' && b.getAttribute('aria-pressed') === 'true')))
await nav(desk, '/routines')
await nav(phone, '/routines')
const pinsBefore = await phone.page.locator('button[aria-label="Pin this ritual to Today"]').count()
await desk.page.locator('button[aria-label="Unpin this ritual from Today"]').first().click()
check('Ritual pin · computer → phone (unpinned)', await until(phone.page, (n) => document.querySelectorAll('button[aria-label="Pin this ritual to Today"]').length === n + 1, pinsBefore))

// The phone's list reads the new values too.
await nav(phone, '/settings')
check('Phone list · Appearance reads Auto · 100%', await until(phone.page, () => [...document.querySelectorAll('.st-list-row')].some((r) => r.textContent.includes('Auto · 100%'))))
await phone.page.screenshot({ path: `${OUT}/4-phone-list-after.png` })

// ── 3 · device-only: stays local, labelled ──
await nav(win, '/settings/about')
const trayKeyBefore = await local(desk, 'kf_tray_shown')
await clickSwitch(win, 'Show in the system tray')
await sleep(1500)
check('Tray (Windows app) · stays on its computer', (await local(win, 'kf_tray_shown')) === '0' && (await local(desk, 'kf_tray_shown')) === trayKeyBefore)
const keys = Object.keys(server.settings.prefs)
check('Server keeps only synced keys (no tray, widgets, Day/Night, layout)', keys.every((k) => SYNCED.includes(k.replace(/\.(phone|computer)$/, ''))), keys.join(', '))
const tagOn = (d, sel) => d.page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => !!e.querySelector('.st-device')), sel)
check('This device · "On this computer" (tray, Start with Windows)', (await tagOn(win, '.st-sec h3')).length && (await win.page.evaluate(() => [...document.querySelectorAll('.st-sec h3')].some((h) => h.textContent.startsWith('On this computer') && h.querySelector('.st-device')))))
check('This device · the updater row', await win.page.evaluate(() => !!document.querySelector('[data-st-key="Kai’s Flow"] .st-device')))
await win.page.screenshot({ path: `${OUT}/5-win-about-device.png` })
for (const d of [desk, phone]) {
  await nav(d, '/settings/notify')
  // Its own label already says it — no second tag.
  check(`This device · ${d.name}: the notification test row is named so`, await until(d.page, () => !!document.querySelector('[data-st-key="This device"]') && !document.querySelector('[data-st-key="This device"] .st-device')))
  check(`This device · ${d.name}: "This browser" (push subscription)`, await d.page.evaluate(() => [...document.querySelectorAll('.st-sec h3')].some((h) => h.textContent.startsWith('This browser') && h.querySelector('.st-device'))))
  check(`No tag on the synced rows · ${d.name}`, await d.page.evaluate(() => !document.querySelector('#settings-Sound .st-device') && !document.querySelector('[data-st-key="Quiet hours"] .st-device')))
}
await desk.page.screenshot({ path: `${OUT}/5-desk-notify-device.png`, fullPage: true })
await phone.page.screenshot({ path: `${OUT}/5-phone-notify-device.png`, fullPage: true })
await nav(desk, '/settings/appearance')
check('No tag on Appearance (all synced)', await until(desk.page, () => !!document.querySelector('[data-st-key="Theme"]') && !document.querySelector('.st-device')))

// ── 4 · no reloads, no errors ──
for (const d of [desk, phone, win]) {
  check(`${d.name} · never reloaded`, (await d.page.evaluate(() => window.__h)) === 'never reloaded')
  check(`${d.name} · no page errors`, errors[d.name].length === 0, errors[d.name].slice(0, 2).join(' | '))
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ passed: results.length - failed.length, total: results.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
