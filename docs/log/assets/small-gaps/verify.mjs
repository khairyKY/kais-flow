// Small gaps (builder Z, 2026-10-03) on the REAL app, signed in against a MOCKED backend — the
// task-sheet recipe: the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens
// there), a made-up session sits in localStorage, and Playwright answers every REST call from the
// scene's rows. Writes are answered 201, go nowhere, and are recorded so each one can be checked.
//   node verify.mjs <outDir> [baseUrl] [items, e.g. "1,2"] [playwright-core path]
// Items: 1 Library at 150% · 2 onboarding date chip · 3 Today first-visit hint · 4 labels on rows ·
// 5 routine streak goal. Phone 390 + desktop 1280, day + night.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5252'
const ONLY = (process.argv[4] ?? '1,2,3,4,5').split(',')
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── Sunday 27 Sep 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 21)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROJECTS = [{ id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: null, name: 'Shaheen Tasks', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED }]
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const settings = (over = {}) => ({ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 720 } }

/** Opens `route` with `rows` (table → rows). o: view, theme, scale (kf_ui_scale), now ("HH:MM" Cairo, 27 Sep), init (localStorage). */
async function open(route, rows = {}, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, scale, init]) => {
    if (sessionStorage.getItem('kf-verify-init')) return // a reload keeps what the page wrote
    sessionStorage.setItem('kf-verify-init', '1')
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v)
  }, [o.theme ?? 'day', JSON.stringify(session), o.scale ?? null, o.init ?? {}])
  const state = { rows: { app_settings: [settings()], projects: PROJECTS, ...rows }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rs = state.rows[table] ?? []
    if (one) return rs.length ? r.fulfill({ json: rs[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rs, headers: { 'content-range': `0-${Math.max(0, rs.length - 1)}/${rs.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(o.now ?? '12:50') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const raw = (loc) => loc.first().textContent().catch(() => '')
/** Rows written to `table` since `from` (outbox upserts: one object or an array). */
const writesTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method !== 'DELETE').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const noErrors = (name, errors) => check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
const sideways = (page) => page.evaluate(() => {
  const sc = document.querySelector('.app-main-content')
  return { doc: document.documentElement.scrollWidth - innerWidth, main: sc ? sc.scrollWidth - sc.clientWidth : 0 }
})

// ── 1. Library at 150% — no sideways scroll, a readable single column ──
if (ONLY.includes('1')) {
  const C = CREATED
  const rows = {
    books: [{ id: 'b0000000-0000-4000-8000-000000000001', user_id: UID, title: 'The Overstory', author: 'Richard Powers', published_year: 2018, current_page: 120, total_pages: 500, status: 'reading', created_at: C, updated_at: C }],
    notes: [{ id: 'n0000000-0000-4000-8000-000000000001', user_id: UID, title: 'On attention', body: 'Attention is the beginning of devotion. '.repeat(12), tags: ['focus', 'reading'], domain_id: null, book_id: null, created_at: C, updated_at: C }],
    quotes: [{ id: 'q0000000-0000-4000-8000-000000000001', user_id: UID, text: 'What you look hard at seems to look hard at you.', author: 'Gerard Manley Hopkins', source: 'Journals', tags: ['craft'], book_id: null, page: '12', created_at: C, updated_at: C }],
  }
  const routes = [['list', '/library?tab=notes'], ['note', `/library?tab=notes&noteId=${rows.notes[0].id}`], ['quote', `/library?tab=quotes&quoteId=${rows.quotes[0].id}`], ['book', `/library?tab=books&bookId=${rows.books[0].id}`]]
  for (const theme of ['day', 'night']) {
    for (const scale of ['1.5', '1.25', '1']) {
      for (const [what, route] of routes) {
        if (theme === 'night' && what !== 'note') continue
        const name = `1-library-${scale.replace('.', '')}-${what}-${theme}`
        const { ctx, page, errors } = await open(route, rows, { view: desktop, theme, scale })
        const s = await sideways(page)
        check(`${name} no sideways scroll (1280×720 at ${scale * 100}%)`, s.doc <= 0 && s.main <= 0, JSON.stringify(s))
        const single = (await page.getByText('Daily pages').count()) === 0 // the three-pane shelf tree's Journal row
        check(`${name} ${scale === '1' ? 'three panes at 100%' : 'the single column when the page is under 880'}`, scale === '1' ? !single : single)
        if (scale === '1.5' || (scale === '1.25' && what === 'book') || (scale === '1' && what === 'note')) await shot(page, name)
        noErrors(name, errors)
        await ctx.close()
      }
    }
  }
  // Interface size changed live (Settings → Interface size): the layout follows without a reload.
  {
    const name = '1-library-live-scale'
    const { ctx, page, errors } = await open(routes[1][1], rows, { view: desktop, scale: '1' })
    const before = await page.getByText('Daily pages').count()
    await page.evaluate(() => { document.documentElement.style.zoom = '1.5' })
    await sleep(400)
    const s = await sideways(page)
    check(`${name} 100% → 150% live: three panes → single column, no sideways scroll`, before === 1 && (await page.getByText('Daily pages').count()) === 0 && s.main <= 0, JSON.stringify(s))
    noErrors(name, errors)
    await ctx.close()
  }
}

// ── 2. Onboarding (First Run 9h): the date chip opens the date picker; Start keeps the pick ──
if (ONLY.includes('2')) {
  for (const [view, vname] of [[phone, 'phone'], [desktop, 'desktop']]) {
    for (const theme of ['day', 'night']) {
      const name = `2-onboarding-${vname}-${theme}`
      const { ctx, page, errors, state } = await open('/onboarding', { app_settings: [settings({ onboarded_at: null, display_name: null })], tasks: [] }, { view, theme, now: '07:40' })
      await page.getByLabel('Thing 1').fill('Call the tyre supplier tomorrow 3pm')
      await page.getByLabel('Thing 2').fill('Gym')
      const chip = page.locator('.fr-when .kf-chip')
      check(`${name} the dated line shows its chip, as a button`, (await chip.count()) === 1 && (await raw(chip)) === 'Tomorrow · 15:00' && (await chip.evaluate((e) => e.tagName)) === 'BUTTON', await raw(chip))
      await chip.click()
      await sleep(500)
      const dialog = page.getByRole('dialog').filter({ hasText: 'Due date' })
      check(`${name} chip tap → the date picker (Due date, the line's title, tomorrow selected)`, (await dialog.count()) === 1 && (await raw(dialog)).includes('Call the tyre supplier') && (await dialog.locator('[data-day="2026-09-28"][aria-selected="true"]').count()) === 1, `${await dialog.count()} ${(await text(dialog)).replace(/\s+/g, ' ').slice(0, 60)} ${await dialog.locator('[aria-selected="true"]').getAttribute('data-day').catch(() => null)}`)
      await shot(page, `${name}-picker`)
      await dialog.locator('[data-day="2026-10-01"]').click()
      await dialog.getByRole('button', { name: 'Done' }).click()
      await sleep(400)
      check(`${name} Done → the chip reads the picked day (Thu 1 Oct · 09:00), picker closed`, (await raw(chip)) === 'Thu, Oct 1 · 09:00' && (await page.getByRole('dialog').count()) === 0, await raw(chip))
      await page.getByLabel('Thing 1').fill('Call the tyre supplier about the invoice tomorrow 3pm')
      await sleep(200)
      check(`${name} more title words keep the pick`, (await raw(chip)) === 'Thu, Oct 1 · 09:00', await raw(chip))
      await shot(page, name)
      const w0 = state.writes.length
      await page.getByRole('button', { name: 'Start' }).click()
      await sleep(900)
      const tasks = writesTo(state, 'tasks', w0)
      const first = tasks.find((t) => t.title === 'Call the tyre supplier about the invoice')
      check(`${name} Start → the task keeps the picked date (09:00 Cairo, 1 Oct) and is Top 3`, first && first.due_at === '2026-10-01T06:00:00.000Z' && tasks.some((t) => t.id === first.id && t.top3 === true), JSON.stringify(tasks.map((t) => [t.title, t.due_at, t.top3])))
      check(`${name} the undated line has no date`, tasks.some((t) => t.title === 'Gym' && !t.due_at))
      noErrors(name, errors)
      await ctx.close()
    }
  }
  // No date (the picker's Remove) drops the chip; Start writes no date.
  {
    const name = '2-onboarding-no-date'
    const { ctx, page, errors, state } = await open('/onboarding', { app_settings: [settings({ onboarded_at: null, display_name: null })], tasks: [] }, { view: desktop, now: '07:40' })
    await page.getByLabel('Thing 1').fill('Call the tyre supplier tomorrow 3pm')
    await page.locator('.fr-when .kf-chip').click()
    await sleep(400)
    await page.getByRole('dialog').getByRole('button', { name: /No date/ }).click()
    await sleep(300)
    check(`${name} No date → the chip goes, the title stays cleaned`, (await page.locator('.fr-when .kf-chip').count()) === 0)
    const w0 = state.writes.length
    await page.getByRole('button', { name: 'Start' }).click()
    await sleep(900)
    const t = writesTo(state, 'tasks', w0).find((r) => r.title === 'Call the tyre supplier')
    check(`${name} Start → no due date`, t && !t.due_at, JSON.stringify(t))
    noErrors(name, errors)
    await ctx.close()
  }
}

// ── 3. Today's first-visit hint (First Run 9i): one Caveat line under the next-move card, once ──
if (ONLY.includes('3')) {
  const HINT = '↑ this card always shows your next move'
  const FLAG = `kf-first-today-hint:${UID}`
  const three = [
    task(1, 'Call the tyre supplier', { top3: true, due_at: iso('15:00', 28) }),
    task(2, 'Finish the flow audit', { top3: true }),
    task(3, 'Gym', { top3: true }),
  ]
  const block = { id: 'e0000000-0000-4000-8000-000000000001', user_id: UID, title: 'Deep work', starts_at: iso('09:00'), ends_at: iso('10:30'), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, created_at: CREATED, updated_at: CREATED }
  const hint = (page) => page.locator('.tp-first-hint')
  const flag = (page) => page.evaluate((k) => localStorage.getItem(k), FLAG)
  const below = (page, card) => page.evaluate(([c]) => {
    const a = document.querySelector(c)?.getBoundingClientRect()
    const h = document.querySelector('.tp-first-hint')?.getBoundingClientRect()
    return !!a && !!h && h.top >= a.bottom - 1 && h.top - a.bottom < 40
  }, [card])
  const handFont = (page) => hint(page).evaluate((e) => getComputedStyle(e).fontFamily.includes('Caveat'))

  // From onboarding: Start lands on the first Today with the hint under the ritual card (07:40, not planned).
  for (const theme of ['day', 'night']) {
    const name = `3-first-today-phone-${theme}`
    const { ctx, page, errors } = await open('/onboarding', { app_settings: [settings({ onboarded_at: null, display_name: null })], tasks: [] }, { theme, now: '07:40' })
    await page.getByLabel('Thing 1').fill('Call the tyre supplier tomorrow 3pm')
    await page.getByLabel('Thing 2').fill('Finish the flow audit')
    await page.getByLabel('Thing 3').fill('Gym')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForURL(/\/today/)
    await sleep(1200)
    check(`${name} Start → Today, the flag left for this account`, (await flag(page)) === '1')
    check(`${name} the hint, the drawing's copy, in Caveat`, (await text(hint(page))) === HINT && (await handFont(page)), await text(hint(page)))
    check(`${name} it sits under the next-move card (the Plan my day ritual card)`, await below(page, '.tp-ritual'))
    await shot(page, name)
    await page.locator('.tp-bar-title').click()
    await sleep(300)
    check(`${name} the first tap anywhere → gone, flag cleared`, (await hint(page).count()) === 0 && (await flag(page)) === null)
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(900)
    check(`${name} after a reload it stays gone`, (await hint(page).count()) === 0)
    noErrors(name, errors)
    await ctx.close()
  }
  // A block running: the hint sits under the NOW slip.
  {
    const name = '3-first-today-phone-slip'
    const { ctx, page, errors } = await open('/today', { tasks: three, calendar_events: [block] }, { now: '09:40', init: { [FLAG]: '1' } })
    check(`${name} under the NOW slip`, (await text(hint(page))) === HINT && (await below(page, '.tp-slip-wrap > *')))
    await shot(page, name)
    noErrors(name, errors)
    await ctx.close()
  }
  // Midday, nothing running: the phone shows no card (ruling 3), so no hint yet; the flag waits.
  {
    const name = '3-first-today-phone-nocard'
    const { ctx, page, errors } = await open('/today', { tasks: three }, { now: '13:10', init: { [FLAG]: '1' } })
    await page.locator('.tp-bar-title').click()
    await sleep(300)
    check(`${name} no card → no hint, and a tap doesn't spend it`, (await hint(page).count()) === 0 && (await page.locator('.tp-ritual, .tp-slip-wrap').count()) === 0 && (await flag(page)) === '1')
    noErrors(name, errors)
    await ctx.close()
  }
  // An account that never had the flag (everyone before this) never sees it.
  {
    const name = '3-first-today-phone-existing'
    const { ctx, page, errors } = await open('/today', { tasks: three }, { now: '07:40' })
    check(`${name} no flag → no hint`, (await hint(page).count()) === 0 && (await page.locator('.tp-ritual').count()) === 1)
    noErrors(name, errors)
    await ctx.close()
  }
  // Desktop: under the Day card; a click anywhere clears it.
  for (const theme of ['day', 'night']) {
    const name = `3-first-today-desktop-${theme}`
    const { ctx, page, errors } = await open('/today', { tasks: three }, { view: desktop, theme, now: '07:40', init: { [FLAG]: '1' } })
    check(`${name} the hint under the Day card, in Caveat`, (await text(hint(page))) === HINT && (await handFont(page)) && (await below(page, '.kf-daycard-slot')))
    await shot(page, name)
    await page.mouse.click(1200, 680)
    await sleep(300)
    check(`${name} a click anywhere → gone, flag cleared`, (await hint(page).count()) === 0 && (await flag(page)) === null)
    noErrors(name, errors)
    await ctx.close()
  }
}

// ── 4. Labels on task rows, a Label filter in Tasks, `*label` in quick add ──
if (ONLY.includes('4')) {
  const rows = [
    task(1, 'Call the tyre supplier', { labels: ['calls', 'admin', 'q3'], due_at: iso('15:00'), project_id: PROJECTS[0].id, top3: true }),
    task(2, 'Water the plants', { labels: ['home'], due_at: iso('18:00') }),
    task(3, 'Send the Q3 numbers', { due_at: iso('17:00') }),
  ]
  const rowOf = (page, n) => page.locator(`[id="task-${id(n)}"]`)
  const chipsOf = (page, n) => rowOf(page, n).locator('.kf-chip--bordered').allTextContents()
  for (const [view, vname] of [[desktop, 'desktop'], [phone, 'phone']]) {
    for (const theme of ['day', 'night']) {
      const name = `4-labels-tasks-${vname}-${theme}`
      const { ctx, page, errors, state } = await open('/tasks?list=all', { tasks: rows }, { view, theme })
      check(`${name} a row shows its first two labels as kit chips, then +1`, JSON.stringify(await chipsOf(page, 1)) === '["calls","admin"]' && (await text(rowOf(page, 1).getByLabel('1 more label'))) === '+1', JSON.stringify(await chipsOf(page, 1)))
      check(`${name} one label → one chip; none → none`, JSON.stringify(await chipsOf(page, 2)) === '["home"]' && (await chipsOf(page, 3)).length === 0)
      const meta = await rowOf(page, 1).locator('.kf-chip--bordered').first().evaluate((e) => ({ h: e.getBoundingClientRect().height / (Number(document.documentElement.style.zoom) || 1), fs: getComputedStyle(e).fontSize, line: getComputedStyle(e.parentElement).fontSize, border: getComputedStyle(e).borderTopStyle }))
      check(`${name} the chip sits in the meta line (bordered, ≤22 CSS px tall, the meta's own type${vname === 'phone' ? ', ≥12px' : ''})`, meta.border === 'solid' && meta.h <= 22 && meta.fs === meta.line && (vname === 'desktop' || parseFloat(meta.fs) >= 12), JSON.stringify(meta))
      const trigger = page.getByRole('button', { name: 'Label filter' })
      check(`${name} Tasks' tools carry "Label · All ▾" beside Sort`, (await trigger.count()) === 1 && /Label · All/i.test(await raw(trigger)), await raw(trigger))
      await shot(page, name)
      if (theme === 'day') {
        await trigger.click()
        await sleep(300)
        const opts = await page.getByRole('option').allTextContents()
        check(`${name} the filter lists every label once, A–Z, after All labels`, JSON.stringify(opts) === '["All labels","admin","calls","home","q3"]', JSON.stringify(opts))
        await shot(page, `${name}-filter`)
        await page.getByRole('option', { name: 'home' }).click()
        await sleep(300)
        check(`${name} Label · home → only that label's rows`, (await rowOf(page, 2).count()) === 1 && (await rowOf(page, 1).count()) === 0 && (await rowOf(page, 3).count()) === 0 && /Label · home/i.test(await raw(trigger)))
        await trigger.click()
        await sleep(300)
        await page.getByRole('option', { name: 'All labels' }).click()
        await sleep(300)
        check(`${name} All labels → every row back`, (await rowOf(page, 1).count()) + (await rowOf(page, 2).count()) + (await rowOf(page, 3).count()) === 3)
        if (vname === 'desktop') {
          // Tasks' own quick add takes `*label` too.
          const w0 = state.writes.length
          const input = page.getByPlaceholder(/Quick add task/)
          await input.fill('Book the dentist *health *calls')
          await input.press('Enter')
          await sleep(400)
          const t = writesTo(state, 'tasks', w0).find((r) => r.title === 'Book the dentist')
          check(`${name} Tasks quick add "Book the dentist *health *calls" → labels [health, calls], clean title`, t && JSON.stringify(t.labels) === '["health","calls"]', JSON.stringify(t))
        }
      }
      noErrors(name, errors)
      await ctx.close()
    }
  }
  // The command bar's quick add: `*label` shows as a chip and lands on the task.
  {
    const name = '4-labels-command-bar'
    const { ctx, page, errors, state } = await open('/tasks?list=all', { tasks: rows }, { view: desktop })
    await page.keyboard.press('Control+k')
    await sleep(300)
    const input = page.getByPlaceholder('Send the quote tomorrow 3pm #shaheen')
    await input.fill('call Omar *calls tomorrow 3pm *q3')
    await sleep(200)
    check(`${name} the preview shows *calls and *q3 chips`, (await page.getByText('*calls', { exact: true }).count()) === 1 && (await page.getByText('*q3', { exact: true }).count()) === 1)
    await shot(page, name)
    const w0 = state.writes.length
    await input.press('Enter')
    await sleep(400)
    const t = writesTo(state, 'tasks', w0).find((r) => r.title === 'call Omar')
    check(`${name} Enter → a task "call Omar", labels [calls, q3], due tomorrow 15:00 Cairo`, t && JSON.stringify(t.labels) === '["calls","q3"]' && t.due_at === iso('15:00', 28), JSON.stringify(t))
    await page.keyboard.press('Control+k')
    await sleep(300)
    await input.fill('buy milk *errands')
    await sleep(150)
    check(`${name} a label alone is a task, not an Inbox capture`, (await page.getByText('→ Inbox (unfiled)').count()) === 0)
    noErrors(name, errors)
    await ctx.close()
  }
  // Today's rows carry them too (phone compact rows + desktop rows).
  for (const [view, vname] of [[phone, 'phone'], [desktop, 'desktop']]) {
    const name = `4-labels-today-${vname}`
    const today = [task(1, 'Call the tyre supplier', { top3: true, due_at: iso('15:00') }), task(2, 'Send the Q3 numbers', { top3: true, labels: ['calls', 'admin', 'q3'], due_at: iso('17:00') }), task(3, 'Water the plants', { top3: true, labels: ['home'], due_at: iso('18:00') })]
    const { ctx, page, errors } = await open('/today', { tasks: today }, { view })
    const all = await page.locator('.kf-chip--bordered').allTextContents()
    check(`${name} Today's rows show labels (two, then +1)`, JSON.stringify(all) === '["calls","admin","home"]' && (await page.getByLabel('1 more label').count()) === 1, JSON.stringify(all))
    await shot(page, name)
    noErrors(name, errors)
    await ctx.close()
  }
}

// ── 5. The routine streak goal (migration 0046): saved from the form, "12 / 30" where the streak shows ──
if (ONLY.includes('5')) {
  const DAILY = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  const routine = (n, name, over = {}) => ({ id: `r0000000-0000-4000-8000-00000000000${n}`, user_id: UID, name, time_of_day: null, clock_time: null, cadence: DAILY, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, goal_days: null, created_at: iso('09:00', 1), updated_at: CREATED, ...over })
  const R = [
    routine(1, 'Cold showers', { challenge_start: '2026-09-16', challenge_end: '2026-10-15', goal_days: 30 }),
    routine(2, 'Read'),
    routine(3, 'Stretch', { challenge_start: '2026-09-20', challenge_end: '2026-10-03' }), // pre-0046: no goal_days
  ]
  const day = (d) => `2026-09-${String(d).padStart(2, '0')}`
  const done = (r, from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: `c${r}000000-0000-4000-8000-0000000000${String(from + i).padStart(2, '0')}`, user_id: UID, routine_id: R[r - 1].id, completed_on: day(from + i), created_at: CREATED }))
  const completions = [...done(1, 16, 27), ...done(2, 25, 27), ...done(3, 22, 27)]
  const rowOf = (page, name) => page.locator('div', { has: page.getByText(name, { exact: true }) }).filter({ has: page.locator('[title="14-day trellis"]') }).last()
  for (const [view, vname] of [[desktop, 'desktop'], [phone, 'phone']]) {
    for (const theme of ['day', 'night']) {
      const name = `5-routines-${vname}-${theme}`
      const { ctx, page, errors, state } = await open('/routines', { routines: R, routine_completions: completions }, { view, theme })
      check(`${name} a routine with a goal reads its streak as "12 / 30"`, (await rowOf(page, 'Cold showers').getByLabel('12 of 30 days').count()) === 1 && /12 \/ 30/.test(await raw(rowOf(page, 'Cold showers'))), await raw(rowOf(page, 'Cold showers')))
      check(`${name} one without a goal keeps the bare count`, (await rowOf(page, 'Read').getByLabel('3 day streak').count()) === 1 && !/\//.test(await raw(rowOf(page, 'Read').getByLabel('3 day streak'))))
      await shot(page, name)
      if (theme === 'day') {
        await rowOf(page, 'Cold showers').locator('[title="14-day trellis"]').click()
        await sleep(500)
        check(`${name} the trellis heads it "12 / 30 days"`, (await page.getByText('12 / 30 days', { exact: true }).count()) === 1)
        await shot(page, `${name}-trellis`)
        await page.keyboard.press('Escape')
        await sleep(300)
      }
      if (vname === 'desktop' && theme === 'day') {
        // A pre-0046 challenge (no goal_days) still reads its window on the Challenge card.
        // The form: a 30-day challenge writes goal_days 30 with its window.
        await page.getByText('＋ Start a challenge').click()
        await sleep(400)
        await page.getByPlaceholder('Evening stretch').fill('Meditate')
        await shot(page, `${name}-form`)
        const w0 = state.writes.length
        await page.getByText('Plant routine').click()
        await sleep(500)
        const w = writesTo(state, 'routines', w0).find((r) => r.name === 'Meditate')
        check(`${name} Plant (Challenge · 30 day streak) → goal_days 30 with a 30-day window`, w && w.goal_days === 30 && w.challenge_start === '2026-09-27' && w.challenge_end === '2026-10-26', JSON.stringify(w && { goal_days: w.goal_days, start: w.challenge_start, end: w.challenge_end }))
      }
      noErrors(name, errors)
      await ctx.close()
    }
  }
  {
    const name = '5-routines-pre-0046-challenge'
    const { ctx, page, errors } = await open('/routines', { routines: [R[2]], routine_completions: completions }, { view: desktop })
    check(`${name} a challenge from before 0046 reads its window (6 / 14 days) on the Challenge card`, /6\s*\/ 14 days/.test(await raw(page.locator('body'))))
    noErrors(name, errors)
    await ctx.close()
  }
}

// @@ITEMS@@

await browser.close()
const file = path.join(OUT, `verify-results${ONLY.length < 5 ? '-' + ONLY.join('') : ''}.json`)
fs.writeFileSync(file, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
