// Reads a .rmskin back the way Rainmeter's installer does, and checks it against the source tree:
//   node read-rmskin.mjs <file.rmskin>
// Footer (size int64 LE, flags byte, "RMSKIN\0"), the zip's central directory, every entry inflated and CRC-checked,
// RMSKIN.ini's keys, backslash names, and every packed file byte-equal to its source.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const BS = String.fromCharCode(92)
const here = path.dirname(fileURLToPath(import.meta.url))
const glass = path.resolve(here, '..', 'Glass')
const buf = fs.readFileSync(path.resolve(process.argv[2]))
let bad = 0, n = 0
const ok = (name, good, detail = '') => { n++; if (!good) bad++; console.log(`${good ? 'ok  ' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`) }

const foot = buf.subarray(buf.length - 16)
const zipLen = Number(foot.readBigInt64LE(0))
ok('footer: key RMSKIN + NUL, flags 0', foot.subarray(9).toString('latin1') === 'RMSKIN\0' && foot[8] === 0)
ok("footer: size = the zip's length", zipLen === buf.length - 16, `${zipLen} + 16 = ${buf.length}`)
const zip = buf.subarray(0, zipLen)
const eocd = zip.length - 22
ok('zip ends with an end-of-central-directory record', zip.readUInt32LE(eocd) === 0x06054b50)
const count = zip.readUInt16LE(eocd + 10)
let off = zip.readUInt32LE(eocd + 16)
const entries = []
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(off) !== 0x02014b50) { ok('central directory entry ' + i, false); break }
  const method = zip.readUInt16LE(off + 10), crc = zip.readUInt32LE(off + 16), csize = zip.readUInt32LE(off + 20), size = zip.readUInt32LE(off + 24)
  const nlen = zip.readUInt16LE(off + 28), elen = zip.readUInt16LE(off + 30), clen = zip.readUInt16LE(off + 32), lo = zip.readUInt32LE(off + 42)
  const name = zip.subarray(off + 46, off + 46 + nlen).toString('ascii')
  const lnlen = zip.readUInt16LE(lo + 26), lelen = zip.readUInt16LE(lo + 28)
  const data = zip.subarray(lo + 30 + lnlen + lelen, lo + 30 + lnlen + lelen + csize)
  entries.push({ name, method, crc, size, data: method === 8 ? zlib.inflateRawSync(data) : data })
  off += 46 + nlen + elen + clen
}
ok(`${count} entries read`, entries.length === count)
const files = entries.filter((e) => !e.name.endsWith(BS))
ok('every file inflates to its size and its CRC matches', files.every((e) => e.data.length === e.size && zlib.crc32(e.data) === e.crc))
ok('names use backslashes, none with a forward slash or a drive', entries.every((e) => !e.name.includes('/') && !/^[A-Za-z]:/.test(e.name)))

const ini = Object.fromEntries(files.find((e) => e.name === 'RMSKIN.ini').data.toString('ascii').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
ok('RMSKIN.ini: Version 1.1, MergeSkins 1 (adds to Glass), loads Today, Rainmeter 4.5+',
  ini.Version === '1.1' && ini.MergeSkins === '1' && ini.Load === ['Glass', 'KaisFlow', 'Today', 'Today.ini'].join(BS) && ini.MinimumRainmeter === '4.5.0', JSON.stringify(ini))
ok("RMSKIN.ini: no VariableFiles, no Backup (nothing of Kai's is restored or replaced)", !('VariableFiles' in ini) && !('Backup' in ini))

const body = files.filter((e) => e.name !== 'RMSKIN.ini')
const tops = new Set(body.map((e) => e.name.split(BS).slice(0, 4).join(BS)))
const wantTops = [['Skins', 'Glass', '@Resources', 'KaisFlow'].join(BS), ['Skins', 'Glass', 'KaisFlow'].join(BS)]
ok('only Glass KaisFlow and Glass @Resources KaisFlow are written', [...tops].filter((t) => !wantTops.some((w) => t === w || t.startsWith(w + BS) || w.startsWith(t))).length === 0 && body.every((e) => wantTops.some((w) => e.name.startsWith(w + BS))), [...tops].join(' | '))
const differ = []
for (const e of body) {
  const src = path.join(glass, ...e.name.split(BS).slice(2))
  if (!(fs.existsSync(src) && fs.readFileSync(src).equals(e.data))) differ.push(e.name)
}
ok(`every packed file is byte-equal to its source (${body.length - differ.length} of ${body.length})`, differ.length === 0, differ.join(', '))
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const want = [...walk(path.join(glass, 'KaisFlow')), ...walk(path.join(glass, '@Resources', 'KaisFlow'))]
  .filter((f) => !/link\.txt$/.test(f)).map((f) => ['Skins', 'Glass', ...path.relative(glass, f).split(path.sep)].join(BS)).sort()
ok('and nothing in the source folders is left out', JSON.stringify(want) === JSON.stringify(body.map((e) => e.name).sort()))
const pics = body.map((e) => e.name).filter((x) => /\.(png|jpg|gif)$/i.test(x)).map((x) => x.split(BS).pop()).sort()
ok('the only images are grain.png and tape.png (no flowers)', JSON.stringify(pics) === JSON.stringify(['grain.png', 'tape.png']), pics.join(', '))
ok('no link or theme file inside (so an install cannot overwrite a saved link or theme)', !body.some((e) => /link|theme/i.test(e.name.split(BS).pop())))
const lua = body.find((e) => e.name.endsWith('widget.lua')).data
ok('widget.lua inside is UTF-16 LE with its BOM', lua[0] === 0xff && lua[1] === 0xfe)
console.log(`\n${n - bad} of ${n} ok`)
process.exit(bad ? 1 : 0)
