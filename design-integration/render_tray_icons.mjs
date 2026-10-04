// Renders the small K marks of design-export/Tray and Notifications.dc.html:
//  - 12a the Windows tray icon: per taskbar theme (light/dark) and size (16/20/24/32 px), one strip
//    of the eight states side by side — normal, focus ¼ ½ ¾ full, needs-you, changes waiting, quiet.
//    The geometry is 12a's own (radius .24N, K .74N, weight 700 below 24px / 600 from 24px with the
//    paper gradient + grain, a 1px edge); the overlays sit inside the tile (the drawing lets them
//    hang ~1.5px over the edge, which a 16px tray slot can't show) and the cut-out ring is a real
//    hole, not a ring in the taskbar colour.
//  - 12h the web-push badge: a 96×96 monochrome K on transparent.
//  - 12f the Android status-bar small icon: a flat white K on transparent, 24dp, inside the 20dp
//    live area, at mdpi…xxxhdpi.
//   node design-integration/render_tray_icons.mjs [repoRoot]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..'))
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)

const FONT = `<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=block" rel="stylesheet">`
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`
const MOON = 'M20 14.8A8.5 8.5 0 0 1 9.2 4 8.5 8.5 0 1 0 20 14.8z'

export const STATES = ['normal', 'focus1', 'focus2', 'focus3', 'focus4', 'needs', 'offline', 'quiet']
export const SIZES = [16, 20, 24, 32]
const THEME = {
  light: { edge: '#b9b09a', sage: '#4d6650', rest: 'rgba(42,36,32,0.2)', terra: '#B5654A', ink: '#2a2420' },
  dark: { edge: 'rgba(255,255,255,0.18)', sage: '#A9C29E', rest: 'rgba(255,255,255,0.28)', terra: '#D8836A', ink: '#EDE6D6' },
}
const DOT = { 16: 6, 20: 8, 24: 9, 32: 12 }

function icon(n, theme, state) {
  const t = THEME[theme]
  const big = n >= 24
  const quiet = state === 'quiet'
  const d = quiet ? n / 2 : DOT[n]
  const ring = quiet ? 0 : Math.max(1.5, 0.06 * n)
  const c = n - d / 2 // overlay centre, inside the tile's bottom-right corner
  const hole = state === 'normal' ? '' : `-webkit-mask:radial-gradient(circle at ${c}px ${c}px,transparent ${d / 2 + ring}px,#000 ${d / 2 + ring + 0.5}px);`
  const tile = `<div style="position:absolute;inset:0;border-radius:${0.24 * n}px;background:${big ? 'linear-gradient(158deg,#FBF6E9,#EFE9DB 68%,#E7E0CE)' : '#F6F0E1'};box-shadow:inset 0 0 0 1px ${t.edge};overflow:hidden;display:flex;align-items:center;justify-content:center;${hole}">
<span style="font-family:'Source Serif 4';font-weight:${big ? 600 : 700};font-size:${0.74 * n}px;line-height:1;color:#2a2420;transform:translateY(${0.02 * n}px)">K</span>
${big ? `<span style="position:absolute;inset:0;background-image:${NOISE.replace(/"/g, '&quot;')};mix-blend-mode:multiply;opacity:.45"></span>` : ''}</div>`
  const at = `position:absolute;right:0;bottom:0;width:${d}px;height:${d}px;border-radius:50%;box-sizing:border-box;`
  let over = ''
  if (state.startsWith('focus')) {
    const p = Number(state.slice(5)) * 25
    over = `<span style="${at}background:conic-gradient(${t.sage} 0 ${p}%, ${t.rest} ${p}% 100%)"></span>`
  } else if (state === 'needs') over = `<span style="${at}background:${t.terra}"></span>`
  else if (state === 'offline') over = `<span style="${at}border:${Math.max(1.5, 0.07 * n)}px solid ${t.ink}"></span>`
  else if (quiet) over = `<span style="${at}display:flex;align-items:center;justify-content:center"><svg width="${0.375 * n}" height="${0.375 * n}" viewBox="0 0 24 24"><path d="${MOON}" fill="${t.ink}"/></svg></span>`
  return `<div style="position:relative;width:${n}px;height:${n}px;flex:none">${tile}${over}</div>`
}

function strip(n, theme) {
  return `<!doctype html><html><head>${FONT}<style>html,body{margin:0;background:transparent}</style></head><body>
<div id="s" style="display:flex;width:${n * STATES.length}px;height:${n}px">${STATES.map((s) => icon(n, theme, s)).join('')}</div></body></html>`
}

// A K silhouette fitted by its real glyph box (canvas measureText), centred in the live area.
function silhouette(px, live, color) {
  return `<!doctype html><html><head>${FONT}<style>html,body{margin:0;background:transparent}</style></head><body>
<canvas id="s" width="${px}" height="${px}"></canvas>
<script>window.draw = () => {
  const c = document.getElementById('s'), g = c.getContext('2d')
  const font = (fs) => "700 " + fs + "px 'Source Serif 4'"
  g.font = font(100)
  const m = g.measureText('K')
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  const k = Math.min(${px * live} / w, ${px * live} / h)
  g.font = font(100 * k)
  const m2 = g.measureText('K')
  const x = (${px} - (m2.actualBoundingBoxLeft + m2.actualBoundingBoxRight)) / 2 + m2.actualBoundingBoxLeft
  const y = (${px} - (m2.actualBoundingBoxAscent + m2.actualBoundingBoxDescent)) / 2 + m2.actualBoundingBoxAscent
  g.fillStyle = '${color}'
  g.fillText('K', x, y)
}</script></body></html>`
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ deviceScaleFactor: 1 })
async function shoot(html, file, { canvas = false } = {}) {
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => Promise.all(['600', '700'].map((w) => document.fonts.load(`${w} 20px 'Source Serif 4'`))))
  if (!(await page.evaluate(() => document.fonts.check("700 20px 'Source Serif 4'")))) throw new Error('Source Serif 4 did not load')
  if (canvas) await page.evaluate(() => window.draw())
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await page.locator('#s').screenshot({ path: file, omitBackground: true })
  console.log('wrote', path.relative(ROOT, file))
}

for (const theme of ['light', 'dark']) for (const n of SIZES) await shoot(strip(n, theme), path.join(ROOT, `app/src-tauri/icons/tray/tray-${theme}-${n}.png`))
await shoot(silhouette(96, 0.86, '#000'), path.join(ROOT, 'app/public/badge-96.png'), { canvas: true })
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [dpi, s] of Object.entries(DPI)) await shoot(silhouette(24 * s, 20 / 24, '#fff'), path.join(ROOT, `app/native/android/res/drawable-${dpi}/ic_stat_kf.png`), { canvas: true })
await browser.close()
