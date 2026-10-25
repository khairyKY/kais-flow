import { describe, expect, it } from 'vitest'
import { APP_GUIDE, dayStart, snapshotText, systemPrompt } from '../../../../supabase/functions/chat/prompt.ts'
import type { Refs } from '../../../../supabase/functions/chat/plan.ts'

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
    expect(text).toContain("Today's calendar:\n- 18:00–19:00 Gym")
    expect(text).toContain('Tomorrow:\n- Call Omar (09:00)')
    expect(text).toContain('Inbox: 3 waiting')
  })
  it("tomorrow is the user's whole tomorrow, even when it is 25 hours long (DST)", () => {
    // Sat 31 Oct 2026, 10:00 in Los Angeles; Sunday 1 Nov falls back at 02:00, so it ends at 08:00Z on the 2nd.
    const sat = new Date('2026-10-31T17:00:00Z')
    expect(dayStart(sat, 'America/Los_Angeles', 2).toISOString()).toBe('2026-11-02T08:00:00.000Z')
    const text = snapshotText(sat, [{ title: 'Late Sunday call', due_at: '2026-11-02T07:30:00Z', scheduled_start: null, top3: false }], [], 0, 'America/Los_Angeles')
    expect(text).toContain('Tomorrow:\n- Late Sunday call (23:30)')
  })
  it("forbids invention, answers how-to and the user's language", () => {
    const p = systemPrompt({ now, hits: [], top3: [{ title: 'GCI homework' }, { title: 'Survey' }], slipping: [], snapshot: 'S' })
    expect(p).toContain('Top 3 today (the first is the goal of the day): GCI homework, Survey')
    expect(p).toContain('Never invent')
    expect(p).toContain("Reply in the user's language")
    expect(p).toContain(APP_GUIDE)
    expect(p).not.toContain("That's not in your data")
  })

  // Queue item 5 (2026-10-25): it claimed three gym sessions it never made, swapped two, drew raw pipes.
  it('acts only through a confirmed plan, copies the words for times, and keeps it short and plain', () => {
    const p = systemPrompt({ now, hits: [], top3: [], slipping: [], snapshot: 'S' })
    expect(p).toContain('call propose with every step for the request in ONE call')
    expect(p).toContain('Nothing changes until the user taps Confirm')
    expect(p).toContain('never say you did it')
    expect(p).toContain("copy the user's own words")
    expect(p).toContain('never swap or merge items')
    expect(p).toContain('no tables')
    // the app's model: goal, blocks vs events, slots, rituals
    expect(p).toContain('the first is the goal of the day')
    expect(p).toContain("Events (a meeting, the gym, an appointment) live on the calendar and aren't tasks")
    expect(p).toContain('Time blocks are time set aside')
    expect(p).toContain('Plan my day in the morning, Shut down in the evening')
  })

  it('reads days from a table: today, tomorrow, then each date by name', () => {
    const p = systemPrompt({ now, hits: [], top3: [], slipping: [], snapshot: 'S' })
    expect(p).toContain('Days: Sun 4 Oct (today) = 2026-10-04, Mon 5 Oct (tomorrow) = 2026-10-05, Tue 6 Oct = 2026-10-06')
  })

  it("writes the person's own clock style", () => {
    expect(systemPrompt({ now, hits: [], top3: [], slipping: [], snapshot: 'S', h24: false })).toContain('7:00 AM, 5:45 PM (12-hour)')
    expect(systemPrompt({ now, hits: [], top3: [], slipping: [], snapshot: 'S' })).toContain('07:00, 17:45 (24-hour)')
    const text = snapshotText(now, [], [{ title: 'Gym', starts_at: '2026-10-04T15:00:00Z', ends_at: '2026-10-04T16:15:00Z' }], 0, 'Africa/Cairo', { h24: false })
    expect(text).toContain('- 6:00 PM–7:15 PM Gym')
  })

  it('an action request leaves out search hits and the guide (fewer tokens, no stray chips)', () => {
    const hits = [{ entity_type: 'task', title: 'Ask manager about leave' }]
    expect(systemPrompt({ now, hits, top3: [], slipping: [], snapshot: 'S' })).toContain('Ask manager about leave')
    const p = systemPrompt({ now, hits, top3: [], slipping: [], snapshot: 'S', action: true })
    expect(p).not.toContain('Ask manager about leave')
    expect(p).not.toContain(APP_GUIDE)
  })

  it('gives each listed item a short ref the plan can name, and fills the ref book', () => {
    const refs: Refs = {}
    const text = snapshotText(
      now,
      [{ id: 'task-1', title: 'GCI homework', due_at: null, scheduled_start: '2026-10-04T10:00:00Z', top3: true }],
      [{ id: 'row-9::2026-10-04T15:00:00.000Z', seriesId: 'row-9', title: 'Gym', starts_at: '2026-10-04T15:00:00Z', ends_at: '2026-10-04T16:00:00Z' }],
      2,
      'Africa/Cairo',
      { refs, inbox: [{ id: 'inbox-1', raw_text: 'renew hosting   before the 15th' }] },
    )
    expect(text).toContain('- ★ GCI homework (13:00) [t1]')
    expect(text).toContain('- 18:00–19:00 Gym [e1]')
    expect(text).toContain('Inbox: 2 waiting to be sorted.\n- renew hosting before the 15th [i1]')
    expect(refs).toEqual({ t1: { id: 'task-1', type: 'task' }, e1: { id: 'row-9', type: 'calendar_event' }, i1: { id: 'inbox-1', type: 'inbox_item' } })
  })
})
