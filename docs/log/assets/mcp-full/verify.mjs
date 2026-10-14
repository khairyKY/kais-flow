// AI assistants card — the Journal / People switches (mcp-full, migration 0080), on the REAL app signed
// in against a MOCKED backend (docs/log/assets/mcp/verify.mjs's recipe): the dev server runs with
// --mode mock (VITE_SUPABASE_URL=http://127.0.0.1:9, nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST call and records the writes.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Covers: an existing key shows both switches off; Journal on → the key's row updated with
// scopes ['journal']; People on → ['journal','people']; off again; a new key is made with scopes [];
// no key → no switches; the phone card at 390 (no sideways scroll), day and night.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5261'
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
const KEY_ROW = { id: 'c0000000-0000-4000-8000-0000000000a1', scope: 'read_write', scopes: [], created_at: '2026-10-03T20:00:00.000Z', updated_at: '2026-10-03T20:00:00.000Z', last_used_at: null }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 900 } }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? phone), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem('kf-download-bar-dismissed', '1')
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: { app_settings: [SETTINGS], mcp_keys: [], ...(o.rows ?? {}) }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body })
      if (table === 'mcp_keys') {
        const sent = Array.isArray(body) ? body[0] : body
        const was = state.rows.mcp_keys[0] ?? KEY_ROW
        state.rows.mcp_keys = req.method() === 'DELETE' ? [] : [{ ...was, ...(sent?.scope ? { scope: sent.scope } : {}), ...(sent?.scopes ? { scopes: sent.scopes } : {}) }]
      }
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
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const card = (page) => page.getByText('AI assistants (MCP)', { exact: true }).locator('xpath=ancestor::section[1]')
const toggle = (page, label) => card(page).getByRole('switch', { name: label }).or(card(page).getByRole('button', { name: label })).or(card(page).getByLabel(label)).first()
const isOn = (loc) => loc.evaluate((el) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true')
const shotAt = async (page, locator, name) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(250)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

// ── 1. Desktop: an existing key, both switches off → Journal on → People on → Journal off ──
{
  const { ctx, page, errors, state } = await open('/settings', { view: desktop, rows: { mcp_keys: [KEY_ROW] } })
  await page.getByText('Integrations', { exact: true }).first().click()
  await sleep(700)
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('desktop: Journal and People rows under the key', /Journal/.test(text) && /People/.test(text))
  check('desktop: both off for an existing key without scopes', !(await isOn(toggle(page, 'Let this key reach my journal'))) && !(await isOn(toggle(page, 'Let this key reach my people'))))
  check('desktop: the off help says the assistant never sees them', text.includes('Off: the assistant never sees your journal') && text.includes('Off: the assistant never sees the people you keep'))
  check('desktop: the footnote says a new key starts with both off', text.includes('starts with Journal and People off'))
  await shotAt(page, card(page), 'desktop-1-switches-off')
  await toggle(page, 'Let this key reach my journal').click()
  await sleep(900)
  const w1 = state.writes.filter((w) => w.table === 'mcp_keys' && w.method === 'PATCH')
  check('desktop: Journal on → one update of the key row', w1.length === 1 && w1[0].query.includes(`id=eq.${KEY_ROW.id}`), JSON.stringify(w1))
  check('desktop: …with scopes ["journal"]', JSON.stringify(w1[0]?.body) === JSON.stringify({ scopes: ['journal'] }), JSON.stringify(w1[0]?.body))
  check('desktop: the switch reads on after the refetch', await isOn(toggle(page, 'Let this key reach my journal')))
  check('desktop: the on help says it can read and write the journal', (await card(page).innerText()).includes('This key can read and write your journal entries'))
  await toggle(page, 'Let this key reach my people').click()
  await sleep(900)
  const w2 = state.writes.filter((w) => w.table === 'mcp_keys' && w.method === 'PATCH')
  check('desktop: People on → scopes ["journal","people"]', JSON.stringify(w2[1]?.body) === JSON.stringify({ scopes: ['journal', 'people'] }), JSON.stringify(w2[1]?.body))
  await shotAt(page, card(page), 'desktop-2-switches-on')
  await toggle(page, 'Let this key reach my journal').click()
  await sleep(900)
  const w3 = state.writes.filter((w) => w.table === 'mcp_keys' && w.method === 'PATCH')
  check('desktop: Journal off → scopes ["people"]', JSON.stringify(w3[2]?.body) === JSON.stringify({ scopes: ['people'] }), JSON.stringify(w3[2]?.body))
  // New key: the upsert sends scopes [] — a fresh key reaches neither.
  await card(page).getByRole('button', { name: 'New key' }).click()
  await sleep(900)
  const up = state.writes.find((w) => w.table === 'mcp_keys' && w.method === 'POST')
  const sent = Array.isArray(up?.body) ? up.body[0] : up?.body
  check('desktop: New key resets the scopes to []', Array.isArray(sent?.scopes) && sent.scopes.length === 0, JSON.stringify(sent))
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. No key: no switches (they belong to a key) ──
{
  const { ctx, page, errors } = await open('/settings', { view: desktop })
  await page.getByText('Integrations', { exact: true }).first().click()
  await sleep(700)
  const text = await card(page).innerText()
  check('no key: no Journal / People switches', !text.includes('Let this key reach') && (await card(page).getByLabel('Let this key reach my journal').count()) === 0)
  check('no key: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Phone at 390, day and night: the card with its switches, no sideways scroll ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings', { rows: { mcp_keys: [{ ...KEY_ROW, scopes: ['people'] }] }, theme })
  await card(page).scrollIntoViewIfNeeded()
  check(`phone ${theme}: People on, Journal off`, (await isOn(toggle(page, 'Let this key reach my people'))) && !(await isOn(toggle(page, 'Let this key reach my journal'))))
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`phone ${theme}: no sideways scroll`, wide <= 0, wide)
  const box = await toggle(page, 'Let this key reach my people').boundingBox()
  check(`phone ${theme}: the switch is laid out (the kit Toggle, 52×32, as every Settings switch)`, !!box && box.height > 0, JSON.stringify(box))
  await shotAt(page, card(page).getByText('Journal', { exact: true }).first(), `phone-${theme}-switches`)
  check(`phone ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
