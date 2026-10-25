import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams, type LinkProps } from 'react-router'
import { useShellSpot } from './dragSpots'
import type { FileSpot } from '../features/tasks/fileDrop'
import { PageFallback } from './PageFallback'
import { useFocusTicker } from '../features/focus/focusStore'
import { useSignOut } from '../features/auth/useSignOut'
import { syncHeader, syncLabel, syncRows, useSyncStatus, type SyncRow, type SyncView } from './syncQueue'
import { discardParked, retryParked } from '../lib/outbox'
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
import { Icon } from './Icon'
import type { IconName } from './icons/kf'
import { ContextMenu } from './ContextMenu'
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
// Smart lists (0081): the Plan drawer's saved filters — their rows, menu and rules (its own chunk).
const SmartListNav = lazy(() => import('../features/smart-lists/SmartListNav').then((m) => ({ default: m.SmartListNav })))

import { ToastHost } from './ToastHost'
import { SubtaskAskHost } from '../features/tasks/SubtaskAsk'
import { MobileTabBar } from './MobileTabBar'
import { PaperHost } from '../features/paper/PaperHost'
import { useReadyPages } from '../features/paper/captures'
import { WhatsNewHost } from '../features/whats-new/WhatsNew'
import { TermsNoticeHost } from '../features/legal/LegalDialogs'
import { SeasonTopbarEcho } from '../features/seasons/TopbarEcho'
import { KeyCombo } from './kit'
import { Float } from './Float'
import { uiZoom } from '../lib/uiScale'
import { splitKeyCombo } from '../lib/shortcuts'
import { overlayCount } from '../lib/overlayStack'
import { undoLatest } from '../lib/undo'
import { DownloadBar } from '../features/download/DownloadBar'
import { useAutoFileNotice } from '../features/capture/autoFileNotice'

// ── Design source of truth: Editor.dc.html option 1a (expanded, Plan open) +
// 1g (Plan folded / rail collapsed), refined against "Kai's Flow — Universal
// Navigation Reference" (per-item active icon + washi-tape spec, 2026-07-16).
// Sidebar groups Plan (drawer) · Tend · Cultivate; later surfaces (Projects,
// People, Activity) placed per the newer files' sidebars. Bound Journal (Design System B, D7): the
// nav is a tool — no washi tape, no tilt. Sidebar options.html icons A (Kai, 2026-10-22: "I don't
// like the icon set that we have for the sidebar"): one kf line icon per row, open or on the rail,
// in place of the dots, the flower glyphs and the species PNGs. ──

type NavItem = {
  to: string
  label: string
  icon: IconName
  badge?: 'inbox'
}

// Loop B (docs/DAILY-CYCLE.md, 2026-09-26): Tend reads in the daily loop's order — capture lands in
// Inbox, the day is planned onto the Calendar, then the lists behind it: Today · Inbox · Calendar ·
// Tasks · Projects.
const TEND: NavItem[] = [
  { to: '/today', label: 'Today', icon: 'today' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', badge: 'inbox' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
]

const CULTIVATE: NavItem[] = [
  { to: '/routines', label: 'Routines', icon: 'routines' },
  // Not in the Navigation Reference — added per 2026-07-18 audit A7 (Focus was unreachable).
  { to: '/focus', label: 'Focus', icon: 'focus' },
  { to: '/weekly-review', label: 'Review', icon: 'clipboard' },
  // Journal is back per D-1 (Kai, 2026-07-26): one daily page, many timestamped entries.
  { to: '/journal', label: 'Journal', icon: 'journal' },
  // [K-26] 2026-07-26 (punch 65) parked the Library; fix-grammar (2026-10-12) brings its row back
  // beside Journal — it was reachable only through Journal or the URL.
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/people', label: 'People', icon: 'people' },
  // Not in the Navigation Reference (Kai kept it anyway).
  { to: '/activity', label: 'Activity', icon: 'activity' },
  // Punch 50: the quiet Trash link the design puts at the bottom of the nav (it had no entry
  // point at all — URL-only).
  { to: '/trash', label: 'Trash', icon: 'delete' },
]

// Motion 2d — the sidebar's filing spots: a task or capture dragged onto Today / Due Today, or a task
// onto Someday, goes there (features/tasks/fileDrop says what each load does; the row's ⋯ menu is
// the same action by tap or key).
const TODAY_SPOT: FileSpot = { kind: 'today', label: 'Today' }
const SOMEDAY_SPOT: FileSpot = { kind: 'someday', label: 'Someday' }

/** A sidebar link that is also a drop spot (components/dragSpots: live while a page that drags is open). */
function SpotLink({ spot, className, ...link }: LinkProps & { spot: FileSpot | null }) {
  const drop = useShellSpot(`side:${String(link.to)}`, spot)
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
        borderRadius: 'var(--radius-input)',
        textDecoration: 'none',
        background: active ? 'var(--frost-bg, var(--paper-parchment))' : 'none',
        border: active ? '1px solid var(--frost-line, var(--line-card))' : '1px solid transparent',
      }}
    >
      <span style={{ width: 16, flex: 'none', display: 'flex', justifyContent: 'center', color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{icon}</span>
      <span style={{ fontSize: 13, color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{label}</span>
      {count != null && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{count}</span>
      )}
    </SpotLink>
  )

  return (
    <div
      className="app-smartlist"
      style={{ padding: '0 14px 12px', margin: '0 0 10px', borderBottom: '1px solid var(--line-sidebar)', display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <div style={{ position: 'relative' }}>
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
          borderRadius: 'var(--radius-input)',
          background: 'var(--paper-linen)',
          border: '1px solid var(--line-sidebar)',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <Icon name="plan" size={15} style={{ color: 'var(--ink-muted)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-muted)' }}>Plan</span>
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
      {/* New smart list (0081): a + beside the open header, not a row of its own — a row pushed Projects
          under the fold on an 800px window (today-shell). features/smart-lists/SmartListNav listens. */}
      {open && (
        <button
          type="button"
          aria-label="New smart list"
          title="New smart list"
          className="kf-press"
          onClick={() => window.dispatchEvent(new Event('kf-new-smart-list'))}
          style={{ position: 'absolute', right: 6, top: 'calc(50% - 1.5px)', transform: 'translateY(-50%)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-input)', background: 'none', color: 'var(--ink-faint)', cursor: 'pointer', font: 'inherit' }}
        >
          <Icon name="plus" size={16} />
        </button>
      )}
      </div>
      {open && (
        <>
          {smartLists.map(({ list, label }) => row(`/tasks?list=${list}`, label, activeList === list, filterByList(tasks, list).length, undefined, list === 'today' ? TODAY_SPOT : null))}
          <div style={{ height: 1, borderTop: '1px solid var(--line-sidebar)', margin: '4px 11px' }} />
          {row('/tasks?list=someday', 'Someday', activeList === 'someday', filterByList(tasks, 'someday').length, (
            <Icon name="someday" size={16} />
          ), SOMEDAY_SPOT)}
          {/* Smart lists (0081): saved filters, each with its count — features/smart-lists. */}
          <Suspense fallback={null}>
            <SmartListNav activeList={activeList} />
          </Suspense>
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

  const [fly, setFly] = useState<{ x: number; y: number } | null>(null)
  const showFly = (e: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed) return
    const r = e.currentTarget.getBoundingClientRect()
    const z = uiZoom() // visual → layout px
    setFly({ x: r.right / z + 8, y: (r.top + r.height / 2) / z })
  }
  const hideFly = () => setFly(null)
  const drop = useShellSpot(`side:${item.to}`, item.to === '/today' ? TODAY_SPOT : null)
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
        borderRadius: 'var(--radius-input)',
        textDecoration: 'none',
        // Night 1a: the active row is frosted glass (the night tokens; day keeps its own). Upright and
        // untaped by day too: the nav is a tool (D7).
        background: isActive ? 'var(--frost-bg, var(--paper-parchment))' : 'none',
        border: isActive ? '1px solid var(--frost-line, var(--line-card))' : '1px solid transparent',
        boxShadow: isActive ? 'var(--shadow-frost, var(--shadow-crisp))' : 'none',
      }}
    >
      {/* Icons A (2026-10-22): the row's own line icon, open or on the rail — R4-1's "cluster of icons"
          when collapsed, with no dot / flower / species art in between. Explicit colour: the Link sets none. */}
      <span className="kf-nav-icon" style={{ width: 18, display: 'flex', justifyContent: 'center', flex: 'none', color: isActive ? 'var(--ink-body)' : 'var(--ink-muted)' }}>
        <Icon name={item.icon} size={18} />
      </span>
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
    <div className="app-nav-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', padding: '12px 12px 5px' }}>
      {children}
    </div>
  )
}

// Today 2a's streak: "6-day streak / best 21 · day 42" — the highest current routine streak (the
// streak the removed terrarium band showed), the best, and the day of the journey (today/journey, the
// phone header's "Day N"). Bottom B (Sidebar options.html, Kai 2026-10-22): the top of the menu under
// your name, words only — the vine that sat beside it at the foot is gone.
function SideStreak() {
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

  return (
    <div className="kf-side-streak" style={{ padding: '6px 10px 4px' }}>
      <div style={{ fontSize: 'var(--fs-body-s)', fontWeight: 'var(--fw-medium)', color: 'var(--ink-body)' }}>{current}-day streak</div>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)', marginTop: 1 }}>best {best} · day {day}</div>
    </div>
  )
}

// Bottom B (Sidebar options.html, Kai's pick 2026-10-22): the foot is Capture, Search and Chat — one wide
// Capture button and two icon buttons. Hover or focus shows the name and its keys above the button (on
// the rail, beside it, Capture included), drawn on <body> like the rail's nav labels. The shell's own
// keys (⌘K, ⌘/, ⌘J) are unchanged.
function ToolButton({ icon, label, keys, onClick, wide = false, collapsed = false }: { icon: IconName; label: string; keys: string; onClick: () => void; wide?: boolean; collapsed?: boolean }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const showTip = (e: React.SyntheticEvent<HTMLElement>) => {
    if (wide && !collapsed) return // its name and keys are written on it
    const r = e.currentTarget.getBoundingClientRect()
    const z = uiZoom() // visual → layout px
    setTip(collapsed ? { x: r.right / z + 8, y: (r.top + r.height / 2) / z } : { x: (r.left + r.width / 2) / z, y: r.top / z - 6 })
  }
  const hideTip = () => setTip(null)
  return (
    <button
      type="button"
      className={`kf-side-tool${wide ? ' kf-side-capture' : ''}`}
      aria-label={label}
      onClick={() => {
        hideTip()
        onClick()
      }}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
    >
      <Icon name={icon} size={18} />
      {wide && <span className="app-footer-label">{label}</span>}
      {wide && <KeyCombo className="app-footer-label" keys={splitKeyCombo(keys)} size="sm" style={{ marginLeft: 'auto' }} />}
      {tip && (
        <Float>
          <span className={`kf-nav-flyout kf-tool-tip${collapsed ? '' : ' kf-tool-tip--above'}`} aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
            {label}
            <KeyCombo keys={splitKeyCombo(keys)} size="sm" />
          </span>
        </Float>
      )}
    </button>
  )
}

type SideSync = { kind: SyncView['kind']; label: string; open: (at: { x: number; y: number }) => void }

// Bottom B: the name at the top opens a menu — the streak, Settings, Guide, the sync status and Sign out,
// which used to stack at the foot. On the rail it is the app icon. The sync dot rides the icon (Today 2a's
// "● synced", same states); its words are the menu's sync row, which opens the queue popover as before.
function SideHeader({ collapsed, sync: withSync, onSignOut }: { collapsed: boolean; sync: boolean; onSignOut: () => void }) {
  const owner = useOwner()
  const zone = useAppZone()
  const navigate = useNavigate()
  const motionOn = useMotionEnabled()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const dot = (sync: SideSync | null) =>
    // Its words as a tooltip on hover ("offline · 1"); aria-hidden, as the menu's sync row (and the
    // name button) already says them — a titled span would read twice inside that row.
    sync && <span className="kf-side-sync-dot" aria-hidden="true" data-sync={sync.kind} title={sync.label} style={sync.kind === 'synced' && motionOn ? { animation: 'twinkle 300ms var(--ease-out)' } : undefined} />
  const header = (sync: SideSync | null) => (
    // Onboarding's promise: "the whole app takes your name" + the workspace line. Unset answers keep
    // the old "Kai's Flow / Personal · Cairo". The city is the user's zone's (Settings → Timezone; Cairo
    // by default) — the app's day boundary (B2). Names are user-typed, so both lines ellipsize.
    <div className="app-sidebar-header" style={{ padding: '0 14px 14px', visibility: owner.pending ? 'hidden' : undefined }}>
      <button
        type="button"
        className="kf-side-me"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        aria-label={`${owner.flow}: Settings, Guide, Sign out${sync ? ` · sync: ${sync.label}` : ''}`}
        onClick={(e) => {
          if (menu) return setMenu(null)
          const r = e.currentTarget.getBoundingClientRect()
          setMenu(collapsed ? { x: r.right + 6, y: r.top } : { x: r.left, y: r.bottom + 4 })
        }}
      >
        <span className="kf-side-me-icon">
          <img src="/icon-192.png" alt="" style={{ width: 28, height: 28, display: 'block' }} />
          {dot(sync)}
        </span>
        <span className="kf-side-me-text">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span title={owner.flow} style={{ minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', fontWeight: 'var(--fw-semibold)', letterSpacing: 'var(--ls-display)', color: 'var(--ink-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner.flow}</span>
            <Icon name="chevdown" size={14} style={{ color: 'var(--ink-faint)' }} />
          </span>
          <span title={owner.workspace} style={{ display: 'block', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner.workspace} · {zoneCity(zone)}</span>
        </span>
      </button>
      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          label={owner.flow}
          width={240}
          header={<SideStreak />}
          items={[
            { label: 'Settings', icon: <Icon name="settings" size={18} />, shortcut: '⌘,', onClick: () => navigate('/settings') },
            { label: 'Guide', icon: <Icon name="guide" size={18} />, onClick: () => navigate('/guide') },
            ...(sync
              ? [{ label: sync.label[0].toUpperCase() + sync.label.slice(1), icon: <span className="kf-side-sync-row">{dot(sync)}</span>, onClick: () => sync.open({ x: menu.x / uiZoom(), y: menu.y / uiZoom() }) }]
              : []),
            { label: 'Sign out', icon: <Icon name="signout" size={18} />, divider: true, onClick: onSignOut },
          ]}
        />
      )}
    </div>
  )
  // A phone has no sidebar (its top bar carries the sync words): no second sync watcher there.
  return withSync ? <SyncStatus side={header} /> : header(null)
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
// popover. One home per layout: a computer's sidebar header (Today 2a / Inbox 3a's "● synced"; bottom B
// puts the dot on the app icon and the words in the menu under your name), a phone's top bar (no sidebar
// there). Kai 2026-10-07: the strip flipped "Syncing ↻ 1" ↔ "Synced ●"
// (with a glint) on every write, about two seconds per change. The phone strip now says nothing while
// writes flush and speaks only when something is slow, offline or not saved (useSyncStatus,
// ./syncQueue.ts); the sidebar keeps 2a's steady "synced" and changes only on the same events. A brief
// "Synced" (2d's glint) ends an offline / not-saved spell. ──
function SyncStatus({ side }: { side?: (sync: SideSync) => ReactNode }) {
  const motionOn = useMotionEnabled()
  const { view, online, queue, waiting: n, parked, seeParked } = useSyncStatus()
  const rows = useMemo(() => syncRows(queue), [queue])
  const label = syncLabel(view)
  // The popover; `parked` holds the not-saved rows it was opened on — opening it is seeing them.
  // `at` (layout px) places the sidebar's popover where its menu was.
  const [pop, setPop] = useState<{ parked: SyncRow[] | null; at?: { x: number; y: number } } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const popOpen = pop !== null
  const togglePop = (at?: { x: number; y: number }) => {
    if (popOpen) return setPop(null)
    if (view.kind !== 'parked') return setPop({ parked: null, at })
    setPop({ parked: syncRows(parked, 'changed'), at })
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

  // A not-saved row's two ways out (lib/outbox): it leaves the list either way.
  const settle = (r: SyncRow, way: (e: SyncRow['entry']) => Promise<void>) => {
    void way(r.entry)
    setPop((p) => {
      const left = p?.parked?.filter((x) => x.key !== r.key)
      return left ? (left.length ? { ...p, parked: left } : null) : p
    })
  }
  const rowAct = { font: 'inherit', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra-ink)', background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', flex: 'none' } as const
  const rowList = (list: SyncRow[], parked = false) => (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
      {list.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-body)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', flex: 'none' }}>{r.kind}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text}</span>
          {parked ? (
            <>
              <button type="button" className="kf-hit" style={rowAct} onClick={() => settle(r, retryParked)}>Try again</button>
              <button type="button" className="kf-hit" style={{ ...rowAct, color: 'var(--ink-muted)' }} onClick={() => settle(r, discardParked)}>Discard</button>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', flex: 'none' }}>{queueAgo(r.queuedAt)}</span>
          )}
        </div>
      ))}
    </div>
  )
  // A tool's aside (D7: Caveat writes on pages only): the UI face, muted, under a hairline.
  const hand = (text: string) => <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line-dashed)', fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)' }}>{text}</div>
  // The sidebar's popover draws on <body> (fixed, where the menu was): the sidebar column scrolls and would clip it.
  const place = (el: ReactNode) => (side ? <Float>{el}</Float> : el)
  return (
    <>
      {side ? (
        side({ kind: view.kind, label: sideSyncLabel(view), open: togglePop })
      ) : (
        label && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => togglePop()}
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

      {pop && place(
        <div
          ref={popRef}
          className={`kf-sync-pop kf-overlay-card${side ? ' kf-sync-pop--side' : ''}`}
          style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-popover)', padding: '12px 14px', ...(pop.at && { top: pop.at.y, left: pop.at.x }) }}
        >
          {pop.parked ? (
            <>
              {/* The server set these aside (lib/outbox.ts dead letters) so the rest could sync. */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra-ink)' }}>
                Not saved ⚠ · {pop.parked.length} {pop.parked.length === 1 ? 'change' : 'changes'}
              </div>
              {rowList(pop.parked, true)}
              {hand('Set aside so everything else syncs on — Try again, or Discard to let it go')}
            </>
          ) : n === 0 ? (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-body)' }}>All caught up.</div>
          ) : (
            <>
              {/* polish-c (2026-09-26 audit): human rows only — one per change, never a table
                  name, never the change's bookkeeping activity row alongside it (components/syncQueue.ts). */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: !online ? 'var(--ink-muted)' : 'var(--acc-sage-text)' }}>
                {syncHeader(n, online)}
              </div>
              {rowList(rows)}
              {hand(online ? 'Syncing now — nothing lost ✿' : "Everything here syncs the moment you're back.")}
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
// it. The sync status rides it only on a phone; on a computer it lives in the sidebar's header. ──
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
      style={{ position: 'relative', height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 40px', borderBottom: '1px solid var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}
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

/** P7e A3/A7: the shell's newer keys rest while you type (a field keeps its own ⌘Z), while a menu or
 * dialog is open, and while any overlay holds the Esc stack — the command bar, search, chat, a
 * picker, a selection. */
function keysResting(e: KeyboardEvent): boolean {
  return isTypingTarget(e.target) || overlayCount() > 0 || !!document.querySelector('[role="dialog"], [role="menu"]')
}

/** Dispatched on `window` to open search from a page's own top bar (the shell owns the overlay). */
const OPEN_SEARCH_EVENT = 'kf-open-search'

/** Pages whose desktop frame has no top bar: Today 2a and Inbox 3a (both "reviewed pass"), and the
 * calendar (Kai 2026-10-14: "I don't want any wasted spaces" — its own header row carries the date). */
const NO_TOPBAR = ['/today', '/inbox', '/calendar']
/** Desktop pages that fill the window edge to edge: no page padding, no page scroll (Akiflow's
 * calendar beside its list). Phones keep the padded column. */
const FULL_BLEED = ['/calendar']

export function AppLayout() {
  useRealtimeSync()
  useAutoFileNotice() // queue item 7: captures wait in the Inbox now — told once
  // R4-D3: keeps a running Focus session ticking wherever Kai navigates.
  useFocusTicker()
  const motionOn = useMotionEnabled()
  // M2: what lives on <body> (popovers, the drag's lifted card) reads the Effects setting from <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('kf-motion-on', motionOn)
  }, [motionOn])
  const location = useLocation()
  const { pathname } = location
  const isMobile = useIsMobile()
  const bleed = !isMobile && FULL_BLEED.includes(pathname)
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
      // ⌘Z / Ctrl+Z (P7e A3): the newest toast's Undo. Inside a field the browser's own undo runs.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && pressed(e, 'z', 'KeyZ') && !keysResting(e) && undoLatest()) e.preventDefault()
      // ⌘, / Ctrl+, (P7e A7): Settings.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && pressed(e, ',', 'Comma') && !keysResting(e)) {
        e.preventDefault()
        navigate('/settings')
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
      // P7e A7, Akiflow's single keys: i Inbox, u Upcoming, bare / Search. (t stays Top 3, g stays in ⌘K: D-5.)
      if (keysResting(e)) return
      const go = !e.shiftKey && pressed(e, 'i', 'KeyI') ? '/inbox' : !e.shiftKey && pressed(e, 'u', 'KeyU') ? '/tasks?list=upcoming' : null
      if (go) {
        e.preventDefault()
        navigate(go)
      }
      // '/' wherever the layout puts it (Shift+7 on German); on a non-Latin layout, the unshifted Slash key.
      if (e.key === '/' || (e.code === 'Slash' && !e.shiftKey && !/^[\x20-\x7e]$/.test(e.key))) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [setCommandBarOpen, toggleCommandBar, navigate])

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
        /* A size container query, not a media query: it measures the sidebar in zoomed CSS px. */
        .app-sidebar { container: kf-sidebar / size; }
        /* Bottom B (Sidebar options.html, Kai 2026-10-22): the name is the menu's button, and the app
           icon carries Today 2a's "● synced" dot; the foot is one row, Capture · Search · Chat. */
        .kf-side-me { display: flex; align-items: center; gap: 10px; width: 100%; padding: 2px 8px; border: none; border-radius: var(--radius-input); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
        .kf-side-me:hover, .kf-side-me[aria-expanded='true'] { background: var(--paper-bone); }
        .kf-side-me:focus-visible, .kf-side-tool:focus-visible { outline: none; box-shadow: var(--focus-ring); }
        .kf-side-me-icon { position: relative; flex: none; display: flex; }
        .kf-side-me-text { flex: 1; min-width: 0; }
        .kf-side-sync-dot { width: 6px; height: 6px; flex: none; box-sizing: border-box; border-radius: 50%; background: var(--acc-sage); }
        .kf-side-sync-dot[data-sync='syncing'] { background: var(--ink-faint); }
        .kf-side-sync-dot[data-sync='offline'] { background: none; border: 1px solid var(--ink-muted); }
        .kf-side-sync-dot[data-sync='parked'] { background: var(--acc-terra); }
        .kf-side-me-icon .kf-side-sync-dot { position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border: 2px solid var(--paper-sidebar); }
        .kf-side-me-icon .kf-side-sync-dot[data-sync='offline'] { background: var(--paper-sidebar); border: 1.5px solid var(--ink-muted); }
        .kf-side-sync-row { width: 18px; display: flex; justify-content: center; }
        .kf-sync-pop.kf-sync-pop--side { position: fixed; }
        .kf-side-tools { display: flex; align-items: center; gap: 4px; padding-top: 10px; border-top: 1px solid var(--line-sidebar); }
        .kf-side-tool { flex: none; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0; border: none; border-radius: var(--radius-input); background: none; color: var(--ink-muted); font: inherit; cursor: pointer; }
        .kf-side-tool:hover { background: var(--paper-bone); color: var(--ink-body); }
        .kf-side-tool.kf-side-capture { flex: 1; min-width: 0; width: auto; height: 36px; justify-content: flex-start; padding: 0 10px; background: var(--paper-bone); color: var(--ink-body); font-size: var(--fs-body-s); font-weight: var(--fw-medium); }
        .kf-side-tool.kf-side-capture:hover { box-shadow: inset 0 0 0 1px var(--line-card); }
        .kf-tool-tip { display: flex; align-items: center; gap: 8px; }
        .kf-nav-flyout.kf-tool-tip--above { transform: translate(-50%, -100%); }
        .app-sidebar.collapsed .kf-side-tools { flex-direction: column; gap: 2px; }
        .app-sidebar.collapsed .kf-side-tool.kf-side-capture { flex: none; width: 34px; justify-content: center; padding: 0; }
        .app-sidebar.collapsed .app-sidebar-header { padding: 0 14px 12px !important; }
        .app-sidebar.collapsed .kf-side-me { justify-content: center; padding: 3px 0; }
        /* Short sidebar (1280×800 at the default 125% is 640 layout px): the column tightens a little to
           keep Tend's five rows in view with the Plan drawer open. */
        @container kf-sidebar (max-height: 799px) {
          .app-sidebar:not(.collapsed) .app-sidebar-col { padding-top: 16px !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-header { padding-bottom: 12px !important; }
          .app-sidebar:not(.collapsed) nav > .app-nav-label { padding-top: 6px !important; }
          /* Bound Journal's 12px meta and rounded rows cost the column a few px: Projects ran 2px under the
             fold at 1280×800 (640 layout px). The nav rows step from 8 to 6px of vertical padding here (35px,
             a mouse target; phones never see the sidebar), which keeps all of Tend in view. */
          .app-sidebar:not(.collapsed) nav .kf-side-row { padding-top: 6px !important; padding-bottom: 6px !important; }
          .app-sidebar:not(.collapsed) .app-sidebar-footer { padding-bottom: 8px !important; }
        }
        /* Collapsed-rail hover label (R4). Sits outside the 64px rail, so the rail keeps its
           width and the label floats over the page. Styled to the export's nav row: parchment,
           card border, crisp shadow, 14px --ink-body. NavRow places it (fixed, on <body>). */
        .kf-nav-flyout {
          position: fixed; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none;
          background: var(--paper-parchment); border: 1px solid var(--line-card);
          box-shadow: var(--shadow-crisp); border-radius: var(--radius-input); padding: 6px 11px;
          font-size: 14px; color: var(--ink-body); z-index: 60;
          animation: kfFadeIn var(--dur-quick) var(--ease-out);
        }
        /* The collapsed rail scrolls when a short window can't hold it (it used to run under the
           pinned footer at 125–150%); no scrollbar strip on a 64px rail. */
        .app-sidebar.collapsed .app-sidebar-col { scrollbar-width: none; }
        /* Kai 2026-10-22 (150%: "Library" cut at the bottom of Cultivate): a short sidebar scrolls its nav, and the
           last row in view ended hard against the pinned foot, as if clipped. While there's more below, the column's
           last 36px fade out; scrolled to the end (or nothing to scroll) there's no fade. A scroll-driven animation:
           an inactive timeline (no overflow) leaves --kf-side-fade at 0. */
        @property --kf-side-fade { syntax: '<length>'; inherits: false; initial-value: 0px; }
        @keyframes kfSideFade { from, 96% { --kf-side-fade: 36px; } to { --kf-side-fade: 0px; } }
        @supports (animation-timeline: scroll()) {
          .app-sidebar-col { mask-image: linear-gradient(to bottom, var(--ink-body) calc(100% - var(--kf-side-fade)), transparent); /* a mask reads alpha only */ animation: kfSideFade linear both; animation-timeline: scroll(self); }
        }
        .app-sidebar.collapsed .app-sidebar-col::-webkit-scrollbar { display: none; }
        /* Kai 2026-10-03: collapsed, a row's 12px side padding + its 18px icon (42) were wider than
           the rail leaves it (35), so the icon overflowed the box to the right: the active box read
           off-centre to the left and a strip sat empty on the right. The box now hugs the centred
           icon, and the inbox count rides its corner instead of pushing the icon aside. */
        .app-sidebar.collapsed .kf-side-row { justify-content: center; padding-left: 0 !important; padding-right: 0 !important; }
        .app-sidebar.collapsed .app-nav-badge { position: absolute; top: 1px; right: 3px; margin: 0 !important; font-size: 9px !important; line-height: 1; }
        .app-sidebar.collapsed .kf-side-me-text,
        .app-sidebar.collapsed .app-nav-label,
        .app-sidebar.collapsed .app-footer-label,
        .app-sidebar.collapsed .app-smartlist { display: none !important; }

        .kf-side-row {
          transition: transform var(--dur-quick) var(--ease-spring);
        }
        .kf-side-row:hover { background: var(--paper-bone) !important; transform: translateX(3px); }
        .kf-side-row:active { transform: translateX(1px); }
        .kf-side-row.kf-active:hover { background: var(--frost-bg, var(--paper-parchment)) !important; }

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
        /* Calendar motion M2 (2026-10-22): one popover recipe — 140ms in, scaling from its anchor side
           (--pop-origin), 100ms out. The scale only with Effects on (html.kf-motion-on: popovers live on
           <body>, outside .motion-on); the fade always. A backwards fill ends at no transform, so a fixed
           submenu anchors to the viewport once the menu has arrived. */
        @keyframes kfPopIn { from { opacity: 0; transform: scale(0.97); } }
        @keyframes kfPopFadeIn { from { opacity: 0; } }
        @keyframes kfPopOut { to { opacity: 0; transform: scale(0.98); } }
        @keyframes kfPopFadeOut { to { opacity: 0; } }
        .kf-pop { transform-origin: var(--pop-origin, top left); animation: kfPopFadeIn var(--dur-pop-in) var(--ease-out) backwards; }
        .kf-motion-on .kf-pop { animation-name: kfPopIn; }
        .kf-pop.kf-pop--out { animation: kfPopFadeOut var(--dur-pop-out) var(--ease-in) both; pointer-events: none; }
        .kf-motion-on .kf-pop.kf-pop--out { animation-name: kfPopOut; }

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

        /* X4 — >=44px touch targets for small glyph controls, coarse pointers only. */
        .kf-hit { position: relative; }
        .kf-checkbox { position: relative; }
        @media (pointer: coarse) {
          .kf-hit::after { content: ''; position: absolute; inset: -12px; }
          /* A glyph pinned in the top-right corner of a clipped box (a journal photo's ×): the square
             grows down and in from the glyph's corner, so the clip can't cut it under 44 and it never
             reaches past the box onto the next photo or the words above. */
          .kf-hit.kf-hit-corner::after { inset: 0 0 auto auto; width: var(--touch-min); height: var(--touch-min); }
          /* A small text control with neighbours close by (the phone journal footer's links, 12px apart): the area
             grows to 44px, centred, and no further, so it never reaches the next one; a side already 44 stays put. */
          .kf-hit.kf-hit-min::after { inset: min(0px, calc(50% - 22px)); }
          /* A destructive control sitting just above a text field (a journal entry's Delete, 4px over its
             words): the area grows up and sideways only, so a tap meant for the field never deletes. */
          .kf-hit.kf-hit-above::after { bottom: 0; }
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

        {/* Today 2a: the app icon beside the wordmark; 2a drops the hand line ("a field journal of
            days ✿"). deviation(2026-10-13 today-shell): the workspace · city line stays — it is
            the only place the workspace answer shows, and with no top bar on Today / Inbox the
            only place the user's zone does. Bottom B (2026-10-22): it is the menu's button. */}
        <SideHeader collapsed={collapsed} sync={!isMobile} onSignOut={signOutFlow.request} />

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

        {/* Shell fit (2026-09-26): the foot is pinned below the scrolling column, so it is always one tap
            away. Bottom B (2026-10-22): one row — Capture, Search, Chat; the rest moved to the header. */}
        <div className="app-sidebar-footer" style={{ flex: 'none', padding: '4px 14px 14px' }}>
          <div className="kf-side-tools">
            <ToolButton wide icon="plus" label="Capture" keys="⌘K" onClick={openCapture} collapsed={collapsed} />
            <ToolButton icon="search" label="Search" keys="⌘/" onClick={() => setSearchOpen(true)} collapsed={collapsed} />
            <ToolButton icon="chat" label="Chat" keys="⌘J" onClick={() => setChatOpen(true)} collapsed={collapsed} />
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <DownloadBar />
        {(isMobile || !NO_TOPBAR.includes(pathname)) && <TopBar sync={isMobile} />}
        <div ref={scrollerRef} className="app-main-content" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: bleed ? 'hidden' : 'auto', padding: bleed ? 0 : '30px 40px 64px' }}>
          <Suspense fallback={<PageFallback />}>
            <div key={`${pathname}|${zone}`} className="kf-route" data-initial={isFirstMount.current ? '' : undefined} style={bleed ? { height: '100%' } : undefined}>
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
      {/* docs/LEGAL.md: "We've updated our terms", until they agree (or leave). */}
      <TermsNoticeHost />
      <SubtaskAskHost />
      <ToastHost />
      {signOutFlow.prompt}
    </div>
  )
}
