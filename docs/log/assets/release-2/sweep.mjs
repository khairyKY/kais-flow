// Route sweep: every main route × desktop 1280 (125% default) / phone 390 × day / night, on a
// production build against the local stack. Clean = no console/page errors, no error screen,
// no sideways scroll, document height = window (the shell scrolls inside, never the page).
// usage: node sweep.mjs <base> <email> <password> [shotDir]
import { chromium } from 'playwright'
const [base, email, password, shotDir] = process.argv.slice(2)
const routes = ['/today', '/inbox', '/calendar', '/tasks', '/projects', '/routines', '/focus', '/weekly-review', '/journal', '/people',
  '/activity', '/trash', '/settings', '/search', '/library', '/herbarium', '/perennials', '/planning', '/seasons', '/nope']
const vps = [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]
const noise = /open-meteo|ERR_TUNNEL_CONNECTION_FAILED|ERR_ABORTED|net::ERR_ABORTED/
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
let pass = 0; const fails = []
for (const [vp, opts] of vps) for (const theme of ['day', 'night']) {
  const ctx = await browser.newContext({ ...opts, timezoneId: 'Africa/Cairo' })
  await ctx.addInitScript((t) => { try { localStorage.setItem('kf_theme', t) } catch {} }, theme)
  const page = await ctx.newPage()
  let errs = []
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message))
  await page.goto(base + '/sign-in'); await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15000 }); await page.waitForTimeout(1200)
  for (const r of routes) {
    errs = []
    await page.goto(base + r); await page.waitForTimeout(1300)
    const m = await page.evaluate(() => {
      const se = document.scrollingElement
      const text = document.body.innerText
      return { win: innerHeight, doc: se.scrollHeight, sw: se.scrollWidth, iw: innerWidth, crash: /Something went wrong|Unexpected Application Error|Minified React error/.test(text) }
    })
    const problems = []
    if (errs.length) problems.push('console: ' + errs.slice(0, 2).join(' | ').slice(0, 200))
    if (m.crash) problems.push('error screen')
    if (m.sw > m.iw + 1) problems.push(`sideways ${m.sw}>${m.iw}`)
    if (m.doc > m.win + 1) problems.push(`page scroll ${m.doc}>${m.win}`)
    if (problems.length) fails.push(`${vp} ${theme} ${r}: ${problems.join('; ')}`); else pass++
    if (shotDir && theme === 'day' && ['/today', '/calendar', '/tasks'].includes(r)) await page.screenshot({ path: `${shotDir}/sweep-${vp}-${r.slice(1)}.png` })
  }
  await ctx.close()
}
await browser.close()
console.log(`sweep ${pass}/${pass + fails.length} clean`)
for (const f of fails) console.log('✗ ' + f)
