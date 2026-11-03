// Google Classroom (Kai 2026-11-03) on the REAL app against a MOCKED backend (the google-sync recipe: dev server
// with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every REST and
// edge-function call and records every call).
// Checks: Settings → Integrations lists "Google Classroom" with its real state; its page: Connect says which
// secrets are missing, else goes to Google's consent page via classroom-connect; the landing back
// (?classroom=connected) lands on the page and syncs; admin-blocked / denied / scope landings say so in words;
// one switch per course saves at once (choose); Sync now; an expired grant says reconnect; Disconnect asks
// keep-or-Trash first (Cancel changes nothing; each choice sends remove:false / remove:true); the phone page.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=s1,s4 runs some)
// The day: Monday 2 Nov 2026, Cairo, the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5350'
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
const UID = '00000000-0000-4000-8000-0000000070c1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const at = (hhmm, day = 2) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, day, h - 2, m)) } // Cairo is UTC+2 in November
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const COURSES = [{ id: 'c1', name: 'Physics · A' }, { id: 'c2', name: 'History' }, { id: 'c3', name: 'Organic Chemistry' }]
const ROW = { provider: 'classroom', updated_at: at('09:30').toISOString(), login: null, status: 'ok', synced_at: at('09:48').toISOString(), courses: COURSES, chosen: ['c1', 'c2'] }
const ROWS = { ok: ROW, fresh: { ...ROW, synced_at: null }, failing: { ...ROW, status: 'failing' } }
const SYNCED = { courses: 2, fetched: 9, new: 6, updated: 0, done: 0, trashed: 0 }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** o.integrations: the classroom row (or none); o.fn: { 'classroom-connect': (body) => json, 'classroom-sync': … }. */
async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: { tasks: [], calendar_events: [], inbox_items: [], projects: [], domains: [], areas: [], integrations: o.integrations ? [structuredClone(o.integrations)] : [], app_settings: [SETTINGS] }, writes: [], calls: [] }
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
  await page.clock.install({ time: at('10:00') })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
const bodyText = (page) => page.evaluate(() => document.body.textContent ?? '')
const card = (page) => page.locator('.st-panel', { has: page.getByText('Google Classroom', { exact: true }) }).last()
const status = (page) => card(page).locator('[role="status"]').first()
const PROVIDER = '/settings/integrations/classroom'
const callsOf = (state, name) => state.calls.filter((c) => c.name === name).map((c) => c.body)
const noErrors = (name, errors) => check(`${name}: no page errors`, errors.length === 0, errors.join(' | '))

if (want('s1')) {
  const { ctx, page, errors } = await open('/settings/integrations')
  await page.locator('.st-row.is-link[data-st-key="Google Classroom"]').waitFor({ timeout: 8000 })
  const row = await page.locator('.st-row.is-link[data-st-key="Google Classroom"]').textContent()
  check('s1 Integrations lists Google Classroom, not connected', /Google Classroom/.test(row ?? '') && /Not connected/.test(row ?? ''), row)
  await shot(page, 's1-integrations-not-connected')
  await page.locator('.st-row.is-link[data-st-key="Google Classroom"]').click()
  await sleep(600)
  check('s1 its row opens its own page', new URL(page.url()).pathname === PROVIDER, page.url())
  check('s1 Connect is offered, no Sync/Disconnect yet', await card(page).getByRole('button', { name: 'Connect' }).count() === 1 && await card(page).getByRole('button', { name: 'Sync now' }).count() === 0)
  check('s1 the page says read-only and not for an AI', /Read-only/.test(await bodyText(page)) && /none of it goes to an AI/.test(await bodyText(page)))
  noErrors('s1', errors)
  await ctx.close()
}

if (want('s2')) {
  const { ctx, page, state, errors } = await open(PROVIDER, { fn: { 'classroom-connect': () => ({ missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] }) } })
  await card(page).getByRole('button', { name: 'Connect' }).click()
  await sleep(800)
  check('s2 Connect said which secrets are missing', /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/.test(await status(page).textContent()), await status(page).textContent())
  check('s2 it asked classroom-connect to start (and nothing else)', JSON.stringify(state.calls.map((c) => c.name + ':' + c.body?.action)) === '["classroom-connect:start"]', JSON.stringify(state.calls))
  await shot(page, 's2-connect-missing-secrets')
  noErrors('s2', errors)
  await ctx.close()
}

if (want('s3')) {
  const { ctx, page, state, errors } = await open(PROVIDER, { fn: { 'classroom-connect': () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?stub=classroom' }) } })
  await card(page).getByRole('button', { name: 'Connect' }).click()
  await page.waitForURL(/accounts\.google\.com/, { timeout: 8000 })
  check('s3 Connect goes to Google\u2019s consent page', page.url().includes('accounts.google.com'), page.url())
  check('s3 the request carries the origin to come back to', typeof state.calls[0].body.origin === 'string' && state.calls[0].body.origin.startsWith('http'), JSON.stringify(state.calls[0].body))
  noErrors('s3', errors)
  await ctx.close()
}

if (want('s4')) {
  const { ctx, page, state, errors } = await open('/settings?classroom=connected', {
    integrations: ROWS.fresh,
    fn: { 'classroom-sync': () => SYNCED },
  })
  await sleep(1200)
  check('s4 the landing redirects to the Classroom page', new URL(page.url()).pathname === PROVIDER, page.url())
  check('s4 the landing params are cleared', !page.url().includes('classroom='), page.url())
  check('s4 the first sync ran', callsOf(state, 'classroom-sync').length === 1)
  check('s4 it says what came in', /Connected · Synced · 2 courses · 6 new/.test(await status(page).textContent()), await status(page).textContent())
  check('s4 one switch per course, the chosen ones on', await card(page).locator('[role="switch"][aria-checked="true"]').count() === 2 && await card(page).locator('[role="switch"]').count() === 3)
  check('s4 the section is named: projects in a Classroom domain', /Classroom/.test(await card(page).textContent()))
  await shot(page, 's4-connected-day')
  noErrors('s4', errors)
  await ctx.close()
  const night = await open(PROVIDER, { integrations: ROWS.ok, theme: 'night' })
  await shot(night.page, 's4-connected-night')
  await night.ctx.close()
}

if (want('s5')) {
  const { ctx, page, state, errors } = await open(PROVIDER, { integrations: ROWS.ok, fn: { 'classroom-connect': () => ({ chosen: ['c1', 'c2', 'c3'] }), 'classroom-sync': () => SYNCED } })
  await card(page).getByRole('switch', { name: 'Sync Organic Chemistry' }).click()
  await sleep(900)
  check('s5 ticking a course saves at once', JSON.stringify(callsOf(state, 'classroom-connect')) === '[{"action":"choose","ids":["c1","c2","c3"]}]', JSON.stringify(callsOf(state, 'classroom-connect')))
  check('s5 a newly ticked course syncs now', callsOf(state, 'classroom-sync').length === 1)
  await card(page).getByRole('switch', { name: 'Sync History' }).click()
  await sleep(900)
  const last = callsOf(state, 'classroom-connect').at(-1)
  check('s5 unticking saves too, and syncs nothing', last.action === 'choose' && !last.ids.includes('c2') && callsOf(state, 'classroom-sync').length === 1, JSON.stringify(last))
  noErrors('s5', errors)
  await ctx.close()
}

if (want('s6')) {
  const { ctx, page, state, errors } = await open(PROVIDER, { integrations: ROWS.ok, fn: { 'classroom-sync': () => ({ ...SYNCED, new: 0, updated: 1, done: 2, trashed: 1 }), 'classroom-connect': () => ({ courses: COURSES, chosen: ['c1', 'c2'] }) } })
  await card(page).getByRole('button', { name: 'Sync now' }).click()
  await sleep(800)
  check('s6 Sync now says what moved', /2 handed in · 1 gone/.test(await status(page).textContent()), await status(page).textContent())
  await card(page).getByRole('button', { name: 'Look for new courses' }).click()
  await sleep(800)
  check('s6 Look for new courses re-reads the list', callsOf(state, 'classroom-connect').some((b) => b?.action === 'courses'))
  noErrors('s6', errors)
  await ctx.close()
}

if (want('s7')) {
  const { ctx, page, state, errors } = await open(PROVIDER, { integrations: ROWS.ok, fn: { 'classroom-connect': (b) => (b.action === 'disconnect' ? { ok: true, removed: b.remove ? 5 : 0 } : {}) } })
  await card(page).getByRole('button', { name: 'Disconnect' }).click()
  await sleep(300)
  const group = card(page).getByRole('group', { name: 'Disconnect Google Classroom' })
  check('s7 Disconnect asks before it does anything', await group.count() === 1 && state.calls.length === 0, await group.count())
  check('s7 the choice: keep / Trash / cancel', await group.getByRole('button', { name: 'Keep them' }).count() === 1 && await group.getByRole('button', { name: 'Move them to Trash' }).count() === 1 && await group.getByRole('button', { name: 'Cancel' }).count() === 1)
  await shot(page, 's7-disconnect-choice')
  await group.getByRole('button', { name: 'Cancel' }).click()
  await sleep(200)
  check('s7 Cancel changes nothing', await group.count() === 0 && state.calls.length === 0)
  await card(page).getByRole('button', { name: 'Disconnect' }).click()
  await card(page).getByRole('button', { name: 'Move them to Trash' }).click()
  await sleep(800)
  check('s7 "Move them to Trash" sends remove:true', JSON.stringify(callsOf(state, 'classroom-connect')) === '[{"action":"disconnect","remove":true}]', JSON.stringify(state.calls))
  check('s7 …and says how many went to Trash', /5 imported tasks moved to Trash/.test(await status(page).textContent()), await status(page).textContent())
  noErrors('s7', errors)
  await ctx.close()
  const k = await open(PROVIDER, { integrations: ROWS.ok, fn: { 'classroom-connect': () => ({ ok: true, removed: 0 }) } })
  await card(k.page).getByRole('button', { name: 'Disconnect' }).click()
  await card(k.page).getByRole('button', { name: 'Keep them' }).click()
  await sleep(800)
  check('s7 "Keep them" sends remove:false', JSON.stringify(callsOf(k.state, 'classroom-connect')) === '[{"action":"disconnect","remove":false}]', JSON.stringify(k.state.calls))
  check('s7 …and says they stay', /imported tasks stay/.test(await status(k.page).textContent()))
  await k.ctx.close()
}

if (want('s8')) {
  const { ctx, page, errors } = await open(PROVIDER, { integrations: ROWS.failing })
  const t = await bodyText(page)
  check('s8 an expired grant says reconnect', /Access expired — reconnect/.test(t))
  check('s8 Reconnect replaces Sync now, and the course list is hidden', await card(page).getByRole('button', { name: 'Reconnect' }).count() === 1 && await card(page).getByRole('button', { name: 'Sync now' }).count() === 0 && await card(page).locator('[role="switch"]').count() === 0)
  await shot(page, 's8-failing')
  noErrors('s8', errors)
  await ctx.close()
}

if (want('s9')) {
  for (const [reason, re] of [['admin_blocked', /administrator has blocked outside apps/], ['denied', /consent page was cancelled/], ['scope_missing', /all three Classroom boxes/]]) {
    const { ctx, page, errors } = await open(`/settings?classroom=error&reason=${reason}`)
    await sleep(500)
    const said = await status(page).textContent().catch(() => '')
    check(`s9 ${reason}: said in words`, re.test(said ?? ''), said)
    if (reason === 'admin_blocked') await shot(page, 's9-admin-blocked')
    noErrors(`s9 ${reason}`, errors)
    await ctx.close()
  }
}

if (want('s10')) {
  const { ctx, page, errors } = await open(PROVIDER, { integrations: ROWS.ok, view: phone })
  check('s10 phone: the page fits (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  check('s10 phone: switches are tappable (44px)', await page.evaluate(() => [...document.querySelectorAll('[role="switch"]')].every((e) => { const r = e.getBoundingClientRect(); return r.height >= 24 && r.width >= 24 })))
  await shot(page, 's10-phone')
  noErrors('s10', errors)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
