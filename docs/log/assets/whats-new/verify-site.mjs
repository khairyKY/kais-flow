// What's new on the explainer site (builder WN, 2026-10-07): a Playwright pass over the BUILT site.
//   cd site && node build.mjs && node ../docs/log/assets/whats-new/verify-site.mjs <outDir> [playwright-core path]
// Serves site/dist on a free port itself (closed at the end). /whats-new/ at 1440 + 390, day + night:
// no console errors, no sideways scroll, one h1, images load, text contrast AA (the site pass's walker),
// the newest release as the hero with its highlights + icons, the two before it, "All field notes →".
// Then: the nav/footer links, the sitemap, the OG card, RSS + Field notes fed by the same releases.json,
// and the header at 1024 (five links still fit). GitHub's API is answered with a fixed release.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../site')
const DIST = path.join(SITE, 'dist')
const NOTES = JSON.parse(fs.readFileSync(path.join(SITE, 'src/releases.json'), 'utf8'))
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`) }

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.html': 'text/html', '.xml': 'application/xml', '.ico': 'image/x-icon', '.txt': 'text/plain' }
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const f = path.join(DIST, p)
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404, { 'content-type': 'text/html' }); r.end(fs.readFileSync(path.join(DIST, '404.html'))); return }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }); r.end(b)
  })
}).listen(0)
const BASE = `http://localhost:${server.address().port}`

const FAKE_RELEASE = JSON.stringify({ tag_name: NOTES[0].v, published_at: NOTES[0].date + 'T12:00:00Z', assets: [] })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newCtx = async (o = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...o })
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FAKE_RELEASE }))
  return ctx
}

// the site pass's contrast walker (docs/log/assets/site/verify.mjs), unchanged
const CONTRAST_JS = () => {
  const parse = (c) => { const m = c.replace(/^color\(srgb/, '').match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; const k = c.startsWith('color(') ? 255 : 1; return [m[0] * k, m[1] * k, m[2] * k, m[3] ?? 1] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1] }
  const bgOf = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e)
      const c = parse(s.backgroundColor)
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

// ── 1. /whats-new/ × width × theme ──
const [NEW, ...BEFORE] = NOTES
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const theme of ['day', 'night']) {
    const tag = `${w} ${theme}`
    const ctx = await newCtx({ viewport: { width: w, height: h }, colorScheme: theme === 'night' ? 'dark' : 'light', reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    const errs = []
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(BASE + '/whats-new/', { waitUntil: 'networkidle' })
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } scrollTo(0, 0) })
    await p.waitForLoadState('networkidle')
    await p.evaluate(() => document.fonts.ready)
    const info = await p.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      hs: document.documentElement.scrollWidth - innerWidth,
      broken: [...document.images].filter((i) => i.getClientRects().length && (!i.complete || !i.naturalWidth)).map((i) => i.src.split('/').pop()),
      noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
      h1: [...document.querySelectorAll('h1')].map((e) => e.textContent),
      eyebrow: document.querySelector('.wn-hero .eyebrow')?.textContent,
      cells: [...document.querySelectorAll('.wn-cell')].map((c) => ({ t: c.querySelector('p').textContent, ic: !!c.querySelector('svg.ic path, svg.ic circle, svg.ic rect'), w: c.getBoundingClientRect().width })),
      older: [...document.querySelectorAll('.wn-old')].map((a) => [a.querySelector('.entry-v').textContent, a.querySelectorAll('li').length]),
      fieldNotes: [...document.querySelectorAll('main a')].find((a) => a.textContent.includes('All field notes'))?.getAttribute('href'),
      navCurrent: document.querySelector('.nav a[aria-current]')?.textContent ?? null,
      menuHas: [...document.querySelectorAll('#menu a')].some((a) => a.getAttribute('href') === '/whats-new/'),
      foot: [...document.querySelectorAll('.foot-links a')].some((a) => a.getAttribute('href') === '/whats-new/'),
      og: document.querySelector('meta[property="og:image"]')?.content,
      title: document.title,
    }))
    const c = await p.evaluate(CONTRAST_JS)
    check(`${tag}: loads with no console errors, theme ${theme}`, !errs.length && info.theme === theme, errs[0] ?? '')
    check(`${tag}: no sideways scroll, images load with alt, one h1`, info.hs <= 0 && !info.broken.length && !info.noAlt && info.h1.length === 1, `hs ${info.hs} · broken ${info.broken.join(',') || 0} · h1 "${info.h1.join('|')}"`)
    check(`${tag}: the newest release is the hero (${NEW.v}, its title, its date)`, info.h1[0] === (NEW.title ?? `What’s new in ${NEW.v}`) && info.eyebrow.includes(NEW.v), info.eyebrow)
    check(`${tag}: its ${NEW.highlights.length} highlights, each with an icon`, info.cells.length === NEW.highlights.length && info.cells.every((x, i) => x.t === NEW.highlights[i] && x.ic), info.cells.map((x) => Math.round(x.w)).join('/') + ' px wide')
    check(`${tag}: the two releases before it, lighter`, info.older.length === 2 && info.older.every(([v, n], i) => v.startsWith(BEFORE[i].v) && n === BEFORE[i].highlights.length), info.older.map((o) => o.join(':')).join(', '))
    check(`${tag}: “All field notes →” goes to /field-notes/`, info.fieldNotes === '/field-notes/')
    check(`${tag}: text contrast AA (${c.n} text runs)`, !c.bad.length, c.bad.slice(0, 3).join('; '))
    if (w === 1440) check(`${tag}: “What’s new” is in the header nav, current on this page`, info.navCurrent === 'What’s new', info.navCurrent)
    else check(`${tag}: “What’s new” is in the phone menu`, info.menuHas)
    check(`${tag}: in the footer, title + OG card`, info.foot && info.title === 'What’s new · Kai’s Flow' && info.og.endsWith('/og/whats-new.png'), info.og)
    await p.screenshot({ path: path.join(OUT, `site-whats-new-${w}-${theme}.png`), fullPage: true })
    await p.screenshot({ path: path.join(OUT, `site-whats-new-${w}-${theme}-fold.png`) })
    await ctx.close()
  }
}

// ── 2. the rest of the site that reads the same file ──
{
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text()
  check('the sitemap lists /whats-new/', sitemap.includes('/whats-new/</loc>'))
  const og = await fetch(BASE + '/og/whats-new.png')
  check('the OG card is there (1200×630 PNG)', og.ok && (await og.arrayBuffer()).byteLength > 20_000)
  const feed = await (await fetch(BASE + '/field-notes/feed.xml')).text()
  const items = [...feed.matchAll(/<item>/g)].length
  check('RSS: one item per release, newest first, from releases.json', items === NOTES.length && feed.indexOf(NOTES[0].v) < feed.indexOf(NOTES[1].v), `${items} items`)
  const ctx = await newCtx()
  const p = await ctx.newPage()
  await p.goto(BASE + '/field-notes/', { waitUntil: 'networkidle' })
  const entries = await p.$$eval('.entry', (es) => es.map((e) => e.id))
  check('Field notes: every release, in order', entries.join() === NOTES.map((n) => n.v).join(), `${entries.length} entries`)
  await p.goto(BASE + '/download/', { waitUntil: 'networkidle' })
  const ver = await p.$$eval('[data-release-tag]', (es) => [...new Set(es.map((e) => e.textContent))])
  check('Download shows the newest version', ver.length === 1 && ver[0] === NOTES[0].v, ver.join(','))
  await p.setViewportSize({ width: 1024, height: 800 })
  await p.goto(BASE + '/whats-new/', { waitUntil: 'networkidle' })
  const bar = await p.evaluate(() => { const b = document.querySelector('.bar'); return { nav: getComputedStyle(document.querySelector('.nav')).display, over: b.scrollWidth - b.clientWidth, hs: document.documentElement.scrollWidth - innerWidth } })
  check('1024: the header still fits (nav folds into the menu below 1024)', bar.over <= 0 && bar.hs <= 0, JSON.stringify(bar))
  await p.setViewportSize({ width: 1100, height: 800 })
  await p.goto(BASE + '/whats-new/', { waitUntil: 'networkidle' })
  const bar2 = await p.evaluate(() => { const b = document.querySelector('.bar'); const links = [...document.querySelectorAll('.nav a')].map((a) => a.getBoundingClientRect()); return { nav: getComputedStyle(document.querySelector('.nav')).display, over: b.scrollWidth - b.clientWidth, n: links.length, oneLine: links.every((r) => Math.abs(r.top - links[0].top) < 2) } })
  check('1100: five nav links on one line, nothing overflows', bar2.nav === 'flex' && bar2.n === 5 && bar2.oneLine && bar2.over <= 0, JSON.stringify(bar2))
  await p.screenshot({ path: path.join(OUT, 'site-header-1100.png'), clip: { x: 0, y: 0, width: 1100, height: 90 } })
  await ctx.close()
}

await browser.close()
server.close()
const pass = results.filter((r) => r.ok).length
fs.writeFileSync(path.join(OUT, 'site-results.json'), JSON.stringify({ pass, total: results.length, results }, null, 1))
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
