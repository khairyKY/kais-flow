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
  ...Array.from({ length: 22 }, (_, i) => task(40 + i, `Tomorrow errand ${i + 1}`, { due_at: iso('18:00', 13) })),
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
    if (url.pathname.startsWith('/functions/v1/search')) {
      const q = String(req.postDataJSON()?.query ?? '').toLowerCase()
      const results = state.rows.tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8).map((t) => ({ entity_type: 'task', entity_id: t.id, title: t.title, snippet: null, score: 1 }))
      return r.fulfill({ json: { results } })
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
    // RM2: a sheet's rise is functional — it plays with Effects off too; reduced motion cross-fades.
    if (v !== 'reduced') check(`o2 ${v}: the voice sheet rises in (sheetIn)`, a.includes('sheetIn'), JSON.stringify(a))
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
    check('o3 effects off: More still rises (functional, RM2)', a.includes('sheetIn'), JSON.stringify(a))
    await env.ctx.close()
  }
  {
    const env = await open('/today', { reduced: true })
    const more = env.page.locator('[role="dialog"][aria-label="More"]')
    await tap(env, env.page.locator('.app-tabbar').getByRole('button', { name: 'More' }), 60)
    const a = await anims(more)
    check('o3 reduced: More cross-fades (scrimIn, no rise)', a.includes('scrimIn') && !a.includes('sheetIn'), JSON.stringify(a))
    await env.ctx.close()
  }
}

// ── K2 — ⌘K: the changing part eases its height (150ms), chips fade up (120ms), the Jump selection moves in 80ms ──
if (want('k2')) {
  for (const [v, o] of [['on', {}], ['reduced', { reduced: true }]]) {
    const env = await open('/today', { view: desktop, ...o })
    const { page } = env
    await page.keyboard.press('n')
    const field = page.locator('#kf-capture-input')
    await field.waitFor({ timeout: 8000 })
    const grow = page.locator('.kf-cmd-grow')
    const h0 = await grow.evaluate((el) => el.getBoundingClientRect().height)
    await field.fill('call mum tomorrow 3pm') // one input event: the chips row mounts at once
    await sleep(40)
    const mid = await grow.evaluate((el) => ({ h: el.getBoundingClientRect().height, anims: el.getAnimations().map((a) => a.transitionProperty) }))
    const chips = await page.locator('.kf-cmd-chips > *').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName))
    await sleep(400)
    const h1 = await grow.evaluate((el) => el.getBoundingClientRect().height)
    const inner = await grow.evaluate((el) => el.firstElementChild.getBoundingClientRect().height)
    const tr = await grow.evaluate((el) => getComputedStyle(el).transition)
    await shot(page, `k2-chips-${v}`)
    check(`k2 ${v}: the box's height transitions 150ms and comes to rest at its content's height`, tr.includes('height 0.15s') || (v === 'reduced' && tr.includes('height')), tr)
    check(`k2 ${v}: chips arrived with itemFadeIn; the box grew to fit them (${Math.round(h0)} → ${Math.round(h1)})`, chips.length > 0 && chips.every((n) => n === 'itemFadeIn') && h1 > h0 && Math.abs(h1 - inner) < 1, JSON.stringify({ chips, h0, h1, inner }))
    if (v === 'on') check('k2 on: as the chips mount, the height is easing (a running height transition)', mid.anims.includes('height'), JSON.stringify(mid))
    const jumpTr = await page.evaluate(() => [...document.querySelectorAll('.kf-cmd-grow [style*="cursor: pointer"]')].map((e) => getComputedStyle(e).transitionDuration))
    await field.fill('cal')
    await sleep(300)
    const jt = await page.locator('.kf-cmd-grow > div > div').first().evaluate((e) => getComputedStyle(e).transition)
    check(`k2 ${v}: the Jump row's selection transitions its background (80ms)`, jt.includes('background-color 0.08s') || (v === 'reduced' && jt.includes('background-color')), jt + ' ' + JSON.stringify(jumpTr))
    basics(env, `k2 ${v}`)
    await env.ctx.close()
  }
}

// ── O5 — Search on the ⌘K recipe; its rows stay mounted while you type ──
if (want('o5')) {
  for (const [v, o] of [['on', {}], ['effects-off', { effectsOff: true }]]) {
    const env = await open('/today', { view: desktop, ...o })
    const { page } = env
    await page.evaluate(() => window.dispatchEvent(new Event('kf-open-search')))
    const card = page.locator('.kf-overlay-card').filter({ has: page.getByPlaceholder('Search the garden…') })
    await card.waitFor({ timeout: 5000 })
    const a = await anims(card)
    check(`o5 ${v}: the card arrives on the ⌘K recipe (${v === 'on' ? 'kfOverlayIn, with scale' : 'kfOverlayInFlat, rise + fade'})`, a.includes(v === 'on' ? 'kfOverlayIn' : 'kfOverlayInFlat'), JSON.stringify(a))
    const input = page.getByPlaceholder('Search the garden…')
    await input.pressSequentially('err', { delay: 40 })
    await page.getByRole('button', { name: 'Errand 1', exact: true }).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: 'Errand 1', exact: true }).evaluate((el) => (window.__row = el))
    await input.press('ArrowDown')
    await sleep(100)
    await input.pressSequentially('and', { delay: 40 })
    await sleep(600)
    const same = await page.getByRole('button', { name: 'Errand 1', exact: true }).evaluate((el) => el === window.__row && el.isConnected)
    check(`o5 ${v}: a row survives arrow keys and more typing (the same DOM node — no remount)`, same)
    await shot(page, `o5-search-${v}`)
    basics(env, `o5 ${v}`)
    await env.ctx.close()
  }
}

// ── K3 — hold-to-talk: the held button follows the finger exactly, the pill and rail slide in, release springs home ──
if (want('k3')) {
  for (const [v, o] of [['on', {}], ['reduced', { reduced: true }]]) {
    const env = await open('/today', o)
    const { page, cdp } = env
    const btn = page.getByRole('button', { name: /^Capture — tap to type/ })
    const b = await btn.boundingBox()
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await touch(cdp, 'touchStart', [at])
    await sleep(900)
    const pill = await page.locator('.kf-rec-pill').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'none')
    const rail = await page.locator('.kf-rec-rail').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'none')
    check(`k3 ${v}: recording — the pill slides in (kfRecPillIn) and the rail rises (kfRecRailIn)`, pill === 'kfRecPillIn' && rail === 'kfRecRailIn', `${pill} / ${rail}`)
    const tr = await btn.evaluate((e) => getComputedStyle(e).transitionProperty)
    check(`k3 ${v}: held, the button has no transform transition (it can't trail the finger)`, !/transform|all/.test(tr), tr)
    await touch(cdp, 'touchMove', [{ x: at.x, y: at.y - 30 }])
    const follow = await btn.evaluate((e) => new Promise((r) => requestAnimationFrame(() => r(new DOMMatrixReadOnly(getComputedStyle(e).transform).f))))
    check(`k3 ${v}: the button sits exactly under the finger 30px up, the same frame`, Math.abs(follow + 30) < 0.5, follow)
    await touch(cdp, 'touchMove', [{ x: at.x, y: at.y - 40 }])
    await sleep(50)
    await touch(cdp, 'touchEnd', [])
    await sleep(30)
    const spring = await btn.evaluate((e) => e.getAnimations().filter((a) => !('animationName' in a) && !('transitionProperty' in a)).map((a) => ({ ms: a.effect.getTiming().duration, ease: a.effect.getTiming().easing })))
    if (v === 'on') check('k3 on: released, it springs home (--ease-spring, 320ms)', spring.length === 1 && spring[0].ms === 320 && spring[0].ease.includes('1.56'), JSON.stringify(spring))
    else check('k3 reduced: released, it is home at once (no spring)', spring.length === 0, JSON.stringify(spring))
    await sleep(400)
    const rest = await btn.evaluate((e) => getComputedStyle(e).transform)
    check(`k3 ${v}: at rest the button is back in place`, rest === 'none' || rest === 'matrix(1, 0, 0, 1, 0, 0)', rest)
    basics(env, `k3 ${v}`)
    await env.ctx.close()
  }
}

// ── O6 — the tab bar's active pill expands from the centre (scaleX 0.4 → 1 + fade, 200ms emphasized-decel) ──
if (want('o6')) {
  for (const [v, o] of [['on', {}], ['reduced', { reduced: true }]]) {
    const env = await open('/today', o)
    const { page } = env
    const tab = (name) => page.locator('.app-tabbar .kf-tab').filter({ hasText: name }).first()
    const pill = (name) => tab(name).locator('.kf-tab-ind').evaluate((e) => { const s = getComputedStyle(e, '::before'); return { opacity: Number(s.opacity), scaleX: Math.round(new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform).a * 100) / 100, tr: s.transition } })
    await tab('Inbox').click()
    await sleep(40)
    const mid = await tab('Inbox').locator('.kf-tab-ind').evaluate((e) => e.getAnimations({ subtree: true }).map((a) => a.transitionProperty))
    await sleep(400)
    const on = await pill('Inbox'), off = await pill('Today')
    if (v === 'on') check('o6 on: tapping a tab runs the indicator transition (transform + opacity)', mid.includes('transform') && mid.includes('opacity'), JSON.stringify(mid))
    check(`o6 ${v}: at rest the new tab's pill is full (scaleX 1, opacity 1), the old one gone (0.4, 0)`, on.opacity === 1 && on.scaleX === 1 && off.opacity === 0 && off.scaleX === 0.4, JSON.stringify({ on, off }))
    await shot(page, `o6-inbox-${v}`)
    basics(env, `o6 ${v}`)
    await env.ctx.close()
  }
}

// ── O7 — sidebar fold: labels fade out (120ms), then the width eases (200ms); opening reverses it ──
if (want('o7')) {
  for (const [v, o] of [['on', {}], ['effects-off', { effectsOff: true }], ['reduced', { reduced: true }]]) {
    const env = await open('/today', { view: desktop, ...o })
    const { page } = env
    const side = page.locator('aside.app-sidebar')
    // Click and sample inside the page, so the timings are the page's own (sizes are zoomed: compare to the start).
    const run = () => side.evaluate(async (el) => {
      const read = () => ({ w: Math.round(el.getBoundingClientRect().width), label: Number(getComputedStyle(el.querySelector('.app-nav-label')).opacity), shown: getComputedStyle(el.querySelector('.app-nav-label')).display !== 'none' })
      const at = (ms) => new Promise((r) => setTimeout(() => r(read()), ms))
      const w0 = read().w
      document.querySelector('.kf-collapse-btn').click()
      const [a, b, c] = await Promise.all([at(60), at(220), at(700)])
      return { w0, a, b, c }
    })
    const f = await run()
    const full = f.w0, rail = f.c.w
    if (v === 'reduced') check('o7 reduced: the fold is a cut (the rail at once)', f.a.w === rail && rail < full / 2, JSON.stringify(f))
    else check(`o7 ${v}: folding — labels fade first at full width, then the width eases, ending on the rail`, f.a.w === full && f.a.label < 1 && f.b.w > rail && f.b.w < full && !f.c.shown && rail < full / 2, JSON.stringify(f))
    const g = await run()
    if (v === 'reduced') check('o7 reduced: opening is a cut too', g.a.w === full && g.c.label === 1, JSON.stringify(g))
    else check(`o7 ${v}: opening — the width eases out with the labels still hidden, then they fade in`, g.a.w > rail && g.a.w < full && g.a.label === 0 && g.c.w === full && g.c.label === 1, JSON.stringify(g))
    basics(env, `o7 ${v}`)
    await env.ctx.close()
  }
}

// ── D15 — the parasol header: scroll-linked (scroll timeline), so the title's scale IS the scroll position ──
if (want('d15')) {
  for (const [v, o] of [['on', {}], ['night', { theme: 'night' }], ['effects-off', { effectsOff: true }], ['reduced', { reduced: true }]]) {
    const env = await open('/today', o)
    const { page } = env
    // Set the scroll, let the next frame paint, read: no transition or timed easing may sit between the two
    // (two rAFs: the main thread samples a compositor-run scroll timeline a frame behind at most).
    const at = (y) => page.evaluate(async (y) => {
      const main = document.querySelector('.app-main-content')
      main.scrollTop = y
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      const t = document.querySelector('.tp-bar h1.tp-bar-title')
      const sum = document.querySelector('.tp-sum')
      const m = new DOMMatrixReadOnly(getComputedStyle(t).transform)
      return { y: main.scrollTop, scale: Math.round(m.a * 1000) / 1000, font: getComputedStyle(t).fontSize, family: getComputedStyle(t).fontFamily.split(',')[0], sum: sum ? Number(getComputedStyle(sum).opacity) : null, feather: Number(getComputedStyle(document.querySelector('.tp-bar'), '::after').opacity || 0) }
    }, y)
    const r = { 0: await at(0), 40: await at(40), 80: await at(80), 300: await at(300) }
    await shot(page, `d15-scrolled-${v}`)
    const back = await at(0)
    if (v === 'on' || v === 'night') {
      check(`d15 ${v}: title scale tracks the scroll exactly — 1 at 0, ~0.83 at 40, 0.654 at 80 and beyond, back to 1`, r[0].scale === 1 && Math.abs(r[40].scale - (1 - 0.5 * (1 - 17 / 26))) < 0.01 && Math.abs(r[80].scale - 17 / 26) < 0.005 && Math.abs(r[300].scale - 17 / 26) < 0.005 && back.scale === 1, JSON.stringify({ r, back }))
      check(`d15 ${v}: the serif stays (no font swap) and the paper feather comes in over the first 24px`, r[300].family.includes('Serif') && r[0].feather === 0 && r[40].feather === 1, JSON.stringify(r[300]))
    } else {
      check(`d15 ${v}: no parasol — the title never scales; the small-title swap (18px) stands in`, Object.values(r).every((x) => x.scale === 1) && r[300].font === '18px', JSON.stringify(r))
    }
    if (v === 'on') {
      // Another day's page carries the Workload line under the bar: it fades as it slides under.
      await page.getByRole('button', { name: 'Next day' }).first().click()
      await sleep(900)
      const s0 = await at(0), s40 = await at(40)
      check('d15 on: another day — the Workload line fades out over the first 40px', s0.sum === 1 && s40.y === 40 && s40.sum === 0, JSON.stringify({ s0, s40 }))
    }
    basics(env, `d15 ${v}`)
    await env.ctx.close()
  }
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
