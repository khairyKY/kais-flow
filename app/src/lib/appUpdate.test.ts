import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, compareVersions, downloadOrder, inPlainBrowser, installUpdate, nativeVerdict, progressLine, releaseAssetName } from './appUpdate'

const updater = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => updater)

describe('the download bar', () => {
  const win = (standalone: boolean, extra: object = {}) => ({ matchMedia: () => ({ matches: standalone }), navigator: {}, ...extra }) as unknown as Window
  it('shows only in a plain browser tab', () => {
    expect(inPlainBrowser(win(false))).toBe(true)
    expect(inPlainBrowser(win(true))).toBe(false) // the installed PWA
    expect(inPlainBrowser(win(false, { __TAURI_INTERNALS__: {} }))).toBe(false) // the Windows app
    expect(inPlainBrowser(win(false, { navigator: { standalone: true } }))).toBe(false) // iOS home screen
  })
  it("puts the device's own app first", () => {
    expect(downloadOrder('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile')).toEqual(['android', 'windows'])
    expect(downloadOrder('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129')).toEqual(['windows', 'android'])
    expect(downloadOrder('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605')).toEqual(['android', 'windows'])
  })
})

describe('compareVersions', () => {
  it('orders releases numerically, with or without the v', () => {
    expect(compareVersions('v1.0.15', '1.0.14')).toBe(1)
    expect(compareVersions('1.0.9', 'v1.0.10')).toBe(-1)
    expect(compareVersions('v1.2.0', '1.2')).toBe(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })
  it('puts a branch / dev build before the release it leads to', () => {
    expect(compareVersions('0.0.0-dev.abc1234', 'v1.0.14')).toBe(-1)
    expect(compareVersions('1.0.15-rc.1', '1.0.15')).toBe(-1)
  })
})

const release = (tag: string) => ({
  tag_name: tag,
  assets: [
    { name: `kais-flow-${tag}.apk`, browser_download_url: `https://github.com/x/releases/download/${tag}/kais-flow-${tag}.apk` },
    { name: `kais-flow-${tag}-windows-setup.exe`, browser_download_url: `https://github.com/x/releases/download/${tag}/kais-flow-${tag}-windows-setup.exe` },
  ],
})

describe('nativeVerdict', () => {
  it('offers the installer for this platform when the release is newer', () => {
    expect(nativeVerdict(release('v1.0.15'), '1.0.14', 'windows')).toEqual({ kind: 'download', version: 'v1.0.15', url: 'https://github.com/x/releases/download/v1.0.15/kais-flow-v1.0.15-windows-setup.exe' })
    expect(nativeVerdict(release('v1.0.15'), '1.0.14', 'android')).toMatchObject({ kind: 'download', url: expect.stringMatching(/kais-flow-v1\.0\.15\.apk$/) })
  })
  it('says up to date on the same (or a newer local) version', () => {
    expect(nativeVerdict(release('v1.0.14'), '1.0.14', 'android')).toEqual({ kind: 'current', version: 'v1.0.14' })
    expect(nativeVerdict(release('v1.0.14'), '1.0.15', 'windows')).toEqual({ kind: 'current', version: 'v1.0.15' })
  })
  it('names a newer release whose file for this platform is not attached yet', () => {
    expect(nativeVerdict({ tag_name: 'v1.0.15', assets: [] }, '1.0.14', 'android')).toEqual({ kind: 'pending', version: 'v1.0.15' })
  })
  it('hands on the release notes for What’s new', () => {
    expect(nativeVerdict({ ...release('v1.0.22'), body: '- One' }, '1.0.21', 'android')).toMatchObject({ kind: 'download', body: '- One' })
    expect(nativeVerdict({ tag_name: 'v1.0.22', body: '- One', assets: [] }, '1.0.21', 'windows')).toEqual({ kind: 'pending', version: 'v1.0.22', body: '- One' })
  })
  it('names the files the release workflows attach', () => {
    expect(releaseAssetName('v1.0.15', 'android')).toBe('kais-flow-v1.0.15.apk')
    expect(releaseAssetName('v1.0.15', 'windows')).toBe('kais-flow-v1.0.15-windows-setup.exe')
  })
})

describe('the Microsoft Store install', () => {
  afterEach(() => vi.unstubAllGlobals())
  const shell = (store: boolean) => vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: async (cmd: string) => (cmd === 'store_install' ? store : '1.1.6') } })

  it('leaves updates to the Store: no GitHub request, no installer', async () => {
    shell(true)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await checkForUpdate('windows')).toEqual({ kind: 'store', version: 'v1.1.6' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('still checks GitHub for the .exe install', async () => {
    shell(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => release('v1.1.7') })))
    expect(await checkForUpdate('windows')).toMatchObject({ kind: 'download', version: 'v1.1.7' })
  })
})

describe('updating the Windows app in place', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    updater.check.mockReset()
  })
  const page = () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign } })
    return assign
  }
  const url = 'https://github.com/x/releases/download/v1.2.1/kais-flow-v1.2.1-windows-setup.exe'

  it('installs through the updater with a progress line, no browser download', async () => {
    const assign = page()
    type On = (e: { event: string; data?: object }) => void
    const downloadAndInstall = vi.fn(async (on: On) => {
      on({ event: 'Started', data: { contentLength: 4e6 } })
      on({ event: 'Progress', data: { chunkLength: 1e6 } })
      on({ event: 'Finished' })
    })
    updater.check.mockResolvedValue({ downloadAndInstall })
    const lines: string[] = []
    await installUpdate(url, (l) => lines.push(l), 'windows')
    expect(lines).toEqual(['Downloading…', 'Downloading… 25%', 'Installing… Kai’s Flow reopens in a moment'])
    expect(assign).not.toHaveBeenCalled()
  })
  it('falls back to the browser download: no latest.json, nothing newer in it, or a failed install', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cases = [
      () => updater.check.mockRejectedValue(new Error('404 latest.json')),
      () => updater.check.mockResolvedValue(null),
      () => updater.check.mockResolvedValue({ downloadAndInstall: async () => Promise.reject(new Error('bad signature')) }),
    ]
    for (const arrange of cases) {
      const assign = page()
      arrange()
      await installUpdate(url, () => {}, 'windows')
      expect(assign).toHaveBeenCalledWith(url)
    }
  })
  it('leaves Android to the browser download', async () => {
    const assign = page()
    await installUpdate('https://x/kais-flow-v1.2.1.apk', () => {}, 'android')
    expect(updater.check).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('https://x/kais-flow-v1.2.1.apk')
  })
  it('says how far the download is', () => {
    expect(progressLine(0, 8e6)).toBe('Downloading… 0%')
    expect(progressLine(8e6, 8e6)).toBe('Downloading… 100%')
    expect(progressLine(2.5e6, 0)).toBe('Downloading… 2.5 MB') // no size from the server
  })
})
