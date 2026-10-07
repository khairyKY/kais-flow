// The Guide's step crops (app/public/guide/<slug>-<n>.webp + app/src/features/guide/crops.json): real
// UI from the mock app (./mock.mjs), Playwright clip screenshots at 1.5×, WebP via Chrome's encoder.
//   node crops.mjs [unused] [baseUrl] [playwright-core path]      ONLY=gestures,calendar to redo some
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { P_GCI, SEEN, browser, centre, iso, open, sleep, task, toWebp, touch } from './mock.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIR = path.join(ROOT, 'app/public/guide')
const SIZES = path.join(ROOT, 'app/src/features/guide/crops.json')
fs.mkdirSync(DIR, { recursive: true })
const sizes = fs.existsSync(SIZES) ? JSON.parse(fs.readFileSync(SIZES, 'utf8')) : {}
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)
const DPR = 1.5
const tall = { viewport: { width: 390, height: 1400 }, hasTouch: true, isMobile: true }
const wide = { viewport: { width: 1280, height: 900 } }
const seenAll = { [SEEN]: JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']) }
const scene = (route, o = {}) => open(route, { view: tall, dpr: DPR, storage: seenAll, ...o })

/** A box: a locator's own (plus pad), or a band of the page from `above` px over it, `height` tall. */
async function rect(page, loc, o = {}) {
  const b = await loc.first().boundingBox()
  if (!b) throw new Error(`nothing for ${loc}`)
  const vp = page.viewportSize()
  const pad = o.pad ?? 8
  let r = o.height ? { x: o.x ?? 0, y: b.y - (o.above ?? 0), width: o.width ?? vp.width - (o.x ?? 0), height: o.height } : { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
  if (o.maxH) r.height = Math.min(r.height, o.maxH)
  const x = Math.max(0, r.x), y = Math.max(0, r.y)
  return { x, y, width: Math.min(r.width - (x - r.x), vp.width - x), height: Math.min(r.height - (y - r.y), vp.height - y) }
}
async function crop(page, name, loc, o) {
  const clip = await rect(page, loc, o).catch((e) => console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`))
  if (!clip) return
  const buf = await toWebp(await page.screenshot({ clip }), 0.6)
  fs.writeFileSync(path.join(DIR, `${name}.webp`), buf)
  sizes[name] = [Math.round(clip.width), Math.round(clip.height)]
  console.log(`${name} ${sizes[name].join('×')} ${(buf.length / 1024).toFixed(1)} KB`)
  saveSizes()
}
const saveSizes = () => fs.writeFileSync(SIZES, JSON.stringify(Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))), null, 1) + '\n')
const text = (page, t) => page.getByText(t, { exact: false })
const settle = (ms = 900) => sleep(ms)

// ── Getting started · Today · Gestures (the phone's Today) ──
if (want('today')) {
  const { ctx, page } = await scene('/today')
  await crop(page, 'getting-started-1', page.locator('.app-tabbar'), { pad: 0 })
  await crop(page, 'getting-started-2', page.locator('[data-tour="top3"]'), { pad: 0, maxH: 330 })
  await crop(page, 'getting-started-3', page.locator('.tp-ritual'), { pad: 10 })
  await crop(page, 'capture-1', page.locator('.app-tabbar'), { height: 150, above: 70 })
  await crop(page, 'today-3', page.locator('[data-tour="task-row"]').nth(2), { pad: 0 })
  await crop(page, 'today-4', page.locator('section').filter({ hasText: /^up next/i }), { pad: 0, maxH: 360 })
  await crop(page, 'routines-2', page.locator('section').filter({ hasText: /^routines/i }), { pad: 0, maxH: 300 })
  await ctx.close()
}
if (want('today')) {
  const { ctx, page } = await scene('/today', { at: '18:30' })
  await crop(page, 'getting-started-4', page.locator('.tp-ritual'), { pad: 10 })
  await ctx.close()
}
if (want('today')) {
  const { ctx, page } = await scene('/today', { at: '09:45' })
  await crop(page, 'today-1', page.locator('.tp-sum'), { height: 150, above: 8 })
  await crop(page, 'today-2', page.locator('[data-tour="top3"]'), { pad: 0, maxH: 330 })
  await ctx.close()
}
if (want('gestures')) {
  const { ctx, page, cdp } = await scene('/today')
  const row = (n) => page.locator('[data-tour="task-row"]').nth(n)
  let b = await row(0).boundingBox()
  let lift = await touch(cdp, { x: 120, y: b.y + b.height / 2 }, { to: { x: 260, y: b.y + b.height / 2 }, keep: true })
  await settle(400)
  await crop(page, 'gestures-1', row(0), { pad: 0 })
  await lift()
  await settle(600)
  await page.locator('.kf-swipe-fg[data-moved]').first().click().catch(() => {})
  await settle(400)
  b = await row(1).boundingBox()
  lift = await touch(cdp, { x: 300, y: b.y + b.height / 2 }, { to: { x: 190, y: b.y + b.height / 2 }, keep: true })
  await settle(400)
  await crop(page, 'gestures-2', row(1), { pad: 0 })
  await lift()
  await settle(600)
  await ctx.close()
}
if (want('gestures')) {
  const { ctx, page, cdp } = await scene('/today')
  await page.locator('[data-tour="task-row"]').nth(0).locator('.kf-checkbox').first().click()
  await page.locator('.kf-toast-msg').first().waitFor()
  await settle(500)
  const toast = page.locator('.kf-toast-msg').first()
  const tb = await toast.boundingBox()
  await crop(page, 'gestures-3', toast, { height: 150, above: 150 - tb.height - 14 })
  await ctx.close()
}
if (want('gestures')) {
  const { ctx, page, cdp } = await scene('/today')
  const b = await page.locator('[data-tour="task-row"]').nth(0).boundingBox()
  await touch(cdp, { x: 200, y: b.y + b.height / 2 }, { holdMs: 650 })
  await settle(500)
  await page.locator('[data-tour="task-row"]').nth(1).locator('.tp-body').click()
  await settle(500)
  await crop(page, 'gestures-4', page.locator('[data-tour="task-row"]').nth(0), { height: 230, above: 90 })
  await ctx.close()
}
if (want('gestures')) {
  const { ctx, page, cdp } = await scene('/today')
  const lift = await touch(cdp, centre(await page.locator('.kf-capture').boundingBox()), { holdMs: 900, keep: true })
  await page.locator('.kf-rec-pill').waitFor({ timeout: 4000 }).catch(() => {})
  await settle(900)
  await crop(page, 'gestures-5', page.locator('.app-tabbar'), { height: 230, above: 150 })
  await lift()
  await ctx.close()
}

// ── Capture (the computer's bar, 100%) ──
if (want('capture')) {
  const { ctx, page } = await scene('/today', { view: wide, scale: 1 })
  await page.keyboard.press('Control+k')
  const input = page.locator('#kf-capture-input')
  await input.waitFor()
  await settle(400)
  const bar = page.locator('.kf-overlay-card').filter({ has: input })
  await crop(page, 'capture-2', bar, { pad: 10, maxH: 300 })
  await input.fill('call omar friday 5pm about the lab groups')
  await settle(700)
  await crop(page, 'capture-3', bar, { pad: 10, maxH: 300 })
  await input.fill('Renew the parking card !! 30m #GCI *errands')
  await settle(700)
  await crop(page, 'capture-4', bar, { pad: 10, maxH: 300 })
  await input.fill('an idea for the garden guide')
  await settle(700)
  await crop(page, 'capture-5', bar, { pad: 10, maxH: 300 })
  await ctx.close()
}

// ── Plan my day & Shut down ──
if (want('plan')) {
  const rows = { tasks: [...(await import('./mock.mjs')).TASKS, task(30, 'Send the tax papers', { due_at: iso('09:00', 5) })] }
  const { ctx, page } = await scene('/today?ritual=morning', { rows, view: { ...tall, viewport: { width: 390, height: 2000 } } })
  await settle(600)
  const sec = (re) => page.locator('.rt-sec').filter({ hasText: re })
  const band = async (name, from, to) => {
    const a = await sec(from).boundingBox()
    const b = to ? await sec(to).boundingBox() : null
    await crop(page, name, sec(from), { height: Math.min(340, (b ? b.y : a.y + 340) - a.y), above: 0 })
  }
  await band('plan-1', /carry-over/i, /^inbox/i)
  await band('plan-2', /^inbox/i, /pick your 3/i)
  await band('plan-3', /pick your 3/i, /suggested times/i)
  await band('plan-4', /suggested times/i)
  await ctx.close()
}
if (want('plan')) {
  const { ctx, page } = await scene('/today?ritual=evening', { at: '18:30' })
  await settle(600)
  const sec = (re) => page.locator('.rt-sec').filter({ hasText: re })
  await crop(page, 'plan-5', sec(/sweep/i), { height: 290, above: 0 })
  await crop(page, 'plan-6', sec(/tomorrow.s 3/i), { height: 300, above: 0 })
  await ctx.close()
}

// ── Calendar ──
if (want('calendar')) {
  const { ctx, page } = await scene('/calendar', { view: wide, scale: 1 })
  await settle(800)
  const rail = page.locator('aside.cal-rail')
  const rb = await rail.boundingBox()
  await crop(page, 'calendar-1', rail, { x: rb.x, width: rb.width + 190, height: 300, above: 0 })
  await crop(page, 'calendar-2', rail, { pad: 4, maxH: 420 })
  const blk = page.locator('.fc-timegrid-event').first()
  const bb = await blk.boundingBox()
  await crop(page, 'calendar-3', blk, { x: Math.max(0, bb.x - 90), width: bb.width + 180, height: Math.max(170, bb.height + 90), above: 45 })
  await ctx.close()
}
if (want('calendar')) {
  const { ctx, page, cdp } = await scene('/calendar')
  await settle(800)
  await crop(page, 'calendar-5', page.locator('.pc-week'), { height: 130, above: 6 })
  const blk = page.locator('.pc-block').first()
  await blk.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  const lift = await touch(cdp, centre(await blk.boundingBox()), { holdMs: 800, keep: true })
  await settle(500)
  await crop(page, 'calendar-4', page.locator('.pc-block.is-lifted'), { height: 190, above: 50 })
  await lift()
  await ctx.close()
}

// ── Routines · Projects & the Herbarium ──
if (want('routines')) {
  const { ctx, page } = await scene('/routines')
  await crop(page, 'routines-1', text(page, 'New routine'), { height: 200, above: 20 })
  await crop(page, 'routines-3', text(page, 'Glass of water').first(), { height: 120, above: 50 })
  await crop(page, 'routines-4', text(page, 'The garden'), { height: 160, above: 10 })
  await ctx.close()
}
if (want('projects')) {
  {
    const { ctx, page } = await scene(`/projects/${P_GCI}`)
    await crop(page, 'projects-1', text(page, 'Homework 1'), { height: 240, above: 70 })
    const arch = text(page, 'Archive project')
    await arch.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
    await settle(300)
    await crop(page, 'projects-3', arch, { height: 76, above: 26 })
    await ctx.close()
  }
  {
    const { ctx, page } = await scene('/projects')
    await crop(page, 'projects-2', page.locator('.kf-route'), { height: 200, above: 0 })
    await ctx.close()
  }
  {
    const { ctx, page } = await scene('/herbarium')
    await crop(page, 'projects-4', page.locator('.spec').first(), { pad: 10, maxH: 330 })
    await ctx.close()
  }
  {
    const { ctx, page } = await scene('/perennials')
    await crop(page, 'projects-5', page.locator('.kf-route'), { height: 300, above: 0 })
    await ctx.close()
  }
}

// ── Settings: getting started · import · capture from anywhere · your data ──
if (want('settings')) {
  const { ctx, page } = await scene('/settings')
  const updates = page.getByRole('button', { name: 'Check for updates' })
  await updates.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await settle(300)
  await crop(page, 'getting-started-5', updates, { height: 270, above: 50 })
  await page.locator('#settings-Sound').scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await settle(300)
  await crop(page, 'getting-started-6', page.locator('#settings-Sound'), { pad: 0, maxH: 320 })
  const key = page.getByRole('button', { name: 'Create key' })
  await key.first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await settle(300)
  await crop(page, 'anywhere-2', key, { height: 180, above: 64 })
  await text(page, 'How to send things here').first().click()
  await settle(400)
  await crop(page, 'anywhere-3', text(page, 'Android share sheet').first(), { height: 240, above: 16 })
  await ctx.close()
}
if (want('settings')) {
  const { ctx, page } = await scene('/settings', { view: { viewport: { width: 960, height: 900 } }, scale: 1 })
  await crop(page, 'data-1', page.locator('.app-sidebar-header'), { pad: 6 })
  const imp = text(page, 'Import data').first()
  await imp.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await settle(300)
  const ib = await imp.boundingBox()
  await crop(page, 'import-1', imp, { x: Math.max(0, ib.x - 24), width: 460, height: 190, above: 24 })
  for (const [name, id] of [['data-5', '#settings-Trash']]) {
    await page.locator(id).scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
    await settle(300)
    await crop(page, name, page.locator(id), { pad: 0, maxH: 260 })
  }
  const groq = text(page, 'Groq').first()
  await groq.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await settle(300)
  const gb = await groq.boundingBox()
  if (gb) await crop(page, 'data-3', groq, { x: Math.max(0, gb.x - 20), width: 520, height: 210, above: 120 })
  await ctx.close()
}
if (want('settings')) {
  const { ctx, page } = await scene('/settings/import', { view: wide, scale: 1 })
  await settle(600)
  const todo = text(page, 'Todoist').first()
  const tb = await todo.boundingBox()
  await crop(page, 'import-2', todo, { x: Math.max(0, tb.x - 150), width: 520, height: 200, above: 60 })
  await todo.click()
  await settle(700)
  const rb2 = await page.locator('.kf-route').boundingBox()
  await crop(page, 'import-3', page.locator('.kf-route'), { height: 300, above: 0, x: rb2.x, width: 620 })
  await ctx.close()
}
if (want('anywhere')) {
  {
    const { ctx, page } = await scene('/share?text=Read%20the%20garden%20guide%20tonight', { dpr: DPR })
    await crop(page, 'anywhere-1', page.locator('body'), { height: 300, above: 0 })
    await ctx.close()
  }
  {
    const { ctx, page } = await scene('/tray', { view: { viewport: { width: 380, height: 520 } }, scale: 1, dpr: 1 })
    await settle(800)
    await crop(page, 'anywhere-4', page.locator('body'), { height: 330, above: 0 })
    await ctx.close()
  }
  {
    const { ctx, page } = await scene('/inbox')
    await crop(page, 'anywhere-5', page.getByRole('button', { name: 'Scan paper' }), { height: 150, above: 70 })
    await ctx.close()
  }
}
if (want('data')) {
  {
    const { ctx, page } = await scene('/today')
    await ctx.setOffline(true)
    await page.locator('[data-tour="task-row"]').nth(1).locator('.kf-checkbox').first().click()
    await settle(800)
    await crop(page, 'data-2', page.locator('.tp-bar'), { height: 230, above: 0 })
    await page.locator('[data-tour="more"]').click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await settle(600)
    await crop(page, 'data-4', text(page, 'synced yet'), { height: 230, above: 70 })
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(SIZES, JSON.stringify(Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))), null, 1) + '\n')
const total = fs.readdirSync(DIR).reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0)
console.log(`${Object.keys(sizes).length} crops, ${(total / 1024).toFixed(0)} KB in app/public/guide`)
