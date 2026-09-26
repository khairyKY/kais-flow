import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { formatDuration, priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { captureText } from '../inbox/api'
import { captureWithAI } from '../capture/api'
import { hasStructure, parseCommand, stripPriorityAndDuration } from './parseCommand'
import { formatDueChip } from './dueChip'
import { useCommandBarStore } from './commandBarStore'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'

const CHIP_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '4px 9px',
  borderRadius: 999,
}

const PRIORITY_NAME: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium' }

// F3b (D-5 ruling, punch 59): Go-to lives inside ⌘K — type a view name, a jump row
// appears; ↓ selects it, ↵ navigates. Plain ↵ still quick-adds. Parked surfaces
// (Journal, Library) and dev routes are deliberately absent until they return.
const JUMP_VIEWS: { name: string; label: string; to: string }[] = [
  { name: 'today', label: 'Today', to: '/today' },
  { name: 'inbox', label: 'Inbox', to: '/inbox' },
  { name: 'tasks', label: 'Tasks', to: '/tasks' },
  { name: 'calendar', label: 'Calendar', to: '/calendar' },
  { name: 'projects', label: 'Projects', to: '/projects' },
  { name: 'routines', label: 'Routines', to: '/routines' },
  { name: 'review', label: 'Review', to: '/weekly-review' },
  { name: 'focus', label: 'Focus', to: '/focus' },
  { name: 'people', label: 'People', to: '/people' },
  { name: 'activity', label: 'Activity', to: '/activity' },
  { name: 'settings', label: 'Settings', to: '/settings' },
  { name: 'search', label: 'Search', to: '/search' },
  { name: 'herbarium', label: 'Herbarium', to: '/herbarium' },
  { name: 'perennials', label: 'Perennials', to: '/perennials' },
  { name: 'trash', label: 'Trash', to: '/trash' },
]

/** Unique-prefix match, ≥2 chars — "in" → Inbox, but "t" (today/tasks/trash) offers nothing. */
function matchJumpView(input: string): (typeof JUMP_VIEWS)[number] | null {
  const q = input.trim().toLowerCase()
  if (q.length < 2) return null
  const hits = JUMP_VIEWS.filter((v) => v.name.startsWith(q))
  return hits.length === 1 ? hits[0] : null
}

export function CommandBar() {
  const open = useCommandBarStore((s) => s.open)
  const setOpen = useCommandBarStore((s) => s.setOpen)
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [jumpSelected, setJumpSelected] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()

  useEffect(() => {
    function handlePrefill(e: Event) {
      const customEvent = e as CustomEvent<string>;
      setText(customEvent.detail || '')
    }
    window.addEventListener('prefill-command-bar', handlePrefill)
    return () => window.removeEventListener('prefill-command-bar', handlePrefill)
  }, [])

  useEscapeStack(open, () => setOpen(false))
  useBodyScrollLock(open)

  // ⌘K lives in AppLayout's hotkey effect (punch 5): this component is lazy and only
  // mounted while open, so it can't own the shortcut that opens it. Keeping a copy here
  // would ALSO double-fire while open — two toggles cancelling to a no-op.

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setText('')
      setJumpSelected(false)
    }
  }, [open])

  // T-4: "10am" means 10:00 in Cairo on any device — the zone every date in the app renders in.
  const parsed = useMemo(() => parseCommand(text, domains, projects, { zone: 'cairo' }), [text, domains, projects])
  const jumpView = useMemo(() => matchJumpView(text), [text])

  function jumpTo(view: NonNullable<ReturnType<typeof matchJumpView>>) {
    setOpen(false)
    navigate(view.to)
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    if (hasStructure(parsed)) {
      createTask({
        title: parsed.title || trimmed,
        domainId: parsed.domainId,
        projectId: parsed.projectId,
        dueAt: parsed.dueAt,
        durationMin: parsed.durationMin,
        priority: parsed.priority,
      })
    } else {
      captureText(trimmed)
    }
    setOpen(false)
  }

  function submitWithAI() {
    const trimmed = text.trim()
    if (!trimmed || aiBusy) return
    // Strip just the local `!`/`30m` tokens before the AI sees the text — date/#tag parsing
    // stays the AI's own job, so only these two get resolved client-side here.
    const { text: stripped, priority, durationMin } = stripPriorityAndDuration(trimmed)
    setAiBusy(true)
    setOpen(false)
    void captureWithAI(stripped || trimmed, 'text', null, { priority, durationMin }).finally(() => setAiBusy(false))
  }

  if (!open) return null

  const matchChip = parsed.projectMatch ?? parsed.domainMatch
  // Same condition `submit()`'s gate uses — this chip promises what Enter will actually do,
  // so a priority/duration-only command (which now creates a task directly) can't still say
  // "→ Inbox (unfiled)" underneath it.
  const unmatched = !hasStructure(parsed)

  return (
    <div
      className="kf-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 96 }}
      onClick={() => setOpen(false)}
    >
      {/* X2 Motion 3c — overlay card arrives with the scrim (kf classes, AppLayout shell CSS).
          X3 — translucent parchment via color-mix so the night paper-parchment shows through. */}
      <div
        className="kf-overlay-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          margin: '0 16px',
          background: 'color-mix(in srgb, var(--paper-parchment) 82%, transparent)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--line-card)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-popover)',
          padding: '16px 18px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line-dashed)', paddingBottom: 12 }}>
          <svg width="17" height="18" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
            <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="var(--acc-terra)" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="var(--acc-terra)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 17.5V21M8.5 21h7" stroke="var(--acc-terra)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setJumpSelected(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && jumpView) {
                e.preventDefault()
                setJumpSelected(true)
              } else if (e.key === 'ArrowUp' && jumpSelected) {
                e.preventDefault()
                setJumpSelected(false)
              } else if (e.key === 'Enter' && jumpSelected && jumpView) {
                e.preventDefault()
                jumpTo(jumpView)
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                submitWithAI()
              } else if (e.key === 'Enter') {
                submit()
              }
            }}
            placeholder="Send the quote tomorrow 3pm #shaheen"
            style={{
              flex: 1,
              fontFamily: 'var(--font-ui)',
              fontSize: 16,
              color: 'var(--ink-body)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
        </div>
        {jumpView && (
          <div
            onClick={() => jumpTo(jumpView)}
            onMouseEnter={() => setJumpSelected(true)}
            onMouseLeave={() => setJumpSelected(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              background: jumpSelected ? 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' : 'transparent',
              border: `1px solid ${jumpSelected ? 'var(--acc-lavender)' : 'var(--line-card)'}`,
            }}
          >
            <span style={{ ...CHIP_BASE, color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' }}>Jump</span>
            <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{jumpView.label}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>
              {jumpSelected ? '↵' : '↓ then ↵'}
            </span>
          </div>
        )}
        {text.trim() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
            {parsed.dueAt && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' }}>
                {formatDueChip(parsed.dueAt)}
              </span>
            )}
            {parsed.durationMin != null && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' }}>
                {formatDuration(parsed.durationMin)}
              </span>
            )}
            {parsed.priority != null && (() => {
              const color = priorityColor(parsed.priority) ?? 'var(--acc-terra)'
              // High's tint is the contract's literal rgba(201,165,90,0.22); other priorities fall back to a computed tint.
              const background = parsed.priority === 2 ? 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)' : `color-mix(in oklch, ${color} 20%, var(--paper-parchment))`
              return (
                <span style={{ ...CHIP_BASE, color, background }}>
                  {priorityFlag(parsed.priority)} {PRIORITY_NAME[parsed.priority]}
                </span>
              )
            })()}
            {matchChip && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)' }}>
                → {matchChip}
              </span>
            )}
            {unmatched && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-gold)', background: 'color-mix(in oklch, var(--acc-gold-warm) 18%, var(--paper-parchment))' }}>
                → Inbox (unfiled)
              </span>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Enter = quick add · ⌘Enter = AI capture
        </div>
      </div>
    </div>
  )
}
