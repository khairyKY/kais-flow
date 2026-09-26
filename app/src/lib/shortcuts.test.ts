import { describe, expect, it } from 'vitest'
import { splitKeyCombo } from './shortcuts'

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
