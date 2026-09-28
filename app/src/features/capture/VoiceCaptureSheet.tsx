import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { transcribeAudio, captureWithAI, saveUntranscribedVoiceNote } from './api'
import { isDailyLimitError, rememberVoiceLimitReached, voiceLimitReachedToday } from './aiAllowance'
import { KEPT_ACTIONS, KEPT_AUDIO_NOTE, KEPT_HAND, KEPT_STATUS, RESTING, keptReasonLine, type KeptReason } from './voiceCopy'
import { useAuth } from '../auth/AuthProvider'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { useToastStore } from '../../lib/toastStore'
import { useEscapeStack } from '../../lib/overlayStack'
import { useMotionEnabled } from '../../lib/motion'
import { pickMimeType } from './holdToTalk'
import './capture.css'

interface VoiceCaptureSheetProps {
  open: boolean
  onClose: () => void
  /** A take already recorded elsewhere (the tab bar's hold-to-talk): the sheet skips the mic and
   * goes straight to transcribing it — with every "never lose a recording" path below. */
  recording?: { blob: Blob; seconds: number }
}

/**
 * Polish E ("never lose a voice recording", conductor decision 2026-09-26):
 * - `recording` → `transcribing` → filed, as before.
 * - If transcription fails for any reason (daily limit, offline, a server hiccup) the sheet moves
 *   to `kept`: the recording stays in memory with Try again / Save to Inbox untranscribed /
 *   Discard. Nothing but the Discard button throws it away — tapping outside and Esc don't.
 * - After a daily-limit reply the sheet opens `resting` for the rest of that Cairo day on this
 *   device: it says so up front and offers typing instead of recording.
 */
type Phase = 'resting' | 'recording' | 'transcribing' | 'kept'

export function VoiceCaptureSheet({ open, onClose, recording: handedOver }: VoiceCaptureSheetProps) {
  const [phase, setPhase] = useState<Phase>(handedOver ? 'transcribing' : 'recording')
  const [keptReason, setKeptReason] = useState<KeptReason>('other')
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(handedOver?.seconds ?? 0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  /** The finished recording, held until it's filed, saved, or discarded. */
  const keptRef = useRef<Blob | null>(null)
  /** Bumped whenever the sheet lets go of a recording, so a late getUserMedia can't revive it. */
  const generationRef = useRef(0)
  const motion = useMotionEnabled()
  const { session } = useAuth()
  const uidRef = useRef(session?.user.id)
  uidRef.current = session?.user.id

  // Track visual open/close state for exit transition
  const [visible, setVisible] = useState(false)

  const busy = phase === 'transcribing'
  useEscapeStack(open && !busy, handleCancel)

  useEffect(() => {
    if (open) {
      setVisible(true)
      keptRef.current = null
      if (handedOver) {
        keptRef.current = handedOver.blob
        void transcribeKept()
      } else if (voiceLimitReachedToday(uidRef.current)) {
        setPhase('resting')
      } else {
        setPhase('recording')
        void startRecording()
      }
      return () => abandonRecorder()
    }
    // Delay unmount so captureSheetSlideOut/scrim fade (capture.css) has time to play
    // instead of the sheet popping out the instant `open` flips false.
    const timer = window.setTimeout(() => setVisible(false), 140)
    return () => {
      window.clearTimeout(timer)
      abandonRecorder()
    }
    // Runs on open/close transitions only — re-running on a re-render would restart the mic.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track recording duration
  useEffect(() => {
    if (recording) {
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [recording])

  async function startRecording() {
    const generation = generationRef.current
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      if (generation !== generationRef.current) return
      useToastStore.getState().push({ message: 'Microphone permission denied' })
      onClose()
      return
    }
    if (generation !== generationRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream

    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      keepRecording(recorder.mimeType)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
    setSeconds(0)
  }

  function keepRecording(mimeType: string) {
    const chunks = chunksRef.current
    chunksRef.current = []
    releaseMic()
    if (chunks.length === 0) {
      onClose()
      return
    }
    keptRef.current = new Blob(chunks, { type: mimeType })
    void transcribeKept()
  }

  async function transcribeKept() {
    const blob = keptRef.current
    if (!blob) return
    setPhase('transcribing')
    let text: string
    try {
      text = (await transcribeAudio(blob)).trim()
    } catch (err) {
      // Whatever the reason, the recording stays right here — never thrown away on a failure.
      const limit = await isDailyLimitError(err)
      if (limit) rememberVoiceLimitReached(uidRef.current)
      else console.warn('voice transcription did not complete', err)
      setKeptReason(limit ? 'limit' : navigator.onLine ? 'other' : 'offline')
      setPhase('kept')
      return
    }
    keptRef.current = null
    if (text) {
      await captureWithAI(text, 'voice', text)
    } else {
      useToastStore.getState().push({ message: "Didn't catch that — try again" })
    }
    onClose()
  }

  function stopAndFile() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  function saveToInbox() {
    saveUntranscribedVoiceNote()
    keptRef.current = null
    onClose()
  }

  function discard() {
    keptRef.current = null
    onClose()
  }

  function typeInstead() {
    onClose()
    useCommandBarStore.getState().setOpen(true)
  }

  /** Cancel button, Esc and a tap outside. A kept recording only leaves through its own buttons. */
  function handleCancel() {
    if (busy || phase === 'kept') return
    abandonRecorder()
    onClose()
  }

  function releaseMic() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    setRecording(false)
  }

  /** Stops a live recorder without filing it: its handlers are detached first, so a Cancel no
   * longer sends the half-recording off to be transcribed on its way out. */
  function abandonRecorder() {
    generationRef.current += 1
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // Already stopped — nothing left to release.
        }
      }
    }
    releaseMic()
  }

  if (!open && !visible) return null

  const minutesStr = Math.floor(seconds / 60)
  const secondsStr = String(seconds % 60).padStart(2, '0')
  const timeFormatted = `${minutesStr}:${secondsStr}`

  const statusText =
    phase === 'resting' ? RESTING.status
    : phase === 'transcribing' ? 'Transcribing…'
    : phase === 'kept' ? `${KEPT_STATUS} · ${timeFormatted}`
    : `Listening · ${timeFormatted}`
  const handText =
    phase === 'resting' ? RESTING.hand
    : phase === 'transcribing' ? 'Processing transcription...'
    : phase === 'kept' ? KEPT_HAND
    : 'say what\'s on your mind…'

  // Transition parameters
  const scrimAnimation = open ? 'captureScrimFadeIn 210ms var(--ease-out) forwards' : 'captureScrimFadeOut 140ms var(--ease-in) forwards'
  const sheetAnimation = open ? 'captureSheetSlideIn 210ms var(--ease-out) forwards' : 'captureSheetSlideOut 140ms var(--ease-in) forwards'

  const outlineButton = (disabled = false): CSSProperties => ({
    flex: 1,
    padding: 12,
    border: '1px solid var(--line-solid)',
    borderRadius: 999,
    fontSize: 13,
    color: 'var(--ink-muted)',
    background: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
  })
  const filledButton = (disabled = false): CSSProperties => ({
    flex: 1,
    padding: 12,
    background: 'var(--ink-body)',
    color: 'var(--paper-parchment)',
    borderRadius: 999,
    fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'none',
    fontFamily: 'inherit',
  })
  // A daily-limit reply makes Try again a long shot today, so saving takes the filled style.
  const saveIsPrimary = keptReason === 'limit'

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop scrim */}
      <div
        onClick={handleCancel}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(42, 36, 32, 0.42)',
          animation: motion ? scrimAnimation : undefined,
          opacity: motion ? undefined : (open ? 1 : 0),
          transition: motion ? undefined : 'opacity 140ms ease',
        }}
      />

      {/* Bottom Sheet Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Voice capture"
        data-voice-phase={phase}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'var(--paper-linen)',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -10px 30px rgba(var(--kf-shadow-rgb, 60,52,38),0.2)',
          padding: '22px 22px calc(30px + env(safe-area-inset-bottom))',
          zIndex: 110,
          textAlign: 'center',
          animation: motion ? sheetAnimation : undefined,
          transform: motion ? undefined : (open ? 'translateY(0)' : 'translateY(100%)'),
          transition: motion ? undefined : 'transform 210ms ease-out',
        }}
      >
        {/* Top drag handle */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line-solid)', margin: '0 auto 22px' }} />

        {/* Pulsing red Mic button */}
        <div
          className={recording && motion ? 'kf-mic-pulsing' : ''}
          style={{
            width: 78,
            height: 78,
            borderRadius: '999px',
            background: 'var(--acc-terra)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            boxShadow: '0 0 0 8px color-mix(in srgb, var(--acc-terra) 14%, transparent), var(--shadow-cta)',
            transition: 'box-shadow var(--dur-normal) var(--ease-natural)',
            opacity: phase === 'resting' ? 0.45 : 1,
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="var(--paper-parchment)" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 17.5V21M8.5 21h7" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        {/* Visual waveforms */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 26, marginTop: 20 }}>
          {recording ? (
            // WB-1: the bars looped forever regardless of the Effects toggle. The heights/
            // delays are per-nth-child in capture.css; `animation:none` stills them in place.
            Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="kf-waveform-bar" style={motion ? undefined : { animation: 'none' }} />
            ))
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-hairline)', fontStyle: 'italic' }}>—</span>
          )}
        </div>

        {/* Status text timer */}
        <div aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginTop: 16 }}>
          {statusText}
        </div>

        {/* Prompt string */}
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--ink-hand, #7a745f)', marginTop: 6 }}>
          {handText}
        </div>

        {phase === 'kept' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-body)', lineHeight: 1.4 }}>{keptReasonLine(keptReason)}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.4 }}>{KEPT_AUDIO_NOTE}</div>
          </div>
        )}
        {phase === 'resting' && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-body)', lineHeight: 1.4 }}>{RESTING.line}</div>
        )}

        {/* Action Buttons */}
        {phase === 'resting' ? (
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button type="button" onClick={handleCancel} style={outlineButton()}>
              {RESTING.close}
            </button>
            <button type="button" onClick={typeInstead} style={filledButton()}>
              {RESTING.type}
            </button>
          </div>
        ) : phase === 'kept' ? (
          <>
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button type="button" onClick={discard} style={outlineButton()}>
                {KEPT_ACTIONS.discard}
              </button>
              <button type="button" onClick={() => void transcribeKept()} style={saveIsPrimary ? outlineButton() : filledButton()}>
                {KEPT_ACTIONS.retry}
              </button>
            </div>
            <button
              type="button"
              onClick={saveToInbox}
              style={{ ...(saveIsPrimary ? filledButton() : outlineButton()), width: '100%', marginTop: 10 }}
            >
              {KEPT_ACTIONS.save}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button type="button" onClick={handleCancel} disabled={busy} style={outlineButton(busy)}>
              Cancel
            </button>
            <button type="button" onClick={stopAndFile} disabled={busy || !recording} style={filledButton(busy || !recording)}>
              Stop & file
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
