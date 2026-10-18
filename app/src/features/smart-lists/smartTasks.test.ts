import { describe, expect, it, vi } from 'vitest'

// ./api imports the Supabase client and the outbox, which need VITE_ env and auth (CI has neither).
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/outbox', () => ({ writeRow: vi.fn() }))

import { smartTasks } from './api'
import { readFilter } from '../../../../supabase/functions/_shared/smartList.ts'
import type { Task } from '../../lib/types'

const NOW = new Date('2026-10-17T07:00:00Z')
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, project_id: null, domain_id: null, area_id: null, title: id, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null,
  someday: false, reminder_at: null, reminder_sent: false, completed_at: null, created_at: '2026-10-01T06:00:00Z', updated_at: '2026-10-01T06:00:00Z', ...over,
})

describe('smart lists × snooze', () => {
  it('a snoozed task is out of a smart list until it is back', () => {
    const all = readFilter({})
    const tasks = [task('open'), task('snoozed', { snoozed_until: '2026-10-17T10:00:00Z' }), task('back', { snoozed_until: '2026-10-17T06:00:00Z' })]
    expect(smartTasks(tasks, all, [], [], NOW).map((t) => t.id).sort()).toEqual(['back', 'open'])
  })
})
