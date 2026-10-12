// Night 1a–1f (design-export/Night.dc.html) on the REAL app against a MOCKED backend — the
// search-design / today-phone recipe: dev server `--mode mock` (VITE_SUPABASE_URL=http://127.0.0.1:9),
// a made-up session in localStorage, Playwright answers every REST call with a sample night.
// The night: Friday 10 Jul 2026 22:04, Cairo (UTC+3) — the frames' own moment.
//   node verify.mjs shots  <outDir> [baseUrl]   every screen × {day,night} × {desktop,phone}, animations frozen
//   node verify.mjs diff   <dirA> <dirB>        pixel diff of the day-* shots (must be identical)
//   node verify.mjs checks <outDir> [baseUrl]   fireflies, motion gates, tab-hidden pause, contrast, scroll trace
//   node verify.mjs sides  <outDir> [baseUrl]   each Night frame beside the app at night (side-1a…1f.jpg)
// THEMES=day or ROUTES=today,tasks narrow a run.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODE = process.argv[2]
const OUT = process.argv[3]
const BASE = process.argv[4] ?? 'http://localhost:5264'
const PW = process.env.PW ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../../../app')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}

// ── diff: no browser needed ──
if (MODE === 'diff') {
  const { default: sharp } = await import(pathToFileURL(path.join(APP, 'node_modules/sharp/dist/index.cjs')).href)
  const [a, b] = [process.argv[3], process.argv[4]]
  const names = fs.readdirSync(a).filter((f) => f.startsWith('day-') && f.endsWith('.png'))
  for (const f of names) {
    if (!fs.existsSync(path.join(b, f))) { check(`${f} exists in both`, false); continue }
    const [x, y] = await Promise.all([a, b].map((d) => sharp(path.join(d, f)).raw().toBuffer({ resolveWithObject: true })))
    let diff = 0
    if (x.data.length === y.data.length) for (let i = 0; i < x.data.length; i += x.info.channels) if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2]) diff++
    check(`${f} identical (${x.info.width}×${x.info.height})`, x.data.length === y.data.length && diff === 0, `${diff} px differ`)
  }
  fs.writeFileSync(path.join(b, 'day-diff.json'), JSON.stringify(results, null, 2))
  process.exit(results.every((r) => r.ok) ? 0 : 1)
}

const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the sample night: Fri 10 Jul 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 6, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = cairo('22:04')
const DAY0 = new Date(Date.UTC(2026, 5, 4, 6)).toISOString()
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_GARDEN = 'p0000000-0000-4000-8000-000000000001'
const P_FORECAST = 'p0000000-0000-4000-8000-000000000002'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const done = (at) => ({ status: 'done', completed_at: iso(at) })
const TASKS = [
  task(1, 'Plan the forecasting logic', { top3: true, project_id: P_FORECAST, ...done('11:20') }),
  task(2, 'Reply to Youssef', { top3: true, ...done('15:05') }),
  task(3, 'Water the balcony plants', { top3: true, project_id: P_GARDEN, due_at: iso('09:00') }),
  task(4, 'Wireframe the charts view', { project_id: P_FORECAST, due_at: iso('09:00', 9) }),
  task(5, 'Reconcile Q2 actuals', { due_at: iso('09:00', 11) }),
  task(6, 'Send Omar the revised scope PDF', { ...done('10:10') }),
  task(7, 'Buy jasmine fertiliser', { project_id: P_GARDEN, due_at: iso('09:00') }),
]
const ev = (n, title, from, to, over = {}) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false,
  task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: DAY0, updated_at: DAY0, ...over,
})
const EVENTS = [ev(1, 'Dinner — Salma', '20:00', '20:50'), ev(2, 'Wind-down · reading', '22:05', '22:45'), ev(3, 'Standup', '10:00', '10:30'), ev(4, 'Deep work — forecasting', '13:00', '15:00')]
const PROJECTS = [
  { id: P_GARDEN, user_id: UID, domain_id: null, name: 'Balcony garden', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 },
  { id: P_FORECAST, user_id: UID, domain_id: null, name: 'Forecasting App', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 },
]
const ROUTINES = [['Glass of water', 'morning', '07:00'], ['Stretch', 'morning', '07:10'], ['Tidy desk', 'evening', '21:00'], ['Journal entry', 'evening', '22:00'], ['Plan tomorrow', 'evening', '22:30']].map(([name, t, clock], i) => ({
  id: `r0000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: clock, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: DAY0, updated_at: DAY0,
}))
const COMPLETIONS = []
for (let d = 4; d <= 10; d++) for (const r of ROUTINES.slice(0, d === 10 ? 3 : 5)) COMPLETIONS.push({ id: `c${d}${r.id.slice(2)}`, user_id: UID, routine_id: r.id, completed_on: `2026-07-${String(d).padStart(2, '0')}`, created_at: iso('07:30', d) })
const INBOX = ['idea: night garden screenshots', 'book dentist', 'ask Salma about the market'].map((raw, i) => ({
  id: `i0000000-0000-4000-8000-00000000000${i}`, user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso(`1${i}:00`), updated_at: iso(`1${i}:00`),
}))
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({
  tasks: TASKS, calendar_events: EVENTS, projects: PROJECTS, routines: ROUTINES, routine_completions: COMPLETIONS, inbox_items: INBOX, app_settings: [SETTINGS],
  activity_log: TASKS.filter((t) => t.top3).map((t, i) => ({ id: `a0000000-0000-4000-8000-00000000010${i}`, user_id: UID, event_type: 'task.starred', entity_type: 'task', entity_id: t.id, payload: {}, created_at: iso('08:00') })),
})
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 800 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }

async function open(route, theme, view, o = {}) {
  const ctx = await browser.newContext({ ...VIEWS[view], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, sess, uidKey, effects]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(uidKey, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 }))
    localStorage.setItem(uidKey.replace('kf-whats-new', 'kf-help'), JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox', 'hint:top3', 'hint:capture'])) // no first-run notes popping in mid-shot
    if (effects === '0') localStorage.setItem('kf_effects', '0')
  }, [theme, JSON.stringify(session), `kf-whats-new:${UID}`, o.effects ?? '1'])
  const rows = tables()
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = url.pathname.replace('/rest/v1/', '')
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const list = filterRows(rows[table] ?? [], url)
    if (one) return list.length ? r.fulfill({ json: list[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: list, headers: { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  if (!o.realClock) await page.clock.install({ time: NOW }) // perf runs keep the real clock: rAF + performance.now must be real
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  // Fonts settle row heights — a shot taken mid-swap differs from the next run by thousands of px.
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  await page.evaluate(() => document.fonts.ready)
  return { ctx, page, errors }
}

const ROUTES = (process.env.ROUTES ?? 'today,tasks,calendar,inbox,routines,settings').split(',')
const THEMES = (process.env.THEMES ?? 'day,night').split(',')

if (MODE === 'shots') {
  for (const theme of THEMES) for (const view of ['desktop', 'phone']) for (const r of ROUTES) {
    const { ctx, page, errors } = await open(`/${r}`, theme, view)
    // Frozen: infinite loops (the sidebar vine, fireflies) back to their start, finite ones to their end.
    await page.screenshot({ path: path.join(OUT, `${theme}-${view}-${r}.png`), animations: 'disabled' })
    check(`${theme} ${view} /${r} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

if (MODE === 'checks') {
  const flies = (page) => page.locator('.kf-fly')
  const running = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).map((a) => `${a.animationName ?? 'waapi'}@${a.effect.target.className?.baseVal ?? a.effect.target.className}`))

  if (!process.env.PERF_ONLY) for (const view of ['desktop', 'phone']) {
    // Day: nothing new exists.
    {
      const { ctx, page } = await open('/today', 'day', view)
      check(`${view} day: no moonflower, no fireflies`, (await page.locator('.kf-moonflower').count()) === 0 && (await flies(page).count()) === 0)
      await ctx.close()
    }
    // Night, animations on: the moonflower + 2 flies on a computer, 1 on a phone; ambient budget ≤ 2.
    {
      const { ctx, page, errors } = await open('/today', 'night', view)
      const want = view === 'desktop' ? 2 : 1
      check(`${view} night: moonflower shown`, (await page.locator('.kf-moonflower').count()) === 1)
      check(`${view} night: ${want} firefl${want === 1 ? 'y' : 'ies'}`, (await flies(page).count()) === want, await flies(page).count())
      const loops = await running(page)
      check(`${view} night Today: ≤2 continuous animations (DS ambient budget)`, loops.length <= 2 * 2 && new Set(loops.map((l) => l.split('@')[1])).size <= 2, loops.join(', '))
      const props = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('kf-fly')).flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))))
      check(`${view} fireflies animate transform/opacity only`, props.length > 0 && props.every((p) => p === 'transform' || p === 'opacity'), [...new Set(props)].join(','))
      await page.screenshot({ path: path.join(OUT, `night-${view}-today-live.png`) })
      // Tab hidden → paused; visible again → running.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await sleep(200)
      const hiddenStates = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('kf-fly')).map((a) => a.playState))
      check(`${view} tab hidden: fireflies paused`, hiddenStates.length > 0 && hiddenStates.every((s) => s === 'paused'), hiddenStates.join(','))
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await sleep(200)
      const backStates = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('kf-fly')).map((a) => a.playState))
      check(`${view} tab visible again: fireflies running`, backStates.length > 0 && backStates.every((s) => s === 'running'), backStates.join(','))
      check(`${view} night Today no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    // Still nights: reduced motion, and the app's animations toggle off.
    for (const [label, o] of [['reduced-motion', { reduced: true }], ['animations-off', { effects: '0' }]]) {
      const { ctx, page } = await open('/today', 'night', view, o)
      const n = await flies(page).count()
      const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('kf-fly')).length)
      const op = await flies(page).first().evaluate((e) => getComputedStyle(e).opacity).catch(() => 'none')
      check(`${view} ${label}: fireflies held still (no animation, shown at rest)`, n > 0 && anims === 0 && op === '0.4', `${n} flies, ${anims} animations, opacity ${op}`)
      const loops = await running(page)
      check(`${view} ${label}: no continuous animation anywhere on Today`, loops.length === 0, loops.join(', '))
      await page.screenshot({ path: path.join(OUT, `night-${view}-today-${label}.png`) })
      await ctx.close()
    }
    // Every other screen at night holds still (the spec: fireflies on Today only).
    for (const r of ['tasks', 'calendar', 'inbox', 'routines', 'settings']) {
      const { ctx, page } = await open(`/${r}`, 'night', view)
      check(`${view} night /${r}: no fireflies, no moonflower`, (await flies(page).count()) === 0 && (await page.locator('.kf-moonflower').count()) === 0)
      const loops = await running(page)
      check(`${view} night /${r}: no continuous ambient animation`, loops.length === 0, loops.join(', '))
      await ctx.close()
    }
  }

  // Contrast: every text node on the new/changed night surfaces, against the colour actually behind it.
  if (!process.env.PERF_ONLY) {
    const report = []
    for (const view of ['desktop', 'phone']) for (const r of ['today', 'routines', 'settings', 'calendar']) {
      const { ctx, page } = await open(`/${r}`, 'night', view)
      const rows = await page.evaluate(() => {
        const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
        const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 })
        // Composite every background from the root down to the element (ignores images; the grain is ±2%).
        const bgOf = (el) => {
          const chain = []
          for (let e = el; e; e = e.parentElement) chain.unshift(e)
          let c = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }
          for (const e of chain) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b.a > 0) c = over(b, c) }
          return c
        }
        const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
        const out = []
        for (const host of document.querySelectorAll('.st-card, .td-now, .tp-ritual, [style*="--frost-bg"]')) {
          const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const t = n.textContent.trim()
            if (!t) continue
            const el = n.parentElement
            const cs = getComputedStyle(el)
            if (cs.visibility === 'hidden' || cs.display === 'none' || !el.getClientRects().length || +cs.opacity === 0) continue
            const fg = parse(cs.color)
            const bg = bgOf(el)
            const size = parseFloat(cs.fontSize)
            const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700)
            const rt = ratio(over(fg, bg), bg)
            out.push({ surface: (typeof host.className === 'string' && host.className.split(' ')[0]) || 'garden-card', text: t.slice(0, 40), color: cs.color, size, ratio: +rt.toFixed(2), need: large ? 3 : 4.5, ok: rt >= (large ? 3 : 4.5) })
          }
        }
        return out
      })
      for (const row of rows) report.push({ view, route: r, ...row })
      await ctx.close()
    }
    const bad = report.filter((x) => !x.ok)
    check(`contrast: ${report.length} text runs on the night surfaces, all AA`, report.length > 0 && bad.length === 0, bad.map((b) => `${b.route} "${b.text}" ${b.ratio}`).slice(0, 6).join(' | '))
    fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(report, null, 2))
    const min = report.reduce((m, x) => Math.min(m, x.ratio), 99)
    fs.writeFileSync(path.join(OUT, 'contrast.md'), `# Night surfaces — text contrast (WCAG 2.x)\n\n${report.length} text runs, lowest ${min}:1, ${bad.length} below AA.\n\n| view | route | surface | text | colour | px | ratio | needs |\n|---|---|---|---|---|---:|---:|---:|\n${report.map((x) => `| ${x.view} | ${x.route} | ${x.surface} | ${x.text.replace(/\|/g, '/')} | ${x.color} | ${x.size} | ${x.ratio} | ${x.need} |`).join('\n')}\n`)
  }

  // Scroll trace at 1280×800 (125% zoom): wheel-scroll each frosted page down and back, with a Chrome
  // performance trace, long tasks (>50 ms) and rAF frame gaps. Day vs night as shipped (flat frost), and
  // night with the drawn backdrop-filter: blur(6px) injected — the experiment behind the flat fallback.
  const BLUR = ':root[data-theme="night"] :is(.st-card, .td-now, .tp-ritual, [style*="--frost-bg"]) { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }'
  const TRACE = process.env.TRACE_DIR
  for (const r of ['today', 'settings', 'routines', 'calendar']) for (const [label, theme, blur] of [['day', 'day', false], ['night', 'night', false], ['night+blur', 'night', true]]) {
    const { ctx, page } = await open(`/${r}`, theme, 'desktop', { realClock: true })
    if (blur) { await page.addStyleTag({ content: BLUR }); await sleep(300) }
    if (blur && r === 'settings') await page.screenshot({ path: path.join(OUT, 'night-desktop-settings-blur.png'), animations: 'disabled' })
    if (!blur && theme === 'night' && r === 'settings') await page.screenshot({ path: path.join(OUT, 'night-desktop-settings-flat.png'), animations: 'disabled' })
    const box = await page.locator(r === 'calendar' ? '.fc-timegrid-body' : '.app-main-content').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300))
    if (TRACE) await browser.startTracing(page, { path: path.join(TRACE, `trace-${label}-${r}.json`), screenshots: false })
    await page.mouse.wheel(0, 1); await sleep(400) // starting a trace is itself a long task — let it pass before observing
    await page.evaluate(() => {
      window.__perf = { longs: [], frames: [] }
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longs.push(Math.round(e.duration)) }).observe({ type: 'longtask' })
      let last = performance.now()
      const tick = (t) => { window.__perf.frames.push(t - last); last = t; if (!window.__perf.stop) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    for (const dy of [...Array(24).fill(100), ...Array(24).fill(-100)]) { await page.mouse.wheel(0, dy); await sleep(32) }
    await sleep(300)
    if (TRACE) await browser.stopTracing()
    const stats = await page.evaluate(() => {
      window.__perf.stop = true
      const f = window.__perf.frames.slice(2)
      const sorted = [...f].sort((a, b) => a - b)
      return { longs: window.__perf.longs, frames: f.length, over25: f.filter((x) => x > 25).length, p95: Math.round(sorted[Math.floor(f.length * 0.95)] * 10) / 10, max: Math.round(sorted.at(-1) * 10) / 10 }
    })
    const moved = await page.evaluate((cal) => (cal ? document.querySelector('.fc-scroller-liquid-absolute, .fc-timegrid-body')?.closest('.fc-scroller')?.scrollHeight : document.querySelector('.app-main-content').scrollHeight - document.querySelector('.app-main-content').clientHeight), r === 'calendar')
    check(`scroll ${label} /${r}: no long tasks`, stats.longs.length === 0, `${stats.longs.length} long tasks [${stats.longs.join(',')}] · ${stats.over25}/${stats.frames} frames >25ms · p95 ${stats.p95}ms · worst ${stats.max}ms · scrollable ${moved}px`)
    results.at(-1).stats = { ...stats, label, route: r }
    await ctx.close()
  }
}

if (MODE === 'sides') {
  // Each Night frame (design-export/Night.dc.html, rendered as drawn) beside the app at night: 1a–1e at
  // 1280×800 (the app's default 125% zoom), 1f at 390×844. Live (animations running), not frozen.
  const { default: sharp } = await import(pathToFileURL(path.join(APP, 'node_modules/sharp/dist/index.cjs')).href)
  const design = pathToFileURL(path.resolve(APP, '../design-export/Night.dc.html')).href
  const dctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const dp = await dctx.newPage()
  await dp.goto(design, { waitUntil: 'networkidle' })
  await dp.evaluate(() => document.fonts.ready)
  await sleep(2500)
  for (const k of ['1a', '1b', '1c', '1d', '1e', '1f']) await dp.locator(`[id="${k}"] > :nth-child(2)`).screenshot({ path: path.join(OUT, `design-${k}.png`) })
  await dctx.close()
  const scenes = [['1a', '/today', 'desktop'], ['1b', '/tasks', 'desktop', true], ['1c', '/calendar', 'desktop'], ['1d', '/routines', 'desktop'], ['1e', '/settings', 'desktop'], ['1f', '/today', 'phone']]
  for (const [k, route, view, bar] of scenes) {
    const { ctx, page, errors } = await open(route, 'night', view)
    if (bar) {
      await page.keyboard.press('Control+KeyK')
      await sleep(400)
      await page.keyboard.type('buy jasmine fertiliser sat morning')
      await sleep(600)
    }
    const app = path.join(OUT, `app-${k}-${view}-night.png`)
    await page.screenshot({ path: app })
    check(`${k} ${route} ${view} night renders, no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
    const H = view === 'phone' ? 844 : 800
    const d = await sharp(path.join(OUT, `design-${k}.png`)).resize({ height: H }).toBuffer({ resolveWithObject: true })
    const a = await sharp(app).toBuffer({ resolveWithObject: true })
    const gap = 24
    await sharp({ create: { width: d.info.width + gap + a.info.width, height: H, channels: 3, background: '#17141f' } })
      .composite([{ input: d.data, left: 0, top: 0 }, { input: a.data, left: d.info.width + gap, top: 0 }])
      .jpeg({ quality: 82 })
      .toFile(path.join(OUT, `side-${k}.jpg`))
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, `${MODE}-results.json`), JSON.stringify(results, null, 2))
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`)
