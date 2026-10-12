import { describe, expect, it } from 'vitest'
// The edge functions' pure GitHub logic — Deno-free on purpose so it can be tested here.
import { DEFAULT_RULES, landing, parseRepos, planSync, readRules, searchQueries, staleFirst, toPayload, type GhIssue, type PendingRow } from '../../../../supabase/functions/_shared/github.ts'

const issue = (n: number, over: Partial<GhIssue> = {}): GhIssue => ({
  node_id: `I_${n}`,
  number: n,
  title: `Issue ${n}`,
  html_url: `https://github.com/acme/app/issues/${n}`,
  repository_url: 'https://api.github.com/repos/acme/app',
  updated_at: '2026-09-27T10:00:00Z',
  created_at: '2026-09-20T09:00:00Z',
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
  it('once the rules are saved, picked repos are the whole scope; none picked = assigned only', () => {
    expect(searchQueries('kai', ['acme/app'], true)).toEqual(['is:open is:issue repo:acme/app'])
    expect(searchQueries('kai', [], true)).toEqual(['is:open is:issue assignee:kai'])
    // a list of nothing valid still means "none picked", not "nothing at all"
    expect(searchQueries('kai', ['not a repo'], true)).toEqual(['is:open is:issue assignee:kai'])
  })
})

describe('readRules', () => {
  it('no rules saved = the behaviour from before: Inbox, normal, syncing', () => {
    expect(readRules(undefined)).toEqual(DEFAULT_RULES)
    expect(readRules(null)).toEqual({ land: 'inbox', priority: 'normal', paused: false })
  })
  it('keeps known values and drops anything else to the default', () => {
    expect(readRules({ land: 'tasks', priority: 'high', paused: true })).toEqual({ land: 'tasks', priority: 'high', paused: true })
    expect(readRules({ land: 'calendar', priority: 'urgent', paused: 'yes', extra: 1 })).toEqual(DEFAULT_RULES)
    expect(readRules('tasks')).toEqual(DEFAULT_RULES)
  })
})

describe('landing (issue → where it lands)', () => {
  it('Inbox: a pending github_issue letter, deduped on the node_id', () => {
    expect(landing(issue(7), DEFAULT_RULES)).toEqual({
      table: 'inbox_items',
      row: { kind: 'github_issue', raw_text: 'Issue 7', status: 'pending', payload: toPayload(issue(7)), external_ref: { source: 'github', id: 'I_7' } },
    })
  })
  it('Straight to Tasks: an unfiled todo with the issue link, marked as the sync’s own', () => {
    expect(landing(issue(7), { ...DEFAULT_RULES, land: 'tasks' })).toEqual({
      table: 'tasks',
      row: { title: 'Issue 7', status: 'todo', external_ref: { source: 'github', id: 'I_7', url: 'https://github.com/acme/app/issues/7', repo: 'acme/app', number: 7, synced: true } },
    })
  })
  it('priority and pause never change the row', () => {
    expect(landing(issue(7), { land: 'inbox', priority: 'low', paused: true })).toEqual(landing(issue(7), DEFAULT_RULES))
  })
  it('a non-github.com link is dropped on a task too', () => {
    const l = landing(issue(7, { html_url: 'javascript:alert(1)' }), { ...DEFAULT_RULES, land: 'tasks' })
    expect(l.table === 'tasks' && l.row.external_ref.url).toBeNull()
  })
})

describe('staleFirst', () => {
  it('never-checked first, then oldest check; capped at 20', () => {
    const rows = [row(1, { checked_at: '2026-09-27T09:00:00Z' }), row(2), ...Array.from({ length: 25 }, (_, i) => row(100 + i, { checked_at: '2026-09-27T08:00:00Z' }))]
    const out = staleFirst(rows)
    expect(out).toHaveLength(20)
    expect(out[0].id).toBe('row-2')
    expect(out.some((r) => r.id === 'row-1')).toBe(false)
    expect(rows[0].id).toBe('row-1') // the input isn't reordered
  })
})

describe('toPayload', () => {
  it('keeps repo, labels and a github.com url only', () => {
    expect(toPayload(issue(7))).toEqual({
      node_id: 'I_7', number: 7, repo: 'acme/app', url: 'https://github.com/acme/app/issues/7', labels: ['bug'], updated_at: '2026-09-27T10:00:00Z', created_at: '2026-09-20T09:00:00Z',
    })
    expect(toPayload(issue(7, { created_at: undefined })).created_at).toBeNull()
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
