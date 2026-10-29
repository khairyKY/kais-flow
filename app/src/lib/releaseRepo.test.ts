import { describe, expect, it } from 'vitest'
import tauriConf from '../../src-tauri/tauri.conf.json?raw'
import installMd from '../../../docs/INSTALL.md?raw'
import releasesSh from '../../../.github/scripts/releases.sh?raw'
// @ts-expect-error an untyped .mjs CI script
import { merge } from '../../../.github/scripts/latest-json.mjs'
import { LATEST_DOWNLOADS, RELEASES_LATEST, RELEASES_REPO } from './appUpdate'

// 2026-10-29: the source repo goes private, so every download, update check and updater manifest must
// point at the public khairyKY/kais-flow-releases (docs/log/2026-10-29-0300-release-move-handoff.md).

/** The source repo in a URL or slug, not followed by "-releases". */
const SOURCE = /khairyKY\/kais-flow(?!-releases)/

const files: Record<string, string> = {
  'app/src-tauri/tauri.conf.json': tauriConf,
  'docs/INSTALL.md': installMd.replace(/[^\n]*actions\/workflows[^\n]*/g, ''), // test builds are Actions artifacts of the source repo: fine
  ...import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../../../site/src/**/*.{mjs,js,json}', '../../../site/tools/render-assets.mjs'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../../../.github/workflows/{release,desktop,android}.yml', '../../../codemagic.yaml'], { query: '?raw', import: 'default', eager: true }),
}

describe('shipped URLs point at the releases repo', () => {
  it('reads every file it guards', () => {
    expect(Object.keys(files).length).toBeGreaterThan(100)
    expect(Object.keys(files).some((f) => f.endsWith('site/src/data.mjs'))).toBe(true)
    expect(Object.keys(files).some((f) => f.endsWith('desktop.yml'))).toBe(true)
  })

  it('no shipped file names the source repo', () => {
    const hits = Object.entries(files).flatMap(([f, text]) => text.split('\n').filter((l) => SOURCE.test(l)).map((l) => `${f}: ${l.trim()}`))
    expect(hits).toEqual([])
  })

  it('the apps, the updater and the CI use kais-flow-releases', () => {
    expect(RELEASES_REPO).toBe('khairyKY/kais-flow-releases')
    expect(RELEASES_LATEST).toBe('https://api.github.com/repos/khairyKY/kais-flow-releases/releases/latest')
    for (const url of Object.values(LATEST_DOWNLOADS)) expect(url).toMatch(/^https:\/\/github\.com\/khairyKY\/kais-flow-releases\/releases\/latest\/download\//)
    expect(JSON.parse(tauriConf).plugins.updater.endpoints).toEqual(['https://github.com/khairyKY/kais-flow-releases/releases/latest/download/latest.json'])
    expect(releasesSh).toMatch(/^RELEASE_REPOS="khairyKY\/kais-flow-releases[ "]/m)
    // latest.json's file URLs: into the primary (releases) repo, never "this" repo.
    for (const [f, text] of Object.entries(files)) if (f.endsWith('.yml')) expect(text, f).not.toMatch(/github\.com\/\$GITHUB_REPOSITORY\/releases/)
  })
})

describe('latest-json.mjs merge', () => {
  const win = { signature: 'w', url: 'https://x/win.exe' }
  const base = { version: '1.6.0', notes: 'n', pub_date: 'd', platforms: { 'windows-x86_64': win } }

  it('adds the Mac entries and keeps Windows (same version)', () => {
    const out = merge(base, 'v1.6.0', [['darwin-aarch64', 'm', 'https://x/mac'], ['darwin-x86_64', 'm', 'https://x/mac']], '')
    expect(out).toEqual({ version: '1.6.0', notes: 'n', pub_date: 'd', platforms: { 'windows-x86_64': win, 'darwin-aarch64': { signature: 'm', url: 'https://x/mac' }, 'darwin-x86_64': { signature: 'm', url: 'https://x/mac' } } })
  })

  it('a re-run Windows build keeps the Mac entries; a new version starts fresh', () => {
    const mac = merge(base, 'v1.6.0', [['darwin-aarch64', 'm', 'u']], '')
    expect(Object.keys(merge(mac, 'v1.6.0', [['windows-x86_64', 'w2', 'u2']], 'notes').platforms).sort()).toEqual(['darwin-aarch64', 'windows-x86_64'])
    const next = merge(mac, 'v1.7.0', [['windows-x86_64', 'w3', 'u3']], 'new', 'now')
    expect(next).toEqual({ version: '1.7.0', notes: 'new', pub_date: 'now', platforms: { 'windows-x86_64': { signature: 'w3', url: 'u3' } } })
  })

  it('a manual run (no tag) merges into the base as is; a missing signature throws', () => {
    expect(merge(base, '', [['darwin-aarch64', 'm', 'u']], '').version).toBe('1.6.0')
    expect(() => merge(base, 'v1.6.0', [['darwin-aarch64', '', 'u']], '')).toThrow()
  })
})
