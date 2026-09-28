import { describe, expect, it } from 'vitest'
import { ICON_NAMES, ICON_SVGS } from './index'

describe('kf icon set', () => {
  it('every named glyph has a file, and every file is named', () => {
    expect(Object.keys(ICON_SVGS).sort()).toEqual([...ICON_NAMES].sort())
  })

  it('stores only the inner markup, without the export metadata', () => {
    for (const name of ICON_NAMES) {
      expect(ICON_SVGS[name]).toMatch(/^<(path|rect|circle)/)
      expect(ICON_SVGS[name]).not.toMatch(/<svg|metadata|c2pa/)
    }
  })
})
