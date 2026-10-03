import { describe, expect, it } from 'vitest'
import { parseGoodreads } from './goodreads'

// goodreads_library_export.csv's real header and quirks (="…" ISBNs, <br/> in reviews, blank
// page counts, custom shelves). Hand-written rows.
const csv = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '54785515,"Four Thousand Weeks: Time Management for Mortals",Oliver Burkeman,"Burkeman, Oliver",,"=""0374159122""","=""9780374159122""",5,4.18,"Farrar, Straus and Giroux",Hardcover,288,2021,2021,2026/09/12,2026/08/01,,,read,"Changed how I plan.<br/><br/>Re-read yearly.",,,1,0',
  '44767458,"Dune (Dune, #1)",Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.27,Ace,Paperback,,2019,1965,,2026/09/20,currently-reading,currently-reading (#1),currently-reading,,,,0,0',
  '40121378,The Overstory,Richard Powers,"Powers, Richard",,"=""039363552X""","=""9780393635522""",0,4.06,W. W. Norton,Hardcover,502,2018,2018,,2026/07/01,to-read,to-read (#3),to-read,,,Ask Lina about it,0,0',
  '11111111,Half a Book,Some Author,"Author, Some",,,,2,3.10,,Paperback,200,2010,,,2026/05/05,did-not-finish,did-not-finish (#1),did-not-finish,,,,0,0',
].join('\n')

const batch = await parseGoodreads(csv)

describe('parseGoodreads', () => {
  it('every titled row is a book; shelves map read/reading/to-read (custom shelves wait as to-read)', () => {
    expect(batch.books).toEqual([
      { title: 'Four Thousand Weeks: Time Management for Mortals', author: 'Oliver Burkeman', published_year: 2021, total_pages: 288, shelf: 'read' },
      { title: 'Dune (Dune, #1)', author: 'Frank Herbert', published_year: 1965, total_pages: null, shelf: 'reading' },
      { title: 'The Overstory', author: 'Richard Powers', published_year: 2018, total_pages: 502, shelf: 'to-read' },
      { title: 'Half a Book', author: 'Some Author', published_year: 2010, total_pages: 200, shelf: 'to-read' },
    ])
  })

  it('a review or private notes become one note on the book, with the whole row in raw', () => {
    expect(batch.notes.map((n) => [n.book, n.body])).toEqual([
      ['Four Thousand Weeks: Time Management for Mortals', 'My rating: 5/5\n\nChanged how I plan.\n\nRe-read yearly.'],
      ['The Overstory', 'Private notes: Ask Lina about it'],
    ])
    expect(batch.notes[0].external_ref).toMatchObject({ source: 'goodreads', id: 'review:54785515', raw: { ISBN13: '="9780374159122"', 'Date Read': '2026/09/12' } })
  })

  it('rejects a CSV that is not a Goodreads export', async () => {
    await expect(parseGoodreads('Title,Due\nx,y')).rejects.toThrow()
  })
})
