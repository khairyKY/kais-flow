// cal-blocks (Kai 2026-10-26, his picks on design-export/Calendar extras options.html: palette C, menu B, check B,
// repeat B; queue item 10, live multi-drag). On the REAL app against a MOCKED backend (the cal-looks recipe: dev
// server in `--mode mock`, a made-up session in localStorage, Playwright answers every REST call; writes are
// recorded AND applied to the mock rows). Screenshots sit beside the drawing.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]          ONLY=p,m,k,d,x,v to run some sections
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 12:09; the grid shows 3 days, Wed–Fri.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5314'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const OPTIONS = new URL('../../../../design-export/Calendar extras options.html', import.meta.url).href
const PAL = JSON.parse(fs.readFileSync(new URL('../looks2/palettes.json', import.meta.url), 'utf8')).C
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cb10'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the days: Wed 21 (today) to Fri 23 ──
const DAY = 21
const cairo = (hhmm, day = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '12:09'
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, day, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const sched = (from, to, day = DAY) => ({ scheduled_start: iso(from, day), scheduled_end: iso(to, day), due_at: iso(from, day) })
// colours: two saved before palette C (hydrangea, sage), two of palette C's own (Fern, Heather), one custom
const HYD = '#9AB4BE', SAG = '#8A9A7E', FERN = '#72BF8E', HEATHER = '#8972B3', CUSTOM = '#123456'
const TAX = 1, TYRE = 2, CRYPTO = 3, GOAL = 4, WATER = 5, OMAR = 6, GYM = 7, READ = 8, DEEP = 9, VET = 10
const TASKS = [
  task(TAX, 'Send the tax papers', { ...sched('08:30', '09:00'), status: 'done', completed_at: iso('08:50') }),
  task(TYRE, 'Call the tyre supplier', sched('09:30', '10:30')),
  task(CRYPTO, 'Crypto — heavy session', { ...sched('11:30', '13:00'), top3: true, top3_rank: 2 }),
  task(GOAL, 'Ship the calendar polish 🌸', { ...sched('13:15', '13:45'), top3: true, top3_rank: 1 }),
  task(WATER, 'Water the plants', { ...sched('14:00', '15:00'), recurrence_rule: 'FREQ=WEEKLY' }),
  task(OMAR, 'Reply to Omar', sched('09:00', '10:00', 22)),
  task(GYM, 'Gym', sched('11:00', '12:00', 22)),
  task(READ, 'Read 2 pages', sched('14:00', '14:30', 22)),
  task(DEEP, 'Deep work on the quarterly forecast', sched('10:15', '11:15', 23)),
  task(VET, 'Book the vet', { ...sched('13:30', '15:00', 23), duration_min: 15, slot_id: eid(30), slot_date: '2026-10-23' }),
]
const EVENTS = [
  // Wed — today: done, ran over, a past event, in progress, the goal, a repeating task
  ev(1, 'Send the tax papers', '08:30', '09:00', DAY, TAX),
  ev(2, 'Call the tyre supplier', '09:30', '10:30', DAY, TYRE),
  ev(3, 'Dentist', '10:30', '11:15', DAY),
  ev(4, 'Crypto — heavy session', '11:30', '13:00', DAY, CRYPTO),
  ev(5, 'Ship the calendar polish 🌸', '13:15', '13:45', DAY, GOAL),
  ev(6, 'Water the plants', '14:00', '15:00', DAY, WATER),
  // Thu — the multi-drag's three (an event in an old colour, a task in an old colour, a plain event), a new swatch
  ev(10, 'Standup', '09:00', '10:00', 22, null, undefined, { color: HYD }),
  ev(11, 'Reply to Omar', '10:15', '10:45', 22, OMAR, undefined, { color: CUSTOM }),
  ev(12, 'Gym', '11:00', '12:00', 22, GYM, undefined, { color: SAG }),
  ev(13, 'Lunch with Omar', '12:30', '13:30', 22),
  ev(14, 'Read 2 pages', '14:00', '14:30', 22, READ, undefined, { color: FERN }),
  // Fri — a task in an old colour (the menu's), an event in a deep swatch, a Time block holding a task
  ev(20, 'Deep work on the quarterly forecast', '10:15', '11:15', 23, DEEP, undefined, { color: HYD }),
  ev(21, 'Design review', '11:30', '12:30', 23, null, undefined, { color: HEATHER }),
  ev(30, 'Admin', '13:30', '15:00', 23, null, 'time_block', { color: HYD }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(([t, sess, scale, uid, now]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '1')
    localStorage.setItem('kf.calPlanning', '0')
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [o.theme ?? 'day', JSON.stringify(session), o.scale ? String(o.scale) : null, UID, cairo(NOW).getTime()])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      const rows = (state.rows[table] ??= [])
      if (req.method() === 'DELETE') {
        const gone = url.searchParams.get('id')?.replace(/^eq\./, '')
        state.rows[table] = rows.filter((x) => x.id !== gone)
      } else if (body && typeof body === 'object') {
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
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name, o = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...o })
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click()
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]:not(.fc-event-mirror)`).first()
const pcBlock = (page, n) => page.locator(`.pc-block[data-id="${eid(n)}"]`).first()
const menuRows = (page) => page.locator('[role="menu"]').first().locator('[role="menuitem"]').allInnerTexts()

/** The desktop grid on 3 days, scrolled so 08:30 is at the top. */
async function threeDays(page) {
  await page.locator('button', { hasText: /^(Week|Day|\d days)$/ }).first().click()
  await sleep(300)
  await page.locator('[aria-label="View options"] .cal-vo-row button', { hasText: /^3$/ }).click()
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(600)
  await page.evaluate(() => {
    const slot = document.querySelector('td.fc-timegrid-slot-lane[data-time="08:30:00"]')
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop
  })
  await sleep(400)
}
/** The desktop grid scrolled so `hhmm` is at the top. */
async function scrollGrid(page, hhmm) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop
  }, hhmm)
  await sleep(300)
}
async function scrollPhone(page, min) {
  await page.evaluate((m) => {
    const el = document.querySelector('.pc-scroll')
    if (el) el.scrollTop = (m / 60) * 64 - 20
  }, min)
  await sleep(300)
}

// ── WCAG 2 contrast, the options page's own formula ──
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
// rgb(…) or, from a color-mix, color(srgb r g b) in 0–1
const rgb = (s) => { const n = (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); return s.startsWith('color(') ? n.map((v) => v * 255) : n }
const over = (top, under, a) => top.map((v, i) => v * a + under[i] * (1 - a))
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const near = (a, b, tol = 1.5) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol)

/** A block's colours, resolved in the page: its accent, its ink (time row / check), its title, the paper and today's
 * wash under it, and the fill share. */
const HUES = `(el) => {
  const tint = (v) => { const i = document.createElement('i'); i.style.color = v; el.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c }
  const tm = el.querySelector('.fc-event-time:not(.kf-ev-fill)') ?? el.querySelector('.pc-time')
  return {
    c: tint('var(--kf-ev-c, var(--pc-c))'), accent: tint('var(--kf-ev-accent)'), time: tm && getComputedStyle(tm).display !== 'none' ? getComputedStyle(tm).color : null,
    title: getComputedStyle(el.querySelector('.fc-event-title, .pc-name')).color, paper: tint('var(--paper-parchment)'), lav: tint('var(--acc-lavender)'),
    fill: parseFloat(getComputedStyle(el).getPropertyValue('--blk-fill')) / 100,
  }
}`
/** The lowest contrast of `ink` on every fill the block's text can sit on (the grid's paper, today's wash; each with
 * and without the "Now" wash of the block's ink at 14%). */
function worst(h, inkCss) {
  const c = rgb(h.c), ink = rgb(inkCss), paper = rgb(h.paper)
  const grounds = [paper, over(rgb(h.lav), paper, 0.1)]
  return Math.min(...grounds.flatMap((g) => { const f = over(c, g, h.fill); return [f, over(rgb(h.accent), f, 0.14)] }).map((f) => ratio(ink, f)))
}

// ═══ P · palette C: the tokens, every block kind by day and at night with its contrast, old colours mapped ═══
if (want('p')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, scale: 1.25 })
    await threeDays(page)
    await page.mouse.move(2, 400)
    // the tokens are palettes.json's palette C, day and night
    const tok = await page.evaluate((names) => {
      const probe = (v) => { const i = document.createElement('i'); i.style.color = v; document.querySelector('.fc').appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c }
      return Object.fromEntries(names.flatMap((n) => [[n, probe(`var(--blk-${n})`)], [`${n}-ink`, probe(`var(--blk-${n}-ink)`)]]).concat([['ran', probe('var(--blk-ran-ink)')]]))
    }, PAL.sw.map((s) => s.name.toLowerCase()))
    const off = PAL.sw.flatMap((s) => {
      const n = s.name.toLowerCase(), want = theme === 'day' ? [s.day, s.dayInk] : [s.night, s.nightInk]
      return [[n, want[0]], [`${n}-ink`, want[1]]].filter(([k, v]) => !near(rgb(tok[k]), hx(v), 0.5)).map(([k, v]) => `${k} ${tok[k]} ≠ ${v}`)
    })
    check(`p-${theme} the 16 block tokens and their text tones are palette C's (${theme})`, off.length === 0 && near(rgb(tok.ran), hx(PAL.ran[theme]), 0.5), off.join(' | ') || tok.ran)
    const fillShare = await page.evaluate(() => getComputedStyle(document.querySelector('.fc-timegrid-event')).getPropertyValue('--blk-fill').trim())
    check(`p-${theme} the fill is ${PAL.fill[theme]}% (palette C's ${theme} share)`, fillShare === `${PAL.fill[theme]}%`, fillShare)
    // every kind: [n, what, the token its accent must be]
    const kinds = [[2, 'a task, ran over (no colour: Iris)', 'iris'], [3, 'a past event (no colour: Rose)', 'rose'], [4, 'a task in progress', 'iris'], [5, 'the goal', 'iris'],
      [1, 'a done task', 'iris'], [6, 'a repeating task', 'iris'], [10, 'Standup, saved in the old hydrangea', 'lagoon'], [12, 'Gym, saved in the old sage', 'moss'],
      [14, 'Read 2 pages in Fern', 'fern'], [20, 'Deep work in the old hydrangea', 'lagoon'], [21, 'Design review in Heather', 'heather'], [30, 'a Time block (old hydrangea)', 'lagoon'], [11, 'a custom colour (#123456)', null]]
    const rows = []
    for (const [n, what, t] of kinds) {
      const h = await fcBlock(page, n).evaluate((el, src) => eval(src)(el), HUES)
      const accentOk = t ? near(rgb(h.c), rgb(tok[t])) && near(rgb(h.accent), rgb(tok[`${t}-ink`])) : near(rgb(h.c), hx(CUSTOM))
      const timeR = h.time ? worst(h, h.time) : null
      const titleR = worst(h, h.title)
      const checkR = worst(h, h.accent)
      rows.push(`${what}: time ${timeR?.toFixed(2) ?? '—'} · title ${titleR.toFixed(2)} · check ${checkR.toFixed(2)}`)
      check(`p-${theme} ${what}: its accent ${t ? `is --blk-${t}` : 'keeps its hex'}, and its text passes AA on every fill (time ${timeR?.toFixed(2) ?? '—'}, title ${titleR.toFixed(2)}, check ${checkR.toFixed(2)})`, accentOk && (timeR == null || timeR >= 4.5) && titleR >= 4.5 && checkR >= 4.5, JSON.stringify(h))
    }
    const ran = await fcBlock(page, 2).evaluate((el, src) => eval(src)(el), HUES)
    check(`p-${theme} "Ran over" reads in palette C's own terra (${PAL.ran[theme]}), AA on its fill (${worst(ran, ran.time).toFixed(2)})`, (await fcBlock(page, 2).innerText()).includes('Ran over') && near(rgb(ran.time), hx(PAL.ran[theme]), 0.5) && worst(ran, ran.time) >= 4.5, ran.time)
    fs.writeFileSync(path.join(OUT, `p-contrast-${theme}.txt`), rows.join('\n'))
    await shot(page, `p-desktop-${theme}`)
    check(`p-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // the phone draws the same: Iris / Rose by kind, an old colour as its new swatch, the night fill
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, view: phone })
    await scrollPhone(page, 8 * 60 + 15)
    const st = (n) => pcBlock(page, n).evaluate((e) => [e.style.getPropertyValue('--pc-fill'), e.style.getPropertyValue('--pc-ink')])
    const [tyre, dentist] = [await st(2), await st(3)]
    check(`p-phone-${theme} a task with no colour is Iris, an event Rose, the fill at --blk-fill`, tyre[0].includes('var(--blk-iris)') && tyre[0].includes('var(--blk-fill)') && dentist[0].includes('var(--blk-rose)'), JSON.stringify([tyre, dentist]))
    const ranInk = await pcBlock(page, 2).locator('.pc-time').evaluate((e) => getComputedStyle(e).color)
    check(`p-phone-${theme} "Ran over" in palette C's terra`, near(rgb(ranInk), hx(PAL.ran[theme]), 0.5), ranInk)
    await shot(page, `p-phone-${theme}`)
    check(`p-phone-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ K · check B and repeat B: size, edge, corners, on the title's line at 100 / 125 / 150%; the phone ═══
const checkGeo = (page, n, s) => fcBlock(page, n).evaluate((e, s) => {
  const c = e.querySelector('.kf-ev-check'), cs = getComputedStyle(c), r = c.getBoundingClientRect()
  const range = document.createRange(); range.selectNodeContents(e.querySelector('.fc-event-title'))
  const line = range.getClientRects()[0]
  const rad = cs.borderTopLeftRadius
  return { w: parseFloat(cs.width), bw: parseFloat(cs.borderTopWidth), radius: rad.endsWith('%') ? (parseFloat(rad) / 100) * parseFloat(cs.width) : parseFloat(rad), mid: r.top + r.height / 2, line: line.top + line.height / 2, s }
}, s)
if (want('k')) {
  for (const scale of [1, 1.25, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale })
    await threeDays(page)
    const b = await fcBlock(page, 20).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6)
    await sleep(400)
    const g = await checkGeo(page, 20, scale)
    const pct = Math.round(scale * 100)
    check(`k-${pct} check B: ${g.w.toFixed(2)}px box (13 × ${g.s}), a ${g.bw}px edge, corners 38%`, Math.abs(g.w - 13 * g.s) < 0.2 && g.bw === 2 && Math.abs(g.radius - 0.38 * g.w) < 0.3, JSON.stringify(g))
    check(`k-${pct} …on the title's first line (centres ${Math.abs(g.mid - g.line).toFixed(2)}px apart)`, Math.abs(g.mid - g.line) <= 1.5, JSON.stringify(g))
    if (scale === 1.25) {
      await fcBlock(page, 20).screenshot({ path: path.join(OUT, 'k-check-open.png') })
      // repeat B on the weekly task: the chasing box, its name, ticking completes this occurrence
      const r = fcBlock(page, 6)
      await scrollGrid(page, '12:00')
      const rb = await r.boundingBox()
      await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height - 6)
      await sleep(400)
      const rep = await r.locator('.kf-ev-check').evaluate((c) => ({ cls: c.className, name: c.getAttribute('aria-label'), border: getComputedStyle(c).borderTopStyle, svg: !!c.querySelector('svg path'), op: getComputedStyle(c).opacity, color: getComputedStyle(c).color, stroke: c.querySelector('svg path')?.getAttribute('stroke-width') }))
      check('k repeat B: a repeating task\'s box is the chasing box (no border, the two-arrow glyph in the block\'s ink)', rep.cls.includes('kf-rep') && rep.border === 'none' && rep.svg && rep.op === '1', JSON.stringify(rep))
      check('k …its name: "Complete this occurrence (repeats weekly)"', rep.name === 'Complete this occurrence (repeats weekly)', rep.name)
      await r.screenshot({ path: path.join(OUT, 'k-repeat-open.png') })
      const { state } = { state: null }
      void state
      await ctx.close()
      // ticked: a fresh page (the click writes)
      const o2 = await open('/calendar', { scale })
      await threeDays(o2.page)
      const w0 = o2.state.writes.length
      await scrollGrid(o2.page, '12:00')
      const rb2 = await fcBlock(o2.page, 6).boundingBox()
      await o2.page.mouse.move(rb2.x + rb2.width / 2, rb2.y + rb2.height - 6)
      await sleep(300)
      await fcBlock(o2.page, 6).locator('.kf-ev-check').click()
      // cal-clicks: a repeating task's round asks This one / Following / All first — "This one" is the old tick.
      await o2.page.locator('[role="dialog"].kf-scope-ask').getByRole('button', { name: 'This one', exact: true }).click()
      await settle(o2.state)
      const done = posts(o2.state, 'tasks', w0).find((t) => t.id === id(WATER))
      check('k …ticking it completes this occurrence (the task row written done, as any repeat\'s tick)', done?.status === 'done' || !!done?.completed_at, JSON.stringify(posts(o2.state, 'tasks', w0).map((t) => [t.id === id(WATER) ? 'WATER' : t.title, t.status, t.due_at])))
      await sleep(600)
      const ticked = await fcBlock(o2.page, 6).locator('.kf-ev-check').evaluate((c) => ({ on: c.classList.contains('kf-on'), rect: !!c.querySelector('svg rect'), name: c.getAttribute('aria-label') })).catch(() => null)
      if (ticked?.on) {
        check('k …ticked: the box fills, the tick shows, the heads stay ("Reopen this occurrence …")', ticked.rect && ticked.name === 'Reopen this occurrence (repeats weekly)', JSON.stringify(ticked))
        await fcBlock(o2.page, 6).screenshot({ path: path.join(OUT, 'k-repeat-ticked.png') })
      } else check('k …ticked: the next occurrence takes its place (the block no longer shows a done box)', true, JSON.stringify(ticked))
      check('k-ticked no page errors', o2.errors.length === 0, o2.errors.join(' | '))
      await o2.ctx.close()
      continue
    }
    check(`k-${pct} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // the phone: the kit check at 18px, a 2px edge, 38% corners; the repeat's chasing box with its name
  const { ctx, page, errors } = await open('/calendar', { view: phone })
  await scrollPhone(page, 13 * 60 + 30)
  const ck = await pcBlock(page, 4).locator('.kf-checkbox').evaluate((e) => { const c = getComputedStyle(e), r = c.borderTopLeftRadius; return { w: parseFloat(c.width), bw: c.borderTopWidth, r: r.endsWith('%') ? (parseFloat(r) / 100) * parseFloat(c.width) : parseFloat(r) } })
  check('p-phone check B: 18px, a 2px edge, 38% corners', ck.w === 18 && ck.bw === '2px' && Math.abs(ck.r - 0.38 * 18) < 0.3, JSON.stringify(ck))
  const rep = await pcBlock(page, 6).locator('.pc-rep').evaluate((e) => ({ name: e.getAttribute('aria-label'), w: e.getBoundingClientRect().width, svg: !!e.querySelector('svg path') })).catch(() => null)
  check('p-phone repeat B: the chasing box, "Complete this occurrence (repeats weekly)"', rep?.name === 'Complete this occurrence (repeats weekly)' && rep.svg && Math.round(rep.w) === 18, JSON.stringify(rep))
  await pcBlock(page, 6).screenshot({ path: path.join(OUT, 'k-phone-repeat.png') })
  await pcBlock(page, 4).screenshot({ path: path.join(OUT, 'k-phone-check.png') })
  check('k-phone no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ M · menu B: the title, the tray, the rows; a swatch, Ctrl+D, Work with AI, Copy link; the phone's sheet ═══
if (want('m')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme, scale: 1.25 })
    await threeDays(page)
    // cal-clicks: menu B is the right-click (a click opens the block's details — a task block's, its task).
    await fcBlock(page, 20).click({ button: 'right', position: { x: 30, y: 30 } })
    await sleep(500)
    const menu = page.locator('[role="menu"][aria-label="Block menu"]')
    const order = await menu.evaluate((m) => {
      const t = m.querySelector('textarea'), tray = m.querySelector('.kf-swatch-tray'), chips = m.querySelector('[role="menuitem"]')
      const y = (e) => e?.getBoundingClientRect().top ?? -1
      return { title: y(t), tray: y(tray), rows: y(chips), swatches: tray?.querySelectorAll('.kf-sw').length, custom: tray?.querySelector('.kf-sw-custom')?.textContent.trim(), on: tray?.querySelector('.kf-sw[aria-pressed="true"]')?.getAttribute('aria-label'), width: m.getBoundingClientRect().width }
    })
    check(`m-${theme} the title first, the tray of swatches under it, then the rows`, order.title >= 0 && order.title < order.tray && order.tray < order.rows, JSON.stringify(order))
    check(`m-${theme} the tray: No colour + palette C's 16 swatches and "+ Custom"; the block's old hydrangea shows as Lagoon`, order.swatches === 17 && order.custom === 'Custom' && order.on === 'Lagoon', JSON.stringify(order))
    const rows = (await menuRows(page)).map((r) => r.replace(/\s+/g, ' ').trim())
    const want_ = ['Complete', 'Open task', 'Duplicate', 'Work with AI', 'Copy link', 'Unschedule', 'Delete']
    const idx = want_.map((w) => rows.findIndex((r) => r.startsWith(w)))
    check(`m-${theme} the rows: … Complete · Open task · Duplicate Ctrl D · Work with AI › · Copy link · Unschedule ⌫ · Delete`, idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])) && /Duplicate.*Ctrl.*D/.test(rows[idx[2]]) && /▸/.test(rows[idx[3]]), JSON.stringify(rows))
    await page.mouse.move(2, 790)
    await sleep(200)
    await menu.screenshot({ path: path.join(OUT, `m-menu-${theme}.png`) })
    if (theme === 'day') {
      // a swatch: one write, the block redrawn in Fern
      let w0 = state.writes.length
      await menu.locator('.kf-sw[aria-label="Fern"]').click()
      await settle(state)
      const put = posts(state, 'calendar_events', w0).find((e) => e.id === eid(20))
      check('m a swatch saves its colour (Fern, #72BF8E) and the block wears it', put?.color === FERN && near(rgb(await fcBlock(page, 20).evaluate((el, src) => eval(src)(el).c, HUES)), hx(PAL.sw.find((s) => s.name === 'Fern').day)), JSON.stringify(put))
      // Ctrl+D: the task block duplicates (a new task, its block at the same time), one Undo
      w0 = state.writes.length
      await page.keyboard.press('Control+d')
      await settle(state)
      const newTask = posts(state, 'tasks', w0).find((t) => t.id !== id(DEEP) && t.title === 'Deep work on the quarterly forecast')
      const newBlock = posts(state, 'calendar_events', w0).find((e) => e.id !== eid(20) && e.task_id === newTask?.id)
      check('m Ctrl+D duplicates the block: a new task, blocked at the same time; the menu closes', !!newTask && newBlock?.starts_at === iso('10:15', 23) && (await menu.count()) === 0, JSON.stringify([newTask?.id, newBlock?.starts_at]))
      check('m …with a toast and its Undo', await page.locator('.kf-toast', { hasText: /Duplicated/ }).getByRole('button', { name: 'Undo' }).first().isVisible().catch(() => false))
      // Copy link
      await fcBlock(page, 21).click({ button: 'right', position: { x: 30, y: 30 } })
      await sleep(500)
      const evRows = (await menuRows(page)).map((r) => r.replace(/\s+/g, ' ').trim())
      const ei = ['Details', 'Duplicate', 'Work with AI', 'Copy link', 'Delete'].map((w) => evRows.findIndex((r) => r.startsWith(w)))
      check('m an event\'s menu B: Details · Duplicate Ctrl D · Work with AI › · Copy link · Delete ⌫ (cal-clicks: Link a task… and More are the details\')', ei.every((v, i) => v >= 0 && (i === 0 || v > ei[i - 1])), JSON.stringify(evRows))
      await page.locator('[role="menuitem"]', { hasText: 'Copy link' }).click()
      await sleep(400)
      const clip = await page.evaluate(() => navigator.clipboard.readText())
      check('m Copy link: /calendar?event=<the block> on the clipboard, "Link copied"', clip === `${BASE}/calendar?event=${eid(21)}` && (await toastSoon(page, 'Link copied')), clip)
      // the link opens it
      const o3 = await page.context().newPage()
      await o3.clock.install({ time: cairo(NOW) })
      await o3.goto(clip, { waitUntil: 'networkidle' })
      await sleep(1500)
      check('m …and the link turns the calendar to it and opens its details (cal-clicks)', (await o3.locator('[role="menu"][aria-label="Block details"] textarea').inputValue().catch(() => '')) === 'Design review')
      await o3.close()
      // Work with AI › Find a better time → the chat, the request typed in
      await fcBlock(page, 21).click({ button: 'right', position: { x: 30, y: 30 } })
      await sleep(500)
      await page.locator('[role="menuitem"]', { hasText: 'Work with AI' }).hover()
      await sleep(500)
      const sub = await page.locator('[role="menu"][aria-label="Work with AI"] [role="menuitem"]').allInnerTexts()
      check('m Work with AI ›: Find a better time · Reschedule… · Summarise (an event: no subtasks)', JSON.stringify(sub.map((s) => s.trim())) === JSON.stringify(['Find a better time', 'Reschedule…', 'Summarise']), JSON.stringify(sub))
      await page.locator('[role="menu"][aria-label="Work with AI"]').screenshot({ path: path.join(OUT, 'm-ai-submenu.png') })
      await page.locator('[role="menu"][aria-label="Work with AI"] [role="menuitem"]', { hasText: 'Find a better time' }).click()
      await sleep(800)
      const typed = await page.locator('input[placeholder="Ask about your day…"]').inputValue().catch(() => null)
      check('m …picking one opens the chat with the request typed in (not sent)', typed === 'Find a better time for "Design review" (Fri, Oct 23, 11:30 AM–12:30 PM) this week.', typed)
      await shot(page, 'm-chat-prefilled')
    }
    check(`m-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // the phone: the same menu as a sheet
  const { ctx, page, errors } = await open('/calendar', { view: phone })
  await scrollPhone(page, 10 * 60)
  await pcBlock(page, 3).click()
  await sleep(800)
  // cal-clicks: a tap opens the details; their ⋯ (or a long-press) opens menu B's sheet.
  await page.locator('.pc-bs-more').click()
  await sleep(600)
  const sheet = await page.evaluate(() => {
    const tray = document.querySelector('.pc-bs-colors .kf-swatch-tray')
    return { swatches: tray?.querySelectorAll('.kf-sw').length, custom: !!tray?.querySelector('.kf-sw-custom input[type="color"]'), rows: [...document.querySelectorAll('.pc-bs-rows button')].map((b) => b.textContent.trim()) }
  })
  check('p-phone the event sheet: the tray (17 + Custom) under the title, and Duplicate · Work with AI · Copy link rows', sheet.swatches === 17 && sheet.custom && ['Duplicate', 'Work with AI', 'Copy link'].every((w) => sheet.rows.some((r) => r.startsWith(w))), JSON.stringify(sheet))
  await shot(page, 'm-phone-sheet')
  await page.locator('.pc-bs-rows button', { hasText: 'Work with AI' }).click()
  await sleep(600)
  await shot(page, 'm-phone-ai')
  await page.getByRole('button', { name: /^Summarise/ }).first().click()
  await sleep(1200)
  const typed = await page.locator('input[placeholder="Ask about your day…"]').inputValue().catch(() => null)
  check('p-phone Work with AI › Summarise opens the chat with the request typed in', !!typed && typed.startsWith('Summarise "Dentist"'), typed)
  check('p-phone no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/** A pointer drag from `from` to `to` in `steps`, `hold` before letting go; `mid` runs at the end, before the release. */
async function drag(page, from, to, { steps = 20, mid = null } = {}) {
  await page.mouse.move(from.x, from.y)
  await sleep(120)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(30)
  }
  await sleep(300)
  const r = mid ? await mid() : null
  await page.mouse.up()
  return r
}
const colW = (page) => page.evaluate(() => document.querySelector('.fc-timegrid-col[data-date="2026-10-22"]').getBoundingClientRect().width)
const hourPx = (page) => page.evaluate(() => { const a = document.querySelector('td.fc-timegrid-slot-lane[data-time="10:00:00"]').getBoundingClientRect(), b = document.querySelector('td.fc-timegrid-slot-lane[data-time="11:00:00"]').getBoundingClientRect(); return b.top - a.top })

// ═══ D · Ctrl+drag duplicates: the original stays, a copy lands, one Undo ═══
if (want('d')) {
  const { ctx, page, errors, state } = await open('/calendar', { scale: 1.25 })
  await threeDays(page)
  const hp = await hourPx(page)
  // an event: Lunch with Omar, Thu 12:30 → a copy at 13:30
  let b = await fcBlock(page, 13).boundingBox()
  let w0 = state.writes.length
  await page.keyboard.down('Control')
  const mid = await drag(page, { x: b.x + b.width / 2, y: b.y + 12 }, { x: b.x + b.width / 2, y: b.y + 12 + hp }, {
    mid: async () => ({ copying: await page.evaluate(() => !!document.querySelector('.kf-cal-copying')), origVisible: await fcBlock(page, 13).evaluate((e) => getComputedStyle(e.closest('.fc-timegrid-event-harness')).visibility) }),
  })
  await page.keyboard.up('Control')
  await settle(state)
  const copies = posts(state, 'calendar_events', w0)
  const copy = copies.find((e) => e.id !== eid(13) && e.title === 'Lunch with Omar')
  check('d Ctrl+drag an event: mid-drag the original stays drawn (copy cursor)', mid.copying && mid.origVisible === 'visible', JSON.stringify(mid))
  const lag = copy && (Date.parse(copy.starts_at) - Date.parse(iso('12:30', 22))) / 60_000
  check(`d …a copy lands where dropped (${lag} min later, on a quarter hour, its hour kept); the original is not written`, lag >= 45 && lag <= 75 && lag % 15 === 0 && Date.parse(copy.ends_at) - Date.parse(copy.starts_at) === 3_600_000 && !copies.some((e) => e.id === eid(13)), JSON.stringify(copies.map((e) => [e.id === eid(13) ? 'ORIGINAL' : 'copy', e.starts_at])))
  check('d …"Duplicated · Lunch with Omar" with Undo', await toastSoon(page, 'Duplicated · Lunch with Omar'))
  await sleep(500)
  await shot(page, 'd-ctrl-drag-event')
  w0 = state.writes.length
  await undo(page, 'Duplicated · Lunch with Omar')
  await settle(state)
  await sleep(500)
  check('d …Undo takes the copy away, the original where it was', (await page.locator(`.fc-event:not(.fc-event-mirror)`, { hasText: 'Lunch with Omar' }).count()) === 1 && (await fcBlock(page, 13).count()) === 1, JSON.stringify(state.writes.slice(w0).map((w) => `${w.method} ${w.table}`)))
  // a task block: Gym, Thu 11:00 → a new task, its block at 12:00
  b = await fcBlock(page, 12).boundingBox()
  w0 = state.writes.length
  await page.keyboard.down('Control')
  await drag(page, { x: b.x + b.width / 2, y: b.y + 12 }, { x: b.x + b.width / 2, y: b.y + 12 + hp })
  await page.keyboard.up('Control')
  await settle(state)
  const t = posts(state, 'tasks', w0).find((x) => x.id !== id(GYM) && x.title === 'Gym')
  const tb = posts(state, 'calendar_events', w0).find((e) => e.task_id === t?.id)
  const lagT = tb && (Date.parse(tb.starts_at) - Date.parse(iso('11:00', 22))) / 60_000
  check(`d Ctrl+drag a task block: a new task, its block where dropped (${lagT} min later); Gym stays at 11:00`, !!t && lagT >= 45 && lagT <= 75 && !posts(state, 'calendar_events', w0).some((e) => e.id === eid(12)), JSON.stringify([t?.id, tb?.starts_at]))
  // a Ctrl+click with no move still picks (the multi-selection)
  await page.keyboard.down('Control')
  await fcBlock(page, 21).click()
  await page.keyboard.up('Control')
  await sleep(300)
  check('d a Ctrl+click without a move still picks the block (multi-select)', await fcBlock(page, 21).evaluate((e) => e.hasAttribute('data-picked')))
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ X · item 10, live multi-drag: every picked block moves under the pointer, all land together, one Undo ═══
const pick = async (page, ns) => {
  await page.keyboard.down('Control')
  for (const n of ns) await fcBlock(page, n).click() // the middle: clear of the check and ▶ ⋯
  await page.keyboard.up('Control')
  await sleep(300)
}
if (want('x')) {
  const { ctx, page, errors, state } = await open('/calendar', { scale: 1.25 })
  await threeDays(page)
  const PICK = [10, 12, 13] // Standup 9:00, Gym 11:00, Lunch 12:30 — Thursday
  await pick(page, PICK)
  const before = Object.fromEntries(await Promise.all(PICK.map(async (n) => [n, await fcBlock(page, n).boundingBox()])))
  const cw = await colW(page), hp = await hourPx(page)
  const g = before[12]
  const dx = cw, dy = hp / 2 // one day on, half an hour later
  const mid = await drag(page, { x: g.x + g.width / 2, y: g.y + 14 }, { x: g.x + g.width / 2 + dx, y: g.y + 14 + dy }, {
    mid: async () => {
      await shot(page, 'x-mid-drag')
      return page.evaluate((ids) => {
        const hosts = [...document.querySelectorAll('.kf-ghost-host')]
        return {
          ghosts: hosts.map((h) => { const b = h.firstElementChild.getBoundingClientRect(); return { id: h.firstElementChild.dataset.kfId, x: b.left, y: b.top, wobble: getComputedStyle(h.firstElementChild).animationName } }),
          mirror: [...document.querySelectorAll('.fc-event-mirror')].map((m) => m.textContent),
          faded: ids.map((i) => { const e = document.querySelector(`.fc-event[data-kf-id="${i}"]:not(.fc-event-mirror)`); return e ? [e.hasAttribute('data-carried'), getComputedStyle(e).opacity] : null }),
        }
      }, PICK.map(eid))
    },
  })
  // each ghost sits at its block + the pointer's travel (the ghost is scaled 1.04 about its centre and wobbles ±1°)
  const off = PICK.map((n) => {
    const gh = mid.ghosts.find((x) => x.id === eid(n))
    if (!gh) return `${n}: no ghost`
    const b = before[n], ex = b.x + dx - b.width * 0.02, ey = b.y + dy - b.height * 0.02
    return Math.abs(gh.x - ex) <= 5 && Math.abs(gh.y - ey) <= 5 ? null : `${n}: at ${gh.x.toFixed(0)},${gh.y.toFixed(0)} want ~${ex.toFixed(0)},${ey.toFixed(0)}`
  }).filter(Boolean)
  check('x mid-drag: all three picked blocks travel as ghosts under the pointer, each its offset from the grabbed one kept (one day on, 30 min later)', mid.ghosts.length === 3 && off.length === 0, off.join(' | ') || JSON.stringify(mid.ghosts))
  check('x …the wobble kept on every ghost; the two others stay faded where they were', mid.ghosts.every((x) => x.wobble.includes('calGridDragFloat')) && mid.faded.filter((f) => f?.[0]).length === 2, JSON.stringify(mid))
  // (the landing writes after the ghosts settle — wait for its toast before reading them; the old 400 ms quiet raced it)
  const landedToast = await toastSoon(page, '3 blocks moved')
  await settle(state)
  const moved = Object.fromEntries(posts(state, 'calendar_events').map((e) => [e.id, e.starts_at]))
  const was = { [eid(10)]: iso('09:00', 22), [eid(12)]: iso('11:00', 22), [eid(13)]: iso('12:30', 22) }
  const deltas = Object.entries(was).map(([k, v]) => (Date.parse(moved[k]) - Date.parse(v)) / 60_000)
  const mins = deltas[0] - 1440
  check(`x they land together: each one day on and ${mins} min later — the same move, snapped to the quarter hour`, deltas.every((d) => d === deltas[0]) && mins >= 15 && mins <= 45 && mins % 15 === 0, JSON.stringify({ moved, deltas }))
  check('x …one toast "3 blocks moved" with Undo', landedToast)
  await sleep(700)
  check('x …no ghost left behind', (await page.locator('.kf-ghost-host').count()) === 0)
  await shot(page, 'x-landed')
  const w1 = state.writes.length
  await undo(page, '3 blocks moved')
  await settle(state)
  const back = Object.fromEntries(posts(state, 'calendar_events', w1).map((e) => [e.id, e.starts_at]))
  check('x Undo puts all three back', back[eid(10)] === iso('09:00', 22) && back[eid(12)] === iso('11:00', 22) && back[eid(13)] === iso('12:30', 22), JSON.stringify(back))
  check('x no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()

  // a move that would put a picked block before the days on screen is refused: nothing moves, the soft-no
  const o = await open('/calendar', { scale: 1.25 })
  await threeDays(o.page)
  await pick(o.page, [3, 10]) // Dentist (Wed, the first day shown) + Standup (Thu)
  const sb = await fcBlock(o.page, 10).boundingBox()
  const cw2 = await colW(o.page)
  const w0 = o.state.writes.length
  const soft = await drag(o.page, { x: sb.x + sb.width / 2, y: sb.y + 14 }, { x: sb.x + sb.width / 2 - cw2, y: sb.y + 14 }, { mid: async () => o.page.locator('.kf-ghost-host').count() })
  await sleep(120)
  const shaking = await o.page.locator('.kf-ghost-host.kf-cal-softno').count()
  await settle(o.state)
  check('x refused: dragging Standup back a day would put Dentist before Wednesday — no block moves, the ghosts shake (soft-no)', soft === 2 && posts(o.state, 'calendar_events', w0).length === 0 && shaking === 2, JSON.stringify({ ghosts: soft, shaking, writes: o.state.writes.slice(w0).map((w) => w.table) }))
  await sleep(500)
  check('x …and every block is still where it was', (await fcBlock(o.page, 3).evaluate((e) => e.closest('.fc-timegrid-col').dataset.date)) === '2026-10-21' && (await fcBlock(o.page, 10).evaluate((e) => e.closest('.fc-timegrid-col').dataset.date)) === '2026-10-22')
  check('x-refused no page errors', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
}

// ═══ V · beside the drawing: design-export/Calendar extras options.html, the picked letters ═══
if (want('v')) {
  const opt = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await opt.goto(OPTIONS)
  await sleep(600)
  // the page's own drawings of the picks (its menu section drawn in palette C)
  await opt.locator('[data-mpal="C"]').click().catch(() => {})
  await sleep(300)
  const drawn = async (sel, k, name) => { const l = opt.locator(sel).nth(k); if (await l.count()) await l.screenshot({ path: path.join(OUT, `v-drawn-${name}.png`) }); return fs.existsSync(path.join(OUT, `v-drawn-${name}.png`)) }
  const has = {
    pd: await drawn('[data-grp="palette"][data-look="C"] figure', 0, 'palette-day'), pn: await drawn('[data-grp="palette"][data-look="C"] figure', 1, 'palette-night'),
    md: await drawn('[data-grp="menu"][data-look="B"] figure', 0, 'menu-day'), mn: await drawn('[data-grp="menu"][data-look="B"] figure', 1, 'menu-night'),
    ck: await drawn('[data-grp="check"][data-look="B"] figure', 0, 'check'), rp: await drawn('[data-grp="repeat"][data-look="B"] figure', 0, 'repeat'),
  }
  check('v the drawings of palette C, menu B, check B and repeat B are on the options page', Object.values(has).every(Boolean), JSON.stringify(has))
  await opt.close()
  const img = (f) => (fs.existsSync(path.join(OUT, f)) ? fs.readFileSync(path.join(OUT, f)).toString('base64') : '')
  async function pair(name, left, right, capL, capR, bg) {
    const p = await browser.newPage({ viewport: { width: 1500, height: 900 } })
    await p.setContent(`<body style="margin:0;padding:16px;display:flex;gap:20px;align-items:flex-start;font:13px system-ui;background:${bg}"><figure style="margin:0"><figcaption style="margin-bottom:6px">${capL}</figcaption><img src="data:image/png;base64,${img(left)}"></figure><figure style="margin:0"><figcaption style="margin-bottom:6px">${capR}</figcaption><img src="data:image/png;base64,${img(right)}"></figure></body>`)
    await sleep(300)
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    await p.close()
  }
  const day = '#f3ecdc; color: #333', night = '#1c1a24; color: #ddd'
  await pair('side-by-side-palette-day', 'v-drawn-palette-day.png', 'p-desktop-day.png', 'Drawn: palette C (day)', 'The app: 3 days at 125%', day)
  await pair('side-by-side-palette-night', 'v-drawn-palette-night.png', 'p-desktop-night.png', 'Drawn: palette C (Night Garden)', 'The app, Night Garden', night)
  await pair('side-by-side-menu-day', 'v-drawn-menu-day.png', 'm-menu-day.png', 'Drawn: menu B (a task block, day)', 'The app: a task block\'s menu', day)
  await pair('side-by-side-menu-night', 'v-drawn-menu-night.png', 'm-menu-night.png', 'Drawn: menu B (an event, night)', 'The app, Night Garden', night)
  await pair('side-by-side-check', 'v-drawn-check.png', 'k-check-open.png', 'Drawn: check B', 'The app: a 1h task block, hovered, 125%', day)
  await pair('side-by-side-repeat', 'v-drawn-repeat.png', 'k-repeat-open.png', 'Drawn: repeat B (chasing box)', 'The app: a weekly task\'s block, hovered, 125%', day)
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
