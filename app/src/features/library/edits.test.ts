import { describe, expect, it } from 'vitest'
import { bookFromForm, parseTags } from './edits'
import type { Book } from '../../lib/types'

const book: Book = {
  id: 'b1',
  user_id: 'u',
  title: 'Dune',
  author: 'Herbert',
  published_year: 1965,
  current_page: 300,
  total_pages: 412,
  status: 'reading',
  created_at: 'x',
  updated_at: 'x',
}

describe('Library edits', () => {
  it('parses comma tags, dropping blanks and a leading *', () => {
    expect(parseTags(' *pace, focus , ,')).toEqual(['pace', 'focus'])
  })

  it('applies a book edit', () => {
    expect(bookFromForm(book, { title: ' Dune Messiah ', author: '', pages: '256', year: '1969' })).toEqual({
      ...book,
      title: 'Dune Messiah',
      author: null,
      total_pages: 256,
      published_year: 1969,
      current_page: 256,
    })
  })

  it('keeps the page count on bad input, clears a blank year, refuses an empty title', () => {
    expect(bookFromForm(book, { title: 'Dune', author: 'Herbert', pages: 'abc', year: '' })).toMatchObject({ total_pages: 412, published_year: null, current_page: 300 })
    expect(bookFromForm(book, { title: 'Dune', author: 'Herbert', pages: '0', year: '1965' })?.total_pages).toBe(412)
    expect(bookFromForm(book, { title: '  ', author: '', pages: '1', year: '' })).toBeNull()
  })
})
