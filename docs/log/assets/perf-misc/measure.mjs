// S8 (audit 2026-10-22): the first checkbox tick of a session built the chime's AudioContext inside
// the click. Measures, on the real app against the mocked backend (the sounds harness's recipe):
//   · click → checkbox painted: the Event Timing API's duration for the click interaction (pointerdown
//     → next paint after the handlers), plus aria-checked flip → next frame as a cross-check;
//   · long tasks (≥ 50 ms) from the click to 3 s after it, and the one that holds `new AudioContext()`;
//   · that the chime still plays: when the context was built, its state, when the first oscillator ran.
// Real Chrome autoplay policy (no --autoplay-policy flag): the context must come up 'running' anyway.
//   node measure.mjs <outDir> [baseUrl] [runs] [playwright-core path]
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'http://localhost:5299'
const RUNS = Number(process.argv[4] ?? 3)
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000000a7'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'perf@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const CREATED = '2026-09-20T12:00:00.000Z'
const SOON = new Date(Date.now() + 90 * 60_000).toISOString()
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: SOON, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED,
})
const TASKS = [task(1, 'Reply to Sam'), task(2, 'Book the dentist'), task(3, 'Water the ferns')]
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', workspace_name: 'Personal', quiet_hours_on: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    // Spy on Web Audio: when the context is built (and how long that takes), its state, the first note.
    const AC = window.AudioContext
    window.__audio = { created: [], firstOsc: null }
    window.AudioContext = class extends AC {
      constructor(...a) {
        const t0 = performance.now()
        super(...a)
        window.__audio.created.push({ at: t0, ms: performance.now() - t0, ctx: this })
      }
    }
    const osc = AC.prototype.createOscillator
    AC.prototype.createOscillator = function (...a) {
      if (!window.__audio.firstOsc) window.__audio.firstOsc = { at: performance.now(), state: this.state }
      return osc.apply(this, a)
    }
    window.__long = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: e.duration }) }).observe({ type: 'longtask', buffered: true })
    window.__events = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__events.push({ name: e.name, at: e.startTime, ms: e.duration, id: e.interactionId }) }).observe({ type: 'event', durationThreshold: 16, buffered: true })
  }, [JSON.stringify(session), UID])
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const rows = { tasks: TASKS, app_settings: [SETTINGS] }[table] ?? []
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(2500)
  return { ctx, page }
}

/** One tick: click the box, time the flip to its next frame, collect what ran. `warm` = a press on
 * empty page first (the usual first gesture isn't the tick itself). */
async function tick(page, title, warm) {
  if (warm) { await page.locator('h1').first().click(); await sleep(1500) }
  const box = page.locator(`[role="checkbox"][aria-label=${JSON.stringify(`Complete "${title}"`)}]:visible`).first()
  await box.waitFor()
  await page.evaluate((title) => {
    const el = [...document.querySelectorAll('[role="checkbox"]')].find((b) => b.getAttribute('aria-label') === `Complete "${title}"` && b.offsetParent)
    window.__mark = { down: null, flip: null, frame: null }
    addEventListener('pointerdown', (e) => { window.__mark.down ??= e.timeStamp }, { capture: true, once: true })
    new MutationObserver((_, mo) => {
      if (document.querySelector(`[aria-label=${JSON.stringify(`Complete "${title}"`)}][aria-checked="true"]`) || !el.isConnected) {
        mo.disconnect()
        window.__mark.flip = performance.now()
        requestAnimationFrame(() => { window.__mark.frame = performance.now() })
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] })
  }, title)
  await box.click()
  await sleep(3000)
  return page.evaluate(() => {
    const m = window.__mark
    const after = (x) => x.at >= m.down - 1
    const inter = window.__events.filter((e) => after(e) && ['pointerdown', 'pointerup', 'click'].includes(e.name))
    return {
      clickToPaint: inter.length ? Math.round(Math.max(...inter.map((e) => e.ms))) : '<16',
      flipToFrame: m.frame && m.down != null ? Math.round(m.frame - m.down) : null,
      longTasks: window.__long.filter(after).map((t) => ({ at: Math.round(t.at - m.down), ms: Math.round(t.ms) })),
      audio: window.__audio.created.map((c) => ({ at: Math.round(c.at - m.down), ms: Math.round(c.ms), stateNow: c.ctx.state })),
      firstOsc: window.__audio.firstOsc ? { at: Math.round(window.__audio.firstOsc.at - m.down), state: window.__audio.firstOsc.state } : null,
    }
  })
}

const rows = []
for (let i = 0; i < RUNS; i++) {
  for (const warm of [false, true]) {
    const { ctx, page } = await open()
    const first = await tick(page, 'Reply to Sam', warm)
    const second = await tick(page, 'Book the dentist', false)
    rows.push({ run: i + 1, firstGesture: warm ? 'press elsewhere, then tick' : 'the tick itself', first, second })
    console.log(JSON.stringify(rows.at(-1)))
    await ctx.close()
  }
}
fs.writeFileSync(`${OUT}/measure.json`, JSON.stringify(rows, null, 2))
await browser.close()
