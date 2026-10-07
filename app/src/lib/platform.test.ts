import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { authLinkOrigin, holdShellChrome, isCapacitorShell, isNativeShell, rgbToHex, syncShellChrome } from './platform'

afterEach(() => vi.restoreAllMocks())

describe('isNativeShell', () => {
  it('is true when the Tauri shell has injected its internals', () => {
    expect(isNativeShell({ __TAURI_INTERNALS__: {} })).toBe(true)
  })
  it('is false in a plain browser window', () => {
    expect(isNativeShell({})).toBe(false)
  })
  it('is false with no window at all (tests, SSR)', () => {
    expect(isNativeShell(undefined)).toBe(false)
  })
  it('is true inside the Capacitor shell (the Android APK)', () => {
    expect(isCapacitorShell()).toBe(false)
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    expect(isCapacitorShell()).toBe(true)
    expect(isNativeShell({})).toBe(true)
  })
})

describe('rgbToHex', () => {
  it('turns computed colours into #rrggbb', () => {
    expect(rgbToHex('rgb(239, 233, 219)')).toBe('#efe9db')
    expect(rgbToHex('rgba(31, 29, 43, 1)')).toBe('#1f1d2b')
    expect(rgbToHex('rgb(0 0 0)')).toBe('#000000')
  })
  it('refuses what it cannot read', () => {
    expect(rgbToHex('transparent')).toBeNull()
    expect(rgbToHex('')).toBeNull()
  })
})

describe('syncShellChrome', () => {
  function fakeWindow(bridge?: { setChrome: (c: string, l: boolean) => void }) {
    return {
      KaisFlowShell: bridge,
      document: { body: {} },
      getComputedStyle: () => ({ backgroundColor: 'rgb(31, 29, 43)' }),
    } as unknown as Window
  }
  it('reports the page colour and icon tone to the Android shell', () => {
    const calls: [string, boolean][] = []
    syncShellChrome('night', fakeWindow({ setChrome: (c, l) => calls.push([c, l]) }))
    syncShellChrome('day', fakeWindow({ setChrome: (c, l) => calls.push([c, l]) }))
    expect(calls).toEqual([['#1f1d2b', false], ['#1f1d2b', true]])
  })
  it('does nothing outside the shell', () => {
    expect(() => syncShellChrome('day', fakeWindow(undefined))).not.toThrow()
    expect(() => syncShellChrome('day', undefined)).not.toThrow()
  })
})

describe('holdShellChrome', () => {
  const sheet = {} as Element
  function fakeWindow(calls: [string, boolean][]) {
    return {
      KaisFlowShell: { setChrome: (c: string, l: boolean) => calls.push([c, l]) },
      document: { body: {}, documentElement: { dataset: { theme: 'day' } } },
      getComputedStyle: (el: unknown) => ({ backgroundColor: el === sheet ? 'rgb(251, 246, 233)' : 'rgb(239, 233, 219)' }),
    } as unknown as Window
  }
  it('paints the strips the sheet colour while sheets are up, the page colour after the last', () => {
    const calls: [string, boolean][] = []
    const w = fakeWindow(calls)
    const first = holdShellChrome(sheet, w)
    const second = holdShellChrome(sheet, w) // a sheet opened from a sheet
    second()
    expect(calls).toEqual([['#fbf6e9', true], ['#fbf6e9', true]]) // still up: no hand-back yet
    first()
    expect(calls.at(-1)).toEqual(['#efe9db', true])
  })
  it('does nothing outside the shell', () => {
    expect(() => holdShellChrome(sheet, {} as Window)()).not.toThrow()
    expect(() => holdShellChrome(sheet, undefined)()).not.toThrow()
  })
})

describe('authLinkOrigin', () => {
  const browser = { location: { origin: 'https://kais-flow.example' } } as unknown as Window
  const shell = { __TAURI_INTERNALS__: {}, location: { origin: 'https://tauri.localhost' } } as unknown as Window
  it('uses the page origin in a browser', () => {
    expect(authLinkOrigin({ VITE_PUBLIC_APP_URL: 'https://public.example' }, browser)).toBe('https://kais-flow.example')
  })
  it('sends emailed links to the public web app from inside the native shell', () => {
    expect(authLinkOrigin({ VITE_PUBLIC_APP_URL: 'https://public.example/' }, shell)).toBe('https://public.example')
  })
  it('falls back to the page origin when no public URL was built in', () => {
    expect(authLinkOrigin({}, shell)).toBe('https://tauri.localhost')
  })
})
