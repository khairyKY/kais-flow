import { describe, expect, it } from 'vitest'
import { idPhase } from './motion'

describe('idPhase (J-22 per-card animation offset)', () => {
  const ids = [
    'a442d16a-5ec4-4622-96af-b00fd99125e9',
    '418c764e-1a12-486b-9f54-d6023e0665ca',
    '2900abaf-20ba-4199-8c7f-f8d5f5a419e8',
    '5f32a61c-9e55-4f39-9ce7-5dfd8581d66a',
  ]

  it('is stable for the same id', () => {
    for (const id of ids) expect(idPhase(id)).toBe(idPhase(id))
  })

  it('stays inside [0, 1)', () => {
    for (const id of [...ids, '', 'x']) {
      expect(idPhase(id)).toBeGreaterThanOrEqual(0)
      expect(idPhase(id)).toBeLessThan(1)
    }
  })

  it('gives different cards different phases', () => {
    expect(new Set(ids.map(idPhase)).size).toBe(ids.length)
  })
})
