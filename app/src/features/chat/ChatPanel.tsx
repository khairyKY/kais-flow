import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { streamChat } from './api'
import type { Citation } from '../../lib/types'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const navigate = useNavigate()

  if (!open) return null

  function updateLast(patch: Partial<DisplayMessage>) {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      copy[copy.length - 1] = { ...last, ...patch, content: patch.content ?? last.content }
      return copy
    })
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const history: DisplayMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat(
        history.map((m) => ({ role: m.role, content: m.content })),
        {
          onDelta: (delta) => {
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, content: last.content + delta }
              return copy
            })
          },
          onDone: (citations) => updateLast({ citations }),
          onError: (message) => updateLast({ content: `Error: ${message}` }),
        },
        controller.signal,
      )
    } finally {
      setBusy(false)
    }
  }

  function goToCitation(c: Citation) {
    onClose()
    navigate(c.entity_type === 'task' ? `/tasks?focus=${c.entity_id}` : `/inbox?focus=${c.entity_id}`)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        zIndex: 50,
        width: '100%',
        maxWidth: 432,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(251,246,233,0.92)',
        backdropFilter: 'blur(9px)',
        borderLeft: '1px solid var(--line-dashed)',
        boxShadow: '-24px 0 60px rgba(40,32,20,0.25)',
      }}
    >
      <style>{'.chat-sprig{transition:transform 200ms ease}.chat-sprig:hover{transform:rotate(4deg)}'}</style>

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 11, padding: '18px 22px 14px', borderBottom: '1px dashed var(--line-dashed)' }}>
        <img src="assets/clover/resting.png" alt="" className="chat-sprig" style={{ height: 30, width: 'auto', objectFit: 'contain', transform: 'rotate(-4deg)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)' }}>Chat</div>
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 14.5, color: 'var(--text-tertiary)', marginTop: -1 }}>ask about anything you've captured</div>
        </div>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
            Ask about anything you've captured — "what did I capture about the pricing project last week?"
          </p>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1
          if (m.role === 'user') {
            return (
              <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--text-primary)', color: 'var(--text-on-accent)', borderRadius: '12px 12px 3px 12px', padding: '10px 14px', fontSize: 13.5, lineHeight: 1.45 }}>
                {m.content}
              </div>
            )
          }
          if (streaming && !m.content) {
            return (
              <div key={i} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-input)', border: '1px solid var(--line-card)', borderRadius: '12px 12px 12px 3px', padding: '11px 14px' }}>
                <img src="assets/clover/awake.png" alt="" style={{ height: 20, width: 'auto', objectFit: 'contain' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-tertiary)', letterSpacing: '0.14em' }}>…</span>
              </div>
            )
          }
          return (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--bg-input)', border: '1px solid var(--line-card)', borderRadius: '12px 12px 12px 3px', padding: '12px 14px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-primary)' }}>
              <div>{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {m.citations.map((c) => (
                    <button
                      key={`${c.entity_type}-${c.entity_id}`}
                      type="button"
                      onClick={() => goToCitation(c)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: 'var(--acc-clover-text)',
                        background: 'rgba(201,160,160,0.16)',
                        border: '1px solid rgba(201,160,160,0.5)',
                        padding: '3px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                      }}
                    >
                      ◈ {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        style={{ flex: 'none', padding: '14px 22px 18px', borderTop: '1px dashed var(--line-dashed)', display: 'flex', gap: 9 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your system…"
          disabled={busy}
          style={{
            flex: 1,
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 999,
            padding: '10px 15px',
            outline: 'none',
            color: 'var(--text-primary)',
            opacity: busy ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            border: 'none',
            background: 'var(--acc-clover)',
            color: 'var(--text-on-accent)',
            fontFamily: 'inherit',
            fontSize: 12.5,
            padding: '10px 18px',
            borderRadius: 999,
            cursor: busy || !input.trim() ? 'default' : 'pointer',
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
