// Builds the five Übersicht widgets into dist/Kais-Flow/, one standalone folder each (Übersicht loads a widget
// folder on its own, so every index.jsx carries its own copy of src/core.jsx), then the zip:
//   node build.mjs            -> dist/Kais-Flow/... and <out>/Kais-Flow-mac-widgets-1.0.zip (default out: dist/)
//   node build.mjs <outDir>
// esbuild comes from the app's node_modules (cd app && npm ci). JSX is left as JSX: Übersicht compiles it.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const ESBUILD = process.env.ESBUILD ?? path.resolve(root, '..', '..', 'app', 'node_modules', 'esbuild', 'lib', 'main.js')
const esbuild = createRequire(import.meta.url)(ESBUILD)
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'))
const stage = path.join(root, 'dist', 'Kais-Flow')
export const VERSION = '1.0'
export const WIDGETS = { today: 'Today', nownext: 'Now + next', daybar: 'Day bar', goal: 'Goal', next: 'Next' }

fs.rmSync(stage, { recursive: true, force: true })
for (const [kind, title] of Object.entries(WIDGETS)) {
  const dir = path.join(stage, `kais-flow-${kind}.widget`)
  fs.mkdirSync(dir, { recursive: true })
  const entry = `import { makeWidget } from './core.jsx'
const w = makeWidget('${kind}')
export const command = w.command
export const refreshFrequency = w.refreshFrequency
export const className = w.className
export const initialState = w.initialState
export const updateState = w.updateState
export const render = w.render
`
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: path.join(root, 'src'), loader: 'jsx', sourcefile: `kais-flow-${kind}.jsx` },
    bundle: true, format: 'esm', jsx: 'preserve', external: ['uebersicht'], write: false, outfile: path.join(dir, 'index.jsx'),
    charset: 'utf8', legalComments: 'none', treeShaking: true,
  })
  const code = `// Kai's Flow - ${title} (Übersicht widget, Paper on glass). Built from desktop/ubersicht/src; edit kaisflow.config.json, not this file.\n` + res.outputFiles[0].text
  fs.writeFileSync(path.join(dir, 'index.jsx'), code)
}
// text files go out with LF endings, whatever this checkout uses
for (const [from, to] of [['kaisflow.config.example.json', 'kaisflow.config.json'], ['INSTALL.md', 'INSTALL.md']]) {
  fs.writeFileSync(path.join(stage, to), fs.readFileSync(path.join(root, from), 'utf8').split('\r\n').join('\n'))
}

// ---------------------------------------------------------------- the zip: forward slashes, plain 0644 / 0755 modes, fixed dates
const entries = []
const walk = (d, rel) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) { entries.push({ name: r + '/', data: null }); walk(path.join(d, e.name), r) } else entries.push({ name: r, data: fs.readFileSync(path.join(d, e.name)) })
  }
}
entries.push({ name: 'Kais-Flow/', data: null })
walk(stage, 'Kais-Flow')
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 3
const locals = [], central = []
let offset = 0
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8')
  const raw = e.data ?? Buffer.alloc(0)
  const packed = e.data ? zlib.deflateRawSync(raw, { level: 9 }) : raw
  const method = e.data ? 8 : 0, crc = zlib.crc32(raw)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8)
  lh.writeUInt16LE(0, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10)
  ch.writeUInt16LE(0, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(packed.length, 20)
  ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(((e.data ? 0o100644 : 0o040755) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42)
  locals.push(lh, name, packed); central.push(ch, name)
  offset += lh.length + name.length + packed.length
}
const cd = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
fs.mkdirSync(outDir, { recursive: true })
const zipPath = path.join(outDir, `Kais-Flow-mac-widgets-${VERSION}.zip`)
fs.writeFileSync(zipPath, Buffer.concat([...locals, cd, eocd]))
console.log(`${zipPath}\n${entries.filter((e) => e.data).length} files`)
void pathToFileURL
