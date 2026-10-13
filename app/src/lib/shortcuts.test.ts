import { describe, expect, it } from 'vitest'
import { INBOX_KEYS, INBOX_SHORTCUTS, splitKeyCombo } from './shortcuts'

describe('splitKeyCombo (J-17 keycaps)', () => {
  it('splits a modifier chord into one cap per key', () => {
    expect(splitKeyCombo('⌘K')).toEqual(['⌘', 'K'])
    expect(splitKeyCombo('⌘/')).toEqual(['⌘', '/'])
  })

  it('keeps a multi-letter key after a modifier whole', () => {
    expect(splitKeyCombo('⌃click')).toEqual(['⌃', 'click'])
  })

  it('splits stacked modifiers', () => {
    expect(splitKeyCombo('⌘⇧P')).toEqual(['⌘', '⇧', 'P'])
  })

  it('leaves plain keys and lone glyphs as a single cap', () => {
    expect(splitKeyCombo('E')).toEqual(['E'])
    expect(splitKeyCombo('SPACE')).toEqual(['SPACE'])
    expect(splitKeyCombo('#')).toEqual(['#'])
    expect(splitKeyCombo('⌘')).toEqual(['⌘'])
  })
})

describe('the cheatsheet’s Inbox section (P7e A31)', () => {
  it('lists every key InboxPage binds, as keycaps', () => {
    const caps = INBOX_SHORTCUTS.flatMap((e) => e.keys)
    expect(Object.keys(INBOX_KEYS).length).toBe(7)
    for (const cap of ['e', 'Space', 'p', 'd', 's', '↵', 'r', 'A']) expect(caps).toContain(cap)
  })
})
