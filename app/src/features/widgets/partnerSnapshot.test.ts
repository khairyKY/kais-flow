import { describe, expect, it } from 'vitest'
import { buildPartner, partnerStale, pickPartner, swatchOf, PARTNER_STALE_MS } from './partnerSnapshot'
import type { SharedDay } from '../sharing/api'
import type { Connection } from '../sharing/model'

// Her day on the phone's home screen (partnerSnapshot): the server's masked answer, as the widget draws it.
const NOW = new Date('2026-11-17T08:00:00Z')
const conn = (over: Partial<Connection> = {}): Connection => ({
  circle_id: 'c1', relation: 'partner', partner_id: 'u2', partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details',
  my_grant_id: 'g1', show_lane: true, show_day: true, color: '#8972B3', since: '2026-11-01T00:00:00Z', paused_until: null, paused_by_me: false, ...over,
})
const blk = (id: string, from: number, to: number, title?: string) => ({
  id, starts_at: new Date(NOW.getTime() + from * 60_000).toISOString(), ends_at: new Date(NOW.getTime() + to * 60_000).toISOString(), all_day: false, ...(title ? { title } : { masked: true }),
})
const day = (level: SharedDay['level'], over: Partial<SharedDay> = {}): SharedDay => ({
  level, zone: 'Africa/Cairo',
  blocks: [blk('b1', -10, 50, 'Pharmacology lecture'), blk('b2', 120, 180, 'Study group'), blk('b0', -200, -100, 'Over already'), blk('b3', 240, 300)],
  top3: [{ id: 't1', title: 'Finish the pharmacology summary', goal: true, done: false }, { id: 't2', title: 'Lab report', done: true }, { id: 't3', title: 'Call mum' }],
  ...over,
})
const build = (d: SharedDay | undefined, c: Connection | null = conn(), hideTitles = false) => buildPartner({ conn: c, day: d, readAt: NOW.getTime(), now: NOW, hideTitles })

describe('Her day widget snapshot', () => {
  it('Details: now, what is next in order, her goal and the Top 3 count; a block already over is not kept', () => {
    const p = build(day('details'))!
    expect(p.name).toBe('Reem')
    expect(p.blocks.map((b) => b.title)).toEqual(['Pharmacology lecture', 'Study group', null])
    expect(p.goal).toEqual({ title: 'Finish the pharmacology summary', done: false })
    expect(p.top).toEqual({ done: 1, total: 3 })
  })
  it('Titles and Busy: no goal and no Top 3 (the server never sent them), and a Busy block keeps no title', () => {
    const t = build(day('titles', { top3: undefined }))!
    expect(t.goal).toBeNull()
    expect(t.top).toBeNull()
    expect(t.blocks[0].title).toBe('Pharmacology lecture')
    const b = build(day('busy', { top3: undefined, blocks: [blk('b1', -10, 50), blk('b2', 120, 180)] }))!
    expect(b.blocks.every((x) => x.title === null)).toBe(true)
  })
  it('hide titles on this phone masks every name, her goal too', () => {
    const p = build(day('details'), conn(), true)!
    expect(p.blocks.every((b) => b.title === null)).toBe(true)
    expect(p.goal).toEqual({ title: null, done: false })
  })
  it('a pause: her name and when it ends, no blocks, no goal', () => {
    const until = new Date(NOW.getTime() + 3 * 3_600_000).toISOString()
    const p = build(day('details'), conn({ paused_until: until }))!
    expect(p).toMatchObject({ paused: true, pausedUntil: Date.parse(until), blocks: [], goal: null, top: null })
    expect(build(day('details'), conn({ paused_until: 'infinity' }))).toMatchObject({ paused: true, pausedUntil: 0 })
  })
  it('a revoke or no connection leaves nothing: null, not the last copy', () => {
    expect(build(day('details'), null)).toBeNull()
    expect(build({ level: null }, conn())).toBeNull()
    expect(build(undefined, conn())).toBeNull()
  })
  it('a lowered level shows the lower level on the next read', () => {
    expect(build(day('details'))!.top).not.toBeNull()
    expect(build(day('busy', { top3: undefined, blocks: [blk('b1', -10, 50)] }))!.top).toBeNull()
  })
  it('out of date: after 24 hours, and not before', () => {
    const p = build(day('details'))!
    expect(partnerStale(p, NOW.getTime() + PARTNER_STALE_MS)).toBe(false)
    expect(partnerStale(p, NOW.getTime() + PARTNER_STALE_MS + 1)).toBe(true)
  })
  it('a Partner is shown first, else whoever has their day on Today, else nobody', () => {
    const fam = conn({ circle_id: 'c2', relation: 'family', partner_id: 'u3', show_day: false })
    const fr = conn({ circle_id: 'c3', relation: 'friend', partner_id: 'u4', show_day: true })
    expect(pickPartner([fam, fr, conn()])?.partner_id).toBe('u2')
    expect(pickPartner([fam, fr])?.partner_id).toBe('u4')
    expect(pickPartner([fam])).toBeNull()
  })
})

describe('her colour on the widget', () => {
  it('the snapshot carries the colour you gave her as a swatch name, Heather by default', () => {
    expect(build(day('details'))!.color).toBe('heather')
    expect(build(day('details'), conn({ color: '#E58F99' }))!.color).toBe('rose')
    expect(build(day('details'), conn({ color: '#E58F99', paused_until: 'infinity' }))).toMatchObject({ paused: true, color: 'rose' })
    expect(swatchOf('#000000')).toBe('heather') // not one of the 16: Heather, so the widget always has a drawable
    expect(swatchOf(undefined)).toBe('heather')
  })
})
