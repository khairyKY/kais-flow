// Polish C real run against a production build (`vite build` + `vite preview`) and the local
// Supabase stack. Based on the conductor's smoke.mjs (copied, not edited): same Chromium, same
// console / request-failure capture, desktop 1280x800 + phone 390x844, browser in Africa/Cairo.
//
// usage (cloud container, local stack up, preview serving the build on :5233, or PC_BASE=<url>):
//   node polish-c-e2e.mjs <mode> <shotDir> <prefix>
//   signup   → sign up polish-c@example.com through the form; onboarding as "Mira" / "Nile Studio"
//   seed     → as polish-c, through the UI: a person, a capture, a journal entry, a routine
//              (PC_INTERACTION=1 also logs an interaction on the new person)
//   shots    → shell (desktop + phone, day + night), More sheet + its four new rows, Activity,
//              Search (page + ⌘/ overlay), then kai.local's fallback
//   offline  → two actions offline → topbar strip + queue popover, then back online → Synced
//   sheet    → More-sheet geometry at 390/360px, 125% (default) and 100% interface size
//   longname → sets polish-c's own display_name long over REST, shoots, restores "Mira"
//   strips   → Herbarium / Trash / Library in-page strips + onboarding's workspace preview (?replant=1)
//   activity → Activity scrolled to the audit's rows (desktop day/night, phone)
//   kai      → kai.local desktop shot twice (timing-noise check for the pixel diff)
// Hard-coded: the worktree's app/.env.local path (longname mode) — adjust when re-running elsewhere.
// Needs, beside this file: node_modules/playwright → the global install.
import { chromium } from 'playwright'
import fs from 'node:fs'

const [MODE = 'shots', OUT = './shots', PREFIX = 'x'] = process.argv.slice(2)
const BASE = process.env.PC_BASE ?? 'http://127.0.0.1:5233'
const EMAIL = 'polish-c@example.com'
const PASSWORD = 'polish-c-pass-1'
const NAME = 'Mira'
const WORKSPACE = 'Nile Studio'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const errors = []
const inflight = new WeakMap()
async function settle(page, quietMs = 800, maxMs = 15000) {
  const t0 = Date.now()
  let quietSince = Date.now()
  while (Date.now() - t0 < maxMs) {
    const busy = [...inflight.get(page)].filter((q) => !q.url().includes('open-meteo'))
    if (busy.length) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) return
    await sleep(100)
  }
}
function watch(page, label) {
  const set = new Set()
  inflight.set(page, set)
  page.on('request', (q) => set.add(q))
  page.on('requestfinished', (q) => set.delete(q))
  page.on('requestfailed', (q) => set.delete(q))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} ${new URL(page.url()).pathname}: ${m.text().split('\n')[0].slice(0, 160)}`)
  })
  page.on('requestfailed', (q) => errors.push(`${label} FAILED ${q.url().slice(0, 90)} ${q.failure()?.errorText}`))
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`))
}
const path = (page) => new URL(page.url()).pathname
const body = (page) => page.evaluate(() => document.body.innerText)
async function shot(page, name) {
  await sleep(600)
  const p = `${OUT}/${PREFIX}-${name}.png`
  await page.screenshot({ path: p })
  console.log('      shot', p)
}
async function waitForPath(page, want, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (path(page) === want) return true
    await sleep(100)
  }
  return false
}
async function newPage(browser, label, viewport, { night = false } = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Africa/Cairo', hasTouch: viewport.width < 500, isMobile: viewport.width < 500 })
  await ctx.addInitScript((n) => localStorage.setItem('kf_theme', n ? 'night' : 'day'), night)
  const page = await ctx.newPage()
  watch(page, label)
  return { ctx, page }
}
async function signIn(page, email, password) {
  await page.goto(BASE + '/sign-in')
  await settle(page)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  const t0 = Date.now()
  while (Date.now() - t0 < 15000 && !['/today', '/onboarding'].includes(path(page))) await sleep(100)
  // kai.local never finished onboarding (no app_settings row — that's the "no answers" case), so
  // Polish A's gate offers it the welcome. Don't answer it (shared account): go straight to Today.
  if (path(page) === '/onboarding') {
    console.log(`      ${email}: gate offered /onboarding (never onboarded) → going to /today without answering`)
    await page.goto(BASE + '/today')
    await waitForPath(page, '/today')
  }
  await settle(page, 1500)
}
// Text of the shell's sidebar header + topbar (desktop) — what names the owner.
async function shellText(page) {
  return page.evaluate(() => ({
    header: document.querySelector('.app-sidebar-header')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    topbar: document.querySelector('.app-topbar')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
  }))
}

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium
  .launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  .catch(() => chromium.launch())
try {
  console.log(`build: ${(await (await fetch(BASE + '/version.json')).text()).trim()}`)
} catch {
  console.log('build: (no version.json)')
}

if (MODE === 'signup') {
  const { ctx, page } = await newPage(browser, 'desktop', DESKTOP)
  await page.goto(BASE + '/sign-in')
  await settle(page)
  await page.click('text=Create an account')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  check('sign-up lands on /onboarding', await waitForPath(page, '/onboarding'), path(page))
  await settle(page)
  await page.fill('.ob-finput', NAME)
  await shot(page, 'desktop-onboarding-name')
  await page.locator('.ob-cta').click()
  await sleep(400)
  await page.fill('.ob-finput', WORKSPACE)
  await shot(page, 'desktop-onboarding-workspace')
  const preview = await page.evaluate(() => document.querySelector('.ob-body')?.innerText ?? '')
  console.log('      step-2 preview strip:', JSON.stringify(preview.split('\n').find((l) => l.includes('·')) ?? ''))
  for (let i = 0; i < 8; i++) {
    const cta = page.locator('.ob-cta')
    const label = (await cta.textContent())?.trim() ?? ''
    await cta.click()
    await sleep(300)
    if (label.startsWith('Enter your garden')) break
  }
  check('finishing onboarding lands on Today', await waitForPath(page, '/today'), path(page))
  await settle(page, 2500)
  await shot(page, 'desktop-today-after-onboarding')
  await ctx.close()
}

if (MODE === 'seed') {
  const { ctx, page } = await newPage(browser, 'desktop', DESKTOP)
  await signIn(page, EMAIL, PASSWORD)
  const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
  // A person
  await page.goto(BASE + '/people')
  await settle(page)
  await page.locator('button:has-text("+ New person")').first().click()
  await page.fill('input[placeholder="Name"]', `Salma ${stamp}`)
  await page.click('form >> button[type="submit"]')
  await settle(page, 1500)
  // …and a real interaction with them (the person page opens after Add)
  const talk = page.locator('input[placeholder="what did you talk about?"]')
  if (process.env.PC_INTERACTION && (await talk.count())) {
    await talk.fill('coffee, talked about the jasmine')
    await page.locator('form:has(input[placeholder="what did you talk about?"]) >> button[type="submit"]').click()
    await settle(page, 1500)
    console.log('      logged an interaction on', path(page))
  }
  // A capture through ⌘K (plain text → Inbox)
  await page.goto(BASE + '/today')
  await settle(page)
  await page.keyboard.press('Control+k')
  await sleep(700)
  await page.keyboard.type(`basil seeds for the balcony ${stamp}`)
  await page.keyboard.press('Enter')
  await settle(page, 1500)
  // A journal entry
  await page.goto(BASE + '/journal')
  await settle(page, 1500)
  await page.locator('textarea.ruled').first().click()
  await page.keyboard.type(`Watered the jasmine before work (${stamp}).`, { delay: 30 })
  await sleep(2500)
  await settle(page, 1500)
  // A routine
  await page.goto(BASE + '/routines')
  await settle(page)
  await page.locator('button:has-text("New routine")').first().click()
  await sleep(500)
  await page.fill('input[placeholder="Evening stretch"]', `Evening stretch ${stamp}`)
  await page.locator('button:has-text("Plant routine")').click()
  await settle(page, 2000)
  // Did the rows reach the server? (the outbox drains to empty)
  const queued = await page.evaluate(async () => {
    const req = indexedDB.open('keyval-store')
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
    const tx = db.transaction('keyval', 'readonly')
    const get = (k) => new Promise((res) => { const r = tx.objectStore('keyval').get(k); r.onsuccess = () => res(r.result) })
    return { outbox: ((await get('kf-outbox')) ?? []).length, dead: ((await get('kf-outbox-dead')) ?? []).length }
  }).catch((e) => ({ err: String(e) }))
  console.log('      outbox after seeding:', JSON.stringify(queued))
  check('seed: outbox drained', queued.outbox === 0, JSON.stringify(queued))
  await ctx.close()
}

if (MODE === 'shots') {
  // ── polish-c account: shell names the owner (desktop, day + night) ──
  for (const night of [false, true]) {
    const tag = night ? 'night' : 'day'
    const { ctx, page } = await newPage(browser, `desktop-${tag}`, DESKTOP, { night })
    await signIn(page, EMAIL, PASSWORD)
    const s = await shellText(page)
    console.log(`      polish-c ${tag} header: ${JSON.stringify(s.header)} | topbar: ${JSON.stringify(s.topbar)}`)
    if (!night) {
      check('polish-c: sidebar names the owner', s.header.includes(`${NAME}'s Flow`) && s.header.toUpperCase().includes(WORKSPACE.toUpperCase()), s.header)
      check('polish-c: topbar names the owner', s.topbar.toUpperCase().includes(`${NAME.toUpperCase()}'S FLOW`), s.topbar)
    }
    await shot(page, `desktop-${tag}-today`)
    await page.goto(BASE + '/activity')
    await settle(page, 1500)
    await shot(page, `desktop-${tag}-activity`)
    if (!night) {
      const text = await body(page)
      const rows = await page.evaluate(() => [...document.querySelectorAll('.abody')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()).slice(0, 14))
      console.log('      activity rows:\n        ' + rows.join('\n        '))
      const strips = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && /Kai's Flow · Activity/i.test(el.textContent ?? '')).length)
      check('activity: no in-page "Kai\'s Flow · Activity" strip', strips === 0, `found ${strips}`)
      check('activity: no "Logged an interaction" for a new person', /Added "Salma \d{4}" to People/.test(text) && (text.match(/Logged an interaction with/g) ?? []).length <= 1, `interaction rows: ${(text.match(/Logged an interaction with/g) ?? []).length}`)
      check('activity: no placeholder "inbox item"', !/"inbox item"/.test(text) && /Captured "basil seeds for the balcony \d{4}"/.test(text))
      check('activity: no placeholder "journal"', !/"journal"/.test(text) && /Kept writing in the journal|Wrote a journal entry/.test(text))
      check('activity: no "Routine updated" for a new routine', !/Routine updated/.test(text) && /Planted a new routine — "Evening stretch \d{4}"/.test(text))
      check('activity: no raw event names', !/Action: |onboarding\.completed/.test(text))
      if (/Logged an interaction with/.test(text)) check('activity: a real interaction names the person', /Logged an interaction with "Salma \d{4}"/.test(text))
      check('activity: plural fixed ("1 events" gone)', !/\b1 events\b/i.test(text))
    }
    // Search: the page (edge function doesn't run locally → the failure path)
    await page.goto(BASE + '/search?q=basil')
    await settle(page, 2500)
    await shot(page, `desktop-${tag}-search-page`)
    if (!night) {
      const text = await body(page)
      const inputs = await page.locator('main input').count()
      const zero = (text.match(/0 results/gi) ?? []).length
      // The duplicate was a second input-look card (a span echoing the query) + its own count line.
      const echoes = await page.evaluate(() => [...document.querySelectorAll('main span, main input')].filter((el) => (el.value ?? el.textContent) === 'basil').length)
      console.log(`      search page: ${inputs} real input(s), query shown in ${echoes} search box(es), "0 results" x${zero}`)
      check('search page: one search box', inputs === 1 && echoes === 1, `inputs ${inputs}, boxes ${echoes}`)
      check('search page: at most one count line', zero <= 1, `"0 results" x${zero}`)
      check('search page: failure is not "Nothing\'s come up"', !text.includes("Nothing's come up"))
      check('search page: calm resting copy', /Search is resting/.test(text))
      check('search page: never the word "error"', !/error/i.test(text))
      const retry = page.getByRole('button', { name: /Try again/ })
      check('search page: retry offered', (await retry.count()) === 1)
      if (await retry.count()) {
        const before = errors.length
        await retry.click()
        await settle(page, 2500)
        const again = await body(page)
        check('search page: retry re-asks (still resting locally)', /Search is resting/.test(again) && errors.length > before, `new console lines ${errors.length - before}`)
      }
    }
    // Search: the ⌘/ overlay
    await page.goto(BASE + '/today')
    await settle(page)
    await page.keyboard.press('Control+/')
    await sleep(500)
    await page.keyboard.type('basil')
    await settle(page, 2500)
    await sleep(500)
    await shot(page, `desktop-${tag}-search-overlay`)
    if (!night) {
      const text = await body(page)
      check('overlay: failure is not "Nothing\'s come up"', !text.includes("Nothing's come up"))
      check('overlay: calm resting copy', /Search is resting/.test(text))
      check('overlay: never the word "error"', !/error/i.test(text))
    }
    await ctx.close()
  }

  // ── polish-c on a phone: More sheet reaches Tasks, Projects, Activity, Trash ──
  for (const night of [false, true]) {
    const tag = night ? 'night' : 'day'
    const { ctx, page } = await newPage(browser, `phone-${tag}`, PHONE, { night })
    await signIn(page, EMAIL, PASSWORD)
    await shot(page, `phone-${tag}-today`)
    const top = await page.evaluate(() => document.querySelector('.app-topbar')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
    console.log(`      phone ${tag} topbar: ${JSON.stringify(top)}`)
    await page.locator('.app-tabbar button:has-text("More")').click()
    await sleep(500)
    await shot(page, `phone-${tag}-more-sheet`)
    if (!night) {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('.kf-sheet a')].map((a) => {
          const r = a.getBoundingClientRect()
          return { href: a.getAttribute('href'), text: a.innerText.trim(), h: Math.round(r.height), w: Math.round(r.width) }
        }),
      )
      console.log('      more rows: ' + rows.map((r) => `${r.text}(${r.href}) ${r.w}x${r.h}`).join(' · '))
      check('more sheet: every row ≥44px tall', rows.every((r) => r.h >= 44), rows.map((r) => r.h).join(','))
      const ow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      check('phone: no horizontal overflow with the sheet open', !ow)
      for (const [label, href] of [['Tasks', '/tasks'], ['Projects', '/projects'], ['Activity', '/activity'], ['Trash', '/trash']]) {
        if (!(await page.locator('.kf-sheet').count())) {
          await page.locator('.app-tabbar button:has-text("More")').click()
          await sleep(400)
        }
        if (!(await page.locator(`.kf-sheet a[href="${href}"]`).count())) {
          check(`more sheet → ${label}`, false, 'no row in the sheet')
          continue
        }
        await page.locator(`.kf-sheet a[href="${href}"]`).click()
        const ok = await waitForPath(page, href)
        await settle(page, 1200)
        check(`more sheet → ${label}`, ok && !(await page.locator('.kf-sheet').count()), path(page))
        await shot(page, `phone-${tag}-via-more-${label.toLowerCase()}`)
      }
      // Activity on a phone: the page opens straight on its own header (no duplicate strip)
      await page.goto(BASE + '/activity')
      await settle(page, 1200)
      const rows2 = await page.evaluate(() => [...document.querySelectorAll('.abody')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()).slice(0, 6))
      console.log('      phone activity rows:\n        ' + rows2.join('\n        '))
    }
    await ctx.close()
  }

  // ── kai.local: no onboarding answers → the shell looks exactly as before ──
  for (const [label, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const { ctx, page } = await newPage(browser, `kai-${label}`, vp)
    await signIn(page, 'kai.local@example.com', 'localtest123')
    const s = await shellText(page)
    console.log(`      kai.local ${label} header: ${JSON.stringify(s.header)} | topbar: ${JSON.stringify(s.topbar)}`)
    if (label === 'desktop') {
      check("kai.local: sidebar header unchanged (Kai's Flow · Personal · Cairo)", s.header.startsWith("Kai's Flow") && /Personal · Cairo/i.test(s.header), s.header)
      check("kai.local: topbar starts Kai's Flow", /^KAI'S FLOW ·/i.test(s.topbar), s.topbar)
    }
    await shot(page, `kai-${label}-today`)
    if (label === 'phone') {
      await page.locator('.app-tabbar button:has-text("More")').click()
      await sleep(500)
      await shot(page, 'kai-phone-more-sheet')
    }
    await ctx.close()
  }
}

if (MODE === 'kai') {
  // kai.local desktop, shot twice in one session — tells timing noise from a real change.
  const { ctx, page } = await newPage(browser, 'kai-twice', DESKTOP)
  await signIn(page, 'kai.local@example.com', 'localtest123')
  await sleep(2000)
  await shot(page, 'kai-desktop-today-1')
  await sleep(3000)
  await shot(page, 'kai-desktop-today-2')
  await ctx.close()
}

if (MODE === 'strips') {
  // In-page "KAI'S FLOW · … / AFRICA/CAIRO" strips on Herbarium / Trash / Library (desktop), and
  // onboarding's workspace preview via Settings' "rerun the welcome" (?replant=1 — nothing is
  // saved unless the flow is finished, and this never finishes it).
  const { ctx, page } = await newPage(browser, 'strips', DESKTOP)
  await signIn(page, EMAIL, PASSWORD)
  for (const r of ['/herbarium', '/trash', '/library']) {
    await page.goto(BASE + r)
    await settle(page, 1200)
    const n = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => el.children.length === 0 && /^Kai's Flow · /i.test(el.textContent ?? '')).length)
    console.log(`      ${r}: in-page "Kai's Flow · …" strips: ${n}`)
    check(`${r}: no in-page strip under the topbar`, n === 0, `${n}`)
    await shot(page, `strip-desktop${r.replace('/', '-')}`)
  }
  await page.goto(BASE + '/onboarding?replant=1')
  await settle(page, 1200)
  await page.locator('.ob-cta').click()
  await sleep(500)
  const preview = await page.evaluate(() => (document.querySelector('.ob-body')?.innerText ?? '').split('\n').find((l) => l.includes('·')) ?? '')
  console.log(`      onboarding workspace preview: ${JSON.stringify(preview)}`)
  check('onboarding preview names the owner', /^MIRA'S FLOW · NILE STUDIO · CAIRO/i.test(preview.trim()), preview)
  await shot(page, 'onboarding-workspace-preview')
  await ctx.close()
}

if (MODE === 'activity') {
  // The audit's four mislabels, scrolled into view (person, interaction, capture, journal, routine).
  for (const [label, vp, night] of [['desktop-day', DESKTOP, false], ['desktop-night', DESKTOP, true], ['phone-day', PHONE, false]]) {
    const { ctx, page } = await newPage(browser, `activity-${label}`, vp, { night })
    await signIn(page, EMAIL, PASSWORD)
    await page.goto(BASE + '/activity')
    await settle(page, 1500)
    await page.locator('.abody', { hasText: 'Planted a new routine' }).first().scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.abody')].find((b) => b.textContent.includes('Planted a new routine'))
      el?.scrollIntoView({ block: 'start' })
    })
    await shot(page, `activity-${label}-audit-rows`)
    await ctx.close()
  }
}

if (MODE === 'offline') {
  // Topbar sync chrome: two actions offline (a plain capture + a dated task) = 2 changes, 4 queue
  // rows (each also queues its activity_log row). Then back online → drains to Synced.
  for (const [label, vp, night] of [['desktop-day', DESKTOP, false], ['phone-night', PHONE, true]]) {
    const { ctx, page } = await newPage(browser, `offline-${label}`, vp, { night })
    await signIn(page, EMAIL, PASSWORD)
    // Load the command bar's lazy chunk while online (the SW may not control this first page yet).
    await page.keyboard.press('Control+k')
    await sleep(900)
    await page.keyboard.press('Escape')
    await sleep(300)
    await ctx.setOffline(true)
    await sleep(800)
    const stamp = String(Date.now()).slice(-4)
    for (const text of [`offline seeds ${stamp}`, `Water the basil tomorrow 9am ${stamp}`]) {
      await page.keyboard.press('Control+k')
      await sleep(700)
      await page.keyboard.type(text)
      await page.keyboard.press('Enter')
      await sleep(1200)
    }
    const raw = await page.evaluate(async () => {
      const req = indexedDB.open('keyval-store')
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
      const r = db.transaction('keyval', 'readonly').objectStore('keyval').get('kf-outbox')
      const q = await new Promise((res) => { r.onsuccess = () => res(r.result ?? []) })
      return q.map((e) => e.table)
    })
    const strip = await page.evaluate(() => document.querySelector('.app-topbar button')?.innerText.trim() ?? '')
    console.log(`      ${label}: queue tables ${JSON.stringify(raw)} | strip ${JSON.stringify(strip)}`)
    await page.locator('.app-topbar button').first().click()
    await sleep(500)
    const pop = await page.evaluate(() => document.querySelector('.kf-sync-pop')?.innerText.replace(/\n+/g, ' | ') ?? '')
    console.log(`      ${label} popover: ${pop}`)
    const changes = raw.filter((t) => t !== 'activity_log').length || raw.length
    check(`${label}: strip counts changes, not queue rows`, new RegExp(`— ${changes} saved here`, 'i').test(strip) && raw.length > changes, `${strip} (queue ${raw.length}, changes ${changes})`)
    check(`${label}: popover never shows a table name`, !/activity_log|inbox_items|_/i.test(pop.replace(/'[^']*'/g, '')), pop)
    check(`${label}: popover says "changes"`, new RegExp(`${changes} change${changes === 1 ? '' : 's'} saved here`, 'i').test(pop), pop)
    check(`${label}: one row per change`, (await page.locator('.kf-sync-pop > div:nth-child(2) > div').count()) === changes)
    check(`${label}: never the word "error"`, !/error/i.test(pop))
    await shot(page, `offline-${label}-popover`)
    await page.keyboard.press('Escape').catch(() => {})
    await page.mouse.click(5, 790).catch(() => {})
    await ctx.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const t0 = Date.now()
    let after = ''
    while (Date.now() - t0 < 20000) {
      after = await page.evaluate(() => document.querySelector('.app-topbar button')?.innerText.trim() ?? '')
      if (/^synced/i.test(after)) break
      await sleep(400)
    }
    check(`${label}: back online → Synced`, /^synced/i.test(after), after)
    await shot(page, `offline-${label}-back-online`)
    await ctx.close()
  }
}

if (MODE === 'sheet') {
  // More-sheet geometry at the default 125% interface size and at 100%, on 390 and 360 phones.
  for (const [w, scale] of [[390, null], [390, '1'], [360, null], [360, '1']]) {
    const { ctx, page } = await newPage(browser, `sheet-${w}-${scale ?? 'default'}`, { width: w, height: 844 })
    if (scale) await ctx.addInitScript((s) => localStorage.setItem('kf_ui_scale', s), scale)
    await signIn(page, EMAIL, PASSWORD)
    await page.locator('.app-tabbar button:has-text("More")').click()
    await sleep(500)
    const g = await page.evaluate(() => {
      const grid = document.querySelector('.kf-sheet > div')
      const links = [...document.querySelectorAll('.kf-sheet a')]
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const truncated = links.filter((a) => { const s = a.querySelector('span:last-of-type'); return s && s.scrollWidth > s.clientWidth }).map((a) => a.innerText.trim())
      const right = Math.max(...links.map((a) => a.getBoundingClientRect().right))
      const minH = Math.min(...links.map((a) => a.getBoundingClientRect().height))
      return { cols, truncated, right: Math.round(right), vw: window.innerWidth, minH: Math.round(minH), zoom: document.documentElement.style.zoom || '1' }
    })
    console.log(`      sheet ${w}px zoom ${g.zoom}: ${JSON.stringify(g)}`)
    check(`sheet ${w}px @${g.zoom}: no row past the screen edge`, g.right <= g.vw, `right ${g.right} / ${g.vw}`)
    check(`sheet ${w}px @${g.zoom}: no label truncated`, g.truncated.length === 0, g.truncated.join(', '))
    check(`sheet ${w}px @${g.zoom}: rows ≥44px`, g.minH >= 44, `${g.minH}`)
    await shot(page, `sheet-${w}-zoom${g.zoom}`)
    await ctx.close()
  }
}

if (MODE === 'longname') {
  // A long onboarding name: the sidebar ellipsizes, the phone topbar keeps its date. Sets
  // polish-c's own display_name over REST (RLS applies), shoots, then puts "Mira" back.
  const ANON = fs.readFileSync('/home/user/kais-flow/.claude/worktrees/agent-a748bcf2e20a9601a/app/.env.local', 'utf8').match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
  const API = 'http://127.0.0.1:54321'
  const tok = (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json()).access_token
  const setName = (display_name) => fetch(`${API}/rest/v1/app_settings?id=eq.true`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ display_name }) }).then((r) => r.json())
  console.log('      set:', JSON.stringify((await setName('Alexandria-Rosemary'))[0]?.display_name))
  for (const [label, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const { ctx, page } = await newPage(browser, `long-${label}`, vp)
    await signIn(page, EMAIL, PASSWORD)
    const box = await page.evaluate(() => {
      const t = document.querySelector('.app-topbar > div')
      const o = document.querySelector('.app-topbar-owner')
      const h = document.querySelector('.app-sidebar-header > div')
      return { topbar: t?.innerText.replace(/\s+/g, ' ').trim(), ownerW: Math.round(o?.getBoundingClientRect().width ?? 0), headerOverflows: h ? h.scrollWidth > h.clientWidth : null }
    })
    console.log(`      long name ${label}: ${JSON.stringify(box)}`)
    if (label === 'phone') check('long name, phone: date still shows', /SAT|SUN|MON|TUE|WED|THU|FRI/.test(box.topbar ?? '') && /\d{1,2} [A-Z]/.test(box.topbar ?? ''), box.topbar)
    else check('long name, desktop: sidebar title ellipsizes (no wrap)', box.headerOverflows === true)
    await shot(page, `long-${label}-today`)
    await ctx.close()
  }
  console.log('      restored:', JSON.stringify((await setName(NAME))[0]?.display_name))
}

await browser.close()
const real = errors.filter((e) => !e.includes('open-meteo') && !/ERR_TUNNEL_CONNECTION_FAILED/.test(e))
console.log(`\nconsole/request lines: ${errors.length} total, ${real.length} other than open-meteo`)
for (const e of errors) console.log('  ' + e)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
