// cal-looks (Kai 2026-10-23, "blocks: Now · overlap B · goal A · selected B"): the calendar's blocks drawn as
// design-export/Calendar blocks options.html draws them — the "Now" look, overlapping blocks in a cascade, the
// goal of the day's block with a gold edge and ✶, and picked blocks with a wash and a check badge. On the REAL
// app against a MOCKED backend (the cal-polish recipe: dev server in `--mode mock`, a made-up session in
// localStorage, Playwright answers every REST call). Writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3), the clock at 12:09 — as the options page draws it.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5303'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const OPTIONS = new URL('../../../../design-export/Calendar blocks options.html', import.meta.url).href
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
const UID = '00000000-0000-4000-8000-00000000c10c'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the week: Wed 21 (today) to Fri 23 ──
const DAY = 21
const DATE = '2026-10-21'
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
// The options page's area hues (formFields ACCENT_COLORS): Work hydrangea · Health sage · Personal blossom · Shaheen buttercream.
const HYD = '#9AB4BE', SAG = '#8A9A7E', BUT = '#D4C78A'
const sched = (from, to, day = DAY) => ({ scheduled_start: iso(from, day), scheduled_end: iso(to, day), due_at: iso(from, day) })
// tasks
const TAX = 1, TYRE = 2, CRYPTO = 3, GOAL = 4, OMAR = 5, PR = 6, GYM = 7, READ = 8, WATER = 9, EMAIL = 10, DEEP = 11, INVEST = 12, CAR = 13, VET = 14
const TASKS = [
  task(TAX, 'Send the tax papers', { ...sched('08:30', '09:00'), status: 'done', completed_at: iso('08:50') }),
  task(TYRE, 'Call the tyre supplier', sched('09:30', '10:30')),
  task(CRYPTO, 'Crypto — heavy session', { ...sched('11:30', '13:00'), top3: true, top3_rank: 2 }),
  task(GOAL, 'Ship the calendar polish 🌸', { ...sched('13:15', '13:45'), top3: true, top3_rank: 1 }),
  task(OMAR, 'Reply to Omar', sched('14:00', '14:30')),
  task(PR, "Review Kai's PR", sched('09:30', '10:30', 22)),
  task(GYM, 'Gym', sched('11:00', '12:00', 22)),
  task(READ, 'Read 2 pages', sched('11:30', '12:00', 22)),
  task(WATER, 'Water the plants and refill the bird feeder', sched('09:00', '09:15', 23)),
  task(EMAIL, "Kai's Flow email: Gmail App Password + 2 GitHub secrets 🌸", sched('09:30', '10:00', 23)),
  task(DEEP, 'Deep work on the quarterly forecast numbers for Shaheen', sched('10:15', '11:15', 23)),
  task(INVEST, 'Write the investor update and the hiring plan for the first quarter', sched('11:30', '13:15', 23)),
  task(CAR, 'Renew car insurance', { ...sched('13:30', '15:00', 23), duration_min: 30, status: 'done', completed_at: iso('08:00'), slot_id: eid(30), slot_date: '2026-10-23' }),
  task(VET, 'Book the vet', { ...sched('13:30', '15:00', 23), duration_min: 15, slot_id: eid(30), slot_date: '2026-10-23' }),
]
const EVENTS = [
  // Wed — today
  ev(1, 'Send the tax papers', '08:30', '09:00', DAY, TAX),
  ev(2, 'Call the tyre supplier', '09:30', '10:30', DAY, TYRE, undefined, { color: BUT }),
  ev(3, 'Dentist', '10:30', '11:15', DAY),
  ev(4, 'Crypto — heavy session', '11:30', '13:00', DAY, CRYPTO),
  ev(5, 'Ship the calendar polish 🌸', '13:15', '13:45', DAY, GOAL),
  ev(6, 'Reply to Omar', '14:00', '14:30', DAY, OMAR, undefined, { color: HYD }),
  ev(7, 'Pay the rent', '14:30', '15:00', DAY),
  // Thu — overlaps (two; three with a task at the bottom), an event under the pointer, the goal's task on another day
  ev(10, 'Standup', '09:00', '10:00', 22, null, undefined, { color: HYD }),
  ev(11, "Review Kai's PR", '09:30', '10:30', 22, PR),
  ev(13, 'Gym', '11:00', '12:00', 22, GYM, undefined, { color: SAG }),
  ev(12, 'Lunch with Omar', '11:15', '12:15', 22),
  ev(14, 'Read 2 pages', '11:30', '12:00', 22, READ),
  ev(15, 'Design review', '13:00', '14:00', 22, null, undefined, { color: HYD }),
  ev(16, 'Ship the calendar polish 🌸', '15:00', '15:30', 22, GOAL),
  // Fri — 15 / 30 / 60 / 105 minutes with long titles, and a Time slot holding two tasks
  ev(20, 'Water the plants and refill the bird feeder', '09:00', '09:15', 23, WATER, undefined, { color: SAG }),
  ev(21, "Kai's Flow email: Gmail App Password + 2 GitHub secrets 🌸", '09:30', '10:00', 23, EMAIL),
  ev(22, 'Deep work on the quarterly forecast numbers for Shaheen', '10:15', '11:15', 23, DEEP, undefined, { color: BUT }),
  ev(23, 'Write the investor update and the hiring plan for the first quarter', '11:30', '13:15', 23, INVEST, undefined, { color: HYD }),
  ev(30, 'Admin', '13:30', '15:00', 23, null, 'time_block', { color: HYD }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', ...(o.reducedMotion ? { reducedMotion: 'reduce' } : null) })
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
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]:not(.fc-event-mirror)`).first()
const pcBlock = (page, n) => page.locator(`.pc-block[data-id="${eid(n)}"]`).first()

/** The desktop grid on N days (View options ▸ the view row), scrolled so 08:45 is at the top. */
async function nDays(page, n) {
  await page.locator('button', { hasText: /^(Week|Day|\d days)$/ }).first().click()
  await sleep(300)
  await page.locator('[aria-label="View options"] .cal-vo-row button', { hasText: new RegExp(`^${n}$`) }).click()
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
/** The phone grid scrolled so `min` sits near the top. */
async function scrollPhone(page, min) {
  await page.evaluate((m) => {
    const el = document.querySelector('.pc-scroll')
    if (el) el.scrollTop = (m / 60) * 64 - 20
  }, min)
  await sleep(300)
}
/** Ctrl+click two blocks (the multi-select). */
async function pickTwo(page) {
  await page.keyboard.down('Control')
  await fcBlock(page, 6).click()
  await fcBlock(page, 7).click()
  await page.keyboard.up('Control')
  await sleep(300)
}

// ═══ S · the survey: the app next to the drawing (desktop day + night at 125%, the phone) ═══
if (want('s')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    await pickTwo(page)
    const dr = await fcBlock(page, 15).boundingBox()
    await page.mouse.move(dr.x + dr.width * 0.6, dr.y + 20)
    await sleep(400)
    await shot(page, `s-desktop-${theme}`)
    check(`s-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, view: phone })
    await scrollPhone(page, 8 * 60 + 15)
    await shot(page, `s-phone-${theme}`)
    check(`s-phone-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── the drawing: design-export/Calendar blocks options.html, read in the browser ──
async function optionsPage() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(OPTIONS)
  await sleep(500)
  return { ctx, page }
}
/** Computed looks of a block's parts — the box, its title, time row, check and (a slot's) fill line and first
 * row. Colours resolve through a probe, so a fill drawn as a gradient over paper compares as the tint itself. */
const LOOKS = `(el, q) => {
  const pick = (e, ks) => { if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries(ks.map((k) => [k, c[k]])) }
  const tint = (e, v) => { const i = document.createElement('i'); i.style.color = v; e.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c }
  const tt = el.querySelector(q.tt), tm = el.querySelector(q.tm), ck = el.querySelector(q.ck), fill = q.fill && el.querySelector(q.fill), row = q.row && el.querySelector(q.row)
  return {
    fill: q.fillVar ? tint(el, q.fillVar) : getComputedStyle(el).backgroundColor,
    box: pick(el, ['borderTopColor', 'borderTopWidth', 'borderTopStyle', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'opacity']),
    tt: pick(tt, ['fontSize', 'fontWeight', 'lineHeight', 'color', 'fontFamily', 'textDecorationLine']),
    tm: tm && getComputedStyle(tm).display !== 'none' ? pick(tm, ['fontSize', 'color', 'fontFamily', 'marginTop']) : 'hidden',
    ck: pick(ck, ['width', 'height', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'opacity', 'fontSize', 'backgroundColor']),
    fillLine: pick(fill, ['fontSize', 'paddingTop', 'borderTopWidth']),
    row: pick(row, ['borderTopLeftRadius', 'paddingLeft', 'borderTopWidth']),
    rowT: pick(row && row.querySelector(q.rowT), ['fontSize']),
    rowCk: pick(row && row.querySelector(q.ck), ['width', 'height']),
  }
}`
const DRAWN_Q = { tt: '.tt', tm: '.tm', ck: '.ck', fill: '.fill', row: '.row', rowT: '.t' }
const APP_Q = { tt: '.fc-event-title', tm: '.fc-event-time:not(.kf-ev-fill)', ck: '.kf-ev-check', fill: '.kf-ev-fill', row: '.kf-ev-slot-row', rowT: '.kf-ev-slot-title', fillVar: 'var(--kf-ev-fill)' }
const nFrame = (theme) => `document.querySelectorAll('[data-grp="blocks"][data-look="N"] figure .frame')[${theme === 'night' ? 1 : 0}]`
async function drawnLooks(page, theme, names) {
  return page.evaluate(([src, q, fr, names]) => {
    const read = eval(src)
    const frame = eval(fr)
    const find = (t) => [...frame.querySelectorAll('.blk')].find((e) => e.textContent.includes(t))
    return Object.fromEntries(names.map((t) => [t, read(find(t), q)]))
  }, [LOOKS, DRAWN_Q, nFrame(theme), names])
}
const appLook = (page, n) => fcBlock(page, n).evaluate((el, [src, q]) => eval(src)(el, q), [LOOKS, APP_Q])
const px = (v) => parseFloat(v)
/** Compares the named parts; px within 0.15 (the drawing writes 10.6 for the app's 8.5 × 1.25 = 10.625). */
function same(a, b, keys) {
  const off = []
  for (const k of keys) {
    const [part, prop] = k.split('.')
    const x = prop ? a?.[part]?.[prop] : a?.[part]
    const y = prop ? b?.[part]?.[prop] : b?.[part]
    const ok = /px$/.test(String(x)) && /px$/.test(String(y)) ? Math.abs(px(x) - px(y)) <= 0.15 : String(x) === String(y)
    if (!ok) off.push(`${k}: drawn ${x} · app ${y}`)
  }
  return off
}
const TYPE = ['tt.fontSize', 'tt.fontWeight', 'tt.lineHeight', 'tt.color', 'tt.fontFamily', 'tm.fontSize', 'tm.fontFamily', 'tm.marginTop']
const BOX = ['box.borderTopWidth', 'box.borderTopStyle', 'box.borderTopLeftRadius', 'box.paddingTop', 'box.paddingLeft']
const CHECK = ['ck.width', 'ck.height', 'ck.borderTopWidth', 'ck.borderTopColor', 'ck.borderTopLeftRadius', 'ck.fontSize']
const HUE = ['fill', 'box.borderTopColor', 'tm.color']

// ═══ C1 · property by property: the drawn "Now" vs the app's blocks, desktop 125%, day and Night Garden ═══
if (want('c1')) {
  const opt = await optionsPage()
  for (const theme of ['day', 'night']) {
    const d = await drawnLooks(opt.page, theme, ['Crypto', 'tyre', 'Dentist', 'Send the tax', 'Errands', 'Deep work'])
    const { ctx, page, errors } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    await page.mouse.move(2, 400)
    const a = { now: await appLook(page, 4), ran: await appLook(page, 2), past: await appLook(page, 3), done: await appLook(page, 1), slot: await appLook(page, 30) }
    const t = `c1-${theme}`
    // cal-blocks (Kai 2026-10-26): the hues are palette C's and the check is check B since — cal-blocks/verify.mjs checks
    // those (palette, contrast, check geometry); here the drawing still holds the geometry and the type.
    let off = same(d.Crypto, a.now, [...BOX, ...TYPE, 'ck.opacity', 'box.opacity'])
    check(`${t} a task, in progress: edge, corners, insets, title and time row as drawn (hue: palette C, check: check B)`, off.length === 0, off.join(' | '))
    off = same(d.tyre, a.ran, [...BOX, ...TYPE, 'box.borderTopColor', 'box.opacity'])
    check(`${t} "Ran over": the terra edge as drawn (its time ink: palette C's own terra)`, off.length === 0, off.join(' | '))
    off = same(d.Dentist, a.past, [...BOX, ...TYPE, 'box.opacity'])
    check(`${t} a past event: faded to .62 as drawn (its hue: palette C's Rose)`, off.length === 0, off.join(' | '))
    off = same(d['Send the tax'], a.done, [...BOX, 'tt.fontSize', 'tt.color', 'tt.textDecorationLine', 'tm', 'ck.backgroundColor', 'ck.opacity', 'box.opacity'])
    check(`${t} done and past, 30 minutes: one line (no time row), the check filled, the title struck`, off.length === 0, off.join(' | '))
    off = same(d.Errands, a.slot, [...BOX, 'tt.fontSize', 'tm.fontSize', 'fillLine.fontSize', 'fillLine.paddingTop', 'fillLine.borderTopWidth', 'rowT.fontSize', 'row.borderTopLeftRadius', 'row.paddingLeft', 'row.borderTopWidth'])
    check(`${t} a Time slot holding tasks: the fill line under a hairline, 13px rows (their checks: check B's 13px)`, off.length === 0, off.join(' | '))
    const slotTime = await fcBlock(page, 30).locator('.fc-event-time').first().innerText()
    check(`${t} …the slot's time row is its start ("1:30 PM", as drawn)`, slotTime.trim() === '1:30 PM', slotTime)
    // hover: the check shows, the actions ▶ ⋯ sit at the end of the title's line
    const db = await fcBlock(page, 22).boundingBox()
    await page.mouse.move(db.x + db.width * 0.5, db.y + db.height * 0.6)
    await sleep(450)
    const hov = await appLook(page, 22)
    off = same(d['Deep work'], hov, [...BOX, ...TYPE, 'ck.opacity'])
    const acts = await fcBlock(page, 22).locator('.kf-ev-act').evaluateAll((els) => els.map((e) => [e.textContent.trim(), getComputedStyle(e).width]))
    const drawnActs = await opt.page.evaluate((fr) => {
      const b = [...eval(fr).querySelectorAll('.blk')].find((e) => e.textContent.includes('Deep work'))
      return [...b.querySelectorAll('.acts i')].map((e) => [e.textContent.trim(), getComputedStyle(e).width])
    }, nFrame(theme))
    check(`${t} hover on a task (1h): the check shows; ▶ and ⋯ as drawn`, off.length === 0 && JSON.stringify(acts) === JSON.stringify(drawnActs), [off.join(' | '), JSON.stringify(acts), JSON.stringify(drawnActs)].join(' / '))
    check(`${t} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  await opt.ctx.close()
}

// ═══ C2 · the states and the lengths (desktop 100 / 125 / 150%, the phone) ═══
if (want('c2')) {
  for (const scale of [1, 1.25, 1.5]) {
    const { ctx, page, errors } = await open('/calendar', { scale })
    await nDays(page, 3)
    const t = `c2-${scale * 100}`
    const text = async (n) => (await fcBlock(page, n).innerText()).replace(/\s+/g, ' ').trim()
    const vis = (n, s) => fcBlock(page, n).locator(s).first().evaluate((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0).catch(() => false)
    check(`${t} 15 and 30 minutes are one line, no time row`, !(await vis(20, '.fc-event-time')) && !(await vis(21, '.fc-event-time')) && (await fcBlock(page, 20).evaluate((e) => e.classList.contains('kf-one'))), [await text(20), await text(21)].join(' / '))
    check(`${t} 1h: the range and its length ("10:15–11:15 AM · 1h")`, (await text(22)).endsWith('10:15–11:15 AM · 1h'), await text(22))
    check(`${t} 1h45: "11:30 AM–1:15 PM · 1h 45m"`, (await text(23)).endsWith('11:30 AM–1:15 PM · 1h 45m'), await text(23))
    // the title wraps as far as the block holds over its time row — the time row stays inside the block
    const fit = await fcBlock(page, 23).evaluate((e) => { const b = e.getBoundingClientRect(), t = e.querySelector('.fc-event-time').getBoundingClientRect(), tt = e.querySelector('.fc-event-title'); return { lines: Math.round(tt.getBoundingClientRect().height / parseFloat(getComputedStyle(tt).lineHeight)), inside: t.bottom <= b.bottom + 0.5 } })
    check(`${t} 1h45 with a long title: it wraps (${fit.lines} lines) and the time row still shows`, fit.lines >= 2 && fit.inside, JSON.stringify(fit))
    const fit1 = await fcBlock(page, 22).evaluate((e) => { const b = e.getBoundingClientRect(), t = e.querySelector('.fc-event-time').getBoundingClientRect(); return t.bottom <= b.bottom + 0.5 && t.height > 0 })
    check(`${t} 1h with a long title: the time row still shows`, fit1)
    check(`${t} "Now · 51m left", the lived share washing in from the top (43%)`, (await text(4)).includes('Now · 51m left') && (await fcBlock(page, 4).evaluate((e) => e.style.getPropertyValue('--kf-elapsed') === '43%' && getComputedStyle(e).backgroundImage.startsWith('linear-gradient'))), await text(4))
    check(`${t} "Ran over · 10:30 AM"`, (await text(2)).includes('Ran over · 10:30 AM'), await text(2))
    check(`${t} a done block has no petal (its check and strike say it)`, (await page.locator('.kf-ev-petal').count()) === 0)
    const m = await fcBlock(page, 22).evaluate((e) => { const c = e.querySelector('.kf-ev-check').getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(e.querySelector('.fc-event-title')); const l = [...r.getClientRects()].filter((x) => x.height > 0)[0]; return { check: c.top + c.height / 2, line: l.top + l.height / 2 } })
    check(`${t} the check sits on the title's first line`, Math.abs(m.check - m.line) <= 1.5, JSON.stringify(m))
    if (scale === 1.5) {
      // the drawing's "Fri at 150%": the same column zoomed — compare the drawn geometry
      const opt = await optionsPage()
      const dr = await opt.page.evaluate(() => {
        const fr = document.querySelectorAll('[data-grp="blocks"][data-look="N"] figure .frame')[2]
        const b = [...fr.querySelectorAll('.blk')].find((e) => e.textContent.includes('Write the investor'))
        const z = 1.2, br = b.getBoundingClientRect(), tt = b.querySelector('.tt'), tm = b.querySelector('.tm')
        const r = document.createRange(); r.selectNodeContents(tt); const l = [...r.getClientRects()].filter((x) => x.height > 0)[0]
        return { inset: l.top - br.top, lineH: parseFloat(getComputedStyle(tt).lineHeight) * z, timeFont: parseFloat(getComputedStyle(tm).fontSize) * z, titleFont: parseFloat(getComputedStyle(tt).fontSize) * z }
      })
      const ap = await fcBlock(page, 23).evaluate((b) => {
        const br = b.getBoundingClientRect(), tt = b.querySelector('.fc-event-title'), tm = b.querySelector('.fc-event-time')
        const r = document.createRange(); r.selectNodeContents(tt); const l = [...r.getClientRects()].filter((x) => x.height > 0)[0]
        return { inset: l.top - br.top, lineH: parseFloat(getComputedStyle(tt).lineHeight), timeFont: parseFloat(getComputedStyle(tm).fontSize), titleFont: parseFloat(getComputedStyle(tt).fontSize) }
      })
      const near = Object.keys(dr).every((k) => Math.abs(dr[k] - ap[k]) <= 1)
      check(`${t} at 150% a block reads as the drawing's "Fri at 150%" (title ${ap.titleFont}px, time ${ap.timeFont}px, line ${ap.lineH}px, inset ${ap.inset.toFixed(1)}px)`, near, JSON.stringify({ drawn: dr, app: ap }))
      await opt.ctx.close()
    }
    await shot(page, `c2-desktop-${scale * 100}`)
    check(`${t} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // the phone: the same look (the edge, the regular title, past at .62, ran over, the lived share, the check)
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, view: phone })
    await scrollPhone(page, 8 * 60 + 15)
    const st = (n, f) => pcBlock(page, n).evaluate(f)
    const edge = await st(4, (e) => [getComputedStyle(e).boxShadow, getComputedStyle(e).getPropertyValue('--pc-edge')])
    check(`p-${theme} a block has its 1px edge (an inset ring, the accent at 45%) and a regular-weight title`, /inset/.test(edge[0]) && /0px 0px 0px 1px/.test(edge[0]) && edge[1].includes('45%') && (await pcBlock(page, 4).locator('.pc-name').evaluate((e) => getComputedStyle(e).fontWeight)) === '400', JSON.stringify(edge))
    check(`p-${theme} past at .62, no desaturation`, await st(3, (e) => getComputedStyle(e).opacity === '0.62' && getComputedStyle(e).filter === 'none'))
    check(`p-${theme} ran over: a terra edge, "Ran over · 10:30 AM", not faded`, (await pcBlock(page, 2).innerText()).includes('Ran over · 10:30 AM') && (await st(2, (e) => e.classList.contains('is-ranover') && getComputedStyle(e).opacity === '1')))
    check(`p-${theme} in progress: the lived share washes in from the top (43%)`, await st(4, (e) => e.classList.contains('is-now') && e.style.getPropertyValue('--pc-elapsed') === '43%'))
    check(`p-${theme} an open check is edged in the block's ink, no fill`, await pcBlock(page, 4).locator('.kf-checkbox').evaluate((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)'))
    check(`p-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ G · goal A: the gold edge and ✶ on today's block of the goal only ═══
if (want('g')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    const goals = await page.evaluate(() => [...document.querySelectorAll('.fc-event.kf-goal:not(.fc-event-mirror)')].map((e) => e.dataset.kfId))
    check(`g-${theme} only today's block of the goal of the day (Top 3 #1) wears it — not its Thursday block, not Top 3 #2`, goals.length === 1 && goals[0] === eid(5), JSON.stringify(goals))
    const g = await fcBlock(page, 5).evaluate((e) => [getComputedStyle(e).boxShadow, getComputedStyle(e).borderTopColor, getComputedStyle(e.querySelector('.kf-ev-star')).color, e.querySelector('.fc-event-title').textContent.trim()])
    const tok = await page.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--acc-gold)'; const j = document.createElement('b'); j.style.color = 'var(--line-goal)'; document.querySelector('.fc').append(i, j); const r = [getComputedStyle(i).color, getComputedStyle(j).color]; i.remove(); j.remove(); return r })
    check(`g-${theme} …a 3px gold edge inside its left, the goal paper's edge, a gold ✶ before the title`, g[0].includes(tok[0]) && /inset/.test(g[0]) && /3px 0px 0px/.test(g[0]) && g[1] === tok[1] && g[2] === tok[0] && g[3].startsWith('✶'), JSON.stringify([g, tok]))
    const b = await fcBlock(page, 5).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await sleep(450)
    check(`g-${theme} …kept while it lifts on hover`, /inset/.test(await fcBlock(page, 5).evaluate((e) => getComputedStyle(e).boxShadow)))
    await page.mouse.move(2, 400)
    await sleep(300)
    await fcBlock(page, 5).screenshot({ path: path.join(OUT, `g-goal-${theme}.png`) })
    check(`g-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  const { ctx, page, errors } = await open('/calendar', { view: phone })
  await scrollPhone(page, 12 * 60 + 30)
  const ph = await page.evaluate(() => [...document.querySelectorAll('.pc-block.is-goal')].map((e) => e.dataset.id))
  check('g-phone only today\'s goal block wears the gold edge and ✶', ph.length === 1 && ph[0] === eid(5) && (await pcBlock(page, 5).innerText()).trim().startsWith('✶') && /inset/.test(await pcBlock(page, 5).evaluate((e) => getComputedStyle(e).boxShadow)), JSON.stringify(ph))
  await pcBlock(page, 5).screenshot({ path: path.join(OUT, 'g-goal-phone.png') })
  check('g-phone no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ O · overlap B: the cascade, and every cascaded block still clicks, drags and ticks ═══
const geo = (page, n) => fcBlock(page, n).evaluate((e) => { const h = e.closest('.fc-timegrid-event-harness'); const hr = h.getBoundingClientRect(); const c = e.closest('.fc-timegrid-col-events').getBoundingClientRect(); return { off: (hr.left - c.left) / c.width, w: hr.width / c.width, z: Number(getComputedStyle(h).zIndex) } })
/** A pointer drag of `dy` px from `from`, in 20 steps. */
async function dragBy(page, from, dy) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
}
if (want('o')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    const two = [await geo(page, 10), await geo(page, 11)]
    check(`o-${theme} two at once: the later one steps 22% right over the first, keeps the rest of the width, above it`, Math.abs(two[0].off) < 0.01 && Math.abs(two[0].w - 1) < 0.01 && Math.abs(two[1].off - 0.22) < 0.01 && Math.abs(two[1].w - 0.78) < 0.01 && two[1].z > two[0].z, JSON.stringify(two))
    const three = [await geo(page, 13), await geo(page, 12), await geo(page, 14)]
    check(`o-${theme} three at once: 0 · 22% · 44%, each above the one before`, three.map((g) => Math.round(g.off * 100)).join() === '0,22,44' && three[0].z < three[1].z && three[1].z < three[2].z, JSON.stringify(three))
    const cov = await fcBlock(page, 11).evaluate((e) => [getComputedStyle(e).boxShadow, getComputedStyle(e).backgroundColor, getComputedStyle(e).backgroundImage])
    check(`o-${theme} a cascaded block has a 2px paper edge over the one under it and covers it (its tint on paper)`, /-2px 0px 0px/.test(cov[0]) && cov[1] !== 'rgba(0, 0, 0, 0)', JSON.stringify(cov))
    const time = (await fcBlock(page, 10).innerText()).replace(/\s+/g, ' ')
    check(`o-${theme} an overlapping block reads as any other: its range and length ("9:00–10:00 AM · 1h")`, time.includes('9:00–10:00 AM · 1h'), time)
    if (theme === 'day') {
      // a click on the first block's peek (left of the later one) opens the first
      const sb = await fcBlock(page, 10).boundingBox()
      const rb = await fcBlock(page, 11).boundingBox()
      await page.mouse.click(sb.x + (rb.x - sb.x) / 2, rb.y + 12)
      await sleep(500)
      const opened = await page.locator('.kf-bm-title').first().inputValue().catch(() => '')
      check('o a click on the covered block\'s peek opens that block (Standup), not the one over it', opened === 'Standup', opened)
      await page.keyboard.press('Escape')
      await sleep(300)
      // the lowest of three (a task) ticks from its own check, at its left, in the peek
      await page.mouse.move(2, 400)
      const gym = await fcBlock(page, 13).boundingBox()
      await page.mouse.move(gym.x + 8, gym.y + gym.height * 0.7)
      await sleep(300)
      const ck = await fcBlock(page, 13).locator('.kf-ev-check').boundingBox()
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.fc-event')?.dataset.kfId, [ck.x + ck.width / 2, ck.y + ck.height / 2])
      const w0 = state.writes.length
      await page.mouse.click(ck.x + ck.width / 2, ck.y + ck.height / 2)
      await settle(state)
      const done = posts(state, 'tasks', w0).filter((x) => x.id === id(GYM)).at(-1)
      check('o the bottom block\'s check (Gym, under two others) is on top where it sits and completes it', top === eid(13) && done?.status === 'done', JSON.stringify([top, done && done.status]))
      // a cascaded (middle) block drags by its body
      await sleep(500)
      const lb = await fcBlock(page, 12).boundingBox()
      const w1 = state.writes.length
      // its own part: right of the bottom block's peek, left of the top block (22–44% of the column)
      const at = { x: lb.x + lb.width * 0.12, y: lb.y + lb.height * 0.5 }
      const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.fc-event')?.dataset.kfId, [at.x, at.y])
      await dragBy(page, at, 135)
      await settle(state)
      const mv = posts(state, 'calendar_events', w1).filter((x) => x.id === eid(12)).at(-1)
      check('o the middle block of three (Lunch with Omar) is on top where it shows and drags by its body (about an hour and a half later, on a quarter)', under === eid(12) && mv && [75, 90, 105].includes((Date.parse(mv.starts_at) - Date.parse(iso('11:15', 22))) / 60_000), JSON.stringify([under, mv && mv.starts_at]))
      // the upper of two drags too
      await sleep(500)
      const rb2 = await fcBlock(page, 11).boundingBox()
      const w2 = state.writes.length
      await dragBy(page, { x: rb2.x + rb2.width * 0.6, y: rb2.y + rb2.height * 0.6 }, 90)
      await settle(state)
      const mv2 = posts(state, 'calendar_events', w2).filter((x) => x.id === eid(11)).at(-1)
      check('o the upper of two (Review Kai\'s PR) drags: an hour later', mv2 && Date.parse(mv2.starts_at) - Date.parse(iso('09:30', 22)) === 60 * 60_000, JSON.stringify(mv2 && mv2.starts_at))
      await ctx.close()
      continue
    }
    const col = await page.locator('td.fc-timegrid-col[data-date="2026-10-22"]').boundingBox()
    const top = await page.locator('td.fc-timegrid-slot-lane[data-time="09:00:00"]').boundingBox()
    await page.mouse.move(2, 400)
    await page.screenshot({ path: path.join(OUT, `o-cascade-${theme}.png`), clip: { x: col.x - 4, y: top.y - 4, width: col.width + 8, height: Math.min(380, 800 - top.y) } })
    check(`o-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/calendar', { scale: 1.25 })
    await nDays(page, 3)
    const col = await page.locator('td.fc-timegrid-col[data-date="2026-10-22"]').boundingBox()
    const top = await page.locator('td.fc-timegrid-slot-lane[data-time="09:00:00"]').boundingBox()
    await page.mouse.move(2, 400)
    await page.screenshot({ path: path.join(OUT, 'o-cascade-day.png'), clip: { x: col.x - 4, y: top.y - 4, width: col.width + 8, height: Math.min(380, 800 - top.y) } })
    await ctx.close()
  }
  // the phone: the same cascade, on Thursday
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar?date=2026-10-22', { theme, view: phone })
    await scrollPhone(page, 8 * 60 + 45)
    const pg = (n) => pcBlock(page, n).evaluate((e) => { const r = e.getBoundingClientRect(), c = e.parentElement.getBoundingClientRect(); return { off: r.left - c.left, w: r.width, z: Number(getComputedStyle(e).zIndex) } })
    const two = [await pg(10), await pg(11)]
    const three = [await pg(13), await pg(12), await pg(14)]
    check(`op-${theme} the phone cascades as the desktop: 22% / 44% steps, each above the one before`, Math.abs(two[1].off - two[0].off - 0.22 * two[0].w) < 2 && Math.abs(three[2].off - three[0].off - 0.44 * three[0].w) < 2 && two[1].z > two[0].z && three[1].z > three[0].z && three[2].z > three[1].z, JSON.stringify({ two, three }))
    if (theme === 'day') {
      const ck = await pcBlock(page, 13).locator('.kf-checkbox').boundingBox()
      const w0 = state.writes.length
      await page.touchscreen.tap(ck.x + ck.width / 2, ck.y + ck.height / 2)
      await settle(state)
      check('op the phone\'s bottom block\'s check (Gym) is in reach and completes it', posts(state, 'tasks', w0).filter((x) => x.id === id(GYM)).at(-1)?.status === 'done')
      await sleep(400)
      const lb = await pcBlock(page, 12).boundingBox()
      await page.touchscreen.tap(lb.x + lb.width * 0.12, lb.y + lb.height * 0.5)
      await sleep(700)
      const sheet = await page.locator('[role="dialog"] input[aria-label="Title"]').last().inputValue().catch(() => '')
      check('op a tap on the middle block opens its sheet (Lunch with Omar)', sheet === 'Lunch with Omar', sheet)
      await page.keyboard.press('Escape')
      await sleep(500)
    }
    await shot(page, `op-cascade-phone-${theme}`)
    check(`op-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═══ P · selected B: a wash of the selection ink and a check badge, no outline ═══
if (want('p')) {
  const opt = await optionsPage()
  for (const theme of ['day', 'night']) {
    const drawn = await opt.page.evaluate((theme) => {
      const fr = document.querySelectorAll('[data-grp="selected"][data-look="B"] figure .frame')[theme === 'night' ? 1 : 0]
      const blk = fr.querySelector('.blk.pk'), pkb = blk.querySelector('.pkb')
      const r = blk.getBoundingClientRect(), br = pkb.getBoundingClientRect()
      return { size: [br.width, br.height], fromTop: br.top - r.top, fromRight: r.right - br.right, radius: getComputedStyle(pkb).borderTopLeftRadius, wash: getComputedStyle(blk, '::after').backgroundColor }
    }, theme)
    const { ctx, page, errors } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    await pickTwo(page)
    await page.mouse.move(2, 400)
    await sleep(300)
    const look = (n) => fcBlock(page, n).evaluate((e) => {
      const b = e.querySelector('.kf-ev-pick'), bs = getComputedStyle(b), r = e.getBoundingClientRect(), br = b.getBoundingClientRect()
      return { picked: e.hasAttribute('data-picked'), wash: getComputedStyle(e, '::after').backgroundColor, outline: getComputedStyle(e).outlineStyle, badge: bs.display, size: [br.width, br.height], fromTop: br.top - r.top, fromRight: r.right - br.right, radius: bs.borderTopLeftRadius }
    })
    const a = await look(6), b = await look(7)
    const ok = (x) => x.picked && x.wash === drawn.wash && x.outline === 'none' && x.badge === 'flex' && Math.abs(x.size[0] - drawn.size[0]) <= 0.5 && Math.abs(x.fromRight - drawn.fromRight) <= 1 && x.radius === drawn.radius
    check(`p-${theme} two picked: each under the selection ink's wash with the check badge in its corner, as drawn; no outline`, ok(a) && ok(b), JSON.stringify({ a, b, drawn }))
    check(`p-${theme} …an unpicked block has neither`, (await fcBlock(page, 5).evaluate((e, w) => getComputedStyle(e, '::after').backgroundColor !== w, drawn.wash)) && (await fcBlock(page, 5).locator('.kf-ev-pick').evaluate((e) => getComputedStyle(e).display)) === 'none')
    check(`p-${theme} …FullCalendar's dark focus overlay is gone (the focused pick shows the wash, not 25% black)`, await fcBlock(page, 7).evaluate((e) => getComputedStyle(e, '::after').backgroundColor !== 'rgba(0, 0, 0, 0.25)'))
    const col = await page.locator('td.fc-timegrid-col[data-date="2026-10-21"]').boundingBox()
    const sb = await fcBlock(page, 6).boundingBox()
    await page.screenshot({ path: path.join(OUT, `p-selected-${theme}.png`), clip: { x: col.x - 4, y: sb.y - 60, width: col.width + 8, height: 150 } })
    check(`p-${theme} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  await opt.ctx.close()
}

// ═══ H · motion stays: the hover lift (Effects on), none under reduced motion; the actions show on hover ═══
if (want('h')) {
  const lift = async (page, n) => {
    const b = await fcBlock(page, n).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await sleep(450)
    const s = await fcBlock(page, n).evaluate((el) => { const c = getComputedStyle(el); return { t: c.transform, s: c.boxShadow, acts: getComputedStyle(el.querySelector('.kf-ev-acts')).display } })
    await page.mouse.move(2, 400)
    await sleep(300)
    return s
  }
  const { ctx, page, errors } = await open('/calendar', { scale: 1.25 })
  await nDays(page, 3)
  const s = await lift(page, 22)
  check('h a block under the pointer lifts 1px with a soft shadow and shows ▶ ⋯', s.t === 'matrix(1, 0, 0, 1, 0, -1)' && s.s !== 'none' && s.acts !== 'none', JSON.stringify(s))
  const rest = await fcBlock(page, 22).evaluate((el) => getComputedStyle(el.querySelector('.kf-ev-acts')).display)
  check('h …at rest the actions are hidden', rest === 'none', rest)
  const b = await fcBlock(page, 22).boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(300)
  await fcBlock(page, 22).locator('.kf-ev-act', { hasText: '⋯' }).click()
  await sleep(400)
  const menu = await page.locator('[role="menu"]').last().innerText().catch(() => '')
  check('h ⋯ opens the block\'s menu (Edit Task · Complete · Unschedule · Delete)', /Edit Task[\s\S]*Complete[\s\S]*Unschedule[\s\S]*Delete/.test(menu), menu.replace(/\n/g, ' | '))
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(300)
  await fcBlock(page, 22).locator('.kf-ev-act', { hasText: '▶' }).click()
  await sleep(800)
  check('h ▶ starts a focus on the task (the Focus page)', page.url().endsWith('/focus'), page.url())
  check('h no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  // a week column at 1280 (about 86px): no room beside the title — the pointer gets no actions, a click is the block's
  {
    const w = await open('/calendar', { scale: 1.25 })
    const wb = await fcBlock(w.page, 4).boundingBox()
    await w.page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2)
    await sleep(400)
    const a = await fcBlock(w.page, 4).evaluate((el) => [getComputedStyle(el.querySelector('.kf-ev-acts')).display, Math.round(el.getBoundingClientRect().width)])
    check(`h week column (${a[1]}px): hover shows no actions`, a[0] === 'none', JSON.stringify(a))
    await w.ctx.close()
  }
  const r = await open('/calendar', { reducedMotion: true, scale: 1.25 })
  await nDays(r.page, 3)
  const rm = await lift(r.page, 22)
  check('h reduced motion: no lift (the actions still show)', rm.t === 'none' && rm.acts !== 'none', JSON.stringify(rm))
  await r.ctx.close()
}

// ═══ V · side by side: the drawing next to the app, day and Night Garden ═══
if (want('v')) {
  const opt = await optionsPage()
  const b64 = (f) => fs.readFileSync(path.join(OUT, f)).toString('base64')
  async function pair(name, left, right, capL, capR, bg) {
    const p = await browser.newPage({ viewport: { width: 1500, height: 900 } })
    await p.setContent(`<body style="margin:0;padding:16px;display:flex;gap:20px;align-items:flex-start;font:13px system-ui;background:${bg}"><figure style="margin:0"><figcaption style="margin-bottom:6px">${capL}</figcaption><img src="data:image/png;base64,${b64(left)}"></figure><figure style="margin:0"><figcaption style="margin-bottom:6px">${capR}</figcaption><img src="data:image/png;base64,${b64(right)}"></figure></body>`)
    await sleep(300)
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    await p.close()
  }
  for (const theme of ['day', 'night']) {
    const k = theme === 'night' ? 1 : 0
    await opt.page.locator('[data-grp="blocks"][data-look="N"] figure').nth(k).screenshot({ path: path.join(OUT, `v-drawn-${theme}.png`) })
    for (const [sel, name] of [['[data-grp="overlap"][data-look="B"] figure', 'overlap'], ['[data-grp="goal"][data-look="A"] figure', 'goal'], ['[data-grp="selected"][data-look="B"] figure', 'selected']]) {
      await opt.page.locator(sel).nth(k).screenshot({ path: path.join(OUT, `v-drawn-${name}-${theme}.png`) })
    }
    const { ctx, page } = await open('/calendar', { theme, scale: 1.25 })
    await nDays(page, 3)
    await pickTwo(page)
    const dr = await fcBlock(page, 15).boundingBox()
    await page.mouse.move(dr.x + dr.width * 0.6, dr.y + 20)
    await sleep(400)
    const grid = await page.locator('.fc-timegrid-body').boundingBox()
    const top = await page.locator('td.fc-timegrid-slot-lane[data-time="08:30:00"]').boundingBox()
    await page.screenshot({ path: path.join(OUT, `v-app-${theme}.png`), clip: { x: grid.x, y: top.y - 50, width: grid.width, height: 800 - top.y + 50 } })
    await ctx.close()
    const bg = theme === 'night' ? '#1c1a24; color: #ddd' : '#f3ecdc; color: #333'
    await pair(`side-by-side-blocks-${theme}`, `v-drawn-${theme}.png`, `v-app-${theme}.png`, `Drawn: Calendar blocks options.html, "Now" (${theme})`, `The app: 3 days at 125%, Reply to Omar + Pay the rent picked, the pointer on Design review (${theme})`, bg)
    await pair(`side-by-side-overlap-${theme}`, `v-drawn-overlap-${theme}.png`, `o-cascade-${theme}.png`, 'Drawn: overlap B (cascade)', 'The app: Thu, two then three at once', bg)
    await pair(`side-by-side-goal-${theme}`, `v-drawn-goal-${theme}.png`, `g-goal-${theme}.png`, 'Drawn: goal A (gold edge + ✶)', "The app: today's goal block", bg)
    await pair(`side-by-side-selected-${theme}`, `v-drawn-selected-${theme}.png`, `p-selected-${theme}.png`, 'Drawn: selected B (wash + check badge)', 'The app: two picked', bg)
  }
  await opt.ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
