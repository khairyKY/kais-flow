import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { ContextMenu } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { RenameField } from '../../components/RenameField'
import { useTasks } from '../tasks/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { deleteSmartListWithUndo, moveSmartList, openCount, saveSmartList, smartTasks, useSmartLists } from './api'
import type { SmartListRow } from '../../lib/types'

// The sidebar's smart lists, under Plan's fixed lists: each with its open count, like Due Today.
// ⋯ or right-click → Edit… · Rename · Move up / down · Delete (an Undo toast, no confirm).
// The editor is its own chunk — it loads the first time it opens.
const SmartListEditor = lazy(() => import('./SmartListEditor').then((m) => ({ default: m.SmartListEditor })))

// The Plan drawer's row look (AppLayout PlanDrawer `row`), plus room on the right for the ⋯.
const rowStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '6px 11px',
  borderRadius: 'var(--radius-input)',
  textDecoration: 'none',
  background: active ? 'var(--frost-bg, var(--paper-parchment))' : 'none',
  border: active ? '1px solid var(--frost-line, var(--line-card))' : '1px solid transparent',
})
// ds-ok: 13px, the Plan drawer's fixed rows (AppLayout PlanDrawer `row`) — the same size, not a token's
const LABEL = (active: boolean): CSSProperties => ({ fontSize: 13, color: active ? 'var(--ink-body)' : 'var(--ink-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
const COUNT: CSSProperties = { marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }
const CSS = `.kf-sl-row { position: relative; }
.kf-sl-more { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; padding: 0; border: none; border-radius: 6px;
  background: var(--paper-sidebar); color: var(--ink-faint); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; }
.kf-sl-row:hover .kf-sl-more, .kf-sl-more:focus-visible, .kf-sl-more[aria-expanded="true"] { opacity: 1; }
.kf-sl-more:hover { color: var(--ink-body); }
@media (hover: none), (pointer: coarse) { .kf-sl-more { opacity: 1; } }`

export function SmartListNav({ activeList }: { activeList: string | null }) {
  const { data: lists = [] } = useSmartLists()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [editing, setEditing] = useState<SmartListRow | 'new' | null>(null)
  // The sidebar's Plan header has the + (AppLayout): it opens the editor here.
  useEffect(() => {
    const open = () => setEditing('new')
    window.addEventListener('kf-new-smart-list', open)
    return () => window.removeEventListener('kf-new-smart-list', open)
  }, [])
  const now = new Date()
  const current = menu && lists.find((l) => l.id === menu.id)

  return (
    <>
      <style>{CSS}</style>
      {lists.length > 0 && <div style={{ height: 1, borderTop: '1px solid var(--line-sidebar)', margin: '4px 11px' }} />}
      {lists.map((l) => {
        const active = activeList === l.id
        const icon = <span style={{ width: 16, flex: 'none', display: 'flex', justifyContent: 'center', fontSize: 'var(--fs-badge)' }}>{l.icon}</span>
        return (
          <div
            key={l.id}
            className="kf-sl-row"
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ id: l.id, at: { x: e.clientX, y: e.clientY } })
            }}
          >
            {renaming === l.id ? (
              <div style={rowStyle(active)}>
                {icon}
                <RenameField value={l.name} ariaLabel="Smart list name" style={{ fontSize: LABEL(false).fontSize }} onDone={(next) => { setRenaming(null); if (next && next !== l.name) saveSmartList(l, { name: next.slice(0, 80) }) }} />
              </div>
            ) : (
              <Link to={`/tasks?list=${l.id}`} className={`kf-side-row${active ? ' kf-active' : ''}`} style={rowStyle(active)}>
                {icon}
                <span style={LABEL(active)}><EmojiText text={l.name} /></span>
                <span style={COUNT}>{openCount(smartTasks(tasks, l.filter, projects, areas, now))}</span>
              </Link>
            )}
            {renaming !== l.id && (
              <button
                type="button"
                className="kf-sl-more"
                aria-label={`More for ${l.name}`}
                aria-haspopup="menu"
                aria-expanded={menu?.id === l.id}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ id: l.id, at: { x: r.left, y: r.bottom } })
                }}
              >
                <Icon name="dots" size={16} />
              </button>
            )}
          </div>
        )
      })}
      {current && menu && (
        <ContextMenu
          position={menu.at}
          onClose={() => setMenu(null)}
          label={current.name}
          items={[
            { label: 'Edit…', icon: <Icon name="settings" size={16} />, onClick: () => setEditing(current) },
            { label: 'Rename', icon: <Icon name="label" size={16} />, onClick: () => setRenaming(current.id) },
            ...(lists[0].id !== current.id ? [{ label: 'Move up', icon: <Icon name="back" size={16} />, onClick: () => moveSmartList(lists, current, -1) }] : []),
            ...(lists.at(-1)!.id !== current.id ? [{ label: 'Move down', icon: <Icon name="chevdown" size={16} />, onClick: () => moveSmartList(lists, current, 1) }] : []),
            { label: 'Delete', icon: <Icon name="delete" size={16} />, danger: true, hint: 'Undo 6s', onClick: () => deleteSmartListWithUndo(current) },
          ]}
        />
      )}
      {editing && (
        <Suspense fallback={null}>
          <SmartListEditor list={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
        </Suspense>
      )}
    </>
  )
}
