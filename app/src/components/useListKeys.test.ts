import { describe, expect, it } from 'vitest'
import { isSelectAllKey } from './useListKeys'

// The Ctrl+A guard every task list goes through (Kai 2026-10-07: "Ctrl+A isn't working for tasks").
const body = { tagName: 'BODY', closest: () => null }
const field = (value: string, inOverlay = false) => ({ tagName: 'INPUT', value, closest: () => (inOverlay ? {} : null) })
const key = (over: Omit<Partial<KeyboardEvent>, 'target'> & { target?: unknown } = {}) =>
  ({ key: 'a', code: 'KeyA', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: body, ...over }) as unknown as KeyboardEvent

describe('isSelectAllKey', () => {
  it('Ctrl+A and Cmd+A on the page select the list', () => {
    expect(isSelectAllKey(key())).toBe(true)
    expect(isSelectAllKey(key({ ctrlKey: false, metaKey: true }))).toBe(true)
    expect(isSelectAllKey(key({ key: 'A' }))).toBe(true) // Caps Lock
  })
  it('an Arabic layout (key ش, code KeyA) still counts; a Latin letter on the A key (AZERTY q) does not', () => {
    expect(isSelectAllKey(key({ key: 'ش' }))).toBe(true)
    expect(isSelectAllKey(key({ key: 'q', code: 'KeyA' }))).toBe(false)
    expect(isSelectAllKey(key({ key: 'a', code: 'KeyQ' }))).toBe(true) // AZERTY's a
  })
  it('a plain a, Ctrl+Shift+A and Ctrl+Alt+A are not select-all', () => {
    expect(isSelectAllKey(key({ ctrlKey: false }))).toBe(false)
    expect(isSelectAllKey(key({ shiftKey: true }))).toBe(false)
    expect(isSelectAllKey(key({ altKey: true }))).toBe(false)
    expect(isSelectAllKey(key({ key: 'k', code: 'KeyK' }))).toBe(false)
  })
  it('a field with text keeps the browser select-all; an empty one (quick add after Enter) hands it to the list', () => {
    expect(isSelectAllKey(key({ target: field('half a title') }))).toBe(false)
    expect(isSelectAllKey(key({ target: field('') }))).toBe(true)
    expect(isSelectAllKey(key({ target: { tagName: 'TEXTAREA', value: 'notes', closest: () => null } }))).toBe(false)
    expect(isSelectAllKey(key({ target: { tagName: 'DIV', isContentEditable: true, textContent: 'x', closest: () => null } }))).toBe(false)
  })
  it('an empty field in an overlay (command bar, picker search) never selects the list behind it', () => {
    expect(isSelectAllKey(key({ target: field('', true) }))).toBe(false)
  })
})
