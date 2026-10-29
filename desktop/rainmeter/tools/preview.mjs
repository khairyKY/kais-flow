// Renders the five widgets to PNG the way the .ini files and widget.lua lay them out: skin.mjs runs the real
// widget.lua on the sample feed, and this page draws every visible meter at its X/Y/W/H with its fonts, shapes
// and images (String / Shape / Image, containers, InlineSettings, ClipString), on a wallpaper whose blurred copy
// is made the way make-backdrop.ps1 makes Kai's. Text heights the Lua asks for (GetH) are measured in a first pass.
//   FENGARI=<fengari> node preview.mjs <outDir> [walls dir] [playwright-core index.mjs] [design html]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { RES, KAI_RES, WIDGETS, runSkin, finalMeters, readSkin } from './skin.mjs'

const out = path.resolve(process.argv[2] ?? 'preview')
const walls = process.argv[3] ?? 'D:/Coding/kais-flow/design-export/desktop-widgets/walls'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const DESIGN = process.argv[5] ?? 'D:/Coding/kais-flow/design-export/Desktop widgets.html'
const work = path.join(out, '.work')
fs.mkdirSync(work, { recursive: true })
const sample = fs.readFileSync(path.join(RES, 'KaisFlow', 'sample-feed.json'), 'utf8')
const url = (p) => pathToFileURL(p).href

// the wallpaper, and its blurred copy as make-backdrop.ps1 makes it
for (const w of ['bloom-light', 'bloom-dark']) {
  const src = path.join(walls, `${w}.jpg`)
  if (!fs.existsSync(path.join(work, `${w}-backdrop.png`))) {
    execFileSync('magick', [src, '-resize', '1920x1080!', path.join(work, `${w}.png`)])
    execFileSync('magick', [src, '-resize', '1920x1080!', '-resize', '25%', '-blur', '0x9', '-resize', '1920x1080!', '-modulate', '120,150', path.join(work, `${w}-backdrop.png`)])
  }
}

const SCENES = {
  day: { wall: 'bloom-light', say: 'Day, 2:00 pm, the sample feed' },
  night: { wall: 'bloom-dark', vars: { NightFrom: '0', NightTo: '0' }, say: 'Night Garden colours (same data)' },
  ticked: { wall: 'bloom-light', steps: ["Tick('GoalCb')", "Tick('Row1Cb')"], goalSteps: ["Tick('GoalCb')"], say: 'Goal + Call Omar ticked: the bud blooms' },
  hover: { wall: 'bloom-light', steps: ["Over('Row3Bg')"], goalSteps: ["Over('GoalCard')"], say: 'Hovering a task row (and the 1x1 goal)' },
  setup: { wall: 'bloom-light', body: null, say: 'Before a link is added' },
}

function run(widget, scene, heights) {
  const steps = widget === 'Goal' && scene.goalSteps ? scene.goalSteps : widget === 'Today' ? scene.steps ?? [] : []
  if (scene.body === null) return runSkin(widget, { vars: scene.vars, heights })
  return runSkin(widget, { body: sample, feedURL: 'sample', vars: scene.vars, heights, steps: ['Parse()', ...steps] })
}

// ---------------------------------------------------------------- one widget's meters as HTML
const col = (c) => {
  const [r, g, b, a = 255] = String(c).split(',').map(Number)
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
}
const nums = (s) => s.split(',').map((x) => parseFloat(x))

function grad(id, def) {
  const [ang, ...stops] = def.split('|').map((x) => x.trim())
  const a = (parseFloat(ang) * Math.PI) / 180, cx = Math.cos(a) / 2, cy = Math.sin(a) / 2
  return `<linearGradient id="${id}" x1="${0.5 - cx}" y1="${0.5 - cy}" x2="${0.5 + cx}" y2="${0.5 + cy}">` +
    stops.map((s) => { const [c, o] = s.split(';').map((x) => x.trim()); return `<stop offset="${o}" stop-color="${col(c)}"/>` }).join('') + '</linearGradient>'
}
let gid = 0
function shapeSvg(o) {
  const keys = Object.keys(o).filter((k) => /^Shape\d*$/.test(k)).sort((a, b) => (+a.slice(5) || 1) - (+b.slice(5) || 1))
  let defs = '', body = ''
  for (const k of keys) {
    const [head, ...mods] = o[k].split('|').map((x) => x.trim())
    const sp = head.indexOf(' ')
    const type = head.slice(0, sp < 0 ? undefined : sp), args = sp < 0 ? '' : head.slice(sp + 1)
    let fill = 'rgba(255,255,255,1)', stroke = 'rgba(0,0,0,1)', sw = 1, extra = ''
    for (const m of mods) {
      const [name, ...rest] = m.split(' ')
      const v = rest.join(' ')
      if (name === 'Fill' || name === 'Stroke') {
        let paint
        if (v.startsWith('Color')) paint = col(v.slice(6))
        else { const id = `g${gid++}`; defs += grad(id, o[v.slice(15)]); paint = `url(#${id})` }
        if (name === 'Fill') fill = paint; else stroke = paint
      } else if (name === 'StrokeWidth') sw = parseFloat(v)
      else if (/Cap$/.test(name)) extra += ' stroke-linecap="round"'
      else if (name === 'StrokeLineJoin') extra += ' stroke-linejoin="round"'
    }
    const paint = `fill="${fill}" stroke="${sw ? stroke : 'none'}" stroke-width="${sw}"${extra}`
    if (type === 'Rectangle') {
      const [x, y, w, h, rx = 0, ry = rx] = nums(args)
      if (w > 0 && h > 0) body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${ry}" ${paint}/>`
    } else if (type === 'Ellipse') {
      const [cx, cy, rx, ry = rx] = nums(args)
      body += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${paint}/>`
    } else if (type === 'Line') {
      const [x1, y1, x2, y2] = nums(args)
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${paint}/>`
    } else if (type === 'Path') {
      const parts = o[args].split('|').map((x) => x.trim())
      const d = 'M' + parts[0] + parts.slice(1).map((p) => ' L' + p.replace(/^LineTo\s+/, '')).join('')
      body += `<path d="${d}" ${paint}/>`
    }
  }
  return `<svg style="position:absolute;overflow:visible" width="1" height="1"><defs>${defs}</defs>${body}</svg>`
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function inline(text, o) {
  const st = [...text].map(() => ({}))
  const chars = [...text]
  for (const n of ['', 2, 3, 4]) {
    const set = o[`InlineSetting${n}`]
    if (!set) continue
    const [kind, ...a] = set.split('|').map((x) => x.trim())
    const re = new RegExp(o[`InlinePattern${n}`] ?? '.*', 'gd')
    // ranges in code points (the regex runs on UTF-16)
    const cp = (i) => [...text.slice(0, i)].length
    for (const m of text.matchAll(re)) {
      const [s, e] = m.indices[1] ?? m.indices[0]
      for (let i = cp(s); i < cp(e); i++) {
        if (kind === 'Weight') st[i].fontWeight = a[0]
        else if (kind === 'Color') st[i].color = col(a[0])
        else if (kind === 'Size') st[i].fontSize = `${(+a[0] * 4) / 3}px`
        else if (kind === 'Strikethrough') st[i].textDecoration = 'line-through'
        else if (kind === 'CharacterSpacing') st[i].letterSpacing = `${a[1]}px`
      }
      if (!m[0]) break
    }
  }
  let html = '', cur = null, buf = ''
  const css = (s) => Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${v}`).join(';')
  chars.forEach((c, i) => {
    const k = css(st[i])
    if (k !== cur) { if (buf) html += cur ? `<span style="${cur}">${esc(buf)}</span>` : esc(buf); buf = ''; cur = k }
    buf += c
  })
  if (buf) html += cur ? `<span style="${cur}">${esc(buf)}</span>` : esc(buf)
  return html
}

function stringDiv(m) {
  const o = m.opts
  const align = (o.StringAlign ?? 'Left').toLowerCase()
  const h = align.startsWith('right') ? 'right' : align.startsWith('center') ? 'center' : 'left'
  const v = align.endsWith('bottom') ? 'bottom' : /.(center)$/.test(align) ? 'center' : 'top'
  const X = +o.X || 0, Y = +o.Y || 0, W = o.W ? +o.W : null, H = o.H ? +o.H : null
  const pad = o.Padding ? nums(o.Padding) : [0, 0, 0, 0]
  const clip = +(o.ClipString ?? 0)
  const style = [
    'position:absolute', `font-family:'${o.FontFace}'`, `font-weight:${o.FontWeight ?? 400}`, `font-size:${(+(o.FontSize ?? 10) * 4) / 3}px`,
    `color:${col(o.FontColor ?? '0,0,0')}`, `text-align:${h}`, 'line-height:normal', 'box-sizing:border-box',
    `padding:${pad[1]}px ${pad[2]}px ${pad[3]}px ${pad[0]}px`, o.SolidColor ? `background:${col(o.SolidColor)}` : '',
    W ? `width:${W}px;white-space:pre-wrap` : 'white-space:pre', clip === 1 ? 'white-space:pre;overflow:hidden;text-overflow:ellipsis' : '',
    H && clip !== 2 ? `height:${H}px;display:flex;align-items:${v === 'center' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start'}` : '',
    `left:${W ? X - (h === 'right' ? W : h === 'center' ? W / 2 : 0) : X}px`, `top:${Y}px`,
    `transform:translate(${!W && h === 'right' ? '-100%' : !W && h === 'center' ? '-50%' : '0'},${v === 'center' ? '-50%' : v === 'bottom' ? '-100%' : '0'})`,
  ].filter(Boolean).join(';')
  const inner = inline(o.Text ?? '', o)
  const body = clip === 1 && H ? `<span style="overflow:hidden;text-overflow:ellipsis;white-space:pre;min-width:0">${inner}</span>` : inner
  return `<div class="str${clip === 2 ? ' clip2' : ''}" data-name="${m.name}" data-maxh="${H ?? o.ClipStringH ?? ''}" data-fixedh="${H ?? ''}" style="${style}">${body}</div>`
}

function imageDiv(o) {
  const src = url(o.ImageName)
  const op = o.ImageAlpha != null ? `opacity:${+o.ImageAlpha / 255};` : ''
  if (o.ImageCrop) {
    const [cx, cy] = nums(o.ImageCrop)
    return `<div style="position:absolute;left:${o.X ?? 0}px;top:${o.Y ?? 0}px;width:${o.W}px;height:${o.H}px;background:url('${src}') -${cx}px -${cy}px no-repeat;${op}"></div>`
  }
  if (o.ImageTiling === '1') return `<div style="position:absolute;left:${o.X ?? 0}px;top:${o.Y ?? 0}px;width:${o.W}px;height:${o.H}px;background:url('${src}');${op}"></div>`
  return `<img style="position:absolute;left:${o.X ?? 0}px;top:${o.Y ?? 0}px;${o.W ? `width:${o.W}px;` : ''}${o.H ? `height:${o.H}px;` : ''}${op}" src="${src}">`
}

function widgetHtml(r, x, y) {
  const meters = finalMeters(r)
  const byName = Object.fromEntries(meters.map((m) => [m.name, m]))
  const draw = (m) => {
    const o = m.opts
    if (m.type === 'String') return stringDiv(m)
    if (m.type === 'Image') return o.ImageName ? imageDiv(o) : ''
    return `<div style="position:absolute;left:${o.X ?? 0}px;top:${o.Y ?? 0}px">${shapeSvg(o)}</div>`
  }
  let html = ''
  for (const m of meters) {
    if (m.hidden || m.opts.Container) continue
    const items = meters.filter((c) => c.opts.Container === m.name && !c.hidden)
    if (items.length) {
      // a container: its content is drawn here, clipped to its rounded rectangle; the container itself isn't drawn
      const [rx, ry, rw, rh, rr] = nums(m.opts.Shape.split('|')[0].replace(/^\w+\s+/, ''))
      html += `<div style="position:absolute;left:${(+m.opts.X || 0) + rx}px;top:${(+m.opts.Y || 0) + ry}px;width:${rw}px;height:${rh}px;border-radius:${rr}px;overflow:hidden">${items.map(draw).join('')}</div>`
      continue
    }
    html += draw(m)
  }
  void byName
  return `<div class="w" data-w="${r.skin.widget}" style="position:absolute;left:${x}px;top:${y}px;width:${r.vars.W}px;height:${r.vars.H}px">${html}</div>`
}

const FONTS = `
@font-face{font-family:'SF Pro Display';src:url('${url(KAI_RES + 'Fonts/SF Pro Display.OTF')}');font-weight:400}
@font-face{font-family:'SF Pro Display';src:url('${url(KAI_RES + 'Fonts/SFPRODISPLAYMEDIUM.OTF')}');font-weight:500}
@font-face{font-family:'SF Pro Display';src:url('${url(KAI_RES + 'Fonts/SFPRODISPLAYBOLD.OTF')}');font-weight:700}
@font-face{font-family:'Source Serif 4';src:url('${url(KAI_RES + 'Fonts/SourceSerif4-var.ttf')}');font-weight:200 900}
@font-face{font-family:'Courier Prime';src:url('${url(RES + 'KaisFlow/Fonts/CourierPrime-Regular.ttf')}')}`

function page(scene, runs) {
  const wall = path.join(work, `${scene.wall}.png`), back = path.join(work, `${scene.wall}-backdrop.png`)
  const ws = runs.map((r) => {
    const s = readSkin(r.skin.widget)
    const x = +s.vars.DefaultX, y = +s.vars.DefaultY
    // GlassBackdrop crops backdrop.png at the skin's place on screen (#CURRENTCONFIGX#, #CURRENTCONFIGY#)
    r.vars.CURRENTCONFIGX = String(x)
    r.vars.CURRENTCONFIGY = String(y)
    r.opt.GlassBackdrop = { ...(r.opt.GlassBackdrop ?? {}), ImageName: back }
    return widgetHtml(r, x, y)
  })
  return `<!doctype html><meta charset="utf-8"><style>${FONTS}
body{margin:0;width:1920px;height:1080px;position:relative;background:url('${url(wall)}');-webkit-font-smoothing:antialiased}
.clip2{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}</style><body>${ws.join('')}
<script>
// ClipString=2: wrap, and clip to whole lines within H / ClipStringH (then report the height, for GetH)
const H = {}
for (const el of document.querySelectorAll('.clip2')) {
  const probe = document.createElement('span'); probe.textContent = 'X'; probe.style.cssText = 'white-space:nowrap'
  el.appendChild(probe); const lh = probe.getBoundingClientRect().height; probe.remove()
  const max = +el.dataset.maxh || 1e9
  el.style.webkitLineClamp = Math.max(1, Math.floor((max + 0.5) / lh))
  if (el.dataset.fixedh) el.style.height = el.dataset.fixedh + 'px'
  const w = el.closest('.w').dataset.w
  ;(H[w] ??= {})[el.dataset.name] = Math.round(el.getBoundingClientRect().height)
}
window.HEIGHTS = H
</script>`
}

const { chromium } = await import(pathToFileURL(PW).href)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const CLIP = { x: 0, y: 0, width: 400, height: 970 }
const report = {}
for (const [name, scene] of Object.entries(SCENES)) {
  let heights = {}
  for (let pass = 0; pass < 2; pass++) {
    const runs = WIDGETS.map((w) => run(w, scene, heights[w]))
    const f = path.join(work, `${name}.html`)
    fs.writeFileSync(f, page(scene, runs))
    await tab.goto(url(f))
    await tab.evaluate(() => document.fonts.ready)
    await tab.waitForTimeout(150)
    heights = await tab.evaluate(() => window.HEIGHTS)
  }
  await tab.screenshot({ path: path.join(out, `${name}.png`), clip: CLIP })
  report[name] = { say: scene.say, heights }
  console.log(`${name}.png  ${scene.say}  GetH: ${JSON.stringify(heights)}`)
}

// the design's own direction B at real size, cropped the same, beside ours
if (fs.existsSync(DESIGN)) {
  for (const t of ['day', 'night']) {
    await tab.goto(url(DESIGN))
    await tab.evaluate(async (t) => {
      if (t === 'night') document.querySelector('[data-theme="night"]').click()
      const desk = document.querySelector('.desk[data-k="B"]')
      document.body.innerHTML = ''
      const wall = document.body.style.getPropertyValue('--wall')
      document.body.style.cssText = 'margin:0;background:none'
      document.body.style.setProperty('--wall', wall)
      desk.style.cssText += ';transform:none;position:absolute;left:0;top:0'
      document.body.appendChild(desk)
      await document.fonts.ready
    }, t)
    await tab.waitForTimeout(300)
    await tab.screenshot({ path: path.join(work, `design-${t}.png`), clip: CLIP })
    execFileSync('magick', [path.join(work, `design-${t}.png`), path.join(out, `${t}.png`), '-background', '#1b1b1b', '-splice', '0x0', '+append', path.join(out, `compare-${t}.png`)])
    console.log(`compare-${t}.png  the design (left) beside the skins (right)`)
  }
}
await browser.close()
fs.rmSync(work, { recursive: true, force: true })
