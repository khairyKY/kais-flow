// Bug 2 real runs: signing out with writes still queued (offline), and with an empty queue.
// usage: node signout.mjs <mode> <shotDir>
//   repro  — desktop: offline, capture a line (⌘K), press Sign out; report what happened (parent build)
//   stay   — desktop day: prompt shows; "Stay signed in" keeps the capture; it syncs on reconnect
//   anyway — desktop: prompt shows; "Sign out anyway" really signs out, offline
//   empty  — desktop, online, nothing queued: signs out straight away, server session revoked
//   phone  — 390px night: More sheet → Sign out → prompt; stay; syncs on reconnect
import { launch, watch, signIn, ensureOnboarded, idbGet, rest, BASE, waitFor, API, ANON } from './lib.mjs'

const [mode = 'repro', shotDir = '.'] = process.argv.slice(2)
const phone = mode === 'phone'
const errs = []
await ensureOnboarded()
const probe = `Signout probe ${mode} ${Date.now()}`

const browser = await launch()
const ctx = await browser.newContext({
  viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
  timezoneId: 'Africa/Cairo',
})
await ctx.addInitScript((night) => {
  try {
    localStorage.setItem('kf_theme', night ? 'night' : 'day')
  } catch {}
}, phone)
const page = await ctx.newPage()
watch(page, mode, errs)
await signIn(page)
await page.goto(BASE + '/tasks')
await page.waitForTimeout(2500)
await page.reload() // the service worker now controls the page
await page.waitForTimeout(2500)

const authKey = () => page.evaluate(() => Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k)) ?? null)
const accessToken = () =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))
    return k ? JSON.parse(localStorage.getItem(k)).access_token : null
  })
const outbox = async () => (await idbGet(page, 'kf-outbox')) ?? []
const log = (...a) => console.log(`[${mode}]`, ...a)
const PROMPT = /haven.t synced yet|hasn.t synced yet/

async function queueProbe() {
  await ctx.setOffline(true)
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(800)
  await page.keyboard.type(probe, { delay: 15 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const q = await outbox()
  log('offline: queued entries =', q.length, JSON.stringify(q.map((e) => e.table)))
}

async function pressSignOut() {
  if (phone) {
    await page.getByRole('button', { name: 'More' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Sign out' }).click()
  } else {
    await page.getByText('Sign out', { exact: true }).first().click()
  }
  await page.waitForTimeout(2500)
}

async function probeOnServer() {
  const r = await rest(`inbox_items?select=id,raw_text&raw_text=eq.${encodeURIComponent(probe)}`)
  return r.data?.length ?? 0
}

if (mode === 'empty') {
  await waitFor(async () => (await outbox()).length === 0, 15000)
  const jwt = await accessToken()
  log('online: queue before =', (await outbox()).length, '| signed in =', !!(await authKey()))
  await pressSignOut()
  log('after Sign out: url =', new URL(page.url()).pathname, '| prompt shown =', await page.getByText(PROMPT).count() > 0, '| local session =', !!(await authKey()))
  const u = await fetch(`${API}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })
  log('server: /auth/v1/user with the old token →', u.status, u.status >= 400 ? '(session revoked)' : '(STILL VALID)')
} else {
  await queueProbe()
  await pressSignOut()
  const shown = (await page.getByText(PROMPT).count()) > 0
  log('after Sign out: url =', new URL(page.url()).pathname, '| prompt shown =', shown, '| local session =', !!(await authKey()), '| queued =', (await outbox()).length)
  if (shown) {
    const texts = await page.locator('.kf-overlay-card').allInnerTexts()
    log('prompt text =', JSON.stringify(texts))
    await page.screenshot({ path: `${shotDir}/${mode}-prompt.png` })
  }

  if (mode === 'repro') {
    await ctx.setOffline(false)
    await page.waitForTimeout(8000)
    log('back online: url =', new URL(page.url()).pathname, '| local session =', !!(await authKey()), '| queued =', (await outbox()).length)
    log('server: probe capture rows =', await probeOnServer())
  } else if (mode === 'stay' || mode === 'phone') {
    await page.getByRole('button', { name: 'Stay signed in' }).click()
    await page.waitForTimeout(800)
    log('after Stay: url =', new URL(page.url()).pathname, '| local session =', !!(await authKey()), '| queued =', (await outbox()).length, '| prompt gone =', (await page.getByText(PROMPT).count()) === 0)
    await ctx.setOffline(false)
    const drained = await waitFor(async () => (await outbox()).length === 0, 45000)
    log('back online: drained =', drained, '| server probe capture rows =', await probeOnServer())
  } else if (mode === 'anyway') {
    await page.getByRole('button', { name: /Sign out anyway/ }).click()
    await page.waitForTimeout(2500)
    log('after Sign out anyway (still offline): url =', new URL(page.url()).pathname, '| local session =', !!(await authKey()), '| queued =', (await outbox()).length, '| dead =', ((await idbGet(page, 'kf-outbox-dead')) ?? []).length)
    await page.screenshot({ path: `${shotDir}/${mode}-after.png` })
    await ctx.setOffline(false)
    await page.waitForTimeout(3000)
    log('back online: url =', new URL(page.url()).pathname, '| local session =', !!(await authKey()), '| server probe capture rows =', await probeOnServer(), '(0 = discarded, as chosen)')
  }
}

await ctx.close()
await browser.close()
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console clean (open-meteo ignored)')
