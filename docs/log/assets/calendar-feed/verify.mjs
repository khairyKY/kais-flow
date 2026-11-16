// Settings → Calendar & time → Your calendar link (calendar-feed, migration 0096, v1.6.4 F5), on the REAL app signed in against a
// MOCKED backend (docs/log/assets/widget-feed/verify.mjs's recipe): the dev server runs with --mode mock
// (VITE_SUPABASE_URL=http://127.0.0.1:9, nothing listens there), a made-up session sits in localStorage, and
// Playwright answers every REST call and records the writes.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Covers: no links → "No calendar links yet"; Create link → one insert of a kf_c_ token's SHA-256 (never the token),
// tasks and titles on by default, the webcal:// and https:// links shown once with Copy; "Show titles" off and
// "Include scheduled tasks" off → sent as false; a listed link (label, last used, busy only); Revoke asks first, then
// sets revoked_at and the row goes; "How to add it" names the three apps; search finds the card; the phone card at 390
// (no sideways scroll), day and night.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5255'
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
const UID = '00000000-0000-4000-8000-00000000cf05'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const T0 = '2026-10-01T09:00:00.000Z'
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T0, updated_at: T0 }
const LINK = { id: 'c0000000-0000-4000-8000-0000000000b1', label: 'Work laptop', include_tasks: true, titles: false, created_at: '2026-11-10T08:00:00.000Z', last_used_at: '2026-11-15T19:00:00.000Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 900 } }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? phone), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem('kf-download-bar-dismissed', '1')
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: { app_settings: [SETTINGS], calendar_feed_links: [], ...(o.rows ?? {}) }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body })
      if (table === 'calendar_feed_links') {
        const sent = Array.isArray(body) ? body[0] : body
        const id = /id=eq\.([0-9a-f-]+)/.exec(decodeURIComponent(url.search))?.[1]
        if (req.method() === 'POST') state.rows.calendar_feed_links.push({ id: sent.id, label: sent.label, include_tasks: sent.include_tasks, titles: sent.titles, created_at: new Date().toISOString(), last_used_at: null })
        else if (sent?.revoked_at) state.rows.calendar_feed_links = state.rows.calendar_feed_links.filter((l) => l.id !== id)
        else state.rows.calendar_feed_links = state.rows.calendar_feed_links.map((l) => (l.id === id ? { ...l, ...sent } : l))
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (table === 'calendar_feed_links') state.reads = (state.reads ?? 0) + 1
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const card = (page) => page.locator('#settings-CalendarFeed')
const isOn = (loc) => loc.evaluate((el) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true')
const toggle = (page, label) => card(page).getByRole('switch', { name: label }).or(card(page).getByLabel(label)).first()
const shotAt = async (page, locator, name) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(250)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const body = (w) => (Array.isArray(w?.body) ? w.body[0] : w?.body)

// ── 1. Desktop: no links → Create (tasks and titles on) → the two links shown once, Copy ──
{
  const { ctx, page, errors, state } = await open('/settings/calendar', { view: desktop })
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('desktop: the card is in Calendar & time', text.includes('Your calendar link') && text.includes('Anyone with the link'), text.slice(0, 160))
  check('desktop: no links yet', text.includes('No calendar links yet'))
  check('desktop: tasks and titles start on', (await isOn(toggle(page, 'Include scheduled tasks in the new link'))) && (await isOn(toggle(page, 'Show titles in the new link'))))
  await shotAt(page, card(page), 'desktop-1-empty')
  await card(page).getByLabel('Calendar link name').fill('Phone')
  await card(page).getByRole('button', { name: 'Create link' }).click()
  await sleep(900)
  const ins = state.writes.filter((w) => w.table === 'calendar_feed_links' && w.method === 'POST')
  const sent = body(ins[0])
  check('desktop: Create → one insert', ins.length === 1, JSON.stringify(ins))
  check('desktop: …of id, token_hash, label, include_tasks, titles only', JSON.stringify(Object.keys(sent ?? {}).sort()) === JSON.stringify(['id', 'include_tasks', 'label', 'titles', 'token_hash']), JSON.stringify(sent))
  check('desktop: …named Phone, tasks and titles on', sent?.label === 'Phone' && sent?.include_tasks === true && sent?.titles === true, JSON.stringify(sent))
  const shown = (await card(page).locator('.st-mono-box').innerText()).trim()
  const token = /[?&]t=(kf_c_[A-Za-z0-9_-]{43})$/.exec(shown)?.[1]
  check('desktop: the link is shown once, webcal://…/functions/v1/calendar-feed?t=kf_c_<43>', !!token && shown.startsWith('webcal://127.0.0.1:9/functions/v1/calendar-feed?t='), shown)
  check('desktop: only the token SHA-256 was sent, never the token', !!token && sent?.token_hash === crypto.createHash('sha256').update(token).digest('hex') && !JSON.stringify(state.writes).includes(token))
  await card(page).getByRole('button', { name: 'Copy webcal:// link' }).click()
  await sleep(300)
  check('desktop: Copy webcal:// puts it on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === shown)
  await card(page).getByRole('button', { name: 'Copy https:// link' }).click()
  await sleep(300)
  check('desktop: Copy https:// puts the https link on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === shown.replace('webcal://', 'http://'))
  const listed = await card(page).innerText()
  check('desktop: the new link is listed: Phone, not used yet, with titles, with tasks', listed.includes('Phone') && listed.includes('not used yet') && listed.includes('with titles') && listed.includes('with tasks'), listed.slice(0, 300))
  await shotAt(page, card(page), 'desktop-2-created')
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Desktop: titles off + tasks off for a new link; a listed link; Revoke with its confirm; the help ──
{
  const { ctx, page, errors, state } = await open('/settings/calendar', { view: desktop, rows: { calendar_feed_links: [LINK] } })
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('list: label, last used, busy only, with tasks', text.includes('Work laptop') && /last used 15 Nov/.test(text) && text.includes('busy only') && text.includes('with tasks'), text.slice(0, 300))
  await toggle(page, 'Show titles in the new link').click()
  await toggle(page, 'Include scheduled tasks in the new link').click()
  await card(page).getByRole('button', { name: 'Create link' }).click()
  await sleep(900)
  const sent = body(state.writes.find((w) => w.table === 'calendar_feed_links' && w.method === 'POST'))
  check('create with both off → include_tasks false, titles false', sent?.include_tasks === false && sent?.titles === false, JSON.stringify(sent))
  await card(page).getByText('How to add it').click()
  const help = await card(page).innerText()
  check('help names Apple Calendar, Outlook and Google Calendar, and Google’s delay', ['Apple Calendar', 'File › New Calendar Subscription', 'Outlook', 'Add calendar › From internet', 'Google Calendar', 'Other calendars › From URL', 'hours'].every((t) => help.includes(t)), help.slice(-500))
  await card(page).getByRole('button', { name: 'Revoke' }).first().click()
  await sleep(400)
  check('Revoke asks first', (await page.getByText('Revoke “Work laptop”?').count()) === 1)
  await shotAt(page, page.getByText('Revoke “Work laptop”?'), 'desktop-3-revoke-confirm')
  check('…and has written nothing yet', state.writes.filter((w) => w.body?.revoked_at).length === 0)
  await page.getByRole('button', { name: 'Revoke', exact: true }).last().click()
  await sleep(900)
  const rv = state.writes.filter((w) => w.body?.revoked_at)
  check('Revoke → revoked_at set on that link', rv.length === 1 && rv[0].query.includes(`id=eq.${LINK.id}`) && !Number.isNaN(Date.parse(rv[0].body.revoked_at)), JSON.stringify(rv))
  check('…and the row is gone from the list', !(await card(page).innerText()).includes('Work laptop'))
  check('list: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Settings search finds it ──
{
  const { ctx, page, errors } = await open('/settings', { view: desktop, rows: { calendar_feed_links: [LINK] } })
  const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
  await search.fill('webcal')
  await sleep(700)
  const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText())
  check('search “webcal” finds the calendar link rows', text.includes('Work laptop') || text.includes('New link'), text.slice(0, 300))
  check('search: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4. Phone at 390, day and night: the card, no sideways scroll ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings/calendar', { rows: { calendar_feed_links: [LINK] }, theme })
  await card(page).scrollIntoViewIfNeeded()
  check(`phone ${theme}: the link is listed`, (await card(page).innerText()).includes('Work laptop'))
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`phone ${theme}: no sideways scroll`, wide <= 0, wide)
  await shotAt(page, card(page), `phone-${theme}`)
  check(`phone ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
