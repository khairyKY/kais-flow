// polish-c: pixel diff of two PNGs → bounding box of differing pixels + count.
const fs = require('fs')
const { PNG } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/lib/utilsBundle.js')
const [a, b] = process.argv.slice(2).map((f) => PNG.sync.read(fs.readFileSync(f)))
if (a.width !== b.width || a.height !== b.height) { console.log('size differs', a.width, a.height, b.width, b.height); process.exit(0) }
let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
  const i = (y * a.width + x) * 4
  if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
    n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
}
console.log(n ? `${n} px differ, bbox x ${x0}-${x1}, y ${y0}-${y1}` : 'identical pixels')
// Per horizontal band: how many pixels differ and by how much (max channel delta).
const bands = {}
for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
  const i = (y * a.width + x) * 4
  const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]))
  if (!d) continue
  const k = `y${Math.floor(y / 10) * 10} x${Math.floor(x / 100) * 100}`
  bands[k] = bands[k] ?? { n: 0, max: 0 }
  bands[k].n++; bands[k].max = Math.max(bands[k].max, d)
}
for (const [k, v] of Object.entries(bands)) console.log(`  ${k}: ${v.n} px, max delta ${v.max}`)
