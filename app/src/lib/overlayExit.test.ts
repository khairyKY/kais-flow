import { describe, expect, it } from 'vitest'
import { overlayPhase } from './motion'

// v165-block-click: a press on a block with its popover open closed it, and the click that followed opened it again inside the
// 100 ms exit. The exit flag then stayed true while the popover was open again, so it was drawn fading out (kf-pop--out) for good.
describe('overlayPhase', () => {
  it('open, not exiting: shown, not closing', () => {
    expect(overlayPhase(true, false)).toEqual({ mounted: true, closing: false })
  })
  it('closed, exiting: kept mounted while it plays out', () => {
    expect(overlayPhase(false, true)).toEqual({ mounted: true, closing: true })
  })
  it('closed, not exiting: gone', () => {
    expect(overlayPhase(false, false)).toEqual({ mounted: false, closing: false })
  })
  it('re-opened during the exit (the stuck flag): open, NOT closing', () => {
    expect(overlayPhase(true, true)).toEqual({ mounted: true, closing: false })
  })
})
