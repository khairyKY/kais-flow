// Google Calendar sync (parity audit B1 → a, Kai 2026-10-13) on the REAL app against a MOCKED backend
// (the event-detail recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST and edge-function call and records every write).
// Checks: Settings → Integrations → Google Calendar is a real row (Connect says what's missing until the
// secrets exist, else goes to Google's consent page; the landing back syncs and shows the calendars;
// switches save; Disconnect; an expired grant says reconnect); synced events on the grid are read-only
// (drawn in their calendar's colour, no drag / resize / delete, the menu says "From Google · <name>"),
// count as busy (rail footer) and in overlaps; the phone grid and sheet the same.
// 2026-10-14 (our plan out to Google as busy): "Show my plan in Google as busy" saves at once (off, then on
// + a sync), and a grant from before the write scope offers Reconnect, reading carrying on (s8, s9).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=s1,g1 runs some)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5277'
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
const UID = '00000000-0000-4000-8000-0000000060c1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PRAYER = { id: 'prayer@group.calendar.google.com', name: 'Prayer times', color: '#9fe1e7' }
const HOLIDAYS = { id: 'en.eg#holiday@group.v.calendar.google.com', name: 'Holidays in Egypt', color: '#16a765' }
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const gcal = (n, title, from, to, over = {}) => ev(n, title, from, to, {
  source: 'gcal', gcal_id: `g${n}`, gcal_etag: '"1"', color: PRAYER.color,
  external_ref: { source: 'gcal', id: `${PRAYER.id}/g${n}`, calendar: PRAYER.name, calendar_id: PRAYER.id }, ...over,
})
const DHUHR = 1, ASR = 2, LUNCH = 3, MAWLID = 4
const EVENTS = [
  gcal(DHUHR, 'Dhuhr', '12:00', '12:20'),
  gcal(ASR, 'Asr', '15:20', '15:40'),
  ev(LUNCH, 'Lunch with Omar', '12:10', '12:40'),
  gcal(MAWLID, 'Mawlid', '00:00', '00:00', {
    all_day: true, starts_at: '2026-10-13T00:00:00.000Z', ends_at: '2026-10-14T00:00:00.000Z', color: HOLIDAYS.color,
    external_ref: { source: 'gcal', id: `${HOLIDAYS.id}/g4`, calendar: HOLIDAYS.name, calendar_id: HOLIDAYS.id },
  }),
]
const GOOGLE = {
  ok: { provider: 'google', updated_at: iso('09:30'), login: 'kai@gmail.com', status: 'ok', synced_at: iso('09:48'), repos: null, rules: null, calendars: [{ id: 'kai@gmail.com', name: 'Kai', color: '#4986e7' }, PRAYER, HOLIDAYS], chosen: ['kai@gmail.com', PRAYER.id], can_write: true, mirror: null },
}
// A grant from before 2026-10-14: calendar.readonly only.
GOOGLE.readonly = { ...GOOGLE.ok, can_write: null }
GOOGLE.fresh = { ...GOOGLE.ok, synced_at: null }
GOOGLE.failing = { ...GOOGLE.ok, status: 'failing' }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = (over = {}) => structuredClone({ tasks: [], calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], integrations: [], app_settings: [SETTINGS], ...over })
const SYNCED = { calendars: 2, fetched: 335, new: 335, updated: 0, removed: 0, out: null }
const OUT_BLOCKS = { blocks: 12, written: 12, failed: 0, pending: 0 }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** o.fn: { 'google-connect': (body) => json, 'google-sync': … } — the edge functions' answers. */
async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: tables(o.rows), writes: [], calls: [] }
  await ctx.route('https://accounts.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Google consent (stub)</title><h1>Google consent (stub)</h1>' }))
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204 })
      const name = url.pathname.replace('/functions/v1/', '')
      let body = null
      try { body = req.postDataJSON() } catch { body = null }
      state.calls.push({ name, body })
      const answer = o.fn?.[name]?.(body) ?? { status: 404, json: { code: 'NOT_FOUND', message: 'Requested function was not found' } }
      return r.fulfill({ status: answer.status ?? 200, json: answer.json ?? answer })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
const bodyText = (page) => page.evaluate(() => document.body.textContent ?? '')
const calWrites = (state, from = 0) => state.writes.slice(from).filter((w) => w.table === 'calendar_events')
// settings-build (2026-10-26): Integrations is a category; each provider opens its own page from its row.
const openIntegrations = async (page) => {
  if (!new URL(page.url()).pathname.startsWith('/settings/integrations')) {
    await page.locator('.st-nav-item, .st-list-row', { hasText: /^Integrations/ }).first().click()
    await sleep(600)
  }
  await page.locator('.st-row.is-link[data-st-key="Google Calendar"]').click()
  await sleep(600)
}
const googleCard = (page) => page.locator('.st-panel', { has: page.getByText('Google Calendar', { exact: true }) }).last()
const status = (page) => googleCard(page).locator('[role="status"]').first()
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const fc = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]`).first()
const menu = (page, label = 'Block details') => page.locator(`[role="menu"][aria-label="${label}"]`).last()

// ── S1: the summary card and the Integrations page tell the truth — no "Coming soon" ──
if (want('s1')) {
  const { ctx, page, errors } = await open('/settings/integrations')
  const txt = await bodyText(page)
  check('s1 settings: no "Coming soon" anywhere', !/coming soon/i.test(txt))
  const row = page.locator('#settings-Integrations .st-row', { hasText: 'Google Calendar' })
  check('s1 summary card: Google Calendar reads "Not connected"', (await row.count()) === 1 && /Not connected/.test(await row.textContent()), await row.textContent())
  await openIntegrations(page)
  const card = googleCard(page)
  check('s1 integrations: a real Google Calendar row with Connect', (await card.getByRole('button', { name: 'Connect' }).count()) === 1 && /read-only/i.test(await card.textContent()))
  check('s1 integrations: no "Not built yet"', !(await bodyText(page)).includes('Not built yet'))
  await card.screenshot({ path: path.join(OUT, 's1-integrations-not-connected.png') })
  check('s1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S2: Connect before Kai has set the secrets says plainly which are missing (no error) ──
if (want('s2')) {
  const { ctx, page, errors, state } = await open('/settings', { fn: { 'google-connect': () => ({ missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] }) } })
  await openIntegrations(page)
  await googleCard(page).getByRole('button', { name: 'Connect' }).click()
  await sleep(1200)
  const said = (await status(page).textContent().catch(() => '')) ?? ''
  check('s2 Connect posts {action:"start", origin} to google-connect', state.calls.some((c) => c.name === 'google-connect' && c.body?.action === 'start' && c.body?.origin === new URL(BASE).origin), JSON.stringify(state.calls))
  check('s2 it says what is missing: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and where the steps are', /Not set up yet/.test(said) && said.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET') && said.includes('docs/GOOGLE-SETUP.md'), said)
  check('s2 still on Settings, the Connect button still there', page.url().startsWith(BASE) && (await googleCard(page).getByRole('button', { name: 'Connect' }).count()) === 1)
  await googleCard(page).screenshot({ path: path.join(OUT, 's2-connect-missing-secrets.png') })
  check('s2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S2b: functions not deployed yet — still a sentence, not a crash ──
if (want('s2')) {
  const { ctx, page, errors } = await open('/settings')
  await openIntegrations(page)
  await googleCard(page).getByRole('button', { name: 'Connect' }).click()
  await sleep(1200)
  const said = (await status(page).textContent().catch(() => '')) ?? ''
  check('s2b not deployed: "isn’t on the server yet … needs deploying"', /isn’t on the server yet/.test(said) && /deploying/.test(said), said)
  check('s2b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S3: with the secrets set, Connect goes to Google's consent page (the URL google-connect built) ──
if (want('s3')) {
  const consent = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=cid&redirect_uri=https%3A%2F%2Feqbbkitofgyxxrfggpbu.supabase.co%2Ffunctions%2Fv1%2Fgoogle-connect&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events.owned&access_type=offline&prompt=consent&state=s'
  const { ctx, page, errors } = await open('/settings', { fn: { 'google-connect': () => ({ url: consent }) } })
  await openIntegrations(page)
  await googleCard(page).getByRole('button', { name: 'Connect' }).click()
  await page.waitForURL(/accounts\.google\.com/, { timeout: 8000 }).catch(() => {})
  check('s3 the browser goes to Google’s consent page: read + owned-calendar events scopes', page.url().startsWith('https://accounts.google.com/o/oauth2/v2/auth') && page.url().includes('calendar.readonly') && page.url().includes('calendar.events.owned'), page.url())
  check('s3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S4: back from Google — Integrations opens, the first sync runs, calendars + Last synced show ──
if (want('s4')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/settings?google=connected', { theme, rows: { integrations: [GOOGLE.ok] }, fn: { 'google-sync': () => SYNCED } })
    await sleep(800)
    const said = (await status(page).textContent().catch(() => '')) ?? ''
    check(`s4 ${theme}: the landing opens Integrations › Google Calendar`, (await page.locator('.st-nav-item[aria-current="page"]').textContent()) === 'Integrations' && new URL(page.url()).pathname === '/settings/integrations/google')
    check(`s4 ${theme}: the first sync runs (google-sync {action:'sync'}) and says so`, state.calls.some((c) => c.name === 'google-sync' && c.body?.action === 'sync') && /Connected · Synced · 2 calendars · 335 events/.test(said), said)
    check(`s4 ${theme}: ?google= is gone from the address`, !page.url().includes('google='), page.url())
    const card = googleCard(page)
    const txt = await card.textContent()
    // 12h (lib/clock): "9:48 AM" — en-GB had written "9:48 am" (fixed 2026-10-22, settings/api syncedLabel).
    check(`s4 ${theme}: the account and "Connected · synced 12 Oct, 9:48 AM"`, txt.includes('kai@gmail.com') && /Connected · synced 12 Oct, 9:48 AM/.test(txt), txt)
    const sw = (name) => card.getByRole('switch', { name: `Show ${name}` })
    check(`s4 ${theme}: one switch per calendar, the chosen ones on`, (await sw('Kai').getAttribute('aria-checked')) === 'true' && (await sw('Prayer times').getAttribute('aria-checked')) === 'true' && (await sw('Holidays in Egypt').getAttribute('aria-checked')) === 'false')
    check(`s4 ${theme}: "Last synced 12 Oct, 9:48 AM", Sync now, Disconnect`, /Last synced.*12 Oct, 9:48 AM/.test(txt) && (await card.getByRole('button', { name: 'Sync now' }).count()) === 1 && (await card.getByRole('button', { name: 'Disconnect' }).count()) === 1)
    await card.screenshot({ path: path.join(OUT, `s4-integrations-connected-${theme}.png`) })
    check(`s4 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── S5: a switch saves at once (choose), a newly shown calendar syncs now; Disconnect ──
if (want('s5')) {
  const { ctx, page, errors, state } = await open('/settings', { rows: { integrations: [GOOGLE.ok] }, fn: { 'google-connect': (b) => (b?.action === 'choose' ? { chosen: b.ids } : { ok: true }), 'google-sync': () => SYNCED } })
  await openIntegrations(page)
  const card = googleCard(page)
  await card.getByRole('switch', { name: 'Show Holidays in Egypt' }).click()
  await sleep(1500)
  const choose = state.calls.find((c) => c.name === 'google-connect' && c.body?.action === 'choose')
  check('s5 turning Holidays on posts choose with all three ids', choose && choose.body.ids.length === 3 && choose.body.ids.includes(HOLIDAYS.id), JSON.stringify(choose?.body))
  check('s5 …and syncs at once (a newly shown calendar)', state.calls.filter((c) => c.name === 'google-sync').length === 1)
  const n = state.calls.length
  await card.getByRole('switch', { name: 'Show Prayer times' }).click()
  await sleep(1500)
  const off = state.calls.slice(n).find((c) => c.body?.action === 'choose')
  check('s5 turning one off posts choose without it, and no sync', off && !off.body.ids.includes(PRAYER.id) && state.calls.slice(n).every((c) => c.name !== 'google-sync'), JSON.stringify(off?.body))
  await card.getByRole('button', { name: 'Disconnect' }).click()
  await sleep(1200)
  check('s5 Disconnect posts {action:"disconnect"} and says your own events stay', state.calls.some((c) => c.body?.action === 'disconnect') && /your own are untouched/.test((await status(page).textContent()) ?? ''))
  check('s5 nothing written to calendar_events or integrations by the client', state.writes.every((w) => w.table !== 'calendar_events' && w.table !== 'integrations'), JSON.stringify(state.writes.map((w) => w.table)))
  check('s5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S6: the error landing, and an expired grant ──
if (want('s6')) {
  {
    const { ctx, page, errors } = await open('/settings?google=error&reason=denied', { rows: { integrations: [] } })
    const said = (await status(page).textContent().catch(() => '')) ?? ''
    check('s6 ?google=error&reason=denied says the consent page was cancelled', /consent page was cancelled/.test(said), said)
    check('s6 …and the address is clean again', !page.url().includes('google=') && !page.url().includes('reason='), page.url())
    check('s6 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/settings/integrations', { rows: { integrations: [GOOGLE.failing] } })
    const row = page.locator('#settings-Integrations .st-row', { hasText: 'Google Calendar' })
    check('s6 failing: the summary row says "Access expired — reconnect"', /Access expired — reconnect/.test(await row.textContent()))
    await openIntegrations(page)
    const card = googleCard(page)
    check('s6 failing: Reconnect instead of Sync now, no calendar switches', (await card.getByRole('button', { name: 'Reconnect' }).count()) === 1 && (await card.getByRole('button', { name: 'Sync now' }).count()) === 0 && (await card.getByRole('switch').count()) === 0)
    await card.screenshot({ path: path.join(OUT, 's6-integrations-failing.png') })
    check('s6 failing: no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── S7: phone Settings carries the same row ──
if (want('s7')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/settings', { view: phone, theme, rows: { integrations: [GOOGLE.ok] } })
    await openIntegrations(page)
    const card = googleCard(page)
    await card.scrollIntoViewIfNeeded()
    check(`s7 ${theme}: phone Settings → Integrations › Google Calendar with its switches`, (await card.getByRole('switch', { name: 'Show Prayer times' }).count()) === 1 && (await card.getByRole('button', { name: 'Sync now' }).count()) === 1)
    check(`s7 ${theme}: …and "Show my plan in Google as busy"`, (await card.getByRole('switch', { name: 'Show my plan in Google as busy' }).count()) === 1)
    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    check(`s7 ${theme}: no horizontal scroll at 390`, wide <= 390, wide)
    await card.screenshot({ path: path.join(OUT, `s7-phone-google-${theme}.png`) })
    check(`s7 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── S8: "Show my plan in Google as busy" — on by default once the grant can write; off, then on + a sync ──
if (want('s8')) {
  let st = null
  const { ctx, page, errors, state } = await open('/settings/integrations', {
    rows: { integrations: [GOOGLE.ok] },
    fn: {
      'google-connect': (b) => {
        if (b?.action !== 'mirror') return { ok: true }
        st.rows.integrations[0].mirror = b.on // the server saved it: the refetch reads it back
        return { mirror: b.on }
      },
      'google-sync': () => ({ ...SYNCED, out: OUT_BLOCKS }),
    },
  })
  st = state
  check('s8 the summary row says the plan goes out as busy', /your plan there as busy/.test(await page.locator('#settings-Integrations .st-row', { hasText: 'Google Calendar' }).textContent()))
  await openIntegrations(page)
  const card = googleCard(page)
  const sw = card.getByRole('switch', { name: 'Show my plan in Google as busy' })
  check('s8 the switch is there and on (absent setting = on)', (await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'true')
  check('s8 no "Allow … Reconnect" once the grant can write', (await card.getByText('Allow Kai’s Flow to show your blocks in Google').count()) === 0 && (await card.getByRole('button', { name: 'Reconnect' }).count()) === 0)
  await card.screenshot({ path: path.join(OUT, 's8-plan-busy-on.png') })
  await sw.click()
  await sleep(1500)
  const off = state.calls.filter((c) => c.name === 'google-connect' && c.body?.action === 'mirror')
  check('s8 off posts {action:"mirror", on:false} — the server deletes ours in Google — and runs no sync', off.length === 1 && off[0].body.on === false && state.calls.every((c) => c.name !== 'google-sync'), JSON.stringify(state.calls))
  check('s8 …and the switch stays off', (await sw.getAttribute('aria-checked')) === 'false')
  await sw.click()
  await sleep(1800)
  const on = state.calls.filter((c) => c.name === 'google-connect' && c.body?.action === 'mirror')
  check('s8 on posts {action:"mirror", on:true}, then syncs to write them now', on.length === 2 && on[1].body.on === true && state.calls.some((c) => c.name === 'google-sync' && c.body?.action === 'sync'), JSON.stringify(state.calls))
  check('s8 …and the switch is on again', (await sw.getAttribute('aria-checked')) === 'true')
  await card.getByRole('button', { name: 'Sync now' }).click()
  await sleep(1500)
  const said = (await status(page).textContent().catch(() => '')) ?? ''
  check('s8 Sync now says how many blocks are busy in Google', /12 blocks busy in Google/.test(said), said)
  check('s8 nothing written to calendar_events or integrations by the client', state.writes.every((w) => w.table !== 'calendar_events' && w.table !== 'integrations'), JSON.stringify(state.writes.map((w) => w.table)))
  check('s8 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S9: a grant from before the write scope — "Allow … → Reconnect"; reading carries on meanwhile ──
if (want('s9')) {
  const consent = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=cid&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events.owned&access_type=offline&prompt=consent&state=s'
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/settings', { theme, rows: { integrations: [GOOGLE.readonly] }, fn: { 'google-connect': () => ({ url: consent }), 'google-sync': () => SYNCED } })
    await openIntegrations(page)
    const card = googleCard(page)
    const row = card.locator('.st-row', { hasText: 'Allow Kai’s Flow to show your blocks in Google' })
    check(`s9 ${theme}: "Allow Kai’s Flow to show your blocks in Google" with Reconnect`, (await row.count()) === 1 && (await row.getByRole('button', { name: 'Reconnect' }).count()) === 1)
    check(`s9 ${theme}: no busy switch yet`, (await card.getByRole('switch', { name: 'Show my plan in Google as busy' }).count()) === 0)
    check(`s9 ${theme}: reading carries on — status ok, Sync now, the calendar switches`, /Connected · synced/.test(await card.textContent()) && (await card.getByRole('button', { name: 'Sync now' }).count()) === 1 && (await card.getByRole('switch', { name: 'Show Prayer times' }).count()) === 1)
    await row.scrollIntoViewIfNeeded()
    await card.screenshot({ path: path.join(OUT, `s9-allow-reconnect-${theme}.png`) })
    if (theme === 'day') {
      await card.getByRole('button', { name: 'Sync now' }).click()
      await sleep(1200)
      check('s9 Sync now still syncs (no out line without the scope)', state.calls.some((c) => c.name === 'google-sync') && !/busy in Google/.test((await status(page).textContent().catch(() => '')) ?? ''))
      await row.getByRole('button', { name: 'Reconnect' }).click()
      await page.waitForURL(/accounts\.google\.com/, { timeout: 8000 }).catch(() => {})
      check('s9 Reconnect posts start and goes to Google asking for calendar.events.owned', state.calls.some((c) => c.name === 'google-connect' && c.body?.action === 'start') && page.url().includes('calendar.events.owned'), page.url())
    }
    check(`s9 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── G1: the grid draws synced events read-only, in their calendar's colour ──
if (want('g1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    const dhuhr = fc(page, eid(DHUHR))
    await dhuhr.scrollIntoViewIfNeeded()
    await sleep(300)
    check(`g1 ${theme}: Dhuhr is on the grid, marked synced`, (await dhuhr.count()) === 1 && /kf-synced/.test(await dhuhr.getAttribute('class')))
    // Since the 2026-10-22 block looks (ffe24812) the calendar's colour is --kf-ev-c; --kf-ev-accent is its ink mix.
    const accent = await dhuhr.evaluate((el) => el.style.getPropertyValue('--kf-ev-c'))
    check(`g1 ${theme}: in the calendar's colour (#9fe1e7)`, accent === '#9fe1e7', accent)
    check(`g1 ${theme}: the all-day Mawlid sits in the all-day band (Tue)`, (await page.locator('.fc-daygrid-event', { hasText: 'Mawlid' }).count()) >= 1)
    check(`g1 ${theme}: no resize handle on a synced event`, (await dhuhr.locator('.fc-event-resizer').count()) === 0)
    // Overlaps count it: the native Lunch (12:10) overlaps Dhuhr (12:00–12:20) — both flagged.
    check(`g1 ${theme}: overlap logic counts it (Lunch and Dhuhr both conflicted)`, /fc-event-conflict/.test(await dhuhr.getAttribute('class')) && /fc-event-conflict/.test(await fc(page, eid(LUNCH)).getAttribute('class')))
    // Busy: today's footer counts Dhuhr, Asr and Lunch (the all-day Mawlid is tomorrow and all-day).
    // The rail's load line (Kai 2026-10-14, Akiflow's compact head): "3 blocks · 2h free".
    const foot = ((await page.locator('.cal-rail-load').first().textContent().catch(() => '')) ?? '').trim()
    check(`g1 ${theme}: busy — the rail's load line counts the synced blocks ("3 blocks")`, /^3 blocks\b/.test(foot), foot)
    await shot(page, `g1-grid-${theme}`, false)
    if (theme === 'day') {
      // A drag does nothing: no write, the block stays where it was.
      const b0 = await dhuhr.boundingBox()
      // Overlap B (cascade, 2026-10-22): Lunch (12:10) lies over Dhuhr's lower half, so grab its uncovered top.
      const from = { x: b0.x + 10, y: b0.y + 4 }
      const w = state.writes.length
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from.x, from.y + 8 * i)
        await sleep(30)
      }
      await page.mouse.up()
      await sleep(1500)
      const b1 = await dhuhr.boundingBox()
      check('g1 drag: a synced event doesn’t move, nothing written', calWrites(state, w).length === 0 && Math.abs(b1.y - b0.y) < 1, JSON.stringify({ before: b0.y, after: b1.y, writes: calWrites(state, w).length }))
    }
    check(`g1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── G2: its menu: when, and "From Google · <calendar>" — no edit, no delete; ⌫ and right-click too ──
if (want('g2')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    await fc(page, eid(DHUHR)).scrollIntoViewIfNeeded()
    await sleep(200)
    await fc(page, eid(DHUHR)).click({ position: { x: 10, y: 4 } }) // its top: Lunch overlaps the rest (cascade)
    await menu(page).waitFor({ timeout: 4000 }).catch(() => {})
    await sleep(300)
    const labels = await menu(page).getByRole('menuitem').allInnerTexts()
    check(`g2 ${theme}: rows — date · time · "From Google · Prayer times", nothing else`, labels.length === 3 && /Mon, Oct 12/.test(labels[0]) && /12:00 – 12:20/.test(labels[1]) && /From Google · Prayer times/.test(labels[2]), JSON.stringify(labels))
    const title = menu(page).getByRole('textbox', { name: 'Title' })
    // menu B (cal-blocks): a Google event shows no swatch tray at all (it was a disabled colour dot)
    check(`g2 ${theme}: the title is read-only, no colour tray`, (await title.getAttribute('readonly')) !== null && (await menu(page).locator('.kf-swatch-tray').count()) === 0)
    await shot(page, `g2-menu-${theme}`, false)
    if (theme === 'day') {
      const w = state.writes.length
      await menu(page).getByRole('menuitem', { name: /Mon, Oct 12/ }).click().catch(() => {})
      await sleep(300)
      check('g2 the date row opens no picker', (await page.locator('[role="dialog"]').count()) === 0)
      await page.keyboard.press('Escape')
      await sleep(200)
      await fc(page, eid(DHUHR)).click({ position: { x: 10, y: 4 } }) // its top: Lunch overlaps the rest (cascade)
      await menu(page).waitFor({ timeout: 4000 }).catch(() => {})
      await page.keyboard.press('Backspace')
      await sleep(1500)
      check('g2 ⌫ with its menu open deletes nothing', calWrites(state, w).length === 0 && (await fc(page, eid(DHUHR)).count()) === 1)
      await page.keyboard.press('Escape')
      await sleep(200)
      await fc(page, eid(DHUHR)).click({ button: 'right', position: { x: 10, y: 4 } })
      await sleep(400)
      const ctxItems = await page.locator('[role="menu"]').last().getByRole('menuitem').allInnerTexts()
      check('g2 right-click: only "Details" — no Delete', ctxItems.length === 1 && /Details/.test(ctxItems[0]), JSON.stringify(ctxItems))
      // A native event keeps its full menu.
      await page.keyboard.press('Escape')
      await sleep(200)
      await fc(page, eid(LUNCH)).click()
      await menu(page).waitFor({ timeout: 4000 }).catch(() => {})
      const native = await menu(page).getByRole('menuitem').allInnerTexts()
      check('g2 a native event still has its rows and Delete', native.some((l) => /Delete/.test(l)) && native.some((l) => /No project/.test(l)), JSON.stringify(native))
    }
    check(`g2 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P1: phone — the synced block doesn't lift; its sheet is read-only, no Delete footer ──
if (want('p1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone, theme })
    const block = page.locator(`.pc-block[data-id="${eid(DHUHR)}"]`)
    await block.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(300)
    check(`p1 ${theme}: the phone grid draws Dhuhr`, (await block.count()) === 1)
    if (theme === 'day') {
      // A 600ms hold lifts a native block; a synced one stays down.
      const bb = await block.boundingBox()
      const p = { x: bb.x + 10, y: bb.y + 4 } // its uncovered top: Lunch (12:10) overlaps the rest
      const w = state.writes.length
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
      await sleep(700)
      const lifted = /is-lifted/.test((await block.getAttribute('class')) ?? '')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await sleep(800)
      check('p1 a long press doesn’t lift a synced block, nothing written', !lifted && calWrites(state, w).length === 0)
      await page.keyboard.press('Escape').catch(() => {})
      await sleep(500)
    }
    const bb2 = await block.boundingBox()
    const p = { x: bb2.x + 10, y: bb2.y + 4 } // its uncovered top: Lunch (12:10) overlaps the rest
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
    await sleep(40)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(900)
    const rows = await page.locator('.pc-bs-rows .kf-as-row').allInnerTexts()
    check(`p1 ${theme}: the sheet — date · time · "From Google · Prayer times"`, rows.length === 3 && /Mon, Oct 12/.test(rows[0]) && /12:00 – 12:20/.test(rows[1]) && /From Google · Prayer times/.test(rows[2]), JSON.stringify(rows))
    check(`p1 ${theme}: no swatches, no Delete footer, the title read-only`, (await page.locator('.pc-bs-colors').count()) === 0 && (await page.locator('.pc-bs-delete').count()) === 0 && (await page.locator('.pc-bs-title-in').getAttribute('readonly')) !== null)
    await shot(page, `p1-phone-sheet-${theme}`, false)
    check(`p1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
