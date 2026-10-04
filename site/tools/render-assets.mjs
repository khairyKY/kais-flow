// Renders the pictures the site can't draw at runtime, into public/ (commit the results):
//   og/*.png            — a 1200×630 share card per page (WhatsApp, X, Slack…)
//   favicon-16/32.png, favicon.ico — the grain-free K for small sizes
//   press/kais-flow-press-kit.zip — the K (light + dark, 1024 px), six screenshots at 2×, and a README
// Needs Playwright + Chrome, which the Pages build doesn't have, so it runs by hand:
//   node build.mjs && node tools/render-assets.mjs && node build.mjs
// PW = path to playwright-core's index.mjs (default: the `playwright-core` package), CHROME = browser exe.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GUIDES } from '../src/pages/guides.mjs'
import { RELEASES, shortDate, LATEST } from '../src/data.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIST = path.join(ROOT, 'dist'), PUB = path.join(ROOT, 'public')
const { chromium } = await import(process.env.PW ? pathToFileURL(process.env.PW).href : 'playwright-core')
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// a throwaway static server over dist/ so the cards use the real stylesheet, fonts and screens
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.html': 'text/html' }
const server = http.createServer((q, r) => {
  const f = path.join(DIST, decodeURIComponent(new URL(q.url, 'http://x').pathname))
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }); r.end(b) })
}).listen(0)
const BASE = `http://localhost:${server.address().port}/`
const screenHtml = (n) => fs.readFileSync(path.join(ROOT, 'src/screens', n + '.html'), 'utf8').replace(/ds\/assets\/(\w+)\/([\w-]+)\.png/g, 'img/$1-$2.webp')
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&family=Courier+Prime:wght@400;700&family=Inter+Tight:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Noto+Naskh+Arabic:wght@500&family=IBM+Plex+Sans+Arabic:wght@400&display=swap">'
const doc = (body, extra = '') => `<!doctype html><html data-theme="day"><head><meta charset="utf-8"><base href="${BASE}">${FONTS}<link rel="stylesheet" href="site.css"><style>body{margin:0;background:var(--paper-linen)}${extra}</style></head><body>${body}</body></html>`
const kTile = (size, { grain = true, weight = 500 } = {}) => `<span style="position:relative;display:block;width:${size}px;height:${size}px;border-radius:${size * 0.225}px;overflow:hidden;background:linear-gradient(158deg,#FBF6E9,#EFE9DB 68%,#E7E0CE);box-shadow:inset 0 0 0 ${Math.max(1, size / 64)}px rgba(224,216,194,.95)">${grain ? '<span style="position:absolute;inset:0;background-image:var(--noise-url);mix-blend-mode:multiply;opacity:.5"></span>' : ''}<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:${weight};font-size:${size * 0.66}px;line-height:1;color:#2a2420">K</span></span>`

// ── the share cards ──
const art = {
  wisteria: '<img src="img/wisteria-p100.webp" style="position:absolute;top:-40px;right:120px;height:640px;transform:rotate(-3deg)"><img src="img/cherry-bloom.webp" style="position:absolute;right:40px;bottom:30px;width:170px;transform:rotate(12deg)">',
  desk: `<div style="position:absolute;right:-80px;top:70px;transform:rotate(-2deg)"><div class="screen desk" style="--s:.36"><div class="screen-in">${screenHtml('calendar-week')}</div></div></div>`,
  phone: (n) => `<div style="position:absolute;right:110px;top:56px;transform:rotate(3deg)"><div class="screen" style="--s:.62"><div class="screen-in">${screenHtml(n)}</div></div></div>`,
  img: (n, w = 360) => `<img src="img/${n}.webp" style="position:absolute;right:80px;top:50%;transform:translateY(-50%);width:${w}px;max-height:470px;object-fit:contain">`,
}
const card = ({ eb, t, s, a, rtl = false }) => doc(`<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:var(--paper-linen);color:var(--ink-body)"${rtl ? ' dir="rtl"' : ''}>
  ${a}<div style="position:absolute;${rtl ? 'right' : 'left'}:84px;top:80px;bottom:80px;width:${rtl ? 700 : 640}px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:16px">${kTile(64)}<span style="font-family:var(--font-display);font-size:30px;font-weight:500">Kai’s Flow</span></div>
  <div style="margin-top:auto"><span style="font-family:${rtl ? "'IBM Plex Sans Arabic'" : 'var(--font-mono)'};font-size:16px;letter-spacing:${rtl ? 0 : '.14em'};text-transform:uppercase;color:var(--acc-terra-ink)">${eb}</span>
  <div style="margin-top:16px;font-family:${rtl ? "'Noto Naskh Arabic'" : 'var(--font-display)'};font-weight:500;font-size:${t.length > 40 ? 56 : 64}px;line-height:${rtl ? 1.4 : 1.04};letter-spacing:${rtl ? 0 : '-.02em'};text-wrap:balance">${t}</div>
  <div style="margin-top:20px;font-size:24px;color:var(--ink-muted)">${s}</div></div></div></div>`)
const r0 = RELEASES[0]
const CARDS = {
  home: { eb: 'Home', t: 'Your days, planned in one quiet place.', s: 'Free · Web, Android, Windows', a: art.wisteria },
  ar: { eb: 'الرئيسية', t: 'أيامك، مُخطَّطة في مكان واحد هادئ.', s: 'مجاني · الويب، أندرويد، ويندوز', a: art.wisteria.replace('right:120px', 'left:120px').replace('right:40px', 'left:40px'), rtl: true },
  features: { eb: 'Features', t: 'Everything that’s in the journal', s: 'Seven parts, each small. Start anywhere.', a: art.img('daisy-midday') },
  'feature-plan-and-today': { eb: 'Features · Plan & Today', t: 'A plan you can finish', s: 'Plan my day, the Top 3, the NOW slip.', a: art.phone('plan') },
  'feature-calendar': { eb: 'Features · Calendar', t: 'A calendar that’s yours', s: 'Time blocks, 15-minute steps, made for thumbs.', a: art.desk },
  'feature-capture': { eb: 'Features · Capture', t: 'Get it out of your head', s: 'Type it, say it, or share it from any app.', a: art.phone('voice') },
  'feature-rituals': { eb: 'Features · Rituals', t: 'Small rituals at both ends of the day', s: 'Plan my day, Shut down, routines and streaks.', a: art.phone('shutdown') },
  'feature-journal': { eb: 'Features · Journal', t: 'Write the day down', s: 'A journal, a library, and a herbarium.', a: art.img('hydrangea-medium') },
  'feature-people': { eb: 'Features · People', t: 'The people you care about', s: 'Birthdays, the last time you spoke, and notes.', a: art.img('cherry-bloom', 300) },
  'feature-apps': { eb: 'Features · Apps', t: 'One garden, three doors', s: 'Web, Android and Windows, synced.', a: art.phone('today') },
  paper: { eb: 'Paper people', t: 'For people who think on paper', s: 'The Notebook page and Paper capture · coming soon', a: art.img('tools-pen', 420) },
  integrations: { eb: 'Integrations & imports', t: 'Bring what you have', s: 'Akiflow, Todoist, TickTick, Notion, Obsidian and more.', a: art.img('vine-leaf-right', 220) },
  compare: { eb: 'Compare', t: 'Kai’s Flow, next to the others', s: 'Honest about what it doesn’t do yet.', a: art.img('clover-four_leaf', 300) },
  'field-notes': { eb: `Field notes · ${shortDate(r0.date)}`, t: `${r0.v}: ${r0.title.charAt(0).toLowerCase() + r0.title.slice(1)}`, s: `${r0.lines.length} small changes`, a: art.img('hydrangea-light') },
  growing: { eb: 'What’s growing', t: 'The roadmap, as a garden', s: 'Now · Next · Later', a: art.img('cherry-bud', 160) },
  guides: { eb: 'Guides', t: 'How can we help?', s: 'Install, import, capture, gestures and more.', a: art.img('fern-unfurl1', 200) },
  download: { eb: 'Download', t: 'Get Kai’s Flow', s: `Web, Android and Windows · ${LATEST.tag}`, a: art.wisteria },
  privacy: { eb: 'Privacy policy', t: 'What happens to your days', s: 'No ads, no tracking, no selling data.', a: art.img('seal-intact', 260) },
  terms: { eb: 'Terms', t: 'The short terms', s: 'Five things, on one page.', a: art.img('vine-leaf-right', 220) },
  about: { eb: 'About', t: 'Why I built this', s: 'Built by one student, for himself first.', a: art.img('clover-seedling', 200) },
  press: { eb: 'Press kit', t: 'Everything you need to write about it', s: 'The mark, colours, type and screenshots.', a: art.img('cherry-bloom', 300) },
  ...Object.fromEntries(GUIDES.map((g) => [`guide-${g.slug}`, { eb: 'Guides', t: g.title, s: `${g.min} minutes · ${g.blurb}`, a: g.slug === 'install-android' ? art.phone('today') : art.img(g.slug === 'install-windows' ? 'fern-coil' : 'fern-unfurl2', 180) }])),
}

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
const shot = async (html, file, clip, transparent = false) => {
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return page.screenshot({ path: file, clip, omitBackground: transparent })
}
fs.mkdirSync(path.join(PUB, 'og'), { recursive: true })
for (const [key, c] of Object.entries(CARDS)) await shot(card(c), path.join(PUB, 'og', key + '.png'))
console.log('og cards:', Object.keys(CARDS).length)

// ── favicons: below 24 px the K is heavier and has no grain ──
const icoParts = []
for (const n of [16, 32, 48]) {
  await page.setViewportSize({ width: 64, height: 64 })
  const buf = await shot(doc(`<div style="padding:0">${kTile(n, { grain: false, weight: n < 24 ? 600 : 500 })}</div>`, 'body{background:transparent}'), path.join(PUB, `favicon-${n}.png`), { x: 0, y: 0, width: n, height: n }, true)
  icoParts.push([n, buf])
}
fs.rmSync(path.join(PUB, 'favicon-48.png'))
// favicon.ico = a directory of PNGs (Windows Vista+ and every browser read PNG-in-ICO)
const head = Buffer.alloc(6 + 16 * icoParts.length)
head.writeUInt16LE(1, 2); head.writeUInt16LE(icoParts.length, 4)
let off = head.length
icoParts.forEach(([n, b], i) => { const e = 6 + 16 * i; head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length })
fs.writeFileSync(path.join(PUB, 'favicon.ico'), Buffer.concat([head, ...icoParts.map((p) => p[1])]))
console.log('favicons: 16, 32, ico')

// ── press kit ──
const files = []
for (const [name, bg] of [['k-mark-light', '#FBF6E9'], ['k-mark-dark', '#211D30']]) {
  await page.setViewportSize({ width: 1024, height: 1024 })
  files.push([`${name}-1024.png`, await shot(doc(`<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;background:${bg}">${kTile(720)}</div>`), path.join(DIST, 'tmp.png'), { x: 0, y: 0, width: 1024, height: 1024 })])
}
const SHOTS = [['today', 'today-phone'], ['plan', 'plan-my-day-phone'], ['calendar-phone', 'calendar-phone'], ['voice', 'capture-by-voice-phone'], ['shutdown', 'shut-down-phone'], ['calendar-week', 'week-calendar-desktop']]
const ctx2 = await browser.newContext({ deviceScaleFactor: 2 })
const p2 = await ctx2.newPage()
for (const [s, name] of SHOTS) {
  const [w, h] = s === 'calendar-week' ? [1440, 900] : [390, 844]
  await p2.setViewportSize({ width: w + 48, height: h + 48 })
  await p2.setContent(doc(`<div style="padding:24px"><div class="screen${s === 'calendar-week' ? ' desk' : ''}" style="--s:1"><div class="screen-in">${screenHtml(s)}</div></div></div>`, 'body{background:transparent}'), { waitUntil: 'networkidle' })
  await p2.evaluate(() => document.fonts.ready)
  files.push([`screenshots/${name}.png`, await p2.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w + 48, height: h + 48 } })])
}
fs.rmSync(path.join(DIST, 'tmp.png'), { force: true })
files.push(['README.txt', Buffer.from(`Kai's Flow — press kit

Kai's Flow is a free personal planner that looks and feels like a 19th-century botanical field journal.
It brings tasks, time blocks, habits and a journal into one calm page, and works on the web, Android
and Windows. It's made by one student, Kai, who built it for himself first.

Web: https://kais-flow.kaidagoat.workers.dev
Source and releases: https://github.com/khairyKY/kais-flow

The mark: k-mark-light-1024.png and k-mark-dark-1024.png. Please don't recolour the K or the paper.
Colours: Linen #EFE9DB · Parchment #FBF6E9 · Bark ink #2A2420 · Terra ink #9C5139 · Sage #8A9A7E ·
         Lavender #A8A0BE · Hydrangea #9AB4BE · Blossom #D4A8B0
Type: Source Serif 4 (headings and the page) · Inter Tight (interface) · Courier Prime (captions and
      times) · Caveat (notes in the margin) — all free on Google Fonts.
Screenshots: screenshots/*.png, drawn from the app's own screens with sample data.
`)])
// a small zip writer (deflate from zlib) — no dependency for one file
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const locals = [], centrals = []
let at = 0
for (const [name, data] of files) {
  const z = zlib.deflateRawSync(data, { level: 9 }), n = Buffer.from('kais-flow-press-kit/' + name), crc = crc32(data)
  const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(z.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26)
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(at, 42)
  locals.push(l, n, z); centrals.push(c, n); at += 30 + n.length + z.length
}
const cd = Buffer.concat(centrals), end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16)
fs.mkdirSync(path.join(PUB, 'press'), { recursive: true })
fs.writeFileSync(path.join(PUB, 'press/kais-flow-press-kit.zip'), Buffer.concat([...locals, cd, end]))
console.log('press kit:', files.length, 'files')

await browser.close()
server.close()
