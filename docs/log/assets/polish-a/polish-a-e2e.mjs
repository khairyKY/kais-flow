// Polish A real run against a production build (`vite build` + `vite preview`) and the local
// Supabase stack. Based on the conductor's smoke.mjs (copied, not edited): same Chromium, same
// console/request-failure capture, desktop 1280x800 + phone 390x844.
// usage (cloud container, local stack up, preview serving the build):
//   node polish-a-e2e.mjs main  <shotDir> http://127.0.0.1:5230      → not-found, galleries, share, sign-up → onboarding
//   PA_EMAIL=<account from main> node polish-a-e2e.mjs crash <shotDir> http://127.0.0.1:5231
//     → the crash page, against a SCRATCH build whose TodayPage/FocusPage/SignInPage throw on
//       `?crash` (never committed; see the handoff for the exact lines).
// Needs, beside this file: node_modules/playwright → the global install. Reads the local stack's
// public demo ANON_KEY from app/.env.local (never production keys).
import { chromium } from 'playwright'
import fs from 'node:fs'

const [MODE = 'main', OUT = './shots', BASE = 'http://127.0.0.1:5230'] = process.argv.slice(2)
const API = 'http://127.0.0.1:54321'
const ENV = process.env.PA_ENV ?? new URL('../../../../app/.env.local', import.meta.url)
const ANON = fs.readFileSync(ENV, 'utf8').match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const RUN = process.env.PA_RUN ?? String(Date.now()).slice(-7)
const EMAIL = process.env.PA_EMAIL ?? `polish-a-${RUN}@example.com`
const PASSWORD = 'polish-a-pass-1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const errors = []
const inflight = new WeakMap()
// SPA navigations don't reset 'networkidle' — settle on our own in-flight count (J-11 recipe).
async function settle(page, quietMs = 800, maxMs = 15000) {
  const t0 = Date.now()
  let quietSince = Date.now()
  while (Date.now() - t0 < maxMs) {
    const busy = [...inflight.get(page)].filter((q) => !q.url().includes('open-meteo'))
    if (busy.length) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) return
    await sleep(100)
  }
}
function watch(page, label) {
  const set = new Set()
  inflight.set(page, set)
  page.on('request', (q) => set.add(q))
  page.on('requestfinished', (q) => set.delete(q))
  page.on('requestfailed', (q) => set.delete(q))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} ${new URL(page.url()).pathname}: ${m.text().split('\n')[0].slice(0, 160)}`)
  })
  page.on('requestfailed', (q) => errors.push(`${label} FAILED ${q.url().slice(0, 90)} ${q.failure()?.errorText}`))
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`))
}

// Every path the tab passes through, including client-side replaceState hops (sessionStorage
// survives the reloads inside one tab).
const PATH_LOG = () => {
  const rec = () => {
    const a = JSON.parse(sessionStorage.getItem('__pa_paths') || '[]')
    if (a[a.length - 1] !== location.pathname) a.push(location.pathname)
    sessionStorage.setItem('__pa_paths', JSON.stringify(a))
  }
  rec()
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k]
    history[k] = function (...args) {
      const r = orig.apply(this, args)
      rec()
      return r
    }
  }
  addEventListener('popstate', rec)
}
const paths = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__pa_paths') || '[]'))
const resetPaths = (page) => page.evaluate(() => sessionStorage.setItem('__pa_paths', JSON.stringify([location.pathname])))
const path = (page) => new URL(page.url()).pathname
const body = (page) => page.evaluate(() => document.body.innerText)

async function shot(page, name) {
  await sleep(500)
  const p = `${OUT}/${name}.png`
  await page.screenshot({ path: p })
  console.log('      shot', p)
}

async function waitForPath(page, want, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (path(page) === want) return true
    await sleep(100)
  }
  return false
}

// House rule: no stack trace, no raw failure text, never the word "error".
async function checkCalm(page, name, extraBanned = []) {
  const text = await body(page)
  const banned = ['Unexpected Application Error', 'Hey developer', 'ErrorBoundary', '404 Not Found', ...extraBanned]
  const hit = banned.filter((b) => text.includes(b))
  check(`${name}: no developer screen / raw text`, hit.length === 0, hit.join(', '))
  check(`${name}: the word "error" is not on screen`, !/error/i.test(text))
}

async function signInForm(page, email) {
  await page.goto(BASE + '/sign-in')
  await settle(page)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
}

async function newPage(browser, label, viewport, { night = false } = {}) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addInitScript(PATH_LOG)
  if (night) await ctx.addInitScript(() => localStorage.setItem('kf_theme', 'night'))
  const page = await ctx.newPage()
  watch(page, label)
  return { ctx, page }
}

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium
  .launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  .catch(() => chromium.launch())

if (MODE === 'main') {
  console.log(`build: ${await (await fetch(BASE + '/version.json')).text()}`.trim())
  console.log(`account: ${EMAIL}`)
  const { ctx, page } = await newPage(browser, 'desktop', DESKTOP)

  // ── 1. Signed out: unknown addresses and the (now production-absent) galleries ──
  console.log('\n# signed out')
  for (const r of ['/nope', '/tasks/nope/deeper', '/capture', '/seasons', '/design-system']) {
    await page.goto(BASE + r)
    await settle(page)
    const text = await body(page)
    check(`signed out ${r}: not-found page`, text.includes("This page isn't here") && path(page) === r, `landed ${path(page)}`)
    await checkCalm(page, `signed out ${r}`, ['Good morning, Kai', 'Friday, July 10', 'Component kit'])
    if (r === '/nope') await shot(page, 'desktop-signedout-nope')
    if (r === '/capture') await shot(page, 'desktop-signedout-capture')
  }
  await page.click('text=Back to sign in')
  check('signed out not-found: "Back to sign in" → /sign-in', await waitForPath(page, '/sign-in'), path(page))
  await page.goto(BASE + '/today')
  check('signed out /today (a known page) still goes to sign-in', await waitForPath(page, '/sign-in'), path(page))

  // ── 2. A brand-new account through the sign-up form ──
  console.log('\n# sign up → onboarding → Today')
  await page.goto(BASE + '/sign-in')
  await settle(page)
  await page.click('text=Create an account')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await resetPaths(page)
  await page.click('button[type="submit"]')
  const onOnboarding = await waitForPath(page, '/onboarding')
  await settle(page)
  const signupPaths = await paths(page)
  check('sign-up lands on /onboarding', onOnboarding, `paths ${signupPaths.join(' → ')}`)
  check('sign-up never touched /today before onboarding', !signupPaths.includes('/today'))
  await shot(page, 'desktop-signup-onboarding')
  await page.fill('.ob-finput', 'Polish')
  for (let i = 0; i < 8; i++) {
    const cta = page.locator('.ob-cta')
    const label = (await cta.textContent())?.trim() ?? ''
    await cta.click()
    await sleep(300)
    if (label.startsWith('Enter your garden')) break
  }
  check('finishing onboarding lands on Today', await waitForPath(page, '/today'), path(page))
  await settle(page, 1500)
  await shot(page, 'desktop-onboarded-today')
  // The outbox write reached the server (so the next sign-in can know).
  let onboardedAt = null
  for (let i = 0; i < 20 && !onboardedAt; i++) {
    onboardedAt = await page.evaluate(
      async ({ API, ANON }) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        const token = JSON.parse(localStorage.getItem(key)).access_token
        const res = await fetch(`${API}/rest/v1/app_settings?select=onboarded_at`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
        const rows = await res.json()
        return rows[0]?.onboarded_at ?? null
      },
      { API, ANON },
    )
    if (!onboardedAt) await sleep(500)
  }
  check('app_settings.onboarded_at saved on the server', !!onboardedAt, String(onboardedAt))

  // ── 3. Signed in: not-found inside the shell, galleries gone, /share still works ──
  console.log('\n# signed in')
  for (const r of ['/nope', '/tasks/nope/deeper', '/capture', '/seasons', '/design-system']) {
    await page.goto(BASE + r)
    await settle(page)
    const text = await body(page)
    const shell = await page.locator('aside').count()
    check(`signed in ${r}: not-found inside the shell`, text.includes("This page isn't here") && path(page) === r && shell > 0, `landed ${path(page)}, aside=${shell}`)
    await checkCalm(page, `signed in ${r}`, ['Good morning, Kai', 'Friday, July 10', 'Component kit'])
    if (r === '/nope') await shot(page, 'desktop-signedin-nope')
    if (r === '/tasks/nope/deeper') await shot(page, 'desktop-signedin-tasks-nope-deeper')
    if (r === '/capture') await shot(page, 'desktop-signedin-capture')
    if (r === '/seasons') await shot(page, 'desktop-signedin-seasons')
  }
  await page.click('main >> text=Back to Today')
  check('signed in not-found: "Back to Today" → /today', await waitForPath(page, '/today'), path(page))
  await settle(page)

  const shared = `hi from polish-a ${RUN}`
  await page.goto(`${BASE}/share?text=${encodeURIComponent(shared)}`)
  const onInbox = await waitForPath(page, '/inbox')
  await settle(page, 1500)
  check('/share?text=… lands in Inbox', onInbox, path(page))
  check('/share: the shared text is in the Inbox', (await body(page)).includes(shared))
  await shot(page, 'desktop-share-inbox')

  // ── 4. Sign out, sign in again as the same account → straight to Today ──
  console.log('\n# sign out → sign in again')
  await page.locator('aside >> text=Sign out').first().click()
  check('sign out → /sign-in', await waitForPath(page, '/sign-in'), path(page))
  await settle(page)
  await resetPaths(page)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  const onToday = await waitForPath(page, '/today')
  await settle(page, 1500)
  const againPaths = await paths(page)
  check('signing in again lands on /today', onToday, `paths ${againPaths.join(' → ')}`)
  check('…without passing through /onboarding', !againPaths.includes('/onboarding'))
  await shot(page, 'desktop-signin-again-today')
  await ctx.close()

  // ── 5. Phone width + night theme, once each side of sign-in ──
  console.log('\n# phone + night')
  {
    const { ctx, page } = await newPage(browser, 'phone', PHONE)
    await page.goto(BASE + '/tasks/nope/deeper')
    await settle(page)
    check('phone signed out: not-found', (await body(page)).includes("This page isn't here"))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    check('phone signed out: no horizontal overflow', overflow <= 0, `${overflow}px`)
    await shot(page, 'phone-signedout-nope')
    await signInForm(page, EMAIL)
    check('phone sign-in lands on /today', await waitForPath(page, '/today'), path(page))
    await settle(page, 1500)
    await page.goto(BASE + '/capture')
    await settle(page)
    check('phone signed in /capture: not-found', (await body(page)).includes("This page isn't here"))
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    check('phone signed in: no horizontal overflow', overflow2 <= 0, `${overflow2}px`)
    await shot(page, 'phone-signedin-capture')
    await ctx.close()
  }
  {
    const { ctx, page } = await newPage(browser, 'night', DESKTOP, { night: true })
    await page.goto(BASE + '/nope')
    await settle(page)
    check('night signed out: not-found', (await body(page)).includes("This page isn't here"))
    await shot(page, 'desktop-night-signedout-nope')
    await signInForm(page, EMAIL)
    await waitForPath(page, '/today')
    await settle(page, 1500)
    await page.goto(BASE + '/nope')
    await settle(page)
    check('night signed in: not-found', (await body(page)).includes("This page isn't here"))
    await shot(page, 'desktop-night-signedin-nope')
    await ctx.close()
  }
}

if (MODE === 'crash') {
  console.log(`scratch build: ${await (await fetch(BASE + '/version.json')).text()}`.trim())
  const { ctx, page } = await newPage(browser, 'crash', DESKTOP)
  const THROWN = 'forced crash for polish-a check'

  console.log('\n# a crash on a top-level route (no shell): /sign-in?crash')
  await page.goto(BASE + '/sign-in?crash')
  await settle(page)
  let text = await body(page)
  check('/sign-in crash: crash page', text.includes('Something went wrong on this page') && text.includes('Reload'))
  await checkCalm(page, '/sign-in crash', [THROWN, 'at SignInPage', '.js:'])
  await shot(page, 'desktop-crash-bare-signin')
  // Reload really reloads (the scratch throw is still there, so the page comes back).
  const loads = []
  page.on('load', () => loads.push(Date.now()))
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  await sleep(1500)
  await settle(page)
  check('bare crash: Reload reloads the page', loads.length >= 1 && (await body(page)).includes('Something went wrong on this page'), `loads=${loads.length}`)

  console.log('\n# a crash inside the shell: /focus?crash')
  await signInForm(page, EMAIL)
  check('sign in (scratch build) → /today', await waitForPath(page, '/today'), path(page))
  await settle(page)
  await page.goto(BASE + '/focus?crash')
  await settle(page)
  text = await body(page)
  const shell = await page.locator('aside').count()
  check('/focus crash: crash page inside the shell', text.includes('Something went wrong on this page') && shell > 0, `aside=${shell}`)
  check('/focus crash: offers Reload and Back to Today', text.includes('Reload') && text.includes('Back to Today'))
  await checkCalm(page, '/focus crash', [THROWN, 'at FocusPage', '.js:'])
  await shot(page, 'desktop-crash-inshell-focus')
  loads.length = 0
  await page.getByRole('button', { name: 'Reload', exact: true }).click()
  await sleep(1500)
  await settle(page)
  check('in-shell crash: Reload reloads the page', loads.length >= 1 && (await body(page)).includes('Something went wrong on this page'), `loads=${loads.length}`)
  await page.click('main >> text=Back to Today')
  check('crash: "Back to Today" → /today', await waitForPath(page, '/today'), path(page))
  await settle(page)
  check('…and Today renders normally', !(await body(page)).includes('Something went wrong on this page'))

  console.log('\n# a crash on Today itself: /today?crash')
  await page.goto(BASE + '/today?crash')
  await settle(page)
  text = await body(page)
  check('/today crash: crash page', text.includes('Something went wrong on this page'))
  check('/today crash: no "Back to Today" (it would only repeat the crash)', !(await page.locator('main >> text=Back to Today').count()))
  await shot(page, 'desktop-crash-inshell-today')
  // The sidebar still works after a crash.
  await page.locator('aside >> a[href="/inbox"]').first().click()
  check('after a crash the sidebar still navigates (→ /inbox)', await waitForPath(page, '/inbox'), path(page))
  await settle(page)
  check('…and Inbox renders normally', !(await body(page)).includes('Something went wrong on this page'))
  await ctx.close()

  const { ctx: pctx, page: phone } = await newPage(browser, 'crash-phone', PHONE)
  await phone.goto(BASE + '/sign-in?crash')
  await settle(phone)
  check('phone bare crash page', (await body(phone)).includes('Something went wrong on this page'))
  await shot(phone, 'phone-crash-bare-signin')
  await pctx.close()
}

await browser.close()
const unexpected = errors.filter((e) => !e.includes('open-meteo') && !e.includes('ERR_TUNNEL_CONNECTION_FAILED'))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`)
console.log(unexpected.length ? 'CONSOLE ERRORS (excluding open-meteo):\n' + unexpected.join('\n') : 'console clean (excluding open-meteo)')
const tunnel = errors.length - unexpected.length
console.log(`open-meteo / ERR_TUNNEL_CONNECTION_FAILED lines ignored: ${tunnel}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
