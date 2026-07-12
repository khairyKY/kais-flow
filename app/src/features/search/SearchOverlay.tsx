import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { searchHybrid } from './api'
import { useEscapeStack } from '../../lib/overlayStack'
import type { SearchHit } from '../../lib/types'

const DEBOUNCE_MS = 250

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEscapeStack(open, onClose)

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setQuery('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      searchHybrid(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  if (!open) return null

  function goTo(hit: SearchHit) {
    onClose()
    navigate(hit.entity_type === 'task' ? `/tasks?focus=${hit.entity_id}` : `/inbox?focus=${hit.entity_id}`)
  }

  const tasks = results.filter((r) => r.entity_type === 'task')
  const inboxItems = results.filter((r) => r.entity_type === 'inbox_item')

  function ResultGroup({ label, hits }: { label: string; hits: SearchHit[] }) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
          {label}
        </div>
        {hits.map((hit) => (
          <button
            key={`${hit.entity_type}-${hit.entity_id}`}
            type="button"
            onClick={() => goTo(hit)}
            className="search-result-row"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderRadius: 8,
              padding: '10px 12px',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{hit.title}</div>
            {hit.snippet && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{hit.snippet}</div>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }} onClick={onClose}>
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          margin: '0 16px',
          background: 'rgba(251,246,233,0.8)',
          backdropFilter: 'blur(9px)',
          border: '1px solid rgba(224,216,194,0.9)',
          borderRadius: 16,
          boxShadow: '0 2px 4px rgba(40,32,20,0.15), 0 30px 70px rgba(40,32,20,0.35)',
          padding: '22px 24px 16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{'.search-result-row:hover{background:rgba(60,52,38,0.06)}'}</style>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Search · ⌘/
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1.5px solid var(--line-sidebar)', paddingBottom: 12 }}>
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <circle cx="7" cy="7" r="5.2" stroke="var(--text-tertiary)" strokeWidth="1.6" />
            <path d="M11 11l4 4" stroke="var(--text-tertiary)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks and inbox…"
            style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none' }}
          />
        </div>

        {loading && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>Searching…</p>}
        {!loading && query.trim() && results.length === 0 && <p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--text-tertiary)' }}>No matches.</p>}

        {tasks.length > 0 && <ResultGroup label="Tasks" hits={tasks} />}
        {inboxItems.length > 0 && <ResultGroup label="Inbox" hits={inboxItems} />}

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line-dashed)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
            click a result · esc close
          </span>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-tertiary)', transform: 'rotate(-1deg)', display: 'inline-block' }}>
            no LLM — just fast recall
          </span>
        </div>
      </div>
    </div>
  )
}
