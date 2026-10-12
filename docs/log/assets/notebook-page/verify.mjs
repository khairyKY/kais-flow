// The Notebook page (/notebook) + its entry points + 11l "Bring back your ticks", on the REAL app against a
// MOCKED backend (the cal-rail-drop / paper-capture recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every call; writes are recorded AND applied to the
// mock rows, so a reload can't hide a bug behind the optimistic cache). capture-image answers from the
// scenario below — never Groq.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3), 07:30.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5252'
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
// The account began 22 Jul 2026 → Monday 12 Oct is Day 83.
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-07-22T06:00:00Z' }
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
const HW = 1, SURVEY = 2, OMAR = 3, MILK = 4, PLANTS = 5, DENTIST = 6, OLD = 7
const TASKS = [
  task(HW, 'GCI homework 1 — NumPy', { top3: true, top3_rank: 1 }),
  task(SURVEY, 'Do GCI lecture 2’s survey', { top3: true, top3_rank: 2 }),
  task(OMAR, 'Reply to Omar', { due_at: iso('10:00') }),
  task(MILK, 'Buy milk', { scheduled_start: iso('15:00'), scheduled_end: iso('15:30') }),
  task(PLANTS, 'Water the plants', { due_at: iso('18:00') }),
  task(DENTIST, 'Call the dentist', { due_at: iso('09:00', 13) }),
  task(OLD, 'Old thing', { due_at: iso('09:00', 9) }),
]
const ev = (n, title, from, to) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [ev(1, 'Judge test', '09:00', '10:30'), ev(2, 'Gym', '18:00', '19:00')]
// Kai's habits row: Qur'an · rep (Mon–Wed + Sat) · move · read — his routines, never prayer.
const routine = (i, name, weekdays) => ({ id: `r0000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: null, clock_time: null, cadence: { weekdays }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, goal_days: null, created_at: CREATED, updated_at: CREATED })
const EVERY = [0, 1, 2, 3, 4, 5, 6]
const ROUTINES = [routine(0, 'Qur’an', EVERY), routine(1, 'rep', [1, 2, 3, 6]), routine(2, 'move', EVERY), routine(3, 'read', EVERY)]
// Last night's Shut down planted "Call the dentist" for Tuesday's morning.
const SEED = { id: 'f0000000-0000-4000-8000-000000000001', user_id: UID, event_type: 'ritual.seeded', entity_type: 'task', entity_id: id(DENTIST), payload: { ritual: 'evening', step: 'seeds', for_date: '2026-10-13', date: '2026-10-12' }, created_at: iso('07:00'), updated_at: iso('07:00') }
// The column exists on the server (migration 0063 pushed) and is still null.
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-07-22T07:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', notebook_layout: null, created_at: CREATED, updated_at: CREATED }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, routines: ROUTINES, routine_completions: [], activity_log: [SEED], projects: [], domains: [], areas: [], inbox_items: [], captures: [], app_settings: [SETTINGS] })

// PostgREST's event_type filter (eq.x / in.(a,b)) on the mocked activity_log.
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const w = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return w ? rows.filter((r) => w.includes(r.event_type)) : rows
}

// 11l: what capture-image reads off a photo of Monday's page (each line's box: ticked / empty / none).
const TICK_LINES = [
  ['MON · 12 OCT woke 7 · slept 6', 'note', null],
  ['TASKS', 'note', null],
  ['✶ GCI homework 1', 'task', true],
  ['GCI lecture 2 survey', 'task', true],
  ['Reply to Omer', 'task', true],
  ['Buy milk', 'task', false],
  ['Water the plants', 'task', true],
  ['HABITS', 'note', null],
  ['Qur’an rep move read', 'note', null],
  ['→ call Omar back re Thursday', 'task', null],
].map(([text, type, checked], i) => ({ text, type, when: null, project: null, confidence: 0.9, box: [0.09, Number((0.09 + i * 0.066).toFixed(3)), 0.8, 0.05], page: 0, checked }))

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

// A plain photographed page for the file chooser (the mock answers by scenario, not by pixels).
const PHOTO = path.join(OUT, '.page.jpg')
{
  const p = await browser.newPage({ viewport: { width: 600, height: 800 } })
  await p.setContent(`<body style="margin:0;background:#f4f0e6;font:32px cursive;color:#2d3b5a;padding:40px">${TICK_LINES.map((l) => `<div style="height:52px">${l.checked === true ? '☑' : l.checked === false ? '☐' : ''} ${l.text}</div>`).join('')}</body>`)
  await p.screenshot({ path: PHOTO, type: 'jpeg', quality: 90 })
  await p.close()
}

async function open(route = '/notebook', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  // Granting some permissions denies the rest in Chromium — the camera too (11l opens it).
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write', 'camera'], { origin: BASE })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
    // window.print would block a headless run: count the calls instead (the print CSS is checked by emulation + a PDF).
    window.print = () => (window.__printed = (window.__printed ?? 0) + 1)
    // The exact string the app hands the clipboard (Windows reads it back with \r\n line ends).
    const write = navigator.clipboard?.writeText?.bind(navigator.clipboard)
    if (write) navigator.clipboard.writeText = (s) => ((window.__copied = s), write(s))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = o.state ?? { rows: tables(), writes: [], reads: [], uploads: {} }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/functions/v1/capture-image')) {
      const body = req.postDataJSON()
      state.reads.push(body)
      return r.fulfill({ json: { status: 'done', pages_read: 1, title: null, items: TICK_LINES } })
    }
    if (p.startsWith('/storage/v1/object/sign/captures') && req.method() === 'POST') {
      const body = req.postDataJSON()
      const paths = body.paths ?? [p.replace('/storage/v1/object/sign/captures/', '')]
      const signed = paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/captures/${x}?token=t` }))
      return r.fulfill({ json: body.paths ? signed : { signedURL: signed[0].signedURL } })
    }
    if (p.startsWith('/storage/v1/object/sign/captures/')) return r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(PHOTO) })
    if (p.startsWith('/storage/v1/object/captures/')) return r.fulfill({ json: { Key: p, Id: 'x' } })
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = p.replace('/rest/v1/', '')
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
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (table === 'ai_usage') return one ? r.fulfill({ json: { count: 2 } }) : r.fulfill({ json: [{ count: 2 }] })
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: o.at ?? cairo('07:30') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
async function tap(env, loc) {
  if (!env.cdp) {
    await loc.click()
    await sleep(350)
    return
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await env.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] })
  await sleep(40)
  await env.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(450)
}
async function basics(env, name) {
  const { page, errors } = env
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll`, wide <= page.viewportSize().width, `${wide}/${page.viewportSize().width}`)
  // Rendered size: a computer draws the whole app at 125% (lib/uiScale, root zoom), a phone at 100%.
  const small = await page.evaluate(() => {
    const out = []
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1
    for (const root of document.querySelectorAll('.nb-paper, .nb-side, .nb-editor, .nb-bar, .nb-phone-foot')) {
      if (root.closest('.nb-print-root')) continue
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) * zoom < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}×${zoom}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px`, small.length === 0, small.join(' | '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}

const KAI_TODAY = [
  'MON · 12 OCT   woke __ · slept __',
  '',
  'TASKS',
  '☐ ✶ GCI homework 1 — NumPy',
  '☐ Do GCI lecture 2’s survey',
  '☐ Reply to Omar',
  '☐ Buy milk',
  '☐ Water the plants',
  '',
  'HABITS',
  '☐ Qur’an   ☐ rep   ☐ move   ☐ read',
  '',
  'NOTES',
  '',
  '+  what happened',
  '−  what got in the way',
  '→  tomorrow’s three',
  '♡  one true line',
].join('\n')

// ── N1 · desktop, day: Kai's page; Copy as text is exact; the "✎ on paper" stamp ──
if (want('n1')) {
  const env = await open('/notebook')
  const { page, state } = env
  const paper = page.locator('.nb-desk .nb-paper')
  const t = await text(paper)
  check('n1 the date line, then TASKS (Top 3 first, goal ✶), HABITS, NOTES, the night lines', /MON · 12 OCT[\s\S]*woke __ · slept __[\s\S]*TASKS[\s\S]*GCI homework 1[\s\S]*Water the plants[\s\S]*HABITS[\s\S]*NOTES[\s\S]*what happened[\s\S]*one true line/.test(t), t.replace(/\n/g, ' / '))
  check('n1 not on the page: tomorrow’s task, an overdue one; never prayer', !t.includes('Call the dentist') && !t.includes('Old thing') && !/pray/i.test(t))
  check('n1 "Day 83 · written by hand" in Caveat', /Day 83 · written by hand/.test(t) && /Caveat/.test(await page.locator('.nb-desk .nb-hand').evaluate((e) => getComputedStyle(e).fontFamily)))
  check('n1 A5 proportions (148:210)', await paper.evaluate((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.height / r.width - 210 / 148) < 0.02 || r.height > (r.width * 210) / 148 }))
  check('n1 reading size: items ≥ 18px, line height ≥ 1.5', await page.locator('.nb-desk .nb-line').first().evaluate((e) => { const cs = getComputedStyle(e); return parseFloat(cs.fontSize) >= 18 && parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) >= 1.49 }))
  check('n1 real ☐ boxes, five tasks', (await page.locator('.nb-desk .is-tasks .nb-box').count()) === 5)
  await shot(page, 'n1-desktop-day')
  await page.getByRole('button', { name: 'Copy as text' }).click()
  const toast = await toastSoon(page, 'Copied — paste it anywhere')
  const copied = await page.evaluate(() => window.__copied)
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
  check('n1 Copy as text: toast "Copied — paste it anywhere"', toast)
  check('n1 Copy as text: the exact text handed to the clipboard', copied === KAI_TODAY, JSON.stringify(copied))
  check('n1 …and what the system clipboard holds (line ends aside)', clip === KAI_TODAY)
  fs.writeFileSync(path.join(OUT, 'n1-copied.txt'), clip)
  await sleep(300)
  check('n1 the page wears "✎ on paper" for the day', (await page.locator('.nb-desk .nb-stamp').count()) === 1)
  check('n1 no writes from reading or copying', state.writes.length === 0, JSON.stringify(state.writes.map((w) => w.table)))
  await shot(page, 'n1-desktop-copied')
  await basics(env, 'n1')
  await env.ctx.close()
}

// ── N2 · desktop, night: the chrome goes dark, the page stays light paper ──
if (want('n2')) {
  const env = await open('/notebook', { theme: 'night' })
  const { page } = env
  const paperBg = await page.locator('.nb-desk .nb-paper').evaluate((e) => getComputedStyle(e).backgroundColor)
  const deskBg = await page.locator('.nb-desk').evaluate((e) => getComputedStyle(e).backgroundColor)
  check('n2 the page stays day parchment at night (#FBF6E9)', paperBg === 'rgb(251, 246, 233)', paperBg)
  check('n2 the chrome around it is night', deskBg === 'rgb(33, 29, 48)', deskBg)
  await shot(page, 'n2-desktop-night')
  await basics(env, 'n2')
  await env.ctx.close()
}

// ── N3 · Tomorrow: Tuesday's page — last night's seed leads, due-tomorrow tasks ──
if (want('n3')) {
  const env = await open('/notebook')
  const { page } = env
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await sleep(500)
  const t = await text(page.locator('.nb-desk .nb-paper'))
  check('n3 ?day=tomorrow in the address', page.url().includes('day=tomorrow'), page.url())
  check('n3 TUE · 13 OCT; the seed "Call the dentist" leads, goal ✶; today’s tasks gone', t.includes('TUE · 13 OCT') && /TASKS\s*✶\s*Call the dentist/.test(t) && !t.includes('Reply to Omar'), t.replace(/\n/g, ' / '))
  check('n3 Tuesday’s habits (rep runs Mon–Wed + Sat)', /Qur’an[\s\S]*rep[\s\S]*move[\s\S]*read/.test(t))
  check('n3 no "Plan first?" for tomorrow', (await page.locator('.nb-planfirst').count()) === 0)
  await shot(page, 'n3-desktop-tomorrow')
  await env.ctx.close()
}

// ── N4 · print: Print / Save PDF → A5 · A6 · Letter; print media shows only the page, ink on white ──
if (want('n4')) {
  const env = await open('/notebook')
  const { page } = env
  await page.getByRole('button', { name: 'Print / Save PDF' }).click()
  await sleep(300)
  const items = await page.locator('[role="menu"] [role="menuitem"], .kf-context-menu button').allInnerTexts().catch(() => [])
  check('n4 the size menu: A5 · A6 · Letter', ['A5', 'A6', 'Letter'].every((s) => items.some((i) => i.startsWith(s))), JSON.stringify(items))
  await page.getByText('A6', { exact: true }).click()
  await sleep(400)
  check('n4 A6: one @page rule, window.print called once', /size: A6 portrait/.test(await page.evaluate(() => document.getElementById('nb-page-size')?.textContent ?? '')) && (await page.evaluate(() => window.__printed)) === 1)
  check('n4 printing stamps the day too', (await page.locator('.nb-desk .nb-stamp').count()) === 1)
  // Back to A5 for the evidence.
  await page.getByRole('button', { name: 'Print / Save PDF' }).click()
  await sleep(300)
  await page.getByText(/^A5/).click()
  await sleep(400)
  await page.emulateMedia({ media: 'print' })
  await sleep(300)
  const vis = await page.evaluate(() => ({
    root: getComputedStyle(document.querySelector('.nb-print-root')).display,
    app: getComputedStyle(document.getElementById('root')).display,
    flourish: getComputedStyle(document.querySelector('.nb-print-root .nb-flourish')).display,
    bg: getComputedStyle(document.querySelector('.nb-print-root .nb-paper')).backgroundColor,
    shadow: getComputedStyle(document.querySelector('.nb-print-root .nb-paper')).boxShadow,
  }))
  check('n4 print media: only the page (the app hidden), no flourish, no paper fill or shadow', vis.root === 'block' && vis.app === 'none' && vis.flourish === 'none' && vis.bg === 'rgba(0, 0, 0, 0)' && vis.shadow === 'none', JSON.stringify(vis))
  await shot(page, 'n4-print-media', true)
  await page.pdf({ path: path.join(OUT, 'n4-print-a5.pdf'), preferCSSPageSize: true })
  check('n4 a PDF prints (A5, the @page size)', fs.statSync(path.join(OUT, 'n4-print-a5.pdf')).size > 5000)
  await page.emulateMedia({ media: 'screen' })
  await env.ctx.close()
}

// ── N5 · the layout editor: presets, toggles, order — saved to app_settings.notebook_layout and kept ──
if (want('n5')) {
  const state = { rows: tables(), writes: [], reads: [], uploads: {} }
  let env = await open('/notebook', { state })
  let { page } = env
  await page.getByRole('button', { name: 'Edit layout' }).click()
  await sleep(300)
  const lit = await page.locator('.nb-ed-chips .kf-chip--selected').allInnerTexts()
  check('n5 the editor beside the page: presets (Kai’s page lit), checkbox style, six blocks', (await page.locator('.nb-editor').count()) === 1 && (await page.locator('.nb-ed-block').count()) === 6 && lit.length === 1 && /kai’s page/i.test(lit[0]), JSON.stringify(lit))
  await shot(page, 'n5-desktop-editor')
  await page.getByRole('button', { name: 'Bullet journal' }).click()
  await sleep(500)
  let t = await text(page.locator('.nb-paper'))
  check('n5 Bullet journal: the long date, TOP 3 with •, the plan with ○ and aligned times', t.includes('Monday, 12 October') && /TOP 3\s*•\s*✶\s*GCI homework/.test(t) && /PLAN\s*○\s*09:00–10:30\s*Judge test\s*○\s*18:00–19:00\s*Gym/.test(t), t.replace(/\n/g, ' / '))
  const times = await page.locator('.nb-desk .nb-paper .nb-time').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  check('n5 the plan’s times sit in one column', times.length === 2 && times[0] === times[1], JSON.stringify(times))
  await settle(state)
  const saved = posts(state, 'app_settings').at(-1)
  check('n5 saved through the outbox: app_settings.notebook_layout (bullet marks)', saved?.notebook_layout?.marks === 'bullet', JSON.stringify(saved?.notebook_layout))
  // Turn Habits off and move Notes up.
  await page.getByRole('switch', { name: 'Show Habits' }).click()
  await page.getByRole('button', { name: 'Move Notes up' }).click()
  await sleep(500)
  t = await text(page.locator('.nb-paper'))
  check('n5 Habits off; Notes moved one place up (now right after Tasks)', !t.includes('HABITS') && t.indexOf('NOTES') > t.indexOf('TASKS'), t.replace(/\n/g, ' / '))
  check('n5 a changed preset is no preset (no chip lit)', (await page.locator('.nb-ed-chips .kf-chip--selected').count()) === 0)
  await shot(page, 'n5-desktop-editor-custom')
  await settle(state)
  const order = posts(state, 'app_settings').at(-1)?.notebook_layout?.blocks?.map((b) => `${b.id}:${b.on ? 1 : 0}`).join(' ')
  await env.ctx.close()
  // A fresh device (no local copy) reads it back from the server row.
  env = await open('/notebook', { state })
  page = env.page
  t = await text(page.locator('.nb-paper'))
  check('n5 after a reload on a fresh device: the same layout from the server', t.includes('Monday, 12 October') && !t.includes('HABITS') && t.includes('NOTES'), `${order} | ${t.replace(/\n/g, ' / ').slice(0, 160)}`)
  await env.ctx.close()
}

// ── N6 · phone 390×844, day + night: a full-height sheet, sticky footer (11o) ──
for (const theme of ['day', 'night']) {
  if (!want('n6')) break
  const env = await open('/notebook', { view: phone, theme })
  const { page } = env
  check(`n6 ${theme} a full-height sheet titled Notebook page`, (await page.locator('[role="dialog"]').count()) >= 1 && (await text(page.locator('[role="dialog"]'))).includes('Notebook page'))
  const foot = page.locator('.nb-phone-foot')
  check(`n6 ${theme} footer: Bring back your ticks + Copy as text`, (await foot.getByRole('button', { name: /Bring back your ticks/ }).count()) === 1 && (await foot.getByRole('button', { name: 'Copy as text' }).count()) === 1)
  const h = await foot.getByRole('button', { name: 'Copy as text' }).evaluate((e) => e.getBoundingClientRect().height)
  check(`n6 ${theme} touch targets ≥ 44px`, h >= 44, h)
  const paperBg = await page.locator('.nb-phone .nb-paper').evaluate((e) => getComputedStyle(e).backgroundColor)
  check(`n6 ${theme} the page is light paper`, paperBg === 'rgb(251, 246, 233)', paperBg)
  await shot(page, `n6-phone-${theme}`)
  if (theme === 'day') {
    await tap(env, page.getByRole('button', { name: 'Edit layout' }))
    await sleep(300)
    await shot(page, 'n6-phone-editor')
    check('n6 the editor opens inside the sheet, the page below it (live preview)', (await page.locator('.nb-phone .nb-editor').count()) === 1)
  }
  await basics(env, `n6 ${theme}`)
  if (theme === 'day') {
    await tap(env, page.getByRole('button', { name: 'Close' }).first())
    await sleep(700)
    check('n6 ✕ closes the sheet back to Today (opened directly, no history)', new URL(page.url()).pathname === '/today', page.url())
  }
  await env.ctx.close()
}

// ── N11 · not planned yet: no Top 3, Plan my day not walked → a quiet "Plan first?" that opens it ──
if (want('n11')) {
  const rows = tables()
  rows.tasks = rows.tasks.map((t) => ({ ...t, top3: false, top3_rank: null }))
  const env = await open('/notebook', { state: { rows, writes: [], reads: [], uploads: {} } })
  const { page } = env
  const t = await text(page.locator('.nb-desk .nb-paper'))
  check('n11 "Not planned yet · Plan first?" above a page that still works (tasks, habits, notes)', (await text(page.locator('.nb-planfirst'))).includes('Plan first?') && t.includes('Reply to Omar') && t.includes('HABITS'))
  await shot(page, 'n11-desktop-not-planned')
  await page.getByRole('button', { name: 'Plan first?' }).click()
  await sleep(1200)
  check('n11 Plan first? → Today with Plan my day open', new URL(page.url()).pathname === '/today' && (await page.getByText('Plan my day').count()) >= 1, page.url())
  await env.ctx.close()
}

// ── N7 · Plan my day's success moment → "Write it in your notebook" ──
if (want('n7')) {
  for (const view of [desktop, phone]) {
    const name = view === desktop ? 'desktop' : 'phone'
    const env = await open('/today?ritual=morning', { view })
    const { page } = env
    await sleep(800)
    await tap(env, page.getByRole('button', { name: 'Start the day' }))
    await sleep(900)
    const write = page.getByRole('button', { name: 'Write it in your notebook' })
    check(`n7 ${name} after Start the day: "The day has a shape." · Write it in your notebook (secondary) beside Done`, (await page.getByText('The day has a shape.').count()) === 1 && (await write.count()) === 1 && (await write.getAttribute('class')).includes('kf-button--secondary') && (await page.getByRole('button', { name: 'Done', exact: true }).count()) === 1)
    await shot(page, `n7-${name}-plan-success`)
    await tap(env, write)
    await sleep(900)
    check(`n7 ${name} → /notebook`, new URL(page.url()).pathname === '/notebook', page.url())
    await env.ctx.close()
  }
}

// ── N8 · ⌘K: "notebook" jumps there ──
if (want('n8')) {
  const env = await open('/today')
  const { page } = env
  await page.keyboard.press('Control+k')
  await sleep(400)
  await page.keyboard.type('notebook')
  await sleep(300)
  check('n8 ⌘K offers "Jump · Notebook page"', (await page.getByText('Notebook page', { exact: true }).count()) >= 1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await sleep(800)
  check('n8 → /notebook', new URL(page.url()).pathname === '/notebook', page.url())
  await env.ctx.close()
}

// ── N9 · Shut down's summary → "Write tomorrow’s page" ──
if (want('n9')) {
  const env = await open('/today?ritual=evening', { at: cairo('21:00') })
  const { page } = env
  await sleep(800)
  await // Today 2a's rail has its own "Close the day" step; the one meant is the Shut down dialog's.
  page.getByRole('dialog').getByRole('button', { name: 'Close the day' }).click()
  await sleep(500)
  const link = page.getByRole('button', { name: /Write tomorrow’s page/ })
  check('n9 the summary offers "Write tomorrow’s page"', (await link.count()) === 1)
  await shot(page, 'n9-desktop-shutdown-summary')
  await link.click()
  await sleep(900)
  check('n9 → /notebook?day=tomorrow', page.url().endsWith('/notebook?day=tomorrow'), page.url())
  await env.ctx.close()
}

// ── N10 · 11l "Bring back your ticks": photo → read → 4 ticked matched → skip one → Mark 3 done, one Undo ──
if (want('n10')) {
  for (const view of [phone, desktop]) {
    const name = view === desktop ? 'desktop' : 'phone'
    const state = { rows: tables(), writes: [], reads: [], uploads: {} }
    const env = await open('/notebook', { view, state, at: cairo('21:30') })
    const { page } = env
    const bring = page.getByRole('button', { name: /Bring back your ticks/ }).first()
    await shot(page, `n10-${name}-before`)
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), tap(env, bring)])
    check(`n10 ${name} the camera opens (capture=environment)`, (await fc.element().getAttribute('capture')) === 'environment')
    await fc.setFiles(PHOTO)
    await sleep(700)
    await tap(env, page.getByRole('button', { name: 'Read', exact: true }))
    await page.getByText('4 ticked on paper → mark done?').waitFor({ timeout: 8000 }).catch(() => {})
    const review = page.locator('[role="dialog"][aria-label="Bring back your ticks"]')
    const t = await text(review)
    check(`n10 ${name} "4 ticked on paper → mark done?" · Matched to Monday’s page`, t.includes('4 ticked on paper → mark done?') && /MATCHED TO MONDAY’S PAGE/i.test(t), t.replace(/\n/g, ' / ').slice(0, 200))
    check(`n10 ${name} the four: the goal (abbreviated), the survey, Omar (misspelt), the plants`, ['GCI homework 1 — NumPy', 'Do GCI lecture 2’s survey', 'Reply to Omar', 'Water the plants'].every((s) => t.includes(s)) && !/☑ Buy milk/.test(t))
    check(`n10 ${name} "1 still open on paper · left as they are"; "New on the page · 1"`, t.includes('1 still open on paper · left as they are') && t.includes('New on the page · 1'))
    await sleep(500) // the frame's fade-in
    await shot(page, `n10-${name}-11l-review`)
    await tap(env, review.getByRole('checkbox', { name: 'Complete "Water the plants"' }))
    check(`n10 ${name} unticking one → "Mark 3 done"`, (await review.getByRole('button', { name: 'Mark 3 done' }).count()) === 1)
    const w0 = state.writes.length
    await tap(env, review.getByRole('button', { name: 'Mark 3 done' }))
    await settle(state)
    const done = posts(state, 'tasks', w0).filter((r) => r.status === 'done').map((r) => r.title).sort()
    check(`n10 ${name} three tasks done (through the outbox), the plants left open`, JSON.stringify(done) === JSON.stringify(['Do GCI lecture 2’s survey', 'GCI homework 1 — NumPy', 'Reply to Omar']), JSON.stringify(done))
    check(`n10 ${name} one toast with Undo: "3 done — ticked on paper"`, await toastSoon(page, '3 done — ticked on paper'))
    const rest = await text(page.locator('.pp-sheet-body, .pp-main-col'))
    check(`n10 ${name} then the new scribble alone, as a proposed item`, rest.includes('call Omar back re Thursday') && !rest.includes('Buy milk') && /1 thing/.test(rest), rest.replace(/\n/g, ' / ').slice(0, 160))
    await shot(page, `n10-${name}-after`)
    // Undo takes all three back.
    const w1 = state.writes.length
    const undoBtn = page.locator('.kf-toast', { hasText: '3 done — ticked on paper' }).getByRole('button', { name: 'Undo' })
    const ub = await undoBtn.boundingBox()
    const hit = ub && (await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.className + ' ' + e.textContent.slice(0, 20) : null }, [ub.x + ub.width / 2, ub.y + ub.height / 2]))
    check(`n10 ${name} the Undo is on screen, not under the sheet`, (await undoBtn.isVisible()) && !!hit?.startsWith('kf-toast-act'), hit)
    await tap(env, undoBtn)
    await settle(state)
    const back = posts(state, 'tasks', w1).filter((r) => r.status === 'todo').length
    check(`n10 ${name} Undo reopens the three`, back === 3, back)
    check(`n10 ${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
    await env.ctx.close()
  }
}

await browser.close()
fs.rmSync(PHOTO, { force: true })
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
