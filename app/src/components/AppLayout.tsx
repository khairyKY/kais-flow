import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams, type LinkProps } from 'react-router'
import { DragShell, useDropSpot } from './drag'
import type { FileSpot } from '../features/tasks/fileDrop'
import { PageFallback } from './PageFallback'
import { useFocusTicker } from '../features/focus/focusStore'
import { useSignOut } from '../features/auth/useSignOut'
import { syncHeader, syncLabel, syncRows, useSyncStatus, type SyncRow, type SyncView } from './syncQueue'
import { useRealtimeSync } from '../lib/realtime'
import { openCapture, useCommandBarStore } from '../features/command-bar/commandBarStore'
import { usePendingInboxItems } from '../features/inbox/api'
import { useTasks } from '../features/tasks/api'
import { useProjects } from '../features/projects/api'
import { dayOfJourney, firstCreatedAt } from '../features/today/journey'
import { useIsMobile } from './BottomSheet'
import { filterByList, todayOpenCount, type SmartList } from '../features/tasks/grouping'
import { TASK_PARAM } from '../features/tasks/openTask'
import { useRoutines, useRoutineCompletions } from '../features/routines/api'
import { computeStreak } from '../features/routines/streaks'
import { useBoundaryResistance, useMotionEnabled, useStackTransition } from '../lib/motion'
import { useOfferDeviceZone, useOwner } from '../lib/settings'
import { useAppZone, zoneCity } from '../lib/appZone'
import { useAuth } from '../features/auth/AuthProvider'
import { FlowerIcon, FocusGlyph, GuideGlyph, InboxGlyph, ProjectsGlyph, ReviewGlyph, RoutinesGlyph } from './icons/NavGlyphs'
import { widgetsAvailable } from '../features/widgets/native'
// Punch 5 (bundle): these four render only after a keypress, so they have no business in
// the initial chunk. Lazy + mounted-only-when-open — except CommandBar, which mounts once the
// first page is idle (capture-type, see captureWarm below). ⌘K's listener lives in the shell's
// hotkey effect below.
const CommandBar = lazy(() => import('../features/command-bar/CommandBar').then((m) => ({ default: m.CommandBar })))
const ChatPanel = lazy(() => import('../features/chat/ChatPanel').then((m) => ({ default: m.ChatPanel })))
const SearchOverlay = lazy(() => import('../features/search/SearchOverlay').then((m) => ({ default: m.SearchOverlay })))
const ShortcutOverlay = lazy(() => import('./ShortcutOverlay').then((m) => ({ default: m.ShortcutOverlay })))
// Wave N: a phone opens a task as this sheet over the current page (`?task=<id>`, features/tasks/openTask).
const TaskSheet = lazy(() => import('../features/tasks/TaskSheet').then((m) => ({ default: m.TaskSheet })))
// Notification buttons, focus-done notices, the tray flyout's focus mirror and (Windows) the tray.
const TrayBridge = lazy(() => import('../features/tray/TrayBridge').then((m) => ({ default: m.TrayBridge })))
// The Android app's home-screen widgets (features/widgets): their snapshot, ticks and taps.
const WidgetBridge = lazy(() => import('../features/widgets/WidgetBridge').then((m) => ({ default: m.WidgetBridge })))
// Tour & help: the garden notes after onboarding and the one-line hints (its own chunk).
const TourHost = lazy(() => import('../features/tour/TourHost').then((m) => ({ default: m.TourHost })))

import { ToastHost } from './ToastHost'
import { MobileTabBar } from './MobileTabBar'
import { PaperHost } from '../features/paper/PaperHost'
import { useReadyPages } from '../features/paper/captures'
import { WhatsNewHost } from '../features/whats-new/WhatsNew'
import { SeasonTopbarEcho } from '../features/seasons/TopbarEcho'
import { KeyCombo } from './kit'
import { Float } from './Float'
import { uiZoom } from '../lib/uiScale'
import { splitKeyCombo } from '../lib/shortcuts'

// ── Design source of truth: Editor.dc.html option 1a (expanded, Plan open) +
// 1g (Plan folded / rail collapsed), refined against "Kai's Flow — Universal
// Navigation Reference" (per-item active icon + washi-tape spec, 2026-07-16).
// Sidebar groups Plan (drawer) · Tend · Cultivate; later surfaces (Projects,
// People, Activity) placed per the newer files' sidebars. Colored dot per
// surface accent when inactive; the species PNG/SVG the design shows when
// active, washi tape tinted per page. ──

const A = '/ds/assets'

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
// Loop B (docs/DAILY-CYCLE.md, 2026-09-26): Tend reads in the daily loop's order — capture lands in
// Inbox, the day is planned onto the Calendar, then the lists behind it: Today · Inbox · Calendar ·
// Tasks · Projects. Only the order changed; each row's icon, dot and tape are its own.
const TEND: NavItem[] = [
  { to: '/today', label: 'Today', dot: '--acc-sage', activeIcon: <FlowerIcon fill="var(--acc-sage)" center="var(--acc-gold-warm)" />, tape: 'color-mix(in srgb, var(--acc-sage) 40%, transparent)' },
  { to: '/inbox', label: 'Inbox', dot: '--acc-hydrangea', badge: 'inbox', activeIcon: <InboxGlyph />, tape: 'color-mix(in srgb, var(--acc-hydrangea) 55%, transparent)' },
  { to: '/calendar', label: 'Calendar', dot: '--acc-lavender', activeIcon: <FlowerIcon fill="var(--acc-lavender)" center="#D9B65C" />, tape: 'color-mix(in srgb, var(--acc-lavender) 45%, transparent)' },
  // R4 (2026-07-20 audit): "the tasks page has a small flower icon while the live local host has
  // the entire rendered flower — the correct thing is the one in the design export." Tasks.dc.html
  // line 225 specifies the 18px five-ellipse glyph (fill var(--acc-blossom), centre #C98A4B), not
  // cherry/bloom.png. Checked every page: Today/Calendar already used the glyph, and
  // Routines/Inbox genuinely do specify PNGs in their own exports — so this is per-page, and
  // Tasks was the odd one out.
  { to: '/tasks', label: 'Tasks', dot: '--acc-blossom', activeIcon: <FlowerIcon fill="var(--acc-blossom)" center="#C98A4B" />, tape: 'color-mix(in srgb, var(--acc-blossom) 45%, transparent)' },
  { to: '/projects', label: 'Projects', dot: '--acc-moss', activeIcon: <ProjectsGlyph />, tape: 'color-mix(in srgb, var(--acc-moss) 45%, transparent)' },
]

const CULTIVATE: NavItem[] = [
  { to: '/routines', label: 'Routines', dot: '--acc-moss', activeIcon: <RoutinesGlyph />, tape: 'color-mix(in srgb, var(--acc-moss) 45%, transparent)' },
  // Not in the Navigation Reference — added per 2026-07-18 audit A7 (Focus was unreachable).
  { to: '/focus', label: 'Focus', dot: '--acc-gold-warm', activeIcon: <FocusGlyph />, tape: 'color-mix(in srgb, var(--acc-gold-warm) 45%, transparent)' },
  { to: '/weekly-review', label: 'Review', dot: '--acc-buttercream', activeIcon: <ReviewGlyph />, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  // Journal is back per D-1 (Kai, 2026-07-26): one daily page, many timestamped entries.
  { to: '/journal', label: 'Journal', dot: '--acc-buttercream', img: `${A}/fern/full.png`, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  // [K-26] 2026-07-26 (punch 65) parked the Library; fix-grammar (2026-10-12) brings its row back
  // beside Journal — it was reachable only through Journal or the URL. Same row as before the park.
  { to: '/library', label: 'Library', dot: '--acc-buttercream', activeImg: `${A}/tools/pen.png`, tape: 'color-mix(in srgb, var(--acc-buttercream) 45%, transparent)' },
  { to: '/people', label: 'People', dot: '--acc-clover', activeImg: `${A}/clover/awake.png`, tape: 'color-mix(in srgb, var(--acc-clover) 45%, transparent)' },
  // Not in the Navigation Reference (Kai kept it anyway) — same tape formula as every other item, own dot color.
  { to: '/activity', label: 'Activity', dot: '--acc-gold', tape: 'color-mix(in srgb, var(--acc-gold) 45%, transparent)' },
  // Punch 50: the quiet Trash link the design puts at the bottom of the nav (it had no entry
  // point at all — URL-only). Hairline dot keeps it visually last in the list's hierarchy.
  { to: '/trash', label: 'Trash', dot: '--ink-hairline', tape: 'rgba(122,110,94,0.35)' },
]

// Motion 2d — the sidebar's filing spots: a task or capture dragged onto Today / Due Today, or a task
// onto Someday, goes there (features/tasks/fileDrop says what each load does; the row's ⋯ menu is
// the same action by tap or key).
const TODAY_SPOT: FileSpot = { kind: 'today', label: 'Today' }
const SOMEDAY_SPOT: FileSpot = { kind: 'someday', label: 'Someday' }

/** A sidebar link that is also a drop spot (components/drag). */
function SpotLink({ spot, className, ...link }: LinkProps & { spot: FileSpot | null }) {
  const drop = useDropSpot(`side:${String(link.to)}`, spot)
  return <Link ref={drop.ref} className={`${className ?? ''} ${drop.className}`} {...link} />
}

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

  // polish-f1 (audit K-8): the folded drawer's whisper counts exactly the open rows the Today page
  // lists (grouping.ts todayListTasks is Today's own row rule), so badge and page can't drift.
  // The open drawer's "Due Today" row below still counts the Due Today list it links to.
  const todayCount = todayOpenCount(tasks)

  const row = (to: string, label: string, active: boolean, count?: number, icon?: React.ReactNode, spot: FileSpot | null = null) => (
    <SpotLink
      key={to}
      to={to}
      spot={spot}
      className={`kf-side-row${active ? ' kf-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '6px 11px',
        borderRadius: 6,
        textDecoration: 'none',
        background: active ? 'var(--frost-bg, var(--paper-parchment))' : 'none',
        border: active ? '1px solid var(--frost-line, var(--line-card))' : '1px solid transparent',
      }}
    >
      <span style={{ width: 16, flex: 'none', display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{label}</span>
      {count != null && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{count}</span>
      )}
    </SpotLink>
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
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Plan</span>
        <span
          aria-hidden="true"
          className="kf-plan-chevron"
          style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform var(--dur-quick) var(--ease-spring)' }}
        >
          ›
        </span>
        {!open && todayCount > 0 && (
          <span title={`${todayCount} open on Today`} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{todayCount}</span>
        )}
      </button>
      {open && (
        <>
          {smartLists.map(({ list, label }) => row(`/tasks?list=${list}`, label, activeList === list, filterByList(tasks, list).length, undefined, list === 'today' ? TODAY_SPOT : null))}
          <div style={{ height: 1, borderTop: '1px dashed var(--line-sidebar)', margin: '4px 11px' }} />
          {row('/tasks?list=someday', 'Someday', activeList === 'someday', filterByList(tasks, 'someday').length, (
            <img src={`${A}/fern/coil.png`} alt="" style={{ height: 14, opacity: 0.8 }} />
          ), SOMEDAY_SPOT)}
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
    // Night 1a: the dots glow in their own colour (--glow-dot is night-only; by day, no shadow).
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${item.dot})`, color: `var(${item.dot})`, boxShadow: 'var(--glow-dot, none)' }} />
  }
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null)
  const showFly = (e: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed) return
    const r = e.currentTarget.getBoundingClientRect()
    const z = uiZoom() // visual → layout px
    setFly({ x: r.right / z + 8, y: (r.top + r.height / 2) / z })
  }
  const hideFly = () => setFly(null)
  const drop = useDropSpot(`side:${item.to}`, item.to === '/today' ? TODAY_SPOT : null)
  return (
    <Link
      ref={drop.ref}
      to={item.to}
      className={`kf-side-row${isActive ? ' kf-active' : ''} ${drop.className}`}
      onMouseEnter={showFly}
      onMouseLeave={hideFly}
      onFocus={showFly}
      onBlur={hideFly}
      onClick={hideFly}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '8px 12px',
        borderRadius: 6,
        textDecoration: 'none',
        // Night 1a: the active row is frosted glass, untilted (the night tokens; day keeps its own).
        background: isActive ? 'var(--frost-bg, var(--paper-parchment))' : 'none',
        border: isActive ? '1px solid var(--frost-line, var(--line-card))' : '1px solid transparent',
        boxShadow: isActive ? 'var(--shadow-frost, var(--shadow-crisp))' : 'none',
        transform: isActive ? 'var(--nav-tilt, rotate(-0.5deg))' : 'none',
      }}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="kf-nav-tape"
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
          in the export's own nav type (14px, --ink-body on parchment with the card border).
          Kai 2026-10-03: drawn on <body> (fixed, beside the row) so the collapsed rail can scroll
          on a short window without clipping it (F7 kept the rail unscrollable for this). */}
      {collapsed && fly && (
        <Float>
          <span className="kf-nav-flyout" aria-hidden="true" style={{ left: fly.x, top: fly.y }}>
            {item.label}
          </span>
        </Float>
      )}
      {item.badge === 'inbox' && pendingInbox > 0 && (
        <span className="app-nav-badge" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)' }}>{pendingInbox}</span>
      )}
    </Link>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-nav-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', padding: '12px 12px 5px' }}>
      {children}
    </div>
  )
}

// Today 2a's sidebar foot: "6-day streak / best 21 · day 42" — the highest current routine streak (the
// streak the removed terrarium band showed), the best, and the day of the journey (today/journey, the
// phone header's "Day N"). Pinned with the footer rows, so a short window never scrolls it out of view.
// Vine stage by streak length: bare / sprouting / flowering / lush (growth system).
function StreakWidget() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: tasks = [] } = useTasks()
  const { data: inbox = [] } = usePendingInboxItems()
  const { data: projects = [] } = useProjects()
  const day = dayOfJourney(useMemo(() => firstCreatedAt(tasks, inbox, projects, routines), [tasks, inbox, projects, routines]), new Date())

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
    <div className="app-vine">
      <img src={`${A}/vine/${stage}.png`} alt="" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-body-s)', fontWeight: 'var(--fw-medium)', color: 'var(--ink-body)' }}>{current}-day streak</div>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)', marginTop: 1 }}>best {best} · day {day}</div>
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
      title={label}
      aria-label={label}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: faint ? '6px 12px' : '7px 12px', borderRadius: 6, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{icon}</span>
      <span className="app-footer-label" style={{ fontSize: faint ? 12.5 : 13.5, color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{label}</span>
      {/* J-17: keycaps, not mono text. The class keeps them hidden on the collapsed rail. */}
      {shortcut && <KeyCombo className="app-footer-label" keys={splitKeyCombo(shortcut)} size="sm" style={{ marginLeft: 'auto' }} />}
    </button>
  )
}

function queueAgo(ts: number): string {
  const min = Math.max(1, Math.round((Date.now() - ts) / 60_000))
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)}h ago`
}

/** The sidebar's words for the sync status (Today 2a's "● synced" on the Settings row): calm says
 * "synced"; trouble says what the phone's strip says, short enough for the row. */
function sideSyncLabel(v: SyncView): string {
  if (v.kind === 'syncing') return 'syncing…'
  if (v.kind === 'offline') return v.n > 0 ? `offline · ${v.n}` : 'offline'
  if (v.kind === 'parked') return `${v.n} not saved`
  return 'synced'
}

// ── The sync status — States.dc.html 2a/2b/2d, wired to the REAL outbox queue — and its queue
// popover. One home per layout: a computer's sidebar Settings row (Today 2a / Inbox 3a: "● synced"),
// a phone's top bar (no sidebar there). Kai 2026-10-07: the strip flipped "Syncing ↻ 1" ↔ "Synced ●"
// (with a glint) on every write, about two seconds per change. The phone strip now says nothing while
// writes flush and speaks only when something is slow, offline or not saved (useSyncStatus,
// ./syncQueue.ts); the sidebar keeps 2a's steady "synced" and changes only on the same events. A brief
// "Synced" (2d's glint) ends an offline / not-saved spell. ──
function SyncStatus({ side = false }: { side?: boolean }) {
  const motionOn = useMotionEnabled()
  const { view, online, queue, waiting: n, parked, seeParked } = useSyncStatus()
  const rows = useMemo(() => syncRows(queue), [queue])
  const label = side ? sideSyncLabel(view) : syncLabel(view)
  // The popover; `parked` holds the not-saved rows it was opened on — opening it is seeing them.
  const [pop, setPop] = useState<{ parked: SyncRow[] | null } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const popOpen = pop !== null
  const togglePop = () => {
    if (popOpen) return setPop(null)
    if (view.kind !== 'parked') return setPop({ parked: null })
    setPop({ parked: syncRows(parked, 'changed') })
    seeParked()
  }

  useEffect(() => {
    if (!popOpen) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popOpen])

  const rowList = (list: SyncRow[]) => (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
      {list.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-body)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', flex: 'none' }}>{r.kind}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', flex: 'none' }}>{queueAgo(r.queuedAt)}</span>
        </div>
      ))}
    </div>
  )
  const hand = (text: string) => <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)' }}>{text}</div>
  return (
    <>
      {side ? (
        // Today 2a: a 6px dot + "synced" at the Settings row's right; on the icon rows (a short or
        // collapsed sidebar) only the dot shows, on the gear's corner, and the words are its title.
        <button type="button" onClick={togglePop} className="kf-side-sync" data-sync={view.kind} title={`Sync: ${label}`} aria-label={`Sync: ${label}`}>
          <span className="kf-side-sync-dot" style={view.kind === 'synced' && motionOn ? { animation: 'twinkle 300ms var(--ease-out)' } : undefined} />
          <span className="app-footer-label">{label}</span>
        </button>
      ) : (
        label && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={togglePop}
              className="kf-hit app-topbar-sync"
              data-sync={view.kind}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: view.kind === 'parked' ? 'var(--acc-terra-ink)' : view.kind === 'synced' ? 'inherit' : 'var(--ink-muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {label}
              {/* States 2d — the only celebration is one glint on the dot, 300ms, when trouble clears. */}
              {view.kind === 'synced' && (
                <span style={{ color: 'var(--acc-sage)', animation: motionOn ? 'twinkle 300ms var(--ease-out)' : undefined, textShadow: motionOn ? '0 0 6px rgba(232,217,160,0.9)' : undefined }}>●</span>
              )}
            </button>
          </>
        )
      )}

      {pop && (
        <div
          ref={popRef}
          className={`kf-sync-pop kf-overlay-card${side ? ' kf-sync-pop--side' : ''}`}
          style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '12px 14px', textTransform: 'none', letterSpacing: 'normal' }}
        >
          {pop.parked ? (
            <>
              {/* The server set these aside (lib/outbox.ts dead letters) so the rest could sync. */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-terra-ink)' }}>
                Not saved ⚠ · {pop.parked.length} {pop.parked.length === 1 ? 'change' : 'changes'}
              </div>
              {rowList(pop.parked)}
              {hand('set aside so everything else syncs on — make the change again to keep it')}
            </>
          ) : n === 0 ? (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-body)' }}>All caught up.</div>
          ) : (
            <>
              {/* polish-c (2026-09-26 audit): human rows only — one per change, never a table
                  name, never the change's bookkeeping activity row alongside it (components/syncQueue.ts). */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: !online ? 'var(--ink-muted)' : 'var(--acc-sage-text)' }}>
                {syncHeader(n, online)}
              </div>
              {rowList(rows)}
              {hand(online ? 'syncing now — nothing lost ✿' : "Everything here syncs the moment you're back.")}
            </>
          )}
        </div>
      )}
    </>
  )
}

// ── The shell's top bar (SPEC §2): `{app name} · {day} {date}` · the season echo … the user's zone.
// Not on a computer's Today (2a: "Date said three times (top bar, eyebrow, H1). Now it's only the H1")
// or Inbox (3a: "The top bar is removed") — AppLayout skips it there; every other page's frame keeps
// it. The sync status rides it only on a phone; on a computer it lives on the sidebar's Settings row. ──
function TopBar({ sync }: { sync: boolean }) {
  const owner = useOwner()
  const zone = useAppZone()
  // F5b: design format is `Fri 10 Jul` — weekday, day (no zero-pad), month, no commas. On the
  // user's clock (it read the device's, a day off from every page below it on a device abroad).
  const now = new Date()
  const part = (o: Intl.DateTimeFormatOptions) => now.toLocaleDateString('en-GB', { ...o, timeZone: zone })
  const dateLabel = `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}`
  return (
    <div
      className="app-topbar"
      style={{ position: 'relative', height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 40px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {/* SPEC §2 topbar `{app name} · {day} {date} · {sync}`: the app wears the owner's name
            (lib/owner.ts). The zone on the right is the user's own (Settings → Timezone): the
            app's day boundary (B2), so that's the clock it's really keeping. The sync part shows
            only when there is something to say. */}
        <span className="app-topbar-where">
          <span className="app-topbar-owner" title={owner.flow} style={{ visibility: owner.pending ? 'hidden' : undefined }}>{owner.flow}</span> · {dateLabel}
        </span>
        {sync && <SyncStatus />}
        <span className="app-topbar-echo">
          <SeasonTopbarEcho />
        </span>
      </div>
      <div className="app-topbar-zone" style={{ flex: 'none' }}>{zone}</div>
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Dispatched on `window` to open search from a page's own top bar (the shell owns the overlay). */
const OPEN_SEARCH_EVENT = 'kf-open-search'

/** Pages whose desktop frame has no top bar: Today 2a and Inbox 3a (both "reviewed pass"). */
const NO_TOPBAR = ['/today', '/inbox']

export function AppLayout() {
  useRealtimeSync()
  // R4-D3: keeps a running Focus session ticking wherever Kai navigates.
  useFocusTicker()
  const motionOn = useMotionEnabled()
  const location = useLocation()
  const { pathname } = location
  const isMobile = useIsMobile()
  // Motion 2b/3a: the page scroller is the stack's sheet (lib/motion useStackTransition); Effects 2k
  // gives its edges their resistance on touch.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useStackTransition(scrollerRef, location.key)
  useBoundaryResistance(scrollerRef)
  const navigate = useNavigate()
  const openTaskId = useSearchParams()[0].get(TASK_PARAM)
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // A page's own top bar (Today on a phone, MK top bar) opens the one search overlay.
  useEffect(() => {
    const open = () => setSearchOpen(true)
    window.addEventListener(OPEN_SEARCH_EVENT, open)
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open)
  }, [])
  // P0-B: both Sign out buttons (sidebar + phone More sheet) share one flow and one prompt.
  const signOutFlow = useSignOut()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('kf.sidebarCollapsed') === '1')
  useEffect(() => {
    localStorage.setItem('kf.sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const owner = useOwner()
  // User time zones: every date below reads the user's zone; a new zone remounts the page (key
  // below) so nothing memoised keeps the old day. Once per device, offer the device's own zone.
  const zone = useAppZone()
  const user = useAuth().session?.user
  useOfferDeviceZone(user?.id)
  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)
  const toggleCommandBar = useCommandBarStore((s) => s.toggle)
  const commandBarOpen = useCommandBarStore((s) => s.open)
  // Kai 2026-10-07 (capture-type): a tap must open the capture bar AND focus its field inside that
  // tap, or a phone raises no keyboard (features/command-bar/commandBarStore openCapture). So once
  // the first page is up, the bar's chunk loads and CommandBar stays mounted (it renders nothing
  // while closed): every later open renders synchronously, no lazy boundary on the tap path.
  const [captureWarm, setCaptureWarm] = useState(false)
  useEffect(() => {
    const warm = () => setCaptureWarm(true)
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 2000 })
    else setTimeout(warm, 500) // older iOS Safari has no idle callback
  }, [])
  const { data: pendingInbox = [] } = usePendingInboxItems()
  // Paper Capture 11d: a page read and waiting for review is one more thing in the Inbox (12 → 13).
  const inboxBadge = pendingInbox.length + useReadyPages()
  // Captures queued for the AI (needs_parse: the capture endpoint's ?file=1, or made offline) are
  // filed once they're here — not only on a reconnect, which a fresh start never sees.
  const queuedForAi = pendingInbox.some((i) => (i.payload as { needs_parse?: boolean } | null)?.needs_parse)
  useEffect(() => {
    if (queuedForAi) void import('../features/capture/api').then((m) => m.processQueuedCaptures())
  }, [queuedForAi])

  // Cold boot shouldn't animate content in (nothing else on screen is settling yet) — only
  // genuine client-side route landings should. True only for the very first render.
  const isFirstMount = useRef(true)
  useEffect(() => {
    isFirstMount.current = false
  }, [])

  useEffect(() => {
    // Layout-proof (as useListKeys' Ctrl+A): on an Arabic keyboard Ctrl+K arrives as key 'ن', code 'KeyK'.
    const pressed = (e: KeyboardEvent, ch: string, code: string) => (/^[\x20-\x7e]$/.test(e.key) ? e.key.toLowerCase() === ch : e.code === code)
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && pressed(e, '/', 'Slash')) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && pressed(e, 'j', 'KeyJ')) {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && pressed(e, 'k', 'KeyK')) {
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

  // Motion 2b/4e: Esc pops a detail page off the stack — after any open overlay has had its turn
  // (lib/overlayStack closes the topmost and marks the key handled).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTypingTarget(e.target)) return
      // Only from the page itself. With focus on a control (a stepper's +, a chip, a row's ⋯), Esc
      // means "leave this control" — it used to pop the whole page too (2026-10-13: Esc after the
      // milestone weight stepper threw you back to Projects).
      const focused = document.activeElement
      if (focused && focused !== document.body && !focused.classList.contains('app-main-content')) return
      const [section, detail] = pathname.split('/').filter(Boolean)
      if (!detail) return
      e.preventDefault()
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) void navigate(-1)
      else void navigate(`/${section}`)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [pathname, navigate])

  return (
    <DragShell>
    <div className={`app-shell${motionOn ? ' motion-on' : ''}`} style={{ height: 'var(--kf-vh)', display: 'flex', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        .app-tabbar { display: none; }
        .app-topbar-echo { display: contents; }
        @media (max-width: 767px) {
          .app-sidebar { display: none !important; }
          .app-topbar { padding: 0 16px !important; }
          /* The phone topbar already clips from the right; a long owner name would push the date
             off too, so the name alone caps (~12 chars) and ellipsizes. "Kai's Flow" fits. */
          .app-topbar-owner { display: inline-block; vertical-align: top; max-width: 9em; overflow: hidden; text-overflow: ellipsis; }
          /* polish-f1: at 390px and a 125% size (the phone default until F2b) the strip is ~280 CSS px wide, and the
             sync status (3rd) was pushed out entirely by the weather echo and the zone. The
             iPhone exports carry neither (their app bar is flower · date · search), so both drop
             here; the status never shrinks, and if anything still has to give (a long name while
             "Offline ◌ — N saved here"), it's the name · date run, with an ellipsis. */
          .app-topbar-echo, .app-topbar-zone { display: none; }
          .app-topbar-where { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
          .app-topbar-sync { flex: none; }
          .app-main-content { padding: 20px 16px calc(64px + env(safe-area-inset-bottom) + 24px) !important; }
          .app-tabbar { display: flex !important; }
        }
        .app-sidebar.collapsed { width: 64px !important; }
        /* Shell fit (2026-09-26): the footer is pinned, so on a short sidebar (1280×800 at the
           default 125% is only 640 layout px tall) its five labelled rows (194px) pushed Tasks,
           Calendar and Projects out of view. Below 800px of sidebar height it becomes one row of
           icons (~47px) — same controls, titled + labelled, the collapsed rail's own treatment.
           A size container query, not a media query: it measures the sidebar in zoomed CSS px. */
        .app-sidebar { container: kf-sidebar / size; }
        @container kf-sidebar (max-height: 799px) {
          .app-sidebar:not(.collapsed) .app-sidebar-footer { flex-direction: row !important; justify-content: space-between; padding: 4px 12px 12px !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-footer .app-footer-label { display: none !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-footer .kf-side-row { padding: 8px !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-footer .kf-side-row:hover { transform: none; }
        }
        /* Today 2a's sidebar foot: the streak, pinned above the footer rows (only the nav scrolls). */
        .app-vine { flex: none; margin: 0 22px 12px; padding-top: 12px; border-top: 1px dashed var(--line-sidebar); display: flex; align-items: center; gap: 10px; }
        .app-vine img { height: 36px; width: auto; flex: none; filter: var(--shadow-drop-sm); }
        /* 2a's "● synced" on the Settings row: a mono note at the row's right, its own button. */
        .kf-settings-row { position: relative; }
        .kf-side-sync { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 4px 0 4px 6px; border: none; background: none; font-family: var(--font-mono); font-size: var(--fs-meta-l); color: var(--ink-muted); cursor: pointer; }
        .kf-side-sync[data-sync='parked'] { color: var(--acc-terra-ink); }
        .kf-side-sync-dot { width: 6px; height: 6px; flex: none; box-sizing: border-box; border-radius: 50%; background: var(--acc-sage); }
        .kf-side-sync[data-sync='syncing'] .kf-side-sync-dot { background: var(--ink-faint); }
        .kf-side-sync[data-sync='offline'] .kf-side-sync-dot { background: none; border: 1px solid var(--ink-muted); }
        .kf-side-sync[data-sync='parked'] .kf-side-sync-dot { background: var(--acc-terra); }
        .kf-sync-pop.kf-sync-pop--side { top: auto; bottom: calc(100% + 6px); left: 0; }
        /* Icon rows (a short or a collapsed sidebar): the dot alone, on the gear's corner. */
        .app-sidebar.collapsed .kf-side-sync { top: 2px; right: 2px; transform: none; padding: 2px; }
        /* Short sidebar (1280×800 at the default 125% is 640 layout px): the pinned streak costs ~50px,
           so the column tightens a little to keep Tend's five rows in view with the Plan drawer open. */
        @container kf-sidebar (max-height: 799px) {
          .app-sidebar:not(.collapsed) .kf-side-sync { top: 2px; right: 2px; transform: none; padding: 2px; }
          .app-sidebar:not(.collapsed) .app-sidebar-col { padding-top: 16px !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-header { padding-bottom: 12px !important; }
          .app-sidebar:not(.collapsed) nav > .app-nav-label { padding-top: 6px !important; }
          .app-sidebar:not(.collapsed) .app-vine { margin-bottom: 4px; padding-top: 6px; line-height: 1.25; }
          .app-sidebar:not(.collapsed) .app-sidebar-footer { padding-bottom: 8px !important; }
          .app-vine img { height: 28px; }
        }
        /* Collapsed-rail hover label (R4). Sits outside the 64px rail, so the rail keeps its
           width and the label floats over the page. Styled to the export's nav row: parchment,
           card border, crisp shadow, 14px --ink-body. NavRow places it (fixed, on <body>). */
        .kf-nav-flyout {
          position: fixed; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none;
          background: var(--paper-parchment); border: 1px solid var(--line-card);
          box-shadow: var(--shadow-crisp); border-radius: 6px; padding: 6px 11px;
          font-size: 14px; color: var(--ink-body); z-index: 60;
          animation: kfFadeIn var(--dur-quick) var(--ease-out);
        }
        /* The collapsed rail scrolls when a short window can't hold it (it used to run under the
           pinned footer at 125–150%); no scrollbar strip on a 64px rail. */
        .app-sidebar.collapsed .app-sidebar-col { scrollbar-width: none; }
        .app-sidebar.collapsed .app-sidebar-col::-webkit-scrollbar { display: none; }
        /* Kai 2026-10-03: collapsed, a row's 12px side padding + its 18px icon (42) were wider than
           the rail leaves it (35), so the icon overflowed the box to the right: the active box read
           off-centre to the left, its tape poked out past it, and a strip sat empty on the right.
           The box now hugs the centred icon, the tape centres on the box, and the inbox count
           rides its corner instead of pushing the icon aside. */
        .app-sidebar.collapsed .kf-side-row { justify-content: center; padding-left: 0 !important; padding-right: 0 !important; }
        .app-sidebar.collapsed .kf-nav-tape { left: 50% !important; width: 24px !important; margin-left: -12px; }
        .app-sidebar.collapsed .app-nav-badge { position: absolute; top: 1px; right: 3px; margin: 0 !important; font-size: 9px !important; line-height: 1; }
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
        .kf-side-row.kf-active:hover { background: var(--frost-bg, var(--paper-parchment)) !important; }
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

        /* Motion 2b (computer, vertical) / 3a (phone, horizontal) / 4e — the stack (lib/motion
           useStackTransition). The page beneath is a still copy in .kf-stack-layer; the live page
           scroller is the sheet that rides in, or the page that eases forward under a pop. */
        .kf-stack-layer { position: absolute; overflow: hidden; pointer-events: none; }
        .kf-stack-page { position: absolute; inset: 0; overflow: hidden; background: var(--paper-linen); transform-origin: 50% 20%; }
        /* The copy is a still: its own entry animations (route cut, stagger) must not replay in it. */
        .kf-stack-page > *, .kf-stack-page > * * { animation: none !important; }
        .kf-stack-dim { position: absolute; inset: 0; background: var(--scrim); opacity: 0; }
        .kf-stack-top { background: var(--paper-linen); box-shadow: var(--shadow-stack-y); }
        .app-main-content.kf-stack-over-in, .app-main-content.kf-stack-under-in { position: relative; z-index: 1; transform-origin: 50% 20%; }
        /* The sheet travels outside its column for a moment: clipped, so a phone's layout viewport
           never widens to hold it (which pushed the fixed tab bar off the bottom mid-push). */
        main:has(> .app-main-content[data-stack]) { overflow: clip; }
        .kf-stack-over-in { animation: stackOverIn var(--dur-stack) var(--ease-stack) backwards; }
        .kf-stack-over-out { animation: stackOverOut var(--dur-stack) var(--ease-stack) forwards; }
        .kf-stack-under-in { animation: stackUnderIn var(--dur-stack) var(--ease-stack) backwards; }
        .kf-stack-under-out { animation: stackUnderOut var(--dur-stack) var(--ease-stack) forwards; }
        .kf-stack-dim-in { animation: stackDimIn var(--dur-stack) var(--ease-stack) forwards; }
        .kf-stack-dim-out { animation: stackDimOut var(--dur-stack) var(--ease-stack) forwards; }
        /* The stack replaces the route cut (2a) and the entry stagger (4b) for its own moves. */
        .app-main-content[data-stack] .kf-route, .app-main-content[data-stack] .kf-stagger-item { animation: none; }
        @media (max-width: 767px) {
          .kf-stack-top { box-shadow: var(--shadow-stack-x); }
          .kf-stack-over-in { animation-name: stackOverInX; }
          .kf-stack-over-out { animation-name: stackOverOutX; }
          .kf-stack-under-in { animation-name: stackUnderInX; }
          .kf-stack-under-out { animation-name: stackUnderOutX; }
        }

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

        /* J-5/J-2 — bulk bars sit bottom-centre of the LIST they act on: a page marks its list
           column .kf-bulk-anchor and CSS anchor positioning centres the bar on it (so Tasks'
           Organize rail / Today's side column don't pull it right). Unmarked pages, and browsers
           without anchor(), fall back to the content-area centre (window centre + half the
           sidebar: 242 → 121, collapsed 64 → 32). Clears the phone tab bar like the toast. */
        .kf-bulk-anchor { anchor-name: --kf-bulk; }
        .kf-bulkbar { left: calc(50% + 121px); left: anchor(--kf-bulk center, calc(50% + 121px)); bottom: 16px; }
        .app-sidebar.collapsed ~ main .kf-bulkbar { left: calc(50% + 32px); left: anchor(--kf-bulk center, calc(50% + 32px)); }
        @media (max-width: 767px) {
          /* The bar is ~540px of actions — wider than any phone, so both ends (Delete, ✕) used to
             clip off-screen. Cap it to the screen and let it scroll sideways. */
          .kf-bulkbar, .app-sidebar.collapsed ~ main .kf-bulkbar { left: 50%; bottom: calc(74px + env(safe-area-inset-bottom)); max-width: calc(100% - 16px); overflow-x: auto; scrollbar-width: none; }
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

        {/* F7 kept this column overflow-visible when collapsed, because overflow-y:auto clipped the
            hover flyouts at the 64px edge — so at 125–150% the icon column ran under the pinned
            footer instead of scrolling (Kai 2026-10-03). The flyouts now draw on <body> (NavRow),
            so the column scrolls in both states. */}
        <div className="app-sidebar-col" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '24px 0 8px' }}>

        {/* Onboarding's promise: "the whole app takes your name" + the workspace line. Unset
            answers keep the old "Kai's Flow / Personal · Cairo". The city is the user's zone's
            (Settings → Timezone; Cairo by default) — the app's day boundary (B2). Names are
            user-typed, so both lines ellipsize instead of wrapping the sidebar. */}
        {/* Today 2a: the app icon beside the wordmark; 2a drops the hand line ("a field journal of
            days ✿"). deviation(2026-10-13 today-shell): the workspace · city line stays — it is
            the only place the workspace answer shows, and with no top bar on Today / Inbox the
            only place the user's zone does. */}
        <div className="app-sidebar-header" style={{ padding: '0 22px 16px', visibility: owner.pending ? 'hidden' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icon-192.png" alt="" style={{ width: 28, height: 28, flex: 'none' }} />
            <div title={owner.flow} style={{ minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', fontWeight: 'var(--fw-semibold)', letterSpacing: 'var(--ls-display)', color: 'var(--ink-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner.flow}</div>
          </div>
          <div title={owner.workspace} style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner.workspace} · {zoneCity(zone)}</div>
        </div>

        <PlanDrawer />

        <nav data-tour="sidebar" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <GroupLabel>Tend</GroupLabel>
          {TEND.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={inboxBadge} collapsed={collapsed} />
          ))}
          <GroupLabel>Cultivate</GroupLabel>
          {CULTIVATE.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={inboxBadge} collapsed={collapsed} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />
        </div>

        <StreakWidget />

        {/* Shell fit (2026-09-26): the footer rows are pinned below the scrolling column. At the
            default 125% size a 1280×800 window is only ~640 layout px tall, so inside the scroll
            Settings / Sign out sat ~290px below the fold. Pinned, they're always one tap away. */}
        <div className="app-sidebar-footer" style={{ flex: 'none', padding: '4px 14px 18px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {footerRow(PlusGlyph, 'Capture', '⌘K', openCapture)}
          {footerRow(SearchGlyph, 'Search', '⌘/', () => setSearchOpen(true))}
          {footerRow(ChatGlyph, 'Chat', '⌘J', () => setChatOpen(true))}
          {/* Tour & help 14k: the Guide sits in the sidebar foot, beside Settings. */}
          <NavLink to="/guide" title="Guide" aria-label="Guide" className="kf-side-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 6, textDecoration: 'none' }}>
            <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)' }}><GuideGlyph /></span>
            <span className="app-footer-label" style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Guide</span>
          </NavLink>
          {/* Today 2a: the sync status sits on the Settings row ("● synced"), its own button beside the link. */}
          <div className="kf-settings-row">
            <NavLink
              to="/settings"
              title="Settings"
              aria-label="Settings"
              className="kf-side-row"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 6, textDecoration: 'none' }}
            >
              <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)' }}>{GearGlyph}</span>
              <span className="app-footer-label" style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Settings</span>
            </NavLink>
            {!isMobile && <SyncStatus side />}
          </div>
          {footerRow(SignOutGlyph, 'Sign out', undefined, signOutFlow.request, true)}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {(isMobile || !NO_TOPBAR.includes(pathname)) && <TopBar sync={isMobile} />}
        <div ref={scrollerRef} className="app-main-content" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: '30px 40px 64px' }}>
          <Suspense fallback={<PageFallback />}>
            <div key={`${pathname}|${zone}`} className="kf-route" data-initial={isFirstMount.current ? '' : undefined}>
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>

      <MobileTabBar
        pendingInbox={inboxBadge}
        onSearch={() => setSearchOpen(true)}
        onChat={() => setChatOpen(true)}
        onSignOut={signOutFlow.request}
      />

      {/* Its own boundary: the warm-up's one suspend must not blank an open TaskSheet below. */}
      <Suspense fallback={null}>{(commandBarOpen || captureWarm) && <CommandBar />}</Suspense>
      <Suspense fallback={null}>
        {searchOpen && <SearchOverlay open onClose={() => setSearchOpen(false)} />}
        {chatOpen && <ChatPanel open onClose={() => setChatOpen(false)} />}
        {shortcutsOpen && <ShortcutOverlay open onClose={() => setShortcutsOpen(false)} />}
        {openTaskId && <TaskSheet key={openTaskId} id={openTaskId} />}
      </Suspense>
      <Suspense fallback={null}>
        <TrayBridge />
      </Suspense>
      {widgetsAvailable() && (
        <Suspense fallback={null}>
          <WidgetBridge />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <TourHost />
      </Suspense>
      <PaperHost />
      {/* What's new: the after-update toast, the daily quiet update check, the sheet. */}
      <WhatsNewHost uid={user?.id} createdAt={user?.created_at} />
      <ToastHost />
      {signOutFlow.prompt}
    </div>
    </DragShell>
  )
}
