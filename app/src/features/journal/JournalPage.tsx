import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useOnline } from '../../lib/useOnline'
import { useJournalEntries, upsertJournalEntry, deleteJournalEntry, restoreJournalEntry } from './api'
import { entriesForDay, dayField, dayOrdinal, writtenStreak, isWritten, entryTime, holdRow, withHeldRows, listState, daysLabel, PAST_AWAY, PAST_RESTING, type HeldRows, type ListState } from './journalDay'
import { useNotes, useQuotes, useCommentaries, createCommentary } from '../library/api'
import { animateRowRemoval, useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { fernByLength } from '../../lib/growthStages'
import { toastUndo } from '../../lib/undo'
import { Button } from '../../components/kit'
import { ConfirmCard } from '../projects/ConfirmCard'
import type { JournalEntry } from '../../lib/types'
import '../projects/xfx.css'

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

// Fern thresholds are Foundation's (lib/growthStages) — the local copy that used to live
// here is gone, so Journal can never drift from Review/Library (punch item 10).
function fernSrc(length: number): string {
  return `/ds/assets/fern/${fernByLength(length)}.png`
}

/** States.dc.html 1d — the pencil resting on the first, still-blank page. The export's colours
 * through their tokens: gold-warm body, blossom eraser; buttercream wood and a muted graphite
 * point are the nearest tokens to its #e8ddc4 / #4d4738. */
function RestingPencil() {
  return (
    <svg aria-hidden width="120" height="16" viewBox="0 0 120 16" style={{ position: 'absolute', right: 18, bottom: -7, transform: 'rotate(-3deg)', pointerEvents: 'none' }}>
      <rect x="14" y="4" width="92" height="8" rx="2" fill="var(--acc-gold-warm)" />
      <path d="M14 4 2 8l12 4V4Z" fill="var(--acc-buttercream)" />
      <path d="M6.5 6.5 2 8l4.5 1.5v-3Z" fill="var(--ink-muted)" />
      <rect x="106" y="4" width="10" height="8" rx="2" fill="var(--acc-blossom)" />
    </svg>
  )
}

/** Polish G: the journal's past couldn't be read — offline before it ever loaded on this device,
 * or the request failed. Said in the page's own hand, where the first-page line sits, with one
 * retry when there's something to retry. The notebook stays writable either way. */
function PastNote({ state, retrying, onRetry, size }: { state: Extract<ListState, 'away' | 'resting'>; retrying: boolean; onRetry: () => void; size: number }) {
  return (
    <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
      <span style={{ fontFamily: 'var(--font-hand)', fontSize: size, lineHeight: 1.35, color: 'var(--ink-hand)' }}>{state === 'away' ? PAST_AWAY : PAST_RESTING}</span>
      {state === 'resting' && (
        <Button type="button" variant="secondary" onClick={onRetry} disabled={retrying} style={{ fontSize: 12, padding: '6px 14px' }}>
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      )}
    </div>
  )
}

/** The phone Notes / Quotes shelf (1b tabs) when it has nothing to list: empty, offline before it
 * ever loaded, or failed. Journal's fern, still coiled, and one hand line — plus a retry when
 * there's something to retry. No "go add one" button: the Library is parked (K-26), so there's
 * nowhere to send anyone. Loading shows nothing; it's brief, and an unloaded shelf isn't empty. */
type ShelfQuery = { data: unknown[] | undefined; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle'; isFetching: boolean; refetch: () => unknown }
function ShelfState({ q, what }: { q: ShelfQuery; what: 'notes' | 'quotes' }) {
  const online = useOnline()
  const s = listState(q, online)
  if (s === 'loading' || (s === 'ready' && (q.data?.length ?? 0) > 0)) return null
  const line = s === 'ready' ? `No ${what} on the shelf yet.` : s === 'away' ? "The shelf will be here when you're back online." : "The shelf didn't come through just now."
  return (
    <div role={s === 'ready' ? undefined : 'status'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 0 10px' }}>
      <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
      <div style={{ marginTop: 12, fontFamily: 'var(--font-hand)', fontSize: 17, lineHeight: 1.35, color: 'var(--ink-hand)', textAlign: 'center' }}>{line}</div>
      {s === 'resting' && (
        <Button type="button" variant="secondary" onClick={() => void q.refetch()} disabled={q.isFetching} style={{ marginTop: 14, fontSize: 12, padding: '6px 14px' }}>
          {q.isFetching ? 'Trying…' : 'Try again'}
        </Button>
      )}
    </div>
  )
}

export function JournalPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()


  // Queries
  const journalQ = useJournalEntries()
  const listed = journalQ.data
  // Polish G: until the list has arrived, nothing derived from it is claimed (see `listState`).
  const online = useOnline()
  const past = listState(journalQ, online)
  const known = past === 'ready'
  const pastUnread = past === 'away' || past === 'resting'
  const pastNote = (size: number) =>
    past === 'away' || past === 'resting' ? <PastNote state={past} retrying={journalQ.isFetching} onRetry={() => void journalQ.refetch()} size={size} /> : null
  // P0-B: rows this page wrote that the cached list doesn't have yet (it never loaded on this
  // device — offline, or typing before the first fetch lands). See `holdRow`.
  const [held, setHeld] = useState<HeldRows>({})
  const entries = useMemo(() => withHeldRows(listed ?? [], held), [listed, held])
  // States 1d — first-run: the input is the action, this line is the invitation. Only once the
  // list has arrived: an unloaded list is not an empty one.
  const firstPage = known && !entries.some(isWritten)
  const notesQ = useNotes()
  const quotesQ = useQuotes()
  const notes = notesQ.data ?? []
  const quotes = quotesQ.data ?? []

  // Find a quote for commonplace rail (first quote or random)
  const commonplaceQuote = useMemo(() => {
    return quotesQ.data?.[0] || null
  }, [quotesQ.data])

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
  // Kai 2026-10-06: a search hit for an entry opened today's page, not the entry. /journal?focus=<id>
  // now turns to its day (once, when the entry is known) and brings it into view.
  const focusId = useSearchParams()[0].get('focus')
  const focusEntry = focusId ? entries.find((e) => e.id === focusId) : undefined
  const [turnedTo, setTurnedTo] = useState<string | null>(null)
  if (focusEntry && turnedTo !== focusEntry.id) {
    setTurnedTo(focusEntry.id)
    setSelectedDate(focusEntry.entry_date)
  }
  useEffect(() => {
    if (turnedTo) document.getElementById(`journal-${turnedTo}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [turnedTo, selectedDate])
  const [promptIndex, setPromptIndex] = useState(0)
  const [newCommentaryText, setNewCommentaryText] = useState('')
  const [showAddCommentary, setShowAddCommentary] = useState(false)
  const [mobileTab, setMobileTab] = useState<'journal' | 'notes' | 'quotes'>('journal')

  // ── D-1 model ────────────────────────────────────────────────────────────────────────
  // One daily page holding N timestamped entries. `created_at` IS the timestamp; the day is
  // just every row sharing an `entry_date` (migration 0033 drops the unique index that made
  // that impossible). Mood + the three small things stay day-level and ride on the day's
  // first entry.
  const dayEntries = useMemo(() => entriesForDay(entries, selectedDate), [entries, selectedDate])

  // Body text in flight, keyed by entry id — the cache only catches up after the debounce.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const bodyOf = (e: JournalEntry) => drafts[e.id] ?? e.body
  const dayLength = dayEntries.reduce((n, e) => n + bodyOf(e).length, 0)

  const [activeMood, setActiveMood] = useState<string | null>(null)
  const [gratitude1, setGratitude1] = useState('')
  const [gratitude2, setGratitude2] = useState('')
  const [gratitude3, setGratitude3] = useState('')
  const [saveStatus, setSaveStatus] = useState('Saved')
  const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null)

  const dayMood = dayField(dayEntries, 'mood')
  const dayGratitude = dayField(dayEntries, 'gratitude')

  // Sync the day-level fields when the page (or its holder row) changes.
  useEffect(() => {
    setActiveMood(dayMood)
    setGratitude1(dayGratitude?.[0] || '')
    setGratitude2(dayGratitude?.[1] || '')
    setGratitude3(dayGratitude?.[2] || '')
    setSaveStatus('Saved')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, dayMood, dayGratitude?.join(' ')])

  // Drafts are per-page; drop them when you turn the page.
  useEffect(() => setDrafts({}), [selectedDate])

  // One debounce per entry (plus one for the day-level fields) so typing in the 9am entry
  // never cancels the pending save of the 9pm one.
  const timers = useRef<Record<string, number>>({})
  const dayTimer = useRef<number>(0)
  useEffect(() => () => { Object.values(timers.current).forEach(window.clearTimeout); window.clearTimeout(dayTimer.current) }, [])

  // Every upsert sends the WHOLE row, so two debounces firing in either order would each
  // overwrite the other's field with whatever was on screen when its timer was set. Both
  // compose from here instead of from their captured render, so the loser of the race only
  // rewrites what the winner already wrote.
  const latest = useRef({ dayEntries, drafts, mood: activeMood, grats: [gratitude1, gratitude2, gratitude3], listed: listed ?? [] })
  latest.current = { dayEntries, drafts, mood: activeMood, grats: [gratitude1, gratitude2, gratitude3], listed: listed ?? [] }
  const rowNow = (id: string): JournalEntry | undefined => {
    const e = latest.current.dayEntries.find((x) => x.id === id)
    return e && { ...e, body: latest.current.drafts[id] ?? e.body }
  }

  /** Every journal write on this page goes through `hold`, so the page always sees the row it
   * just wrote — same id, latest body — even when the cached list can't take it yet. */
  const hold = (row: JournalEntry) => setHeld((h) => holdRow(h, row, latest.current.listed))
  const save = (entry: Parameters<typeof upsertJournalEntry>[0], isNew: boolean) => {
    const row = upsertJournalEntry(entry, isNew)
    hold(row)
    return row
  }

  // Focus hand-off: a brand-new entry (or the first keystroke on a blank day) mounts a
  // different textarea than the one that was focused, so claim it on mount.
  const wantFocus = useRef<string | null>(null)
  const claimFocus = (id: string) => (el: HTMLTextAreaElement | null) => {
    if (!el || wantFocus.current !== id) return
    wantFocus.current = null
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  const handleBodyChange = (entry: JournalEntry, val: string) => {
    setDrafts((d) => ({ ...d, [entry.id]: val }))
    setSaveStatus('Saving...')
    window.clearTimeout(timers.current[entry.id])
    timers.current[entry.id] = window.setTimeout(() => {
      const cur = rowNow(entry.id)
      if (!cur) return // deleted while the save was pending — don't resurrect it
      save({ ...cur, body: val }, false)
      // The write is in the cache now, so the draft has served its purpose — drop it, or it
      // would mask a later update to this row arriving from another device.
      setDrafts(({ [entry.id]: _saved, ...rest }) => rest)
      setSaveStatus('Saved · just now')
    }, 800)
  }

  /** "+ New entry" — punch 47: this used to only jump to today. Now it actually adds one,
   * stamped now, focused for typing. */
  const addEntry = (date = todayStr, from?: HTMLElement) => {
    setSelectedDate(date)
    const row = save({ entry_date: date, body: '' }, true)
    seedPlant(from, motion) // Motion 5f — "+ New entry" drops a seed into the day's column
    wantFocus.current = row.id
  }

  /** First keystroke on a day with no entries writes the entry rather than making the user
   * press "+ New entry" first — the input is the action (design state 1d). */
  const startFirstEntry = (val: string) => {
    const row = save({ entry_date: selectedDate, body: val }, true)
    setDrafts((d) => ({ ...d, [row.id]: val }))
    wantFocus.current = row.id
  }

  /** Delete → Trash, restorable — same soft-delete the four trashable tables share. */
  const removeEntry = (entry: JournalEntry) => {
    // A queued body save would upsert the row back with deleted_at null, i.e. resurrect it.
    // Cancel it before the exit animation, not inside it — the debounce must die immediately.
    window.clearTimeout(timers.current[entry.id])
    const row = { ...entry, body: bodyOf(entry) }
    const heir = dayEntries.find((e) => e.id !== entry.id)
    // Motion 3e (WB-1) — the entry slides out and the day's column closes over it.
    animateRowRemoval(document.getElementById(`journal-${entry.id}`), () => {
      hold(deleteJournalEntry(row))
      // The day's mood / three small things live on its first entry — hand them down rather
      // than let them leave with it. (Undo leaves the heir holding a harmless stale copy;
      // `dayField` reads the earliest holder, which is the restored row again.)
      if (heir && (row.mood || row.gratitude.length) && !heir.mood && heir.gratitude.length === 0) {
        save({ ...heir, mood: row.mood, gratitude: row.gratitude }, false)
      }
      toastUndo(`Deleted · ${entryTime(row.created_at)} entry`, () => hold(restoreJournalEntry(row)))
    })
  }

  /** Mood + the three small things are day-level; they ride on the day's first entry. */
  const saveDayFields = () => {
    setSaveStatus('Saving...')
    window.clearTimeout(dayTimer.current)
    dayTimer.current = window.setTimeout(() => {
      const { mood, grats } = latest.current
      const gratitude = grats.map((s) => s.trim()).filter(Boolean)
      const target = latest.current.dayEntries[0]
      const cur = target && rowNow(target.id)
      save(
        cur ? { ...cur, mood, gratitude } : { entry_date: selectedDate, body: '', mood, gratitude },
        !cur
      )
      setSaveStatus('Saved · just now')
    }, 800)
  }

  const handleMoodSelect = (mood: string) => {
    const nextMood = activeMood === mood ? null : mood
    setActiveMood(nextMood)
    latest.current.mood = nextMood
    saveDayFields()
  }

  const handleGratitudeChange = (index: number, val: string) => {
    ;[setGratitude1, setGratitude2, setGratitude3][index - 1](val)
    latest.current.grats[index - 1] = val
    saveDayFields()
  }

  // Consecutive days with something actually written (an untouched "+ New entry" is not a
  // day journaled — punch item 10, growth stages never lie).
  const streakDays = useMemo(() => writtenStreak(entries, todayStr), [entries, todayStr])

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
        isWritten(e) &&
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

  // "Day N" = which numbered day of journaling this page is — days, not entries (drift J7).
  const dayCount = useMemo(() => dayOrdinal(entries, selectedDate), [entries, selectedDate])

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

  /** The day's entries inside the notebook card, in time order. Shared by 1a and 1b — same
   * ruled textarea the export specs, one per entry, each with its stamp and its delete. */
  const renderEntries = (t: { fontSize: number; lineHeight: number; minHeight: number; placeholder: string; stamp: number }) => {
    // The page's own first entry keeps the export's full page-height; the ones stacked under
    // it start at three ruled lines and grow (see `field-sizing` above).
    const ta = (entry: JournalEntry | null, value: string, onChange: (v: string) => void, minHeight = t.minHeight) => (
      <textarea
        ref={entry ? claimFocus(entry.id) : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.placeholder}
        className="ruled"
        style={{
          width: '100%',
          minHeight,
          border: 'none',
          backgroundColor: 'transparent',
          fontFamily: 'inherit',
          fontSize: `${t.fontSize}px`,
          lineHeight: `${t.lineHeight}px`,
          color: 'var(--ink-body)',
          caretColor: 'var(--acc-terra)', // States 1d: the terra cursor on the open page
          resize: 'none',
          outline: 'none',
          padding: 0,
        }}
      />
    )
    if (dayEntries.length === 0) return ta(null, '', startFirstEntry)
    return dayEntries.map((entry, i) => (
      <div key={entry.id} id={`journal-${entry.id}`} className="kf-row-in" style={i === 0 ? undefined : { marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: t.stamp, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            {entryTime(entry.created_at)}
          </span>
          <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          <span
            onClick={() => setConfirmDelete(entry)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: t.stamp, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer', userSelect: 'none' }}
          >
            Delete
          </span>
        </div>
        {ta(entry, bodyOf(entry), (v) => handleBodyChange(entry, v), i === 0 ? t.minHeight : t.lineHeight * 3)}
      </div>
    ))
  }

  const confirmCard = confirmDelete && (
    <ConfirmCard
      title="Delete this entry?"
      body="It moves to Trash — you can restore it from there."
      confirmLabel="Delete"
      onConfirm={() => { removeEntry(confirmDelete); setConfirmDelete(null) }}
      onCancel={() => setConfirmDelete(null)}
    />
  )

  // Renders the mobile sub-panels
  const renderMobileNotes = () => (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Notes Shelf</div>
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
        <ShelfState q={notesQ} what="notes" />
      </div>
    </div>
  )

  const renderMobileQuotes = () => (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>Quotes Shelf</div>
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 6, textAlign: 'right' }}>
              — {q.author || 'Unknown'}
            </div>
          </div>
        ))}
        <ShelfState q={quotesQ} what="quotes" />
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ width: '100%', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          .ruled {
            background-image: repeating-linear-gradient(transparent 0px, transparent 25px, var(--line-dashed) 25px, var(--line-dashed) 26px);
            background-attachment: local;
            /* A day of N entries must not be N fixed 120px boxes. Native auto-grow; where it
               isn't supported the min-height below is simply the old fixed behaviour. */
            field-sizing: content;
          }
        `}</style>
        <div className="grain" style={{ borderRadius: 0, pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 5 }} />
        
        <div style={{ flex: 1, padding: '16px 20px 80px', position: 'relative', zIndex: 10 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src={fernSrc(dayLength)} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{known ? `Journal · Day ${dayCount}` : 'Journal'}</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, lineHeight: 1, color: 'var(--ink-body)' }}>{shortDateLabel(selectedDate)}</h1>
            </div>
          </div>

          {/* Segmented Tab */}
          <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
            <span
              onClick={() => setMobileTab('journal')}
              style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'journal' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'journal' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Journal
            </span>
            <span
              onClick={() => setMobileTab('notes')}
              style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'notes' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'notes' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Notes
            </span>
            <span
              onClick={() => setMobileTab('quotes')}
              style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: mobileTab === 'quotes' ? 'var(--ink-body)' : 'var(--ink-muted)', background: mobileTab === 'quotes' ? 'var(--paper-parchment)' : 'transparent', cursor: 'pointer' }}
            >
              Quotes
            </span>
          </div>

          {mobileTab === 'notes' && renderMobileNotes()}
          {mobileTab === 'quotes' && renderMobileQuotes()}

          {mobileTab === 'journal' && (
            <>
              {/* Polish G: offline before the journal ever loaded here, or it failed to load. */}
              {pastUnread && <div style={{ marginTop: 16 }}>{pastNote(16)}</div>}

              {/* Prompt */}
              <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink-body)', marginTop: 20, lineHeight: 1.4 }}>
                {firstPage ? 'The first page is the hardest — one sentence counts.' : PROMPTS[promptIndex]}
              </div>

              {/* Writing Card */}
              <div style={{ marginTop: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 16px 14px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, left: 30, width: 56, height: 15, background: 'color-mix(in oklch, var(--acc-buttercream) 50%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }}></span>
                {firstPage && <RestingPencil />}

                {renderEntries({ fontSize: 14.5, lineHeight: 26, minHeight: 120, placeholder: 'Type to write on this quiet page...', stamp: 8.5 })}

                {/* Polish G: at a 125% interface size (the phone default until F2b) a 390px phone lays this card out
                    ~258 CSS px wide, and each label broke onto two lines ("＋ NEW / ENTRY"). Labels
                    stay whole; the save state takes its own line only when it doesn't fit. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)', whiteSpace: 'nowrap' }}>
                  {/* 1b has no left rail, so the day's "+ New entry" lives in the card footer. */}
                  <span onClick={(e) => addEntry(selectedDate, e.currentTarget)} style={{ color: 'var(--acc-terra)', cursor: 'pointer' }}>＋ New entry</span>
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
                        fontSize: 'var(--fs-meta)',
                        textTransform: 'uppercase',
                        color: selected ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        background: selected ? 'color-mix(in oklch, var(--acc-sage) 20%, transparent)' : 'transparent',
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Three small things</span>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Quote of the day</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink-body)', marginTop: 7 }}>
                    "{commonplaceQuote.text}"
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 8 }}>
                    — {commonplaceQuote.author}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {confirmCard}
      </div>
    )
  }

  // Desktop layout (1a)
  return (
    <div className="jn" style={{ width: '100%', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        .ruled {
          background-image: repeating-linear-gradient(transparent 0px, transparent 26px, var(--line-dashed) 26px, var(--line-dashed) 27px);
          background-attachment: local;
          /* See 1b: the day holds N entries, so each one grows to its own content. */
          field-sizing: content;
        }
        .journal-sidebar-link {
          transition: color var(--dur-quick) var(--ease-natural);
        }
        .journal-sidebar-link:hover, .journal-sidebar-link:hover * {
          color: var(--acc-terra) !important;
        }

        /* Polish G (2026-09-26 audit): Journal.dc.html 1a is three FIXED columns — a 230px entry
           tree, the writing page, a 262px rail — drawn on a 1300px card. In the app they sit inside
           the shell (242px sidebar + 40px padding each side), and the default 125% interface size
           (lib/uiScale.ts) lays a 1280px window out in ~1024 CSS px, so the two rails left the page
           ~210 CSS px: the title clipped mid-word and the notebook was a strip. Media queries read
           the WINDOW, which that zoom doesn't shrink, so the columns now follow the page's own
           laid-out width (container queries, the same fix Polish D gave Tasks):
             ≥1000px   the export's three columns, verbatim;
             560–999   the tree stays beside the page and the rail folds under the writing
                       (1280 and 1440 at 125%, 1600 when the sidebar is open);
             <560      one column — the page, then the rail, then the tree; the card footer
                       carries "＋ New entry", as 1b's does.
           Phone (≤767px window) keeps its own 1b layout above. */
        .jn { container: journal / inline-size; }
        .jn-grid {
          display: grid; min-height: 85vh; position: relative; z-index: 15;
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas: "write" "rail" "tree";
        }
        .jn-tree { grid-area: tree; position: relative; display: flex; flex-direction: column; min-width: 0; padding: 22px 20px 28px; border-top: 1px dashed var(--line-solid); }
        .jn-tree-new, .jn-gutter { display: none; }
        .jn-main { grid-area: write; min-width: 0; display: flex; flex-direction: column; }
        .jn-write { flex: 1; display: flex; justify-content: center; padding: 26px 20px 32px; container: jn-write / inline-size; }
        .jn-title { font-size: clamp(28px, 7.8cqi, 40px); text-wrap: balance; }
        .jn-rail {
          grid-area: rail; min-width: 0; padding: 26px 20px 30px; border-top: 1px dashed var(--line-solid);
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 28px; align-content: start;
        }
        .jn-rail-pair { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
        @container journal (min-width: 560px) {
          .jn-grid { grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: "tree write" "tree rail"; }
          .jn-tree { padding: 22px 18px; border-top: none; border-right: 1px dashed var(--line-solid); }
          .jn-tree-new { display: flex; }
          .jn-gutter { display: block; }
          .jn-write { padding: 30px 28px 36px; }
          .jn-rail { padding: 28px 28px 36px; }
          .jn-card-new { display: none; }
        }
        @container journal (min-width: 1000px) {
          .jn-grid { grid-template-columns: 230px minmax(0, 1fr) 262px; grid-template-rows: auto; grid-template-areas: "tree write rail"; }
          .jn-write { padding: 34px 40px 44px; }
          .jn-rail { display: flex; flex-direction: column; gap: 28px; padding: 30px 22px; border-top: none; border-left: 1px dashed var(--line-solid); }
        }
      `}</style>
      <div className="grain" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, zIndex: 10 }} />

      <div className="jn-grid">
      {/* 1. LEFT RAIL: Entry tree + Gutter */}
      <aside className="jn-tree">

        {/* Floating Fern Gutter */}
        <img className="jn-gutter" src="/ds/assets/fern/coil.png" alt="" style={{ position: 'absolute', right: 6, top: 78, height: 30, opacity: 0.45 }} />
        <img className="jn-gutter" src="/ds/assets/fern/unfurl1.png" alt="" style={{ position: 'absolute', right: 4, top: 250, height: 38, opacity: 0.5 }} />
        <img className="jn-gutter" src="/ds/assets/fern/unfurl2.png" alt="" style={{ position: 'absolute', right: 2, top: 470, height: 46, opacity: 0.55 }} />
        <img className="jn-gutter" src="/ds/assets/fern/full.png" alt="" style={{ position: 'absolute', right: 0, bottom: 26, height: 60, opacity: 0.6, filter: 'var(--shadow-drop-sm)' }} />

        {/* Buttons */}
        <div className="jn-tree-new" style={{ alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            onClick={(e) => addEntry(todayStr, e.currentTarget)}
            style={{ flex: 1, border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 12px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}
          >
            ＋ New entry
          </button>
        </div>

        {/* Weekly entries */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '4px 0 8px' }}>This week</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {weekEntries.map((dateStr) => {
            // "kept" means something was actually written that day, not that a row exists.
            const hasEntry = entries.some((e) => e.entry_date === dateStr && isWritten(e))
            const isSelected = selectedDate === dateStr
            const dateObj = new Date(dateStr)
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
            const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const entryForDate = entries.find((e) => e.entry_date === dateStr && e.mood) ?? entries.find((e) => e.entry_date === dateStr)

            if (isSelected) {
              return (
                <div
                  key={dateStr}
                  style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '9px 11px', marginBottom: 6 }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-body)', fontWeight: 500 }}>{dayName}, {monthDay}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)', marginTop: 3 }}>
                    {entryForDate?.mood ? `${entryForDate.mood} · writing…` : 'writing…'}
                  </div>
                </div>
              )
            } else {
              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className="journal-sidebar-link"
                  style={{ display: 'block', textDecoration: 'none', padding: '8px 11px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{dayName}, {monthDay}</div>
                  {/* Until the list arrives a day isn't "empty", only unknown: the line keeps its
                      height and says nothing (Polish G). */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 2 }}>
                    {known ? entryForDate?.mood || (hasEntry ? 'kept' : 'empty') : ' '}
                  </div>
                </div>
              )
            }
          })}
        </div>

        {/* Notes / Quotes shelf link lists. Polish G: a group shows only when it has something to
            list — a brand-new account used to get two bare headings with nothing under them, and
            with the Library parked (K-26) there's no way to fill them from here. */}
        {notes.length > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 8px' }}>Notes</div>}
        {notes.slice(0, 4).map((n) => (
          <div
            key={n.id}
            onClick={() => navigate(`/library?noteId=${n.id}`)}
            className="journal-sidebar-link"
            style={{ padding: '6px 11px', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {n.title || 'Untitled Note'}
          </div>
        ))}

        {quotes.length > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 8px' }}>Quotes</div>}
        {quotes.slice(0, 4).map((q) => (
          <div
            key={q.id}
            onClick={() => navigate(`/library?quoteId=${q.id}`)}
            className="journal-sidebar-link"
            style={{ padding: '6px 11px', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {q.author ? `${q.author} · quote` : 'Untitled quote'}
          </div>
        ))}
      </aside>

      {/* 2. MAIN COLUMN: Writing Columns */}
      <main className="jn-main">
        {/* Polish G (2026-09-26 audit): no in-page "Kai's Flow · {date} · Synced ● / Africa/Cairo"
            strip. In Journal.dc.html 1a it is <main>'s first child, 42px, in the topbar's exact
            style — the export's mock of the shell topbar, which the real shell already draws above
            this page (owner name, date, live sync state, zone). Nothing on it was Journal's own:
            the selected day is the title below. Its "Synced ●" was hard-coded, so it stayed on
            while the topbar said Offline. Same leftover Polish C removed from Activity, Herbarium,
            Trash and Library. */}
        <div className="jn-write">
          <div style={{ width: '100%', maxWidth: 660 }}>
            
            {/* Punch 47 item 5: the fern was mobile-only. Same binding here — the day's total
                written length, through Foundation's shared thresholds. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src={fernSrc(dayLength)} alt="" style={{ height: 52, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>{known ? `Journal · Day ${dayCount}` : 'Journal'}</div>

                {/* Size from .jn-title: the export's 40px wherever the page is wide enough, easing
                    down (never below 28px) so the date keeps to one line in a narrower column. */}
                <h1 className="jn-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{headerDateStr}</h1>
              </div>
            </div>

            {pastUnread ? (
              <div style={{ marginTop: 8 }}>{pastNote(19)}</div>
            ) : (
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)', marginTop: 8 }}>{firstPage ? 'The first page is the hardest — one sentence counts.' : 'a quiet page, only for you ✿'}</div>
            )}

            {/* Prompt Selector */}
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Today's prompt</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
              <span
                onClick={() => setPromptIndex((prev) => (prev + 1) % PROMPTS.length)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', cursor: 'pointer', userSelect: 'none' }}
              >
                ↻ another
              </span>
            </div>
            <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, color: 'var(--ink-body)', marginTop: 12, lineHeight: 1.4 }}>
              {PROMPTS[promptIndex]}
            </div>

            {/* Ruled Notebook Card */}
            <div style={{ marginTop: 16, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '22px 26px 26px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -9, left: 40, width: 66, height: 17, background: 'color-mix(in oklch, var(--acc-buttercream) 50%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }}></span>
              {firstPage && <RestingPencil />}

              {renderEntries({ fontSize: 15.5, lineHeight: 27, minHeight: 180, placeholder: 'Start writing...', stamp: 9 })}

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 10px', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)', whiteSpace: 'nowrap' }}>
                {/* One column (<560px): the tree — and its "＋ New entry" — sits below the page,
                    so the card carries the day's "＋ New entry", as 1b's footer does. */}
                <span className="jn-card-new" onClick={(e) => addEntry(selectedDate, e.currentTarget)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>＋ New entry</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>🎤 Talk it out</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>＋ Photo</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>{saveStatus}</span>
              </div>
            </div>

            {/* Mood picker — the chips drop under "Today felt —" when they don't fit beside it. */}
            <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
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
                        fontSize: 'var(--fs-meta)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: selected ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        background: selected ? 'color-mix(in oklch, var(--acc-sage) 20%, transparent)' : 'transparent',
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Three small things</span>
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

      {/* 3. RIGHT RAIL: Quote of the Day, On This Day, Streak — a column beside the page when
          there's room, otherwise folded under the writing (quote | on this day + kept).
          Polish G: On this day and Kept read the journal's past, so they wait for the list. */}
      {(commonplaceQuote || known) && (
      <aside className="jn-rail">

        {/* Quote of the day */}
        {commonplaceQuote && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Quote of the day</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
            </div>
            <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 16px 14px', transform: 'rotate(-0.4deg)' }}>
              <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', top: -14, right: 10, height: 34, filter: 'var(--shadow-drop-sm)' }} />
              
              <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-body)', animationDelay: '180ms' }}>
                "{commonplaceQuote.text}"
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 10 }}>
                — {commonplaceQuote.author || 'Unknown'}
              </div>

              <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px dashed var(--line-dashed)' }}>
                {commonplaceCommentaries.map((c) => (
                  <div key={c.id} style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', lineHeight: 1.35, marginBottom: 6 }}>
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
                      <button onClick={handleAddCommentary} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: '10.5px', padding: '3px 8px', borderRadius: 999, cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setShowAddCommentary(true)}
                    style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    ＋ add a thought
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {known && (
        <div className="jn-rail-pair">
        {/* On this day */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>On this day</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>
          {onThisDayEntry ? (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>
                {new Date(onThisDayEntry.entry_date).getFullYear() === new Date(selectedDate).getFullYear() - 1 ? 'One year ago' : `${new Date(selectedDate).getFullYear() - new Date(onThisDayEntry.entry_date).getFullYear()} years ago`}
              </div>
              <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, color: 'var(--ink-body)', marginTop: 7, lineHeight: 1.45, animationDelay: '360ms' }}>
                "{onThisDayEntry.body.slice(0, 100)}{onThisDayEntry.body.length > 100 ? '...' : ''}"
              </div>
              {onThisDayEntry.gratitude.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                  Grateful for: {onThisDayEntry.gratitude.join(', ')}
                </div>
              )}
            </div>
          ) : (
            // Polish G: the page's hand, as every designed empty line is — not grey italic UI text.
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, lineHeight: 1.35, color: 'var(--ink-hand)' }}>
              Nothing from this day in past years — yet.
            </div>
          )}
        </section>

        {/* Streak */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Kept</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* The export's full fern — but a streak of 0 is a fern that hasn't unfurled yet
                (growth stages never lie, punch 10). */}
            <img src={`/ds/assets/fern/${streakDays > 0 ? 'full' : 'coil'}.png`} alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-body)', lineHeight: 1 }}>{daysLabel(streakDays)}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 3 }}>of showing up</div>
            </div>
          </div>
        </section>
        </div>
        )}

      </aside>
      )}
      </div>
      {confirmCard}
    </div>
  )
}
