import { describe, expect, it } from 'vitest'
import { shortcutLabel, readCaptureShortcut } from './captureShortcut'

describe('captureShortcut', () => {
  it('labels each choice for Windows and the Mac', () => {
    expect(shortcutLabel('ctrl-shift-k', false)).toBe('Ctrl+Shift+K')
    expect(shortcutLabel('ctrl-shift-k', true)).toBe('⌘⇧K')
    expect(shortcutLabel('ctrl-alt-k', false)).toBe('Ctrl+Alt+K')
    expect(shortcutLabel('ctrl-alt-k', true)).toBe('⌘⌥K')
    expect(shortcutLabel('ctrl-k', false)).toBe('Ctrl+K')
    expect(shortcutLabel('ctrl-k', true)).toBe('⌘K')
    expect(shortcutLabel('off', true)).toBe('Off')
  })
  it('starts on Ctrl+Shift+K, not the plain Ctrl+K that would take it from every other app', () => {
    expect(readCaptureShortcut()).toBe('ctrl-shift-k')
  })
})
