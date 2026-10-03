// Capture from anywhere, on the REAL app signed in against a MOCKED backend (the task-sheet recipe,
// docs/log/assets/task-sheet/verify.mjs): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, and Playwright answers every REST
// and function call. Writes are recorded so each one can be checked.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Covers: the phone Settings capture row + card (create / copy / how-to / turn off), the desktop
// Integrations card, the /share route (Android share intent + PWA share target) and ?file=1 filing.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5251'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CAPTURE_URL = 'http://127.0.0.1:9/functions/v1/capture'

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const T0 = '2026-10-01T09:00:00.000Z'
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T0, updated_at: T0 }
const KEY_ROW = { id: 'c0000000-0000-4000-8000-000000000001', created_at: '2026-10-03T09:00:00.000Z', updated_at: '2026-10-03T09:00:00.000Z', last_used_at: null }
const QUEUED = {
  id: 'i0000000-0000-4000-8000-000000000009', user_id: UID, kind: 'text', raw_text: 'dentist friday 3pm', transcript: null, ai_parse: null, confidence: null,
  status: 'pending', filed_task_id: null, payload: { source: 'capture', needs_parse: true }, snoozed_until: null, deleted_at: null,
  created_at: '2026-10-02T20:00:00.000Z', updated_at: '2026-10-02T20:00:00.000Z',
}
const PARSE = { kind: 'task', cleaned_text: 'dentist friday 3pm', title: 'Dentist', domain_id: null, project_id: null, due_at: '2026-10-09T12:00:00.000Z', duration_min: null, priority: null, reminder_offset_min: null, confidence: 0.92 }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 860 } }

async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: { app_settings: [SETTINGS], capture_keys: [], inbox_items: [], ...(o.rows ?? {}) }, writes: [], urls: [], parses: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    state.urls.push(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/parse-capture')) {
      state.parses.push(req.postDataJSON())
      return r.fulfill({ json: PARSE })
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body })
      if (table === 'capture_keys') state.rows.capture_keys = req.method() === 'DELETE' ? [] : [KEY_ROW]
      // The ?file=1 claim: a conditional PATCH that returns the row it took.
      if (req.method() === 'PATCH' && table === 'inbox_items' && url.search.includes('needs_parse')) {
        return r.fulfill({ status: 200, json: [{ id: QUEUED.id }] })
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
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const clip = (page) => page.evaluate(() => navigator.clipboard.readText())
const rowValue = async (page) => (await page.getByText('Capture API', { exact: true }).locator('xpath=..').innerText()).replace('Capture API', '').trim()
const card = (page) => page.getByText('External capture endpoint', { exact: true }).locator('xpath=..')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

// ── 1. Phone Settings: the row and the card, from no key to a key and back ──
{
  const { ctx, page, errors, state } = await open('/settings')
  check('phone: Capture API row reads the real state (no key)', (await rowValue(page)) === 'Not set up', await rowValue(page))
  await card(page).scrollIntoViewIfNeeded()
  check('phone: capture card is on the Settings page', await page.getByText('External capture endpoint', { exact: true }).isVisible())
  check('phone: card says not set up yet', await card(page).getByText('not set up yet').isVisible())
  await shot(page, 'phone-1-no-key')

  await card(page).getByRole('button', { name: 'Create key' }).click()
  await sleep(900)
  const key = (await card(page).innerText()).match(/kf_[A-Za-z0-9_-]{43}/)?.[0] ?? ''
  check('phone: Create key shows a kf_ key once', !!key, key.slice(0, 7) + '…')
  const up = state.writes.find((w) => w.table === 'capture_keys' && w.method === 'POST')
  const hash = Array.isArray(up?.body) ? up.body[0]?.key_hash : up?.body?.key_hash
  check('phone: only the key\'s SHA-256 is saved', hash === sha256(key), hash)
  check('phone: the key never appears in any request address', !state.urls.some((u) => key && u.includes(key)))
  check('phone: Capture API row turns On', (await rowValue(page)) === 'On', await rowValue(page))
  check('phone: New key / Turn off offered', (await card(page).getByRole('button', { name: 'New key' }).isVisible()) && (await card(page).getByRole('button', { name: 'Turn off' }).isVisible()))
  await card(page).getByRole('button', { name: 'Copy key' }).click()
  await sleep(500)
  check('phone: Copy key puts the key on the clipboard', (await clip(page)) === key)
  check('phone: Copy key confirms with a toast', (await toasts(page)).some((t) => t.includes('Key copied')), (await toasts(page)).join(' | '))
  await shot(page, 'phone-2-key-shown')

  await card(page).getByText('How to send things here').click()
  await sleep(400)
  const how = await card(page).innerText()
  check('phone: how-to shows the endpoint address', how.includes(`POST ${CAPTURE_URL}`))
  check('phone: how-to covers share sheet, iPhone, Android apps, computer, ?file=1', ['Android share sheet', 'iPhone · Shortcuts', 'HTTP Shortcuts or Tasker', 'Computer', '?file=1'].every((s) => how.includes(s)))
  check('phone: how-to curl line keeps the key in the header', how.includes(`curl -X POST ${CAPTURE_URL} -H "Authorization: Bearer <your key>"`))
  await card(page).getByRole('button', { name: 'Copy address' }).click()
  await sleep(400)
  check('phone: Copy address copies the endpoint', (await clip(page)) === CAPTURE_URL, await clip(page))
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check('phone: no horizontal scroll at 390 with the how-to open', wide <= 390, wide)
  await card(page).getByText('How to send things here').scrollIntoViewIfNeeded()
  await shot(page, 'phone-3-how-to')
  await card(page).screenshot({ path: path.join(OUT, 'phone-3-how-to-card.png') })

  await card(page).getByRole('button', { name: 'Turn off' }).click()
  await sleep(900)
  const del = state.writes.find((w) => w.table === 'capture_keys' && w.method === 'DELETE')
  check('phone: Turn off deletes the key row', !!del && del.query.includes(`id=eq.${KEY_ROW.id}`), del?.query)
  check('phone: row back to Not set up', (await rowValue(page)) === 'Not set up', await rowValue(page))
  check('phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Phone, Night: the card reads in the dark theme ──
{
  const { ctx, page, errors } = await open('/settings', { theme: 'night' })
  await card(page).getByText('How to send things here').click()
  await sleep(300)
  await card(page).screenshot({ path: path.join(OUT, 'phone-4-night-card.png') })
  check('phone night: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Desktop Integrations: the same card ──
{
  const { ctx, page, errors } = await open('/settings', { view: desktop, rows: { capture_keys: [{ ...KEY_ROW, last_used_at: '2026-10-03T08:00:00.000Z' }] } })
  await page.getByText('Integrations', { exact: true }).first().click()
  await sleep(600)
  check('desktop: card shows the key state', (await card(page).innerText()).includes('last used 3 Oct'), (await card(page).innerText()).split('\n')[1])
  await card(page).getByText('How to send things here').click()
  await sleep(300)
  await shot(page, 'desktop-integrations')
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4. /share — what the Android app's share intent (and the PWA share target) opens ──
{
  const { ctx, page, errors, state } = await open('/share?text=Great%20article%20https%3A%2F%2Fx.test%2Fa&title=Great%20article')
  await sleep(1500)
  check('share: lands on the Inbox', new URL(page.url()).pathname === '/inbox', page.url())
  const rows = state.writes.filter((w) => w.table === 'inbox_items' && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
  check('share: one Inbox item with the shared text, subject not repeated', rows.length === 1 && rows[0].raw_text === 'Great article https://x.test/a', JSON.stringify(rows.map((r) => r.raw_text)))
  await shot(page, 'share-inbox')
  check('share: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 5. ?file=1 — a queued endpoint capture is claimed, parsed as of when it was sent and filed ──
{
  const { ctx, page, errors, state } = await open('/today', { rows: { inbox_items: [QUEUED] } })
  await sleep(2500)
  const claim = state.writes.find((w) => w.method === 'PATCH' && w.table === 'inbox_items' && w.query.includes('needs_parse'))
  check('file=1: claimed with a conditional update', !!claim && claim.query.includes(`id=eq.${QUEUED.id}`) && claim.query.includes('payload->>needs_parse=eq.true'), claim?.query)
  check('file=1: claim drops only the flag', JSON.stringify(claim?.body) === JSON.stringify({ payload: { source: 'capture' } }), JSON.stringify(claim?.body))
  check('file=1: parsed once, as of the capture time', state.parses.length === 1 && state.parses[0]?.context?.today === QUEUED.created_at, JSON.stringify(state.parses.map((p) => p.context?.today)))
  const tasks = state.writes.filter((w) => w.table === 'tasks' && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
  check('file=1: a task with its date is created', tasks.some((t) => t.title === 'Dentist' && t.due_at === PARSE.due_at), JSON.stringify(tasks.map((t) => [t.title, t.due_at])))
  const filed = state.writes.filter((w) => w.table === 'inbox_items' && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).find((r) => r.id === QUEUED.id)
  check('file=1: the Inbox item is marked filed, payload kept', filed?.status === 'filed' && JSON.stringify(filed?.payload) === JSON.stringify({ source: 'capture' }), JSON.stringify(filed && { status: filed.status, payload: filed.payload }))
  check('file=1: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
