import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../calendar/api', () => ({ deleteEvent: vi.fn(), moveOrResizeEvent: vi.fn(), restoreEvent: vi.fn() }))
vi.mock('../tasks/api', () => ({
  completeTaskWithUndo: vi.fn(),
  reopenTaskWithUndo: vi.fn(),
  deleteTask: vi.fn(),
  rescheduleDue: vi.fn(),
  setSomeday: vi.fn(),
  toggleTop3: vi.fn(),
}))
vi.mock('../../lib/undo', () => ({ toastUndo: vi.fn() }))

import { deleteEvent, moveOrResizeEvent, restoreEvent } from '../calendar/api'
import { completeTaskWithUndo, reopenTaskWithUndo } from '../tasks/api'
import { toastUndo } from '../../lib/undo'
import { sameTimeTomorrow, taskMenuItems, upNextMenuItems } from './rowMenus'
import type { CalendarEvent, Task } from '../../lib/types'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-26 (EEST).
const cairo = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m)).toISOString()
}

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', project_id: null, domain_id: null, area_id: null, title: 'Write the brief', notes: null, status: 'todo',
  due_at: null, scheduled_start: null, scheduled_end: null, top3: true, snoozed_until: null, recurrence_rule: null,
  labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false,
  completed_at: null, created_at: cairo(20, '09:00'), updated_at: cairo(20, '09:00'), ...over,
})

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Deep work', starts_at: cairo(26, '10:00'), ends_at: cairo(26, '11:30'), all_day: false, task_id: null,
  source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null,
  created_at: cairo(25, '09:00'), updated_at: cairo(25, '09:00'), ...over,
})

const labels = (items: { label: string }[]) => items.map((i) => i.label)
const item = (items: { label: string; onClick?: () => void; disabled?: boolean }[], label: string) => items.find((i) => i.label === label)!

describe('sameTimeTomorrow', () => {
  it('keeps the Cairo wall-clock time and the length, one day on', () => {
    expect(sameTimeTomorrow(cairo(26, '10:00'), cairo(26, '11:30'))).toEqual({ starts_at: cairo(27, '10:00'), ends_at: cairo(27, '11:30') })
  })
  it('a late-evening Cairo block moves by the Cairo day, not the UTC one', () => {
    // 23:30 Cairo on the 26th is 20:30 UTC — tomorrow is the 27th in Cairo.
    expect(sameTimeTomorrow(cairo(26, '23:30'), cairo(27, '00:15')).starts_at).toBe(cairo(27, '23:30'))
  })
  it('crossing the end of summer time keeps the wall clock (10:00 stays 10:00)', () => {
    // Egypt left summer time on 2025-10-30 (last Thursday of October): UTC+3 → UTC+2.
    const r = sameTimeTomorrow('2025-10-30T07:00:00.000Z', '2025-10-30T08:00:00.000Z') // 10:00–11:00 Cairo (+3)
    expect(r).toEqual({ starts_at: '2025-10-31T08:00:00.000Z', ends_at: '2025-10-31T09:00:00.000Z' }) // 10:00–11:00 Cairo (+2)
  })
})

describe('upNextMenuItems', () => {
  const ctx = { open: vi.fn(), startFocus: vi.fn() }
  beforeEach(() => vi.clearAllMocks())

  it('a task-backed block: Start focus · Complete · Open details · Move to tomorrow · Unschedule', () => {
    const t = task()
    const items = upNextMenuItems(event({ task_id: t.id, type: 'task' }), t, ctx)
    expect(labels(items)).toEqual(['Start focus', 'Complete', 'Open details', 'Move to tomorrow', 'Unschedule'])
    item(items, 'Start focus').onClick!()
    expect(ctx.startFocus).toHaveBeenCalledWith(t)
    item(items, 'Complete').onClick!()
    expect(completeTaskWithUndo).toHaveBeenCalledWith(t)
    item(items, 'Open details').onClick!()
    expect(ctx.open).toHaveBeenCalled()
  })

  it('a done task reads Reopen, and cannot be focused or moved', () => {
    const t = task({ status: 'done', completed_at: cairo(26, '09:00'), top3: false })
    const items = upNextMenuItems(event({ task_id: t.id, type: 'task' }), t, ctx)
    expect(labels(items)).toContain('Reopen')
    expect(item(items, 'Start focus').disabled).toBe(true)
    expect(item(items, 'Move to tomorrow').disabled).toBe(true)
    item(items, 'Reopen').onClick!()
    expect(reopenTaskWithUndo).toHaveBeenCalledWith(t)
  })

  it('Move to tomorrow moves the block a Cairo day on, with an Undo that puts it back', () => {
    const t = task()
    const e = event({ task_id: t.id, type: 'task' })
    item(upNextMenuItems(e, t, ctx), 'Move to tomorrow').onClick!()
    expect(moveOrResizeEvent).toHaveBeenCalledWith(e, cairo(27, '10:00'), cairo(27, '11:30'))
    const undo = vi.mocked(toastUndo).mock.calls[0][1]
    undo()
    expect(moveOrResizeEvent).toHaveBeenLastCalledWith(e, e.starts_at, e.ends_at, false)
  })

  it('Unschedule takes the block off the calendar with the calendar\'s own Undo', () => {
    const t = task()
    const e = event({ task_id: t.id, type: 'task' })
    item(upNextMenuItems(e, t, ctx), 'Unschedule').onClick!()
    expect(deleteEvent).toHaveBeenCalledWith(e)
    expect(vi.mocked(toastUndo).mock.calls[0][0]).toBe('Unscheduled · Deep work')
    vi.mocked(toastUndo).mock.calls[0][1]()
    expect(restoreEvent).toHaveBeenCalledWith(e)
  })

  it('a plain event: Open in calendar · Delete (with Undo)', () => {
    const e = event()
    const items = upNextMenuItems(e, undefined, ctx)
    expect(labels(items)).toEqual(['Open in calendar', 'Delete'])
    item(items, 'Open in calendar').onClick!()
    expect(ctx.open).toHaveBeenCalled()
    item(items, 'Delete').onClick!()
    expect(deleteEvent).toHaveBeenCalledWith(e)
    expect(vi.mocked(toastUndo).mock.calls[0][0]).toBe('Deleted · Deep work')
  })
})

describe('taskMenuItems', () => {
  const ctx = { open: vi.fn(), startFocus: vi.fn() }

  it('keeps the row menu as it was, with Start focus on top', () => {
    expect(labels(taskMenuItems(task(), { ...ctx, onToggleSelect: vi.fn() }))).toEqual([
      'Start focus', 'Complete', 'Unstar', 'Due today', 'Due tomorrow', 'Someday', 'Select', 'Open details', 'Delete',
    ])
  })
  it('a done row reopens and cannot be focused', () => {
    const items = taskMenuItems(task({ completed_at: cairo(26, '09:00'), status: 'done', top3: false }), ctx)
    expect(labels(items).slice(0, 3)).toEqual(['Start focus', 'Reopen', 'Star for today'])
    expect(item(items, 'Start focus').disabled).toBe(true)
  })
})
