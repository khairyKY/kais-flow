// shot-bugs (Kai's 3 screenshots of the Windows app, 2026-10-27 evening) on the REAL app against a MOCKED
// backend (the time-slots recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call and applies the writes to its rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Tuesday 27 Oct 2026, Cairo (UTC+3 in the mock's rows; the app's zone is Africa/Cairo), the clock at
// 19:45 — inside "Study Session". Every check runs at UI scale 100% and 150%, desktop 1920×1080 and phone 390.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5330'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const DAY = '2026-10-27'
// Egypt's summer time ends on the last Thursday of October (29 Oct 2026): the 27th is still UTC+3.
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, over.day), ends_at: iso(to, over.day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
  recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, ...over,
})
// Kai's evening: Gym (a ticked task block), "Study Session" (a Time block holding three 30-minute lectures, the
// now line inside it), "Commute with your girl" (an event).
const GYM = 1, L3 = 2, L1 = 3, L2 = 4, LOOSE = 5
const GYMB = 1, STUDY = 2, COMMUTE = 3
const held = (n, title, from, to) => task(n, title, { duration_min: 30, slot_id: eid(STUDY), slot_date: DAY, scheduled_start: iso(from), scheduled_end: iso(to) })
const day = (studyTo) => ({
  tasks: [
    task(GYM, 'Gym Session : Pull', { duration_min: 105, status: 'done', completed_at: iso('19:30'), scheduled_start: iso('17:45'), scheduled_end: iso('19:30') }),
    held(L3, 'Study VLSI lecture 3', '19:30', studyTo),
    held(L1, 'Study VLSI Lecture 1', '19:30', studyTo),
    held(L2, 'Study VLSI Lecture 2', '19:30', studyTo),
    task(LOOSE, 'Read the lab sheet', { duration_min: 30, due_at: iso('09:00') }),
  ],
  calendar_events: [
    ev(GYMB, 'Gym Session : Pull', '17:45', '19:30', GYM, undefined, { color: '#768A42' }),
    ev(STUDY, 'Study Session', '19:30', studyTo, null, 'time_block', { color: '#C9A658' }),
    ev(COMMUTE, 'Commute with your girl', '21:30', '23:30', null, 'event'),
  ],
})
const FULL = day('21:00') // 1h 30m of 1h 30m (screenshot 22)
const OVER = day('20:15') // 1h 30m of 45m (screenshot 23)

const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', auto_file_captures: false, help_seen: ['hint:calendar', 'notice:autofile'], calendar_default_view: 'day' }
const tables = (extra = {}) => structuredClone({ inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], ...extra })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

const DESK = { viewport: { width: 1920, height: 1080 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
async function open(route = '/calendar', o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESK), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, scale]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf_ui_scale', String(scale))
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem('kf.calNowFoldedPhone', '0') // the phone's Now card open, as the desktop's
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [JSON.stringify(session), UID, o.scale ?? 1])
  const state = { rows: tables(o.tables ?? FULL), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
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
  state.page = page
  await page.clock.install({ time: cairo('19:45') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

const fcBlock = (page, n) => page.locator(`td.fc-timegrid-col[data-date="${DAY}"] .fc-event[data-kf-id^="${eid(n)}"]`).first()
const slotRow = (page, taskN) => fcBlock(page, STUDY).locator(`[data-slot-task="${id(taskN)}"]`)
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
/** A lane's top on screen. */
const laneY = async (page, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  const lane = `${String(h).padStart(2, '0')}:${m >= 30 ? '30' : '00'}:00`
  const b = await page.locator(`td.fc-timegrid-slot-lane[data-time="${lane}"]`).boundingBox()
  return b.y + (b.height * (m % 30)) / 30
}
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(900)
}
/** What the grid draws besides the real blocks: every FullCalendar event whose id isn't one of ours, its
 * placeholders, and the lifted card left on <body>; and how many times a title is drawn on the grid. */
const strays = (page, title) => page.evaluate((t) => {
  const evs = [...document.querySelectorAll('.fc-timegrid-col .fc-event')]
  return {
    noId: evs.filter((e) => !e.dataset.kfId && !e.classList.contains('fc-event-mirror')).length,
    mirrors: document.querySelectorAll('.fc-event-mirror').length,
    lifted: [...document.querySelectorAll('body > .fc-event-dragging')].filter((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length,
    drawn: evs.filter((e) => (e.querySelector('.fc-event-title')?.textContent ?? '').trim() === t).length
      + [...document.querySelectorAll('.kf-ev-slot-title')].filter((e) => e.textContent.trim() === t).length,
  }
}, title)

// ── B1 (shot 22): a held row dragged within its own slot, and out of it onto empty time — no stray block
// stays behind, no task is drawn twice ──
if (want('b1')) {
  for (const scale of [1, 1.5]) {
    const S = `b1 ${scale * 100}%`
    const { ctx, page, errors, state } = await open('/calendar', { scale })
    await slotRow(page, L3).scrollIntoViewIfNeeded()
    const from = center(await slotRow(page, L3).locator('.kf-ev-slot-title').boundingBox())
    const col = await page.locator(`td.fc-timegrid-col[data-date="${DAY}"]`).boundingBox()
    // within: let go at 20:45, inside the slot that holds it
    await mouseDrag(page, from, { x: col.x + col.width * 0.6, y: (await laneY(page, '20:45')) + 6 })
    let s = await strays(page, 'Study VLSI lecture 3')
    check(`${S} within the slot: nothing written, no stray block, no placeholder, no lifted card left`, state.writes.length === 0 && s.noId === 0 && s.mirrors === 0 && s.lifted === 0, JSON.stringify(s))
    check(`${S} within the slot: the task drawn once (its row)`, s.drawn === 1 && (await slotRow(page, L3).count()) === 1, JSON.stringify(s))
    if (scale === 1) await shot(page, 'b1-within-after')
    // out: let go on empty time (16:00), off every block
    const from3 = center(await slotRow(page, L1).locator('.kf-ev-slot-title').boundingBox())
    await mouseDrag(page, from3, { x: col.x + col.width * 0.6, y: (await laneY(page, '16:00')) + 6 })
    await sleep(800)
    s = await strays(page, 'Study VLSI Lecture 1')
    const blocks = state.rows.calendar_events.filter((e) => e.task_id === id(L1) && !e.deleted_at)
    check(`${S} out of the slot: one block made, the task out of the slot, drawn once`, blocks.length === 1 && s.drawn === 1 && s.noId === 0 && s.mirrors === 0 && s.lifted === 0 && (await slotRow(page, L1).count()) === 0, JSON.stringify({ ...s, blocks: blocks.length }))
    if (scale === 1) await shot(page, 'b1-out-after')
    check(`${S} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

/** Every hour label whole: its text not cut by its own box, and the box inside the gutter and the window. */
const labelsWhole = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('.fc-timegrid-slot-label-cushion, .pc-hour > span')].filter((e) => e.textContent.trim())
  const axis = document.querySelector('.fc-timegrid-axis, .fc-timegrid-slot-label')?.getBoundingClientRect()
  const cut = els.filter((e) => {
    const r = e.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(e)
    const t = range.getBoundingClientRect()
    return e.scrollWidth > e.clientWidth + 1 || t.left < r.left - 0.5 || t.right > r.right + 0.5 || r.left < 0 || (axis && e.matches('.fc *') && t.left < axis.left - 0.5)
  })
  return { n: els.length, cut: cut.map((e) => e.textContent.trim()).slice(0, 5) }
})

// ── B2 (shot 22): the hour labels whole ("7 PM", not "M") — desktop with the rail open and phone, 100% and 150% ──
if (want('b2')) {
  for (const scale of [1, 1.5]) {
    for (const [v, view] of [['desktop', DESK], ['phone', PHONE]]) {
      const { ctx, page, errors } = await open('/calendar', { scale, view })
      const l = await labelsWhole(page)
      check(`b2 ${v} ${scale * 100}%: every hour label whole`, l.n >= 6 && l.cut.length === 0, JSON.stringify(l))
      if (v === 'desktop' && scale === 1.5) await shot(page, 'b2-labels-150')
      check(`b2 ${v} ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// ── B3 (shot 23): the sidebar's header stays whole and in view when the column is scrolled ──
if (want('b3')) {
  for (const scale of [1, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale, view: { viewport: { width: 1920, height: 700 } } })
    const r = await page.evaluate(async () => {
      const col = document.querySelector('.app-sidebar-col')
      col.scrollTop = col.scrollHeight
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
      const h = document.querySelector('.kf-side-me').getBoundingClientRect()
      return { scrolled: col.scrollTop, top: h.top, bottom: h.bottom, colTop: col.getBoundingClientRect().top }
    })
    check(`b3 ${scale * 100}%: the column scrolled, the header still whole at the top, above the column`, r.scrolled > 0 && r.top >= 0 && r.bottom <= r.colTop + 0.5, JSON.stringify(r))
    if (scale === 1.5) await shot(page, 'b3-sidebar-scrolled-150')
    check(`b3 ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── B4 (shot 23): a Time block cut to 45m holding 1h 30m: "45m over" in Ran over's terra, and its rows reachable ──
if (want('b4')) {
  for (const scale of [1, 1.5]) {
    const S = `b4 ${scale * 100}%`
    const { ctx, page, errors, state } = await open('/calendar', { scale, tables: OVER })
    const blk = fcBlock(page, STUDY)
    await blk.scrollIntoViewIfNeeded()
    const fill = await blk.locator('.kf-ev-fill').innerText()
    const over = await page.evaluate(() => {
      const o = document.querySelector('.kf-ev-over')
      const probe = document.createElement('i')
      probe.style.color = 'var(--blk-ran-ink)'
      document.body.appendChild(probe)
      const want = getComputedStyle(probe).color
      probe.remove()
      return o ? { text: o.textContent, color: getComputedStyle(o).color, want } : null
    })
    check(`${S}: the fill says "3 tasks · 1h 30m of 45m · 45m over", the over part in --blk-ran-ink`, /3 tasks · 1h\s30m of 45m · 45m over/.test(fill) && over?.text === '45m over' && over.color === over.want, JSON.stringify({ fill, over }))
    const box = await blk.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await sleep(400)
    const rows = await page.evaluate((ids) => {
      const ev = document.querySelector(`.fc-event[data-kf-id^="${ids.slot}"]`).getBoundingClientRect()
      return ids.rows.map((t) => {
        const ck = document.querySelector(`[data-slot-task="${t}"] .kf-ev-check`)
        const r = ck.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return { inBlock: r.bottom <= ev.bottom + 0.5, hit: hit === ck || ck.contains(hit) }
      })
    }, { slot: eid(STUDY), rows: [id(L3), id(L1), id(L2)] })
    check(`${S}: under the pointer the block opens out — all 3 rows inside it, each box the one hit there`, rows.every((r) => r.inBlock && r.hit), JSON.stringify(rows))
    if (scale === 1) await shot(page, 'b4-over-hover')
    // tick the last row from there: it really completes
    const w0 = state.writes.length
    await slotRow(page, L2).locator('.kf-ev-check').click()
    await sleep(800)
    check(`${S}: the last row's box ticks its task`, state.writes.slice(w0).some((w) => w.table === 'tasks' && JSON.stringify(w.body).includes(id(L2)) && JSON.stringify(w.body).includes('"done"')))
    await page.mouse.move(5, 500)
    await sleep(400)
    const after = await blk.boundingBox()
    check(`${S}: the pointer gone, it is its own 45 minutes again`, Math.abs(after.height - box.height) < 1.5, `${box.height} → ${after.height}`)
    if (scale === 1) await shot(page, 'b4-over-rest')
    // a full (not over) block says nothing more
    check(`${S} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  for (const scale of [1, 1.5]) {
    const { ctx, page } = await open('/calendar', { scale, tables: FULL })
    const fill = await fcBlock(page, STUDY).locator('.kf-ev-fill').innerText()
    check(`b4 ${scale * 100}%: a full block (1h 30m of 1h 30m) has no "over"`, !/over/.test(fill), fill)
    await ctx.close()
    // the phone draws a slot's fill once the block has room for a second line (PhoneGrid `stacked`, 56px):
    // a 1h slot holding 1h 30m
    const ph = await open('/calendar', { scale, tables: day('20:30'), view: PHONE })
    const blk = ph.page.locator(`.pc-block[data-id^="${eid(STUDY)}"]`).first()
    await blk.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {})
    await sleep(300)
    const t = await blk.locator('.pc-slot-over').innerText().catch(() => '')
    check(`b4 phone ${scale * 100}%: the phone's slot says "30m over" too`, t === '30m over', t)
    if (scale === 1) await shot(ph.page, 'b4-phone-over')
    await ph.ctx.close()
  }
}

// ── B6 (shots 23 / 24): the Now card — a Time block wears the untickable ring, a task the drawn square box
// (.kc: 15px, 5px corners, 2px edge), with ▶ Focus; Next hangs under the card as drawn (tucked 10px) ──
const nowProbe = (page) => page.evaluate(() => {
  const card = document.querySelector('.cal-now-dock .kf-now-main, .kf-now--phone .kf-now-main')
  if (!card) return null
  const ring = card.querySelector('.kf-now-tl .kf-now-ring')
  const box = card.querySelector('.kf-now-tl .kf-checkbox')
  const cs = box && getComputedStyle(box)
  const nx = card.parentElement.querySelector('.kf-now-nx')
  const cr = card.getBoundingClientRect(), nr = nx?.getBoundingClientRect()
  return {
    title: card.querySelector('.kf-now-tl .kf-now-t')?.textContent,
    ring: !!ring, ringHidden: ring?.getAttribute('aria-hidden') === 'true', ringRole: ring?.getAttribute('role') ?? null,
    box: box ? { w: box.getBoundingClientRect().width, radius: cs.borderTopLeftRadius, edge: cs.borderTopWidth, role: box.getAttribute('role') } : null,
    focus: !!card.querySelector('.kf-now-focus'),
    next: nr ? { text: nx.textContent.replace(/\s+/g, ' ').trim(), tuck: Math.round(cr.bottom - nr.top), below: Math.round(nr.bottom - cr.bottom) } : null,
  }
})
if (want('b6')) {
  // a Time block ongoing (23)
  for (const scale of [1, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale, tables: OVER })
    const n = await nowProbe(page)
    check(`b6 ${scale * 100}% Time block: the ring (decor, no role), no box, no Focus`, n?.title === 'Study Session' && n.ring && n.ringHidden && !n.ringRole && !n.box && !n.focus, JSON.stringify(n))
    if (scale === 1.5) await page.locator('.cal-now-dock').screenshot({ path: path.join(OUT, 'b6-now-block-150.png') })
    check(`b6 ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // a task block ongoing with a task next (24): Lecture 1 1:00–1:30 AM, Lecture 2 next
  const NIGHT = {
    tasks: [task(L1, 'Study VLSI Lecture 1', { duration_min: 30, scheduled_start: iso('19:30'), scheduled_end: iso('20:00') }), task(L2, 'Study VLSI Lecture 2', { duration_min: 30, scheduled_start: iso('20:15'), scheduled_end: iso('20:45') })],
    calendar_events: [ev(11, 'Study VLSI Lecture 1', '19:30', '20:00', L1), ev(12, 'Study VLSI Lecture 2', '20:15', '20:45', L2)],
  }
  for (const scale of [1, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale, tables: NIGHT })
    await page.locator('.cal-now-dock .kf-now-tl').hover()
    await sleep(200)
    const n = await nowProbe(page)
    // the box is measured on screen (× the UI scale); its radius is a CSS value
    const r = parseFloat(n?.box?.radius ?? '99'), w = (n?.box?.w ?? 0) / scale, tuck = Math.round((n?.next?.tuck ?? 0) / scale)
    check(`b6 ${scale * 100}% task: a square box as drawn (15px, 5px corners, 2px edge — not a circle), a checkbox, ▶ Focus`, n?.box?.role === 'checkbox' && Math.abs(w - 15) < 0.6 && Math.abs(r - 5) < 0.6 && n.box.edge === '2px' && !n.ring && n.focus, JSON.stringify(n))
    check(`b6 ${scale * 100}% Next hangs under the card as drawn: 10px tucked behind, the rest below`, n?.next && /Next.*Study VLSI Lecture 2.*in 30m/.test(n.next.text) && tuck === 10 && n.next.below > 20, JSON.stringify(n?.next))
    if (scale === 1.5) await page.locator('.cal-now-dock').screenshot({ path: path.join(OUT, 'b6-now-task-150.png') })
    check(`b6 ${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── B7 (shot 23): "Lists…" is the rail's opener for an empty Lists section (cal-wave item 18), not a stub ──
// ── Phone 390 (each bug where the phone has the surface): the slot's task drawn once (B1); no sidebar to clip
// (B3); the Now card's ring for a Time block and the square box for a task (B6) ──
if (want('ph')) {
  for (const scale of [1, 1.5]) {
    const S = `ph ${scale * 100}%`
    let { ctx, page, errors } = await open('/calendar', { scale, view: PHONE })
    const drawn = await page.evaluate(() => [...document.querySelectorAll('.pc-block .pc-name, .pc-block .pc-title, .pc-block [class*="title"]')].filter((e) => e.textContent.trim() === 'Study VLSI lecture 3').length)
    check(`${S} B1: the held task is drawn once on the phone grid`, drawn === 1, drawn)
    check(`${S} B3: no sidebar on the phone`, (await page.locator('.app-sidebar').isVisible().catch(() => false)) === false)
    const n = await nowProbe(page)
    check(`${S} B6: the phone's Now card — Time block: the ring, no box`, n?.title === 'Study Session' && n.ring && !n.box, JSON.stringify(n))
    if (scale === 1) await shot(page, 'ph-calendar')
    check(`${S} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

if (want('b7')) {
  const { ctx, page, errors } = await open('/calendar', { scale: 1 })
  const more = page.locator('.cal-rail-more', { hasText: 'Lists…' })
  const was = await more.count()
  await more.click()
  await sleep(400)
  const picker = await page.getByRole('combobox', { name: 'Rail scope type' }).count() + await page.locator('[aria-label="Rail scope type"]').count()
  check('b7 "Lists…" is a button that brings back Lists and its scope picker', was === 1 && picker > 0, `${was} ${picker}`)
  check('b7 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

if (process.env.ONLY?.split(',').includes('look')) { // plain screenshots, on request only
  for (const scale of [1, 1.5]) {
    for (const [name, t] of [['full', FULL], ['over', OVER]]) {
      const { ctx, page } = await open('/calendar', { scale, tables: t })
      await shot(page, `look-${name}-${scale * 100}`)
      await ctx.close()
    }
  }
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
