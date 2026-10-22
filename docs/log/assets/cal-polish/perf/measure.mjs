// Calendar smoothness + motion measurement (read-only audit, 2026-10-22).
// Real app (worktree cal-polish) on a dev server with a MOCKED backend (the cal-polish/verify.mjs recipe),
// data built around the REAL clock (no page.clock, so requestAnimationFrame is the browser's own).
//   node measure.mjs <outDir> [baseUrl] [configs] [scenarios]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5298'
const CONFIGS = (process.argv[4] ?? 'd1280x1,d1280x1.5,d1920x1,d1920x1.5,phone').split(',')
const ONLY = process.argv[5] ? process.argv[5].split(',') : null
const TRACE = process.env.TRACE === '1'
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !ONLY || ONLY.includes(k)

// ── the clock: Cairo, today ──
const ZONE = 'Africa/Cairo'
const OFF = Number(/GMT([+-]\d+)/.exec(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value)[1])
const dateKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d)
const TODAY = dateKey(new Date())
const addDay = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const iso = (day, hhmm) => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number); return new Date(Date.UTC(y, m - 1, d, h - OFF, mi)).toISOString() }

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data: 21 days × 13 blocks (overlap pairs, a 3-stack, a slot holding tasks, colours, emoji) ──
const CREATED = '2026-09-01T07:00:00Z'
let tn = 0, en = 0
const tid = () => `10000000-0000-4000-8000-${String(++tn).padStart(12, '0')}`
const eidOf = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (title, over = {}) => ({
  id: tid(), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const TASKS = [], EVENTS = []
const ev = (day, title, from, to, type = 'event', over = {}) => {
  const e = { id: eidOf(++en), user_id: UID, title, starts_at: iso(day, from), ends_at: iso(day, to), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type, color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over }
  EVENTS.push(e)
  return e
}
const taskBlock = (day, title, from, to, past) => {
  const done = past && !title.includes('report')
  const t = task(title, { status: done ? 'done' : 'todo', completed_at: done ? CREATED : null, scheduled_start: iso(day, from), scheduled_end: iso(day, to), due_at: iso(day, from) })
  TASKS.push(t)
  return ev(day, title, from, to, 'task', { task_id: t.id })
}
const MARK = {}
for (let o = -7; o <= 13; o++) {
  const day = addDay(TODAY, o)
  const past = o < 0
  const k = (n) => `${o}:${n}`
  MARK[k('morning')] = ev(day, 'Morning review', '08:00', '09:00')
  MARK[k('inbox')] = taskBlock(day, 'Inbox zero ✉️', '09:00', '09:30', past)
  const deep = ev(day, 'Deep work', '10:00', '12:00', 'time_block', { color: '#8a7fb0' })
  MARK[k('deep')] = deep
  if (o === 0 || o === 1) {
    for (const [i, title] of ['Outline chapter 3', 'Fix login bug 🐛', 'Email Sara'].entries()) {
      const t = task(title, { duration_min: 15 + 15 * i, slot_id: deep.id, slot_date: day, scheduled_start: deep.starts_at, scheduled_end: deep.ends_at })
      TASKS.push(t)
      MARK[k(`held${i}`)] = t
    }
  }
  MARK[k('lunch')] = ev(day, 'Lunch 🍝', '12:00', '13:00')
  MARK[k('call')] = ev(day, 'Call with Omar', '12:30', '13:30')
  MARK[k('design')] = ev(day, 'Design sync', '14:00', '15:00')
  MARK[k('pr')] = taskBlock(day, 'Review PR #482', '14:00', '15:00', past)
  MARK[k('gym')] = ev(day, 'Gym', '14:00', '15:00', 'event', { color: '#d08a5c' })
  MARK[k('floss')] = taskBlock(day, 'Water the plants', '15:30', '15:45', past)
  MARK[k('study')] = ev(day, 'Study — Arabic', '16:00', '17:30', 'event', { color: '#7fa37a' })
  MARK[k('report')] = taskBlock(day, 'Write the report', '18:00', '19:00', past)
  MARK[k('dinner')] = ev(day, 'Dinner', '19:00', '20:00')
  MARK[k('admin')] = ev(day, 'Admin', '20:30', '21:30', 'time_block')
  MARK[k('read')] = ev(day, 'Read 📚', '22:00', '22:30')
}
// the rail: Today (dated today, no time), Overdue (dated earlier)
for (const [i, title] of ['Call the bank', 'Groceries 🛒', 'Plan the week', 'Stretch', 'Pay rent', 'Reply to Omar', 'Book dentist', 'Back up photos'].entries()) TASKS.push(task(title, { due_at: iso(TODAY, '09:00'), duration_min: [15, 30, 45, 15, 15, 30, 15, 60][i] }))
for (const title of ['Renew passport', 'Tax form']) TASKS.push(task(title, { due_at: iso(addDay(TODAY, -2), '09:00') }))
const RAIL_TITLE = 'Plan the week'
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

// ── in-page instruments: rAF deltas, long tasks, LoAF (with forced style/layout), React renders ──
function instruments() {
  const realRAF = window.requestAnimationFrame.bind(window)
  const P = (window.__perf = { frames: [], lt: [], loaf: [], counts: {}, commits: 0, on: false, t0: 0 })
  let last = 0
  const loop = (t) => { if (last) P.frames.push([t, t - last]); last = t; realRAF(loop) }
  realRAF(loop)
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]) }).observe({ type: 'longtask' }) } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, scripts: e.scripts.map((s) => ({ inv: s.invoker, src: (s.sourceURL || '').split('/').slice(-1)[0].split('?')[0], fn: s.sourceFunctionName, dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration) })) })
    }).observe({ type: 'long-animation-frame' })
  } catch {}
  const nameOf = (t) => {
    if (!t) return null
    if (typeof t === 'function') return t.displayName || t.name || null
    if (typeof t === 'object') { if (t.render) return t.displayName || t.render.displayName || t.render.name || null; if (t.type) return nameOf(t.type) }
    return null
  }
  const walk = (root) => {
    const stack = [root]
    while (stack.length) {
      const n = stack.pop()
      const alt = n.alternate
      if (n.tag === 0 || n.tag === 1 || n.tag === 11 || n.tag === 14 || n.tag === 15) {
        if (alt === null || (n.flags & 1) === 1) { const nm = nameOf(n.type); if (nm) P.counts[nm] = (P.counts[nm] || 0) + 1 }
      }
      if (alt && alt.child === n.child) continue
      for (let c = n.child; c; c = c.sibling) stack.push(c)
    }
  }
  const renderers = new Map()
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers, supportsFiber: true, isDisabled: false,
    inject(r) { const id = renderers.size + 1; renderers.set(id, r); return id },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {}, checkDCE() {},
    onCommitFiberRoot(_id, root) { if (!P.on) return; P.commits++; try { walk(root.current) } catch (e) { P.walkErr = String(e) } },
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-blink-features=LongAnimationFrameTiming'] })

const CONF = {
  'd1280x1': { viewport: { width: 1280, height: 800 }, scale: 1 },
  'd1280x1.5': { viewport: { width: 1280, height: 800 }, scale: 1.5 },
  'd1920x1': { viewport: { width: 1920, height: 1080 }, scale: 1 },
  'd1920x1.5': { viewport: { width: 1920, height: 1080 }, scale: 1.5 },
  'phone': { viewport: { width: 390, height: 844 }, scale: 1, hasTouch: true, isMobile: true },
}

async function open(conf, o = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: conf.viewport, hasTouch: !!conf.hasTouch, isMobile: !!conf.isMobile, deviceScaleFactor: 1, timezoneId: ZONE, locale: 'en-US', ...(o.video ? { recordVideo: { dir: o.video, size: conf.viewport } } : {}) })
  await ctx.addInitScript(instruments)
  await ctx.addInitScript(([sess, scale, uid, now, folded]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', folded)
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, inbox: false, lists: true }))
    localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), String(conf.scale), UID, Date.now(), o.railFolded ? '1' : '0'])
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
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }).catch(() => {})
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user }).catch(() => {})
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
  await sleep(2500)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
  const anims = []
  await cdp.send('Animation.enable')
  cdp.on('Animation.animationStarted', (e) => {
    const a = e.animation
    anims.push({ t: Date.now(), type: a.type, name: a.name, dur: a.source?.duration, delay: a.source?.delay, easing: a.source?.easing, iter: a.source?.iterations, node: a.source?.backendNodeId })
  })
  return { ctx, page, cdp, errors, state, anims }
}

const METRICS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']
async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(m.filter((x) => METRICS.includes(x.name)).map((x) => [x.name, x.value]))
}
async function begin(env) {
  env.m0 = await metrics(env.cdp)
  env.a0 = env.anims.length
  env.t0 = await env.page.evaluate(() => { const P = window.__perf; P.counts = {}; P.commits = 0; P.on = true; P.t0 = performance.now(); return P.t0 })
}
async function describe(cdp, node) {
  try {
    const { node: n } = await cdp.send('DOM.describeNode', { backendNodeId: node })
    const attrs = Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, a) => (i % 2 ? acc : [...acc, [v, a[i + 1]]]), []))
    return `${n.localName}${attrs.class ? '.' + attrs.class.trim().split(/\s+/).slice(0, 4).join('.') : ''}${attrs.id ? '#' + attrs.id : ''}`
  } catch { return '?' }
}
async function end(env, label, extra = {}) {
  const r = await env.page.evaluate(() => {
    const P = window.__perf
    P.on = false
    const t0 = P.t0, t1 = performance.now()
    const fr = P.frames.filter(([t]) => t >= t0 && t <= t1).map(([, d]) => d)
    const sorted = [...fr].sort((a, b) => a - b)
    const pct = (q) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 10) / 10 : 0)
    const lt = P.lt.filter(([t]) => t >= t0 - 5 && t <= t1).map(([, d]) => Math.round(d))
    const loaf = P.loaf.filter((e) => e.start >= t0 - 5 && e.start <= t1 && e.dur > 50)
    const forced = loaf.reduce((s, e) => s + e.scripts.reduce((x, y) => x + y.forced, 0), 0)
    const top = loaf.flatMap((e) => e.scripts).sort((a, b) => b.dur - a.dur).slice(0, 4).map((s) => `${s.inv}${s.fn ? ' ' + s.fn : ''} @${s.src} ${s.dur}ms (forced ${s.forced})`)
    return {
      ms: Math.round(t1 - t0), frames: fr.length, dropped: fr.filter((d) => d > 20).length, missed: fr.reduce((s, d) => s + Math.max(0, Math.round(d / 16.67) - 1), 0),
      maxFrame: Math.round(Math.max(0, ...fr)), p50: pct(0.5), p95: pct(0.95),
      longTasks: lt, loafN: loaf.length, loafMax: Math.round(Math.max(0, ...loaf.map((e) => e.dur))), forcedLayoutMs: forced, loafTop: top,
      commits: P.commits, renders: Object.fromEntries(Object.entries(P.counts).sort((a, b) => b[1] - a[1]).slice(0, 14)),
    }
  })
  const m1 = await metrics(env.cdp)
  r.layouts = m1.LayoutCount - env.m0.LayoutCount
  r.styleRecalcs = m1.RecalcStyleCount - env.m0.RecalcStyleCount
  r.layoutMs = Math.round((m1.LayoutDuration - env.m0.LayoutDuration) * 1000)
  r.styleMs = Math.round((m1.RecalcStyleDuration - env.m0.RecalcStyleDuration) * 1000)
  r.scriptMs = Math.round((m1.ScriptDuration - env.m0.ScriptDuration) * 1000)
  const an = env.anims.slice(env.a0)
  const uniq = new Map()
  for (const a of an) {
    const key = `${a.type}|${a.name}|${a.dur}|${a.easing}`
    if (!uniq.has(key)) uniq.set(key, { ...a, n: 0 })
    uniq.get(key).n++
  }
  r.animations = []
  for (const a of [...uniq.values()].slice(0, 14)) r.animations.push(`${a.type === 'CSSTransition' ? 'transition' : a.type === 'CSSAnimation' ? 'animation' : a.type} ${a.name} ${a.dur}ms ${a.easing}${a.iter === null || a.iter > 1 ? ' ∞' : ''} ×${a.n} on ${await describe(env.cdp, a.node)}`)
  Object.assign(r, extra)
  env.out[label] = r
  console.log(`  ${label}: ${r.ms}ms frames=${r.frames} dropped=${r.dropped} max=${r.maxFrame} p95=${r.p95} LT=[${r.longTasks.join(',')}] forced=${r.forcedLayoutMs} commits=${r.commits} L=${r.layouts}/${r.layoutMs}ms S=${r.styleRecalcs}/${r.styleMs}ms JS=${r.scriptMs}ms`)
  console.log(`     renders ${JSON.stringify(r.renders)}`)
  if (r.animations.length) console.log(`     anims ${r.animations.join(' | ')}`)
  if (r.loafTop.length) console.log(`     loaf ${r.loafTop.join(' | ')}`)
  return r
}

/** Windows timers are ~15ms grained: pace moves against a deadline instead of trusting sleep(16). */
async function paced(n, hz, fn) {
  const t0 = performance.now()
  for (let i = 1; i <= n; i++) {
    await fn(i)
    const due = t0 + (i * 1000) / hz
    const wait = due - performance.now()
    if (wait > 2) await sleep(wait - 1)
  }
  return Math.round(performance.now() - t0)
}

// ── desktop helpers ──
async function scrollTo(page, hhmm) {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop - scroller.clientHeight / 2
  }, hhmm)
  await sleep(300)
}
const lane = (page, hhmm) => page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
const col = (page, day) => page.locator(`td.fc-timegrid-col[data-date="${day}"]`).boundingBox()
const block = (page, e) => page.locator(`.fc-timegrid-event[data-kf-id="${e.id}"]`).first()
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
async function settle(state, quiet = 500, max = 6000) {
  const t0 = Date.now()
  let n = -1
  while (n !== state.writes.length && Date.now() - t0 < max) { n = state.writes.length; await sleep(quiet) }
}
async function pointerDrag(env, from, to, n = 60, hz = 60, label) {
  const { page } = env
  await page.mouse.move(from.x, from.y)
  await sleep(120)
  await page.mouse.down()
  await sleep(60)
  await begin(env)
  const took = await paced(n, hz, (i) => page.mouse.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n))
  await sleep(120)
  await end(env, `${label}·move`, { moves: n, moveMs: took })
  await begin(env)
  await page.mouse.up()
  await sleep(1500)
  await end(env, `${label}·drop`)
}

async function desktop(confName) {
  const conf = CONF[confName]
  const env = await open(conf)
  env.out = {}
  const { page } = env
  const today = (k) => MARK[`0:${k}`]
  const tomorrow = (k) => MARK[`1:${k}`]
  console.log(`\n=== ${confName} (${conf.viewport.width}×${conf.viewport.height} @${conf.scale * 100}%) — blocks on screen: ${await page.locator('.fc-timegrid-event:not(.fc-event-mirror)').count()}`)
  const traced = async (name, fn) => {
    if (!TRACE) return fn()
    await browser.startTracing(page, { path: path.join(OUT, `trace-${confName}-${name}.json`), screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.screenshot', 'blink.user_timing', 'loading'] })
    try { await fn() } finally { await browser.stopTracing() }
  }

  if (want('idle')) { await begin(env); await sleep(2000); await end(env, 'idle') }

  if (want('scroll')) {
    await scrollTo(page, '12:00')
    const g = await col(page, TODAY)
    await page.mouse.move(g.x + g.width / 2, 400)
    await begin(env)
    await paced(30, 60, () => page.mouse.wheel(0, 60))
    await sleep(400)
    await end(env, 'scroll-wheel')
    await begin(env)
    await env.cdp.send('Input.synthesizeScrollGesture', { x: Math.round(g.x + g.width / 2), y: 400, yDistance: 700, speed: 1400, gestureSourceType: 'mouse' })
    await sleep(300)
    await end(env, 'scroll-fling')
  }

  if (want('hover')) {
    await scrollTo(page, '14:30')
    const pts = []
    for (const k of ['design', 'pr', 'gym', 'floss', 'study', 'lunch', 'call']) for (const e of [today(k), tomorrow(k)]) { const b = await block(page, e).boundingBox().catch(() => null); if (b) pts.push(center(b)) }
    await begin(env)
    let i = 0
    await paced(pts.length * 6, 60, async () => { const p = pts[Math.floor(i++ / 6)]; await page.mouse.move(p.x + (i % 6), p.y) })
    await sleep(300)
    await end(env, 'hover-sweep', { blocks: pts.length })
    await page.mouse.move(5, 5)
  }

  if (want('drag')) {
    await traced('drag', async () => {
      await scrollTo(page, '17:30')
      const src = center(await block(page, today('dinner')).boundingBox())
      const dy = (await lane(page, '16:00')).y - (await lane(page, '19:00')).y
      await pointerDrag(env, src, { x: src.x, y: src.y + dy }, 60, 60, 'block-drag-3h')
      await settle(env.state)
    })
  }

  if (want('resize')) {
    await traced('resize', async () => {
      await scrollTo(page, '17:00')
      const b = block(page, today('study'))
      const bb = await b.boundingBox()
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
      await sleep(200)
      const h = await b.locator('.fc-event-resizer-end').boundingBox()
      const dy = (await lane(page, '18:30')).y - (await lane(page, '17:30')).y
      await pointerDrag(env, center(h), { x: h.x + h.width / 2, y: h.y + h.height / 2 + dy }, 30, 60, 'resize-1h')
      await settle(env.state)
    })
  }

  if (want('card')) {
    await traced('card', async () => {
      await scrollTo(page, '21:00')
      const c = page.locator('.cal-rail-sec[data-section="today"] .unscheduled-task', { hasText: RAIL_TITLE }).first()
      if (!(await c.isVisible())) {
        console.log('  rail state:', JSON.stringify(await page.evaluate(() => ({ rail: document.querySelector('.cal-rail')?.className, tab: !!document.querySelector('.cal-rail-tab'), secs: [...document.querySelectorAll('.cal-rail-sec')].map((s) => `${s.dataset.section}:${s.querySelectorAll('.unscheduled-task').length}`) }))))
        await page.locator('.cal-rail-tab').click().catch(() => {})
        await sleep(600)
        await scrollTo(page, '21:00')
      }
      const cb = await c.boundingBox()
      const l = await lane(page, '21:30')
      const g = await col(page, TODAY)
      await pointerDrag(env, { x: cb.x + cb.width * 0.4, y: cb.y + cb.height / 2 }, { x: g.x + g.width / 2, y: l.y + 4 }, 60, 60, 'rail-card-drag')
      await settle(env.state)
    })
  }

  if (want('held')) {
    await traced('held', async () => {
      await scrollTo(page, '12:00')
      const row = page.locator(`.kf-ev-slot-row[data-slot-task="${today('held0').id}"]`)
      const rb = await row.boundingBox()
      const l = await lane(page, '13:30')
      const g = await col(page, TODAY)
      await pointerDrag(env, { x: rb.x + rb.width * 0.45, y: rb.y + rb.height / 2 }, { x: g.x + g.width / 2, y: l.y + 4 }, 40, 60, 'held-task-out')
      await settle(env.state)
    })
  }

  if (want('write')) {
    await scrollTo(page, '18:30')
    const b = block(page, today('report'))
    await b.hover()
    await sleep(250)
    await begin(env)
    await b.locator('.kf-ev-check').click()
    await sleep(2500)
    await end(env, 'write-complete-echo', { writes: env.state.writes.length })
  }

  if (want('snapback')) {
    // Where is the moved block, frame by frame, after the release? (the drop's visible settle)
    for (const [label, k, from, to] of [['move-3h', '0:dinner', '19:00', '16:00'], ['move-30m', '1:dinner', '19:00', '18:30']]) {
      await scrollTo(page, '17:30')
      const e = MARK[k]
      const src = center(await block(page, e).boundingBox())
      const dy = (await lane(page, to)).y - (await lane(page, from)).y
      await page.mouse.move(src.x, src.y); await sleep(100); await page.mouse.down(); await sleep(60)
      await paced(30, 60, (i) => page.mouse.move(src.x, src.y + (dy * i) / 30))
      await sleep(200)
      await page.evaluate((id) => {
        const rAF = window.__perf ? window.requestAnimationFrame : requestAnimationFrame
        const out = (window.__snap = [])
        const t0 = performance.now()
        const tick = () => {
          const el = document.querySelector(`.fc-timegrid-event[data-kf-id="${id}"]:not(.fc-event-mirror)`)
          const r = el?.getBoundingClientRect()
          out.push([Math.round(performance.now() - t0), r ? Math.round(r.top) : null, !!document.getElementById('kf-cal-ghost'), el ? getComputedStyle(el).visibility : '-'])
          if (performance.now() - t0 < 2500) rAF(tick)
        }
        rAF(tick)
      }, e.id)
      await page.mouse.up()
      await sleep(2700)
      const s = await page.evaluate(() => window.__snap)
      // collapse runs of identical state
      const runs = []
      for (const [t, top, ghost, vis] of s) { const last = runs.at(-1); if (last && last.top === top && last.ghost === ghost && last.vis === vis) { last.to = t; last.n++ } else runs.push({ from: t, to: t, top, ghost, vis, n: 1 }) }
      const gaps = s.slice(1).map((x, i) => x[0] - s[i][0]).filter((d) => d > 50)
      env.out[`snapback-${label}`] = { runs, gaps }
      console.log(`  snapback ${label}: ${runs.map((r) => `${r.from}-${r.to}ms top=${r.top}${r.ghost ? ' +ghost' : ''}${r.vis === 'hidden' ? ' hidden' : ''}`).join(' | ')}  frame gaps>50ms: [${gaps.join(',')}]`)
      await settle(env.state)
    }
  }

  if (want('profile') || want('profile2')) {
    // profile: the FIRST checkbox tick on a block (a 2–5 s long task in prod). profile2: one plain
    // grid pass — the block popover closing (no data change).
    const { cdp } = env
    let act
    if (want('profile')) {
      await scrollTo(page, '18:30')
      const b = block(page, MARK['1:report'])
      await b.hover()
      await sleep(250)
      act = () => b.locator('.kf-ev-check').click()
    } else {
      await scrollTo(page, '21:30')
      await block(page, MARK['1:read']).click()
      await sleep(800)
      act = () => page.keyboard.press('Escape')
    }
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    await begin(env)
    await act()
    await sleep(1500)
    await end(env, 'profiled')
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const dt = new Map()
    profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
    const self = new Map()
    const total = new Map()
    const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`
    for (const [id, t] of dt) {
      const n = byId.get(id)
      self.set(key(n), (self.get(key(n)) ?? 0) + t)
      const seen = new Set()
      for (let cur = id; cur != null; cur = parent.get(cur)) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + t) } }
    }
    const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, t]) => `${Math.round(t / 1000)}ms ${k}`)
    fs.writeFileSync(path.join(OUT, `profile-${confName}.json`), JSON.stringify({ self: fmt(self), total: fmt(total) }, null, 1))
    console.log('  self:\n   ' + fmt(self).slice(0, 15).join('\n   '))
    console.log('  total:\n   ' + fmt(total).slice(0, 25).join('\n   '))
  }

  if (want('write2')) {
    // two ticks in a row (is the first one an outlier?) + a delete and its Undo
    for (const [i, k] of [[1, '1:report'], [2, '2:report']]) {
      await scrollTo(page, '18:30')
      const b = block(page, MARK[k])
      await b.hover()
      await sleep(250)
      await begin(env)
      await b.locator('.kf-ev-check').click()
      await sleep(2500)
      await end(env, `write-complete-${i}`)
    }
    await scrollTo(page, '19:30')
    const d = block(page, MARK['1:dinner'])
    await d.click({ button: 'right' })
    await sleep(400)
    await begin(env)
    await page.getByRole('menuitem', { name: 'Delete' }).first().click().catch(async () => { await page.getByText('Delete', { exact: true }).last().click() })
    await sleep(1500)
    await end(env, 'delete-block', { gone: (await d.count()) === 0 })
    await begin(env)
    await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).first().click()
    await sleep(1500)
    await end(env, 'undo-delete', { back: await d.count() })
  }

  if (want('page')) {
    for (const [name, sel] of [['next', '[aria-label="Next"]'], ['next2', '[aria-label="Next"]'], ['prev', '[aria-label="Previous"]'], ['today', 'button:has-text("Today")']]) {
      const btn = page.locator(`.cal-head ${sel}`).first()
      await btn.hover()
      await sleep(200)
      await begin(env)
      await btn.click()
      await sleep(1000)
      await end(env, `page-${name}`)
    }
  }

  if (want('views')) {
    await page.mouse.click(Math.round(conf.viewport.width / 2), 30).catch(() => {})
    await page.keyboard.press('Escape')
    for (const k of ['d', '3', 'w', 'm', 'w']) {
      await begin(env)
      await page.keyboard.press(k)
      await sleep(1200)
      await end(env, `view-${k}`, { blocks: await page.locator('.fc-event:not(.fc-event-mirror)').count() })
    }
  }

  if (want('quick')) {
    await scrollTo(page, '23:00')
    const l = await lane(page, '23:00')
    const g = await col(page, addDay(TODAY, 2))
    await begin(env)
    await page.mouse.click(g.x + g.width / 2, l.y + 6)
    await sleep(700)
    await end(env, 'quickcreate-open', { open: await page.locator('.kf-quickcreate').count() })
    await begin(env)
    await page.keyboard.press('Escape')
    await sleep(600)
    await end(env, 'quickcreate-close', { open: await page.locator('.kf-quickcreate').count() })
  }

  if (want('popover')) {
    await scrollTo(page, '21:30')
    const b = block(page, tomorrow('read'))
    await begin(env)
    await b.click()
    await sleep(700)
    await end(env, 'blockmenu-open', { open: await page.locator('[role="dialog"]').count() })
    await begin(env)
    await page.keyboard.press('Escape')
    await sleep(600)
    await end(env, 'blockmenu-close', { open: await page.locator('[role="dialog"]').count() })
  }

  if (want('taskpop')) {
    const c = page.locator('.cal-rail-sec[data-section="today"] .unscheduled-task', { hasText: 'Stretch' }).first()
    const cb = await c.boundingBox()
    await begin(env)
    await page.mouse.click(cb.x + cb.width * 0.4, cb.y + cb.height / 2)
    await sleep(900)
    await end(env, 'taskpopover-open', { open: await page.locator('.tp-pop').count() })
    await begin(env)
    await page.keyboard.press('Escape')
    await sleep(700)
    await end(env, 'taskpopover-close', { open: await page.locator('.tp-pop').count() })
  }

  if (want('planning')) {
    // Kai 2026-10-22 (builder's change): planning mode is View options ▸ Planning mode; out by "Leave planning mode".
    await page.locator('.cal-head button[aria-haspopup="dialog"]').first().click()
    await sleep(400)
    const t = page.getByRole('switch', { name: 'Planning mode' }).first()
    if (await t.count()) {
      await begin(env)
      await t.click()
      await sleep(1500)
      await end(env, 'planning-on', { strip: await page.locator('.cal-strip').count() })
      await begin(env)
      await page.getByRole('button', { name: 'Leave planning mode' }).click()
      await sleep(1500)
      await end(env, 'planning-off', { strip: await page.locator('.cal-strip').count() })
    } else await page.keyboard.press('Escape')
  }

  if (want('churn')) {
    // Does an unrelated re-render (a popover) or a write replace every block's DOM node? (FullCalendar churn)
    const markAll = () => page.evaluate(() => { document.querySelectorAll('.fc-timegrid-event').forEach((el) => (el.__kfMark = 1)) })
    const kept = () => page.evaluate(() => { const all = [...document.querySelectorAll('.fc-timegrid-event:not(.fc-event-mirror)')]; return `${all.filter((e) => e.__kfMark).length}/${all.length}` })
    await scrollTo(page, '23:00')
    await markAll()
    const l = await lane(page, '23:00'); const g = await col(page, addDay(TODAY, 3))
    await page.mouse.click(g.x + g.width / 2, l.y + 6); await sleep(600)
    const a = await kept()
    await page.keyboard.press('Escape'); await sleep(500)
    await markAll()
    await page.evaluate(() => window.dispatchEvent(new Event('kf-outbox-change'))); await sleep(600)
    const b = await kept()
    await markAll()
    await scrollTo(page, '18:30')
    const r = block(page, MARK['2:report']); await r.hover(); await sleep(200)
    await r.locator('.kf-ev-check').click(); await sleep(2500)
    const c = await kept()
    env.out['block-node-survival'] = { afterQuickCreateOpen: a, afterOutboxEvent: b, afterOneWrite: c }
    console.log(`  block nodes kept: quick-create open ${a} · outbox-change ${b} · one write ${c}`)
  }

  if (want('railresize')) {
    const split = page.locator('.cal-railsplit').first()
    if (await split.count()) {
      const sb = await split.boundingBox()
      await pointerDrag(env, { x: sb.x + sb.width / 2, y: sb.y + 300 }, { x: sb.x + sb.width / 2 + 120, y: sb.y + 300 }, 40, 60, 'rail-splitter-drag')
    }
  }

  if (want('fold')) {
    const k = page.locator('.cal-railsplit .cal-rail-knob')
    if (await k.count()) {
      await begin(env)
      await k.click()
      await sleep(1200)
      await end(env, 'rail-fold')
      await begin(env)
      await page.locator('.cal-rail-tab').click()
      await sleep(1200)
      await end(env, 'rail-unfold')
    }
  }

  if (want('tick')) {
    await page.mouse.move(5, 5)
    await begin(env)
    await sleep(62_000)
    await end(env, 'idle-62s-with-minute-ticks')
  }

  env.out.errors = env.errors
  await env.ctx.close()
  return env.out
}

// ── phone ──
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function phone() {
  const env = await open(CONF.phone)
  env.out = {}
  const { page, cdp } = env
  const pc = (e) => page.locator(`.pc-block[data-id="${e.id}"]`).first()
  const scrollPhone = (minute) => page.locator('.pc-scroll').evaluate((e, m) => (e.scrollTop = (m * 64) / 60 - 200), minute).then(() => sleep(300))
  console.log(`\n=== phone 390×844 — blocks drawn: ${await page.locator('.pc-block').count()}`)
  const traced = async (name, fn) => {
    if (!TRACE) return fn()
    await browser.startTracing(page, { path: path.join(OUT, `trace-phone-${name}.json`), screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.screenshot'] })
    try { await fn() } finally { await browser.stopTracing() }
  }

  if (want('idle')) { await begin(env); await sleep(2000); await end(env, 'idle') }

  if (want('scroll')) {
    await begin(env)
    await cdp.send('Input.synthesizeScrollGesture', { x: 220, y: 600, yDistance: -600, speed: 1200, gestureSourceType: 'touch' })
    await sleep(500)
    await end(env, 'scroll-touch')
  }

  if (want('swipe')) {
    await scrollPhone(23 * 60)
    await traced('swipe', async () => {
      for (const [name, x0, x1] of [['swipe-next', 330, 80], ['swipe-prev', 80, 330]]) {
        // an empty stretch (23:15, after the last block) so the press never lands on a block or a held row
        const y = Math.round(await page.locator('.pc-canvas').evaluate((c) => c.getBoundingClientRect().top + (23.25 * 60 * 64) / 60))
        await begin(env)
        await touch(cdp, 'touchStart', [{ x: x0, y }])
        await paced(14, 60, (i) => touch(cdp, 'touchMove', [{ x: x0 + ((x1 - x0) * i) / 14, y }]))
        await end(env, `${name}·move`)
        await begin(env)
        await touch(cdp, 'touchEnd', [])
        await sleep(700)
        await end(env, `${name}·settle`)
      }
    })
  }

  if (want('drag')) {
    if (!(await pc(MARK['0:dinner']).count())) { await page.getByRole('button', { name: /^Today/ }).first().click().catch(() => {}); await sleep(600) }
    await scrollPhone(17 * 60)
    await traced('drag', async () => {
      const b = await pc(MARK['0:dinner']).boundingBox()
      const p = { x: b.x + b.width / 2, y: b.y + Math.min(20, b.height / 2) }
      await touch(cdp, 'touchStart', [p])
      await sleep(520)
      await begin(env)
      await paced(48, 60, (i) => touch(cdp, 'touchMove', [{ x: p.x, y: p.y - (i * 192) / 48 }]))
      await sleep(100)
      await end(env, 'block-drag-3h·move')
      await begin(env)
      await touch(cdp, 'touchEnd', [])
      await sleep(1500)
      await end(env, 'block-drag-3h·drop')
      await settle(env.state)
    })
  }

  if (want('sheets')) {
    await scrollPhone(21 * 60)
    const b = await pc(MARK['0:read']).boundingBox()
    await begin(env)
    await touch(cdp, 'touchStart', [center(b)]); await sleep(40); await touch(cdp, 'touchEnd', [])
    await sleep(900)
    await end(env, 'blocksheet-open', { open: await page.locator('[role="dialog"]').count() })
    await begin(env)
    await page.keyboard.press('Escape')
    await sleep(700)
    await end(env, 'blocksheet-close', { open: await page.locator('[role="dialog"]').count() })
    const y = await page.locator('.pc-canvas').evaluate((c) => c.getBoundingClientRect().top + (23 * 60 * 64) / 60 + 12)
    await begin(env)
    await touch(cdp, 'touchStart', [{ x: 220, y }]); await sleep(40); await touch(cdp, 'touchEnd', [])
    await sleep(900)
    await end(env, 'quicksheet-open', { open: await page.locator('[role="dialog"]').count() })
    await begin(env)
    await page.keyboard.press('Escape')
    await sleep(700)
    await end(env, 'quicksheet-close')
  }

  if (want('views')) {
    const t = await page.locator('.pc-title').boundingBox()
    await begin(env)
    await touch(cdp, 'touchStart', [center(t)]); await sleep(40); await touch(cdp, 'touchEnd', [])
    await sleep(800)
    await end(env, 'viewsheet-open')
    const opt = page.locator('[role="dialog"]').getByText(/^3 days$/).first()
    if (await opt.count()) {
      const ob = await opt.boundingBox()
      await begin(env)
      await touch(cdp, 'touchStart', [center(ob)]); await sleep(40); await touch(cdp, 'touchEnd', [])
      await sleep(1200)
      await end(env, 'view-3days', { blocks: await page.locator('.pc-block').count() })
    }
  }

  if (want('tick')) {
    await begin(env)
    await sleep(62_000)
    await end(env, 'idle-62s-with-minute-ticks')
  }
  env.out.errors = env.errors
  await env.ctx.close()
  return env.out
}

const all = {}
for (const c of CONFIGS) {
  try { all[c] = c === 'phone' ? await phone() : await desktop(c) } catch (e) { console.log(`!! ${c}: ${e.stack}`); all[c] = { error: String(e) } }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 1))
}
await browser.close()
console.log(`\nwrote ${path.join(OUT, 'results.json')}`)
