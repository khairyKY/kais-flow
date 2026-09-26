// Shell-fit matrix: scale × viewport × route. Checks doc height = window, sidebar footer visible
// (desktop), last content above the tab bar after scrolling to the bottom (phone).
import { chromium } from 'playwright'
const [base, label, shotDir] = process.argv.slice(2)
const scales = ['1', '1.1', '1.25', '1.5', '1.75']
const routes = ['/today', '/calendar', '/journal', '/settings']
const vps = [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
let pass = 0, fail = 0
for (const [vpName, opts] of vps) for (const scale of scales) {
  const ctx = await browser.newContext({ ...opts, timezoneId: 'Africa/Cairo' })
  await ctx.addInitScript((s) => { try { localStorage.setItem('kf_ui_scale', s) } catch {} }, scale)
  const page = await ctx.newPage()
  // Sign in for real and prove it: retry until we're inside the app shell.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(base + '/sign-in'); await page.waitForTimeout(1500)
    if (!(await page.locator('input[type="email"]').count())) break
    await page.locator('input[type="email"]').fill('kai.local@example.com')
    await page.locator('input[type="password"]').fill('localtest123')
    if ((await page.locator('input[type="email"]').inputValue()) !== 'kai.local@example.com') continue
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(2500)
    if (!new URL(page.url()).pathname.startsWith('/sign-in')) break
  }
  if (new URL(page.url()).pathname.startsWith('/sign-in')) { console.log(`✗ ${label} ${vpName} ${scale} SIGN-IN FAILED`); fail++; await ctx.close(); continue }
  for (const r of routes) {
    await page.goto(base + r); await page.waitForTimeout(1400)
    const m = await page.evaluate(async () => {
      const se = document.scrollingElement
      const res = { zoom: document.documentElement.style.zoom || '1', win: innerHeight, doc: se.scrollHeight }
      const footer = [...document.querySelectorAll('.app-sidebar .kf-side-row, .app-sidebar button, .app-sidebar a')].find((el) => /Sign out/.test(el.textContent || ''))
      if (footer && footer.getBoundingClientRect().width > 0) { const b = footer.getBoundingClientRect(); res.signOutBottom = Math.round(b.bottom); res.signOutVisible = b.bottom <= innerHeight + 0.5 && b.top >= 0 }
      const tabEl = document.querySelector('.app-tabbar')
      const tab = tabEl && getComputedStyle(tabEl).display !== 'none' ? tabEl : null
      res.shell = !!document.querySelector('.app-shell')
      const main = document.querySelector('.app-main-content')
      if (tab && main) {
        main.scrollTop = main.scrollHeight; await new Promise((r) => setTimeout(r, 300))
        const tabTop = tab.getBoundingClientRect().top
        // Content = readable or tappable leaves (own text, media, controls), in normal flow. Decorative
        // full-bleed backgrounds may run under the bar; content may not. Anything inside a fixed layer,
        // or clipped by an inner scroller that itself ends above the bar, is not "the last card".
        const isLeaf = (el) => /^(IMG|SVG|BUTTON|INPUT|TEXTAREA|SELECT|A|CANVAS|VIDEO)$/.test(el.tagName) || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        let worst = null
        for (const el of main.querySelectorAll('*')) {
          if (!isLeaf(el)) continue
          const b = el.getBoundingClientRect(); if (!(b.height > 0 && b.width > 0) || b.bottom <= tabTop + 1) continue
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
          let a = el, skip = false
          while (a && a !== main) { const acs = getComputedStyle(a); if (acs.position === 'fixed') { skip = true; break } if (a !== el && /(auto|scroll|hidden|clip)/.test(acs.overflowY) && a.getBoundingClientRect().bottom <= tabTop + 1) { skip = true; break } a = a.parentElement }
          if (skip) continue
          if (!worst || b.bottom > worst.bottom) worst = { bottom: Math.round(b.bottom), el: el.tagName + '.' + String(el.className).slice(0, 24), text: (el.textContent || '').trim().slice(0, 24) }
        }
        res.tabTop = Math.round(tabTop); res.underTab = worst; res.clearOfTab = !worst
      }
      return res
    })
    const ok = m.shell && m.doc === m.win && (vpName === 'desktop' ? m.signOutVisible === true : m.clearOfTab === true)
    ok ? pass++ : fail++
    console.log(`${ok ? '✓' : '✗'} ${label} ${vpName} ${scale} ${r} ${JSON.stringify(m)}`)
    if (shotDir && scale === '1.25' && vpName === 'desktop' && r === '/today') { for (const t of ['day','night']) { await page.evaluate((tt) => { document.documentElement.dataset.theme = tt }, t); await page.waitForTimeout(300); await page.screenshot({ path: `${shotDir}/${label}-desktop-125-today-${t}.png` }) } await page.evaluate(() => { document.documentElement.dataset.theme = 'day' }) }
    if (shotDir && scale === '1' && vpName === 'phone' && r === '/journal') { for (const t of ['day','night']) { await page.evaluate((tt) => { document.documentElement.dataset.theme = tt }, t); await page.waitForTimeout(300); await page.screenshot({ path: `${shotDir}/${label}-phone-100-journal-bottom-${t}.png` }) } await page.evaluate(() => { document.documentElement.dataset.theme = 'day' }) }
  }
  await ctx.close()
}
console.log(`${label}: ${pass} pass, ${fail} fail`)
await browser.close()
