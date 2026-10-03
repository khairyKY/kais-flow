// Goodreads adapter — My Books → Import and export → Export Library (goodreads_library_export.csv).
// Pure, no app imports.
//
//   Title, Author                       → books.title / author
//   Number of Pages                     → total_pages (unknown → the wizard's 100, createBook's default)
//   Original Publication Year | Year Published → published_year
//   Exclusive Shelf  read               → finished, read to the last page
//                    currently-reading  → reading, page 0
//                    to-read (and any custom shelf) → only on the preview's opt-in, as reading, page 0
//   My Review / Private Notes / My Rating → one note on the book (with the WHOLE row in its
//                                          external_ref.raw) — books has no external_ref column,
//                                          so a rating with no review isn't kept anywhere.
//   ISBNs, dates, Bookshelves, Read Count … → that note's raw, when there is one.

import { parseCsv } from './csv'
import { type ImportBatch, type ImportBook, type ImportNote, stableHash, stripBreaks, eachChunked, emptyBatch } from './shared'

const SHELF: Record<string, ImportBook['shelf']> = { read: 'read', 'currently-reading': 'reading' }

export async function parseGoodreads(text: string): Promise<ImportBatch> {
  const [header = [], ...rows] = parseCsv(text)
  const col = (name: string) => header.indexOf(name)
  const C = {
    id: col('Book Id'), title: col('Title'), author: col('Author'), pages: col('Number of Pages'),
    original: col('Original Publication Year'), year: col('Year Published'), shelf: col('Exclusive Shelf'),
    rating: col('My Rating'), review: col('My Review'), privateNotes: col('Private Notes'),
  }
  if (C.title < 0 || C.shelf < 0) throw new Error('not a Goodreads library export')

  const books: ImportBook[] = []
  const notes: ImportNote[] = []
  await eachChunked(rows, (r) => {
    const cell = (i: number) => (i < 0 ? '' : (r[i] ?? '').trim())
    const title = cell(C.title)
    if (!title) return
    const num = (i: number) => {
      const n = parseInt(cell(i), 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    books.push({
      title,
      author: cell(C.author) || null,
      published_year: num(C.original) ?? num(C.year),
      total_pages: num(C.pages),
      shelf: SHELF[cell(C.shelf)] ?? 'to-read',
    })

    const rating = num(C.rating)
    const review = stripBreaks(cell(C.review))
    const priv = stripBreaks(cell(C.privateNotes))
    if (review || priv) {
      const body = [rating ? `My rating: ${rating}/5` : '', review, priv ? `Private notes: ${priv}` : ''].filter(Boolean).join('\n\n')
      const raw = Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))
      notes.push({ title: `${title} — review`, body, tags: ['goodreads'], book: title, external_ref: { source: 'goodreads', id: `review:${cell(C.id) || stableHash(title)}`, raw } })
    }
  })

  return { ...emptyBatch('goodreads'), books, notes }
}
