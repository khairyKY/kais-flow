// cal-scroll (Kai 2026-10-29): "calendars should be horizontally scrollable" — glide through days, desktop and phone.
// On the REAL app against a MOCKED backend (the cal-clicks recipe: dev server in `--mode mock`, a made-up session in
// localStorage, Playwright answers every REST call; writes are recorded).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]          ONLY=d,n,l,m,f,p to run some sections
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), 12:09. A one-hour block "Block N" at 10:00 every day, Oct 7 – Nov 30.
//   D  desktop Week: a trackpad's sideways wheel and Shift + wheel glide the days; the settle lands on a day; the header
//      follows mid-glide; a vertical wheel still scrolls the hours; ‹ › and Today glide (animated); Today from far
//   L  blocks are there for every day that comes into view, mid-glide and after the buffer re-centres
//   M  a drag across a day after a glide writes the right day; a block held at the right edge scrolls on and lands
//      days later; a click still opens the details
//   F  frame timing: no long task (≥ 50ms) inside a scripted glide; reduced motion settles at once; 150% interface
//      size, Day and 3-day views, the second time zone and fit hours glide too
//   P  phone: a fling crosses 2+ days and settles; the title follows mid-swipe; neighbours drawn (no blank day);
//      3 days settles on a day, the week on a week; a tap still opens the details
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5338'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// The glide and its settle: the wheel's quiet (140ms) + the eased settle (≤ 360ms). The buffer's re-centre comes after
// (gridGlide RECENTER_IDLE_MS), out of the glide's frames.
const QUIET_WAIT = 520
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the days: Oct 21 2026 is day 0; Block N at 10:00–11:00 on every day from Oct 7 to Nov 30 ──
const cairo = (hhmm, month, day) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month - 1, day, h - 3, m))
}
const NOW = cairo('12:09', 10, 21)
const CREATED = cairo('07:00', 10, 1).toISOString()
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DAYS = []
for (let d = new Date(Date.UTC(2026, 9, 7)); d <= new Date(Date.UTC(2026, 10, 30)); d = new Date(d.getTime() + 86_400_000)) DAYS.push({ m: d.getUTCMonth() + 1, d: d.getUTCDate() })
const label = ({ m, d }) => `${m === 10 ? 'Oct' : 'Nov'} ${d}`
const EVENTS = DAYS.map((x, i) => ({
  id: eid(i + 1), user_id: UID, title: `Block ${label(x)}`, starts_at: cairo('10:00', x.m, x.d).toISOString(), ends_at: cairo('11:00', x.m, x.d).toISOString(), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
}))
const evOf = (m, d) => EVENTS.find((e) => e.title === `Block ${label({ m, d })}`)
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: [], calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([sess, uid, now, scale, opts]) => {
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '1')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true, ...opts }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, NOW.getTime(), o.scale ? String(o.scale) : null, o.opts ?? {}])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      const rows = (state.rows[table] ??= [])
      if (body && typeof body === 'object') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const i = rows.findIndex((x) => x.id === row.id)
          if (i === -1) rows.push(row)
          else rows[i] = { ...rows[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, errors, state, cdp }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const writesOf = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))

// ── desktop: the glide's state, read off the grid ──
const glide = (page) => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(r)) // a frame: what a person would see
  const body = document.querySelector('.kf-glide .fc-scroller-liquid-absolute')
  const head = document.querySelector('.kf-glide .fc-col-header')
  if (!body || !head) return null
  const axis = head.querySelector('.fc-timegrid-axis').getBoundingClientRect().right
  const br = body.getBoundingClientRect()
  const cells = [...head.querySelectorAll('.fc-col-header-cell[data-date]')].map((c) => ({ date: c.dataset.date, l: c.getBoundingClientRect().left, r: c.getBoundingClientRect().right }))
  const first = cells.find((c) => c.r > axis + 1)
  const onScreen = cells.filter((c) => c.r > axis + 1 && c.l < br.right - 1).map((c) => c.date)
  const scrollers = [...document.querySelectorAll('.kf-glide .fc-scroller')].map((s) => s.scrollLeft)
  return {
    h1: document.querySelector('.cal-head-long')?.textContent ?? '',
    x: body.scrollLeft, scrollers, top: body.scrollTop,
    colW: cells[1] ? cells[1].l - cells[0].l : 0,
    first: first?.date, aligned: !!first && Math.abs(first.l - axis) < 1.5, onScreen, cols: cells.length,
    zoom: parseFloat(getComputedStyle(document.documentElement).zoom) || 1,
  }
})
/** A trackpad's sideways swipe: `px` in wheel deltas, `step` px every `ms`. */
async function swipeWheel(page, px, { step = 24, ms = 16, at = { x: 760, y: 470 }, mid } = {}) {
  await page.mouse.move(at.x, at.y)
  const n = Math.max(1, Math.round(Math.abs(px) / step))
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(Math.sign(px) * step, 0)
    await sleep(ms)
    if (mid && i === Math.round(n * 0.75)) await mid()
  }
}
/** Columns → wheel px: 1:1 (FullCalendar's root undoes the interface zoom, so its px are the screen's). */
const colsPx = (g, cols) => cols * g.colW
const dayAfter = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Every day column on screen has its "Block" drawn on screen. */
const blocksShown = (page) => page.evaluate(() => {
  const body = document.querySelector('.kf-glide .fc-scroller-liquid-absolute')
  const axis = document.querySelector('.kf-glide .fc-col-header .fc-timegrid-axis').getBoundingClientRect().right
  const br = body.getBoundingClientRect()
  const cols = [...document.querySelectorAll('.kf-glide .fc-timegrid-col[data-date]')].filter((c) => { const r = c.getBoundingClientRect(); return r.right > axis + 4 && r.left < br.right - 4 })
  return cols.map((c) => ({ date: c.dataset.date, has: !!c.querySelector('.fc-timegrid-event:not(.fc-event-mirror)') }))
})

// ═══ D · desktop Week: wheel, Shift+wheel, settle, header, ‹ › Today ═══
if (want('d')) {
  const { ctx, page, errors } = await open()
  let g = await glide(page)
  check('d-open Week opens on today at the left (Oct 21 — 27), the days drawn either side (21 columns), on a day boundary', g && g.h1 === 'Oct 21 — 27' && g.first === '2026-10-21' && g.cols === 21 && g.aligned, JSON.stringify(g))
  await shot(page, 'd-open')
  const before = g
  // 2.5 columns of sideways wheel; the header has moved on before the hand lets go.
  let midH1 = ''
  let midG = null
  await swipeWheel(page, colsPx(g, 2.5), { mid: async () => { midG = await glide(page); await sleep(30); midH1 = (await glide(page)).h1 } })
  await shot(page, 'd-mid')
  check('d-wheel mid-glide the days follow the wheel (off a day boundary) and the three scrollers move together', midG && !midG.aligned && midG.x > before.x && new Set(midG.scrollers.map(Math.round)).size === 1, JSON.stringify(midG))
  check('d-wheel mid-glide the header already follows (not Oct 21 — 27)', midH1 && midH1 !== 'Oct 21 — 27', midH1)
  await sleep(900)
  g = await glide(page)
  check('d-wheel 2.5 days of trackpad swipe settle on a day boundary three days on (Oct 24 — 30)', g.aligned && g.first === '2026-10-24' && g.h1 === 'Oct 24 — 30', JSON.stringify(g))
  await shot(page, 'd-settled')
  // back: a short nudge (≥ 15% of a column) still commits one day the way it went
  await swipeWheel(page, -colsPx(g, 0.3))
  await sleep(900)
  g = await glide(page)
  check('d-wheel a nudge back of 0.3 day settles one day back (Oct 23 — 29)', g.aligned && g.first === '2026-10-23' && g.h1 === 'Oct 23 — 29', JSON.stringify(g))
  // Shift + mouse wheel
  await page.mouse.move(760, 470)
  await page.keyboard.down('Shift')
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 100); await sleep(30) }
  await page.keyboard.up('Shift')
  await sleep(900)
  const gs = await glide(page)
  check('d-shift Shift + mouse wheel glides the days forward and settles on a day', gs.aligned && gs.first > g.first && gs.h1 !== g.h1, `${g.first} → ${gs.first} (${gs.h1})`)
  // a plain vertical wheel still scrolls the hours, never the days
  const t0 = gs.top
  await page.mouse.wheel(0, 300)
  await sleep(500)
  const gv = await glide(page)
  check('d-vertical a plain wheel still scrolls the hours (the days stay put)', gv.top !== t0 && gv.first === gs.first && gv.aligned, `${t0} → ${gv.top}, ${gv.first}`)
  // Today, ‹ ›
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await sleep(700)
  g = await glide(page)
  check('d-today Today glides back to Oct 21 — 27', g.first === '2026-10-21' && g.aligned && g.h1 === 'Oct 21 — 27', JSON.stringify(g))
  const x0 = g.x
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await sleep(90)
  const gm = await glide(page)
  await sleep(700)
  g = await glide(page)
  check('d-next › glides a week on (animated: part-way after 90ms), Oct 28 — Nov 3, on a boundary', gm.x > x0 && !gm.aligned && g.first === '2026-10-28' && g.aligned && g.h1 === 'Oct 28 — Nov 3', `mid x ${Math.round(gm.x)} aligned=${gm.aligned}; ${JSON.stringify(g)}`)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await sleep(700)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await sleep(700)
  g = await glide(page)
  check('d-next › twice more → Nov 11 — 17 (past the drawn days: the buffer re-centred in between)', g.first === '2026-11-11' && g.aligned && g.h1 === 'Nov 11 — 17', JSON.stringify(g))
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await sleep(700)
  g = await glide(page)
  check('d-prev ‹ glides a week back → Nov 4 — 10', g.first === '2026-11-04' && g.aligned && g.h1 === 'Nov 4 — 10', JSON.stringify(g))
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await sleep(700)
  g = await glide(page)
  check('d-today Today from two weeks off comes back to Oct 21 — 27', g.first === '2026-10-21' && g.aligned && g.h1 === 'Oct 21 — 27', JSON.stringify(g))
  await page.keyboard.press('ArrowRight')
  await sleep(700)
  g = await glide(page)
  check('d-keys → (the › key) glides too', g.first === '2026-10-28' && g.aligned, g.first)
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ L · blocks for the days that come into view ═══
if (want('l')) {
  const { ctx, page, errors } = await open()
  let g = await glide(page)
  // glide back ten days in one long swipe, checking every few frames that each day on screen has its block
  const misses = []
  let samples = 0
  const look = async () => {
    samples++
    for (const c of await blocksShown(page)) if (!c.has) misses.push(c.date)
  }
  await page.mouse.move(760, 470)
  const n = Math.round((colsPx(g, 10)) / 24)
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(-24, 0)
    await sleep(16)
    if (i % 6 === 0) await look()
  }
  await sleep(1000)
  await look()
  g = await glide(page)
  check(`l-glide ten days back in one swipe: every day on screen had its block in ${samples} looks mid-glide (none blank)`, misses.length === 0 && samples > 5, misses.join(','))
  check('l-glide it settled ten days back (Oct 11 — 17), the buffer re-centred under the glide', g.first === '2026-10-11' && g.aligned && g.h1 === 'Oct 11 — 17', JSON.stringify(g))
  await shot(page, 'l-ten-back')
  const shown = await blocksShown(page)
  check('l-settled the seven days on screen each show their block', shown.length === 7 && shown.every((c) => c.has), JSON.stringify(shown))
  const titles = await page.locator('.fc-timegrid-event .fc-event-title').allInnerTexts()
  check('l-settled the blocks are those days\' own ("Block Oct 11" … "Block Oct 17")', ['Oct 11', 'Oct 14', 'Oct 17'].every((d) => titles.includes(`Block ${d}`)), titles.slice(0, 5).join(','))
  check('l no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ M · drags across days, edge scroll, clicks ═══
if (want('m')) {
  const { ctx, page, errors, state } = await open()
  let g = await glide(page)
  await swipeWheel(page, colsPx(g, 1))
  await sleep(900)
  g = await glide(page)
  check('m-setup one day on: Oct 22 — 28', g.first === '2026-10-22' && g.aligned, g.first)
  const blk = (title) => page.locator('.fc-timegrid-event:not(.fc-event-mirror)', { hasText: title }).first()
  // the 10:00 blocks to mid-height, away from the hours' own edge scroll (top / bottom 50px)
  await page.locator('.kf-glide .fc-scroller-liquid-absolute').evaluate((e) => (e.scrollTop -= 250))
  await sleep(200)
  // Block Oct 24 → one column right = Sun Oct 25, 10:00
  let b = await blk('Block Oct 24').boundingBox()
  const cw = g.colW
  let w0 = state.writes.length
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(120)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + b.width / 2 + (cw * i) / 10, b.y + b.height / 2); await sleep(30) }
  await sleep(100)
  await page.mouse.up()
  await sleep(900)
  let w = writesOf(state, 'calendar_events', w0)
  const e24 = evOf(10, 24)
  check('m-drag after a glide, a block dragged one column right lands on Sun Oct 25, same time (10:00–11:00)', w.length >= 1 && w.at(-1).id === e24.id && w.at(-1).starts_at === cairo('10:00', 10, 25).toISOString() && w.at(-1).ends_at === cairo('11:00', 10, 25).toISOString(), JSON.stringify(w.map((x) => [x.title, x.starts_at])))
  g = await glide(page)
  check('m-drag the days didn\'t move under the drop (still Oct 22 at the left, on a boundary)', g.first === '2026-10-22' && g.aligned, g.first)
  // Block Oct 26 held at the right edge: FullCalendar's edge scroll glides the days on; it lands later than the last day shown
  b = await blk('Block Oct 26').boundingBox()
  const body = await page.locator('.kf-glide .fc-scroller-liquid-absolute').boundingBox()
  w0 = state.writes.length
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(120)
  await page.mouse.down()
  await sleep(150)
  const edgeX = body.x + body.width - 12
  for (let i = 1; i <= 12; i++) { await page.mouse.move(b.x + b.width / 2 + ((edgeX - b.x - b.width / 2) * i) / 12, b.y + b.height / 2); await sleep(20) }
  const xs = (await glide(page)).x
  for (let i = 0; i < 40; i++) { await page.mouse.move(edgeX + (i % 2), b.y + b.height / 2); await sleep(40) }
  const ge = await glide(page)
  await shot(page, 'm-edge-held')
  await page.mouse.up()
  await sleep(1100)
  w = writesOf(state, 'calendar_events', w0)
  const landed = w.at(-1)
  // Cairo's clocks go back on Thu Oct 29 (UTC+3 → +2): read the landing on Cairo's own clock
  const cairoAt = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(',', '')
  const [landedDay, landedTime] = landed ? cairoAt(landed.starts_at).split(' ') : ['', '']
  // the day row and the all-day band follow FullCalendar's edge scroll from its scroll event: a frame behind at most
  check('m-edge held at the right edge, the days glide on under the block (the header and hours together)', ge.x > xs + 20 && Math.max(...ge.scrollers) - Math.min(...ge.scrollers) <= 12, `${Math.round(xs)} → ${Math.round(ge.x)} ${ge.scrollers.map(Math.round)}`)
  check('m-edge it lands past Oct 28 (the last day shown before), at 10:00 Cairo', landed && landed.id === evOf(10, 26).id && landedDay > '2026-10-28' && landedTime === '10:00', `${landedDay} ${landedTime}`)
  g = await glide(page)
  check('m-edge after the drop the days settle on a day boundary', g.aligned, JSON.stringify(g))
  // a click still opens the details
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await sleep(800)
  await blk('Block Oct 22').click()
  await sleep(500)
  check('m-click a click on a block still opens its details', (await page.locator('[role="menu"][aria-label="Block details"]').count()) === 1)
  await shot(page, 'm-details')
  check('m no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ F · frame timing, reduced motion, scale and the other views ═══
if (want('f')) {
  {
    const { ctx, page, errors } = await open()
    let g = await glide(page)
    await page.evaluate(() => {
      window.__lt = []
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ at: e.startTime, ms: e.duration }) }).observe({ type: 'longtask' })
    })
    const t0 = await page.evaluate(() => performance.now())
    // three days forward, a trackpad's pace: 16ms steps
    await swipeWheel(page, colsPx(g, 3), { step: 12 })
    await sleep(QUIET_WAIT)
    const t1 = await page.evaluate(() => performance.now())
    const lt = (await page.evaluate(() => window.__lt)).filter((e) => e.at >= t0 && e.at <= t1)
    g = await glide(page)
    check(`f-perf a scripted three-day glide and its settle: no long task ≥ 50ms (${lt.length} long tasks)`, lt.every((e) => e.ms < 50) && g.aligned && g.first === '2026-10-24', lt.map((e) => Math.round(e.ms)).join(',') + ' / ' + g.first)
    check('f no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/calendar', { reduced: true })
    let g = await glide(page)
    await swipeWheel(page, colsPx(g, 1.4))
    await sleep(200) // the quiet (140ms) + a frame: with reduced motion the settle is instant
    g = await glide(page)
    check('f-reduced reduced motion: the settle is at once (on a boundary 200ms after the wheel stops)', g.aligned && g.first === '2026-10-23', JSON.stringify(g))
    await ctx.close()
  }
  {
    const { ctx, page } = await open()
    let g = await glide(page)
    await swipeWheel(page, colsPx(g, 1.4))
    await sleep(190)
    const mid = await glide(page)
    await sleep(600)
    g = await glide(page)
    check('f-motion with motion on the settle eases (still between days 190ms after the wheel stops, then on a boundary)', !mid.aligned && g.aligned && g.first === '2026-10-23', `${mid.aligned} → ${g.first}`)
    await ctx.close()
  }
  for (const scale of [1, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale })
    let g = await glide(page)
    await swipeWheel(page, colsPx(g, 2))
    await sleep(900)
    g = await glide(page)
    const shown = await blocksShown(page)
    check(`f-scale Interface size ${scale * 100}%: two days of swipe settle on Oct 23, every day on screen with its block`, g.aligned && g.first === '2026-10-23' && shown.every((c) => c.has), `${g.first} zoom ${g.zoom} ${JSON.stringify(shown)}`)
    await shot(page, `f-scale-${scale * 100}`)
    check(`f-scale ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Day and 3-day views, the second clock, fit hours
  const pick = async (page, cell) => {
    await page.getByRole('button', { name: /^(Week|Day|\d days?)$/ }).first().click()
    await sleep(300)
    await page.locator('.cal-vo-row .kf-seg-btn', { hasText: new RegExp(`^${cell}$`) }).first().click()
    await sleep(900)
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  {
    const { ctx, page, errors } = await open('/calendar', { opts: { secondZone: 'Asia/Tokyo', dynamic: true } })
    await pick(page, '1')
    let g = await glide(page)
    check('f-day Day view: one day on screen (Wed, Oct 21), three drawn either side', g && g.first === '2026-10-21' && g.onScreen.length === 1 && g.cols === 7 && g.aligned, JSON.stringify(g))
    await swipeWheel(page, colsPx(g, 1.6), { step: 40 })
    await sleep(900)
    g = await glide(page)
    check('f-day a 1.6-day swipe settles two days on (Fri, Oct 23)', g.first === '2026-10-23' && g.aligned && g.h1 === 'Fri, Oct 23', JSON.stringify(g))
    const z2 = await page.locator('.kf-cal-2z .kf-cal-z2').first().isVisible()
    const fit = await page.locator('.kf-glide.kf-cal-fit').count()
    check('f-day the second clock column and fit hours still draw while gliding', z2 && fit === 1)
    await shot(page, 'f-day-2z')
    await pick(page, '3')
    g = await glide(page)
    check('f-3day 3 days: Oct 21 — 23 on screen, a day boundary', g && g.onScreen.length === 3 && g.first === '2026-10-21' && g.aligned, JSON.stringify(g))
    await swipeWheel(page, colsPx(g, 1))
    await sleep(900)
    g = await glide(page)
    check('f-3day one column of swipe settles one day on (Oct 22 — 24), not a page', g.first === '2026-10-22' && g.aligned && g.h1 === 'Oct 22 — 24', JSON.stringify(g))
    await shot(page, 'f-3day')
    check('f-views no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ P · phone ═══
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function fingerDrag(cdp, from, { dx = 0, steps = 8, stepMs = 16, keep = false, rest = 0 } = {}) {
  await touch(cdp, 'touchStart', [from])
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ x: from.x + (dx * i) / steps, y: from.y }])
    await sleep(stepMs)
  }
  if (rest) await sleep(rest)
  if (!keep) await touch(cdp, 'touchEnd', [])
}
const ptitle = (page) => page.locator('.pc-title').innerText().catch(() => '')
async function tapAt(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(450)
}
if (want('p')) {
  const { ctx, page, errors, cdp } = await open('/calendar', { view: phone })
  const g = await page.locator('.pc-scroll').boundingBox()
  const y = g.y + 260
  check('p-open Day view on Wednesday, Oct 21', (await ptitle(page)) === 'Wednesday, Oct 21', await ptitle(page))
  // mid-swipe: the title follows, and the neighbours are drawn with their blocks (no blank day)
  await fingerDrag(cdp, { x: 340, y }, { dx: -230, steps: 10, stepMs: 30, keep: true })
  await sleep(120)
  const midTitle = await ptitle(page)
  const panes = await page.locator('.pc-pane').count()
  const near = await page.locator('.pc-pane .pc-block', { hasText: /Block Oct (22|23|24)/ }).count()
  await shot(page, 'p-mid')
  check('p-peek mid-swipe the title already shows the next day (Thursday, Oct 22)', midTitle === 'Thursday, Oct 22', midTitle)
  check('p-panes mid-swipe the days a fling can reach are drawn with their blocks (7 panes; Oct 22–24 blocks there)', panes === 7 && near === 3, `${panes} panes, ${near}`)
  await sleep(200) // the finger rests: no fling
  await touch(cdp, 'touchEnd', [])
  await sleep(700)
  check('p-slow a resting finger past half a day settles on one day (Thursday, Oct 22)', (await ptitle(page)) === 'Thursday, Oct 22' && (await page.locator('.pc-track.is-sliding').count()) === 0, await ptitle(page))
  // a fling: 200px in three quick moves (~2 px/ms as the page hears them) carries on past it
  await fingerDrag(cdp, { x: 330, y }, { dx: -200, steps: 3, stepMs: 10 })
  await sleep(150)
  const flying = await page.locator('.pc-track.is-sliding').count()
  await sleep(700)
  const t = await ptitle(page)
  const strip = await page.locator('.pc-day[aria-current="date"]').getAttribute('aria-label')
  check('p-fling a quick flick glides on with momentum and crosses 2+ days, settling on a day (Oct 24 or 25)', flying === 1 && /^(Saturday, Oct 24|Sunday, Oct 25)$/.test(t) && (await page.locator('.pc-track.is-sliding').count()) === 0, `${t} (sliding after release: ${flying})`)
  check('p-strip the week strip\'s selected day follows (the same day)', strip && t.endsWith(strip.split(', ').at(-1).replace('October', 'Oct')), strip)
  await shot(page, 'p-fling')
  // a fling back
  await fingerDrag(cdp, { x: 80, y }, { dx: 200, steps: 3, stepMs: 10 })
  await sleep(900)
  const back = await ptitle(page)
  check('p-fling-back a flick back crosses 2+ days back the same way', back !== t && /Oct (19|2[0-3])$/.test(back) && Math.abs(Number(back.slice(-2)) - Number(t.slice(-2))) >= 2, `${t} → ${back}`)
  // a tap still opens the block's details
  await page.getByRole('button', { name: 'Today' }).click()
  await sleep(700)
  const bb = await page.locator('.pc-block', { hasText: 'Block Oct 21' }).first().boundingBox()
  await tapAt(cdp, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 })
  await sleep(300)
  const sheet = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea')].some((i) => i.value === 'Block Oct 21'))
  check('p-tap after the swipes a tap on a block still opens its details', sheet)
  await shot(page, 'p-tap')
  await page.keyboard.press('Escape')
  await sleep(500)
  // 3 days: settles by the day; week: by the week
  const view = async (name) => {
    await tapAt(cdp, center(await page.locator('.pc-title').boundingBox()))
    await tapAt(cdp, center(await page.getByRole('dialog').locator('.kf-as-row', { hasText: name }).first().boundingBox()))
    await sleep(500)
  }
  await view('3 days')
  const cw = (await page.locator('.pc-pane .pc-col').first().boundingBox()).width
  await fingerDrag(cdp, { x: 330, y }, { dx: -cw * 1.1, steps: 10, stepMs: 30, rest: 200 })
  await sleep(800)
  check('p-3day one column of slow swipe settles one day on (Oct 22 – 24), not a page', (await ptitle(page)) === 'Oct 22 – 24', await ptitle(page))
  await view('Week')
  const wt = await ptitle(page)
  await fingerDrag(cdp, { x: 330, y }, { dx: -200, steps: 3, stepMs: 10 })
  await sleep(900)
  const wt2 = await ptitle(page)
  check('p-week the week view settles on the next week (seven narrow columns read as a page)', wt !== wt2 && (await page.locator('.pc-colhead > span').count()) === 7, `${wt} → ${wt2}`)
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
function center(b) { return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
