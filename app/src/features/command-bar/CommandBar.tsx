import { useEffect, useMemo, useRef, useState } from 'react'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { captureText } from '../inbox/api'
import { captureWithAI } from '../capture/api'
import { parseCommand } from './parseCommand'

export function CommandBar() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setText('')
  }, [open])

  const parsed = useMemo(() => parseCommand(text, domains, projects), [text, domains, projects])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    if (parsed.dueAt || parsed.domainId || parsed.projectId) {
      createTask({
        title: parsed.title || trimmed,
        domainId: parsed.domainId,
        projectId: parsed.projectId,
        dueAt: parsed.dueAt,
      })
    } else {
      captureText(trimmed)
    }
    setOpen(false)
  }

  function submitWithAI() {
    const trimmed = text.trim()
    if (!trimmed || aiBusy) return
    setAiBusy(true)
    setOpen(false)
    void captureWithAI(trimmed, 'text').finally(() => setAiBusy(false))
  }

  if (!open) return null

  const matchChip = parsed.projectMatch ?? parsed.domainMatch
  const unmatched = !parsed.dueAt && !parsed.domainId && !parsed.projectId

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
