import { describe, expect, it } from 'vitest'
import { BLOCK_SWATCHES } from '../calendar/blockHue'
import { HER_COLOR } from './model'
import { SWATCH_NAMES, herFeed, swatchName, type ReadOk } from '../../../../supabase/functions/share-widget/feed.ts'
import { ruleBetween } from '../calendar/series'

// The Rainmeter skin's feed (supabase/functions/share-widget): the server's masked day, now and next picked, nothing added.
// Tue 17 Nov 2026 10:00 UTC = 12:00 in Cairo (UTC+2).
const NOW = new Date('2026-11-17T10:00:00Z')
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString()
const read = (level: ReadOk['level'], data: Partial<ReadOk['data']>): ReadOk => ({
  status: 'ok', name: 'Reem', level, zone: 'Africa/Cairo', owner_zone: 'Africa/Cairo', from: at(-720), to: at(2160),
  data: { blocks: [], top3: [], tasks: [], ...data },
})
const b = (id: string, from: number, to: number, title?: string, over: object = {}) => ({ id, starts_at: at(from), ends_at: at(to), all_day: false, ...(title ? { title } : { masked: true }), ...over })

describe('share-widget feed', () => {
  it('now is the block running, next the two still to come, in order; Heather; times on the viewer clock', () => {
    const f = herFeed(read('details', { blocks: [b('a', -30, 30, 'Lecture'), b('c', 240, 300, 'Dinner'), b('b', 90, 150, 'Study'), b('o', -200, -100, 'Over')] }), NOW, ruleBetween)
    expect(f.now_block).toMatchObject({ title: 'Lecture', start_hm: '11:30', end_hm: '12:30', color: 'heather' })
    expect(f.next_blocks.map((x) => x.title)).toEqual(['Study', 'Dinner'])
    expect(f.now).toBe(Math.floor(NOW.getTime() / 1000))
  })
  it('a masked block has no title key at all, only busy', () => {
    const f = herFeed(read('busy', { blocks: [b('a', -30, 30), b('b', 60, 90)] }), NOW, ruleBetween)
    expect('title' in f.now_block!).toBe(false)
    expect(f.now_block).toMatchObject({ busy: true })
    expect(JSON.stringify(f)).not.toContain('title')
  })
  it('the goal and Top 3 only at Details, and only what the server sent', () => {
    const top3 = [{ id: 't1', title: 'Goal', goal: true }, { id: 't2', title: 'Two', done: true }]
    const d = herFeed(read('details', { top3 }), NOW, ruleBetween)
    expect(d.goal).toEqual({ title: 'Goal', done: false })
    expect(d.top3_done).toBe(1)
    expect(d.top3).toHaveLength(2)
    const t = herFeed(read('titles', { top3 }), NOW, ruleBetween)
    expect(t.goal).toBeNull()
    expect(t.top3).toEqual([])
  })
  it('a repeat is expanded on her clock, and an all-day event is not a block', () => {
    const f = herFeed(read('titles', { blocks: [b('r', -24 * 60 + 60, -24 * 60 + 120, 'Gym', { recurrence_rule: 'FREQ=DAILY' }), b('d', 0, 1440, 'Holiday', { all_day: true })] }), NOW, ruleBetween)
    expect(f.now_block).toBeNull()
    expect(f.next_blocks.map((x) => x.title)).toEqual(['Gym', 'Gym'])
  })
  it('names the colour the viewer gave her, on the feed and on every block; Heather until one is picked', () => {
    const blocks = [b('a', -30, 30, 'Lecture'), b('b', 90, 150, 'Study')]
    const f = herFeed({ ...read('titles', { blocks }), color: '#E58F99' }, NOW, ruleBetween)
    expect([f.color, f.now_block?.color, f.next_blocks[0].color]).toEqual(['rose', 'rose', 'rose'])
    const d = herFeed(read('titles', { blocks }), NOW, ruleBetween)
    expect([d.color, d.now_block?.color]).toEqual(['heather', 'heather'])
    expect(swatchName('#e58f99')).toBe('rose')
    expect(swatchName('#123456')).toBe('heather') // never a colour the skin has no table row for
  })
  it('the 16 names are palette C’s, and Heather is the default', () => {
    expect(SWATCH_NAMES).toEqual(Object.fromEntries(BLOCK_SWATCHES.map((s) => [s.value, s.name.toLowerCase()])))
    expect(swatchName(HER_COLOR)).toBe('heather')
  })
  it('never carries an id', () => {
    expect(JSON.stringify(herFeed(read('details', { blocks: [b('secret-id', -30, 30, 'Lecture')], top3: [{ id: 'secret-task', title: 'G', goal: true }] }), NOW, ruleBetween))).not.toContain('secret')
  })
})
