import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxItem } from '../../lib/types'

// P6 step 4: filing a GitHub issue keeps its link on the task (external_ref), so the task can show
// "View issue" after the inbox row composts.
const writes: { table: string; row: Record<string, unknown> }[] = []

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => [] } }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>) => writes.push({ table, row }),
}))
vi.mock('../../lib/activity', () => ({ logActivity: () => undefined }))

const { fileToTask } = await import('./api')

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: crypto.randomUUID(), kind: 'text', raw_text: 'Fix the login bug', transcript: null, ai_parse: null, confidence: null,
    status: 'pending', filed_task_id: null, payload: null, snoozed_until: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}
const taskWrite = () => writes.find((w) => w.table === 'tasks')!.row

describe('fileToTask', () => {
  beforeEach(() => { writes.length = 0 })

  it('a GitHub issue becomes a task that keeps the issue link', () => {
    const issue = item({ kind: 'github_issue', payload: { node_id: 'I_7', url: 'https://github.com/acme/app/issues/7', repo: 'acme/app', number: 7 } })
    fileToTask(issue, { silent: true })
    expect(taskWrite().external_ref).toEqual({ source: 'github', id: 'I_7', url: 'https://github.com/acme/app/issues/7' })
  })

  it('no link to keep → no external_ref (a plain capture, or a non-github.com url)', () => {
    fileToTask(item({}), { silent: true })
    expect(taskWrite()).not.toHaveProperty('external_ref')
    writes.length = 0
    fileToTask(item({ kind: 'github_issue', payload: { node_id: 'I_8', url: 'javascript:alert(1)' } }), { silent: true })
    expect(taskWrite()).not.toHaveProperty('external_ref')
  })
})
