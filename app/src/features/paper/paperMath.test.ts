import { describe, expect, it } from 'vitest'
import {
  addedSummary, cropFrame, editLines, fitWithin, hasClock, isHeic, matchProject, movePage, needsCheck, placeEdit, planWrites, rotatedSize, scansLeft, shouldResume, toEditLine, toggleKey,
  type CaptureRow, type PageLine,
} from './paperMath'
import { imageFiles } from './image'
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
    const f = cropFrame([0.1, 0.25, 0.6, 0.04], 1200, 1600, 32, Infinity, 0)
    expect(f.height).toBe(32)
    expect(f.width).toBe(360) // 0.6×1200 = 720 image px at 0.5 px per px
    expect(f.imgWidth).toBe(600)
    expect(f.imgLeft).toBe(-60)
    expect(f.imgTop).toBe(-200)
  })
  it('a long line gets shorter rather than wider than the row', () => {
    const f = cropFrame([0.1, 0.25, 0.6, 0.04], 1200, 1600, 32, 180, 0)
    expect(f.width).toBe(180)
    expect(f.height).toBe(16)
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

describe('chip edits, selection, page order, HEIC (the 11c–11f gaps)', () => {
  it('an edit merges over the read; the same edit lands on every selected line', () => {
    const e1 = editLines({}, ['0:1'], { type: 'event' })
    const e2 = editLines(e1, ['0:1', '0:4'], { priority: 1 })
    expect(e2).toEqual({ '0:1': { type: 'event', priority: 1 }, '0:4': { priority: 1 } })
    expect(e1).toEqual({ '0:1': { type: 'event' } }) // never mutated
    expect(editLines(e2, [], { dropped: true })).toEqual(e2)
  })
  it('long-press selection toggles one line in and out', () => {
    const one = toggleKey(new Set(), '0:3')
    expect([...one]).toEqual(['0:3'])
    expect([...toggleKey(one, '0:5')]).toEqual(['0:3', '0:5'])
    expect(toggleKey(one, '0:3').size).toBe(0)
    expect([...one]).toEqual(['0:3']) // a new set each time
  })
  it('Move to… → the line’s place: a project, an area, a domain, or nothing', () => {
    expect(placeEdit({ kind: 'project', id: 'p1', domainId: 'd1', name: 'OS' })).toEqual({ projectId: 'p1', areaId: null, domainId: 'd1', projectLabel: 'OS' })
    expect(placeEdit({ kind: 'area', id: 'a1', domainId: 'd1', name: 'Health' })).toEqual({ projectId: null, areaId: 'a1', domainId: 'd1', projectLabel: 'Health' })
    expect(placeEdit({ kind: 'domain', id: 'd2', name: 'Work' })).toEqual({ projectId: null, areaId: null, domainId: 'd2', projectLabel: 'Work' })
    expect(placeEdit({ kind: 'none', name: 'None' })).toEqual({ projectId: null, areaId: null, domainId: null, projectLabel: null })
  })
  it('edited chips reach the writes: priority, area, a picked date (all-day event on that user day)', () => {
    const read = toEditLine(line('Assignment 2', { when: 'Thu 11:59pm', priority: 1 }), 1, PROJECTS, TAKEN)
    expect(read.priority).toBe(1)
    expect(toEditLine(line('pens'), 2, PROJECTS, TAKEN).priority).toBeNull() // older reads have none
    const task = { ...read, ...placeEdit({ kind: 'area', id: 'a1', domainId: 'd1', name: 'Health' }), priority: 2 }
    expect(planWrites([task], 'c', 'all')[0]).toMatchObject({ to: 'task', projectId: null, areaId: 'a1', domainId: 'd1', priority: 2 })
    // The date picker's "Sat 10 Oct", untimed (09:00 Cairo = 06:00Z): an Event becomes all-day on the 10th.
    const quiz = { ...toEditLine(line('Quiz', { when: 'next Sunday' }), 4, PROJECTS, TAKEN), type: 'event' as const, dueAt: '2026-10-10T06:00:00.000Z', timed: false }
    expect(planWrites([quiz], 'c', 'all')[0]).toMatchObject({ to: 'event', allDay: true, startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-11T00:00:00.000Z' })
    const timed = { ...quiz, dueAt: '2026-10-10T15:30:00.000Z', timed: true }
    expect(planWrites([timed], 'c', 'all')[0]).toMatchObject({ to: 'event', allDay: false, startsAt: '2026-10-10T15:30:00.000Z', endsAt: '2026-10-10T16:30:00.000Z' })
  })
  it('a page dropped on another’s place; the page on screen stays on screen', () => {
    const P = ['a', 'b', 'c', 'd']
    expect(movePage(P, 0, 0, 2)).toEqual({ pages: ['b', 'c', 'a', 'd'], active: 2 }) // the shown page moved with it
    expect(movePage(P, 1, 0, 2)).toEqual({ pages: ['b', 'c', 'a', 'd'], active: 0 }) // b slid left
    expect(movePage(P, 3, 0, 2).active).toBe(3) // d didn't move
    expect(movePage(P, 0, 3, 0)).toEqual({ pages: ['d', 'a', 'b', 'c'], active: 1 })
    expect(movePage(P, 2, 2, 1)).toEqual({ pages: ['a', 'c', 'b', 'd'], active: 1 })
    expect(movePage(P, 1, 1, 1)).toEqual({ pages: P, active: 1 })
    expect(movePage(P, 1, 0, 9)).toEqual({ pages: P, active: 1 }) // off the strip: nothing moves
    expect(movePage(P, 1, -1, 2).pages).toEqual(P) // ⌥← on the first page
  })
  it('HEIC: by type, or by name when the browser gives no type', () => {
    expect(isHeic({ type: 'image/heic', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(isHeic({ type: 'image/heif' })).toBe(true)
    expect(isHeic({ type: 'image/heic-sequence' })).toBe(true)
    expect(isHeic({ type: '', name: 'IMG_0001.heic' })).toBe(true) // Chromium on Windows
    expect(isHeic({ type: 'application/octet-stream', name: 'page.HEIF' })).toBe(true)
    expect(isHeic({ type: 'image/jpeg', name: 'IMG_0001.jpg' })).toBe(false)
    expect(isHeic({ type: '', name: 'notes.heic.txt' })).toBe(false)
    expect(isHeic({ type: 'image/png' })).toBe(false)
  })
  it('a HEIC with no type still reaches the quick look; other non-images stay out', () => {
    const f = (name: string, type: string) => new File(['x'], name, { type })
    const kept = imageFiles([f('a.jpg', 'image/jpeg'), f('b.heic', ''), f('c.pdf', 'application/pdf'), f('d.HEIC', 'image/heic'), f('e.txt', '')])
    expect(kept.map((x) => x.name)).toEqual(['a.jpg', 'b.heic', 'd.HEIC'])
  })
})
