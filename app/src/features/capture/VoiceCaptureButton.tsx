import { useRef, useState } from 'react'
import { transcribeAudio, captureWithAI } from './api'
import { useToastStore } from '../../lib/toastStore'

function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
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
    <button
      type="button"
      onClick={() => (recording ? stop() : void start())}
      disabled={busy}
      style={{
        border: 'none',
        background: recording ? 'color-mix(in srgb, var(--acc-terra) 80%, black)' : 'var(--acc-terra)',
        color: 'var(--text-on-accent)',
        fontFamily: 'inherit',
        fontSize: 13,
        padding: '10px 18px',
        borderRadius: 999,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: 'var(--shadow-cta)',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-on-accent)', display: 'inline-block' }} />
      {busy ? 'Transcribing…' : recording ? 'Stop' : 'Voice capture'}
    </button>
  )
}
