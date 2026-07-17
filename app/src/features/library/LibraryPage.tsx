import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  useBooks,
  createBook,
  updateBookProgress,
  deleteBook,
  useNotes,
  createNote,
  deleteNote,
  useQuotes,
  createQuote,
  deleteQuote,
  useCommentaries,
  createCommentary
} from './api'

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
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
  const { data: books = [] } = useBooks()
  const { data: notes = [] } = useNotes()
  const { data: quotes = [] } = useQuotes()

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
    if (!activeBook) return 0
    return Math.round((activeBook.current_page / activeBook.total_pages) * 100)
  }, [activeBook])

  const isMobile = useIsMobile()
  const hasSelection = !!(selectedNoteId || selectedQuoteId || selectedBookId)

  if (isMobile) {
    return (
      <div style={{ width: '100%', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          .chip {
            font-family: var(--font-mono);
            font-size: 9.5px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 4px 9px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
          }
          .flabel {
            font-family: var(--font-mono);
            font-size: 9px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: var(--ink-faint);
          }
          .fhelp {
            font-family: var(--font-mono);
            font-size: 8.5px;
            letter-spacing: 0.06em;
            color: var(--ink-hairline);
          }
          .trow {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 10px 12px;
            border-radius: 6px;
            font-size: 13.5px;
            color: var(--ink-muted);
            background: var(--paper-parchment);
            border: 1px solid var(--line-card);
            margin-bottom: 6px;
          }
        `}</style>
        <div className="grain" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 10 }} />

        <div style={{ flex: 1, padding: '16px 20px 80px', position: 'relative', zIndex: 15 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 24, filter: 'var(--shadow-drop-sm)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink-body)' }}>Library</span>
          </div>

          {/* Segmented Tab */}
          {!hasSelection && (
            <>
              <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
                {['notes', 'quotes', 'books'].map((tab) => (
                  <span
                    key={tab}
                    onClick={() => setSearchParams({ tab })}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px 0',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: activeTab === tab ? 'var(--ink-body)' : 'var(--ink-muted)',
                      background: activeTab === tab ? 'var(--paper-parchment)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '7px 11px', marginBottom: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-hairline)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="11" cy="11" r="6.4"></circle>
                    <path d="M19.5 19.5 16 16"></path>
                  </svg>
                </span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="search the shelf…"
                  style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '12px', color: 'var(--ink-body)', outline: 'none', width: '100%', padding: 0 }}
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
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', marginTop: 6, textAlign: 'right' }}>— {q.author || 'Unknown'}</div>
                    </div>
                  ))}
                  {filteredQuotes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No quotes found.</div>}
                </div>
              )}

              {activeTab === 'books' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button onClick={() => setShowNewBookForm((v) => !v)} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', fontSize: '11px', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                      + Add Book
                    </button>
                  </div>
                  {showNewBookForm && (
                    <div style={{ padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Plant a Book</div>
                      <input value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} placeholder="Book Title" style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }} />
                      <input value={newBookAuthor} onChange={(e) => setNewBookAuthor(e.target.value)} placeholder="Author" style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        <input value={newBookPages} onChange={(e) => setNewBookPages(e.target.value)} placeholder="Total Pages" style={{ width: '50%', padding: '5px 8px', fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }} />
                        <input value={newBookYear} onChange={(e) => setNewBookYear(e.target.value)} placeholder="Year" style={{ width: '50%', padding: '5px 8px', fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowNewBookForm(false)} style={{ border: 'none', background: 'transparent', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handlePlantBook} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Plant</button>
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
            </>
          )}

          {/* Details / Reader view on mobile */}
          {hasSelection && (
            <div style={{ position: 'relative' }}>
              {/* Back button */}
              <button
                onClick={() => setSearchParams({ tab: activeTab })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--acc-terra)', fontSize: '12px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 16, padding: 0 }}
              >
                ← Back to List
              </button>

              {/* Reader components */}
              {activeBook && (
                <div style={{ background: 'var(--paper-linen)', borderRadius: 4, border: '1px solid var(--line-card)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 80, height: 116, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <img src={getFernImage(progressPercent)} alt="" style={{ height: 36, opacity: 0.6 }} />
                      <span className="fhelp" style={{ fontSize: 8 }}>cover</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Book · {activeBook.status}</div>
                      <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, lineHeight: 1.2, color: 'var(--ink-body)' }}>{activeBook.title}</h1>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{activeBook.author}</div>
                      
                      {/* progress */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line-card)', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`, borderRadius: 2, background: 'var(--acc-buttercream)' }}></span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{progressPercent}%</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                    <span onClick={() => setShowLogSession((v) => !v)} className="chip" style={{ background: 'rgba(212,199,138,0.25)', color: 'var(--acc-buttercream-text)', cursor: 'pointer' }}>log session</span>
                    <span onClick={() => updateBookProgress(activeBook, activeBook.total_pages)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>finish</span>
                  </div>

                  {showLogSession && (
                    <div style={{ marginTop: 12, padding: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Page:</span>
                        <input value={sessionPage} onChange={(e) => setSessionPage(e.target.value)} placeholder={`max ${activeBook.total_pages}`} style={{ width: 80, padding: '4px 8px', fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }} />
                        <button onClick={handleLogBookSession} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', fontSize: '11px', padding: '4px 10px', borderRadius: 999 }}>Log</button>
                      </div>
                    </div>
                  )}

                  {/* Quotes kept */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Quotes · {bookQuotes.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {bookQuotes.map((q) => (
                    <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-body)' }}>"{q.text}"</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 4 }}>p. {q.page || 'N/A'}</div>
                    </div>
                  ))}

                  {/* Notes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel">Notes · {bookNotes.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {bookNotes.map((n) => (
                    <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)' }}>{n.title || 'Note'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{n.body}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeNote && selectedNoteId && (
                <div style={{ background: 'var(--paper-linen)', borderRadius: 4, border: '1px solid var(--line-card)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="fhelp">Note</span>
                    <span className="fhelp">{new Date(activeNote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '10px 0 6px', fontSize: '18px', fontWeight: 500 }}>{activeNote.title || 'Untitled Note'}</h2>
                  <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--ink-body)' }}>{activeNote.body}</div>

                  {/* Commentary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {commentaries.map((c) => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 2 }}>{c.body}</div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={newThoughtText} onChange={(e) => setNewThoughtText(e.target.value)} placeholder="add a thought…" style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', fontSize: '12px' }} />
                    <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', fontSize: '12px', padding: '6px 12px', borderRadius: 999 }}>Add</button>
                  </div>
                </div>
              )}

              {activeQuote && selectedQuoteId && (
                <div style={{ background: 'var(--paper-linen)', borderRadius: 4, border: '1px solid var(--line-card)', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="fhelp">Quote</span>
                    <span className="fhelp">{new Date(activeQuote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.45, color: 'var(--ink-body)', marginTop: 12, borderLeft: '2px solid var(--acc-buttercream)', paddingLeft: 12 }}>"{activeQuote.text}"</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6, textAlign: 'right' }}>— {activeQuote.author || 'Unknown'} {activeQuote.source && `(${activeQuote.source})`}</div>

                  {/* Commentary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}><span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length}</span><span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span></div>
                  {commentaries.map((c) => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 2 }}>{c.body}</div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={newThoughtText} onChange={(e) => setNewThoughtText(e.target.value)} placeholder="add a thought…" style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', fontSize: '12px' }} />
                    <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', fontSize: '12px', padding: '6px 12px', borderRadius: 999 }}>Add</button>
                  </div>
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
          font-size: 9.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 4px 9px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .flabel {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .fhelp {
          font-family: var(--font-mono);
          font-size: 8.5px;
          letter-spacing: 0.06em;
          color: var(--ink-hairline);
        }
        .trow {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 13px;
          color: var(--ink-muted);
        }
        .recent-row:hover {
          background: var(--paper-bone) !important;
        }
      `}</style>
      <div className="grain" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 10 }} />

      {/* 1. LEFT COLUMN: Shelf tree */}
      <aside style={{ width: 230, flex: 'none', borderRight: '1px dashed var(--line-solid)', padding: '26px 16px', display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '0 4px' }}>
          <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 24, filter: 'var(--shadow-drop-sm)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink-body)' }}>Library</span>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '7px 11px', marginBottom: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-hairline)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.4"></circle>
              <path d="M19.5 19.5 16 16"></path>
            </svg>
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="search the shelf…"
            style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '12px', color: 'var(--ink-body)', outline: 'none', width: '100%', padding: 0 }}
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>42</span>
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{notes.length}</span>
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{quotes.length}</span>
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{books.length}</span>
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
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 14.5, color: '#7a745f', transform: 'rotate(-1deg)', padding: '0 4px', marginTop: 20 }}>
          kept things, growing commentary ✿
        </div>
      </aside>

      {/* 2. CENTER/RIGHT PANEL: Reader/Detail Columns */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* Top Header */}
        <div style={{ height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          <span>Kai's Flow · Journal · Library</span>
          <span>Africa/Cairo</span>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          
          {/* Sub-column: SHELF CONTENT LIST (to choose items in active category) */}
          <div style={{ width: 220, flex: 'none', borderRight: '1px dashed var(--line-solid)', overflowY: 'auto', padding: '16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {activeTab} ({activeTab === 'quotes' ? filteredQuotes.length : activeTab === 'notes' ? filteredNotes.length : filteredBooks.length})
              </span>
              {activeTab === 'books' && (
                <button
                  onClick={() => setShowNewBookForm(true)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--acc-terra)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  + Add Book
                </button>
              )}
            </div>

            {/* Render Books list */}
            {activeTab === 'books' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredBooks.map((b) => {
                  const isSelected = selectedBookId === b.id
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSearchParams({ tab: 'books', bookId: b.id })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 5,
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
                {filteredNotes.map((n) => {
                  const isSelected = selectedNoteId === n.id
                  return (
                    <div
                      key={n.id}
                      onClick={() => setSearchParams({ tab: 'notes', noteId: n.id })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 5,
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
                {filteredQuotes.map((q) => {
                  const isSelected = selectedQuoteId === q.id || (!selectedQuoteId && activeQuote?.id === q.id)
                  return (
                    <div
                      key={q.id}
                      onClick={() => setSearchParams({ tab: 'quotes', quoteId: q.id })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 5,
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
              <div style={{ marginTop: 12, padding: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Plant a Book</div>
                <input
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder="Book Title"
                  style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                />
                <input
                  value={newBookAuthor}
                  onChange={(e) => setNewBookAuthor(e.target.value)}
                  placeholder="Author"
                  style={{ width: '100%', padding: '5px 8px', marginBottom: 6, fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={newBookPages}
                    onChange={(e) => setNewBookPages(e.target.value)}
                    placeholder="Total Pages"
                    style={{ width: '50%', padding: '5px 8px', fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                  />
                  <input
                    value={newBookYear}
                    onChange={(e) => setNewBookYear(e.target.value)}
                    placeholder="Year"
                    style={{ width: '50%', padding: '5px 8px', fontSize: '12px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowNewBookForm(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handlePlantBook} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', font: 'inherit', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Plant</button>
                </div>
              </div>
            )}
          </div>

          {/* Sub-column: MAIN READER SECTION */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
            
            {/* BOOK DETAIL VIEW (if selectedBookId is active) */}
            {activeBook ? (
              <div style={{ width: '100%', maxWidth: 760, padding: '30px 40px 36px', background: 'var(--paper-linen)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span onClick={() => setSearchParams({ tab: 'books' })} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer' }}>
                    ← Library / Books
                  </span>
                  <span className="fhelp">added {new Date(activeBook.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · via capture</span>
                </div>

                <div style={{ display: 'flex', gap: 22, marginTop: 24 }}>
                  {/* cover slot */}
                  <div style={{ width: 118, height: 172, flex: 'none', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, transform: 'rotate(-1deg)' }}>
                    <img src={getFernImage(progressPercent)} alt="" style={{ height: 52, opacity: 0.6 }} />
                    <span className="fhelp" style={{ textAlign: 'center', padding: '0 10px' }}>cover<br />placeholder</span>
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>
                      Book · {activeBook.status}
                    </div>
                    <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1.15, color: 'var(--ink-body)' }}>{activeBook.title}</h1>
                    <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginTop: 4 }}>{activeBook.author} {activeBook.published_year && `· ${activeBook.published_year}`}</div>
                    
                    {/* progress frond */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
                      <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 20, opacity: 0.4 }} />
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line-card)', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercent}%`, borderRadius: 2, background: 'var(--acc-buttercream)' }}></span>
                      </div>
                      <img src={getFernImage(progressPercent)} alt="" style={{ height: 26 }} title={`${progressPercent}% progress`} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>p. {activeBook.current_page} / {activeBook.total_pages}</span>
                    </div>

                    <div className="fhelp" style={{ marginTop: 6 }}>the frond unfurls as you read — full at the last page</div>
                    
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <span onClick={() => setShowLogSession(true)} className="chip" style={{ background: 'rgba(212,199,138,0.25)', color: 'var(--acc-buttercream-text)', cursor: 'pointer' }}>log a session</span>
                      <span onClick={() => setShowAddQuote(true)} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>+ quote</span>
                      <span onClick={() => setShowAddNote(true)} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>+ note</span>
                      <span onClick={() => updateBookProgress(activeBook, activeBook.total_pages)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>mark finished</span>
                    </div>
                  </div>
                </div>

                {/* Inline Log page session form */}
                {showLogSession && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4, maxWidth: 300 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Log Reading Session</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Page reached:</span>
                      <input
                        value={sessionPage}
                        onChange={(e) => setSessionPage(e.target.value)}
                        placeholder={`max ${activeBook.total_pages}`}
                        style={{ width: 80, padding: '4px 8px', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowLogSession(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleLogBookSession} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', font: 'inherit', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Log</button>
                    </div>
                  </div>
                )}

                {/* Add Quote inline Form */}
                {showAddQuote && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Add Book Quote</div>
                    <textarea
                      value={newQuoteText}
                      onChange={(e) => setNewQuoteText(e.target.value)}
                      placeholder="Quote content..."
                      style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', outline: 'none', padding: 6, borderRadius: 3, resize: 'none', marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={newQuotePage}
                        onChange={(e) => setNewQuotePage(e.target.value)}
                        placeholder="Page No (e.g. 148)"
                        style={{ width: '40%', padding: '4px 8px', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                      />
                      <input
                        value={newQuoteTags}
                        onChange={(e) => setNewQuoteTags(e.target.value)}
                        placeholder="Tags (comma separated e.g. *pace, *focus)"
                        style={{ width: '60%', padding: '4px 8px', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddQuote(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleAddBookQuote} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', font: 'inherit', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}

                {/* Add Note inline Form */}
                {showAddNote && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Add Note</div>
                    <input
                      value={newNoteTitleState}
                      onChange={(e) => setNewNoteTitleState(e.target.value)}
                      placeholder="Note Title (optional)"
                      style={{ width: '100%', padding: '4px 8px', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none', marginBottom: 6 }}
                    />
                    <textarea
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      placeholder="Note content..."
                      style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', outline: 'none', padding: 6, borderRadius: 3, resize: 'none', marginBottom: 6 }}
                    />
                    <input
                      value={newNoteTags}
                      onChange={(e) => setNewNoteTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      style={{ width: '100%', padding: '4px 8px', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddNote(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleAddBookNote} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', font: 'inherit', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}

                {/* Quotes list */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 6px' }}>
                  <span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Quotes kept · {bookQuotes.length}</span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
                </div>
                {bookQuotes.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => setSearchParams({ tab: 'quotes', quoteId: q.id })}
                    style={{ display: 'flex', gap: 14, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--acc-buttercream-text)', flex: 'none' }}>❝</span>
                    <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-body)' }}>"{q.text}"</span>
                    <span className="fhelp" style={{ flex: 'none', paddingTop: 3 }}>p. {q.page || 'N/A'}</span>
                  </div>
                ))}

                {/* Notes list */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 6px' }}>
                  <span className="flabel">Notes · {bookNotes.length}</span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
                </div>
                {bookNotes.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setSearchParams({ tab: 'notes', noteId: n.id })}
                    style={{ display: 'flex', gap: 14, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
                  >
                    <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>{n.title || 'Note'}</span>
                    <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-body)' }}>{n.body}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
                  <span onClick={() => { deleteBook(activeBook.id); setSearchParams({ tab: 'books' }) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Remove book…</span>
                  <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#7a745f', transform: 'rotate(-1deg)' }}>finish it and the frond unfurls flat ✿</span>
                </div>
              </div>
            ) : (
              
              // STANDARD CATEGORY DETAILED VIEW (QUOTE OR NOTE READER)
              <>
                {/* Unfurl Fern progress vertical column */}
                <div style={{ width: 44, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: 0 }}>
                  <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 22, opacity: 0.45 }} />
                  <span style={{ flex: 1, width: 0, borderLeft: '1px dashed var(--acc-buttercream)', opacity: 0.6, margin: '8px 0' }}></span>
                  <img src="/ds/assets/fern/unfurl1.png" alt="" style={{ height: 26, opacity: 0.7 }} />
                  <span style={{ flex: 1, width: 0, borderLeft: '1px dashed var(--line-dashed)', margin: '8px 0' }}></span>
                  <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ height: 28, opacity: 0.5 }} />
                </div>

                {selectedNoteId && activeNote ? (
                  /* Note Reader Mode */
                  <div style={{ flex: 1, minWidth: 0, maxWidth: 720, padding: '30px 40px 40px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="fhelp">Notes Shelf / {activeNote.title || 'Untitled Note'}</span>
                      <span className="fhelp">kept {new Date(activeNote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                    </div>

                    <div style={{ position: 'relative', marginTop: 26, padding: '6px 0 6px 26px', borderLeft: '2px solid var(--acc-buttercream)' }}>
                      <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', left: -30, top: -16, height: 44, opacity: 0.35, transform: 'rotate(-14deg)' }} />
                      
                      <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 10px', fontSize: '22px', fontWeight: 500 }}>{activeNote.title || 'Untitled Note'}</h2>
                      <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--ink-body)' }}>{activeNote.body}</div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                        {activeNote.book_id && (
                          <span style={{ fontSize: '13px', color: 'var(--acc-buttercream-text)' }}>Related Book</span>
                        )}
                        {activeNote.tags.map((tag) => (
                          <span key={tag} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>*{tag}</span>
                        ))}
                      </div>
                    </div>

                    {/* Commentary */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 6px' }}>
                      <span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length} thought{commentaries.length === 1 ? '' : 's'}</span>
                      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {commentaries.map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 14, padding: '13px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                          <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>
                            {new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--ink-body)' }}>{c.body}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <input
                        value={newThoughtText}
                        onChange={(e) => setNewThoughtText(e.target.value)}
                        placeholder="add a thought to this over time…"
                        style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '10px 13px', fontSize: '13px', color: 'var(--ink-body)', outline: 'none' }}
                      />
                      <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 17px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Add</button>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                      <span onClick={() => { deleteNote(activeNote.id); setSearchParams({ tab: 'notes' }) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Remove note…</span>
                      <span className="fhelp">append-only — old thoughts stay as they were written</span>
                    </div>
                  </div>
                ) : activeQuote ? (
                  /* Quote Reader Mode */
                  <div style={{ flex: 1, minWidth: 0, maxWidth: 720, padding: '30px 40px 40px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="fhelp">Quotes Shelf / from {activeQuote.source || 'commonplace'}</span>
                      <span className="fhelp">kept {new Date(activeQuote.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} · resurfaced twice</span>
                    </div>

                    <div style={{ position: 'relative', marginTop: 26, padding: '6px 0 6px 26px', borderLeft: '2px solid var(--acc-buttercream)' }}>
                      <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', left: -30, top: -16, height: 44, opacity: 0.35, transform: 'rotate(-14deg)' }} />
                      
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
                      </div>
                    </div>

                    {/* Chat alert banner (styled check card from Library.dc.html) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(212,199,138,0.16)', border: '1px solid rgba(212,199,138,0.4)', borderRadius: 6, padding: '9px 13px', marginTop: 22 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-buttercream)', flex: 'none' }}></span>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-body)' }}>Chat flagged this while you were planning the balcony rebuild — worth a thought?</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>keep</span><span className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>dismiss</span></span>
                    </div>

                    {/* Commentary */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 6px' }}>
                      <span className="flabel" style={{ color: 'var(--acc-buttercream-text)' }}>Commentary · {commentaries.length} thought{commentaries.length === 1 ? '' : 's'}</span>
                      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {commentaries.map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 14, padding: '13px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                          <span className="fhelp" style={{ width: 70, flex: 'none', paddingTop: 2 }}>
                            {new Date(c.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--ink-body)' }}>{c.body}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <input
                        value={newThoughtText}
                        onChange={(e) => setNewThoughtText(e.target.value)}
                        placeholder="add a thought to this over time…"
                        style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '10px 13px', fontSize: '13px', color: 'var(--ink-body)', outline: 'none' }}
                      />
                      <button onClick={handleAddThought} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 17px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Add</button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                      <span onClick={() => { deleteQuote(activeQuote.id); setSearchParams({ tab: 'quotes' }) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Remove quote…</span>
                      <span className="fhelp">append-only — old thoughts stay as they were written</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 40, fontStyle: 'italic', color: 'var(--ink-faint)' }}>Select an item from the shelf to view details.</div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
