import { useEffect, useMemo, useRef, useState } from 'react'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { formatDuration, priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { captureText } from '../inbox/api'
import { captureWithAI } from '../capture/api'
import { hasStructure, parseCommand, stripPriorityAndDuration } from './parseCommand'
import { useCommandBarStore } from './commandBarStore'
import { useEscapeStack } from '../../lib/overlayStack'

const CHIP_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  padding: '4px 10px',
  borderRadius: 999,
}

export function CommandBar() {
  const open = useCommandBarStore((s) => s.open)
  const setOpen = useCommandBarStore((s) => s.setOpen)
  const toggle = useCommandBarStore((s) => s.toggle)
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()

  useEscapeStack(open, () => setOpen(false))

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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          margin: '0 16px',
          background: 'rgba(251,246,233,0.78)',
          backdropFilter: 'blur(9px)',
          border: '1px solid rgba(224,216,194,0.9)',
          borderRadius: 16,
          boxShadow: '0 2px 4px rgba(40,32,20,0.15), 0 30px 70px rgba(40,32,20,0.35)',
          padding: '22px 24px 18px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src="assets/fern/unfurl2.png"
          alt=""
          style={{ position: 'absolute', right: -14, bottom: -22, height: 150, width: 'auto', opacity: 0.1, transform: 'rotate(8deg)', pointerEvents: 'none' }}
        />

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Command bar · ⌘K
        </div>

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
            width: '100%',
            fontFamily: 'var(--font-display)',
            fontSize: 21,
            color: 'var(--text-primary)',
            background: 'transparent',
            border: 'none',
            borderBottom: '1.5px solid var(--line-sidebar)',
            paddingBottom: 12,
            outline: 'none',
          }}
        />
        {text.trim() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {parsed.dueAt && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--acc-lavender-text)',
                  background: 'rgba(168,160,190,0.2)',
                  border: '1px solid rgba(168,160,190,0.55)',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}
              >
                {new Date(parsed.dueAt).toLocaleString()}
              </span>
            )}
            {parsed.durationMin != null && (
              <span style={{ ...CHIP_BASE, color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
                {formatDuration(parsed.durationMin)}
              </span>
            )}
            {parsed.priority != null && (() => {
              const color = priorityColor(parsed.priority) ?? 'var(--acc-terra)'
              return (
                <span style={{ ...CHIP_BASE, color, background: `color-mix(in oklch, ${color} 12%, var(--paper-parchment))`, border: `1px solid ${color}`, fontWeight: 600 }}>
                  {priorityFlag(parsed.priority)} priority
                </span>
              )
            })()}
            {matchChip && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--acc-sage-text)',
                  background: 'rgba(138,154,126,0.2)',
                  border: '1px solid rgba(138,154,126,0.55)',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}
              >
                → {matchChip}
              </span>
            )}
            {unmatched && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--acc-gold)',
                  background: 'color-mix(in oklch, var(--acc-gold-warm) 18%, var(--paper-parchment))',
                  border: '1px solid var(--acc-gold-warm)',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}
              >
                → Inbox (unfiled)
              </span>
            )}
            {matchChip && <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--text-secondary)', marginLeft: 4, transform: 'rotate(-1deg)', display: 'inline-block' }}>it knows where this goes</span>}
          </div>
        )}

        <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
          Enter = quick add · Ctrl+Enter = AI capture
        </div>
      </div>
    </div>
  )
}
