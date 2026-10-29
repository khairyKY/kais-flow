// The Tauri updater's latest.json (tauri.conf.json plugins.updater reads it from the releases repo's
// releases/latest/download/latest.json): this release's entries merged into what the release already has.
// desktop.yml's windows + updater jobs and codemagic.yaml all write it with this, so a Mac build never
// drops the Windows entry and a re-run Windows build never drops the Mac ones.
//
//   TAG=v1.2.3 NOTES="…" node latest-json.mjs <base.json> <out.json> <platform> <file.sig> <url> [<platform> <file.sig> <url> …]
//
// <base.json>: the release's current latest.json (missing or unreadable = none). Prints the platforms
// it wrote. Tested by app/src/lib/releaseRepo.test.ts.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The base's entries are kept when it's for the same version; a different version starts fresh. An
 * empty tag (a manual test run) merges into the base whatever its version. */
export function merge(base, tag, entries, notes, now = new Date().toISOString()) {
  const version = tag ? tag.replace(/^v/, '') : base.version
  const same = base.version === version
  const platforms = same ? { ...base.platforms } : {}
  for (const [platform, signature, url] of entries) {
    if (!signature || !url) throw new Error(`no signature or url for ${platform}`)
    platforms[platform] = { signature, url }
  }
  return { version, notes: notes || (same && base.notes) || `Kai’s Flow v${version}`, pub_date: (same && base.pub_date) || now, platforms }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [basePath, outPath, ...rest] = process.argv.slice(2)
  if (!outPath || rest.length % 3) {
    console.error('usage: latest-json.mjs <base.json> <out.json> (<platform> <file.sig> <url>)…')
    process.exit(2)
  }
  let base = {}
  try {
    base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
  } catch {
    /* no latest.json on the release yet */
  }
  const entries = []
  for (let i = 0; i < rest.length; i += 3) entries.push([rest[i], fs.readFileSync(rest[i + 1], 'utf8').trim(), rest[i + 2]])
  const out = merge(base, process.env.TAG || '', entries, process.env.NOTES || '')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`latest.json ${out.version}: ${Object.keys(out.platforms).join(', ')}`)
}
