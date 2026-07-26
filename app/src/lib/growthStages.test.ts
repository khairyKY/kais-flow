import { describe, expect, it } from 'vitest'
import {
  cherryStage,
  daisyColumnStage,
  fernByLength,
  hydrangeaStage,
  vineStage,
  wisteriaStage,
} from './growthStages'

// Boundary values are the whole point — these are the exact numbers two screens
// disagreed on before F2 (drift audit P0 #6/#7).
describe('growth stage thresholds', () => {
  it('hydrangea: zero/1-4/5-19/20+', () => {
    expect(hydrangeaStage(0)).toBe('zero')
    expect(hydrangeaStage(4)).toBe('light')
    expect(hydrangeaStage(5)).toBe('medium')
    expect(hydrangeaStage(19)).toBe('medium')
    expect(hydrangeaStage(20)).toBe('heavy')
  })
  it('vine: lush starts at 30, not 21', () => {
    expect(vineStage(6)).toBe('sprouting')
    expect(vineStage(7)).toBe('flowering')
    expect(vineStage(29)).toBe('flowering')
    expect(vineStage(30)).toBe('lush')
  })
  it('cherry honest against data', () => {
    expect(cherryStage(0, 0)).toBe('bud')
    expect(cherryStage(3, 0)).toBe('opening')
    expect(cherryStage(3, 2)).toBe('bloom')
    expect(cherryStage(0, 5)).toBe('fallen')
  })
  it('daisy: past/future are column states', () => {
    expect(daisyColumnStage(-1, 12)).toBe('past')
    expect(daisyColumnStage(1, 12)).toBe('future')
    expect(daisyColumnStage(0, 10)).toBe('morning')
    expect(daisyColumnStage(0, 12)).toBe('midday')
    expect(daisyColumnStage(0, 17)).toBe('evening')
  })
  it('fern + wisteria buckets', () => {
    expect(fernByLength(49)).toBe('coil')
    expect(fernByLength(300)).toBe('full')
    expect(wisteriaStage(0)).toBe('p0')
    expect(wisteriaStage(33)).toBe('p40')
    expect(wisteriaStage(81)).toBe('p100')
  })
})
