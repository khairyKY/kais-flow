import { describe, expect, it } from 'vitest'
import { orderKey, planListMove, sortByOrder } from './manualOrder'

type Row = { id: string; sort_order?: number | null; due_at: string | null; scheduled_start: string | null }
const row = (id: string, due: string | null = null, sort_order: number | null = null): Row => ({ id, due_at: due, scheduled_start: null, sort_order })

/** Applies a plan's writes and returns the ids in the order the lists would draw them. */
function after(group: Row[], ids: string[], dir: -1 | 1): string[] | null {
  const plan = planListMove(group, new Set(ids), dir)
  if (!plan) return null
  const keys = new Map(plan.map((w) => [w.row.id, w.sort_order]))
  return sortByOrder(group.map((r) => (keys.has(r.id) ? { ...r, sort_order: keys.get(r.id)! } : r))).map((r) => r.id)
}

describe('orderKey / sortByOrder', () => {
  it('a row nobody moved sorts by its date (due, else its block, else last)', () => {
    const rows = [row('undated'), { ...row('block'), scheduled_start: '2026-10-14T08:00:00Z' }, row('due', '2026-10-14T07:00:00Z')]
    expect(sortByOrder(rows).map((r) => r.id)).toEqual(['due', 'block', 'undated'])
  })
  it('a manual order sits on the same scale as the dates', () => {
    const at9 = Date.parse('2026-10-14T09:00:00Z')
    const rows = [row('a', '2026-10-14T08:00:00Z'), row('b', '2026-10-14T10:00:00Z'), row('moved', '2026-10-14T23:00:00Z', at9)]
    expect(sortByOrder(rows).map((r) => r.id)).toEqual(['a', 'moved', 'b'])
  })
  it('a bad date never poisons the sort', () => {
    expect(orderKey(row('x', 'not a date'))).toBe(orderKey(row('y')))
  })
})

describe('planListMove', () => {
  const dated = [row('a', '2026-10-14T06:00:00Z'), row('b', '2026-10-14T07:00:00Z'), row('c', '2026-10-14T08:00:00Z'), row('d', '2026-10-14T09:00:00Z')]

  it('moves one row up or down with ONE write — the midpoint of its new neighbours', () => {
    const up = planListMove(dated, new Set(['c']), -1)!
    expect(up).toHaveLength(1)
    expect(up[0].row.id).toBe('c')
    expect(up[0].sort_order).toBe((Date.parse('2026-10-14T06:00:00Z') + Date.parse('2026-10-14T07:00:00Z')) / 2)
    expect(after(dated, ['c'], -1)).toEqual(['a', 'c', 'b', 'd'])
    expect(after(dated, ['b'], 1)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('at the edge: the first row up / the last row down goes nowhere', () => {
    expect(planListMove(dated, new Set(['a']), -1)).toBeNull()
    expect(planListMove(dated, new Set(['d']), 1)).toBeNull()
    expect(planListMove(dated, new Set(['zzz']), 1)).toBeNull()
  })
  it('to the top / the bottom: a minute past the old end', () => {
    expect(after(dated, ['b'], -1)).toEqual(['b', 'a', 'c', 'd'])
    expect(after(dated, ['c'], 1)).toEqual(['a', 'b', 'd', 'c'])
  })
  it('a selection moves as a block; a block at the edge stays', () => {
    expect(after(dated, ['b', 'c'], -1)).toEqual(['b', 'c', 'a', 'd'])
    expect(after(dated, ['a', 'c'], -1)).toEqual(['a', 'c', 'b', 'd'])
    expect(after(dated, ['b', 'd'], 1)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('rows tied on one date get their own keys the first time one moves — the shorter side only', () => {
    const tied = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) => row(id))
    const plan = planListMove(tied, new Set(['u5']), -1)!
    expect(after(tied, ['u5'], -1)).toEqual(['u1', 'u2', 'u3', 'u5', 'u4', 'u6'])
    expect(plan.length).toBeLessThanOrEqual(3) // u5, u4 and u6 below — not the three above
    // ...and the next move among them is one write again.
    const keys = new Map(plan.map((w) => [w.row.id, w.sort_order]))
    const settled = sortByOrder(tied.map((r) => (keys.has(r.id) ? { ...r, sort_order: keys.get(r.id)! } : r)))
    expect(planListMove(settled, new Set(['u4']), -1)).toHaveLength(1)
  })
  it('no room left between two keys: the run widens instead of colliding', () => {
    const rows = [row('a', null, 1), row('b', null, 1 + Number.EPSILON), row('x', null, 5)]
    expect(after(rows, ['x'], -1)).toEqual(['a', 'x', 'b'])
  })
  it('a long run of the same row going up keeps every key distinct', () => {
    let rows: Row[] = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, '2026-10-14T06:00:00Z'))
    for (let k = 0; k < 200; k++) {
      const id = rows[k % 2 ? 1 : 4].id // ping-pong rows through the middle
      const plan = planListMove(rows, new Set([id]), -1)!
      const keys = new Map(plan.map((w) => [w.row.id, w.sort_order]))
      const want = rows.map((r) => r.id)
      const i = want.indexOf(id)
      want.splice(i - 1, 2, want[i], want[i - 1])
      rows = sortByOrder(rows.map((r) => (keys.has(r.id) ? { ...r, sort_order: keys.get(r.id)! } : r)))
      expect(rows.map((r) => r.id)).toEqual(want)
    }
    const keys = rows.map(orderKey)
    expect(keys.every((k, i) => i === 0 || keys[i - 1] < k)).toBe(true)
  })
})
