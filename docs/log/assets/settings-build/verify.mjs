// settings-build (2026-10-26, Kai: "Settings: layout A, rows A" + "the new icons didn't land on the phone
// version") on the REAL app, signed in against a MOCKED backend — the desktop-polish recipe: the mock build
// points Supabase at http://127.0.0.1:9 (nothing listens there), a made-up session sits in localStorage,
// and Playwright answers every REST call. Writes are answered 201 and recorded.
// Checks: every category opens · every setting present once · search (real controls, › to the category) ·
// deep links (/settings/<category>, ?q=, the old #settings-* anchors, ?google=) · the phone list drilling
// in · the phone's nav icons · day and night at 100 / 125 / 150%.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5312'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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
const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const CONSENTS = ['terms', 'privacy'].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, document: d, version: LEGAL_TS.match(new RegExp(`${d.toUpperCase()}_VERSION = '([0-9-]+)'`))[1], accepted_at: '2026-10-25T00:00:00Z' }))

// ── data ──
const T = '2026-09-01T09:00:00Z'
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', timezone: 'Africa/Cairo', auto_file_captures: false, auto_project: 'suggest', quiet_hours_on: true, quiet_from: '22:30', quiet_to: '07:00', help_seen: ['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox', 'notice:autofile'], created_at: T, updated_at: T }
const DOMAINS = [['Work', '#7A9CC6'], ['Health', '#8FB18C']].map(([name, color], i) => ({ id: id('4', i + 1), user_id: UID, name, color, sort_order: i, deleted_at: null, created_at: T, updated_at: T }))
const GOOGLE = { provider: 'google', updated_at: T, login: 'demo@example.test', status: 'ok', synced_at: new Date(Date.now() - 4 * 60000).toISOString(), calendars: [{ id: 'demo@example.test', name: 'Demo', color: '#8FB18C' }], chosen: ['demo@example.test'], can_write: true, mirror: true }
const tables = () => ({ app_settings: [SETTINGS], domains: DOMAINS, integrations: [GOOGLE], consents: CONSENTS, tasks: [], projects: [], areas: [], calendar_events: [], inbox_items: [], journal_entries: [], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

/** Opens `route` at `o.view` (desktop), interface size `o.scale` (default 1), theme `o.theme`. */
async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? DESKTOP, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', isMobile: phone, hasTouch: phone })
  await ctx.addInitScript(([t, sess, scale, tauri, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() })) // no "Updated to" toast over the shots
    localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_ui_scale', scale)
    if (tauri) window.__TAURI_INTERNALS__ = { invoke: async (cmd) => (cmd === 'plugin:app|version' ? tauri : cmd === 'autostart_get' ? false : null) }
  }, [o.theme ?? 'day', JSON.stringify(session), String(o.scale ?? 1), o.tauri ?? null, UID])
  const state = { rows: tables(), writes: [] }
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, json: {} }))
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
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(700)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const keys = (page) => page.evaluate(() => [...document.querySelectorAll('.st-main-in [data-st-key], .st-phone [data-st-key]')].map((r) => r.dataset.stKey))
const noHScroll = (page) => page.evaluate(() => { const m = document.querySelector('.app-main-content'); return m.scrollWidth <= m.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 })
const path_ = (page) => new URL(page.url()).pathname + new URL(page.url()).search
const writes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => w.body)

const CATS = [
  ['account', 'Account'], ['appearance', 'Appearance'], ['calendar', 'Calendar & time'], ['capture', 'Capture & AI'], ['notify', 'Notifications & sound'], ['organize', 'Organize'],
  ['integrations', 'Integrations'], ['data', 'Your data'], ['privacy', 'Privacy & terms'], ['shortcuts', 'Shortcuts'], ['about', 'App & updates'],
]
// Every setting, by the label its row carries (data-st-key), in the category that holds it. Two rows are
// in two places by design (Settings options.html "Shows in two places"): Google Calendar (a link row in
// Calendar & time) — counted below on their own.
const EXPECT = {
  account: ['Email', 'Name and workspace', 'Delete account'],
  appearance: ['Theme', 'Interface size', 'Paper texture', 'Botanical animations'],
  calendar: ['Time zone', 'Time format', 'Weekend', 'Week starts on', 'Opens on', 'Fit days to the window', 'Fit hours to my day', 'Density', 'Second time zone', 'Now card', 'Plan shortcuts'],
  capture: ['File captures for me', 'Pick a project for new things', 'Page photos', 'Scans today', 'Read when offline', 'Share to Kai’s Flow'],
  notify: ['This device', 'Task reminder', 'Event reminder', 'Routine reminder', 'Morning digest', 'Evening nudge', 'Focus done', 'Paper capture ready', 'Birthday', 'Sync problem', 'Quiet hours', 'Show task names on the lock screen', 'Sound', 'Sound pack', 'Task done', 'Goal done', 'Captured', 'Focus begins', 'Focus ends', 'Ritual', 'Undo', 'Silent after Shut down', 'Notification sound pack', ...['Task reminder', 'Event starting', 'Snoozed reminder, again', 'Focus round end', 'Break end', 'Morning digest', 'Evening nudge', 'Page read', 'Terms changed', 'Sync problem'].map((l) => `${l} sound`), 'This browser: get notifications here'],
  organize: ['Domains', 'Labels', 'High priority', 'Medium priority', 'Low priority'],
  integrations: ['GitHub', 'AI assistants (MCP)', 'Groq', 'Capture key & bookmarklet'],
  data: ['Import', 'Export your data', 'Trash'],
  privacy: ['Privacy Policy', 'Terms of Use', 'What we keep, and where', 'What AI assistants can see'],
  about: ['Kai’s Flow', 'What’s new', 'Download the apps', 'The tour', 'Guide'],
}
const TWICE = ['Google Calendar']

// ── 1 · every category opens (desktop, day 100%), and 2 · every setting present once ──
{
  const env = await open('/settings')
  const { page, errors } = env
  check('1 /settings opens on Appearance (URL stays /settings)', path_(page) === '/settings' && (await page.locator('.st-page-head h2').innerText()) === 'Appearance')
  check('1 the list has 11 categories, each with a kf line icon', (await page.locator('.st-nav-item').count()) === 11 && (await page.locator('.st-nav-item svg').count()) === 11)
  check('1 the list is in four groups (hairlines between)', (await page.locator('.st-nav-grp').count()) === 4)
  const seen = {}
  for (const [cat, name] of CATS) {
    await page.locator('.st-nav-item', { hasText: name }).click()
    await sleep(350)
    const h = await page.locator('.st-page-head h2').innerText()
    const on = await page.locator('.st-nav-item[aria-current="page"]').innerText()
    const sections = await page.locator('.st-main-in .st-sec').count()
    const rows = await page.locator('.st-main-in .st-row').count()
    check(`1 ${name}: opens at /settings/${cat}, its page and list row lit (${sections} sections, ${rows} rows)`, path_(page) === `/settings/${cat}` && h === name && on.trim() === name && sections > 0 && rows > 0, `${path_(page)} · ${h}`)
    for (const k of await keys(page)) (seen[k] ??= []).push(cat)
  }
  check('1 the page never remounted between categories (search field kept, one Settings nav)', (await page.locator('.st-nav').count()) === 1)
  for (const [cat, labels] of Object.entries(EXPECT)) {
    const missing = labels.filter((l) => !(seen[l] ?? []).includes(cat))
    const twice = labels.filter((l) => (seen[l] ?? []).length !== 1)
    check(`2 ${cat}: every setting present, once (${labels.length})`, !missing.length && !twice.length, [missing.length ? `missing ${missing.join(', ')}` : '', twice.length ? `not once: ${twice.map((l) => `${l}×${(seen[l] ?? []).length}`).join(', ')}` : ''].filter(Boolean).join(' · '))
  }
  for (const l of TWICE) check(`2 "${l}" shows in its two places (Calendar & time, Integrations)`, JSON.stringify(seen[l]) === JSON.stringify(['calendar', 'integrations']), JSON.stringify(seen[l]))
  const all = Object.values(EXPECT).flat()
  const extra = Object.keys(seen).filter((k) => !all.includes(k) && !TWICE.includes(k) && !seen[k].includes('shortcuts'))
  check('2 no stray rows outside the inventory (Shortcuts is a reference)', extra.length === 0, extra.join(', '))
  await page.goto(`${BASE}/settings/shortcuts`, { waitUntil: 'networkidle' })
  await sleep(300)
  const sc = (await page.locator('.st-main-in .st-title').allInnerTexts()).join('|')
  check('2 Shortcuts reads the cheatsheet: Keys, On the calendar, Typing a task', sc === 'Keys|On the calendar|Typing a task', sc)
  // Pickers: more than three choices → a picker.
  await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' })
  await sleep(300)
  check('2 Interface size (five choices) is a picker', (await page.locator('.st-row[data-st-key="Interface size"] .st-pick').count()) === 1 && (await page.locator('.st-row[data-st-key="Interface size"] .kf-seg').count()) === 0)
  await page.locator('.st-row[data-st-key="Interface size"] .st-pick').click()
  await page.getByRole('option', { name: '150%' }).click()
  await sleep(300)
  check('2 picking 150% scales the app', (await page.evaluate(() => localStorage.getItem('kf_ui_scale'))) === '1.5')
  await page.evaluate(() => localStorage.setItem('kf_ui_scale', '1'))
  // The danger zone: a terra-edged panel in Account, Delete account in it.
  await page.goto(`${BASE}/settings/account`, { waitUntil: 'networkidle' })
  await sleep(300)
  const danger = page.locator('.st-sec.is-danger')
  check('2 Account: the danger zone holds Delete account', (await danger.count()) === 1 && (await danger.locator('.st-row[data-st-key="Delete account"]').count()) === 1 && /Danger zone/.test(await danger.innerText()))
  check('2 Account: Sign out is a button there', (await page.locator('.st-row[data-st-key="Email"]').getByRole('button', { name: 'Sign out' }).count()) === 1)
  // Integrations: each provider opens its own page with today's controls.
  for (const [label, sub, probe] of [['Google Calendar', 'google', 'Sync now'], ['GitHub', 'github', 'Connect'], ['AI assistants (MCP)', 'mcp', 'Create key'], ['Capture key & bookmarklet', 'capture-key', 'Create key']]) {
    await page.goto(`${BASE}/settings/integrations`, { waitUntil: 'networkidle' })
    await sleep(300)
    await page.locator(`.st-row.is-link[data-st-key="${label}"]`).click()
    await sleep(400)
    check(`2 Integrations › ${label}: its own page (/settings/integrations/${sub}) with its controls`, path_(page) === `/settings/integrations/${sub}` && (await page.getByRole('button', { name: probe }).count()) >= 1, path_(page))
  }
  check('2 the capture key page keeps its title and old id', (await page.locator('#settings-Advanced').count()) === 1 && /External capture endpoint/.test(await page.locator('#settings-Advanced').innerText()))
  await page.getByRole('link', { name: 'Integrations' }).first().click()
  await sleep(300)
  check('2 ‹ Integrations goes back', path_(page) === '/settings/integrations')
  check('1–2 no page errors', errors.length === 0, errors.join(' | '))
  await env.ctx.close()
}

// The Windows app: On this computer (tray, Start with Windows) in App & updates.
{
  const { ctx, page, errors } = await open('/settings/about', { tauri: '1.5.0' })
  const sec = page.locator('.st-sec', { hasText: 'On this computer' })
  check('2 Windows app: App & updates › On this computer has the tray and Start with Windows', (await sec.locator('.st-row[data-st-key="Show in the system tray"]').count()) === 1 && (await sec.locator('.st-row[data-st-key="Start with Windows"]').count()) === 1)
  await page.goto(`${BASE}/settings/notify`, { waitUntil: 'networkidle' })
  await sleep(300)
  check('2 Windows app: Notifications no longer carries the tray rows', (await page.locator('.st-row[data-st-key="Show in the system tray"]').count()) === 0)
  check('2 Windows app: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3 · search ──
{
  const env = await open('/settings/calendar')
  const { page, errors, state } = env
  await page.keyboard.press('Control+f')
  check('3 Ctrl F reaches the search', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search settings'))
  await page.keyboard.type('dark')
  await sleep(500)
  check('3 typing writes ?q= (deep-linkable)', path_(page) === '/settings/calendar?q=dark', path_(page))
  check('3 "dark" finds Theme (by meaning), under Appearance', (await page.locator('.st-results .st-row[data-st-key="Theme"]').count()) === 1 && /Appearance/.test(await page.locator('.st-results .st-sec:has([data-st-key="Theme"]) .st-crumb').innerText()))
  check('3 while searching, no category is lit', (await page.locator('.st-nav-item[aria-current="page"]').count()) === 0)
  await page.locator('.st-search input').fill('delete')
  await sleep(500)
  const del = await page.locator('.st-results .st-row').evaluateAll((rs) => rs.map((r) => r.dataset.stKey))
  check('3 "delete" finds Delete account and Trash', del.includes('Delete account') && del.includes('Trash'), del.join(', '))
  await page.locator('.st-search input').fill('AI')
  await sleep(500)
  const ai = await page.locator('.st-results .st-row').evaluateAll((rs) => rs.map((r) => r.dataset.stKey))
  check('3 "AI" finds the Capture & AI rows and AI assistants', ['File captures for me', 'Pick a project for new things', 'AI assistants (MCP)'].every((k) => ai.includes(k)), ai.join(', '))
  const crumbs = await page.locator('.st-results .st-sec:visible .st-crumb').allInnerTexts()
  check('3 results are grouped: "Category › Section" crumbs', crumbs.some((c) => /Capture & AI › What the AI may do/.test(c)), crumbs.join(' | '))
  check('3 the header counts them', /\d+ settings? match “AI”/.test(await page.locator('.st-res-h').innerText()))
  await shot(page, '3-search-ai-day')
  // The real control, right there.
  const from = state.writes.length
  await page.locator('.st-results .st-row[data-st-key="File captures for me"]').getByRole('switch').click()
  await sleep(500)
  check('3 a result keeps its real control: the switch writes auto_file_captures', writes(state, 'app_settings', from).some((w) => w.auto_file_captures === true), JSON.stringify(writes(state, 'app_settings', from)))
  // › opens its category with the row lit.
  await page.locator('.st-results .st-row[data-st-key="Pick a project for new things"] .st-go').click()
  await sleep(250)
  check('3 › opens its category (/settings/capture), search cleared', path_(page) === '/settings/capture' && (await page.locator('.st-search input').inputValue()) === '', path_(page))
  check('3 …with the row lit', (await page.locator('.st-row.is-lit[data-st-key="Pick a project for new things"]').count()) === 1)
  // "time", the drawing's search.
  await page.locator('.st-search input').fill('time')
  await sleep(600)
  const t = await page.locator('.st-results .st-row').evaluateAll((rs) => rs.map((r) => r.dataset.stKey))
  check('3 "time" finds Time zone, Time format, Second time zone, the digest and nudge, Quiet hours', ['Time zone', 'Time format', 'Second time zone', 'Morning digest', 'Evening nudge', 'Quiet hours'].every((k) => t.includes(k)), t.join(', '))
  await shot(page, '3-search-time-day')
  await page.locator('.st-search input').press('Escape')
  await sleep(300)
  check('3 Esc clears the search', !new URL(page.url()).searchParams.has('q') && (await page.locator('.st-results').count()) === 0)
  await page.locator('.st-search input').fill('zzqx')
  await sleep(400)
  check('3 nothing found says so', (await page.locator('.st-res-h').innerText()).startsWith('0 settings') && (await page.locator('.st-res-foot').count()) === 1)
  check('3 no page errors', errors.length === 0, errors.join(' | '))
  await env.ctx.close()
}

// ── 4 · deep links ──
{
  const cases = [
    ['/settings/notify', '/settings/notify', 'Notifications & sound'],
    ['/settings?q=quiet', '/settings?q=quiet', null],
    ['/settings#settings-Sound', '/settings/notify', 'Notifications & sound', '#settings-Sound'],
    ['/settings#settings-Data', '/settings/data', 'Your data', '#settings-Data'],
    ['/settings#settings-Legal', '/settings/privacy', 'Privacy & terms', '#settings-Legal'],
    ['/settings#settings-App', '/settings/about', 'App & updates', '#settings-App'],
    ['/settings#settings-Advanced', '/settings/integrations/capture-key', null, '#settings-Advanced'],
    ['/settings/bogus', '/settings', 'Appearance'],
    ['/settings/integrations/nope', '/settings/integrations', 'Integrations'],
  ]
  for (const [from, to, head, anchor] of cases) {
    const { ctx, page, errors } = await open(from)
    const h = head ? await page.locator('.st-page-head h2').innerText().catch(() => '') : null
    const inView = anchor ? await page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.top >= -2 && r.top < innerHeight }, anchor) : true
    const extra = from.includes('?q=') ? (await page.locator('.st-results .st-row[data-st-key="Quiet hours"]').count()) === 1 : true
    check(`4 ${from} → ${to}${head ? ` (${head})` : ''}${anchor ? `, ${anchor} in view` : ''}`, path_(page) === to && (!head || h === head) && inView && extra && errors.length === 0, `${path_(page)} · ${h ?? ''} · ${errors.join(' | ')}`)
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open('/settings?google=error&reason=denied')
    check('4 ?google= (back from Google) lands on Integrations › Google with its word', path_(page) === '/settings/integrations/google' && (await page.locator('.st-provider [role="status"]').count()) === 1 && errors.length === 0, path_(page))
    await ctx.close()
  }
}

// ── 5 · the phone: a list that drills in ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings', { view: PHONE, theme })
  const rows = await page.locator('.st-list-row').count()
  check(`5 ${theme} phone: the list — Account card on top, then 10 categories with icons`, (await page.locator('.st-me').count()) === 1 && rows === 10 && (await page.locator('.st-list-row svg').count()) === 20, rows)
  check(`5 ${theme} phone: the rows say where things stand (Calendar & time · Cairo)`, /Cairo/.test(await page.locator('.st-list-row', { hasText: 'Calendar & time' }).innerText()))
  await shot(page, `5-phone-list-${theme}`)
  await page.locator('.st-list-row', { hasText: 'Capture & AI' }).click()
  await sleep(500)
  check(`5 ${theme} phone: a tap opens the category's own page, ‹ Settings above it`, path_(page) === '/settings/capture' && (await page.locator('.st-page-head h2').innerText()) === 'Capture & AI' && (await page.locator('.st-phone > .kf-backlink').innerText()).includes('Settings'))
  check(`5 ${theme} phone: no sideways scroll`, await noHScroll(page))
  await shot(page, `5-phone-capture-${theme}`)
  await page.locator('.st-phone > .kf-backlink').click()
  await sleep(500)
  check(`5 ${theme} phone: ‹ Settings goes back to the list`, path_(page) === '/settings' && (await page.locator('.st-list-row').count()) === 10)
  await page.locator('.st-me').click()
  await sleep(500)
  check(`5 ${theme} phone: the Account card opens Account, danger zone and all`, path_(page) === '/settings/account' && (await page.locator('.st-sec.is-danger').count()) === 1)
  await shot(page, `5-phone-account-${theme}`)
  await page.goto(`${BASE}/settings/integrations`, { waitUntil: 'networkidle' })
  await sleep(400)
  await page.locator('.st-row.is-link[data-st-key="GitHub"]').click()
  await sleep(400)
  check(`5 ${theme} phone: Integrations › GitHub opens its page, ‹ Integrations above it`, path_(page) === '/settings/integrations/github' && (await page.locator('.kf-backlink', { hasText: 'Integrations' }).count()) === 1)
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await sleep(300)
  await page.locator('.st-search input').fill('time')
  await sleep(500)
  check(`5 ${theme} phone: search shows the rows under the field`, (await page.locator('.st-results .st-row[data-st-key="Time zone"]').count()) === 1 && (await page.locator('.st-list-row').count()) === 0)
  await shot(page, `5-phone-search-${theme}`)
  check(`5 ${theme} phone: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 6 · the phone's nav icons ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings', { view: PHONE, theme })
  check(`6 ${theme} tab bar: each tab wears a kf line icon`, (await page.locator('nav.app-tabbar .kf-tab svg').count()) >= 4)
  await page.getByRole('button', { name: 'More' }).click()
  await sleep(500)
  const sheet = page.getByRole('dialog', { name: 'More' })
  const links = await sheet.locator('a').count()
  const icons = await sheet.locator('a > svg').count()
  const imgs = await sheet.locator('img').count()
  check(`6 ${theme} More sheet: every row a kf line icon (${links}), no watercolour images or dots`, links === 13 && icons === 13 && imgs === 0, `${icons}/${links} icons, ${imgs} images`)
  // Same icon per destination as the desktop sidebar: compare the glyph markup.
  const sheetGlyphs = await sheet.locator('a').evaluateAll((as) => Object.fromEntries(as.map((a) => [a.getAttribute('href'), a.querySelector('svg')?.innerHTML])))
  check(`6 ${theme} More sheet: Search · Chat · Sign out wear icons too`, (await sheet.locator('button > svg').count()) === 3)
  check(`6 ${theme} More sheet: the page you're on (Settings) is lit`, (await sheet.locator('a[aria-current="page"]').getAttribute('href')) === '/settings')
  await shot(page, `6-phone-more-${theme}`)
  await ctx.close()
  const d = await open('/today', { theme })
  const sideGlyphs = await d.page.locator('a.kf-side-row').evaluateAll((as) => Object.fromEntries(as.map((a) => [a.getAttribute('href'), a.querySelector('.kf-nav-icon svg')?.innerHTML]).filter(([, g]) => g)))
  const shared = Object.keys(sideGlyphs).filter((h) => h in sheetGlyphs)
  const differ = shared.filter((h) => sideGlyphs[h] !== sheetGlyphs[h])
  check(`6 ${theme} same icon per destination as the sidebar (${shared.length} shared)`, shared.length >= 10 && differ.length === 0, differ.join(', '))
  check(`6 ${theme} no page errors`, errors.length === 0 && d.errors.length === 0, [...errors, ...d.errors].join(' | '))
  await d.ctx.close()
}

// ── 7 · day and night at 100 / 125 / 150% (the drawing's frames) ──
for (const theme of ['day', 'night']) {
  for (const scale of [1, 1.25, 1.5]) {
    const tag = `${theme}-${scale * 100}`
    for (const cat of ['calendar', 'notify', 'capture', 'account']) {
      const { ctx, page, errors } = await open(`/settings/${cat}`, { theme, scale })
      const nav = await page.locator('.st-nav').boundingBox()
      const main = await page.locator('.st-main-in').boundingBox()
      check(`7 ${tag} ${cat}: two panes side by side, no sideways scroll`, nav && main && main.x >= nav.x + nav.width - 1 && (await noHScroll(page)), JSON.stringify({ nav, main }))
      if (cat === 'calendar' || (cat === 'capture' && scale === 1.5) || (cat === 'notify' && theme === 'night')) await shot(page, `7-desktop-${cat}-${tag}`)
      // The list reaches its last category at every size (it scrolls on its own when it must).
      const last = page.locator('.st-nav-item', { hasText: 'App & updates' })
      await last.scrollIntoViewIfNeeded()
      check(`7 ${tag} ${cat}: the list's last category is reachable`, await last.isVisible())
      // The wheel over the list still moves something (the list or the page) — never swallowed.
      const nb = await page.locator('.st-nav').boundingBox()
      await page.mouse.move(nb.x + nb.width / 2, Math.min(nb.y + 300, 760))
      const before = await page.evaluate(() => [document.querySelector('.app-main-content').scrollTop, document.querySelector('.st-nav-in').scrollTop])
      await page.mouse.wheel(0, 600)
      await sleep(300)
      const after = await page.evaluate(() => [document.querySelector('.app-main-content').scrollTop, document.querySelector('.st-nav-in').scrollTop])
      const canScroll = await page.evaluate(() => { const m = document.querySelector('.app-main-content'); const n = document.querySelector('.st-nav-in'); return m.scrollHeight > m.clientHeight + 1 || n.scrollHeight > n.clientHeight + 1 })
      check(`7 ${tag} ${cat}: the wheel over the list scrolls (list or page)`, !canScroll || after[0] > before[0] || after[1] > before[1], `${before} → ${after}`)
      check(`7 ${tag} ${cat}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
