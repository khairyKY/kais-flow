import { useRef, useState } from 'react'
import { transcribeAudio, captureWithAI } from './api'
import { useToastStore } from '../../lib/toastStore'
import { Button } from '../../components/kit'

// Pixel contract: Today.dc.html 1a header CTA (line 132) — mic glyph + pill, kit Button "cta".

function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function MicIcon() {
  return (
    <svg width="15" height="16" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="var(--paper-parchment)" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.5V21M8.5 21h7" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function VoiceCaptureButton() {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function start() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      useToastStore.getState().push({ message: 'Microphone permission denied' })
      return
    }
    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      void (async () => {
        setBusy(true)
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          const text = await transcribeAudio(blob)
          if (text.trim()) await captureWithAI(text.trim(), 'voice', text.trim())
          else useToastStore.getState().push({ message: "Didn't catch that — try again" })
        } catch {
          useToastStore.getState().push({ message: 'Voice capture failed' })
        } finally {
          setBusy(false)
        }
      })()
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
  }

  function stop() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <Button
      type="button"
      variant="cta"
      icon={<MicIcon />}
      onClick={() => (recording ? stop() : void start())}
      disabled={busy}
      style={{
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.5 : 1,
        background: recording ? 'color-mix(in srgb, var(--acc-terra) 80%, black)' : undefined,
      }}
    >
      {busy ? 'Transcribing…' : recording ? 'Stop' : 'Voice capture'}
    </Button>
  )
}
