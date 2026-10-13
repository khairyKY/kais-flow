// The explainer site, builder site-3 (2026-10-12): a Playwright pass over the BUILT site.
//   cd site && node build.mjs && node tools/check-links.mjs && node ../docs/log/assets/site-3/verify.mjs
//   (optional args: [playwright-core index.mjs] [dir with sharp in node_modules, for the JPEGs])
// Serves site/dist on a free port with its own tiny server (unknown address → 404.html, 404), then:
// every sitemap page at 1440 and 390, day and night: no console errors, no sideways scroll, every shown
// image loads, one h1, text contrast AA, no Arabic switch or link anywhere; /ar/ is gone; the scroll
// story pins with motion and stacks with reduced motion; the sun/moon toggle and guide search work.
// GitHub's release API is answered with a fixed v1.0.28 so the run is offline-stable.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '../../../../site/dist')
const PW = process.argv[2] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const sharp = createRequire(path.join(process.argv[3] ?? 'D:/Coding/kais-flow/app', 'package.json'))('sharp')
const { chromium } = await import(pathToFileURL(PW).href)

// ── a static server over dist/ (what Pages / the Worker do: dir → index.html, else 404.html) ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.zip': 'application/zip' }
const server = http.createServer((q, r) => {
  let f = path.join(DIST, decodeURIComponent(new URL(q.url, 'http://x').pathname))
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
  const ok = fs.existsSync(f)
  r.writeHead(ok ? 200 : 404, { 'content-type': TYPES[path.extname(ok ? f : '.html')] ?? 'application/octet-stream' })
  r.end(fs.readFileSync(ok ? f : path.join(DIST, '404.html')))
}).listen(0)
const BASE = `http://localhost:${server.address().port}`

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`) }
const FAKE_RELEASE = JSON.stringify({ tag_name: 'v1.0.28', published_at: '2026-10-09T00:44:28Z', assets: [
  { name: 'kais-flow-v1.0.28.apk', browser_download_url: 'https://github.com/khairyKY/kais-flow/releases/download/v1.0.28/kais-flow-v1.0.28.apk' },
  { name: 'kais-flow-v1.0.28-windows-setup.exe', browser_download_url: 'https://github.com/khairyKY/kais-flow/releases/download/v1.0.28/kais-flow-v1.0.28-windows-setup.exe' }] })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newCtx = async ({ w = 1440, theme = 'day', reduced = true } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, colorScheme: theme === 'night' ? 'dark' : 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FAKE_RELEASE }))
  return ctx
}
const shot = async (p, file, fullPage = true) => {
  const buf = await p.screenshot({ fullPage, type: 'jpeg', quality: 92 })
  const img = sharp(buf, { limitInputPixels: false })
  const { width } = await img.metadata()
  await img.resize({ width: Math.round(width * (width > 800 ? 0.5 : 0.75)) }).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(HERE, file))
}

// ── 1. what's built, and the Arabic switch ──
const pages = [...(await (await fetch(BASE + '/sitemap.xml')).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
check('sitemap lists every page', pages.length === 30, `${pages.length} urls`)
check('Arabic is off: /ar/ is not built, not in the sitemap', !fs.existsSync(path.join(DIST, 'ar')) && !pages.includes('/ar/') && (await fetch(BASE + '/ar/')).status === 404)
check('Arabic share card is not in the build', !fs.existsSync(path.join(DIST, 'og/ar.png')))
const nf = await fetch(BASE + '/no-such-page/')
check('an unknown address gets the botanical 404', nf.status === 404 && (await nf.text()).includes('didn’t take root'))

// ── 2. every page × width × theme ──
const CONTRAST_JS = () => {
  const parse = (c) => { const m = c.replace(/^color\(srgb/, '').match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; const k = c.startsWith('color(') ? 255 : 1; return [m[0] * k, m[1] * k, m[2] * k, m[3] ?? 1] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1] }
  const bgOf = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor)
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break }
      if (e === document.documentElement) layers.push(parse(getComputedStyle(document.body).backgroundColor))
    }
    let base = layers.pop() ?? [255, 255, 255, 1]
    if (base[3] < 1) base = over(base, [255, 255, 255, 1])
    while (layers.length) base = over(layers.pop(), base)
    return base
  }
  const bad = []
  let n = 0
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const done = new Set()
  while (walker.nextNode()) {
    const t = walker.currentNode, el = t.parentElement
    if (!t.textContent.trim() || done.has(el)) continue
    done.add(el)
    if (el.closest('.screen, [aria-hidden="true"], [role="img"], .sr, .skip, [hidden], .menu')) continue
    const r = el.getBoundingClientRect(), s = getComputedStyle(el)
    if (!r.width || s.visibility === 'hidden' || +s.opacity === 0) continue
    let fg = parse(s.color)
    const bg = bgOf(el)
    if (fg[3] < 1) fg = over(fg, bg)
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700)
    n++
    if (ratio < (large ? 3 : 4.5)) bad.push(`"${t.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`)
  }
  return { n, bad }
}
const slug = (u) => u.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home'
// the pages this pass changed get a screenshot (day at both widths; night for a few)
const SHOOT = new Set(['/', '/features/', '/features/plan-and-today/', '/features/calendar/', '/features/capture/', '/features/rituals/', '/features/apps/', '/paper/', '/integrations/', '/compare/', '/growing/', '/guides/', '/guides/connect-an-ai-assistant/', '/guides/import/', '/guides/getting-started/', '/guides/capture-from-anywhere/', '/guides/install-android/', '/guides/install-windows/', '/guides/your-data/', '/privacy/'])
const NIGHT = new Set(['/', '/features/apps/', '/growing/', '/guides/connect-an-ai-assistant/', '/privacy/'])
fs.mkdirSync(path.join(HERE, 'pages'), { recursive: true })
for (const w of [1440, 390]) {
  for (const theme of ['day', 'night']) {
    const ctx = await newCtx({ w, theme })
    const p = await ctx.newPage()
    const errs = []
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    p.on('pageerror', (e) => errs.push(e.message))
    const fails = { console: [], hscroll: [], img: [], h1: [], arabic: [], contrast: [] }
    let texts = 0
    for (const u of [...pages, '/404.html']) {
      errs.length = 0
      await p.goto(BASE + u, { waitUntil: 'networkidle' })
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)) } scrollTo(0, 0) })
      await p.waitForLoadState('networkidle')
      // lazy images start on the scroll pass; give a busy machine up to 10 s to finish them
      await p.waitForFunction(() => [...document.images].every((i) => !i.getClientRects().length || i.complete), null, { timeout: 10000 }).catch(() => {})
      if (errs.length) fails.console.push(`${u}: ${errs[0]}`)
      const info = await p.evaluate(() => ({
        hs: document.documentElement.scrollWidth - innerWidth,
        // naturalWidth > 0 = the file came and decodes (Chrome can leave a lazy one "incomplete" after a fast scroll-back)
        broken: [...document.images].filter((i) => i.getClientRects().length && !i.naturalWidth).map((i) => i.src.split('/').pop()),
        h1: document.querySelectorAll('h1').length,
        arabic: document.querySelectorAll('.lang, a[href^="/ar"], link[hreflang]').length,
      }))
      if (info.hs > 0) fails.hscroll.push(`${u} +${info.hs}px`)
      if (info.broken.length) fails.img.push(`${u}: ${info.broken.join(', ')}`)
      if (info.h1 !== 1) fails.h1.push(`${u}: ${info.h1}`)
      if (info.arabic) fails.arabic.push(u)
      const c = await p.evaluate(CONTRAST_JS)
      texts += c.n
      if (c.bad.length) fails.contrast.push(`${u}: ${c.bad.slice(0, 3).join('; ')}`)
      if (SHOOT.has(u) && (theme === 'day' || NIGHT.has(u))) await shot(p, `pages/${w}-${slug(u)}${theme === 'night' ? '-night' : ''}.jpg`)
    }
    const tag = `${w} ${theme}`
    check(`${tag}: no console errors`, !fails.console.length, fails.console.join(' | '))
    check(`${tag}: no sideways scroll`, !fails.hscroll.length, fails.hscroll.join(' | '))
    check(`${tag}: every shown image loads`, !fails.img.length, fails.img.join(' | '))
    check(`${tag}: one h1 per page`, !fails.h1.length, fails.h1.join(' | '))
    check(`${tag}: no Arabic switch, link or hreflang`, !fails.arabic.length, fails.arabic.join(' | '))
    check(`${tag}: text contrast AA`, !fails.contrast.length, fails.contrast.length ? fails.contrast.join(' | ') : `${texts} text runs`)
    await ctx.close()
  }
}

// ── 3. motion, reduced motion, and the bits of behaviour ──
for (const w of [1440, 390]) {
  const moving = await (await newCtx({ w, reduced: false })).newPage()
  await moving.goto(BASE + '/', { waitUntil: 'networkidle' })
  check(`${w}: the scroll story pins with motion allowed`, await moving.$eval('.story-stage', (s) => getComputedStyle(s).position === 'sticky'))
  const still = await (await newCtx({ w, reduced: true })).newPage()
  await still.goto(BASE + '/', { waitUntil: 'networkidle' })
  const r = await still.evaluate(() => ({ pos: getComputedStyle(document.querySelector('.story-stage')).position, anim: [...document.querySelectorAll('.lt *')].some((e) => getComputedStyle(e).animationName !== 'none' && getComputedStyle(e).animationPlayState === 'running') }))
  check(`${w}: reduced motion — the story stacks, the little loops are still`, r.pos !== 'sticky' && !r.anim, JSON.stringify(r))
  await still.evaluate(() => document.getElementById('how-it-works').scrollIntoView())
  await shot(still, `story-${w}-reduced-motion.jpg`, false)
}
{
  const p = await (await newCtx()).newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const before = await p.evaluate(() => document.documentElement.dataset.theme)
  await p.click('[data-theme-toggle]')
  check('sun/moon flips the theme', (await p.evaluate(() => document.documentElement.dataset.theme)) !== before)
  await p.goto(BASE + '/guides/', { waitUntil: 'networkidle' })
  await p.fill('#guide-q', 'assistant')
  const shown = await p.$$eval('[data-guide]:not([hidden]) b', (bs) => bs.map((b) => b.textContent))
  check('guide search finds the AI assistant guide', shown.includes('Connect an AI assistant'), shown.join(', '))
  await p.goto(BASE + '/guides/connect-an-ai-assistant/', { waitUntil: 'networkidle' })
  const code = await p.$$eval('pre code', (cs) => cs.map((c) => c.textContent).join('\n'))
  check('the MCP guide carries the three setups from the app', code.includes('claude mcp add --transport http kais-flow') && code.includes('"Authorization:${KF_AUTH}"') && code.includes('"type": "http"'))
  await p.goto(BASE + '/growing/', { waitUntil: 'networkidle' })
  const now = await p.$$eval('.bed.now li', (ls) => ls.map((l) => l.textContent))
  check('the roadmap’s Now is this month’s work', now.length === 4 && now.some((t) => t.includes('repeat')), now.join(' · '))
}

await browser.close()
server.close()
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} pass`)
process.exit(failed ? 1 : 0)
