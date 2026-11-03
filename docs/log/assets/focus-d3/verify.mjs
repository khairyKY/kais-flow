// focus-d3 (2026-10-31): Kai's pick from design-export/Focus redesign.html — D3, the timer in the middle, flower
// option (i) beside it, Break option 1 — on the REAL app against a MOCKED backend (the motion-pages recipe: dev
// server --mode mock, a made-up session, Playwright answers every REST call and applies writes to the rows).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5345] [playwright-core path]     (ONLY=s,c,t,p,k,e to pick)
// playwright-core: the old omniroute copy is gone from this machine — pass an install's index.mjs (ios-pwa did
// the same); Chrome itself is the system one.
// The day: Saturday 31 Oct 2026 in Cairo (UTC+2: Egypt's summer time ended on the 29th), the clock at 2:16 PM as drawn.
//   s · every state, desktop 1440 and phone 390, against the spec's own frames (spec-*.png beside app-*.png)
//   c · the segments wear the block's colour; a block with no colour is Iris; a Fern block is Fern
//   t · the timeline: blooms above the kept focus segments on the top timeline, none in the hour column
//   p · the pill follows to other pages (segments, no flowers), tap → back to Focus
//   k · the tray flyout (Windows / Mac): the timeline only, no flowers; the tray icon state carries the colour
//   e · the calendar has no split; starting from the Now card, a task and a block's menu lands on the block in rounds
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5345'
const PW = process.argv[4] ?? 'D:/temp/claude/D--Coding-kais-flow/364f4c21-606b-40e0-a1f2-b46300b06cdf/scratchpad/pw/node_modules/playwright-core/index.mjs'
// The spec page lives untracked in the main checkout's design-export/ (SPEC= to point elsewhere).
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const SPEC_FILE = process.env.SPEC ?? [path.resolve(HERE, '../../../../design-export/Focus redesign.html'), 'D:/Coding/kais-flow/design-export/Focus redesign.html'].find((f) => fs.existsSync(f))
const SPEC = SPEC_FILE && pathToFileURL(SPEC_FILE).href
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
const UID = '00000000-0000-4000-8000-00000000fd30'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Cairo is UTC+2 on 31 Oct 2026 (summer time ended the night of 29/30 Oct).
const cairo = (hhmm, day = 31) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 2, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null, slot_date: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const OUTLINE = 1, OMAR = 2, DENTIST = 3, READ = 4, ESSAY = 5
const TASKS = [
  task(OUTLINE, 'Write the chapter 3 outline', { top3: true, top3_rank: 1, scheduled_start: iso('14:00'), scheduled_end: iso('16:00'), duration_min: 120 }),
  task(OMAR, 'Reply to Omar about the venue', { top3: true, top3_rank: 2, duration_min: 15, due_at: iso('18:00') }),
  task(DENTIST, 'Book the dentist', { top3: true, top3_rank: 3, duration_min: 5, due_at: iso('18:00') }),
  task(READ, 'Read 20 pages', { duration_min: 30, due_at: iso('20:00') }),
  task(ESSAY, 'Edit the essay', { duration_min: 60 }),
]
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'manual', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: null, project_id: null, series_id: null,
  external_ref: null, remind_min: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const IRIS = '#B59CE3', FERN = '#72BF8E', OCHRE = '#C9A658', CLAY = '#E29572'
const DEEP = 1, LUNCH = 2, GYM = 3, WRITING = 4
const EVENTS = [
  ev(LUNCH, 'Lunch with Mona', '13:00', '13:30', { color: OCHRE }),
  ev(DEEP, 'Deep work', '14:00', '16:00', { task_id: id(OUTLINE), type: 'task', color: IRIS }),
  ev(GYM, 'Gym', '17:00', '18:00', { color: CLAY }),
  ev(WRITING, 'Writing', '18:30', '20:30', { type: 'time_block', color: FERN }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], people: [], app_settings: [SETTINGS], routines: [], routine_completions: [] })

// The session each state is seeded with (focusStore's kf_focus_session): Deep work 2:00–4:00, 4 buds, as drawn.
const BLOCK = { title: 'Deep work', start: iso('14:00'), end: iso('16:00'), srcStart: iso('14:00'), srcEnd: iso('16:00'), color: 'var(--blk-iris)', ink: 'var(--blk-iris-ink)', rounds: 4, fill: true, fromCalendar: true, eventId: eid(DEEP) }
const NOW = cairo('14:16')
const sess = (over) => JSON.stringify({ mode: 'pomodoro', isRunning: false, secondsLeft: 1500, stopwatchSeconds: 0, stopwatchStartIso: '', stopwatchStartStr: '', currentRound: 1, breakType: 'short', activeTask: { id: id(OUTLINE), project_id: null }, pomodoroStartIso: null, block: BLOCK, kept: 0, savedAt: NOW.getTime(), ...over })
const STATES = {
  idle: sess({}),
  running: sess({ isRunning: true, secondsLeft: 1090, kept: 2, currentRound: 3, pomodoroStartIso: iso('14:09') }),
  paused: sess({ secondsLeft: 980, kept: 2, currentRound: 3, pomodoroStartIso: iso('14:09') }),
  end: sess({ mode: 'break', secondsLeft: 300, kept: 3, currentRound: 3 }),
  break: sess({ mode: 'break', isRunning: true, secondsLeft: 252, kept: 3, currentRound: 3 }),
  done: sess({ kept: 4, currentRound: 1 }),
}
// Breaks don't start by themselves in the round-end seed (else it would run on): the focus settings, synced pref.
const FOCUS_SETTINGS = JSON.stringify({ focusRoundMin: 25, shortBreakMin: 5, longBreakMin: 20, roundsBeforeLongBreak: 4, autoStartNextRound: true, autoStartBreaks: false, gentleChime: false, gardenViewOnLongBreaks: true, fitBlock: true, pill: true })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESK = { viewport: { width: 1440, height: 900 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESK), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: 'reduce' })
  await ctx.addInitScript(([sessJson, uid, at, seeds, tauri]) => {
    // The Windows / Mac app played by a stub recording each tray.rs command (the tray-notify recipe).
    if (tauri) {
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => { window.__tauriCalls.push({ cmd, args: args ?? null }); return cmd === 'autostart_get' ? false : null } }
    }
    if (sessionStorage.getItem('kf-seeded')) return
    sessionStorage.setItem('kf-seeded', '1')
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sessJson)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
    for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v)
  }, [JSON.stringify(session), UID, NOW.getTime(), { kf_focus_settings: FOCUS_SETTINGS, ...(o.seeds ?? {}) }, !!o.tauri])
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
      if (body && typeof body === 'object') for (const row of Array.isArray(body) ? body : [body]) {
        const i = rows.findIndex((x) => x.id === row.id)
        if (i === -1) rows.push(row)
        else rows[i] = { ...rows[i], ...row }
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
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(o.wait ?? 1800)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const go = (page, url) => page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')) }, url)
const count = (page, sel) => page.locator(sel).count()
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '')
/** A token's computed colour (rgb), read off a probe in the page. */
const tokenRgb = (page, v) => page.evaluate((val) => { const p = document.createElement('span'); p.style.background = val; document.body.append(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c }, v)
const bg = (loc) => loc.first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null)
const bgImage = (loc) => loc.first().evaluate((el) => getComputedStyle(el).backgroundImage).catch(() => null)
const box = (loc) => loc.first().boundingBox().catch(() => null)

// ── the spec's own frames (D3 · flower (i), Phone · 390, Done, Settings, away) ──
async function specFrames() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(SPEC, { waitUntil: 'load' })
  await sleep(800)
  const figs = page.locator('section[data-dir="D3"] figure')
  const n = await figs.count()
  const out = []
  for (let i = 0; i < n; i++) {
    const cap = (await figs.nth(i).locator('figcaption').innerText()).trim()
    out.push(cap)
  }
  const want = [['D3 (i)', 'desk'], ['Phone', 'phone']]
  const names = { 'Idle': 'idle', 'Running': 'running', 'Paused': 'paused', 'Round end': 'end', 'Break': 'break', 'Done for the day': 'done', 'Settings': 'settings' }
  for (let i = 0; i < n; i++) {
    const cap = out[i]
    const f = figs.nth(i).locator('.frame')
    const dev = (await f.getAttribute('class')).includes('phone') ? 'phone' : 'desk'
    let name = null
    const head = cap.split('·')[0].trim()
    if (dev === 'desk' && /· D3 \(i\)$/.test(cap)) name = `spec-desk-${names[head]}`
    else if (dev === 'phone' && names[head] && !/lock/i.test(cap)) name = `spec-phone-${names[head]}`
    else if (/^Done for the day$/.test(head) && dev === 'desk') name = 'spec-desk-done'
    else if (/^Settings$/.test(head) && dev === 'desk') name = 'spec-desk-settings'
    else if (/Windows tray/.test(cap)) name = 'spec-tray'
    else if (/Focus pill/.test(cap)) name = 'spec-pill'
    else if (/Calendar/.test(cap)) name = 'spec-calendar'
    else if (/lock screen/.test(cap)) name = 'spec-lock'
    if (!name || name.includes('undefined')) continue
    // the drawn screen at its own size (the frame scales to its column; un-scale it)
    await f.evaluate((el) => { const w = +el.style.getPropertyValue('--w'); el.style.width = `${w}px`; el.style.flex = 'none'; el.style.setProperty('--s', '1') })
    await sleep(60)
    await f.screenshot({ path: path.join(OUT, `${name}.png`) })
  }
  await ctx.close()
  void want
}

if (want('s')) {
  await specFrames().catch((e) => check('spec frames rendered', false, e.message))
  // desk = 1440 at 100% (the spec's own size); desk125 = 1440 at the desktop's default interface size (125%).
  for (const [dev, view, scale] of [['desk', DESK, '1'], ['desk125', DESK, null], ['phone', PHONE, null]]) {
    for (const [st, seed] of Object.entries(STATES)) {
      if (dev === 'desk125' && !['idle', 'running', 'break', 'done'].includes(st)) continue
      const { ctx, page, errors } = await open('/focus', { view, seeds: { kf_focus_session: seed, ...(scale ? { kf_ui_scale: scale } : {}) } })
      await shot(page, `app-${dev}-${st}`)
      const segs = await count(page, '.fd-tl .ftl-seg')
      check(`s [${dev} ${st}] the top timeline: 4 focus + 3 breaks + the 5 minutes left`, segs === 8, `${segs} segments`)
      const ring = await count(page, '.fd-plant svg')
      if (dev !== 'phone') check(`s [${dev} ${st}] no ring on the desktop`, (await count(page, '.fd-centre svg circle, .fp-ring')) === 0, `${await count(page, '.fd-centre svg circle')} circles`)
      else if (st !== 'done') check(`s [phone ${st}] the flower sits in the ring`, ring === 1 && (await count(page, '.fd-plant .fd-flower img')) >= 1, `ring ${ring}`)
      const body = await page.locator('.fd, .fd-phone').first().innerText().catch(() => '')
      const expect = {
        idle: [/From your calendar/, /Write the chapter 3 outline/, /Fill the block · 4 buds/, /4 rounds of 25 · 3 breaks · ends 3:55 PM/, /Start the first bud/],
        running: [/1[78]:\d\d/, /Bud 3 of 4 · break at 2:3\d PM/, /Pause/, /Done/, /\+5 min/],
        paused: [/16:20/, /Paused · the bud waits/, /Resume/],
        end: [/Bud 3 bloomed ✿/, /Break · 5 min/, /Skip to bud 4/],
        break: [/Break · 4:\d\d/, /The bud rests/, /Skip break/, /Back to work/],
        done: [/Four blooms on the block ✿/, /Next: Reply to Omar about the venue/, /Close the block/, /1h 40m/],
      }[st]
      if (dev !== 'phone' && st !== 'done') expect.push(/Up next/, /Next block · Gym · 5:00 PM/)
      if (dev !== 'phone' && st === 'end') expect.push(/kept 1h 15m of 2h/)
      if (dev !== 'phone' && st === 'running') expect.push(/kept \d\dm of 2h/)
      const miss = expect.filter((re) => !re.test(body))
      check(`s [${dev} ${st}] the words as drawn`, miss.length === 0, miss.map(String).join(' · ') || 'all there')
      if (st === 'break') {
        const pulse = page.locator('.fd-tl .ftl-seg.is-pulse')
        check(`s [${dev} break] option 1: the break segment pulses with "Break · 4:12" above it`, (await pulse.count()) === 1 && /Break · 4:\d\d/.test(await text(page, '.fd-tl .ftl-break')), await text(page, '.fd-tl .ftl-break'))
        check(`s [${dev} break] option 1: the flower closes to a bud and a sage glow breathes`, (await count(page, '.fd-flower.is-break img[src*="cherry/bud"]')) >= 1 && (await count(page, '.fd-breath')) === 1)
      }
      if (st === 'running' && dev !== 'phone') {
        const t = await box(page.locator('.fd-big'))
        const fl = await box(page.locator('.fd-row .fd-flower'))
        const c = await box(page.locator('.fd-centre'))
        const mid = c && t ? Math.abs((t.x + t.width / 2) - (c.x + c.width / 2)) : -1
        check(`s [${dev} running] D3: the timer sits in the middle, the small flower beside it`, t && fl && fl.x > t.x + t.width - 2 && mid < 90 && t.x >= c.x, `timer centre off by ${mid.toFixed?.(0)}px, flower at ${fl?.x}, timer ${t?.x} in ${c?.x}`)
        const h = await box(page.locator('.fd-hours'))
        const n = await box(page.locator('.fd-next'))
        const z = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom) || 1)
        const wide = dev === 'desk' ? [230, 320] : [190, 250]
        check(`s [${dev} running] D2-b base: the hour column on the left, Up next on the right`, h && n && h.x < (t?.x ?? 0) && n.x > (t?.x ?? 0) && Math.round(h.width / z) === wide[0] && Math.round(n.width / z) === wide[1], `zoom ${z}: hours ${h?.width}, up next ${n?.width}`)
        check(`s [${dev} running] the flower grows with the round (opening, mid-round)`, (await count(page, '.fd-row .fd-flower img[src*="cherry/opening"]')) === 1)
        const over = await page.evaluate(() => [...document.querySelectorAll('.fd-centre *')].filter((el) => { const r = el.getBoundingClientRect(), c = document.querySelector('.fd-centre').getBoundingClientRect(); return r.width && (r.left < c.left - 1 || r.right > c.right + 1) }).length)
        check(`s [${dev} running] nothing in the centre runs past its column`, over === 0, `${over} elements`)
      }
      if (st === 'paused') check(`s [${dev} paused] the timer waits at 55%`, (await page.locator('.fd-big.is-paused').first().evaluate((el) => +getComputedStyle(el).opacity)) < 0.8)
      if (st === 'end' && dev !== 'phone') check('s [desk end] the round ends in a bloom, the kept segment glowing', (await count(page, '.fd-row .fd-flower img[src*="cherry/bloom"]')) === 1 && (await count(page, '.fd-tl .ftl-glow')) === 1)
      if (st === 'done' && dev === 'phone') {
        const d = await box(page.locator('.fd-done'))
        const t = await box(page.locator('.fd-done-t'))
        check('s [phone done] Done for the day has its 24px margins', t && Math.round(t.x) >= 24 && Math.round(t.x + t.width) <= 390 - 24, `title ${t?.x}–${t ? t.x + t.width : '?'} in ${d?.width}`)
      }
      const scrollX = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
      check(`s [${dev} ${st}] no sideways scroll`, scrollX <= 0, `${scrollX}px`)
      check(`s [${dev} ${st}] no page errors`, errors.length === 0, errors.join(' | '))
      if (st === 'running') {
        await page.getByRole('button', { name: 'Focus settings' }).first().click()
        await sleep(500)
        await shot(page, `app-${dev}-settings`)
        const sb = await page.locator('.fd-settings').first().innerText().catch(() => '')
        const want = [/Focus round/, /Short break/, /Long break/, /Rounds before a long break/, /Your rhythm/, /Fit rounds to the block/, /Focus pill on other pages/, /Start the next round by itself/, /Start breaks by itself/, /Garden view on long breaks/, /Sounds/]
        const miss = want.filter((re) => !re.test(sb))
        check(`s [${dev} settings] the settings sheet as in D (+ Fit rounds, the pill)`, miss.length === 0, miss.map(String).join(' · ') || 'all rows')
      }
      await ctx.close()
    }
  }
}

if (want('c') || want('t')) {
  const { ctx, page } = await open('/focus', { seeds: { kf_focus_session: STATES.running } })
  const iris = await tokenRgb(page, 'var(--blk-iris)')
  const kept = page.locator('.fd-tl .ftl-seg[data-k="f"][data-state="done"]')
  check('c the kept focus segments wear the block\'s colour (Iris here)', (await kept.count()) === 2 && (await bg(kept)) === iris, `${await bg(kept)} vs ${iris}`)
  const now = page.locator('.fd-tl .ftl-seg.is-now')
  check('c the segment under way fills with the block\'s colour', /linear-gradient/.test((await bgImage(now)) ?? '') && ((await bgImage(now)) ?? '').includes(iris.replace(')', '')), (await bgImage(now))?.slice(0, 90))
  const brk = page.locator('.fd-tl .ftl-seg[data-k="b"][data-state="done"]')
  const sage = await tokenRgb(page, 'color-mix(in srgb, var(--acc-sage) 75%, transparent)')
  check('c breaks are always sage', (await bg(brk)) === sage, `${await bg(brk)}`)
  const blooms = await count(page, '.fd-tl .ftl-flower.is-bloom')
  check('t blooms sit above the kept focus segments on the top timeline', blooms === 2 && (await count(page, '.fd-tl .ftl-flower.is-opening')) === 1, `${blooms} blooms`)
  const colSegs = await count(page, '.fd-hours .ftl-seg')
  const colImgs = await count(page, '.fd-hours img')
  check('t the hour column shows the block\'s segments in its colour, no flowers', colSegs === 8 && colImgs === 0 && (await bg(page.locator('.fd-hours .ftl-seg[data-state="done"]'))) === iris, `${colSegs} segments, ${colImgs} images`)
  check('t the hour column keeps the day around it (Lunch, Gym) and the now line', /Lunch with Mona/.test(await text(page, '.fd-hours')) && /Gym/.test(await text(page, '.fd-hours')) && (await count(page, '.fd-nowline')) === 1)
  await ctx.close()
  // A Fern block (a Time block's "Focus on this"), and a task with no block (Iris by default).
  const fern = await open('/focus', { seeds: { kf_focus_session: sess({ isRunning: true, secondsLeft: 1200, pomodoroStartIso: iso('18:30'), block: { ...BLOCK, title: 'Writing', color: 'var(--blk-fern)', ink: 'var(--blk-fern-ink)', eventId: eid(WRITING) } }) } })
  const fernRgb = await tokenRgb(fern.page, 'var(--blk-fern)')
  check('c a Fern block\'s segments are Fern', /linear-gradient/.test((await bgImage(fern.page.locator('.fd-tl .ftl-seg.is-now'))) ?? '') && ((await bgImage(fern.page.locator('.fd-tl .ftl-seg.is-now'))) ?? '').includes(fernRgb.replace(')', '')), fernRgb)
  await fern.ctx.close()
}

if (want('p')) {
  for (const [dev, view] of [['desk', DESK], ['phone', PHONE]]) {
    const { ctx, page, errors } = await open('/focus', { view, seeds: { kf_focus_session: STATES.running } })
    check(`p [${dev}] no pill on the Focus page itself`, (await count(page, '.fpill')) === 0)
    await go(page, '/tasks')
    await sleep(900)
    await shot(page, `app-${dev}-pill`)
    const pill = page.locator('.fpill')
    check(`p [${dev}] the pill follows to Tasks with the timer and the task`, (await pill.count()) === 1 && /1\d:\d\d/.test(await text(page, '.fpill')) && /Write the chapter 3 outline/.test(await text(page, '.fpill')), await text(page, '.fpill'))
    check(`p [${dev}] the pill: the segmented timeline only, no flowers`, (await count(page, '.fpill .ftl-seg')) === 8 && (await count(page, '.fpill img')) === 0)
    await go(page, '/today')
    await sleep(700)
    check(`p [${dev}] …and to Today`, (await count(page, '.fpill')) === 1)
    await page.locator('.fpill-open').first().click()
    await sleep(900)
    check(`p [${dev}] tap → back to Focus`, new URL(page.url()).pathname === '/focus' && (await count(page, '.fpill')) === 0, page.url())
    check(`p [${dev}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  const idle = await open('/tasks', { seeds: { kf_focus_session: STATES.idle } })
  check('p no pill with nothing under way', (await count(idle.page, '.fpill')) === 0)
  await idle.ctx.close()
}

if (want('k')) {
  const { ctx, page, errors } = await open('/focus', { seeds: { kf_focus_session: STATES.running }, tauri: true })
  const tray = await ctx.newPage()
  await tray.goto(`${BASE}/tray.html`, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(2500)
  await tray.setViewportSize({ width: 340, height: 480 })
  await tray.screenshot({ path: path.join(OUT, 'app-tray.png') })
  const segs = await count(tray, '.kf-tray .ftl-seg')
  check('k the tray flyout shows the segmented timeline', segs === 8, `${segs} segments`)
  check('k …and no flowers', (await count(tray, '.kf-tray-fb img, .kf-tray-fb .ftl-flower')) === 0)
  check('k …with the block, the bud and the time', /Deep work · bud 3 of 4/.test(await text(tray, '.kf-tray-fb')) && /1\d:\d\d/.test(await text(tray, '.kf-tray-fb')), await text(tray, '.kf-tray-fb'))
  const iris = await tokenRgb(tray, 'var(--blk-iris)')
  check('k the tray\'s segments are the block\'s colour', (await bg(tray.locator('.kf-tray .ftl-seg[data-state="done"]'))) === iris)
  const icon = await page.evaluate(() => (window.__tauriCalls ?? []).filter((c) => c.cmd === 'tray_set').at(-1)?.args ?? null)
  const irisHex = '#' + (iris.match(/\d+/g) ?? []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('')
  check('k the tray icon: a small square in the block\'s colour while focusing (tray_set focusColor → tray.rs square())', icon && /^focus/.test(icon.state) && icon.focusColor === irisHex, JSON.stringify(icon))
  check('k the tray icon\'s tip: the block, the bud, the minutes left', /^Deep work · bud 3 of 4 · \d+ min left$/.test(icon?.focusTip ?? ''), icon?.focusTip)
  check('k no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

if (want('e')) {
  // The calendar: Deep work stays a normal block, no split.
  const cal = await open('/calendar', { seeds: { kf_focus_session: STATES.running } })
  await shot(cal.page, 'app-calendar')
  check('e the calendar has no focus split (no segments, no flowers on blocks)', (await count(cal.page, '.fc .ftl, .fc .ftl-seg')) === 0 && /Deep work/.test(await text(cal.page, '.fc')))
  // A block's menu (right-click): Focus on this → the block, in rounds.
  const writing = cal.page.locator('.fc-event', { hasText: 'Writing' }).first()
  await writing.scrollIntoViewIfNeeded().catch(() => {})
  await writing.click({ button: 'right' })
  await sleep(500)
  const item = cal.page.getByRole('menuitem', { name: /Focus on this/ })
  check('e the block menu offers ▶ Focus on this', (await item.count()) >= 1)
  await item.first().click().catch(() => {})
  await sleep(1200)
  const fs1 = await cal.page.evaluate(() => JSON.parse(localStorage.getItem('kf_focus_session') ?? 'null'))
  check('e block menu → Focus, on the block split into rounds (Writing, 4 buds, Fern)', new URL(cal.page.url()).pathname === '/focus' && fs1?.block?.title === 'Writing' && fs1.block.rounds === 4 && /fern/.test(fs1.block.color) && (await count(cal.page, '.fd-tl .ftl-seg[data-k="f"]')) === 4, JSON.stringify(fs1?.block ?? null))
  await shot(cal.page, 'app-start-blockmenu')
  await cal.ctx.close()
  // The Now card's ▶ Focus: Today's (desktop "Start focus"), and the phone's Now card (▶ Focus).
  for (const [dev, view, btn] of [['desk', DESK, (p) => p.locator('.td-now-head').getByRole('button', { name: 'Start focus' })], ['phone', PHONE, (p) => p.locator('.kf-now-focus')]]) {
    const today = await open('/today', { view })
    const nowFocus = btn(today.page).first()
    check(`e [${dev}] the Now card has ▶ Focus on the block under way`, (await nowFocus.count()) === 1)
    await nowFocus.click({ force: true }).catch(() => {})
    await sleep(1200)
    const fs2 = await today.page.evaluate(() => JSON.parse(localStorage.getItem('kf_focus_session') ?? 'null'))
    check(`e [${dev}] Now card ▶ Focus → Deep work from now (2:16), split into rounds: 3 buds`, new URL(today.page.url()).pathname === '/focus' && fs2?.block?.title === 'Deep work' && fs2.block.rounds === 3 && fs2.isRunning && (await count(today.page, '.fd-tl .ftl-seg[data-k="f"]')) === 3, `${fs2?.block?.title} · ${fs2?.block?.rounds} buds`)
    await shot(today.page, `app-${dev}-start-nowcard`)
    await today.ctx.close()
  }
  // A task (its sheet's Focus): no block → its estimate from now.
  const tasks = await open('/tasks')
  await tasks.page.evaluate((tid) => { history.pushState({}, '', `/tasks?task=${tid}`); dispatchEvent(new PopStateEvent('popstate')) }, id(ESSAY))
  await sleep(1200)
  // The task page's mini focus (it stays on the task; the pill rides along).
  await tasks.page.getByRole('button', { name: /Start a focus session on Edit the essay/ }).first().click().catch(() => {})
  await sleep(1200)
  const fs3 = await tasks.page.evaluate(() => JSON.parse(localStorage.getItem('kf_focus_session') ?? 'null'))
  check('e a task\'s Focus (no block) → its estimate from now: 60m = 2 buds, Iris by default', fs3?.isRunning && fs3?.block?.rounds === 2 && fs3.block.color === 'var(--blk-iris)' && !fs3.block.fromCalendar, JSON.stringify(fs3?.block ?? null))
  check('e …the pill rides along on the task page', (await count(tasks.page, '.fpill .ftl-seg[data-k="f"]')) === 2)
  await go(tasks.page, '/focus')
  await sleep(900)
  check('e …and Focus shows it: 2 buds of 25 in Iris', (await count(tasks.page, '.fd-tl .ftl-seg[data-k="f"]')) === 2 && /Edit the essay/.test(await text(tasks.page, '.fd-top')), await text(tasks.page, '.fd-top'))
  await shot(tasks.page, 'app-start-task')
  await tasks.ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
