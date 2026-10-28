import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { Button } from '../../components/kit'
import { BottomSheet } from '../../components/BottomSheet'
import { transcribeAudio, captureWithAI, saveUntranscribedVoiceNote } from './api'
import { isDailyLimitError, rememberVoiceLimitReached, voiceLimitReachedToday } from './aiAllowance'
import { KEPT_ACTIONS, KEPT_AUDIO_NOTE, KEPT_HAND, KEPT_STATUS, RESTING, keptReasonLine, type KeptReason } from './voiceCopy'
import { useAuth } from '../auth/AuthProvider'
import { openCapture } from '../command-bar/commandBarStore'
import { useToastStore } from '../../lib/toastStore'
import { pickMimeType } from './holdToTalk'
import { PoweredBySotto, SottoPill } from './SottoPill'
import { SOTTO_DONE_MS, type SottoState } from './sotto'
import './capture.css'

interface VoiceCaptureSheetProps {
  /** Fires once the sheet has left (O2: it lives in BottomSheet — drag, swipe down, exit). */
  onClose: () => void
  /** A take already recorded elsewhere (the tab bar's hold-to-talk): the sheet skips the mic and
   * goes straight to transcribing it — with every "never lose a recording" path below. */
  recording?: { blob: Blob; seconds: number }
  /** Where a transcript goes instead of being AI-filed: the command bar's dictation, whose take
   * failed to transcribe, gets its words back in the field once Try again works. */
  onText?: (text: string) => void
  /** Hold-to-talk from outside (the chat's mic): true once the finger lifts — a take already
   * recording stops and goes on its way. Lifted before the mic was ready = the tap path (Stop). */
  release?: boolean
  /** The stop button's words: the chat sends the take as a message ("Stop & send"); everywhere else it files. */
  stopLabel?: string
}

/**
 * Polish E ("never lose a voice recording", conductor decision 2026-09-26):
 * - `recording` → `transcribing` → (`polishing`, the AI filing it) → `done` → closed. Each shows on
 *   Sotto's pill (Kai 2026-10-16: voice is powered by Sotto, his own dictation app, as in Sukoon).
 * - If transcription fails for any reason (daily limit, offline, a server hiccup) the sheet moves
 *   to `kept`: the recording stays in memory with Try again / Save to Inbox untranscribed /
 *   Discard. Nothing but the Discard button throws it away — tapping outside and Esc don't.
 * - After a daily-limit reply the sheet opens `resting` for the rest of that Cairo day on this
 *   device: it says so up front and offers typing instead of recording.
 */
type Phase = 'resting' | 'recording' | 'transcribing' | 'polishing' | 'done' | 'kept'

/** The sheet's phase on Sotto's pill; a kept take is its error (↻ = Try again). Resting has no pill. */
const PILL: Record<Phase, SottoState | null> = {
  resting: null,
  recording: 'listening',
  transcribing: 'transcribing',
  polishing: 'polishing',
  done: 'done',
  kept: 'error',
}

export function VoiceCaptureSheet({ onClose, recording: handedOver, onText, release, stopLabel = 'Stop & file' }: VoiceCaptureSheetProps) {
  const [phase, setPhase] = useState<Phase>(handedOver ? 'transcribing' : 'recording')
  const [keptReason, setKeptReason] = useState<KeptReason>('other')
  const [recording, setRecording] = useState(false)
  /** The live mic, for the pill's level bars. */
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [seconds, setSeconds] = useState(handedOver?.seconds ?? 0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  /** The finished recording, held until it's filed, saved, or discarded. */
  const keptRef = useRef<Blob | null>(null)
  /** The handed-over take already sent to transcription. */
  const sentRef = useRef<Blob | null>(null)
  /** Bumped whenever the sheet lets go of a recording, so a late getUserMedia can't revive it. */
  const generationRef = useRef(0)
  const { session } = useAuth()
  const uidRef = useRef(session?.user.id)
  uidRef.current = session?.user.id

  /** BottomSheet's close: plays the exit, then `onClose`. Every way out of this sheet goes through it. */
  const sheetClose = useRef<() => void>(onClose)
  const close = () => sheetClose.current()

  const busy = phase === 'transcribing' || phase === 'polishing' || phase === 'done'

  useEffect(() => {
    keptRef.current = handedOver?.blob ?? null
    if (handedOver) {
      // Once per take: StrictMode's dev re-run of this effect sent it twice (two filings, or the
      // dictated words twice in the field).
      if (sentRef.current !== handedOver.blob) {
        sentRef.current = handedOver.blob
        void transcribeKept()
      }
    } else if (voiceLimitReachedToday(uidRef.current)) {
      setPhase('resting')
    } else {
      setPhase('recording')
      void startRecording()
    }
    // A swipe down or scrim tap unmounts the sheet after its exit: the mic stops here, unfiled.
    return () => abandonRecorder()
    // Mount only — re-running on a re-render would restart the mic.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (release && recording) stopAndFile()
    // Only the lift itself ends a take — not the mic coming on after it.
  }, [release]) // eslint-disable-line react-hooks/exhaustive-deps

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
      close()
      return
    }
    if (generation !== generationRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream
    setStream(stream)

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
      close()
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
    if (!text) {
      useToastStore.getState().push({ message: "Didn't catch that — try again" })
      return close()
    }
    if (onText) onText(text)
    else {
      setPhase('polishing') // the AI reads it and files it
      await captureWithAI(text, 'voice', text)
    }
    // Sotto's tick, then the sheet goes.
    setPhase('done')
    await new Promise((resolve) => window.setTimeout(resolve, SOTTO_DONE_MS))
    close()
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
    close()
  }

  function discard() {
    keptRef.current = null
    close()
  }

  function typeInstead() {
    close()
    if (!onText) openCapture() // words wanted elsewhere (the chat): its own field is right there
  }

  /** Cancel button, Esc and a tap outside. A kept recording only leaves through its own buttons. */
  function handleCancel() {
    if (busy || phase === 'kept') return
    abandonRecorder()
    close()
  }

  function releaseMic() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    setRecording(false)
    setStream(null)
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

  const minutesStr = Math.floor(seconds / 60)
  const secondsStr = String(seconds % 60).padStart(2, '0')
  const timeFormatted = `${minutesStr}:${secondsStr}`
  const pill = PILL[phase]

  const statusText =
    phase === 'resting' ? RESTING.status
    : phase === 'transcribing' ? 'Transcribing…'
    : phase === 'polishing' ? 'Filing…'
    : phase === 'done' ? 'Done'
    : phase === 'kept' ? `${KEPT_STATUS} · ${timeFormatted}`
    : `Listening · ${timeFormatted}`
  const handText =
    phase === 'resting' ? RESTING.hand
    : phase === 'transcribing' ? 'Processing transcription...'
    : phase === 'polishing' ? 'working out where it goes…'
    : phase === 'done' ? 'got it'
    : phase === 'kept' ? KEPT_HAND
    : 'say what\'s on your mind…'

  // A daily-limit reply makes Try again a long shot today, so saving takes the filled style.
  const saveIsPrimary = keptReason === 'limit'

  // Swipe, scrim and Esc dismiss only while nothing is in flight: a kept take leaves through its own buttons.
  return (
    <BottomSheet
      onClose={onClose}
      dismissible={!busy && phase !== 'kept'}
      handleGap={8}
      sheetProps={{ 'aria-label': 'Voice capture', 'data-voice-phase': phase, style: { maxWidth: 440, background: 'var(--paper-linen)' } }}
    >
      {(sheetCloseFn) => {
        sheetClose.current = sheetCloseFn
        return (
      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        {/* Sotto's pill: listening (tap it to finish, ✕ to cancel), transcribing, polishing, done, kept. */}
        {pill && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 2px' }}>
            <SottoPill
              state={pill}
              stream={stream}
              onFinish={recording ? stopAndFile : undefined}
              onCancel={handleCancel}
              onRetry={() => void transcribeKept()}
            />
          </div>
        )}

        {/* Status text timer */}
        <div aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-muted)', marginTop: 16 }}>
          {statusText}
        </div>

        {/* Prompt string — the interface face (D7: handwriting is for pages); kf-help raises its first letter. */}
        <div className="kf-help" style={{ marginTop: 6 }}>
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
            <SheetButton onClick={handleCancel}>{RESTING.close}</SheetButton>
            <SheetButton filled onClick={typeInstead}>{RESTING.type}</SheetButton>
          </div>
        ) : phase === 'kept' ? (
          <>
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <SheetButton onClick={discard}>{KEPT_ACTIONS.discard}</SheetButton>
              <SheetButton filled={!saveIsPrimary} onClick={() => void transcribeKept()}>{KEPT_ACTIONS.retry}</SheetButton>
            </div>
            <SheetButton filled={saveIsPrimary} onClick={saveToInbox} style={{ width: '100%', marginTop: 10 }}>{KEPT_ACTIONS.save}</SheetButton>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <SheetButton onClick={handleCancel} disabled={busy}>Cancel</SheetButton>
            <SheetButton filled onClick={stopAndFile} disabled={busy || !recording}>{stopLabel}</SheetButton>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <PoweredBySotto />
        </div>
      </div>
        )
      }}
    </BottomSheet>
  )
}

/** The sheet's buttons: the kit's (D11 = B) — secondary a bone tone. The filled one keeps the sheet's
 * ink (.kf-voice-ink) in B's shape: B's terra primary would sit right under the terra mic. */
function SheetButton({ filled = false, style, ...props }: { filled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button type="button" variant={filled ? 'cta' : 'secondary'} className={filled ? 'kf-voice-ink' : undefined} style={{ flex: 1, justifyContent: 'center', ...style }} {...props} />
}
