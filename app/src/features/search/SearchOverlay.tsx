import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { searchHybrid } from './api'
import { EmojiText } from '../../components/EmojiText'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import type { SearchHit } from '../../lib/types'

const DEBOUNCE_MS = 250

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEscapeStack(open, onClose)
  useBodyScrollLock(open)

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
        .then((hits) => {
          setResults(hits)
          setActiveIndex(0)
        })
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
  // Flat list in render order (Tasks group, then Inbox) so activeIndex maps 1:1 to visible rows.
  const ordered = [...tasks, ...inboxItems]

  function ResultGroup({ label, dot, hits, offset }: { label: string; dot: string; hits: SearchHit[]; offset: number }) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 6 }}>
          {label}
        </div>
        {hits.map((hit, i) => {
          const active = offset + i === activeIndex
          return (
            <button
              key={`${hit.entity_type}-${hit.entity_id}`}
              type="button"
              onClick={() => goTo(hit)}
              onMouseEnter={() => setActiveIndex(offset + i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                width: '100%',
                textAlign: 'left',
                // Overlays.dc.html .mi selected = bone fill; deviation(2026-07-18 audit): plus a
                // faint lavender outline ring — Kai's explicit "faint blue outline" ask.
                background: active ? 'var(--paper-bone)' : 'none',
                boxShadow: active ? '0 0 0 1.5px color-mix(in oklch, var(--acc-lavender) 45%, transparent)' : 'none',
                border: 'none',
                borderRadius: 5,
                padding: '8px 6px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--ink-body)' }}><EmojiText text={hit.title} /></div>
                {hit.snippet && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 3 }}>{hit.snippet}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96, animation: 'seOverlayFade 210ms var(--ease-out)' }}
      onClick={onClose}
    >
      {/* Motion 3c — scrim and card arrive together, 210ms up-and-settle */}
      <style>{'@keyframes seOverlayFade{from{opacity:0}}'}</style>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          margin: '0 16px',
          // Frost rides the paper token so night gets the Night.dc violet glass, not day cream
          background: 'color-mix(in srgb, var(--paper-parchment) 82%, transparent)',
          backdropFilter: 'blur(8px)',
          border: '1px solid color-mix(in srgb, var(--line-card) 60%, transparent)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-popover)',
          padding: '14px 16px',
          animation: 'entryFadeUp 210ms var(--ease-out)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line-dashed)', paddingBottom: 11 }}>
          <span style={{ color: 'var(--ink-faint)' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i + 1) % ordered.length) }
              else if (e.key === 'ArrowUp' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i - 1 + ordered.length) % ordered.length) }
              else if (e.key === 'Enter' && ordered[activeIndex]) { e.preventDefault(); goTo(ordered[activeIndex]) }
            }}
            placeholder="Search tasks and inbox…"
            style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--ink-body)', background: 'transparent', border: 'none', outline: 'none' }}
          />
        </div>

        {loading && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-faint)' }}>Searching…</p>}
        {/* Search.dc.html 1b voice — same line as the full page's empty state, shortened */}
        {!loading && query.trim() && results.length === 0 && <p style={{ marginTop: 12, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)' }}>Nothing's come up for that — try fewer words.</p>}

        {/* R4 (2026-07-20 audit): long result sets need to scroll inside the card, not clip */}
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {tasks.length > 0 && <ResultGroup label="Tasks" dot="var(--acc-moss)" hits={tasks} offset={0} />}
          {inboxItems.length > 0 && <ResultGroup label="Inbox" dot="var(--acc-hydrangea)" hits={inboxItems} offset={tasks.length} />}
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Open selected</span>
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
