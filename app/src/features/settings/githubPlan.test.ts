import { describe, expect, it } from 'vitest'
// The edge functions' pure GitHub logic — Deno-free on purpose so it can be tested here.
import { parseRepos, planSync, searchQueries, toPayload, type GhIssue, type PendingRow } from '../../../../supabase/functions/_shared/github.ts'

const issue = (n: number, over: Partial<GhIssue> = {}): GhIssue => ({
  node_id: `I_${n}`,
  number: n,
  title: `Issue ${n}`,
  html_url: `https://github.com/acme/app/issues/${n}`,
  repository_url: 'https://api.github.com/repos/acme/app',
  updated_at: '2026-09-27T10:00:00Z',
  labels: [{ name: 'bug' }],
  ...over,
})
const row = (n: number, payload: Record<string, unknown> = {}): PendingRow => ({
  id: `row-${n}`,
  raw_text: `Issue ${n}`,
  payload: { updated_at: '2026-09-27T10:00:00Z', ...payload },
  external_ref: { id: `I_${n}` },
})

describe('parseRepos', () => {
  it('splits, trims and dedupes', () => {
    expect(parseRepos(' acme/app , acme/web,acme/app ')).toEqual(['acme/app', 'acme/web'])
    expect(parseRepos('')).toEqual([])
    expect(parseRepos(undefined)).toEqual([])
  })
  it('rejects anything that is not owner/name, and more than 10', () => {
    expect(parseRepos('acme')).toBeNull()
    expect(parseRepos('acme/app assignee:someone')).toBeNull()
    expect(parseRepos('https://github.com/acme/app')).toBeNull()
    expect(parseRepos(Array.from({ length: 11 }, (_, i) => `a/r${i}`).join(','))).toBeNull()
    expect(parseRepos(42)).toBeNull()
  })
})

describe('searchQueries', () => {
  it('one assignee query plus the repos OR-ed in one query', () => {
    expect(searchQueries('kai', ['acme/app', 'acme/web'])).toEqual([
      'is:open is:issue assignee:kai',
      'is:open is:issue repo:acme/app repo:acme/web',
    ])
  })
  it('splits repo terms to stay within 256 chars', () => {
    const long = Array.from({ length: 10 }, (_, i) => `owner-${i}/${'r'.repeat(40)}`)
    const qs = searchQueries('kai', long)
    expect(qs.length).toBeGreaterThan(2)
    expect(qs.every((q) => q.length <= 256)).toBe(true)
    expect(qs.join(' ').match(/repo:/g)).toHaveLength(10)
  })
  it('drops a malformed login instead of injecting it', () => {
    expect(searchQueries('kai repo:evil/x', [])).toEqual([])
  })
})

describe('toPayload', () => {
  it('keeps repo, labels and a github.com url only', () => {
    expect(toPayload(issue(7))).toEqual({
      node_id: 'I_7', number: 7, repo: 'acme/app', url: 'https://github.com/acme/app/issues/7', labels: ['bug'], updated_at: '2026-09-27T10:00:00Z',
    })
    expect(toPayload(issue(7, { html_url: 'javascript:alert(1)' })).url).toBeNull()
  })
})

describe('planSync', () => {
  it('inserts only unknown issues, deduped across queries', () => {
    const plan = planSync([issue(1), issue(2), issue(2)], [], new Set(['I_1']), null)
    expect(plan.insert.map((i) => i.number)).toEqual([2])
  })

  it('never re-inserts a filed/dismissed issue (known in any status)', () => {
    expect(planSync([issue(3)], [], new Set(['I_3']), null).insert).toEqual([])
  })

  it('after the first sync, skips untouched issues (a composted dismissal stays gone)', () => {
    const since = '2026-09-27T12:00:00Z'
    const old = issue(4, { updated_at: '2026-09-20T00:00:00Z' })
    const fresh = issue(5, { updated_at: '2026-09-27T12:30:00Z' })
    const lagged = issue(6, { updated_at: '2026-09-27T11:30:00Z' }) // within the hour of slack
    expect(planSync([old, fresh, lagged], [], new Set(), since).insert.map((i) => i.number)).toEqual([5, 6])
  })

  it('updates a pending row only when the issue changed', () => {
    const changed = issue(1, { title: 'Renamed', updated_at: '2026-09-27T11:00:00Z' })
    const plan = planSync([changed, issue(2)], [row(1, { checked_at: 'x' }), row(2)], new Set(['I_1', 'I_2']), null)
    expect(plan.update).toEqual([{ id: 'row-1', raw_text: 'Renamed', payload: { ...toPayload(changed), checked_at: 'x' } }])
    expect(plan.recheck).toEqual([])
  })

  it('rechecks pending rows missing from the results, least recently checked first, capped at 20', () => {
    const pending = [row(1, { checked_at: '2026-09-27T09:00:00Z' }), row(2), ...Array.from({ length: 25 }, (_, i) => row(100 + i, { checked_at: '2026-09-27T08:00:00Z' }))]
    const plan = planSync([], pending, new Set(), null)
    expect(plan.recheck).toHaveLength(20)
    expect(plan.recheck[0].id).toBe('row-2') // never checked
    expect(plan.recheck.some((r) => r.id === 'row-1')).toBe(false) // checked most recently → waits
  })
})
