import { describe, expect, it } from 'vitest'
import { idPhase, resist, RESIST_MAX, stackMove } from './motion'

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

describe('stackMove (Motion 2b / 3a — which way a navigation goes on the stack)', () => {
  it('drilling into a detail pushes, from its list or from anywhere', () => {
    expect(stackMove('/projects', '/projects/p1', 'PUSH', false)).toBe('push')
    expect(stackMove('/today', '/tasks/t1', 'PUSH', false)).toBe('push')
    expect(stackMove('/settings', '/settings/import', 'PUSH', false)).toBe('push')
    expect(stackMove('/projects/p1', '/tasks/t1', 'PUSH', false)).toBe('push') // a detail on a detail
  })

  it("the detail's own back link pops; a sidebar jump elsewhere is a plain cut", () => {
    expect(stackMove('/projects/p1', '/projects', 'PUSH', false)).toBe('pop')
    expect(stackMove('/people/x', '/people', 'PUSH', false)).toBe('pop')
    expect(stackMove('/projects/p1', '/inbox', 'PUSH', false)).toBeNull()
  })

  it("the browser's Back pops off a detail wherever it was opened from; Forward pushes again", () => {
    expect(stackMove('/tasks/t1', '/today', 'POP', true)).toBe('pop')
    expect(stackMove('/tasks/t1', '/projects/p1', 'POP', true)).toBe('pop')
    expect(stackMove('/today', '/tasks/t1', 'POP', false)).toBe('push')
  })

  it('Back INTO a detail, list to list, the same page and a replace are not stack moves', () => {
    expect(stackMove('/inbox', '/projects/p1', 'POP', true)).toBeNull()
    expect(stackMove('/today', '/inbox', 'PUSH', false)).toBeNull()
    expect(stackMove('/tasks', '/tasks', 'PUSH', false)).toBeNull()
    expect(stackMove('/tasks', '/tasks/t1', 'REPLACE', false)).toBeNull()
  })
})

describe('resist (Effects 2k — boundary resistance)', () => {
  it('follows the finger at a third of the distance, either way', () => {
    expect(resist(0)).toBe(0)
    expect(resist(30)).toBeCloseTo(9.9)
    expect(resist(-30)).toBeCloseTo(-9.9)
  })

  it('never pulls past 40px, and only ever grows with the pull', () => {
    expect(resist(1000)).toBe(RESIST_MAX)
    expect(resist(-1000)).toBe(-RESIST_MAX)
    let prev = 0
    for (let d = 0; d <= 300; d += 5) {
      expect(resist(d)).toBeGreaterThanOrEqual(prev)
      prev = resist(d)
    }
  })
})
