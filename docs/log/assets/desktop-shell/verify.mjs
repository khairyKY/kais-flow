// desktop-shell (2026-11-03): the web half of the quick-capture popup and the kaisflow:// links, on the REAL pages
// against a MOCKED backend (the desktop-polish recipe) with a fake Tauri bridge that records every command.
//   1. Settings -> About -> On this computer -> "Quick capture shortcut": default Ctrl+Shift+K (not plain Ctrl+K),
//      the four choices, a choice reaches Rust as an accelerator, one another app owns is refused and the old one stays,
//      the Mac reads Cmd+Shift+K, and the app tells Rust this device's choice when it starts.
//   2. tray.html?capture (the popup's page): ready once, opens on __kfCapture(true), Enter files the line through the
//      outbox (a POST) and hides the window, Esc hides it, a blur-hide resets it, a "Jump" goes to the main window.
//   3. kaisflow:// links: the signed-in shell takes the link Rust holds and navigates (today, calendar, focus, task/<id>);
//      an unknown link leaves the page alone.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5349] [playwright-core path]
// The dev server: npm run dev -- --port 5349 --mode mock --host ::   (app/.env.mock.local points Supabase at 127.0.0.1:9)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5349'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' - ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d5e1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const LEGAL_TS = fs.readFileSync(new URL('../../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const CONSENTS = ['terms', 'privacy'].map((d, i) => ({ id: `c0000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, document: d, version: LEGAL_TS.match(new RegExp(`${d.toUpperCase()}_VERSION = '([0-9-]+)'`))[1], accepted_at: '2026-10-25T00:00:00Z' }))
const T = '2026-09-01T09:00:00Z'
const TASK_ID = '10000000-0000-4000-8000-000000000001'
const rowsFor = {
  tasks: [{ id: TASK_ID, title: 'Call the tyre supplier', user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T }],
  app_settings: [{ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }],
  consents: CONSENTS,
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

/** A page with a fake Tauri bridge. o.link: what deep_link_take hands back (once). o.refuse: accelerators "another app owns". */
async function open(route, o = {}) {
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 720 }, timezoneId: 'Africa/Cairo', locale: 'en-US', ...(o.mac ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' } : null) })
  await ctx.addInitScript(([sess, link, refuse, store, mac]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v)
    window.__calls = []
    let linkLeft = link
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        window.__calls.push([cmd, args ?? null])
        if (cmd === 'plugin:app|version') return '1.0.0'
        if (cmd === 'capture_shortcut') return !refuse.includes(args.accel)
        if (cmd === 'deep_link_take') { const l = linkLeft; linkLeft = null; return l }
        if (cmd === 'autostart_get') return false
        if (cmd === 'store_install') return false
        return null
      },
    }
  }, [JSON.stringify(session), o.link ?? null, o.refuse ?? [], o.store ?? {}, !!o.mac])
  const writes = []
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = rowsFor[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, writes }
}
const calls = (page, cmd) => page.evaluate((c) => window.__calls.filter((x) => x[0] === c).map((x) => x[1]), cmd)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const rowText = async (page) => {
  const label = (await page.getByText('Quick capture shortcut', { exact: true }).first().locator('xpath=ancestor::*[contains(@class,"st-row")][1]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  return `${label} [${(await page.getByLabel('Quick capture shortcut').innerText()).replace(/\s+/g, ' ')}]`
}

// -- 1 - the Settings row --
{
  const { ctx, page, errors } = await open('/settings/about')
  const text = await rowText(page)
  check('settings: the row is on About > On this computer', text.includes('Quick capture shortcut'), text)
  check('settings: it starts on Ctrl+Shift+K, not plain Ctrl+K', text.includes('Ctrl+Shift+K'), text)
  const started = await calls(page, 'capture_shortcut')
  check("settings: the app tells Rust this device's choice when it starts", started.length > 0 && started.at(-1).accel === 'CommandOrControl+Shift+K', JSON.stringify(started))
  check('settings: the help says Ctrl+K stays in the app', text.includes('Ctrl+K works inside the app'))
  await shot(page, 'settings-row-day')

  const select = page.getByLabel('Quick capture shortcut')
  await select.click()
  const options = (await page.getByRole('option').allInnerTexts()).map((s) => s.trim())
  check('settings: choices are Ctrl+Shift+K, Ctrl+Alt+K, Ctrl+K, Off', JSON.stringify(options) === JSON.stringify(['Ctrl+Shift+K', 'Ctrl+Alt+K', 'Ctrl+K', 'Off']), options.join(' | '))
  await page.getByRole('option', { name: 'Ctrl+K', exact: true }).click()
  await sleep(300)
  const sent = await calls(page, 'capture_shortcut')
  check('settings: choosing Ctrl+K registers CommandOrControl+K', sent.at(-1).accel === 'CommandOrControl+K', JSON.stringify(sent.at(-1)))
  check('settings: the choice is kept for this device', await page.evaluate(() => localStorage.getItem('kf_capture_shortcut')) === 'ctrl-k')
  await select.click()
  await page.getByRole('option', { name: 'Off', exact: true }).click()
  await sleep(300)
  check('settings: Off sends an empty accelerator (unregisters)', (await calls(page, 'capture_shortcut')).at(-1).accel === '')
  check('settings: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open('/settings/about', { refuse: ['CommandOrControl+Alt+K'], store: { kf_capture_shortcut: 'ctrl-k' } })
  check('settings: a saved choice is shown again', (await rowText(page)).includes('Ctrl+K'))
  check('settings: and sent to Rust at start', (await calls(page, 'capture_shortcut')).at(-1).accel === 'CommandOrControl+K')
  await page.getByLabel('Quick capture shortcut').click()
  await page.getByRole('option', { name: 'Ctrl+Alt+K', exact: true }).click()
  await sleep(300)
  const text = await rowText(page)
  check('settings: a key another app owns is refused, with a reason', text.includes('Another app already uses that shortcut'), text)
  check('settings: and the working one stays chosen', await page.evaluate(() => localStorage.getItem('kf_capture_shortcut')) === 'ctrl-k')
  await shot(page, 'settings-row-taken-day')
  await ctx.close()
}
{
  const { ctx, page } = await open('/settings/about', { mac: true })
  const text = await rowText(page)
  check('settings (Mac): reads Cmd+Shift+K and says menu bar', text.includes('\u2318\u21E7K') && text.includes('menu bar'), text)
  await ctx.close()
}

// -- 2 - the popup's page --
{
  const { ctx, page, errors, writes } = await open('/tray.html?capture', { view: { width: 520, height: 160 } })
  const ready = await calls(page, 'capture_ready')
  check('popup: tells Rust it is ready, once', ready.length === 1, JSON.stringify(ready))
  check('popup: closed until Rust opens it (no bar yet)', await page.locator('#kf-capture-input').count() === 0)
  await page.evaluate(() => window.__kfCapture(true))
  await page.waitForSelector('#kf-capture-input')
  await sleep(300)
  check('popup: the bar opens with the cursor in the field', await page.evaluate(() => document.activeElement?.id) === 'kf-capture-input')
  const sizes = await calls(page, 'capture_size')
  check("popup: the window is told the bar's height", sizes.length > 0 && sizes.at(-1).height > 60 && sizes.at(-1).height < 400, JSON.stringify(sizes.at(-1)))
  check("popup: no camera (Paper capture is the main window's)", await page.getByLabel('Scan paper').count() === 0)
  const card = await page.locator('.kf-overlay-card').boundingBox()
  check('popup: the card is the window (edge to edge)', card.x === 0 && card.y === 0 && Math.abs(card.width - 520) < 1, JSON.stringify(card))
  await shot(page, 'popup-open-day')
  await page.keyboard.type('Call the plumber tomorrow 3pm #home')
  await sleep(500)
  const grown = (await calls(page, 'capture_size')).at(-1).height
  check('popup: chips grow the window', grown > sizes.at(-1).height, `${sizes.at(-1).height} -> ${grown}`)
  await shot(page, 'popup-chips-day')
  await page.keyboard.press('Enter')
  await sleep(800)
  const filed = writes.filter((w) => w.method === 'POST' && (w.table === 'inbox_items' || w.table === 'tasks'))
  check('popup: Enter files the line through the outbox', filed.length > 0, filed.map((w) => w.table).join(','))
  check('popup: and hides the window', (await calls(page, 'capture_hide')).length >= 1)
  check('popup: the bar is gone for the next opening', await page.locator('#kf-capture-input').count() === 0)

  const before = (await calls(page, 'capture_hide')).length
  await page.evaluate(() => window.__kfCapture(true))
  await page.waitForSelector('#kf-capture-input')
  await page.keyboard.press('Escape')
  await sleep(300)
  check('popup: Esc hides the window', (await calls(page, 'capture_hide')).length === before + 1)
  await page.evaluate(() => window.__kfCapture(true))
  await page.waitForSelector('#kf-capture-input')
  await page.keyboard.type('half a thought')
  await page.evaluate(() => window.__kfCapture(false))
  await sleep(200)
  await page.evaluate(() => window.__kfCapture(true))
  await page.waitForSelector('#kf-capture-input')
  check('popup: after a click away the next opening starts fresh', await page.inputValue('#kf-capture-input') === '')
  await page.keyboard.type('today')
  await sleep(300)
  await shot(page, 'popup-jump-day')
  if (await page.getByText('Jump', { exact: true }).count()) {
    await page.getByText('Jump', { exact: true }).first().click()
    await sleep(300)
    const opened = await calls(page, 'tray_open')
    check('popup: a Jump opens the main window there', opened.length === 1 && /^\/today/.test(opened[0].route ?? ''), JSON.stringify(opened))
  } else check('popup: a Jump opens the main window there', false, 'no Jump row for "today"')
  check('popup: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// -- 3 - deep links --
const links = [
  ['kaisflow://today', /\/today$/],
  ['kaisflow://calendar', /\/calendar$/],
  ['kaisflow://focus', /\/focus$/],
  [`kaisflow://task/${TASK_ID}`, new RegExp(`/tasks/${TASK_ID}$`)],
  ['kaisflow://today/', /\/today$/],
]
for (const [link, want] of links) {
  const { ctx, page } = await open('/inbox', { link })
  check(`deep link ${link} navigates`, want.test(new URL(page.url()).pathname), new URL(page.url()).pathname)
  await ctx.close()
}
{
  const { ctx, page } = await open('/inbox', { link: 'kaisflow://settings' })
  check('deep link: an unknown one leaves the page where it is', new URL(page.url()).pathname === '/inbox', new URL(page.url()).pathname)
  await ctx.close()
}
{
  // A link that arrives while the app runs: Rust evals window.__kfDeepLink(), which takes it.
  const { ctx, page } = await open('/inbox')
  await page.evaluate(() => { window.__TAURI_INTERNALS__.invoke = async (c) => (c === 'deep_link_take' ? 'kaisflow://calendar' : null) })
  await page.evaluate(() => window.__kfDeepLink())
  await sleep(600)
  check('deep link: one that arrives while the app runs navigates', new URL(page.url()).pathname === '/calendar', new URL(page.url()).pathname)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
