import { describe, expect, it } from 'vitest'
import { allowsNativeMenu } from './nativeMenu'

// No DOM here: an element is just its `closest`, a selection just what the guard reads.
const el = (matches: string[]) => ({ closest: (sel: string) => (matches.some((m) => sel.split(',').some((s) => s.trim().startsWith(m))) ? {} : null) }) as unknown as Element
const row = el([])
const noSelection = { isCollapsed: true, containsNode: () => false, toString: () => '' }
const selected = (inside: boolean) => ({ isCollapsed: false, containsNode: () => inside, toString: () => 'Shaheen Website' })

describe('allowsNativeMenu', () => {
  it('blocks the WebView menu on a plain row', () => {
    expect(allowsNativeMenu(row, noSelection)).toBe(false)
  })
  it('keeps cut / copy / paste in text fields', () => {
    expect(allowsNativeMenu(el(['textarea']), noSelection)).toBe(true)
    expect(allowsNativeMenu(el(['input:not']), noSelection)).toBe(true)
    expect(allowsNativeMenu(el(['[contenteditable]']), noSelection)).toBe(true)
  })
  it('keeps Copy over selected text, not elsewhere', () => {
    expect(allowsNativeMenu(row, selected(true))).toBe(true)
    expect(allowsNativeMenu(row, selected(false))).toBe(false)
  })
  it('blocks it with nothing under the pointer', () => {
    expect(allowsNativeMenu(null, noSelection)).toBe(false)
  })
})
