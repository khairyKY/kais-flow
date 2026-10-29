import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { BackLink, Button, SectionLabel, Segmented } from '../../components/kit'
import { Skeleton, ErrorCard } from '../../components/States'
import {
  useBooks,
  createBook,
  updateBookProgress,
  updateBook,
  removeBookWithUndo,
  useNotes,
  createNote,
  updateNote,
  removeNoteWithUndo,
  useQuotes,
  createQuote,
  updateQuote,
  removeQuoteWithUndo,
  useCommentaries,
  createCommentary
} from './api'
import { useJournalEntries } from '../journal/api'
import { exitAll, useMotionEnabled, staggerDelay } from '../../lib/motion'
import '../projects/xfx.css'
import { LibraryEditForm } from './LibraryEditForm'
import { bookFromForm, parseTags } from './edits'
import type { Book, Note, Quote } from '../../lib/types'
import '../../components/pageMotion.css' // O10 list ↔ reader

/** The three desktop panes (shelf 230 + list 220 + a readable reader) need this much of the page.
 * At 150% interface size a 1280px window leaves the page ~611 CSS px (the root zoom shrinks it,
 * but media queries still see 1280), so the reader pushed the page sideways. */
const THREE_PANES_MIN = 880

/** A phone, or a page too narrow for three panes: both get the single-column layout.
 * ds-ok: not a copy of the kit's useIsMobile, which only reads the viewport; this one also watches the page width. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const page = document.querySelector('.app-main-content')
    const on = () => setIsMobile(mq.matches || (!!page && page.clientWidth < THREE_PANES_MIN))
    on()
    mq.addEventListener('change', on)
    const ro = page && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(on) : null
    if (page) ro?.observe(page)
    return () => {
      mq.removeEventListener('change', on)
      ro?.disconnect()
    }
  }, [])
  return isMobile
}

function getFernImage(progressPercent: number): string {
  if (progressPercent < 25) return '/ds/assets/fern/coil.png'
  if (progressPercent < 50) return '/ds/assets/fern/unfurl1.png'
  if (progressPercent < 75) return '/ds/assets/fern/unfurl2.png'
  return '/ds/assets/fern/full.png'
}

export function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Queries
  const booksQ = useBooks()
  const notesQ = useNotes()
  const quotesQ = useQuotes()
  const { data: books = [] } = booksQ
  const { data: notes = [] } = notesQ
  const { data: quotes = [] } = quotesQ
  const { data: journalEntries = [] } = useJournalEntries()
  const dailyPagesCount = journalEntries.filter((e) => !e.deleted_at).length

  // Selection states (from query params)
  const activeTab = searchParams.get('tab') || 'quotes' // 'notes' | 'quotes' | 'books'
  const selectedQuoteId = searchParams.get('quoteId')
  const selectedNoteId = searchParams.get('noteId')
  const selectedBookId = searchParams.get('bookId')

  // Search input state
  const [searchQuery, setSearchQuery] = useState('')

  // Inline creation states
  const [showNewBookForm, setShowNewBookForm] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookAuthor, setNewBookAuthor] = useState('')
  const [newBookPages, setNewBookPages] = useState('200')
  const [newBookYear, setNewBookYear] = useState('')

  const [showLogSession, setShowLogSession] = useState(false)
  const [sessionPage, setSessionPage] = useState('')

  const [showAddQuote, setShowAddQuote] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuotePage, setNewQuotePage] = useState('')
  const [newQuoteTags, setNewQuoteTags] = useState('')

  const [showAddNote, setShowAddNote] = useState(false)
  const [newNoteBody, setNewNoteBody] = useState('')
  const [newNoteTitleState, setNewNoteTitleState] = useState('')
  const [newNoteTags, setNewNoteTags] = useState('')

  // Selected item resolutions
  const activeQuote = useMemo(() => {
    if (selectedQuoteId) return quotes.find((q) => q.id === selectedQuoteId) || null
    return quotes[0] || null
  }, [quotes, selectedQuoteId])

  const activeNote = useMemo(() => {
    if (selectedNoteId) return notes.find((n) => n.id === selectedNoteId) || null
    return notes[0] || null
  }, [notes, selectedNoteId])

  const activeBook = useMemo(() => {
    if (selectedBookId) return books.find((b) => b.id === selectedBookId) || null
    return null
  }, [books, selectedBookId])

  // Commentary Queries
  const parentTypeForCommentary = selectedNoteId ? 'note' : 'quote'
  const parentIdForCommentary = selectedNoteId ? (activeNote?.id || '') : (activeQuote?.id || '')
  
  const { data: commentaries = [] } = useCommentaries(
    parentTypeForCommentary,
    parentIdForCommentary
  )

  const [newThoughtText, setNewThoughtText] = useState('')

  // Edit-after-create (Kai 2026-10-12): the id of the book / note / quote whose inline edit card
  // is open. Keyed by id, so moving to another item closes it.
  const [editingId, setEditingId] = useState<string | null>(null)
  const closeEdit = () => setEditingId(null)
  const editChip = (id: string) => (
    <span onClick={() => setEditingId((cur) => (cur === id ? null : id))} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>Edit</span>
  )
  const bookEditForm = (b: Book) => (
    <LibraryEditForm
      key={b.id}
      title="Edit book"
      fields={[
        { key: 'title', label: 'Title', value: b.title },
        { key: 'author', label: 'Author', value: b.author ?? '' },
        { key: 'pages', label: 'Total pages', value: String(b.total_pages) },
        { key: 'year', label: 'Year', value: b.published_year ? String(b.published_year) : '' },
      ]}
      onCancel={closeEdit}
      onSave={(v) => {
        const next = bookFromForm(b, { title: v.title, author: v.author, pages: v.pages, year: v.year })
        if (!next) return
        updateBook(next)
        closeEdit()
      }}
    />
  )
  const noteEditForm = (n: Note) => (
    <LibraryEditForm
      key={n.id}
      title="Edit note"
      fields={[
        { key: 'title', label: 'Title (optional)', value: n.title ?? '' },
        { key: 'body', label: 'Note', value: n.body, multiline: true },
        { key: 'tags', label: 'Tags (comma separated)', value: n.tags.join(', ') },
      ]}
      onCancel={closeEdit}
      onSave={(v) => {
        if (!v.body.trim()) return
        updateNote(n, { title: v.title.trim() || null, body: v.body.trim(), tags: parseTags(v.tags) })
        closeEdit()
      }}
    />
  )
  const quoteEditForm = (q: Quote) => (
    <LibraryEditForm
      key={q.id}
      title="Edit quote"
      fields={[
        { key: 'text', label: 'Quote', value: q.text, multiline: true },
        { key: 'author', label: 'Author', value: q.author ?? '' },
        { key: 'source', label: 'Source', value: q.source ?? '' },
        { key: 'page', label: 'Page', value: q.page ?? '' },
        { key: 'tags', label: 'Tags (comma separated)', value: q.tags.join(', ') },
      ]}
      onCancel={closeEdit}
      onSave={(v) => {
        if (!v.text.trim()) return
        updateQuote(q, { text: v.text.trim(), author: v.author.trim() || null, source: v.source.trim() || null, page: v.page.trim() || null, tags: parseTags(v.tags) })
        closeEdit()
      }}
    />
  )

  // Filter shelf items by search
  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const qText = q.text.toLowerCase()
      const author = (q.author || '').toLowerCase()
      const source = (q.source || '').toLowerCase()
      const tagStr = q.tags.join(' ').toLowerCase()
      const query = searchQuery.toLowerCase()
      return qText.includes(query) || author.includes(query) || source.includes(query) || tagStr.includes(query)
    })
  }, [quotes, searchQuery])

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const title = (n.title || '').toLowerCase()
      const body = n.body.toLowerCase()
      const tagStr = n.tags.join(' ').toLowerCase()
      const query = searchQuery.toLowerCase()
      return title.includes(query) || body.includes(query) || tagStr.includes(query)
    })
  }, [notes, searchQuery])

  const filteredBooks = useMemo(() => {
    return books.filter((b) => {
      const title = b.title.toLowerCase()
      const author = (b.author || '').toLowerCase()
      const query = searchQuery.toLowerCase()
      return title.includes(query) || author.includes(query)
    })
  }, [books, searchQuery])

  // Handle Add commentary
  const handleAddThought = () => {
    if (!newThoughtText.trim() || !parentIdForCommentary) return
    createCommentary({
      parent_type: parentTypeForCommentary,
      parent_id: parentIdForCommentary,
      body: newThoughtText.trim()
    })
    setNewThoughtText('')
  }

  // Handle Add Book
  const handlePlantBook = () => {
    if (!newBookTitle.trim()) return
    const pagesNum = parseInt(newBookPages) || 100
    const yearNum = newBookYear ? parseInt(newBookYear) || null : null
    const b = createBook(newBookTitle.trim(), newBookAuthor.trim() || null, pagesNum, yearNum)
    setNewBookTitle('')
    setNewBookAuthor('')
    setNewBookPages('200')
    setNewBookYear('')
    setShowNewBookForm(false)
    // Navigate to this book details
    setSearchParams({ tab: 'books', bookId: b.id })
  }

  // Handle Log session
  const handleLogBookSession = () => {
    if (!activeBook) return
    const p = parseInt(sessionPage) || 0
    updateBookProgress(activeBook, p)
    setShowLogSession(false)
    setSessionPage('')
  }

  // Handle Add Quote under Book Detail
  const handleAddBookQuote = () => {
    if (!newQuoteText.trim() || !activeBook) return
    const tagsArr = newQuoteTags.split(',').map((s) => s.trim().replace(/^\*/, '')).filter(Boolean)
    createQuote(newQuoteText.trim(), activeBook.author, activeBook.title, tagsArr, activeBook.id, newQuotePage.trim() || null)
    setNewQuoteText('')
    setNewQuotePage('')
    setNewQuoteTags('')
    setShowAddQuote(false)
  }

  // Handle Add Note under Book Detail
  const handleAddBookNote = () => {
    if (!newNoteBody.trim() || !activeBook) return
    const tagsArr = newNoteTags.split(',').map((s) => s.trim()).filter(Boolean)
    createNote(newNoteBody.trim(), newNoteTitleState.trim() || null, tagsArr, null, activeBook.id)
    setNewNoteBody('')
    setNewNoteTitleState('')
    setNewNoteTags('')
    setShowAddNote(false)
  }

  // Filter book specific quotes and notes
  const bookQuotes = useMemo(() => {
    if (!activeBook) return []
    return quotes.filter((q) => q.book_id === activeBook.id)
  }, [quotes, activeBook])

  const bookNotes = useMemo(() => {
    if (!activeBook) return []
    return notes.filter((n) => n.book_id === activeBook.id)
  }, [notes, activeBook])

  const recentItems = useMemo(() => {
    // Collect last 3 notes/quotes
    const items: Array<{ id: string; type: string; title: string }> = []
    notes.slice(0, 2).forEach((n) => {
      items.push({ id: n.id, type: 'note', title: n.title || n.body.slice(0, 20) + '...' })
    })
    quotes.slice(0, 2).forEach((q) => {
      items.push({ id: q.id, type: 'quote', title: `"${q.text.slice(0, 20)}..."` })
    })
    return items.slice(0, 3)
  }, [notes, quotes])

  // Book progress math
  const progressPercent = useMemo(() => {
    if (!activeBook || !(activeBook.total_pages > 0)) return 0 // no page count: 0%, never NaN%
    return Math.round((activeBook.current_page / activeBook.total_pages) * 100)
  }, [activeBook])

  const isMobile = useIsMobile()
  const motion = useMotionEnabled()
  const hasSelection = !!(selectedNoteId || selectedQuoteId || selectedBookId)
  // O10: list ↔ reader moved (not the page's first paint) → the phone's slide (pageMotion.css).
  const [sel, setSel] = useState({ has: hasSelection, moved: false })
  if (sel.has !== hasSelection) setSel({ has: hasSelection, moved: true })
  const moved = sel.moved ? ' kf-lib-moved' : ''

  // Never "No books found" / "The shelf is bare" while the shelf is still loading or didn't load:
  // a skeleton until all three lists are in, a Retry card when one failed with nothing cached.
  const shelfQs = [booksQ, notesQ, quotesQ]
  const shelfFailed = shelfQs.some((q) => q.isError && q.data === undefined)
  if (shelfFailed || shelfQs.some((q) => q.isPending)) {
    return (
      <div style={{ padding: isMobile ? 0 : '26px 16px' }}>
        {shelfFailed ? <ErrorCard message="Couldn't load the library." onRetry={() => shelfQs.forEach((q) => void q.refetch())} /> : <Skeleton rows={4} />}
      </div>
    )
  }

  /** "Remove …" = Undo toast, no confirm (Flow Audit §4). A real button, 44px tall on a phone. */
  const removeButton = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ border: 'none', background: 'none', padding: 0, minHeight: isMobile ? 44 : undefined, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)', cursor: 'pointer' }}>
      {label}
    </button>
  )
  // T6: its row in the list slides out first (on a phone the reader closes to a list without it).
  const removeBook = (b: Book) => exitAll(`[data-lib="${b.id}"]`, () => { removeBookWithUndo(b); setSearchParams({ tab: 'books' }) })
  const removeNote = (n: Note) => exitAll(`[data-lib="${n.id}"]`, () => { removeNoteWithUndo(n); setSearchParams({ tab: 'notes' }) })
  const removeQuote = (q: Quote) => exitAll(`[data-lib="${q.id}"]`, () => { removeQuoteWithUndo(q); setSearchParams({ tab: 'quotes' }) })

  if (isMobile) {
    return (
      <div style={{ width: '100%', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          .chip {
            font-family: var(--font-mono);
            font-size: var(--fs-meta);
            letter-spacing: var(--ls-meta);
            padding: 4px 9px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
          }
          .flabel {
            font-family: var(--font-mono);
            font-size: var(--fs-meta);
            letter-spacing: var(--ls-meta);
            color: var(--ink-faint);
          }
          .fhelp {
            font-family: var(--font-mono);
            font-size: var(--fs-meta);
            letter-spacing: var(--ls-meta);
            color: var(--ink-faint);
          }
          .trow {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 10px 12px;
            border-radius: var(--radius-input);
            font-size: 13.5px;
            color: var(--ink-muted);
            background: var(--paper-parchment);
            border: 1px solid var(--line-card);
            margin-bottom: 6px;
          }
        `}</style>

        {/* Kai's phone review: the shell's 16px gutter is the page's, not 16 + 20 of its own. */}
        <div style={{ flex: 1, padding: '0 0 80px', position: 'relative', zIndex: 15 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 24, filter: 'var(--shadow-drop-sm)' }} />
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink-body)' }}>Library</h1>
          </div>

          {/* Segmented Tab */}
          {/* O10: the phone's list ↔ reader is a search-param swap, so it never rode the stack; it gets
              the stack's phone grammar (Motion 3a) here — the reader in from the right, the list back. */}
          {!hasSelection && (
            <div className={`kf-lib-list${moved}`}>
              <div style={{ marginBottom: 16 }}>
                <Segmented
                  value={activeTab}
                  onChange={(tab) => setSearchParams({ tab })}
                  label="Shelf"
                  options={['notes', 'quotes', 'books'].map((tab) => ({ value: tab, label: tab.charAt(0).toUpperCase() + tab.slice(1) }))}
                />
              </div>

              {/* Search Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '7px 11px', marginBottom: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-faint)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="11" cy="11" r="6.4"></circle>
                    <path d="M19.5 19.5 16 16"></path>
                  </svg>
                </span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="search the shelf…"
                  style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'max(var(--field-min), 12px)', color: 'var(--ink-body)', outline: 'none', width: '100%', padding: 0 }}
                />
              </div>

              {/* List rendering */}
              {activeTab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredNotes.map((n) => (
                    <div key={n.id} onClick={() => setSearchParams({ tab: 'notes', noteId: n.id })} className="trow" style={{ cursor: 'pointer', display: 'block' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>{n.title || 'Untitled Note'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                    </div>
                  ))}
                  {filteredNotes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No notes found.</div>}
                </div>
              )}

              {activeTab === 'quotes' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredQuotes.map((q) => (
                    <div key={q.id} onClick={() => setSearchParams({ tab: 'quotes', quoteId: q.id })} className="trow" style={{ cursor: 'pointer', display: 'block' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.4 }}>"{q.text}"</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 6, textAlign: 'right' }}>— {q.author || 'Unknown'}</div>
                    </div>
                  ))}
                  {filteredQuotes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No quotes found.</div>}
                </div>
              )}

              {activeTab === 'books' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <Button onClick={() => setShowNewBookForm((v) => !v)}>+ Add book</Button>
                  </div>
                  {showNewBookForm && (
                    <div style={{ padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4, marginBottom: 12 }}>
                      <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, marginBottom: 8 }}>Plant a book</div>
                      <input value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} placeholder="Book title" style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }} />
                      <input value={newBookAuthor} onChange={(e) => setNewBookAuthor(e.target.value)} placeholder="Author" style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        <input value={newBookPages} onChange={(e) => setNewBookPages(e.target.value)} placeholder="Total pages" style={{ width: '50%', padding: '5px 8px', fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }} />
                        <input value={newBookYear} onChange={(e) => setNewBookYear(e.target.value)} placeholder="Year" style={{ width: '50%', padding: '5px 8px', fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowNewBookForm(false)} style={{ border: 'none', background: 'transparent', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handlePlantBook} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Plant</button>
                      </div>
                    </div>
                  )}
                  {filteredBooks.map((b) => (
                    <div key={b.id} onClick={() => setSearchParams({ tab: 'books', bookId: b.id })} className="trow" style={{ cursor: 'pointer', display: 'block' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>{b.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{b.author || 'Unknown'} · {Math.round((b.current_page / b.total_pages) * 100)}% read</div>
                    </div>
                  ))}
                  {filteredBooks.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No books found.</div>}
                </div>
              )}
            </div>
          )}

          {/* Details / Reader view on mobile */}
          {hasSelection && (
            <div className={`kf-lib-reader${moved}`} style={{ position: 'relative' }}>
              {/* Back button */}
              <BackLink onClick={() => setSearchParams({ tab: activeTab })} style={{ marginBottom: 16 }}>Back to list</BackLink>

              {/* Reader components */}
              {activeBook && (
                <div style={{ background: 'var(--paper-linen)', borderRadius: 'var(--radius-card)', border: '1px solid var(--line-card)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 80, height: 116, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <img src={getFernImage(progressPercent)} alt="" style={{ height: 36, opacity: 0.6 }} />
                      {/* No covers are stored: the slot shows the book's fern and how far in you are (true data). */}
                      <span className="fhelp" style={{ fontSize: 'var(--fs-meta)' }}>{progressPercent}% read</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-buttercream-text)' }}>Book · {activeBook.status}</div>
                      <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-display-m)', lineHeight: 1.2, color: 'var(--ink-body)' }}>{activeBook.title}</h1>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{activeBook.author}</div>
                      
                      {/* progress */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line-card)', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`, borderRadius: 2, background: 'var(--acc-buttercream)' }}></span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{progressPercent}%</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                    <span onClick={() => setShowLogSession((v) => !v)} className="chip" style={{ background: 'color-mix(in oklch, var(--acc-buttercream) 25%, transparent)', color: 'var(--acc-buttercream-text)', cursor: 'pointer' }}>Log session</span>
                    <span onClick={() => updateBookProgress(activeBook, activeBook.total_pages)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Finish</span>
                    {editChip(activeBook.id)}
                  </div>
                  {editingId === activeBook.id && bookEditForm(activeBook)}

                  {showLogSession && (
                    <div style={{ marginTop: 12, padding: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Page:</span>
                        <input value={sessionPage} onChange={(e) => setSessionPage(e.target.value)} placeholder={`max ${activeBook.total_pages}`} style={{ width: 80, padding: '4px 8px', fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }} />
                        <button onClick={handleLogBookSession} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)' }}>Log</button>
                      </div>
                    </div>
                  )}

                  {/* Quotes kept */}
                  <SectionLabel style={{ margin: '20px 0 6px' }}><span style={{ color: 'var(--acc-buttercream-text)' }}>Quotes · {bookQuotes.length}</span></SectionLabel>
                  {bookQuotes.map((q) => (
                    <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-dashed)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-body)' }}>"{q.text}"</div>
                      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 4 }}>p. {q.page || 'N/A'}</div>
                    </div>
                  ))}

                  {/* Notes */}
                  <SectionLabel style={{ margin: '20px 0 6px' }}>Notes · {bookNotes.length}</SectionLabel>
                  {bookNotes.map((n) => (
                    <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-dashed)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)' }}>{n.title || 'Note'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{n.body}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 16 }}>{removeButton('Remove book', () => removeBook(activeBook))}</div>
                </div>
              )}

              {activeNote && selectedNoteId && (
                <div className="kf-page" style={{ background: 'var(--bg-page)', borderRadius: 'var(--radius-page)', border: '1px solid var(--border-page)', boxShadow: 'var(--shadow-page)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="fhelp">Note</span>
                    <span className="kf-stamp">{new Date(activeNote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  {editingId === activeNote.id ? (
                    noteEditForm(activeNote)
                  ) : (
                    <>
                      <h2 style={{ fontFamily: 'var(--font-display)', margin: '10px 0 6px', fontSize: '18px', fontWeight: 500 }}>{activeNote.title || 'Untitled Note'}</h2>
                      <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--ink-body)' }}>{activeNote.body}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{editChip(activeNote.id)}</div>
                    </>
                  )}

                  {/* Commentary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {commentaries.map((c) => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 2 }}>{c.body}</div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={newThoughtText} onChange={(e) => setNewThoughtText(e.target.value)} placeholder="add a thought…" style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', fontSize: 'max(var(--field-min), 12px)' }} />
                    <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 'var(--fs-meta)', padding: '6px 12px', borderRadius: 'var(--radius-input)' }}>Add</button>
                  </div>
                  <div style={{ marginTop: 16 }}>{removeButton('Remove note', () => removeNote(activeNote))}</div>
                </div>
              )}

              {activeQuote && selectedQuoteId && (
                <div className="kf-page" style={{ background: 'var(--bg-page)', borderRadius: 'var(--radius-page)', border: '1px solid var(--border-page)', boxShadow: 'var(--shadow-page)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="fhelp">Quote</span>
                    <span className="kf-stamp">{new Date(activeQuote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  {editingId === activeQuote.id ? (
                    quoteEditForm(activeQuote)
                  ) : (
                    <>
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.45, color: 'var(--ink-body)', marginTop: 12, borderLeft: '2px solid var(--acc-buttercream)', paddingLeft: 12 }}>"{activeQuote.text}"</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6, textAlign: 'right' }}>— {activeQuote.author || 'Unknown'} {activeQuote.source && `(${activeQuote.source})`}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{editChip(activeQuote.id)}</div>
                    </>
                  )}

                  {/* Commentary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {commentaries.map((c) => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 2 }}>{c.body}</div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={newThoughtText} onChange={(e) => setNewThoughtText(e.target.value)} placeholder="add a thought…" style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', fontSize: 'max(var(--field-min), 12px)' }} />
                    <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 'var(--fs-meta)', padding: '6px 12px', borderRadius: 'var(--radius-input)' }}>Add</button>
                  </div>
                  <div style={{ marginTop: 16 }}>{removeButton('Remove quote', () => removeQuote(activeQuote))}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '85vh', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        .chip {
          font-family: var(--font-mono);
          font-size: var(--fs-meta);
          letter-spacing: var(--ls-meta);
          padding: 4px 9px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .flabel {
          font-family: var(--font-mono);
          font-size: var(--fs-meta);
          letter-spacing: var(--ls-meta);
          color: var(--ink-faint);
        }
        .fhelp {
          font-family: var(--font-mono);
          font-size: var(--fs-meta);
          letter-spacing: var(--ls-meta);
          color: var(--ink-faint);
        }
        .trow {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 10px;
          border-radius: var(--radius-input);
          font-size: 13px;
          color: var(--ink-muted);
        }
        .recent-row:hover {
          background: var(--paper-bone) !important;
        }
      `}</style>

      {/* 1. LEFT COLUMN: Shelf tree */}
      <aside style={{ width: 230, flex: 'none', borderRight: '1px solid var(--line-solid)', padding: '26px 16px', display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '0 4px' }}>
          <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 24, filter: 'var(--shadow-drop-sm)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink-body)' }}>Library</span>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '7px 11px', marginBottom: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-faint)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.4"></circle>
              <path d="M19.5 19.5 16 16"></path>
            </svg>
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="search the shelf…"
            style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'max(var(--field-min), 12px)', color: 'var(--ink-body)', outline: 'none', width: '100%', padding: 0 }}
          />
        </div>

        {/* Shelf categories */}
        <div className="flabel" style={{ padding: '0 6px', marginBottom: 5 }}>Journal</div>
        <div onClick={() => navigate('/journal')} className="trow" style={{ cursor: 'pointer' }}>
          <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-faint)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"></path>
              <path d="M9 8.5h6M9 12h6M9 15.5h4"></path>
            </svg>
          </span>
          Daily pages
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{dailyPagesCount}</span>
        </div>

        <div className="flabel" style={{ padding: '0 6px', margin: '12px 0 5px' }}>Shelf</div>

        {/* Category: Notes */}
        <div
          onClick={() => {
            setSearchParams({ tab: 'notes' })
            setSearchQuery('')
          }}
          className="trow"
          style={{
            cursor: 'pointer',
            fontWeight: activeTab === 'notes' && !selectedBookId ? 600 : 400,
            background: activeTab === 'notes' && !selectedBookId ? 'var(--paper-parchment)' : 'transparent',
            border: activeTab === 'notes' && !selectedBookId ? '1px solid var(--line-card)' : '1px solid transparent',
            boxShadow: activeTab === 'notes' && !selectedBookId ? 'var(--shadow-crisp)' : 'none',
            color: activeTab === 'notes' && !selectedBookId ? 'var(--ink-body)' : 'var(--ink-muted)'
          }}
        >
          <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-faint)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4.5h10.5L19 8v11.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z"></path>
              <path d="M15 4.5V8h4"></path>
            </svg>
          </span>
          Notes
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{notes.length}</span>
        </div>

        {/* Category: Quotes */}
        <div
          onClick={() => {
            setSearchParams({ tab: 'quotes' })
            setSearchQuery('')
          }}
          className="trow"
          style={{
            cursor: 'pointer',
            fontWeight: activeTab === 'quotes' && !selectedBookId ? 600 : 400,
            background: activeTab === 'quotes' && !selectedBookId ? 'var(--paper-parchment)' : 'transparent',
            border: activeTab === 'quotes' && !selectedBookId ? '1px solid var(--line-card)' : '1px solid transparent',
            boxShadow: activeTab === 'quotes' && !selectedBookId ? 'var(--shadow-crisp)' : 'none',
            color: activeTab === 'quotes' && !selectedBookId ? 'var(--ink-body)' : 'var(--ink-muted)'
          }}
        >
          <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: activeTab === 'quotes' && !selectedBookId ? 'var(--acc-buttercream-text)' : 'var(--ink-faint)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.3 6.5c-3 .8-4.8 2.9-4.8 6v5h5.6v-5.6H8.3c.1-1.7 1-2.9 2.8-3.6l-.8-1.8Z"></path>
              <path d="M19.3 6.5c-3 .8-4.8 2.9-4.8 6v5h5.6v-5.6h-2.8c.1-1.7 1-2.9 2.8-3.6l-.8-1.8Z"></path>
            </svg>
          </span>
          Quotes
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{quotes.length}</span>
        </div>

        {/* Category: Books */}
        <div
          onClick={() => {
            setSearchParams({ tab: 'books' })
            setSearchQuery('')
          }}
          className="trow"
          style={{
            cursor: 'pointer',
            fontWeight: activeTab === 'books' ? 600 : 400,
            background: activeTab === 'books' ? 'var(--paper-parchment)' : 'transparent',
            border: activeTab === 'books' ? '1px solid var(--line-card)' : '1px solid transparent',
            boxShadow: activeTab === 'books' ? 'var(--shadow-crisp)' : 'none',
            color: activeTab === 'books' ? 'var(--ink-body)' : 'var(--ink-muted)'
          }}
        >
          <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-faint)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6.8C10.4 5.2 8 4.6 4.5 4.6v13.2c3.5 0 5.9.6 7.5 2.2 1.6-1.6 4-2.2 7.5-2.2V4.6c-3.5 0-5.9.6-7.5 2.2Z"></path>
              <path d="M12 6.8V20"></path>
            </svg>
          </span>
          Books
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{books.length}</span>
        </div>

        {/* Recent items list */}
        <div className="flabel" style={{ padding: '0 6px', margin: '14px 0 5px' }}>Recent</div>
        {recentItems.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              if (item.type === 'note') setSearchParams({ tab: 'notes', noteId: item.id })
              else setSearchParams({ tab: 'quotes', quoteId: item.id })
            }}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, color: 'var(--ink-muted)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            className="recent-row"
          >
            {item.title}
          </div>
        ))}

        <div style={{ flex: 1 }}></div>

        {/* Footer plant tag */}
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)', padding: '0 4px', marginTop: 20 }}>
          Kept things, growing commentary ✿
        </div>
      </aside>

      {/* 2. CENTER/RIGHT PANEL: Reader/Detail Columns */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* polish-c (2026-09-26 audit): no in-page "Kai's Flow · Journal · Library" strip — that
            was Library.dc.html's mock of the shell topbar, which the real shell already draws. */}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          
          {/* Sub-column: SHELF CONTENT LIST (to choose items in active category) */}
          {/* Kai 2026-10-03: neither column scrolls on its own — the page around them has no bounded
              height, so they never did; they only swallowed the wheel. */}
          <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--line-solid)', padding: '16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} ({activeTab === 'quotes' ? filteredQuotes.length : activeTab === 'notes' ? filteredNotes.length : filteredBooks.length})
              </span>
              {activeTab === 'books' && (
                <Button variant="ghost" onClick={() => setShowNewBookForm(true)}>
                  + Add book
                </Button>
              )}
            </div>

            {/* Render Books list */}
            {activeTab === 'books' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredBooks.map((b, li) => {
                  const isSelected = selectedBookId === b.id
                  return (
                    <div
                      key={b.id}
                      data-lib={b.id}
                      onClick={() => setSearchParams({ tab: 'books', bookId: b.id })}
                      className={motion ? 'kf-stagger-item' : undefined}
                      style={{
                        ...(motion ? staggerDelay(li) : {}),
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--paper-parchment)' : 'transparent',
                        border: isSelected ? '1px solid var(--line-card)' : '1px solid transparent',
                        boxShadow: isSelected ? 'var(--shadow-crisp)' : 'none'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)' }}>{b.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{b.author || 'Unknown'}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Render Notes list */}
            {activeTab === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredNotes.map((n, li) => {
                  const isSelected = selectedNoteId === n.id
                  return (
                    <div
                      key={n.id}
                      data-lib={n.id}
                      onClick={() => setSearchParams({ tab: 'notes', noteId: n.id })}
                      className={motion ? 'kf-stagger-item' : undefined}
                      style={{
                        ...(motion ? staggerDelay(li) : {}),
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--paper-parchment)' : 'transparent',
                        border: isSelected ? '1px solid var(--line-card)' : '1px solid transparent',
                        boxShadow: isSelected ? 'var(--shadow-crisp)' : 'none'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title || n.body.slice(0, 20) + '...'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.body.slice(0, 40)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Render Quotes list */}
            {activeTab === 'quotes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredQuotes.map((q, li) => {
                  const isSelected = selectedQuoteId === q.id || (!selectedQuoteId && activeQuote?.id === q.id)
                  return (
                    <div
                      key={q.id}
                      data-lib={q.id}
                      onClick={() => setSearchParams({ tab: 'quotes', quoteId: q.id })}
                      className={motion ? 'kf-stagger-item' : undefined}
                      style={{
                        ...(motion ? staggerDelay(li) : {}),
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--paper-parchment)' : 'transparent',
                        border: isSelected ? '1px solid var(--line-card)' : '1px solid transparent',
                        boxShadow: isSelected ? 'var(--shadow-crisp)' : 'none'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{q.text.slice(0, 30)}..."
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>— {q.author || 'Unknown'}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add Book Dialog Overlay */}
            {showNewBookForm && (
              <div style={{ marginTop: 12, padding: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, marginBottom: 8 }}>Plant a book</div>
                <input
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder="Book title"
                  style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                />
                <input
                  value={newBookAuthor}
                  onChange={(e) => setNewBookAuthor(e.target.value)}
                  placeholder="Author"
                  style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={newBookPages}
                    onChange={(e) => setNewBookPages(e.target.value)}
                    placeholder="Total pages"
                    style={{ width: '50%', padding: '5px 8px', fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                  <input
                    value={newBookYear}
                    onChange={(e) => setNewBookYear(e.target.value)}
                    placeholder="Year"
                    style={{ width: '50%', padding: '5px 8px', fontSize: 'var(--fs-meta)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowNewBookForm(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handlePlantBook} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Plant</button>
                </div>
              </div>
            )}
          </div>

          {/* Sub-column: MAIN READER SECTION */}
          {/* minWidth 0: a flex item's min-width defaults to its content's widest unbreakable run, so at
              150% the reader held the page wider than the window and it scrolled sideways. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            
            {/* BOOK DETAIL VIEW (if selectedBookId is active) */}
            {activeBook ? (
              <div style={{ width: '100%', maxWidth: 760, padding: '30px 40px 36px', background: 'var(--paper-linen)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <BackLink onClick={() => setSearchParams({ tab: 'books' })}>Library / Books</BackLink>
                  <span className="fhelp">Added {new Date(activeBook.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>

                <div style={{ display: 'flex', gap: 22, marginTop: 24 }}>
                  {/* cover slot — no covers are stored, so it holds the book's fern + how far in (never a placeholder label) */}
                  <div style={{ width: 118, height: 172, flex: 'none', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <img src={getFernImage(progressPercent)} alt="" style={{ height: 52, opacity: 0.6 }} />
                    <span className="fhelp" style={{ textAlign: 'center', padding: '0 10px' }}>{progressPercent}% read</span>
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-buttercream-text)' }}>
                      Book · {activeBook.status}
                    </div>
                    <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1.15, color: 'var(--ink-body)' }}>{activeBook.title}</h1>
                    <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)', marginTop: 4 }}>{activeBook.author} {activeBook.published_year && `· ${activeBook.published_year}`}</div>
                    
                    {/* progress frond */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
                      <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 20, opacity: 0.4 }} />
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line-card)', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`, borderRadius: 2, background: 'var(--acc-buttercream)' }}></span>
                      </div>
                      <img src={getFernImage(progressPercent)} alt="" style={{ height: 26 }} title={`${progressPercent}% progress`} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>p. {activeBook.current_page} / {activeBook.total_pages}</span>
                    </div>

                    <div className="fhelp" style={{ marginTop: 6 }}>The frond unfurls as you read — full at the last page</div>
                    
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <span onClick={() => setShowLogSession(true)} className="chip" style={{ background: 'color-mix(in oklch, var(--acc-buttercream) 25%, transparent)', color: 'var(--acc-buttercream-text)', cursor: 'pointer' }}>Log a session</span>
                      <span onClick={() => setShowAddQuote(true)} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>+ Quote</span>
                      <span onClick={() => setShowAddNote(true)} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>+ Note</span>
                      <span onClick={() => updateBookProgress(activeBook, activeBook.total_pages)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Mark finished</span>
                      {editChip(activeBook.id)}
                    </div>
                  </div>
                </div>

                {editingId === activeBook.id && bookEditForm(activeBook)}

                {/* Inline Log page session form */}
                {showLogSession && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4, maxWidth: 300 }}>
                    <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, marginBottom: 8 }}>Log a reading session</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Page reached:</span>
                      <input
                        value={sessionPage}
                        onChange={(e) => setSessionPage(e.target.value)}
                        placeholder={`max ${activeBook.total_pages}`}
                        style={{ width: 80, padding: '4px 8px', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowLogSession(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleLogBookSession} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Log</button>
                    </div>
                  </div>
                )}

                {/* Add Quote inline Form */}
                {showAddQuote && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)' }}>
                    <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, marginBottom: 8 }}>Add a quote</div>
                    <textarea
                      value={newQuoteText}
                      onChange={(e) => setNewQuoteText(e.target.value)}
                      placeholder="Quote content..."
                      style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', outline: 'none', padding: 6, borderRadius: 'var(--radius-md)', resize: 'none', marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={newQuotePage}
                        onChange={(e) => setNewQuotePage(e.target.value)}
                        placeholder="Page (e.g. 148)"
                        style={{ width: '40%', padding: '4px 8px', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                      />
                      <input
                        value={newQuoteTags}
                        onChange={(e) => setNewQuoteTags(e.target.value)}
                        placeholder="Tags (comma separated e.g. *pace, *focus)"
                        style={{ width: '60%', padding: '4px 8px', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddQuote(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleAddBookQuote} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}

                {/* Add Note inline Form */}
                {showAddNote && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)' }}>
                    <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, marginBottom: 8 }}>Add a note</div>
                    <input
                      value={newNoteTitleState}
                      onChange={(e) => setNewNoteTitleState(e.target.value)}
                      placeholder="Note title (optional)"
                      style={{ width: '100%', padding: '4px 8px', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none', marginBottom: 6 }}
                    />
                    <textarea
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      placeholder="Note content..."
                      style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', outline: 'none', padding: 6, borderRadius: 'var(--radius-md)', resize: 'none', marginBottom: 6 }}
                    />
                    <input
                      value={newNoteTags}
                      onChange={(e) => setNewNoteTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      style={{ width: '100%', padding: '4px 8px', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddNote(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleAddBookNote} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}

                {/* Quotes list */}
                <SectionLabel style={{ margin: '28px 0 6px' }}><span style={{ color: 'var(--acc-buttercream-text)' }}>Quotes kept · {bookQuotes.length}</span></SectionLabel>
                {bookQuotes.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => setSearchParams({ tab: 'quotes', quoteId: q.id })}
                    style={{ display: 'flex', gap: 14, padding: '12px 2px', borderBottom: '1px solid var(--line-dashed)', cursor: 'pointer' }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--acc-buttercream-text)', flex: 'none' }}>❝</span>
                    <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'var(--fs-body)', lineHeight: 1.55, color: 'var(--ink-body)' }}>"{q.text}"</span>
                    <span className="fhelp" style={{ flex: 'none', paddingTop: 3 }}>p. {q.page || 'N/A'}</span>
                  </div>
                ))}

                {/* Notes list */}
                <SectionLabel style={{ margin: '24px 0 6px' }}>Notes · {bookNotes.length}</SectionLabel>
                {bookNotes.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setSearchParams({ tab: 'notes', noteId: n.id })}
                    style={{ display: 'flex', gap: 14, padding: '12px 2px', borderBottom: '1px solid var(--line-dashed)', cursor: 'pointer' }}
                  >
                    <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>{n.title || 'Note'}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-body-s)', lineHeight: 1.6, color: 'var(--ink-body)' }}>{n.body}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--line-dashed)' }}>
                  {removeButton('Remove book', () => removeBook(activeBook))}
                  <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)' }}>Finish it and the frond unfurls flat ✿</span>
                </div>
              </div>
            ) : (
              
              // STANDARD CATEGORY DETAILED VIEW (QUOTE OR NOTE READER)
              <>
                {/* Unfurl Fern progress vertical column */}
                <div style={{ width: 44, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: 0 }}>
                  <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 22, opacity: 0.45 }} />
                  <span style={{ flex: 1, width: 0, borderLeft: '1px solid var(--acc-buttercream)', opacity: 0.6, margin: '8px 0' }}></span>
                  <img src="/ds/assets/fern/unfurl1.png" alt="" style={{ height: 26, opacity: 0.7 }} />
                  <span style={{ flex: 1, width: 0, borderLeft: '1px solid var(--line-dashed)', margin: '8px 0' }}></span>
                  <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ height: 28, opacity: 0.5 }} />
                </div>

                {selectedNoteId && activeNote ? (
                  /* Note Reader Mode */
                  <div style={{ flex: 1, minWidth: 0, maxWidth: 720, padding: '30px 40px 40px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="fhelp">Notes shelf / {activeNote.title || 'Untitled Note'}</span>
                      <span className="fhelp">Kept {new Date(activeNote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                    </div>

                    <div className="kf-page" style={{ position: 'relative', marginTop: 26, padding: '22px 26px 22px 30px', background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)' }}>
                      <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', left: -30, top: -16, height: 44, opacity: 0.35, transform: 'rotate(-14deg)' }} />
                      
                      {editingId === activeNote.id ? (
                        noteEditForm(activeNote)
                      ) : (
                        <>
                          <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 10px', fontSize: 'var(--fs-display-m)', fontWeight: 500 }}>{activeNote.title || 'Untitled Note'}</h2>
                          <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--ink-body)' }}>{activeNote.body}</div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                            {activeNote.book_id && (
                              <span style={{ fontSize: '13px', color: 'var(--acc-buttercream-text)' }}>Related Book</span>
                            )}
                            {activeNote.tags.map((tag) => (
                              <span key={tag} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>*{tag}</span>
                            ))}
                            {editChip(activeNote.id)}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Commentary */}
                    <SectionLabel style={{ margin: '26px 0 6px' }}>
                      <span style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length} thought{commentaries.length === 1 ? '' : 's'}</span>
                    </SectionLabel>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {commentaries.map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 14, padding: '13px 2px', borderBottom: '1px solid var(--line-dashed)' }}>
                          <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>
                            {new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ fontSize: 'var(--fs-body-s)', lineHeight: 1.6, color: 'var(--ink-body)' }}>{c.body}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <input
                        value={newThoughtText}
                        onChange={(e) => setNewThoughtText(e.target.value)}
                        placeholder="add a thought to this over time…"
                        style={{ flex: 1, minWidth: 0, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '10px 13px', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', outline: 'none' }}
                      />
                      <Button onClick={handleAddThought}>Add</Button>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                      {removeButton('Remove note', () => removeNote(activeNote))}
                      <span className="fhelp">append-only — old thoughts stay as they were written</span>
                    </div>
                  </div>
                ) : activeQuote ? (
                  /* Quote Reader Mode */
                  <div style={{ flex: 1, minWidth: 0, maxWidth: 720, padding: '30px 40px 40px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {/* Only a source that's stored — no invented "commonplace" (Kai 2026-10-12: Library shows true data). */}
                      <span className="fhelp">Quotes shelf{activeQuote.source ? ` / from ${activeQuote.source}` : ''}</span>
                      {/* WB-4 punch 9: "· resurfaced twice" was a design literal — no resurface
                          count is stored for a quote. The kept-date beside it is real. */}
                      <span className="fhelp">Kept {new Date(activeQuote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                    </div>

                    <div className="kf-page" style={{ position: 'relative', marginTop: 26, padding: '22px 26px 22px 30px', background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)' }}>
                      <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', left: -30, top: -16, height: 44, opacity: 0.35, transform: 'rotate(-14deg)' }} />
                      
                      
                      {editingId === activeQuote.id ? (
                        quoteEditForm(activeQuote)
                      ) : (
                        <>
                          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 27, lineHeight: 1.45, color: 'var(--ink-body)' }}>
                            "{activeQuote.text}"
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: 'var(--acc-buttercream-text)' }}>
                              {activeQuote.source} {activeQuote.author && `— ${activeQuote.author}`} {activeQuote.page && `· p. ${activeQuote.page}`}
                            </span>
                            {activeQuote.tags.map((tag) => (
                              <span key={tag} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>*{tag}</span>
                            ))}
                            {editChip(activeQuote.id)}
                          </div>
                        </>
                      )}
                    </div>

                    {/* WB-4 punch 8 + 9: the export's "Chat flagged this…" banner was deleted, not
                        wired. Its sentence was sample copy about a project that isn't yours, and its
                        keep/dismiss chips were `cursor: pointer` with no handler. Nothing in the data
                        flags a quote from chat, so the honest render is nothing at all. */}

                    {/* Commentary */}
                    <SectionLabel style={{ margin: '26px 0 6px' }}>
                      <span style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length} thought{commentaries.length === 1 ? '' : 's'}</span>
                    </SectionLabel>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {commentaries.map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 14, padding: '13px 2px', borderBottom: '1px solid var(--line-dashed)' }}>
                          <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>
                            {new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ fontSize: 'var(--fs-body-s)', lineHeight: 1.6, color: 'var(--ink-body)' }}>{c.body}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <input
                        value={newThoughtText}
                        onChange={(e) => setNewThoughtText(e.target.value)}
                        placeholder="add a thought to this over time…"
                        style={{ flex: 1, minWidth: 0, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '10px 13px', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', outline: 'none' }}
                      />
                      <Button onClick={handleAddThought}>Add</Button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                      {removeButton('Remove quote', () => removeQuote(activeQuote))}
                      <span className="fhelp">append-only — old thoughts stay as they were written</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '52px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 56, opacity: 0.7, filter: 'var(--shadow-drop-sm)' }} />
                    <div style={{ marginTop: 18, fontSize: 'var(--fs-body)', color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 340, lineHeight: 1.45 }}>The shelf is bare — quotes and notes you keep will gather here.</div>
                    <Button onClick={() => { setSearchParams({ tab: 'books' }); setShowNewBookForm(true) }} style={{ marginTop: 18 }}>+ Plant a book</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
