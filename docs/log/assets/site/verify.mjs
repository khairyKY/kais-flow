// The explainer site (builder S2, 2026-10-04): a Playwright pass over the BUILT site (site/dist).
//   cd site && node build.mjs && <any static server on dist/, 404 → 404.html> && node ../docs/log/assets/site/verify.mjs <outDir> [baseUrl] [playwright-core path]
// Checks every page at desktop 1440 + phone 390, day + night: loads with no console errors, no sideways
// scroll, every image loads and has alt, one h1, title + description + canonical/OG, text contrast AA,
// then: every internal link resolves (crawled), the scroll story pins with motion and stacks without,
// the theme toggle + phone menu + skip link work, /ar/ is RTL, and each page's transfer + image weight.
// The GitHub API is answered with a fixed release so the run is offline-stable; external links are HEAD-checked.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = (process.argv[3] ?? 'http://localhost:5438').replace(/\/$/, '')
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`) }

const FAKE_RELEASE = JSON.stringify({ tag_name: 'v1.0.17', published_at: '2026-10-03T23:48:44Z', assets: [
  { name: 'kais-flow-v1.0.17.apk', browser_download_url: 'https://github.com/khairyKY/kais-flow/releases/download/v1.0.17/kais-flow-v1.0.17.apk' },
  { name: 'kais-flow-v1.0.17-windows-setup.exe', browser_download_url: 'https://github.com/khairyKY/kais-flow/releases/download/v1.0.17/kais-flow-v1.0.17-windows-setup.exe' }] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newCtx = async (o = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...o })
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FAKE_RELEASE }))
  return ctx
}

// ── 1. pages from the sitemap, plus a crawl of every internal link ──
const sitemap = await (await fetch(BASE + '/sitemap.xml')).text()
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
check('sitemap lists the pages', pages.length >= 25, `${pages.length} urls`)
check('robots.txt points at the sitemap', /Sitemap: .*sitemap\.xml/.test(await (await fetch(BASE + '/robots.txt')).text()))
const feed = await fetch(BASE + '/field-notes/feed.xml')
check('field-notes RSS is valid-looking XML', feed.ok && (await feed.text()).includes('<rss version="2.0"'))

const internal = new Set(), external = new Set()
{
  const ctx = await newCtx()
  const p = await ctx.newPage()
  const queue = [...pages], seen = new Set()
  while (queue.length) {
    const u = queue.shift()
    if (seen.has(u)) continue
    seen.add(u)
    await p.goto(BASE + u, { waitUntil: 'domcontentloaded' })
    // canonical/hreflang links carry the future public origin (SITE_URL), so they're left out here
    const hrefs = await p.$$eval('a[href], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="alternate"][type], img[src]', (as) => as.map((a) => a.href || a.src))
    for (const h of hrefs) {
      const url = new URL(h)
      if (url.origin === new URL(BASE).origin) { const k = url.pathname; internal.add(k); if (!seen.has(k) && (k.endsWith('/') || !path.extname(k))) queue.push(k) } else if (!url.hostname.includes('fonts.g')) external.add(url.href.split('#')[0])
    }
  }
  for (const u of pages) { await p.goto(BASE + u, { waitUntil: 'domcontentloaded' }); internal.add(await p.$eval('meta[property="og:image"]', (m) => new URL(m.content).pathname)) }
  await ctx.close()
}
const broken = []
for (const k of internal) { const r = await fetch(BASE + k); if (!r.ok) broken.push(`${k} ${r.status}`) }
check('every internal link, image and OG card resolves', broken.length === 0, `${internal.size} checked${broken.length ? ' · broken: ' + broken.join(', ') : ''}`)
const extBad = []
for (const u of external) {
  try { const r = await fetch(u, { method: 'HEAD', redirect: 'follow' }); if (r.status >= 400 && !(r.status === 405)) extBad.push(`${u} ${r.status}`) } catch (e) { extBad.push(`${u} ${e.message}`) }
}
check('external links answer (app, GitHub release assets, repo)', extBad.length === 0, `${external.size} checked${extBad.length ? ' · ' + extBad.join(', ') : ''}`)
const nf = await fetch(BASE + '/no-such-page/')
check('an unknown address gets the botanical 404', nf.status === 404 && (await nf.text()).includes('didn’t take root'))

// ── 2. every page × width × theme ──
const CONTRAST_JS = () => {
  // rgb()/rgba(), or color(srgb r g b / a) with 0–1 channels (what color-mix() computes to)
  const parse = (c) => { const m = c.replace(/^color\(srgb/, '').match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; const k = c.startsWith('color(') ? 255 : 1; return [m[0] * k, m[1] * k, m[2] * k, m[3] ?? 1] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1] }
  const bgOf = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e)
      // a node lifted onto another background (the pinned night beat) — stop at the element that paints it
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

const weights = {}
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const theme of ['day', 'night']) {
    const ctx = await newCtx({ viewport: { width: w, height: h }, colorScheme: theme === 'night' ? 'dark' : 'light', reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Network.enable')
    let bytes = 0, img = 0
    const types = {}
    cdp.on('Network.responseReceived', (e) => { types[e.requestId] = e.type })
    cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; if (types[e.requestId] === 'Image') img += e.encodedDataLength })
    const errs = []
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    p.on('pageerror', (e) => errs.push(e.message))
    const fails = { console: [], hscroll: [], img: [], alt: [], h1: [], meta: [], contrast: [] }
    let textNodes = 0
    for (const u of [...pages, '/404.html']) {
      errs.length = 0
      bytes = 0; img = 0
      await cdp.send('Network.clearBrowserCache')
      await p.goto(BASE + u, { waitUntil: 'networkidle' })
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } scrollTo(0, 0) })
      await p.waitForLoadState('networkidle')
      if (errs.length) fails.console.push(`${u}: ${errs[0]}`)
      const info = await p.evaluate(() => ({
        hs: document.documentElement.scrollWidth - innerWidth,
        // images the layout hides at this width (display:none) are lazy and never fetched — that's intended
        broken: [...document.images].filter((i) => i.getClientRects().length && (!i.complete || !i.naturalWidth)).map((i) => i.src.split('/').pop()),
        noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
        h1: document.querySelectorAll('h1').length,
        meta: !!document.title && !!document.querySelector('meta[name="description"]')?.content && !!document.querySelector('meta[property="og:image"]') && !!document.documentElement.lang,
      }))
      if (info.hs > 0) fails.hscroll.push(`${u} +${info.hs}px`)
      if (info.broken.length) fails.img.push(`${u}: ${info.broken.join(',')}`)
      if (info.noAlt) fails.alt.push(`${u}: ${info.noAlt}`)
      if (info.h1 !== 1) fails.h1.push(`${u}: ${info.h1}`)
      if (!info.meta) fails.meta.push(u)
      const c = await p.evaluate(CONTRAST_JS)
      textNodes += c.n
      if (c.bad.length) fails.contrast.push(`${u}: ${c.bad.slice(0, 3).join('; ')}`)
      if (w === 1440 && theme === 'day') weights[u] = { kb: Math.round(bytes / 1024), imgKb: Math.round(img / 1024) }
    }
    const tag = `${w} ${theme}`
    check(`${tag}: ${pages.length + 1} pages load with no console errors`, !fails.console.length, fails.console.join(' | '))
    check(`${tag}: no sideways scroll`, !fails.hscroll.length, fails.hscroll.join(', '))
    check(`${tag}: every image loads`, !fails.img.length, fails.img.join(' | '))
    check(`${tag}: every image has alt (empty for decoration)`, !fails.alt.length, fails.alt.join(', '))
    check(`${tag}: exactly one h1 per page`, !fails.h1.length, fails.h1.join(', '))
    check(`${tag}: title, description, OG image and lang on every page`, !fails.meta.length, fails.meta.join(', '))
    check(`${tag}: text contrast AA (${textNodes} text runs)`, !fails.contrast.length, fails.contrast.join(' | '))
    await ctx.close()
  }
}

// ── 3. behaviour ──
{
  // the scroll story: pinned with motion, five beats, night on the last; stacked without motion
  const ctx = await newCtx()
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const pos = await p.$eval('.story-stage', (e) => getComputedStyle(e).position)
  const span = await p.evaluate(() => { const s = document.querySelector('.story'); return [s.offsetTop, s.offsetHeight - innerHeight] })
  const seen = []
  for (let i = 0; i < 5; i++) {
    await p.evaluate((y) => scrollTo(0, y), span[0] + ((i + 0.5) * span[1]) / 5)
    await p.waitForTimeout(900)
    seen.push(await p.evaluate(() => ({ beat: document.querySelector('.story').dataset.beat, on: document.querySelectorAll('.beat.on').length, night: document.querySelector('.story-stage').dataset.theme === 'night', op: getComputedStyle(document.querySelector('.beat.on .beat-text')).opacity })))
    await p.screenshot({ path: path.join(OUT, `story-1440-beat${i + 1}.jpg`), quality: 70 })
  }
  check('motion: the story pins (sticky stage, 5 screens of scroll)', pos === 'sticky' && Math.round(span[1] / 900) === 4, `${pos}, ${span[1]}px`)
  check('motion: each screen of scroll shows the next beat, one at a time', seen.every((s, i) => +s.beat === i && s.on === 1 && s.op === '1'), seen.map((s) => s.beat).join(','))
  check('motion: the fifth beat turns the stage to night', seen[4].night && !seen[0].night)
  const anims = await p.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules] } catch { return [] } }).flatMap((r) => (r.cssRules ? [...r.cssRules] : [r])).filter((r) => r.selectorText?.includes('.beat')).map((r) => r.style.transitionProperty).filter(Boolean))
  check('motion: beats animate transform/opacity only', anims.every((t) => t.split(',').every((x) => ['opacity', 'transform'].includes(x.trim()))), [...new Set(anims)].join(' | '))
  await ctx.close()
  for (const w of [1440, 390]) {
    const rc = await newCtx({ reducedMotion: 'reduce', viewport: { width: w, height: w > 800 ? 900 : 844 } })
    const rp = await rc.newPage()
    await rp.goto(BASE + '/', { waitUntil: 'networkidle' })
    const r = await rp.evaluate(() => ({ pos: getComputedStyle(document.querySelector('.story-stage')).position, h: document.querySelector('.story').offsetHeight, vis: [...document.querySelectorAll('.beat')].map((b) => getComputedStyle(b.querySelector('.beat-text')).opacity === '1' && getComputedStyle(b).position !== 'absolute').filter(Boolean).length, anim: getComputedStyle(document.querySelector('.lt-swipe .lt-row')).animationName }))
    check(`reduced motion ${w}: no pinning, the five beats stack, loops paused`, r.pos !== 'sticky' && r.vis === 5 && r.anim === 'none', `${r.pos}, ${r.vis} beats, ${r.h}px, anim ${r.anim}`)
    await rp.locator('.story').screenshot({ path: path.join(OUT, `story-${w}-reduced-motion.jpg`), quality: 70 })
    await rc.close()
  }
}
{
  const ctx = await newCtx({ colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const before = await p.evaluate(() => document.documentElement.dataset.theme)
  await p.click('.bar [data-theme-toggle]')
  const after = await p.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('kf-theme'), getComputedStyle(document.body).backgroundColor])
  await p.reload({ waitUntil: 'networkidle' })
  const kept = await p.evaluate(() => document.documentElement.dataset.theme)
  check('sun/moon toggle flips the theme and remembers it', before === 'day' && after[0] === 'night' && after[1] === 'night' && kept === 'night', `${before} → ${after[0]} (${after[2]}), after reload ${kept}`)
  await p.evaluate(() => localStorage.clear())
  await p.reload({ waitUntil: 'networkidle' })
  await p.keyboard.press('Tab')
  const skip = await p.evaluate(() => { const a = document.activeElement; return [a.className, a.getBoundingClientRect().top >= 0, getComputedStyle(a).boxShadow] })
  await p.keyboard.press('Tab')
  await p.keyboard.press('Tab')
  const ring = await p.evaluate(() => getComputedStyle(document.activeElement).boxShadow)
  check('keyboard: “Skip to content” comes first, focus shows the ring', skip[0] === 'skip' && skip[1] && /77, 106, 117/.test(ring), `${skip[0]}, ring ${ring.slice(0, 60)}`)
  const ver = await p.evaluate(() => [...document.querySelectorAll('[data-release-tag]')].map((e) => e.textContent))
  check('the version shown comes from GitHub’s latest release', ver.length >= 3 && ver.every((v) => v === 'v1.0.17'), ver.join(','))
  const hdr = await p.evaluate(async () => { scrollTo(0, 400); await new Promise((r) => setTimeout(r, 300)); return [document.querySelector('.site-header').classList.contains('condensed'), document.querySelector('.bar').offsetHeight] })
  check('the header condenses after scrolling', hdr[0] && hdr[1] === 64, `${hdr[1]}px`)
  await ctx.close()
}
{
  const ctx = await newCtx({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.click('.menu-btn')
  const open = await p.evaluate(() => [!document.getElementById('menu').hidden, document.querySelector('.menu-btn').getAttribute('aria-expanded'), document.querySelectorAll('#menu a').length])
  await p.screenshot({ path: path.join(OUT, 'phone-menu-open.jpg'), quality: 70 })
  await p.keyboard.press('Escape')
  const closed = await p.evaluate(() => document.getElementById('menu').hidden)
  check('phone menu opens with the links, Esc closes it', open[0] && open[1] === 'true' && open[2] >= 6 && closed, `${open[2]} links`)
  await p.goto(BASE + '/ar/', { waitUntil: 'networkidle' })
  const ar = await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir, getComputedStyle(document.querySelector('h1')).fontFamily, document.querySelector('.lang .on').textContent, document.querySelector('.screen-in').dir])
  check('/ar/ is Arabic and right-to-left, Naskh headings, ع is current, app screens stay LTR', ar[0] === 'ar' && ar[1] === 'rtl' && ar[2].includes('Noto Naskh Arabic') && ar[3] === 'ع' && ar[4] === 'ltr', ar.join(' · '))
  await p.goto(BASE + '/guides/', { waitUntil: 'networkidle' })
  await p.fill('#guide-q', 'smartscreen')
  const hits = await p.evaluate(() => [...document.querySelectorAll('[data-guide]')].filter((c) => !c.hidden).map((c) => c.querySelector('b').textContent))
  check('guides search filters as you type', hits.length === 1 && hits[0] === 'Install on Windows', hits.join(','))
  await ctx.close()
}

// ── 4. weights ──
const rows = Object.entries(weights).sort((a, b) => b[1].kb - a[1].kb)
const heavy = rows.filter(([, v]) => v.kb > 1024)
check('every page transfers under 1 MB (desktop, cold cache, all lazy images loaded)', heavy.length === 0, heavy.map(([u, v]) => `${u} ${v.kb} KB`).join(', '))
fs.writeFileSync(path.join(OUT, 'weights.json'), JSON.stringify(Object.fromEntries(rows), null, 1))
console.log('\npage weights (KB transferred · of which images):')
for (const [u, v] of rows) console.log(`  ${u.padEnd(34)} ${String(v.kb).padStart(5)} · ${v.imgKb}`)

await browser.close()
const pass = results.filter((r) => r.ok).length
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ pass, total: results.length, results }, null, 1))
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
