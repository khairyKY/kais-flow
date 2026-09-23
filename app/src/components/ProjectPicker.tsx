import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { EmojiText } from './EmojiText'
import { Float } from './Float'
import type { Domain, Project } from '../lib/types'

export interface ProjectPickerProps {
  position: { x: number; y: number }
  projects: Project[]
  domains: Domain[]
  currentProjectId: string | null
  onSelect: (projectId: string | null, domainId: string | null) => void
  onClose: () => void
}

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  width: '100%',
  textAlign: 'left' as const,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--ink-body)',
  background: 'none',
  border: 'none',
  borderRadius: 5,
  padding: '7px 10px',
  cursor: 'pointer',
}

const checkSvg = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flex: 'none' }}>
    <path d="M4 12.5l5 5L20 6" stroke="var(--acc-terra)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Keyboard-triggered `p` popover — the mouse path (row context menu's flat "Move to X" list) stays as-is. */
export function ProjectPicker({ position, projects, domains, currentProjectId, onSelect, onClose }: ProjectPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')

  useEscapeStack(true, onClose)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const filtered = query.trim() ? projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())) : projects

  const rows = filtered.length + 1
  const itemHeight = 34
  const z = uiZoom() // visual->layout px; see uiZoom()
  const maxY = window.innerHeight / z - 12
  const left = Math.min(position.x / z, window.innerWidth / z - 220)
  const top = Math.min(position.y / z, maxY - Math.min(rows, 8) * itemHeight - 38)

  function choose(project: Project | null) {
    onSelect(project?.id ?? null, project?.domain_id ?? null)
    onClose()
  }

  return (
    <Float>
    <div
      ref={ref}
      role="menu"
      className="kf-overlay-card"
      style={{
        position: 'fixed',
        top: Math.max(12, top),
        left: Math.max(8, left),
        zIndex: 1000,
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 5,
        padding: 6,
        minWidth: 214,
        maxHeight: 320,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '7px 10px', margin: '2px 2px 6px' }}>
        <span style={{ color: 'var(--ink-hairline)', fontSize: 12, flex: 'none' }}>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); choose(filtered[0]) }
          }}
          placeholder="Find project…"
          style={{
            flex: 1,
            width: '100%',
            fontFamily: 'var(--font-ui)',
            fontSize: 12.5,
            background: 'none',
            border: 'none',
            color: 'var(--ink-body)',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto' }}>
      {filtered.length === 0 && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No matching projects</div>
      )}
      {filtered.map((p) => {
        const isCurrent = p.id === currentProjectId
        const dot = domains.find((d) => d.id === p.domain_id)?.color ?? 'var(--ink-hairline)'
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(p)}
            disabled={isCurrent}
            style={{ ...itemStyle, background: isCurrent ? 'var(--paper-bone)' : 'none', cursor: isCurrent ? 'default' : 'pointer' }}
            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--paper-bone)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'var(--paper-bone)' : 'none' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: 'none' }} />
            <span style={{ flex: 1 }}><EmojiText text={p.name} /></span>
            {isCurrent && checkSvg}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => choose(null)}
        disabled={!currentProjectId}
        style={{ ...itemStyle, color: 'var(--ink-muted)', background: currentProjectId ? 'none' : 'var(--paper-bone)', cursor: currentProjectId ? 'pointer' : 'default' }}
        onMouseEnter={(e) => { if (currentProjectId) e.currentTarget.style.background = 'var(--paper-bone)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = currentProjectId ? 'none' : 'var(--paper-bone)' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid var(--ink-hairline)', flex: 'none' }} />
        <span style={{ flex: 1 }}>(none)</span>
        {!currentProjectId && checkSvg}
      </button>
      </div>
    </div>
    </Float>
  )
}
