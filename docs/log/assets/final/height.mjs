// Measures shell height vs window at the app's default UI scale, per route and viewport.
import { chromium } from 'playwright'
const [base, label] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [name, opts] of [['desktop1280', { viewport: { width: 1280, height: 800 } }], ['phone390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ ...opts, timezoneId: 'Africa/Cairo' })
  const page = await ctx.newPage()
  await page.goto(base + '/sign-in'); await page.waitForTimeout(800)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'kai.local@example.com'); await page.fill('input[type="password"]', 'localtest123')
    await page.click('button[type="submit"]'); await page.waitForTimeout(2500)
  }
  for (const r of ['/today', '/tasks', '/focus', '/herbarium']) {
    await page.goto(base + r); await page.waitForTimeout(1500)
    const m = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell')
      return { zoom: document.documentElement.style.zoom || '1', win: innerHeight, docScroll: document.documentElement.scrollHeight, shellVisual: shell ? Math.round(shell.getBoundingClientRect().height) : null }
    })
    console.log(label, name, r, JSON.stringify(m), m.docScroll > m.win + 1 ? 'DOUBLE-SCROLL' : 'ok')
  }
  await ctx.close()
}
await browser.close()
