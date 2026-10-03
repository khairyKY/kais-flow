import { describe, expect, it } from 'vitest'
import { parseKindle } from './kindle'

// "My Clippings.txt" as a Kindle writes it: BOM, CRLF, UK and US "Added on" formats, page+location
// and location-only metas, an extended highlight (Kindle appends the edit, the old one stays),
// an exact re-highlight, a note, an empty bookmark, a personal document with no author.
const clip = (head: string, meta: string, text: string) => [head, meta, '', text, '=========='].join('\r\n')
const FTW = 'Four Thousand Weeks: Time Management for Mortals (Burkeman, Oliver)'
const DUNE = 'Dune (Dune Chronicles Book 1) (Frank Herbert)'
const text = '﻿' + [
  clip(FTW, '- Your Highlight on page 12 | Location 170-172 | Added on Monday, 5 October 2026 07:12:44', 'The average human lifespan is absurdly, terrifyingly, insultingly short.'),
  clip(FTW, '- Your Highlight on page 12 | Location 170-174 | Added on Monday, 5 October 2026 07:13:02', 'The average human lifespan is absurdly, terrifyingly, insultingly short. Here’s one way of putting things in perspective.'),
  clip(FTW, '- Your Note on page 12 | Location 174 | Added on Monday, 5 October 2026 07:13:40', 'Use this in the talk'),
  clip(FTW, '- Your Bookmark on page 40 | Location 610 | Added on Monday, 5 October 2026 08:00:00', ''),
  clip(DUNE, '- Your Highlight at location 1200-1201 | Added on Sunday, October 4, 2026 9:15:00 PM', 'I must not fear. Fear is the mind-killer.'),
  clip(DUNE, '- Your Highlight at location 1300-1302 | Added on Sunday, October 4, 2026 9:20:00 PM', 'The mystery of life isn’t a problem to solve, but a reality to experience.'),
  clip(DUNE, '- Your Highlight at location 1300-1302 | Added on Sunday, October 4, 2026 9:21:00 PM', 'The mystery of life isn’t a problem to solve, but a reality to experience.'),
  clip('My Clipped Article', '- Your Highlight on Location 5-6 | Added on Saturday, 3 October 2026 10:00:00', 'Plain documents have no author.'),
].join('\r\n') + '\r\n'

const batch = await parseKindle(text)

describe('parseKindle', () => {
  it('one Library book per title, author out of the trailing parentheses ("Last, First" flipped)', () => {
    expect(batch.books).toEqual([
      { title: 'Four Thousand Weeks: Time Management for Mortals', author: 'Oliver Burkeman', published_year: null, total_pages: null, shelf: 'reading' },
      { title: 'Dune (Dune Chronicles Book 1)', author: 'Frank Herbert', published_year: null, total_pages: null, shelf: 'reading' },
      { title: 'My Clipped Article', author: null, published_year: null, total_pages: null, shelf: 'reading' },
    ])
  })

  it('highlights → quotes; an edited highlight keeps only its last version; re-highlights collapse', () => {
    expect(batch.quotes.map((q) => [q.book.slice(0, 4), q.text.slice(0, 24), q.page])).toEqual([
      ['Four', 'The average human lifesp', '12'],
      ['Dune', 'I must not fear. Fear is', 'loc 1200-1201'],
      ['Dune', 'The mystery of life isn’', 'loc 1300-1302'],
      ['My C', 'Plain documents have no ', 'loc 5-6'],
    ])
    expect(batch.quotes[0].text).toMatch(/perspective\.$/)
    expect(batch.quotes[1].author).toBe('Frank Herbert')
  })

  it('notes → notes on their book; bookmarks skipped', () => {
    expect(batch.notes).toEqual([expect.objectContaining({ body: 'Use this in the talk', book: 'Four Thousand Weeks: Time Management for Mortals', tags: ['kindle'] })])
    expect(batch.notes[0].external_ref.raw).toMatchObject({ meta: expect.stringContaining('Location 174') })
  })

  it('note ids are stable across parses', async () => {
    expect((await parseKindle(text)).notes[0].external_ref.id).toBe(batch.notes[0].external_ref.id)
  })

  it('rejects a file that is not My Clippings.txt', async () => {
    await expect(parseKindle('just some text\nwith lines')).rejects.toThrow()
  })
})
