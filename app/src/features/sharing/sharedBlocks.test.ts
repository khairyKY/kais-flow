import { describe, expect, it } from 'vitest'
import { leftText, nowNext, occurrences, progress } from './sharedBlocks'
import type { SharedBlock } from './api'

const blk = (id: string, a: string, b: string, over: Partial<SharedBlock> = {}): SharedBlock => ({ id, starts_at: a, ends_at: b, all_day: false, ...over })
const day = { zone: 'Africa/Cairo', blocks: [
  blk('lab', '2026-11-17T10:30:00Z', '2026-11-17T12:00:00Z', { title: 'Histology lab' }),
  blk('study', '2026-11-17T07:00:00Z', '2026-11-17T10:00:00Z', { title: 'Study' }),
  blk('busy', '2026-11-17T13:00:00Z', '2026-11-17T14:00:00Z', { masked: true }),
  blk('hol', '2026-11-17T00:00:00Z', '2026-11-18T00:00:00Z', { all_day: true, title: 'Holiday' }),
] }

describe('another person’s blocks', () => {
  const from = new Date('2026-11-17T00:00:00Z'), to = new Date('2026-11-18T00:00:00Z')
  it('sorted by start; a block with no title is Busy', () => {
    const occ = occurrences(day, from, to)
    expect(occ.map((o) => o.id)).toEqual(['hol', 'study', 'lab', 'busy'])
    expect(occ.find((o) => o.id === 'busy')!.title).toBeNull()
  })
  it('a repeat is expanded on its owner’s clock (10:00 Cairo every week, the clocks going back on the way)', () => {
    const rep = { zone: 'Africa/Cairo', blocks: [blk('gym', '2026-10-05T07:00:00Z', '2026-10-05T08:00:00Z', { title: 'Gym', recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-11-09T08:00:00.000Z'] })] }
    const occ = occurrences(rep, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z'))
    expect(occ.map((o) => o.startsAt.slice(0, 10))).toEqual(['2026-11-02', '2026-11-16', '2026-11-23'])
  })
  it('now and next: the running block, then the timed ones still to come today', () => {
    const occ = occurrences(day, from, to)
    const at = new Date('2026-11-17T11:00:00Z')
    const r = nowNext(occ, at, 'Africa/Cairo')
    expect(r.now?.id).toBe('lab')
    expect(r.next.map((o) => o.id)).toEqual(['busy'])
    expect(nowNext(occ, new Date('2026-11-17T09:00:00Z'), 'Africa/Cairo').now?.id).toBe('study')
  })
  it('how far through, and how long is left', () => {
    const o = occurrences(day, from, to).find((x) => x.id === 'lab')!
    expect(progress(o, new Date('2026-11-17T11:15:00Z'))).toBe(50)
    expect(leftText(o, new Date('2026-11-17T10:40:00Z'))).toBe('1h 20m left')
    expect(leftText(o, new Date('2026-11-17T11:40:00Z'))).toBe('20m left')
  })
})
