import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { transcribeAudio, captureWithAI } from './api'
import { useToastStore } from '../../lib/toastStore'
import { useEscapeStack } from '../../lib/overlayStack'
import { useMotionEnabled } from '../../lib/motion'
import './capture.css'

function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

interface VoiceCaptureSheetProps {
  open: boolean
  onClose: () => void
}

export function VoiceCaptureSheet({ open, onClose }: VoiceCaptureSheetProps) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const motion = useMotionEnabled()

  // Track visual open/close state for exit transition
  const [visible, setVisible] = useState(false)

  useEscapeStack(open && !busy, handleCancel)

  useEffect(() => {
    if (open) {
      setVisible(true)
      void startRecording()
      return () => cleanupRecording()
    }
    // Delay unmount so captureSheetSlideOut/scrim fade (capture.css) has time to play
    // instead of the sheet popping out the instant `open` flips false.
    const timer = window.setTimeout(() => setVisible(false), 140)
    return () => {
      window.clearTimeout(timer)
      cleanupRecording()
    }
  }, [open])

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
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch {
      useToastStore.getState().push({ message: 'Microphone permission denied' })
      onClose()
      return
    }

    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      void processAudio(recorder.mimeType)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
    setSeconds(0)
  }

  async function processAudio(mimeType: string) {
    if (chunksRef.current.length === 0) {
      cleanupRecording()
      onClose()
      return
    }

    setBusy(true)
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const text = await transcribeAudio(blob)
      if (text.trim()) {
        await captureWithAI(text.trim(), 'voice', text.trim())
      } else {
        useToastStore.getState().push({ message: "Didn't catch that — try again" })
      }
    } catch (err) {
      console.error(err)
      useToastStore.getState().push({ message: 'Voice capture failed' })
    } finally {
      setBusy(false)
      cleanupRecording()
      onClose()
    }
  }

  function stopAndFile() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  function handleCancel() {
    if (busy) return
    cleanupRecording()
    onClose()
  }

  function cleanupRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    setRecording(false)
    setSeconds(0)
  }

  if (!open && !visible) return null

  const minutesStr = Math.floor(seconds / 60)
  const secondsStr = String(seconds % 60).padStart(2, '0')
  const timeFormatted = `${minutesStr}:${secondsStr}`

  // Transition parameters
  const scrimAnimation = open ? 'captureScrimFadeIn 210ms var(--ease-out) forwards' : 'captureScrimFadeOut 140ms var(--ease-in) forwards'
  const sheetAnimation = open ? 'captureSheetSlideIn 210ms var(--ease-out) forwards' : 'captureSheetSlideOut 140ms var(--ease-in) forwards'

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
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'var(--paper-linen)',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -10px 30px rgba(60,52,38,0.2)',
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
          className={recording ? 'kf-mic-pulsing' : ''}
          style={{
            width: 78,
            height: 78,
            borderRadius: '999px',
            background: 'var(--acc-terra)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            boxShadow: '0 0 0 8px rgba(181, 101, 74, 0.14), var(--shadow-cta)',
            transition: 'box-shadow var(--dur-normal) var(--ease-natural)',
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
            <>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
              <span className="kf-waveform-bar"></span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-hairline)', fontStyle: 'italic' }}>—</span>
          )}
        </div>

        {/* Status text timer */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginTop: 16 }}>
          {busy ? 'Transcribing…' : `Listening · ${timeFormatted}`}
        </div>

        {/* Prompt string */}
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--ink-hand, #7a745f)', marginTop: 6 }}>
          {busy ? 'Processing transcription...' : 'say what\'s on your mind…'}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            style={{
              flex: 1,
              padding: 12,
              border: '1px solid var(--line-solid)',
              borderRadius: 999,
              fontSize: 13,
              color: 'var(--ink-muted)',
              background: 'none',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={stopAndFile}
            disabled={busy || !recording}
            style={{
              flex: 1,
              padding: 12,
              background: 'var(--ink-body)',
              color: 'var(--paper-parchment)',
              borderRadius: 999,
              fontSize: 13,
              cursor: busy || !recording ? 'default' : 'pointer',
              opacity: busy || !recording ? 0.5 : 1,
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            Stop & file
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
