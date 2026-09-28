import { describe, expect, it } from 'vitest'
import { sheetRelease } from './BottomSheet'

describe('sheetRelease (MK Bottom Sheet drag)', () => {
  const h = 506 // medium at 844

  it('closes past 30% of the sheet, or on a downward fling however short', () => {
    expect(sheetRelease(0.31 * h, 0, h)).toBe('close')
    expect(sheetRelease(20, 0.8, h)).toBe('close')
  })

  it('springs back under 30% without a fling', () => {
    expect(sheetRelease(0.29 * h, 0.1, h)).toBe('down') // from full: drop to the resting detent
    expect(sheetRelease(30, 0.1, h)).toBe('stay')
  })

  it('opens to full when dragged or flung up', () => {
    expect(sheetRelease(-60, 0, h)).toBe('up')
    expect(sheetRelease(-10, -0.9, h)).toBe('up')
  })
})
