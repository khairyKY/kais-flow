import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip, Toggle } from '../../components/kit'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { EmojiText } from '../../components/EmojiText'
import { useEscapeStack } from '../../lib/overlayStack'
import { useTasks } from '../tasks/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { useLabels } from '../tasks/labels'
import { readFilter, WHEN_LABELS, WHENS, type SmartFilter, type SmartLength } from '../../../../supabase/functions/_shared/smartList.ts'
import { createSmartList, deleteSmartListWithUndo, openCount, saveSmartList, smartTasks } from './api'
import type { SmartListRow } from '../../lib/types'

// The smart list editor — "Save as smart list" on the Tasks page, "+ New smart list" and ⋯ → Edit in
// the sidebar. Plain chips, no query language (Kai gets confused easily): every group is optional and
// they all have to hold; inside a group any pick will do. A live count says what the list will show.
// Desktop: a card over the page; phone: a sheet (closing it keeps what you picked, as every sheet does).

const LENGTH_CHIPS: { value: SmartLength; label: string }[] = [
  { value: 15, label: '≤ 15 min' },
  { value: 30, label: '≤ 30 min' },
  { value: 60, label: '≤ 60 min' },
  { value: 'none', label: 'No length' },
]
const PRIORITY_CHIPS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 3, label: '!' },
  { value: 2, label: '!!' },
  { value: 1, label: '!!!' },
]

const LABEL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', margin: '16px 0 7px' }
const ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 7 }

interface Draft {
  name: string
  filter: SmartFilter
}
// A phone sheet closed by a swipe keeps the draft until Save or Cancel (BottomSheet's contract).
let kept: { key: string; draft: Draft } | null = null

const toggle = <T,>(xs: readonly T[] | undefined, x: T): T[] | undefined => {
  const next = xs?.includes(x) ? xs.filter((y) => y !== x) : [...(xs ?? []), x]
  return next.length ? next : undefined
}

export function SmartListEditor({ list, seed, onClose }: { list?: SmartListRow; seed?: SmartFilter; onClose: () => void }) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: domains = [] } = useDomains()
  const { labels } = useLabels()
  const key = list?.id ?? 'new'
  const [draft, setDraft] = useState<Draft>(() => (kept?.key === key ? kept.draft : { name: list?.name ?? '', filter: list?.filter ?? seed ?? {} }))
  const ended = useRef(false)
  useEffect(() => {
    if (!ended.current) kept = { key, draft }
  })
  const end = () => {
    ended.current = true
    kept = null
  }
  const dirty = draft.name !== (list?.name ?? '') || JSON.stringify(draft.filter) !== JSON.stringify(list?.filter ?? seed ?? {})
  useEscapeStack(!isMobile, () => { end(); onClose() })

  const f = draft.filter
  const set = (change: Partial<SmartFilter>) => setDraft((d) => ({ ...d, filter: { ...d.filter, ...change } }))
  const clean = readFilter(f) // what is stored: trimmed text, nothing empty
  const matches = openCount(smartTasks(tasks, clean, projects, areas))
  const name = draft.name.trim()

  function save(close: () => void) {
    if (!name) return
    if (list) saveSmartList(list, { name, filter: clean })
    else navigate(`/tasks?list=${createSmartList(name, clean).id}`)
    end()
    close()
  }

  const chip = (label: ReactNode, on: boolean, onClick: () => void, key: string) => (
    <Chip key={key} tone="filter" selected={on} onClick={onClick}>
      {label}
    </Chip>
  )
  const places = [
    ...domains.map((d) => ({ id: d.id, name: d.name })),
    ...areas.map((a) => ({ id: a.id, name: a.name })),
    ...projects.filter((p) => p.status !== 'archived').map((p) => ({ id: p.id, name: p.name })),
  ]

  const fields = (
    <div style={{ paddingBottom: 4 }}>
      <input
        autoFocus={!isMobile}
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        maxLength={80}
        placeholder="Name it — e.g. Quick work wins"
        aria-label="Smart list name"
        className="st-field"
        style={{ fontSize: 'var(--fs-body)' }}
      />
      {places.length > 0 && (
        <>
          <div style={LABEL}>Where · any of</div>
          <div style={ROW}>{places.map((p) => chip(<EmojiText text={p.name} />, !!f.places?.includes(p.id), () => set({ places: toggle(f.places, p.id) }), p.id))}</div>
        </>
      )}
      {labels.length > 0 && (
        <>
          <div style={LABEL}>Labels · any of</div>
          <div style={ROW}>{labels.map((l) => chip(l.name, !!f.labels?.includes(l.name), () => set({ labels: toggle(f.labels, l.name) }), l.name))}</div>
        </>
      )}
      <div style={LABEL}>When · any of</div>
      <div style={ROW}>{WHENS.map((w) => chip(WHEN_LABELS[w], !!f.when?.includes(w), () => set({ when: toggle(f.when, w) }), w))}</div>
      <div style={LABEL}>Priority · at least</div>
      <div style={ROW}>
        {chip('Any', !f.priority, () => set({ priority: undefined }), 'any')}
        {PRIORITY_CHIPS.map((p) => chip(p.label, f.priority === p.value, () => set({ priority: p.value }), String(p.value)))}
      </div>
      <div style={LABEL}>Length</div>
      <div style={ROW}>
        {chip('Any', f.length === undefined, () => set({ length: undefined }), 'any')}
        {LENGTH_CHIPS.map((l) => chip(l.label, f.length === l.value, () => set({ length: l.value }), String(l.value)))}
      </div>
      <div style={LABEL}>On the calendar</div>
      <div style={ROW}>
        {chip('Any', f.planned === undefined, () => set({ planned: undefined }), 'any')}
        {chip('Planned', f.planned === true, () => set({ planned: true }), 'yes')}
        {chip('Not planned', f.planned === false, () => set({ planned: false }), 'no')}
      </div>
      <div style={LABEL}>Text contains</div>
      <input value={f.text ?? ''} onChange={(e) => set({ text: e.target.value || undefined })} placeholder="Any words in the title or notes" aria-label="Text contains" className="st-field" />
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)' }}>
        Show done tasks too
        <Toggle on={!!f.show_done} onToggle={() => set({ show_done: !f.show_done || undefined })} label="Show done tasks too" />
      </label>
      <div className="kf-help" style={{ marginTop: 14 }}>
        {matches === 0 ? 'No open task matches yet — it fills in as tasks do.' : `${matches} open task${matches === 1 ? '' : 's'} match right now.`}
      </div>
    </div>
  )

  const actions = (close: () => void) => (
    <>
      {list && (
        <Button variant="ghost" onClick={() => { deleteSmartListWithUndo(list); end(); close() }} style={{ marginRight: 'auto', color: 'var(--acc-terra)' }}>
          Delete
        </Button>
      )}
      <Button variant="secondary" onClick={() => { end(); close() }}>Cancel</Button>
      <Button onClick={() => save(close)} disabled={!name}>{list ? 'Save' : 'Save list'}</Button>
    </>
  )
  const title = list ? 'Edit smart list' : 'New smart list'

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} title={title} detent="full" footer={(close) => actions(close)}>
        {() => fields}
      </BottomSheet>
    )
  }
  return (
    <div className="kf-overlay-scrim" onClick={() => { if (!dirty) { end(); onClose() } }} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}>
      <div role="dialog" aria-label={title} className="kf-overlay-card" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: 'calc(var(--kf-vw) - 24px)', maxHeight: 'calc(var(--kf-vh) - 24px)', overflowY: 'auto', background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-popover)', padding: '22px 26px 20px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-l)', fontWeight: 500, color: 'var(--ink-body)', marginBottom: 14 }}>{title}</div>
        {fields}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>{actions(onClose)}</div>
      </div>
    </div>
  )
}
