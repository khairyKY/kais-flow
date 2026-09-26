import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useRecentActivity } from './api'
import { FunnelIcon } from '../../components/controlIcons'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useTasks } from '../tasks/api'
import { usePeople } from '../people/api'
import { useRoutines } from '../routines/api'
import { useAllInboxItems } from '../inbox/api'
import { useDomains } from '../domains/api'
import { useCalendarEvents } from '../calendar/api'
import { describeActivity, plural, type ActivityIcon, type ActivityNames } from './describe'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import '../projects/xfx.css'

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks', color: 'var(--acc-blossom)' },
  { id: 'inbox', label: 'Inbox', color: 'var(--acc-hydrangea)' },
  { id: 'routines', label: 'Routines', color: 'var(--acc-moss)' },
  { id: 'calendar', label: 'Calendar', color: 'var(--acc-lavender)' },
  { id: 'people', label: 'People', color: 'var(--acc-clover)' },
  { id: 'journal', label: 'Journal', color: 'var(--acc-sage)' },
  // Punch 48: project events were already in the ledger with no chip that could select them.
  { id: 'projects', label: 'Projects', color: 'var(--acc-moss)' },
]

const MOBILE_CATEGORIES = ['all', 'tasks', 'inbox', 'people', 'routines']

// The row marks the page already drew, keyed by describe.ts's icon kind. `seedling` is new: an
// existing asset for onboarding (it used to get an empty hydrangea disc).
const ICONS: Record<ActivityIcon, { icon: ReactNode; iconBg: string }> = {
  check: {
    iconBg: 'var(--sig-done)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M4 12.5l5 5L20 6" stroke="var(--paper-parchment)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path>
      </svg>
    ),
  },
  cross: {
    iconBg: 'color-mix(in oklch, var(--acc-blossom) 24%, transparent)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acc-clover-text)" strokeWidth="2" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    ),
  },
  inbox: {
    iconBg: 'color-mix(in oklch, var(--acc-hydrangea) 28%, transparent)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acc-hydrangea-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M4 12h16M4 17h10"/>
      </svg>
    ),
  },
  vine: { iconBg: 'color-mix(in oklch, var(--acc-moss) 26%, transparent)', icon: <img src="/ds/assets/vine/flowering.png" alt="" style={{ height: 18 }} /> },
  calendar: {
    iconBg: 'color-mix(in oklch, var(--acc-lavender) 30%, transparent)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acc-lavender-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="16" rx="2"/>
        <path d="M4 9h16M9 3v4M15 3v4"/>
      </svg>
    ),
  },
  clover: { iconBg: 'color-mix(in oklch, var(--acc-clover) 32%, transparent)', icon: <img src="/ds/assets/clover/dewdrop.png" alt="" style={{ height: 16 }} /> },
  fern: { iconBg: 'color-mix(in oklch, var(--acc-moss) 20%, transparent)', icon: <img src="/ds/assets/fern/full.png" alt="" style={{ height: 17 }} /> },
  plus: {
    iconBg: 'color-mix(in oklch, var(--acc-blossom) 24%, transparent)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acc-clover-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    ),
  },
  seedling: { iconBg: 'color-mix(in oklch, var(--acc-hydrangea) 22%, transparent)', icon: <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 16 }} /> },
}

// Punch 48: the chip read "This week" while the filter was a rolling 7-day window and the
// count line claimed "last 7 days" — three different stories. The labels are the export's;
// the windows now mean what they say (week-to-date from Monday, month-to-date), and the count
// line reports the span of what's actually on screen instead of restating the window.
function startOfWeek(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return d.getTime()
}

function startOfMonth(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

const RANGES: { id: string; label: string; since: () => number | null }[] = [
  { id: 'week', label: 'This week', since: startOfWeek },
  { id: 'month', label: 'This month', since: startOfMonth },
  { id: 'all', label: 'All time', since: () => null },
]

export function ActivityPage() {
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()
  const navigate = useNavigate()
  const [limit, setLimit] = useState(50)
  const [filter, setFilter] = useState('all')
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = RANGES[rangeIdx]

  const { data: rawEntries = [], isLoading } = useRecentActivity(limit)
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  const { data: domains = [] } = useDomains()
  const { data: people = [] } = usePeople()
  const { data: routines = [] } = useRoutines()
  const { data: inboxItems = [] } = useAllInboxItems()
  const { data: events = [] } = useCalendarEvents()

  const formatTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const formatDateHeader = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(Date.now() - 86400000)
    const isToday = d.toDateString() === today.toDateString()
    const isYesterday = d.toDateString() === yesterday.toDateString()
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('en-US', { month: 'short' })
    if (isToday) return `Today \u00b7 ${dayName} ${dayNum} ${monthName}`
    if (isYesterday) return `Yesterday \u00b7 ${dayName} ${dayNum} ${monthName}`
    return `${d.toLocaleDateString('en-US', { weekday: 'long' })} \u00b7 ${dayNum} ${monthName}`
  }

  const formatShortDateHeader = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(Date.now() - 86400000)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
  }

  // 2026-09-26 audit (a new person read "Logged an interaction with…", a capture "Captured
  // "inbox item"", a journal save "Updated journal entry — "journal"", a new routine "Routine
  // updated"): the copy now lives in describe.ts — one entry per event type the app writes,
  // unit-tested. This page only lends it the names it already holds and draws the marks.
  const names = useMemo<ActivityNames>(() => {
    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
    const taskMap = byId(tasks)
    const projectMap = byId(projects)
    const areaMap = byId(areas)
    const domainMap = byId(domains)
    const personMap = byId(people)
    const routineMap = byId(routines)
    const inboxMap = byId(inboxItems)
    const eventMap = byId(events)
    return {
      task: (id) => taskMap.get(id),
      project: (id) => projectMap.get(id)?.name,
      area: (id) => areaMap.get(id)?.name,
      domain: (id) => domainMap.get(id)?.name,
      person: (id) => personMap.get(id)?.name,
      routine: (id) => routineMap.get(id)?.name,
      inbox: (id) => inboxMap.get(id)?.raw_text,
      event: (id) => eventMap.get(id)?.title,
    }
  }, [tasks, projects, areas, domains, people, routines, inboxItems, events])

  const processedEntries = useMemo(() => {
    const cutoff = range.since()
    return rawEntries
      .filter((entry) => !cutoff || new Date(entry.created_at).getTime() >= cutoff)
      .map((entry) => {
        const line = describeActivity(entry, names)
        return { ...entry, info: { ...line, ...ICONS[line.icon] } }
      })
      .filter((entry) => filter === 'all' || entry.info.category === filter)
  }, [rawEntries, filter, range, names])

  const groupedEntries = useMemo(() => {
    const groups: Record<string, typeof processedEntries> = {}
    for (const entry of processedEntries) {
      const dateKey = new Date(entry.created_at).toDateString()
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(entry)
    }
    return Object.entries(groups)
  }, [processedEntries])

  const totalCount = processedEntries.length
  const handleLoadEarlier = () => setLimit((prev) => prev + 50)

  // The export's "31 events · last 3 days": the span of what's on screen, read off the data.
  const spanLabel = useMemo(() => {
    if (processedEntries.length === 0) return 'nothing yet'
    const oldest = new Date(processedEntries[processedEntries.length - 1].created_at).getTime()
    const days = Math.max(1, Math.ceil((Date.now() - oldest) / 86400000))
    return days === 1 ? 'today' : `last ${days} days`
  }, [processedEntries])

  const chipBg = (cat: string) =>
    cat === 'tasks' ? 'color-mix(in oklch, var(--acc-blossom) 24%, transparent)' :
    cat === 'inbox' ? 'color-mix(in oklch, var(--acc-hydrangea) 24%, transparent)' :
    cat === 'routines' ? 'color-mix(in oklch, var(--acc-moss) 20%, transparent)' :
    cat === 'calendar' ? 'color-mix(in oklch, var(--acc-lavender) 24%, transparent)' :
    cat === 'people' ? 'color-mix(in oklch, var(--acc-clover) 22%, transparent)' :
    cat === 'journal' ? 'color-mix(in oklch, var(--acc-moss) 20%, transparent)' :
    'color-mix(in oklch, var(--ink-body) 7%, transparent)'

  const chipColor = (cat: string) =>
    cat === 'tasks' ? 'var(--acc-clover-text)' :
    cat === 'inbox' ? 'var(--acc-hydrangea-deep)' :
    cat === 'routines' ? 'var(--acc-sage-text)' :
    cat === 'calendar' ? 'var(--acc-lavender-deep)' :
    cat === 'people' ? 'var(--acc-clover-text)' :
    cat === 'journal' ? 'var(--acc-sage-text)' :
    'var(--ink-muted)'

  const styles = `
    .afilter { font-family:var(--font-mono); font-size:9.5px; letter-spacing:0.08em; text-transform:uppercase; padding:6px 12px; border-radius:999px; cursor:pointer; border:1px solid var(--line-solid); color:var(--ink-muted); background:transparent; white-space:nowrap; user-select:none; display:inline-flex; align-items:center; transition:all 0.2s; }
    .afilter.on { background:var(--ink-body); color:var(--paper-parchment); border-color:var(--ink-body); }
    .aitem { display:flex; gap:15px; padding:0 2px; position:relative; }
    .arail { width:30px; flex:none; display:flex; flex-direction:column; align-items:center; }
    .aicon { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; z-index:2; box-shadow:var(--shadow-crisp); }
    .aline { flex:1; width:1.5px; border-left:1.5px dashed var(--line-dashed); margin:2px 0; }
    .abody { flex:1; min-width:0; padding-bottom:20px; }
    button.abody { background:none; border:none; padding:0; color:inherit; font:inherit; text-align:left; width:100%; cursor:pointer; border-radius:5px; }
    button.abody:hover, button.abody:focus-visible { background:color-mix(in oklch, var(--ink-body) 4%, transparent); }
    .chip { font-family:var(--font-mono); font-size:9.5px; letter-spacing:0.06em; text-transform:uppercase; padding:4px 9px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
    .fhelp { font-family:var(--font-mono); font-size:8.5px; letter-spacing:0.06em; color:var(--ink-hairline); }
    .slabel { display:flex; align-items:center; gap:12px; font-family:var(--font-mono); font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-faint); }
    .slabel .r { flex:1; height:1px; border-bottom:1px dashed var(--line-dashed); }
  `

  const renderItem = (entry: typeof processedEntries[0], idx: number, groupLen: number) => {
    // A real <button> when the row leads somewhere, so Tab/Enter reach it; a plain div otherwise.
    const Body = entry.info.href ? 'button' : 'div'
    return (
    <div className={motion ? 'aitem kf-stagger-item' : 'aitem'} style={motion ? staggerDelay(idx) : undefined} key={entry.id}>
      <div className="arail">
        <span className="aicon" style={{ width: isMobile ? 26 : 30, height: isMobile ? 26 : 30, background: entry.info.iconBg }}>{entry.info.icon}</span>
        {idx < groupLen - 1 && <span className="aline" />}
      </div>
      <Body
        className="abody"
        {...(entry.info.href ? { type: 'button' as const, onClick: () => navigate(entry.info.href!) } : {})}
        style={{ paddingBottom: isMobile ? 15 : 20 }}
      >
        {/* spans, not divs: this subtree also renders inside a <button> on navigable rows */}
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: isMobile ? 13.5 : 14.5, color: 'var(--ink-body)' }}>{entry.info.text}</span>
          {!isMobile && <span className="fhelp" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatTime(entry.created_at)}</span>}
        </span>
        <span style={{ marginTop: isMobile ? 3 : 4, display: 'flex', alignItems: 'center', gap: isMobile ? 7 : 8 }}>
          <span className="chip" style={{ fontSize: isMobile ? 8 : 9.5, padding: isMobile ? '3px 7px' : '4px 9px', background: isMobile ? 'var(--paper-bone)' : chipBg(entry.info.category), color: isMobile ? 'var(--ink-muted)' : chipColor(entry.info.category), border: isMobile ? '1px solid var(--line-solid)' : 'none' }}>{entry.info.category}</span>
          <span className="fhelp">{isMobile ? formatTime(entry.created_at) : entry.info.details}</span>
        </span>
      </Body>
    </div>
    )
  }

  if (isMobile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <style>{styles}</style>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5, borderRadius: 46 }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 0', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'color-mix(in oklch, var(--acc-hydrangea) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'var(--shadow-drop-sm)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--acc-hydrangea-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5 6 5-12 2.5 6h4"/></svg>
            </span>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>Activity</div>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0 4px', scrollbarWidth: 'none' }} className="no-scrollbar">
            {CATEGORIES.filter((cat) => MOBILE_CATEGORIES.includes(cat.id)).map((cat) => (
              <span key={cat.id} onClick={() => setFilter(cat.id)} className={`afilter ${filter === cat.id ? 'on' : ''}`} style={{ fontSize: 8.5, padding: '5px 10px' }}>
                {cat.label}
              </span>
            ))}
          </div>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Loading the ledger...</div>
          ) : groupedEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--ink-muted)' }}>nothing is logged you didn't do — just a trail behind you ✿</div>
          ) : (
            groupedEntries.map(([dateKey, group]) => (
              <div key={dateKey}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-body)' }}>{formatShortDateHeader(dateKey)}</span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)' }}>{group.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>{group.map((e, i) => renderItem(e, i, group.length))}</div>
              </div>
            ))
          )}
          {!isLoading && rawEntries.length >= limit && (
            <div style={{ margin: '8px 0 24px', padding: '14px 0', borderTop: '1px dashed var(--line-dashed)', display: 'flex', justifyContent: 'center' }}>
              <span onClick={handleLoadEarlier} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Load earlier ↓</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <style>{styles}</style>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}>
        {/* polish-c (2026-09-26 audit): no in-page "Kai's Flow · Activity / Africa/Cairo" strip —
            that was Activity.dc.html's mock of the shell topbar (<main>'s first child, 42px), and
            the real shell already draws the topbar above this page. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '34px 48px 40px', maxWidth: 880 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 50, height: 50, borderRadius: '50%', background: 'color-mix(in oklch, var(--acc-hydrangea) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'var(--shadow-drop-sm)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--acc-hydrangea-deep)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5 6 5-12 2.5 6h4"/></svg>
              </span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Activity · the ledger</div>
                <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>Everything, in order</h1>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="fhelp">{plural(totalCount, 'event')} · {spanLabel}</span>
              <span
                onClick={() => setRangeIdx((i) => (i + 1) % RANGES.length)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, userSelect: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
              >
                <FunnelIcon /> {range.label} ▾
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 4px' }}>
            {CATEGORIES.map((cat) => (
              <span key={cat.id} onClick={() => setFilter(cat.id)} className={`afilter ${filter === cat.id ? 'on' : ''}`}>
                {cat.id !== 'all' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color || 'var(--acc-blossom)', marginRight: 6, display: 'inline-block' }} />}
                {cat.label}
              </span>
            ))}
          </div>
          {isLoading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-muted)' }}>Loading activity log...</div>
          ) : groupedEntries.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)' }}>nothing is logged you didn't do — just a trail behind you ✿</div>
          ) : (
            groupedEntries.map(([dateKey, group]) => (
              <div key={dateKey}>
                <div className="slabel" style={{ margin: '24px 0 16px' }}>
                  <span style={{ color: 'var(--ink-body)' }}>{formatDateHeader(dateKey)}</span>
                  <span className="r" />
                  <span style={{ color: 'var(--ink-hairline)' }}>{plural(group.length, 'event')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>{group.map((e, i) => renderItem(e, i, group.length))}</div>
              </div>
            ))
          )}
          {!isLoading && groupedEntries.length > 0 && (
            <div style={{ marginTop: 8, padding: '14px 0', borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 12 }}>
              {rawEntries.length >= limit ? (
                <span onClick={handleLoadEarlier} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Load earlier ↓</span>
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>End of ledger</span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-0.8deg)' }}>nothing is logged you didn't do — just a trail behind you ✿</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
