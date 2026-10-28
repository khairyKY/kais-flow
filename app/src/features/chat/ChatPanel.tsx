import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { runChatCalls, streamChat, type ChatOutcome, type ChatRestore } from './api'
import { SEND, loadChat, saveChat, type DisplayMessage, type PlanState } from './history'
import { historyText, outcomeHeader, outcomeLine, planHeader, planLines } from './planCard'
import { inlineParts, parseMarkdown } from './markdown'
import { queryClient } from '../../lib/queryClient'
import { useHour24 } from '../../lib/clock'
import { writeRow } from '../../lib/outbox'
import { useAuth } from '../auth/AuthProvider'
import { appendDictation } from '../capture/holdToTalk'
import { toastUndo } from '../../lib/undo'
import { useOpenSearchHit } from '../search/api'
import { AI_ALLOWANCE_USED_UP } from '../capture/aiAllowance'
import { useBodyScrollLock, useEscapeStack } from '../../lib/overlayStack'
import type { Citation } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { takeChatStarter } from '../widgets/native'
import type { IconName } from '../../components/icons/kf'
import { scrollBehavior } from '../../lib/motion'
import '../projects/xfx.css' // .kf-row-in (T11)
import './chat.css'

// The voice sheet (and its recorder) loads only when the mic is used.
const VoiceCaptureSheet = lazy(() => import('../capture/VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

/** **bold**, *italics*, `code` as elements (./markdown inlineParts) — text only, never HTML. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) => (p.t === 'b' ? <strong key={i}>{p.s}</strong> : p.t === 'i' ? <em key={i}>{p.s}</em> : p.t === 'code' ? <code key={i}>{p.s}</code> : p.s))}
    </>
  )
}

/** A reply as real paragraphs, lists and tables (queue item 5: it printed raw pipes). */
function Markdown({ text }: { text: string }) {
  return (
    <div className="kf-md">
      {parseMarkdown(text).map((b, i) => {
        if (b.type === 'h') return <p key={i} className="kf-md-h"><Inline text={b.text} /></p>
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type
          return <List key={i}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</List>
        }
        if (b.type === 'table') {
          return (
            <div key={i} className="kf-md-table">
              <table>
                <thead><tr>{b.head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline text={l} /></span>)}</p>
      })}
    </div>
  )
}

/** After a run or an Undo: the lists and the calendar read the server again (realtime may lag). */
function refreshData() {
  for (const key of ['tasks', 'calendar_events', 'inbox_items']) void queryClient.invalidateQueries({ queryKey: [key] })
}

function longPressMs(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-longpress')) || 400
}

const STARTERS: [IconName, string][] = [
  ['sprout', 'What’s on today?'],
  ['delete', 'What should I drop?'],
  ['tomorrow', 'How do I move a task to tomorrow?'],
]

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useAuth().session?.user.id
  // A28: the conversation stays (this device, this account) until Clear.
  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadChat(uid))
  const [input, setInput] = useState('')
  // The Ask widget's chip and the block menu's Work with AI › type a question in (not sent). Taken once the panel
  // is on screen: a first render thrown away (the lazy chunk's Suspense) used to take it with it — an empty field.
  useEffect(() => {
    const starter = takeChatStarter()
    if (starter) setInput(starter)
  }, [])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const openHit = useOpenSearchHit()
  /** The mic's voice sheet; `release` = the finger lifted after a hold, so the take ends and sends. */
  const [voice, setVoice] = useState<{ release: boolean } | null>(null)
  const pressedAt = useRef(0)
  /** Cards whose Undo already ran (the toast's and the card's button share it). */
  const undone = useRef(new Set<number>())
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const h24 = useHour24()
  useEffect(() => saveChat(uid, messages), [uid, messages])

  // R6: the list follows the conversation. It opens at the bottom; a send pins it there (smooth with
  // Effects on); a streaming reply is followed only while you're at the bottom — scrolled up to read,
  // a "↓ new" pill says something arrived instead of yanking the page.
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const gliding = useRef(false)
  const [behind, setBehind] = useState(false)
  const seenCount = useRef(messages.length)
  // T11: only bubbles that arrive while the drawer is open breathe in (a reopened history doesn't).
  const firstFresh = useRef(messages.length)
  if (messages.length === 0) firstFresh.current = 0
  const toBottom = (smooth: boolean) => {
    const el = listRef.current
    if (!el) return
    pinned.current = true
    setBehind(false)
    if (smooth && scrollBehavior() === 'smooth') {
      gliding.current = true
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      window.setTimeout(() => (gliding.current = false), 700)
    } else el.scrollTop = el.scrollHeight
  }
  useLayoutEffect(() => {
    const el = listRef.current
    const sent = messages.length > seenCount.current && messages.some((m, i) => i >= seenCount.current && m.role === 'user')
    seenCount.current = messages.length
    if (!el) return
    if (sent) toBottom(true)
    else if (pinned.current) {
      if (!gliding.current) el.scrollTop = el.scrollHeight
    } else if (el.scrollHeight > el.clientHeight) setBehind(true)
  }, [messages])
  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
    if (gliding.current) {
      if (atEnd) gliding.current = false
      return
    }
    pinned.current = atEnd
    if (atEnd) setBehind(false)
  }
  useBodyScrollLock(open)
  useEscapeStack(open, onClose) // F3 (punch 12): Esc closes the ⌘J drawer like every other overlay

  if (!open) return null

  /** A card's next state, and what the model will read back about it. */
  function setCard(index: number, state: PlanState, extra: Partial<DisplayMessage> = {}) {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== index || !m.plan) return m
        const previews = m.plan.previews
        const lines = extra.outcomes ? extra.outcomes.map((o, j) => outcomeLine(o, h24, previews[j])) : planLines(m.plan.calls, previews, h24)
        const said = state === 'done' ? (extra.undone ? 'undone' : 'done') : state === 'running' ? 'pending' : state
        return { ...m, ...extra, plan: { ...m.plan, state }, content: extra.content ?? historyText(said, lines) }
      }),
    )
  }

  async function confirm(index: number) {
    const card = messages[index]?.plan
    if (!card || card.state !== 'pending') return
    setCard(index, 'running')
    let outcomes: ChatOutcome[]
    let restore: ChatRestore
    try {
      ;({ results: outcomes, restore } = await runChatCalls(card.calls))
    } catch {
      // Honest: the request failed, so nothing can be said about what ran.
      setCard(index, 'done', { outcomes: [], content: "The app couldn't hear back, so it can't say what changed — check before trying again." })
      return
    } finally {
      refreshData()
    }
    const undoable = restore.put.length + restore.drop.length > 0
    setCard(index, 'done', { outcomes, restore: undoable ? restore : undefined })
    if (undoable) toastUndo(outcomeHeader(outcomes), () => undo(index, outcomes, restore))
  }

  /** The whole confirmed batch back as it was — once (the toast's Undo and the card's share it): every
   * row it changed written back, every row it made removed, through the outbox like every app Undo. */
  function undo(index: number, outcomes = messages[index]?.outcomes ?? [], restore = messages[index]?.restore) {
    if (!restore || undone.current.has(index)) return
    undone.current.add(index)
    for (const { table, row } of restore.put) writeRow(table, row)
    for (const { table, id } of restore.drop) writeRow(table, { id }, 'delete')
    setCard(index, 'done', { outcomes, restore: undefined, undone: true })
  }

  function cancel(index: number) {
    setCard(index, 'cancelled')
  }

  function edit(index: number) {
    setCard(index, 'editing')
    setEditing(true)
    inputRef.current?.focus()
  }

  function updateLast(patch: Partial<DisplayMessage>) {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      copy[copy.length - 1] = { ...last, ...patch, content: patch.content ?? last.content }
      return copy
    })
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim()
    if (!text || busy) return
    if (preset == null) setInput('')
    // A card still waiting is superseded by whatever is said next: it can no longer be confirmed.
    const prior = messages.map((m) =>
      m.plan?.state === 'pending' ? { ...m, plan: { ...m.plan, state: 'editing' as const }, content: historyText('editing', planLines(m.plan.calls, m.plan.previews, h24)) } : m,
    )
    const history: DisplayMessage[] = [...prior, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    setEditing(false)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat(
        history.slice(-SEND).map((m) => ({ role: m.role, content: m.content })),
        {
          onDelta: (delta) => {
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, content: last.content + delta }
              return copy
            })
          },
          // A plan arrives as a card (queue item 5): nothing has changed until Confirm.
          onDone: (citations, plan) =>
            plan?.calls.length
              ? updateLast({ citations: [], plan: { ...plan, state: 'pending' }, content: historyText('pending', planLines(plan.calls, plan.previews, h24)) })
              : updateLast({ citations }),
          // X5 States rule — the word "error" never appears; calm copy, no raw message. SEC-2: a
          // used-up daily AI allowance says so plainly instead of inviting a retry.
          onError: (_message, reason) =>
            updateLast({
              content:
                reason === 'daily_limit'
                  ? AI_ALLOWANCE_USED_UP
                  : reason === 'busy'
                    ? 'The AI is catching its breath — try again in a minute.'
                    : 'That one got lost on the breeze — try asking again.',
            }),
        },
        controller.signal,
      )
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    const prior = messages
    setMessages([])
    toastUndo('Chat cleared', () => {
      saveChat(uid, prior) // the panel may be closed by now
      setMessages(prior)
    })
  }

  /** The words heard become the message (after anything already typed), sent at once. */
  function askHeard(heard: string) {
    const text = appendDictation(input, heard)
    setInput('')
    void send(text)
  }

  function goToCitation(c: Citation) {
    onClose()
    openHit(c) // a citation is a search hit: the same destination (search/api.ts)
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
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', borderBottom: '1px solid var(--line-dashed)' }}>
        <img src="/ds/assets/clover/awake.png" alt="" className="kf-lean" style={{ height: 26, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)' }}>Chat</span>
        {messages.length > 0 && !busy && (
          <button type="button" className="kf-chat-clear" onClick={clear}>
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} className="kf-hit" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--ink-faint)', fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
          ✕
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div ref={listRef} onScroll={onListScroll} className="kf-chat-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          // Tour & help 14l: the empty chat offers three starters — two about the day, one about the
          // app. A tap sends it.
          <div className="kf-chat-empty">
            <img src="/ds/assets/clover/awake.png" alt="" />
            <div className="kf-chat-empty-line">Ask anything about your day.</div>
            <div className="kf-chat-empty-sub">It knows your tasks, calendar and routines.</div>
            <div className="kf-chat-empty-label">Try one</div>
            {STARTERS.map(([icon, q]) => (
              <button key={q} type="button" className="kf-chat-starter" onClick={() => void send(q)}>
                <Icon name={icon} size={18} />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1
          const arrive = i >= firstFresh.current ? 'kf-row-in' : undefined
          if (m.role === 'user') {
            return (
              <div key={i} className={arrive} style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'var(--ink-body)', color: 'var(--paper-parchment)', borderRadius: '12px 12px 3px 12px', padding: '9px 13px', fontSize: 13, lineHeight: 1.45 }}>{/* ds-ok: the bubble's look as it was; only its arrival (kf-row-in) is new */}
                {m.content}
              </div>
            )
          }
          if (streaming && !m.content) {
            return (
              <div key={i} className={arrive} aria-label="Thinking" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--paper-bone)', borderRadius: '12px 12px 12px 3px', padding: '9px 13px' }}>{/* ds-ok: the bubble's look as it was; only its arrival (kf-row-in) is new */}
                <img src="/ds/assets/clover/awake.png" alt="" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />
                {/* R7: three dots that twinkle in turn (Effects on); still, they read as "…" */}
                <span className="kf-chat-dots" aria-hidden><i /><i /><i /></span>
              </div>
            )
          }
          if (m.plan) {
            const { state, calls, previews } = m.plan
            const ran = state === 'done' ? m.outcomes : undefined
            const undoable = !!ran && !m.undone && !!m.restore
            return (
              <div key={i} className={`kf-chat-card${arrive ? ` ${arrive}` : ''}`} data-state={state} aria-live="polite">
                {/* R7: a state change cross-fades the card's contents (keyed on the state) */}
                <div key={`${state}${m.undone ? '-undone' : ''}`} className="kf-chat-card-body">
                <div className="kf-chat-card-head">{m.undone ? 'Undone — back as it was' : ran ? (ran.length ? outcomeHeader(ran) : 'Not sure what changed') : planHeader(calls, previews)}</div>
                <ul className={`kf-chat-card-lines${m.undone ? ' is-undone' : ''}`}>
                  {ran
                    ? ran.map((o, j) => <li key={j} className={o.ok ? undefined : 'is-refused'}>{outcomeLine(o, h24, previews[j])}</li>)
                    : planLines(calls, previews, h24).map((l, j) => <li key={j}>{l}</li>)}
                </ul>
                {ran && !ran.length && <div className="kf-chat-card-note">{m.content}</div>}
                {state === 'pending' && (
                  <div className="kf-chat-card-actions">
                    <button type="button" className="kf-chat-card-btn is-primary" onClick={() => void confirm(i)}>Confirm</button>
                    <button type="button" className="kf-chat-card-btn" onClick={() => edit(i)}>Edit</button>
                    <button type="button" className="kf-chat-card-btn" onClick={() => cancel(i)}>Cancel</button>
                  </div>
                )}
                {state === 'running' && <div className="kf-chat-card-note">Working on it…</div>}
                {state === 'cancelled' && <div className="kf-chat-card-note">Cancelled — nothing changed.</div>}
                {state === 'editing' && <div className="kf-chat-card-note">Not done — tell me what to change.</div>}
                {undoable && (
                  <div className="kf-chat-card-actions">
                    <button type="button" className="kf-chat-card-btn" onClick={() => undo(i)}>
                      Undo
                    </button>
                  </div>
                )}
                {m.undone && <div className="kf-chat-card-note">Every change in this batch was put back.</div>}
                </div>
              </div>
            )
          }
          return (
            <div key={i} className={arrive} style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--paper-bone)', borderRadius: '12px 12px 12px 3px', padding: '9px 13px', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-body)' }}>{/* ds-ok: the bubble's look as it was; only its arrival (kf-row-in) is new */}
              <Markdown text={m.content} />
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
                        fontSize: 'var(--fs-meta)',
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
      {behind && (
        <button type="button" className="kf-chat-new" onClick={() => toBottom(true)}>
          ↓ New
        </button>
      )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        style={{ flex: 'none', padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={editing ? 'What should change?' : 'Ask about your day…'}
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
        {/* A28: the mic — tap to talk (the sheet's Stop & send), or hold while you speak and let go. */}
        <button
          type="button"
          className="kf-chat-mic"
          aria-label="Talk — tap, or hold while you speak"
          title="Talk — tap, or hold while you speak"
          disabled={busy}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            pressedAt.current = Date.now()
            setVoice({ release: false })
          }}
          onPointerUp={() => {
            if (Date.now() - pressedAt.current >= longPressMs()) setVoice((v) => v && { release: true })
          }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.detail === 0) setVoice({ release: false }) // Enter / Space: the tap path
          }}
        >
          <Icon name="mic" size={16} />
        </button>
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
      {voice && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet open release={voice.release} onText={askHeard} stopLabel="Stop & send" onClose={() => setVoice(null)} />
        </Suspense>
      )}
    </div>
  )
}
