import { useTasks } from '../tasks/api'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { searchHybrid } from './api'
import type { SearchHit } from '../../lib/types'

// Search.dc.html t1 1a/1b — the full page behind the ⌘/ overlay's "View all results ↵".
// The backend (search_hybrid) only indexes tasks + inbox_item today, so only those two
// groups render; People/Events/Journal/Projects/Library join once their waves ship.

const DEBOUNCE_MS = 250

function openChat() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, ctrlKey: true, bubbles: true }))
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="search-hl">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

function ResultGroup({ label, tint, hits, query, onGo, offset, activeIndex, onHover }: { label: string; tint: string; hits: SearchHit[]; query: string; onGo: (h: SearchHit) => void; offset: number; activeIndex: number; onHover: (i: number) => void }) {
  if (hits.length === 0) return null
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 4px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: tint, whiteSpace: 'nowrap' }}>
          {label} · {hits.length}
        </span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      {hits.map((hit, i) => (
        <button
          key={`${hit.entity_type}-${hit.entity_id}`}
          type="button"
          onClick={() => onGo(hit)}
          onMouseEnter={() => onHover(offset + i)}
          // Selected row = bone fill (Overlays.dc.html .mi selected); deviation(2026-07-18 audit):
          // plus a faint lavender outline ring — Kai's explicit "faint blue outline" ask.
          style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '12px 6px', width: '100%', textAlign: 'left', background: offset + i === activeIndex ? 'var(--paper-bone)' : 'none', boxShadow: offset + i === activeIndex ? '0 0 0 1.5px color-mix(in oklch, var(--acc-lavender) 45%, transparent)' : 'none', borderRadius: 5, border: 'none', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer', font: 'inherit' }}
        >
          <span style={{ width: hit.entity_type === 'task' ? 17 : 6, height: hit.entity_type === 'task' ? 17 : 6, marginTop: hit.entity_type === 'task' ? 2 : 6, borderRadius: hit.entity_type === 'task' ? 5 : '50%', border: hit.entity_type === 'task' ? '1.5px solid var(--check-border)' : 'none', background: hit.entity_type === 'inbox_item' ? 'var(--acc-hydrangea)' : 'transparent', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, color: 'var(--ink-body)' }}>
              <Highlight text={hit.title} query={query} />
            </div>
            {hit.snippet && (
              <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-faint)' }}>
                <Highlight text={hit.snippet} query={query} />
              </div>
            )}
          </div>
        </button>
      ))}
    </>
  )
}

function EmptyResult({ query }: { query: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 560, margin: '40px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '13px 17px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16, color: 'var(--ink-faint)' }}>⌕</span>
        <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--ink-body)' }}>{query}</span>
      </div>
      <div style={{ marginTop: 9, alignSelf: 'flex-start', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>0 results</div>
      <div style={{ position: 'relative', marginTop: 34, width: 150, height: 110 }}>
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 40%, #b9a98a, #a3937a 70%)', boxShadow: 'inset 0 3px 6px rgba(60,52,38,0.28)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 30, width: 46, height: 46, marginLeft: -30, borderRadius: '50%', border: '3px solid var(--ink-faint)', background: 'rgba(244,241,234,0.35)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 14, width: 22, height: 3.5, marginLeft: 10, background: 'var(--ink-faint)', borderRadius: 2, transform: 'rotate(38deg)' }} />
      </div>
      {/* deviation(2026-07-19 X3): hand notes ride var(--ink-muted) so night matches Night.dc's #c9c0d8 (export's light #7a745f was illegible on the night ground) */}
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 360, lineHeight: 1.45 }}>
        Nothing's come up for that — try fewer words, or let the chat dig deeper.
      </div>
      <button
        type="button"
        onClick={openChat}
        style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-body)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '9px 18px', background: 'none', cursor: 'pointer', font: 'inherit' }}
      >
        Ask the garden (chat) →
      </button>
    </div>
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: allTasks = [] } = useTasks()
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setParams({}, { replace: true })
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      setParams({ q: trimmed }, { replace: true })
      searchHybrid(trimmed)
        .then((hits) => {
          setResults(hits)
          setActiveIndex(0)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function goTo(hit: SearchHit) {
    // Same project-aware routing as the overlay (Kai 2026-07-21).
            if (hit.entity_type !== 'task') { navigate(`/inbox?focus=${hit.entity_id}`); return }
            const task = allTasks.find((t) => t.id === hit.entity_id)
            if (task?.project_id) navigate(`/projects/${task.project_id}?focus=${hit.entity_id}`)
            else navigate(`/tasks?focus=${hit.entity_id}`)
  }

  const tasks = results.filter((r) => r.entity_type === 'task')
  const inboxItems = results.filter((r) => r.entity_type === 'inbox_item')
  // Flat list in render order (Tasks group, then Inbox) so activeIndex maps 1:1 to visible rows.
  const ordered = [...tasks, ...inboxItems]
  const trimmed = query.trim()

  return (
    <div style={{ width: 920, maxWidth: '100%', margin: '0 auto', padding: '30px 34px 48px' }}>
      <style>{'.search-hl{background:color-mix(in srgb, var(--acc-gold-warm) 32%, transparent);border-radius:2px;padding:0 2px;color:var(--ink-body)}'}</style>

      <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 19, color: 'var(--ink-faint)' }}>⌕</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
            else if (e.key === 'ArrowDown' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i + 1) % ordered.length) }
            else if (e.key === 'ArrowUp' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i - 1 + ordered.length) % ordered.length) }
            else if (e.key === 'Enter' && ordered[activeIndex]) { e.preventDefault(); goTo(ordered[activeIndex]) }
          }}
          placeholder="Search the garden…"
          style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink-body)', background: 'transparent', border: 'none', outline: 'none' }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>esc clears</span>
      </div>

      {trimmed && (
        <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {loading ? 'searching…' : `${results.length} result${results.length === 1 ? '' : 's'} for '${trimmed}'`}
        </div>
      )}

      {trimmed && !loading && results.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 7, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            {/* Active chip inverts with the theme: dark-on-cream by day, cream-on-violet at night */}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, background: 'var(--ink-body)', color: 'var(--paper-linen)', border: '1px solid var(--ink-body)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              All <b style={{ fontWeight: 400, color: 'color-mix(in srgb, var(--paper-linen) 55%, transparent)' }}>{results.length}</b>
            </span>
            {tasks.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>
                Tasks <b style={{ fontWeight: 400, color: 'var(--ink-hairline)' }}>{tasks.length}</b>
              </span>
            )}
            {inboxItems.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>
                Inbox <b style={{ fontWeight: 400, color: 'var(--ink-hairline)' }}>{inboxItems.length}</b>
              </span>
            )}
          </div>
        </div>
      )}

      {trimmed && !loading && results.length === 0 && <EmptyResult query={trimmed} />}

      {!loading && (
        <>
          <ResultGroup label="Tasks" tint="#a1707c" hits={tasks} query={trimmed} onGo={goTo} offset={0} activeIndex={activeIndex} onHover={setActiveIndex} />
          <ResultGroup label="Inbox" tint="var(--acc-hydrangea-deep)" hits={inboxItems} query={trimmed} onGo={goTo} offset={tasks.length} activeIndex={activeIndex} onHover={setActiveIndex} />
        </>
      )}
    </div>
  )
}
