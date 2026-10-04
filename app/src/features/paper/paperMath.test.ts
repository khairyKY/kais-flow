import { describe, expect, it } from 'vitest'
import {
  addedSummary, cropFrame, fitWithin, hasClock, matchProject, needsCheck, planWrites, rotatedSize, scansLeft, shouldResume, toEditLine,
  type CaptureRow, type PageLine,
} from './paperMath'
import type { Project } from '../../lib/types'

const project = (id: string, name: string, domain_id: string | null = 'd1') => ({ id, name, domain_id }) as Project
const PROJECTS = [project('p-os', 'Operating Systems'), project('p-kf', "Kai's Flow", 'd2'), project('p-x', 'X')]
// Sunday 4 Oct 2026, 10:00 in Cairo (UTC+3) — the photo of "OS lecture 3".
const TAKEN = new Date('2026-10-04T07:00:00Z')
const line = (text: string, over: Partial<PageLine> = {}): PageLine => ({ text, type: 'task', when: null, project: null, confidence: 0.9, box: null, page: 0, ...over })

describe('resize maths', () => {
  it('caps the long edge at 1600 and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ w: 1200, h: 1600 })
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(0, 0)).toEqual({ w: 1, h: 1 })
  })
  it('a quarter turn swaps the canvas sides, a half turn does not', () => {
    expect(rotatedSize(1600, 1200, 90)).toEqual({ w: 1200, h: 1600 })
    expect(rotatedSize(1600, 1200, 270)).toEqual({ w: 1200, h: 1600 })
    expect(rotatedSize(1600, 1200, 180)).toEqual({ w: 1600, h: 1200 })
    expect(rotatedSize(1600, 1200, -90)).toEqual({ w: 1200, h: 1600 })
  })
})

describe('box → crop', () => {
  it('frames the padded box at the asked height, the image offset inside it', () => {
    // A 1200×1600 page; the line sits at x 10%, y 25%, 60% wide, 4% tall; no pad.
    const f = cropFrame([0.1, 0.25, 0.6, 0.04], 1200, 1600, 32, 0)
    expect(f.height).toBe(32)
    expect(f.width).toBe(360) // 0.6×1200 = 720 image px at 0.5 px per px
    expect(f.imgWidth).toBe(600)
    expect(f.imgLeft).toBe(-60)
    expect(f.imgTop).toBe(-200)
  })
  it('pads, but never past the edge of the photo', () => {
    const f = cropFrame([0, 0.99, 1, 0.01], 1000, 1000, 20)
    expect(f.imgLeft).toBe(0) // x clamps at 0
    expect(f.width).toBeLessThanOrEqual(f.imgWidth) // never wider than the image
    expect(-f.imgTop + f.height).toBeLessThanOrEqual(f.imgWidth + 0.1) // bottom stays on the page
  })
})

describe('confidence and the daily cap', () => {
  it('asks for a look below 0.7', () => {
    expect(needsCheck({ confidence: 0.69 })).toBe(true)
    expect(needsCheck({ confidence: 0.7 })).toBe(false)
  })
  it('scans left never goes below zero (attempts past the cap still count)', () => {
    expect(scansLeft(4)).toBe(11)
    expect(scansLeft(15)).toBe(0)
    expect(scansLeft(19)).toBe(0)
  })
})

describe('which captures to read again', () => {
  const row = (over: Partial<CaptureRow>): CaptureRow => ({
    id: 'c', storage_paths: ['u/c/0.jpg', 'u/c/1.jpg'], pages: 2, pages_read: 1, status: 'queued', error: 'rate_limited', title: null, items: [],
    reviewed_at: null, expires_at: '', photos_deleted_at: null, created_at: '2026-10-04T06:00:00Z', updated_at: '2026-10-04T06:59:00Z', ...over,
  })
  it('a rate-limited page is tried again', () => expect(shouldResume(row({}), TAKEN)).toBe(true))
  it('a daily-limit page waits for the next Cairo day', () => {
    expect(shouldResume(row({ error: 'daily_limit' }), TAKEN)).toBe(false)
    expect(shouldResume(row({ error: 'daily_limit' }), new Date('2026-10-04T21:01:00Z'))).toBe(true) // 00:01 Mon in Cairo
  })
  it('a page mid-read is left alone for two minutes', () => {
    expect(shouldResume(row({ status: 'reading', updated_at: '2026-10-04T06:59:00Z' }), TAKEN)).toBe(false)
    expect(shouldResume(row({ status: 'reading', updated_at: '2026-10-04T06:57:00Z' }), TAKEN)).toBe(true)
  })
  it('never a reviewed, finished or photo-less capture', () => {
    expect(shouldResume(row({ reviewed_at: TAKEN.toISOString() }), TAKEN)).toBe(false)
    expect(shouldResume(row({ pages_read: 2 }), TAKEN)).toBe(false)
    expect(shouldResume(row({ storage_paths: [] }), TAKEN)).toBe(false)
    expect(shouldResume(row({ status: 'done' }), TAKEN)).toBe(false)
  })
})

describe('a line → its proposed item', () => {
  it('reads clock times', () => {
    for (const w of ['Thu 11:59pm', 'today 17:00', 'Fri 5 pm', '9am', 'noon']) expect(hasClock(w), w).toBe(true)
    for (const w of ['next Sunday', 'Thu 8 Oct', null]) expect(hasClock(w), String(w)).toBe(false)
  })
  it('matches the page word to a project', () => {
    expect(matchProject('os', [project('a', 'OS')])?.id).toBe('a')
    expect(matchProject('Operating', PROJECTS)?.id).toBe('p-os')
    expect(matchProject("kai's flow paper mode", PROJECTS)?.id).toBe('p-kf')
    expect(matchProject('x', PROJECTS)).toBeNull() // one letter matches too much
    expect(matchProject('Biology', PROJECTS)).toBeNull()
  })
  it('dates the words from when the photo was taken, on the Cairo clock', () => {
    const due = toEditLine(line('Assignment 2', { when: 'Thu 11:59pm', project: 'Operating Systems' }), 1, PROJECTS, TAKEN)
    expect(due.dueAt).toBe('2026-10-08T20:59:00.000Z')
    expect(due.timed).toBe(true)
    expect(due.projectId).toBe('p-os')
    expect(due.domainId).toBe('d1')
    expect(due.key).toBe('0:1')
    const sun = toEditLine(line('Quiz', { when: 'next Sunday' }), 4, PROJECTS, TAKEN)
    expect(sun.dueAt?.slice(0, 10)).toBe('2026-10-11')
    expect(sun.timed).toBe(false)
    expect(toEditLine(line('مراجعة الفصل الثالث', { project: 'Study' }), 0, PROJECTS, TAKEN).projectLabel).toBe('Study') // unmatched: the page's word
  })
})

describe('results → writes', () => {
  const lines = [
    line('OS lecture 3 — 4 Oct', { type: 'note' }),
    line('Assignment 2', { when: 'Thu 11:59pm' }),
    line('Quiz', { type: 'event', when: 'next Sunday' }),
    line('اجتماع الفريق الساعة ٥', { type: 'event', when: 'today 17:00' }),
    line('Call the dentist', { type: 'event' }), // an event with no date waits in the Inbox
    line('tired but happy', { type: 'journal' }),
    line('lecture ran late', { type: 'journal' }),
  ].map((l, i) => toEditLine(l, i, PROJECTS, TAKEN))

  it('Add all: tasks with a link back, timed + all-day events, notes to the Inbox, one journal entry', () => {
    const plan = planWrites(lines, 'cap-1', 'all')
    expect(plan.map((p) => p.to)).toEqual(['inbox', 'task', 'event', 'event', 'inbox', 'journal'])
    expect(plan[1]).toMatchObject({ to: 'task', title: 'Assignment 2', dueAt: '2026-10-08T20:59:00.000Z', ref: 'cap-1:0:1' })
    expect(plan[2]).toMatchObject({ to: 'event', allDay: true, startsAt: '2026-10-11T00:00:00.000Z', endsAt: '2026-10-12T00:00:00.000Z' })
    expect(plan[3]).toMatchObject({ to: 'event', title: 'اجتماع الفريق الساعة ٥', allDay: false, startsAt: '2026-10-04T14:00:00.000Z', endsAt: '2026-10-04T15:00:00.000Z' })
    expect(plan[5]).toEqual({ to: 'journal', body: 'tired but happy\nlecture ran late' })
    expect(addedSummary(plan)).toBe('Added 1 task · 2 events · 2 notes · a journal entry')
  })
  it('Inbox only: every line becomes a note', () => {
    const plan = planWrites(lines, 'cap-1', 'inbox')
    expect(plan).toHaveLength(7)
    expect(plan.every((p) => p.to === 'inbox')).toBe(true)
    expect(addedSummary(plan)).toBe('Added 7 notes')
  })
  it('nothing kept, nothing written', () => {
    expect(planWrites([], 'c', 'all')).toEqual([])
    expect(addedSummary([])).toBe('Added nothing')
  })
})
