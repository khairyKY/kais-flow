import { describe, expect, it } from 'vitest'
import { isNativeShell } from './platform'

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
