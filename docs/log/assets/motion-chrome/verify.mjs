// motion-chrome (lane C of the 2026-10-28 motion build) on the REAL app against a MOCKED backend — the
// motion/capture-type recipe: dev server --mode mock (VITE_SUPABASE_URL=http://127.0.0.1:9), a made-up
// session in localStorage, Playwright answers every REST call. The mic is Chrome's fake device.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]     (ONLY=o2,o3,... to pick sections)
// Each item: the motion runs with Effects on, is a cross-fade or nothing with Effects off and with
// reduced motion, and the end state is right. Motion is read with getAnimations() / computed styles.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5329'
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
const UID = '00000000-0000-4000-8000-00000000c4e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const TASKS = [
  task(1, 'Plan & implement forecasting logic', { due_at: iso('15:00'), top3: true, top3_rank: 1 }),
  task(2, 'Call the tyre supplier', { due_at: iso('09:00'), top3: true, top3_rank: 2 }),
  task(3, 'Review the week', { due_at: iso('11:00'), top3: true, top3_rank: 3 }),
  ...Array.from({ length: 22 }, (_, i) => task(10 + i, `Errand ${i + 1}`, { due_at: iso('18:00') })),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: CREATED, updated_at: CREATED }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: [], domains: [], areas: [], people: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** o: { view, theme, effectsOff, reduced, init(localStorage) } */
async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.grantPermissions(['microphone'], { origin: BASE })
  await ctx.addInitScript(([t, sess, uid, at, effects, dl]) => {
    localStorage.setItem('kf_theme', t)
    if (dl) localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
    localStorage.setItem('kf_effects', effects)
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime(), o.effectsOff ? '0' : '1', !o.downloadBar])
  const state = { rows: tables(), writes: [], transcribed: 0 }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/transcribe')) {
      state.transcribed += 1
      return r.fulfill({ json: { text: 'call mum' } })
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      state.writes.push({ method: req.method(), table })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90_000 })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80 })
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(env, loc, settle = 450) {
  if (!env.cdp) {
    await loc.click()
    return sleep(settle)
  }
  const b = await loc.boundingBox()
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(settle)
}
/** A touch drag from (x, y) down by `dy` in `n` steps; `mid` runs while still held. */
async function touchDrag(env, x, y, dy, { n = 10, mid, dx = 0 } = {}) {
  await touch(env.cdp, 'touchStart', [{ x, y }])
  for (let i = 1; i <= n; i++) {
    await sleep(24)
    await touch(env.cdp, 'touchMove', [{ x: x + (dx * i) / n, y: y + (dy * i) / n }])
  }
  await sleep(60)
  const seen = mid ? await mid() : null
  await touch(env.cdp, 'touchEnd', [])
  return seen
}
/** Running animation names on an element (CSS animations + transitions). */
const anims = (loc) => loc.evaluate((el) => el.getAnimations().map((a) => a.animationName ?? a.transitionProperty ?? 'waapi'))
const translateY = (loc) => loc.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)
/** Phone: the tab bar's capture → "Talk instead" opens the voice sheet. */
async function openVoice(env) {
  await tap(env, env.page.getByRole('button', { name: /^Capture — tap to type/ }), 700)
  await tap(env, env.page.getByRole('button', { name: 'Talk instead' }), 40)
}
const basics = (env, name) => check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))

// ── O2 — the voice capture sheet is a BottomSheet: rises in, drags with the finger, swipe down closes with an exit ──
if (want('o2')) {
  const variants = [['on', {}], ['effects-off', { effectsOff: true }], ['reduced', { reduced: true }]]
  for (const [v, o] of variants) {
    const env = await open('/today', o)
    const { page } = env
    const voice = page.locator('[role="dialog"][aria-label="Voice capture"]')
    await openVoice(env)
    await voice.waitFor({ timeout: 8000 })
    const a = await anims(voice)
    if (v === 'on') check(`o2 ${v}: the voice sheet rises in (sheetIn)`, a.includes('sheetIn'), JSON.stringify(a))
    else check(`o2 ${v}: the voice sheet cross-fades in (scrimIn, no rise)`, a.includes('scrimIn') && !a.includes('sheetIn'), JSON.stringify(a))
    await sleep(600)
    check(`o2 ${v}: it's listening inside the shared sheet (handle present)`, (await voice.getAttribute('data-voice-phase')) === 'recording' && (await voice.locator('.kf-bs-handle').count()) === 1)
    const h = await voice.locator('.kf-bs-handle').boundingBox()
    const box = await voice.boundingBox()
    const mid = await touchDrag(env, h.x + h.width / 2, h.y + 12, box.height * 0.5, { mid: async () => { await shot(page, `o2-drag-${v}`); return translateY(voice) } })
    check(`o2 ${v}: the sheet follows the finger 1:1 down the handle (≈${Math.round(box.height * 0.5)}px)`, Math.abs(mid - box.height * 0.5) < 3, mid)
    await sleep(80)
    const leaving = await voice.count()
    await sleep(400)
    check(`o2 ${v}: released past 30% → it plays an exit, then unmounts; nothing was filed`, leaving === 1 && (await voice.count()) === 0 && env.state.transcribed === 0, JSON.stringify({ leaving, after: await voice.count(), transcribed: env.state.transcribed }))
    // Scrim tap closes too; Cancel still closes.
    await openVoice(env)
    await sleep(700)
    await tap(env, voice.getByRole('button', { name: 'Cancel' }), 500)
    check(`o2 ${v}: Cancel closes through the same exit`, (await voice.count()) === 0)
    basics(env, `o2 ${v}`)
    await env.ctx.close()
  }
  // A kept take can't be swiped away.
  {
    const env = await open('/today')
    const { page } = env
    await page.route('**/functions/v1/transcribe', (r) => r.fulfill({ status: 500, json: { error: 'boom' } }))
    const voice = page.locator('[role="dialog"][aria-label="Voice capture"]')
    await openVoice(env)
    await sleep(1500)
    await page.waitForFunction(() => !document.querySelector('[aria-label="Voice capture"] button[disabled]'), null, { timeout: 8000 }).catch(() => {})
    await sleep(600)
    await tap(env, voice.getByRole('button', { name: 'Stop & file' }), 1500)
    await page.waitForFunction(() => document.querySelector('[aria-label="Voice capture"]')?.getAttribute('data-voice-phase') === 'kept', null, { timeout: 8000 }).catch(() => {})
    const h = await voice.locator('.kf-bs-handle').boundingBox()
    const box = await voice.boundingBox()
    await touchDrag(env, h.x + h.width / 2, h.y + 12, box.height * 0.6)
    await sleep(500)
    check('o2 kept take: a swipe down follows, then settles back — the recording stays', (await voice.getAttribute('data-voice-phase').catch(() => null)) === 'kept' && Math.abs(await translateY(voice)) < 1)
    basics(env, 'o2 kept')
    await env.ctx.close()
  }
}

// ── O3 — the phone More sheet is a BottomSheet; O11 — its content drags it from the scroll-top ──
if (want('o3')) {
  for (const theme of ['day', 'night']) {
    const env = await open('/today', { theme })
    const { page } = env
    const more = page.locator('[role="dialog"][aria-label="More"]')
    await tap(env, page.locator('.app-tabbar').getByRole('button', { name: 'More' }), 60)
    const a = await anims(more)
    check(`o3 ${theme}: More rises in (sheetIn)`, a.includes('sheetIn'), JSON.stringify(a))
    await sleep(500)
    await shot(page, `o3-open-${theme}`)
    const h = await more.locator('.kf-bs-handle').boundingBox()
    const box = await more.boundingBox()
    const mid = await touchDrag(env, h.x + h.width / 2, h.y + 12, 90, { mid: () => translateY(more) })
    await sleep(400)
    check(`o3 ${theme}: a short drag follows the finger, then settles back open`, Math.abs(mid - 90) < 3 && (await more.count()) === 1 && Math.abs(await translateY(more)) < 1, mid)
    // O11: the content (scrolled to top) drags the sheet too; past 30% it closes, and no link fires.
    const link = more.getByRole('link', { name: 'Projects' })
    const lb = await link.boundingBox()
    const mid2 = await touchDrag(env, lb.x + lb.width / 2, lb.y + lb.height / 2, box.height * 0.5, { mid: () => translateY(more) })
    await sleep(350)
    check(`o3 ${theme}: O11 a drag down on the content at its top drags the sheet and closes it; no navigation`, Math.abs(mid2 - box.height * 0.5) < 6 && (await more.count()) === 0 && new URL(page.url()).pathname === '/today', JSON.stringify({ mid2, path: new URL(page.url()).pathname }))
    // A link navigates at once and the sheet plays its exit over the new page.
    await tap(env, page.locator('.app-tabbar').getByRole('button', { name: 'More' }), 500)
    await tap(env, more.getByRole('link', { name: 'Projects' }), 60)
    const during = await more.count()
    await sleep(400)
    check(`o3 ${theme}: a link navigates and the sheet exits (still there mid-exit, gone after)`, new URL(page.url()).pathname === '/projects' && during === 1 && (await more.count()) === 0, JSON.stringify({ during, path: new URL(page.url()).pathname }))
    basics(env, `o3 ${theme}`)
    await env.ctx.close()
  }
  {
    const env = await open('/today', { effectsOff: true })
    const more = env.page.locator('[role="dialog"][aria-label="More"]')
    await tap(env, env.page.locator('.app-tabbar').getByRole('button', { name: 'More' }), 60)
    const a = await anims(more)
    check('o3 effects off: More cross-fades (scrimIn, no rise)', a.includes('scrimIn') && !a.includes('sheetIn'), JSON.stringify(a))
    await env.ctx.close()
  }
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
