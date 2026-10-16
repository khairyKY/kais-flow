// Sotto's pill on every voice surface (Kai 2026-10-16: "include Sotto in Kai's Flow… stuff powered by
// Sotto"), on the REAL app against a MOCKED backend (the resurface-chat recipe): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, and Playwright answers
// every REST and edge-function call. `transcribe` and `parse-capture` can be held open (a gate) so each
// pill state stays on screen long enough to check and photograph. The mic is a fake MediaStream: an
// oscillator whose loudness the harness turns (window.__micGain), so "the bars follow the mic" is a
// measurement, not a guess. Clock: Wed 7 Oct 2026, 10:00 Cairo.
//   sheet   — journal Talk it out: listening (✕, tap to finish, bars on the mic) → transcribing → done;
//             ✕ discards; a failed transcription keeps the take (error pill, ↻ retries it)
//   AI      — the take that gets filed by the AI: transcribing → polishing → done
//             (desktop: Today's Voice capture · phone: hold-to-talk → hands-free → tap the pill)
//   ⌘K      — desktop dictation into the field: listening → transcribing → done, words in the field
//   still   — reduced motion: every state is one calm, unchanging frame
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5297'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const NOW = new Date(Date.UTC(2026, 9, 7, 7, 0))
const DAY0 = '2026-08-01T06:00:00.000Z'
const SETTINGS = { user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const HEARD = 'call the bank about the card'
const PARSE = { kind: 'note', cleaned_text: HEARD, title: HEARD, confidence: 0.4 }
const CORS = { 'access-control-allow-origin': '*' }

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }

const deferred = () => {
  let open
  const promise = new Promise((r) => (open = r))
  return { promise, open }
}

async function open(theme, view, route, still) {
  const ctx = await browser.newContext({
    ...view, deviceScaleFactor: 2, timezoneId: 'Africa/Cairo', locale: 'en-US', permissions: ['microphone'], reducedMotion: still ? 'reduce' : 'no-preference',
  })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
    localStorage.setItem('kf.captureHint', '9')
    // The fake mic: a 220 Hz tone at window.__micGain, live (the harness turns it while the pill listens).
    window.__micGain = 0.25
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (!c || !c.audio) return real(c)
      const ac = new AudioContext()
      const osc = ac.createOscillator()
      osc.frequency.value = 220
      const gain = ac.createGain()
      gain.gain.value = window.__micGain
      const dst = ac.createMediaStreamDestination()
      osc.connect(gain).connect(dst)
      osc.start()
      await ac.resume()
      window.__setMic = (g) => gain.gain.setValueAtTime(g, ac.currentTime)
      return dst.stream
    }
  }, [theme, JSON.stringify(session), UID])
  const state = {
    rows: { app_settings: [{ ...SETTINGS }], tasks: [], inbox_items: [], journal_entries: [] },
    writes: [], fn: [], gate: { transcribe: null, parse: null }, failTranscribe: 0,
  }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (p === '/functions/v1/transcribe') {
      state.fn.push({ name: 'transcribe', size: req.postDataBuffer()?.length ?? 0 })
      if (state.gate.transcribe) await state.gate.transcribe.promise
      if (state.failTranscribe > 0) {
        state.failTranscribe--
        return r.fulfill({ status: 500, json: { error: 'upstream' }, headers: CORS })
      }
      return r.fulfill({ json: { text: HEARD }, headers: CORS })
    }
    if (p === '/functions/v1/parse-capture') {
      state.fn.push({ name: 'parse-capture' })
      if (state.gate.parse) await state.gate.parse.promise
      return r.fulfill({ json: PARSE, headers: CORS })
    }
    if (p.startsWith('/functions/v1/')) {
      state.fn.push({ name: p.slice(14) })
      return r.fulfill({ json: {}, headers: CORS })
    }
    const table = p.replace('/rest/v1/', '')
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try {
        body = JSON.parse(req.postData() ?? '[]')
      } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        const full = { created_at: DAY0, ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://127.0.0.1:9/") && !m.text().includes('Failed to load resource') && errors.push(`console: ${m.text()}`))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

async function until(ok, ms = 6000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(60)) if (await ok()) return true
  return ok()
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function center(loc) {
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
async function press(cdp, loc) {
  if (!cdp) return loc.click()
  const p = await center(loc)
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(250)
}
const shot = (page, name, loc) => (loc ? loc.screenshot({ path: path.join(OUT, `${name}.png`) }) : page.screenshot({ path: path.join(OUT, `${name}.png`) }))
const pillIn = (scope) => scope.locator('.sotto-pill')
const pillState = (scope) => pillIn(scope).first().getAttribute('data-sotto').catch(() => null)
const isState = (scope, s) => until(async () => (await pillState(scope)) === s)
/** The tallest run of Sotto-lilac pixels in the pill's canvas, in CSS px — how tall the bars stand. */
const barsTall = (scope) =>
  pillIn(scope).first().locator('canvas').evaluate((c) => {
    const g = c.getContext('2d')
    const { width: W, height: H } = c
    const d = g.getImageData(0, 0, W, H).data
    let best = 0
    for (let x = 0; x < W * 0.7; x++) {
      let run = 0
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4
        if (d[i + 3] > 200 && d[i + 2] - d[i + 1] > 25 && d[i] - d[i + 1] > 5) best = Math.max(best, ++run)
        else run = 0
      }
    }
    return best / (W / parseFloat(c.style.width))
  })
async function tallest(scope, ms = 900) {
  let best = 0
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(60)) best = Math.max(best, await barsTall(scope))
  return best
}
const frame = (scope) => pillIn(scope).first().locator('canvas').evaluate((c) => c.toDataURL())
async function stays(scope) {
  const a = await frame(scope)
  await sleep(450)
  return a === (await frame(scope))
}
const powered = (scope) => scope.getByText('Powered by Sotto', { exact: true }).count()
async function basics(s, name, width) {
  const wide = await s.page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at ${width}`, wide <= width, wide)
  check(`${name} no page or console errors`, s.errors.length === 0, s.errors.slice(0, 3).join(' | '))
}
const tag = (still) => (still ? '-still' : '')

// ── the voice sheet through the journal's Talk it out (words come back, no AI) ──
async function journalSheet(name, view, theme, width, still) {
  const s = await open(theme, view, '/journal', still)
  const { page, cdp, state } = s
  const talk = page.getByRole('button', { name: view.hasTouch ? '🎤 Talk' : '🎤 Talk it out', exact: true })
  const sheet = page.locator('[role="dialog"][aria-label="Voice capture"]')
  await press(cdp, talk)
  check(`${name} sheet: opens listening on Sotto's pill`, await isState(sheet, 'listening'))
  const stop = sheet.getByRole('button', { name: 'Stop & file' })
  check(`${name} sheet: the mic comes on (Stop & file ready)`, await until(() => stop.isEnabled().catch(() => false)))
  check(`${name} sheet: ✕ on the pill, tap target on its body`, (await sheet.getByRole('button', { name: 'Discard the take' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Finish talking' }).count()) === 1)
  check(`${name} sheet: Powered by Sotto`, (await powered(sheet)) === 1)
  if (still) {
    check(`${name} sheet listening: a still frame (reduced motion)`, await stays(sheet))
  } else {
    await page.evaluate(() => window.__setMic(0))
    await sleep(300)
    const quiet = await tallest(sheet)
    await page.evaluate(() => window.__setMic(0.6))
    await sleep(300)
    const loud = await tallest(sheet)
    check(`${name} sheet listening: the bars follow the mic (quiet ${quiet.toFixed(1)}px → loud ${loud.toFixed(1)}px)`, loud > quiet + 6 && quiet > 0, `${quiet} → ${loud}`)
    await page.evaluate(() => window.__setMic(0.25))
  }
  await sleep(300)
  await shot(page, `${name}${tag(still)}-sheet-1-listening`)
  // Tap the pill → transcribing (held open)
  state.gate.transcribe = deferred()
  await press(cdp, sheet.getByRole('button', { name: 'Finish talking' }))
  check(`${name} sheet: tapping the pill finishes → transcribing`, await isState(sheet, 'transcribing'))
  check(`${name} sheet: the take went to transcribe (Groq path)`, await until(() => state.fn.some((f) => f.name === 'transcribe' && f.size > 0)))
  await sleep(700)
  if (still) check(`${name} sheet transcribing: a still frame`, await stays(sheet))
  await shot(page, `${name}${tag(still)}-sheet-2-transcribing`, sheet)
  state.gate.transcribe.open()
  state.gate.transcribe = null
  check(`${name} sheet: words back → done (the tick)`, await isState(sheet, 'done', 3000))
  await sleep(still ? 50 : 280)
  await shot(page, `${name}${tag(still)}-sheet-3-done`, sheet)
  check(`${name} sheet: then the sheet goes`, await until(async () => (await sheet.count()) === 0, 4000))
  check(`${name} sheet: the words joined the journal`, state.writes.some((w) => w.table === 'journal_entries' && (w.row.transcript ?? '').includes(HEARD)))
  check(`${name} sheet: no AI filing for journal words`, !state.fn.some((f) => f.name === 'parse-capture'))

  // ✕ discards a live take: no transcription, sheet gone
  const before = state.fn.filter((f) => f.name === 'transcribe').length
  await press(cdp, talk)
  await until(() => stop.isEnabled().catch(() => false))
  await press(cdp, sheet.getByRole('button', { name: 'Discard the take' }))
  check(`${name} sheet: ✕ cancels — sheet gone, nothing transcribed`, await until(async () => (await sheet.count()) === 0) && state.fn.filter((f) => f.name === 'transcribe').length === before)

  // A failed transcription keeps the take: the error pill, ↻ retries the same take
  state.failTranscribe = 1
  await press(cdp, talk)
  await until(() => stop.isEnabled().catch(() => false))
  await sleep(600)
  await press(cdp, stop)
  check(`${name} kept: transcription failed → error pill, the take kept`, await isState(sheet, 'error') && (await sheet.getAttribute('data-voice-phase')) === 'kept')
  check(`${name} kept: ↻ on the pill + Try again / Save to Inbox / Discard`, (await sheet.getByRole('button', { name: 'Retry the take' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Try again' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Save to Inbox untranscribed' }).count()) === 1)
  check(`${name} kept: no ✕ (a kept take only leaves through its buttons)`, (await sheet.getByRole('button', { name: 'Discard the take' }).count()) === 0)
  await sleep(300)
  if (still) check(`${name} kept: a still frame`, await stays(sheet))
  await shot(page, `${name}${tag(still)}-sheet-4-kept`, sheet)
  const sent = state.fn.filter((f) => f.name === 'transcribe')
  await press(cdp, sheet.getByRole('button', { name: 'Retry the take' }))
  check(`${name} kept: ↻ sends the same take again → done → gone`, await until(async () => (await sheet.count()) === 0, 6000) && state.fn.filter((f) => f.name === 'transcribe').at(-1)?.size === sent.at(-1)?.size)
  await basics(s, `${name}${tag(still)} journal`, width)
  await s.ctx.close()
}

// ── the AI path: desktop Today's Voice capture · phone hold-to-talk → hands-free → tap the pill ──
async function aiSheet(name, view, theme, width, still) {
  const s = await open(theme, view, '/today', still)
  const { page, cdp, state } = s
  const sheet = page.locator('[role="dialog"][aria-label="Voice capture"]')
  if (view.hasTouch) {
    const btn = page.locator('.kf-capture')
    const p = await center(btn)
    await touch(cdp, 'touchStart', [p])
    const recPill = page.locator('.kf-rec-pill')
    check(`${name} hold: the recording pill is Sotto's, listening`, await isState(recPill, 'listening'))
    await sleep(900)
    if (still) check(`${name} hold: a still frame`, await stays(recPill))
    await shot(page, `${name}${tag(still)}-hold-1-pill`)
    for (let dy = 20; dy <= 120; dy += 20) {
      await touch(cdp, 'touchMove', [{ x: p.x, y: p.y - dy }])
      await sleep(30)
    }
    await touch(cdp, 'touchEnd', [])
    const locked = page.locator('.kf-rec-locked')
    check(`${name} hands-free: Sotto's pill in the bar + Powered by Sotto`, await isState(locked, 'listening') && (await powered(locked)) === 1)
    await sleep(600)
    await shot(page, `${name}${tag(still)}-hold-2-handsfree`)
    state.gate.transcribe = deferred()
    state.gate.parse = deferred()
    await press(cdp, locked.getByRole('button', { name: 'Finish talking' }))
  } else {
    await page.getByRole('button', { name: 'Voice capture', exact: true }).click()
    check(`${name} Today mic: the sheet listens on Sotto's pill`, await isState(sheet, 'listening'))
    await until(() => sheet.getByRole('button', { name: 'Stop & file' }).isEnabled().catch(() => false))
    await sleep(600)
    state.gate.transcribe = deferred()
    state.gate.parse = deferred()
    await sheet.getByRole('button', { name: 'Finish talking' }).click()
  }
  check(`${name} AI: transcribing`, await isState(sheet, 'transcribing'))
  await sleep(600)
  await shot(page, `${name}${tag(still)}-ai-1-transcribing`, sheet)
  state.gate.transcribe.open()
  check(`${name} AI: polishing while the AI files it (parse-capture)`, await isState(sheet, 'polishing') && (await until(() => state.fn.some((f) => f.name === 'parse-capture'))))
  await sleep(900)
  if (still) check(`${name} polishing: a still frame`, await stays(sheet))
  await shot(page, `${name}${tag(still)}-ai-2-polishing`, sheet)
  if (!view.hasTouch) await shot(page, `${name}${tag(still)}-ai-2-polishing-page`)
  state.gate.parse.open()
  check(`${name} AI: done`, await isState(sheet, 'done', 3000))
  await sleep(still ? 50 : 280)
  await shot(page, `${name}${tag(still)}-ai-3-done`, sheet)
  check(`${name} AI: filed to the Inbox, sheet gone`, await until(async () => (await sheet.count()) === 0, 4000) && state.writes.some((w) => w.table === 'inbox_items' && w.row.raw_text === HEARD && w.row.kind === 'voice'))
  await basics(s, `${name}${tag(still)} AI`, width)
  await s.ctx.close()
}

// ── desktop ⌘K: dictation into the field ──
async function commandBar(name, theme, still) {
  const s = await open(theme, DESKTOP, '/today', still)
  const { page, state } = s
  await page.keyboard.press('Control+k')
  const card = page.locator('.kf-overlay-card')
  await card.waitFor({ timeout: 5000 }).catch(() => {})
  await page.getByRole('button', { name: 'Dictate', exact: true }).click()
  check(`${name} ⌘K: dictating shows Sotto's pill + Powered by Sotto`, await isState(card, 'listening') && (await powered(card)) === 1)
  check(`${name} ⌘K: the row still says what the mic is doing`, (await card.getByText('Listening — click stop when you’re done').count()) === 1)
  await sleep(900)
  await shot(page, `${name}${tag(still)}-cmdk-1-listening`)
  state.gate.transcribe = deferred()
  await card.getByRole('button', { name: 'Finish talking' }).click()
  check(`${name} ⌘K: tapping the pill stops it → transcribing`, await isState(card, 'transcribing'))
  await sleep(600)
  await shot(page, `${name}${tag(still)}-cmdk-2-transcribing`, card)
  state.gate.transcribe.open()
  check(`${name} ⌘K: done, the words in the field`, (await isState(card, 'done', 3000)) && (await page.locator('#' + (await page.locator('input[aria-label="Capture"]').getAttribute('id'))).inputValue()) === HEARD)
  await sleep(still ? 50 : 280)
  await shot(page, `${name}${tag(still)}-cmdk-3-done`, card)
  check(`${name} ⌘K: then the row is the bar's own again`, await until(async () => (await pillIn(card).count()) === 0, 3000))
  // ✕ drops a dictation
  await page.getByRole('button', { name: 'Dictate', exact: true }).click()
  await isState(card, 'listening')
  await sleep(500)
  const n = state.fn.filter((f) => f.name === 'transcribe').length
  await card.getByRole('button', { name: 'Discard the take' }).click()
  check(`${name} ⌘K: ✕ drops the take`, await until(async () => (await pillIn(card).count()) === 0) && state.fn.filter((f) => f.name === 'transcribe').length === n)
  await basics(s, `${name}${tag(still)} ⌘K`, 1280)
  await s.ctx.close()
}

for (const still of [false, true]) {
  for (const [label, view, width] of [['phone', PHONE, 390], ['desk', DESKTOP, 1280]]) {
    for (const theme of ['day', 'night']) {
      const name = `${label}-${theme}`
      if (ONLY && !ONLY.has(name) && !ONLY.has(label) && !ONLY.has(still ? 'still' : 'live')) continue
      await journalSheet(name, view, theme, width, still)
      await aiSheet(name, view, theme, width, still)
      if (label === 'desk') await commandBar(name, theme, still)
    }
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
