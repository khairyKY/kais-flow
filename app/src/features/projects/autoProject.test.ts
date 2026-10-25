import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../lib/types'

// Queue item 17: a new task or event without a place gets its likely project from the user's own history.
let cache: Record<string, unknown> = {}
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => cache[key[0]] } }))
const moveTasksWithUndo = vi.fn()
vi.mock('../tasks/api', () => ({ moveTasksWithUndo: (...a: unknown[]) => moveTasksWithUndo(...a) }))
const updateEvent = vi.fn()
vi.mock('../calendar/api', () => ({ updateEvent: (...a: unknown[]) => updateEvent(...a) }))
const push = vi.fn()
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push }) } }))

const { offerProject, suggestProject } = await import('./autoProject')

const project = (id: string, name: string, over: Partial<Project> = {}): Project =>
  ({ id, name, domain_id: `d-${id}`, type: 'standard', status: 'active', created_at: '', updated_at: '', ...over }) as Project
const FORECAST = project('p1', 'Forecasting App')
const HEALTH = project('p2', 'Health')
const OLD = project('p3', 'Old site', { status: 'archived' })
const NOW = Date.parse('2026-10-25T09:00:00Z')
const recent = '2026-10-20T09:00:00Z'
const past = [
  { title: 'Fix the forecast chart', project_id: 'p1', updated_at: recent },
  { title: 'Forecast model: add holidays', project_id: 'p1', updated_at: recent },
  { title: 'Gym', project_id: 'p2', updated_at: recent },
  { title: 'Gym session', project_id: 'p2', updated_at: recent },
  { title: 'Redesign the site header', project_id: 'p3', updated_at: recent },
  { title: 'Buy milk', project_id: null },
]

describe('suggestProject', () => {
  it('a title like ones already filed points to their project; an identical one is sure', () => {
    expect(suggestProject('Gym', past, [FORECAST, HEALTH], { now: NOW })).toMatchObject({ project: { id: 'p2' }, sure: true })
    const s = suggestProject('Forecast chart tooltip', past, [FORECAST, HEALTH], { now: NOW })
    expect(s?.project.id).toBe('p1')
  })

  it("the project's name in the title says it outright", () => {
    expect(suggestProject('Forecasting app: onboarding copy', [], [FORECAST, HEALTH], { now: NOW })).toMatchObject({ project: { id: 'p1' }, sure: true })
  })

  it('a Time block that belongs to a project holds its work', () => {
    expect(suggestProject('anything at all', [], [FORECAST, HEALTH], { slotProjectId: 'p2', now: NOW })).toMatchObject({ project: { id: 'p2' }, sure: true })
  })

  it('nothing clear → nothing; archived projects and "not there"s are never offered', () => {
    expect(suggestProject('Call the plumber', past, [FORECAST, HEALTH], { now: NOW })).toBeNull()
    expect(suggestProject('Redesign the site header again', past, [FORECAST, HEALTH, OLD], { now: NOW })).toBeNull()
    expect(suggestProject('Gym', past, [FORECAST, HEALTH], { not: ['p2'], now: NOW })).toBeNull()
  })

  it('learns from corrections: history is where things are now, recent ones counting more', () => {
    const moved = [{ title: 'Gym', project_id: 'p1', updated_at: recent }, { title: 'Gym', project_id: 'p2', updated_at: '2026-01-01T00:00:00Z' }]
    expect(suggestProject('Gym', moved, [FORECAST, HEALTH], { now: NOW })?.project.id).toBe('p1')
  })
})

describe('offerProject', () => {
  const task = (over: Record<string, unknown> = {}) => ({ id: 'n1', title: 'Gym', project_id: null, area_id: null, domain_id: null, labels: [], ...over }) as never
  beforeEach(() => {
    cache = { projects: [FORECAST, HEALTH], tasks: past.map((p, i) => ({ id: `t${i}`, ...p })), calendar_events: [], app_settings: {} }
    moveTasksWithUndo.mockReset()
    updateEvent.mockReset()
    push.mockReset()
    try {
      localStorage.removeItem('kf.autoProject.not')
    } catch {
      /* no storage in this environment */
    }
  })
  afterEach(() => vi.useRealTimers())

  it("'suggest' (the default): a quiet chip that applies in one tap", () => {
    expect(offerProject({ kind: 'task', row: task() })).toBe(true)
    expect(moveTasksWithUndo).not.toHaveBeenCalled()
    const chip = push.mock.calls[0][0] as { message: string; action: { label: string; run: () => void } }
    expect(chip.message).toBe('→ Health?')
    chip.action.run()
    expect(moveTasksWithUndo).toHaveBeenCalledWith([expect.objectContaining({ id: 'n1' })], { kind: 'project', id: 'p2', domainId: 'd-p2', name: 'Health' }, '→ Health', expect.any(Function))
  })

  it("'assign': put there when sure, with its Undo", () => {
    cache.app_settings = { auto_project: 'assign' }
    offerProject({ kind: 'task', row: task() })
    expect(moveTasksWithUndo).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it("'off', or a task already placed, or nothing to go on: nothing", () => {
    cache.app_settings = { auto_project: 'off' }
    expect(offerProject({ kind: 'task', row: task() })).toBe(false)
    cache.app_settings = {}
    expect(offerProject({ kind: 'task', row: task({ project_id: 'p1' }) })).toBe(false)
    expect(offerProject({ kind: 'task', row: task({ area_id: 'a1' }) })).toBe(false)
    expect(offerProject({ kind: 'task', row: task({ title: 'Call the plumber' }) })).toBe(false)
    // the place chip taken off with Esc: '#gym' stays words, and nothing is offered back
    expect(offerProject({ kind: 'task', row: task({ title: 'Gym #health' }) })).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("an event gets its project too; the AI read's pick is offered only when history has none", () => {
    offerProject({ kind: 'event', row: { id: 'ev', title: 'Gym session', project_id: null } as never })
    ;(push.mock.calls[0][0] as { action: { run: () => void } }).action.run()
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev' }), { project_id: 'p2' })
    push.mockReset()
    expect(offerProject({ kind: 'task', row: task({ title: 'Call the plumber' }) }, FORECAST)).toBe(true)
    expect((push.mock.calls[0][0] as { message: string }).message).toBe('→ Forecasting App?')
  })
})
