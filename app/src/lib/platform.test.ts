import { describe, expect, it } from 'vitest'
import { isNativeShell, rgbToHex, syncShellChrome } from './platform'

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
