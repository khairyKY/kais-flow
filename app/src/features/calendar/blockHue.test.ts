import { describe, expect, it } from 'vitest'
import { blockHue } from './blockHue'
import { ACCENT_COLORS } from './formFields'

describe('blockHue', () => {
  it('a swatch is its token, so the night theme redraws it', () => {
    expect(blockHue('#9AB4BE')).toEqual({ c: 'var(--acc-hydrangea)', ink: 'var(--acc-hydrangea-deep)' })
    expect(blockHue('#8a9a7e')).toEqual({ c: 'var(--acc-sage)', ink: 'var(--acc-sage-text)' })
  })
  it('every swatch maps to a token', () => {
    for (const c of ACCENT_COLORS) if (c.value) expect(blockHue(c.value).c).toMatch(/^var\(--acc-/)
  })
  it('any other colour keeps its value, its ink mixed toward the body ink', () => {
    expect(blockHue('#123456')).toEqual({ c: '#123456', ink: 'color-mix(in srgb, #123456 55%, var(--ink-body))' })
  })
})
