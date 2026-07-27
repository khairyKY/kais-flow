import { useTasks } from '../tasks/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { searchHybrid, searchHitHref, SEARCH_GROUPS } from './api'
import type { SearchHit, SearchEntityType } from '../../lib/types'

// Search.dc.html t1 1a/1b — the full page behind the ⌘/ overlay's "View all results ↵".
// Punch 49: groups come from SEARCH_GROUPS (people/tasks/events/inbox/journal/projects) and a
// group with no hits renders nothing, so this page is correct both before and after migration
// 0031 is pushed. Library has no group: it's cut from v1 (punch 65).

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

function ResultGroup({ label, tint, dot, hits, query, onGo, offset, activeIndex, onHover }: { label: string; tint: string; dot: string; hits: SearchHit[]; query: string; onGo: (h: SearchHit) => void; offset: number; activeIndex: number; onHover: (i: number) => void }) {
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
          {/* Tasks get the export's empty checkbox; every other type gets its group dot. */}
          <span style={{ width: hit.entity_type === 'task' ? 17 : 6, height: hit.entity_type === 'task' ? 17 : 6, marginTop: hit.entity_type === 'task' ? 2 : 6, borderRadius: hit.entity_type === 'task' ? 5 : '50%', border: hit.entity_type === 'task' ? '1.5px solid var(--check-border)' : 'none', background: hit.entity_type === 'task' ? 'transparent' : dot, flex: 'none' }} />
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

function Chip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, background: on ? 'var(--ink-body)' : 'none', color: on ? 'var(--paper-linen)' : 'var(--ink-muted)', border: `1px solid ${on ? 'var(--ink-body)' : 'var(--line-solid)'}`, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
    >
      {label} <b style={{ fontWeight: 400, color: on ? 'color-mix(in srgb, var(--paper-linen) 55%, transparent)' : 'var(--ink-hairline)' }}>{count}</b>
    </button>
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
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 40%, var(--sky-horizon,#b9a98a), var(--sky-panel-strong,#a3937a) 70%)', boxShadow: 'inset 0 3px 6px rgba(var(--kf-shadow-rgb, 60,52,38),0.28)' }} />
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
  // Punch 49: the chips were decorative. `null` = All.
  const [typeFilter, setTypeFilter] = useState<SearchEntityType | null>(null)
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
          setTypeFilter(null)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function goTo(hit: SearchHit) {
    navigate(searchHitHref(hit, allTasks))
  }

  // Counts are over everything found; the rendered groups honour the chip.
  const counts = useMemo(() => {
    const map = new Map<SearchEntityType, number>()
    for (const hit of results) map.set(hit.entity_type, (map.get(hit.entity_type) ?? 0) + 1)
    return map
  }, [results])

  const groups = useMemo(
    () =>
      SEARCH_GROUPS.filter((g) => !typeFilter || g.type === typeFilter).map((g) => ({
        ...g,
        hits: results.filter((r) => r.entity_type === g.type),
      })),
    [results, typeFilter]
  )
  // Flat list in render order so activeIndex maps 1:1 to visible rows.
  const ordered = useMemo(() => groups.flatMap((g) => g.hits), [groups])
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
            <Chip label="All" count={results.length} on={typeFilter === null} onClick={() => setTypeFilter(null)} />
            {SEARCH_GROUPS.filter((g) => (counts.get(g.type) ?? 0) > 0).map((g) => (
              <Chip key={g.type} label={g.label} count={counts.get(g.type)!} on={typeFilter === g.type} onClick={() => { setTypeFilter(g.type); setActiveIndex(0) }} />
            ))}
          </div>
        </div>
      )}

      {trimmed && !loading && results.length === 0 && <EmptyResult query={trimmed} />}

      {!loading &&
        groups.reduce<{ nodes: React.ReactNode[]; offset: number }>(
          (acc, g) => {
            acc.nodes.push(
              <ResultGroup key={g.type} label={g.label} tint={g.tint} dot={g.dot} hits={g.hits} query={trimmed} onGo={goTo} offset={acc.offset} activeIndex={activeIndex} onHover={setActiveIndex} />
            )
            acc.offset += g.hits.length
            return acc
          },
          { nodes: [], offset: 0 }
        ).nodes}
    </div>
  )
}
