// Plan / Replan + goal of the day + Top 3 order (Kai 2026-10-07) on the REAL app, signed in against a
// MOCKED backend — the rituals recipe (docs/log/assets/rituals/verify.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST call from the scene's rows. The browser clock is
// fixed to Wed 7 Oct 2026, 10:00 Cairo. Writes are kept in memory (a refetch sees them) and checked.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5271'
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
const want = (k) => !ONLY || ONLY.has(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day: Wednesday 7 Oct 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 7) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const DAY0 = '2026-08-01T06:00:00.000Z'
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const evId = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const ev = (n, title, from, to, taskN = null, day = 7) => ({
  id: evId(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, created_at: DAY0, updated_at: DAY0, deleted_at: null,
})
const act = (n, event_type, entity, at) => ({ id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type: 'task', entity_id: id(entity), payload: {}, created_at: iso(at) })
const CRYPTO = 1, GYM = 2, READ = 3, BANK = 4, REPORT = 5, MILK = 6
const OVERDUE = [10, 11, 12, 13, 14, 15]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables() {
  return {
    app_settings: [{ ...SETTINGS }],
    projects: [], routines: [], routine_completions: [], journal_entries: [], time_entries: [], inbox_items: [],
    tasks: [
      // Kai's 14:42 screenshot: Crypto the goal, starred first; Gym and Read after, by their blocks.
      task(CRYPTO, 'Crypto — heavy session', { top3: true, duration_min: 90, due_at: iso('09:00'), scheduled_start: iso('14:45'), scheduled_end: iso('16:15') }),
      task(READ, 'Read 2 pages', { top3: true, duration_min: 75, due_at: iso('09:00'), scheduled_start: iso('22:00'), scheduled_end: iso('23:15') }),
      task(GYM, 'Gym — upper body', { top3: true, duration_min: 60, due_at: iso('09:00'), scheduled_start: iso('17:15'), scheduled_end: iso('18:15') }),
      // The overdue pile (by due date, as the server sends it): Oct 1–4, then the bank since Monday
      // 15:00, its block stuck on Monday's calendar.
      ...OVERDUE.map((n, i) => task(n, `Old thing ${i + 1}`, { duration_min: [30, 45, 60, 30, 120, 30][i], due_at: iso('09:00', [1, 1, 2, 3, 4, 4][i]) })),
      task(BANK, 'Call the bank', { duration_min: 30, due_at: iso('15:00', 5), scheduled_start: iso('15:00', 5), scheduled_end: iso('15:30', 5) }),
      task(MILK, 'Buy milk', { duration_min: 15, due_at: iso('09:00') }),
      task(REPORT, 'Write the Q4 report', { duration_min: 60, due_at: iso('09:00', 8) }),
    ],
    calendar_events: [
      ev(1, 'Lunch with Omar', '12:00', '13:00'),
      ev(2, 'Crypto — heavy session', '14:45', '16:15', CRYPTO),
      ev(3, 'Gym — upper body', '17:15', '18:15', GYM),
      ev(4, 'Read 2 pages', '22:00', '23:15', READ),
      ev(5, 'Call the bank', '15:00', '15:30', BANK, 5),
    ],
    activity_log: [act(1, 'task.starred', CRYPTO, '08:01'), act(2, 'task.starred', GYM, '08:02'), act(3, 'task.starred', READ, '08:03')],
  }
}
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const want = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return want ? rows.filter((r) => want.includes(r.event_type)) : rows
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }

async function open(theme, view, route = '/today', at = '10:00', mutate = (rows) => rows) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // What's new (v1.0.22) toasts "Updated to vX" once per version — this harness counts its own toasts.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [theme, JSON.stringify(session), UID])
  const state = { rows: mutate(tables()), writes: [] }
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try {
        body = JSON.parse(req.postData() ?? '[]')
      } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        const full = { created_at: new Date(cairo(at).getTime() + ++seq * 1000).toISOString(), ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  // Installed 14 minutes early and left running (toasts expire): "now" stays inside 09:46–10:00, so the
  // next quarter — where the next free slot starts — is 10:00 for the whole run.
  await page.clock.install({ time: new Date(cairo(at).getTime() - 14 * 60_000) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })) // clear of the tab bar
  await sleep(150)
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
}
/** A right swipe that stops short of the commit line (the row rests open on its actions). */
async function swipeOpen(cdp, loc, dx = 120) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const y = b.y + Math.min(28, b.height / 2)
  const x0 = b.x + 40
  await touch(cdp, 'touchStart', [{ x: x0, y }])
  for (let i = 1; i <= 12; i++) {
    await touch(cdp, 'touchMove', [{ x: x0 + (dx * i) / 12, y }])
    await sleep(16)
  }
  await sleep(120)
  await touch(cdp, 'touchEnd', [])
  await sleep(500)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const toastBtn = (page, name) => page.locator('.kf-toast-act', { hasText: name }).last()
const slots = (page) => page.locator('[data-top3-slot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-top3-slot')))
const lastWrite = (state, n) => state.writes.filter((w) => w.table === 'tasks' && w.row.id === id(n)).at(-1)?.row
const evWrite = (state, eid) => state.writes.filter((w) => w.table === 'calendar_events' && w.row.id === eid).at(-1)?.row
const rows = async (scope) => (await scope.locator('.kf-as-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
const pop = (page) => page.locator('.kf-pk-pop').last()
const dialog = (page) => page.locator('[role="dialog"]').last()
const menuItems = async (page) => (await page.locator('[role="menu"]').first().locator('[role="menuitem"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
const settle = () => sleep(450)
/** Lets the toasts on screen run out (a third one queues behind two). */
const noToast = (page) => page.waitForFunction(() => !document.querySelector('.kf-toast'), null, { timeout: 12000 }).catch(() => {})
/** Polls the scene's writes until ok holds (the outbox flushes one row at a time). */
async function until(ok, ms = 6000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (ok()) return true
  return ok()
}
/** Right-click once the row has stopped scrolling — a scroll closes an open row menu (ContextMenu). */
async function rclick(loc) {
  await loc.scrollIntoViewIfNeeded()
  await sleep(300)
  await loc.click({ button: 'right', position: { x: 120, y: 18 } }) // left of the centred toast
}

// ═════════════════════════ Desktop 1280 ═════════════════════════
if (want('desktop')) {
  for (const theme of ['day', 'night']) {
    const name = `desk-${theme}`
    const { ctx, page, errors, state } = await open(theme, DESKTOP)
    await page.getByText('Top 3 for today').waitFor()
    await shot(page, `${name}-today`)
    check(`${name} goal = the first pick starred (Crypto), rest by block: Gym 17:15, Read 22:00`, JSON.stringify(await slots(page)) === JSON.stringify([id(CRYPTO), id(GYM), id(READ)]), JSON.stringify((await slots(page)).map((s) => s.slice(-2))))
    check(`${name} the gold card names Crypto`, /Crypto/.test(await page.locator(`[data-top3-slot="${id(CRYPTO)}"]`).innerText()) && /Goal of the day/i.test(await page.locator(`[data-top3-slot="${id(CRYPTO)}"]`).innerText()))
    if (theme === 'night') {
      check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
      continue
    }

    // Right-click a Top 3 row: Plan…, Make goal of the day, Move up / down.
    await rclick(page.locator(`#task-${id(GYM)}`))
    await settle()
    const items = await menuItems(page)
    await shot(page, `${name}-menu-top3`)
    check(`${name} Top 3 row menu: Plan… first, Make goal of the day, Move up, Move down`, items[0].startsWith('Plan…') && items.some((t) => t.startsWith('Make goal of the day')) && items.some((t) => t.startsWith('Move up')) && items.some((t) => t.startsWith('Move down')) && !items.some((t) => t.startsWith('Tomorrow')), JSON.stringify(items))
    await page.locator('[role="menuitem"]', { hasText: 'Make goal of the day' }).click()
    await settle()
    check(`${name} Make goal → Gym leads, ranks 1·2·3 written`, JSON.stringify(await slots(page)) === JSON.stringify([id(GYM), id(CRYPTO), id(READ)]) && lastWrite(state, GYM)?.top3_rank === 1 && lastWrite(state, CRYPTO)?.top3_rank === 2 && lastWrite(state, READ)?.top3_rank === 3, JSON.stringify([lastWrite(state, GYM)?.top3_rank, lastWrite(state, CRYPTO)?.top3_rank, lastWrite(state, READ)?.top3_rank]))
    check(`${name} toast "Goal of the day" with Undo`, (await toasts(page)).includes('Goal of the day') && (await toastBtn(page, 'Undo').count()) === 1, JSON.stringify(await toasts(page)))
    await shot(page, `${name}-goal-made`)
    await toastBtn(page, 'Undo').click()
    await settle()
    check(`${name} Undo → places cleared, Crypto the goal again`, JSON.stringify(await slots(page)) === JSON.stringify([id(CRYPTO), id(GYM), id(READ)]) && lastWrite(state, GYM)?.top3_rank === null, JSON.stringify(await slots(page)))
    // The goal row's menu has no Make goal; it can only move down.
    await rclick(page.locator(`#task-${id(CRYPTO)}`))
    await settle()
    const goalItems = await menuItems(page)
    check(`${name} the goal's own menu: no Make goal, no Move up, Move down`, !goalItems.some((t) => t.startsWith('Make goal')) && !goalItems.some((t) => t.startsWith('Move up')) && goalItems.some((t) => t.startsWith('Move down')), JSON.stringify(goalItems))
    await page.keyboard.press('Escape')
    await settle()

    // Keyboard: ↓ focuses the first row (the goal), Alt+↓ moves it down.
    await page.locator('body').click({ position: { x: 1200, y: 780 } })
    await page.keyboard.press('ArrowDown')
    await sleep(150)
    await page.keyboard.press('Alt+ArrowDown')
    await settle()
    check(`${name} Alt+↓ on the focused goal → it moves to second; Gym leads`, JSON.stringify(await slots(page)) === JSON.stringify([id(GYM), id(CRYPTO), id(READ)]) && lastWrite(state, CRYPTO)?.top3_rank === 2, JSON.stringify((await slots(page)).map((s) => s.slice(-2))))
    await page.keyboard.press('Alt+ArrowUp')
    await settle()
    check(`${name} Alt+↑ → back to first (a new goal, its toast)`, JSON.stringify(await slots(page)) === JSON.stringify([id(CRYPTO), id(GYM), id(READ)]) && (await toasts(page)).includes('Goal of the day'), JSON.stringify((await slots(page)).map((s) => s.slice(-2))))

    // Drag Read onto the goal card → Read is the goal.
    await noToast(page)
    await page.locator(`[data-top3-slot="${id(READ)}"]`).scrollIntoViewIfNeeded()
    await sleep(300)
    const from = await page.locator(`[data-top3-slot="${id(READ)}"]`).boundingBox()
    const to = await page.locator(`[data-top3-slot="${id(CRYPTO)}"]`).boundingBox()
    await page.mouse.move(from.x + 80, from.y + from.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(from.x + 80, from.y + from.height / 2 + ((to.y + to.height / 2 - (from.y + from.height / 2)) * i) / 14)
      await sleep(25)
    }
    await shot(page, `${name}-drag`)
    await page.mouse.up()
    await settle()
    check(`${name} drag Read onto the goal card → Read is the goal`, (await slots(page))[0] === id(READ) && lastWrite(state, READ)?.top3_rank === 1, JSON.stringify((await slots(page)).map((s) => s.slice(-2))))
    check(`${name} the drop didn't open the task`, !/\/tasks\//.test(page.url()) && (await page.locator('.ts-title, [aria-label="Title"]').count()) === 0, page.url())

    // The overdue fold: its own, folded, with the count and Replan all ▾; More for today keeps the rest.
    const overdueFold = page.getByRole('button', { name: /^Overdue · 7/ })
    check(`${name} "Overdue · 7" fold, folded by default`, (await overdueFold.count()) === 1 && (await overdueFold.getAttribute('aria-expanded')) === 'false' && (await page.locator(`#task-${id(BANK)}`).count()) === 0)
    const more = page.getByRole('button', { name: /^More for today/ })
    check(`${name} More for today no longer counts the overdue ones`, /More for today · 2 open/i.test(await more.innerText()), await more.innerText())
    await overdueFold.click()
    await settle()
    await shot(page, `${name}-overdue-open`)
    // Right-click the overdue row → Replan…
    await rclick(page.locator(`#task-${id(BANK)}`))
    await settle()
    const odItems = await menuItems(page)
    check(`${name} an overdue row's menu starts with Replan…`, odItems[0].startsWith('Replan…'), JSON.stringify(odItems.slice(0, 3)))
    await page.locator('[role="menuitem"]', { hasText: 'Replan…' }).click()
    await settle()
    const plan = await rows(pop(page))
    await shot(page, `${name}-replan-list`)
    check(`${name} Replan list: one line each — where it lands and what it means`, JSON.stringify(plan) === JSON.stringify([
      'Today today, keeps its 15:00 WED 7 · 15:00',
      'Next free slot ASAP: the first free gap that fits — you confirm TODAY 10:00–10:30',
      'Tomorrow, first thing the start of your day THU 8 · 09:00',
      'This weekend the first day of your weekend (Sat + Sun) SAT 10 · 09:00',
      'Next week Monday of next week MON 12 · 09:00',
      'Pick date & time… any day — and a time, if you want one',
      'Someday no date — parked until you pull it up',
      'No date takes the date off',
    ]), JSON.stringify(plan))
    check(`${name} the popover is titled Replan`, /^Replan/.test(await pop(page).locator('.kf-pk-pop-head').innerText()))
    await pop(page).locator('.kf-as-row', { hasText: 'Tomorrow, first thing' }).click()
    await settle()
    const bank = lastWrite(state, BANK)
    const stuck = evWrite(state, evId(5))
    check(`${name} Tomorrow, first thing → due Thu 09:00, Monday's stuck block off the calendar`, bank?.due_at === iso('09:00', 8) && bank?.scheduled_start === null && !!stuck?.deleted_at, JSON.stringify([bank?.due_at, bank?.scheduled_start, stuck?.deleted_at]))
    check(`${name} "Moved to tomorrow · Undo"`, (await toasts(page)).includes('Moved to tomorrow'), JSON.stringify(await toasts(page)))
    await toastBtn(page, 'Undo').click()
    await settle()
    check(`${name} Undo → the due and the block both come back`, lastWrite(state, BANK)?.due_at === iso('15:00', 5) && lastWrite(state, BANK)?.scheduled_start === iso('15:00', 5) && evWrite(state, evId(5))?.deleted_at === null, JSON.stringify([lastWrite(state, BANK)?.due_at, evWrite(state, evId(5))?.deleted_at]))

    // Next free slot on Buy milk (More for today): propose, Another time, Confirm.
    await more.click()
    await settle()
    await rclick(page.locator(`#task-${id(MILK)}`))
    await settle()
    await page.locator('[role="menuitem"]', { hasText: /^Plan…/ }).click()
    await settle()
    await pop(page).locator('.kf-as-row', { hasText: 'Next free slot' }).click()
    await settle()
    const slotNow = await pop(page).locator('.kf-plan-slot').innerText()
    await shot(page, `${name}-next-free-slot`)
    check(`${name} Next free slot proposes the first 15m gap: Today 10:00–10:15`, slotNow === 'Today 10:00–10:15', slotNow)
    await pop(page).getByRole('button', { name: 'Another time' }).click()
    await sleep(200)
    check(`${name} Another time → the next one: Today 10:15–10:30`, (await pop(page).locator('.kf-plan-slot').innerText()) === 'Today 10:15–10:30')
    await pop(page).getByRole('button', { name: 'Confirm' }).click()
    await settle()
    const block = state.writes.filter((w) => w.table === 'calendar_events' && w.row.task_id === id(MILK)).at(-1)?.row
    check(`${name} Confirm → a block 10:15–10:30, the task due then`, block?.starts_at === iso('10:15') && block?.ends_at === iso('10:30') && lastWrite(state, MILK)?.due_at === iso('10:15') && lastWrite(state, MILK)?.scheduled_start === iso('10:15'), JSON.stringify([block?.starts_at, lastWrite(state, MILK)?.due_at]))
    check(`${name} "Planned · Today · 10:15–10:30 · Undo"`, (await toasts(page)).some((t) => t === 'Planned · Today · 10:15–10:30') && (await toastBtn(page, 'Undo').count()) >= 1, JSON.stringify(await toasts(page)))

    // Make goal on a task outside a full Top 3: the swap toast first.
    await noToast(page)
    await rclick(page.locator(`#task-${id(REPORT)}`))
    await settle()
    await page.locator('[role="menuitem"]', { hasText: 'Make goal of the day' }).click()
    await settle()
    const swapToast = (await toasts(page)).find((t) => t.startsWith('Top 3 is full'))
    check(`${name} Make goal into a full Top 3 → "swap out" the last pick, nothing written yet`, /swap out “Gym — upper body”\?/.test(swapToast ?? '') && lastWrite(state, REPORT)?.top3 !== true, swapToast)
    await toastBtn(page, 'Swap').click()
    await settle()
    const swapped = await until(() => lastWrite(state, REPORT)?.top3 === true && lastWrite(state, REPORT)?.top3_rank === 1 && lastWrite(state, GYM)?.top3 === false && lastWrite(state, GYM)?.top3_rank === null)
    check(`${name} Swap → the report is the goal; Gym out (unstarred, no place); Read and Crypto keep their order`, swapped && JSON.stringify(await slots(page)) === JSON.stringify([id(REPORT), id(READ), id(CRYPTO)]), `${swapped} ${JSON.stringify((await slots(page)).map((s) => s.slice(-2)))} ${JSON.stringify([lastWrite(state, REPORT)?.top3, lastWrite(state, REPORT)?.top3_rank, lastWrite(state, GYM)?.top3])}`)
    check(`${name} "Goal of the day · Gym — upper body left the Top 3 · Undo"`, (await toasts(page)).includes('Goal of the day · Gym — upper body left the Top 3'), JSON.stringify(await toasts(page)))
    await shot(page, `${name}-swap`)

    // Replan all ▾ → Spread into free slots: the preview, then Confirm.
    await noToast(page)
    await page.getByRole('button', { name: 'Replan all ▾' }).click()
    await settle()
    const all = await rows(pop(page))
    check(`${name} Replan all: Today · Spread into free slots · Tomorrow, first thing · … · Someday`, all[0].startsWith('Today') && all[1].startsWith('Spread into free slots') && all[2].startsWith('Tomorrow, first thing') && all.some((r) => r.startsWith('Pick date & time')) && all.at(-1).startsWith('Someday') && !all.some((r) => r.startsWith('Next free slot')), JSON.stringify(all))
    // Today's calendar now: milk 10:15, lunch 12:00, Crypto 14:45, Gym 17:15 (its block stays), Read 22:00.
    check(`${name} Spread says how it splits: 6 today · 1 tomorrow`, /6 TODAY · 1 TOMORROW/.test(all[1]), all[1])
    await shot(page, `${name}-replan-all`)
    await pop(page).locator('.kf-as-row', { hasText: 'Spread into free slots' }).click()
    await settle()
    const preview = (await pop(page).locator('.kf-plan-spread li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
    await shot(page, `${name}-spread-preview`)
    check(`${name} the preview: in order, each in the first gap that fits its own length`, JSON.stringify(preview) === JSON.stringify([
      '10:30–11:00 Old thing 1', '11:00–11:45 Old thing 2', '13:00–14:00 Old thing 3', '14:00–14:30 Old thing 4', '16:15–16:45 Old thing 6', '16:45–17:15 Call the bank',
    ]), JSON.stringify(preview))
    check(`${name} …and the 2h one that fits nowhere goes tomorrow, first thing`, /1 goes to tomorrow, first thing/.test(await pop(page).innerText()))
    const before = state.writes.length
    await pop(page).getByRole('button', { name: 'Confirm' }).click()
    await settle()
    await until(() => state.writes.slice(before).filter((w) => w.table === 'calendar_events').length >= 6)
    const spreadWrites = state.writes.slice(before)
    const placed = spreadWrites.filter((w) => w.table === 'calendar_events' && [...OVERDUE, BANK].map(id).includes(w.row.task_id) && !w.row.deleted_at)
    check(`${name} Confirm → 6 blocks today (the bank's stuck block moved), 1 to tomorrow 09:00, one Undo`, placed.length === 6 && evWrite(state, evId(5))?.starts_at === iso('16:45') && lastWrite(state, 14)?.due_at === iso('09:00', 8) && (await toasts(page)).some((t) => /7 replanned · 6 today, 1 tomorrow/.test(t)), `${placed.length} · ${JSON.stringify(await toasts(page))}`)
    await toastBtn(page, 'Undo').click()
    await settle()
    check(`${name} Undo → the overdue pile is back (Overdue · 7)`, (await page.getByRole('button', { name: /^Overdue · 7/ }).count()) === 1)

    // Bulk: two selected → the bar's Plan → the Plan list for both, no free-slot finder.
    await page.locator(`#task-${id(READ)}`).click({ modifiers: ['Control'] })
    await page.locator(`#task-${id(CRYPTO)}`).click({ modifiers: ['Control'] })
    await settle()
    const bar = page.locator('.kf-bulkbar')
    check(`${name} bulk bar: Plan replaces Pick date`, (await bar.locator('.kf-bulk-act', { hasText: 'Plan' }).count()) === 1 && (await bar.locator('.kf-bulk-act', { hasText: 'Pick date' }).count()) === 0)
    await bar.locator('.kf-bulk-act', { hasText: 'Plan' }).click()
    await settle()
    const bulkRows = await rows(pop(page))
    check(`${name} bulk Plan: "2 tasks", no Next free slot`, /2 tasks/i.test(await pop(page).locator('.kf-pk-pop-head').innerText()) && !bulkRows.some((r) => r.startsWith('Next free slot')) && bulkRows[0].startsWith('Today'), JSON.stringify(bulkRows))
    await shot(page, `${name}-bulk-plan`)
    await page.keyboard.press('Escape')
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ═════════════════════════ Settings → Calendar → Weekend ═════════════════════════
if (want('settings')) {
  for (const [label, view] of [['desk', DESKTOP], ['phone', PHONE]]) {
    for (const theme of ['day', 'night']) {
      const name = `${label}-settings-${theme}`
      const { ctx, page, cdp, errors, state } = await open(theme, view, '/settings')
      const card = page.locator('#settings-Calendar')
      await card.scrollIntoViewIfNeeded()
      await sleep(300)
      const segs = card.getByRole('button', { name: /^(Fri \+ Sat|Sat \+ Sun|Sun only|Custom)$/ })
      check(`${name} Weekend: Fri + Sat · Sat + Sun · Sun only · Custom, Sat + Sun on by default`, (await segs.count()) === 4 && (await card.getByRole('button', { name: 'Sat + Sun' }).getAttribute('aria-pressed')) === 'true')
      check(`${name} "What the plan shortcuts mean" lists each option`, /What the plan shortcuts mean/.test(await card.innerText()) && /Next free slot — ASAP/.test(await card.innerText()) && /Tomorrow, first thing — tomorrow at 09:00/.test(await card.innerText()))
      if (label === 'phone') {
        const hs = await segs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
        check(`${name} the presets are ≥ 48 tall`, hs.every((h) => h >= 48), JSON.stringify(hs))
      }
      await shot(page, `${name}`)
      const click = (loc) => (cdp ? tap(cdp, loc) : loc.click())
      await click(card.getByRole('button', { name: 'Fri + Sat' }))
      await settle()
      const w = state.writes.filter((x) => x.table === 'app_settings').at(-1)?.row
      check(`${name} Fri + Sat → weekend_days [5,6]`, JSON.stringify(w?.weekend_days) === '[5,6]', JSON.stringify(w?.weekend_days))
      check(`${name} the glossary follows: "first day of your weekend (Fri + Sat)"`, /\(Fri \+ Sat\)/.test(await card.innerText()))
      await click(card.getByRole('button', { name: 'Custom' }))
      await settle()
      const days = card.getByRole('group', { name: 'Weekend days' }).getByRole('button')
      const dh = await days.evaluateAll((els) => els.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().height), e.getAttribute('aria-pressed')]))
      check(`${name} Custom → 7 day toggles, Fri and Sat on`, dh.length === 7 && dh.filter((d) => d[2] === 'true').map((d) => d[0]).join() === 'Fri,Sat', JSON.stringify(dh))
      if (label === 'phone') check(`${name} the day toggles are ≥ 48 tall`, dh.every((d) => d[1] >= 48), JSON.stringify(dh.map((d) => d[1])))
      await click(days.filter({ hasText: 'Sun' }))
      await settle()
      check(`${name} + Sun → [0,5,6], labelled Fri + Sat + Sun`, JSON.stringify(state.writes.filter((x) => x.table === 'app_settings').at(-1)?.row.weekend_days) === '[0,5,6]' && /Fri \+ Sat \+ Sun/.test(await card.innerText()))
      await shot(page, `${name}-custom`)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth)
      if (label === 'phone') check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
      check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
  // The weekend reaches the Plan menu: Fri + Sat on a Wednesday → This weekend = Fri 9.
  const { ctx, page } = await open('day', DESKTOP, '/today', '10:00', (rows) => {
    rows.app_settings[0].weekend_days = [5, 6]
    return rows
  })
  await rclick(page.locator(`#task-${id(GYM)}`))
  await settle()
  await page.locator('[role="menuitem"]', { hasText: /^Plan…/ }).click()
  await settle()
  const wk = (await rows(pop(page))).find((r) => r.startsWith('This weekend'))
  check('desk-weekend Plan → This weekend lands on Friday with a Fri + Sat weekend', /\(Fri \+ Sat\) FRI 9 · 09:00$/.test(wk ?? ''), wk)
  await shot(page, 'desk-weekend-fri-sat')
  await ctx.close()
}

// ═════════════════════════ Phone 390 ═════════════════════════
if (want('phone')) {
  for (const theme of ['day', 'night']) {
    const name = `phone-${theme}`
    const { ctx, page, cdp, errors, state } = await open(theme, PHONE)
    await page.locator('.tp-goal').first().waitFor()
    await shot(page, `${name}-today`)
    const goal = page.locator('.tp-goal').first()
    check(`${name} the goal card is Crypto (the first starred)`, /Crypto/.test(await goal.innerText()))
    const meta = goal.locator('.tp-meta')
    const mh = await meta.evaluate((e) => [Math.round(e.getBoundingClientRect().height), parseFloat(getComputedStyle(e).lineHeight) || 16, e.scrollWidth <= e.clientWidth + 1, e.textContent])
    check(`${name} goal meta on ONE line ("${mh[3]}")`, mh[0] <= Math.max(mh[1], 20) + 1 && mh[2], JSON.stringify(mh))
    check(`${name} under 420px the clover steps aside`, await goal.locator('.tp-goal-clover').evaluate((e) => getComputedStyle(e).display === 'none'))
    const order = await page.locator('.tp-list .tp-row').evaluateAll((els) => els.slice(0, 2).map((e) => e.id))
    check(`${name} the rest of the Top 3 by block: Gym 17:15, then Read 22:00`, JSON.stringify(order) === JSON.stringify([`task-${id(GYM)}`, `task-${id(READ)}`]), JSON.stringify(order))
    // The overdue fold: count visible, folded, Replan all ▾ ≥ 48.
    const fold = page.getByRole('button', { name: /^Overdue · 7/ })
    await fold.scrollIntoViewIfNeeded()
    const rb = page.getByRole('button', { name: 'Replan all ▾' })
    const rh = Math.round((await rb.boundingBox()).height)
    check(`${name} "Overdue · 7" folded, Replan all ▾ beside it (${rh}px), More for today · 2`, (await fold.getAttribute('aria-expanded')) === 'false' && rh >= 48 && /More for today · 2/i.test(await page.getByRole('button', { name: /^More for today/ }).innerText()))
    await shot(page, `${name}-folds`)
    if (theme === 'night') {
      await tap(cdp, rb)
      await shot(page, `${name}-replan-all`)
      check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
      continue
    }

    // ⋯ on a Top 3 row → Move up (into first place: a new goal).
    await tap(cdp, page.getByRole('button', { name: 'More actions for "Gym — upper body"' }))
    const sheetRows = await rows(dialog(page))
    await shot(page, `${name}-menu-top3`)
    check(`${name} ⋯ sheet: Plan…, Make goal of the day, Move up, Move down`, sheetRows[0].startsWith('Plan…') && sheetRows.some((r) => r.startsWith('Make goal of the day')) && sheetRows.some((r) => r.startsWith('Move up')) && sheetRows.some((r) => r.startsWith('Move down')), JSON.stringify(sheetRows))
    await tap(cdp, dialog(page).locator('.kf-as-row', { hasText: 'Move up' }))
    await settle()
    check(`${name} Move up → Gym is the goal card, ranks written`, /Gym/.test(await page.locator('.tp-goal').first().innerText()) && lastWrite(state, GYM)?.top3_rank === 1, await page.locator('.tp-goal').first().innerText())
    await page.waitForFunction(() => !document.querySelector('.kf-toast'), null, { timeout: 9000 }).catch(() => {})

    // Swipe right → Plan → the Plan sheet; every row ≥ 48.
    const crypto = page.locator(`#task-${id(CRYPTO)}`)
    await swipeOpen(cdp, crypto)
    const acts = (await crypto.locator('.kf-swipe-act').allInnerTexts()).map((t) => t.trim())
    check(`${name} swipe right rests on Tomorrow · Plan · Project`, JSON.stringify(acts) === JSON.stringify(['Tomorrow', 'Plan', 'Project']), JSON.stringify(acts))
    await tap(cdp, crypto.locator('.kf-swipe-act', { hasText: 'Plan' }))
    await settle()
    const planRows = await rows(dialog(page))
    const hs = await dialog(page).locator('.kf-as-row').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    await shot(page, `${name}-plan-sheet`)
    check(`${name} Plan sheet: Today · Next free slot · Tomorrow, first thing · This weekend · Next week · Pick date & time… · Someday · No date`, JSON.stringify(planRows.map((r) => r.split(/ (today|ASAP|the |Monday|any|no date|takes)/)[0])) === JSON.stringify(['Today', 'Next free slot', 'Tomorrow, first thing', 'This weekend', 'Next week', 'Pick date & time…', 'Someday', 'No date']), JSON.stringify(planRows))
    check(`${name} every Plan row ≥ 48 tall`, hs.every((h) => h >= 48), JSON.stringify(hs))
    await tap(cdp, dialog(page).locator('.kf-as-row', { hasText: 'Next free slot' }))
    await settle()
    const slotText = await dialog(page).locator('.kf-plan-slot').innerText()
    const bh = await dialog(page).getByRole('button', { name: /^(Cancel|Another time|Confirm)$/ }).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    await shot(page, `${name}-next-free-slot`)
    // Crypto is 90m and its own block doesn't count: the first 90m gap is 10:00–11:30 (Lunch at 12:00).
    check(`${name} Next free slot (90m): Today 10:00–11:30; Cancel · Another time · Confirm ≥ 48`, slotText === 'Today 10:00–11:30' && bh.length === 3 && bh.every((h) => h >= 48), `${slotText} ${JSON.stringify(bh)}`)
    await tap(cdp, dialog(page).getByRole('button', { name: 'Confirm' }))
    await settle()
    check(`${name} Confirm moves Crypto's block (no second block)`, evWrite(state, evId(2))?.starts_at === iso('10:00') && state.writes.filter((w) => w.table === 'calendar_events' && w.row.task_id === id(CRYPTO) && w.row.id !== evId(2)).length === 0, JSON.stringify(evWrite(state, evId(2))?.starts_at))

    // The task sheet's date chip → the same Plan sheet.
    await page.waitForFunction(() => !document.querySelector('.kf-toast'), null, { timeout: 9000 }).catch(() => {})
    await page.getByRole('button', { name: /^More for today/ }).click()
    await settle()
    // The first tap may only close the row the swipe left open (one row open at a time).
    for (let i = 0; i < 2 && !(await page.locator('.ts-chips').count()); i++) {
      await tap(cdp, page.locator(`#task-${id(MILK)} .tp-body`))
      await settle()
    }
    await shot(page, `${name}-task-sheet`)
    await tap(cdp, page.locator('.ts-chips .kf-chip').first())
    await settle()
    check(`${name} task sheet date chip → the Plan sheet`, (await rows(dialog(page)))[0]?.startsWith('Today') && /Plan/.test(await dialog(page).innerText()), JSON.stringify((await rows(dialog(page))).slice(0, 2)))
    await shot(page, `${name}-sheet-plan`)
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
    await ctx.close()
  }
}

// ═════════════════════════ Plan my day: Make goal on a pick ═════════════════════════
if (want('ritual')) {
  for (const [label, view] of [['desk', DESKTOP], ['phone', PHONE]]) {
    const name = `${label}-ritual`
    const { ctx, page, cdp, errors, state } = await open('day', view, '/today?ritual=morning', '07:40')
    await sleep(600)
    const goalMeta = page.locator('.rt-row', { hasText: '✶ Goal' })
    const make = page.locator('.rt-make-goal')
    check(`${name} picks: one "✶ Goal", a "☆ Make goal" on each other pick`, (await goalMeta.count()) === 1 && (await make.count()) === 2, `${await goalMeta.count()} / ${await make.count()}`)
    if (label === 'phone') {
      const h = Math.round((await make.first().boundingBox()).height)
      check(`${name} ☆ Make goal hit ≥ 48`, h >= 48, h)
    }
    const second = await make.first().evaluate((b) => b.closest('.rt-row')?.id)
    await shot(page, `${name}-picks`)
    if (cdp) await tap(cdp, make.first())
    else await make.first().click()
    await settle()
    const now = await page.locator('.rt-row', { hasText: '✶ Goal' }).first().evaluate((e) => e.id)
    check(`${name} ☆ Make goal → that pick is the ✶ Goal`, now === second, `${now} vs ${second}`)
    await shot(page, `${name}-made-goal`)
    const startBtn = page.getByRole('button', { name: 'Start the day' })
    if (cdp) await tap(cdp, startBtn)
    else await startBtn.click()
    await settle()
    const goalId = second.replace(/^rt-/, '')
    const w = state.writes.filter((x) => x.table === 'tasks' && x.row.id === goalId).at(-1)?.row
    check(`${name} Start the day → the new goal ranked 1`, w?.top3_rank === 1, JSON.stringify(w?.top3_rank))
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
