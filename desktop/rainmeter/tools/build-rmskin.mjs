// Packs the widgets as a .rmskin (Rainmeter's installer: a zip holding RMSKIN.ini and Skins\..., then a 16-byte
// footer: the zip's size as int64 LE, a flags byte, "RMSKIN\0" -- what Rainmeter's own Skin Packager writes).
//   node build-rmskin.mjs <out.rmskin>
// MergeSkins=1: the installer adds these files to Kai's Glass folder instead of backing it up and replacing it.
// It ships only Glass\KaisFlow\ and Glass\@Resources\KaisFlow\, so GlassVars.inc, his skins and his saved
// Widget link (link.txt, never packed) are left alone.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const out = path.resolve(process.argv[2] ?? path.join(root, 'KaisFlow.rmskin'))
const VERSION = '1.0'

const RMSKIN = [
  '[rmskin]',
  "Name=Kai's Flow widgets",
  'Author=Kai',
  `Version=${VERSION}`,
  'MinimumRainmeter=4.5.0',
  'MinimumWindows=10.0',
  'MergeSkins=1',
  'LoadType=Skin',
  'Load=Glass\\KaisFlow\\Today\\Today.ini',
  '',
].join('\r\n')

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((e) => (e.isDirectory() ? [path.join(d, e.name) + path.sep, ...walk(path.join(d, e.name))] : [path.join(d, e.name)]))
const SKIP = /(^|[\\/])(link\.txt|\.gitkeep)$/
const entries = [{ name: 'RMSKIN.ini', data: Buffer.from(RMSKIN, 'ascii') }]
for (const top of ['KaisFlow', '@Resources' + path.sep + 'KaisFlow']) {
  const base = path.join(root, 'Glass', top)
  entries.push({ name: `Skins\\Glass\\${top.replace(path.sep, '\\')}\\`, data: null })
  for (const f of walk(base)) {
    if (SKIP.test(f)) continue
    const rel = `Skins\\Glass\\${path.relative(path.join(root, 'Glass'), f).split(path.sep).join('\\')}`
    entries.push(f.endsWith(path.sep) ? { name: rel.endsWith('\\') ? rel : rel + '\\', data: null } : { name: rel, data: fs.readFileSync(f) })
  }
}
// the Skins\ and Skins\Glass\ folders first, as a zip lists parents before children
entries.splice(1, 0, { name: 'Skins\\', data: null }, { name: 'Skins\\Glass\\', data: null }, { name: 'Skins\\Glass\\@Resources\\', data: null })

// ---------------------------------------------------------------- a plain zip (deflate), fixed timestamps
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 29
const locals = [], central = []
let offset = 0
for (const e of entries) {
  const name = Buffer.from(e.name, 'ascii')
  const raw = e.data ?? Buffer.alloc(0)
  const packed = e.data ? zlib.deflateRawSync(raw, { level: 9 }) : raw
  const method = e.data ? 8 : 0
  const crc = zlib.crc32(raw)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8)
  lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(method, 10)
  ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(packed.length, 20)
  ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(e.data ? 0 : 0x10, 38); ch.writeUInt32LE(offset, 42)
  locals.push(lh, name, packed)
  central.push(ch, name)
  offset += lh.length + name.length + packed.length
}
const cd = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
const zip = Buffer.concat([...locals, cd, eocd])

const footer = Buffer.alloc(16)
footer.writeBigInt64LE(BigInt(zip.length), 0)
footer.writeUInt8(0, 8)
footer.write('RMSKIN\0', 9, 'ascii')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, Buffer.concat([zip, footer]))
console.log(`${out}\n${entries.filter((e) => e.data).length} files, ${zip.length + 16} bytes`)
