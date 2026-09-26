import { chromium } from 'playwright'
const [base] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const scale of [null, '1.25', '1.75']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Africa/Cairo' })
  if (scale) await ctx.addInitScript((s) => { try { localStorage.setItem('kf_ui_scale', s) } catch {} }, scale)
  const page = await ctx.newPage()
  await page.goto(base + '/sign-in'); await page.waitForTimeout(800)
  if (await page.locator('input[type="email"]').count()) { await page.fill('input[type="email"]', 'kai.local@example.com'); await page.fill('input[type="password"]', 'localtest123'); await page.click('button[type="submit"]'); await page.waitForTimeout(2500) }
  await page.goto(base + '/settings'); await page.waitForTimeout(1500)
  const r = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === '175'); return { vw: innerWidth, btn175right: b ? Math.round(b.getBoundingClientRect().right) : null, docW: document.documentElement.scrollWidth } })
  console.log('scale', scale ?? 'default', JSON.stringify(r), r.btn175right !== null && r.btn175right <= r.vw && r.docW <= r.vw ? 'fits' : 'OVERFLOW')
  if (!scale) await page.screenshot({ path: process.env.SHOT })
  await ctx.close()
}
await browser.close()
