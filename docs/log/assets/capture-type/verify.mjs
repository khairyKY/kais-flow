// Capture-type (Kai 2026-10-07: "the capture button only takes voice for the phone, we need to fix that
// for both desktop and phone") on the REAL app, signed in against a MOCKED backend — the task-sheet recipe
// (docs/log/assets/task-sheet/verify.mjs): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, Playwright answers every REST call,
// and writes are answered 201, go nowhere, and are recorded. transcribe / parse-capture are answered here
// (never Groq). The mic is Chrome's fake device (--use-fake-device-for-media-stream): a real
// getUserMedia + MediaRecorder, no stubs. Phone gestures are real CDP touch at 390×844.
// Phase 2 (the ai-* scenes): typed captures are written from the local parse at once, then the mocked
// AI read fills only what's empty (explicit tokens win), with "✦ … by AI · Undo"; offline = local stands.
//   node verify.mjs <outDir> [baseUrl] [design-11a.png] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5262'
const DESIGN = process.argv[4] // Paper Capture.dc.html frame 11a rendered to a PNG (optional side-by-side)
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000c7e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const CREATED = '2026-09-21T06:00:00Z'
const DOMAINS = [{ id: 'd0000000-0000-4000-8000-000000000001', user_id: UID, name: 'Shaheen', color: '#C9A961', sort_order: 1, created_at: CREATED, updated_at: CREATED }]
const PROJECTS = [{ id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: DOMAINS[0].id, name: 'Website', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: CREATED, updated_at: CREATED }
const PENDING = { id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'book dentist', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: CREATED, updated_at: CREATED }

/** What the mocked parse-capture answers (keyed by a phrase in raw_text); anything else = an unsure note. */
const AI = {
  'call mum tomorrow 5pm': { kind: 'task', title: 'Call mum', confidence: 0.95 },
  'Call the bank asap': { kind: 'task', title: 'Call the bank', priority: 1, description: 'Bring the payslips', confidence: 0.9 },
  'renew the car licence': { kind: 'task', title: 'Renew the car licence', priority: 1, confidence: 0.9 },
}

/** Cairo wall clock of an ISO instant: "2026-10-08 09:00". */
const cairo = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}
const TOMORROW = cairo(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10)
/** The UTC instant of a Cairo wall clock on `day` (the offset read from the tz database for that day). */
const cairoIso = (day, hhmm) => {
  const noon = new Date(`${day}T12:00:00Z`)
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'longOffset' }).formatToParts(noon).find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00'
  return new Date(`${day}T${hhmm}:00${off}`).toISOString()
}
// capture-block: a line the local parse finds no time in, but the AI reads one ("before sunrise" → 05:00).
AI['crypto session before sunrise'] = { kind: 'task', title: 'Crypto session', due_at: cairoIso(TOMORROW, '05:00'), has_time: true, confidence: 0.9 }

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

/** Opens `route`. `state.heard` = what transcribe answers; `state.transcribe = 'fail'` answers 500. */
async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['microphone'], { origin: BASE })
  await ctx.addInitScript(([t, sess, hintSeen]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    if (hintSeen != null) localStorage.setItem('kf.captureHint', String(hintSeen))
    // Proof the field is focused INSIDE the tap: every focus() on the capture field logs its call stack,
    // whether the page still had transient user activation, and whether the click's task was still
    // running (a capture-phase click listener marks the task; a 0ms timer — the next task — unmarks it).
    window.__focusLog = []
    window.__clickTask = 0
    Error.stackTraceLimit = 200 // React's own frames would push the handler off V8's default 10
    const focus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (...a) {
      if (this.id === 'kf-capture-input') window.__focusLog.push({ stack: new Error().stack, activation: navigator.userActivation?.isActive ?? null, inClickTask: window.__clickTask > 0 })
      return focus.apply(this, a)
    }
    window.addEventListener('click', () => {
      window.__clickTask += 1
      setTimeout(() => (window.__clickTask = 0), 0)
    }, true)
    // Bubble phase on document: runs after React's root listener, still inside the same click dispatch.
    document.addEventListener('click', () => (window.__atClickEnd = document.activeElement?.id ?? null))
  }, [o.theme ?? 'day', JSON.stringify(session), o.hintSeen ?? null])
  const state = { rows: { tasks: [], projects: PROJECTS, domains: DOMAINS, app_settings: [SETTINGS], inbox_items: [PENDING], calendar_events: [] }, writes: [], heard: 'call mum tomorrow 5pm', transcribe: 'ok', transcribed: 0, parseCalls: [], parsedAt: 0, aiDelay: o.aiDelay ?? 0 }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/transcribe')) {
      state.transcribed += 1
      await sleep(250)
      return state.transcribe === 'fail' ? r.fulfill({ status: 500, json: { error: 'boom' } }) : r.fulfill({ json: { text: state.heard } })
    }
    if (url.pathname.startsWith('/functions/v1/parse-capture')) {
      const raw = req.postDataJSON()?.raw_text ?? ''
      state.parseCalls.push({ raw, at: Date.now() })
      await sleep(state.aiDelay)
      const hit = Object.entries(AI).find(([k]) => raw.includes(k))?.[1]
      state.parsedAt = Date.now()
      return r.fulfill({ json: { cleaned_text: raw, description: null, ...(hit ?? { kind: 'note', title: raw, confidence: 0.3 }) } })
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body, at: Date.now() })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90_000 })
  // The shell warms the capture bar once the page is idle (its chunk loads, it mounts closed); the
  // gesture checks start from that state. A busy machine can take a while to get there.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('CommandBar')), null, { timeout: 20_000 }).catch(() => {})
  await sleep(1200)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(env, loc, settle = 450) {
  if (!env.cdp) {
    await loc.click()
    await sleep(settle)
    return
  }
  const b = await loc.boundingBox()
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(settle)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const writes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const field = (page) => page.locator('#kf-capture-input')
const sheet = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('[data-capture-sheet]') })
const captureBtn = (page) => page.getByRole('button', { name: /^Capture — tap to type/ })
/** Pretend the on-screen keyboard is up (px): the kit sheet reads visualViewport like a real IME. */
const keyboard = (page, px) =>
  page.evaluate((h) => {
    const vv = window.visualViewport
    if (h) Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - h })
    else delete vv.height
    vv.dispatchEvent(new Event('resize'))
  }, px)
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(120)
  }
  return false
}
/** The gesture proof: the field was focused synchronously inside the click handler of the tap. */
async function focusProof(page, name, handler) {
  const log = await page.evaluate(() => ({ first: window.__focusLog[0] ?? null, atEnd: window.__atClickEnd ?? null, active: document.activeElement?.id ?? null }))
  const stack = log.first?.stack ?? ''
  check(`${name} the field has focus when the click finishes dispatching (same task as the tap)`, log.atEnd === 'kf-capture-input', JSON.stringify({ atEnd: log.atEnd, active: log.active }))
  check(`${name} its first focus() ran inside the click's task, with user activation, called from ${handler} → openCapture`,
    log.first && log.first.inClickTask && log.first.activation === true && stack.includes('openCapture') && stack.includes(handler),
    log.first
      ? `inClickTask=${log.first.inClickTask} activation=${log.first.activation} · ` +
          stack.split('\n').filter((l) => /openCapture|onClick|flushSync|CommandBar|executeDispatch/.test(l)).slice(0, 6).map((l) => l.trim().replace(/^at /, '').replace(/ \(.*\/(src|deps)\//, ' (').replace(/\?[^:)]*/, '')).join(' ← ')
      : 'no focus() on the field')
}
function basics(env, name) {
  check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
}

// ═════ Phone 390 ═════
for (const theme of ['day', 'night']) {
  // 1 · tap = type: the sheet, the keyboard's field focused inside the tap, the first-run hint.
  {
    const name = `phone-tap-${theme}`
    const env = await open('/today', { theme, hintSeen: theme === 'night' ? 3 : null })
    const { page } = env
    await tap(env, captureBtn(page), 500)
    check(`${name} centre tap → the capture sheet (a bottom sheet, field + camera + mic + send)`, (await sheet(page).count()) === 1 && (await sheet(page).getByRole('button', { name: 'Scan paper' }).count()) === 1 && (await sheet(page).getByRole('button', { name: 'Talk instead' }).count()) === 1 && (await sheet(page).getByRole('button', { name: 'Add' }).count()) === 1)
    await focusProof(page, name, 'onClick')
    const box = await sheet(page).boundingBox()
    check(`${name} the sheet sits at the bottom of the screen (not the old overlay at the top)`, box && Math.abs(box.y + box.height - 844) <= 2 && box.y > 400, JSON.stringify(box))
    check(`${name} first-run hint "Tap to type · hold to talk" ${theme === 'night' ? 'gone after 3 opens' : 'on a first open'}`, theme === 'night' ? (await page.locator('.kf-capture-hint').count()) === 0 : (await page.locator('.kf-capture-hint').innerText()).toUpperCase() === 'TAP TO TYPE · HOLD TO TALK')
    check(`${name} centre button keeps the mic glyph; its name says tap to type, hold to talk`, (await captureBtn(page).getAttribute('aria-label')).startsWith('Capture — tap to type, hold to talk'))
    await page.keyboard.type('Email Priya the slides tomorrow 9am #website')
    await keyboard(page, 300)
    await sleep(400)
    const kb = await sheet(page).boundingBox()
    check(`${name} keyboard up → the sheet rides on it (bottom at 844 − 300)`, kb && Math.abs(kb.y + kb.height - 544) <= 2, JSON.stringify(kb))
    const chips = (await sheet(page).locator('.kf-capture-chips .kf-chip').allInnerTexts()).map((t) => t.toUpperCase())
    check(`${name} parse chips: date (tomorrow 9) + project`, chips.length === 2 && chips[0].startsWith('TOMORROW · 9:00') && chips[1] === 'WEBSITE', JSON.stringify(chips))
    await shot(page, name)
    const w0 = env.state.writes.length
    await page.keyboard.press('Enter')
    await sleep(600)
    const t = writes(env.state, 'tasks', w0)
    check(`${name} Enter files it like the command bar: a task, title stripped, due tomorrow 09:00 Cairo, in Website`, t.length >= 1 && t.every((x) => x.id === t[0].id) && t[0].title === 'Email Priya the slides' && cairo(t[0].due_at) === `${TOMORROW} 09:00` && t[0].project_id === PROJECTS[0].id, JSON.stringify(t.map((x) => [x.title, x.due_at && cairo(x.due_at)])))
    const b = writes(env.state, 'calendar_events', w0)
    check(`${name} …a typed time is a calendar block: tomorrow 09:00–09:30 (capture-block)`, b.length === 1 && b[0].task_id === t[0].id && b[0].starts_at === t[0].due_at && cairo(b[0].ends_at) === `${TOMORROW} 09:30`, JSON.stringify(b.map((x) => [x.task_id === t[0]?.id, cairo(x.starts_at), cairo(x.ends_at)])))
    check(`${name} …and the sheet closes`, (await sheet(page).count()) === 0)
    await keyboard(page, 0)
    basics(env, name)
    await env.ctx.close()
  }
}

// 2 · Send button; an unstructured line goes to the Inbox ("→ Inbox" chip); a dismissed draft is kept.
{
  const name = 'phone-send'
  const env = await open('/inbox')
  const { page } = env
  await tap(env, captureBtn(page))
  check(`${name} Send is disabled while the field is empty`, await sheet(page).getByRole('button', { name: 'Add' }).isDisabled())
  await page.keyboard.type('ideas for the garden')
  check(`${name} "→ Inbox" chip for a line with no structure`, (await sheet(page).locator('.kf-capture-chips').innerText()).toUpperCase().includes('→ INBOX'))
  await page.keyboard.press('Escape')
  await sleep(500)
  await tap(env, captureBtn(page))
  check(`${name} dismissed and reopened → the draft is still there (kit sheet: dismissing never discards)`, (await field(page).inputValue()) === 'ideas for the garden')
  const w0 = env.state.writes.length
  await tap(env, sheet(page).getByRole('button', { name: 'Add' }), 600)
  const items = writes(env.state, 'inbox_items', w0)
  check(`${name} Send → one Inbox capture (captureText), sheet closed; the unsure AI read only annotates that same row`, items.length >= 1 && items.every((i) => i.id === items[0].id && i.raw_text === 'ideas for the garden' && i.status === 'pending') && writes(env.state, 'tasks', w0).length === 0 && (await sheet(page).count()) === 0, JSON.stringify(items.map((i) => [i.raw_text, i.status, i.confidence])))
  basics(env, name)
  await env.ctx.close()
}

// 3 · the mic in the sheet switches to voice: the voice sheet records, Stop & file transcribes + AI-files.
{
  const name = 'phone-mic'
  const env = await open('/today')
  const { page, state } = env
  await tap(env, captureBtn(page))
  await tap(env, sheet(page).getByRole('button', { name: 'Talk instead' }), 1500)
  const voice = page.locator('[role="dialog"][aria-label="Voice capture"]')
  check(`${name} mic → the capture sheet steps aside, the voice sheet is listening`, (await sheet(page).count()) === 0 && (await voice.getAttribute('data-voice-phase')) === 'recording' && (await voice.innerText()).toUpperCase().includes('LISTENING'), await voice.innerText().catch(() => ''))
  await shot(page, name)
  const w0 = state.writes.length
  // Stop & file is enabled once the mic is live (the fake device can be slow on a busy machine).
  await waitFor(() => voice.getByRole('button', { name: 'Stop & file' }).isEnabled().catch(() => false), 8000)
  await sleep(800)
  await tap(env, voice.getByRole('button', { name: 'Stop & file' }), 300)
  await waitFor(async () => writes(state, 'tasks', w0).length > 0)
  const t = writes(state, 'tasks', w0)
  check(`${name} Stop & file → transcribed (fake mic → real MediaRecorder blob) and AI-filed as a task + toast`, state.transcribed === 1 && t.length === 1 && t[0].title === 'Call mum' && (await toasts(page)).some((x) => x.startsWith('Added')), JSON.stringify({ transcribed: state.transcribed, tasks: t.map((x) => x.title), toasts: await toasts(page) }))
  basics(env, name)
  await env.ctx.close()
}

// 4 · hold-to-talk still records; release sends; the tap path doesn't fire.
{
  const name = 'phone-hold'
  const env = await open('/today')
  const { page, cdp, state } = env
  const b = await captureBtn(page).boundingBox()
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await touch(cdp, 'touchStart', [at])
  await sleep(1200)
  check(`${name} hold ≥ 400ms → recording (pill + grown button)`, (await page.locator('.kf-rec-pill').count()) === 1 && (await captureBtn(page).getAttribute('data-phase')) === 'recording')
  await shot(page, name)
  const w0 = state.writes.length
  await touch(cdp, 'touchEnd', [])
  await waitFor(async () => writes(state, 'tasks', w0).length > 0)
  check(`${name} release → sent, transcribed, filed`, state.transcribed === 1 && writes(state, 'tasks', w0).some((x) => x.title === 'Call mum'), JSON.stringify(writes(state, 'tasks', w0).map((x) => x.title)))
  check(`${name} the click that ends a hold does not open the capture sheet`, (await sheet(page).count()) === 0 && (await field(page).count()) === 0)
  // slide up onto the lock still goes hands-free
  await touch(cdp, 'touchStart', [at])
  await sleep(1000)
  for (let i = 1; i <= 8; i++) {
    await touch(cdp, 'touchMove', [{ x: at.x, y: at.y - i * 15 }])
    await sleep(30)
  }
  await touch(cdp, 'touchEnd', [])
  await sleep(300)
  check(`${name} slide up onto the lock → hands-free bar`, (await page.getByRole('group', { name: 'Recording, hands-free' }).count()) === 1)
  await tap(env, page.getByRole('button', { name: 'Cancel recording' }))
  basics(env, name)
  await env.ctx.close()
}

// 5 · offline: the voice path still keeps the take (Save to Inbox untranscribed), as before.
{
  const name = 'phone-offline-voice'
  const env = await open('/today')
  const { page, ctx } = env
  await tap(env, captureBtn(page))
  await tap(env, sheet(page).getByRole('button', { name: 'Talk instead' }), 1500)
  await ctx.setOffline(true)
  env.state.transcribe = 'fail' // Playwright's routes still answer offline; a real offline fetch fails
  const voice = page.locator('[role="dialog"][aria-label="Voice capture"]')
  // Stop & file is enabled once the mic is live (the fake device can be slow on a busy machine).
  await waitFor(() => voice.getByRole('button', { name: 'Stop & file' }).isEnabled().catch(() => false), 8000)
  await sleep(800)
  await tap(env, voice.getByRole('button', { name: 'Stop & file' }), 300)
  await waitFor(async () => (await voice.getAttribute('data-voice-phase').catch(() => null)) === 'kept')
  check(`${name} offline → the recording is kept ("You're offline…", Save to Inbox untranscribed)`, (await voice.getAttribute('data-voice-phase').catch(() => null)) === 'kept' && (await voice.innerText()).includes('You’re offline') && (await voice.getByRole('button', { name: 'Save to Inbox untranscribed' }).count()) === 1, await voice.innerText({ timeout: 2000 }).catch(() => 'no voice sheet'))
  await shot(page, name)
  await tap(env, voice.getByRole('button', { name: 'Save to Inbox untranscribed' }))
  check(`${name} Save → "Saved to Inbox — not transcribed yet." (queued in the outbox)`, (await toasts(page)).includes('Saved to Inbox — not transcribed yet.'), JSON.stringify(await toasts(page)))
  await ctx.setOffline(false)
  basics({ errors: env.errors.filter((e) => !/fetch|network/i.test(e)) }, name)
  await env.ctx.close()
}

// 6 · other tap openers reach the same synchronous path (Today's empty state on a phone).
{
  const name = 'phone-empty-state'
  const env = await open('/today')
  const { page } = env
  const add = page.getByRole('button', { name: 'Add your first three things' })
  if (await add.count()) {
    await tap(env, add)
    await focusProof(page, name, 'openCapture')
  } else check(`${name} (no empty state on this data)`, true, 'skipped')
  basics(env, name)
  await env.ctx.close()
}

// ═════ Desktop 1280 ═════
for (const theme of ['day', 'night']) {
  const name = `desktop-${theme}`
  const env = await open('/today', { view: desktop, theme })
  const { page, state } = env
  const cta = page.locator('main .kf-button--cta', { hasText: /^Capture$/ }) // the page-header CTA (the sidebar has its own Capture row)
  check(`${name} Today's header CTA is "Capture" (no "Voice capture")`, (await cta.count()) === 1 && (await page.getByRole('button', { name: 'Voice capture' }).count()) === 0)
  await cta.click()
  await sleep(300)
  check(`${name} Capture → the command bar, cursor in the field`, (await field(page).count()) === 1 && (await page.evaluate(() => document.activeElement?.id)) === 'kf-capture-input')
  await focusProof(page, name, 'openCapture')
  const dictate = page.getByRole('button', { name: 'Dictate' })
  check(`${name} a mic toggle in the bar (+ the camera keeps its place)`, (await dictate.count()) === 1 && (await page.getByRole('button', { name: 'Scan paper' }).count()) === 1)
  await page.keyboard.type('Call the bank ')
  await dictate.click()
  await sleep(1300)
  const stop = page.getByRole('button', { name: 'Stop dictating' })
  check(`${name} mic on → pressed, "Listening" in the hint row`, (await stop.getAttribute('aria-pressed')) === 'true' && (await page.getByText('Listening — click stop when you’re done').count()) === 1)
  await shot(page, `${name}-listening`)
  state.heard = 'tomorrow 3pm about the mortgage'
  await stop.click()
  await waitFor(async () => (await field(page).inputValue()).includes('mortgage'))
  check(`${name} mic off → transcribed into the field after what was typed (for review, not filed)`, (await field(page).inputValue()) === 'Call the bank tomorrow 3pm about the mortgage' && writes(state, 'tasks').length === 0, await field(page).inputValue())
  check(`${name} …focus back in the field`, (await page.evaluate(() => document.activeElement?.id)) === 'kf-capture-input')
  await shot(page, name)
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(500)
  const t = writes(state, 'tasks', w0)
  check(`${name} Enter files it: a task due tomorrow 15:00 Cairo`, t.length >= 1 && t.every((x) => x.id === t[0].id) && t[0].title === 'Call the bank about the mortgage' && cairo(t[0].due_at) === `${TOMORROW} 15:00`, JSON.stringify(t.map((x) => [x.title, x.due_at && cairo(x.due_at)])))
  const b = writes(state, 'calendar_events', w0)
  check(`${name} …and on the calendar: a 15:00–15:30 block`, b.length === 1 && b[0].task_id === t[0].id && cairo(b[0].starts_at) === `${TOMORROW} 15:00` && cairo(b[0].ends_at) === `${TOMORROW} 15:30`, JSON.stringify(b.map((x) => [cairo(x.starts_at), cairo(x.ends_at)])))
  basics(env, name)
  await env.ctx.close()
}

// Tasks + Inbox headers carry the same Capture.
for (const route of ['/tasks', '/inbox']) {
  const name = `desktop-header${route.replace('/', '-')}`
  const env = await open(route, { view: desktop })
  const { page } = env
  const cta = page.locator('main .kf-button--cta', { hasText: /^Capture$/ }) // the page-header CTA (the sidebar has its own Capture row)
  check(`${name} header CTA "Capture"`, (await cta.count()) === 1 && (await page.getByRole('button', { name: 'Voice capture' }).count()) === 0)
  await cta.click()
  await sleep(300)
  check(`${name} → the bar, focused`, (await page.evaluate(() => document.activeElement?.id)) === 'kf-capture-input')
  await shot(page, name)
  basics(env, name)
  await env.ctx.close()
}

// A dictation that can't be transcribed is never lost: the voice sheet keeps it; Try again → the field.
{
  const name = 'desktop-dictate-kept'
  const env = await open('/today', { view: desktop })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.getByRole('button', { name: 'Dictate' }).click()
  await sleep(1200)
  state.transcribe = 'fail'
  await page.getByRole('button', { name: 'Stop dictating' }).click()
  const voice = page.locator('[role="dialog"][aria-label="Voice capture"]')
  await waitFor(async () => (await voice.getAttribute('data-voice-phase').catch(() => null)) === 'kept')
  check(`${name} transcribe fails → the voice sheet keeps the take (Try again · Save · Discard), bar still open`, (await voice.getAttribute('data-voice-phase')) === 'kept' && (await field(page).count()) === 1)
  await shot(page, name)
  state.transcribe = 'ok'
  state.heard = 'water the plants'
  await voice.getByRole('button', { name: 'Try again' }).click()
  await waitFor(async () => (await field(page).inputValue()) === 'water the plants')
  check(`${name} Try again → the words land in the field (not AI-filed behind your back)`, (await field(page).inputValue()) === 'water the plants' && (await voice.count()) === 0 && writes(state, 'tasks').length === 0 && writes(state, 'inbox_items').length === 0)
  basics(env, name)
  await env.ctx.close()
}

// ═════ Phase 2 (Kai 2026-10-07): "every property is extracted… let the AI understand the intent and decide" ═════
// The AI call is mocked (AI table above) and answers 700ms late, to prove the row never waits on it.
const tomorrow3pm = (t) => cairo(t.due_at) === `${TOMORROW} 15:00`
{
  const name = 'ai-fill-desktop'
  const env = await open('/today', { view: desktop, aiDelay: 700 })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.keyboard.type('Call the bank asap tomorrow 3pm, bring the payslips')
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(250)
  // (the outbox may send the create and the block's scheduled_start as one row or two: read them all)
  const first = writes(state, 'tasks', w0)
  check(`${name} Enter → the task is written at once from the local parse, before the AI answers`, first.length >= 1 && first.every((t) => t.id === first[0].id && t.priority === null) && tomorrow3pm(first[0]) && state.parseCalls.length === 1 && state.parsedAt === 0, JSON.stringify(first.map((t) => [t.title, t.priority])))
  await waitFor(async () => writes(state, 'tasks', w0).some((t) => t.priority === 1))
  const filled = writes(state, 'tasks', w0).find((t) => t.priority === 1)
  check(`${name} …then the AI fills only the empties: priority 1 from "asap", the details as notes, a tidied title; the typed date stands`, filled && filled.id === first[0].id && filled.priority === 1 && filled.notes === 'Bring the payslips' && filled.title === 'Call the bank' && tomorrow3pm(filled), JSON.stringify(filled && [filled.title, filled.priority, filled.notes]))
  check(`${name} "✦ Filled by AI: priority, notes" with Undo`, (await toasts(page)).includes('✦ Filled by AI: priority, notes'), JSON.stringify(await toasts(page)))
  await shot(page, name)
  const w1 = state.writes.length
  await page.locator('.kf-toast', { hasText: '✦ Filled by AI' }).getByRole('button', { name: 'Undo' }).click()
  await sleep(300)
  const undone = writes(state, 'tasks', w1).at(-1)
  check(`${name} Undo → back to what was typed (priority, notes, title), date untouched`, undone && undone.id === first[0].id && undone.priority === null && undone.notes === null && undone.title === first[0].title && tomorrow3pm(undone), JSON.stringify(undone && [undone.title, undone.priority, undone.notes]))
  basics(env, name)
  await env.ctx.close()
}
{
  const name = 'ai-explicit-wins'
  const env = await open('/today', { view: desktop })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.keyboard.type('Call the bank asap tomorrow 3pm ! 30m')
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  // No AI delay here: the outbox may send the create and the fill as one row, so read the last one.
  await waitFor(async () => writes(state, 'tasks', w0).some((x) => x.notes))
  const t = writes(state, 'tasks', w0)
  const last = t[t.length - 1]
  check(`${name} a typed "!" and "30m" beat the AI (it read priority 1): priority 3, 30m kept; it only adds the notes`, t.length >= 1 && last.priority === 3 && last.duration_min === 30 && last.notes === 'Bring the payslips' && (await toasts(page)).includes('✦ Filled by AI: notes'), JSON.stringify(t.map((x) => [x.priority, x.duration_min, x.notes])))
  basics(env, name)
  await env.ctx.close()
}
{
  const name = 'ai-files-plain-line-phone'
  const env = await open('/today', { aiDelay: 500 })
  const { page, state } = env
  await tap(env, captureBtn(page))
  await page.keyboard.type('renew the car licence, urgent')
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(200)
  const inbox = writes(state, 'inbox_items', w0)
  check(`${name} a plain line lands in the Inbox at once (no AI wait)`, inbox.length === 1 && inbox[0].status === 'pending' && state.parsedAt === 0, JSON.stringify(inbox.map((i) => i.status)))
  await waitFor(async () => writes(state, 'tasks', w0).length >= 1)
  await sleep(300)
  const t = writes(state, 'tasks', w0)
  const after = writes(state, 'inbox_items', w0)
  check(`${name} …the AI decides it's a task: filed with priority 1 from "urgent", the Inbox row marked filed`, t.length === 1 && t[0].title === 'Renew the car licence' && t[0].priority === 1 && after.some((i) => i.id === inbox[0].id && i.status === 'filed' && i.filed_task_id === t[0].id), JSON.stringify({ t: t.map((x) => [x.title, x.priority]), inbox: after.map((i) => i.status) }))
  check(`${name} "✦ Filed by AI: “Renew the car licence”" with Undo`, (await toasts(page)).some((x) => x === '✦ Filed by AI: “Renew the car licence”'), JSON.stringify(await toasts(page)))
  await shot(page, name)
  basics(env, name)
  await env.ctx.close()
}
{
  const name = 'ai-offline'
  const env = await open('/today', { view: desktop })
  const { page, state, ctx } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await ctx.setOffline(true)
  await page.keyboard.type('Call the bank asap tomorrow 3pm')
  await page.keyboard.press('Enter')
  await sleep(800)
  check(`${name} offline: no AI call, no AI toast — the local parse stands`, state.parseCalls.length === 0 && !(await toasts(page)).some((x) => x.startsWith('✦')), JSON.stringify(await toasts(page)))
  const w0 = state.writes.length
  await ctx.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => writes(state, 'tasks', w0).length >= 1, 8000)
  const t = writes(state, 'tasks', w0)
  check(`${name} back online → the queued task syncs as typed (nothing lost)`, t.length >= 1 && t[0].title === 'Call the bank asap' && tomorrow3pm(t[0]) && t[0].priority === null, JSON.stringify(t.map((x) => [x.title, x.priority])))
  basics({ errors: env.errors.filter((e) => !/fetch|network/i.test(e)) }, name)
  await env.ctx.close()
}

// ═════ capture-block (Kai 2026-10-07, the 4am complaint): a capture given a TIME lands on the calendar ═════
{
  const name = 'block-4am'
  const env = await open('/calendar', { view: desktop })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.keyboard.type('crypto session 4am')
  check(`${name} the chip shows the typed time`, /· 4:00\sAM$/.test((await page.locator('.kf-overlay-card').innerText()).split('\n').find((l) => l.toUpperCase().includes('4:00')) ?? ''), await page.locator('.kf-overlay-card').innerText())
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(700)
  const t = writes(state, 'tasks', w0)
  const b = writes(state, 'calendar_events', w0)
  const at4 = t[0] && cairo(t[0].due_at)
  check(`${name} "crypto session 4am" → a task due 04:00 AND a 04:00–04:30 block on the calendar`, t.length >= 1 && at4?.endsWith('04:00') && b.length === 1 && b[0].task_id === t[0].id && b[0].type === 'task' && b[0].starts_at === t[0].due_at && cairo(b[0].ends_at).endsWith('04:30'), JSON.stringify({ due: at4, blocks: b.map((x) => [cairo(x.starts_at), cairo(x.ends_at)]) }))
  check(`${name} …the task row carries the block (scheduled_start)`, t.some((x) => x.scheduled_start === b[0]?.starts_at), JSON.stringify(t.map((x) => x.scheduled_start)))
  await sleep(300)
  const day = at4?.slice(0, 10)
  const col = page.locator(`td.fc-timegrid-col[data-date="${day}"]`)
  if (await col.count()) {
    const ev = col.locator('.fc-event', { hasText: 'crypto session' })
    check(`${name} …and the calendar draws it in ${day}'s column`, (await ev.count()) === 1)
    await ev.scrollIntoViewIfNeeded().catch(() => {})
  } else check(`${name} …(${day} is outside the grid's current range — the write above is the proof)`, true, 'skipped')
  await shot(page, name)
  basics(env, name)
  await env.ctx.close()
}
{
  const name = 'block-date-alone'
  const env = await open('/today', { view: desktop })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.keyboard.type('call Omar tomorrow')
  const chip = (await page.locator('.kf-overlay-card').innerText()).split('\n').map((l) => l.trim()).find((l) => /^tomorrow/i.test(l))
  check(`${name} a date alone: the chip says just "Tomorrow" (no clock — no block coming)`, chip?.toUpperCase() === 'TOMORROW', chip)
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(700)
  const t = writes(state, 'tasks', w0)
  check(`${name} "call Omar tomorrow" → a task due tomorrow, nothing on the calendar`, t.length >= 1 && cairo(t[0].due_at).startsWith(TOMORROW) && writes(state, 'calendar_events', w0).length === 0, JSON.stringify({ due: t[0] && cairo(t[0].due_at), blocks: writes(state, 'calendar_events', w0).length }))
  basics(env, name)
  await env.ctx.close()
}
{
  const name = 'block-ai-time'
  const env = await open('/today', { view: desktop, aiDelay: 300 })
  const { page, state } = env
  await page.keyboard.press('Control+k')
  await sleep(300)
  await page.keyboard.type('crypto session before sunrise !')
  const w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(150)
  check(`${name} no typed time: the task is written with no block`, writes(state, 'tasks', w0).length >= 1 && writes(state, 'calendar_events', w0).length === 0)
  await waitFor(async () => writes(state, 'calendar_events', w0).length >= 1)
  const b = writes(state, 'calendar_events', w0)
  const t = writes(state, 'tasks', w0)
  check(`${name} the AI reads a time (has_time) → it fills the date AND puts a 05:00–05:30 block on the calendar`, b.length === 1 && b[0].task_id === t[0].id && cairo(b[0].starts_at) === `${TOMORROW} 05:00` && cairo(b[0].ends_at) === `${TOMORROW} 05:30` && (await toasts(page)).includes('✦ Filled by AI: date'), JSON.stringify({ blocks: b.map((x) => [cairo(x.starts_at), cairo(x.ends_at)]), toasts: await toasts(page) }))
  await shot(page, name)
  const w1 = state.writes.length
  await page.locator('.kf-toast', { hasText: '✦ Filled by AI' }).getByRole('button', { name: 'Undo' }).click()
  await sleep(500)
  const gone = writes(state, 'calendar_events', w1)
  const back = writes(state, 'tasks', w1).at(-1)
  check(`${name} Undo → the block it made comes off the calendar and the date goes back to none`, gone.some((x) => x.id === b[0].id && x.deleted_at) && back && back.due_at === null && back.priority === 3, JSON.stringify({ gone: gone.map((x) => !!x.deleted_at), due: back?.due_at, priority: back?.priority }))
  basics(env, name)
  await env.ctx.close()
}

// ── Side by side: design 11a | this build (phone sheet, keyboard up). ──
if (DESIGN && fs.existsSync(DESIGN)) {
  const page = await browser.newPage({ viewport: { width: 1260, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff;align-items:flex-start"><div><div>design 11a (Paper Capture)</div><img src="${uri(DESIGN)}" style="width:820px"></div><div><div>build phone-tap-day</div><img src="${uri(path.join(OUT, 'phone-tap-day.png'))}" style="width:390px"></div></body>`)
  await page.screenshot({ path: path.join(OUT, 'side-11a.png'), fullPage: true })
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
