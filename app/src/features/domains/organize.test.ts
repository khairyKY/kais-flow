import { describe, expect, it } from 'vitest'
import { liveDomains, planDomainMerge } from './organize'

const row = (id: string, domain_id: string | null, extra: Record<string, unknown> = {}) => ({ id, domain_id, ...extra })

describe('merge a domain into another', () => {
  const rows = {
    projects: [row('p1', 'work'), row('p2', 'home')],
    areas: [row('a1', 'work')],
    tasks: [row('t1', 'work', { title: 'keep me' }), row('t2', null), row('t3', 'work', { deleted_at: '2026-10-01' })],
    people: [row('pe1', 'work')],
    routines: [row('r1', 'home')],
    notes: [row('n1', 'work')],
  }

  it('moves everything filed under it — every table, trashed rows too — and nothing else', () => {
    const moves = planDomainMerge('work', 'life', rows)
    expect(moves.map((m) => `${m.table}:${m.before.id}`)).toEqual(['projects:p1', 'areas:a1', 'tasks:t1', 'tasks:t3', 'people:pe1', 'notes:n1'])
    expect(moves.every((m) => m.after.domain_id === 'life')).toBe(true)
  })

  it('keeps the rest of each row, and its prior copy for Undo', () => {
    const t1 = planDomainMerge('work', 'life', rows).find((m) => m.before.id === 't1')!
    expect(t1.after).toEqual({ id: 't1', domain_id: 'life', title: 'keep me' })
    expect(t1.before.domain_id).toBe('work')
  })

  it('into itself, or from an empty domain, moves nothing', () => {
    expect(planDomainMerge('work', 'work', rows)).toEqual([])
    expect(planDomainMerge('empty', 'life', rows)).toEqual([])
  })

  it('tables whose cache never loaded are skipped, not fatal', () => {
    expect(planDomainMerge('work', 'life', { tasks: [row('t1', 'work')] })).toHaveLength(1)
  })
})

describe('delete a domain', () => {
  it('a trashed domain leaves every list; what was in it is not rewritten (it reads as no domain)', () => {
    const domains = [{ id: 'work', deleted_at: '2026-10-06T10:00:00Z' }, { id: 'home', deleted_at: null }, { id: 'life' }]
    expect(liveDomains(domains).map((d) => d.id)).toEqual(['home', 'life'])
  })
})
