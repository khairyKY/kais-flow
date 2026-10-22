// polish (2026-10-13): the last small pass before the release candidate, on the REAL app against a
// MOCKED backend (the fix-inbox recipe: dev server `--mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every REST call; writes are recorded AND applied).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=f1,i1 runs a subset)
// Items 1–3 of the brief: f1 Focus settings fit · i1–i3 Inbox snoozed view + Someday task · p1–p4 Paper
// (11d badge, 11e drawings, "Delete after reading" keeps a drawing's photo, 11m desktop keys).
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00 unless a check says otherwise.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5265'
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: CREATED, updated_at: CREATED }
const base = () => ({ tasks: [], calendar_events: [], inbox_items: [], projects: [], domains: [], areas: [], people: [], routines: [], routine_completions: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phoneAt = (width) => ({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })
const phone = phoneAt(390)

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: { ...base(), ...structuredClone(o.tables ?? {}) }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
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
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    const q = decodeURIComponent(url.search)
    if (q.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    else if (q.includes('deleted_at=is.null')) rows = rows.filter((x) => !x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  await o.before?.(ctx) // later routes win: a check's own handlers (Storage) go over the REST mock
  const page = await ctx.newPage()
  await page.clock.install({ time: o.now ?? cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

// ── f1 · Focus settings card fits a phone (360 / 390 / 430) and the computer card ─────────────
if (want('f1')) {
  for (const theme of ['day', 'night']) {
    for (const [label, view] of [['360', phoneAt(360)], ['390', phone], ['430', phoneAt(430)], ['desktop', desktop]]) {
      const { ctx, page, errors } = await open('/focus', { view, theme })
      await page.locator('[title="pomodoro settings"]').first().click()
      await sleep(500)
      const m = await page.evaluate(() => {
        const card = document.querySelector('.fp-card-in')
        const c = card.getBoundingClientRect()
        let worst = 0
        for (const el of card.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (!r.width) continue
          worst = Math.max(worst, r.right - c.right, c.left - r.left)
        }
        return { left: c.left, right: c.right, vw: innerWidth, worst, scrollW: document.scrollingElement.scrollWidth }
      })
      const inView = m.left >= 0 && m.right <= m.vw
      const centred = Math.abs(m.left - (m.vw - m.right)) <= 1.5
      check(`f1 focus settings ${label} ${theme}: card inside the screen${label === 'desktop' ? '' : ' and centred'}, nothing past its edge`,
        inView && (label === 'desktop' || centred) && m.worst <= 0.5 && m.scrollW <= m.vw,
        `card ${m.left.toFixed(1)}–${m.right.toFixed(1)} of ${m.vw}, worst overflow ${m.worst.toFixed(1)}px, scrollWidth ${m.scrollW}, errors ${errors.length}`)
      await shot(page, `f1-focus-settings-${label}-${theme}`)
      // Taller than the screen on a small phone: its top isn't clipped, and scrolling reaches its foot.
      const v = await page.evaluate(async () => {
        const card = document.querySelector('.fp-card-in')
        const top = card.getBoundingClientRect().top
        for (let el = card.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight
        document.scrollingElement.scrollTop = 1e6
        await new Promise((r) => setTimeout(r, 300))
        const foot = [...card.querySelectorAll('button, span')].find((s) => /reset to classic/i.test(s.textContent)).getBoundingClientRect() // a kit text button since Bound Journal
        const hit = document.elementFromPoint(foot.left + foot.width / 2, foot.top + foot.height / 2)
        return { top, footBottom: foot.bottom, vh: innerHeight, footHit: /reset to classic/i.test(hit?.textContent ?? '') }
      })
      check(`f1 focus settings ${label} ${theme}: top not clipped, "reset to classic" reachable`, v.top >= 0 && v.footBottom <= v.vh && v.footHit,
        `top ${v.top.toFixed(0)}, foot bottom ${v.footBottom.toFixed(0)} of ${v.vh}, tappable ${v.footHit}`)
      await ctx.close()
    }
  }
}

// ── i1–i3 · Inbox: snoozed captures get a view; Someday files a someday task ─────────────────────
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ib = (n, over) => ({ id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('09:00', 8), updated_at: iso('09:00', 8), ...over })
const P1 = 'b0000000-0000-4000-8000-000000000001'
const INBOX = {
  projects: [{ id: P1, user_id: UID, name: 'Forecasting App', domain_id: null, type: 'standard', status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }],
  inbox_items: [
    ib(1, { raw_text: 'learn the cello someday', ai_parse: { kind: 'task', title: 'Learn the cello', confidence: 0.9, project_id: P1, due_at: iso('09:00', 14), has_time: false }, confidence: 0.9 }),
    ib(2, { raw_text: 'renew hosting before the 15th' }),
    ib(3, { raw_text: 'call the plumber', snoozed_until: iso('09:00', 13) }),
    ib(4, { kind: 'voice', raw_text: 'look at standing desks', snoozed_until: iso('09:00', 19) }),
    ib(5, { raw_text: 'already back', snoozed_until: iso('08:00', 12) }),
    ib(6, { raw_text: 'old idea', status: 'dismissed', updated_at: iso('08:00', 12) }),
  ],
}
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).click()
const rowOf = (state, n) => state.rows.inbox_items.find((r) => r.id === iid(n))

if (want('i1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/inbox', { tables: INBOX, theme })
    const sum = await page.locator('.ib-sum').innerText()
    check(`i1 desktop ${theme}: the count line says "· 2 snoozed" (the one already back is waiting, not counted)`, /^3 to sort · .* · 2 snoozed$/.test(sum) && (await page.locator('[id="inbox-' + iid(5) + '"]').count()) === 1, sum)
    await page.getByRole('button', { name: '2 snoozed' }).click()
    await sleep(400)
    const pressed = await page.locator('.ib-toggle [aria-pressed="true"]').innerText()
    const metas = await page.locator('.ib-drow .ib-meta').allInnerTexts()
    check(`i1 desktop ${theme}: Snoozed view — toggle on "Snoozed 2", rows soonest first with when they come back`, pressed === 'Snoozed 2' && metas.join('|').toLowerCase() === 'back tomorrow · 9:00 am|back mon 19 oct · 9:00 am' /* 12h (lib/clock, cal-polish 2026-10-22) */, `${pressed} · ${metas.join(' | ')}`)
    await shot(page, `i1-snoozed-desktop-${theme}`)
    if (theme === 'day') {
      await page.locator(`[id="inbox-${iid(3)}"]`).getByRole('button', { name: /Unsnooze/ }).click()
      const t = await toastSoon(page, 'Restored to Inbox')
      await sleep(300)
      const woke = rowOf(state, 3)
      check('i1 Unsnooze: the capture is waiting again now, the view and count drop to 1, toast with Undo', t && woke.snoozed_until === null && woke.status === 'pending' && (await page.locator('.ib-drow').count()) === 1 && /1 snoozed/.test(await page.locator('.ib-sum').innerText()), JSON.stringify({ t, snoozed_until: woke.snoozed_until }))
      await undo(page, 'Restored to Inbox')
      await sleep(500)
      check('i1 Undo: snoozed again until tomorrow 09:00', rowOf(state, 3).snoozed_until === iso('09:00', 13) && (await page.locator('.ib-drow').count()) === 2, rowOf(state, 3).snoozed_until)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('r')
      check('i1 R on the focused snoozed row brings it back too', await toastSoon(page, 'Restored to Inbox'))
      await undo(page, 'Restored to Inbox')
      await sleep(400)
      await page.locator('.ib-toggle').getByRole('button', { name: /^Waiting/ }).click()
      await sleep(400)
      check('i1 the toggle leads back to Waiting (and the Snoozed segment goes away)', (await page.locator('.ib-toggle .kf-seg-btn').count()) === 2 && (await page.locator('.ib-toggle [aria-pressed="true"]').innerText()).startsWith('Waiting'))
    }
    check(`i1 desktop ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

if (want('i2')) {
  // Someday from the card's Snooze menu, on the computer (S key) and the phone (the card's button).
  for (const [label, view] of [['desktop', desktop], ['phone', phone]]) {
    const { ctx, page, errors, state } = await open('/inbox', { tables: INBOX, view })
    const card = page.locator(`[id="inbox-${iid(1)}"]`)
    if (label === 'desktop') {
      await card.click({ position: { x: 5, y: 5 } }).catch(() => {})
      await page.keyboard.press('Escape')
      await card.focus()
      await card.getByRole('button', { name: /^Snooze/ }).click()
    } else {
      await card.getByRole('button', { name: /^Snooze/ }).click()
    }
    await sleep(400)
    await page.getByRole('button', { name: /Someday/ }).last().click()
    const t = await toastSoon(page, 'to Someday')
    await sleep(500)
    const task = state.rows.tasks.find((x) => x.title === 'Learn the cello')
    const msg = await page.locator('.kf-toast-msg').first().innerText().catch(() => '')
    check(`i2 ${label}: Someday files a someday task (no date, the card's project), the capture is filed, not snoozed a year`,
      t && task?.someday === true && task.due_at === null && task.project_id === P1 && rowOf(state, 1).status === 'filed' && !rowOf(state, 1).snoozed_until,
      `${msg} · ${JSON.stringify({ someday: task?.someday, due_at: task?.due_at, project: task?.project_id === P1, item: rowOf(state, 1).status })}`)
    check(`i2 ${label}: the toast says where it went`, msg === 'Filed "Learn the cello" to Someday · Forecasting App', msg)
    await shot(page, `i2-someday-toast-${label}`)
    await undo(page, 'to Someday')
    await sleep(600)
    check(`i2 ${label}: Undo deletes the task and the capture waits again`, !state.rows.tasks.some((x) => x.title === 'Learn the cello') && rowOf(state, 1).status === 'pending' && (await card.count()) === 1)
    check(`i2 ${label}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

if (want('i3')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/inbox', { tables: INBOX, view: phone, theme })
    const sum = await page.locator('.ib-sum').innerText()
    await page.getByRole('button', { name: '2 snoozed' }).click()
    await sleep(400)
    const link = await page.locator('.ib-head-link').innerText()
    const metas = await page.locator('.ib-drow .ib-meta').allInnerTexts()
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.ib-page *')].every((e) => e.getBoundingClientRect().right <= innerWidth + 0.5))
    check(`i3 phone ${theme}: "· 2 snoozed" → the Snoozed view, the link reads "Waiting 3", rows say when they come back, nothing off the edge`,
      /2 snoozed/.test(sum) && link === 'Waiting 3' && /back Tomorrow · 9:00 AM/i.test(metas[0] ?? '') /* 12h (lib/clock, cal-polish 2026-10-22) */ && wide, `${sum} · ${link} · ${metas.join(' | ')}`)
    await shot(page, `i3-snoozed-phone-${theme}`)
    await page.locator('.ib-head-link').click()
    await sleep(300)
    check(`i3 phone ${theme}: the link leads back to Waiting`, (await page.locator('.ib-head-link').innerText()).startsWith('Dismissed') && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── p1–p4 · Paper: 11e's skipped drawing → Add as image, 11m's desktop keys, 11d's badge ──────────
const CAPTURE_ID = 'c0000000-0000-4000-8000-0000000000aa'
const pline = (text, type, row, over = {}) => ({ text, type, when: null, project: null, confidence: 0.92, box: [0.09, (110 + row * 80) / 1200, 0.82, 0.05], page: 0, checked: null, priority: null, ...over })
const READY = {
  id: CAPTURE_ID, user_id: UID, storage_paths: [`${UID}/${CAPTURE_ID}/0.jpg`], pages: 1, pages_read: 1, status: 'done', error: null, title: 'OS lecture 3',
  items: [pline('OS lecture 3 — 4 Oct', 'note', 0), pline('Assignment 2', 'task', 1), pline('Read ch. 4 — scheduling', 'task', 2), pline('Buy blue pens', 'task', 3)],
  drawings: [{ what: 'CPU → ready → run', box: [0.12, 0.5, 0.6, 0.18], page: 0 }],
  reviewed_at: null, expires_at: iso('09:00', 19), photos_deleted_at: null, created_at: iso('09:40'), updated_at: iso('09:52'),
}
const PAPER = (keep = true) => ({ captures: [READY], app_settings: [{ ...SETTINGS, capture_keep_photos: keep }], inbox_items: [ib(1, { raw_text: 'Renew the library card' })] })
let PAGE_JPEG = null
async function pageJpeg() {
  if (PAGE_JPEG) return PAGE_JPEG
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  await p.setContent(`<body style="margin:0;background:#f4f0e6;font:46px cursive;color:#2d3b5a">${['OS lecture 3 — 4 Oct', '• Assignment 2', '• Read ch. 4', '• buy blue pens'].map((t, i) => `<div style="position:absolute;left:80px;top:${110 + i * 80}px">${t}</div>`).join('')}<div style="position:absolute;left:110px;top:600px;font-size:40px">[CPU] → [ready] → [run]</div></body>`)
  PAGE_JPEG = await p.screenshot({ type: 'jpeg', quality: 85 })
  await p.close()
  return PAGE_JPEG
}
async function openPaper(route, o = {}) {
  const env = await open(route, { ...o, tables: PAPER(o.keep ?? true), before: async (ctx) => {
    const jpeg = await pageJpeg()
    await ctx.route('http://127.0.0.1:9/storage/**', async (r) => {
      const p = new URL(r.request().url()).pathname
      if (p.startsWith('/storage/v1/object/sign/captures') && r.request().method() === 'POST') {
        const body = r.request().postDataJSON()
        const paths = body.paths ?? [p.replace('/storage/v1/object/sign/captures/', '')]
        const signed = paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/captures/${x}?token=t` }))
        return r.fulfill({ json: body.paths ? signed : { signedURL: signed[0].signedURL } })
      }
      return r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg })
    })
  } })
  return env
}

if (want('p1')) {
  // 11d: the ready page counts in the Inbox badge (sidebar on a computer, the tab bar on a phone).
  for (const [label, view] of [['desktop', desktop], ['phone', phone]]) {
    const { ctx, page, errors } = await openPaper('/today', { view })
    const badge = label === 'desktop'
      ? await page.locator('.app-nav-badge').first().innerText().catch(() => '')
      : await page.locator('.app-tabbar').getByRole('link', { name: /Inbox/ }).innerText().catch(() => '')
    check(`p1 ${label}: the Inbox badge counts the ready page (1 capture + 1 page = 2)`, /\b2\b/.test(badge) && errors.length === 0, JSON.stringify(badge))
    await ctx.close()
  }
}

if (want('p2')) {
  // 11e: "1 drawing skipped (CPU → ready → run) · Add as image" under the lines, phone + desktop, day + night.
  for (const [label, view] of [['phone', phone], ['desktop', desktop]]) {
    for (const theme of ['day', 'night']) {
      const { ctx, page, errors, state } = await openPaper('/inbox', { view, theme })
      await page.locator('.pp-ready').getByRole('button', { name: 'Review' }).click()
      await sleep(900)
      const row = page.locator('.pp-drawing')
      const words = await row.innerText().catch(() => '')
      check(`p2 ${label} ${theme}: the drawing row reads as 11e draws it`, /1 drawing skipped \(CPU → ready → run\)\s*Add as image/.test(words), JSON.stringify(words))
      await row.scrollIntoViewIfNeeded().catch(() => {})
      await shot(page, `p2-drawing-row-${label}-${theme}`)
      if (theme === 'day') {
        await row.getByRole('button', { name: 'Add as image' }).click()
        const t = await toastSoon(page, 'Drawing added to the Inbox as an image')
        await sleep(300)
        const note = state.rows.inbox_items.find((x) => x.payload?.drawing)
        check(`p2 ${label}: Add as image → an Inbox photo note (the page, the drawing's box), toast with Undo, row says "In the Inbox"`,
          t && note?.raw_text === 'Drawing: CPU → ready → run' && note.payload.source === 'photo' && note.payload.source_ref === CAPTURE_ID && note.payload.box?.join() === '0.12,0.5,0.6,0.18' && /In the Inbox/.test(await row.innerText()),
          JSON.stringify(note?.payload))
        await undo(page, 'Drawing added')
        await sleep(400)
        check(`p2 ${label}: Undo removes the note, the row offers Add as image again`, !state.rows.inbox_items.some((x) => x.payload?.drawing) && (await row.getByRole('button', { name: 'Add as image' }).count()) === 1)
      }
      check(`p2 ${label} ${theme}: no page errors, nothing off the edge`, errors.length === 0 && (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), errors.join(' | '))
      await ctx.close()
    }
  }
}

if (want('p3')) {
  // "Delete after reading" + a drawing sent as an image: Add all keeps the photo (the note shows it).
  for (const added of [false, true]) {
    const { ctx, page, state } = await openPaper('/inbox', { view: desktop, keep: false })
    await page.locator('.pp-ready').getByRole('button', { name: 'Review' }).click()
    await sleep(900)
    if (added) {
      await page.locator('.pp-drawing').getByRole('button', { name: 'Add as image' }).click()
      await sleep(300)
    }
    await page.getByRole('button', { name: /^Add all/ }).click()
    await sleep(600)
    const cap = state.writes.filter((w) => w.table === 'captures').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body)).at(-1)
    const kept = cap?.expires_at === READY.expires_at
    check(`p3 Delete after reading, ${added ? 'a drawing added: the photo is kept' : 'no drawing: the photo goes'}`, cap?.reviewed_at && (added ? kept : !kept), `expires_at ${cap?.expires_at}`)
    await ctx.close()
  }
}

if (want('p4')) {
  // 11m: "⏎ Add all · ⌫ drop line · T change type" on the computer — paper-review (2026-10-22) made the line
  // "↑↓ a line · ⏎ add · ⌫ dismiss · T type · A select all": ⏎ adds the ringed line (all with none ringed), ⌫ dismisses.
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await openPaper('/inbox', { view: desktop, theme })
    await page.locator('.pp-ready').getByRole('button', { name: 'Review' }).click()
    await sleep(900)
    const hint = await page.locator('.pp-keys').innerText().catch(() => '')
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
    check(`p4 ${theme}: the keys line as 11m draws it; Add all has the focus`, hint === '↑↓ a line · ⏎ add · ⌫ dismiss · T type · A select all' && /Add all 4/.test(focused), `${hint} · focus "${focused}"`)
    await shot(page, `p4-keys-desktop-${theme}`)
    if (theme === 'day') {
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await sleep(200)
      const ring = await page.locator('.pp-row.is-ringed .pp-row-text').innerText()
      await page.keyboard.press('Backspace')
      await sleep(300)
      const left = await page.locator('.pp-row .pp-row-text').allInnerTexts()
      const ring2 = await page.locator('.pp-row.is-ringed .pp-row-text').innerText().catch(() => '')
      check('p4 ↓↓ then ⌫ dismisses that line ("Line dismissed" + Undo), the ring moves on', ring === 'Assignment 2' && !left.includes('Assignment 2') && ring2 === 'Read ch. 4 — scheduling' && (await toastSoon(page, 'Line dismissed')), `${ring} → ${ring2} · ${left.join(' | ')}`)
      await page.keyboard.press('t')
      await sleep(400)
      const menu = page.locator('[role="menu"]')
      check('p4 T opens the type menu for the ringed line', (await menu.count()) === 1 && /Event/.test(await menu.innerText()))
      await page.keyboard.press('Backspace') // a menu is up: the keys are the menu's, nothing drops
      await sleep(200)
      await menu.getByText('Event', { exact: true }).click()
      await sleep(300)
      const type = await page.locator('.pp-row.is-ringed .pp-type').innerText()
      check('p4 the pick lands on that line (Read ch. 4 → Event), ⌫ under the menu dropped nothing', /Event/.test(type) && (await page.locator('.pp-row').count()) === 3, type)
      await page.keyboard.press('Enter') // ⏎ adds the ringed line now (paper-review)
      await sleep(700)
      check('p4 ⏎ adds the ringed line alone: Read ch. 4 (an undated event) to the Inbox', state.rows.inbox_items.some((i) => i.raw_text === 'Read ch. 4 — scheduling') && state.rows.tasks.length === 0, JSON.stringify(state.rows.inbox_items.map((i) => i.raw_text)))
      await page.getByRole('button', { name: /^Add all/ }).first().click()
      await sleep(700)
      const tasks = state.rows.tasks.map((t) => t.title)
      const inbox = state.rows.inbox_items.map((i) => i.raw_text)
      // An event with no date goes to the Inbox (planWrites), the heading is a note there too.
      check('p4 Add all adds what is left: Buy blue pens a task, the heading to the Inbox (the event went first), Assignment 2 nowhere; the results close',
        tasks.join() === 'Buy blue pens' && inbox.includes('Read ch. 4 — scheduling') && inbox.includes('OS lecture 3 — 4 Oct') && !inbox.includes('Assignment 2') && (await page.locator('.pp-keys').count()) === 0, JSON.stringify({ tasks, inbox }))
    }
    check(`p4 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── results ─────────────────────────────────────────────────────────────────────────────────────
await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
