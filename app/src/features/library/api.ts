import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { queryClient } from '../../lib/queryClient'
import { toastUndo } from '../../lib/undo'
import type { Book, Note, Quote, Commentary } from '../../lib/types'

// --- Books API ---
/** `enabled` false = read only what another screen already fetched (the resurfacing card asks only when its pick needs it). */
export function useBooks(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['books'],
    queryFn: async () => {
      const { data, error } = await supabase.from('books').select('*').order('title')
      if (error) throw error
      return data as Book[]
    },
  })
}

export function createBook(title: string, author?: string | null, totalPages = 100, publishedYear?: number | null): Book {
  const book: Book = {
    id: crypto.randomUUID(),
    user_id: '',
    title,
    author: author ?? null,
    published_year: publishedYear ?? null,
    current_page: 0,
    total_pages: totalPages,
    status: 'reading',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  writeRow('books', book)
  logActivity('book.created', 'book', book.id, { title })
  return book
}

export function updateBookProgress(book: Book, currentPage: number, status?: Book['status']): void {
  const finalStatus = status || (currentPage >= book.total_pages ? 'finished' : book.status)
  const updated = {
    ...book,
    current_page: Math.min(currentPage, book.total_pages),
    status: finalStatus,
    updated_at: new Date().toISOString(),
  }
  writeRow('books', updated)
  logActivity('book.progress_updated', 'book', book.id, { current_page: currentPage, status: finalStatus })
}

/** Saves a book's edited details (title, author, pages, year — see bookFromForm). */
export function updateBook(book: Book): void {
  writeRow('books', { ...book, updated_at: new Date().toISOString() })
  logActivity('book.updated', 'book', book.id, { title: book.title })
}

export function deleteBook(id: string): void {
  const fakeRow = { id } as Book
  writeRow('books', fakeRow, 'delete')
  logActivity('book.deleted', 'book', id, {})
}

// --- Notes API ---
export function useNotes(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['notes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Note[]
    },
  })
}

export function createNote(body: string, title?: string | null, tags: string[] = [], domainId?: string | null, bookId?: string | null): Note {
  const note: Note = {
    id: crypto.randomUUID(),
    user_id: '',
    title: title ?? null,
    body,
    tags,
    domain_id: domainId ?? null,
    book_id: bookId ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  writeRow('notes', note)
  logActivity('note.created', 'note', note.id, { title })
  return note
}

export function updateNote(note: Note, fields: Partial<Note>): void {
  const updated = {
    ...note,
    ...fields,
    updated_at: new Date().toISOString(),
  }
  writeRow('notes', updated)
  logActivity('note.updated', 'note', note.id, { title: updated.title })
}

export function deleteNote(id: string): void {
  const fakeRow = { id } as Note
  writeRow('notes', fakeRow, 'delete')
  logActivity('note.deleted', 'note', id, {})
}

// --- Quotes API ---
export function useQuotes(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Quote[]
    },
  })
}

export function createQuote(text: string, author?: string | null, source?: string | null, tags: string[] = [], bookId?: string | null, page?: string | null): Quote {
  const quote: Quote = {
    id: crypto.randomUUID(),
    user_id: '',
    text,
    author: author ?? null,
    source: source ?? null,
    tags,
    book_id: bookId ?? null,
    page: page ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  writeRow('quotes', quote)
  logActivity('quote.created', 'quote', quote.id, { author, source })
  return quote
}

export function updateQuote(quote: Quote, fields: Partial<Quote>): void {
  const updated = {
    ...quote,
    ...fields,
    updated_at: new Date().toISOString(),
  }
  writeRow('quotes', updated)
  logActivity('quote.updated', 'quote', quote.id, {})
}

export function deleteQuote(id: string): void {
  const fakeRow = { id } as Quote
  writeRow('quotes', fakeRow, 'delete')
  logActivity('quote.deleted', 'quote', id, {})
}

// Remove = Undo toast, no confirm (Flow Audit §4). Undo writes the captured row back through the
// outbox: the upsert replaces a still-queued delete, or re-inserts the row once the delete went out.
// Commentary has no foreign key (0021: a bare parent_id), so a note's or quote's thoughts stay put
// and hang off the same id again.
function putBack(table: 'books' | 'notes' | 'quotes', kind: 'book' | 'note' | 'quote', row: Book | Note | Quote): void {
  writeRow(table, row)
  logActivity(`${kind}.restored`, kind, row.id, {})
}

/** The server unhooks a removed book's notes and quotes (0021: book_id `on delete set null`), so
 * they're captured too and Undo hooks them back after the book (outbox order = flush order). */
export function removeBookWithUndo(book: Book): void {
  const notes = (queryClient.getQueryData<Note[]>(['notes']) ?? []).filter((n) => n.book_id === book.id)
  const quotes = (queryClient.getQueryData<Quote[]>(['quotes']) ?? []).filter((q) => q.book_id === book.id)
  deleteBook(book.id)
  toastUndo(`Removed · ${book.title}`, () => {
    putBack('books', 'book', book)
    for (const n of notes) writeRow('notes', n)
    for (const q of quotes) writeRow('quotes', q)
  })
}

export function removeNoteWithUndo(note: Note): void {
  deleteNote(note.id)
  toastUndo(`Removed · ${note.title || 'note'}`, () => putBack('notes', 'note', note))
}

export function removeQuoteWithUndo(quote: Quote): void {
  deleteQuote(quote.id)
  toastUndo('Removed · quote', () => putBack('quotes', 'quote', quote))
}

// --- Commentary API ---
export function useCommentaries(parentType: 'note' | 'quote', parentId: string) {
  return useQuery({
    queryKey: ['commentary', parentType, parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commentary')
        .select('*')
        .eq('parent_type', parentType)
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Commentary[]
    },
    enabled: !!parentId,
  })
}

export function createCommentary(commentary: { parent_type: 'note' | 'quote'; parent_id: string; body: string }): Commentary {
  const item: Commentary = {
    id: crypto.randomUUID(),
    user_id: '',
    parent_type: commentary.parent_type,
    parent_id: commentary.parent_id,
    body: commentary.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  writeRow('commentary', item)
  // Manually update the query cache so it updates instantly
  queryClient.setQueryData<Commentary[]>(['commentary', item.parent_type, item.parent_id], (old = []) => {
    return [...old, item]
  })
  logActivity('commentary.created', 'commentary', item.id, { parent_type: item.parent_type })
  return item
}
