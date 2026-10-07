// Tour & help (design-export/Tour and Help*.dc.html, Claude Design prompt 14) on the REAL app against a
// MOCKED backend (./mock.mjs — the today-phone / calendar-rail recipe). Screenshots are saved as WebP.
//   node verify.mjs [outDir] [baseUrl] [playwright-core path]      ONLY=tour,hints,… to run a part
// The day: Wednesday 7 Oct 2026, Cairo (UTC+3), 08:20 — not planned yet, so Today offers Plan my day.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE, OS, PENDING, SEEN, browser, desktop, id, open, sleep, toWebp } from './mock.mjs'

const OUT = process.argv[2] ?? path.dirname(fileURLToPath(import.meta.url))
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)
// The route fades in (kf-route): let it land before the picture.
const shot = async (page, name) => (await sleep(450), fs.writeFileSync(path.join(OUT, `${name}.webp`), await toWebp(await page.screenshot())))

const seenKeys = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), SEEN)
const noteId = (page) => page.locator('.kf-tour-note').getAttribute('data-note', { timeout: 9000 }).catch(() => null)
const ANCHORS = { capture: ['capture'], top3: ['top3'], row: ['task-row'], plan: ['plan', 'plan-menu'], ask: ['more'], sidebar: ['sidebar'], command: ['command-bar'], calendar: ['calendar-block', 'calendar'] }
/** The lit cut-out sits on the note's real element, and the card never covers it. */
async function anchored(page, note) {
  return page.evaluate((names) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight }
    const el = names.map((n) => [...document.querySelectorAll(`[data-tour="${n}"]`)].find((e) => !e.closest('[data-tour-ui]') && vis(e))).find(Boolean)
    const spot = document.querySelector('.kf-tour-spot')
    const card = document.querySelector('.kf-tour-note')
    if (!el || !spot || !card) return { ok: false, why: `${!!el}/${!!spot}/${!!card}` }
    const a = el.getBoundingClientRect(), s = spot.getBoundingClientRect(), c = card.getBoundingClientRect()
    const centred = Math.abs(a.x + a.width / 2 - (s.x + s.width / 2)) < 3 && Math.abs(a.y + a.height / 2 - (s.y + s.height / 2)) < 3
    const covers = s.width >= a.width && s.height >= a.height
    const clear = c.right <= a.left || c.left >= a.right || c.bottom <= a.top || c.top >= a.bottom
    return { ok: centred && covers && clear, why: JSON.stringify({ a: [a.x, a.y, a.width, a.height].map(Math.round), s: [s.x, s.y, s.width, s.height].map(Math.round), clear }) }
  }, ANCHORS[note])
}
async function phoneBasics(page, name, errors, scope = '.kf-tour-note, .kf-hint, .gd, .kf-chat-empty') {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  const small = await page.evaluate((sel) => {
    const out = []
    for (const root of document.querySelectorAll(sel)) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const cs = getComputedStyle(n.parentElement)
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 20)} ${cs.fontSize}`)
      }
    }
    return out
  }, scope)
  check(`${name} no text under 12px`, small.length === 0, small.slice(0, 3).join(' | '))
  check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
}
const targets = (page, sel) => page.locator(sel).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width).map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))))

// ═══ 1 · The tour on the phone (14a–14f): once, right after onboarding ═══
for (const theme of ['day', 'night']) {
  if (!want('tour')) break
  const name = `phone-${theme}`
  const { ctx, page, errors } = await open('/today', { theme, storage: { [PENDING]: '1' } })
  const order = []
  for (let i = 0; i < 6; i++) {
    const nid = await noteId(page)
    if (!nid) break
    order.push(nid)
    await sleep(350)
    if (nid !== 'done') {
      const a = await anchored(page, nid)
      check(`${name} note ${i + 1} (${nid}) lights its own element; the card leaves it clear`, a.ok, a.why)
    } else check(`${name} the last note: no spotlight, everything dimmed, one bloom`, (await page.locator('.kf-tour-spot').count()) === 0 && (await page.locator('.kf-tour-dim, .kf-tour-bloom').count()) === 2)
    if (theme === 'day' || ['capture', 'row', 'done'].includes(nid)) await shot(page, `${name}-${i + 1}-${nid}`)
    if (i === 0) {
      const t = await targets(page, '.kf-tour-next, .kf-tour-skip')
      check(`${name} Next and Skip are 48px targets`, t.length === 2 && t.every((h) => h >= 48), JSON.stringify(t))
      check(`${name} the dim takes no taps (only the card does)`, (await page.locator('.kf-tour').evaluate((e) => getComputedStyle(e).pointerEvents)) === 'none')
    }
    if (nid === 'row') check(`${name} the ghost finger swipes a copy of the row (looping)`, (await page.locator('.kf-tour-ghost .kf-tour-ghost-row').evaluate((e) => getComputedStyle(e).animationName)) === 'kfGhostRow' && (await page.locator('.kf-tour-ghost-copy .tp-title').count()) === 1)
    await page.locator('.kf-tour-next').click()
    await sleep(400)
  }
  check(`${name} five notes then the closing card, in the design's order`, order.join() === 'capture,top3,row,plan,ask,done', order.join())
  check(`${name} Done ends it`, (await page.locator('.kf-tour-note').count()) === 0)
  const seen = await seenKeys(page)
  check(`${name} done counts as seen, the onboarding flag is spent, the row note taught the swipe`, seen.includes('tour') && seen.includes('hint:swipe') && !(await page.evaluate((k) => localStorage.getItem(k), PENDING)), JSON.stringify(seen))
  await phoneBasics(page, name, errors)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(3000)
  check(`${name} never again after Done (a reload shows no note)`, (await page.locator('.kf-tour-note').count()) === 0)
  await ctx.close()
}

// Skip on note 2; reduced motion; a missing anchor; a sheet up first.
if (want('tour')) {
  {
    const { ctx, page } = await open('/today', { storage: { [PENDING]: '1' } })
    await noteId(page)
    await page.locator('.kf-tour-next').click()
    await sleep(400)
    check('skip: on note 2', (await noteId(page)) === 'top3')
    await page.locator('.kf-tour-skip').click()
    await sleep(400)
    check('skip: ends the tour at once and counts as seen', (await page.locator('.kf-tour-note').count()) === 0 && (await seenKeys(page)).includes('tour'))
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(3000)
    check('skip: never again', (await page.locator('.kf-tour-note').count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/today', { reduced: true, storage: { [PENDING]: '1' } })
    await noteId(page)
    for (let i = 0; i < 2; i++) {
      await page.locator('.kf-tour-next').click()
      await sleep(400)
    }
    check('reduced motion: the row note has a still arrow, no ghost loop', (await noteId(page)) === 'row' && (await page.locator('.kf-tour-arrow').count()) === 1 && (await page.locator('.kf-tour-ghost').count()) === 0)
    await shot(page, 'phone-day-reduced-motion-row')
    await ctx.close()
  }
  {
    // An empty day: no Top 3, no task row, no day card → those notes are passed over; the plan note
    // falls back to Today's ⋯ menu.
    const { ctx, page } = await open('/today', { empty: true, storage: { [PENDING]: '1' } })
    const order = []
    for (let i = 0; i < 6; i++) {
      const nid = await noteId(page)
      if (!nid) break
      order.push(nid)
      if (nid === 'plan') {
        const a = await anchored(page, 'plan')
        check('missing anchors: the plan note lights the ⋯ menu instead', a.ok && (await page.locator('[data-tour="plan-menu"]').count()) === 1, a.why)
        await shot(page, 'phone-day-empty-plan-menu')
      }
      await page.locator('.kf-tour-next').click()
      await sleep(400)
    }
    check('missing anchors: skipped, never a dead end (capture, plan, ask, done)', order.join() === 'capture,plan,ask,done', order.join())
    await ctx.close()
  }
  {
    // The tour never shows over a sheet: it waits for the task sheet to close.
    const { ctx, page } = await open(`/today?task=${id(OS)}`, { storage: { [PENDING]: '1' } })
    await sleep(3000)
    const sheet = await page.locator('[aria-modal="true"]').count()
    check('waits: a sheet is up, no note over it', sheet > 0 && (await page.locator('.kf-tour-note').count()) === 0, `modals ${sheet}`)
    await page.keyboard.press('Escape')
    check('waits: the sheet closes, the first note comes', (await noteId(page)) === 'capture')
    await ctx.close()
  }
}

// Restart from the Guide and from Settings → App.
if (want('tour')) {
  for (const [from, label] of [['/guide', 'Guide'], ['/settings', 'Settings → App']]) {
    const { ctx, page } = await open(from, { storage: { [SEEN]: JSON.stringify(['tour', 'hint:swipe', 'hint:inbox']) } })
    await page.getByRole('button', { name: /Show me around again/ }).first().click()
    const nid = await noteId(page)
    check(`restart from ${label}: back on Today at note 1, hints forgotten`, nid === 'capture' && new URL(page.url()).pathname === '/today' && (await seenKeys(page)).length === 0, `${nid} ${page.url()}`)
    await ctx.close()
  }
}

// ═══ 2 · The tour on desktop (14g): sidebar · command bar · Top 3 · calendar · the shortcut card ═══
for (const theme of ['day', 'night']) {
  if (!want('desktop')) break
  const name = `desktop-${theme}`
  const { ctx, page, errors } = await open('/today', { theme, view: desktop, storage: { [PENDING]: '1' } })
  const order = []
  for (let i = 0; i < 5; i++) {
    const nid = await noteId(page)
    if (!nid) break
    order.push(nid)
    await sleep(500)
    if (nid !== 'keys') {
      const a = await anchored(page, nid)
      check(`${name} note ${i + 1} (${nid}) lights its own element`, a.ok, a.why)
    } else check(`${name} note 5: the shortcut card, "? shows every shortcut", Done`, /shows every shortcut/.test(await page.locator('.kf-tour-note').innerText()) && (await page.locator('.kf-tour-next').innerText()) === 'Done')
    if (nid === 'calendar') check(`${name} the calendar note took the tour to the calendar`, new URL(page.url()).pathname === '/calendar')
    if (theme === 'day' || ['sidebar', 'keys'].includes(nid)) await shot(page, `${name}-${i + 1}-${nid}`)
    await page.locator('.kf-tour-next').click()
    await sleep(500)
  }
  check(`${name} sidebar, command bar, Top 3, calendar, shortcuts`, order.join() === 'sidebar,command,top3,calendar,keys', order.join())
  check(`${name} done: seen, and the calendar note taught the calendar hint`, (await seenKeys(page)).includes('tour') && (await seenKeys(page)).includes('hint:calendar'))
  check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ═══ 3 · The hints (14h): once each, dismissible, one line ═══
if (want('hints')) {
  const seen = (...k) => ({ [SEEN]: JSON.stringify(['tour', ...k]) })
  {
    const { ctx, page, errors } = await open('/today', { storage: seen() })
    const hint = page.locator('.kf-hint[data-hint="hint:swipe"]')
    const up = await hint.waitFor({ timeout: 6000 }).then(() => sleep(400)).then(() => true, () => false)
    check('swipe hint: shows on the first task row once the list settles', up && /Swipe right for tomorrow/.test(await hint.innerText()))
    await shot(page, 'phone-day-hint-swipe')
    const t = await targets(page, '.kf-hint-x')
    check('swipe hint: × is a 48px target', t[0] >= 48, JSON.stringify(t))
    check('swipe hint: seen the moment it shows', (await seenKeys(page)).includes('hint:swipe'))
    await page.locator('.kf-hint-x').click()
    await sleep(300)
    check('swipe hint: × dismisses it', (await hint.count()) === 0)
    await phoneBasics(page, 'swipe hint', errors)
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(3500)
    check('swipe hint: never again', (await page.locator('.kf-hint').count()) === 0)
    await ctx.close()
  }
  for (const theme of ['day', 'night']) {
    const { ctx, page } = await open('/calendar', { theme, storage: seen('hint:swipe') })
    const hint = page.locator('.kf-hint[data-hint="hint:calendar"]')
    const up = await hint.waitFor({ timeout: 6000 }).then(() => sleep(400)).then(() => true, () => false)
    check(`calendar hint (${theme}): under a block on the first visit`, up && /Hold a block to move it, drag its edges to resize/.test(await hint.innerText()))
    await shot(page, `phone-${theme}-hint-calendar`)
    await page.locator('[data-tour="calendar-block"]').first().dispatchEvent('pointerdown', { bubbles: true })
    await sleep(300)
    check(`calendar hint (${theme}): holding a block dismisses it`, (await hint.count()) === 0)
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(3500)
    check(`calendar hint (${theme}): never again`, (await page.locator('.kf-hint').count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/inbox', { storage: seen('hint:swipe') })
    const hint = page.locator('.kf-hint[data-hint="hint:inbox"]')
    const up = await hint.waitFor({ timeout: 6000 }).then(() => sleep(400)).then(() => true, () => false)
    check('inbox hint: on the first item when the Inbox has some', up && /Each one becomes a task, a note, or nothing/.test(await hint.innerText()))
    await shot(page, 'phone-day-hint-inbox')
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/today', { view: desktop, storage: seen() })
    await sleep(3500)
    check('desktop: no swipe hint (a mouse never swipes)', (await page.locator('.kf-hint').count()) === 0)
    await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
    const hint = page.locator('.kf-hint[data-hint="hint:calendar"]')
    const up = await hint.waitFor({ timeout: 6000 }).then(() => sleep(400)).then(() => true, () => false)
    check('desktop calendar hint: the drag wording', up && /Drag a block to move it; pull an edge to resize/.test(await hint.innerText()))
    await shot(page, 'desktop-day-hint-calendar')
    await ctx.close()
  }
  {
    const { ctx, page } = await open('/today', { storage: seen('hint:swipe', 'hint:calendar', 'hint:inbox') })
    for (const r of ['/today', '/calendar', '/inbox']) {
      await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle' })
      await sleep(2800)
    }
    check('every hint seen: none shows anywhere', (await page.locator('.kf-hint').count()) === 0)
    await ctx.close()
  }
}

// ═══ 4 · The Guide (14i · 14j · 14k) ═══
if (want('guide')) {
  const seenAll = { [SEEN]: JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']) }
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/today', { theme, storage: seenAll })
    await page.locator('[data-tour="more"]').click()
    await page.getByRole('link', { name: 'Guide' }).click()
    await page.locator('.gd-row').first().waitFor()
    check(`guide (${theme}): More → Guide`, new URL(page.url()).pathname === '/guide')
    check(`guide (${theme}): eleven articles in four sections`, (await page.locator('.gd-row').count()) === 11 && (await page.locator('.gd-sec').count()) === 4)
    const t = await targets(page, '.gd-row, .gd-tour, .gd-back, .gd-search')
    check(`guide (${theme}): every target ≥ 48`, t.every((h) => h >= 48), JSON.stringify(t))
    await shot(page, `phone-${theme}-guide`)
    await phoneBasics(page, `guide (${theme})`, errors)
    if (theme === 'day') {
      await page.locator('.gd-search input').fill('swipe')
      await sleep(300)
      const hits = await page.locator('.gd-row .gd-row-title').allInnerTexts()
      check('guide search: "swipe" finds Gestures', hits.includes('Gestures'), JSON.stringify(hits))
      await shot(page, 'phone-day-guide-search')
      await page.locator('.gd-search input').fill('streak')
      await sleep(300)
      check('guide search: "streak" finds Routines', JSON.stringify(await page.locator('.gd-row .gd-row-title').allInnerTexts()) === '["Routines"]')
      await page.locator('.gd-search input').fill('')
      // One RTL frame: the app has no Arabic layer yet, but the page mirrors (logical sides).
      await page.evaluate(() => (document.documentElement.dir = 'rtl'))
      await sleep(200)
      await shot(page, 'phone-day-guide-rtl')
      const flipped = await page.locator('.gd-row').first().evaluate((r) => r.querySelector('.gd-chip').getBoundingClientRect().x > r.getBoundingClientRect().width / 2)
      check('guide RTL: the rows mirror (icon on the right)', flipped)
      await page.evaluate(() => (document.documentElement.dir = 'ltr'))
    }
    await page.getByRole('link', { name: /Gestures/ }).first().click()
    await page.locator('.gd-step').first().waitFor()
    check(`guide article (${theme}): Gestures, five steps`, (await page.locator('.gd-step').count()) === 5)
    const imgs = await page.locator('.gd-crop img').evaluateAll((els) => els.map((e) => [e.getAttribute('loading'), e.getAttribute('src')]))
    check(`guide article (${theme}): every step has its crop, lazy-loaded`, imgs.length === 5 && imgs.every(([l]) => l === 'lazy'), JSON.stringify(imgs.slice(0, 2)))
    await shot(page, `phone-${theme}-guide-gestures`)
    await page.locator('.gd-step').nth(3).scrollIntoViewIfNeeded()
    await sleep(500)
    if (theme === 'day') await shot(page, 'phone-day-guide-gestures-2')
    const loaded = await page.locator('.gd-crop img').evaluateAll((els) => els.filter((e) => e.complete && e.naturalWidth > 0).length)
    check(`guide article (${theme}): the crops load`, loaded >= 3, loaded)
    await phoneBasics(page, `guide article (${theme})`, errors)
    await ctx.close()
  }
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/today', { theme, view: desktop, storage: seenAll })
    await page.getByRole('link', { name: 'Guide' }).click()
    await page.locator('.gd-card').first().waitFor()
    check(`desktop guide (${theme}): from the sidebar foot; eleven cards`, new URL(page.url()).pathname === '/guide' && (await page.locator('.gd-card').count()) === 11)
    await shot(page, `desktop-${theme}-guide`)
    await page.getByRole('link', { name: /Calendar\s*Blocks/ }).click()
    await page.locator('.gd-step').first().waitFor()
    await sleep(600)
    check(`desktop guide (${theme}): the Calendar article with "On this page"`, (await page.locator('.gd-toc a').count()) === (await page.locator('.gd-step').count()))
    await shot(page, `desktop-${theme}-guide-calendar`)
    check(`desktop guide (${theme}): no page or console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }
}

// ═══ 5 · The chat's starters (14l) and the ? sheet (14k-3) ═══
if (want('chat')) {
  const seenAll = { [SEEN]: JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']) }
  {
    const { ctx, page, errors, state } = await open('/today', { storage: seenAll })
    await page.locator('[data-tour="more"]').click()
    await page.getByRole('button', { name: 'Chat' }).click()
    const starters = page.locator('.kf-chat-starter')
    await starters.first().waitFor()
    check('chat (phone): three starters', JSON.stringify(await starters.allInnerTexts()) === JSON.stringify(['What’s on today?', 'What should I drop?', 'How do I move a task to tomorrow?']))
    const t = await targets(page, '.kf-chat-starter')
    check('chat (phone): starters are ≥ 48 tall', t.every((h) => h >= 48), JSON.stringify(t))
    await shot(page, 'phone-day-chat-empty')
    await phoneBasics(page, 'chat (phone)', errors)
    await starters.first().click()
    await page.getByText('Three things today').waitFor({ timeout: 5000 }).catch(() => {})
    check('chat (phone): a tap sends it', state.chat.length === 1 && state.chat[0].messages.at(-1).content === 'What’s on today?' && (await page.getByText('What’s on today?').count()) === 1, JSON.stringify(state.chat))
    await ctx.close()
  }
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/today', { theme, view: desktop, storage: seenAll })
    await page.keyboard.press('Control+j')
    await page.locator('.kf-chat-starter').first().waitFor()
    await shot(page, `desktop-${theme}-chat-empty`)
    await page.keyboard.press('Escape')
    await sleep(300)
    await page.keyboard.press('?')
    const sheet = page.getByRole('dialog', { name: 'Shortcuts' })
    await sheet.waitFor()
    await sleep(300)
    check(`? sheet (${theme}): paper, with the way back to the tour and the Guide`, (await sheet.getByRole('button', { name: 'Show me around again' }).count()) === 1 && (await sheet.getByRole('button', { name: /Open the Guide/ }).count()) === 1 && (await sheet.evaluate((e) => getComputedStyle(e).backgroundColor)) !== 'rgba(0, 0, 0, 0)')
    await shot(page, `desktop-${theme}-shortcuts`)
    await sheet.getByRole('button', { name: /Open the Guide/ }).click()
    await sleep(500)
    check(`? sheet (${theme}): Open the Guide → goes there`, new URL(page.url()).pathname === '/guide' && (await sheet.count()) === 0)
    check(`desktop chat + ? (${theme}): no page or console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 1))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
