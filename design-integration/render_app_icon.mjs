// Renders App Icons.dc.html "Final — Source Serif K" (master: 256 CSS px, radius 57.6, K 169px Source
// Serif 4 500 in --ink-body #2a2420, paper gradient + top highlight + the DS noise) at any pixel size by
// laying it out at 256 CSS px and scaling with deviceScaleFactor — so every size is the design, scaled.
//   node render.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })

const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`

// shape: 'square' (full bleed) · 'rounded' (22.5% squircle, transparent corners) · 'circle'
// layer: 'all' · 'bg' (paper only) · 'fg' (K only, transparent) — fgScale shrinks the K for
// Android's 108dp adaptive canvas, whose visible part is the inner 72dp.
function page({ shape = 'square', layer = 'all', fgScale = 1 }) {
  const radius = shape === 'rounded' ? '57.6px' : shape === 'circle' ? '50%' : '0'
  const paper = layer !== 'fg'
  const k = layer !== 'bg'
  return `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent}
.i{position:relative;width:256px;height:256px;border-radius:${radius};overflow:hidden;${paper ? 'background:linear-gradient(158deg,#FBF6E9,#EFE9DB 68%,#E7E0CE);' : ''}}
.l{position:absolute;inset:0}
.k{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.k span{font-family:'Source Serif 4';font-weight:500;font-size:${169 * fgScale}px;line-height:1;color:#2a2420}</style></head><body>
<div class="i">
${paper ? `<div class="l" style="background:radial-gradient(120% 92% at 50% -6%,rgba(255,255,255,.5),transparent 56%)"></div>
<div class="l" style="background-image:${NOISE.replace(/"/g, '&quot;')};mix-blend-mode:multiply;opacity:.5"></div>` : ''}
${k ? '<div class="k"><span>K</span></div>' : ''}
</div></body></html>`
}

const browser = await chromium.launch({ channel: 'chrome' })
async function render(name, size, opts) {
  const ctx = await browser.newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: size / 256 })
  const p = await ctx.newPage()
  await p.setContent(page(opts), { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.load("500 100px 'Source Serif 4'"))
  const ok = await p.evaluate(() => document.fonts.check("500 100px 'Source Serif 4'"))
  if (!ok) throw new Error('Source Serif 4 did not load')
  const file = path.join(OUT, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await p.locator('.i').screenshot({ path: file, omitBackground: true })
  await ctx.close()
}

// Masters / web / desktop
await render('master-rounded-1024.png', 1024, { shape: 'rounded' })
await render('web/icon-192.png', 192, { shape: 'rounded' })
await render('web/icon-512.png', 512, { shape: 'rounded' })
await render('web/icon-maskable-512.png', 512, { shape: 'square', fgScale: 0.8 }) // K inside the 80% safe circle
await render('web/apple-touch-icon.png', 180, { shape: 'square' })
await render('web/favicon-48.png', 48, { shape: 'rounded' })

// Android: legacy 48dp (square-rounded + round) and the adaptive 108dp layers, per density.
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, s] of Object.entries(DPI)) {
  await render(`android/mipmap-${d}/ic_launcher.png`, 48 * s, { shape: 'rounded' })
  await render(`android/mipmap-${d}/ic_launcher_round.png`, 48 * s, { shape: 'circle' })
  await render(`android/mipmap-${d}/ic_launcher_foreground.png`, 108 * s, { layer: 'fg', fgScale: 72 / 108 })
  await render(`android/mipmap-${d}/ic_launcher_background.png`, 108 * s, { layer: 'bg' })
}
await browser.close()
console.log('rendered into', OUT)
