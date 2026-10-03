import { describe, expect, it } from 'vitest'
import { clampSelectLeft, placeAtPointer, placeSelect, SELECT_CHROME, SELECT_EDGE, SELECT_MAX_H, SELECT_TOUCH_ROW_H } from './selectPlacement'

// A 390px phone at the default 125% interface size lays out 312 × 675 layout px.
const PHONE = { width: 312, height: 675 }
const DESKTOP = { width: 1024, height: 640 }

describe('placeSelect', () => {
  it('keeps a popover opened from a right-edge trigger inside the phone screen', () => {
    // e.g. Tasks' sort control: a 90px trigger ending 16px from the right edge
    const p = placeSelect({ left: 206, top: 100, bottom: 130, width: 90 }, PHONE, 5, true)
    expect(p.left + p.minWidth).toBeLessThanOrEqual(PHONE.width - SELECT_EDGE)
    expect(p.left).toBeGreaterThanOrEqual(SELECT_EDGE)
  })

  it('never lets the panel grow past the screen, even with long labels', () => {
    const p = placeSelect({ left: 20, top: 100, bottom: 130, width: 280 }, PHONE, 5, true)
    expect(p.maxWidth).toBeLessThanOrEqual(PHONE.width - 2 * SELECT_EDGE)
    expect(p.minWidth).toBeLessThanOrEqual(p.maxWidth)
  })

  it('leaves a desktop popover where it was: under the trigger, left-aligned, 160–320 wide', () => {
    const p = placeSelect({ left: 400, top: 100, bottom: 130, width: 120 }, DESKTOP, 4, false)
    expect(p).toEqual({ left: 400, top: 134, minWidth: 160, maxWidth: 320, maxHeight: SELECT_MAX_H, touch: false })
  })

  it('asks for 44px rows on a coarse pointer only', () => {
    expect(placeSelect({ left: 20, top: 100, bottom: 130, width: 100 }, PHONE, 3, true).touch).toBe(true)
    expect(placeSelect({ left: 20, top: 100, bottom: 130, width: 100 }, PHONE, 3, false).touch).toBe(false)
  })

  it('opens upward near the bottom of the screen, sized for 44px rows', () => {
    // 5 touch rows = 220 + chrome; only ~40px below the trigger, ~590 above
    const p = placeSelect({ left: 20, top: 600, bottom: 630, width: 100 }, PHONE, 5, true)
    expect(p.top).toBeUndefined()
    expect(p.bottom).toBe(PHONE.height - 600 + 4)
  })

  it('caps the height to the side it opens on, never below one row', () => {
    const tiny = { width: 312, height: 200 }
    const p = placeSelect({ left: 20, top: 80, bottom: 110, width: 100 }, tiny, 12, true)
    expect(p.maxHeight).toBeGreaterThanOrEqual(SELECT_TOUCH_ROW_H + SELECT_CHROME)
    expect(p.maxHeight).toBeLessThanOrEqual(Math.max(80, 200 - 110))
  })
})

describe('clampSelectLeft', () => {
  it('shifts a measured panel back inside the right edge', () => {
    expect(clampSelectLeft(250, 200, 312)).toBe(312 - 200 - SELECT_EDGE)
  })
  it('keeps the left edge margin', () => {
    expect(clampSelectLeft(-20, 100, 312)).toBe(SELECT_EDGE)
  })
  it('leaves a panel that fits alone', () => {
    expect(clampSelectLeft(40, 100, 312)).toBe(40)
  })
})

describe('placeAtPointer', () => {
  // 1280×720 at 150% = 853×480 layout px; QuickCreate is 360 wide.
  const VIEW = { width: 853, height: 480 }
  const SIZE = { width: 360, height: 300 }
  it('opens right of and below the pointer when it fits', () => {
    expect(placeAtPointer({ x: 100, y: 60 }, SIZE, VIEW)).toEqual({ left: 100, top: 60 })
  })
  it('flips to the left of a pointer near the right edge', () => {
    expect(placeAtPointer({ x: 700, y: 60 }, SIZE, VIEW).left).toBe(340)
  })
  it('flips above a pointer near the bottom', () => {
    expect(placeAtPointer({ x: 100, y: 400 }, SIZE, VIEW).top).toBe(100)
  })
  it('shifts inside the window when neither side fits', () => {
    expect(placeAtPointer({ x: 100, y: 240 }, { width: 360, height: 420 }, VIEW).top).toBe(VIEW.height - 420 - SELECT_EDGE)
  })
  it('pins a popover taller than the window to the top edge', () => {
    expect(placeAtPointer({ x: 100, y: 240 }, { width: 360, height: 600 }, VIEW).top).toBe(SELECT_EDGE)
  })
})
