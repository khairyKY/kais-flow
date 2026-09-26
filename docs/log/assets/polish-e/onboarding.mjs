// Item 2: onboarding step 4 no longer promises Google Calendar sync. New account → onboarding.
import { launch, newContext, signIn, triage, OUT, DESKTOP, PHONE, sleep } from './lib.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5247'
const browser = await launch()
const report = {}

async function toStep4(page) {
  const btn = (name) => page.getByRole('button', { name, exact: true })
  await btn('Continue →').click() // 1 → 2
  await btn('Continue →').click() // 2 → 3
  await btn('Next: Tend →').click() // 3 → 4
  await sleep(700)
}

// Desktop, day: the real first run of this account.
{
  const { ctx, errors } = await newContext(browser, BASE, { label: 'onb-desktop', viewport: DESKTOP })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  report.landedOn = new URL(page.url()).pathname
  if (!page.url().includes('/onboarding')) await page.goto(BASE + '/onboarding?replant')
  await page.fill('.ob-finput', 'Polish')
  await toStep4(page)
  const body = await page.locator('.ob-body').innerText()
  report.step4 = {
    hasNewLine: body.includes('Google Calendar sync arrives in a later release.'),
    hasOldPromise: body.includes('Syncs both ways'),
    text: body.split('\n').filter((l) => l.includes('calendar') || l.includes('Calendar')),
  }
  await page.screenshot({ path: `${OUT}/onboarding-step4-desktop-day.png` })
  await page.getByRole('button', { name: 'Next: Cultivate →', exact: true }).click()
  await page.getByRole('button', { name: 'Continue →', exact: true }).click()
  await sleep(600)
  const step6 = await page.locator('.ob-body').innerText()
  report.step6 = step6.split('\n').filter((l) => /Google Calendar|Soon|later release/.test(l))
  await page.screenshot({ path: `${OUT}/onboarding-step6-desktop-day.png` })
  await page.getByRole('button', { name: 'Continue →', exact: true }).click()
  await page.getByRole('button', { name: 'Enter your garden ✿', exact: true }).click()
  await page.waitForURL((u) => u.pathname === '/today', { timeout: 15000 })
  await sleep(1500)
  report.afterFinish = new URL(page.url()).pathname
  report.desktopErrors = triage(errors)
  await ctx.close()
}

// Phone, night: replant view of the same step.
{
  const { ctx, errors } = await newContext(browser, BASE, { label: 'onb-phone', viewport: PHONE, night: true })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(BASE + '/onboarding?replant')
  await sleep(1200)
  await toStep4(page)
  report.phoneTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? 'day')
  report.phoneStep4 = (await page.locator('.ob-body').innerText()).includes('Google Calendar sync arrives in a later release.')
  await page.screenshot({ path: `${OUT}/onboarding-step4-phone-night.png` })
  report.phoneErrors = triage(errors)
  await ctx.close()
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
