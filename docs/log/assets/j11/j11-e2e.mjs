// J-11 end-to-end against the local Supabase stack. Based on the conductor's smoke.mjs (copied,
// not edited): same Chromium, same error capture, desktop 1280x800 + phone 390x844.
// usage (cloud container, local stack up, dev server on http://127.0.0.1:3000):
//   J11_OLD=<account's current password> J11_RUN=<fresh tag> node j11-e2e.mjs <shotDir>
// Needs, beside this file: node_modules/playwright → the global install, and ../anon.txt holding
// the local stack's public demo ANON_KEY (`npx supabase status -o env`). Never production keys.
// Screenshots in this folder are cropped (desktop → 600x600 around the card) and palette-encoded.
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] ?? './shots'
const BASE = 'http://127.0.0.1:3000'
const API = 'http://127.0.0.1:54321'
const MAIL = 'http://127.0.0.1:54324'
const ANON = fs.readFileSync(new URL('../anon.txt', import.meta.url), 'utf8').trim()
const EMAIL = 'j11@example.com'
const UNKNOWN = 'nobody-j11@example.com'
// Re-runnable: pass the account's current password; each run sets two fresh ones.
const OLD = process.env.J11_OLD ?? 'old-pass-j11'
const RUN = process.env.J11_RUN ?? 'r1'
const NEW_A = `new-pass-j11-A-${RUN}`
const NEW_B = `new-pass-j11-B-${RUN}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const errors = []
// SPA navigations don't reset Playwright's 'networkidle', so settle on our own in-flight count —
// otherwise the script's next page.goto cancels the app's fetches and logs them as ERR_ABORTED.
const inflight = new WeakMap()
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
    if (m.type() === 'error') errors.push(`${label} ${new URL(page.url()).pathname}: ${m.text()} @ ${m.location().url}`)
  })
  page.on('requestfailed', (q) => errors.push(`${label} FAILED ${q.url().slice(0, 90)} ${q.failure()?.errorText}`))
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`))
}

async function shot(page, name) {
  await sleep(400) // let the tape card settle
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path })
  console.log(`      shot ${name}.png (${fs.statSync(path).size} B) at ${new URL(page.url()).pathname}`)
}

// ── Mailpit ──
async function messagesTo(addr) {
  const j = await (await fetch(`${MAIL}/api/v1/messages?limit=200`)).json()
  return (j.messages ?? []).filter((m) => m.To.some((t) => t.Address.toLowerCase() === addr))
}
async function mailSeen(addr) {
  return new Set((await messagesTo(addr)).map((m) => m.ID))
}
async function waitForNewMail(addr, seen) {
  for (let i = 0; i < 40; i++) {
    const fresh = (await messagesTo(addr)).find((m) => !seen.has(m.ID))
    if (fresh) return fresh
    await sleep(500)
  }
  throw new Error(`no new mail for ${addr}`)
}
async function linkFrom(msg) {
  const d = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json()
  const m = /https?:\/\/[^"'\s<>]+\/auth\/v1\/verify\?[^"'\s<>]+/.exec(d.HTML || d.Text)
  return m[0].replaceAll('&amp;', '&')
}
const redact = (link) => link.replace(/token=[^&]+/, 'token=…')

// ── Auth API (evidence independent of the UI) ──
async function passwordStatus(pw) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: pw }),
  })
  return r.status
}
async function recoverVia(redirectTo) {
  const r = await fetch(`${API}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  })
  return r.status
}

const browser = await chromium
  .launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  .catch(() => chromium.launch())

async function newCtx(kind) {
  const viewport = kind.startsWith('desktop') ? { width: 1280, height: 800 } : { width: 390, height: 844 }
  const ctx = await browser.newContext({ viewport })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('kf_theme', t)
    } catch {
      /* about:blank */
    }
  }, kind.endsWith('night') ? 'night' : 'day')
  return ctx
}
const visibleButton = (page, name) => page.locator('button:visible', { hasText: name }).first()
const hasSession = (page) => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')))
const path = (page) => new URL(page.url()).pathname

/** Request step → Mailpit → link. Returns { link, confirmation }. */
async function requestReset(page, label, prefix) {
  await page.goto(`${BASE}/sign-in`)
  await visibleButton(page, 'Forgot password?').waitFor()
  check(`${label}: sign-in shows underlined "Create an account" + "Forgot password?"`,
    (await visibleButton(page, 'Create an account').isVisible()) &&
      (await visibleButton(page, 'Create an account').evaluate((b) => getComputedStyle(b).textDecorationLine)) === 'underline')
  check(`${label}: sign-up button keeps the garden voice`, await (async () => {
    await visibleButton(page, 'Create an account').click()
    const ok = await visibleButton(page, 'Plant your garden').isVisible()
    await visibleButton(page, 'Sign in').click() // "Already have an account? Sign in"
    return ok
  })())
  if (prefix) await shot(page, `${prefix}-1-signin`)
  await visibleButton(page, 'Forgot password?').click()
  await page.fill('input[type="email"]', EMAIL)
  if (prefix) await shot(page, `${prefix}-2-request`)
  const seen = await mailSeen(EMAIL)
  await visibleButton(page, 'Send reset link').click()
  const conf = page.getByText('a link to set a new password is on its way')
  await conf.waitFor()
  const confirmation = await conf.innerText()
  if (prefix) await shot(page, `${prefix}-3-request-sent`)
  const mail = await waitForNewMail(EMAIL, seen)
  const link = await linkFrom(mail)
  check(`${label}: reset email arrived in Mailpit`, !!link, `"${mail.Subject}" → ${redact(link)}`)
  check(`${label}: link redirects to /reset`, new URL(link).searchParams.get('redirect_to') === `${BASE}/reset`)
  return { link, confirmation }
}

async function setNewPassword(page, label, link, pw, prefix) {
  await page.goto(link)
  await page.getByText('choose a new password').waitFor({ timeout: 15000 })
  check(`${label}: link lands on /reset with the new-password form`, path(page) === '/reset', `url=${page.url()}`)
  check(`${label}: tokens are gone from the address bar`, !page.url().includes('access_token'))
  check(`${label}: form names the account`, await page.getByText(`choose a new password for ${EMAIL}`).isVisible())
  if (prefix) await shot(page, `${prefix}-4-reset-form`)

  // Reload mid-reset (build-refresh / discarded tab): hash is gone, form must survive.
  await settle(page)
  await page.reload()
  await page.getByText('choose a new password').waitFor({ timeout: 15000 })
  check(`${label}: form survives a reload mid-reset`, path(page) === '/reset')

  // < 8 characters is blocked client-side (native minLength) — nothing is sent.
  await page.getByLabel('New password').fill('short77')
  await page.getByLabel('Confirm password').fill('short77')
  await visibleButton(page, 'Save new password').click()
  await sleep(500)
  check(`${label}: 7 characters is refused client-side`,
    path(page) === '/reset' && (await page.getByLabel('New password').evaluate((el) => el.validity.tooShort)))

  await page.getByLabel('New password').fill(pw)
  await page.getByLabel('Confirm password').fill(pw + 'x')
  await visibleButton(page, 'Save new password').click()
  check(`${label}: mismatched confirmation gets a calm line`, await page.getByText("Those two passwords don't match").isVisible())

  await page.getByLabel('Confirm password').fill(pw)
  await visibleButton(page, 'Save new password').click()
  await page.waitForURL((u) => ['/today', '/onboarding'].includes(new URL(u).pathname), { timeout: 15000 })
  await settle(page) // let the landing page finish loading before moving on
  check(`${label}: lands in the app signed in`, await hasSession(page), `at ${path(page)}`)
}

// ════════════ Desktop · day ════════════
const d = await newCtx('desktop-day')
const dp = await d.newPage()
watch(dp, 'desktop')
check('baseline: OLD password works before the reset', (await passwordStatus(OLD)) === 200)
const { link: linkA, confirmation: known } = await requestReset(dp, 'desktop', 'desktop-day')

// Unknown email → identical confirmation, and nothing is mailed.
{
  const p = await d.newPage()
  watch(p, 'desktop-unknown')
  await p.goto(`${BASE}/sign-in?forgot`)
  await p.fill('input[type="email"]', UNKNOWN)
  await visibleButton(p, 'Send reset link').click()
  const conf = p.getByText('a link to set a new password is on its way')
  await conf.waitFor()
  const unknown = await conf.innerText()
  check('unknown email → the same confirmation', known.replace(EMAIL, '<email>') === unknown.replace(UNKNOWN, '<email>'), JSON.stringify(unknown))
  await sleep(1500)
  check('unknown email → nothing mailed', (await messagesTo(UNKNOWN)).length === 0)
  await p.close()
}

await setNewPassword(dp, 'desktop', linkA, NEW_A, 'desktop-day')

// Sign out through the app, then OLD fails and NEW works through the sign-in form.
await dp.goto(`${BASE}/today`)
await settle(dp)
await visibleButton(dp, 'Sign out').click()
await dp.waitForURL('**/sign-in', { timeout: 15000 })
check('signed out', !(await hasSession(dp)))
await dp.fill('input[type="email"]', EMAIL)
await dp.fill('input[type="password"]', OLD)
await visibleButton(dp, 'Sign in').click()
await dp.getByText("That email and password don't match").waitFor()
check('OLD password fails in the sign-in form', path(dp) === '/sign-in')
await dp.fill('input[type="password"]', NEW_A)
await visibleButton(dp, 'Sign in').click()
await dp.waitForURL('**/today', { timeout: 15000 })
await settle(dp)
check('NEW password works in the sign-in form', await hasSession(dp))

// Reused link while signed in → error state, session untouched, no "send" CTA.
await dp.goto(linkA)
await dp.getByText('This reset link has expired or has already been used.').waitFor({ timeout: 15000 })
check('reused link (signed in) → error state on /reset', path(dp) === '/reset', `url=${dp.url().slice(0, 110)}`)
check('reused link (signed in) → still signed in, offers the way back', (await hasSession(dp)) && (await visibleButton(dp, "Back to Kai's Flow").isVisible()) && !(await visibleButton(dp, 'Send a new link').isVisible()))

// Reused link in a fresh browser → error state + a way to request a new one.
{
  const f = await newCtx('desktop-day')
  const p = await f.newPage()
  watch(p, 'desktop-fresh')
  await p.goto(linkA)
  await p.getByText('This reset link has expired or has already been used.').waitFor({ timeout: 15000 })
  check('reused link (fresh browser) → error state', path(p) === '/reset' && !(await hasSession(p)))
  await shot(p, 'desktop-day-5-expired')
  await visibleButton(p, 'Send a new link').click()
  await visibleButton(p, 'Send reset link').waitFor()
  check('"Send a new link" → the request step', path(p) === '/sign-in' && new URL(p.url()).searchParams.has('forgot'))
  await f.close()
}

// The trap: recovery links that land off /reset (root redirect, or a non-allow-listed redirect
// that GoTrue replaces with the Site URL) must still reach the form, not /today.
for (const [label, redirectTo] of [['root redirect', `${BASE}/`], ['non-allow-listed redirect', 'https://evil.example/reset']]) {
  await sleep(1200) // local max_frequency is 1s
  const seen = await mailSeen(EMAIL)
  const status = await recoverVia(redirectTo)
  const link = await linkFrom(await waitForNewMail(EMAIL, seen))
  const f = await newCtx('desktop-day')
  const p = await f.newPage()
  watch(p, `trap-${label}`)
  await p.goto(link)
  await p.getByText('choose a new password').waitFor({ timeout: 15000 })
  check(`trap (${label}): recovery re-pointed to /reset, not bounced to /today`, path(p) === '/reset', `recover=${status}`)
  await f.close()
}

// ════════════ Phone · night ════════════
await sleep(1200)
const n = await newCtx('phone-night')
const np = await n.newPage()
watch(np, 'phone')
const { link: linkB } = await requestReset(np, 'phone', 'phone-night')
await setNewPassword(np, 'phone', linkB, NEW_B, 'phone-night')
{
  const f = await newCtx('phone-night')
  const p = await f.newPage()
  watch(p, 'phone-fresh')
  await p.goto(linkB)
  await p.getByText('This reset link has expired or has already been used.').waitFor({ timeout: 15000 })
  check('phone: reused link → error state', path(p) === '/reset')
  await shot(p, 'phone-night-5-expired')
  await f.close()
}

// Final word from the auth API itself.
check('API: OLD password rejected', (await passwordStatus(OLD)) === 400)
check('API: first new password rejected after the second reset', (await passwordStatus(NEW_A)) === 400)
check('API: latest new password accepted', (await passwordStatus(NEW_B)) === 200)

await browser.close()

// open-meteo: blocked by the cloud network policy. 400 on /token: the deliberate OLD-password
// attempt. logout ERR_ABORTED: GoTrue answers 204 and auth-js never reads the body — Chromium
// flags it 2ms after the 204 even with no navigation (probe-logout.mjs); sign-out itself works.
const expected = (e) =>
  e.includes('open-meteo') || /status of 400 .*token\?grant_type=password/.test(e) || /auth\/v1\/logout\S* net::ERR_ABORTED/.test(e)
const unexpected = errors.filter((e) => !expected(e))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`)
console.log(`console/network errors: ${errors.length} total, ${unexpected.length} unexpected`)
for (const e of errors) console.log(`  ${expected(e) ? '(expected)' : '!!'} ${e}`)
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2))
process.exit(results.every((r) => r.ok) && unexpected.length === 0 ? 0 : 1)
