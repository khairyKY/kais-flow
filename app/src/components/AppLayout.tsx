import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { get } from 'idb-keyval'
import { PageFallback } from './PageFallback'
import { useFocusTicker } from '../features/focus/focusStore'
import { supabase } from '../lib/supabase'
import type { OutboxEntry } from '../lib/outbox'
import { useRealtimeSync } from '../lib/realtime'
import { useCommandBarStore } from '../features/command-bar/commandBarStore'
import { usePendingInboxItems } from '../features/inbox/api'
import { useTasks } from '../features/tasks/api'
import { filterByList, type SmartList } from '../features/tasks/grouping'
import { useRoutines, useRoutineCompletions } from '../features/routines/api'
import { computeStreak } from '../features/routines/streaks'
import { useMotionEnabled } from '../lib/motion'
import { FocusGlyph, InboxGlyph, ProjectsGlyph, ReviewGlyph, RoutinesGlyph } from './icons/NavGlyphs'
// Punch 5 (bundle): these four render only after a keypress, so they have no business in
// the initial chunk. Lazy + mounted-only-when-open. ⌘K's listener moved into the shell's
// hotkey effect below, since CommandBar used to own it and can no longer be always-mounted.
const CommandBar = lazy(() => import('../features/command-bar/CommandBar').then((m) => ({ default: m.CommandBar })))
const ChatPanel = lazy(() => import('../features/chat/ChatPanel').then((m) => ({ default: m.ChatPanel })))
const SearchOverlay = lazy(() => import('../features/search/SearchOverlay').then((m) => ({ default: m.SearchOverlay })))
const ShortcutOverlay = lazy(() => import('./ShortcutOverlay').then((m) => ({ default: m.ShortcutOverlay })))

import { ToastHost } from './ToastHost'
import { MobileTabBar } from './MobileTabBar'
import { SeasonTopbarEcho } from '../features/seasons/TopbarEcho'

// ── Design source of truth: Editor.dc.html option 1a (expanded, Plan open) +
// 1g (Plan folded / rail collapsed), refined against "Kai's Flow — Universal
// Navigation Reference" (per-item active icon + washi-tape spec, 2026-07-16).
// Sidebar groups Plan (drawer) · Tend · Cultivate; later surfaces (Projects,
// People, Activity) placed per the newer files' sidebars. Colored dot per
// surface accent when inactive; the species PNG/SVG the design shows when
// active, washi tape tinted per page. ──

const A = '/ds/assets'

// Reference's "terrarium species" flower glyph — same five-ellipse shape, fill/center vary per page.
function FlowerIcon({ fill, center }: { fill: string; center: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flex: 'none' }}>
      <g fill={fill}>
        <ellipse cx="12" cy="6.2" rx="2.7" ry="3.4" />
        <ellipse cx="17" cy="10" rx="2.7" ry="3.4" transform="rotate(72 17 10)" />
        <ellipse cx="15" cy="16" rx="2.7" ry="3.4" transform="rotate(144 15 16)" />
        <ellipse cx="9" cy="16" rx="2.7" ry="3.4" transform="rotate(216 9 16)" />
        <ellipse cx="7" cy="10" rx="2.7" ry="3.4" transform="rotate(288 7 10)" />
      </g>
      <circle cx="12" cy="11" r="2.4" fill={center} />
    </svg>
  )
}

type NavItem = {
  to: string
  label: string
  dot: string // accent CSS var for the resting dot
  img?: string // always-shown species PNG (design shows Journal's fern this way), opacity bumps on active
  activeImg?: string // species PNG shown only when the row is active
  activeIcon?: ReactNode // inline SVG shown when the row is active or the rail is collapsed
  badge?: 'inbox'
  tape: string // washi-tape rgba tint on the active row (Navigation Reference §02)
}

// Punch 58 (Kai's V1 ruling): rail icons ALL simple — Inbox/Projects/Routines/
// Focus/Review swap their species PNG renders for line glyphs (icons/NavGlyphs.tsx).
// Today/Tasks/Calendar keep the flower glyph, People the clover, Activity the dot.
const TEND: NavItem[] = [
  { to: '/today', label: 'Today', dot: '--acc-sage', activeIcon: <FlowerIcon fill="var(--acc-sage)" center="var(--acc-gold-warm)" />, tape: 'color-mix(in srgb, var(--acc-sage) 40%, transparent)' },
  { to: '/inbox', label: 'Inbox', dot: '--acc-hydrangea', badge: 'inbox', activeIcon: <InboxGlyph />, tape: 'color-mix(in srgb, var(--acc-hydrangea) 55%, transparent)' },
  // R4 (2026-07-20 audit): "the tasks page has a small flower icon while the live local host has
  // the entire rendered flower — the correct thing is the one in the design export." Tasks.dc.html
  // line 225 specifies the 18px five-ellipse glyph (fill var(--acc-blossom), centre #C98A4B), not
  // cherry/bloom.png. Checked every page: Today/Calendar already used the glyph, and
  // Routines/Inbox genuinely do specify PNGs in their own exports — so this is per-page, and
  // Tasks was the odd one out.
  { to: '/tasks', label: 'Tasks', dot: '--acc-blossom', activeIcon: <FlowerIcon fill="var(--acc-blossom)" center="#C98A4B" />, tape: 'color-mix(in srgb, var(--acc-blossom) 45%, transparent)' },
  { to: '/calendar', label: 'Calendar', dot: '--acc-lavender', activeIcon: <FlowerIcon fill="var(--acc-lavender)" center="#D9B65C" />, tape: 'color-mix(in srgb, var(--acc-lavender) 45%, transparent)' },
  { to: '/projects', label: 'Projects', dot: '--acc-moss', activeIcon: <ProjectsGlyph />, tape: 'color-mix(in srgb, var(--acc-moss) 45%, transparent)' },
]

const CULTIVATE: NavItem[] = [
  { to: '/routines', label: 'Routines', dot: '--acc-moss', activeIcon: <RoutinesGlyph />, tape: 'color-mix(in srgb, var(--acc-moss) 45%, transparent)' },
  // Not in the Navigation Reference — added per 2026-07-18 audit A7 (Focus was unreachable).
  { to: '/focus', label: 'Focus', dot: '--acc-gold-warm', activeIcon: <FocusGlyph />, tape: 'color-mix(in srgb, var(--acc-gold-warm) 45%, transparent)' },
  { to: '/weekly-review', label: 'Review', dot: '--acc-buttercream', activeIcon: <ReviewGlyph />, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  // Journal is back per D-1 (Kai, 2026-07-26): one daily page, many timestamped entries.
  { to: '/journal', label: 'Journal', dot: '--acc-buttercream', img: `${A}/fern/full.png`, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  // [K-26] 2026-07-26 (punch 65): Library is PARKED to v2 entirely — nav row out, route stays
  // URL-only so nothing is lost when it returns (same treatment as Journal below).
  // { to: '/library', label: 'Library', dot: '--acc-buttercream', activeImg: `${A}/tools/pen.png`, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  { to: '/people', label: 'People', dot: '--acc-clover', activeImg: `${A}/clover/awake.png`, tape: 'color-mix(in srgb, var(--acc-clover) 45%, transparent)' },
  // Not in the Navigation Reference (Kai kept it anyway) — same tape formula as every other item, own dot color.
  { to: '/activity', label: 'Activity', dot: '--acc-gold', tape: 'color-mix(in srgb, var(--acc-gold) 45%, transparent)' },
  // Punch 50: the quiet Trash link the design puts at the bottom of the nav (it had no entry
  // point at all — URL-only). Hairline dot keeps it visually last in the list's hierarchy.
  { to: '/trash', label: 'Trash', dot: '--ink-hairline', tape: 'rgba(122,110,94,0.35)' },
]

const smartLists: { list: SmartList; label: string }[] = [
  { list: 'today', label: 'Due Today' },
  { list: 'week', label: 'This Week' },
  { list: 'month', label: 'This Month' },
  { list: 'upcoming', label: 'Upcoming' },
]

// The Plan drawer — Editor 1a. Foldable; count keeps whispering when folded (1g).
function PlanDrawer() {
  const { data: tasks = [] } = useTasks()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const activeList = pathname === '/tasks' ? params.get('list') : null
  const [open, setOpen] = useState(() => localStorage.getItem('kf.planOpen') !== '0')
  useEffect(() => {
    localStorage.setItem('kf.planOpen', open ? '1' : '0')
  }, [open])

  const todayCount = filterByList(tasks, 'today').length

  const row = (to: string, label: string, active: boolean, count?: number, icon?: React.ReactNode) => (
    <Link
      key={to}
      to={to}
      className={`kf-side-row${active ? ' kf-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '6px 11px',
        borderRadius: 6,
        textDecoration: 'none',
        background: active ? 'var(--paper-parchment)' : 'none',
        border: active ? '1px solid var(--line-card)' : '1px solid transparent',
      }}
    >
      <span style={{ width: 16, flex: 'none', display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{label}</span>
      {count != null && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{count}</span>
      )}
    </Link>
  )

  return (
    <div
      className="app-smartlist"
      style={{ padding: '0 14px 12px', margin: '0 0 10px', borderBottom: '1px dashed var(--line-sidebar)', display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '7px 11px',
          marginBottom: 3,
          borderRadius: 6,
          background: 'var(--paper-linen)',
          border: '1px solid var(--line-sidebar)',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: 15, width: 'auto' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Plan</span>
        <span
          aria-hidden="true"
          className="kf-plan-chevron"
          style={{ fontSize: 10, color: 'var(--ink-faint)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform var(--dur-quick) var(--ease-spring)' }}
        >
          ›
        </span>
        {!open && todayCount > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{todayCount}</span>
        )}
      </button>
      {open && (
        <>
          {smartLists.map(({ list, label }) => row(`/tasks?list=${list}`, label, activeList === list, filterByList(tasks, list).length))}
          <div style={{ height: 1, borderTop: '1px dashed var(--line-sidebar)', margin: '4px 11px' }} />
          {row('/tasks?list=someday', 'Someday', activeList === 'someday', filterByList(tasks, 'someday').length, (
            <img src={`${A}/fern/coil.png`} alt="" style={{ height: 14, opacity: 0.8 }} />
          ))}
          {/* R4-27 (Kai's 2026-07-20 ruling): "planning board looks like shit, park it until I
              redesign it." Nav entry removed so it can't be reached by accident; the route and
              component stay in the codebase for when he redesigns it. */}
        </>
      )}
    </div>
  )
}

function NavRow({ item, pendingInbox, collapsed }: { item: NavItem; pendingInbox: number; collapsed?: boolean }) {
  const { pathname } = useLocation()
  const isActive = pathname === item.to

  // R4-1 (2026-07-20 audit): "I don't see the cluster of icons that are supposed to happen when
  // these sidebars collapse." Only the *active* row ever drew its species icon; every other row
  // fell through to an 8px dot. Expanded that's fine — the label carries the meaning — but
  // collapsing hides the labels, leaving a column of anonymous dots instead of Editor-1g's icon
  // rail. Collapsed, every row now draws its own icon (dimmed until active).
  const icon = (active: boolean) => {
    const showSpecies = active || collapsed
    if (item.img) return <img src={item.img} alt="" style={{ height: 16, opacity: active ? 1 : 0.85 }} />
    if (showSpecies && item.activeIcon)
      // Explicit color: line glyphs stroke currentColor, and the Link sets no color of its own.
      return <span style={{ display: 'flex', opacity: active ? 1 : 0.7, color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{item.activeIcon}</span>
    if (showSpecies && item.activeImg) return <img src={item.activeImg} alt="" style={{ height: 16, opacity: active ? 1 : 0.7 }} />
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${item.dot})` }} />
  }
  return (
    <Link
      to={item.to}
      className={`kf-side-row${isActive ? ' kf-active' : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '8px 12px',
        borderRadius: 6,
        textDecoration: 'none',
        background: isActive ? 'var(--paper-parchment)' : 'none',
        border: isActive ? '1px solid var(--line-card)' : '1px solid transparent',
        boxShadow: isActive ? 'var(--shadow-crisp)' : 'none',
        transform: isActive ? 'rotate(-0.5deg)' : 'none',
      }}
    >
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -6,
            left: 16,
            width: 30,
            height: 9,
            background: item.tape,
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
            transform: 'rotate(-3deg)',
            borderRadius: 1,
          }}
        />
      )}
      <span className="kf-nav-icon" style={{ width: 18, display: 'flex', justifyContent: 'center', flex: 'none' }}>{icon(isActive)}</span>
      <span className="app-nav-label" style={{ fontSize: 14, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--ink-body)' : 'var(--ink-muted)' }}>
        {item.label}
      </span>
      {/* R4 (2026-07-20 audit): an icon-only rail is unreadable on its own — "this would make
          the nav bar dysfunctional". Hovering a collapsed row flies its name out to the right,
          in the export's own nav type (14px, --ink-body on parchment with the card border). */}
      {collapsed && (
        <span className="kf-nav-flyout" aria-hidden="true">
          {item.label}
        </span>
      )}
      {item.badge === 'inbox' && pendingInbox > 0 && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--acc-terra)' }}>{pendingInbox}</span>
      )}
    </Link>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-nav-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-hairline)', padding: '12px 12px 5px' }}>
      {children}
    </div>
  )
}

// Overall streak across active routines — Editor 1a footer widget, real data.
// Vine stage by streak length: bare / sprouting / flowering / lush (growth system).
function StreakWidget() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()

  const { current, best } = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let current = 0
    let best = 0
    for (const r of routines) {
      if (!r.active) continue
      const s = computeStreak(byRoutine.get(r.id) ?? [], r.cadence)
      current = Math.max(current, s.current)
      best = Math.max(best, s.best)
    }
    return { current, best }
  }, [routines, completions])

  const stage = current >= 30 ? 'lush' : current >= 7 ? 'flowering' : current >= 1 ? 'sprouting' : 'bare'

  return (
    <div
      className="app-vine"
      style={{ margin: '0 22px 12px', padding: '12px 0', borderTop: '1px dashed var(--line-sidebar)', borderBottom: '1px dashed var(--line-sidebar)', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <img src={`${A}/vine/${stage}.png`} alt="" style={{ height: 40, width: 'auto', filter: 'var(--shadow-drop-sm)' }} />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Streak</div>
        <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 1 }}>
          {current} {current === 1 ? 'day' : 'days'} · best {best}
        </div>
      </div>
    </div>
  )
}

// Footer utility icons — inline verbatim from Editor 1a.
const PlusGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const SearchGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.4" /><path d="M19.5 19.5 16 16" /></svg>
)
const ChatGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4.5H4a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h3v3.2L11.2 17H20a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1Z" /></svg>
)
const GearGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7.4" /><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>
)
const SignOutGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9" /></svg>
)

function footerRow(icon: React.ReactNode, label: string, shortcut: string | undefined, onClick: () => void, faint = false) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kf-side-row"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: faint ? '6px 12px' : '7px 12px', borderRadius: 6, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{icon}</span>
      <span className="app-footer-label" style={{ fontSize: faint ? 12.5 : 13.5, color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{label}</span>
      {shortcut && <span className="app-footer-label" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>{shortcut}</span>}
    </button>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// ── Topbar sync strip — States.dc.html 2a/2b/2d, wired to the REAL outbox queue.
// Event-driven via outbox's 'kf-outbox-change' (foundation patch landed); the slow
// interval is only a belt-and-braces fallback.
// "Needs a look ⚠" (conflict) is N/A until the outbox grows conflict detection. ──
function useOutboxQueue(): OutboxEntry[] {
  const [queue, setQueue] = useState<OutboxEntry[]>([])
  useEffect(() => {
    let alive = true
    const read = () => void get<OutboxEntry[]>('kf-outbox').then((q) => { if (alive) setQueue(q ?? []) })
    read()
    const t = setInterval(read, 30_000)
    window.addEventListener('kf-outbox-change', read)
    window.addEventListener('online', read)
    window.addEventListener('offline', read)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('kf-outbox-change', read)
      window.removeEventListener('online', read)
      window.removeEventListener('offline', read)
    }
  }, [])
  return queue
}

const QUEUE_KIND: Record<string, string> = {
  tasks: 'task', inbox_items: 'inbox', journal_entries: 'journal', calendar_events: 'event', routines: 'routine',
}
function queueAgo(ts: number): string {
  const min = Math.max(1, Math.round((Date.now() - ts) / 60_000))
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)}h ago`
}

function TopBar() {
  const online = useOnline()
  const motionOn = useMotionEnabled()
  const queue = useOutboxQueue()
  const n = queue.length
  const [popOpen, setPopOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  // States 2d — reconnect: the only celebration is one glint on the dot, 300ms.
  const prevPending = useRef(0)
  const [glint, setGlint] = useState(false)
  useEffect(() => {
    const was = prevPending.current
    prevPending.current = n
    if (was > 0 && n === 0 && online && motionOn) {
      setGlint(true)
      const t = setTimeout(() => setGlint(false), 600)
      return () => clearTimeout(t)
    }
  }, [n, online, motionOn])

  useEffect(() => {
    if (!popOpen) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popOpen])

  // F5b: design format is `Fri 10 Jul` — weekday, day (no zero-pad), month, no commas.
  const now = new Date()
  const dateLabel = `${now.toLocaleDateString('en-GB', { weekday: 'short' })} ${now.getDate()} ${now.toLocaleDateString('en-GB', { month: 'short' })}`
  // The ◌ glyph lives in the status STRING for offline (design position: `Offline ◌ — N saved here`);
  // the trailing sage ● renders only when truly synced — States 2a: Syncing shows no dot.
  const status = !online ? (n > 0 ? `Offline ◌ — ${n} saved here` : 'Offline ◌') : n > 0 ? `Syncing ↻ ${n}` : 'Synced'
  return (
    <div
      className="app-topbar"
      style={{ position: 'relative', height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 40px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span>Kai's Flow · {dateLabel} ·</span>
        <button
          type="button"
          onClick={() => setPopOpen((v) => !v)}
          className="kf-hit"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: !online || n > 0 ? 'var(--ink-muted)' : 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {status}
          {online && n === 0 && (
            <span style={{ color: 'var(--acc-sage)', animation: glint ? 'twinkle 300ms var(--ease-out)' : undefined, textShadow: glint ? '0 0 6px rgba(232,217,160,0.9)' : undefined }}>●</span>
          )}
        </button>
        <SeasonTopbarEcho />
      </div>
      <div style={{ flex: 'none' }}>Africa/Cairo</div>

      {popOpen && (
        <div
          ref={popRef}
          className="kf-sync-pop kf-overlay-card"
          style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '12px 14px', textTransform: 'none', letterSpacing: 'normal' }}
        >
          {n === 0 ? (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-body)' }}>All caught up.</div>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: !online ? 'var(--ink-muted)' : 'var(--acc-sage-text)' }}>
                {online ? `Syncing ↻ ${n}` : `Offline ◌ · ${n} saved here`}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {queue.map((e) => {
                  const p = e.payload as Record<string, unknown>
                  const label = (p.title ?? p.raw_text ?? p.name ?? '') as string
                  return (
                    <div key={`${e.table}-${e.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-body)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', flex: 'none' }}>
                        {QUEUE_KIND[e.table] ?? e.table}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label ? `'${label}'` : ''} {e.op === 'delete' ? 'removed' : 'saved'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)', flex: 'none' }}>{queueAgo(e.queuedAt)}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)' }}>
                {online ? 'syncing now — nothing lost ✿' : "Everything here syncs the moment you're back."}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function AppLayout() {
  useRealtimeSync()
  // R4-D3: keeps a running Focus session ticking wherever Kai navigates.
  useFocusTicker()
  const motionOn = useMotionEnabled()
  const { pathname } = useLocation()
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('kf.sidebarCollapsed') === '1')
  useEffect(() => {
    localStorage.setItem('kf.sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)
  const toggleCommandBar = useCommandBarStore((s) => s.toggle)
  const commandBarOpen = useCommandBarStore((s) => s.open)
  const { data: pendingInbox = [] } = usePendingInboxItems()

  // Cold boot shouldn't animate content in (nothing else on screen is settling yet) — only
  // genuine client-side route landings should. True only for the very first render.
  const isFirstMount = useRef(true)
  useEffect(() => {
    isFirstMount.current = false
  }, [])

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandBar()
      }
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n') {
        e.preventDefault()
        setCommandBarOpen(true)
      }
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [setCommandBarOpen, toggleCommandBar])

  return (
    <div className={`app-shell${motionOn ? ' motion-on' : ''}`} style={{ height: '100dvh', display: 'flex', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        .app-tabbar { display: none; }
        @media (max-width: 767px) {
          .app-sidebar { display: none !important; }
          .app-topbar { padding: 0 16px !important; }
          .app-main-content { padding: 20px 16px calc(64px + env(safe-area-inset-bottom) + 24px) !important; }
          .app-tabbar { display: flex !important; }
        }
        .app-sidebar.collapsed { width: 64px !important; }
        /* Collapsed-rail hover label (R4). Sits outside the 64px rail, so the rail keeps its
           width and the label floats over the page. Styled to the export's nav row: parchment,
           card border, crisp shadow, 14px --ink-body. */
        .app-sidebar.collapsed .kf-nav-flyout {
          position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none; opacity: 0;
          background: var(--paper-parchment); border: 1px solid var(--line-card);
          box-shadow: var(--shadow-crisp); border-radius: 6px; padding: 6px 11px;
          font-size: 14px; color: var(--ink-body); z-index: 60;
          transition: opacity var(--dur-quick) var(--ease-out);
        }
        .app-sidebar.collapsed .kf-side-row:hover .kf-nav-flyout,
        .app-sidebar.collapsed .kf-side-row:focus-visible .kf-nav-flyout { opacity: 1; }
        .app-sidebar.collapsed .app-sidebar-header,
        .app-sidebar.collapsed .app-nav-label,
        .app-sidebar.collapsed .app-footer-label,
        .app-sidebar.collapsed .app-vine,
        .app-sidebar.collapsed .app-smartlist { display: none !important; }

        .kf-side-row {
          transition: transform var(--dur-quick) var(--ease-spring);
        }
        .kf-side-row:hover { background: var(--paper-bone) !important; transform: translateX(3px); }
        .kf-side-row:active { transform: translateX(1px); }
        .kf-side-row.kf-active:hover { background: var(--paper-parchment) !important; }
        .motion-on .kf-side-row:hover .kf-nav-icon { animation: cloverSway 1.6s var(--ease-natural) infinite; transform-origin: 50% 100%; }

        .kf-collapse-btn {
          transition: transform var(--dur-quick) var(--ease-spring),
                      color var(--dur-normal) var(--ease-natural);
        }
        .kf-collapse-btn:hover { transform: scale(1.15); color: var(--ink-muted); }
        .kf-collapse-btn:active { transform: scale(0.97); }

        /* X2 Motion 4a — resting layer: hover lifts a breath, press gives to 0.97 in 80ms. */
        .kf-btn { transition: transform var(--dur-quick) var(--ease-out), box-shadow var(--dur-quick) var(--ease-out); }
        .kf-btn:hover { transform: translateY(-1px); }
        .kf-btn:active { transform: scale(0.97); transition-duration: 80ms; }

        .kf-backlink { transition: background var(--dur-quick) var(--ease-out), color var(--dur-quick) var(--ease-out); }
        .kf-backlink:hover { background: var(--paper-bone); color: var(--ink-body); }
        .kf-backlink:active { transform: scale(0.97); transition-duration: 80ms; }

        /* Effects 2g (focus dim) — PARKED per Kai's R4 ruling 2026-07-20: "I don't think
           that it should apply to everywhere on the elements, not every item… park this for
           now and we can reuse it later." It read unsharp across a whole list; the export
           uses it to lift ONE card while the room steps back. The .kf-dim hooks stay in the
           markup (Today, Inbox) so re-enabling it for a single surface is this block again. */

        /* X2 Motion 3c — overlay in: card + scrim arrive together, 210ms up-and-settle.
           Keyframes end at transform:none (containing-block rule, tokens/motion.css). */
        @keyframes kfOverlayIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes kfFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes kfSheetIn { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes kfDrawerIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        .kf-overlay-card { animation: kfOverlayIn 210ms var(--ease-out); }
        .kf-scrim { animation: kfFadeIn 210ms var(--ease-out); background: rgba(11, 10, 8, 0.2); }
        .kf-sheet { animation: kfSheetIn 210ms var(--ease-out); }
        .kf-drawer { animation: kfDrawerIn 210ms var(--ease-out); }
        .kf-fade { animation: kfFadeIn 160ms var(--ease-out); }

        /* F4 Motion 3c — overlay OUT: 140ms drop; pair with useOverlayExit (lib/motion.ts).
           .kf-scrim now carries the canonical 20% scrim (3c); feature-file inline backgrounds
           still override it — WB-1 deletes those inline values instead of retinting them. */
        @keyframes kfOverlayOut { to { opacity: 0; transform: translateY(6px) scale(0.99); } }
        @keyframes kfFadeOut { to { opacity: 0; } }
        @keyframes kfSheetOut { to { opacity: 0; transform: translateY(20px); } }
        @keyframes kfDrawerOut { to { opacity: 0; transform: translateX(18px); } }
        .kf-overlay-card--out { animation: kfOverlayOut 140ms var(--ease-in) both; }
        .kf-scrim--out { animation: kfFadeOut 140ms var(--ease-in) both; }
        .kf-sheet--out { animation: kfSheetOut 140ms var(--ease-in) both; }
        .kf-drawer--out { animation: kfDrawerOut 140ms var(--ease-in) both; }

        /* X2 Motion 1f — the sidebar streak plant is the app's sole persistent loop. */
        @keyframes kfLeafSway { 0%, 100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
        .motion-on .app-vine img { animation: kfLeafSway 5.8s var(--ease-natural) infinite; transform-origin: 50% 100%; }

        /* X4 — >=44px touch targets for small glyph controls, coarse pointers only. */
        .kf-hit { position: relative; }
        .kf-checkbox { position: relative; }
        @media (pointer: coarse) {
          .kf-hit::after { content: ''; position: absolute; inset: -12px; }
          .kf-checkbox::after { content: ''; position: absolute; inset: -13px; }
        }

        /* X5 States 2b — sync queue popover; bottom sheet on mobile. */
        .kf-sync-pop { position: absolute; top: 38px; left: 40px; z-index: 200; width: 300px; }
        @media (max-width: 767px) {
          .kf-sync-pop { position: fixed; top: auto; left: 10px; right: 10px; bottom: calc(74px + env(safe-area-inset-bottom)); width: auto; }
        }
      `}</style>

      {/* A1 (2026-07-18 audit): overflow stays visible on the aside so the collapse button can
          overhang the divider at right:-12 un-clipped — scrolling lives on the inner column. */}
      <aside
        className={`app-sidebar${collapsed ? ' collapsed' : ''}`}
        style={{ width: 242, flex: 'none', background: 'var(--paper-sidebar)', borderRight: '1px solid var(--line-sidebar)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 5 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="kf-collapse-btn"
          style={{ position: 'absolute', top: 20, right: -12, width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--line-card)', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', color: 'var(--ink-faint)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45 }}
        >
          {collapsed ? '›' : '‹'}
        </button>

        {/* F7 fix: overflowY:auto forces overflow-x to auto too, which clipped the collapsed-rail
            hover flyouts at the 64px edge. Collapsed, the icon column fits without scrolling, so
            the container goes overflow-visible and the flyouts float over the page.
            ponytail: on a very short viewport the collapsed rail clips its tail instead of
            scrolling — flip to a portal if that ever matters. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: collapsed ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', padding: '24px 0 18px' }}>

        <div className="app-sidebar-header" style={{ padding: '0 22px 14px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink-body)' }}>Kai's Flow</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Personal · Cairo</div>
          <div style={{ marginTop: 7, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1.2deg)' }}>a field journal of days ✿</div>
        </div>

        <PlanDrawer />

        <nav style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <GroupLabel>Tend</GroupLabel>
          {TEND.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={pendingInbox.length} collapsed={collapsed} />
          ))}
          <GroupLabel>Cultivate</GroupLabel>
          {CULTIVATE.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={pendingInbox.length} collapsed={collapsed} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <StreakWidget />

        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {footerRow(PlusGlyph, 'Capture', '⌘K', () => setCommandBarOpen(true))}
          {footerRow(SearchGlyph, 'Search', '⌘/', () => setSearchOpen(true))}
          {footerRow(ChatGlyph, 'Chat', '⌘J', () => setChatOpen(true))}
          <NavLink
            to="/settings"
            className="kf-side-row"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 6, textDecoration: 'none' }}
          >
            <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)' }}>{GearGlyph}</span>
            <span className="app-footer-label" style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Settings</span>
          </NavLink>
          {footerRow(SignOutGlyph, 'Sign out', undefined, () => void supabase.auth.signOut(), true)}
        </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div className="app-main-content" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: '30px 40px 64px' }}>
          <Suspense fallback={<PageFallback />}>
            <div key={pathname} className="kf-route" data-initial={isFirstMount.current ? '' : undefined}>
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>

      <MobileTabBar
        pendingInbox={pendingInbox.length}
        onSearch={() => setSearchOpen(true)}
        onChat={() => setChatOpen(true)}
        onSignOut={() => void supabase.auth.signOut()}
      />

      <Suspense fallback={null}>
        {commandBarOpen && <CommandBar />}
        {searchOpen && <SearchOverlay open onClose={() => setSearchOpen(false)} />}
        {chatOpen && <ChatPanel open onClose={() => setChatOpen(false)} />}
        {shortcutsOpen && <ShortcutOverlay open onClose={() => setShortcutsOpen(false)} />}
      </Suspense>
      <ToastHost />
    </div>
  )
}
