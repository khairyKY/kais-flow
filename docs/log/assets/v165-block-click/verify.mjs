// v165-block-click (Kai 2026-11-17, v1.6.5-test desktop, 1110x598 window): clicking a calendar block "flashes a popover that closes
// again at once" — he couldn't open or use the block. Root cause: lib/motion useOverlayExit. A press on the block with its popover
// open closed the popover (ContextMenu's outside-press), and the same click opened it again inside the 100 ms exit; the hook's
// cleanup had cleared the timer that ends the exit, so `closing` stayed true and the reopened popover was drawn fading out for good
// (kf-pop--out), with Esc and outside presses ignored while "closing". The right-click menu -> click hop did it too.
// Fixed twice over: the hook (a reopen is not an exit) and ContextMenu (a press on the block it hangs off doesn't close it).
// On the REAL app against a MOCKED backend (dev server `--mode mock`; Playwright answers every REST call).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5276] [playwright-core path]
// The day: Wed 18 Nov 2026, Cairo (UTC+2), 00:05, Day view. A plain event "Do your Homework" 00:00-01:00 (the top row of the grid)
// and a task block "Read the chapter" 02:00-03:00. Run at 1110x600 and 1440x900 (UI scale 125%, the desktop default), and 1110x600 at 100%.
// The phone has no ContextMenu popover for a block (BottomSheet), so it is not part of this.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? 'out'
const BASE = process.argv[3] ?? 'http://localhost:5276'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const cairo = (hhmm, day = 18) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, day, h - 2, m)) }
const NOW = cairo('00:05')
const CREATED = cairo('07:00', 1).toISOString()
const task = (n, title, from, to) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null,
  scheduled_start: cairo(from).toISOString(), scheduled_end: cairo(to).toISOString(), top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null,
  duration_min: 60, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null, slot_date: null,
  created_at: CREATED, updated_at: CREATED,
})
const block = (n, title, from, to, over = {}) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: cairo(from).toISOString(), ends_at: cairo(to).toISOString(), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, area_id: null, deleted_at: null, remind_min: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const T = task(1, 'Read the chapter', '02:00', '03:00')
const rows = () => structuredClone({
  tasks: [T], calendar_events: [block(1, 'Do your Homework', '00:00', '01:00'), block(2, 'Read the chapter', '02:00', '03:00', { task_id: T.id, type: 'task' })],
  inbox_items: [], projects: [], domains: [], areas: [],
  app_settings: [{ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:tasks'], calendar_day_count: 1, calendar_default_view: 'day', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  activity_log: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(w, h, scale) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, now, sc]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess); localStorage.setItem('kf_ui_scale', String(sc))
    localStorage.setItem('kf.calRailFolded', '1'); localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, NOW.getTime(), scale])
  const data = rows()
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rs = data[table] ?? []
    if (one) return rs.length ? r.fulfill({ json: rs[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rs, headers: { 'content-range': `0-${Math.max(0, rs.length - 1)}/${rs.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
  await sleep(1800)
  // Every popover that ever carries the exit class, and every popover node added: a flash is a node that is drawn fading out.
  await page.evaluate(() => {
    window.__out = 0; window.__added = 0
    const seen = new WeakSet()
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'childList') for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('.kf-pop, [aria-label^="Block"]')) window.__added++
        if (m.type === 'attributes' && m.target.classList?.contains('kf-pop--out') && !seen.has(m.target)) { seen.add(m.target); window.__out++ }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  })
  return { ctx, page, errors }
}
const state = (page) => page.evaluate(() => {
  const el = document.querySelector('[aria-label="Block details"], [aria-label="Block menu"], .tp-pop')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { kind: /^Task/.test(el.getAttribute('aria-label') ?? 'Task') ? 'task' : el.getAttribute('aria-label'), out: el.classList.contains('kf-pop--out') || !!el.closest('.kf-pop--out'), opacity: Number(getComputedStyle(el).opacity), left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight }
})
const onScreen = (s) => s && s.left >= 0 && s.top >= 0 && s.right <= s.vw + 0.5 && s.bottom <= s.vh + 0.5
const blk = (page, title) => page.locator('.fc-timegrid-event', { hasText: title }).first()
// A human click: the press is held a few tens of ms (Playwright's default is 0, which hid it before).
const tap = async (page, box, o = {}) => { await page.mouse.move(box.x + 80, box.y + 30); await page.mouse.down(o); await sleep(o.hold ?? 40); await page.mouse.up(o) }
const mark = (page) => page.evaluate(() => { window.__out = 0; window.__added = 0 })
const counts = (page) => page.evaluate(() => ({ out: window.__out, added: window.__added }))

for (const [w, h, scale] of [[1110, 600, 1.25], [1440, 900, 1.25], [1110, 600, 1]]) {
  const tag = `${w}x${h}@${Math.round(scale * 100)}`
  const { ctx, page, errors } = await open(w, h, scale)
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) })
  const home = blk(page, 'Do your Homework')
  check(`${tag} the day opens with both blocks, Homework in the 12 AM row`, (await page.locator('.fc-timegrid-event').count()) >= 2 && (await home.boundingBox()).y < 220)

  // 1 · a click opens the details and they stay (the one thing Kai could not do)
  let box = await home.boundingBox()
  await mark(page)
  await tap(page, box)
  await sleep(700)
  let s = await state(page)
  check(`${tag} a click on the 12 AM block opens its details`, s?.kind === 'Block details', JSON.stringify(s))
  check(`${tag} ...they stay (not fading out, fully drawn) after 700 ms`, s && !s.out && s.opacity === 1 && (await counts(page)).out === 0, JSON.stringify(s))
  check(`${tag} ...placed fully on screen`, onScreen(s), s && `${s.left.toFixed(0)},${s.top.toFixed(0)}-${s.right.toFixed(0)},${s.bottom.toFixed(0)} in ${s.vw}x${s.vh}`)
  await shot('1-details')

  // 2 · the same block clicked again, then hammered: no close, no reopen, no fade, same popover
  await mark(page)
  await tap(page, box)
  await sleep(500)
  s = await state(page)
  let c = await counts(page)
  check(`${tag} a second click on the same block keeps the popover open and still`, s?.kind === 'Block details' && !s.out && s.opacity === 1, JSON.stringify(s))
  check(`${tag} ...no flicker: no popover was added or faded out meanwhile`, c.out === 0 && c.added === 0, JSON.stringify(c))
  await mark(page)
  for (let i = 0; i < 6; i++) { await tap(page, box, { hold: 25 + i * 10 }); await sleep(60 + i * 25) }
  await sleep(500)
  s = await state(page)
  c = await counts(page)
  check(`${tag} six quick clicks in a row: still open, never faded out`, s?.kind === 'Block details' && !s.out && s.opacity === 1 && c.out === 0, JSON.stringify({ s, c }))

  // 3 · Esc and an outside press still close it (the exit isn't stuck)
  await page.keyboard.press('Escape')
  await sleep(500)
  check(`${tag} Esc closes it`, (await state(page)) === null)
  await tap(page, box)
  await sleep(500)
  check(`${tag} ...and a click opens it again`, (await state(page))?.kind === 'Block details')
  const col = await page.locator('.fc-timegrid-col[data-date="2026-11-18"]').first().boundingBox()
  await page.mouse.click(col.x + 40, Math.min(h - 20, box.y + 300))
  await sleep(500)
  const afterOutside = await state(page)
  check(`${tag} a press outside closes it`, afterOutside === null || afterOutside.kind !== 'Block details', JSON.stringify(afterOutside))
  await page.keyboard.press('Escape'); await sleep(300)

  // 4 · right-click (menu B at the pointer) and then the click that Kai alternated with: the menu is swapped for the details, no fade
  await mark(page)
  box = await home.boundingBox()
  await page.mouse.click(box.x + 80, box.y + 30, { button: 'right' })
  await sleep(500)
  s = await state(page)
  check(`${tag} a right-click opens the colour menu and it stays, on screen`, s?.kind === 'Block menu' && !s.out && s.opacity === 1 && onScreen(s), JSON.stringify(s))
  await shot('4-menu')
  await tap(page, box)
  await sleep(600)
  s = await state(page)
  check(`${tag} the click after it swaps in the details, drawn fully (not fading out)`, s?.kind === 'Block details' && !s.out && s.opacity === 1, JSON.stringify(s))
  await page.mouse.click(box.x + 80, box.y + 30, { button: 'right' })
  await sleep(500)
  s = await state(page)
  check(`${tag} ...and a right-click on the same block again gives the menu again`, s?.kind === 'Block menu' && !s.out && s.opacity === 1, JSON.stringify(s))
  await page.keyboard.press('Escape'); await sleep(300)

  // 5 · a task block: its task popover, which stays on a second click too
  const read = blk(page, 'Read the chapter')
  await read.scrollIntoViewIfNeeded()
  const rb = await read.boundingBox()
  await tap(page, rb)
  await sleep(600)
  s = await state(page)
  check(`${tag} a task block's click opens its task popover on screen`, s?.kind === 'task' && onScreen(s), JSON.stringify(s))
  await mark(page)
  await tap(page, rb)
  await sleep(500)
  s = await state(page)
  c = await counts(page)
  check(`${tag} ...and a second click keeps it, no flicker`, s?.kind === 'task' && !s.out && s.opacity === 1 && c.added === 0, JSON.stringify({ s, c }))
  await page.keyboard.press('Escape'); await sleep(400)

  // 6 · empty grid still creates by typing in place
  const lane = await page.evaluate(() => {
    const l = document.querySelector('.fc-timegrid-slot-lane[data-time="05:00:00"]')
    l.scrollIntoView({ block: 'center' })
    const r = l.getBoundingClientRect(); const col = document.querySelector('.fc-timegrid-col[data-date="2026-11-18"]').getBoundingClientRect()
    return { x: col.left + col.width / 2, y: r.top + 2 }
  })
  await page.mouse.click(lane.x, lane.y)
  await sleep(500)
  const dr = await page.evaluate(() => { const i = document.querySelector('.kf-draft-input'); return i ? { focused: document.activeElement === i, hasPopover: !!document.querySelector('[aria-label^="Block"]') } : null })
  check(`${tag} a click on empty grid still starts a draft with the title focused`, dr && dr.focused && !dr.hasPopover, JSON.stringify(dr))
  await page.keyboard.press('Escape'); await sleep(300)
  // 7 · dragging the block closes its popover (it would hang where the block was)
  await home.scrollIntoViewIfNeeded()
  box = await home.boundingBox()
  await tap(page, box)
  await sleep(400)
  check(`${tag} (before the drag) the details are open`, (await state(page))?.kind === 'Block details')
  await page.mouse.move(box.x + 80, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 90, { steps: 8 })
  await sleep(300)
  const during = await state(page)
  await page.mouse.up()
  await sleep(400)
  check(`${tag} a drag from the block closes its popover`, during === null || during.out, JSON.stringify(during))
  await page.keyboard.press('Escape'); await sleep(300)
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
