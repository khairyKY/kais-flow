import type { Book } from '../../lib/types'

// Edit-after-create for the Library (Kai 2026-10-12): books, notes and quotes open their inline
// edit card prefilled; these turn its text fields back into row fields.

/** "a, *b , ,c" → ["a", "b", "c"]: the Add forms' comma-separated tags, a leading * dropped. */
export function parseTags(text: string): string[] {
  return text.split(',').map((s) => s.trim().replace(/^\*/, '')).filter(Boolean)
}

/** A book's edited details, or null when the title is emptied. A page count that isn't a whole
 * number ≥ 1 keeps the old one; a blank year clears it. Pages read can't run past the new total. */
export function bookFromForm(book: Book, v: { title: string; author: string; pages: string; year: string }): Book | null {
  const title = v.title.trim()
  if (!title) return null
  const pages = Number.parseInt(v.pages, 10)
  const total = Number.isFinite(pages) && pages >= 1 ? pages : book.total_pages
  const year = Number.parseInt(v.year, 10)
  return {
    ...book,
    title,
    author: v.author.trim() || null,
    total_pages: total,
    published_year: v.year.trim() && Number.isFinite(year) ? year : null,
    current_page: Math.min(book.current_page, total),
  }
}
