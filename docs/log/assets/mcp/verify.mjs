// AI assistants (MCP) card, on the REAL app signed in against a MOCKED backend (the capture-anywhere
// recipe, docs/log/assets/capture-anywhere/verify.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in localStorage,
// and Playwright answers every REST call. Writes are recorded so each one can be checked.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Covers: the desktop Integrations card (address, read-only key, snippets filled with the key, copy,
// turn off), an existing key's status line, the phone Settings card at 390 (no sideways scroll with the
// longest snippet open), and Night.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5256'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MCP_URL = 'http://127.0.0.1:9/functions/v1/mcp'

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const T0 = '2026-10-01T09:00:00.000Z'
// A Tokyo user: the card's dates must read on their clock, not Cairo's.
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Asia/Tokyo', created_at: T0, updated_at: T0 }
// Made 3 Oct 20:00 UTC = 4 Oct 05:00 in Tokyo; last used 5 Oct 16:00 UTC = 6 Oct 01:00 in Tokyo.
const KEY_ROW = { id: 'c0000000-0000-4000-8000-0000000000a1', scope: 'read_write', created_at: '2026-10-03T20:00:00.000Z', updated_at: '2026-10-03T20:00:00.000Z', last_used_at: '2026-10-05T16:00:00.000Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 900 } }

async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // What's new (v1.0.22) toasts "Updated to vX" once per version; this page's toasts are about keys.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: { app_settings: [SETTINGS], mcp_keys: [], ...(o.rows ?? {}) }, writes: [], urls: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    state.urls.push(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body, prefer: req.headers()['prefer'] ?? '' })
      if (table === 'mcp_keys') {
        const sent = Array.isArray(body) ? body[0] : body
        state.rows.mcp_keys = req.method() === 'DELETE' ? [] : [{ ...KEY_ROW, scope: sent?.scope ?? 'read_write', last_used_at: null, updated_at: '2026-10-06T08:00:00.000Z' }]
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
// The card is taller than a screen and the page scrolls inside the shell, so shoot the viewport with a
// given part of the card at its top rather than an element shot (which the sticky bars overlap).
const shotAt = async (page, locator, name) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(250)
  await shot(page, name)
}
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const clip = (page) => page.evaluate(() => navigator.clipboard.readText())
// UI pass (2026-10-08): the title is the card's <h2> now, so the card is its <section>, not its parent.
const card = (page) => page.getByText('AI assistants (MCP)', { exact: true }).locator('xpath=ancestor::section[1]')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const KEY_RE = /kf_ai_[A-Za-z0-9_-]{43}/

// ── 1. Desktop Integrations: no key → a read-only key → the snippets → turn off ──
{
  const { ctx, page, errors, state } = await open('/settings', { view: desktop })
  await page.getByText('Integrations', { exact: true }).first().click()
  await sleep(700)
  check('desktop: "AI assistants" section on Integrations', await page.getByText('AI assistants', { exact: true }).isVisible())
  await card(page).scrollIntoViewIfNeeded()
  const before = await card(page).innerText()
  check('desktop: card says not set up yet', /not set up yet/i.test(before))
  check('desktop: card shows the server address', before.includes(MCP_URL))
  await card(page).getByRole('button', { name: 'Copy server address' }).click()
  await sleep(400)
  check('desktop: Copy server address copies it', (await clip(page)) === MCP_URL, await clip(page))
  await shot(page, 'desktop-1-no-key')

  await card(page).getByRole('button', { name: 'Read only' }).click()
  await sleep(200)
  check('desktop: Read only says what it means', (await card(page).innerText()).includes('can look but never change anything'))
  await card(page).getByRole('button', { name: 'Create key' }).click()
  await sleep(900)
  const text = await card(page).innerText()
  const key = text.match(KEY_RE)?.[0] ?? ''
  check('desktop: Create key shows a kf_ai_ key once', !!key && text.includes('won’t be shown again'), key.slice(0, 9) + '…')
  const up = state.writes.find((w) => w.table === 'mcp_keys' && w.method === 'POST')
  const sent = Array.isArray(up?.body) ? up.body[0] : up?.body
  check('desktop: only the key\'s SHA-256 and the scope are saved', sent?.key_hash === sha256(key) && sent?.scope === 'read' && Object.keys(sent ?? {}).sort().join() === 'key_hash,scope', JSON.stringify(sent))
  check('desktop: saved as an upsert on user_id (a new key replaces the old)', up?.query.includes('on_conflict=user_id') && up?.prefer.includes('merge-duplicates'), `${up?.query} | ${up?.prefer}`)
  check('desktop: the key never appears in any request address', !state.urls.some((u) => key && u.includes(key)))
  await card(page).getByRole('button', { name: 'Copy key' }).click()
  await sleep(400)
  check('desktop: Copy key copies the key', (await clip(page)) === key)
  check('desktop: Copy key confirms with a toast', (await toasts(page)).some((t) => t.includes('Key copied')), (await toasts(page)).join(' | '))

  await card(page).getByText('Connect an assistant').click()
  await sleep(400)
  const pres = await card(page).locator('pre').allInnerTexts()
  check('desktop: three setups (Claude Code, Claude Desktop, other)', pres.length === 3, pres.length)
  check('desktop: Claude Code command carries the key in a header', pres[0] === `claude mcp add --transport http kais-flow ${MCP_URL} --header "Authorization: Bearer ${key}"`, pres[0])
  let desk = null
  try { desk = JSON.parse(pres[1]).mcpServers['kais-flow'] } catch { /* checked below */ }
  check('desktop: Claude Desktop config is valid JSON for mcp-remote', desk?.command === 'npx' && desk?.args?.[1] === 'mcp-remote' && desk?.args?.[2] === MCP_URL && desk?.env?.KF_AUTH === `Bearer ${key}`, pres[1].slice(0, 80))
  let other = null
  try { other = JSON.parse(pres[2]).mcpServers['kais-flow'] } catch { /* checked below */ }
  check('desktop: generic config has the url and the header', other?.url === MCP_URL && other?.headers?.Authorization === `Bearer ${key}`, pres[2].slice(0, 80))
  await card(page).getByRole('button', { name: 'Copy for Claude Code' }).click()
  await sleep(400)
  check('desktop: Copy for Claude Code copies the filled command', (await clip(page)) === pres[0])
  await card(page).getByRole('button', { name: 'Copy for Claude Desktop' }).click()
  await sleep(400)
  // Windows' clipboard hands multi-line text back with CRLF; the content is what matters.
  const deskClip = (await clip(page)).replace(/\r\n/g, '\n')
  check('desktop: Copy for Claude Desktop copies the filled config', deskClip === pres[1], deskClip === pres[1] ? '' : JSON.stringify([deskClip.slice(0, 60), deskClip.length, pres[1].length]))
  await shotAt(page, card(page), 'desktop-2-key')
  await shotAt(page, card(page).getByText('Connect an assistant'), 'desktop-2-setups')

  await card(page).getByRole('button', { name: 'Turn off' }).click()
  await sleep(900)
  const del = state.writes.find((w) => w.table === 'mcp_keys' && w.method === 'DELETE')
  check('desktop: Turn off deletes the key row', !!del && del.query.includes(`id=eq.${KEY_ROW.id}`), del?.query)
  const after = await card(page).innerText()
  check('desktop: back to not set up, snippets back to the placeholder', /not set up yet/i.test(after) && !KEY_RE.test(after), after.split('\n').slice(0, 4).join(' / '))
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Desktop, an existing key: the status line on the user's clock (Tokyo) ──
{
  const { ctx, page, errors } = await open('/settings', { view: desktop, rows: { mcp_keys: [KEY_ROW] } })
  await page.getByText('Integrations', { exact: true }).first().click()
  await sleep(700)
  await card(page).scrollIntoViewIfNeeded()
  const text = await card(page).innerText()
  check('existing key: made / scope / last used, dates on the Tokyo clock', /key made 4 Oct · read & write · last used 6 Oct/i.test(text), text.split('\n').find((l) => l.startsWith('key made')))
  check('existing key: New key and Turn off offered', (await card(page).getByRole('button', { name: 'New key' }).isVisible()) && (await card(page).getByRole('button', { name: 'Turn off' }).isVisible()))
  check('existing key: no key text on screen', !KEY_RE.test(text))
  await card(page).getByText('Connect an assistant').click()
  await sleep(300)
  check('existing key: setups say to make a key first, with placeholders', (await card(page).innerText()).includes('Make a key first') && (await card(page).locator('pre').first().innerText()).includes('<your key>'))
  await shot(page, 'desktop-3-existing-key')
  check('existing key: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Phone Settings at 390: the card, a fresh key, the longest snippet open ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('/settings', { theme })
  check(`phone ${theme}: card is on the Settings page`, await page.getByText('AI assistants (MCP)', { exact: true }).isVisible())
  await card(page).scrollIntoViewIfNeeded()
  await card(page).getByRole('button', { name: 'Create key' }).click()
  await sleep(900)
  await card(page).getByText('Connect an assistant').click()
  await sleep(400)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`phone ${theme}: no horizontal scroll at 390 with a key and the setups open`, wide <= 390, wide)
  const box = await card(page).boundingBox()
  check(`phone ${theme}: card fits the screen`, !!box && box.x >= 0 && box.x + box.width <= 390, box && `${Math.round(box.x)}–${Math.round(box.x + box.width)}`)
  const small = await card(page).evaluate((el) => [...el.querySelectorAll('*')].filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 11).length)
  check(`phone ${theme}: no text under 11px`, small === 0, small)
  await shotAt(page, card(page), `phone-${theme}-1-key`)
  await shotAt(page, card(page).getByText('Connect an assistant'), `phone-${theme}-2-setups`)
  check(`phone ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
