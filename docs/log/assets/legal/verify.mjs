// legal (2026-10-25, Kai: "where are the privacy policies and all the policies, and the people accepting our
// terms during the account creation, and send a notice telling people that we changed our terms"):
//   S · sign up: Create account waits for "I agree to the Terms of Use and the Privacy Policy"; the box's
//       links open the pages and don't tick it; the versions ride along as metadata, and the mock does
//       what 0083's trigger does with them (consent rows) — so the new account lands without the notice.
//       The footer links (sign up + sign in) and the password eye (queue item 6).
//   P · Settings → Privacy & terms: both links (to the site), "you agreed …", the short "where" line.
//   N · an account whose agreement is older (or missing): the notice over Today, Esc / scrim don't close
//       it, "I agree" writes the current versions through the outbox and it's gone, also after a reload.
//   D · Delete account: Settings → Your data, and from the notice — DELETE typed, Google disconnected
//       first, the function called, signed out to /sign-in with a toast.
// The real app against a mocked backend (download-bar's recipe), desktop 1280×800 + phone 390×844, day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5305'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const V = { terms: LEGAL_TS.match(/TERMS_VERSION = '([0-9-]+)'/)[1], privacy: LEGAL_TS.match(/PRIVACY_VERSION = '([0-9-]+)'/)[1] }
const SITE = 'https://kais-flow-site.khairyshhn1.workers.dev'
const PRIVACY_URL = `${SITE}/privacy/`
const TERMS_URL = `${SITE}/terms/`

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000001e9a10'
const EMAIL = 'kai@example.test'
const PASSWORD = 'made-up-pass' // never a real password
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, identities: [{ id: UID, provider: 'email' }], created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const T = '2026-10-01T09:00:00Z'
const SETTINGS = { id: true, user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }
const consent = (document, version, n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, user_id: UID, document, version, accepted_at: '2026-10-25T08:00:00Z' })
const CURRENT_ROWS = [consent('terms', V.terms, 1), consent('privacy', V.privacy, 2)]
const OLD_ROWS = [consent('terms', '2026-01-01', 3), consent('privacy', '2026-01-01', 4)]

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 800 }, userAgent: WINDOWS_UA }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID_UA } }

/** A fresh device on `at`. `o.signedIn` (default true), `o.consents` = the account's rows, `o.google` = connected. */
async function open(at, o = {}) {
  const ctx = await browser.newContext({ ...VIEWS[o.view ?? 'desktop'], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', acceptDownloads: true })
  await ctx.addInitScript(() => {
    localStorage.setItem('kf-mock-legal', '1') // the mock build hides the terms notice unless a harness asks (features/legal/api)
    // openExternal on the web = window.open(url, '_blank', …): record it instead of opening a tab.
    window.__opened = []
    window.open = (url) => { window.__opened.push(String(url)); return null }
  })
  await ctx.addInitScript(([t, sess, uid]) => {
    if (sessionStorage.getItem('kf-verify-booted')) return // a reload keeps what the page did
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    if (sess) localStorage.setItem('sb-127-auth-token', sess)
  }, [o.theme ?? 'day', o.signedIn === false ? null : JSON.stringify(session), UID])
  const state = { calls: [], rows: { app_settings: [SETTINGS], consents: [...(o.consents ?? CURRENT_ROWS)], integrations: o.google ? [{ provider: 'google', updated_at: T, login: null, status: 'ok', synced_at: T }] : [] } }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const u = new URL(req.url())
    let body = null
    try { body = req.postDataJSON() } catch { body = req.postData() }
    state.calls.push({ method: req.method(), path: u.pathname, body })
    if (u.pathname.startsWith('/auth/v1/')) {
      const key = `${req.method()} ${u.pathname}`
      if (key === 'POST /auth/v1/signup') {
        // What 0083's trigger does with the metadata: a consent row per version it names.
        const meta = body?.data ?? {}
        if (meta.terms_version) state.rows.consents.push({ ...consent('terms', meta.terms_version, 5), accepted_at: new Date().toISOString() })
        if (meta.privacy_version) state.rows.consents.push({ ...consent('privacy', meta.privacy_version, 6), accepted_at: new Date().toISOString() })
        return r.fulfill({ json: session })
      }
      if (key === 'POST /auth/v1/token') return r.fulfill({ json: session })
      if (key === 'POST /auth/v1/logout') return r.fulfill({ status: 204, body: '' })
      return r.fulfill({ json: user })
    }
    if (u.pathname.startsWith('/functions/v1/')) {
      const fn = u.pathname.replace('/functions/v1/', '')
      if (fn === 'delete-account') return r.fulfill({ json: body?.confirm === 'DELETE' ? { deleted: true } : { error: 'confirm' }, status: body?.confirm === 'DELETE' ? 200 : 400 })
      return r.fulfill({ json: { ok: true } })
    }
    const table = u.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      for (const row of [body].flat().filter((x) => x && typeof x === 'object')) {
        const rows = (state.rows[table] ??= [])
        const i = rows.findIndex((x) => x.id === row.id)
        if (i >= 0) rows[i] = { ...rows[i], ...row }
        else rows.push({ user_id: UID, ...row })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const rows = state.rows[table] ?? []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  await ctx.route('https://*.github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  await ctx.route('https://github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  await ctx.route(`${SITE}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>policy</title>' }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${at}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}

const shot = async (page, name) => {
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const notice = (page) => page.getByRole('dialog', { name: /We’ve updated our/ })
const writes = (env, table) => env.state.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/${table}`).flatMap((c) => [c.body].flat())
const fnCalls = (env, fn) => env.state.calls.filter((c) => c.path === `/functions/v1/${fn}`)
/** The URL a click opened (openExternal → window.open, recorded by the init script). */
async function opened(env, click) {
  await env.page.evaluate(() => (window.__opened.length = 0))
  await click()
  await sleep(200)
  return env.page.evaluate(() => window.__opened.join(' '))
}

// ── S · sign up and sign in ──
for (const view of ['desktop', 'phone']) for (const theme of ['day', 'night']) {
  const tag = `s-${view}-${theme}`
  const env = await open('/sign-in', { view, theme, signedIn: false, consents: [] })
  const { page } = env
  const box = page.getByRole('checkbox', { name: /I agree to the Terms of Use and the Privacy Policy/ })
  const cta = page.getByRole('button', { name: 'Create account' })
  check(`${tag} sign up has the terms box, unticked, and Create account waits for it`, (await page.locator('h1').first().innerText()) === 'Create your account' && (await box.getAttribute('aria-checked')) === 'false' && (await cta.isDisabled()))
  await page.getByLabel('Email', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await cta.click({ force: true }).catch(() => {})
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await sleep(300)
  check(`${tag} unticked: neither a tap nor Enter signs up`, env.state.calls.filter((c) => c.path === '/auth/v1/signup').length === 0)
  const links = await page.locator('.fr-consent a').evaluateAll((as) => as.map((a) => [a.textContent, a.href]))
  check(`${tag} the box's line links both pages`, JSON.stringify(links) === JSON.stringify([['Terms of Use', TERMS_URL], ['Privacy Policy', PRIVACY_URL]]), JSON.stringify(links))
  const url = await opened(env, () => page.locator('.fr-consent a', { hasText: 'Terms of Use' }).click())
  check(`${tag} its Terms link opens the page and doesn't tick the box`, url === TERMS_URL && (await box.getAttribute('aria-checked')) === 'false', url)
  const foot = await page.locator('.fr-legal a').evaluateAll((as) => as.map((a) => [a.textContent, a.href]))
  check(`${tag} footer: Privacy Policy · Terms of Use`, JSON.stringify(foot) === JSON.stringify([['Privacy Policy', PRIVACY_URL], ['Terms of Use', TERMS_URL]]), JSON.stringify(foot))
  // The password eye (queue item 6): no word, an eye, named for what a tap does.
  const eye = page.locator('.fr-show')
  check(`${tag} password eye: no word, one glyph, "Show password"`, (await eye.innerText()) === '' && (await eye.locator('svg').count()) === 1 && (await eye.getAttribute('aria-label')) === 'Show password')
  await eye.click()
  check(`${tag} a tap shows it and the eye is "Hide password"`, (await page.getByLabel('Password', { exact: true }).getAttribute('type')) === 'text' && (await eye.getAttribute('aria-label')) === 'Hide password')
  await eye.click()
  await shot(page, `${tag}-unticked`)
  await page.locator('.fr-consent span').first().click({ position: { x: 4, y: 6 } })
  check(`${tag} a tap on the line ticks it; Create account is ready`, (await box.getAttribute('aria-checked')) === 'true' && (await cta.isEnabled()))
  await shot(page, `${tag}-ticked`)
  await cta.click()
  await page.waitForURL('**/today', { timeout: 6000 }).catch(() => {})
  await sleep(1200)
  const signup = env.state.calls.find((c) => c.path === '/auth/v1/signup')
  check(`${tag} sign-up sends the versions agreed to`, signup?.body?.data?.terms_version === V.terms && signup?.body?.data?.privacy_version === V.privacy, JSON.stringify(signup?.body?.data))
  check(`${tag} consent rows written (the trigger's job, mocked) — 2 rows at the current versions`, env.state.rows.consents.length === 2 && env.state.rows.consents.every((c) => c.version === V[c.document]), JSON.stringify(env.state.rows.consents.map((c) => [c.document, c.version])))
  check(`${tag} the new account lands in the app with no notice`, page.url().endsWith('/today') && (await notice(page).count()) === 0, page.url())
  check(`${tag} no page errors`, env.errors.length === 0, env.errors.join(' | '))
  await env.ctx.close()

  // Sign in: the footer is there too.
  const si = await open('/sign-in', { view, theme, signedIn: false })
  await si.page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await sleep(300)
  check(`${tag} sign in: no terms box, the footer links`, (await si.page.locator('h1').first().innerText()) === 'Welcome back' && (await si.page.locator('.fr-consent').count()) === 0 && (await si.page.locator('.fr-legal a').count()) === 2)
  await shot(si.page, `${tag}-signin`)
  await si.ctx.close()
}

// ── P · Settings → Privacy & terms ──
for (const view of ['desktop', 'phone']) for (const theme of ['day', 'night']) {
  const tag = `p-${view}-${theme}`
  const env = await open('/settings', { view, theme })
  const card = env.page.locator('#settings-Legal')
  check(`${tag} Settings has "Privacy & terms"`, (await card.count()) === 1 && (await card.locator('.st-title').innerText()) === 'Privacy & terms')
  const links = await card.locator('a').evaluateAll((as) => as.map((a) => a.href))
  check(`${tag} Read → the Privacy Policy and the Terms of Use`, JSON.stringify(links) === JSON.stringify([PRIVACY_URL, TERMS_URL]), JSON.stringify(links))
  const text = await card.innerText()
  check(`${tag} says when it was updated and that you agreed`, /Updated \d+ \w+ \d{4} · you agreed 25 Oct 2026/.test(text), text.replace(/\n/g, ' | '))
  check(`${tag} the short "where": Supabase in the EU, Groq keeps nothing`, text.includes('Supabase, in the EU') && text.includes('Groq'))
  const url = await opened(env, () => card.locator('a').first().click())
  check(`${tag} Read opens the Privacy Policy`, url === PRIVACY_URL, url)
  if (view === 'desktop') {
    await env.page.getByRole('button', { name: 'Privacy & terms' }).click()
    await sleep(700)
    check(`${tag} the side nav has "Privacy & terms" and goes there`, Math.abs((await card.boundingBox()).y) < 400)
  }
  check(`${tag} Your data has Delete account`, (await env.page.locator('#settings-Data .st-row', { hasText: 'Delete account' }).count()) === 1)
  await card.scrollIntoViewIfNeeded()
  await sleep(200)
  await card.screenshot({ path: path.join(OUT, `${tag}-card.png`) })
  check(`${tag} no page errors`, env.errors.length === 0, env.errors.join(' | '))
  await env.ctx.close()
}

// ── N · the notice on an older version ──
for (const view of ['desktop', 'phone']) for (const theme of ['day', 'night']) {
  const tag = `n-${view}-${theme}`
  const env = await open('/today', { view, theme, consents: OLD_ROWS })
  const { page } = env
  const dlg = notice(page)
  check(`${tag} an older agreement → "We’ve updated our Terms of Use and Privacy Policy"`, (await dlg.count()) === 1 && (await dlg.locator('h2').innerText()) === 'We’ve updated our Terms of Use and Privacy Policy')
  const lines = await dlg.locator('li').count()
  check(`${tag} 2–4 lines of what changed, both links`, lines >= 2 && lines <= 4 && JSON.stringify(await dlg.locator('.lg-links a').evaluateAll((as) => as.map((a) => a.href))) === JSON.stringify([TERMS_URL, PRIVACY_URL]), lines)
  check(`${tag} the ways out: Export my data, Delete my account, Sign out`, JSON.stringify(await dlg.locator('.lg-out button').allInnerTexts()) === JSON.stringify(['Export my data', 'Delete my account', 'Sign out']))
  const m = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
  check(`${tag} the card fits the screen`, m.sw <= m.iw + 1 && (await dlg.boundingBox()).width <= m.iw, JSON.stringify(m))
  await shot(page, `${tag}-notice`)
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await sleep(300)
  check(`${tag} Esc and a tap outside don't close it`, (await dlg.count()) === 1)
  await dlg.getByRole('button', { name: 'I agree' }).click()
  await sleep(1500)
  const w = writes(env, 'consents')
  check(`${tag} I agree → the current versions written (outbox → consents)`, w.length === 2 && w.some((r) => r.document === 'terms' && r.version === V.terms) && w.some((r) => r.document === 'privacy' && r.version === V.privacy) && w.every((r) => r.accepted_at && !r.user_id), JSON.stringify(w))
  check(`${tag} and the notice is gone`, (await dlg.count()) === 0)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  check(`${tag} still gone after a reload`, (await notice(page).count()) === 0)
  check(`${tag} no page errors`, env.errors.length === 0, env.errors.join(' | '))
  await env.ctx.close()
}
{
  // An account from before consents (no rows) is asked for both; one where only the policy moved, just that.
  const none = await open('/today', { consents: [] })
  check('n-none an account with no agreement at all is asked for both', (await notice(none.page).locator('h2').innerText().catch(() => '')) === 'We’ve updated our Terms of Use and Privacy Policy')
  await none.ctx.close()
  const one = await open('/today', { consents: [CURRENT_ROWS[0], OLD_ROWS[1]] })
  check('n-one only the Privacy Policy older → only it is named', (await notice(one.page).locator('h2').innerText().catch(() => '')) === 'We’ve updated our Privacy Policy')
  await one.page.getByRole('button', { name: 'I agree' }).click()
  await sleep(1200)
  const w = writes(one, 'consents')
  check('n-one I agree writes just the Privacy Policy', w.length === 1 && w[0].document === 'privacy' && w[0].version === V.privacy, JSON.stringify(w))
  await one.ctx.close()
}

// ── D · Delete account ──
for (const view of ['desktop', 'phone']) for (const theme of ['day', 'night']) {
  const tag = `d-${view}-${theme}`
  const env = await open('/settings', { view, theme, google: true })
  const { page } = env
  await page.locator('#settings-Data .st-row', { hasText: 'Delete account' }).getByRole('button').click()
  const dlg = page.getByRole('dialog', { name: 'Delete your account?' })
  const del = dlg.getByRole('button', { name: 'Delete account' })
  check(`${tag} the dialog asks, offers the export, Delete waits for the word`, (await dlg.count()) === 1 && (await dlg.getByRole('button', { name: 'Export everything first (.json)' }).count()) === 1 && (await del.isDisabled()))
  if (view === 'desktop' && theme === 'day') {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), dlg.getByRole('button', { name: 'Export everything first (.json)' }).click()])
    check(`${tag} Export everything first saves the .json`, !!download && /^kais-flow-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download?.suggestedFilename())
    await sleep(300)
  }
  await dlg.locator('input').fill('delet')
  check(`${tag} a wrong word keeps Delete off`, await del.isDisabled())
  await dlg.locator('input').fill('delete')
  check(`${tag} DELETE typed (any case) → Delete is ready`, await del.isEnabled())
  await shot(page, `${tag}-confirm`)
  await page.keyboard.press('Escape')
  await sleep(200)
  check(`${tag} Esc keeps the account (closes the dialog, nothing sent)`, (await dlg.count()) === 0 && fnCalls(env, 'delete-account').length === 0)
  await page.locator('#settings-Data .st-row', { hasText: 'Delete account' }).getByRole('button').click()
  await dlg.locator('input').fill('DELETE')
  await del.click()
  await page.waitForURL('**/sign-in', { timeout: 8000 }).catch(() => {})
  await sleep(800)
  const g = fnCalls(env, 'google-connect')
  const d = fnCalls(env, 'delete-account')
  check(`${tag} Google disconnected first, then delete-account { confirm: DELETE }`, g.length === 1 && g[0].body?.action === 'disconnect' && d.length === 1 && d[0].body?.confirm === 'DELETE' && env.state.calls.indexOf(g[0]) < env.state.calls.indexOf(d[0]), JSON.stringify([g.map((c) => c.body), d.map((c) => c.body)]))
  check(`${tag} signed out, on /sign-in, with the toast`, page.url().endsWith('/sign-in') && (await page.locator('.kf-toast-msg').allInnerTexts()).some((t) => t.includes('Your account and everything in it are deleted')), page.url())
  check(`${tag} this device forgot the session`, (await page.evaluate(() => localStorage.getItem('sb-127-auth-token'))) === null)
  await shot(page, `${tag}-signed-out`)
  check(`${tag} no page errors`, env.errors.length === 0, env.errors.join(' | '))
  await env.ctx.close()
}
{
  // From the notice: Delete my account opens the same dialog over it; Keep my account goes back to it.
  const env = await open('/today', { consents: OLD_ROWS })
  await notice(env.page).getByRole('button', { name: 'Delete my account' }).click()
  const dlg = env.page.getByRole('dialog', { name: 'Delete your account?' })
  check('d-notice Delete my account opens the dialog over the notice', (await dlg.count()) === 1)
  await dlg.getByRole('button', { name: 'Keep my account' }).click()
  await sleep(200)
  check('d-notice Keep my account → back to the notice', (await dlg.count()) === 0 && (await notice(env.page).count()) === 1)
  await env.ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
