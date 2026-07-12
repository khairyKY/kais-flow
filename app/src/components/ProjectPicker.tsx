import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
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
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  width: '100%',
  textAlign: 'left' as const,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--text-primary)',
  background: 'none',
  border: 'none',
  padding: '6px 16px',
  cursor: 'pointer',
}

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
  const maxY = window.innerHeight - 12
  const left = Math.min(position.x, window.innerWidth - 220)
  const top = Math.min(position.y, maxY - Math.min(rows, 8) * itemHeight - 38)

  function choose(project: Project | null) {
    onSelect(project?.id ?? null, project?.domain_id ?? null)
    onClose()
  }

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        top: Math.max(12, top),
        left: Math.max(8, left),
        zIndex: 1000,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 'var(--radius-sharp)',
        padding: '4px 0',
        minWidth: 210,
        maxHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        transform: 'rotate(-0.3deg)',
      }}
    >
      <div style={{ padding: '4px 10px 6px' }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); choose(filtered[0]) }
          }}
          placeholder="Search projects…"
          style={{
            width: '100%',
            fontFamily: 'var(--font-ui)',
            fontSize: 12.5,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-input)',
            padding: '5px 8px',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto' }}>
      <button
        type="button"
        onClick={() => choose(null)}
        disabled={!currentProjectId}
        style={{ ...itemStyle, opacity: currentProjectId ? 1 : 0.4, cursor: currentProjectId ? 'pointer' : 'default' }}
        onMouseEnter={(e) => { if (currentProjectId) e.currentTarget.style.background = 'var(--bg-input)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span>No project</span>
      </button>
      <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
      {filtered.length === 0 && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No matching projects</div>
      )}
      {filtered.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => choose(p)}
          disabled={p.id === currentProjectId}
          style={{ ...itemStyle, opacity: p.id === currentProjectId ? 0.4 : 1, cursor: p.id === currentProjectId ? 'default' : 'pointer' }}
          onMouseEnter={(e) => { if (p.id !== currentProjectId) e.currentTarget.style.background = 'var(--bg-input)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-tertiary)' }}>{domains.find((d) => d.id === p.domain_id)?.name ?? ''}</span>
        </button>
      ))}
      </div>
    </div>
  )
}
