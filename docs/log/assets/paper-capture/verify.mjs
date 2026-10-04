// Paper capture (Paper Capture.dc.html 11a–11o) on the REAL app, signed in against a MOCKED backend —
// the task-sheet recipe: the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens
// there), a made-up session sits in localStorage, and Playwright answers every call. Storage uploads are
// kept and served back on their signed URLs; `capture-image` answers from the scenario below (never Groq).
// The page photos are drawn here (lined paper, Caveat), so every line's box is known.
//   node verify.mjs <outDir> [baseUrl] [designDir] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5254'
const DESIGN = process.argv[4] // design-<frame>.png rendered from Paper Capture.dc.html (optional)
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const TMP = path.join(OUT, '.pages')
fs.mkdirSync(TMP, { recursive: true })
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

// Sunday 4 Oct 2026, 09:52 in Cairo (UTC+3) — the lecture page is photographed.
const NOW = new Date('2026-10-04T06:52:00Z')
const CREATED = '2026-09-21T06:00:00Z'
const PROJECTS = [
  { id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: null, name: 'OS', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
  { id: 'p0000000-0000-4000-8000-000000000002', user_id: UID, domain_id: null, name: "Kai's Flow", type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
  { id: 'p0000000-0000-4000-8000-000000000003', user_id: UID, domain_id: null, name: 'Study', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', capture_keep_photos: true, created_at: CREATED, updated_at: CREATED }
const OLD_INBOX = [
  { id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Renew the library card', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: '2026-10-02T08:00:00Z', updated_at: '2026-10-02T08:00:00Z' },
]

// ── the pages: lined paper, one line per 80px row; a line's box is where its row is drawn ──
const W = 900, H = 1200, TOP = 110, ROW = 80
const box = (i, w = 0.82) => [Number((80 / W).toFixed(4)), Number(((TOP + i * ROW) / H).toFixed(4)), w, Number((62 / H).toFixed(4))]
const PAGES = {
  lecture: {
    dir: 'ltr',
    rows: ['OS lecture 3 — 4 Oct', '• Assignment 2 due Thu 11:59pm', '• Read ch. 4 scheduling', '• ask Dr. Hany re: lab groups', '• Quiz next Sun !', '   CPU → ready → run', '   idea: kai’s flow paper mode', '• buy blue pens'],
    lines: [
      { text: 'OS lecture 3 — 4 Oct', type: 'note', when: null, project: 'OS', confidence: 0.95, row: 0 },
      { text: 'Assignment 2', type: 'task', when: 'Thu 11:59pm', project: 'OS', confidence: 0.93, row: 1 },
      { text: 'Read ch. 4 — scheduling', type: 'task', when: null, project: 'OS', confidence: 0.9, row: 2 },
      { text: 'Ask Dr. Hany about lab groups', type: 'task', when: null, project: 'OS', confidence: 0.58, row: 3 },
      { text: 'Quiz', type: 'task', when: 'next Sunday', project: 'OS', confidence: 0.88, row: 4 },
      { text: 'Idea: Kai’s Flow paper mode', type: 'note', when: null, project: "Kai's Flow", confidence: 0.62, row: 6 },
      { text: 'Buy blue pens', type: 'task', when: null, project: null, confidence: 0.91, row: 7 },
    ],
    title: 'OS lecture 3',
  },
  second: { dir: 'ltr', rows: ['• email the TA re: lab report'], lines: [{ text: 'Email the TA about the lab report', type: 'task', when: null, project: 'OS', confidence: 0.9, row: 0 }] },
  third: { dir: 'ltr', rows: ['tired but happy — lecture ran late'], lines: [{ text: 'Tired but happy — the lecture ran late', type: 'journal', when: null, project: null, confidence: 0.8, row: 0 }] },
  arabic: {
    dir: 'rtl',
    rows: ['مراجعة الفصل الثالث', 'اجتماع الفريق الساعة ٥', 'شراء دفتر جديد'],
    lines: [
      { text: 'مراجعة الفصل الثالث', type: 'task', when: null, project: 'Study', confidence: 0.9, row: 0 },
      { text: 'اجتماع الفريق الساعة ٥', type: 'event', when: 'today 17:00', project: null, confidence: 0.64, row: 1 },
      { text: 'شراء دفتر جديد', type: 'task', when: null, project: null, confidence: 0.88, row: 2 },
    ],
    title: null,
  },
  blank: { dir: 'ltr', rows: [], lines: [] },
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

/** Draws a page photo: 900×1200 CSS px at `scale` (2 = a 1800×2400 phone photo, so the app must resize it). */
async function drawPage(name, scale = 1) {
  const p = PAGES[name]
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale })
  const rows = p.rows
    .map((t, i) => `<div style="position:absolute;left:80px;right:80px;top:${TOP + i * ROW}px;height:62px;line-height:62px;direction:${p.dir};text-align:${p.dir === 'rtl' ? 'right' : 'left'};${i === 0 && p.dir === 'ltr' ? 'text-decoration:underline;' : ''}">${t}</div>`)
    .join('')
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Aref+Ruqaa&display=swap" rel="stylesheet"></head>
    <body style="margin:0;width:${W}px;height:${H}px;background-color:#f4f0e6;background-image:linear-gradient(90deg,transparent 60px,rgba(205,120,120,.45) 60px,rgba(205,120,120,.45) 62px,transparent 62px),repeating-linear-gradient(180deg,transparent 0 ${ROW - 2}px,rgba(120,150,175,.32) ${ROW - 2}px ${ROW}px);background-position:0 ${TOP + 62 - ROW}px;font-family:Caveat,'Aref Ruqaa',cursive;font-size:46px;color:#2d3b5a;position:relative;overflow:hidden">${rows}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await sleep(300)
  const file = path.join(TMP, `${name}${scale > 1 ? '@2x' : ''}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 })
  await page.close()
  return file
}
const FILES = {
  lecture: await drawPage('lecture', 2),
  second: await drawPage('second'),
  third: await drawPage('third'),
  arabic: await drawPage('arabic'),
  blank: await drawPage('blank'),
  lecture1x: await drawPage('lecture'),
}

/** JPEG width × height from the SOF marker. */
function jpegSize(buf) {
  for (let i = 2; i < buf.length; ) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

/** What capture-image answers for page `n` of a batch drawn from `names`. */
function answerFor(state, body) {
  const names = state.batch
  const all = names.flatMap((name, page) =>
    PAGES[name].lines.map((l) => ({ text: l.text, type: l.type, when: l.when, project: l.project, confidence: l.confidence, box: box(l.row, name === 'arabic' ? 0.82 : l.row === 0 ? 0.55 : 0.82), page })),
  )
  const read = body.page + 1
  const items = all.filter((i) => i.page < read)
  const last = read >= body.paths.length
  const status = !last ? 'reading' : items.length ? 'done' : 'failed'
  return { status, pages_read: read, title: PAGES[names[0]].title ?? null, items, ...(status === 'failed' ? { error: 'unreadable' } : {}) }
}

/** Opens `route` signed in, the backend mocked. */
async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // 11k: the camera switched off for the app (set per test).
    const q = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (d) => (d?.name === 'camera' && window.__cameraDenied ? Promise.resolve({ state: 'denied' }) : q(d))
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = {
    rows: { tasks: [], projects: PROJECTS, domains: [], app_settings: [SETTINGS], inbox_items: [...OLD_INBOX], captures: o.captures ?? [], calendar_events: [] },
    writes: [], uploads: {}, reads: [], scenario: o.scenario ?? 'ok', batch: o.batch ?? ['lecture'], hold: o.hold ?? 0, scans: o.scans ?? 4,
  }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/functions/v1/capture-image')) {
      const body = req.postDataJSON()
      state.reads.push(body)
      if (state.hold) await sleep(state.hold)
      if (state.scenario === 'limit') return r.fulfill({ status: 429, json: { error: 'daily_limit' } })
      if (state.scenario === 'rate') return r.fulfill({ status: 503, json: { error: 'rate_limited' } })
      if (state.scenario === 'netfail') return r.abort('internetdisconnected')
      return r.fulfill({ json: answerFor(state, body) })
    }
    if (p.startsWith('/storage/v1/object/sign/captures') && req.method() === 'POST') {
      const body = req.postDataJSON()
      const paths = body.paths ?? [p.replace('/storage/v1/object/sign/captures/', '')]
      const signed = paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/captures/${x}?token=t` }))
      return r.fulfill({ json: body.paths ? signed : { signedURL: signed[0].signedURL } })
    }
    if (p.startsWith('/storage/v1/object/sign/captures/')) {
      const key = decodeURIComponent(p.replace('/storage/v1/object/sign/captures/', ''))
      const bytes = state.uploads[key] ?? fs.readFileSync(FILES[o.served ?? 'lecture1x'])
      return r.fulfill({ status: 200, contentType: 'image/jpeg', body: bytes })
    }
    if (p.startsWith('/storage/v1/object/captures/')) {
      if (state.failUploads) return r.abort('internetdisconnected')
      const key = decodeURIComponent(p.replace('/storage/v1/object/captures/', ''))
      // supabase-js sends a Blob as multipart: keep the file part (the JPEG) and its declared type.
      const raw = req.postDataBuffer()
      const from = raw.indexOf(Buffer.from([0xff, 0xd8, 0xff]))
      const to = raw.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2
      state.uploads[key] = raw.subarray(from, to)
      const type = /Content-Type: (image\/[a-z]+)/i.exec(raw.subarray(0, from).toString('latin1'))?.[1] ?? req.headers()['content-type']
      state.writes.push({ method: 'UPLOAD', table: 'storage', query: key, body: { type, bytes: state.uploads[key].length, upsert: req.headers()['x-upsert'] } })
      return r.fulfill({ json: { Key: `captures/${key}`, Id: 'x' } })
    }
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = p.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (table === 'ai_usage') return one ? r.fulfill({ json: { count: state.scans } }) : r.fulfill({ json: [{ count: state.scans }] })
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(env, loc) {
  if (!env.cdp) {
    await loc.click()
    await sleep(350)
    return
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(450)
}
async function swipeLeft(env, loc) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const y = b.y + 24
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width - 30, y }])
  for (let i = 1; i <= 10; i++) {
    await touch(env.cdp, 'touchMove', [{ x: b.x + b.width - 30 - i * 30, y }])
    await sleep(16)
  }
  await sleep(150) // stopped: a drag, not a flick
  await touch(env.cdp, 'touchEnd', [])
  await sleep(600)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const writesTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const dialog = (page, label) => page.locator(`[role="dialog"][aria-label="${label}"]`)
const sheet = (page) => page.locator('.pp-sheet-body')

/** Picks `files` through the next file chooser `act` opens; returns the input's capture attribute. */
async function pick(page, act, files) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), act()])
  const capture = await fc.element().getAttribute('capture')
  await fc.setFiles(files)
  await sleep(500)
  return capture
}
async function basics(env, name) {
  const { page, errors } = env
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  const vw = page.viewportSize().width
  check(`${name} no horizontal scroll`, wide <= vw, `${wide}/${vw}`)
  const small = await page.evaluate(() => {
    const out = []
    for (const root of document.querySelectorAll('.pp-frame, .pp-sheet-body, [data-sheet-footer]')) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px`, small.length === 0, small.slice(0, 4).join(' | '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}

/** From Inbox → Scan paper (phone) or the capture bar's camera, pick `names`, land on the quick look. */
async function toQuickLook(env, names) {
  const { page } = env
  const files = names.map((n) => FILES[n])
  const capture = await pick(page, () => tap(env, page.getByRole('button', { name: 'Scan paper' }).first()), files)
  return capture
}
async function readNow(env, label = 'Read') {
  await tap(env, dialog(env.page, 'A quick look').getByRole('button', { name: label }))
}
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(150)
  }
  return false
}

for (const theme of ['day', 'night']) {
  const night = theme === 'night'

  // 11a — the capture sheet: the camera beside the mic (and the offline "2 pages waiting" variant).
  {
    const name = `11a-${theme}`
    const env = await open('/today', { theme })
    const { page } = env
    await tap(env, page.getByRole('button', { name: /^Capture — tap to type/ }))
    await sleep(300)
    const cam = page.getByRole('button', { name: 'Scan paper' })
    check(`${name} centre tap → the capture sheet, a camera button in it`, (await cam.count()) === 1)
    const size = await cam.boundingBox()
    check(`${name} camera target ≥ 48 on touch`, size && size.width >= 48 && size.height >= 48, JSON.stringify(size))
    await shot(page, name)
    if (!night) {
      // Offline variant: two pages saved on this device → the chip and the dot.
      await page.evaluate(async () => {
        const blob = new Blob(['x'], { type: 'image/jpeg' })
        const req = indexedDB.open('keyval-store')
        await new Promise((res) => (req.onsuccess = res))
        const db = req.result
        await new Promise((res) => {
          const tx = db.transaction('keyval', 'readwrite')
          tx.objectStore('keyval').put([{ id: 'q1', takenAt: new Date().toISOString(), blobs: [blob, blob] }], 'kf-paper-queue')
          tx.oncomplete = res
        })
      })
      env.state.failUploads = true // the connection drops before they're through — they stay queued
      await page.reload({ waitUntil: 'networkidle' })
      await sleep(1200)
      const dot = await page.locator('.pp-capture-dot').count()
      await tap(env, page.getByRole('button', { name: /^Capture — tap to type/ }))
      await sleep(300)
      const chip = await text(page.locator('.pp-waiting'))
      check(`${name}-offline "2 pages waiting" chip + a dot on the centre button`, chip.includes('2 pages waiting') && dot === 1, `${chip} dot=${dot}`)
      await shot(page, `11a-offline-${theme}`)
    }
    await env.ctx.close()
  }

  // 11b / 11c / 11d / 11e / 11f / 11g — the whole loop from the Inbox: 3 pages, rotate, read, review, add.
  {
    const name = theme
    const env = await open('/inbox', { theme, batch: ['lecture', 'second', 'third'], hold: 900 })
    const { page, state } = env
    check(`11g-${name} "Scan paper" in the Inbox header`, (await page.getByRole('button', { name: 'Scan paper' }).count()) === 1)
    const capture = await toQuickLook(env, ['lecture'])
    check(`11b-${name} Scan paper opens the camera (capture="environment")`, capture === 'environment', capture)
    const look = dialog(page, 'A quick look')
    check(`11b-${name} one photo → "A quick look", Read is the terra action`, (await look.count()) === 1 && (await look.getByRole('button', { name: 'Read' }).getAttribute('class')).includes('kf-button--cta'))
    await shot(page, `11b-${name}`)
    // + Add page twice (the gallery path) → 3 pages and the strip.
    await pick(page, () => tap(env, look.getByRole('button', { name: 'Add page' })), [FILES.second, FILES.third])
    const strip = await text(look.locator('.pp-strip-head'))
    check(`11c-${name} three pages → the strip "3 pages · page 2"`, /3 pages · page 2/i.test(strip) && (await look.locator('.pp-strip-thumb').count()) === 3, strip)
    await tap(env, look.locator('.pp-strip-thumb').first())
    await tap(env, look.getByRole('button', { name: 'Rotate the page' }))
    const turned = await look.locator('.pp-photo').getAttribute('style')
    check(`11c-${name} rotate turns the page a quarter`, /rotate\(90deg\)/.test(turned), turned)
    await tap(env, look.getByRole('button', { name: 'Rotate the page' }))
    await tap(env, look.getByRole('button', { name: 'Rotate the page' }))
    await tap(env, look.getByRole('button', { name: 'Rotate the page' }))
    await shot(page, `11c-${name}`)
    await readNow(env, 'Read 3 pages')
    await sleep(400)
    const reading = dialog(page, 'Reading your page')
    check(`11d-${name} Read → "Reading your page…", pages ticking, "you can leave"`, (await reading.count()) === 1 && (await text(reading)).includes('You can leave'), await text(reading))
    await sleep(700)
    await shot(page, `11d-${name}`)
    const uploads = state.writes.filter((w) => w.method === 'UPLOAD')
    const sizes = Object.entries(state.uploads).map(([k, b]) => ({ k, ...jpegSize(b), bytes: b.length }))
    check(`11d-${name} three pages uploaded to <uid>/<capture>/<n>.jpg as JPEG`, uploads.length === 3 && uploads.every((u) => u.body.type === 'image/jpeg' && new RegExp(`^${UID}/[0-9a-f-]{36}/[0-2]\\.jpg$`).test(u.query)), JSON.stringify(uploads.map((u) => u.query)))
    check(`11d-${name} resized on the phone: ≤1600px long edge, ≤ 250 KB`, sizes.every((s) => Math.max(s.w, s.h) <= 1600 && s.bytes <= 250 * 1024) && sizes.some((s) => Math.max(s.w, s.h) === 1600), JSON.stringify(sizes))
    await waitFor(async () => (await sheet(page).count()) === 1, 9000)
    check(`11d-${name} one capture-image call per page, in order`, state.reads.map((r) => r.page).join() === '0,1,2' && state.reads.every((r) => r.paths.length === 3 && r.projects.includes('OS') && r.taken_at), JSON.stringify(state.reads.map((r) => r.page)))
    // 11e — the results.
    const head = await text(sheet(page).locator('.pp-rtitle'))
    check(`11e-${name} "From your page · 9 things" (7 + 1 + 1)`, head === 'From your page · 9 things', head)
    check(`11e-${name} meta: OS LECTURE 3 · 3 PAGES · READ`, /OS LECTURE 3 · 3 PAGES · READ \d\d:\d\d/i.test(await text(sheet(page).locator('.pp-meta'))), await text(sheet(page).locator('.pp-meta')))
    const unsure = sheet(page).locator('.pp-row-fg.is-check')
    check(`11e-${name} two unsure lines, tinted, "Check this"`, (await unsure.count()) === 2 && (await text(unsure.first())).includes('CHECK THIS'), await unsure.count())
    await sleep(500)
    const crop = await unsure.first().locator('.pp-crop').evaluate((el) => {
      const img = el.querySelector('img')
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), loaded: img.complete && img.naturalWidth > 0, nat: `${img.naturalWidth}x${img.naturalHeight}`, top: img.style.top }
    })
    check(`11e-${name} the unsure line shows its handwriting, cropped from the photo`, crop.loaded && crop.h >= 20 && crop.w > crop.h && parseFloat(crop.top) < 0, JSON.stringify(crop))
    const assignment = sheet(page).locator('.pp-row', { hasText: 'Assignment 2' })
    check(`11e-${name} parse chips: Task · Thu 8 Oct · 23:59 · OS`, (await text(assignment.locator('.pp-chips'))).replace(/\s+/g, ' ').includes('Task Thu 8 Oct · 23:59 OS'), await text(assignment.locator('.pp-chips')))
    check(`11e-${name} footer: Inbox only · Add all 9`, (await page.getByRole('button', { name: 'Add all 9' }).count()) === 1 && (await page.getByRole('button', { name: 'Inbox only' }).count()) === 1)
    await sheet(page).locator('.pp-row').first().scrollIntoViewIfNeeded()
    await shot(page, `11e-${name}`)
    await basics(env, `11e-${name}`)
    if (!night) {
      // 11f — change a type, edit a line, drop one with a swipe.
      const quiz = sheet(page).locator('.pp-row', { hasText: 'Quiz' })
      await tap(env, quiz.locator('.pp-type'))
      await shot(page, `11f-menu-${name}`)
      await tap(env, page.getByRole('menuitem', { name: /^Event/ }))
      check(`11f-${name} the type chip → Event`, (await text(quiz.locator('.pp-type'))) === 'Event')
      await tap(env, quiz.locator('.pp-row-text'))
      // Editing, the text is an input's value — the row no longer "has text" Quiz.
      const input = sheet(page).locator('.pp-row-input')
      await input.fill('Quiz — OS')
      await shot(page, `11f-${name}`)
      await input.press('Enter')
      check(`11f-${name} tap the text to edit it`, (await text(sheet(page).locator('.pp-row', { hasText: 'Quiz — OS' }).locator('.pp-row-text'))) === 'Quiz — OS')
      const pens = sheet(page).locator('.pp-row', { hasText: 'Buy blue pens' })
      await swipeLeft(env, pens)
      check(`11f-${name} swipe left drops a line ("Line dropped · Undo", 8 left)`, (await sheet(page).locator('.pp-row', { hasText: 'Buy blue pens' }).count()) === 0 && (await toasts(page)).includes('Line dropped') && (await page.getByRole('button', { name: 'Add all 8' }).count()) === 1, JSON.stringify(await toasts(page)))
      // 11g — Add all → the writes, one toast with Undo, Inbox rows with the 📷.
      const w0 = state.writes.length
      await tap(env, page.getByRole('button', { name: 'Add all 8' }))
      await sleep(900)
      const tasks = writesTo(state, 'tasks', w0)
      const events = writesTo(state, 'calendar_events', w0)
      const notes = writesTo(state, 'inbox_items', w0)
      const journal = writesTo(state, 'journal_entries', w0)
      const caps = writesTo(state, 'captures', w0)
      check(`11g-${name} Add all: 4 tasks with a photo link`, tasks.length === 4 && tasks.every((t) => t.external_ref?.source === 'photo' && t.external_ref.id.startsWith(state.reads[0].capture_id)), JSON.stringify(tasks.map((t) => t.title)))
      check(`11g-${name} …Assignment 2 due Thu 8 Oct 23:59 Cairo, in OS`, tasks.some((t) => t.title === 'Assignment 2' && t.due_at === '2026-10-08T20:59:00.000Z' && t.project_id === PROJECTS[0].id))
      check(`11g-${name} …the Quiz became an all-day event on Sun 11 Oct`, events.length === 1 && events[0].title === 'Quiz — OS' && events[0].all_day === true && events[0].starts_at === '2026-10-11T00:00:00.000Z', JSON.stringify(events))
      check(`11g-${name} …2 notes to the Inbox, each with its read and the way back to the photo`, notes.length === 2 && notes.every((n) => n.payload?.source === 'photo' && n.payload.source_ref === state.reads[0].capture_id && n.ai_parse?.cleaned_text), JSON.stringify(notes.map((n) => n.raw_text)))
      check(`11g-${name} …1 journal entry for today`, journal.length === 1 && journal[0].body === 'Tired but happy — the lecture ran late' && journal[0].entry_date === '2026-10-04', JSON.stringify(journal))
      check(`11g-${name} …the capture marked reviewed (photo kept 7 days)`, caps.length === 1 && !!caps[0].reviewed_at && caps[0].expires_at > NOW.toISOString(), JSON.stringify(caps.map((c) => [c.reviewed_at, c.expires_at])))
      const t = await toasts(page)
      check(`11g-${name} toast "Added 4 tasks · 1 event · 2 notes · a journal entry" with Undo`, t.includes('Added 4 tasks · 1 event · 2 notes · a journal entry') && (await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(t))
      const photoRows = page.locator('.pp-source')
      check(`11g-${name} Inbox rows from the page carry the 📷 + page title`, (await photoRows.count()) === 2 && (await text(photoRows)).toUpperCase().includes('OS LECTURE 3'), await photoRows.count())
      await shot(page, `11g-${name}`)
      // The 📷 opens the photo.
      await tap(env, photoRows.first())
      check(`11g-${name} the 📷 reopens the photo`, (await dialog(page, 'Your page').locator('img.pp-photo').count()) === 1)
      await tap(env, dialog(page, 'Your page').getByRole('button', { name: 'Close' }))
      // Undo takes everything back.
      const w1 = state.writes.length
      await tap(env, page.locator('.kf-toast', { hasText: 'Added 4 tasks' }).getByRole('button', { name: 'Undo' }))
      await sleep(600)
      const deletes = state.writes.slice(w1).filter((w) => w.method === 'DELETE').map((w) => w.table)
      check(`11g-${name} Undo deletes what was added and un-reviews the capture`, deletes.filter((d) => d === 'tasks').length === 4 && deletes.includes('calendar_events') && deletes.includes('journal_entries') && deletes.filter((d) => d === 'inbox_items').length === 2 && writesTo(state, 'captures', w1).some((c) => c.reviewed_at === null), JSON.stringify(deletes))
    } else {
      await shot(page, `11n-${name}`)
    }
    await env.ctx.close()
  }

  // Inbox only (day) and 11h the Arabic page.
  if (!night) {
    const env = await open('/inbox', { theme, batch: ['arabic'] })
    const { page, state } = env
    await toQuickLook(env, ['arabic'])
    await readNow(env)
    await waitFor(async () => (await sheet(page).count()) === 1)
    const rows = sheet(page).locator('.pp-row-text')
    const dirs = await rows.evaluateAll((els) => els.map((e) => [e.textContent, getComputedStyle(e).direction, e.getAttribute('dir')]))
    check('11h Arabic lines read right-to-left inside the LTR app, in their own words', dirs.length === 3 && dirs.every(([, d]) => d === 'rtl') && dirs[1][0] === 'اجتماع الفريق الساعة ٥', JSON.stringify(dirs))
    const meeting = sheet(page).locator('.pp-row', { hasText: 'اجتماع' })
    check('11h "٥" read as today 17:00, an Event, unsure → its crop', (await text(meeting.locator('.pp-chips'))).replace(/\s+/g, ' ').includes('Event Today · 17:00') && (await meeting.locator('.pp-crop').count()) === 1, await text(meeting.locator('.pp-chips')))
    check('11h meta says Arabic', /ARABIC/.test(await text(sheet(page).locator('.pp-meta'))), await text(sheet(page).locator('.pp-meta')))
    await sleep(400)
    await shot(page, '11h-day')
    const w0 = state.writes.length
    await tap(env, page.getByRole('button', { name: 'Inbox only' }))
    await sleep(700)
    const notes = writesTo(state, 'inbox_items', w0)
    check('Inbox only: every line lands as an Inbox note, nothing else', notes.length === 3 && writesTo(state, 'tasks', w0).length === 0 && writesTo(state, 'calendar_events', w0).length === 0 && notes.every((n) => n.payload?.source === 'photo'), JSON.stringify(notes.map((n) => n.raw_text)))
    check('Inbox only: the meeting keeps its read (event · today 17:00)', notes.some((n) => n.ai_parse?.kind === 'event' && n.ai_parse.due_at === '2026-10-04T14:00:00.000Z'), JSON.stringify(notes.map((n) => n.ai_parse)))
    check('Inbox only: toast "Added 3 notes"', (await toasts(page)).includes('Added 3 notes'), JSON.stringify(await toasts(page)))
    await env.ctx.close()
  }

  // 11i — couldn't read (blank page).
  {
    const name = `11i-${theme}`
    const env = await open('/inbox', { theme, batch: ['blank'] })
    const { page, state } = env
    await toQuickLook(env, ['blank'])
    await readNow(env)
    await waitFor(async () => (await page.getByText('Couldn’t read this one — retake?').count()) === 1)
    check(`${name} a blank page → "Couldn’t read this one — retake?" with Retake + Pick another photo`, (await page.getByRole('button', { name: 'Retake' }).count()) === 1 && (await page.getByRole('button', { name: 'Pick another photo' }).count()) === 1)
    await sleep(300)
    await shot(page, name)
    await basics(env, name)
    if (!night) {
      const w0 = state.writes.length
      const capture = await pick(page, () => tap(env, page.getByRole('button', { name: 'Retake' })), [FILES.lecture1x])
      const caps = writesTo(state, 'captures', w0)
      check(`${name} Retake: the camera again, and the unreadable photo goes now`, capture === 'environment' && caps.length === 1 && caps[0].expires_at < new Date(NOW.getTime() + 10 * 60_000).toISOString() && (await dialog(page, 'A quick look').count()) === 1, JSON.stringify(caps.map((c) => c.expires_at)))
    }
    await env.ctx.close()
  }

  // 11j — the daily limit.
  {
    const name = `11j-${theme}`
    const env = await open('/inbox', { theme, scenario: 'limit' })
    const { page } = env
    await toQuickLook(env, ['lecture1x'])
    await readNow(env)
    await waitFor(async () => (await page.getByText('That’s 15 pages today.').count()) === 1)
    check(`${name} 15 pages today → calm, "Type them in" first, the photo kept for tomorrow`, (await page.getByText('That’s 15 pages today.').count()) === 1 && (await page.getByRole('button', { name: 'Type them in' }).getAttribute('class')).includes('cta') && (await page.getByText(/read first thing tomorrow/).count()) === 1)
    await shot(page, name)
    await basics(env, name)
    if (!night) {
      await tap(env, page.getByRole('button', { name: 'Type them in' }))
      check(`${name} "Type them in" opens the capture bar`, (await page.locator('input[enterkeyhint="done"]').count()) === 1)
    }
    await env.ctx.close()
  }

  // 11k — the camera switched off: the gallery is the main action.
  {
    const name = `11k-${theme}`
    const env = await open('/inbox', { theme })
    const { page } = env
    await page.evaluate(() => (window.__cameraDenied = true))
    await tap(env, page.getByRole('button', { name: 'Scan paper' }))
    await sleep(300)
    check(`${name} camera off → "The camera is switched off", Pick from gallery instead`, (await page.getByText('The camera is switched off for Kai’s Flow').count()) === 1)
    await shot(page, name)
    await basics(env, name)
    if (!night) {
      const capture = await pick(page, () => tap(env, page.getByRole('button', { name: 'Pick from gallery instead' })), [FILES.lecture1x])
      check(`${name} the gallery (no capture attribute) → the quick look`, capture === null && (await dialog(page, 'A quick look').count()) === 1, capture)
    }
    await env.ctx.close()
  }
}

// Busy Groq: calm, queued, read later.
{
  const env = await open('/inbox', { scenario: 'rate' })
  const { page } = env
  await toQuickLook(env, ['lecture1x'])
  await readNow(env)
  await sleep(1200)
  check('Groq busy → "We’ll read your page in a bit", the flow closes calmly', (await toasts(page)).includes("We'll read your page in a bit.") && (await page.locator('.pp-frame').count()) === 0, JSON.stringify(await toasts(page)))
  await env.ctx.close()
}

// The connection drops between the upload and the first read: no server row yet, so the device keeps it.
{
  const env = await open('/inbox', { scenario: 'netfail' })
  const { page, state } = env
  await toQuickLook(env, ['lecture1x'])
  await readNow(env)
  await sleep(1200)
  check('uploaded but the read never reached the server → "We\'ll read your page when you\'re back online"', (await toasts(page)).includes("We'll read your page when you're back online.") && state.writes.filter((w) => w.method === 'UPLOAD').length === 1, JSON.stringify(await toasts(page)))
  await tap(env, page.getByRole('button', { name: /^Capture — tap to type/ }))
  check('…and it waits on this device ("1 page waiting")', (await text(page.locator('.pp-waiting'))).includes('1 page waiting'))
  await page.keyboard.press('Escape')
  state.scenario = 'ok'
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => (await toasts(page)).some((x) => x.startsWith('Your page is read')), 6000)
  check('…online again → read without uploading twice', (await toasts(page)).includes('Your page is read · 7 things') && state.writes.filter((w) => w.method === 'UPLOAD').length === 1, JSON.stringify(await toasts(page)))
  await env.ctx.close()
}

// Offline: pages wait on the device, then go up and get read when the connection is back.
{
  const env = await open('/inbox', {})
  const { page, state } = env
  // Dev serves chunks on demand (the PWA precaches them): load the capture bar's before the network goes.
  await tap(env, page.getByRole('button', { name: /^Capture — tap to type/ }))
  await page.keyboard.press('Escape')
  await sleep(300)
  await toQuickLook(env, ['lecture1x'])
  await env.ctx.setOffline(true)
  await readNow(env)
  await sleep(1200)
  const t = await toasts(page)
  check('offline Read → "Saved — 1 page waiting, read when you’re online", nothing uploaded', t.some((x) => x.startsWith('Saved — 1 page waiting')) && state.writes.filter((w) => w.method === 'UPLOAD').length === 0, JSON.stringify(t))
  await tap(env, page.getByRole('button', { name: /^Capture — tap to type/ }))
  check('offline: the capture sheet shows "1 page waiting · read when online"', (await text(page.locator('.pp-waiting'))).includes('1 page waiting'))
  await shot(page, 'offline-queue-day')
  await page.keyboard.press('Escape')
  await env.ctx.setOffline(false)
  await waitFor(async () => (await toasts(page)).some((x) => x.startsWith('Your page is read')), 9000)
  check('back online → uploaded, read, "Your page is read · 7 things · Review"', state.writes.filter((w) => w.method === 'UPLOAD').length === 1 && state.reads.length === 1 && (await toasts(page)).includes('Your page is read · 7 things'), JSON.stringify(await toasts(page)))
  await tap(env, page.locator('.kf-toast', { hasText: 'Your page is read' }).getByRole('button', { name: 'Review' }))
  check('Review → the results sheet', (await sheet(page).count()) === 1)
  await env.ctx.close()
}

// Leave it reading → the read finishes in the background; the Inbox row and a toast bring it back.
{
  const env = await open('/inbox', { hold: 1500 })
  const { page } = env
  await toQuickLook(env, ['lecture1x'])
  await readNow(env)
  await sleep(300)
  await tap(env, page.getByRole('button', { name: 'Leave it reading' }))
  check('Leave it reading → the flow steps aside', (await page.locator('.pp-frame').count()) === 0)
  await waitFor(async () => (await toasts(page)).some((x) => x.startsWith('Your page is read')), 6000)
  check('…then "Your page is read · 7 things" and an Inbox row "Ready to review"', (await toasts(page)).includes('Your page is read · 7 things') && (await text(page.locator('.pp-ready'))).toUpperCase().includes('READY TO REVIEW'), await text(page.locator('.pp-ready')))
  await shot(page, '11d-inbox-ready-day')
  await env.ctx.close()
}

// 11m — desktop: drop an image → the overlay → the quick look → the results as a centred panel; paste.
for (const theme of ['day', 'night']) {
  const env = await open('/inbox', { theme, view: desktop })
  const { page } = env
  const bytes = fs.readFileSync(FILES.lecture1x).toString('base64')
  await page.evaluate((b) => {
    const bin = Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
    window.__dt = new DataTransfer()
    window.__dt.items.add(new File([bin], 'page.jpg', { type: 'image/jpeg' }))
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: window.__dt, bubbles: true }))
    document.body.dispatchEvent(new DragEvent('dragover', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, bytes)
  await sleep(300)
  check(`11m-${theme} dragging a file in → "Drop a page to read it"`, (await page.getByText('Drop a page to read it').count()) === 1)
  await shot(page, `11m-drop-${theme}`)
  await page.evaluate(() => document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true })))
  await sleep(500)
  check(`11m-${theme} drop → the overlay goes, the quick look opens`, (await page.getByText('Drop a page to read it').count()) === 0 && (await dialog(page, 'A quick look').count()) === 1)
  await readNow(env)
  await waitFor(async () => (await dialog(page, 'From your page').count()) === 1)
  const panel = await dialog(page, 'From your page').boundingBox()
  check(`11m-${theme} results as a centred panel, the page beside the lines`, panel && Math.abs(panel.x + panel.width / 2 - 640) < 2 && panel.y >= 0 && panel.y + panel.height <= 800 && (await page.locator('.pp-side-page img').count()) === 1 && (await page.locator('.pp-row').count()) === 7, JSON.stringify(panel))
  await page.locator('.pp-row', { hasText: 'Ask Dr. Hany' }).hover()
  await sleep(200)
  check(`11m-${theme} hovering a line marks where it came from`, (await page.locator('.pp-box').count()) === 1)
  await sleep(300)
  await shot(page, `11m-${theme}`)
  await basics(env, `11m-${theme}`)
  if (theme === 'day') {
    await page.keyboard.press('Escape')
    await sleep(300)
    // Paste an image into the capture bar.
    await page.keyboard.press('Control+k')
    await sleep(300)
    const input = page.locator('input[enterkeyhint="done"]')
    await input.evaluate((el, b) => {
      const bin = Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bin], 'pasted.jpg', { type: 'image/jpeg' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, bytes)
    await sleep(500)
    check('paste an image into the capture bar → the quick look (and the bar closes)', (await dialog(page, 'A quick look').count()) === 1 && (await input.count()) === 0)
    await shot(page, 'paste-desktop-day')
  }
  await env.ctx.close()
}

// 11o — Settings → Capture → photos: keep / delete after reading, scans today, the queue.
for (const view of [phone, desktop]) {
  const tag = view === phone ? 'phone' : 'desktop'
  const env = await open(view === phone ? '/settings' : '/settings?section=integrations', { view })
  const { page, state } = env
  if (view === desktop) {
    const tab = page.getByText('Integrations', { exact: true }).first()
    if (await tab.count()) await tab.click()
    await sleep(400)
  }
  const card = page.locator('.pp-settings')
  await card.scrollIntoViewIfNeeded()
  check(`11o-${tag} Settings → Capture: "Scans today 4 of 15", queue 0`, (await text(card)).toUpperCase().includes('4 OF 15') && (await text(card)).toUpperCase().includes('QUEUE · 0'), await text(card))
  const w0 = state.writes.length
  await tap(env, card.getByRole('button', { name: 'Delete after reading' }))
  const s = writesTo(state, 'app_settings', w0)
  check(`11o-${tag} "Delete after reading" saves capture_keep_photos = false`, s.length === 1 && s[0].capture_keep_photos === false, JSON.stringify(s))
  await shot(page, `11o-${tag}-day`)
  await basics(env, `11o-${tag}`)
  await env.ctx.close()
}

// ── Side by side: the design frame | this build, same state. ──
if (DESIGN) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  const pairs = [['11a', '11a-day', 'design', 820], ['11b', '11b-day'], ['11c', '11c-day'], ['11d', '11d-day', 'design', 1250], ['11e', '11e-day'], ['11f', '11f-menu-day'], ['11g', '11g-day'], ['11h', '11h-day'], ['11i', '11i-day'], ['11j', '11j-day'], ['11k', '11k-day'], ['11m', '11m-day', 'design', 1440], ['11n', '11n-night', 'design', 860], ['11o', '11o-phone-day', 'design', 820]]
  for (const [frame, ours, , dw = 430] of pairs) {
    const d = path.join(DESIGN, `design-${frame}.png`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(d) || !fs.existsSync(o)) continue
    const wide = ours.startsWith('11m')
    await page.setContent(`<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;gap:16px;padding:12px;font:12px monospace;color:#fff;align-items:flex-start"><div><div>design ${frame}</div><img src="${uri(d)}" style="width:${Math.min(dw, wide ? 900 : dw)}px"></div><div><div>build ${ours}</div><img src="${uri(o)}" style="width:${wide ? 900 : 390}px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.rmSync(TMP, { recursive: true, force: true })
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
