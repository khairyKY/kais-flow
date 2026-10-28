// license (2026-10-29): Settings › App & updates › "Open-source licences" opens public/licenses.txt
// (scripts/licenses.mjs, prebuild/predev) in the legal card; Esc closes it; a failed fetch says so.
// The real app signed in against a mocked backend (export's recipe), desktop 1280×800 + phone 390×844.
//   cd app && node scripts/licenses.mjs && npx vite --mode mock --host :: --port 5333 --strictPort
//   node verify.mjs [outDir] [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5333'
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
const UID = '00000000-0000-4000-8000-00000000e4a0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const CONSENTS = ['terms', 'privacy'].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, document: d, version: LEGAL_TS.match(new RegExp(`${d.toUpperCase()}_VERSION = '([0-9-]+)'`))[1], accepted_at: '2026-10-25T00:00:00Z' }))
const T = '2026-10-01T09:00:00Z'
const ROWS = { app_settings: [{ id: true, user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }], consents: CONSENTS }

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
async function open(view, { failLicences = false } = {}) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [JSON.stringify(session), UID])
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const rows = ROWS[url.pathname.replace('/rest/v1/', '')] ?? []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${rows.length - 1}/${rows.length}` } }).catch(() => {})
  })
  await ctx.route('https://*.github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  await ctx.route('https://github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  if (failLicences) await ctx.route('**/licenses.txt', (r) => r.fulfill({ status: 404, body: '' }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/settings/about`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors }
}

for (const [name, view] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  const { ctx, page, errors } = await open(view)
  const row = page.locator('.st-row', { hasText: 'Open-source licences' })
  check(`${name}: About has the Open-source licences row`, (await row.count()) === 1)
  await row.getByRole('button', { name: 'Read' }).click()
  const dialog = page.getByRole('dialog', { name: 'Open-source licences' })
  await dialog.locator('pre:not([aria-busy="true"])').waitFor({ timeout: 10000 })
  const text = await dialog.locator('pre').innerText()
  check(`${name}: the dialog shows licenses.txt`, text.startsWith('Kai’s Flow — open-source licences') || text.startsWith("Kai's Flow — open-source licences"), text.slice(0, 40))
  check(`${name}: it lists the JS packages and their texts`, /react 19\.\S+ \(MIT\)/.test(text) && /Permission is hereby granted/.test(text), `${text.length} chars`)
  await sleep(600) // the card's entrance
  await page.screenshot({ path: path.join(OUT, `${name}-licences.png`) })
  await page.keyboard.press('Escape')
  await sleep(300)
  check(`${name}: Esc closes it`, (await dialog.count()) === 0)
  check(`${name}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

{
  const { ctx, page } = await open({ width: 1280, height: 800 }, { failLicences: true })
  await page.locator('.st-row', { hasText: 'Open-source licences' }).getByRole('button', { name: 'Read' }).click()
  const alert = page.getByRole('dialog', { name: 'Open-source licences' }).getByRole('alert')
  await alert.waitFor({ timeout: 5000 }).catch(() => {})
  check('a failed fetch says so', /Couldn’t load the licences/.test((await alert.innerText().catch(() => '')) ?? ''))
  await page.screenshot({ path: path.join(OUT, 'desktop-licences-failed.png') })
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
