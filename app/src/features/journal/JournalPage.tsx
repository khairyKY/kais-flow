import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useOnline } from '../../lib/useOnline'
import { useJournalEntries, upsertJournalEntry, deleteJournalEntry, restoreJournalEntry } from './api'
import { entriesForDay, dayField, dayOrdinal, daysWrittenThisMonth, isWritten, entryTime, holdRow, withHeldRows, listState, daysLabel, PAST_AWAY, PAST_RESTING, addMedia, removeMedia, appendTranscript, type HeldRows, type ListState } from './journalDay'
import { useNotes, useQuotes, useCommentaries, createCommentary } from '../library/api'
import { animateRowRemoval, scrollBehavior, useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { fernByLength } from '../../lib/growthStages'
import { toastUndo } from '../../lib/undo'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { Button, Chip, SectionLabel, Segmented } from '../../components/kit'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { DateField } from '../../components/DatePicker'
import { addDays } from '../../components/pickerMath'
import { useDayRollover } from '../calendar/useDayRollover'
import { VoiceCaptureSheet } from '../capture/VoiceCaptureSheet'
import { useToastStore } from '../../lib/toastStore'
import { isCapacitorShell } from '../../lib/platform'
import { deleteJournalPhoto, pickImages, uploadJournalPhoto, useJournalPhotoUrls } from './media'
import type { JournalEntry } from '../../lib/types'
import '../projects/xfx.css'

const toast = (message: string) => useToastStore.getState().push({ message })

/** The card footer's quiet links (＋ New entry's look): terra text, no chrome (B's text button). */
const footLink = { border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--acc-terra)', cursor: 'pointer' } as const

/** An entry's photos: thumbnails (tap to view full size) with a remove. */
function EntryPhotos({ paths, onRemove }: { paths: string[]; onRemove: (path: string) => void }) {
  const urls = useJournalPhotoUrls(paths)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {paths.map((p, i) => (
        <div key={p} style={{ position: 'relative', width: 72, height: 72, border: '1px solid var(--line-card)', borderRadius: 'var(--radius-page)', background: 'var(--paper-bone)', overflow: 'hidden' }}>
          {urls[i] && (
            <a href={urls[i]} target="_blank" rel="noreferrer" aria-label="Open photo">
              <img src={urls[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </a>
          )}
          <button
            type="button"
            aria-label="Remove photo"
            className="kf-hit kf-hit-corner"
            onClick={() => onRemove(p)}
            style={{ position: 'absolute', top: 2, right: 2, width: 24, height: 24, border: 'none', borderRadius: 999, background: 'var(--paper-parchment)', color: 'var(--ink-muted)', boxShadow: 'var(--shadow-crisp)', font: 'inherit', fontSize: 14, lineHeight: '24px', padding: 0, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
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
 * or the request failed. Said where the first-page line sits, with one retry when there's something
 * to retry. The notebook stays writable either way. */
function PastNote({ state, retrying, onRetry }: { state: Extract<ListState, 'away' | 'resting'>; retrying: boolean; onRetry: () => void }) {
  return (
    <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
      <span style={{ fontSize: 'var(--fs-body-s)', lineHeight: 1.35, color: 'var(--ink-muted)' }}>{state === 'away' ? PAST_AWAY : PAST_RESTING}</span>
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
 * there's something to retry. No "go add one" button: it was written while the Library was parked
 * (K-26; Kai un-parked it 2026-10-12, so a link to /library could come back). Loading shows nothing;
 * it's brief, and an unloaded shelf isn't empty. */
type ShelfQuery = { data: unknown[] | undefined; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle'; isFetching: boolean; refetch: () => unknown }
function ShelfState({ q, what }: { q: ShelfQuery; what: 'notes' | 'quotes' }) {
  const online = useOnline()
  const s = listState(q, online)
  if (s === 'loading' || (s === 'ready' && (q.data?.length ?? 0) > 0)) return null
  const line = s === 'ready' ? `No ${what} on the shelf yet.` : s === 'away' ? "The shelf will be here when you're back online." : "The shelf didn't come through just now."
  return (
    <div role={s === 'ready' ? undefined : 'status'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 0 10px' }}>
      <img src="/ds/assets/fern/coil.png" alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
      <div style={{ marginTop: 12, fontSize: 'var(--fs-body-s)', lineHeight: 1.35, color: 'var(--ink-muted)', textAlign: 'center' }}>{line}</div>
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
  const pastNote = past === 'away' || past === 'resting' ? <PastNote state={past} retrying={journalQ.isFetching} onRetry={() => void journalQ.refetch()} /> : null
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

  // Selected date state (defaults to today, yyyy-mm-dd, on the user's clock — Paper's journal lines
  // and every other day key use the same; it read the device's)
  const [selectedDate, setSelectedDate] = useState(() => zoneDateKey(new Date()))
  // A page left open past midnight turns to the new day — only if it was on the day that just
  // ended; a past day you were reading stays put.
  const dayNow = useDayRollover((previous) => setSelectedDate((d) => (d === zoneDateKey(previous) ? zoneDateKey(new Date()) : d)))
  const todayStr = useMemo(() => zoneDateKey(new Date()), [dayNow]) // eslint-disable-line react-hooks/exhaustive-deps
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
    if (turnedTo) document.getElementById(`journal-${turnedTo}`)?.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
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
  const [talking, setTalking] = useState(false)
  const [photoSheet, setPhotoSheet] = useState(false)

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
  const latest = useRef({ dayEntries, drafts, mood: activeMood, grats: [gratitude1, gratitude2, gratitude3], listed: listed ?? [], entries })
  latest.current = { dayEntries, drafts, mood: activeMood, grats: [gratitude1, gratitude2, gratitude3], listed: listed ?? [], entries }
  const rowNow = (id: string): JournalEntry | undefined => {
    const e = latest.current.dayEntries.find((x) => x.id === id)
    return e && { ...e, body: latest.current.drafts[id] ?? e.body }
  }
  /** Any day's row as it stands now — a photo upload can finish after you've turned the page. */
  const anyRowNow = (id: string): JournalEntry | undefined => {
    const e = latest.current.entries.find((x) => x.id === id)
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
      // Any day's row: the page may have turned (a day picked, or midnight) inside the debounce,
      // and the last words typed on the old page must still land.
      const cur = anyRowNow(entry.id)
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

  // "Talk it out" and "＋ Photo" land on the day's latest entry, or start the day's first one.

  /** Talk it out: the voice sheet (Groq transcription through the `transcribe` function) hands back
   * the words; they join the entry as a new paragraph and are kept in `transcript` too. */
  const talkedOut = (heard: string) => {
    const last = latest.current.dayEntries.at(-1)
    const cur = last && rowNow(last.id)
    if (!cur) {
      save({ entry_date: selectedDate, body: heard.trim(), transcript: heard.trim() }, true)
    } else {
      // A pending body save would write the pre-transcript text back over this one.
      window.clearTimeout(timers.current[cur.id])
      save({ ...cur, body: appendTranscript(cur.body, heard), transcript: appendTranscript(cur.transcript, heard) }, false)
      setDrafts(({ [cur.id]: _saved, ...rest }) => rest)
    }
    setSaveStatus('Saved · just now')
  }

  /** ＋ Photo: compress, upload to the private `journal` bucket, add the path to the entry. A failed
   * upload never touches the words — they're already saved through the outbox. */
  const addPhotos = async (camera: boolean) => {
    const files = await pickImages(camera)
    if (!files.length) return
    const last = latest.current.dayEntries.at(-1)
    const entryId = last ? last.id : save({ entry_date: selectedDate, body: '' }, true).id
    setSaveStatus('Adding photo…')
    let unreadable = 0
    let failed = 0
    for (const file of files) {
      try {
        const path = await uploadJournalPhoto(entryId, file)
        const cur = anyRowNow(entryId)
        if (!cur) {
          void deleteJournalPhoto(path).catch(() => {}) // the entry went while it uploaded
          continue
        }
        save({ ...cur, media_paths: addMedia(cur.media_paths, path) }, false)
      } catch (err) {
        if (err instanceof Error && err.message === 'decode') unreadable++
        else failed++
      }
    }
    setSaveStatus('Saved · just now')
    if (unreadable) toast("Couldn't open that photo — try a JPG or PNG.")
    if (failed) toast(navigator.onLine ? "The photo didn't upload — your words are saved. Try it again in a bit." : "Photos need a connection — your words are saved. Add it again once you're online.")
  }

  /** Phone shell: its WebView offers the camera only when asked, so ask which. Browsers put the
   * camera in their own picker. */
  const onPhoto = () => (isCapacitorShell() ? setPhotoSheet(true) : void addPhotos(false))

  /** Remove = Undo toast, no confirm. The path leaves the entry now; the stored photo is deleted
   * only once that toast has gone without an Undo. Keyed to the toast itself, not a timer: its 6s
   * pause while hovered or touched, and a third toast waits its turn, so a timer could delete the
   * file while Undo was still on screen. */
  const removePhoto = (entryId: string, path: string) => {
    const cur = anyRowNow(entryId)
    const at = cur ? (cur.media_paths ?? []).indexOf(path) : -1
    if (!cur || at < 0) return
    save({ ...cur, media_paths: removeMedia(cur.media_paths, path) }, false)
    let undone = false
    toastUndo('Removed · photo', () => {
      undone = true
      const now = anyRowNow(entryId)
      if (now) save({ ...now, media_paths: addMedia(now.media_paths, path, at) }, false)
    })
    const toastId = useToastStore.getState().toasts.at(-1)?.id
    const stop = useToastStore.subscribe(({ toasts }) => {
      if (toasts.some((t) => t.id === toastId)) return
      stop()
      // ponytail: offline (or the app closed first) leaves the file orphaned in the private bucket —
      // nothing points at it any more. A sweep of unreferenced paths would collect it, if it matters.
      if (!undone) void deleteJournalPhoto(path).catch(() => {})
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
  // Kept = days written this month, never a streak that a missed night resets (product audit 2026-10-12).
  const keptDays = useMemo(() => daysWrittenThisMonth(entries, todayStr), [entries, todayStr])

  // "On this day" logic (returns entry from a year ago if exists, or older ones)
  const onThisDayEntry = useMemo(() => {
    // Same month-day from an earlier year — straight off the 'YYYY-MM-DD' keys, so the device's
    // zone can't shift either day. It quotes the words, so it wants words (a photo-only entry is
    // written, but has no line to show).
    return entries.find((e) => e.body.trim() && e.entry_date.slice(5) === selectedDate.slice(5) && e.entry_date.slice(0, 4) < selectedDate.slice(0, 4)) || null
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
      day: 'numeric',
      timeZone: 'UTC'
    })
  }, [selectedDate])

  // Short week date helper e.g. Friday, Jul 10
  const shortDateLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  // "Day N" = which numbered day of journaling this page is — days, not entries (drift J7).
  const dayCount = useMemo(() => dayOrdinal(entries, selectedDate), [entries, selectedDate])

  // Format list items of journal week
  const weekEntries = useMemo(() => {
    // Calculate last 7 dates from today back
    const result = []
    const base = new Date(todayStr) // UTC midnight: read back in UTC, so no device zone shifts the day
    for (let i = 0; i < 7; i++) {
      result.push(new Date(base.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    }
    return result
  }, [todayStr])

  /** The day's entries inside the notebook card, in time order. Shared by 1a and 1b — same
   * ruled textarea the export specs, one per entry, each with its stamp and its delete. */
  const renderEntries = (t: { fontSize: string; lineHeight: number; minHeight: number; placeholder: string }) => {
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
          fontSize: t.fontSize,
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
          <span className="kf-stamp">
            {entryTime(entry.created_at)}
          </span>
          <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          <button
            type="button"
            className="kf-hit kf-hit-above"
            aria-label={`Delete ${entryTime(entry.created_at)} entry`}
            onClick={() => removeEntry(entry)}
            style={{ ...footLink, fontSize: 'var(--fs-meta)', userSelect: 'none' }}
          >
            Delete
          </button>
        </div>
        {ta(entry, bodyOf(entry), (v) => handleBodyChange(entry, v), i === 0 ? t.minHeight : t.lineHeight * 3)}
        {entry.media_paths?.length > 0 && <EntryPhotos paths={entry.media_paths} onRemove={(path) => removePhoto(entry.id, path)} />}
      </div>
    ))
  }

  // The overlays both layouts share: the voice sheet, the shell's photo choice.
  const overlays = (
    <>
      {talking && <VoiceCaptureSheet onText={talkedOut} onClose={() => setTalking(false)} />}
      {photoSheet && (
        <ActionSheet
          title="Add a photo"
          items={[
            { label: 'Take a photo', onSelect: () => void addPhotos(true) },
            { label: 'Choose from your photos', onSelect: () => void addPhotos(false) },
          ]}
          onClose={() => setPhotoSheet(false)}
        />
      )}
    </>
  )

  const nextPrompt = () => setPromptIndex((prev) => (prev + 1) % PROMPTS.length)
  // Phone: 44px targets for the small text buttons below (Cancel and Save are narrower than 44, so they also
  // get the tap area that grows to 44 without reaching each other, 6px apart).
  const hit = isMobile ? { minHeight: 44 } : undefined
  const hitMin = isMobile ? 'kf-hit kf-hit-min' : undefined

  /** The quote of the day's thoughts and "＋ add a thought" — the rail's on desktop, the card's on a phone. */
  const quoteThoughts = (
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
            style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', fontSize: 'var(--fs-body-s)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', outline: 'none', resize: 'none', padding: 6, borderRadius: 'var(--radius-md)' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAddCommentary(false)} className={hitMin} style={{ ...hit, border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-meta-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleAddCommentary} className={hitMin} style={{ ...hit, border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: 'var(--fs-meta-l)', padding: '3px 8px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddCommentary(true)}
          style={{ ...footLink, ...hit, display: 'block', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', userSelect: 'none' }}
        >
          ＋ Add a thought
        </button>
      )}
    </div>
  )

  // Renders the mobile sub-panels
  const renderMobileNotes = () => (
    <div style={{ marginTop: 20 }}>
      <SectionLabel style={{ marginBottom: 10 }}>Notes shelf</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {notes.map((n) => (
          <div
            key={n.id}
            onClick={() => navigate(`/library?noteId=${n.id}`)}
            style={{ padding: '10px 12px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', cursor: 'pointer', marginBottom: 6 }}
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
      <SectionLabel style={{ marginBottom: 10 }}>Quotes shelf</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {quotes.map((q) => (
          <div
            key={q.id}
            onClick={() => navigate(`/library?quoteId=${q.id}`)}
            style={{ padding: '12px 14px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
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
            background-image: repeating-linear-gradient(transparent 0px, transparent 25px, var(--page-rule) 25px, var(--page-rule) 26px);
            background-attachment: local;
            /* A day of N entries must not be N fixed 120px boxes. Native auto-grow; where it
               isn't supported the min-height below is simply the old fixed behaviour. */
            field-sizing: content;
          }
        `}</style>
        
        {/* Kai's phone review: the shell's 16px gutter is the page's, not 16 + 20 of its own. */}
        <div style={{ flex: 1, padding: '0 0 80px', position: 'relative', zIndex: 10 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src={fernSrc(dayLength)} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{known ? `Journal · Day ${dayCount}` : 'Journal'}</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, lineHeight: 1, color: 'var(--ink-body)' }}>{shortDateLabel(selectedDate)}</h1>
            </div>
          </div>

          {/* The desktop's "This week" days, the phone's way: ‹ a day back · jump to any day · a day on › */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
            <button type="button" aria-label="Previous day" onClick={() => setSelectedDate(addDays(selectedDate, -1))} style={{ ...footLink, minWidth: 44, minHeight: 44, fontSize: 'var(--fs-display-l)', color: 'var(--ink-muted)' }}>‹</button>
            <DateField
              value={selectedDate}
              onChange={(v) => v && setSelectedDate(v)}
              title="Go to day"
              max={todayStr}
              clearable={false}
              style={{ minHeight: 44, padding: '0 12px', font: 'inherit', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 'var(--radius-md)' }}
            />
            {/* ds-ok: the disabled › is an icon glyph on a disabled control (non-text, 3:1 is enough); --ink-faint would read as enabled */}
            <button type="button" aria-label="Next day" disabled={selectedDate >= todayStr} onClick={() => setSelectedDate(addDays(selectedDate, 1))} style={{ ...footLink, minWidth: 44, minHeight: 44, fontSize: 'var(--fs-display-l)', color: selectedDate >= todayStr ? 'var(--ink-hairline)' : 'var(--ink-muted)', cursor: selectedDate >= todayStr ? 'default' : 'pointer' }}>›</button>
          </div>

          {/* Segmented Tab */}
          <div style={{ marginTop: 16 }}>
            <Segmented
              value={mobileTab}
              onChange={setMobileTab}
              label="Show"
              options={[{ value: 'journal', label: 'Journal' }, { value: 'notes', label: 'Notes' }, { value: 'quotes', label: 'Quotes' }]}
            />
          </div>

          {mobileTab === 'notes' && renderMobileNotes()}
          {mobileTab === 'quotes' && renderMobileQuotes()}

          {mobileTab === 'journal' && (
            <>
              {/* Polish G: offline before the journal ever loaded here, or it failed to load. */}
              {pastUnread && <div style={{ marginTop: 16 }}>{pastNote}</div>}

              {/* Prompt — "↻" is the desktop's "↻ another" */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 20 }}>
                <div className={motion ? 'kf-ink' : undefined} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'var(--fs-lead)', color: 'var(--ink-body)', lineHeight: 1.4 }}>
                  {firstPage ? 'The first page is the hardest — one sentence counts.' : PROMPTS[promptIndex]}
                </div>
                {!firstPage && <button type="button" aria-label="Another prompt" onClick={nextPrompt} style={{ ...footLink, flex: 'none', minWidth: 44, minHeight: 44, marginTop: -10, fontSize: 'var(--fs-lead)', color: 'var(--ink-faint)' }}>↻</button>}
              </div>

              {/* Writing Card */}
              <div className="kf-page" style={{ marginTop: 12, background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)', padding: '16px 16px 14px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, left: 30, width: 56, height: 15, background: 'color-mix(in oklch, var(--acc-buttercream) 50%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }}></span>
                {firstPage && <RestingPencil />}

                {renderEntries({ fontSize: 'var(--fs-body)', lineHeight: 26, minHeight: 120, placeholder: 'Type to write on this quiet page...' })}

                {/* Polish G: at a 125% interface size (the phone default until F2b) a 390px phone lays this card out
                    ~258 CSS px wide, and each label broke onto two lines ("＋ NEW / ENTRY"). Labels
                    stay whole; the save state takes its own line only when it doesn't fit. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                  {/* 1b has no left rail, so the day's "+ New entry" lives in the card footer. Each link is drawn 18px
                      tall (B: 12.5px sentence case on a phone, ~19px); kf-hit-min gives a finger 44 (13px above and below, inside the card's own padding). */}
                  <span className="kf-hit kf-hit-min" onClick={(e) => addEntry(selectedDate, e.currentTarget)} style={{ color: 'var(--acc-terra)', cursor: 'pointer' }}>＋ New entry</span>
                  <button type="button" className="kf-hit kf-hit-min" onClick={() => setTalking(true)} style={footLink}>🎤 Talk</button>
                  <button type="button" className="kf-hit kf-hit-min" onClick={onPhoto} style={footLink}>＋ Photo</button>
                  <span style={{ marginLeft: 'auto', color: 'var(--acc-sage-text)' }}>{saveStatus}</span>
                </div>
              </div>

              {/* Mood */}
              <div style={{ marginTop: 18, fontSize: 13.5, color: 'var(--ink-muted)' }}>Today felt —</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                {MOODS.map((m) => {
                  const selected = activeMood === m
                  return (
                    <Chip key={m} tone="filter" selected={selected} onClick={() => handleMoodSelect(m)}>
                      {m}
                    </Chip>
                  )
                })}
              </div>

              {/* Gratitude */}
              <SectionLabel style={{ margin: '22px 0 10px' }}>Three small things</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[gratitude1, gratitude2, gratitude3].map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <span style={{ color: 'var(--acc-blossom)' }}>✿</span>
                    <input
                      value={val}
                      onChange={(e) => handleGratitudeChange(idx + 1, e.target.value)}
                      placeholder={idx === 2 ? "Add a third..." : `Something you are grateful for...`}
                      style={{ flex: 1, border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-body)', color: val ? 'var(--ink-body)' : 'var(--ink-faint)', outline: 'none', padding: 0 }}
                    />
                  </div>
                ))}
              </div>

              {/* Quote Card */}
              {commonplaceQuote && (
                <div className="kf-page" style={{ marginTop: 22, position: 'relative', background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)', padding: '15px 15px 13px', transform: 'rotate(-0.4deg)' }}>
                  <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', top: -13, right: 10, height: 30, filter: 'var(--shadow-drop-sm)' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Quote of the day</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink-body)', marginTop: 7 }}>
                    "{commonplaceQuote.text}"
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 8 }}>
                    — {commonplaceQuote.author}
                  </div>
                  {quoteThoughts}
                </div>
              )}
            </>
          )}
        </div>
        {overlays}
      </div>
    )
  }

  // Desktop layout (1a)
  return (
    <div className="jn" style={{ width: '100%', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        .ruled {
          background-image: repeating-linear-gradient(transparent 0px, transparent 26px, var(--page-rule) 26px, var(--page-rule) 27px);
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
        .jn-tree { grid-area: tree; position: relative; display: flex; flex-direction: column; min-width: 0; padding: 22px 20px 28px; border-top: 1px solid var(--line-solid); }
        .jn-tree-new, .jn-gutter { display: none; }
        .jn-main { grid-area: write; min-width: 0; display: flex; flex-direction: column; }
        .jn-write { flex: 1; display: flex; justify-content: center; padding: 26px 20px 32px; container: jn-write / inline-size; }
        .jn-title { font-size: clamp(28px, 7.8cqi, 40px); text-wrap: balance; }
        .jn-rail {
          grid-area: rail; min-width: 0; padding: 26px 20px 30px; border-top: 1px solid var(--line-solid);
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 28px; align-content: start;
        }
        .jn-rail-pair { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
        @container journal (min-width: 560px) {
          .jn-grid { grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: "tree write" "tree rail"; }
          .jn-tree { padding: 22px 18px; border-top: none; border-right: 1px solid var(--line-solid); }
          .jn-tree-new { display: flex; }
          .jn-gutter { display: block; }
          .jn-write { padding: 30px 28px 36px; }
          .jn-rail { padding: 28px 28px 36px; }
          .jn-card-new { display: none; }
        }
        @container journal (min-width: 1000px) {
          .jn-grid { grid-template-columns: 230px minmax(0, 1fr) 262px; grid-template-rows: auto; grid-template-areas: "tree write rail"; }
          .jn-write { padding: 34px 40px 44px; }
          .jn-rail { display: flex; flex-direction: column; gap: 28px; padding: 30px 22px; border-top: none; border-left: 1px solid var(--line-solid); }
        }
      `}</style>

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
          <Button onClick={(e) => addEntry(todayStr, e.currentTarget)} style={{ flex: 1, justifyContent: 'center' }}>
            ＋ New entry
          </Button>
        </div>

        {/* Weekly entries */}
        <SectionLabel style={{ margin: '4px 0 8px' }}>This week</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {weekEntries.map((dateStr) => {
            // "kept" means something was actually written that day, not that a row exists.
            const hasEntry = entries.some((e) => e.entry_date === dateStr && isWritten(e))
            const isSelected = selectedDate === dateStr
            const dateObj = new Date(dateStr)
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
            const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
            const entryForDate = entries.find((e) => e.entry_date === dateStr && e.mood) ?? entries.find((e) => e.entry_date === dateStr)

            if (isSelected) {
              return (
                <div
                  key={dateStr}
                  style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '9px 11px', marginBottom: 6 }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-body)', fontWeight: 500 }}>{dayName}, {monthDay}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-buttercream-text)', marginTop: 3 }}>
                    {entryForDate?.mood ? `${entryForDate.mood.charAt(0).toUpperCase() + entryForDate.mood.slice(1)} · writing…` : 'Writing…'}
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 2 }}>
                    {known ? (entryForDate?.mood ? entryForDate.mood.charAt(0).toUpperCase() + entryForDate.mood.slice(1) : hasEntry ? 'Kept' : 'Empty') : ' '}
                  </div>
                </div>
              )
            }
          })}
        </div>

        {/* Notes / Quotes shelf link lists. Polish G: a group shows only when it has something to
            list — a brand-new account used to get two bare headings with nothing under them, and
            they fill from the Library (un-parked 2026-10-12, in the nav again), not from here. */}
        {notes.length > 0 && <SectionLabel style={{ margin: '16px 0 8px' }}>Notes</SectionLabel>}
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

        {quotes.length > 0 && <SectionLabel style={{ margin: '16px 0 8px' }}>Quotes</SectionLabel>}
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', color: 'var(--ink-faint)', marginBottom: 8 }}>{known ? `Journal · Day ${dayCount}` : 'Journal'}</div>

                {/* Size from .jn-title: the export's 40px wherever the page is wide enough, easing
                    down (never below 28px) so the date keeps to one line in a narrower column. */}
                <h1 className="jn-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{headerDateStr}</h1>
              </div>
            </div>

            {pastUnread ? (
              <div style={{ marginTop: 8 }}>{pastNote}</div>
            ) : (
              <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)', marginTop: 8 }}>{firstPage ? 'The first page is the hardest — one sentence counts.' : 'A quiet page, only for you ✿'}</div>
            )}

            {/* Prompt Selector */}
            <SectionLabel
              style={{ marginTop: 26 }}
              action={<button type="button" onClick={nextPrompt} style={{ ...footLink, fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', userSelect: 'none' }}>↻ Another</button>}
            >
              Today's prompt
            </SectionLabel>
            <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, color: 'var(--ink-body)', marginTop: 12, lineHeight: 1.4 }}>
              {PROMPTS[promptIndex]}
            </div>

            {/* Ruled Notebook Card */}
            <div className="kf-page" style={{ marginTop: 16, background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)', padding: '22px 26px 26px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -9, left: 40, width: 66, height: 17, background: 'color-mix(in oklch, var(--acc-buttercream) 50%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }}></span>
              {firstPage && <RestingPencil />}

              {renderEntries({ fontSize: 'var(--fs-body-l)', lineHeight: 27, minHeight: 180, placeholder: 'Start writing...' })}

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 10px', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)', whiteSpace: 'nowrap' }}>
                {/* One column (<560px): the tree — and its "＋ New entry" — sits below the page,
                    so the card carries the day's "＋ New entry", as 1b's footer does. */}
                <span className="jn-card-new" onClick={(e) => addEntry(selectedDate, e.currentTarget)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)', cursor: 'pointer' }}>＋ New entry</span>
                <button type="button" onClick={() => setTalking(true)} style={{ ...footLink, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)' }}>🎤 Talk it out</button>
                <button type="button" onClick={onPhoto} style={{ ...footLink, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)' }}>＋ Photo</button>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-sage-text)' }}>{saveStatus}</span>
              </div>
            </div>

            {/* Mood picker — the chips drop under "Today felt —" when they don't fit beside it. */}
            <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
              <span style={{ fontSize: 15, color: 'var(--ink-muted)' }}>Today felt —</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {MOODS.map((m) => {
                  const selected = activeMood === m
                  return (
                    <Chip key={m} tone="filter" selected={selected} onClick={() => handleMoodSelect(m)}>
                      {m}
                    </Chip>
                  )
                })}
              </div>
            </div>

            {/* Three small things */}
            <div style={{ marginTop: 26 }}>
              <SectionLabel style={{ marginBottom: 12 }}>Three small things</SectionLabel>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[gratitude1, gratitude2, gratitude3].map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0' }}>
                    <span style={{ color: 'var(--acc-blossom)', fontSize: 13 }}>✿</span>
                    <input
                      value={val}
                      onChange={(e) => handleGratitudeChange(idx + 1, e.target.value)}
                      placeholder={idx === 2 ? "Add a third..." : `Something you are grateful for...`}
                      style={{ flex: 1, border: 'none', background: 'transparent', font: 'inherit', fontSize: 'var(--fs-body)', color: val ? 'var(--ink-body)' : 'var(--ink-faint)', outline: 'none', padding: 0 }}
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
            <SectionLabel style={{ marginBottom: 12 }}>Quote of the day</SectionLabel>
            <div className="kf-page" style={{ position: 'relative', background: 'var(--bg-page)', border: '1px solid var(--border-page)', borderRadius: 'var(--radius-page)', boxShadow: 'var(--shadow-page)', padding: '16px 16px 14px', transform: 'rotate(-0.4deg)' }}>
              <img src="/ds/assets/cherry/fallen.png" alt="" style={{ position: 'absolute', top: -14, right: 10, height: 34, filter: 'var(--shadow-drop-sm)' }} />
              
              <div className={motion ? 'kf-ink' : undefined} style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-body)', animationDelay: '180ms' }}>
                "{commonplaceQuote.text}"
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 10 }}>
                — {commonplaceQuote.author || 'Unknown'}
              </div>

              {quoteThoughts}
            </div>
          </section>
        )}

        {known && (
        <div className="jn-rail-pair">
        {/* On this day */}
        <section>
          <SectionLabel style={{ marginBottom: 12 }}>On this day</SectionLabel>
          {onThisDayEntry ? (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-buttercream-text)' }}>
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
            // The rail is a tool: plain muted text, no handwriting (D7).
            <div style={{ fontSize: 'var(--fs-body-s)', lineHeight: 1.35, color: 'var(--ink-muted)' }}>
              Nothing from this day in past years — yet.
            </div>
          )}
        </section>

        {/* Kept */}
        <section>
          <SectionLabel style={{ marginBottom: 12 }}>Kept</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* The export's full fern — but 0 days is a fern that hasn't unfurled yet
                (growth stages never lie, punch 10). */}
            <img src={`/ds/assets/fern/${keptDays > 0 ? 'full' : 'coil'}.png`} alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', color: 'var(--ink-body)', lineHeight: 1 }}>{daysLabel(keptDays)}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 3 }}>of showing up this month</div>
            </div>
          </div>
        </section>
        </div>
        )}

      </aside>
      )}
      </div>
      {overlays}
    </div>
  )
}
