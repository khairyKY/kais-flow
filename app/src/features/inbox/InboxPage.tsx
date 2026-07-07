import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePendingInboxItems, useAllInboxItems, fileToTask, dismissInboxItem } from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { hydrangeaAsset } from '../../lib/gardenAssets'
import type { InboxItem } from '../../lib/types'

interface AiParse {
  kind?: string
  cleaned_text?: string
  confidence?: number
  domain_id?: string | null
  project_id?: string | null
}

const SELECT_STYLE = {
  fontFamily: 'var(--font-ui)',
  fontSize: 12.5,
  color: 'var(--text-primary)',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '7px 10px',
}

function TriageRow({ item, highlighted, rotate }: { item: InboxItem; highlighted?: boolean; rotate: number }) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const parse = item.ai_parse as AiParse | null
  const [domainId, setDomainId] = useState(parse?.domain_id ?? '')
  const [projectId, setProjectId] = useState(parse?.project_id ?? '')

  return (
    <div
      id={`inbox-${item.id}`}
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
      {highlighted && (
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

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.4 }}>{item.raw_text}</div>

      {parse && (
        <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-secondary)' }}>
          <span
            style={{
              background: 'rgba(154,180,190,0.22)',
              border: '1px solid rgba(154,180,190,0.55)',
              color: 'var(--acc-hydrangea-deep)',
              padding: '3px 8px',
              borderRadius: 999,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontSize: 9.5,
            }}
          >
            AI · {parse.kind ?? 'note'}
            {typeof parse.confidence === 'number' && ` · ${Math.round(parse.confidence * 100)}%`}
          </span>
          {parse.cleaned_text && parse.cleaned_text !== item.raw_text && <span>suggested: "{parse.cleaned_text}"</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} style={SELECT_STYLE}>
          <option value="">Domain…</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={SELECT_STYLE}>
          <option value="">Project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => fileToTask(item, { domainId: domainId || null, projectId: projectId || null })}
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
          items.map((item, i) => <TriageRow key={item.id} item={item} highlighted={item.id === focusId} rotate={ROTATIONS[i % ROTATIONS.length]} />)
        )}
      </div>
    </div>
  )
}
