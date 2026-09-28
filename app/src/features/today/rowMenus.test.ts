import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../calendar/api', () => ({ deleteEvent: vi.fn(), moveOrResizeEvent: vi.fn(), restoreEvent: vi.fn() }))
vi.mock('../../lib/undo', () => ({ toastUndo: vi.fn() }))

import { deleteEvent, moveOrResizeEvent, restoreEvent } from '../calendar/api'
import { toastUndo } from '../../lib/undo'
import { blockTomorrowHint, eventMenuItems, moveBlockToTomorrow, sameTimeTomorrow, unscheduleWithUndo } from './rowMenus'
import type { CalendarEvent } from '../../lib/types'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-26 (EEST).
const cairo = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m)).toISOString()
}

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Deep work', starts_at: cairo(26, '10:00'), ends_at: cairo(26, '11:30'), all_day: false, task_id: null,
  source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null,
  created_at: cairo(25, '09:00'), updated_at: cairo(25, '09:00'), ...over,
})

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

describe('an Up next block', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Tomorrow moves the block a Cairo day on at its own time, with an Undo that puts it back', () => {
    const e = event({ task_id: 't1', type: 'task' })
    expect(blockTomorrowHint(e)).toBe('Sun 10:00')
    moveBlockToTomorrow(e)
    expect(moveOrResizeEvent).toHaveBeenCalledWith(e, cairo(27, '10:00'), cairo(27, '11:30'))
    vi.mocked(toastUndo).mock.calls[0][1]()
    expect(moveOrResizeEvent).toHaveBeenLastCalledWith(e, e.starts_at, e.ends_at, false)
  })

  it("Unschedule takes the block off the calendar with the calendar's own Undo", () => {
    const e = event({ task_id: 't1', type: 'task' })
    unscheduleWithUndo(e)
    expect(deleteEvent).toHaveBeenCalledWith(e)
    expect(vi.mocked(toastUndo).mock.calls[0][0]).toBe('Unscheduled · Deep work')
    vi.mocked(toastUndo).mock.calls[0][1]()
    expect(restoreEvent).toHaveBeenCalledWith(e)
  })

  it('a plain event: Open in calendar · Delete (with Undo)', () => {
    const e = event()
    const open = vi.fn()
    const items = eventMenuItems(e, open)
    expect(items.map((i) => i.label)).toEqual(['Open in calendar', 'Delete'])
    items[0].onClick!()
    expect(open).toHaveBeenCalled()
    items[1].onClick!()
    expect(deleteEvent).toHaveBeenCalledWith(e)
    expect(vi.mocked(toastUndo).mock.calls[0][0]).toBe('Deleted · Deep work')
  })
})
