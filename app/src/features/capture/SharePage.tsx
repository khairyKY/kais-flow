import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { captureText } from '../inbox/api'

// ── Punch 24 — the Android share target's landing route. The PWA manifest
// (`share_target` in vite.config.ts) points Chrome's share sheet at GET /share?title&text&url;
// this page turns that payload into an Inbox capture and hands the user to the Inbox so the
// thing they just shared is visibly there.
//
// ponytail: `captureText`, not `captureWithAI` — a synchronous outbox write lands in the Inbox
// instantly and works with no signal, which is exactly what the Judge line asks for (<5s). The
// AI read is what the Inbox card's own triage is for. Add a parse here if shared links ever
// pile up enough that reading them by hand is the bottleneck. ──
export function SharePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const captured = useRef(false)

  useEffect(() => {
    if (captured.current) return // StrictMode runs effects twice; one share = one capture
    captured.current = true
    const parts = ['title', 'text', 'url']
      .map((key) => params.get(key)?.trim())
      .filter((v): v is string => !!v)
    // Chrome commonly puts the same URL in both `text` and `url`; don't capture it twice.
    const raw = [...new Set(parts)].join('\n')
    if (raw) captureText(raw)
    navigate('/inbox', { replace: true })
  }, [params, navigate])

  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)' }}>
      planting it in the inbox ✿
    </div>
  )
}
