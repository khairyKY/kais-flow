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

  function viewAll() {
    onClose()
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const tasks = results.filter((r) => r.entity_type === 'task')
  const inboxItems = results.filter((r) => r.entity_type === 'inbox_item')

  function ResultGroup({ label, dot, hits }: { label: string; dot: string; hits: SearchHit[] }) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 6 }}>
          {label}
        </div>
        {hits.map((hit) => (
          <button
            key={`${hit.entity_type}-${hit.entity_id}`}
            type="button"
            onClick={() => goTo(hit)}
            className="search-result-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderRadius: 5,
              padding: '8px 6px',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{hit.title}</div>
              {hit.snippet && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 3 }}>{hit.snippet}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          margin: '0 16px',
          background: 'rgba(251,246,233,0.82)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(220,214,190,0.6)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-popover)',
          padding: '14px 16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{'.search-result-row:hover{background:var(--paper-bone)}'}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line-dashed)', paddingBottom: 11 }}>
          <span style={{ color: 'var(--ink-faint)' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) { e.preventDefault(); goTo(results[0]) }
            }}
            placeholder="Search tasks and inbox…"
            style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--ink-body)', background: 'transparent', border: 'none', outline: 'none' }}
          />
        </div>

        {loading && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-faint)' }}>Searching…</p>}
        {!loading && query.trim() && results.length === 0 && <p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--ink-faint)' }}>No matches.</p>}

        {tasks.length > 0 && <ResultGroup label="Tasks" dot="var(--acc-moss)" hits={tasks} />}
        {inboxItems.length > 0 && <ResultGroup label="Inbox" dot="var(--acc-hydrangea)" hits={inboxItems} />}

        {results.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>View top result</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>↵</span>
          </div>
        )}
        {query.trim() && (
          <button
            type="button"
            onClick={viewAll}
            style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>View all results</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>↵</span>
          </button>
        )}
      </div>
    </div>
  )
}
