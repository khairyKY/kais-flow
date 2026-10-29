// ios-pwa (2026-10-29): the iPhone Home Screen app, on the real pages against a MOCKED backend, in Playwright WebKit
// (iPhone SE 3rd gen, 15, 15 Pro Max) plus one Chromium Android run (Pixel 7).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5334] [distDir] [playwright-core path]
// The dev server must run with VITE_SUPABASE_URL=http://127.0.0.1:59999 in its environment (WebKit refuses port 9
// before Playwright's route() can answer). distDir = a production build, for the precache-size check.
//
// Safe areas can't be emulated off a device (WebKit desktop reports env(safe-area-inset-*) = 0), so the harness sets
// the two tokens every surface reads (--sat / --sab, styles/tokens/spacing.css) to each phone's real insets and checks
// that the chrome moves with them. Standalone = display-mode: standalone and navigator.standalone stubbed true.
// The keyboard: visualViewport.height shrunk (the layout viewport stays), as on iOS.
//
// Checks: safe-area paddings (top chrome on Today, Calendar, Tasks, Inbox, Settings, Focus, a full sheet, Chat; the tab
// bar and the capture button clear the home indicator, 16px where there's none); no field under 16px on touch; the
// chat field stays above the keyboard; the audit's tap targets reach 44; the install guide (iOS Safari tab only — not
// standalone, not desktop; dismissed stays dismissed; Settings opens it again); the theme-color metas follow the app's
// theme (pre-paint and on a live switch); the precache manifest under 3 MB; no sideways page scroll anywhere.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5334'
const DIST = process.argv[4]
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { webkit, chromium, devices } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── mock session + rows (the iOS audit's day: Wed 21 Oct 2026, Cairo, 12:09) ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const DAY = 21
const cairo = (hhmm, day = DAY) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, day, h - 3, m)) }
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, day, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null,
  project_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const sched = (from, to, day = DAY) => ({ scheduled_start: iso(from, day), scheduled_end: iso(to, day), due_at: iso(from, day) })
const TASKS = [
  task(2, 'Call the tyre supplier', { ...sched('09:30', '10:30'), duration_min: 60, top3: true, top3_rank: 1 }),
  task(5, 'Water the plants', { ...sched('14:00', '15:00'), duration_min: 60, recurrence_rule: 'FREQ=WEEKLY' }),
  task(7, 'Paint the fence', { ...sched('16:00', '17:00', 22), duration_min: 60 }),
  task(8, 'Buy stamps', { due_at: iso('09:00'), duration_min: 30, top3: true, top3_rank: 2 }),
  task(9, 'Renew the car licence before the end of the month, with the papers from the drawer', { due_at: iso('09:00') }),
  task(10, 'Email the landlord about the boiler', { due_at: iso('09:00', 20) }),
  task(11, 'Read chapter 4', {}),
  task(12, 'Plan the weekend trip', { due_at: iso('09:00', 23) }),
]
const EVENTS = [
  ev(2, 'Call the tyre supplier', '09:30', '10:30', DAY, 2),
  ev(3, 'Dentist', '10:30', '11:15', DAY),
  ev(6, 'Water the plants', '14:00', '15:00', DAY, 5),
  ev(31, 'Gym', '18:00', '19:00', DAY),
]
const INBOX = [
  { id: 'b0000000-0000-4000-8000-000000000001', user_id: UID, raw_text: 'Look into a new phone plan', source: 'text', status: 'pending', created_at: CREATED, updated_at: CREATED },
  { id: 'b0000000-0000-4000-8000-000000000002', user_id: UID, raw_text: 'Call mum on Friday', source: 'voice', status: 'pending', created_at: CREATED, updated_at: CREATED },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: INBOX, projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

// Insets as on the device (portrait): the SE has a 20pt status bar and no home indicator; the others the Dynamic Island
// and the home indicator. `kb` = the keyboard's height.
const PHONES = [
  { name: 'iphoneSE', d: devices['iPhone SE (3rd gen)'], sat: 20, sab: 0, screenH: 667, kb: 260 },
  { name: 'iphone15', d: devices['iPhone 15'], sat: 59, sab: 34, screenH: 852, kb: 336 },
  { name: 'iphone15promax', d: devices['iPhone 15 Pro Max'], sat: 59, sab: 34, screenH: 932, kb: 346 },
]

async function open(browser, phone, route, o = {}) {
  const { standalone = true, insets = true, theme = 'day', guideDismissed = true, desktop = false } = o
  const desc = desktop ? { viewport: { width: 1280, height: 800 } } : { ...phone.d }
  delete desc.defaultBrowserType
  const ctx = await browser.newContext({
    ...desc,
    ...(desktop ? {} : { viewport: { width: desc.viewport.width, height: phone.screenH }, screen: { width: desc.viewport.width, height: phone.screenH } }),
    timezoneId: 'Africa/Cairo',
    locale: 'en-US',
  })
  await ctx.addInitScript(([sess, uid, now, standalone, sat, sab, theme, dismissed]) => {
    localStorage.setItem('kf_theme', theme)
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe']))
    if (dismissed) localStorage.setItem('kf-install-guide-dismissed', '1')
    else localStorage.removeItem('kf-install-guide-dismissed')
    if (standalone) {
      try { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true }) } catch {}
      const mm = window.matchMedia.bind(window)
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q))
    }
    if (sat != null) {
      // WebKit runs this before <html> exists: set the insets as soon as it does.
      const apply = () => {
        document.documentElement.style.setProperty('--sat', `${sat}px`)
        document.documentElement.style.setProperty('--sab', `${sab}px`)
      }
      if (document.documentElement) apply()
      else new MutationObserver((_, o) => document.documentElement && (apply(), o.disconnect())).observe(document, { childList: true })
    }
  }, [JSON.stringify(session), UID, cairo('12:09').getTime(), standalone, insets ? phone.sat : null, phone.sab, theme, guideDismissed])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:59999/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }).catch(() => {})
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user }).catch(() => {})
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return (rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('12:09') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch((e) => errors.push('goto ' + e.message))
  await sleep(1200)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

/** Page facts: sideways scroll, the fields under 16px on screen, the top chrome's top, the tab bar's padding. */
const facts = (page) =>
  page.evaluate(() => {
    const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1
    const shown = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight }
    const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=color]), textarea, select, [contenteditable="true"]')].filter(shown)
    const small = fields.map((e) => ({ el: (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.tagName).slice(0, 30), px: +(parseFloat(getComputedStyle(e).fontSize) * z).toFixed(1) })).filter((f) => f.px < 16)
    const tabbar = document.querySelector('.app-tabbar')
    const tabs = tabbar ? [...tabbar.querySelectorAll('a, button')].filter(shown).map((e) => e.getBoundingClientRect().bottom) : []
    const capture = document.querySelector('.kf-capture')?.getBoundingClientRect()
    const main = document.querySelector('.app-shell > main')
    return {
      hscroll: document.scrollingElement.scrollWidth - innerWidth,
      fields: fields.length,
      small,
      vh: innerHeight,
      mainPadTop: main ? parseFloat(getComputedStyle(main).paddingTop) : null,
      tabbarPadBottom: tabbar && getComputedStyle(tabbar).display !== 'none' ? parseFloat(getComputedStyle(tabbar).paddingBottom) : null,
      tabsBottom: tabs.length ? Math.max(...tabs) : null,
      captureBottom: capture ? capture.bottom : null,
    }
  })

/** The effective touch area of each element matching `sel`: its box, or its ::after hit area when that is bigger. */
const hits = (page, sel) =>
  page.evaluate((sel) => {
    const els = typeof sel === 'string' ? [...document.querySelectorAll(sel)] : []
    return els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight }).map((e) => {
      const r = e.getBoundingClientRect()
      const a = getComputedStyle(e, '::after')
      let w = r.width, h = r.height
      if (a.content !== 'none' && a.position === 'absolute') {
        const n = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
        w = Math.max(w, r.width - n(a.left) - n(a.right))
        h = Math.max(h, r.height - n(a.top) - n(a.bottom))
      }
      return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20), w: Math.round(w), h: Math.round(h) }
    })
  }, sel)

const hitsByText = (page, selector, text) =>
  page.evaluate(([selector, text]) => {
    const e = [...document.querySelectorAll(selector)].find((x) => x.textContent.trim().includes(text))
    if (!e) return null
    e.setAttribute('data-ios-probe', '1')
    return true
  }, [selector, text]).then(async (found) => {
    if (!found) return []
    const r = await hits(page, '[data-ios-probe]')
    await page.evaluate(() => document.querySelectorAll('[data-ios-probe]').forEach((e) => e.removeAttribute('data-ios-probe')))
    return r
  })

const allAtLeast44 = (list) => list.length > 0 && list.every((x) => x.w >= 44 && x.h >= 44)
const fmt = (list) => list.map((x) => `${x.t || '·'} ${x.w}×${x.h}`).join(', ')

async function fakeKeyboard(page, kb) {
  await page.evaluate((kb) => {
    const vv = window.visualViewport
    const H = innerHeight
    Object.defineProperty(vv, 'height', { configurable: true, get: () => H - kb })
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 })
    vv.dispatchEvent(new Event('resize'))
  }, kb)
  await sleep(500)
}

async function walk(browser, phone, tag) {
  const tabbarWant = Math.max(phone.sab, 16)
  const insetOk = (f, what) => {
    check(`${tag} ${what}: the column starts below the status bar (${phone.sat}px)`, f.mainPadTop === phone.sat, `padding-top ${f.mainPadTop}`)
    check(`${tag} ${what}: no sideways scroll`, f.hscroll <= 0, f.hscroll)
    check(`${tag} ${what}: no field under 16px`, f.small.length === 0, f.small.map((s) => `${s.el} ${s.px}`).join(', ') || `${f.fields} field(s)`)
  }

  // Today
  let s = await open(browser, phone, '/today')
  let f = await facts(s.page)
  insetOk(f, 'Today')
  const bar = await s.page.evaluate(() => document.querySelector('.tp-bar')?.getBoundingClientRect().top ?? null)
  check(`${tag} Today: its header sits below the status bar`, bar != null && bar >= phone.sat - 0.5, bar)
  // today-v2: the Plan card and the Top 3 header (with its load line) — everything on the page, really — start below it.
  const tops = await s.page.evaluate(() => {
    // decoration that drifts in from above (the season's falling leaves, aria-hidden) isn't content
    const els = [...document.querySelectorAll('.tp *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden="true"]') })
    const first = els.reduce((m, e) => (e.getBoundingClientRect().top < m.getBoundingClientRect().top ? e : m), els[0])
    return { min: Math.round(first.getBoundingClientRect().top), el: first.tagName.toLowerCase() + (first.className ? '.' + String(first.className).trim().split(' ').join('.') : ''), top3: document.querySelector('.tp-pt')?.getBoundingClientRect().top ?? null }
  })
  check(`${tag} Today: nothing on the page (Plan card, Top 3 header) reaches into the status bar`, tops.min >= phone.sat - 0.5 && tops.top3 != null && tops.top3 >= phone.sat, JSON.stringify(tops))
  check(`${tag} Today (installed): the tab bar pads ${tabbarWant}px (max(home indicator, 16))`, f.tabbarPadBottom === tabbarWant, f.tabbarPadBottom)
  check(`${tag} Today: tabs and the capture button clear the home indicator`, f.tabsBottom != null && f.tabsBottom <= f.vh - phone.sab + 0.5 && f.captureBottom != null && f.captureBottom <= f.vh - phone.sab + 0.5, `tabs ${f.tabsBottom} capture ${f.captureBottom} / band from ${f.vh - phone.sab}`)
  for (const [what, sel, optional] of [['day arrows', '.tp-home .tp-day-step', true], ['“All tasks”', '.tp-pt-link'], ['the Top 3 load line', '.tp-load-btn', true], ['row ⋯', '.tp-slim .kf-row-more, .tp-gs .kf-row-more']]) {
    const h = await hits(s.page, sel)
    if (optional && h.length === 0) continue // not on screen in this day's view
    check(`${tag} Today: ${what} ≥ 44`, allAtLeast44(h), fmt(h))
  }
  const replan = await hitsByText(s.page, 'button', 'Replan all')
  check(`${tag} Today: Replan all ≥ 44`, allAtLeast44(replan), fmt(replan))
  await shot(s.page, `${tag}-today`)
  // a full-height sheet clears the status bar: More, expanded
  await s.page.locator('.app-tabbar').getByText('More', { exact: true }).tap()
  await sleep(700)
  await s.page.locator('[role=dialog] .kf-bs-handle').first().tap().catch(() => {})
  await sleep(700)
  const sheetTop = await s.page.evaluate(() => document.querySelector('[role=dialog][aria-modal=true]')?.getBoundingClientRect().top ?? null)
  check(`${tag} a full sheet starts below the status bar`, sheetTop != null && sheetTop >= phone.sat, sheetTop)
  await shot(s.page, `${tag}-more-full`)
  // Chat: More → Chat
  await s.page.locator('[role=dialog] button', { hasText: 'Chat' }).first().tap()
  await sleep(1500)
  await s.page.locator('.kf-drawer form input').first().waitFor({ timeout: 10000 }).catch(() => {}) // a cold chat chunk
  const chat = await s.page.evaluate(() => {
    const p = document.querySelector('.kf-drawer')
    const head = p?.firstElementChild?.nextElementSibling?.getBoundingClientRect() // after the <style>
    return p ? { padTop: parseFloat(getComputedStyle(p).paddingTop), headTop: head?.top ?? null } : null
  })
  check(`${tag} Chat: its header starts below the status bar`, chat && chat.headTop >= phone.sat, JSON.stringify(chat))
  const chatHits = [...(await hits(s.page, '.kf-chat-mic')), ...(await hits(s.page, '.kf-drawer form button[type=submit]'))]
  check(`${tag} Chat: mic and send ≥ 44`, chatHits.length === 2 && allAtLeast44(chatHits), fmt(chatHits))
  f = await facts(s.page)
  check(`${tag} Chat: no field under 16px`, f.small.length === 0, f.small.map((x) => `${x.el} ${x.px}`).join(', ') || `${f.fields} field(s)`)
  const field = s.page.locator('.kf-drawer form input').first()
  await field.focus()
  await fakeKeyboard(s.page, phone.kb)
  await s.page.keyboard.type('What is on today?').catch(() => {})
  const kb = await s.page.evaluate(() => {
    const a = document.activeElement.getBoundingClientRect()
    const p = document.querySelector('.kf-drawer').getBoundingClientRect()
    return { fieldBottom: Math.round(a.bottom), panelBottom: Math.round(p.bottom), visible: Math.round(window.visualViewport.height) }
  })
  check(`${tag} Chat: the field stays above the keyboard`, kb.fieldBottom <= kb.visible && Math.abs(kb.panelBottom - kb.visible) <= 1, JSON.stringify(kb))
  await shot(s.page, `${tag}-chat-keyboard`)
  check(`${tag} Today/Chat: no page errors`, s.errors.length === 0, s.errors.join(' | '))
  await s.ctx.close()

  // Capture: the field is 16px and rides the keyboard
  s = await open(browser, phone, '/today')
  await s.page.locator('.kf-capture').first().tap()
  await sleep(900)
  const cap = s.page.locator('[role=dialog] input, [role=dialog] textarea, [role=dialog] [contenteditable=true]').first()
  await cap.focus().catch(() => {})
  await fakeKeyboard(s.page, phone.kb)
  f = await facts(s.page)
  check(`${tag} Capture: no field under 16px`, f.small.length === 0, f.small.map((x) => `${x.el} ${x.px}`).join(', ') || `${f.fields} field(s)`)
  const capKb = await s.page.evaluate(() => ({ bottom: Math.round(document.activeElement.getBoundingClientRect().bottom), visible: Math.round(window.visualViewport.height) }))
  check(`${tag} Capture: the field stays above the keyboard`, capKb.bottom <= capKb.visible, JSON.stringify(capKb))
  await s.ctx.close()

  // Calendar, Tasks, Inbox, Settings, Focus
  for (const [key, route] of [['Calendar', '/calendar'], ['Tasks', '/tasks'], ['Inbox', '/inbox'], ['Settings', '/settings'], ['Focus', '/focus']]) {
    s = await open(browser, phone, route)
    f = await facts(s.page)
    insetOk(f, key)
    if (key === 'Calendar') {
      await s.page.locator('.pc').first().waitFor({ timeout: 10000 }).catch(() => {}) // a cold calendar chunk
      const head = await s.page.evaluate(() => document.querySelector('.pc')?.getBoundingClientRect().top ?? null)
      check(`${tag} Calendar: its header sits below the status bar`, head != null && head >= phone.sat, head)
    }
    if (key === 'Tasks') {
      const tabs = await hits(s.page, '.tr-tabstrip > a')
      check(`${tag} Tasks: the list tabs ≥ 44`, allAtLeast44(tabs), fmt(tabs.filter((t) => t.w < 44 || t.h < 44)) || `${tabs.length} tabs`)
      const rep = await hitsByText(s.page, 'a', 'Repeating')
      check(`${tag} Tasks: “↻ Repeating” ≥ 44`, allAtLeast44(rep), fmt(rep))
      const save = await hitsByText(s.page, 'button', 'Save as smart list')
      check(`${tag} Tasks: “＋ Save as smart list” ≥ 44`, allAtLeast44(save), fmt(save))
    }
    if (key === 'Inbox') {
      const file = await page_hitsAll(s.page, 'button', 'File')
      check(`${tag} Inbox: File ≥ 44`, allAtLeast44(file), fmt(file))
    }
    if (key === 'Settings') {
      const search = s.page.locator('input[aria-label="Search settings"]').first()
      if (await search.count()) {
        await search.tap().catch(() => {})
        await sleep(300)
        const px = await search.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
        check(`${tag} Settings: the search field is 16px`, px >= 16, px)
      }
      const topbar = await s.page.evaluate(() => document.querySelector('.app-topbar')?.getBoundingClientRect().top ?? null)
      check(`${tag} Settings: the top bar sits below the status bar`, topbar == null || topbar >= phone.sat, topbar)
    }
    if (key === 'Focus') {
      const top = await s.page.evaluate(() => document.querySelector('.focus-bleed')?.getBoundingClientRect().top ?? null)
      check(`${tag} Focus: the page starts below the status bar`, top != null && top >= phone.sat, top)
    }
    await shot(s.page, `${tag}-${key.toLowerCase()}`)
    check(`${tag} ${key}: no page errors`, s.errors.length === 0, s.errors.join(' | '))
    await s.ctx.close()
  }
}

/** Every visible element `selector` whose text is exactly `text`. */
async function page_hitsAll(page, selector, text) {
  await page.evaluate(([selector, text]) => document.querySelectorAll(selector).forEach((e) => e.textContent.trim() === text && e.setAttribute('data-ios-probe', '1')), [selector, text])
  const r = await hits(page, '[data-ios-probe]')
  await page.evaluate(() => document.querySelectorAll('[data-ios-probe]').forEach((e) => e.removeAttribute('data-ios-probe')))
  return r
}

const metaColors = (page) => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content').toLowerCase()))

const wk = await webkit.launch({ headless: true })
for (const phone of PHONES.filter((p) => !process.env.ONLY || process.env.ONLY.split(',').includes(p.name))) {
  console.log('— walk', phone.name)
  try {
    await walk(wk, phone, `wk-${phone.name}`)
  } catch (e) {
    check(`wk-${phone.name} walk finished`, false, String(e?.stack || e).slice(0, 400))
  }
}

// The install guide: iOS Safari in a tab only, once; Settings brings it back.
{
  const phone = PHONES[1]
  let s = await open(wk, phone, '/today', { standalone: false, guideDismissed: false })
  await sleep(3200)
  const guide = s.page.locator('[data-install-guide]')
  check('install guide: shows in an iOS Safari tab', await guide.isVisible().catch(() => false))
  const text = await guide.innerText().catch(() => '')
  check('install guide: three steps, the Share icon', (await guide.locator('li').count()) === 3 && (await guide.locator('svg').count()) >= 1 && /Add to Home Screen/.test(text), text.replace(/\s+/g, ' ').slice(0, 120))
  await shot(s.page, 'guide-ios-safari')
  await guide.getByRole('button', { name: 'Not now' }).tap()
  await sleep(400)
  check('install guide: Not now closes it and remembers', !(await guide.isVisible().catch(() => false)) && (await s.page.evaluate(() => localStorage.getItem('kf-install-guide-dismissed'))) === '1')
  await s.ctx.close()
  // dismissed earlier (open() sets the flag): not again; Settings → About → Show me how brings it back
  s = await open(wk, phone, '/settings/about', { standalone: false, guideDismissed: true })
  await sleep(3200)
  check('install guide: dismissed stays dismissed', !(await s.page.locator('[data-install-guide]').isVisible().catch(() => false)))
  const how = s.page.getByRole('button', { name: 'Show me how' }).first()
  const storageRow = await s.page.getByText('Storage', { exact: true }).count()
  check('Settings → This device: the storage row', storageRow > 0)
  check('Settings → This device: “Add to Home Screen · Show me how” in an iOS Safari tab', (await how.count()) > 0)
  if (await how.count()) {
    await how.tap()
    await sleep(800)
    check('install guide: Settings opens it again', await s.page.locator('[data-install-guide]').isVisible().catch(() => false))
    await shot(s.page, 'guide-from-settings')
  }
  await s.ctx.close()
  s = await open(wk, phone, '/today', { standalone: true, guideDismissed: false })
  await sleep(3200)
  check('install guide: not in the installed app (standalone)', !(await s.page.locator('[data-install-guide]').isVisible().catch(() => false)))
  await s.ctx.close()
  s = await open(wk, phone, '/today', { standalone: false, guideDismissed: false, desktop: true, insets: false })
  await sleep(3200)
  check('install guide: not on a computer', !(await s.page.locator('[data-install-guide]').isVisible().catch(() => false)))
  const desk = await facts(s.page)
  check('desktop: no top inset, no sideways scroll', desk.mainPadTop === 0 && desk.hscroll <= 0, JSON.stringify({ pad: desk.mainPadTop, h: desk.hscroll }))
  await shot(s.page, 'desktop-today')
  await s.ctx.close()
}

// theme-color: the app's theme, before the first paint and on a live switch.
{
  const phone = PHONES[1]
  let s = await open(wk, phone, '/today', { theme: 'day' })
  check('theme-color: Day → --paper-linen #efe9db', (await metaColors(s.page)).every((c) => c === '#efe9db'), (await metaColors(s.page)).join(' '))
  await s.ctx.close()
  s = await open(wk, phone, '/settings/appearance', { theme: 'night' })
  check('theme-color: Night (pre-paint) → #211d30', (await metaColors(s.page)).every((c) => c === '#211d30'), (await metaColors(s.page)).join(' '))
  await s.page.getByRole('button', { name: 'Light' }).first().tap()
  await sleep(800)
  const live = await metaColors(s.page)
  const bodyBg = await s.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('theme-color: a live switch to Light follows at once', live.every((c) => c === '#efe9db'), `${live.join(' ')} · body ${bodyBg}`)
  const metas = await s.page.evaluate(() => ({
    vp: document.querySelector('meta[name=viewport]').content,
    bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
    media: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.media),
  }))
  check('index.html: viewport-fit=cover, status-bar style, title, light/dark theme-color', /viewport-fit=cover/.test(metas.vp) && metas.bar && metas.title === "Kai's Flow" && metas.media.join() === '(prefers-color-scheme: light),(prefers-color-scheme: dark)', JSON.stringify(metas))
  await s.ctx.close()
}
await wk.close()

// One Chromium Android run (Pixel 7, no inset simulation: what the browser reports).
{
  const cr = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const pixel = { name: 'pixel7', d: devices['Pixel 7'], sat: 0, sab: 0, screenH: devices['Pixel 7'].viewport.height }
  for (const [key, route] of [['Today', '/today'], ['Tasks', '/tasks'], ['Settings', '/settings']]) {
    const s = await open(cr, pixel, route, { insets: false, standalone: false, guideDismissed: false })
    await sleep(2800)
    const f = await facts(s.page)
    check(`android ${key}: no sideways scroll, no field under 16px`, f.hscroll <= 0 && f.small.length === 0, JSON.stringify({ h: f.hscroll, small: f.small }))
    if (key === 'Today') {
      check('android Today (a browser tab): the tab bar pads what the browser reports, 0 as before', f.tabbarPadBottom === 0, f.tabbarPadBottom)
      check('android: no install guide (iOS Safari only)', !(await s.page.locator('[data-install-guide]').isVisible().catch(() => false)))
      await shot(s.page, 'android-today')
    }
    check(`android ${key}: no page errors`, s.errors.length === 0, s.errors.join(' | '))
    await s.ctx.close()
  }
  await cr.close()
}

// The precache: a first install under 3 MB.
if (DIST) {
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8')
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
  const bytes = urls.reduce((n, u) => n + fs.statSync(path.join(DIST, u)).size, 0)
  check('precache: under 3 MB', bytes < 3 * 1024 * 1024, `${urls.length} entries, ${(bytes / 1024).toFixed(0)} KiB`)
  check('precache: no design-system art, no non-latin font subsets, no duplicates', !urls.some((u) => u.startsWith('ds/') || /-(cyrillic|greek|vietnamese|latin-ext)/.test(u)) && new Set(urls).size === urls.length)
  check('precache: the tab pages are in it', ['TodayPage', 'InboxPage', 'TasksPage', 'CalendarPage'].every((p) => urls.some((u) => u.includes(`/${p}-`) && u.endsWith('.js'))))
  check('precache: other pages are not', !urls.some((u) => /\/(SettingsPage|JournalPage|LibraryPage)-.*\.js$/.test(u)))
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
