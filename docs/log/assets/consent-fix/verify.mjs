// consent-fix (2026-11-06, Kai: "I accepted the Terms 3 times on the web, same account, after accepting in the desktop app"):
// one fake server shared by several fresh "devices" (new browser contexts = new localStorage + IndexedDB), the same user.
//   A · one acceptance per account per version: device 1 accepts; device 2 (fresh) never sees the notice, not even
//       while its consents answer is slow; a reload of device 1 doesn't either; the server holds ONE row per document.
//   B · a device whose saved copy says "not accepted" (loaded before the other device accepted) doesn't show the
//       notice from that old copy on its next start, while the fresh answer is on its way.
//   C · one card at a time: owing an agreement, the update line waits.
//   N · "Privacy policy updated": an informational version shows a one-line notice once per account, synced.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5352] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'http://localhost:5352'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const V = { terms: LEGAL_TS.match(/TERMS_VERSION = '([0-9-]+)'/)[1], privacy: LEGAL_TS.match(/PRIVACY_VERSION = '([0-9-]+)'/)[1] }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000c0f1c'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'kai@example.test', app_metadata: {}, user_metadata: {}, identities: [{ id: UID, provider: 'email' }], created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const T = '2026-10-01T09:00:00Z'
const SETTINGS = { id: true, user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }

/** The account on the server, shared by every device: what PostgREST + RLS would do. */
function newServer({ consents = [], uniqueKey = false } = {}) {
  return { rows: { app_settings: [SETTINGS], consents: [...consents], integrations: [] }, uniqueKey }
}
const consent = (document, version, n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, user_id: UID, document, version, accepted_at: '2026-10-25T08:00:00Z' })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

/** A fresh device on the server. o.getDelay = ms the consents answer takes; o.postDelay = ms a consents write takes. */
async function device(server, o = {}) {
  const ctx = o.ctx ?? (await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Cairo', locale: 'en-US' }))
  if (!o.ctx) {
    await ctx.addInitScript(([sess, uid]) => {
      localStorage.setItem('kf-mock-legal', '1')
      window.open = () => null
      if (sessionStorage.getItem('kf-verify-booted')) return
      sessionStorage.setItem('kf-verify-booted', '1')
      localStorage.setItem('kf_theme', 'day')
      localStorage.setItem('kf-app-zone', 'Africa/Cairo')
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
      localStorage.setItem('sb-127-auth-token', sess)
    }, [JSON.stringify(session), UID])
  }
  const dev = { ctx, getDelay: o.getDelay ?? 0, postDelay: o.postDelay ?? 0 }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const u = new URL(req.url())
    let body = null
    try { body = req.postDataJSON() } catch { body = req.postData() }
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: req.method() === 'POST' && u.pathname.endsWith('/token') ? session : user }).catch(() => {})
    if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: { ok: true } }).catch(() => {})
    const table = u.pathname.replace('/rest/v1/', '')
    const authed = (req.headers()['authorization'] ?? '').includes(jwt) // RLS: anon sees nothing
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      if (dev.postDelay && table === 'consents') await sleep(dev.postDelay)
      const prefer = req.headers()['prefer'] ?? ''
      const conflict = (u.searchParams.get('on_conflict') ?? 'id').split(',')
      const rows = (server.rows[table] ??= [])
      for (const row of [body].flat().filter((x) => x && typeof x === 'object')) {
        const full = { user_id: UID, ...row }
        if (table === 'consents') full.accepted_at = new Date().toISOString() // 0089: the server stamps it
        const keys = table === 'consents' && server.uniqueKey ? [conflict, ['user_id', 'document', 'version']] : [conflict]
        const clash = rows.find((x) => keys.some((k) => k.every((c) => x[c] === full[c])))
        if (clash) {
          if (prefer.includes('ignore-duplicates')) continue
          if (prefer.includes('merge-duplicates')) { Object.assign(clash, full); continue }
          return r.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } }).catch(() => {})
        }
        rows.push(full)
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }).catch(() => {})
    }
    if (table === 'consents' && dev.getDelay) await sleep(dev.getDelay)
    const rows = authed ? (server.rows[table] ?? []) : []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  await ctx.route('https://**/*', (r) => r.fulfill({ status: 404, body: '' }))
  dev.page = o.page ?? (await ctx.newPage())
  dev.errors = []
  dev.page.on('pageerror', (e) => dev.errors.push(e.message))
  return dev
}
const NOTICE = /We’ve updated our/
const noticeUp = (page) => page.getByRole('dialog', { name: NOTICE }).isVisible().catch(() => false)
const privacyNote = (page) => page.getByRole('status', { name: /Privacy policy updated/ }).isVisible().catch(() => false)
/** Opens the app and watches for the notice until `ms` has passed: true if it was ever on screen. */
async function everShows(dev, ms, goto = true) {
  if (goto) await dev.page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  let shown = false
  const until = Date.now() + ms
  while (Date.now() < until) { if (await noticeUp(dev.page)) shown = true; await sleep(100) }
  return shown
}
const count = (server, doc, ver) => server.rows.consents.filter((c) => c.document === doc && c.version === ver).length
async function agree(dev) {
  const { page } = dev
  for (const box of await page.getByRole('checkbox').all()) await box.click()
  await page.getByRole('button', { name: 'I agree' }).click()
  await sleep(1500)
}

// ── A · device 1 accepts, device 2 (fresh, same account) is never asked ──
{
  const server = newServer()
  const d1 = await device(server)
  check('A1 an account with no agreement is asked (device 1)', await everShows(d1, 3000))
  await agree(d1)
  check('A2 after I agree the notice is gone', !(await noticeUp(d1.page)))
  check('A3 the server holds one row per document', count(server, 'terms', V.terms) === 1 && count(server, 'privacy', V.privacy) === 1, JSON.stringify(server.rows.consents.map((c) => c.document + '@' + c.version)))
  check('A4 a reload of device 1 is not asked again', !(await everShows(d1, 3000)))
  await d1.ctx.close()
  const d2 = await device(server, { getDelay: 1500 })
  check('A5 device 2 (fresh storage, same account) is never asked, not even while its answer is slow', !(await everShows(d2, 3500)))
  await d2.ctx.close()
}

// ── B · a device whose saved copy still says "not accepted" ──
{
  const server = newServer()
  const w = await device(server)
  check('B1 the web device (nothing accepted yet) is asked', await everShows(w, 3000))
  await sleep(1500) // the saved copy is written to IndexedDB in the background
  // The desktop app accepts meanwhile.
  server.rows.consents.push(consent('terms', V.terms, 1), consent('privacy', V.privacy, 2))
  await w.page.close()
  w.getDelay = 2500
  w.page = await w.ctx.newPage()
  const shown = await everShows(w, 4500)
  check('B2 its next start does not ask from the old saved copy while the fresh answer is on its way', !shown)
  await w.ctx.close()
}

// ── C · one card at a time: an account that still owes an agreement sees the card, not the update line ──
{
  const server = newServer()
  const d = await device(server)
  await d.page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  check('C1 owing an agreement: the card is up and the "updated" line is not', (await noticeUp(d.page)) && !(await privacyNote(d.page)))
  await d.ctx.close()
}

// ── N · informational notice: once per account, synced ──
{
  const server = newServer({ consents: [consent('terms', V.terms, 1), consent('privacy', V.privacy, 2)] })
  const d1 = await device(server)
  await d1.page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  const shows = await privacyNote(d1.page)
  check('N1 an informational privacy update shows a one-line notice (no dialog, no agree)', shows && !(await noticeUp(d1.page)))
  if (shows) {
    await d1.page.screenshot({ path: path.join(OUT, 'n1-notice.png') })
    await d1.page.getByRole('button', { name: 'Got it' }).click()
    await sleep(1500)
  }
  check('N2 Got it dismisses it, and a row records it for the account', !(await privacyNote(d1.page)) && server.rows.consents.some((c) => c.document === 'privacy_notice'))
  await d1.ctx.close()
  const d2 = await device(server)
  await d2.page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  check('N3 on another device the same account is not shown it again', !(await privacyNote(d2.page)))
  await d2.ctx.close()
}

await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
