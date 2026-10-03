// Renders the Windows installer's pages (app/src-tauri/installer) from HTML/CSS with system Chrome,
// the same way render_app_icon.mjs renders the icon: lay the page out at its CSS size (576 × 400,
// the client area the installer sizes its window to) and screenshot it at each Windows scale, so
// every bitmap is the design at that DPI rather than a stretched copy.
//
// The bitmaps carry everything static (paper, grain, botanicals, titles, the CTA pill). What has to
// be live in the installer — button and link text, the version and folder lines, the progress bar,
// the toggles — sits in "slots": the grain is lifted (feathered) under each slot so the live control,
// painted flat in the paper's mean colour, lands seamlessly. This file is the one source of the slot rects: it writes
// them to installer/layout.nsh for the NSIS script.
//
//   node design-integration/render_installer.mjs            → installer bitmaps + layout.nsh
//   node design-integration/render_installer.mjs --previews → also docs/log/assets/installer/*.png
//                                                             (pages with the live parts drawn in)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'app/src-tauri/installer')
const PREVIEWS = path.join(ROOT, 'docs/log/assets/installer')
const ASSETS = path.join(ROOT, 'app/public/ds/assets')
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)

// Windows scales we ship native bitmaps for; anything else is resampled at runtime from the next
// larger one (kaisflow.nsh). 150% is Kai's laptop.
const SCALES = [100, 125, 150, 200]
const W = 576
const H = 400

const C = {
  linen: '#EFE9DB', parchment: '#FBF6E9', bone: '#F6F0E1', ink: '#2a2420', muted: '#5f5849',
  faint: '#6A6354', hairline: '#88816E', terraInk: '#9C5139', moss: '#7A946E', track: '#E0D8C2',
  lavenderDeep: '#6a5988', sageText: '#4d6650', hand: '#6c6557',
}
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`
const img = (rel) => `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, rel)).toString('base64')}`

// ── Slots (CSS px in the 576 × 400 client area). Pill = the CTA, drawn in the bitmap; its label is a
// live control centred inside it. Line = a live text line, centred in the rect. Link/toggle = live,
// centred as a group in the rect. Bar = the native progress bar.
const CTA = { x: 160, w: 256, h: 44 }
const pages = {
  welcome: {
    hero: { kind: 'icon', size: 64, y: 36 },
    title: 'Kai’s Flow', titleY: 116, titleSize: 34,
    lead: ['Your days, planned in one quiet place.'], leadY: 166,
    slots: {
      CTA: { ...CTA, y: 212, kind: 'pill', preview: 'Plant it' },
      VER: { x: 88, y: 276, w: 400, h: 16, kind: 'line', preview: 'v1.0.15 · just for you, no admin needed' },
      PATH: { x: 88, y: 294, w: 400, h: 16, kind: 'line', preview: String.raw`C:\Users\khair\AppData\Local\Kai’s Flow` },
      ALT: { x: 188, y: 318, w: 200, h: 22, kind: 'link', preview: 'Install elsewhere…' },
    },
    hand: { text: 'a new leaf', x: 452, y: 340, rot: -6 },
  },
  planting: {
    hero: { kind: 'img', src: 'clover/seedling.png', h: 80, y: 32 },
    title: 'Planting your garden…', titleY: 128, titleSize: 30,
    lead: ['Unpacking Kai’s Flow into your own user folder.', 'It only takes a moment.'], leadY: 176,
    slots: {
      BAR: { x: 160, y: 244, w: 256, h: 6, kind: 'bar', preview: 0.62 },
      STATUS: { x: 88, y: 262, w: 400, h: 16, kind: 'line', preview: 'Planting kais-flow.exe' },
    },
    hand: { text: 'taking root…', x: 448, y: 338, rot: -5 },
  },
  planted: {
    hero: { kind: 'img', src: 'cherry/bloom.png', h: 80, y: 28 },
    title: 'Planted', flower: true, titleY: 124, titleSize: 34,
    lead: ['It’s in your Start menu and on your desktop.', 'Sign in and your garden is right where you left it.'], leadY: 174,
    slots: {
      OPEN: { x: 148, y: 236, w: 280, h: 22, kind: 'toggle', on: true, preview: 'Open Kai’s Flow now' },
      CTA: { ...CTA, y: 274, kind: 'pill', preview: 'Done' },
    },
    hand: { text: 'in bloom', x: 458, y: 346, rot: -6 },
  },
  uproot: {
    hero: { kind: 'img', src: 'daisy/evening.png', h: 84, y: 28 },
    title: 'Uproot Kai’s Flow?', titleY: 128, titleSize: 30,
    lead: ['This removes the app from this PC. Your garden — every task,', 'routine and page — lives in the cloud and stays as it is.'], leadY: 176,
    slots: {
      WIPE: { x: 128, y: 236, w: 320, h: 22, kind: 'toggle', on: false, preview: 'Also forget this PC’s sign-in and cache' },
      CTA: { ...CTA, y: 274, kind: 'pill', preview: 'Uproot' },
      KEEP: { x: 188, y: 330, w: 200, h: 22, kind: 'link', preview: 'Keep it' },
    },
    hand: { text: 'resting', x: 462, y: 346, rot: -6 },
  },
  uprooting: {
    hero: { kind: 'img', src: 'daisy/past.png', h: 84, y: 28 },
    title: 'Uprooting…', titleY: 128, titleSize: 30,
    lead: ['Lifting Kai’s Flow out of this PC.', 'Your garden stays safe in the cloud.'], leadY: 176,
    slots: {
      BAR: { x: 160, y: 244, w: 256, h: 6, kind: 'bar', preview: 0.4 },
      STATUS: { x: 88, y: 262, w: 400, h: 16, kind: 'line', preview: 'Removing shortcuts' },
    },
    hand: { text: 'letting go', x: 452, y: 338, rot: -5 },
  },
  uprooted: {
    hero: { kind: 'img', src: 'fern/coil.png', h: 84, y: 28 },
    title: 'Uprooted', titleY: 128, titleSize: 34,
    lead: ['Kai’s Flow is gone from this PC; your garden is still in the cloud.', 'Plant it again any time and sign in to pick up where you left off.'], leadY: 180,
    slots: {
      CTA: { ...CTA, y: 248, kind: 'pill', preview: 'Close' },
    },
    hand: { text: 'until spring', x: 446, y: 338, rot: -6 },
  },
}

// The app icon, as render_app_icon.mjs draws it (paper gradient, highlight, grain, Source Serif K).
const icon = (s) => `<div style="position:relative;width:${s}px;height:${s}px;border-radius:${s * 0.225}px;overflow:hidden;background:linear-gradient(158deg,#FBF6E9,#EFE9DB 68%,#E7E0CE);box-shadow:0 0 0 1px #e0d8c2,0 1px 2px rgba(60,52,38,.14),0 5px 12px rgba(60,52,38,.08)">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 92% at 50% -6%,rgba(255,255,255,.5),transparent 56%)"></div>
  <div style="position:absolute;inset:0;background-image:${NOISE.replace(/"/g, '&quot;')};mix-blend-mode:multiply;opacity:.5"></div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Source Serif 4';font-weight:500;font-size:${s * 0.66}px;line-height:1;color:${C.ink}">K</div></div>`

const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${C.parchment}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`
const square = (on) => `<div style="width:18px;height:18px;border-radius:5px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? `background:${C.sageText}` : `background:${C.bone};border:1.5px solid ${C.hairline}`}">${on ? checkSvg : ''}</div>`

function html(name, preview) {
  const p = pages[name]
  const slots = Object.values(p.slots)
  const centre = (y, inner, h = 'auto') => `<div style="position:absolute;left:0;right:0;top:${y}px;height:${h};display:flex;justify-content:center">${inner}</div>`
  const hero = p.hero.kind === 'icon' ? centre(p.hero.y, icon(p.hero.size))
    : centre(p.hero.y, `<img src="${img(p.hero.src)}" style="height:${p.hero.h}px;filter:drop-shadow(0 2px 2px rgba(60,52,38,.18))">`)
  // Lift the grain under live slots: a flat patch in the grained paper's mean colour (C.slot, what
  // the live controls paint), feathered so its edge never shows.
  const holes = slots.map((s) => `<div style="position:absolute;left:${s.x - 6}px;top:${s.y - 6}px;width:${s.w + 12}px;height:${s.h + 12}px;background:${C.slot};filter:blur(5px)"></div><div style="position:absolute;left:${s.x - 2}px;top:${s.y - 2}px;width:${s.w + 4}px;height:${s.h + 4}px;background:${C.slot}"></div>`).join('')
  const pills = slots.filter((s) => s.kind === 'pill').map((s) => `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border-radius:${s.h / 2}px;background:${C.terraInk};box-shadow:0 2px 4px rgba(120,60,40,.3)"></div>`).join('')
  const live = !preview ? '' : slots.map((s) => {
    const box = (inner, extra = '') => `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;display:flex;align-items:center;justify-content:center;${extra}">${inner}</div>`
    if (s.kind === 'pill') return box(`<span style="font:600 15px 'Inter Tight';color:${C.parchment}">${s.preview}</span>`)
    if (s.kind === 'line') return box(`<span style="font:400 12px 'Courier Prime';color:${C.faint};white-space:nowrap">${s.preview}</span>`)
    if (s.kind === 'link') return box(`<span style="font:600 13.5px 'Inter Tight';color:${C.lavenderDeep}">${s.preview}</span>`)
    if (s.kind === 'toggle') return box(`${square(s.on)}<span style="font:500 14px 'Inter Tight';color:${C.ink};margin-left:10px">${s.preview}</span>`)
    if (s.kind === 'bar') return `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;background:${C.track}"><div style="width:${s.preview * 100}%;height:100%;background:${C.moss}"></div></div>`
    return ''
  }).join('')
  const lead = p.lead.map((l) => `<div>${l}</div>`).join('')
  const flower = p.flower ? `<span style="color:${C.terraInk};font-size:.62em;margin-left:.28em;position:relative;top:-.32em">✿</span>` : ''
  return `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&family=Inter+Tight:wght@400;500;600&family=Courier+Prime&family=Caveat:wght@500&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${C.linen}}
.page{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${C.linen};color:${C.ink};-webkit-font-smoothing:antialiased}
.l{position:absolute;inset:0}</style></head><body><div class="page">
<img src="${img('fern/full.png')}" style="position:absolute;left:-58px;top:150px;height:330px;opacity:.28;transform:rotate(14deg)">
<img src="${img('fern/unfurl1.png')}" style="position:absolute;right:-30px;top:-46px;height:200px;opacity:.16;transform:rotate(200deg)">
<div class="l" style="background-image:${NOISE.replace(/"/g, '&quot;')};mix-blend-mode:multiply;opacity:.5"></div>
${holes}
${hero}
${centre(p.titleY, `<div style="font-family:'Source Serif 4';font-weight:400;font-size:${p.titleSize}px;line-height:${p.titleSize * 1.2}px;letter-spacing:-0.015em">${p.title}${flower}</div>`)}
${centre(p.leadY, `<div style="font:400 14.5px/22px 'Inter Tight';color:${C.muted};text-align:center">${lead}</div>`)}
<div style="position:absolute;left:${p.hand.x}px;top:${p.hand.y}px;font:500 19px 'Caveat';color:${C.hand};transform:rotate(${p.hand.rot}deg);transform-origin:left;white-space:nowrap">${p.hand.text}</div>
${pills}
${live}
</div></body></html>`
}

// One page per scale, reused for every document (the web fonts load once per scale).
const browser = await chromium.launch({ channel: 'chrome' })
async function shooter(scale) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale / 100 })
  const pg = await ctx.newPage()
  const shoot = async (content, file, clip = { x: 0, y: 0, width: W, height: H }) => {
    await pg.setContent(content, { waitUntil: 'networkidle' })
    const ok = await pg.evaluate(async () => {
      const faces = ['400 30px "Source Serif 4"', '500 30px "Source Serif 4"', '400 14px "Inter Tight"', '500 14px "Inter Tight"', '600 14px "Inter Tight"', '400 12px "Courier Prime"', '500 19px Caveat']
      await Promise.all(faces.map((f) => document.fonts.load(f)))
      return faces.every((f) => document.fonts.check(f))
    })
    if (!ok) throw new Error('web fonts did not load')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Page art ships as JPEG (the paper grain makes PNG ~5x larger); GDI+ decodes it at runtime.
    const jpeg = file.endsWith('.jpg')
    await pg.screenshot({ path: file, clip, type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: 90 } : {}) })
  }
  return { shoot, close: () => ctx.close() }
}

// The grained linen's mean colour: slot patches and the live controls on them paint exactly this.
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 480 } })
  const pg = await ctx.newPage()
  await pg.setContent(`<body style="margin:0;background:${C.linen}"><div style="width:480px;height:480px;background-image:${NOISE.replace(/"/g, '&quot;')};mix-blend-mode:multiply;opacity:.5"></div></body>`)
  const png = (await pg.screenshot()).toString('base64')
  await pg.setContent('<canvas id="c" width="480" height="480"></canvas>')
  C.slot = await pg.evaluate(async (b64) => {
    const im = new Image()
    im.src = `data:image/png;base64,${b64}`
    await im.decode()
    const c = document.getElementById('c').getContext('2d')
    c.drawImage(im, 0, 0)
    const d = c.getImageData(0, 0, 480, 480).data
    const sum = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k]
    return '#' + sum.map((v) => Math.round(v / (d.length / 4)).toString(16).padStart(2, '0')).join('')
  }, png)
  await ctx.close()
}

const previews = process.argv.includes('--previews')
const PAGES_DIR = path.join(OUT, 'pages')
fs.rmSync(PAGES_DIR, { recursive: true, force: true })
for (const scale of SCALES) {
  const { shoot, close } = await shooter(scale)
  for (const name of Object.keys(pages)) await shoot(html(name, false), path.join(PAGES_DIR, `${name}-${scale}.jpg`))
  for (const on of [true, false]) {
    await shoot(`<!doctype html><html><body style="margin:0;background:${C.slot}">${square(on)}</body></html>`,
      path.join(PAGES_DIR, `check-${on ? 'on' : 'off'}-${scale}.png`), { x: 0, y: 0, width: 18, height: 18 })
  }
  if (previews && (scale === 100 || scale === 150)) {
    for (const name of Object.keys(pages)) await shoot(html(name, true), path.join(PREVIEWS, `mock-${name}-${scale}.png`))
  }
  await close()
}
await browser.close()

// layout.nsh — the slot rects, in CSS px; kaisflow.nsh scales them to the window's DPI.
const lines = ['; Generated by design-integration/render_installer.mjs — do not edit; re-run the renderer.',
  `!define KF_W ${W}`, `!define KF_H ${H}`, `!define KF_SLOT_BG 0x${C.slot.slice(1).toUpperCase()} ; the grained linen's mean colour`]
for (const [name, p] of Object.entries(pages)) {
  for (const [slot, s] of Object.entries(p.slots)) lines.push(`!define KF_${name.toUpperCase()}_${slot} "${s.x} ${s.y} ${s.w} ${s.h}"`)
}
fs.writeFileSync(path.join(OUT, 'layout.nsh'), lines.join('\r\n') + '\r\n')
console.log('rendered', Object.keys(pages).length, 'pages ×', SCALES.length, 'scales into', OUT)
