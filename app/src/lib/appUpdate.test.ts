import { describe, expect, it } from 'vitest'
import { compareVersions, nativeVerdict, releaseAssetName } from './appUpdate'

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
