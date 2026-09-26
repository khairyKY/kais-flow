import { chromium } from 'playwright'
const [base, out] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const errs = []
async function signIn(page, email) {
  await page.goto(base + '/sign-in'); await page.waitForTimeout(800)
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', 'localtest123')
  await page.click('button[type="submit"]'); await page.waitForTimeout(2500)
}
// 1) phone Settings
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Africa/Cairo' })
  const page = await ctx.newPage(); page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errs.push(m.text()) })
  await signIn(page, 'kai.local@example.com')
  await page.goto(base + '/settings'); await page.waitForTimeout(1500)
  const before = await page.evaluate(() => ({ zoom: document.documentElement.style.zoom || '1', grain: getComputedStyle(document.documentElement).getPropertyValue('--kf-grain-opacity') }))
  await page.getByRole('button', { name: '110', exact: true }).first().tap()
  await page.waitForTimeout(500)
  const slider = page.getByRole('slider', { name: 'Paper texture' })
  await slider.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ zoom: document.documentElement.style.zoom || '1', grain: getComputedStyle(document.documentElement).getPropertyValue('--kf-grain-opacity'), stored: localStorage.getItem('kf_ui_scale') }))
  const chevrons = await page.locator('text=›').count()
  await page.screenshot({ path: out + '/phone-settings-after.png', fullPage: false })
  console.log('phone settings before', JSON.stringify(before), 'after', JSON.stringify(after), 'chevrons', chevrons)
  await page.evaluate(() => localStorage.removeItem('kf_ui_scale'))
  await ctx.close()
}
// 2) onboarding height for a brand-new account, desktop + phone
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext({ ...opts, timezoneId: 'Africa/Cairo' })
  const page = await ctx.newPage()
  await signIn(page, 'final-onb@example.com')
  await page.waitForTimeout(1000)
  const m = await page.evaluate(() => ({ path: location.pathname, zoom: document.documentElement.style.zoom || '1', win: innerHeight, doc: document.documentElement.scrollHeight }))
  console.log('onboarding', name, JSON.stringify(m), m.doc > m.win + 1 ? 'DOUBLE-SCROLL' : 'ok')
  await ctx.close()
}
console.log(errs.length ? 'console errors: ' + errs.join(' | ') : 'console clean')
await browser.close()
