// Paper capture gaps (Paper Capture.dc.html 11c · 11e–11h · 11i) on the REAL app against a MOCKED backend:
// page reorder (hold / drag / ⌥←→), chip editing (date · project · priority · type), long-press selection
// with its bulk actions, and HEIC. The mock + page drawing is paper-capture/verify.mjs's, copied (one
// line gains 'priority', as 11e draws P1 on Assignment 2).
//   node verify.mjs <outDir> [baseUrl] [designDir] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5257'
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
      { text: 'Assignment 2', type: 'task', when: 'Thu 11:59pm', project: 'OS', confidence: 0.93, row: 1, priority: 1 },
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
    PAGES[name].lines.map((l) => ({ text: l.text, type: l.type, when: l.when, project: l.project, confidence: l.confidence, priority: l.priority ?? null, box: box(l.row, name === 'arabic' ? 0.82 : l.row === 0 ? 0.55 : 0.82), page })),
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
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // v1.0.22's one-time "Updated to vX" toast docks over a modal's header on phones (covering Rotate).
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    // 11k: the camera switched off for the app (set per test).
    const q = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (d) => (d?.name === 'camera' && window.__cameraDenied ? Promise.resolve({ state: 'denied' }) : q(d))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
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

// ── helpers for this harness ──
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
/** Touch: hold `from` past the 400ms long-press, then slide onto `to` and lift. `mid` runs while lifted. */
async function holdDrag(env, from, to, mid) {
  const p0 = centre(await from.boundingBox())
  const p1 = centre(await to.boundingBox())
  await touch(env.cdp, 'touchStart', [p0])
  await sleep(650)
  for (let i = 1; i <= 12; i++) {
    await touch(env.cdp, 'touchMove', [{ x: p0.x + ((p1.x - p0.x) * i) / 12, y: p0.y + ((p1.y - p0.y) * i) / 12 }])
    await sleep(24)
  }
  await sleep(150)
  if (mid) await mid()
  await touch(env.cdp, 'touchEnd', [])
  await sleep(450)
}
/** Touch: hold in place past the long-press (a row: select it). */
async function hold(env, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  const p = { x: b.x + Math.min(120, b.width / 2), y: b.y + 22 }
  await touch(env.cdp, 'touchStart', [p])
  await sleep(650)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(450)
}
/** Mouse: press, move past the 6px threshold, drag onto `to`, release. */
async function mouseDrag(page, from, to, mid) {
  const p0 = centre(await from.boundingBox())
  const p1 = centre(await to.boundingBox())
  await page.mouse.move(p0.x, p0.y)
  await page.mouse.down()
  await page.mouse.move(p0.x + 12, p0.y, { steps: 3 })
  await page.mouse.move(p1.x, p1.y, { steps: 12 })
  await sleep(150)
  if (mid) await mid()
  await page.mouse.up()
  await sleep(450)
}
/** The long edge of each uploaded page, in page order: the 1800×2400 lecture photo comes out 1600, the others 1200. */
const uploadEdges = (state) =>
  Object.entries(state.uploads)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, buf]) => {
      const s = jpegSize(buf)
      return s ? Math.max(s.w, s.h) : 0
    })
const chips = async (row) => (await text(row.locator('.pp-chips'))).replace(/\s+/g, ' ').trim()
const banner = (page) => text(page.locator('.pp-banner'))
/** Desktop: scroll first and let it settle — a kit menu closes on any scroll outside it. */
async function clickIn(loc) {
  await loc.scrollIntoViewIfNeeded()
  await sleep(250)
  await loc.click()
}
// A HEIC: the 'ftypheic' box and nothing a browser outside Safari can draw.
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic\0\0\0\0mif1heic'), Buffer.alloc(64)])

// ── 11c · reorder the pages: hold-and-drag on a phone, drag on desktop, ⌥←/→ from the keyboard ──
for (const theme of ['day', 'night']) {
  const env = await open('/inbox', { theme, batch: ['third', 'lecture', 'second'] })
  const { page, state } = env
  await toQuickLook(env, ['lecture'])
  const look = dialog(page, 'A quick look')
  await pick(page, () => tap(env, look.getByRole('button', { name: 'Add page' })), [FILES.second, FILES.third])
  const head = await text(look.locator('.pp-strip-head'))
  check(`11c-${theme} phone: the strip says "3 pages · page 2" and "hold to reorder" (as drawn)`, /3 pages · page 2/i.test(head) && /hold to reorder/i.test(head), head)
  const thumbs = look.locator('.pp-strip-thumb')
  let lifted = false
  await holdDrag(env, thumbs.nth(2), thumbs.nth(0), async () => {
    lifted = (await look.locator('.pp-strip-thumb.is-lifted').count()) === 1
    await shot(page, `11c-lifted-${theme}`)
  })
  check(`11c-${theme} phone: hold page 3 → it lifts and follows the finger`, lifted)
  const after = await text(look.locator('.pp-strip-head'))
  check(`11c-${theme} phone: dropped on page 1's place → the shown page (was 2) is now 3`, /3 pages · page 3/i.test(after), after)
  await tap(env, thumbs.nth(1)) // the lecture photo, now second
  await shot(page, `11c-${theme}`)
  await basics(env, `11c-${theme}`)
  await readNow(env, 'Read 3 pages')
  await waitFor(async () => (await sheet(page).count()) === 1, 9000)
  const edges = uploadEdges(state)
  check(`11c-${theme} phone: read in the new order (page 1 = the old page 3, the lecture second)`, edges.join() === '1200,1600,1200', edges.join())
  await env.ctx.close()
}
{
  const env = await open('/inbox', { view: desktop, batch: ['lecture', 'second', 'third'] })
  const { page, state } = env
  await toQuickLook(env, ['lecture'])
  const look = dialog(page, 'A quick look')
  await pick(page, () => look.getByRole('button', { name: 'Add page' }).click(), [FILES.second, FILES.third])
  check('11c desktop: the strip says "drag to reorder"', /drag to reorder/i.test(await text(look.locator('.pp-strip-head'))), await text(look.locator('.pp-strip-head')))
  const thumbs = look.locator('.pp-strip-thumb')
  await mouseDrag(page, thumbs.nth(0), thumbs.nth(2), () => shot(page, '11c-drag-desktop-day'))
  // [second, third, lecture] now; ⌥← on the lecture moves it back one place.
  await thumbs.nth(2).focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await sleep(300)
  await thumbs.nth(0).click()
  check('11c desktop: a plain click still picks a page (under 6px is not a drag)', /page 1/i.test(await text(look.locator('.pp-strip-head'))), await text(look.locator('.pp-strip-head')))
  await readNow(env, 'Read 3 pages')
  await waitFor(async () => (await dialog(page, 'From your page').count()) === 1, 9000)
  const edges = uploadEdges(state)
  check('11c desktop: mouse drag page 1 → 3, then ⌥← on it — read as [second, lecture, third]', edges.join() === '1200,1600,1200' && state.reads.length === 3, edges.join())
  await env.ctx.close()
}

// ── 11e–11f · every chip edits, as drawn; 11f "Editing 1 line"; long-press selection + its bulk actions ──
for (const theme of ['day', 'night']) {
  const night = theme === 'night'
  const env = await open('/inbox', { theme, batch: ['lecture'] })
  const { page, state } = env
  await toQuickLook(env, ['lecture1x'])
  await readNow(env)
  await waitFor(async () => (await sheet(page).count()) === 1, 9000)
  const row = (t) => sheet(page).locator('.pp-row', { hasText: t })
  check(`11e-${theme} Assignment 2's chips as drawn: Task · Thu 8 Oct · 23:59 · OS · P1`, (await chips(row('Assignment 2'))) === 'Task Thu 8 Oct · 23:59 OS P1', await chips(row('Assignment 2')))
  check(`11e-${theme} the heading line: Note · OS · page title`, (await chips(row('OS lecture 3 — 4 Oct'))) === 'Note OS page title', await chips(row('OS lecture 3 — 4 Oct')))
  const editable = await sheet(page).locator('.pp-chips button').count()
  const all = await sheet(page).locator('.pp-chips > *').count()
  check(`11e-${theme} every chip but "page title" is a button (type, date, project, priority)`, all - editable === 1, `${editable}/${all}`)
  await sheet(page).locator('.pp-row').first().scrollIntoViewIfNeeded()
  await shot(page, `11e-${theme}`)
  await basics(env, `11e-${theme}`)

  if (!night) {
    // 11f — the type chip's menu as drawn (dot · Type · mono hint), then Quiz → Event.
    await tap(env, row('Quiz').locator('.pp-type'))
    const menu = await page.getByRole('menu').innerText().catch(() => '')
    check('11f type menu: Task to do · Event on the calendar · Note to Inbox · Journal to today’s entry', ['Task', 'to do', 'Event', 'on the calendar', 'Note', 'to Inbox', 'Journal', 'to today’s entry'].every((w) => menu.includes(w)), menu.replace(/\n/g, ' | '))
    await shot(page, '11f-menu-day')
    await tap(env, page.getByRole('menuitem', { name: /^Event/ }))
    check('11f Quiz → Event, its date chip kept (Sun 11 Oct)', (await chips(row('Quiz'))).startsWith('Event Sun 11 Oct'), await chips(row('Quiz')))
    await tap(env, row('Quiz').locator('.pp-row-text'))
    check('11f editing a line → the banner says "Editing 1 line"', (await banner(page)) === 'Editing 1 line', await banner(page))
    await sheet(page).locator('.pp-row-input').fill('Quiz — OS')
    await shot(page, '11f-day')
    await sheet(page).locator('.pp-row-input').press('Enter')
    await sleep(200)
    check('11f …and back to "2 lines need a look" once it closes', (await banner(page)).startsWith('2 lines need a look'), await banner(page))

    // The date chip → the kit date picker (a sheet on the phone): Tomorrow.
    await tap(env, row('Assignment 2').getByRole('button', { name: /^Date:/ }))
    await sleep(300)
    await shot(page, 'chip-date-day')
    await tap(env, page.getByRole('button', { name: /^Tomorrow/ }).first())
    await sleep(400)
    check('date chip → the date picker → Tomorrow: "Mon 5 Oct"', (await chips(row('Assignment 2'))).startsWith('Task Mon 5 Oct OS'), await chips(row('Assignment 2')))

    // The project chip → Move to… (a sheet): Study.
    await tap(env, row('Read ch. 4').getByRole('button', { name: /^Project:/ }))
    await sleep(400)
    await shot(page, 'chip-project-day')
    await tap(env, page.getByRole('button', { name: /^Study/ }).first())
    await sleep(500)
    check('project chip → Move to… → Study', (await chips(row('Read ch. 4'))) === 'Task Study', await chips(row('Read ch. 4')))

    // The priority chip → the task menu's priority list (an action sheet): P2.
    await tap(env, row('Assignment 2').getByRole('button', { name: /^Priority:/ }))
    await sleep(400)
    await shot(page, 'chip-priority-day')
    await tap(env, page.getByRole('button', { name: /^P2 · High/ }))
    await sleep(500)
    check('priority chip → P2 · High', (await chips(row('Assignment 2'))).endsWith('OS P2'), await chips(row('Assignment 2')))

    // A line with no priority gets one from ⋯ (the chip appears).
    await tap(env, row('Buy blue pens').getByRole('button', { name: /^More for/ }))
    await tap(env, page.getByRole('menuitem', { name: /Add a priority/ }))
    await sleep(400)
    await tap(env, page.getByRole('button', { name: /^P1 · Critical/ }))
    await sleep(500)
    check('⋯ → Add a priority… → P1: the chip appears', (await chips(row('Buy blue pens'))) === 'Task P1', await chips(row('Buy blue pens')))
  }

  // Long-press selects; taps then add to it (MK Selection). The sheet's banner becomes ✕ · N selected · Select all,
  // and its footer the selection's actions.
  await hold(env, row('Ask Dr. Hany'))
  check(`select-${theme} hold a line → "1 selected", circles on every line`, (await banner(page)).includes('1 selected') && (await sheet(page).locator('.kf-select-circle').count()) === 7, await banner(page))
  await tap(env, row('Idea'))
  const foot = await text(page.locator('.pp-selfoot'))
  check(`select-${theme} a tap adds a line → "2 selected"; footer Type · Date · Project · Drop`, (await banner(page)).includes('2 selected') && foot.replace(/\s+/g, ' ').trim() === 'Type Date Project Drop', `${await banner(page)} / ${foot}`)
  await shot(page, `select-${theme}`)
  await basics(env, `select-${theme}`)
  if (!night) {
    await tap(env, page.locator('.pp-selfoot').getByRole('button', { name: 'Type' }))
    await tap(env, page.getByRole('menuitem', { name: /^Note/ }))
    check('bulk Type → Note: both lines are Notes, the selection ends', (await chips(row('Ask Dr. Hany'))).startsWith('Note') && (await chips(row('Idea'))).startsWith('Note') && !(await banner(page)).includes('selected'), `${await chips(row('Ask Dr. Hany'))} / ${await chips(row('Idea'))}`)
    await hold(env, row('OS lecture 3 — 4 Oct'))
    await tap(env, row('Idea'))
    await tap(env, page.locator('.pp-selfoot').getByRole('button', { name: 'Drop' }))
    check('bulk Drop: "2 lines dropped" with Undo, Add all 5', (await toasts(page)).includes('2 lines dropped') && (await page.getByRole('button', { name: 'Add all 5' }).count()) === 1, JSON.stringify(await toasts(page)))
    await tap(env, page.locator('.kf-toast', { hasText: '2 lines dropped' }).getByRole('button', { name: 'Undo' }))
    check('…Undo brings both back (Add all 7)', (await page.getByRole('button', { name: 'Add all 7' }).count()) === 1)
    await hold(env, row('Buy blue pens'))
    await tap(env, page.getByRole('button', { name: 'Select all' }))
    check('Select all → "7 selected"', (await banner(page)).includes('7 selected'), await banner(page))
    await tap(env, page.getByRole('button', { name: 'Clear selection' }))
    check('✕ clears it — the sheet is back to Inbox only · Add all 7', !(await banner(page)).includes('selected') && (await page.getByRole('button', { name: 'Add all 7' }).count()) === 1)

    // Add all: the edits are what gets written.
    const w0 = state.writes.length
    await tap(env, page.getByRole('button', { name: 'Add all 7' }))
    await sleep(900)
    const tasks = writesTo(state, 'tasks', w0)
    const events = writesTo(state, 'calendar_events', w0)
    const notes = writesTo(state, 'inbox_items', w0)
    const cairoDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
    const t = (title) => tasks.find((x) => x.title === title)
    check('Add all: Assignment 2 → P2, due Mon 5 Oct, in OS', t('Assignment 2')?.priority === 2 && cairoDay(t('Assignment 2').due_at) === '2026-10-05' && t('Assignment 2').project_id === PROJECTS[0].id, JSON.stringify(t('Assignment 2')))
    check('…Read ch. 4 → in Study', t('Read ch. 4 — scheduling')?.project_id === PROJECTS[2].id, JSON.stringify(t('Read ch. 4 — scheduling')))
    check('…Buy blue pens → P1', t('Buy blue pens')?.priority === 1, JSON.stringify(t('Buy blue pens')))
    check('…3 tasks, the Quiz an all-day event on Sun 11 Oct, 3 notes', tasks.length === 3 && events.length === 1 && events[0].title === 'Quiz — OS' && events[0].all_day && events[0].starts_at === '2026-10-11T00:00:00.000Z' && notes.length === 3, `${tasks.length}/${events.length}/${notes.length}`)
    check('…toast "Added 3 tasks · 1 event · 3 notes"', (await toasts(page)).includes('Added 3 tasks · 1 event · 3 notes'), JSON.stringify(await toasts(page)))
  }
  await env.ctx.close()
}

// Desktop (11m): ⌃-click selects; chips open popovers; Esc ends the selection first.
for (const theme of ['day', 'night']) {
  const night = theme === 'night'
  const env = await open('/inbox', { theme, view: desktop, batch: ['lecture'] })
  const { page, state } = env
  await toQuickLook(env, ['lecture1x'])
  await readNow(env)
  await waitFor(async () => (await dialog(page, 'From your page').count()) === 1, 9000)
  const panel = dialog(page, 'From your page')
  const row = (t) => panel.locator('.pp-row', { hasText: t })
  await row('Read ch. 4').locator('.pp-row-text').click({ modifiers: ['Control'] })
  await row('Buy blue pens').locator('.pp-row-text').click({ modifiers: ['Control'] })
  await sleep(300)
  check(`desktop-${theme} ⌃-click two lines → "2 selected", the footer Type · Date · Project · Drop`, (await text(panel.locator('.pp-banner'))).includes('2 selected') && (await panel.locator('.pp-selfoot').count()) === 1, await text(panel.locator('.pp-banner')))
  await shot(page, `select-desktop-${theme}`)
  await basics(env, `select-desktop-${theme}`)
  if (!night) {
    await panel.locator('.pp-selfoot').getByRole('button', { name: 'Project' }).click()
    await sleep(400)
    await page.getByRole('menuitem', { name: /Study/ }).first().click()
    await sleep(400)
    check('desktop bulk Project → Study on both', (await chips(row('Read ch. 4'))) === 'Task Study' && (await chips(row('Buy blue pens'))) === 'Task Study', `${await chips(row('Read ch. 4'))} / ${await chips(row('Buy blue pens'))}`)
    await row('Quiz').locator('.pp-row-text').click({ modifiers: ['Control'] })
    await page.keyboard.press('Escape')
    await sleep(300)
    check('desktop Esc ends the selection, the panel stays', !(await text(panel.locator('.pp-banner'))).includes('selected') && (await panel.count()) === 1)
    await clickIn(row('Assignment 2').getByRole('button', { name: /^Priority:/ }))
    await page.getByRole('menuitem', { name: /^P3 · Medium/ }).click()
    await sleep(300)
    await clickIn(row('Quiz').getByRole('button', { name: /^Date:/ }))
    await sleep(400)
    await shot(page, 'chip-date-desktop-day')
    await page.getByRole('button', { name: /^Next week/ }).first().click()
    await sleep(400)
    check('desktop chips: priority → P3, Quiz date → next week (Mon 12 Oct)', (await chips(row('Assignment 2'))).endsWith('P3') && (await chips(row('Quiz'))).startsWith('Task Mon 12 Oct'), `${await chips(row('Assignment 2'))} / ${await chips(row('Quiz'))}`)
    const w0 = state.writes.length
    await panel.getByRole('button', { name: 'Add all 7' }).click()
    await sleep(900)
    const tasks = writesTo(state, 'tasks', w0)
    check('desktop Add all: Study ×2, P3, the Quiz due 12 Oct', tasks.filter((x) => x.project_id === PROJECTS[2].id).length === 2 && tasks.find((x) => x.title === 'Assignment 2')?.priority === 3 && tasks.find((x) => x.title === 'Quiz')?.due_at?.startsWith('2026-10-12'), JSON.stringify(tasks.map((x) => [x.title, x.project_id, x.priority, x.due_at])))
  }
  await env.ctx.close()
}

// ── HEIC (11i): a browser that can't open it says so calmly; Safari would decode it (preparePage) ──
for (const theme of ['day', 'night']) {
  const env = await open('/inbox', { theme })
  const { page } = env
  await pick(page, () => tap(env, page.getByRole('button', { name: 'Scan paper' }).first()), [{ name: 'IMG_0412.HEIC', mimeType: 'image/heic', buffer: HEIC }])
  await waitFor(async () => (await page.getByText(/Convert it to JPEG first/).count()) === 1, 4000)
  check(`heic-${theme} an iPhone photo Chrome can’t open → 11i, "Convert it to JPEG first", Retake · Pick another photo`, (await page.getByText('Couldn’t read this one — retake?').count()) === 1 && (await page.getByText(/Convert it to JPEG first/).count()) === 1 && (await page.getByRole('button', { name: 'Pick another photo' }).count()) === 1)
  await sleep(400) // the frame fades in
  await shot(page, `heic-${theme}`)
  await basics(env, `heic-${theme}`)
  if (theme === 'day') {
    const capture = await pick(page, () => tap(env, page.getByRole('button', { name: 'Pick another photo' })), [FILES.lecture1x])
    check('heic: Pick another photo → the gallery → the quick look', capture === null && (await dialog(page, 'A quick look').count()) === 1)
    // One HEIC among two pages: it leaves the look with a toast; the JPEG stays.
    await pick(page, () => tap(env, dialog(page, 'A quick look').getByRole('button', { name: 'Add page' })), [{ name: 'IMG_0413.heic', mimeType: 'image/heic', buffer: HEIC }])
    await sleep(600)
    check('heic: one HEIC among pages → left out with a toast, the other page kept', (await dialog(page, 'A quick look').count()) === 1 && (await toasts(page)).some((x) => x.includes('HEIC') && x.includes('convert it to JPEG first')), JSON.stringify(await toasts(page)))
  }
  await env.ctx.close()
}
{
  // Chromium gives a dropped .heic no type at all: it still reaches the look (not silently ignored).
  const env = await open('/inbox', { view: desktop })
  const { page } = env
  await page.evaluate((b) => {
    const bin = Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bin], 'IMG_0414.heic', { type: '' }))
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, HEIC.toString('base64'))
  await waitFor(async () => (await page.getByText(/Convert it to JPEG first/).count()) === 1, 4000)
  check('heic desktop: a dropped .heic with no type → 11i "Convert it to JPEG first"', (await page.getByText(/Convert it to JPEG first/).count()) === 1)
  await shot(page, 'heic-desktop-day')
  await env.ctx.close()
}

// ── Side by side: the drawing | this build (design-<frame>.png from design-frames.mjs) ──
if (DESIGN) {
  const pairs = [
    ['11c', ['11c-day', '11c-lifted-day', '11c-night']],
    ['11e', ['11e-day', '11e-night']],
    ['11f', ['11f-menu-day', '11f-day', 'chip-priority-day']],
    ['11i', ['heic-day', 'heic-night']],
    ['11m', ['select-desktop-day', 'chip-date-desktop-day']],
  ]
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } })
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, mine] of pairs) {
    const a = path.join(DESIGN, `design-${frame}.png`)
    const bs = mine.map((m) => path.join(OUT, `${m}.png`)).filter((f) => fs.existsSync(f))
    if (!fs.existsSync(a) || !bs.length) continue
    const wide = frame === '11m'
    await page.setContent(`<body style="margin:0;padding:16px;background:#e9e4d8;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;font:13px sans-serif;width:max-content;max-width:${wide ? 2600 : 2400}px"><div><div>the drawing · ${frame}</div><img src="${img(a)}" style="max-width:${wide ? 1300 : 1000}px"></div>${bs.map((b) => `<div><div>this build · ${path.basename(b, '.png')}</div><img src="${img(b)}" style="${wide ? 'width:1000px' : ''}"></div>`).join('')}</body>`)
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
