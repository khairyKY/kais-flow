import { beforeEach, describe, expect, it, vi } from 'vitest'

const toggled: string[] = []
vi.mock('../../lib/settings', () => ({ useAppSettings: vi.fn(), updateAppSetting: vi.fn() }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../tasks/api', () => ({
  createTask: (t: { title: string; dueAt: string | null }) => ({ id: t.title, title: t.title, due_at: t.dueAt, scheduled_start: null, top3: false, someday: false, paused: false, deleted_at: null, status: 'todo' }),
  toggleTop3: (task: { id: string }) => void toggled.push(task.id),
}))

const { completeOnboarding } = await import('./api')

describe('completeOnboarding — today\'s lines become the Top 3, a later line keeps its day', () => {
  beforeEach(() => void (toggled.length = 0))
  const now = new Date('2026-09-27T09:00:00Z') // 12:00 in Cairo
  const thing = (title: string, dueAt: string | null) => ({ title, dueAt, durationMin: null, priority: null })
  it('stars undated and today\'s lines, not "tomorrow 3pm"', () => {
    completeOnboarding('Kai', [thing('Call the supplier', '2026-09-28T12:00:00.000Z'), thing('Finish the audit', null), thing('Gym', '2026-09-27T15:00:00.000Z')], now)
    expect(toggled).toEqual(['Finish the audit', 'Gym'])
  })
})
