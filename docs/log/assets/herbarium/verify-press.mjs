// The pressing ceremony (Herbarium, /herbarium?press=<id>) on the REAL page against a MOCKED backend —
// the today-phone recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session,
// Playwright answering REST. Kai 2026-10-03: no auto-advance (the reader moves on), and the press must
// visibly close.   node verify-press.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5243'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const P = 'p0000000-0000-4000-8000-0000000000aa'
const project = { id: P, user_id: UID, domain_id: null, name: 'Portfolio site', type: 'standard', status: 'active', color: null, milestones: [{ id: 'm1', title: 'Launch', completed: true }, { id: 'm2', title: 'Blog', completed: false }], checklist: [], created_at: '2026-06-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z' }

const browser = await chromium.launch({ channel: 'chrome' })
for (const [label, view] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
  for (const theme of ['day', 'night']) {
    const name = `${label}-${theme}`
    const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
    await ctx.addInitScript(([t, sess]) => { localStorage.setItem('kf_theme', t); localStorage.setItem('sb-127-auth-token', sess) }, [theme, JSON.stringify(session)])
    const writes = []
    await ctx.route('http://127.0.0.1:9/**', async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      if (req.method() !== 'GET' && req.method() !== 'HEAD') { writes.push({ table: url.pathname.replace('/rest/v1/', ''), body: req.postDataJSON?.() }); return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }) }
      if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
      const table = url.pathname.replace('/rest/v1/', '')
      const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const rows = table === 'projects' ? [project] : []
      if (one) return r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
      return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}/herbarium?press=${P}`, { waitUntil: 'networkidle' })
    await sleep(500)
    const step = () => page.getByText(/Ready for the press · \d of 3/).first().textContent().catch(() => '')
    const gap = () => page.locator('.hb-press-gap').evaluate((e) => e.getBoundingClientRect().height).catch(() => -1)
    check(`${name} opens on beat 1`, (await step()).includes('1 of 3'), await step())
    await page.screenshot({ path: path.join(OUT, `${name}-1-start.png`) })
    await sleep(3200) // longer than the old 2.2s auto-advance
    check(`${name} no auto-advance after 3s`, (await step()).includes('1 of 3'), await step())
    if (view.hasTouch) await page.getByRole('button', { name: 'Next →' }).tap()
    else await page.getByRole('button', { name: 'Next →' }).click()
    await sleep(300)
    check(`${name} Next → beat 2`, (await step()).includes('2 of 3'))
    const stamps = await page.locator('.hb-stamp').count()
    check(`${name} the ledger stamps 4 rows`, stamps === 4, stamps)
    await sleep(2200)
    await page.screenshot({ path: path.join(OUT, `${name}-2-ledger.png`) })
    await page.keyboard.press('ArrowRight')
    await sleep(300)
    check(`${name} → key → beat 3`, (await step()).includes('3 of 3'))
    await page.keyboard.press('ArrowLeft')
    await sleep(200)
    check(`${name} ← key → back to beat 2`, (await step()).includes('2 of 3'))
    // ← again remounts beat 1, so the press closes from the start: measure it as it happens.
    await page.keyboard.press('ArrowLeft')
    const h0 = await gap()
    await sleep(700)
    const hMid = await gap()
    await sleep(1700)
    const h1 = await gap()
    check(`${name} the press closes (gap ${Math.round(h0)} → ${Math.round(hMid)} → ${Math.round(h1)}px)`, h0 > hMid && hMid > h1 && h1 / h0 < 0.75)
    await page.screenshot({ path: path.join(OUT, `${name}-1-pressed.png`) })
    await page.keyboard.press('ArrowRight')
    await sleep(200)
    await page.keyboard.press('Enter')
    await sleep(900)
    await page.screenshot({ path: path.join(OUT, `${name}-3-line.png`) })
    await page.getByPlaceholder('One line for the field guide…').fill('Shipped, then rested.')
    await page.getByPlaceholder('One line for the field guide…').press('ArrowLeft')
    check(`${name} typing in the line keeps beat 3 (← moves the caret, not the step)`, (await step()).includes('3 of 3'))
    const w0 = writes.length
    await page.getByRole('button', { name: 'Press it' }).click()
    await sleep(800)
    check(`${name} Press it archives the project`, writes.slice(w0).some((w) => w.table === 'projects' && JSON.stringify(w.body ?? '').includes('archived')), JSON.stringify(writes.slice(w0).map((w) => w.table)))
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}
await browser.close()
const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} passed`)
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
process.exit(passed === results.length ? 0 : 1)
