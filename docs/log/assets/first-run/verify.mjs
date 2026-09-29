// First run (First Run.dc.html 9a–9m) on the REAL /sign-in, /reset, /onboarding and /today pages
// against a MOCKED backend — builder D's recipe: the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there) and Playwright answers every auth and
// REST call. No real account, address, password, token or network is involved: the addresses are
// @example.test, the passwords are made up here, and writes are recorded and go nowhere.
//   node verify.mjs <outDir> [baseUrl] [designUrl] [playwright-core path]
// designUrl = design-export/ served statically (python -m http.server); omit it to skip side-by-sides.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:5297'
const DESIGN = process.argv[4] ?? ''
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── a made-up account ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-000000f175a0'
const EMAIL = 'kai@example.test'
const PASSWORD = 'made-up-pass' // 12 characters, never a real password
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, identities: [{ id: UID, provider: 'email' }], created_at: '2026-09-27T04:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const SETTINGS = (onboarded) => ({ id: true, user_id: UID, timezone: 'Africa/Cairo', display_name: null, workspace_name: 'Personal', seed_avatar: null, onboarded_at: onboarded ? '2026-09-01T00:00:00Z' : null, created_at: '2026-09-27T04:00:00Z', updated_at: '2026-09-27T04:00:00Z' })
// Sunday 27 Sep 2026, 07:40 in Cairo (UTC+3) — 9i's morning.
const NOW = new Date('2026-09-27T04:40:00Z')

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = {
  day: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, theme: 'day' },
  night: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, theme: 'night' },
  desktop: { viewport: { width: 1200, height: 760 }, theme: 'day' },
}

/** Opens `url`. `o.signedIn` puts the session in storage; `o.email` is the address this device
 * remembers; `o.onboarded` is the account's settings row; `o.auth` overrides auth answers. */
async function open(view, url, o = {}) {
  const v = VIEWS[view]
  const ctx = await browser.newContext({ viewport: v.viewport, hasTouch: !!v.hasTouch, isMobile: !!v.isMobile, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, email]) => {
    if (sessionStorage.getItem('kf-verify-booted')) return // a reload keeps what the page did
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', t)
    if (sess) localStorage.setItem('sb-127-auth-token', sess)
    if (email) localStorage.setItem('kf.lastEmail', email)
  }, [v.theme, o.signedIn ? JSON.stringify(session) : null, o.email ?? null])
  const state = { offline: false, calls: [], rows: { app_settings: [SETTINGS(!!o.onboarded)], tasks: [] }, auth: o.auth ?? {} }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const u = new URL(req.url())
    if (state.offline) return r.abort('internetdisconnected')
    const body = req.postData() ? JSON.parse(req.postData()) : null
    state.calls.push({ method: req.method(), path: u.pathname, search: u.search, body })
    if (u.pathname.startsWith('/auth/v1/')) {
      const key = `${req.method()} ${u.pathname}`
      const answer = state.auth[key]
      if (answer) return r.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.json) })
      if (key === 'POST /auth/v1/signup' || key === 'POST /auth/v1/token') return r.fulfill({ json: session })
      if (key === 'POST /auth/v1/recover') return r.fulfill({ json: {} })
      if (key === 'POST /auth/v1/logout') return r.fulfill({ status: 204, body: '' })
      return r.fulfill({ json: user }) // GET / PUT /auth/v1/user
    }
    const table = u.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      for (const row of [body].flat().filter(Boolean)) {
        const rows = (state.rows[table] ??= [])
        const i = rows.findIndex((x) => x.id === row.id)
        if (i >= 0) rows[i] = { ...rows[i], ...row }
        else rows.push({ user_id: UID, ...row })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const rows = state.rows[table] ?? []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows', details: 'The result contains 0 rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await sleep(600)
  const cdp = v.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

/** A real touch on phones (CDP), a click on desktop. */
async function tap(env, loc) {
  if (!env.cdp) return loc.click()
  const b = await loc.boundingBox()
  const t = (type, pts) => env.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await t('touchEnd', [])
  await sleep(350)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const calls = (env, key) => env.state.calls.filter((c) => `${c.method} ${c.path}` === key)
const heading = (page) => page.locator('h1').first().innerText().catch(() => '')
const ctaCount = (page) => page.locator('.kf-button--cta:visible').count()
// Desktop renders at the app's 125% UI scale (lib/uiScale.ts, zoom on <html>): measure in CSS px.
const zoomOf = (page) => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--kf-ui-scale')) || 1)
async function box(page, loc) {
  const z = await zoomOf(page)
  const b = await loc.boundingBox()
  return b && { x: b.x / z, y: b.y / z, width: b.width / z, height: b.height / z }
}

// Every screen: no sideways scroll, no text under 12px on the phone, one CTA, the right theme, no errors.
async function basics(env, view, name) {
  const { page, errors } = env
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll`, wide <= VIEWS[view].viewport.width, wide)
  if (view !== 'desktop') {
    const small = await page.evaluate(() => {
      const out = []
      const walk = document.createTreeWalker(document.querySelector('.fr') ?? document.body, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
      return out
    })
    check(`${name} no text under 12px`, small.length === 0, small.slice(0, 4).join(' | '))
  }
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  check(`${name} theme ${VIEWS[view].theme}`, (VIEWS[view].theme === 'night') === (theme === 'night'), theme)
  if (view === 'desktop' && (await page.locator('.fr').count())) {
    const z = await zoomOf(page)
    const fern = await page.locator('.fr-fern').isVisible()
    const bar = await box(page, page.locator('.fr-bar'))
    const col = await box(page, page.locator('.fr-col'))
    const wideCol = await page.locator('.fr-col--wide').count()
    check(`${name} desktop 9m: fern, wordmark bar top-left, centred ${wideCol ? 460 : 400} column (CSS px at ${z}×)`, fern && Math.abs(bar.x - 36) < 1 && Math.abs(bar.y - 18) < 1 && Math.round(col.width) === (wideCol ? 460 : 400) && Math.abs(col.x + col.width / 2 - 600 / z) < 1, JSON.stringify({ fern, bar, col }))
  }
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}

const fill = async (page, label, value) => page.getByLabel(label, { exact: true }).fill(value)

for (const view of ['day', 'night', 'desktop']) {
  const tag = (frame) => `${frame}-${view}`
  const phone = view !== 'desktop'

  // 9a (9l-a at night, 9m-a on desktop) — a fresh device opens on sign up.
  {
    const name = tag('9a')
    const env = await open(view, '/sign-in')
    const { page } = env
    check(`${name} a fresh device opens on sign up`, (await heading(page)) === 'Create your account', await heading(page))
    await fill(page, 'Email', EMAIL)
    await fill(page, 'Password', 'made-up-pw')
    const rule = page.locator('.fr-rule')
    check(`${name} live rule turns sage at 8+`, (await rule.getAttribute('data-state')) === 'ok' && (await rule.innerText()) === '8+ characters' && (await rule.evaluate((e) => getComputedStyle(e).color)) === (await page.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--acc-sage-text)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c })))
    const pw = page.getByLabel('Password', { exact: true })
    check(`${name} password hidden, "Show" is a word`, (await pw.getAttribute('type')) === 'password' && (await page.locator('.fr-show').innerText()) === 'Show')
    await tap(env, page.locator('.fr-show'))
    check(`${name} Show reveals, then reads Hide`, (await pw.getAttribute('type')) === 'text' && (await page.locator('.fr-show').innerText()) === 'Hide')
    await tap(env, page.locator('.fr-show'))
    const input = await box(page, page.locator('.fr-box').first())
    check(`${name} inputs are 48 tall`, Math.round(input.height) === 48, input.height)
    const cta = page.getByRole('button', { name: 'Create account' })
    const cb = await box(page, cta)
    check(`${name} one CTA, full width, 48`, (await ctaCount(page)) === 1 && Math.round(cb.height) === 48 && Math.round(cb.width) === (phone ? 358 : 400), JSON.stringify(cb))
    check(`${name} "Sign in" one tap away`, (await page.locator('.fr-alt').innerText()).includes('Already have an account?') && (await page.getByRole('button', { name: 'Sign in', exact: true }).count()) === 1)
    await shot(page, name)
    await basics(env, view, name)
    // Create account → a session → "/" → onboarding (email confirmation is parked).
    await tap(env, cta)
    await page.waitForURL('**/onboarding', { timeout: 5000 }).catch(() => {})
    const signup = calls(env, 'POST /auth/v1/signup')[0]
    check(`${name} Create account signs up and lands on onboarding`, page.url().endsWith('/onboarding') && signup?.body?.email === EMAIL, page.url())
    check(`${name} the address is remembered for next time`, (await page.evaluate(() => localStorage.getItem('kf.lastEmail'))) === EMAIL)
    await env.ctx.close()
  }

  // 9b-1 — the address already has an account: card under the field, "Sign in instead" → 9j.
  {
    const name = tag('9b-1')
    const env = await open(view, '/sign-in', { auth: { 'POST /auth/v1/signup': { status: 422, json: { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' } } } })
    const { page } = env
    await fill(page, 'Email', EMAIL)
    await fill(page, 'Password', PASSWORD)
    await tap(env, page.getByRole('button', { name: 'Create account' }))
    await sleep(300)
    const card = page.locator('[role="alert"]')
    check(`${name} card names the address`, (await card.innerText()).includes(`${EMAIL} already has an account.`), await card.innerText().catch(() => ''))
    const email = await page.getByLabel('Email', { exact: true }).boundingBox()
    const cb = await card.boundingBox()
    const pwLabel = await page.getByText('Password', { exact: true }).boundingBox()
    check(`${name} card sits under the email field, above Password`, cb.y > email.y + email.height && cb.y + cb.height < pwLabel.y, JSON.stringify({ email, cb, pwLabel }))
    check(`${name} still one CTA`, (await ctaCount(page)) === 1)
    await shot(page, name)
    await basics(env, view, name)
    await tap(env, card.getByRole('button', { name: 'Sign in instead' }))
    check(`${name} Sign in instead → 9j with the address filled`, (await heading(page)) === 'Welcome back' && (await page.getByLabel('Email', { exact: true }).inputValue()) === EMAIL)
    await env.ctx.close()
  }

  // 9b-2 — weak password: the live line counts what's missing; nothing is sent.
  {
    const name = tag('9b-2')
    const env = await open(view, '/sign-in')
    const { page } = env
    await fill(page, 'Email', EMAIL)
    await page.getByLabel('Password', { exact: true }).click()
    await page.keyboard.type('abcde')
    const rule = page.locator('.fr-rule')
    check(`${name} terra line: "Use 8 or more characters — 3 to go"`, (await rule.getAttribute('data-state')) === 'short' && (await rule.innerText()) === 'Use 8 or more characters — 3 to go', await rule.innerText())
    check(`${name} the box shows the focus ring`, (await page.locator('.fr-box:focus-within').count()) === 1)
    await shot(page, name)
    await tap(env, page.getByRole('button', { name: 'Create account' }))
    check(`${name} Create account sends nothing and keeps the password field focused`, calls(env, 'POST /auth/v1/signup').length === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('autocomplete'))) === 'new-password')
    await basics(env, view, name)
    await env.ctx.close()
  }

  // 9b-3 — offline: the chip says so before the tap; a tap anyway keeps the details and offers Retry.
  {
    const name = tag('9b-3')
    const env = await open(view, '/sign-in')
    const { page, ctx, state } = env
    await fill(page, 'Email', EMAIL)
    await fill(page, 'Password', PASSWORD)
    await ctx.setOffline(true)
    state.offline = true
    await sleep(300)
    check(`${name} offline chip "Offline — connect to sign up"`, (await page.getByText('Offline — connect to sign up').count()) === 1)
    await tap(env, page.getByRole('button', { name: 'Create account' }))
    await sleep(500)
    const card = page.locator('[role="alert"]')
    check(`${name} card: "No connection. Your details are kept…" + Retry`, (await card.innerText()).includes('No connection. Your details are kept') && (await card.getByRole('button', { name: 'Retry' }).count()) === 1, await card.innerText().catch(() => ''))
    check(`${name} details kept`, (await page.getByLabel('Email', { exact: true }).inputValue()) === EMAIL && (await page.getByLabel('Password', { exact: true }).inputValue()) === PASSWORD)
    const cb = await box(page, card)
    const cta = await box(page, page.getByRole('button', { name: 'Create account' }))
    check(`${name} card sits right above the CTA`, cb.y + cb.height <= cta.y && cta.y - (cb.y + cb.height) <= 17)
    await shot(page, name)
    await basics(env, view, name)
    await ctx.setOffline(false)
    state.offline = false
    await sleep(300)
    await tap(env, card.getByRole('button', { name: 'Retry' }))
    await page.waitForURL('**/onboarding', { timeout: 5000 }).catch(() => {})
    check(`${name} back online, Retry signs up`, page.url().endsWith('/onboarding'), page.url())
    await env.ctx.close()
  }

  // 9g / 9h / 9i — onboarding: empty, then three lines with a date chip, then Today with the three.
  {
    const env = await open(view, '/onboarding', { signedIn: true })
    const { page } = env
    let name = tag(view === 'night' ? '9l-g' : view === 'desktop' ? '9m-g' : '9g')
    const start = page.getByRole('button', { name: 'Start' })
    check(`${name} one screen: name (optional) + 3 lines`, (await page.getByText('What should we call you?').count()) === 1 && (await page.locator('.fr-hint').innerText()) === 'optional' && (await page.locator('.fr-box--line').count()) === 3)
    check(`${name} Start disabled until a line has text`, await start.isDisabled())
    check(`${name} first line focused with the example`, (await page.evaluate(() => document.activeElement?.getAttribute('placeholder'))) === 'e.g. Call the supplier tomorrow 3pm')
    check(`${name} Skip top-right, Import under Start`, (await page.getByRole('button', { name: 'Skip' }).count()) === 1 && (await page.getByRole('button', { name: 'Import from Akiflow / CSV instead' }).count()) === 1)
    if (phone) {
      const sb = await start.boundingBox()
      check(`${name} Start pinned to the bottom`, sb.y > 844 - 160, sb.y)
    }
    await shot(page, name)
    await basics(env, view, name)

    name = tag('9h')
    await page.getByLabel('What should we call you?').fill('Kai')
    await page.getByLabel('Thing 1').fill('Call the tyre supplier tomorrow 3pm')
    await page.getByLabel('Thing 2').fill('Finish the flow audit')
    await page.getByLabel('Thing 3').fill('Gym')
    await page.getByLabel('Thing 3').blur()
    const chips = await page.locator('.fr-when').allInnerTexts()
    check(`${name} the date parses into a chip under its line only`, JSON.stringify(chips.map((c) => c.toUpperCase().trim())) === JSON.stringify(['TOMORROW · 15:00']), JSON.stringify(chips))
    check(`${name} Start enabled`, await start.isEnabled())
    await shot(page, name)
    await basics(env, view, name)

    name = tag('9i')
    await tap(env, start)
    await page.waitForURL('**/today', { timeout: 5000 }).catch(() => {})
    // The outbox writes behind; give it until every write has landed (or 8s).
    for (let i = 0; i < 40 && !(env.state.rows.tasks.length === 3 && env.state.rows.tasks.every((t) => t.top3) && env.state.rows.app_settings[0].onboarded_at); i++) await sleep(200)
    await sleep(400)
    const tasks = env.state.rows.tasks
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]))
    check(`${name} Start → Today`, page.url().endsWith('/today'), page.url())
    check(`${name} three tasks, every one Top 3`, tasks.length === 3 && tasks.every((t) => t.top3 === true), JSON.stringify(tasks.map((t) => [t.title, t.top3])))
    check(`${name} date words left the title and stayed as the date`, byTitle['Call the tyre supplier']?.due_at === '2026-09-28T12:00:00.000Z' && byTitle['Finish the flow audit']?.due_at === null && byTitle.Gym?.due_at === null, JSON.stringify(tasks.map((t) => [t.title, t.due_at])))
    const settings = env.state.rows.app_settings[0]
    check(`${name} name saved, onboarded`, settings.display_name === 'Kai' && !!settings.onboarded_at, JSON.stringify(settings))
    const body = await page.locator('body').innerText()
    check(`${name} Today lists the three`, ['Call the tyre supplier', 'Finish the flow audit', 'Gym'].every((t) => body.includes(t)))
    await shot(page, name)
    check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
    await env.ctx.close()
  }

  // Skip — the empty path: onboarded, no tasks, Today.
  {
    const name = tag('skip')
    const env = await open(view, '/onboarding', { signedIn: true })
    await tap(env, env.page.getByRole('button', { name: 'Skip' }))
    await env.page.waitForURL('**/today', { timeout: 5000 }).catch(() => {})
    for (let i = 0; i < 40 && !env.state.rows.app_settings[0].onboarded_at; i++) await sleep(200)
    await sleep(400)
    check(`${name} Skip → Today, onboarded, nothing created`, env.page.url().endsWith('/today') && !!env.state.rows.app_settings[0].onboarded_at && env.state.rows.tasks.length === 0)
    await env.ctx.close()
  }

  // 9j — sign in, the address remembered; a wrong password gets a calm line; then in.
  {
    const name = tag('9j')
    const env = await open(view, '/sign-in', { email: EMAIL, onboarded: true, auth: { 'POST /auth/v1/token': { status: 400, json: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' } } } })
    const { page } = env
    check(`${name} a device that signed in before opens on "Welcome back", pre-filled`, (await heading(page)) === 'Welcome back' && (await page.getByLabel('Email', { exact: true }).inputValue()) === EMAIL)
    check(`${name} no rule line on sign in`, (await page.locator('.fr-rule').count()) === 0)
    await fill(page, 'Password', PASSWORD)
    const forgot = await box(page, page.getByRole('button', { name: 'Forgot password?' }))
    const pwBox = await box(page, page.locator('.fr-box').nth(1))
    check(`${name} Forgot password? right-aligned under the field, 48 tall`, Math.round(forgot.height) === 48 && Math.abs(forgot.x + forgot.width - (pwBox.x + pwBox.width)) < 2 && forgot.y >= pwBox.y + pwBox.height - 1)
    await shot(page, name)
    await basics(env, view, name)
    await tap(env, page.getByRole('button', { name: 'Sign in', exact: true }))
    await sleep(300)
    check(`${name} wrong password → calm line, no raw text`, (await page.locator('[role="alert"]').innerText()).includes("don't match") && !(await page.locator('body').innerText()).includes('Invalid login credentials'))
    await shot(page, `${name}-wrong`)
    delete env.state.auth['POST /auth/v1/token']
    await tap(env, page.getByRole('button', { name: 'Sign in', exact: true }))
    await page.waitForURL('**/today', { timeout: 5000 }).catch(() => {})
    check(`${name} right password → Today`, page.url().endsWith('/today'), page.url())
    await env.ctx.close()
  }

  // 9k-1 — Forgot password? with the address typed: one tap, sent. Resend works; Back returns.
  {
    const name = tag('9k-1')
    const env = await open(view, '/sign-in', { email: EMAIL })
    const { page } = env
    await tap(env, page.getByRole('button', { name: 'Forgot password?' }))
    await sleep(300)
    const recover = calls(env, 'POST /auth/v1/recover')
    check(`${name} one tap sends the link to the typed address`, recover.length === 1 && recover[0].body?.email === EMAIL && decodeURIComponent(recover[0].search).includes('/reset'), JSON.stringify(recover))
    check(`${name} "Reset link sent" names the address`, (await heading(page)) === 'Reset link sent' && (await page.locator('.fr-sub b').innerText()) === EMAIL)
    check(`${name} waiting line + spam hint`, (await page.locator('.fr-waiting').innerText()).toUpperCase().includes('WAITING FOR THE LINK') && (await page.getByText('Not there? Check Spam or Promotions.').count()) === 1)
    check(`${name} no inbox known for example.test → Resend is the one CTA`, (await page.getByRole('link', { name: 'Open email app' }).count()) === 0 && (await ctaCount(page)) === 1)
    await shot(page, name)
    await basics(env, view, name)
    await tap(env, page.getByRole('button', { name: 'Resend link' }))
    await sleep(400)
    check(`${name} Resend sends again, with a toast`, calls(env, 'POST /auth/v1/recover').length === 2 && (await page.locator('.kf-toast-msg').allInnerTexts()).some((t) => t.includes('Sent again')))
    await tap(env, page.getByRole('button', { name: 'Back to sign in' }))
    check(`${name} Back to sign in`, (await heading(page)) === 'Welcome back')
    await env.ctx.close()
  }

  // 9k-1 with a webmail address: "Open email app" is the CTA, Resend secondary.
  if (view === 'day' || view === 'desktop') {
    const name = tag('9k-1-webmail')
    const env = await open(view, '/sign-in', { email: 'kai.flow.demo@gmail.com' })
    await tap(env, env.page.getByRole('button', { name: 'Forgot password?' }))
    await sleep(300)
    const link = env.page.getByRole('link', { name: 'Open email app' })
    check(`${name} Open email app → the webmail inbox, Resend secondary`, (await link.getAttribute('href')) === 'https://mail.google.com/mail/u/0/#inbox' && (await ctaCount(env.page)) === 1 && (await env.page.locator('.kf-button--secondary', { hasText: 'Resend link' }).count()) === 1)
    await shot(env.page, name)
    await env.ctx.close()
  }

  // Forgot password? with the field empty: ask for the address first, nothing sent yet.
  {
    const name = tag('forgot-empty')
    const env = await open(view, '/sign-in', { email: EMAIL })
    const { page } = env
    await fill(page, 'Email', '')
    await tap(env, page.getByRole('button', { name: 'Forgot password?' }))
    check(`${name} asks for the address (no send, email focused)`, (await heading(page)) === 'Reset your password' && calls(env, 'POST /auth/v1/recover').length === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('type'))) === 'email')
    await fill(page, 'Email', EMAIL)
    await tap(env, page.getByRole('button', { name: 'Send reset link' }))
    await sleep(300)
    check(`${name} Send reset link → 9k-1`, (await heading(page)) === 'Reset link sent' && calls(env, 'POST /auth/v1/recover').length === 1)
    await shot(page, name)
    await env.ctx.close()
  }

  // 9k-2 — the link opened here: one field with the live rule, then Today, signed in.
  {
    const name = tag('9k-2')
    const env = await open(view, `/reset#access_token=${jwt}&expires_at=4102444800&expires_in=3600&refresh_token=demo&token_type=bearer&type=recovery`, { onboarded: true })
    const { page } = env
    check(`${name} "Set a new password" for the account`, (await heading(page)) === 'Set a new password' && (await page.locator('.fr-sub').innerText()).startsWith(`For ${EMAIL}.`), await page.locator('.fr-sub').innerText().catch(() => ''))
    check(`${name} one password field (no confirm) + Show`, (await page.locator('input[type="password"]').count()) === 1 && (await page.locator('.fr-show').count()) === 1)
    check(`${name} ← in the bar instead of the wordmark`, (await page.getByRole('button', { name: 'Back to sign in' }).count()) === 1 && (await page.locator('.fr-mark').count()) === 0)
    await page.getByLabel('New password').fill('short')
    await tap(env, page.getByRole('button', { name: 'Save password' }))
    check(`${name} a short password isn't sent`, calls(env, 'PUT /auth/v1/user').length === 0 && (await page.locator('.fr-rule').getAttribute('data-state')) === 'short')
    await page.getByLabel('New password').fill('a-new-made-up-pw')
    await shot(page, name)
    await basics(env, view, name)
    await tap(env, page.getByRole('button', { name: 'Save password' }))
    await page.waitForURL('**/today', { timeout: 5000 }).catch(() => {})
    await sleep(300)
    check(`${name} Save password → Today, signed in, with a toast`, calls(env, 'PUT /auth/v1/user')[0]?.body?.password === 'a-new-made-up-pw' && page.url().endsWith('/today') && (await page.locator('.kf-toast-msg').allInnerTexts()).some((t) => t.includes('New password saved')), page.url())
    await env.ctx.close()
  }

  // 9k-3 — an expired link: one tap sends a new one to the address this device knows.
  {
    const name = tag('9k-3')
    const env = await open(view, '/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { email: EMAIL })
    const { page } = env
    check(`${name} "This reset link has expired" + the address`, (await heading(page)) === 'This reset link has expired' && (await page.locator('.fr-sub').innerText()) === `Reset links last an hour and work once. We'll send a new one to ${EMAIL}.`, await page.locator('.fr-sub').innerText().catch(() => ''))
    check(`${name} Send a new link + Use a different email`, (await ctaCount(page)) === 1 && (await page.getByRole('button', { name: 'Use a different email' }).count()) === 1)
    await shot(page, name)
    await basics(env, view, name)
    await tap(env, page.getByRole('button', { name: 'Send a new link' }))
    await sleep(300)
    check(`${name} Send a new link → sent (9k-1)`, calls(env, 'POST /auth/v1/recover')[0]?.body?.email === EMAIL && (await heading(page)) === 'Reset link sent')
    await env.ctx.close()
  }
  {
    const name = tag('9k-3-other')
    const env = await open(view, '/reset#error=access_denied&error_code=otp_expired', { email: EMAIL })
    await tap(env, env.page.getByRole('button', { name: 'Use a different email' }))
    await sleep(200)
    check(`${name} Use a different email → the request form`, env.page.url().includes('/sign-in?forgot') && (await heading(env.page)) === 'Reset your password')
    await env.ctx.close()
  }
}

// "Waiting for the link…" is true: the link opened in another tab moves this one to 9k-2.
{
  const name = '9k-1-waiting-day'
  const env = await open('day', '/sign-in', { email: EMAIL })
  await tap(env, env.page.getByRole('button', { name: 'Forgot password?' }))
  await sleep(300)
  const other = await env.ctx.newPage()
  await other.clock.install({ time: NOW })
  await other.goto(`${BASE}/reset#access_token=${jwt}&expires_at=4102444800&expires_in=3600&refresh_token=demo&token_type=bearer&type=recovery`, { waitUntil: 'networkidle' })
  await sleep(1200)
  check(`${name} the waiting tab moves on to "Set a new password"`, env.page.url().endsWith('/reset') && (await heading(env.page)) === 'Set a new password', env.page.url())
  await env.ctx.close()
}

// ── Side by side: the design frame | this build, same state. ──
if (DESIGN) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(`${DESIGN}/${encodeURIComponent('First Run.dc.html')}`, { waitUntil: 'networkidle' })
  await sleep(2500)
  const pairs = [['9a', '9a-day'], ['9b-1', '9b-1-day'], ['9b-2', '9b-2-day'], ['9b-3', '9b-3-day'], ['9g', '9g-day'], ['9h', '9h-day'], ['9i', '9i-day'], ['9j', '9j-day'], ['9k-1', '9k-1-day'], ['9k-2', '9k-2-day'], ['9k-3', '9k-3-day'], ['9l-a', '9a-night'], ['9l-g', '9l-g-night'], ['9m-a', '9a-desktop'], ['9m-g', '9m-g-desktop']]
  for (const [frame] of pairs) {
    const el = page.locator(`[id="${frame}"] [data-screen-label]`)
    await el.scrollIntoViewIfNeeded()
    await el.screenshot({ path: path.join(OUT, `design-${frame}.png`) })
  }
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, ours] of pairs) {
    const d = path.join(OUT, `design-${frame}.png`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(o)) continue
    const w = frame.startsWith('9m') ? 1200 : 390
    await page.setViewportSize({ width: w * 2 + 40, height: 1000 })
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff"><div><div>design ${frame}</div><img src="${uri(d)}" style="width:${w}px"></div><div><div>build ${ours}</div><img src="${uri(o)}" style="width:${w}px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
    fs.rmSync(d)
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
