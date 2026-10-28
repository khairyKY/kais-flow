import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { openCapture } from '../command-bar/commandBarStore'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import { useEscapeStack } from '../../lib/overlayStack'
import { voiceLimitReachedToday } from './aiAllowance'
import { LOCK_DISTANCE, clickIsTap, formatTake, holdStep, pickMimeType, type HoldEvent, type HoldState } from './holdToTalk'
import './capture.css'
import { longPress } from '../../lib/haptics'
import { usePaperStore } from '../paper/paperStore'
import { PoweredBySotto, SottoPill } from './SottoPill'

// The sheet (and its transcribe/parse chain) only loads once a take needs filing.
const VoiceCaptureSheet = lazy(() => import('./VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

// MK Capture.dc.html: the tab bar's centre button. Tap = the capture (text) sheet with the keyboard
// up (Paper Capture 11a; its mic switches to talking) — it never opens the mic itself. Kai's phone
// review (2026-10-07): a mic at rest still said "voice only", so it draws the kit's plus — the
// desktop Capture button's (CaptureCta) — and the mic only while a take records; the label and the
// sheet's first-run hint say "tap to type · hold to talk". Hold ≥ --dur-longpress = record while held; release sends; slide up onto the lock =
// hands-free [Cancel · timer · waveform · Send]; slide left = discard, with Undo.
// Sending hands the take to VoiceCaptureSheet, which transcribes + files it and keeps it (Try
// again / Save to Inbox) if that fails — the same "never lose a recording" path as the sheet's mic.
// While it records, the pill is Sotto's (Kai 2026-10-16): its bars follow the mic.

const GROWN = 72 / 56 // the held button grows from --capture-size 56 to 72

function longPressMs(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-longpress')) || 400
}

type Take = { stream: MediaStream; recorder: MediaRecorder; chunks: Blob[]; tick: number }

export function CaptureButton() {
  const [hold, setHold] = useState<HoldState>({ phase: 'idle' })
  const holdRef = useRef<HoldState>(hold)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  /** The live mic, for Sotto's level bars; a 1s tick keeps the hands-free timer moving. */
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [, setTick] = useState(0)
  const [sheet, setSheet] = useState<{ recording?: { blob: Blob; seconds: number } } | null>(null)
  const take = useRef<Take | null>(null)
  /** Bumped whenever a take ends, so a getUserMedia still pending can't start a stale one. */
  const generation = useRef(0)
  const pressTimer = useRef<number | undefined>(undefined)
  /** A hold happened — the click the browser fires on release is not a tap. */
  const held = useRef(false)
  const { session } = useAuth()
  const uid = session?.user.id
  // Paper capture 11a: a dot while photographed pages wait offline.
  const waiting = usePaperStore((s) => s.waiting)

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
      take.current = { stream, recorder, chunks, tick: window.setInterval(() => setTick((n) => n + 1), 1000) }
      setStream(stream)
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
    setStream(null)
    if (!t) {
      // Released before the mic was ready (e.g. while answering the permission prompt).
      if (kind === 'send') useToastStore.getState().push({ message: 'Keep holding while you talk' })
      return
    }
    window.clearInterval(t.tick)
    t.recorder.onstop = () => {
      release(t)
      const blob = t.chunks.length > 0 ? new Blob(t.chunks, { type: t.recorder.mimeType }) : null
      if (!blob) {
        if (kind === 'send') useToastStore.getState().push({ message: "Didn't catch that — try again" })
        return
      }
      const recording = { blob, seconds }
      if (kind === 'send') setSheet({ recording })
      else toastUndo('Recording discarded', () => setSheet({ recording }))
    }
    t.recorder.stop()
  }

  function release(t: Take | null) {
    if (!t) return
    window.clearInterval(t.tick)
    t.stream.getTracks().forEach((track) => track.stop())
  }

  const recording = hold.phase === 'recording'
  const elapsed = formatTake(startedAt === null ? 0 : Date.now() - startedAt)

  return (
    <>
      <button
        type="button"
        className="kf-capture kf-press"
        data-phase={hold.phase}
        data-tour="capture"
        aria-label={`Capture — tap to type, hold to talk${waiting ? ` · ${waiting} ${waiting === 1 ? 'page' : 'pages'} waiting` : ''}`}
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
          // Opened and focused inside this tap, so the phone keyboard comes up with the sheet.
          if (clickIsTap(e.detail, held.current)) openCapture()
        }}
      >
        <Icon name={recording ? 'mic' : 'plus'} size={24} />
        {waiting > 0 && <span className="pp-capture-dot" aria-hidden="true" />}
      </button>

      {recording &&
        createPortal(
          <>
            <div className="kf-rec-pill">
              <SottoPill state="listening" stream={stream} compact />
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
            <div className="kf-rec-powered">
              <PoweredBySotto />
            </div>
            <div className="kf-rec-locked-row">
              <button type="button" className="kf-rec-cancel kf-press" aria-label="Cancel recording" onClick={() => dispatch({ type: 'discard' })}>
                <Icon name="delete" size={24} />
              </button>
              <span className="kf-rec-time">{elapsed}</span>
              {/* Tap Sotto's pill to finish, as on the Windows app: the same as Send. */}
              <SottoPill state="listening" stream={stream} compact onFinish={() => dispatch({ type: 'send' })} />
              <button type="button" className="kf-rec-send kf-press" aria-label="Send recording" onClick={() => dispatch({ type: 'send' })}>
                <Icon name="send" size={24} />
              </button>
            </div>
          </div>,
          document.body,
        )}

      {sheet && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet recording={sheet.recording} onClose={() => setSheet(null)} />
        </Suspense>
      )}
    </>
  )
}
