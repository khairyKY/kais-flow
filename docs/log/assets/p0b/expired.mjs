// Scope (3) real run: a write queued offline, then the session expires (refresh fails) before
// reconnect. It must stay queued — not go out with the anon key and get dead-lettered — and
// flush once the same account signs back in.
// usage: node expired.mjs <label>
import { launch, watch, signIn, ensureOnboarded, idbGet, rest, BASE, waitFor, EMAIL, PASS } from './lib.mjs'

const [label = 'run'] = process.argv.slice(2)
const errs = []
await ensureOnboarded()
const probe = `Expired-session probe ${label} ${Date.now()}`
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Cairo' })
const page = await ctx.newPage()
watch(page, label, errs)
await signIn(page)
await page.goto(BASE + '/tasks')
await page.waitForTimeout(2500)
await page.reload()
await page.waitForTimeout(2500)
const log = (...a) => console.log(`[${label}]`, ...a)
const outbox = async () => (await idbGet(page, 'kf-outbox')) ?? []
const dead = async () => (await idbGet(page, 'kf-outbox-dead')) ?? []
const onServer = async () => (await rest(`inbox_items?select=id&raw_text=eq.${encodeURIComponent(probe)}`)).data.length

await ctx.setOffline(true)
await page.waitForTimeout(400)
await page.keyboard.press('Control+k')
await page.waitForTimeout(800)
await page.keyboard.type(probe, { delay: 15 })
await page.keyboard.press('Enter')
await page.waitForTimeout(1500)
const q0 = await outbox()
log('offline: queued =', q0.length, '| entries tagged uid =', JSON.stringify(q0.map((e) => e.uid ?? null)))

// The session expires while offline: access token past its expiry, refresh token no longer valid.
await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))
  const s = JSON.parse(localStorage.getItem(k))
  s.expires_at = Math.floor(Date.now() / 1000) - 3600
  s.refresh_token = 'expired-refresh-token'
  localStorage.setItem(k, JSON.stringify(s))
})
await ctx.setOffline(false)
await page.reload() // boots online with the expired session; the refresh fails
await page.waitForTimeout(6000)
log('online, session expired: url =', new URL(page.url()).pathname, '| queued =', (await outbox()).length, '| dead letters =', (await dead()).length, '| on server =', await onServer())

// The same account signs back in.
if (await page.locator('input[type="email"]').count()) {
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
}
const drained = await waitFor(async () => (await outbox()).length === 0, 40000)
log('after sign-in: url =', new URL(page.url()).pathname, '| drained =', drained, '| dead letters =', (await dead()).length, '| on server =', await onServer())
await ctx.close()
await browser.close()
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.map((e) => e.slice(0, 1500)).join('\n') : 'console clean (open-meteo ignored)')
