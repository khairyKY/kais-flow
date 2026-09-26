// Release-2 evidence: the Day card through a whole day, Up next right-click, Start focus, the fold.
// Production build on :5270 against the local stack; Cairo timezone; Playwright's clock.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad'
const OUT = '/home/user/kais-flow/.claude/worktrees/agent-a5415efae585a6ed4/docs/log/assets/loop-a'
const ids = JSON.parse(readFileSync(`${S}/loop-a/seed-ids.json`, 'utf8'))
const env = Object.fromEntries(readFileSync(`${S}/loop-a/sb.env`, 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const BASE = 'http://127.0.0.1:5270'
const API = 'http://127.0.0.1:54321'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const at = (hhmm) => new Date(`2026-09-26T${hhmm}:00+03:00`)
const ev = { steps: [] }
const note = (k, v) => { ev[k] = v; console.log(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 300)) }
const errors = []
async function rest(path) {
  const r = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: env.ANON_KEY, authorization: `Bearer ${ids.token}` } })
  return r.json()
}
function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error' && !/open-meteo|ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push(`[${tag}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror ${e.message}`))
}
async function signIn(page) {
  await page.goto(BASE + '/sign-in')
  await page.fill('input[type="email"]', ids.email)
  await page.fill('input[type="password"]', ids.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15000 })
  await sleep(1200)
}
const card = (page) => page.locator('[data-day-card]')
async function cardText(page) { await card(page).waitFor(); return (await card(page).innerText()).replace(/\s+/g, ' ').trim() }
async function theme(page, t) { await page.evaluate((t) => localStorage.setItem('kf_theme', t), t); await page.reload(); await card(page).waitFor(); await sleep(800) }
async function rclick(loc) { await loc.scrollIntoViewIfNeeded(); await sleep(400); await loc.click({ button: 'right' }) }
async function menuItems(page) { await sleep(250); return page.$$eval('[role="menu"] [role="menuitem"], [role="menu"] button', (els) => [...new Set(els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))]) }

// activity_log is append-only for users (no delete policy), so the seed's wipe can't clear it —
// clear this account's rows with the LOCAL stack's service key before each run.
{
  const keys = Object.fromEntries(readFileSync(`${S}/loopb/keys.env`, 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
  const r = await fetch(`${API}/rest/v1/activity_log?user_id=eq.${ids.uid}&event_type=in.(ritual.finished,ritual.step_completed,ritual.seeded,ritual.unseeded)`, { method: 'DELETE', headers: { apikey: keys.SERVICE_ROLE_KEY, authorization: `Bearer ${keys.SERVICE_ROLE_KEY}`, prefer: 'return=representation' } })
  note('wiped ritual rows', (await r.json()).length)
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Cairo' })
await ctx.clock.install({ time: at('08:00') })
const page = await ctx.newPage(); watch(page, 'desk')
await signIn(page)
await page.goto(BASE + '/today'); await sleep(1500)

// 1 · 08:00, nothing planned → Plan your day
note('08:00 card', await cardText(page))
await page.screenshot({ path: `${OUT}/1-plan-0800-day.png` })
await theme(page, 'night'); await page.screenshot({ path: `${OUT}/1-plan-0800-night.png` }); await theme(page, 'day')

// 2 · Up next rows act like task rows
const upNext = page.locator('section', { has: page.getByText('Up next', { exact: true }) }).last()
await rclick(upNext.getByText('Deep work — Q4 plan').first())
note('menu task-backed', await menuItems(page))
await page.screenshot({ path: `${OUT}/2-upnext-menu-task.png` })
await page.keyboard.press('Escape'); await sleep(200)
await rclick(upNext.getByText('Sync with Omar').first())
note('menu plain event', await menuItems(page))
await page.screenshot({ path: `${OUT}/2-upnext-menu-event.png` })
await page.keyboard.press('Escape'); await sleep(200)
// left click on the plain event → calendar
await upNext.getByText('Sync with Omar').first().click(); await sleep(800)
note('click plain event →', new URL(page.url()).pathname + new URL(page.url()).search)
await page.goto(BASE + '/today'); await card(page).waitFor(); await sleep(800)
// Start focus from the task-backed row's menu
await rclick(upNext.getByText('Deep work — Q4 plan').first())
await page.getByRole('menuitem', { name: /Start focus/ }).first().click(); await sleep(1200)
note('start focus →', new URL(page.url()).pathname)
note('focus shows task', await page.getByText('Draft the Q4 plan').first().isVisible().catch(() => false))
await page.screenshot({ path: `${OUT}/2-start-focus.png` })
await page.goto(BASE + '/today'); await card(page).waitFor(); await sleep(800)

// 3 · Morning ritual from the Day card → Now
await card(page).getByRole('button', { name: 'Begin' }).click()
await page.getByRole('button', { name: 'Next →' }).last().click() // overdue
await page.getByRole('button', { name: /Keep & continue|Next →/ }).last().click() // top 3
await page.getByText('Inbox to zero').waitFor()
await page.getByRole('button', { name: 'Next →' }).last().click() // inbox
await page.getByText('Time-block your day').waitFor()
await page.getByRole('button', { name: 'Finish — the day has a shape' }).click()
await sleep(2500)
note('08:0x after morning ritual', await cardText(page))
await page.screenshot({ path: `${OUT}/3-now-after-morning.png` })

// 4 · 11:00, the Q4 block is running → Now; Done completes the task with Undo
await page.clock.setSystemTime(at('11:00')); await page.reload(); await sleep(1500)
note('11:00 card', await cardText(page))
await page.screenshot({ path: `${OUT}/4-now-running-1100.png` })
await card(page).getByRole('button', { name: 'Done', exact: true }).click(); await sleep(600)
note('undo toast', await page.getByText(/Undo/).first().isVisible().catch(() => false))
await page.screenshot({ path: `${OUT}/4-done-undo-1100.png` })
await sleep(2500)
const q4 = await rest(`tasks?select=title,status,completed_at&id=eq.${ids.tasks.q4}`)
note('REST q4 after Done', q4)
note('11:0x card after Done', await cardText(page))

// 5 · The fold: collapsed by default, opens, remembered
const fold = page.getByRole('button', { name: /More for today/ })
note('fold label', (await fold.innerText()).replace(/\s+/g, ' '))
note('fold expanded (default)', await fold.getAttribute('aria-expanded'))
note('All open visible before', await page.getByText(/^All open ·/).isVisible().catch(() => false))
await fold.click(); await sleep(300)
note('All open visible after click', await page.getByText(/^All open ·/).isVisible().catch(() => false))
await page.reload(); await sleep(1500)
note('fold expanded after reload', await page.getByRole('button', { name: /More for today/ }).getAttribute('aria-expanded'))
await page.screenshot({ path: `${OUT}/5-fold-open.png`, fullPage: true })
await page.getByRole('button', { name: /More for today/ }).click() // leave it collapsed again

// 6 · 19:00 → Shut down the day; evening ritual seeds tomorrow → Day closed
await page.clock.setSystemTime(at('19:00')); await page.reload(); await sleep(1500)
note('19:00 card', await cardText(page))
await page.screenshot({ path: `${OUT}/6-shutdown-1900-day.png` })
await theme(page, 'night'); await page.screenshot({ path: `${OUT}/6-shutdown-1900-night.png` }); await theme(page, 'day')
await card(page).getByRole('button', { name: 'Begin' }).click()
await page.getByText('Sweep today').waitFor()
await page.getByRole('button', { name: 'Next →' }).last().click()
await page.getByText("Today's garden").waitFor()
await page.getByRole('button', { name: 'Continue' }).last().click()
await page.getByPlaceholder('One line about today…').fill('Release-2 run: the day had a shape.')
await page.keyboard.press('Enter')
await page.getByText("Tomorrow's three").waitFor(); await sleep(600)
await page.getByText('Buy printer ink', { exact: true }).last().click(); await sleep(300)
await page.getByText('Sketch the garden bed layout', { exact: true }).last().click(); await sleep(300)
await page.getByRole('button', { name: 'Tuck them in' }).click()
await page.getByText("The garden's closed.").waitFor()
await page.getByText("The garden's closed.").locator('..').getByRole('button', { name: 'Done', exact: true }).click()
await sleep(3000)
note('19:0x after evening ritual', await cardText(page))
await page.screenshot({ path: `${OUT}/7-closed-day.png` })
await theme(page, 'night'); await page.screenshot({ path: `${OUT}/7-closed-night.png` }); await theme(page, 'day')
note('REST finished', (await rest('activity_log?select=payload&event_type=eq.ritual.finished&order=created_at')).map((r) => `${r.payload.ritual}:${r.payload.date}`))
note('REST seeds', (await rest('activity_log?select=entity_id,payload&event_type=eq.ritual.seeded&order=created_at')).map((r) => r.payload.for_date))

// 7 · 00:30 the next night: still closed (the loop day turns at 04:00)
await page.clock.setSystemTime(new Date('2026-09-27T00:30:00+03:00')); await page.reload(); await sleep(1500)
note('00:30 card', await cardText(page))

// 8 · Phone at 08:00: section order
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, timezoneId: 'Africa/Cairo' })
await phone.clock.install({ time: at('08:00') })
const pp = await phone.newPage(); watch(pp, 'phone')
await signIn(pp); await pp.goto(BASE + '/today'); await sleep(2000)
note('phone card', await cardText(pp))
note('phone section order', await pp.$$eval('main section, [data-day-card]', (els) => els.map((e) => (e.getAttribute('aria-label') || e.querySelector('span')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)).filter(Boolean)))
await pp.screenshot({ path: `${OUT}/8-phone-0800-day.png`, fullPage: true })
await theme(pp, 'night'); await pp.screenshot({ path: `${OUT}/8-phone-0800-night.png`, fullPage: true }); await theme(pp, 'day')

note('consoleErrors', errors)
writeFileSync(`${OUT}/run.json`, JSON.stringify(ev, null, 2))
await browser.close()
