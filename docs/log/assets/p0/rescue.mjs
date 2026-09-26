// P0 rescue proof. phase=lose: on the OLD build, create a person (it dead-letters).
// phase=recover: on the NEW build, same browser profile/origin, just open the app.
import { chromium } from 'playwright'
const [phase, base, profile] = process.argv.slice(2)
const ctx = await chromium.launchPersistentContext(profile, { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Cairo' })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const toasts = []
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) console.log('console error:', m.text()) })
const deadLetters = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('keyval-store'); r.onsuccess = () => { const tx = r.result.transaction('keyval'); const g = tx.objectStore('keyval').get('kf-outbox-dead'); g.onsuccess = () => res((g.result ?? []).map((e) => `${e.table}:${e.payload?.name}:${e.error}`)) }
}))
if (phase === 'lose') {
  await page.goto(base + '/sign-in')
  await page.waitForTimeout(1500)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'p0-rescue@example.com')
    await page.fill('input[type="password"]', 'localtest123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2500)
  }
  await page.goto(base + '/people'); await page.waitForTimeout(1500)
  await page.getByText('+ New person').first().click()
  await page.fill('input[placeholder="Name"]', process.env.PERSON ?? 'Rescue Me')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(3000)
  console.log('dead letters after create:', JSON.stringify(await deadLetters()))
} else {
  await page.goto(base + '/today')
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500)
    const t = await page.locator('text=/Recovered .* hadn.t saved earlier/').allTextContents()
    if (t.length) { toasts.push(...t); break }
  }
  await page.waitForTimeout(2500)
  console.log('toast:', JSON.stringify(toasts))
  console.log('dead letters after recover:', JSON.stringify(await deadLetters()))
  await page.goto(base + '/people'); await page.waitForTimeout(2000)
  await page.screenshot({ path: process.env.SHOT })
}
await ctx.close()
