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
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-white shadow-lg">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <button type="button" onClick={onClose} className="text-slate-500">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Ask about anything you've captured — "what did I capture about the pricing project last week?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[85%] rounded px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100'
              }`}
            >
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-start gap-1 text-xs">
                {m.citations.map((c) => (
                  <button
                    key={`${c.entity_type}-${c.entity_id}`}
                    type="button"
                    onClick={() => goToCitation(c)}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 underline"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your system…"
          className="w-full rounded border px-2 py-1 text-sm"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
