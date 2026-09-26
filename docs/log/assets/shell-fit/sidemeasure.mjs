import { chromium } from 'playwright'
const [base] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) for (const scale of ['1', '1.25']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Africa/Cairo' })
  await ctx.addInitScript((s) => { try { localStorage.setItem('kf_ui_scale', s) } catch {} }, scale)
  const page = await ctx.newPage()
  await page.goto(base + '/sign-in'); await page.waitForTimeout(1500)
  await page.locator('input[type="email"]').fill('kai.local@example.com'); await page.locator('input[type="password"]').fill('localtest123'); await page.locator('button[type="submit"]').click(); await page.waitForTimeout(2500)
  await page.goto(base + '/today'); await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const aside = document.querySelector('.app-sidebar'), foot = document.querySelector('.app-sidebar-footer'), scroll = foot.previousElementSibling
    const navRows = [...aside.querySelectorAll('nav .kf-side-row, nav a')]; const projects = navRows.find((el) => /Projects/.test(el.textContent || ''))
    const sTop = scroll.getBoundingClientRect().top; const z = Number(document.documentElement.style.zoom) || 1; return { projectsBottomInScroll: projects ? Math.round((projects.getBoundingClientRect().bottom - sTop) / z) : null, asideLayoutH: aside.offsetHeight, footLayoutH: foot.offsetHeight, scrollContentH: scroll.scrollHeight, scrollClientH: scroll.clientHeight, projectsVisible: projects ? projects.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().bottom + 0.5 : null }
  })
  console.log(`${w}x${h} @${scale}`, JSON.stringify(m))
  await ctx.close()
}
await browser.close()
