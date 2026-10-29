#!/usr/bin/env node
// Third-party notices → public/licenses.txt (Settings › App & updates › Open-source licences).
// Runs as `prebuild` and `predev`, so the file can't go stale; it's generated, not committed.
//
//   JS     the production dependencies in package-lock.json (dev-only entries skipped), each package's own
//          LICENSE / NOTICE / COPYING files from node_modules.
//   Rust   only when Tauri runs the build (TAURI_ENV_PLATFORM is set for beforeBuildCommand) or with --rust:
//          `cargo metadata`, the crates reachable from the app by normal deps (build deps and proc-macros
//          don't ship), each crate's own licence files from the cargo registry.
//   Other  vendored assets (Twemoji) and the Android Gradle deps, as notes.
//
// Identical licence texts print once, with every package that uses it and that package's copyright lines.
// Any GPL / AGPL / LGPL licence is printed as a warning (a proprietary app can't ship those casually).
//
// ponytail: superset by design — every prod dep is listed even if tree-shaking drops it from the bundle.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(APP, 'public', 'licenses.txt')
const NOTICE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i
const COPYRIGHT_LINE = /^\s*(copyright\b|©|\(c\)\s*\d)/i

/** The licence / notice files in one package folder, as text. */
function noticeTexts(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => NOTICE_FILE.test(f) && !/\.(js|ts|rs|json|html)$/i.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
}

function jsPackages() {
  const lock = JSON.parse(readFileSync(join(APP, 'package-lock.json'), 'utf8')).packages
  return Object.entries(lock)
    .filter(([key, p]) => key && !p.dev && !p.devOptional && !p.link)
    .map(([key, p]) => ({ name: p.name ?? key.slice(key.lastIndexOf('node_modules/') + 13), version: p.version, license: p.license ?? 'UNKNOWN', texts: noticeTexts(join(APP, key)) }))
}

function rustPackages() {
  const args = ['metadata', '--format-version', '1', '--manifest-path', join(APP, 'src-tauri', 'Cargo.toml')]
  // The Mac build is one universal .app: Tauri names it `universal-apple-darwin`, which cargo doesn't know,
  // so both of its slices count (--filter-platform repeats).
  const triple = process.env.TAURI_ENV_TARGET_TRIPLE
  const triples = triple === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : triple ? [triple] : []
  for (const t of triples) args.push('--filter-platform', t)
  const meta = JSON.parse(execFileSync('cargo', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))
  const byId = new Map(meta.packages.map((p) => [p.id, p]))
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
  const shipped = new Set()
  const walk = (id) => {
    if (shipped.has(id)) return
    const pkg = byId.get(id)
    if (pkg.targets.every((t) => t.kind.includes('proc-macro'))) return // runs in the compiler only
    shipped.add(id)
    for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind === null)) walk(d.pkg)
  }
  walk(meta.resolve.root)
  return [...shipped]
    .map((id) => byId.get(id))
    .filter((p) => !meta.workspace_members.includes(p.id))
    .map((p) => ({ name: p.name, version: p.version, license: p.license ?? (p.license_file ? 'see file' : 'UNKNOWN'), texts: noticeTexts(dirname(p.manifest_path)) }))
}

/** Packages grouped by identical licence text (copyright lines aside), one block per text. */
function render(pkgs) {
  const groups = new Map()
  const bare = []
  for (const p of pkgs.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!p.texts.length) {
      bare.push(p)
      continue
    }
    for (const text of p.texts) {
      const body = text.split('\n').filter((l) => !COPYRIGHT_LINE.test(l)).join('\n').replace(/\s+/g, ' ').trim()
      const key = createHash('sha1').update(body).digest('hex')
      if (!groups.has(key)) groups.set(key, { text, users: [] })
      const owners = text.split('\n').filter((l) => COPYRIGHT_LINE.test(l) && l.length < 200 && !/[[{<](yyyy|year)/i.test(l)).map((l) => l.trim())
      groups.get(key).users.push(`${p.name} ${p.version} (${p.license})${owners.length ? ` — ${[...new Set(owners)].join(' · ')}` : ''}`)
    }
  }
  const out = []
  for (const g of groups.values()) out.push(`Used by:\n${[...new Set(g.users)].map((u) => `  ${u}`).join('\n')}\n\n${g.text}\n\n${'-'.repeat(40)}\n`)
  if (bare.length) out.push(`No licence file ships inside these packages; each is under the licence named (standard text at https://spdx.org/licenses/):\n${bare.map((p) => `  ${p.name} ${p.version} (${p.license})`).join('\n')}\n`)
  return out.join('\n')
}

const rule = '='.repeat(40)
const js = jsPackages()
const withRust = !!process.env.TAURI_ENV_PLATFORM || process.argv.includes('--rust')
const rust = withRust ? rustPackages() : []

// A GPL-family licence with no alternative is the risk; "MIT OR Apache-2.0 OR LGPL-2.1" lets us pick MIT.
for (const p of [...js, ...rust]) if (/\b(A|L)?GPL/i.test(p.license) && !/ OR |\//i.test(p.license)) console.warn(`licenses: copyleft licence — ${p.name} ${p.version} (${p.license})`)

writeFileSync(
  OUT,
  [
    `Kai's Flow — open-source licences`,
    ``,
    `Kai's Flow is proprietary: Copyright (c) 2026 Khairy Islam Shaheen. All rights reserved.`,
    `It is built with the open-source software below. Each part stays under its own licence, reproduced here.`,
    ``,
    rule,
    `JavaScript packages (every version of the app) — ${js.length}`,
    rule,
    ``,
    render(js),
    rule,
    `Artwork`,
    rule,
    ``,
    `Emoji images (public/emoji): Twemoji, Copyright 2019 Twitter, Inc and other contributors.`,
    `Licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/`,
    ``,
    rule,
    withRust ? `Rust crates (the desktop app) — ${rust.length}` : `Rust crates`,
    rule,
    ``,
    withRust ? render(rust) : `This build carries no Rust code. The Windows and Mac apps' copy of this page lists the crates they are built with.\n`,
    rule,
    `Android`,
    rule,
    ``,
    `The Android app also bundles the native Android libraries the Capacitor packages above pull in at build time`,
    `(AndroidX and Capacitor's own Android code), under the Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0`,
    ``,
  ].join('\n'),
)
console.log(`licenses: ${js.length} JS packages${withRust ? `, ${rust.length} Rust crates` : ''} → public/licenses.txt`)
