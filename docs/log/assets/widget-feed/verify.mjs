// Settings → Windows desktop — Widget links (widget-feed, migration 0090), on the REAL app signed in against a
// MOCKED backend (docs/log/assets/mcp-full/verify.mjs's recipe): the dev server runs with --mode mock
// (VITE_SUPABASE_URL=http://127.0.0.1:9, nothing listens there), a made-up session sits in localStorage, and
// Playwright answers every REST call and records the writes.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Covers: no links → "No Widget links yet"; Create link → one insert of a kf_w_ token's SHA-256 (never the
// token), read-only by default, the link shown once with Copy; Allow ticking on before Create → can_tick true;
// a listed link's ticking switch → an update of can_tick; Revoke asks first, then sets revoked_at and the row
// goes; search finds the card; the phone card at 390 (no sideways scroll), day and night.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5340'
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
const T0 = '2026-10-01T09:00:00.000Z'
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T0, updated_at: T0 }
const LINK = { id: 'c0000000-0000-4000-8000-0000000000b1', label: 'Work PC', can_tick: false, created_at: '2026-10-20T08:00:00.000Z', last_used_at: '2026-10-28T19:00:00.000Z' }

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
  const state = { rows: { app_settings: [SETTINGS], widget_links: [], ...(o.rows ?? {}) }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body })
      if (table === 'widget_links') {
        const sent = Array.isArray(body) ? body[0] : body
        const id = /id=eq\.([0-9a-f-]+)/.exec(decodeURIComponent(url.search))?.[1]
        if (req.method() === 'POST') state.rows.widget_links.push({ id: sent.id, label: sent.label, can_tick: sent.can_tick, created_at: new Date().toISOString(), last_used_at: null })
        else if (sent?.revoked_at) state.rows.widget_links = state.rows.widget_links.filter((l) => l.id !== id)
        else state.rows.widget_links = state.rows.widget_links.map((l) => (l.id === id ? { ...l, ...sent } : l))
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (table === 'widget_links') state.reads = (state.reads ?? 0) + 1
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
const card = (page) => page.locator('#settings-WindowsDesktop')
const isOn = (loc) => loc.evaluate((el) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true')
const toggle = (page, label) => card(page).getByRole('switch', { name: label }).or(card(page).getByLabel(label)).first()
const shotAt = async (page, locator, name) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(250)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

// ── 1. Desktop: no links → Create (read only) → the link shown once, Copy ──
{
  const { ctx, page, errors, state } = await open('/settings/about', { view: desktop })
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('desktop: the Windows desktop card is in App & updates', text.includes('Windows desktop') && text.includes('Rainmeter'), text.slice(0, 160))
  check('desktop: no links yet', text.includes('No Widget links yet'))
  check('desktop: Allow ticking starts off', !(await isOn(toggle(page, 'Allow ticking for the new link'))))
  await shotAt(page, card(page), 'desktop-1-empty')
  await card(page).getByLabel('Widget link name').fill('Home PC')
  await card(page).getByRole('button', { name: 'Create link' }).click()
  await sleep(900)
  const ins = state.writes.filter((w) => w.table === 'widget_links' && w.method === 'POST')
  const sent = Array.isArray(ins[0]?.body) ? ins[0].body[0] : ins[0]?.body
  check('desktop: Create → one insert', ins.length === 1, JSON.stringify(ins))
  check('desktop: …of id, token_hash, label, can_tick only', JSON.stringify(Object.keys(sent ?? {}).sort()) === JSON.stringify(['can_tick', 'id', 'label', 'token_hash']), JSON.stringify(sent))
  check('desktop: …read only, named Home PC', sent?.can_tick === false && sent?.label === 'Home PC', JSON.stringify(sent))
  const shown = (await card(page).locator('.st-mono-box').innerText()).trim()
  const token = /[?&]t=(kf_w_[A-Za-z0-9_-]{43})$/.exec(shown)?.[1]
  check('desktop: the link is shown once: …/functions/v1/widget?t=kf_w_<43>', !!token && shown.startsWith('http://127.0.0.1:9/functions/v1/widget?t='), shown)
  check('desktop: only the token’s SHA-256 was sent, never the token', !!token && sent?.token_hash === crypto.createHash('sha256').update(token).digest('hex') && !JSON.stringify(state.writes).includes(token))
  await card(page).getByRole('button', { name: 'Copy link' }).click()
  await sleep(300)
  check('desktop: Copy link puts the link on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === shown)
  check('desktop: the new link is listed, read only', (await card(page).innerText()).includes('Home PC') && (await card(page).innerText()).includes('read only'))
  await shotAt(page, card(page), 'desktop-2-created')
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Desktop: Allow ticking for a new link; a listed link's switch; Revoke with its confirm ──
{
  const { ctx, page, errors, state } = await open('/settings/about', { view: desktop, rows: { widget_links: [LINK] } })
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('list: label, last used, read only', text.includes('Work PC') && /last used 28 Oct/.test(text) && text.includes('read only'), text.slice(0, 300))
  await toggle(page, 'Allow ticking with Work PC').click()
  await sleep(900)
  const up = state.writes.filter((w) => w.table === 'widget_links' && w.method === 'PATCH')
  check('list: the switch → one update of can_tick on that link', up.length === 1 && up[0].query.includes(`id=eq.${LINK.id}`) && JSON.stringify(up[0].body) === '{"can_tick":true}', JSON.stringify(up))
  check('list: it reads on after the refetch, “can tick tasks off”', (await isOn(toggle(page, 'Allow ticking with Work PC'))) && (await card(page).innerText()).includes('can tick tasks off'))
  await toggle(page, 'Allow ticking for the new link').click()
  await card(page).getByRole('button', { name: 'Create link' }).click()
  await sleep(900)
  const ins = state.writes.find((w) => w.table === 'widget_links' && w.method === 'POST')
  const sent = Array.isArray(ins?.body) ? ins.body[0] : ins?.body
  check('create with Allow ticking on → can_tick true', sent?.can_tick === true, JSON.stringify(sent))
  await card(page).getByRole('button', { name: 'Revoke' }).first().click()
  await sleep(400)
  check('Revoke asks first', (await page.getByText('Revoke “Work PC”?').count()) === 1)
  await shotAt(page, page.getByText('Revoke “Work PC”?'), 'desktop-3-revoke-confirm')
  check('…and has written nothing yet', state.writes.filter((w) => w.body?.revoked_at).length === 0)
  await page.getByRole('button', { name: 'Revoke', exact: true }).last().click()
  await sleep(900)
  const rv = state.writes.filter((w) => w.body?.revoked_at)
  check('Revoke → revoked_at set on that link', rv.length === 1 && rv[0].query.includes(`id=eq.${LINK.id}`) && !Number.isNaN(Date.parse(rv[0].body.revoked_at)), JSON.stringify(rv))
  check('…and the row is gone from the list', !(await card(page).innerText()).includes('Work PC'))
  check('list: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Settings search finds it ──
{
  const { ctx, page, errors } = await open('/settings', { view: desktop, rows: { widget_links: [LINK] } })
  const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
  await search.fill('rainmeter')
  await sleep(700)
  const body = await page.locator('main').innerText().catch(() => page.locator('body').innerText())
  check('search “rainmeter” finds the Widget link rows', body.includes('Work PC') || body.includes('New link'), body.slice(0, 300))
  check('search: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4. Phone at 390, day and night: the card, no sideways scroll ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings/about', { rows: { widget_links: [{ ...LINK, can_tick: true }] }, theme })
  await card(page).scrollIntoViewIfNeeded()
  check(`phone ${theme}: the link with ticking on`, await isOn(toggle(page, 'Allow ticking with Work PC')))
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
