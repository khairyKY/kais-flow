// Evidence for the rendered small marks (design-integration/render_tray_icons.mjs): each tray strip
// at 1× on its taskbar and ×4 (pixelated), the badge and the Android small icon — beside the
// drawing's own frames (12a, 12f, 12h) rendered from design-export.
//   node docs/log/assets/tray-notify/icons-sheet.mjs <designFramesDir>
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '../../../..')
const DESIGN = process.argv[2]
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const data = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
const STATES = ['Normal', 'Focus ¼', 'Focus ½', 'Focus ¾', 'Focus full', 'Needs you', 'Changes waiting', 'Quiet hours']

function bar(theme) {
  const bg = theme === 'light' ? '#eeeeee' : '#1f1f1f'
  const fg = theme === 'light' ? '#1a1a1a' : '#eee'
  const rows = [16, 20, 24, 32].map((n) => {
    const src = data(path.join(ROOT, `app/src-tauri/icons/tray/tray-${theme}-${n}.png`))
    const cells = STATES.map((_, i) => `<td><div style="width:${n}px;height:${n}px;background:url(${src}) -${i * n}px 0"></div></td>`).join('')
    const big = STATES.map((_, i) => `<td><div style="width:${n * 4}px;height:${n * 4}px;background:url(${src}) -${i * n * 4}px 0 / ${n * 8 * 4}px ${n * 4}px;image-rendering:pixelated"></div></td>`).join('')
    return `<tr><th>${n}px</th>${cells}</tr><tr><th>×4</th>${big}</tr>`
  })
  return `<div style="background:${bg};color:${fg};padding:16px 20px;border-radius:6px;margin-bottom:14px"><table><tr><th>${theme} taskbar</th>${STATES.map((s) => `<th>${s}</th>`).join('')}</tr>${rows.join('')}</table></div>`
}

const checker = 'background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/12px 12px'
const html = `<!doctype html><html><head><style>body{margin:0;padding:24px;font:12px 'Segoe UI',sans-serif;background:#f4efe3;width:1500px}th{font-weight:400;opacity:.75;text-align:left;padding:4px 10px 4px 0}td{padding:6px 12px 6px 0;vertical-align:middle}
h2{font:500 18px Georgia,serif;margin:18px 0 8px}.row{display:flex;gap:24px;align-items:flex-start}</style></head><body>
<h2>12a · tray icon — this build (render_tray_icons.mjs)</h2>
<div class="row"><div>${bar('light')}${bar('dark')}</div>${DESIGN ? `<div><div style="opacity:.7;margin-bottom:6px">the drawing (12a)</div><img src="${data(path.join(DESIGN, 'design-12a.png'))}" style="width:520px"></div>` : ''}</div>
<h2>12h badge · 96 · monochrome &nbsp;·&nbsp; 12f Android small icon · 24dp (mdpi … xxxhdpi)</h2>
<div class="row">
<div style="${checker};padding:10px"><img src="${data(path.join(ROOT, 'app/public/badge-96.png'))}"></div>
${['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].map((d) => `<div style="background:#1f1f1f;padding:10px;color:#ccc"><img src="${data(path.join(ROOT, `app/native/android/res/drawable-${d}/ic_stat_kf.png`))}"><div>${d}</div></div>`).join('')}
<div style="background:#1f1f1f;padding:10px;color:#ccc"><img src="${data(path.join(ROOT, 'app/native/android/res/drawable-mdpi/ic_stat_kf.png'))}" style="width:96px;image-rendering:pixelated"><div>mdpi ×4</div></div>
${DESIGN ? `<img src="${data(path.join(DESIGN, 'design-12h.png'))}" style="width:420px"><img src="${data(path.join(DESIGN, 'design-12f.png'))}" style="width:300px">` : ''}
</div></body></html>`

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1550, height: 900 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.screenshot({ path: path.join(HERE, 'icons-side-by-side.png'), fullPage: true })
await browser.close()
console.log('wrote icons-side-by-side.png')
