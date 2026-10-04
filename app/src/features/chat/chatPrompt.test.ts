import { describe, expect, it } from 'vitest'
import { APP_GUIDE, dayStart, snapshotText, systemPrompt } from '../../../../supabase/functions/chat/prompt.ts'

const now = new Date('2026-10-04T07:30:00Z') // Sun 4 Oct, 10:30 in Cairo (UTC+3)

describe('chat prompt (the "not in your data" fix)', () => {
  it('days start at Cairo midnight, whatever the machine zone', () => {
    expect(dayStart(now).toISOString()).toBe('2026-10-03T21:00:00.000Z')
    expect(dayStart(now, 'Africa/Cairo', 1).toISOString()).toBe('2026-10-04T21:00:00.000Z')
  })
  it('the snapshot sorts today, overdue, the calendar and tomorrow', () => {
    const text = snapshotText(
      now,
      [
        { title: 'GCI homework', due_at: null, scheduled_start: '2026-10-04T10:00:00Z', top3: true },
        { title: 'Old report', due_at: '2026-10-01T09:00:00Z', scheduled_start: null, top3: false },
        { title: 'Call Omar', due_at: '2026-10-05T06:00:00Z', scheduled_start: null, top3: false },
      ],
      [{ title: 'Gym', starts_at: '2026-10-04T15:00:00Z', ends_at: '2026-10-04T16:00:00Z' }],
      3,
    )
    expect(text).toContain("Today's tasks:\n- ★ GCI homework (13:00)")
    expect(text).toContain('Overdue:\n- Old report')
    expect(text).toContain("Today's calendar:\n- 18:00 Gym")
    expect(text).toContain('Tomorrow:\n- Call Omar (09:00)')
    expect(text).toContain('Inbox: 3 waiting')
  })
  it('lets the model reason, forbids invention, answers how-to and the user\'s language', () => {
    const p = systemPrompt({ now, hits: [], top3: [], slipping: [], snapshot: 'S' })
    expect(p).toContain('You may reason and suggest')
    expect(p).toContain('Never invent')
    expect(p).toContain('Reply in the same language')
    expect(p).toContain(APP_GUIDE)
    expect(p).not.toContain("That's not in your data")
  })
})
