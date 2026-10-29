import { describe, expect, it } from 'vitest'
import { BLOCK_SWATCHES, KIND_HUE, LEGACY_SWATCHES, blockFills, blockHue, contrast, nearestSwatch, rgbOf, swatchValue } from './blockHue'
import { ACCENT_COLORS } from './formFields'

// The tokens' own values and their contrast on the page are docs/log/assets/cal-blocks/verify.mjs's (vitest loads no CSS).
describe('blockHue (palette C)', () => {
  it('a swatch is its token, so the night theme redraws it', () => {
    expect(blockHue('#B59CE3')).toEqual({ c: 'var(--blk-iris)', ink: 'var(--blk-iris-ink)' })
    expect(blockHue('#0d9298')).toEqual({ c: 'var(--blk-tide)', ink: 'var(--blk-tide-ink)' })
  })
  it('the menus offer None and the 16 swatches, every one a token', () => {
    expect(ACCENT_COLORS.map((c) => c.name)).toEqual(['None', ...BLOCK_SWATCHES.map((s) => s.name)])
    expect(BLOCK_SWATCHES).toHaveLength(16)
    for (const c of ACCENT_COLORS) if (c.value) expect(blockHue(c.value).c).toMatch(/^var\(--blk-/)
  })
  it('a colour saved before palette C draws as its nearest new swatch', () => {
    const got = Object.fromEntries(LEGACY_SWATCHES.map((v) => [v, nearestSwatch(v).name]))
    expect(got).toEqual({
      '#A8A0BE': 'Iris', '#8A9A7E': 'Moss', '#7A946E': 'Moss', '#B5654A': 'Rust', '#D4A8B0': 'Rose',
      '#9AB4BE': 'Lagoon', '#D4C78A': 'Ochre', '#C9A0A0': 'Rose', '#C9A55A': 'Ochre',
    })
    expect(blockHue('#9AB4BE')).toEqual(blockHue(nearestSwatch('#9AB4BE').value))
    expect(swatchValue('#9ab4be')).toBe(nearestSwatch('#9AB4BE').value)
    expect(swatchValue('#123456')).toBe('#123456')
  })
  it('a custom colour keeps its hex, its text tone worked out to pass AA by day and at night', () => {
    const h = blockHue('#123456')
    expect(h.c).toBe('#123456')
    const m = /color-mix\(in srgb, (#[0-9A-F]{6}), (#[0-9A-F]{6}) var\(--blk-night\)\)/.exec(h.ink)
    expect(m).not.toBeNull()
    for (const [ink, theme] of [[m![1], 'day'], [m![2], 'night']] as const) {
      const worst = Math.min(...blockFills(rgbOf('#123456'), rgbOf(ink), theme).map((f) => contrast(rgbOf(ink), f)))
      expect(worst).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('a block with no colour: a task Iris, an event Rose', () => {
    expect(KIND_HUE.task.c).toBe('var(--blk-iris)')
    expect(KIND_HUE.event.c).toBe('var(--blk-rose)')
  })
})
