// Summarise a Chrome trace: forced layout/style inside input handlers, image decodes, paint/layout totals,
// and dump the screenshot frames (for frame-by-frame review).   node trace.mjs <trace.json> [frameDir]
import fs from 'node:fs'
import path from 'node:path'
const [file, frameDir] = process.argv.slice(2)
const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const ev = raw.traceEvents ?? raw
const names = new Map()
for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
const mains = [...names].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k)
const count = new Map()
for (const e of ev) { const k = `${e.pid}:${e.tid}`; if (mains.includes(k)) count.set(k, (count.get(k) ?? 0) + 1) }
const main = [...count].sort((a, b) => b[1] - a[1])[0][0]
const onMain = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X')
const sum = (n) => onMain.filter((e) => e.name === n).reduce((s, e) => s + (e.dur ?? 0), 0) / 1000
const cnt = (n) => onMain.filter((e) => e.name === n).length
const INPUT = new Set(['mousemove', 'pointermove', 'touchmove', 'dragover', 'pointerrawupdate'])
const handlers = onMain.filter((e) => e.name === 'EventDispatch' && INPUT.has(e.args?.data?.type))
let forcedL = 0, forcedLn = 0, forcedS = 0, forcedSn = 0, handlerMs = 0
const layoutEvs = onMain.filter((e) => e.name === 'Layout')
const styleEvs = onMain.filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles')
for (const h of handlers) {
  handlerMs += h.dur / 1000
  for (const l of layoutEvs) if (l.ts >= h.ts && l.ts < h.ts + h.dur) { forcedL += l.dur / 1000; forcedLn++ }
  for (const s of styleEvs) if (s.ts >= h.ts && s.ts < h.ts + h.dur) { forcedS += s.dur / 1000; forcedSn++ }
}
const decodes = ev.filter((e) => /Decode Image|ImageDecodeTask|Decode LazyPixelRef|DecodeImage/.test(e.name ?? '')).length
const shots = ev.filter((e) => e.name === 'Screenshot' && e.args?.snapshot)
const out = {
  file: path.basename(file),
  inputHandlers: handlers.length, handlerMs: Math.round(handlerMs), forcedLayoutsInHandlers: forcedLn, forcedLayoutMs: Math.round(forcedL), forcedStyleInHandlers: forcedSn, forcedStyleMs: Math.round(forcedS),
  layouts: cnt('Layout'), layoutMs: Math.round(sum('Layout')), styleRecalcs: cnt('UpdateLayoutTree'), styleMs: Math.round(sum('UpdateLayoutTree')),
  paints: cnt('Paint'), paintMs: Math.round(sum('Paint')), prePaintMs: Math.round(sum('PrePaint')), layerizeMs: Math.round(sum('Layerize')),
  imageDecodes: decodes, screenshots: shots.length,
}
console.log(JSON.stringify(out))
if (frameDir && shots.length) {
  fs.mkdirSync(frameDir, { recursive: true })
  const t0 = shots[0].ts
  shots.forEach((s, i) => fs.writeFileSync(path.join(frameDir, `${String(i).padStart(3, '0')}-${Math.round((s.ts - t0) / 1000)}ms.jpg`), Buffer.from(s.args.snapshot, 'base64')))
}
