import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useOpenSearchHit } from './api'
import { useSearch } from './useSearch'
import { resultCountLine, SEARCH_RESTING } from './searchState'
import { chipCounts, describeRow, groupRows, indexSearchData, NO_FILTERS, searchRows, TIME_WINDOWS, type GroupView, type RowView, type SearchFilters, type SearchRow } from './searchView'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { Chip } from '../../components/kit'
import { filterChip } from '../../components/filterChip'
import { Select } from '../../components/Select'
import { Skeleton } from '../../components/States'
import { useIsMobile } from '../../components/BottomSheet'
import { useOnline } from '../../lib/useOnline'
import { useTasks } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { useAllInboxItems } from '../inbox/api'
import { useJournalEntries } from '../journal/api'
import { useProjects, useTimeEntries } from '../projects/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { useInteractions, usePeople } from '../people/api'
import { useBooks, useNotes, useQuotes } from '../library/api'
import type { SearchHit } from '../../lib/types'

// Search.dc.html t1 1a/1b — the full page behind the ⌘/ overlay's "View all results ↵". The pure
// half (groups, chips, filters, Related rows, each row's lines) is ./searchView.ts; this file draws
// it. Phone (the export's note under 1a): "chips scroll, input pins, groups stack".

function openChat() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, ctrlKey: true, bubbles: true }))
}

// `font` first: the shorthand resets font-size, so the size has to come after it (it used to come
// before, and the pill drew at the inherited 16px instead of 1b's 13.5).
const PILL: CSSProperties = { font: 'inherit', marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-pill)', padding: '9px 18px', background: 'none', cursor: 'pointer' }
const HAND: CSSProperties = { marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 'var(--fs-hand-l)', color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 360, lineHeight: 1.45 }
// 1a sets these at 8.5–9.5px, tracked 0.06–0.1em; the app's smallest label is --fs-meta (2026-10-08 UI
// pass: no sub-10px text) on the one metadata tracking, --ls-meta.
const MONO_META: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', whiteSpace: 'nowrap', flex: 'none' }

/** Every place the query occurs, marked (1a .hl). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <EmojiText text={text} />
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
  if (parts.length === 1) return <EmojiText text={text} />
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="search-hl">{p}</span> : <EmojiText key={i} text={p} />))}</>
}

/** The thing's own mark at the row's start (1a): a person's flower, a task's check, an event's bar,
 * a journal entry's date, a project's / area's own dot, else the group's dot. */
function Glyph({ hit, view, dot }: { hit: SearchHit; view: RowView; dot: string }) {
  switch (hit.entity_type) {
    case 'person':
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" style={{ flex: 'none', marginTop: 2 }} aria-hidden>
          <g fill="var(--acc-sage)">
            <ellipse cx="12" cy="7" rx="3.4" ry="4.4" />
            <ellipse cx="7" cy="14" rx="3.4" ry="4.4" transform="rotate(-70 7 14)" />
            <ellipse cx="17" cy="14" rx="3.4" ry="4.4" transform="rotate(70 17 14)" />
          </g>
          <circle cx="12" cy="12.4" r="2" fill="var(--acc-sage-text)" />
        </svg>
      )
    case 'task':
      // The checkbox's own radius and check mark (kit Checkbox), drawn still — the row is the button.
      return view.done ? (
        <span style={{ width: 17, height: 17, borderRadius: 'var(--radius-check)', background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', flex: 'none', marginTop: 2 }} aria-hidden>
          <Icon name="check" strokeWidth={2.2} style={{ width: '72%', height: '72%' }} />
        </span>
      ) : (
        <span style={{ width: 17, height: 17, border: '1.5px solid var(--check-border)', borderRadius: 'var(--radius-check)', flex: 'none', marginTop: 2, boxSizing: 'border-box' }} aria-hidden />
      )
    case 'calendar_event':
      return <span style={{ width: 4, height: 30, borderRadius: 2, background: 'var(--acc-lavender)', flex: 'none', marginTop: 1 }} aria-hidden />
    case 'journal_entry':
      return <span style={{ ...MONO_META, color: 'var(--ink-faint)', width: 52, marginTop: 4, whiteSpace: 'normal' }}>{view.date}</span>
    case 'project':
    case 'area':
      return <span style={{ width: 9, height: 9, borderRadius: '50%', background: view.color ?? dot, flex: 'none', marginTop: 5 }} aria-hidden />
    default:
      return <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: 'none', marginTop: 7 }} aria-hidden />
  }
}

const RELATED_TAG: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)', background: 'color-mix(in srgb, var(--acc-hydrangea) 16%, transparent)', padding: '2px 6px', borderRadius: 3, marginRight: 7 }

function ResultRow({ row, view, dot, query, active, last, onGo, onHover }: { row: SearchRow; view: RowView; dot: string; query: string; active: boolean; last: boolean; onGo: () => void; onHover: () => void }) {
  // 1a draws a done / past title on --ink-hairline; text rides --ink-faint since the 2026-10-08 UI pass (AA).
  const titleColor = view.done || view.faded ? 'var(--ink-faint)' : 'var(--ink-body)'
  return (
    <button
      type="button"
      onClick={onGo}
      onMouseEnter={onHover}
      data-search-row={row.hit.entity_type}
      data-related={view.related || undefined}
      // Selected row = bone fill (Overlays.dc.html .mi selected); deviation(2026-07-18 audit):
      // plus a faint lavender outline ring — Kai's explicit "faint blue outline" ask.
      style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '12px 6px', width: '100%', textAlign: 'left', background: active ? 'var(--paper-bone)' : 'none', boxShadow: active ? '0 0 0 1.5px color-mix(in oklch, var(--acc-lavender) 45%, transparent)' : 'none', borderRadius: 5, border: 'none', borderBottom: last ? 'none' : '1px dashed var(--line-dashed)', cursor: 'pointer', font: 'inherit' }}
    >
      <Glyph hit={row.hit} view={view} dot={dot} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: view.quoted ? 'var(--fs-body-s)' : 'var(--fs-body)', lineHeight: view.quoted ? 1.5 : undefined, color: titleColor, textDecoration: view.done ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>
          <Highlight text={view.title} query={query} />
        </div>
        {view.line && (
          <div style={{ marginTop: 4, fontSize: 'var(--fs-caption)', lineHeight: 1.5, color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
            {view.related && <span style={RELATED_TAG}>Related</span>}
            {view.related ? <EmojiText text={view.line} /> : <Highlight text={view.line} query={query} />}
          </div>
        )}
      </div>
      {view.flag && <span style={{ ...MONO_META, color: 'var(--acc-terra)', marginTop: 4 }}>{view.flag}</span>}
      {view.chip && (
        <span style={{ ...MONO_META, padding: '4px 8px', borderRadius: 'var(--radius-pill)', marginTop: 1, ...(row.hit.entity_type === 'project' ? { background: 'color-mix(in srgb, var(--acc-blossom) 22%, transparent)', color: 'var(--acc-blossom-text)' } : { background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)' }) }}>
          {view.chip}
        </span>
      )}
      {view.side && <span style={{ ...MONO_META, color: 'var(--ink-faint)', marginTop: 3 }}>{view.side}</span>}
    </button>
  )
}

function ResultGroup({ group, query, ix, now, onGo, offset, activeIndex, onHover, onShowAll, showAll }: { group: GroupView; query: string; ix: ReturnType<typeof indexSearchData>; now: Date; onGo: (h: SearchHit) => void; offset: number; activeIndex: number; onHover: (i: number) => void; onShowAll: () => void; showAll: boolean }) {
  return (
    <section data-search-group={group.key}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 4px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: 'var(--ls-mono)', textTransform: 'uppercase', color: group.tint, whiteSpace: 'nowrap' }}>
          {group.label} · {group.total}
        </span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      {group.rows.map((row, i) => (
        <ResultRow
          key={`${row.hit.entity_type}-${row.hit.entity_id}`}
          row={row}
          view={describeRow(row, ix, query, now)}
          dot={group.dot}
          query={query}
          active={offset + i === activeIndex}
          last={i === group.rows.length - 1 && !showAll}
          onGo={() => onGo(row.hit)}
          onHover={() => onHover(offset + i)}
        />
      ))}
      {showAll && (
        <div style={{ padding: '10px 2px 0', borderTop: '1px dashed var(--line-dashed)' }}>
          <button type="button" onClick={onShowAll} className="kf-hit" style={{ font: 'inherit', fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            Show all {group.total} →
          </button>
        </div>
      )}
    </section>
  )
}

// Search.dc.html 1b — bare soil, one action toward the chat. The export's frame also draws the
// search box and its "0 results" line, but on this page those ARE the real box and count line
// above it (2026-09-26 audit: the page drew both, so two search boxes stacked).
function EmptyResult() {
  return (
    <div style={{ width: '100%', maxWidth: 560, margin: '40px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }} data-search-state="empty">
      <div style={{ position: 'relative', width: 150, height: 110 }}>
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 40%, var(--sky-horizon,#b9a98a), var(--sky-panel-strong,#a3937a) 70%)', boxShadow: 'inset 0 3px 6px rgba(var(--kf-shadow-rgb, 60,52,38),0.28)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 30, width: 46, height: 46, marginLeft: -30, borderRadius: '50%', border: '3px solid var(--ink-faint)', background: 'rgba(244,241,234,0.35)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 14, width: 22, height: 3.5, marginLeft: 10, background: 'var(--ink-faint)', borderRadius: 2, transform: 'rotate(38deg)' }} />
      </div>
      {/* deviation(2026-07-19 X3): hand notes ride var(--ink-muted) so night matches Night.dc's #c9c0d8 (export's light #7a745f was illegible on the night ground) */}
      <div style={HAND}>Nothing's come up for that — try fewer words, or let the chat dig deeper.</div>
      <button type="button" onClick={openChat} style={PILL}>
        Ask the garden (chat) →
      </button>
    </div>
  )
}

// Things were found, but "Open only" / "Any time ▾" hide them all. No design (Phase C): built from
// 1b's own parts — the hand note and the pill — so it can't pass for "nothing found".
function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 28 }} data-search-state="filtered">
      <div style={HAND}>Nothing here with these filters.</div>
      <button type="button" onClick={onClear} style={PILL}>
        Clear filters
      </button>
    </div>
  )
}

// The search didn't answer (offline, or the search function is unwell) — which is NOT "nothing
// found", so it must not wear that copy (2026-09-26 audit). No design exists for this state
// (Phase C); it's built from the empty state's own parts: an existing plant where the soil was
// (clover/resting.png), the same hand note, the same pill — here a retry. Offline (States.dc.html
// t2: calm, the word "error" never appears) it says why and waits for the connection instead.
function RestingResult({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div role="status" style={{ width: '100%', maxWidth: 560, margin: '40px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }} data-search-state={offline ? 'offline' : 'resting'}>
      <img src="/ds/assets/clover/resting.png" alt="" style={{ height: 64, filter: 'var(--shadow-drop-sm)' }} />
      <div style={HAND}>{offline ? SEARCH_OFFLINE : SEARCH_RESTING}</div>
      {!offline && (
        <button type="button" onClick={onRetry} style={PILL}>
          Try again
        </button>
      )}
    </div>
  )
}

const SEARCH_OFFLINE = 'Offline ◌ — search wakes when the connection does.'

/** Every list a row is described from — all cached app-wide already, fetched whole. */
function useSearchIndex() {
  const { data: tasks } = useTasks()
  const { data: events } = useCalendarEvents()
  const { data: inbox } = useAllInboxItems()
  const { data: journal } = useJournalEntries()
  const { data: projects } = useProjects()
  const { data: areas } = useAreas()
  const { data: domains } = useDomains()
  const { data: people } = usePeople()
  const { data: interactions } = useInteractions()
  const { data: books } = useBooks()
  const { data: notes } = useNotes()
  const { data: quotes } = useQuotes()
  const { data: timeEntries } = useTimeEntries()
  return useMemo(
    () => indexSearchData({ tasks, events, inbox, journal, projects, areas, domains, people, interactions, books, notes, quotes, timeEntries }),
    [tasks, events, inbox, journal, projects, areas, domains, people, interactions, books, notes, quotes, timeEntries],
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const openHit = useOpenSearchHit()
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  const search = useSearch(query)
  const { results, status } = search
  const online = useOnline()
  const isMobile = useIsMobile()
  const ix = useSearchIndex()
  const [activeIndex, setActiveIndex] = useState(0)
  // The type chip (a group key); `null` = All.
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  // "Open only" + "Any time ▾" — kept across queries in this visit, like a sort.
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS)
  const inputRef = useRef<HTMLInputElement>(null)

  // The address keeps the query (shareable, survives a reload), on the search's own debounce.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setParams({}, { replace: true })
      return
    }
    const handle = setTimeout(() => setParams({ q: trimmed }, { replace: true }), 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // A fresh answer starts on its first row, under All.
  useEffect(() => {
    setActiveIndex(0)
    setGroupFilter(null)
  }, [results])

  // Back online after a search that couldn't reach the server: ask again by itself.
  const { retry } = search
  useEffect(() => {
    if (online && status === 'resting') retry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // `now` is read with the rows, so a row's "Tomorrow" and the filter's "Today" agree.
  const { rows, now } = useMemo(() => {
    const at = new Date()
    return { rows: searchRows(results, ix, filters, at), now: at }
  }, [results, ix, filters])
  const chips = useMemo(() => chipCounts(rows), [rows])
  const groups = useMemo(() => groupRows(rows, groupFilter), [rows, groupFilter])
  // Flat list in render order so activeIndex maps 1:1 to visible rows.
  const ordered = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const trimmed = query.trim()
  const filtered = filters.openOnly || filters.window !== 'any'
  const windowLabel = TIME_WINDOWS.find((w) => w.value === filters.window)!.label
  const whenChip = filterChip(filters.window !== 'any', true)

  function goTo(hit: SearchHit) {
    openHit(hit) // the thing itself — a task as the sheet on a phone, the editor on a computer
  }

  const typeChips = (
    <>
      {/* Search.dc.html `.fchip` is the kit's filter chip: type chips solid, the two filters dashed until on. */}
      <Chip tone="filter" selected={groupFilter === null} count={rows.length} onClick={() => setGroupFilter(null)}>All</Chip>
      {chips.map((c) => (
        <Chip key={c.key} tone="filter" selected={groupFilter === c.key} count={c.count} onClick={() => { setGroupFilter(c.key); setActiveIndex(0) }}>
          {c.label}
        </Chip>
      ))}
    </>
  )
  const filterChips = (
    <>
      <Chip tone="filter" dashed selected={filters.openOnly} onClick={() => setFilters((f) => ({ ...f, openOnly: !f.openOnly }))}>Open only</Chip>
      <Select
        value={filters.window}
        onChange={(v) => setFilters((f) => ({ ...f, window: v as SearchFilters['window'] }))}
        options={TIME_WINDOWS}
        ariaLabel="When"
        className={`${whenChip.className} kf-press kf-hit`}
        style={whenChip.style}
        display={<>{windowLabel} ▾</>}
      />
    </>
  )

  return (
    <div style={{ width: 920, maxWidth: '100%', margin: '0 auto', padding: isMobile ? '0 0 48px' : '30px 34px 48px' }}>
      <style>{'.search-hl{background:color-mix(in srgb, var(--acc-gold-warm) 32%, transparent);border-radius:2px;padding:0 2px;color:var(--ink-body)} .search-chips::-webkit-scrollbar{display:none}'}</style>

      {/* Phone: the box pins while the groups scroll under it. */}
      <div style={isMobile ? { position: 'sticky', top: -20, zIndex: 2, background: 'var(--paper-linen)', padding: '20px 0 6px', margin: '-20px 0 0' } : undefined}>
        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: isMobile ? '13px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 14 }}>
          <span style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink-faint)' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
              else if (e.key === 'ArrowDown' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i + 1) % ordered.length) }
              else if (e.key === 'ArrowUp' && ordered.length > 0) { e.preventDefault(); setActiveIndex((i) => (i - 1 + ordered.length) % ordered.length) }
              else if (e.key === 'Enter' && ordered[activeIndex]) { e.preventDefault(); goTo(ordered[activeIndex].hit) }
            }}
            placeholder="Search the garden…"
            enterKeyHint="search"
            aria-label="Search"
            style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', color: 'var(--ink-body)', background: 'transparent', border: 'none', outline: 'none' }}
          />
          {!isMobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>esc clears</span>}
        </div>
      </div>

      {/* One count line, and none while resting — a search that didn't answer knows no count. */}
      {trimmed && resultCountLine(search, rows.length) && (
        <div data-search-count style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {resultCountLine(search, rows.length)}
        </div>
      )}

      {/* While the next answer is on its way the last one stays on screen (searchState), chips too. */}
      {trimmed && status !== 'resting' && results.length > 0 &&
        (isMobile ? (
          // Phone: one row that scrolls sideways — the type chips, then the two filters.
          <div className="search-chips" style={{ display: 'flex', gap: 7, marginTop: 14, overflowX: 'auto', scrollbarWidth: 'none', margin: '14px calc(-1 * var(--gutter-phone)) 0', padding: '0 var(--gutter-phone) 2px' }}>
            {typeChips}
            {filterChips}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 7, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>{typeChips}</div>
            <div style={{ display: 'flex', gap: 7, flex: 'none' }}>{filterChips}</div>
          </div>
        ))}

      {trimmed && status === 'searching' && results.length === 0 && (
        <div style={{ marginTop: 18 }}>
          <Skeleton rows={3} />
        </div>
      )}
      {trimmed && status === 'done' && results.length === 0 && <EmptyResult />}
      {trimmed && status === 'done' && results.length > 0 && rows.length === 0 && filtered && <FilteredEmpty onClear={() => setFilters(NO_FILTERS)} />}
      {trimmed && status === 'resting' && <RestingResult offline={!online} onRetry={search.retry} />}

      {status !== 'resting' &&
        groups.reduce<{ nodes: ReactNode[]; offset: number }>(
          (acc, g) => {
            acc.nodes.push(
              <ResultGroup
                key={g.key}
                group={g}
                query={trimmed}
                ix={ix}
                now={now}
                onGo={goTo}
                offset={acc.offset}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                showAll={groupFilter === null && g.total > g.rows.length}
                onShowAll={() => { setGroupFilter(g.key); setActiveIndex(0) }}
              />,
            )
            acc.offset += g.rows.length
            return acc
          },
          { nodes: [], offset: 0 },
        ).nodes}
    </div>
  )
}
