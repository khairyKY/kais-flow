import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { ACTION_ROW_CSS } from './ActionSheet'
import { BottomSheet, useIsMobile } from './BottomSheet'
import { EmojiText } from './EmojiText'
import { Float } from './Float'
import { Icon } from './Icon'
import { SheetTitle } from './TimePicker'
import type { Domain, Project } from '../lib/types'

export interface ProjectPickerProps {
  position: { x: number; y: number }
  projects: Project[]
  domains: Domain[]
  currentProjectId: string | null
  onSelect: (projectId: string | null, domainId: string | null) => void
  onClose: () => void
  /** The phone sheet's mono line under "Project" — the task's title. */
  meta?: string
  /** Phone: the search doubles as create — "+ Create “x”" when nothing matches. */
  onCreate?: (name: string) => void
}

/** Desktop: the popover under a row or the `p` key. Phone: Task Sheet 4d — a sheet with its own scrim. */
export function ProjectPicker(props: ProjectPickerProps) {
  return useIsMobile() ? <ProjectSheet {...props} /> : <ProjectPopover {...props} />
}

// ── Task Sheet 4d: title "Project" + the task's title · a search field that doubles as create · rows
// (the project's hue as a dot, its domain on the right, a check on the current one) · "No project" under
// a dashed rule (the chip's Remove). Tapping a row applies it and closes; there is no Done. ──
function ProjectSheet({ projects, domains, currentProjectId, onSelect, onClose, meta, onCreate }: ProjectPickerProps) {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : projects
  return (
    <BottomSheet onClose={onClose} title={<SheetTitle title="Project" meta={meta} />}>
      {(close) => {
        const pick = (id: string | null, domainId: string | null) => {
          onSelect(id, domainId)
          close()
        }
        const create = onCreate && q && filtered.length === 0 ? () => { onCreate(q); close() } : undefined
        const row = (key: string, icon: ReactNode, label: ReactNode, hint: string | undefined, current: boolean, run: () => void) => (
          <button key={key} type="button" className={`kf-as-row${current ? ' kf-pp-current' : ''}`} aria-current={current || undefined} onClick={run}>
            <span className="kf-as-icon" aria-hidden>{icon}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px' }}>{label}</span>
            {hint && <span className="kf-as-hint">{hint}</span>}
            {current && <Icon name="check" size={20} />}
          </button>
        )
        return (
          <>
            <style>{`${ACTION_ROW_CSS}
              .kf-pp-search { display: flex; align-items: center; gap: 10px; height: 48px; margin-bottom: 8px; padding: 0 14px; border: 1px solid var(--line-control);
                border-radius: 8px; background: var(--paper-bone); color: var(--ink-muted); }
              .kf-pp-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font: inherit; font-size: 15px; color: var(--ink-body); }
              .kf-pp-search:focus-within { box-shadow: var(--focus-ring); }
              .kf-as-row.kf-pp-current { background: var(--block-sage); color: var(--acc-sage-text); font-weight: 600; }`}</style>
            <label className="kf-pp-search">
              <Icon name="search" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (filtered[0]) pick(filtered[0].id, filtered[0].domain_id ?? null)
                  else create?.()
                }}
                enterKeyHint="done"
                placeholder={onCreate ? 'Search or create a project' : 'Find project…'}
                aria-label="Search projects"
              />
            </label>
            <div style={{ margin: '0 -20px' }}>
              {filtered.map((p) => {
                const domain = domains.find((d) => d.id === p.domain_id)
                const dot = <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || domain?.color || 'var(--ink-hairline)' }} />
                return row(p.id, dot, <EmojiText text={p.name} />, domain?.name, p.id === currentProjectId, () => pick(p.id, p.domain_id ?? null))
              })}
              {create && row('create', <Icon name="plus" size={24} />, `Create “${q}”`, undefined, false, create)}
              <div style={{ marginTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>
                {row('none', <Icon name="inbox" size={24} />, 'No project', 'Inbox', !currentProjectId, () => pick(null, null))}
              </div>
            </div>
          </>
        )
      }}
    </BottomSheet>
  )
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
function ProjectPopover({ position, projects, domains, currentProjectId, onSelect, onClose }: ProjectPickerProps) {
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
