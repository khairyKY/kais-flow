import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { formatDuration, priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { captureText } from '../inbox/api'
import { blockIfTimed, captureWithAI, enrichTypedInboxItem, enrichTypedTask, transcribeAudio } from '../capture/api'
import { VOICE_ALLOWANCE_USED_UP, isDailyLimitError, rememberVoiceLimitReached, voiceLimitReachedToday } from '../capture/aiAllowance'
import { appendDictation, micAction, pickMimeType } from '../capture/holdToTalk'
import { VoiceCaptureSheet } from '../capture/VoiceCaptureSheet'
import { useAuth } from '../auth/AuthProvider'
import { hasStructure, parseCommand, stripPriorityAndDuration } from './parseCommand'
import { formatDueChip } from './dueChip'
import { CAPTURE_INPUT_ID, useCommandBarStore } from './commandBarStore'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Chip, KeyChip, KeyCombo } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { pickPhotos, usePaperStore } from '../paper/paperStore'
import { imageFiles } from '../paper/image'
import '../capture/capture.css'

const CHIP_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-meta)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '4px 9px',
  borderRadius: 999,
}

const PRIORITY_NAME: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium' }

// F3b (D-5 ruling, punch 59): Go-to lives inside ⌘K — type a view name, a jump row
// appears; ↓ selects it, ↵ navigates. Plain ↵ still quick-adds. Parked surfaces
// (Library) and dev routes are deliberately absent until they return. Journal is back in the sidebar (U-14).
const JUMP_VIEWS: { name: string; label: string; to: string }[] = [
  { name: 'today', label: 'Today', to: '/today' },
  { name: 'inbox', label: 'Inbox', to: '/inbox' },
  { name: 'tasks', label: 'Tasks', to: '/tasks' },
  { name: 'calendar', label: 'Calendar', to: '/calendar' },
  { name: 'projects', label: 'Projects', to: '/projects' },
  { name: 'routines', label: 'Routines', to: '/routines' },
  { name: 'review', label: 'Review', to: '/weekly-review' },
  { name: 'focus', label: 'Focus', to: '/focus' },
  { name: 'people', label: 'People', to: '/people' },
  { name: 'journal', label: 'Journal', to: '/journal' },
  { name: 'activity', label: 'Activity', to: '/activity' },
  { name: 'settings', label: 'Settings', to: '/settings' },
  { name: 'search', label: 'Search', to: '/search' },
  { name: 'herbarium', label: 'Herbarium', to: '/herbarium' },
  { name: 'perennials', label: 'Perennials', to: '/perennials' },
  { name: 'trash', label: 'Trash', to: '/trash' },
]

/** Unique-prefix match, ≥2 chars — "in" → Inbox, but "t" (today/tasks/trash) offers nothing. */
function matchJumpView(input: string): (typeof JUMP_VIEWS)[number] | null {
  const q = input.trim().toLowerCase()
  if (q.length < 2) return null
  const hits = JUMP_VIEWS.filter((v) => v.name.startsWith(q))
  return hits.length === 1 ? hits[0] : null
}

/** The centre button draws the kit's mic (MK Capture), so the phone sheet's first three opens say
 * what it does: tap to type · hold to talk. Counted per device. */
function takeCaptureHint(): boolean {
  try {
    const seen = Number(localStorage.getItem('kf.captureHint')) || 0
    if (seen >= 3) return false
    localStorage.setItem('kf.captureHint', String(seen + 1))
    return true
  } catch {
    return false // storage blocked: no hint, nothing else changes
  }
}

const toast = (message: string) => useToastStore.getState().push({ message })

// One capture bar, two shapes (Kai 2026-10-07: "the capture button only takes voice for the phone"):
// on a phone it's Paper Capture 11a's capture sheet — kit BottomSheet riding the keyboard, field,
// parse chips, [camera · mic] … [send]; its mic is hold-to-talk's tap twin (the voice sheet). On
// desktop it's the ⌘K overlay, whose mic dictates into the field for review. AppLayout keeps this
// mounted (it renders nothing while closed) so openCapture() can render + focus it inside a tap.
export function CommandBar() {
  const open = useCommandBarStore((s) => s.open)
  const setOpen = useCommandBarStore((s) => s.setOpen)
  const mobile = useIsMobile()
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [jumpSelected, setJumpSelected] = useState(false)
  const [hint, setHint] = useState(false)
  const [dictation, setDictation] = useState<'off' | 'listening' | 'transcribing'>('off')
  const take = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null)
  /** Bumped whenever a dictation is stopped or dropped, so a late mic or transcript can't land. */
  const generation = useRef(0)
  /** The voice sheet: the phone mic's talk-instead, or a dictated take that couldn't be transcribed. */
  const [voice, setVoice] = useState<{ recording?: { blob: Blob; seconds: number }; dictated?: boolean } | null>(null)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const uid = useAuth().session?.user.id
  // Paper capture 11a: pages saved offline wait on this device until they can be read.
  const waiting = usePaperStore((s) => s.waiting)

  useEffect(() => {
    function handlePrefill(e: Event) {
      const customEvent = e as CustomEvent<string>;
      setText(customEvent.detail || '')
    }
    window.addEventListener('prefill-command-bar', handlePrefill)
    return () => window.removeEventListener('prefill-command-bar', handlePrefill)
  }, [])

  // The phone sheet brings its own Esc/Back and scroll lock (kit BottomSheet).
  useEscapeStack(open && !mobile, () => setOpen(false))
  useBodyScrollLock(open && !mobile)

  // ⌘K lives in AppLayout's hotkey effect (punch 5): keeping a copy here would double-fire —
  // two toggles cancelling to a no-op.

  useEffect(() => {
    if (open) {
      inputRef.current?.focus() // hotkeys and the tray; a tap already focused it (openCapture)
      if (mobile) setHint(takeCaptureHint())
      return
    }
    stopDictation(false)
    // A dismissed phone sheet keeps its half-typed draft (kit Bottom sheet: dismissing never
    // discards); the desktop bar starts fresh each time, as before.
    if (!mobile) setText('')
    setJumpSelected(false)
    // stopDictation only touches refs and setters.
  }, [open, mobile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopDictation(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  // T-4: "10am" means 10:00 in Cairo on any device — the zone every date in the app renders in.
  const parsed = useMemo(() => parseCommand(text, domains, projects, { zone: 'cairo' }), [text, domains, projects])
  const jumpView = useMemo(() => matchJumpView(text), [text])
  const closeBar = () => setOpen(false)

  function jumpTo(view: NonNullable<ReturnType<typeof matchJumpView>>) {
    setOpen(false)
    navigate(view.to)
  }

  function submit(close: () => void) {
    const trimmed = text.trim()
    if (!trimmed) return
    // Written at once from the local parse (never waits on the network); then the AI's read fills in
    // whatever the typed tokens left empty, or decides where a plain line belongs (Kai 2026-10-07:
    // "every property is extracted… let the AI understand the intent and decide").
    if (hasStructure(parsed)) {
      const task = createTask({
        title: parsed.title || trimmed,
        domainId: parsed.domainId,
        projectId: parsed.projectId,
        dueAt: parsed.dueAt,
        durationMin: parsed.durationMin,
        priority: parsed.priority,
        labels: parsed.labels,
      })
      // A typed time ("crypto session 4am") puts it on the calendar as a block; a date alone doesn't.
      blockIfTimed(task, parsed.dueTimed)
      void enrichTypedTask(task, trimmed)
    } else {
      void enrichTypedInboxItem(captureText(trimmed), trimmed)
    }
    setText('')
    close()
  }

  function submitWithAI(close: () => void) {
    const trimmed = text.trim()
    if (!trimmed || aiBusy) return
    // Strip just the local `!`/`30m` tokens before the AI sees the text — date/#tag parsing
    // stays the AI's own job, so only these two get resolved client-side here.
    const { text: stripped, priority, durationMin } = stripPriorityAndDuration(trimmed)
    setAiBusy(true)
    setText('')
    close()
    void captureWithAI(stripped || trimmed, 'text', null, { priority, durationMin }).finally(() => setAiBusy(false))
  }

  // ── The mic ──
  function onMic(close: () => void) {
    if (micAction(mobile) === 'voice-sheet') {
      close() // the sheet steps aside (its draft stays); the voice sheet records + files by AI
      setVoice({})
    } else if (dictation === 'listening') stopDictation(true)
    else if (dictation === 'off') void startDictation()
  }

  async function startDictation() {
    if (voiceLimitReachedToday(uid)) return toast(VOICE_ALLOWANCE_USED_UP)
    const gen = ++generation.current
    setDictation('listening')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      if (gen !== generation.current) return
      setDictation('off')
      return toast('Mic blocked — allow it in site settings')
    }
    if (gen !== generation.current) return stream.getTracks().forEach((t) => t.stop()) // stopped while asking
    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    const startedAt = Date.now()
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      void transcribeInto(new Blob(chunks, { type: recorder.mimeType }), Math.round((Date.now() - startedAt) / 1000))
    }
    recorder.start()
    take.current = { recorder, stream }
  }

  /** keep = transcribe what was said (the mic toggled off) · otherwise drop it (the bar closed). */
  function stopDictation(keep: boolean) {
    const t = take.current
    take.current = null
    // Dropping it, or nothing recording yet (the browser still asking): a late mic or transcript is stale.
    if (!t || !keep) generation.current += 1
    if (!t) return setDictation('off')
    if (!keep) {
      t.recorder.onstop = null
      t.stream.getTracks().forEach((track) => track.stop())
      setDictation('off')
    }
    if (t.recorder.state !== 'inactive') t.recorder.stop()
  }

  async function transcribeInto(blob: Blob, seconds: number) {
    const gen = generation.current
    if (!blob.size) {
      setDictation('off')
      return toast("Didn't catch that — try again")
    }
    setDictation('transcribing')
    let heard: string
    try {
      heard = (await transcribeAudio(blob)).trim()
    } catch (err) {
      if (gen !== generation.current) return
      setDictation('off')
      if (await isDailyLimitError(err)) rememberVoiceLimitReached(uid)
      // Never lose a recording (Polish E): the voice sheet keeps it — Try again (the words come back
      // to this field) · Save to Inbox untranscribed · Discard. Offline lands here too.
      return setVoice({ recording: { blob, seconds }, dictated: true })
    }
    if (gen !== generation.current) return
    setDictation('off')
    if (!heard) return toast("Didn't catch that — try again")
    setText((typed) => appendDictation(typed, heard))
    inputRef.current?.focus()
  }

  const matchChip = parsed.projectMatch ?? parsed.domainMatch
  // Same condition `submit()`'s gate uses — this chip promises what Enter will actually do,
  // so a priority/duration-only command (which now creates a task directly) can't still say
  // "→ Inbox (unfiled)" underneath it.
  const unmatched = !hasStructure(parsed)

  const field = (close: () => void, style?: React.CSSProperties) => (
    <input
      ref={inputRef}
      id={CAPTURE_INPUT_ID}
      aria-label="Capture"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setJumpSelected(false)
      }}
      // Paper capture: a pasted photo of notes opens the quick look instead of landing as text.
      onPaste={(e) => {
        const files = imageFiles(e.clipboardData.files)
        if (!files.length) return
        e.preventDefault()
        close()
        usePaperStore.getState().addFiles(files)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && jumpView && !mobile) {
          e.preventDefault()
          setJumpSelected(true)
        } else if (e.key === 'ArrowUp' && jumpSelected) {
          e.preventDefault()
          setJumpSelected(false)
        } else if (e.key === 'Enter' && jumpSelected && jumpView) {
          e.preventDefault()
          jumpTo(jumpView)
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          submitWithAI(close)
        } else if (e.key === 'Enter') {
          submit(close)
        }
      }}
      placeholder={dictation === 'listening' ? 'Listening…' : dictation === 'transcribing' ? 'Transcribing…' : 'Send the quote tomorrow 3pm #shaheen'}
      enterKeyHint="done"
      style={{
        flex: 1,
        minWidth: 0,
        fontFamily: 'var(--font-ui)',
        fontSize: 16,
        color: 'var(--ink-body)',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        ...style,
      }}
    />
  )

  const camera = (close: () => void, size: number) => (
    // Paper capture 11a: the camera beside the mic — a photo of your notes becomes tasks.
    <button
      type="button"
      className="pp-cam"
      aria-label="Scan paper"
      title="Scan paper — a photo of your notes"
      onClick={() => {
        close()
        void pickPhotos('camera')
      }}
    >
      <Icon name="camera" size={size} />
    </button>
  )

  const waitingChip = waiting > 0 && (
    <div className="pp-waiting" style={{ marginBottom: 10 }}>
      <Icon name="offline" size={16} />
      {waiting} {waiting === 1 ? 'page' : 'pages'} waiting · read when online
    </div>
  )

  const voiceSheet = voice && (
    <VoiceCaptureSheet
      open
      recording={voice.recording}
      onText={voice.dictated ? (heard) => setText((typed) => appendDictation(typed, heard)) : undefined}
      onClose={() => setVoice(null)}
    />
  )

  // ── Phone: Paper Capture 11a's capture sheet ──
  if (mobile) {
    return (
      <>
        {open && (
          <BottomSheet
            onClose={closeBar}
            handleGap={8}
            footer={(close) => (
              <div className="kf-capture-tools">
                {camera(close, 24)}
                <button type="button" className="kf-dictate" aria-label="Talk instead" title="Record a voice note" onClick={() => onMic(close)}>
                  <Icon name="mic" size={24} />
                </button>
                <button type="button" className="kf-capture-send kf-press" aria-label="Add" disabled={!text.trim()} onClick={() => submit(close)}>
                  <Icon name="send" size={24} />
                </button>
              </div>
            )}
          >
            {(close) => (
              <div data-capture-sheet>
                {waitingChip}
                {field(close, { width: '100%', minHeight: 'var(--touch-min)' })}
                {text.trim() && (
                  <div className="kf-capture-chips">
                    {parsed.dueAt && <Chip tone="date">{formatDueChip(parsed.dueAt, undefined, parsed.dueTimed)}</Chip>}
                    {matchChip && <Chip tone="project">{matchChip}</Chip>}
                    {parsed.durationMin != null && <Chip tone="duration">{formatDuration(parsed.durationMin)}</Chip>}
                    {parsed.priority != null && <Chip tone="priority">{PRIORITY_NAME[parsed.priority]}</Chip>}
                    {parsed.labels.map((l) => (
                      <Chip key={l}>*{l}</Chip>
                    ))}
                    {unmatched && <Chip tone="inbox">→ Inbox</Chip>}
                  </div>
                )}
                {hint && (
                  <div className="kf-capture-hint">
                    <Icon name="mic" size={16} />
                    Tap to type · hold to talk
                  </div>
                )}
              </div>
            )}
          </BottomSheet>
        )}
        {voiceSheet}
      </>
    )
  }

  // ── Desktop: the ⌘K overlay ──
  return (
    <>
      {open && (
        <div
          className="kf-scrim"
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 96 }}
          onClick={closeBar}
        >
          {/* X2 Motion 3c — overlay card arrives with the scrim (kf classes, AppLayout shell CSS).
              X3 — translucent parchment via color-mix so the night paper-parchment shows through. */}
          <div
            className="kf-overlay-card"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 440,
              margin: '0 16px',
              background: 'color-mix(in srgb, var(--paper-parchment) 82%, transparent)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--line-card)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-popover)',
              padding: '16px 18px',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {waitingChip}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line-dashed)', paddingBottom: 12 }}>
              {/* Capture-type: the mic that was drawn here now dictates — click, talk, click again;
                  the words land in the field to check, then ↵ files them. */}
              <button
                type="button"
                className="kf-dictate"
                aria-label={dictation === 'listening' ? 'Stop dictating' : 'Dictate'}
                aria-pressed={dictation === 'listening'}
                aria-busy={dictation === 'transcribing' || undefined}
                title={dictation === 'listening' ? 'Stop — your words go in the field' : 'Dictate into the field'}
                disabled={dictation === 'transcribing'}
                onClick={() => onMic(closeBar)}
              >
                {dictation === 'transcribing' ? <span className="kf-spinner" aria-hidden="true" /> : <Icon name={dictation === 'listening' ? 'stop' : 'mic'} size={20} />}
              </button>
              {field(closeBar)}
              {camera(closeBar, 22)}
            </div>
            {jumpView && (
              <div
                onClick={() => jumpTo(jumpView)}
                onMouseEnter={() => setJumpSelected(true)}
                onMouseLeave={() => setJumpSelected(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: jumpSelected ? 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' : 'transparent',
                  border: `1px solid ${jumpSelected ? 'var(--acc-lavender)' : 'var(--line-card)'}`,
                }}
              >
                <span style={{ ...CHIP_BASE, color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' }}>Jump</span>
                <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{jumpView.label}</span>
                {/* Polish F2b (conductor decision 2026-09-26, J-17): shortcut hints are keycaps. */}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
                  {jumpSelected ? (
                    <KeyChip text="↵" size="sm" />
                  ) : (
                    <>
                      <KeyChip text="↓" size="sm" /> then <KeyChip text="↵" size="sm" />
                    </>
                  )}
                </span>
              </div>
            )}
            {text.trim() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                {parsed.dueAt && (
                  <span style={{ ...CHIP_BASE, color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' }}>
                    {formatDueChip(parsed.dueAt, undefined, parsed.dueTimed)}
                  </span>
                )}
                {parsed.durationMin != null && (
                  <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' }}>
                    {formatDuration(parsed.durationMin)}
                  </span>
                )}
                {parsed.priority != null && (() => {
                  const color = priorityColor(parsed.priority) ?? 'var(--acc-terra)'
                  // High's tint is the contract's literal rgba(201,165,90,0.22); other priorities fall back to a computed tint.
                  const background = parsed.priority === 2 ? 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)' : `color-mix(in oklch, ${color} 20%, var(--paper-parchment))`
                  return (
                    <span style={{ ...CHIP_BASE, color, background }}>
                      {priorityFlag(parsed.priority)} {PRIORITY_NAME[parsed.priority]}
                    </span>
                  )
                })()}
                {matchChip && (
                  <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' }}>
                    → {matchChip}
                  </span>
                )}
                {parsed.labels.map((l) => (
                  <span key={l} style={{ ...CHIP_BASE, color: 'var(--ink-muted)', border: '1px solid var(--line-control)' }}>
                    *{l}
                  </span>
                ))}
                {unmatched && (
                  <span style={{ ...CHIP_BASE, color: 'var(--acc-gold)', background: 'color-mix(in oklch, var(--acc-gold-warm) 18%, var(--paper-parchment))' }}>
                    → Inbox (unfiled)
                  </span>
                )}
              </div>
            )}

            {/* Polish F2b (J-17): the same keys as the `?` overlay's Command bar rows (↵ quick add,
                ⌘ ↵ AI capture), drawn as keycaps instead of "Enter = …" text. While dictating, the
                row says what the mic is doing instead. */}
            <div aria-live="polite" style={{ marginTop: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {dictation === 'listening' ? (
                <>
                  <span className="kf-rec-dot" /> Listening — click stop when you’re done
                </>
              ) : dictation === 'transcribing' ? (
                'Transcribing…'
              ) : (
                <>
                  <KeyChip text="↵" size="sm" /> quick add
                  <span aria-hidden="true">·</span>
                  <KeyCombo keys={['⌘', '↵']} size="sm" /> AI capture
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {voiceSheet}
    </>
  )
}
