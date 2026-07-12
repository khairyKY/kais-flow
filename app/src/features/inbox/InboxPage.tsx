import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePendingInboxItems, useAllInboxItems, fileToTask, dismissInboxItem, snoozeInboxItem } from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { hydrangeaAsset } from '../../lib/gardenAssets'
import { useListKeys, type ListBinding } from '../../components/useListKeys'
import { Select } from '../../components/Select'
import { scheduleTomorrow } from '../../lib/dateShortcuts'
import type { InboxItem } from '../../lib/types'

interface AiParse {
  kind?: string
  cleaned_text?: string
  confidence?: number
  domain_id?: string | null
  project_id?: string | null
}

function TriageRow({
  item,
  highlighted,
  fromSearch,
  rotate,
  pickRequested,
  onPicked,
}: {
  item: InboxItem
  highlighted?: boolean
  fromSearch?: boolean
  rotate: number
  pickRequested?: boolean
  onPicked?: () => void
}) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const parse = item.ai_parse as AiParse | null
  const [domainId, setDomainId] = useState(parse?.domain_id ?? '')
  const [projectId, setProjectId] = useState(parse?.project_id ?? '')
  // The AI's cleaned_text was shown but never filed (fileToTask used raw_text). It's now the
  // editable default title; × drops the AI guess and reverts the title to the raw capture.
  const suggested = parse?.cleaned_text && parse.cleaned_text !== item.raw_text ? parse.cleaned_text : null
  const [title, setTitle] = useState(suggested ?? item.raw_text)
  const [editing, setEditing] = useState(false)
  const [aiDismissed, setAiDismissed] = useState(false)
  const [chipHover, setChipHover] = useState(false)
  const domainTriggerRef = useRef<HTMLButtonElement>(null)

  const showAi = !!parse && !aiDismissed
  const filedTitle = title.trim() || item.raw_text
  const kindLabel = parse?.kind ?? 'note'
  const pct = typeof parse?.confidence === 'number' ? Math.round(parse.confidence * 100) : null
  const aiTooltip = `The AI read this capture as a ${kindLabel}${pct != null ? `, ${pct}% confident` : ''}. File to accept it, tap the title to edit, or × to ignore the AI entirely.`

  useEffect(() => {
    if (pickRequested) domainTriggerRef.current?.focus()
  }, [pickRequested])

  function fileWithPicks() {
    fileToTask(item, { domainId: domainId || null, projectId: projectId || null, title: filedTitle })
    onPicked?.()
  }

  function dismissAi() {
    setAiDismissed(true)
    setTitle(item.raw_text)
    setEditing(false)
  }

  return (
    <div
      id={`inbox-${item.id}`}
      tabIndex={highlighted ? 0 : -1}
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: highlighted
          ? '0 0 0 3px rgba(138,154,126,0.28), 0 1px 2px rgba(60,52,38,0.12), 0 6px 14px rgba(60,52,38,0.09)'
          : '0 1px 2px rgba(60,52,38,0.12), 0 6px 14px rgba(60,52,38,0.09)',
        borderRadius: 3,
        padding: '16px 18px 14px',
        transform: `rotate(${rotate}deg)`,
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: 22,
          width: 52,
          height: 14,
          background: 'rgba(154,180,190,0.4)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
          transform: 'rotate(-2deg)',
          borderRadius: 1,
          boxShadow: '0 1px 2px rgba(60,52,38,0.1)',
        }}
      />
      {fromSearch && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            left: 16,
            fontFamily: 'var(--font-hand)',
            fontSize: 15,
            color: 'var(--text-secondary)',
            background: 'var(--bg-app)',
            padding: '0 6px',
            transform: 'rotate(-1.5deg)',
          }}
        >
          ↑ from search
        </span>
      )}

      {editing ? (
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.4, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-input)', padding: '4px 8px', outline: 'none' }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="Tap to edit the title before filing"
          style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.4, cursor: 'text' }}
        >
          {title}
        </div>
      )}

      {filedTitle !== item.raw_text && (
        <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
          captured: "{item.raw_text}"
        </div>
      )}

      {showAi && (
        <div style={{ marginTop: 9 }}>
          <span
            onMouseEnter={() => setChipHover(true)}
            onMouseLeave={() => setChipHover(false)}
            title={aiTooltip}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(154,180,190,0.22)',
              border: '1px solid rgba(154,180,190,0.55)',
              color: 'var(--acc-hydrangea-deep)',
              padding: '3px 9px',
              borderRadius: 999,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.04em',
              cursor: 'help',
            }}
          >
            AI: looks like a {kindLabel}
            {pct != null && ` · ${pct}% sure`}
            <button
              type="button"
              aria-label="Ignore AI suggestion"
              onClick={dismissAi}
              style={{
                position: 'absolute',
                top: -7,
                right: -7,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-tertiary)',
                fontSize: 11,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: chipHover ? 1 : 0,
                transition: 'opacity 120ms',
                boxShadow: 'var(--shadow-crisp)',
              }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
        <Select
          value={domainId}
          onChange={setDomainId}
          triggerRef={domainTriggerRef}
          onEnterClosed={fileWithPicks}
          placeholder="Domain…"
          ariaLabel="Domain"
          style={{ fontSize: 12.5, padding: '8px 10px' }}
          options={[{ value: '', label: 'Domain…' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Select
          value={projectId}
          onChange={setProjectId}
          onEnterClosed={fileWithPicks}
          placeholder="Project…"
          ariaLabel="Project"
          style={{ fontSize: 12.5, padding: '8px 10px' }}
          options={[{ value: '', label: 'Project…' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <button
          type="button"
          onClick={fileWithPicks}
          style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}
        >
          File as task
        </button>
        <button
          type="button"
          onClick={() => dismissInboxItem(item)}
          style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 6px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function FocusedItemCard({ item }: { item: InboxItem }) {
  const statusLabel = item.status === 'filed' ? 'Already filed as a task' : 'Dismissed'
  return (
    <div
      id={`inbox-${item.id}`}
      style={{ border: '1px solid var(--line-card)', background: 'var(--bg-surface)', borderRadius: 3, padding: '13px 14px', boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 5px 12px rgba(60,52,38,0.08)' }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 5 }}>{statusLabel}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.raw_text}</div>
    </div>
  )
}

const ROTATIONS = [-0.3, 0.35, -0.25, 0.28, -0.2]

export function InboxPage() {
  const { data: items = [] } = usePendingInboxItems()
  const { data: allItems = [] } = useAllInboxItems()
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusedItem = focusId ? allItems.find((i) => i.id === focusId) : undefined
  const [pickId, setPickId] = useState<string | null>(null)

  const bindings: ListBinding<InboxItem>[] = [
    {
      keys: ['f'],
      label: 'File with AI suggestion',
      run: (item) => {
        const parse = item.ai_parse as AiParse | null
        fileToTask(item, { domainId: parse?.domain_id ?? null, projectId: parse?.project_id ?? null, title: parse?.cleaned_text ?? undefined })
      },
    },
    { keys: ['d'], label: 'Pick domain/project, then file', run: (item) => setPickId(item.id) },
    { keys: ['x'], label: 'Dismiss', run: (item) => dismissInboxItem(item) },
    { keys: ['s'], label: 'Snooze to tomorrow', run: (item) => snoozeInboxItem(item, scheduleTomorrow()) },
  ]
  const { focusedId } = useListKeys(items, bindings, { idPrefix: 'inbox-' })

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`inbox-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, items, allItems])

  const hydrangea = hydrangeaAsset(items.length)

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Inbox · Triage queue
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Inbox</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', transform: 'rotate(1deg)' }}>
            <img src={`assets/hydrangea/${hydrangea.src}.png`} alt="Hydrangea" style={{ height: 84, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))' }} />
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>{hydrangea.note}</span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <VoiceCaptureButton />
          </div>
        </div>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 30px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
        {focusedItem && focusedItem.status !== 'pending' && <FocusedItemCard item={focusedItem} />}

        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="assets/hydrangea/zero.png" alt="" style={{ height: 44, width: 'auto', objectFit: 'contain', opacity: 0.75 }} />
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-tertiary)', transform: 'rotate(-0.8deg)' }}>
              the cluster has settled into a single calm bloom
            </span>
          </div>
        ) : (
          items.map((item, i) => (
            <TriageRow
              key={item.id}
              item={item}
              highlighted={item.id === focusId || item.id === focusedId}
              fromSearch={item.id === focusId}
              rotate={ROTATIONS[i % ROTATIONS.length]}
              pickRequested={item.id === pickId}
              onPicked={() => setPickId(null)}
            />
          ))
        )}
      </div>
    </div>
  )
}
