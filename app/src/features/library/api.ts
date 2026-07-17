import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { queryClient } from '../../lib/queryClient'
import type { Book, Note, Quote, Commentary } from '../../lib/types'

// --- Books API ---
export function useBooks() {
  return useQuery({
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

export function deleteBook(id: string): void {
  const fakeRow = { id } as Book
  writeRow('books', fakeRow, 'delete')
  logActivity('book.deleted', 'book', id, {})
}

// --- Notes API ---
export function useNotes() {
  return useQuery({
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
export function useQuotes() {
  return useQuery({
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
