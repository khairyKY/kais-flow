import { describe, it, expect } from 'vitest'
import { layoutOverlaps, type OverlapInput } from './overlapLayout'

const H = 3_600_000
const at = (h: number) => Date.UTC(2026, 8, 26) + h * H
const b = (id: string, from: number, to: number): OverlapInput => ({ id, start: at(from), end: at(to) })

describe('layoutOverlaps (CALENDAR.md §6)', () => {
  it('leaves a lone block and back-to-back blocks alone', () => {
    const out = layoutOverlaps([b('a', 7, 8), b('b', 8, 9), b('c', 10, 11)])
    expect(out.size).toBe(0)
  })

  it('overlap (2): earlier start takes the left lane', () => {
    const out = layoutOverlaps([b('late', 9.25, 10), b('early', 9, 10)])
    expect(out.get('early')).toEqual({ kind: 'pair', lane: 0 })
    expect(out.get('late')).toEqual({ kind: 'pair', lane: 1 })
  })

  it('overlap (2): on a start tie the longer block takes the left lane', () => {
    const out = layoutOverlaps([b('short', 11, 11.5), b('long', 11, 12)])
    expect(out.get('long')).toEqual({ kind: 'pair', lane: 0 })
    expect(out.get('short')).toEqual({ kind: 'pair', lane: 1 })
  })

  it('a chain that never has three at once stays a pair and reuses the freed lane', () => {
    // a 9–10, b 9:30–10:30, c 10–11 → c reuses a's lane once a has ended
    const out = layoutOverlaps([b('a', 9, 10), b('b', 9.5, 10.5), b('c', 10, 11)])
    expect(out.get('a')).toEqual({ kind: 'pair', lane: 0 })
    expect(out.get('b')).toEqual({ kind: 'pair', lane: 1 })
    expect(out.get('c')).toEqual({ kind: 'pair', lane: 0 })
  })

  it('three blocks that never meet all at once are still a pair (width follows the widest moment)', () => {
    // standup ends at 11:30 exactly when lunch starts, so lunch reuses standup's lane
    const out = layoutOverlaps([b('review', 11, 12), b('standup', 11, 11.5), b('lunch', 11.5, 12.5), b('solo', 14, 15)])
    expect(out.get('review')).toEqual({ kind: 'pair', lane: 0 })
    expect(out.get('standup')).toEqual({ kind: 'pair', lane: 1 })
    expect(out.get('lunch')).toEqual({ kind: 'pair', lane: 1 })
    expect(out.has('solo')).toBe(false)
  })

  it('stacked (3): three shingle indexes, later on top, nothing hidden', () => {
    const trio = layoutOverlaps([b('x', 9, 10), b('y', 9.25, 10), b('z', 9.5, 10)])
    expect(trio.get('x')).toEqual({ kind: 'stack', lane: 0, hidden: [] })
    expect(trio.get('y')).toEqual({ kind: 'stack', lane: 1, hidden: [] })
    expect(trio.get('z')).toEqual({ kind: 'stack', lane: 2, hidden: [] })
  })

  it('stacked (5): blocks past the third index are hidden under the topmost, which counts them', () => {
    const out = layoutOverlaps([
      b('planning', 9, 10.5),
      b('vendor', 9, 10),
      b('omar', 9.5, 10.5),
      b('budget', 9.5, 10),
      b('interview', 9.75, 10.75),
    ])
    expect(out.get('planning')).toEqual({ kind: 'stack', lane: 0, hidden: [] })
    expect(out.get('vendor')).toEqual({ kind: 'stack', lane: 1, hidden: [] })
    expect(out.get('omar')).toEqual({ kind: 'stack', lane: 2, hidden: ['budget', 'interview'] })
    expect(out.get('budget')).toEqual({ kind: 'hidden', under: 'omar' })
    expect(out.get('interview')).toEqual({ kind: 'hidden', under: 'omar' })
  })

  it('separate clusters are laid out independently (a day of pairs is not one big stack)', () => {
    const out = layoutOverlaps([b('a', 9, 10), b('b', 9, 10), b('c', 9, 10), b('d', 13, 14), b('e', 13.5, 14)])
    expect(out.get('c')?.kind).toBe('stack')
    expect(out.get('d')).toEqual({ kind: 'pair', lane: 0 })
    expect(out.get('e')).toEqual({ kind: 'pair', lane: 1 })
  })

  it('ignores zero-length blocks rather than letting them join a cluster', () => {
    const out = layoutOverlaps([b('a', 9, 10), b('zero', 9.5, 9.5)])
    expect(out.size).toBe(0)
  })
})
