import { describe, expect, it } from 'vitest'
import { afterPage, buildPrompt, normaliseBox, normaliseRead, ownsPath, retryDelayMs, type PageLine } from '../../../../supabase/functions/capture-image/read.ts'

// The capture-image edge function's pure half (Deno isn't on this machine; the app's vitest runs it).

describe('capture-image: the prompt', () => {
  it('names the projects, keeps each line in its own language, and asks for 0–1000 boxes', () => {
    const p = buildPrompt(['Operating Systems', 'Shaheen'])
    expect(p).toContain('- Operating Systems')
    expect(p).toMatch(/Never translate/)
    expect(p).toMatch(/Arabic/)
    expect(p).toMatch(/\[x1, y1, x2, y2\] on a 0–1000 grid/)
    expect(buildPrompt([])).toContain('(none)')
  })
})

describe('capture-image: boxes', () => {
  it('turns the model’s 0–1000 corners into 0–1 [x, y, w, h]', () => {
    expect(normaliseBox([100, 250, 700, 290])).toEqual([0.1, 0.25, 0.6, 0.04])
  })
  it('takes already-normalised corners as they are', () => {
    expect(normaliseBox([0.1, 0.25, 0.7, 0.29])).toEqual([0.1, 0.25, 0.6, 0.04])
  })
  it('clamps to the page and drops empty or malformed boxes', () => {
    expect(normaliseBox([900, 900, 1200, 1100])).toEqual([0.9, 0.9, 0.1, 0.1])
    expect(normaliseBox([500, 500, 400, 600])).toBeNull() // x2 < x1
    expect(normaliseBox([1, 2, 3])).toBeNull()
    expect(normaliseBox(['1', 2, 3, 4])).toBeNull()
    expect(normaliseBox(null)).toBeNull()
  })
})

describe('capture-image: the answer → lines', () => {
  it('keeps text (Arabic too), defaults an unknown type to note, clamps confidence, tags the page', () => {
    const read = normaliseRead(
      {
        readable: true,
        title: ' OS lecture 3 — 4 Oct ',
        lines: [
          { text: 'Assignment 2 due Thu 11:59pm', type: 'task', when: 'Thu 11:59pm', project: 'OS', confidence: 0.94, box: [80, 120, 820, 160] },
          { text: 'اجتماع الفريق الساعة ٥', type: 'event', when: 'today 17:00', project: null, confidence: 0.62, box: [100, 300, 900, 340] },
          { text: 'idea: paper mode', type: 'idea', confidence: 7 },
          { text: '   ', type: 'task' },
          'junk',
        ],
      },
      2,
    )
    expect(read.readable).toBe(true)
    expect(read.title).toBe('OS lecture 3 — 4 Oct')
    expect(read.lines.map((l) => [l.text, l.type, l.confidence, l.page])).toEqual([
      ['Assignment 2 due Thu 11:59pm', 'task', 0.94, 2],
      ['اجتماع الفريق الساعة ٥', 'event', 0.62, 2],
      ['idea: paper mode', 'note', 1, 2],
    ])
    expect(read.lines[2].box).toBeNull()
    expect(read.lines[1].when).toBe('today 17:00')
  })
  it('a blank or unreadable page has no lines', () => {
    expect(normaliseRead({ readable: false, lines: [] }, 0)).toEqual({ readable: false, title: null, lines: [] })
    expect(normaliseRead('not json', 0).readable).toBe(false)
    expect(normaliseRead({ lines: [{ text: 'x', type: 'task' }] }, 0).readable).toBe(true) // readable defaults to yes
  })
  it('caps a runaway answer at 40 lines', () => {
    expect(normaliseRead({ lines: Array.from({ length: 90 }, (_, i) => ({ text: `l${i}` })) }, 0).lines).toHaveLength(40)
  })
})

describe('capture-image: Groq 429 backoff', () => {
  it('honours retry-after, else 2s then 4s, never past 20s, and stops after the third try', () => {
    expect(retryDelayMs(1, '3')).toBe(3000)
    expect(retryDelayMs(1, '0.2')).toBe(500)
    expect(retryDelayMs(1, null)).toBe(2000)
    expect(retryDelayMs(2, null)).toBe(4000)
    expect(retryDelayMs(1, '90')).toBe(20000)
    expect(retryDelayMs(3, null)).toBeNull()
  })
})

describe('capture-image: the row after a page', () => {
  const l = (text: string, page: number): PageLine => ({ text, type: 'task', when: null, project: null, confidence: 0.9, box: null, page })
  it('reading until the last page, then done', () => {
    const one = afterPage({ pages: 2, pages_read: 0, items: [] }, 0, { readable: true, title: null, lines: [l('a', 0)] })
    expect(one).toMatchObject({ pages_read: 1, status: 'reading', error: null })
    const two = afterPage({ pages: 2, ...one }, 1, { readable: true, title: null, lines: [l('b', 1)] })
    expect(two).toMatchObject({ pages_read: 2, status: 'done', error: null })
    expect(two.items.map((i) => i.text)).toEqual(['a', 'b'])
  })
  it('a re-read replaces that page’s lines instead of doubling them', () => {
    const again = afterPage({ pages: 1, pages_read: 1, items: [l('old', 0)] }, 0, { readable: true, title: null, lines: [l('new', 0)] })
    expect(again.items.map((i) => i.text)).toEqual(['new'])
  })
  it('nothing on any page is "couldn’t read"', () => {
    expect(afterPage({ pages: 1, pages_read: 0, items: [] }, 0, { readable: false, title: null, lines: [] })).toMatchObject({ status: 'failed', error: 'unreadable' })
  })
})

describe('capture-image: storage paths', () => {
  const uid = '00000000-0000-4000-8000-00000000d3e0'
  const cid = '11111111-2222-4333-8444-555555555555'
  it('only the caller’s own folder, this capture, a numbered image', () => {
    expect(ownsPath(`${uid}/${cid}/0.jpg`, uid, cid)).toBe(true)
    expect(ownsPath(`${uid}/${cid}/4.webp`, uid, cid)).toBe(true)
    expect(ownsPath(`other/${cid}/0.jpg`, uid, cid)).toBe(false)
    expect(ownsPath(`${uid}/${cid}/../x/0.jpg`, uid, cid)).toBe(false)
    expect(ownsPath(`${uid}/${cid}/0.jpg.exe`, uid, cid)).toBe(false)
    expect(ownsPath(`${uid}/other/0.jpg`, uid, cid)).toBe(false)
  })
})
