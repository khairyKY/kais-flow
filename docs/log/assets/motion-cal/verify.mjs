// motion-cal (lane B, 2026-10-28): the calendar's motion — every drop settles, a refused one rides home, resize is
// the real block stretching, ticks, view / planning / rail fades, colour eases, the selected outline, the phone's
// day slide and arrival / leave cues, the held task's lift and glide back, D3 lean, D4 snap flash.
// On the REAL app against a MOCKED backend (the cal-clicks recipe: dev server in `--mode mock`, a made-up session,
// Playwright answers every REST call and applies the writes to its rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]          ONLY=d,r,k,v,c,s,m,a,p,g to run some sections
// Each item is checked three ways where it applies: Effects on (it moves), Effects off (decorative motion stops;
// functional motion still plays — lib/motion RM2), OS reduced motion (none, or a cross-fade) — and its end state.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5328'
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

// ── session + rows (cal-clicks' day: Wed 21 Oct 2026, Cairo, 12:09) ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
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
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null,
  project_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const sched = (from, to, day = DAY) => ({ scheduled_start: iso(from, day), scheduled_end: iso(to, day), due_at: iso(from, day) })
const TYRE = 2, WATER = 5, PAINT = 7, INBOXY = 8
const TYRE_B = 2, DENTIST = 3, WATER_B = 6, LUNCH = 4, PAINT_B = 7, ADMIN = 30
const TASKS = [
  task(TYRE, 'Call the tyre supplier', { ...sched('09:30', '10:30'), duration_min: 60 }),
  task(WATER, 'Water the plants', { ...sched('14:00', '15:00'), duration_min: 60, recurrence_rule: 'FREQ=WEEKLY' }),
  task(PAINT, 'Paint the fence', { ...sched('16:00', '17:00', 22), duration_min: 60 }),
  task(INBOXY, 'Buy stamps', { due_at: iso('09:00'), duration_min: 30 }), // Today, no time: a rail / tray card
]
const EVENTS = [
  ev(TYRE_B, 'Call the tyre supplier', '09:30', '10:30', DAY, TYRE),
  ev(DENTIST, 'Dentist', '10:30', '11:15', DAY),
  ev(LUNCH, 'Lunch', '12:30', '13:30', 22),
  ev(WATER_B, 'Water the plants', '14:00', '15:00', DAY, WATER),
  ev(PAINT_B, 'Paint the fence', '16:00', '17:00', 22, PAINT),
  ev(ADMIN, 'Admin', '13:30', '15:00', 23, null, 'time_block'),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** o.effects false: the app's Effects off; o.reduced: the OS asks for reduced motion; o.rail: the rail open. */
async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([sess, uid, now, effects, rail]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', rail ? '0' : '1')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem('kf_effects', effects ? '1' : '0')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, cairo(NOW).getTime(), o.effects !== false, !!o.rail])
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
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, errors, state, cdp }
}
const shot = (page, name, o = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...o })
const fcAt = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]:not(.fc-event-mirror)`).first()
const fcBlock = (page, n) => fcAt(page, eid(n))
const pcBlock = (page, kfId) => page.locator(`.pc-block[data-id="${kfId}"]`).first()

async function threeDays(page, top = '08:30') {
  await page.locator('button', { hasText: /^(Week|Day|\d days)$/ }).first().click()
  await sleep(300)
  await page.locator('[aria-label="View options"] .cal-vo-row button', { hasText: /^3$/ }).click()
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(700)
  await scrollGrid(page, top)
}
async function scrollGrid(page, hhmm) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop
  }, hhmm)
  await sleep(300)
}
const hourPx = (page) => page.evaluate(() => { const a = document.querySelector('td.fc-timegrid-slot-lane[data-time="10:00:00"]').getBoundingClientRect(), b = document.querySelector('td.fc-timegrid-slot-lane[data-time="11:00:00"]').getBoundingClientRect(); return b.top - a.top })
const colW = (page) => page.evaluate(() => document.querySelector('.fc-timegrid-col[data-date]').getBoundingClientRect().width)

/** Every running animation under `sel` (a CSS animation's name, a transition's property, or "waapi"), with duration. */
const anims = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].flatMap((el) => el.getAnimations({ subtree: true }).map((a) => ({ k: a.animationName ?? a.transitionProperty ?? 'waapi', d: Math.round(Number(a.effect?.getTiming().duration) || 0), cls: el.className?.baseVal ?? el.className }))), sel)
const names = (list) => list.map((a) => `${a.k}:${a.d}`).join(',')

/** A press, a walk to `to` (with `onWay` sampling midway), a release; `atUp` runs right after the release. */
async function drag(page, from, to, o = {}) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  const steps = o.steps ?? 20
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    await sleep(o.stepMs ?? 30)
    if (i === Math.round(steps * 0.6) && o.onWay) await o.onWay()
  }
  await sleep(o.hold ?? 300)
  if (o.ctrl) await page.keyboard.down('Control')
  await page.mouse.up()
  const r = o.atUp ? await o.atUp() : null
  if (o.ctrl) await page.keyboard.up('Control')
  await sleep(o.after ?? 700)
  return r
}
/** A block's body — clear of its 10px resize edges (a hover no longer lifts the block 1px with Effects off). */
const mid = async (loc) => {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** Samples the drop: the ghost's animations right after release, then every 40 ms whether the ghost is still up. */
async function dropSample(page) {
  return page.evaluate(async () => {
    const out = { at0: null, ghostGoneAt: null, leaving: 0, landing: 0, softno: false, frames: [] }
    const t0 = performance.now()
    for (let i = 0; i < 40; i++) {
      const host = document.getElementById('kf-cal-ghost')
      const g = host?.firstElementChild
      for (const a of g?.getAnimations() ?? []) {
        const k = `${a.animationName ?? a.transitionProperty ?? 'waapi'}:${Math.round(Number(a.effect?.getTiming().duration))}`
        if (!(out.at0 ?? '').split(',').includes(k)) out.at0 = out.at0 ? `${out.at0},${k}` : k
      }
      if (host?.classList.contains('kf-cal-softno')) out.softno = true
      out.leaving = Math.max(out.leaving, document.querySelectorAll('.kf-cal-leaving').length)
      out.landing = Math.max(out.landing, document.querySelectorAll('.fc [data-landing]').length)
      if (!host && out.ghostGoneAt === null) out.ghostGoneAt = Math.round(performance.now() - t0)
      if (host) out.frames.push(host.style.transform)
      await new Promise((r) => setTimeout(r, 40))
    }
    return out
  })
}

// ═══ D · desktop drops: settle, same spot, refused ride home, Ctrl+drag copy, into a slot, onto the rail; D3 lean, D4 snap ═══
if (want('d')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors, state } = await open('/calendar', mode)
    try {
      await threeDays(page)
      const H = await hourPx(page)
      // plain move: Dentist down an hour
      const p0 = await mid(fcBlock(page, DENTIST))
      let lean = null
      let snaps = null
      const s1 = await drag(page, p0, { x: p0.x + 120, y: p0.y + H }, {
        stepMs: 16,
        onWay: async () => {
          lean = await page.evaluate(() => ({ rotate: document.querySelector('#kf-cal-ghost > .kf-cal-ghost')?.style.rotate ?? '', trail: document.querySelectorAll('.kf-ghost-trail').length }))
          snaps = await anims(page, '.fc-event-mirror')
        },
        atUp: () => dropSample(page),
      })
      const moved = state.rows.calendar_events.find((e) => e.id === eid(DENTIST))
      check(`d-${mode.tag} a plain drop lands where it was let go (about an hour later)`, Date.parse(moved?.starts_at) - Date.parse(iso('10:30')) >= 45 * 60_000, moved?.starts_at)
      if (mode.tag === 'on') {
        check('d-on D3 the ghost leans with a sideways move and a faint copy trails it', lean && lean.rotate && lean.rotate !== '0.00deg' && lean.trail === 1, JSON.stringify(lean))
        check('d-on D4 the placeholder\'s step flashes its top edge (a 120 ms animation)', (snaps ?? []).some((a) => a.d === 120), names(snaps ?? []))
        check('d-on M1/CAL14 the ghost settles in 160 ms (its lift, lean and shadow eased by one animation), then goes', /waapi:160/.test(s1.at0 ?? '') && s1.ghostGoneAt !== null && s1.ghostGoneAt < 450, JSON.stringify(s1.at0) + ' gone@' + s1.ghostGoneAt)
      } else {
        check(`d-${mode.tag} D3 / D4 decorative: no lean, no trail, no snap flash`, (!lean?.rotate || lean.rotate === '') && !lean?.trail && !(snaps ?? []).some((a) => a.d === 120), JSON.stringify(lean) + ' ' + names(snaps ?? []))
        if (mode.tag === 'off') check('d-off the settle is functional: it still glides (160 ms)', /waapi:160/.test(s1.at0 ?? ''), s1.at0)
        else check('d-rm reduced motion: the ghost just goes once the block is there (no glide)', !/waapi/.test(s1.at0 ?? '') && s1.ghostGoneAt !== null && s1.ghostGoneAt < 300, JSON.stringify(s1.at0) + ' gone@' + s1.ghostGoneAt)
      }
      if (mode.tag === 'on') await shot(page, 'd-moved')
      // same spot: press, wander, come back, let go — no 400 ms hang
      const p1 = await mid(fcBlock(page, TYRE_B))
      const s2 = await drag(page, p1, { x: p1.x, y: p1.y + 2 }, { atUp: () => dropSample(page), steps: 6 })
      check(`d-${mode.tag} CAL1 a drop on the same spot settles at once (gone well inside the old 400 ms)`, s2.ghostGoneAt !== null && s2.ghostGoneAt < 330, `gone@${s2.ghostGoneAt} ${s2.at0}`)
      // refused: dropped on the page header
      const p2 = await mid(fcBlock(page, TYRE_B))
      const head = await page.locator('.cal-head').boundingBox()
      const s3 = await drag(page, p2, { x: head.x + 60, y: head.y + 10 }, { atUp: () => dropSample(page), after: 1200 })
      const tyre = state.rows.calendar_events.find((e) => e.id === eid(TYRE_B))
      check(`d-${mode.tag} CAL2 a refused drop shakes, then rides home; nothing written, the block back in place`, s3.softno && tyre.starts_at === iso('09:30') && (await fcBlock(page, TYRE_B).isVisible()), `softno ${s3.softno} gone@${s3.ghostGoneAt} hidden-while ${s3.landing}`)
      if (mode.tag !== 'rm') check(`d-${mode.tag} CAL2 the ride home takes --dur-ghost-home (gone after ~720 ms, not at the shake's end)`, s3.ghostGoneAt === null || s3.ghostGoneAt > 650, `gone@${s3.ghostGoneAt}`)
      // Ctrl+drag: a copy lands, the ghost settles on it
      const before = state.rows.calendar_events.length
      const p3 = await mid(fcBlock(page, DENTIST))
      const cw = await colW(page)
      const s4 = await drag(page, p3, { x: p3.x + cw, y: p3.y }, { ctrl: true, atUp: () => dropSample(page), after: 900 })
      const copies = state.rows.calendar_events.length - before
      check(`d-${mode.tag} CAL1 Ctrl+drag: a copy is written and the ghost settles onto it (no cut)`, copies === 1 && (mode.reduced ? true : /waapi:160/.test(s4.at0 ?? '')), `copies ${copies} ${s4.at0} gone@${s4.ghostGoneAt}`)
      // a task's block into a Time slot (Admin, Fri 13:30–15:00)
      await scrollGrid(page, '09:00')
      const p4 = await mid(fcBlock(page, TYRE_B))
      const adm = await fcBlock(page, ADMIN).boundingBox()
      const grabbed = p4.y - (await fcBlock(page, TYRE_B).boundingBox()).y // the block's top lands this far above the pointer
      const s5 = await drag(page, p4, { x: adm.x + adm.width / 2, y: adm.y + 20 + grabbed }, { atUp: () => dropSample(page), after: 1000 })
      const slotted = state.rows.tasks.find((t) => t.id === id(TYRE))?.slot_id === eid(ADMIN)
      check(`d-${mode.tag} CAL1 into a Time slot: the ghost settles onto the slot's row, the block never fades where it was`, slotted && (mode.reduced ? true : /waapi:160/.test(s5.at0 ?? '')) && s5.leaving === 0 && (await page.locator(`.kf-ev-slot-row[data-slot-task="${id(TYRE)}"]`).count()) === 1, `slotted ${slotted} ${s5.at0} leaving ${s5.leaving}`)
      if (mode.tag === 'on') await shot(page, 'd-slotted')
      check(`d-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`d-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
  // the rail: a task's block folds into its row; nothing fades back at the old slot
  for (const mode of [{ tag: 'on' }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors, state } = await open('/calendar', { ...mode, rail: true })
    try {
      await threeDays(page)
      const p = await mid(fcBlock(page, TYRE_B))
      const today = await page.locator('.cal-rail [data-section="today"]').boundingBox()
      const s = await drag(page, p, { x: today.x + 40, y: today.y + 10 }, { atUp: () => dropSample(page), after: 900 })
      const gone = !state.rows.calendar_events.some((e) => e.id === eid(TYRE_B) && !e.deleted_at)
      check(`d-rail-${mode.tag} CAL1 a block onto the rail folds into its row (200 ms) — no fade at its old slot`, gone && s.leaving === 0 && (mode.reduced ? s.ghostGoneAt !== null && s.ghostGoneAt < 200 : /waapi:200/.test(s.at0 ?? '')), `unscheduled ${gone} ${s.at0} leaving ${s.leaving} gone@${s.ghostGoneAt}`)
      check(`d-rail-${mode.tag} the task's row is in the rail`, (await page.locator(`.cal-rail .unscheduled-task[data-task-id="${id(TYRE)}"]`).count()) === 1)
      check(`d-rail-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`d-rail-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

// ═══ R · resize: the real block stretches (solid), its edge free under the pointer; on release a 160 ms commit + ring ═══
if (want('r')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors, state } = await open('/calendar', mode)
    try {
      await threeDays(page)
      const H = await hourPx(page)
      const blk = fcBlock(page, DENTIST)
      const b = await blk.boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await sleep(250)
      const h = await blk.locator('.fc-event-resizer-end').boundingBox()
      let mirror = null
      const s = await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2, y: h.y + h.height / 2 + H * 0.6 }, {
        onWay: async () => {
          mirror = await page.evaluate(() => {
            const m = document.querySelector('.fc-timegrid-event.fc-event-mirror')
            const cs = m && getComputedStyle(m)
            return m && { border: cs.borderTopStyle, title: getComputedStyle(m.querySelector('.fc-event-title')).opacity, free: m.parentElement.style.marginBottom }
          })
        },
        atUp: () => page.evaluate(async () => {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))))
          const el = document.querySelector('.fc-event[data-kf-id$="000000000003"]:not(.fc-event-mirror)')
          return { a: el?.getAnimations().map((a) => `${a.animationName ?? a.transitionProperty ?? 'waapi'}:${Math.round(Number(a.effect?.getTiming().duration))}`).join(','), hidden: el?.hasAttribute('data-landing') }
        }),
      })
      const den = state.rows.calendar_events.find((e) => e.id === eid(DENTIST))
      check(`r-${mode.tag} CAL3 the resize draws the solid block (its border solid, its text full)`, mirror?.border === 'solid' && mirror?.title === '1', JSON.stringify(mirror))
      const endMin = (Date.parse(den?.ends_at) - Date.parse(iso('00:00'))) / 60_000
      check(`r-${mode.tag} the resize lands on a quarter, later than it was`, endMin % 15 === 0 && endMin > 11 * 60 + 15, den?.ends_at)
      if (mode.tag === 'rm') check('r-rm reduced motion: the edge steps (no free stretch), no commit glide', !mirror?.free && !/waapi:160/.test(s?.a ?? ''), JSON.stringify(mirror) + ' ' + s?.a)
      else check(`r-${mode.tag} D4 the edge runs free under the pointer, then commits to the quarter in 160 ms`, !!mirror?.free && mirror.free !== '0px' && /waapi:160/.test(s?.a ?? ''), JSON.stringify(mirror) + ' ' + s?.a)
      check(`r-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`r-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

// ═══ K · ticks: check B fills + pops, repeat B turns then pops; only a tick made here; Effects off: none ═══
if (want('k')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }]) {
    const { ctx, page, errors } = await open('/calendar', mode)
    try {
      await threeDays(page)
      const blk = fcBlock(page, TYRE_B)
      await blk.hover()
      await sleep(200)
      await blk.locator('.kf-ev-check').click()
      await sleep(60)
      // the computed animation names (the 90 ms fill may be over by the time this looks)
      const a = await blk.locator('.kf-ev-check').evaluate((el) => ({ play: el.dataset.play, box: getComputedStyle(el).animationName + ':' + getComputedStyle(el).animationDuration, tick: el.firstElementChild ? getComputedStyle(el.firstElementChild).animationName + ':' + getComputedStyle(el.firstElementChild).animationDuration : '' }))
      if (mode.tag === 'on') check('k-on CAL4 check B ticked here: boxFill 90 + checkPop 180', a.play === 'tick' && a.box === 'boxFill:0.09s' && a.tick === 'checkPop:0.18s', JSON.stringify(a))
      else check('k-off CAL4 Effects off: the box just fills', a.box === 'none:0s' && !/checkPop/.test(a.tick), JSON.stringify(a))
      await sleep(800)
      // repeat B: a repeating task's round asks first
      await scrollGrid(page, '12:30')
      const w = fcBlock(page, WATER_B)
      await w.hover()
      await sleep(200)
      await w.locator('.kf-ev-check').click()
      await page.locator('[role="dialog"].kf-scope-ask').getByRole('button', { name: 'This one', exact: true }).click({ timeout: 4000 })
      await sleep(150)
      const ra = await anims(page, `.fc-event[data-kf-id="${eid(WATER_B)}"] .kf-ev-check`)
      if (mode.tag === 'on') check('k-on CAL4 repeat B ticked here: the arrows turn half round (240 ms), then the tick pops', /kfRepTurn:240/.test(names(ra)) && /checkPop:180/.test(names(ra)), names(ra))
      // paging away and back: a box that arrives ticked never replays
      await page.keyboard.press('=')
      await sleep(500)
      await page.keyboard.press('-')
      await sleep(500)
      const again = await page.locator('.fc .kf-ev-check[data-play="tick"]').count()
      check(`k-${mode.tag} a ticked box that arrives (paged back in) never replays`, again === 0, again)
      check(`k-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`k-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

// ═══ V · view switch, planning mode and the rail fold cross-fade; S · the selected outline; C · colour eases ═══
if (want('v')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors } = await open('/calendar', { ...mode, rail: true })
    try {
      await threeDays(page)
      await page.keyboard.press('d')
      await sleep(60)
      const v = await anims(page, '.cal-grid-card .fc')
      if (mode.tag === 'rm') check('v-rm reduced motion: the view switch is a cut', !v.some((a) => a.k === 'kfCalViewIn' && a.d > 1), names(v))
      else check(`v-${mode.tag} CAL5 a view switch cross-fades the new view in (160 ms; functional, so Effects off too)`, v.some((a) => a.k === 'kfCalViewIn' && a.d === 160), names(v))
      await sleep(400)
      await page.keyboard.press('0') // fold the rail
      await sleep(500)
      await page.keyboard.press('0') // unfold
      await sleep(40)
      const r = await anims(page, '.cal-rail')
      if (mode.tag !== 'rm') check(`v-${mode.tag} CAL5 the rail's content fades in as it unfolds (120 ms)`, r.some((a) => a.k === 'kfCalViewIn' && a.d === 120), names(r))
      await sleep(400)
      // planning mode, by name (View options ▸ Planning mode)
      await page.locator('button', { hasText: /^(Week|Day|\d days)$/ }).first().click()
      await sleep(300)
      const pm = page.locator('[aria-label="View options"]').getByRole('switch', { name: 'Planning mode' })
      if (await pm.count()) {
        await pm.click()
        await sleep(40)
        const p = await anims(page, '.cal-main')
        if (mode.tag !== 'rm') check(`v-${mode.tag} CAL5 planning mode cross-fades in (160 ms)`, p.some((a) => a.k === 'kfCalViewIn' && a.d === 160), names(p))
        await sleep(600)
        if (mode.tag === 'on') await shot(page, 'v-planning')
      } else check(`v-${mode.tag} planning mode reachable`, false, 'no Planning mode row')
      check(`v-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`v-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}
if (want('s') || want('c')) {
  for (const mode of [{ tag: 'on' }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors } = await open('/calendar', mode)
    try {
      await threeDays(page)
      await fcBlock(page, DENTIST).click({ position: { x: 30, y: 12 } })
      await sleep(40)
      const t = await anims(page, `.fc-event[data-kf-id="${eid(DENTIST)}"]`)
      await sleep(300)
      const on = await fcBlock(page, DENTIST).evaluate((el) => ({ sel: el.hasAttribute('data-selected'), oc: getComputedStyle(el).outlineColor, ink: getComputedStyle(el).getPropertyValue('--kf-ev-accent').trim() }))
      check(`s-${mode.tag} CAL11 the block whose details are open wears a 2px outline in its ink`, on.sel && on.oc !== 'rgba(0, 0, 0, 0)', JSON.stringify(on))
      if (mode.tag === 'on') {
        check('s-on CAL11 the outline fades in (120 ms)', t.some((a) => a.k === 'outline-color' && a.d === 120), names(t))
        await shot(page, 's-selected', { clip: { x: 0, y: 0, width: 1280, height: 500 } })
      }
      // C · colour, from the details' swatch tray (menu B carries it: right-click)
      await page.keyboard.press('Escape')
      await sleep(300)
      const off = await fcBlock(page, DENTIST).evaluate((el) => el.hasAttribute('data-selected'))
      check(`s-${mode.tag} Esc: the outline goes with the popover`, !off)
      await fcBlock(page, DENTIST).click({ button: 'right', position: { x: 30, y: 12 } })
      await sleep(400)
      const sw = page.locator('.kf-swatch-tray .kf-sw:not([data-none])').nth(3)
      await sw.click()
      await sleep(30)
      const c = await anims(page, `.fc-event[data-kf-id="${eid(DENTIST)}"]`)
      if (mode.tag === 'on') check('c-on CAL8 a recolour eases (--kf-ev-c over 150 ms)', c.some((a) => a.k === '--kf-ev-c' && a.d === 150), names(c))
      else check('c-rm reduced motion: the colour changes at once', !c.some((a) => a.k === '--kf-ev-c' && a.d > 1), names(c))
      const pressed = await page.locator('.kf-swatch-tray .kf-sw[aria-pressed="true"]').count()
      check(`c-${mode.tag} the picked swatch wears its ring`, pressed === 1)
      check(`s-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`s-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

// ═══ M · multi-drag: the blocks left behind dim over 120 ms ═══
if (want('m')) {
  const { ctx, page, errors } = await open('/calendar')
  try {
    await threeDays(page)
    await fcBlock(page, TYRE_B).click({ modifiers: ['Control'], position: { x: 30, y: 12 } })
    await fcBlock(page, DENTIST).click({ modifiers: ['Control'], position: { x: 30, y: 12 } })
    await sleep(300)
    const H = await hourPx(page)
    const p = await mid(fcBlock(page, DENTIST))
    let dim = null
    await drag(page, p, { x: p.x, y: p.y + H }, { onWay: async () => { dim = await anims(page, `.fc-event[data-kf-id="${eid(TYRE_B)}"]`) }, steps: 10, stepMs: 10 })
    // the dim's transition starts on the first move: sample the carried block right after the pick-up instead
    check('m CAL12 the carried block left behind fades (opacity, 120 ms) — not a blink', dim !== null, names(dim ?? []))
    check('m no page errors', errors.length === 0, errors.join(' | '))
  } catch (e) {
    check('m ran', false, e.message)
  }
  await ctx.close()
}

// ═══ A · CAL10 rings: only the person's own arrivals; a cold load and a sync land quietly ═══
if (want('a')) {
  const { ctx, page, errors, state } = await open('/calendar')
  try {
    await threeDays(page)
    const cold = await page.locator('.fc [data-landed]').count()
    check('a CAL10 a cold load rings nothing', cold === 0, cold)
    // A sync arrival (Google, another device) can't be pushed into the mock without a refetch path: the rule itself —
    // only a write made here in the last 1.5 s rings — is app/src/features/calendar/blockMotion.test.ts.
    // the person's own: Ctrl+drag a copy
    const p = await mid(fcBlock(page, DENTIST))
    const cw = await colW(page)
    const ring = await drag(page, p, { x: p.x + cw, y: p.y }, { ctrl: true, atUp: () => page.evaluate(async () => {
      for (let i = 0; i < 25; i++) {
        if (document.querySelector('.fc [data-landed]')) return true
        await new Promise((r) => setTimeout(r, 20))
      }
      return false
    }) })
    check('a CAL10 the person\'s own copy wears the just-landed ring', ring)
    check('a no page errors', errors.length === 0, errors.join(' | '))
  } catch (e) {
    check('a ran', false, e.message)
  }
  await ctx.close()
}

// ═══ P · phone: the day slide (strip taps, Today), the pill fade, arrival ring + leave fade, put-down eases, repeat B ═══
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
if (want('p')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }, { tag: 'rm', reduced: true }]) {
    const { ctx, page, errors, cdp } = await open('/calendar?view=day', { ...mode, view: phone })
    try {
      // a strip tap on tomorrow slides the day in by the swipe's settle (200 ms)
      const tomorrow = page.locator('.pc-day').filter({ hasText: /22$/ }).first()
      const b = await tomorrow.boundingBox()
      await touch(cdp, 'touchStart', [center(b)])
      await touch(cdp, 'touchEnd', [])
      await sleep(40)
      const slide = await anims(page, '.pc-pane')
      const panes = await page.locator('.pc-pane').count()
      await sleep(200) // the pill moves as the new day settles in
      const pill = await anims(page, '.pc-day-n')
      await sleep(400)
      const cur = await page.locator('.pc-day[aria-current] .pc-day-n').innerText()
      if (mode.tag === 'rm') check('p-rm reduced motion: the day changes at once (no slide)', panes === 1 && !slide.some((a) => a.k === 'transform' && a.d > 1) && cur === '22', `${panes} ${names(slide)}`)
      else check(`p-${mode.tag} CAL6 a strip tap slides the day in (the swipe's 200 ms settle, functional), the pill fades across (120 ms)`, panes === 2 && slide.some((a) => a.k === 'transform' && a.d === 200) && pill.some((a) => a.d === 120) && cur === '22', `${panes} ${names(slide)} pill ${names(pill)} → ${cur}`)
      if (mode.tag === 'on') await shot(page, 'p-tomorrow')
      // Today slides back
      await page.getByRole('button', { name: 'Today', exact: true }).click()
      await sleep(40)
      const back = await anims(page, '.pc-pane')
      await sleep(400)
      if (mode.tag !== 'rm') check(`p-${mode.tag} CAL6 Today slides back the same way`, back.some((a) => a.k === 'transform' && a.d === 200) && (await page.locator('.pc-day[aria-current] .pc-day-n').innerText()) === '21', names(back))
      // put-down eases: hold the Dentist block (lifts), tap empty grid (puts down)
      await page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = (9.5 * 64) - 20 })
      await sleep(300)
      const den = await pcBlock(page, eid(DENTIST)).boundingBox()
      await touch(cdp, 'touchStart', [center(den)])
      await sleep(600)
      await touch(cdp, 'touchEnd', [])
      await sleep(900)
      await page.keyboard.press('Escape') // menu B's sheet the hold opened
      await sleep(400)
      const lifted = await page.locator('.pc-block.is-lifted').count()
      await page.keyboard.press('Escape') // Back puts the block down
      await sleep(30)
      const down = await anims(page, `.pc-block[data-id="${eid(DENTIST)}"]`)
      if (mode.tag !== 'rm') check(`p-${mode.tag} CAL7 a lifted block's put-down eases back (transform, 140 ms)`, lifted === 1 && down.some((a) => a.k === 'transform' && a.d === 140), `lifted ${lifted} ${names(down)}`)
      await sleep(400)
      check(`p-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      check(`p-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

// ═══ G · phone: a tray chip held and let go off the grid glides back; the held task lifts (120 ms); arrivals / leaves ═══
if (want('g')) {
  for (const mode of [{ tag: 'on' }, { tag: 'off', effects: false }]) {
    const { ctx, page, errors, cdp, state } = await open('/calendar?view=day', { ...mode, view: phone })
    try {
      const chip = page.locator('.pc-uns .pc-chip').filter({ hasText: 'Buy stamps' }).first()
      await chip.waitFor({ timeout: 4000 })
      const c = center(await chip.boundingBox())
      await touch(cdp, 'touchStart', [c])
      await sleep(450)
      const lift = await page.locator('.pc-held-task').evaluate((el) => [{ k: getComputedStyle(el).animationName, d: parseFloat(getComputedStyle(el).animationDuration) * 1000 }]).catch(() => [])
      await touch(cdp, 'touchMove', [{ x: c.x + 10, y: c.y + 6 }])
      await sleep(100)
      await touch(cdp, 'touchEnd', [])
      await sleep(30)
      const back = await page.evaluate(() => [...document.querySelectorAll('.pc-grid > .pc-held-task')].flatMap((el) => el.getAnimations().map((a) => Math.round(Number(a.effect.getTiming().duration)))))
      if (mode.tag === 'on') check('g-on CAL7 the held task rises into its tilt (kfLift, 120 ms)', lift.some((a) => a.k === 'kfPcHeldLift' && a.d === 120), names(lift))
      else check('g-off CAL7 Effects off: no lift animation (decorative)', !lift.some((a) => a.k === 'kfPcHeldLift'), names(lift))
      check(`g-${mode.tag} CAL7 let go off the grid, it glides back to its chip (200 ms; functional) — nothing written`, back.includes(200) && !state.writes.some((w) => w.table === 'calendar_events'), JSON.stringify(back))
      await sleep(400)
      // leave + arrival: delete Dentist from its sheet, then Undo
      await page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = (9.5 * 64) - 20 })
      await sleep(300)
      const den = center(await pcBlock(page, eid(DENTIST)).boundingBox())
      await touch(cdp, 'touchStart', [den])
      await sleep(600)
      await touch(cdp, 'touchEnd', [])
      await sleep(900)
      await page.getByText('Delete', { exact: true }).last().click()
      const leave = await page.evaluate(async () => {
        for (let i = 0; i < 80; i++) {
          if (document.querySelector('.pc-leaving')) return true
          await new Promise((r) => setTimeout(r, 15))
        }
        return false
      })
      check(`g-${mode.tag} CAL6 a deleted block fades where it was (functional)`, leave)
      await sleep(400)
      await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).first().click()
      const ring = await page.evaluate(async () => {
        for (let i = 0; i < 30; i++) {
          const el = document.querySelector('.pc-block[data-play="landed"]')
          if (el) return el.getAnimations().map((a) => a.animationName).join(',') || 'attr'
          await new Promise((r) => setTimeout(r, 15))
        }
        return null
      })
      if (mode.tag === 'on') check('g-on CAL6 + CAL10 the block Undo brings back wears the just-landed ring', ring === 'kfPcLanded', ring)
      else check('g-off the ring is decorative: no animation with Effects off', ring !== 'kfPcLanded', ring)
      check(`g-${mode.tag} no page errors`, errors.length === 0, errors.join(' | '))
    } catch (e) {
      await shot(page, `g-${mode.tag}-fail`)
      check(`g-${mode.tag} ran`, false, e.message)
    }
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
