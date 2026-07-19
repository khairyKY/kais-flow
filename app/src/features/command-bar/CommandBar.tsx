import { useEffect, useMemo, useRef, useState } from 'react'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { formatDuration, priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { captureText } from '../inbox/api'
import { captureWithAI } from '../capture/api'
import { hasStructure, parseCommand, stripPriorityAndDuration } from './parseCommand'
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

export function CommandBar() {
  const open = useCommandBarStore((s) => s.open)
  const setOpen = useCommandBarStore((s) => s.setOpen)
  const toggle = useCommandBarStore((s) => s.toggle)
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
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

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [toggle])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setText('')
  }, [open])

  const parsed = useMemo(() => parseCommand(text, domains, projects), [text, domains, projects])

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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                submitWithAI()
              } else if (e.key === 'Enter') {
                submit()
              }
            }}
            placeholder="Call Omar tomorrow 3pm #shaheen"
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
        {text.trim() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
            {parsed.dueAt && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-lavender-text)', background: 'rgba(168,160,190,0.22)' }}>
                {new Date(parsed.dueAt).toLocaleString()}
              </span>
            )}
            {parsed.durationMin != null && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'rgba(122,148,110,0.2)' }}>
                {formatDuration(parsed.durationMin)}
              </span>
            )}
            {parsed.priority != null && (() => {
              const color = priorityColor(parsed.priority) ?? 'var(--acc-terra)'
              // High's tint is the contract's literal rgba(201,165,90,0.22); other priorities fall back to a computed tint.
              const background = parsed.priority === 2 ? 'rgba(201,165,90,0.22)' : `color-mix(in oklch, ${color} 20%, var(--paper-parchment))`
              return (
                <span style={{ ...CHIP_BASE, color, background }}>
                  {priorityFlag(parsed.priority)} {PRIORITY_NAME[parsed.priority]}
                </span>
              )
            })()}
            {matchChip && (
              <span style={{ ...CHIP_BASE, color: 'var(--acc-sage-text)', background: 'rgba(122,148,110,0.2)' }}>
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
