import { beforeEach, describe, expect, it, beforeAll } from 'vitest'
import { setHour24 } from '../../lib/clock'
import { setAppZone } from '../../lib/appZone'
import type { CalendarEvent } from '../../lib/types'
import { besideBlock, blockMenuSpec, isSynced, isUntitled, remindLabel, repeatLabel } from './blockMenuSpec'

// These read times on the 24-hour clock (lib/clock, Kai 2026-10-22); the 12-hour one is lib/clock.test's.
beforeAll(() => setHour24(true))

const block = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'b1', title: 'Deep work — Forecasting', starts_at: '2026-07-29T06:00:00.000Z', ends_at: '2026-07-29T08:00:00.000Z', all_day: false,
  task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'time_block', color: null,
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z', ...over,
})
const keys = (e: CalendarEvent, ctx?: Parameters<typeof blockMenuSpec>[1]) => blockMenuSpec(e, ctx).map((r) => r.key)
const NOW = new Date('2026-07-29T05:00:00.000Z')

describe('blockMenuSpec — Calendar.dc.html §5, a menu not a form', () => {
  beforeEach(() => setAppZone('Africa/Cairo'))

  it('5a a task block: when · project, the task as a quiet group, Unschedule ⌫, Delete last — no Repeat', () => {
    const spec = blockMenuSpec(block({ task_id: 't1', type: 'task' }), { task: { title: 'Host all the AI in one place', status: 'todo' }, projectName: 'Forecasting', now: NOW })
    expect(spec.map((r) => r.key)).toEqual(['date', 'time', 'project', 'complete', 'open', 'duplicate', 'unschedule', 'delete'])
    expect(spec[0]).toMatchObject({ label: 'Wed, Jul 29', sub: true })
    expect(spec[1]).toMatchObject({ label: '09:00 – 11:00', hint: '2h', sub: true }) // Cairo, UTC+3
    expect(spec[2]).toMatchObject({ label: 'Forecasting', unset: false })
    expect(spec[3]).toMatchObject({ label: 'Complete', divider: true, caption: { label: 'From task', text: 'Host all the AI in one place' } })
    expect(spec[5]).toMatchObject({ label: 'Duplicate' }) // Kai 2026-10-17: the task's copy, blocked at this time
    expect(spec[6]).toMatchObject({ label: 'Unschedule', hint: '⌫', divider: true })
    expect(spec.at(-1)).toMatchObject({ key: 'delete', label: 'Delete', destructive: true, sub: false })
    expect(spec.filter((r) => r.destructive)).toHaveLength(1)
  })

  it('a missed task block offers Replan…; a done one Reopen', () => {
    expect(keys(block({ task_id: 't1' }), { task: { title: 'x', status: 'todo' }, missed: true })).toContain('replan')
    expect(blockMenuSpec(block({ task_id: 't1' }), { task: { title: 'x', status: 'done' } }).find((r) => r.key === 'complete')?.label).toBe('Reopen')
  })

  it('5c a plain block: Repeat, Link a task…, More (kind + busy, the deviation), Delete', () => {
    const spec = blockMenuSpec(block(), { now: NOW })
    expect(spec.map((r) => r.key)).toEqual(['date', 'time', 'project', 'repeat', 'remind', 'link', 'more', 'delete'])
    expect(spec.find((r) => r.key === 'project')).toMatchObject({ label: 'No project', unset: true })
    expect(spec.find((r) => r.key === 'repeat')).toMatchObject({ label: 'Does not repeat', unset: true, sub: true })
    expect(spec.at(-1)).toMatchObject({ key: 'delete', hint: '⌫' }) // p7e A4: Backspace deletes it
  })

  it('Duplicate (Kai 2026-10-17): an event and a task block — never a Time block (a slot repeats), a Google event, or a block whose task is not loaded', () => {
    expect(keys(block({ type: 'event' }), { now: NOW })).toEqual(['date', 'time', 'project', 'repeat', 'remind', 'link', 'more', 'duplicate', 'delete'])
    expect(keys(block({ type: 'event', recurrence_rule: 'FREQ=WEEKLY' }))).toContain('duplicate')
    expect(keys(block())).not.toContain('duplicate')
    expect(keys(block({ type: 'event', source: 'gcal' }))).not.toContain('duplicate')
    expect(keys(block({ task_id: 't1', type: 'task' }))).not.toContain('duplicate')
  })

  it('a repeating block: no Link a task, and Delete asks This event / All events', () => {
    const spec = blockMenuSpec(block({ recurrence_rule: 'FREQ=WEEKLY' }))
    expect(spec.map((r) => r.key)).toEqual(['date', 'time', 'project', 'repeat', 'remind', 'more', 'delete'])
    expect(spec.find((r) => r.key === 'repeat')?.label).toBe('Repeats weekly')
    expect(spec.at(-1)).toMatchObject({ key: 'delete', sub: true })
    expect(spec.at(-1)?.hint).toBeUndefined() // ⌫ never deletes a whole series
    expect(blockMenuSpec(block({ id: 'b1::x', seriesId: 'b1', recurrence_rule: 'FREQ=DAILY' })).at(-1)?.sub).toBe(true)
  })

  it('an all-day block reads "All day" with no length picker, its date in no zone', () => {
    const spec = blockMenuSpec(block({ all_day: true, starts_at: '2026-07-29T00:00:00.000Z', ends_at: '2026-07-30T00:00:00.000Z' }))
    expect(spec[0].label).toBe('Wed, Jul 29')
    expect(spec[1]).toEqual({ key: 'time', label: 'All day' })
    expect(spec.map((r) => r.key)).not.toContain('remind') // no start time to count back from
  })

  it('A12 Remind: quiet "No reminder" until set, then the offset in words', () => {
    expect(blockMenuSpec(block()).find((r) => r.key === 'remind')).toMatchObject({ label: 'No reminder', unset: true, sub: true })
    expect(blockMenuSpec(block({ remind_min: 15 })).find((r) => r.key === 'remind')).toMatchObject({ label: 'Remind 15 min before', unset: false })
    expect(remindLabel(0)).toBe('Remind at start')
    expect(remindLabel(60)).toBe('Remind 1 hr before')
    expect(remindLabel(45)).toBe('Remind 45 min before')
  })

  it('5c a block made a moment ago with no title: Discard instead of Delete', () => {
    const fresh = block({ title: 'New event', created_at: '2026-07-29T04:58:00.000Z' })
    expect(isUntitled(fresh, NOW)).toBe(true)
    expect(blockMenuSpec(fresh, { now: NOW }).at(-1)?.label).toBe('Discard')
    expect(isUntitled(block({ title: 'New event' }), NOW)).toBe(false) // named so long ago, it's a name
    expect(isUntitled(block({ created_at: '2026-07-29T04:58:00.000Z' }), NOW)).toBe(false)
  })

  it('the popover sits beside the block: right when it fits, else left, top-aligned (zoom-aware)', () => {
    expect(besideBlock({ left: 100, right: 300, top: 50 }, 1280)).toEqual({ x: 308, y: 50 })
    expect(besideBlock({ left: 1000, right: 1200, top: 50 }, 1280)).toEqual({ x: 1000 - 8 - 238, y: 50 })
    expect(besideBlock({ left: 1000, right: 1200, top: 50 }, 1280, 1.25)).toEqual({ x: 1000 - 10 - 297.5, y: 50 })
  })

  it('repeat labels follow the task menu’s words', () => {
    expect(repeatLabel(null)).toBe('Does not repeat')
    expect(repeatLabel('FREQ=MONTHLY')).toBe('Repeats monthly')
    // a custom rule (the shared Repeat editor) reads in words
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Every week on Monday, Wednesday')
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Every weekday')
  })
})

describe('a Google event (B1): read-only', () => {
  beforeEach(() => setAppZone('Africa/Cairo'))

  it('says when and from which calendar — nothing opens, nothing to delete', () => {
    const e = block({ source: 'gcal', type: 'event', title: 'Fajr', external_ref: { source: 'gcal', id: 'p/e1', calendar: 'Prayer times', calendar_id: 'p' } })
    const spec = blockMenuSpec(e, { now: NOW })
    expect(isSynced(e)).toBe(true)
    expect(spec.map((r) => r.key)).toEqual(['date', 'time', 'google'])
    expect(spec.every((r) => !r.sub && !r.destructive)).toBe(true)
    expect(spec[1]).toMatchObject({ label: '09:00 – 11:00', hint: '2h' })
    expect(spec[2]).toMatchObject({ label: 'From Google · Prayer times', divider: true })
    expect(blockMenuSpec(block({ source: 'gcal', all_day: true }))[1]).toMatchObject({ label: 'All day' })
    expect(isSynced(block())).toBe(false)
  })
})
