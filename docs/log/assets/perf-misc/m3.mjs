// M3 (audit 2026-10-22): the kit checkbox replayed boxFill + checkPop whenever it mounted ticked, so
// every phone day swipe re-popped the done blocks. Counts `animationstart` events for those two
// keyframes on the phone calendar (390): on load, through two day swipes, then on a real tick; and
// once more with reduced motion (no pops at all).
//   node m3.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'http://localhost:5299'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000000a7'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm3@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const CREATED = '2026-09-20T12:00:00.000Z'
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const H = 3_600_000
const at = (dayOff, hOff) => new Date(Date.now() + dayOff * 24 * H + hOff * H).toISOString()
const task = (n, title, dayOff, hOff, done) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: done ? 'done' : 'todo', due_at: null,
  scheduled_start: at(dayOff, hOff), scheduled_end: at(dayOff, hOff + 1), top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null,
  duration_min: 60, someday: false, reminder_at: null, reminder_sent: false, completed_at: done ? at(dayOff, hOff + 1) : null, paused: false, milestone_id: null,
  deleted_at: null, parent_task_id: null, created_at: CREATED, updated_at: CREATED,
})
// Done blocks on yesterday, today and tomorrow (the panes a swipe mounts), one open block today.
const TASKS = [task(1, 'Done yesterday', -1, -1, true), task(2, 'Done today', 0, -2, true), task(3, 'Done tomorrow', 1, -1, true), task(4, 'Open today', 0, 1, false)]
// A task is on the calendar through its block (type 'task', task_id); the block draws the kit box.
const EVENTS = TASKS.map((t, i) => ({
  id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, user_id: UID, title: t.title, starts_at: t.scheduled_start, ends_at: t.scheduled_end, all_day: false,
  task_id: t.id, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'task', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: [],
  created_at: CREATED, updated_at: CREATED,
}))
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', workspace_name: 'Personal', quiet_hours_on: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    window.__pops = []
    document.addEventListener('animationstart', (e) => { if (e.animationName === 'boxFill' || e.animationName === 'checkPop') window.__pops.push(e.animationName) }, true)
  }, [JSON.stringify(session), UID])
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const rows = { tasks: TASKS, calendar_events: EVENTS, app_settings: [SETTINGS] }[table] ?? []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
  await sleep(2500)
  return { ctx, page }
}
const pops = (page) => page.evaluate(() => window.__pops.splice(0).join(','))
const ticked = (page) => page.locator('.pc-scroll [role="checkbox"][aria-checked="true"]:visible').count()
async function swipe(page, dir) {
  const r = await page.locator('.pc-scroll').boundingBox()
  const y = r.y + 60
  const x0 = dir > 0 ? r.x + r.width - 30 : r.x + 60
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(x0 - dir * 220, y + 4, { steps: 8 })
  await page.mouse.up()
  await sleep(900)
}

for (const reduced of ['no-preference', 'reduce']) {
  const tag = reduced === 'reduce' ? 'reduced motion: ' : ''
  const { ctx, page } = await open(reduced)
  const onLoad = await pops(page)
  check(`${tag}a done block that loads ticked doesn't pop`, (await ticked(page)) >= 1 && onLoad === '', `${await ticked(page)} ticked on screen · pops: ${onLoad || 'none'}`)
  await swipe(page, 1) // → tomorrow
  const fwd = await pops(page)
  await page.screenshot({ path: `${OUT}/m3-${reduced}-tomorrow.png` })
  await swipe(page, -1) // ← back to today
  const back = await pops(page)
  check(`${tag}two day swipes re-pop nothing`, fwd === '' && back === '', `forward: ${fwd || 'none'} · back: ${back || 'none'} · ${await ticked(page)} ticked on today`)
  const open4 = page.locator('[role="checkbox"][aria-label="Complete \\"Open today\\""]:visible').first()
  await open4.scrollIntoViewIfNeeded()
  await open4.click()
  await sleep(600)
  const tick = await pops(page)
  if (reduced === 'reduce') check('reduced motion: a real tick fills without the pop', tick === '', tick || 'none')
  else check('a real tick still pops (boxFill then checkPop)', tick === 'boxFill,checkPop', tick || 'none')
  await page.screenshot({ path: `${OUT}/m3-${reduced}-ticked.png` })
  await ctx.close()
}
fs.writeFileSync(`${OUT}/m3.json`, JSON.stringify(results, null, 2))
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`)
await browser.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
