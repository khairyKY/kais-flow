import { describe, expect, it } from 'vitest'
import { starredIds, top3OfToday, top3Tally } from './top3Today'

const ev = (entity_id: string, event_type: string, created_at: string) => ({ entity_id, event_type, created_at })

describe('starredIds', () => {
  it('a task whose latest star event is a star counts', () => {
    expect([...starredIds([ev('a', 'task.starred', '2026-09-25T19:00:00Z')])]).toEqual(['a'])
  })
  it('starred then unstarred does not', () => {
    expect(starredIds([ev('a', 'task.starred', '2026-09-25T19:00:00Z'), ev('a', 'task.unstarred', '2026-09-26T07:00:00Z')]).has('a')).toBe(false)
  })
  it('order of arrival does not matter — the latest by time wins', () => {
    const ids = starredIds([ev('a', 'task.starred', '2026-09-26T08:00:00Z'), ev('a', 'task.unstarred', '2026-09-26T07:00:00Z')])
    expect(ids.has('a')).toBe(true)
  })
  it('no events, no ids', () => {
    expect(starredIds([]).size).toBe(0)
  })
})

describe('top3OfToday / top3Tally', () => {
  const open = (id: string, top3: boolean) => ({ id, top3, completed_at: null })
  const done = (id: string) => ({ id, top3: false, completed_at: '2026-09-26T09:00:00Z' })

  it('starred-now rows and rows finished today while starred, in list order', () => {
    const rows = [open('a', true), done('b'), open('c', false), done('d'), open('e', true)]
    expect(top3OfToday(rows, new Set(['b'])).map((r) => r.id)).toEqual(['a', 'b', 'e'])
  })
  it('an open task with an old star event but no flag is not in the Top 3', () => {
    expect(top3OfToday([open('a', false)], new Set(['a']))).toEqual([])
  })
  it('counts picked and done', () => {
    const top3 = top3OfToday([open('a', true), done('b'), done('c')], new Set(['b', 'c']))
    expect(top3Tally(top3)).toEqual({ picked: 3, done: 2 })
  })
  it('all three finished reads 3/3 — no longer indistinguishable from none picked', () => {
    const top3 = top3OfToday([done('a'), done('b'), done('c')], new Set(['a', 'b', 'c']))
    expect(top3Tally(top3)).toEqual({ picked: 3, done: 3 })
    expect(top3Tally(top3OfToday([done('a')], new Set()))).toEqual({ picked: 0, done: 0 })
  })
})
