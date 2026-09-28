import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { useToastStore } from '../../lib/toastStore'
import { useEscapeStack } from '../../lib/overlayStack'
import { voiceLimitReachedToday } from './aiAllowance'
import { LOCK_DISTANCE, formatTake, holdStep, pickMimeType, type HoldEvent, type HoldState } from './holdToTalk'
import './capture.css'
import { longPress } from '../../lib/haptics'

// The sheet (and its transcribe/parse chain) only loads once a take needs filing.
const VoiceCaptureSheet = lazy(() => import('./VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

// MK Capture.dc.html: the tab bar's centre button. Tap = the capture (text) sheet — it never opens
// the mic. Hold ≥ --dur-longpress = record while held; release sends; slide up onto the lock =
// hands-free [Cancel · timer · waveform · Send]; slide left = discard, with Undo.
// Sending hands the take to VoiceCaptureSheet, which transcribes + files it and keeps it (Try
// again / Save to Inbox) if that fails — the same "never lose a recording" path as the sheet's mic.

const GROWN = 72 / 56 // the held button grows from --capture-size 56 to 72

function longPressMs(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-longpress')) || 400
}

type Take = { stream: MediaStream; recorder: MediaRecorder; chunks: Blob[]; meter: number; audio?: AudioContext }

export function CaptureButton() {
  const [hold, setHold] = useState<HoldState>({ phase: 'idle' })
  const holdRef = useRef<HoldState>(hold)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [levels, setLevels] = useState<number[]>([])
  const [sheet, setSheet] = useState<{ recording?: { blob: Blob; seconds: number } } | null>(null)
  const take = useRef<Take | null>(null)
  /** Bumped whenever a take ends, so a getUserMedia still pending can't start a stale one. */
  const generation = useRef(0)
  const pressTimer = useRef<number | undefined>(undefined)
  /** A hold happened — the click the browser fires on release is not a tap. */
  const held = useRef(false)
  const { session } = useAuth()
  const uid = session?.user.id

  useEffect(() => () => {
    window.clearTimeout(pressTimer.current)
    generation.current += 1
    release(take.current)
  }, [])

  useEscapeStack(hold.phase === 'locked', () => dispatch({ type: 'discard' }))

  function dispatch(e: HoldEvent) {
    const [next, effect] = holdStep(holdRef.current, e)
    holdRef.current = next
    setHold(next)
    if (effect === 'start') startTake()
    else if (effect === 'send' || effect === 'discard') endTake(effect)
  }

  function startTake() {
    held.current = true
    longPress()
    // Voice is used up for today on this device: no recording — the sheet says so and offers typing.
    if (voiceLimitReachedToday(uid)) {
      dispatch({ type: 'fail' })
      setSheet({})
      return
    }
    void openMic()
  }

  async function openMic() {
    const gen = ++generation.current
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      if (gen === generation.current) micRefused()
      return
    }
    if (gen !== generation.current) {
      // The finger lifted while the browser was still asking (or opening) the mic.
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    try {
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start()
      const next: Take = { stream, recorder, chunks, meter: 0 }
      // Live level bars (the recording pill's waveform). No Web Audio → the bars stay flat.
      let sample = () => 0.08
      try {
        const audio = new AudioContext()
        const analyser = audio.createAnalyser()
        analyser.fftSize = 256
        audio.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        sample = () => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += ((v - 128) / 128) ** 2
          return Math.min(1, Math.sqrt(sum / buf.length) * 4)
        }
        next.audio = audio
      } catch {
        // meter is decorative
      }
      next.meter = window.setInterval(() => setLevels((l) => [...l.slice(-59), sample()]), 100)
      take.current = next
      setLevels([])
      setStartedAt(Date.now())
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      micRefused()
    }
  }

  function micRefused() {
    dispatch({ type: 'fail' })
    useToastStore.getState().push({
      // Short on purpose: the toast is one line (≈40 characters beside its action on a phone).
      message: 'Mic blocked — allow it in site settings',
      action: { label: 'Retry', run: () => void retryMic() },
    })
  }

  async function retryMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      useToastStore.getState().push({ message: 'Mic on — hold the button to talk' })
    } catch {
      micRefused()
    }
  }

  function endTake(kind: 'send' | 'discard') {
    generation.current += 1
    const t = take.current
    take.current = null
    const seconds = startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000)
    setStartedAt(null)
    setLevels([])
    if (!t) {
      // Released before the mic was ready (e.g. while answering the permission prompt).
      if (kind === 'send') useToastStore.getState().push({ message: 'Keep holding while you talk' })
      return
    }
    window.clearInterval(t.meter)
    t.recorder.onstop = () => {
      release(t)
      const blob = t.chunks.length > 0 ? new Blob(t.chunks, { type: t.recorder.mimeType }) : null
      if (!blob) {
        if (kind === 'send') useToastStore.getState().push({ message: "Didn't catch that — try again" })
        return
      }
      const recording = { blob, seconds }
      if (kind === 'send') setSheet({ recording })
      else useToastStore.getState().push({ message: 'Recording discarded', onUndo: () => setSheet({ recording }) })
    }
    t.recorder.stop()
  }

  function release(t: Take | null) {
    if (!t) return
    window.clearInterval(t.meter)
    void t.audio?.close()
    t.stream.getTracks().forEach((track) => track.stop())
  }

  const recording = hold.phase === 'recording'
  const elapsed = formatTake(startedAt === null ? 0 : Date.now() - startedAt)
  const wave = (
    <span className="kf-rec-wave" aria-hidden="true">
      {levels.map((l, i) => (
        <span key={i} style={{ height: `${Math.round(4 + l * 24)}px` }} />
      ))}
    </span>
  )

  return (
    <>
      <button
        type="button"
        className="kf-capture kf-press"
        data-phase={hold.phase}
        aria-label="Capture — tap to type, hold to talk"
        style={recording ? { transform: `translate(${hold.dx}px, ${hold.dy}px) scale(${GROWN})` } : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          held.current = false
          dispatch({ type: 'down', x: e.clientX, y: e.clientY })
          pressTimer.current = window.setTimeout(() => dispatch({ type: 'longpress' }), longPressMs())
        }}
        onPointerMove={(e) => dispatch({ type: 'move', x: e.clientX, y: e.clientY })}
        onPointerUp={() => {
          window.clearTimeout(pressTimer.current)
          dispatch({ type: 'up' })
        }}
        onPointerCancel={() => {
          window.clearTimeout(pressTimer.current)
          dispatch({ type: 'cancel' })
        }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // detail 0 = Enter / Space: always a tap (there's no keyboard hold-to-talk).
          if (e.detail === 0 || !held.current) useCommandBarStore.getState().setOpen(true)
        }}
      >
        <Icon name="mic" size={24} />
      </button>

      {recording &&
        createPortal(
          <>
            <div className="kf-rec-pill">
              <span className="kf-rec-dot" />
              <span className="kf-rec-time">{elapsed}</span>
              {wave}
            </div>
            <div className="kf-rec-rail" aria-hidden="true">
              <span className="kf-rec-lock" data-near={hold.dy <= -LOCK_DISTANCE / 2 || undefined}>
                <Icon name="lock" size={20} />
              </span>
              <Icon name="chevdown" size={20} style={{ transform: 'rotate(180deg)' }} />
            </div>
          </>,
          document.body,
        )}

      {hold.phase === 'locked' &&
        createPortal(
          <div className="kf-rec-locked" role="group" aria-label="Recording, hands-free">
            <div className="kf-rec-locked-row">
              <button type="button" className="kf-rec-cancel kf-press" aria-label="Cancel recording" onClick={() => dispatch({ type: 'discard' })}>
                <Icon name="delete" size={24} />
              </button>
              <span className="kf-rec-dot" />
              <span className="kf-rec-time">{elapsed}</span>
              {wave}
              <button type="button" className="kf-rec-send kf-press" aria-label="Send recording" onClick={() => dispatch({ type: 'send' })}>
                <Icon name="send" size={24} />
              </button>
            </div>
          </div>,
          document.body,
        )}

      {sheet && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet open recording={sheet.recording} onClose={() => setSheet(null)} />
        </Suspense>
      )}
    </>
  )
}
