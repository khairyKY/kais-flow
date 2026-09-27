import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { streamChat } from './api'
import { AI_ALLOWANCE_USED_UP } from '../capture/aiAllowance'
import { useBodyScrollLock, useEscapeStack } from '../../lib/overlayStack'
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
  useBodyScrollLock(open)
  useEscapeStack(open, onClose) // F3 (punch 12): Esc closes the ⌘J drawer like every other overlay

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
          // X5 States rule — the word "error" never appears; calm copy, no raw message. SEC-2: a
          // used-up daily AI allowance says so plainly instead of inviting a retry.
          onError: (_message, reason) =>
            updateLast({
              content: reason === 'daily_limit' ? AI_ALLOWANCE_USED_UP : 'That one got lost on the breeze — try asking again.',
            }),
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
      className="kf-drawer"
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
        background: 'var(--paper-parchment)',
        borderLeft: '1px solid var(--line-card)',
        boxShadow: '-1px 0 2px rgba(var(--kf-shadow-rgb, 60,52,38),0.14), -10px 0 26px rgba(var(--kf-shadow-rgb, 60,52,38),0.1)',
      }}
    >
      {/* X2 Motion 5d — hover lean: the chat sprig leans a few degrees, pinned at the soil line. */}
      <style>{`.motion-on .kf-lean { transition: transform 420ms var(--ease-out); transform-origin: 50% 100%; } .motion-on .kf-lean:hover { transform: rotate(3.5deg); }`}</style>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', borderBottom: '1px dashed var(--line-dashed)' }}>
        <img src="/ds/assets/clover/awake.png" alt="" className="kf-lean" style={{ height: 26, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)' }}>Chat</span>
        <button type="button" onClick={onClose} className="kf-hit" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--ink-faint)', fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13.5, color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 }}>
            Ask about anything you've captured — "what did I capture about the pricing project last week?"
          </p>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1
          if (m.role === 'user') {
            return (
              <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'var(--ink-body)', color: 'var(--paper-parchment)', borderRadius: '12px 12px 3px 12px', padding: '9px 13px', fontSize: 13, lineHeight: 1.45 }}>
                {m.content}
              </div>
            )
          }
          if (streaming && !m.content) {
            return (
              <div key={i} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--paper-bone)', borderRadius: '12px 12px 12px 3px', padding: '9px 13px' }}>
                <img src="/ds/assets/clover/awake.png" alt="" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-faint)', letterSpacing: '0.14em' }}>…</span>
              </div>
            )
          }
          return (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--paper-bone)', borderRadius: '12px 12px 12px 3px', padding: '9px 13px', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-body)' }}>
              <div>{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                  {m.citations.map((c) => (
                    <button
                      key={`${c.entity_type}-${c.entity_id}`}
                      type="button"
                      onClick={() => goToCitation(c)}
                      style={{
                        display: 'inline-block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--acc-clover-text)',
                        background: 'color-mix(in srgb, var(--acc-clover) 22%, transparent)',
                        border: 'none',
                        padding: '3px 8px',
                        borderRadius: 999,
                        cursor: 'pointer',
                      }}
                    >
                      ↗ {c.title}
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
        style={{ flex: 'none', padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your system…"
          disabled={busy}
          style={{
            flex: 1,
            fontFamily: 'var(--font-ui)',
            fontSize: 12.5,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--ink-body)',
            opacity: busy ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            border: 'none',
            background: 'var(--acc-clover)',
            color: 'var(--paper-parchment)',
            fontFamily: 'inherit',
            fontSize: 15,
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: busy || !input.trim() ? 'default' : 'pointer',
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          ↑
        </button>
      </form>
    </div>
  )
}
