import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useJournalEntries, upsertJournalEntry } from './api'
import { useNotes, useQuotes, useCommentaries, createCommentary } from '../library/api'

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

const PROMPTS = [
  'What felt alive in you today?',
  'What is one thing you completed today that you are proud of?',
  'Who did you connect with today, and what did you talk about?',
  'What did you learn today, or how did you grow?',
  'What is a minor frustration you had, and how can you let it go?'
]

const MOODS = ['Calm', 'Focused', 'Grateful', 'Stretched']

function getFernImage(length: number): string {
  if (length < 50) return '/ds/assets/fern/coil.png'
  if (length < 150) return '/ds/assets/fern/unfurl1.png'
  if (length < 300) return '/ds/assets/fern/unfurl2.png'
  return '/ds/assets/fern/full.png'
}

export function JournalPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // Queries
  const { data: entries = [] } = useJournalEntries()
  const { data: notes = [] } = useNotes()
  const { data: quotes = [] } = useQuotes()

  // Find a quote for commonplace rail (first quote or random)
  const commonplaceQuote = useMemo(() => {
    return quotes[0] || null
  }, [quotes])

  const { data: commonplaceCommentaries = [] } = useCommentaries(
    'quote',
    commonplaceQuote?.id || ''
  )

  // Selected date state (defaults to today in Cairo local time yyyy-mm-dd)
  const todayStr = useMemo(() => {
    const d = new Date()
    // format as yyyy-mm-dd local
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [promptIndex, setPromptIndex] = useState(0)
  const [newCommentaryText, setNewCommentaryText] = useState('')
  const [showAddCommentary, setShowAddCommentary] = useState(false)
  const [mobileTab, setMobileTab] = useState<'journal' | 'notes' | 'quotes'>('journal')

  // Find or create temp entry state
  const activeEntry = useMemo(() => {
    return entries.find((e) => e.entry_date === selectedDate) || null
  }, [entries, selectedDate])

  const [bodyText, setBodyText] = useState('')
  const [activeMood, setActiveMood] = useState<string | null>(null)
  const [gratitude1, setGratitude1] = useState('')
  const [gratitude2, setGratitude2] = useState('')
  const [gratitude3, setGratitude3] = useState('')
  const [saveStatus, setSaveStatus] = useState('Saved')

  // Sync state with activeEntry when selectedDate or activeEntry changes
  useEffect(() => {
    if (activeEntry) {
      setBodyText(activeEntry.body)
      setActiveMood(activeEntry.mood)
      setGratitude1(activeEntry.gratitude[0] || '')
      setGratitude2(activeEntry.gratitude[1] || '')
      setGratitude3(activeEntry.gratitude[2] || '')
    } else {
      setBodyText('')
      setActiveMood(null)
      setGratitude1('')
      setGratitude2('')
      setGratitude3('')
    }
    setSaveStatus('Saved')
  }, [selectedDate, activeEntry])

  // Auto-save debouncer
  const saveTimeoutRef = useRef<number | null>(null)

  const triggerSave = (
    nextBody: string,
    nextMood: string | null,
    g1: string,
    g2: string,
    g3: string
  ) => {
    setSaveStatus('Saving...')
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      const isNew = !activeEntry
      const gratArray = [g1, g2, g3].map(s => s.trim()).filter(Boolean)
      upsertJournalEntry(
        {
          id: activeEntry?.id,
          body: nextBody,
          entry_date: selectedDate,
          mood: nextMood,
          gratitude: gratArray,
          created_at: activeEntry?.created_at,
          media_paths: activeEntry?.media_paths ?? [],
          transcript: activeEntry?.transcript ?? null,
        },
        isNew
      )
      setSaveStatus('Saved · just now')
    }, 800)
  }

  const handleBodyChange = (val: string) => {
    setBodyText(val)
    triggerSave(val, activeMood, gratitude1, gratitude2, gratitude3)
  }

  const handleMoodSelect = (mood: string) => {
    const nextMood = activeMood === mood ? null : mood
    setActiveMood(nextMood)
    triggerSave(bodyText, nextMood, gratitude1, gratitude2, gratitude3)
  }

  const handleGratitudeChange = (index: number, val: string) => {
    if (index === 1) {
      setGratitude1(val)
      triggerSave(bodyText, activeMood, val, gratitude2, gratitude3)
    } else if (index === 2) {
      setGratitude2(val)
      triggerSave(bodyText, activeMood, gratitude1, val, gratitude3)
    } else {
      setGratitude3(val)
      triggerSave(bodyText, activeMood, gratitude1, gratitude2, val)
    }
  }

  // Calculate streak from entries list (consecutive days of journals)
  const streakDays = useMemo(() => {
    if (entries.length === 0) return 0
    const dates = entries
      .map((e) => new Date(e.entry_date).toDateString())
      .map((str) => new Date(str).getTime())
      .sort((a, b) => b - a)

    // Remove duplicates
    const uniqueDates = Array.from(new Set(dates))
    if (uniqueDates.length === 0) return 0

    let streak = 0
    const oneDay = 24 * 60 * 60 * 1000
    let currentCheck = new Date(todayStr).getTime()

    // If they haven't written today, check if they wrote yesterday to keep streak
    const hasToday = uniqueDates.includes(currentCheck)
    const hasYesterday = uniqueDates.includes(currentCheck - oneDay)

    if (!hasToday && !hasYesterday) return 0

    if (!hasToday && hasYesterday) {
      currentCheck -= oneDay
    }

    for (let i = 0; i < uniqueDates.length; i++) {
      if (uniqueDates.includes(currentCheck)) {
        streak++
        currentCheck -= oneDay
      } else {
        break
      }
    }
    return streak
  }, [entries, todayStr])

  // "On this day" logic (returns entry from a year ago if exists, or older ones)
  const onThisDayEntry = useMemo(() => {
    if (entries.length === 0) return null
    const selectedD = new Date(selectedDate)
    const targetMonth = selectedD.getMonth()
    const targetDay = selectedD.getDate()
    const targetYear = selectedD.getFullYear()

    // Find entries on the same month and day but from different years
    const match = entries.find((e) => {
      const d = new Date(e.entry_date)
      return (
        d.getMonth() === targetMonth &&
        d.getDate() === targetDay &&
        d.getFullYear() < targetYear
      )
    })
    return match || null
  }, [entries, selectedDate])

  const handleAddCommentary = () => {
    if (!newCommentaryText.trim() || !commonplaceQuote) return
    createCommentary({
      parent_type: 'quote',
      parent_id: commonplaceQuote.id,
      body: newCommentaryText.trim()
    })
    setNewCommentaryText('')
    setShowAddCommentary(false)
  }

  // Formatting date for headers
  const headerDateStr = useMemo(() => {
    const d = new Date(selectedDate)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  }, [selectedDate])

  // Short week date helper e.g. Friday, Jul 10
  const shortDateLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })
  }

  // Get current day count (total days count or offset)
  const dayCount = useMemo(() => {
    // Total entries count
    return entries.length || 1
  }, [entries])

  // Format list items of journal week
  const weekEntries = useMemo(() => {
    // Calculate last 7 dates from today back
    const result = []
    const base = new Date(todayStr)
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getTime() - i * 24 * 60 * 60 * 1000)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      result.push(`${yyyy}-${mm}-${dd}`)
    }
    return result
  }, [todayStr])

  // Renders the mobile sub-panels
  const renderMobileNotes = () => (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Notes Shelf</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {notes.map((n) => (
          <div
            key={n.id}
            onClick={() => navigate(`/library?noteId=${n.id}`)}
            style={{ padding: '10px 12px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, cursor: 'pointer', marginBottom: 6 }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-body)' }}>{n.title || 'Untitled Note'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {n.body}
            </div>
          </div>
        ))}
        {notes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No notes kept yet.</div>}
      </div>
    </div>
  )

  const renderMobileQuotes = () => (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Quotes Shelf</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {quotes.map((q) => (
          <div
            key={q.id}
            onClick={() => navigate(`/library?quoteId=${q.id}`)}
            style={{ padding: '12px 14px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, cursor: 'pointer' }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.4 }}>
              "{q.text}"
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', marginTop: 6, textAlign: 'right' }}>
              — {q.author || 'Unknown'}
            </div>
          </div>
        ))}
        {quotes.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No quotes kept yet.</div>}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ width: '100%', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div className="grain" style={{ borderRadius: 0, pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 5 }} />
        
        <div style={{ flex: 1, padding: '16px 20px 80px', position: 'relative', zIndex: 10 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src={getFernImage(bodyText.length)} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Journal · Day {dayCount}</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, lineHeight: 1, color: 'var(--ink-body)' }}>{shortDateLabel(selectedDate)}</h1>
            </div>
          </div>

          {/* Segmented Tab */}
          <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
            <span
              onClick={() => setMobileTab('journal')}
              style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'journal' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'journal' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Journal
            </span>
            <span
              onClick={() => setMobileTab('notes')}
              style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'notes' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'notes' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Notes
            </span>
            <span
              onClick={() => setMobileTab('quotes')}
              style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'quotes' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'quotes' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Quotes
            </span>
          </div>

          {mobileTab === 'notes' && renderMobileNotes()}
          {mobileTab === 'quotes' && renderMobileQuotes()}

          {mobileTab === 'journal' && (
            <>
              {/* Prompt */}
              <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-body)', marginTop: 20, lineHeight: 1.4 }}>
                {PROMPTS[promptIndex]}
              </div>

              {/* Writing Card */}
              <div style={{ marginTop: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 16px 14px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, left: 30, width: 56, height: 15, background: 'rgba(212,199,138,0.5)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }}></span>
                
                <textarea
                  value={bodyText}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  placeholder="Type to write on this quiet page..."
                  className="ruled"
                  style={{
                    width: '100%',
                    minHeight: 120,
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: '14.5px',
                    lineHeight: '26px',
                    color: 'var(--ink-body)',
                    resize: 'none',
                    outline: 'none',
                    padding: 0
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
                  <span>🎤 Talk</span>
                  <span>＋ Photo</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--acc-sage-text)' }}>{saveStatus}</span>
                </div>
              </div>

              {/* Mood */}
              <div style={{ marginTop: 18, fontSize: 13.5, color: 'var(--ink-muted)' }}>Today felt —</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                {MOODS.map((m) => {
                  const selected = activeMood === m
                  return (
                    <span
                      key={m}
                      onClick={() => handleMoodSelect(m)}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        color: selected ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        background: selected ? 'rgba(138,154,126,0.2)' : 'transparent',
                        border: selected ? '1px solid var(--acc-sage)' : '1px solid var(--line-solid)',
                        borderRadius: 999,
                        padding: '6px 11px',
                        cursor: 'pointer'
                      }}
                    >
                      {selected ? `✿ ${m}` : m}
                    </span>
                  )
                })}
              </div>

              {/* Gratitude */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 10px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Three small things</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[gratitude1, gratitude2, gratitude3].map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <span style={{ color: 'var(--acc-blossom)' }}>✿</span>
                    <input
                      value={val}
                      onChange={(e) => handleGratitudeChange(idx + 1, e.target.value)}
                      placeholder={idx === 2 ? "Add a third..." : `Something you are grateful for...`}
                      style={{ flex: 1, border: 'none', background: 'transparent', font: 'inherit', fontSize: '14.5px', color: val ? 'var(--ink-body)' : 'var(--ink-hairline)', outline: 'none', padding: 0 }}
                    />
                  </div>
                ))}
              </div>

              {/* Quote Card */}
              {commonplaceQuote && (
                <div style={{ marginTop: 22, position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '15px 15px 13px', transform: 'rotate(-0.4deg)' }}>
                  <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', top: -13, right: 10, height: 30, filter: 'var(--shadow-drop-sm)' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Quote of the day</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink-body)', marginTop: 7 }}>
                    "{commonplaceQuote.text}"
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 8 }}>
                    — {commonplaceQuote.author}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Desktop layout (1a)
  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '85vh', background: 'var(--paper-linen)', position: 'relative' }}>
      <div className="grain" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 10 }} />
      
      {/* 1. LEFT RAIL: Entry tree + Gutter */}
      <aside style={{ width: 230, flex: 'none', borderRight: '1px dashed var(--line-solid)', position: 'relative', padding: '22px 18px', display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* Floating Fern Gutter */}
        <img src="/ds/assets/fern/coil.png" alt="" style={{ position: 'absolute', right: 6, top: 78, height: 30, opacity: 0.45 }} />
        <img src="/ds/assets/fern/unfurl1.png" alt="" style={{ position: 'absolute', right: 4, top: 250, height: 38, opacity: 0.5 }} />
        <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ position: 'absolute', right: 2, top: 470, height: 46, opacity: 0.55 }} />
        <img src="/ds/assets/fern/full.png" alt="" style={{ position: 'absolute', right: 0, bottom: 26, height: 60, opacity: 0.6, filter: 'var(--shadow-drop-sm)' }} />

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setSelectedDate(todayStr)}
            style={{ flex: 1, border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 12px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}
          >
            ＋ New entry
          </button>
        </div>

        {/* Weekly entries */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '4px 0 8px' }}>This week</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {weekEntries.map((dateStr) => {
            const hasEntry = entries.some((e) => e.entry_date === dateStr)
            const isSelected = selectedDate === dateStr
            const dateObj = new Date(dateStr)
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
            const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const entryForDate = entries.find((e) => e.entry_date === dateStr)

            if (isSelected) {
              return (
                <div
                  key={dateStr}
                  style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '9px 11px', marginBottom: 6 }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-body)', fontWeight: 500 }}>{dayName}, {monthDay}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)', marginTop: 3 }}>
                    {entryForDate?.mood || 'writing...'}
                  </div>
                </div>
              )
            } else {
              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{ display: 'block', textDecoration: 'none', padding: '8px 11px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{dayName}, {monthDay}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 2 }}>
                    {entryForDate?.mood || (hasEntry ? 'kept' : 'empty')}
                  </div>
                </div>
              )
            }
          })}
        </div>

        {/* Notes shelf link list */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 8px' }}>Notes</div>
        {notes.slice(0, 4).map((n) => (
          <div
            key={n.id}
            onClick={() => navigate(`/library?noteId=${n.id}`)}
            style={{ padding: '6px 11px', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {n.title || 'Untitled Note'}
          </div>
        ))}

        {/* Quotes shelf link list */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 8px' }}>Quotes</div>
        {quotes.slice(0, 4).map((q) => (
          <div
            key={q.id}
            onClick={() => navigate(`/library?quoteId=${q.id}`)}
            style={{ padding: '6px 11px', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {q.author ? `${q.author} · quote` : 'Untitled quote'}
          </div>
        ))}
      </aside>

      {/* 2. MAIN COLUMN: Writing Columns */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', zIndex: 15 }}>
        
        {/* Top Header info */}
        <div style={{ height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Kai's Flow</span>
            <span>·</span>
            <span>{headerDateStr}</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Synced
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc-sage)' }}></span>
            </span>
          </div>
          <div>Africa/Cairo</div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '34px 40px 44px', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 660 }}>
            
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Journal · Day {dayCount}</div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{headerDateStr}</h1>
              <img src={getFernImage(bodyText.length)} alt="" style={{ height: 40, filter: 'var(--shadow-drop-sm)', opacity: 0.8 }} title="Frond unfurling stage" />
            </div>

            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', marginTop: 8 }}>a quiet page, only for you ✿</div>

            {/* Prompt Selector */}
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Today's prompt</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
              <span
                onClick={() => setPromptIndex((prev) => (prev + 1) % PROMPTS.length)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', cursor: 'pointer', userSelect: 'none' }}
              >
                ↻ another
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, color: 'var(--ink-body)', marginTop: 12, lineHeight: 1.4 }}>
              {PROMPTS[promptIndex]}
            </div>

            {/* Ruled Notebook Card */}
            <div style={{ marginTop: 16, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '22px 26px 26px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -9, left: 40, width: 66, height: 17, background: 'rgba(212,199,138,0.5)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }}></span>
              
              <textarea
                value={bodyText}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Start writing..."
                className="ruled"
                style={{
                  width: '100%',
                  minHeight: 180,
                  border: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: '15.5px',
                  lineHeight: '27px',
                  color: 'var(--ink-body)',
                  resize: 'none',
                  outline: 'none',
                  padding: 0
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>🎤 Talk it out</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>＋ Photo</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>{saveStatus}</span>
              </div>
            </div>

            {/* Mood picker */}
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 15, color: 'var(--ink-muted)' }}>Today felt —</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {MOODS.map((m) => {
                  const selected = activeMood === m
                  return (
                    <span
                      key={m}
                      onClick={() => handleMoodSelect(m)}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: selected ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        background: selected ? 'rgba(138,154,126,0.2)' : 'transparent',
                        border: selected ? '1px solid var(--acc-sage)' : '1px solid var(--line-solid)',
                        borderRadius: 999,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      {selected ? `✿ ${m}` : m}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Three small things */}
            <div style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Three small things</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[gratitude1, gratitude2, gratitude3].map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0' }}>
                    <span style={{ color: 'var(--acc-blossom)', fontSize: 13 }}>✿</span>
                    <input
                      value={val}
                      onChange={(e) => handleGratitudeChange(idx + 1, e.target.value)}
                      placeholder={idx === 2 ? "Add a third..." : `Something you are grateful for...`}
                      style={{ flex: 1, border: 'none', background: 'transparent', font: 'inherit', fontSize: '15px', color: val ? 'var(--ink-body)' : 'var(--ink-hairline)', outline: 'none', padding: 0 }}
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* 3. RIGHT RAIL: Quote of the Day, On This Day, Streak */}
      <aside style={{ width: 262, flex: 'none', borderLeft: '1px dashed var(--line-solid)', padding: '30px 22px', display: 'flex', flexDirection: 'column', gap: 28, zIndex: 15 }}>
        
        {/* Quote of the day */}
        {commonplaceQuote && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Quote of the day</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
            </div>
            <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 16px 14px', transform: 'rotate(-0.4deg)' }}>
              <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', top: -14, right: 10, height: 34, filter: 'var(--shadow-drop-sm)' }} />
              
              <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-body)' }}>
                "{commonplaceQuote.text}"
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 10 }}>
                — {commonplaceQuote.author || 'Unknown'}
              </div>

              <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px dashed var(--line-dashed)' }}>
                {commonplaceCommentaries.map((c) => (
                  <div key={c.id} style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', lineHeight: 1.35, marginBottom: 6 }}>
                    {c.body}
                  </div>
                ))}

                {showAddCommentary ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={newCommentaryText}
                      onChange={(e) => setNewCommentaryText(e.target.value)}
                      placeholder="Add a thought..."
                      style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: '13px', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', outline: 'none', resize: 'none', padding: 6, borderRadius: 3 }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowAddCommentary(false)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '10.5px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleAddCommentary} style={{ border: 'none', background: 'var(--acc-terra)', color: '#fff', font: 'inherit', fontSize: '10.5px', padding: '3px 8px', borderRadius: 999, cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setShowAddCommentary(true)}
                    style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    ＋ add a thought
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* On this day */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>On this day</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>
          {onThisDayEntry ? (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>
                {new Date(onThisDayEntry.entry_date).getFullYear() === new Date(selectedDate).getFullYear() - 1 ? 'One year ago' : `${new Date(selectedDate).getFullYear() - new Date(onThisDayEntry.entry_date).getFullYear()} years ago`}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, color: 'var(--ink-body)', marginTop: 7, lineHeight: 1.45 }}>
                "{onThisDayEntry.body.slice(0, 100)}{onThisDayEntry.body.length > 100 ? '...' : ''}"
              </div>
              {onThisDayEntry.gratitude.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                  Grateful for: {onThisDayEntry.gratitude.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
              No entries on this day in past years.
            </div>
          )}
        </section>

        {/* Streak */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Kept</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/ds/assets/fern/full.png" alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-body)', lineHeight: 1 }}>{streakDays} days</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 3 }}>of showing up</div>
            </div>
          </div>
        </section>

      </aside>
    </div>
  )
}
