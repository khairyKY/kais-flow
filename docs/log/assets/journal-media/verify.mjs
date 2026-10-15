// Journal "Talk it out" + "＋ Photo" (Kai 2026-10-12: neither did anything) on the REAL /journal page,
// signed in against a MOCKED backend — the resurface/plan-replan recipe: the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, and Playwright answers
// REST, Storage and the `transcribe` function. Chrome's fake mic feeds the voice sheet.
// v1.1.1 (journal hygiene) adds: a photo-only day counts as written (Day N, This week's "kept", Kept),
// and the photo's × is a ≥44px target at 360/390/430 that stays inside its own photo.
// v1.1.2 (phone taps) adds: the card footer's links and the thought editor's Cancel/Save are ≥44px targets that
// meet nothing (measureTaps).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5244'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(ok, ms = 8000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await ok()) return true
  return ok()
}

// ── a 400×300 PNG (a sage block), built by hand so the harness needs no image files ──
function png(w, h, [r, g, b], grain = 0) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  // `grain`: a gradient plus noise, closer to a phone photo than a flat block (the size check).
  const n = () => (grain ? Math.floor(Math.random() * grain) : 0)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = grain ? (x + y) / (w + h) : 0
      raw.set([(r + k * 80 + n()) & 255, (g - k * 60 + n()) & 255, (b + n()) & 255], y * (w * 3 + 1) + 1 + x * 3)
    }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const PHOTO = png(400, 300, [140, 170, 120])
const BIG = png(4000, 3000, [120, 150, 110], 24) // 12 MP with grain: the ≤500KB check

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const NOW = new Date(Date.UTC(2026, 9, 12, 7, 0)) // Mon 12 Oct 2026, 10:00 Cairo
const ENTRY = '20000000-0000-4000-8000-000000000001'
const SETTINGS = { user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const HEARD = 'Walked by the river and the heron was back.'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }

async function open(theme, view, { uploadFails = false, entries = null, quotes = [] } = {}) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', permissions: ['microphone'] })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
  }, [theme, JSON.stringify(session), UID])
  const state = {
    rows: {
      app_settings: [{ ...SETTINGS }],
      journal_entries: entries ?? [{ id: ENTRY, user_id: UID, body: 'Slow morning.', entry_date: '2026-10-12', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: '2026-10-12T05:30:00.000Z', updated_at: '2026-10-12T05:30:00.000Z' }],
      quotes,
    },
    writes: [],
    uploads: [],
    removed: [],
  }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (p === '/functions/v1/transcribe') return r.fulfill({ json: { text: HEARD } })
    if (p.startsWith('/storage/v1/object/sign/journal/')) return r.fulfill({ status: 200, contentType: 'image/png', body: PHOTO })
    if (p === '/storage/v1/object/sign/journal') {
      const { paths } = JSON.parse(req.postData() ?? '{}')
      return r.fulfill({ json: paths.map((x) => ({ error: null, path: x, signedURL: `/object/sign/journal/${x}?token=t` })) })
    }
    if (p.startsWith('/storage/v1/object/journal/') && req.method() === 'POST') {
      if (uploadFails) return r.abort('internetdisconnected')
      const key = p.replace('/storage/v1/object/journal/', '')
      // storage-js sends a Blob as multipart: the part's own type, and the JPEG's magic bytes inside.
      const body = req.postDataBuffer() ?? Buffer.alloc(0)
      state.uploads.push({ key, jpeg: body.includes(Buffer.from([0xff, 0xd8, 0xff])) && /content-type: image\/jpeg/i.test(body.toString('latin1')), bytes: body.length })
      return r.fulfill({ json: { Key: `journal/${key}`, Id: 'x' } })
    }
    if (p === '/storage/v1/object/journal' && req.method() === 'DELETE') {
      state.removed.push(...(JSON.parse(req.postData() ?? '{}').prefixes ?? []))
      return r.fulfill({ json: [] })
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
        const full = { ...(i >= 0 ? list[i] : null), ...row }
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
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://127.0.0.1:9/") && !m.text().includes('ERR_INTERNET_DISCONNECTED') && !m.text().includes('Failed to load resource') && errors.push(`console: ${m.text()}`))
  await page.goto(`${BASE}/journal`, { waitUntil: 'networkidle' })
  await page.getByText('Slow morning.').or(page.locator('textarea').first()).first().waitFor({ timeout: 10000 }).catch(() => {})
  await sleep(800)
  return { ctx, page, errors, state }
}

const lastEntry = (state) => state.writes.filter((w) => w.table === 'journal_entries' && w.row.id === ENTRY).at(-1)?.row
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
async function pickPhoto(page, label, buffer = PHOTO) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.getByRole('button', { name: label, exact: true }).click()])
  await chooser.setFiles({ name: 'river.png', mimeType: 'image/png', buffer })
}

for (const [label, view, width, talk] of [['phone', PHONE, 390, '🎤 Talk'], ['desk', DESKTOP, 1280, '🎤 Talk it out']]) {
  for (const theme of ['day', 'night']) {
    const name = `${label}-${theme}`
    const { ctx, page, errors, state } = await open(theme, view)

    // ── affordances are real buttons, terra like ＋ New entry ──
    const talkBtn = page.getByRole('button', { name: talk, exact: true })
    const photoBtn = page.getByRole('button', { name: '＋ Photo', exact: true })
    check(`${name} Talk + Photo are buttons`, (await talkBtn.count()) === 1 && (await photoBtn.count()) === 1)
    const [c1, c2] = await Promise.all([talkBtn.evaluate((e) => getComputedStyle(e).color), photoBtn.evaluate((e) => getComputedStyle(e).color)])
    check(`${name} affordances not hairline grey (terra)`, c1 === c2 && c1 !== 'rgba(0, 0, 0, 0)', c1)
    await shot(page, `${name}-1-footer`)

    // ── Talk it out → transcript appended + stored ──
    await talkBtn.click()
    await page.getByRole('dialog', { name: 'Voice capture' }).waitFor({ timeout: 5000 }).catch(() => {})
    await sleep(1500)
    await page.getByRole('button', { name: 'Stop & file' }).click().catch(() => {})
    const talked = await until(() => lastEntry(state)?.transcript === HEARD)
    check(`${name} Talk it out → transcript saved`, talked, JSON.stringify(lastEntry(state)?.transcript))
    check(`${name} Talk it out → body gains a paragraph`, lastEntry(state)?.body === `Slow morning.\n\n${HEARD}`, JSON.stringify(lastEntry(state)?.body))
    check(`${name} Talk it out → shows in the textarea`, await until(async () => (await page.locator('textarea').first().inputValue()).includes(HEARD)))
    check(`${name} Talk it out → no Inbox filing`, !state.writes.some((w) => w.table === 'inbox_items'))

    // ── ＋ Photo → upload to journal/<uid>/<entry>/…jpg, path on the entry, thumbnail ──
    await pickPhoto(page, '＋ Photo')
    const uploaded = await until(() => state.uploads.length === 1)
    const up = state.uploads[0]
    check(`${name} photo uploaded to the journal bucket under the owner`, uploaded && new RegExp(`^${UID}/${ENTRY}/[0-9a-f-]{36}\\.jpg$`).test(up?.key ?? ''), up?.key)
    check(`${name} photo re-encoded as JPEG ≤500KB (sent a PNG)`, up?.jpeg && up.bytes > 0 && up.bytes <= 500 * 1024, `jpeg=${up?.jpeg} ${up?.bytes}B`)
    check(`${name} media_paths carries the path`, await until(() => JSON.stringify(lastEntry(state)?.media_paths) === JSON.stringify([up?.key])), JSON.stringify(lastEntry(state)?.media_paths))
    check(`${name} body kept through the photo write`, lastEntry(state)?.body === `Slow morning.\n\n${HEARD}`)
    const thumb = page.locator('a[aria-label="Open photo"] img')
    check(`${name} thumbnail shows`, await until(async () => (await thumb.count()) === 1 && (await thumb.evaluate((i) => i.complete && i.naturalWidth > 0))))
    await thumb.scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, `${name}-2-photo`)

    // ── remove → gone at once with Undo (no confirm, 2026-10-12 grammar pass); the stored file is
    //    deleted only after the 6s Undo toast leaves ──
    await page.getByRole('button', { name: 'Remove photo' }).click()
    check(`${name} remove drops the path`, await until(() => (lastEntry(state)?.media_paths ?? ['x']).length === 0))
    check(`${name} thumbnail gone`, await until(async () => (await thumb.count()) === 0))
    check(`${name} remove deletes the object once the Undo toast is gone`, await until(() => state.removed.includes(up?.key), 15000), JSON.stringify(state.removed))

    if (name === 'desk-day') {
      await pickPhoto(page, '＋ Photo', BIG)
      const got = await until(() => state.uploads.length === 2, 20000)
      const big = state.uploads[1]
      check(`${name} a ${(BIG.length / 1048576).toFixed(1)} MB 12 MP photo uploads ≤500KB`, got && big.jpeg && big.bytes <= 500 * 1024, `${big?.bytes}B`)
    }

    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    check(`${name} no horizontal scroll at ${width}`, wide <= width, wide)
    check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ── offline: the upload fails, the words stay, a clear toast ──
  {
    const name = `${label}-offline`
    const { ctx, page, state } = await open('day', view, { uploadFails: true })
    await page.locator('textarea').first().fill('Slow morning. Still typing')
    await pickPhoto(page, '＋ Photo')
    const said = await until(async () => (await toasts(page)).some((t) => /your words are saved/.test(t)))
    check(`${name} failed upload → clear toast`, said, JSON.stringify(await toasts(page)))
    check(`${name} typing kept`, (await page.locator('textarea').first().inputValue()) === 'Slow morning. Still typing')
    check(`${name} body saved anyway`, await until(() => lastEntry(state)?.body === 'Slow morning. Still typing'))
    check(`${name} no media path written`, !state.writes.some((w) => w.table === 'journal_entries' && (w.row.media_paths ?? []).length))
    await shot(page, `${name}-toast`)
    // Truly offline: the toast says so.
    await ctx.setOffline(true)
    await pickPhoto(page, '＋ Photo')
    const offline = await until(async () => (await toasts(page)).some((t) => /Photos need a connection/.test(t)))
    check(`${name} offline → "needs a connection" toast`, offline, JSON.stringify(await toasts(page)))
    await ctx.close()
  }
}

// ── v1.1.1: today's entry with two photos, yesterday a photo and no words ──
const PHOTO_ONLY = '20000000-0000-4000-8000-000000000002'
const photoAt = (entry, n) => `${UID}/${entry}/30000000-0000-4000-8000-00000000000${n}.jpg`
const hygieneRows = () => [
  { id: ENTRY, user_id: UID, body: 'Slow morning.', entry_date: '2026-10-12', mood: null, transcript: null, media_paths: [photoAt(ENTRY, 1), photoAt(ENTRY, 2)], gratitude: [], deleted_at: null, created_at: '2026-10-12T05:30:00.000Z', updated_at: '2026-10-12T05:30:00.000Z' },
  { id: PHOTO_ONLY, user_id: UID, body: '', entry_date: '2026-10-11', mood: null, transcript: null, media_paths: [photoAt(PHOTO_ONLY, 3)], gratitude: [], deleted_at: null, created_at: '2026-10-11T18:00:00.000Z', updated_at: '2026-10-11T18:00:00.000Z' },
]

// The first photo's ×: drawn size, and every point a finger can hit it from (elementFromPoint over the
// photo and 20px around it), against its own photo, the next photo and the words above.
const measureX = () => {
  const x = document.querySelector('button[aria-label="Remove photo"]')
  const box = x.parentElement.getBoundingClientRect()
  const next = x.parentElement.nextElementSibling.getBoundingClientRect()
  const xr = x.getBoundingClientRect()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, outside = 0
  for (let px = Math.floor(box.left) - 20; px <= box.right + 20; px++)
    for (let py = Math.floor(box.top) - 20; py <= box.bottom + 20; py++) {
      if (document.elementFromPoint(px + 0.5, py + 0.5) !== x) continue
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py)
      if (px < box.left || px + 1 > box.right || py < box.top || py + 1 > box.bottom) outside++
    }
  const at = (px, py) => document.elementFromPoint(px, py)
  return {
    drawn: `${Math.round(xr.width)}x${Math.round(xr.height)}`,
    hit: `${x1 - x0 + 1}x${y1 - y0 + 1}`, w: x1 - x0 + 1, h: y1 - y0 + 1, outside,
    gap: Math.round(next.left - box.right),
    nextOwn: !!at(next.left + 2, next.top + 2)?.closest('a[aria-label="Open photo"]') && at(next.left + 2, next.top + 2) !== x,
    aboveOwn: at(xr.left + xr.width / 2, box.top - 2) !== x,
    imageOwn: !!at(box.left + 6, box.bottom - 6)?.closest('a[aria-label="Open photo"]'),
  }
}

// v1.1.2 (phone taps): small text controls whose tap area grows to 44 (kf-hit-min). Every px around them goes through
// elementFromPoint: each control's area must be one solid ≥44×44 rectangle (a notch or an overlap would break it), no
// two may meet, and no px of a nearby control's drawn box (a photo, its ×, the textarea, a mood chip) may answer to one.
const measureTaps = (labels) => {
  const main = document.querySelector('.app-main-content')
  const els = [...main.querySelectorAll('button, a, input, textarea, span')]
  const targets = labels.map((l) => els.find((e) => e.textContent.trim() === l && (e.tagName === 'BUTTON' || getComputedStyle(e).cursor === 'pointer')))
  targets[0].scrollIntoView({ block: 'center' })
  // The quote card is turned −0.4°, and a turned rectangle sampled on a px grid comes out stair-stepped. A turn moves
  // nothing on the card relative to anything else on it, so measure it unturned (put back at the end).
  const turned = []
  for (let p = targets[0].parentElement; p && p !== main; p = p.parentElement) if (p.style.transform) turned.push([p, p.style.transform])
  for (const [p] of turned) p.style.transform = 'none'
  const drawn = targets.map((t) => t.getBoundingClientRect())
  const near = els.filter((e) => !targets.some((t) => t === e || t.contains(e) || e.contains(t)) && (e.tagName !== 'SPAN' || getComputedStyle(e).cursor === 'pointer'))
    .map((e) => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width && r.height)
  const box = targets.map(() => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 }))
  const stolen = new Set()
  for (let x = Math.floor(Math.min(...drawn.map((r) => r.left))) - 40; x <= Math.max(...drawn.map((r) => r.right)) + 40; x++)
    for (let y = Math.floor(Math.min(...drawn.map((r) => r.top))) - 40; y <= Math.max(...drawn.map((r) => r.bottom)) + 40; y++) {
      const h = document.elementFromPoint(x + 0.5, y + 0.5)
      const i = targets.findIndex((t) => h && (t === h || t.contains(h)))
      if (i < 0) continue
      const b = box[i]
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.n++
      for (const [e, r] of near) if (x + 0.5 > r.left && x + 0.5 < r.right && y + 0.5 > r.top && y + 0.5 < r.bottom) stolen.add(`${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') ?? e.textContent).trim().slice(0, 20)}"`)
    }
  for (const [p, t] of turned) p.style.transform = t
  const meet = box.some((a, i) => box.some((b, j) => i < j && a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1))
  return {
    taps: targets.map((t, i) => {
      const b = box[i], w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1
      return { label: labels[i], drawnW: Math.round(drawn[i].width * 10) / 10, drawnH: Math.round(drawn[i].height * 10) / 10, w, h, solid: b.n === w * h }
    }),
    meet, stolen: [...stolen], near: near.length,
  }
}
const QUOTE = { id: '80000000-0000-4000-8000-000000000003', user_id: UID, text: 'Fear is the mind-killer.', author: 'Herbert', source: 'Dune', tags: [], book_id: null, page: '8', created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' }
const tapChecks = (name, what, m, drawnOk) => {
  const show = m.taps.map((t) => `${t.label} drawn ${t.drawnW}×${t.drawnH} hit ${t.w}×${t.h}${t.solid ? '' : ' (notched)'}`).join(' · ')
  check(`${name} ${what}: still drawn as before`, m.taps.every(drawnOk), show)
  check(`${name} ${what}: each a solid ≥44×44 tap area`, m.taps.every((t) => t.w >= 44 && t.h >= 44 && t.solid), show)
  check(`${name} ${what}: no two tap areas meet`, !m.meet)
  check(`${name} ${what}: nearby controls keep every px of their own (${m.near} checked)`, m.stolen.length === 0, m.stolen.join(', '))
}

for (const width of [360, 390, 430]) {
  const name = `phone-${width}`
  const { ctx, page, errors } = await open('day', { ...PHONE, viewport: { width, height: 844 } }, { entries: hygieneRows(), quotes: [QUOTE] })
  check(`${name} photo-only yesterday is a day written: "Journal · Day 2"`, await until(async () => (await page.getByText('Journal · Day 2', { exact: true }).count()) === 1), await page.getByText(/^Journal · Day/).allInnerTexts().catch(() => ''))
  const thumbs = page.locator('a[aria-label="Open photo"] img')
  await until(async () => (await thumbs.count()) === 2 && (await thumbs.evaluateAll((l) => l.every((i) => i.complete && i.naturalWidth > 0))))
  await page.getByRole('button', { name: 'Remove photo' }).first().scrollIntoViewIfNeeded()
  await sleep(300)
  const m = await page.evaluate(measureX)
  check(`${name} photo × still drawn 24px`, m.drawn === '24x24', m.drawn)
  check(`${name} photo × hit area ≥44px`, m.w >= 44 && m.h >= 44, m.hit)
  check(`${name} photo × hit area stays inside its own photo`, m.outside === 0, `${m.outside} px outside`)
  check(`${name} next photo (${m.gap}px away), the words above and the photo itself keep their taps`, m.nextOwn && m.aboveOwn && m.imageOwn, JSON.stringify({ nextOwn: m.nextOwn, aboveOwn: m.aboveOwn, imageOwn: m.imageOwn }))
  // The entry's Delete sits 4px above its words: no tap on the words may land on Delete (kf-hit-above).
  const del = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="Delete "][aria-label$=" entry"]')
    const ta = b?.closest('[id^="journal-"]')?.querySelector('textarea')
    if (!b || !ta) return { found: false }
    ta.scrollIntoView({ block: 'center' })
    const r = ta.getBoundingClientRect()
    let stolen = 0
    for (let y = Math.ceil(r.top); y < r.top + 16; y++) for (let x = Math.ceil(r.left); x < r.right; x += 4) if (document.elementFromPoint(x + 0.5, y + 0.5) === b) stolen++
    return { found: true, stolen }
  })
  check(`${name} a tap on an entry's words never lands on its Delete`, del.found && del.stolen === 0, JSON.stringify(del))
  await shot(page, `${name}-3-photo-x`)
  // The footer sits 23px under the photos; its links are drawn one 12.5px line tall (Bound Journal's phone
  // metadata, sentence case: 18.8px — 18 in the caps it replaced) and 12px apart.
  tapChecks(name, 'card footer', await page.evaluate(measureTaps, ['＋ New entry', '🎤 Talk', '＋ Photo']), (t) => Math.abs(t.drawnH - 18.8) < 0.5)
  // Cancel and Save, 6px apart, under the thought's textarea: already 44 tall, narrower than 44.
  await page.getByRole('button', { name: '＋ add a thought' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ timeout: 5000 }).catch(() => {})
  tapChecks(name, 'thought editor (Cancel, Save)', await page.evaluate(measureTaps, ['Cancel', 'Save']), (t) => t.drawnW < 44 && t.drawnH >= 44)
  check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

{
  const name = 'desk-written'
  const { ctx, page, errors } = await open('day', DESKTOP, { entries: hygieneRows() })
  const sunday = page.getByText('Sunday, Oct 11', { exact: true })
  await sunday.waitFor({ timeout: 8000 }).catch(() => {})
  const marker = await sunday.locator('xpath=following-sibling::div[1]').innerText().catch(() => '')
  check(`${name} a photo-only day is "kept" in This week`, marker.trim().toLowerCase() === 'kept', marker)
  check(`${name} Kept counts it: "2 days"`, await until(async () => (await page.getByText('2 days', { exact: true }).count()) === 1))
  check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
