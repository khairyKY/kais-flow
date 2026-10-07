import { useEffect, useRef, useState } from 'react'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { EmojiText } from '../../components/EmojiText'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { SheetTitle } from '../../components/TimePicker'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { moveGroups, NO_PLACE, targetKey, type MoveGroup, type MoveTarget } from './move'

// "Move to…" (Kai 2026-10-07): one searchable list, grouped by domain — each domain itself, its
// areas, its projects — then "No domain", then None. Desktop: a popover (the ⋯ submenu, `p`, the
// bulk bar's Move). Phone: a sheet with the same rows, 52px tall. The rules are ./move.ts.

export interface MovePickerProps {
  position: { x: number; y: number }
  /** placeKey() of the one task being moved (its row gets the check); null in bulk. */
  current: string | null
  onPick: (to: MoveTarget) => void
  onClose: () => void
  /** The phone sheet's mono line under the title — the task's title. */
  meta?: string
  /** Phone: the search doubles as create — "+ Create project “x”" when nothing matches. */
  onCreate?: (name: string) => void
}

const KIND = { domain: 'Domain', area: 'Area', project: 'Project', none: 'Unfiled' } as const

function useGroups(query: string): { groups: MoveGroup[]; color: (t: MoveTarget) => string } {
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const { data: projects = [] } = useProjects()
  const color = (t: MoveTarget) => {
    const own = t.kind === 'area' ? areas.find((a) => a.id === t.id)?.color : t.kind === 'project' ? projects.find((p) => p.id === t.id)?.color : null
    const domainId = t.kind === 'domain' ? t.id : t.kind === 'none' ? null : t.domainId
    return own || domains.find((d) => d.id === domainId)?.color || 'var(--ink-hairline)'
  }
  return { groups: moveGroups(domains, areas, projects, query), color }
}

export function MovePicker(props: MovePickerProps) {
  return useIsMobile() ? <MoveSheet {...props} /> : <MovePopover {...props} />
}

const GROUP_TITLE: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }

function MoveSheet({ current, onPick, onClose, meta, onCreate }: MovePickerProps) {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const { groups, color } = useGroups(q)
  const first = groups[0]?.targets[0]
  return (
    <BottomSheet onClose={onClose} title={<SheetTitle title="Move to" meta={meta} />}>
      {(close) => {
        const pick = (t: MoveTarget) => {
          onPick(t)
          close()
        }
        const create = onCreate && q && !first ? () => { onCreate(q); close() } : undefined
        const row = (t: MoveTarget, indent: boolean) => {
          const on = current === targetKey(t)
          return (
            <button key={targetKey(t)} type="button" className={`kf-as-row${on ? ' kf-mp-current' : ''}`} aria-current={on || undefined} onClick={() => pick(t)} style={indent ? { paddingLeft: 36 } : undefined}>
              <span className="kf-as-icon" aria-hidden><span style={{ width: 8, height: 8, borderRadius: '50%', background: color(t) }} /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px', fontWeight: t.kind === 'domain' ? 600 : 400 }}><EmojiText text={t.name} /></span>
              <span className="kf-as-hint">{KIND[t.kind]}</span>
              {on && <Icon name="check" size={20} />}
            </button>
          )
        }
        return (
          <>
            <style>{`${ACTION_ROW_CSS}
              .kf-mp-search { display: flex; align-items: center; gap: 10px; height: 48px; margin-bottom: 8px; padding: 0 14px; border: 1px solid var(--line-control);
                border-radius: 8px; background: var(--paper-bone); color: var(--ink-muted); }
              .kf-mp-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font: inherit; font-size: 15px; color: var(--ink-body); }
              .kf-mp-search:focus-within { box-shadow: var(--focus-ring); }
              .kf-as-row.kf-mp-current { background: var(--block-sage); color: var(--acc-sage-text); font-weight: 600; }`}</style>
            <label className="kf-mp-search">
              <Icon name="search" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (first) pick(first)
                  else create?.()
                }}
                enterKeyHint="done"
                placeholder="Find a domain, area or project"
                aria-label="Search places"
              />
            </label>
            <div style={{ margin: '0 -20px' }}>
              {groups.map((g) => (
                <div key={g.key} role="group" aria-label={g.title}>
                  <div style={{ ...GROUP_TITLE, padding: '12px 20px 4px' }}>{g.title}</div>
                  {g.targets.map((t) => row(t, t.kind !== 'domain'))}
                </div>
              ))}
              {create && (
                <button type="button" className="kf-as-row" onClick={create}>
                  <span className="kf-as-icon" aria-hidden><Icon name="plus" size={24} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>Create project “{q}”</span>
                </button>
              )}
              <div style={{ marginTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>
                <button type="button" className={`kf-as-row${current === 'none' ? ' kf-mp-current' : ''}`} aria-current={current === 'none' || undefined} onClick={() => pick(NO_PLACE)}>
                  <span className="kf-as-icon" aria-hidden><Icon name="inbox" size={24} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>None</span>
                  <span className="kf-as-hint">no project, area or domain</span>
                  {current === 'none' && <Icon name="check" size={20} />}
                </button>
              </div>
            </div>
          </>
        )
      }}
    </BottomSheet>
  )
}

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: 13,
  color: 'var(--ink-body)', background: 'none', border: 'none', borderRadius: 5, padding: '7px 10px', cursor: 'pointer',
}

function MovePopover({ position, current, onPick, onClose }: MovePickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const { groups, color } = useGroups(query)
  useEscapeStack(true, onClose)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function choose(t: MoveTarget) {
    onPick(t)
    onClose()
  }
  const z = uiZoom() // visual -> layout px; see uiZoom()
  const height = 380
  const left = Math.min(position.x / z, window.innerWidth / z - 250)
  const top = Math.min(position.y / z, window.innerHeight / z - 12 - height)
  const item = (t: MoveTarget, indent: boolean) => {
    const on = current === targetKey(t)
    return (
      <button
        key={targetKey(t)}
        type="button"
        role="menuitem"
        onClick={() => choose(t)}
        disabled={on}
        aria-current={on || undefined}
        style={{ ...ITEM, paddingLeft: indent ? 24 : 10, fontWeight: t.kind === 'domain' ? 600 : 400, background: on ? 'var(--paper-bone)' : 'none', cursor: on ? 'default' : 'pointer' }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--paper-bone)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = on ? 'var(--paper-bone)' : 'none' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color(t), flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><EmojiText text={t.name} /></span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)', flex: 'none' }}>{on ? '✓' : KIND[t.kind]}</span>
      </button>
    )
  }
  const first = groups[0]?.targets[0]
  return (
    <Float>
      <div
        ref={ref}
        role="menu"
        aria-label="Move to"
        className="kf-overlay-card"
        style={{ position: 'fixed', top: Math.max(12, top), left: Math.max(8, left), zIndex: 1000, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', boxShadow: 'var(--shadow-popover)', borderRadius: 5, padding: 6, width: 240, maxHeight: height, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '7px 10px', margin: '2px 2px 6px' }}>
          <span style={{ color: 'var(--ink-hairline)', fontSize: 12, flex: 'none' }}>⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && first) { e.preventDefault(); choose(first) } }}
            placeholder="Move to…"
            aria-label="Search places"
            style={{ flex: 1, width: '100%', fontFamily: 'var(--font-ui)', fontSize: 12.5, background: 'none', border: 'none', color: 'var(--ink-body)', outline: 'none' }}
          />
        </div>
        <div style={{ overflowY: 'auto' }}>
          {groups.length === 0 && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Nothing by that name</div>}
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.title}>
              <div style={{ ...GROUP_TITLE, padding: '8px 10px 3px' }}>{g.title}</div>
              {g.targets.map((t) => item(t, t.kind !== 'domain'))}
            </div>
          ))}
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>
            {item(NO_PLACE, false)}
          </div>
        </div>
      </div>
    </Float>
  )
}
