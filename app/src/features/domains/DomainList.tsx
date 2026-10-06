import { useState, type CSSProperties, type ReactNode } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { RenameField } from '../../components/RenameField'
import type { Domain } from '../../lib/types'
import { createDomain, deleteDomainWithUndo, mergeDomain, recolorDomain, renameDomain, reorderDomains, useDomains } from './api'
import { useChangeType } from '../projects/ChangeType'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useTasks } from '../tasks/api'
import { DOMAIN_COLORS } from './organize'
import '../projects/xfx.css'

// Kai 2026-10-06: "we can't create domains easily … you can't delete them, rename, no nothing".
// The domain rows of Settings → Organize and the Tasks page's Organize card: the name renames in
// place (click it, or the menu's Rename), and ⋯ / right-click opens Rename · Colour ▸ · Merge into ▸
// · Delete — a ContextMenu on a computer, an ActionSheet (+ a second sheet for the pickers) on a
// phone. The rules for Delete and Merge live in ./organize.ts.

const DEFAULT_DOT = 'var(--acc-moss)'
const dot = (color: string, size = 8) => <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: color, flex: 'none', display: 'inline-block' }} />

type Sub = 'color' | 'merge'
interface MenuState { id: string; at: { x: number; y: number }; sub?: Sub }

/** One domain's menu, wherever a domain shows (these rows, the Tasks page's domain chips): Rename ·
 * Colour ▸ · Move up / down (its place in every list — sort_order) · Merge into ▸ · Make it an
 * area… · Delete. `onRename` puts the caller's name into edit mode. */
export function useDomainMenu(domains: Domain[], onRename: (id: string) => void) {
  const isMobile = useIsMobile()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const changeType = useChangeType()
  const current = menu && domains.find((d) => d.id === menu.id)
  const close = () => setMenu(null)
  const move = (d: Domain, by: -1 | 1) => {
    const order = [...domains]
    const i = order.findIndex((x) => x.id === d.id)
    order.splice(i, 1)
    order.splice(i + by, 0, d)
    reorderDomains(order)
  }

  const colorOptions = (d: Domain) => DOMAIN_COLORS.map((c) => ({ label: c.label, icon: dot(c.value, 10), selected: d.color === c.value, run: () => recolorDomain(d, c.value) }))
  const mergeOptions = (d: Domain) => domains.filter((o) => o.id !== d.id).map((o) => ({ label: o.name, icon: dot(o.color ?? DEFAULT_DOT, 10), selected: false, run: () => mergeDomain(d.id, o.id) }))
  const actions = (d: Domain): { key: string; label: string; icon: IconName; hint?: string; danger?: boolean; sub?: Sub; run?: () => void }[] => {
    const i = domains.findIndex((x) => x.id === d.id)
    return [
      { key: 'rename', label: 'Rename', icon: 'label', run: () => onRename(d.id) },
      { key: 'color', label: 'Colour', icon: 'label', sub: 'color' },
      ...(i > 0 ? [{ key: 'up', label: 'Move up', icon: 'back' as IconName, run: () => move(d, -1) }] : []),
      ...(i < domains.length - 1 ? [{ key: 'down', label: 'Move down', icon: 'chevdown' as IconName, run: () => move(d, 1) }] : []),
      ...(domains.length > 1 ? [{ key: 'merge', label: 'Merge into…', icon: 'projects' as IconName, sub: 'merge' as Sub }] : []),
      { key: 'type', label: 'Make it an area…', icon: 'rotate', run: () => changeType.ask({ table: 'domains', row: d }, 'area') },
      { key: 'delete', label: 'Delete', icon: 'delete', hint: 'Undo 6s', danger: true, run: () => deleteDomainWithUndo(d) },
    ]
  }

  let layer: ReactNode = null
  if (current && menu) {
    if (isMobile) {
      const list = menu.sub === 'color' ? colorOptions(current) : menu.sub === 'merge' ? mergeOptions(current) : null
      layer = list ? (
        <ActionSheet key={menu.sub} title={menu.sub === 'color' ? 'Colour' : 'Merge into'} meta={current.name} onClose={close} items={list.map((o) => ({ label: o.label, icon: o.icon, selected: o.selected, onSelect: o.run }))} />
      ) : (
        <ActionSheet
          key="menu"
          title={current.name}
          meta="Domain"
          onClose={close}
          items={actions(current).map((a) => ({
            label: a.label,
            icon: a.key === 'color' ? dot(current.color ?? DEFAULT_DOT, 12) : <Icon name={a.icon} size={24} />,
            hint: a.hint,
            destructive: a.danger,
            chevron: !!a.sub,
            onSelect: a.sub ? () => setMenu({ ...menu, sub: a.sub }) : a.run!,
          }))}
        />
      )
    } else {
      const submenu = (sub: Sub): ContextMenuItem['submenu'] => ({ position, onClose: back, closeAll }) => (
        <ContextMenu position={position} onClose={back} items={(sub === 'color' ? colorOptions(current) : mergeOptions(current)).map((o) => ({ label: o.label, icon: o.icon, onClick: () => { o.run(); closeAll() } }))} />
      )
      layer = (
        <ContextMenu
          position={menu.at}
          onClose={close}
          items={actions(current).map((a) => ({
            label: a.label,
            danger: a.danger,
            icon: a.key === 'color' ? dot(current.color ?? DEFAULT_DOT, 10) : <Icon name={a.icon} size={16} />,
            onClick: a.run,
            submenu: a.sub && submenu(a.sub),
          }))}
        />
      )
    }
  }
  return {
    activeId: menu?.id ?? null,
    open: (id: string, at: { x: number; y: number }) => setMenu({ id, at }),
    node: (
      <>
        {layer}
        {changeType.node}
      </>
    ),
  }
}

export function DomainList({ domains, meta, rowStyle }: { domains: Domain[]; meta?: (d: Domain) => ReactNode; rowStyle?: CSSProperties }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const menu = useDomainMenu(domains, setRenaming)
  return (
    <>
      {/* The ⋯ shows on hover (always on touch) — the Projects rows' .pj-more (xfx.css). */}
      <style>{'.kf-domain-row:hover .pj-more { opacity: 1; }'}</style>
      {domains.map((d) => (
        <div
          key={d.id}
          className="kf-domain-row"
          onContextMenu={(e) => {
            e.preventDefault()
            menu.open(d.id, { x: e.clientX, y: e.clientY })
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--ink-body)', background: menu.activeId === d.id ? 'var(--select-bg)' : undefined, borderRadius: 4, ...rowStyle }}
        >
          {dot(d.color ?? DEFAULT_DOT, 7)}
          <span style={{ flex: 1, minWidth: 0 }}>
            {renaming === d.id ? (
              <RenameField
                value={d.name}
                ariaLabel="Domain name"
                onDone={(next) => {
                  setRenaming(null)
                  if (next && next !== d.name) renameDomain(d, next)
                }}
              />
            ) : (
              <span role="button" tabIndex={0} title="Rename" aria-label={`Rename ${d.name}`} onClick={() => setRenaming(d.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setRenaming(d.id) } }} style={{ cursor: 'text' }}>
                <EmojiText text={d.name} />
              </span>
            )}
          </span>
          {meta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', flex: 'none' }}>{meta(d)}</span>}
          <button
            type="button"
            className="pj-more kf-hit"
            aria-label={`More for ${d.name}`}
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              menu.open(d.id, { x: r.left, y: r.bottom })
            }}
            style={{ margin: '-4px -6px -4px 0' }}
          >
            <Icon name="dots" size={18} />
          </button>
        </div>
      ))}
      {menu.node}
    </>
  )
}

/** Settings → Organize: make a domain, and every domain's rename / colour / merge / delete. Loads
 * projects, areas and tasks so a Merge has every row to move (./api.ts mergeDomain). */
export function DomainsSettings() {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    createDomain(n)
    setName('')
  }
  const meta = (d: Domain) => {
    const n = (count: number, one: string) => (count ? `${count} ${one}${count === 1 ? '' : 's'}` : null)
    return [n(projects.filter((p) => p.domain_id === d.id).length, 'project'), n(areas.filter((a) => a.domain_id === d.id).length, 'area'), n(tasks.filter((t) => t.domain_id === d.id && t.status === 'todo').length, 'task')].filter(Boolean).join(' · ') || 'empty'
  }
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); add() }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New domain…"
          aria-label="New domain"
          style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 13.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', outline: 'none' }}
        />
        <button type="submit" disabled={!name.trim()} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 12.5, padding: '8px 15px', borderRadius: 999, cursor: name.trim() ? 'pointer' : 'default', opacity: name.trim() ? 1 : 0.5 }}>
          Add
        </button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {domains.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No domains yet — Work, Home, Health…</div>}
        <DomainList domains={domains} meta={meta} rowStyle={{ padding: '6px 4px' }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 10, lineHeight: 1.6 }}>
        click a name to rename · ⋯ or right-click for colour, merge, delete · delete rests in Trash (Undo) and what was in it stays, without a domain · merge moves everything into the domain you pick
      </div>
    </>
  )
}
