import { useEffect, useMemo, useRef, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { SortIcon } from '../../components/controlIcons'
import { Select } from '../../components/Select'
import { Link, useSearchParams } from 'react-router'
import { useOpenTask } from './openTask'
import { useDomains, createDomain, renameDomain } from '../domains/api'
import { DomainList, useDomainMenu } from '../domains/DomainList'
import { RenameField } from '../../components/RenameField'
import { filterChip } from '../../components/filterChip'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { NewProjectModal } from '../projects/NewProjectModal'
import { useCalendarRows } from '../calendar/api'
import { useTasks, completeTask, completeTaskWithUndo, undoCompletion, reopenTaskWithUndo, rescheduleDue, planWithUndo, toggleTop3, toggleTop3ManyWithUndo, moveTasksWithUndo, rescheduleTasksWithUndo, somedayTasksWithUndo, deleteTasksWithUndo, moveToTomorrowWithUndo, type CompletionUndo } from './api'
import { PlanMenu } from './PlanMenu'
import { todayFor } from './planMath'
import { checkAction } from './completion'
import { TaskRow, type BulkActions } from './TaskRow'
import { filterByList, groupTasks, SMART_LISTS, type SmartList, type TaskGroup } from './grouping'
import { buildListBindings } from './listShortcuts'
import { useListVerbs } from './useListVerbs'
import { moveInListWithUndo } from './api'
import { labelOptions } from './taskDisplay'
import { parseCommand } from '../command-bar/parseCommand'
import { addTypedTask } from '../command-bar/quickAdd'
import { useListKeys } from '../../components/useListKeys'
import { MovePicker } from './MovePicker'
import { LabelPicker } from './LabelPicker'
import { LabelManagerOverlay } from './LabelManager'
import { placeKey, type MoveTarget } from './move'
import { BulkBar } from '../../components/BulkBar'
import { DragRow, DropZone, type DragLoad } from '../../components/drag'
import { dropTasks, taskVerdict, type FileSpot } from './fileDrop'
import { ErrorCard, OfflineChip, Skeleton } from '../../components/States'
import { cherryStage } from '../../lib/growthStages'
import { claimDayComplete, DAY_DONE_DWELL_MS } from '../today/dayComplete'
import { listState } from '../journal/journalDay'
import { useOnline } from '../../lib/useOnline'
import { Button, SectionLabel } from '../../components/kit'
import { rowAnchor } from '../../lib/rowAnchor'
import { cairoDateKey, scheduleNextWeek, scheduleToday } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { animateRowRemoval, cancelRowRemoval, useMotionEnabled, staggerDelay } from '../../lib/motion'
import { toastUndo } from '../../lib/undo'
import { seedPlant } from '../../lib/seedPlant'
import { legacyGoalId } from '../today/goalStore'
import { goalIdOf } from '../today/top3Order'
import { cachedStarEvents } from '../today/api'
import { CaptureCta } from '../capture/CaptureCta'
import { findDuplicateClusters } from '../import/dedupe'
import type { Area, Domain, Project, Task } from '../../lib/types'

// ── Tasks — pixel contract: Tasks.dc.html 1a (desktop list + rail), 1b (iPhone + filter
// chips), 2a (Done — fallen petals), 2b (Someday — the quiet shelf), 2c (iPhone Done).
// The tab row (Today/Overdue/Upcoming/Someday/Done/All) is the page's own scoping; the
// sidebar's Plan drawer additionally deep-links `?list=week|month`, which render the same
// list body with no tab highlighted. ──

const A = '/ds/assets'
const GROUP_CAP = 50 // U-7: rows per group before "Show N more"

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

function effectiveDomainId(task: Task, projects: Project[], areas: Area[]): string | null {
  if (task.domain_id) return task.domain_id
  if (task.project_id) return projects.find((p) => p.id === task.project_id)?.domain_id ?? null
  if (task.area_id) return areas.find((a) => a.id === task.area_id)?.domain_id ?? null
  return null
}

/** Scrolls a deep-linked task row into view once it exists in the rendered list. */
function useDeepLinkScroll(focusId: string | null, tasks: Task[]): void {
  useEffect(() => {
    if (!focusId) return
    document.getElementById(`task-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, tasks])
}

export type SortKey = 'smart' | 'due' | 'priority' | 'title'
const SORT_KEYS: readonly SortKey[] = ['smart', 'due', 'priority', 'title']
const SORT_OPTION_LABELS: Record<SortKey, string> = { smart: 'Smart', due: 'Due', priority: 'Priority', title: 'A–Z' }
const SORT_LABELS: Record<SortKey, string> = { smart: 'Sort · Smart', due: 'Sort · Due', priority: 'Sort · Priority', title: 'Sort · A–Z' }

/** Reorders tasks inside each display group. `smart` keeps groupTasks' own date order. */
function applySort(groups: TaskGroup[], sort: SortKey): TaskGroup[] {
  if (sort === 'smart') return groups
  const cmp = (a: Task, b: Task) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'priority') return (a.priority ?? 99) - (b.priority ?? 99)
    return new Date(a.due_at ?? a.scheduled_start ?? 8.64e15).getTime() - new Date(b.due_at ?? b.scheduled_start ?? 8.64e15).getTime()
  }
  return groups.map((g) => ({ ...g, tasks: [...g.tasks].sort(cmp) }))
}

function parseList(raw: string | null): SmartList | null {
  return SMART_LISTS.includes(raw as SmartList) ? (raw as SmartList) : null
}

type Tab = 'today' | 'week' | 'month' | 'overdue' | 'upcoming' | 'someday' | 'done' | 'all'

// Punch 27: `/tasks?list=all` is the stable deep-link contract for "every open task" —
// Today's "View all →" (WA-4), Inbox filing feedback, and search deep links all target it
// (optionally with `&focus=<taskId>` to scroll + highlight the row).
function tabOf(rawList: string | null, list: SmartList | null): Tab | null {
  if (rawList === 'done') return 'done'
  if (rawList === null) return 'today'
  return list
}

// The tools' triggers (Sort, Label): metadata, no box — the click-cycler look J-12 kept.
const TOOL_TRIGGER: React.CSSProperties = { gap: 6, background: 'none', border: 'none', borderRadius: 0, padding: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', userSelect: 'none' }
// The page's metadata, and the quiet count or time beside a section label (D6).
const META: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }
// Bound Journal (D1 · D3 · D4 · D7): an Organize card is a tool — 16px corners, flat, a hairline; no tape, no tilt.
const RAIL_CARD: React.CSSProperties = { background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', padding: '16px 16px 14px' }
// D7: handwriting lives on pages — a tool's caption or empty line is the interface face (kf-help raises its first letter).
const CAPTION: React.CSSProperties = { marginTop: 12 }
const MANAGE_LABELS = ' manage' // a label is trimmed, so none starts with a space
const CARET = <span aria-hidden="true" style={{ color: 'var(--ink-faint)', lineHeight: 1 }}>▾</span>

function TabBar({ active, todayCount, weekCount, monthCount, overdueCount, upcomingCount, somedayCount, doneCount, allCount, sort, onSort, labels, label, onLabel, onManageLabels }: { active: Tab | null; todayCount: number; weekCount: number; monthCount: number; overdueCount: number; upcomingCount: number; somedayCount: number; doneCount: number; allCount: number; sort: SortKey; onSort: (s: SortKey) => void; labels: string[]; label: string | null; onLabel: (l: string | null) => void; onManageLabels: (at: { x: number; y: number }) => void }) {
  const stripRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLButtonElement>(null)
  // Polish D: on a narrow screen the strip scrolls sideways — keep the active tab in view
  // (a deep link to Done/All would otherwise land on a tab scrolled out of sight).
  useEffect(() => {
    const strip = stripRef.current
    const el = strip?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left - 16)
  }, [active])
  const tab = (key: Tab, label: string, count: number, underline: string, className?: string) => (
    <Link
      key={key}
      to={key === 'done' ? '/tasks?list=done' : `/tasks?list=${key}`}
      aria-current={active === key ? 'page' : undefined}
      className={className}
      style={{
        position: 'relative',
        flex: 'none',
        whiteSpace: 'nowrap',
        paddingBottom: 11,
        fontSize: 14,
        fontWeight: active === key ? 600 : 400,
        color: active === key ? 'var(--ink-body)' : 'var(--ink-faint)',
        textDecoration: 'none',
      }}
    >
      {label}
      <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: active === key ? underline : 'var(--ink-faint)' }}>{count}</span>
      {active === key && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: underline, borderRadius: 2 }} />}
    </Link>
  )
  // Polish D (2026-09-26 audit): this was ONE unbreakable line (~640px: six tabs + Repeating +
  // Sort). Wherever the list column is narrower — 1280/1440 at the default 125% interface size,
  // every phone — it ran on under the Organize rail (All, Repeating and Sort unclickable) or off
  // the screen. Now the tools wrap onto their own line ABOVE the tabs (wrap-reverse keeps the
  // tabs on the bar's bottom border), and only if the tabs alone still don't fit does their strip
  // scroll sideways inside itself (phones). One line, as drawn in Tasks.dc.html 1a, whenever it fits.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap-reverse', alignItems: 'center', columnGap: 22, marginTop: 24, borderBottom: '1px solid var(--line-card)' }}>
      {/* paddingBottom 1 + marginBottom -1: the active underline (bottom -1) stays inside the
          scroller's clip box and still lands on the bar's border, exactly as before. */}
      <div ref={stripRef} style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flex: '1 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', paddingBottom: 1, marginBottom: -1 }}>
        {tab('today', 'Today', todayCount, 'var(--acc-blossom)')}
        {/* Kai 2026-10-12: This Week / This Month lived only in the desktop sidebar's Plan drawer — a
            phone had no way in. They join the phone's strip (it scrolls sideways); desktop keeps the drawer. */}
        {tab('week', 'This Week', weekCount, 'var(--acc-blossom)', 'tr-mobile-only')}
        {tab('month', 'This Month', monthCount, 'var(--acc-blossom)', 'tr-mobile-only')}
        {/* R4-12 (2026-07-20 audit): overdue-only view, terra like every other overdue affordance */}
        {tab('overdue', 'Overdue', overdueCount, 'var(--acc-terra)')}
        {tab('upcoming', 'Upcoming', upcomingCount, 'var(--acc-blossom)')}
        {tab('someday', 'Someday', somedayCount, 'var(--acc-sage)')}
        {tab('done', 'Done', doneCount, 'var(--acc-blossom)')}
        {/* Punch 27 (Kai's "All filter"): last, after Done — the catch-all where every open
            task lives, undated project filings included. */}
        {tab('all', 'All', allCount, 'var(--acc-moss)')}
      </div>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, paddingBottom: 11, whiteSpace: 'nowrap' }}>
        <Link to="/perennials" style={{ ...META, textDecoration: 'none' }}>↻ Repeating</Link>
        {/* Kai 2026-10-03: a Label filter beside Sort, the same popover — only once a label exists. */}
        {(labels.length > 0 || label) && (
          <Select
            value={label ?? ''}
            triggerRef={labelRef}
            onChange={(v) => {
              if (v !== MANAGE_LABELS) return onLabel(v || null)
              const r = labelRef.current?.getBoundingClientRect()
              onManageLabels({ x: r?.left ?? 0, y: (r?.bottom ?? 0) + 4 })
            }}
            // The Labels manager (Overlays.dc.html) from where the labels are — also Settings → Organize.
            options={[{ value: '', label: 'All labels' }, ...labels.map((l) => ({ value: l, label: l })), { value: MANAGE_LABELS, label: 'Manage labels…' }]}
            title="Filter by label"
            ariaLabel="Label filter"
            className="kf-hit"
            display={<>Label · {label ?? 'All'} {CARET}</>}
            style={label ? { ...TOOL_TRIGGER, color: 'var(--ink-body)' } : TOOL_TRIGGER}
          />
        )}
        {/* R4-21 (2026-07-20 audit): this was a dead span (cursor:default, no handler) drawn
            with the `⚟` glyph, then a click-cycler. J-12 (Kai): "a popover listing the options"
            instead of clicking through Smart → Due → Priority → A–Z — the themed Select's own
            popover, with the trigger keeping the cycler's exact look. */}
        <Select
          value={sort}
          onChange={(v) => onSort(v as SortKey)}
          options={SORT_KEYS.map((k) => ({ value: k, label: SORT_OPTION_LABELS[k] }))}
          title="Change sort order"
          ariaLabel="Sort order"
          className="kf-hit"
          // Polish F2a (FIX-6 decision "add a subtle ▾"): the trigger opens a menu, so it shows the
          // caret the app's other menu triggers carry (BulkBar, Inbox bulk, People) — hairline ink,
          // the label's own size.
          display={<><SortIcon /> {SORT_LABELS[sort]} {CARET}</>}
          style={TOOL_TRIGGER}
        />
      </span>
    </div>
  )
}

/** A domain filter chip: the kit's filter chip (D12), with its click cursor. */
function domainChipLook(on: boolean): { className: string; style: React.CSSProperties } {
  const c = filterChip(on)
  return { className: c.className, style: { ...c.style, cursor: 'pointer' } }
}

function SectionHeader({ group }: { group: TaskGroup }) {
  const terra = group.key === 'overdue'
  const h = Math.floor(group.totalMinutes / 60)
  const m = group.totalMinutes % 60
  const time = group.totalMinutes > 0 ? [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') : null
  // D6 (Bound Journal): 14px semibold, sentence case, no dashed rule; the count and time sit quietly on the right.
  return (
    <SectionLabel style={{ margin: '26px 0 4px' }} action={<span style={META}>{group.tasks.length}{time ? ` · ${time}` : ''}</span>}>
      <span style={terra ? { color: 'var(--acc-terra)' } : undefined}>{group.label}</span>
    </SectionLabel>
  )
}

function InlineAdd({ label, placeholder, color, onSubmit }: { label: string; placeholder: string; color: string; onSubmit: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{ ...META, marginTop: 11, color, cursor: 'pointer' }}>
        ＋ {label}
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); setValue(''); setOpen(false) }}
      style={{ marginTop: 11 }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (!value.trim()) setOpen(false) }}
        placeholder={placeholder}
        style={{ width: '100%', font: 'inherit', fontSize: 'var(--fs-caption)', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-input)', padding: '6px 9px', background: 'var(--paper-bone)', color: 'var(--ink-body)', outline: 'none' }}
      />
    </form>
  )
}

function OrganizeRail({ domains, projects, areas, tasks }: { domains: Domain[]; projects: Project[]; areas: Area[]; tasks: Task[] }) {
  const open = tasks.filter((t) => t.status === 'todo')
  // "New area" / "New project" open the rich designed modal (shared with Projects);
  // "Add domain" keeps InlineAdd — no designed rich form exists for domains.
  const [newModal, setNewModal] = useState<'standard' | 'area' | null>(null)
  return (
    // deviation(2026-07-18 audit): rail pinned (sticky + own scroll) while the list scrolls —
    // neither the code nor the export pinned it; Kai wants it pinned.
    // Punch 30: maxHeight was 100vh, but the scrollport is 100dvh minus the 42px topbar and
    // the content area's 30px top padding — the overhang clipped the bottom of the Projects
    // card even when the rail's own scrollbar was at the end. Sized to the worst case
    // (unscrolled page) so all three tape cards render fully at 100% zoom.
    <div style={{ borderLeft: '1px solid var(--line-solid)', padding: '40px 26px', display: 'flex', flexDirection: 'column', gap: 22, background: 'color-mix(in srgb, var(--paper-sidebar) 35%, transparent)', position: 'sticky', top: 0, alignSelf: 'start', maxHeight: 'calc(var(--kf-vh) - 42px - 30px)', overflowY: 'auto' }}>
      {/* R4-19 (2026-07-20 audit): "should be a bit more of a header… the same font as the title
          of the page… make it a bit more subtle, but to still be visible." Was 9.5px uppercase
          mono in --ink-faint, reading as a caption. Now the display face the page titles use,
          at a quiet weight and size — present without shouting. */}
      {/* Punch 30: header centered over the card stack (was left-aligned). */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink-muted)', marginBottom: 2, textAlign: 'center' }}>Organize</div>

      <div style={RAIL_CARD}>
        <SectionLabel action={<span style={META}>{domains.length}</span>}>Domains</SectionLabel>
        {/* Kai 2026-10-06: each domain renames in place, ⋯ / right-click → Rename · Colour · Merge · Delete. */}
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <DomainList domains={domains} meta={(d) => open.filter((t) => effectiveDomainId(t, projects, areas) === d.id).length} />
        </div>
        <InlineAdd label="Add domain" placeholder="New domain…" color="var(--acc-terra)" onSubmit={(name) => createDomain(name)} />
      </div>

      <div style={RAIL_CARD}>
        <SectionLabel action={<span style={META}>{areas.length}</span>}>Areas</SectionLabel>
        <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {/* Motion 2d: an area takes a dragged task (Move to… by drag). */}
          {areas.map((a) => (
            <DropZone key={a.id} id={`rail:${a.id}`} spot={{ kind: 'place', label: a.name, to: { kind: 'area', id: a.id, domainId: a.domain_id, name: a.name } }} style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '5px 11px' }}><EmojiText text={a.name} /></DropZone>
          ))}
        </div>
        <div onClick={() => setNewModal('area')} style={{ ...META, marginTop: 11, color: 'var(--acc-terra)', cursor: 'pointer' }}>
          ＋ New area
        </div>
      </div>

      <div style={RAIL_CARD}>
        <SectionLabel action={<span style={META}>{projects.length}</span>}>Projects</SectionLabel>
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {projects.slice(0, 4).map((p) => {
            const inProject = tasks.filter((t) => t.project_id === p.id)
            const done = inProject.filter((t) => t.status === 'done').length
            // ponytail: real Projects milestones aren't built yet — proxy % done-tasks/total,
            // upgrade to the weighted milestone % once that feature lands.
            const pct = inProject.length === 0 ? 0 : Math.round((done / inProject.length) * 5) * 20
            const domainName = domains.find((d) => d.id === p.domain_id)?.name ?? 'No domain'
            return (
              // Motion 2d: a project takes a dragged task (Move to… by drag).
              <DropZone key={p.id} id={`rail:${p.id}`} spot={{ kind: 'place', label: p.name, to: { kind: 'project', id: p.id, domainId: p.domain_id, name: p.name } }} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8 }}>
                <img src={`${A}/wisteria/p${pct}.png`} alt="" style={{ height: 30 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={p.name} /></div>
                  <div style={META}>{domainName} · {pct === 100 ? 'Done' : `${pct}%`}</div>
                </div>
              </DropZone>
            )
          })}
        </div>
        <div onClick={() => setNewModal('standard')} style={{ ...META, marginTop: 11, color: 'var(--acc-terra)', cursor: 'pointer' }}>
          ＋ New project
        </div>
      </div>

      {newModal && <NewProjectModal onClose={() => setNewModal(null)} defaultType={newModal} domains={domains} />}
    </div>
  )
}

// List body only — the shared page header + TabBar above it live in TasksPage, so Done
// keeps the same tabs as every other view (Tasks.dc.html 2a).
// Effects 1a — the Done view's ambient petals. Positions/sizes are the export's two originals
// plus a third (the recipe asks for 3-5); `rest` is the static rotation used when motion is off.
const DONE_PETALS = [
  { right: 18, top: -4, w: 11, h: 9, opacity: 0.85, dur: 7, delay: 0, rest: 24 },
  { right: 120, top: 64, w: 9, h: 7, opacity: 0.55, dur: 9, delay: 2.4, rest: -18 },
  { right: 66, top: 18, w: 8, h: 6, opacity: 0.45, dur: 8, delay: 4.8, rest: 8 },
]

/** The Done view's two lists — today's, newest first, and the rest of the last 30 days. */
function doneLists(tasks: Task[]): { doneToday: Task[]; doneEarlier: Task[] } {
  const doneRecent = tasks.filter((t) => t.status === 'done' && t.completed_at && daysSince(t.completed_at) <= 30)
  const newest = (a: Task, b: Task) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
  return { doneToday: doneRecent.filter((t) => isToday(t.completed_at)).sort(newest), doneEarlier: doneRecent.filter((t) => !isToday(t.completed_at)).sort(newest) }
}

function DoneView({ tasks, motion, justCompletedId, expanded, setExpanded, focusedId }: { tasks: Task[]; motion: boolean; justCompletedId: string | null; expanded: boolean; setExpanded: (v: boolean | ((v: boolean) => boolean)) => void; focusedId: string | null }) {
  const { doneToday, doneEarlier } = doneLists(tasks)
  const mostRecentId = justCompletedId && doneToday.some((t) => t.id === justCompletedId) ? justCompletedId : null

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative', marginTop: 16 }}>
        {/* Effects 1a (WB-1) — petal fall over the Done view. These were hand-placed statics;
            the recipe is an ambient drift of 3-5 petals while the view is open, on the token
            petalFall keyframe. Off entirely when the Effects toggle is off. */}
        {DONE_PETALS.map((p, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              right: p.right,
              top: p.top,
              width: p.w,
              height: p.h,
              background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)',
              borderRadius: '70% 30% 60% 40%',
              opacity: p.opacity,
              pointerEvents: 'none',
              ...(motion
                ? { animation: `petalFall ${p.dur}s linear ${p.delay}s infinite` }
                : { transform: `rotate(${p.rest}deg)` }),
            }}
          />
        ))}

        {doneToday.length > 0 && (
          <>
            <SectionLabel style={{ margin: '6px 0 4px' }} action={<span style={META}>{doneToday.length}</span>}>Today</SectionLabel>
            {doneToday.map((t, i) => (
              <TaskRow key={t.id} task={t} border={i < doneToday.length - 1} justCompletedId={mostRecentId} highlighted={t.id === focusedId} />
            ))}
          </>
        )}
        {doneToday.length === 0 && doneEarlier.length === 0 && (
          <div className="kf-help" style={{ padding: '8px 2px' }}>Nothing finished yet today.</div>
        )}

        {doneEarlier.length > 0 && (
          <>
            <div onClick={() => setExpanded((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, padding: '9px 2px', cursor: 'pointer' }}>
              <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
              <span style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)', whiteSpace: 'nowrap' }}>Earlier this week</span>
              <span style={{ flex: 1 }} />
              <span style={META}>{doneEarlier.length}</span>
              <img src={`${A}/cherry/fallen.png`} alt="" style={{ height: 22, opacity: 0.7, filter: 'var(--shadow-drop-sm)' }} />
            </div>
            {expanded && doneEarlier.map((t, i) => (
              <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
                <TaskRow task={t} border={i < doneEarlier.length - 1} highlighted={t.id === focusedId} />
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
        <span>Completed items fade after 30 days — nothing is deleted</span>
        <span onClick={() => setExpanded(false)} style={{ marginLeft: 'auto', color: 'var(--acc-terra)', cursor: 'pointer' }}>Clear view</span>
      </div>
    </div>
  )
}

export function TasksPage() {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const tasksQuery = useTasks()
  useCalendarRows() // Time Slots (0073): rows read a slot's name from this cache ("in Code block · 10:00")
  const { data: tasks = [] } = tasksQuery
  // MK States: rows while they come; offline and never loaded, say so; a failed load, Retry.
  const tasksState = listState(tasksQuery, useOnline())
  // J-18: an import that exploded a repeating task into copies buried Kai's real tasks for weeks;
  // the tidy tool existed but lived three clicks deep in Settings. Point at it when it's needed.
  const dupeClusters = useMemo(() => findDuplicateClusters(tasks), [tasks])
  const [title, setTitle] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const openTask = useOpenTask()
  const rawList = searchParams.get('list')
  // R4-3 (2026-07-20 audit): SearchOverlay deep-links here as /tasks?focus=<id>, but this
  // page never read the param, so a clicked result landed on an unhighlighted list.
  const focusId = searchParams.get('focus')
  // Kai 2026-07-21: a deep-linked task on another tab (someday/done/upcoming) never scrolled
  // because its row was not rendered. Hop to its tab once, keeping the focus param.
  const tabSwitched = useRef(false)
  useEffect(() => {
    if (!focusId || tabSwitched.current) return
    const t = tasks.find((x) => x.id === focusId)
    if (!t) return
    // Punch 27: undated (or this-month-dated) tasks render on no other tab — All is the
    // one place a focus deep link can always find them.
    const target =
      t.status === 'done' ? 'done'
      : t.someday ? 'someday'
      : filterByList([t], 'today', now).length > 0 ? 'today'
      : filterByList([t], 'upcoming', now).length > 0 ? 'upcoming'
      : 'all'
    if (target !== activeTab) {
      tabSwitched.current = true
      const p = new URLSearchParams(searchParams)
      p.set('list', target)
      setSearchParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, tasks])
  const list = parseList(rawList)
  const activeTab = tabOf(rawList, list)
  const motion = useMotionEnabled()
  const goalTaskId = useMemo(() => goalIdOf(tasks, legacyGoalId(), cachedStarEvents()), [tasks])

  const now = new Date()

  // Completing a task is instant (real write, no delay) — this just keeps the row visible
  // in its group a beat longer so the check/petal animation (Motion 3b/5a, Tasks 2a) has
  // somewhere to play before the row actually leaves the list.
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null)
  // Rows in that grace window → the Top-3 flag each had when checked. Polish F2a: completing
  // clears top3, and the grace row only put `status` back — so it re-rendered as a plain row the
  // moment it was checked: no Top-3 bloom or glow, ☆ instead of ★, no ✶ Goal, and the live petal
  // (`checking && task.top3`) never rendered. A Top-3 task not due today even left the Today tab
  // at once (its list keeps it by top3). The grace row now keeps the flag it had.
  const [completing, setCompleting] = useState<Map<string, boolean>>(new Map())
  // Effects 4 "Day complete" — the last today task's check releases a 5-petal burst and a
  // hand banner. Fires once per calendar day, ever (localStorage gate).
  const [dayComplete, setDayComplete] = useState(false)
  // Pending 650ms hand-offs to the row exit, per task — an Undo cancels its own.
  const exitTimers = useRef(new Map<string, number>())
  /** Undo landed: stop the row's exit (or undo a finished one) so it stands back in its group. */
  function keepRow(id: string) {
    const timer = exitTimers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    exitTimers.current.delete(id)
    cancelRowRemoval(document.getElementById(`task-${id}`))
    setCompleting((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }
  // Punch 6 (Polish D): a single check toasts "Done" with Undo; `toast: false` is the bulk path,
  // which puts up one toast for the whole selection instead.
  function handleRowComplete(task: Task, { toast = true }: { toast?: boolean } = {}): CompletionUndo {
    const undo = toast ? completeTaskWithUndo(task, () => keepRow(task.id)) : completeTask(task)
    setJustCompletedId(task.id)
    if (!motion) return undo
    const todayOpen = filterByList(tasks, 'today', now).filter((t) => t.status === 'todo')
    // The one once-a-day gate, shared with Today (today/dayComplete) — not a second key of our own.
    if (todayOpen.some((t) => t.id === task.id) && todayOpen.every((t) => t.id === task.id) && claimDayComplete()) {
      setDayComplete(true)
      window.setTimeout(() => setDayComplete(false), 400 + DAY_DONE_DWELL_MS) // rises 400ms, dwells
    }
    setCompleting((prev) => new Map(prev).set(task.id, task.top3))
    const timer = window.setTimeout(() => {
      exitTimers.current.delete(task.id)
      // Motion 3e (WB-1) — the 650ms grace exists so the 3b check sequence can play; it used
      // to end in the row blinking out. Now it hands off to the shared exit: slide, collapse,
      // then the row leaves the list.
      animateRowRemoval(document.getElementById(`task-${task.id}`), () => {
        setCompleting((prev) => { const next = new Map(prev); next.delete(task.id); return next })
      })
    }, 650)
    exitTimers.current.set(task.id, timer)
    return undo
  }
  // Polish F2a: a second click on a just-checked row (still in its grace window) reopens it —
  // the row stays in its group instead of sliding out, and the toast's Undo checks it again.
  function handleRowReopen(task: Task) {
    keepRow(task.id)
    reopenTaskWithUndo(task)
  }
  const displayTasks = useMemo(
    () =>
      completing.size === 0
        ? tasks
        : tasks.map((t) => {
            const top3 = completing.get(t.id)
            return top3 === undefined ? t : { ...t, status: 'todo' as const, top3 }
          }),
    [tasks, completing],
  )

  const [domainChip, setDomainChip] = useState<string | null>(null)
  // Kai 2026-10-06: a domain chip's right-click is the domain's own menu (rename in place, colour, …).
  const [renamingChip, setRenamingChip] = useState<string | null>(null)
  const chipMenu = useDomainMenu(domains, setRenamingChip)

  const filteredBase = filterByList(displayTasks, list, now)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  // P7e A9: ⌘K's label jump lands as ?label=<name>. Taken into the filter, then dropped from the
  // address, so the next jump (even to the same label, even from this page) applies again.
  const labelParam = searchParams.get('label')
  useEffect(() => {
    if (labelParam === null) return
    setLabelFilter(labelParam)
    const p = new URLSearchParams(searchParams)
    p.delete('label')
    setSearchParams(p, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelParam])
  const filtered = filteredBase.filter((t) => (!domainChip || effectiveDomainId(t, projects, areas) === domainChip) && (!labelFilter || !!t.labels?.includes(labelFilter)))
  const [sort, setSort] = useState<SortKey>('smart')
  const groups = applySort(groupTasks(filtered, now), sort)
  // U-7: 411 rows rendered at once made a 31,000px page (6,196 nodes). Each group shows its first
  // GROUP_CAP rows until "Show N more"; a deep-linked ?focus= row opens its group. Keyboard moves,
  // select-all and bulk actions work on the rows you can see.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set())
  const shownTasks = (g: TaskGroup) =>
    openGroups.has(g.key) || (focusId != null && g.tasks.some((t) => t.id === focusId)) ? g.tasks : g.tasks.slice(0, GROUP_CAP)
  const flatTasks = groups.flatMap(shownTasks)

  const openTotal = displayTasks.filter((t) => t.status === 'todo' && !t.someday).length
  const doneTodayCount = tasks.filter((t) => t.status === 'done' && isToday(t.completed_at)).length
  const doneTodayTasks = displayTasks.filter((t) => t.status === 'done' && isToday(t.completed_at))

  const todayCount = filterByList(displayTasks, 'today', now).length
  const weekCount = filterByList(displayTasks, 'week', now).length
  const monthCount = filterByList(displayTasks, 'month', now).length
  const overdueCount = filterByList(displayTasks, 'overdue', now).length
  const upcomingCount = filterByList(displayTasks, 'upcoming', now).length
  const somedayCount = filterByList(displayTasks, 'someday', now).length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const allCount = filterByList(displayTasks, 'all', now).length

  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  // L (Overlays.dc.html "Label picker · keyboard L"): the focused row, or every selected one.
  const [kbLabelIds, setKbLabelIds] = useState<string[] | null>(null)
  const [manageLabelsAt, setManageLabelsAt] = useState<{ x: number; y: number } | null>(null)
  const kbProjectTask = kbProjectId ? flatTasks.find((t) => t.id === kbProjectId) : null

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTasks = tasks.filter((t) => selected.has(t.id))
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEscapeStack(selected.size > 0, clearSelection)

  // Punch 19 (as on Today): a click on empty page space clears the selection; a click on a row, the
  // bulk bar, a menu / popover, or an overlay keeps it. Document-level, so the shell counts as empty.
  const hasSelection = selected.size > 0
  useEffect(() => {
    if (!hasSelection) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Element | null
      if (t?.closest('[id^="task-"], [role="toolbar"], [role="menu"], [role="dialog"], .kf-overlay-card, .kf-overlay-scrim')) return
      setSelected(new Set())
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [hasSelection])

  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)

  function bulkComplete() {
    const undos = selectedTasks.map((t) => handleRowComplete(t, { toast: false }))
    toastUndo(`${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} completed.`, () =>
      undos.forEach((u) => {
        undoCompletion(u)
        keepRow(u.before.id)
      }),
    )
    clearSelection()
  }
  function bulkTomorrow() {
    moveToTomorrowWithUndo(selectedTasks)
    clearSelection()
  }
  // Kai 2026-10-07: every bulk action is an Undo toast (no plain "N tasks moved." notices).
  function bulkSchedule(iso: string, timed?: boolean) {
    rescheduleTasksWithUndo(selectedTasks, iso, { timed })
    clearSelection()
  }
  function bulkMove(to: MoveTarget) {
    moveTasksWithUndo(selectedTasks, to)
    clearSelection()
  }
  function bulkSomeday() {
    somedayTasksWithUndo(selectedTasks)
    clearSelection()
  }
  // Flow Audit §4: delete = Trash + Undo, no confirm (only Trash's Delete forever confirms).
  function bulkDelete() {
    deleteTasksWithUndo(selectedTasks)
    clearSelection()
  }
  function bulkTop3() {
    toggleTop3ManyWithUndo(selectedTasks)
    clearSelection()
  }

  // Motion 2c/2d: a row picks up — with the rest of the selection when it's part of one — and files
  // onto the sidebar's Today / Someday or the rail's areas and projects (./fileDrop; the ⋯ menu's
  // Plan and Move to… are the same actions by tap and key).
  function dragLoad(t: Task): DragLoad<FileSpot> {
    const ids = selected.has(t.id) && selected.size > 1 ? [t.id, ...selectedTasks.filter((x) => x.id !== t.id).map((x) => x.id)] : [t.id]
    const lifted = () => ids.flatMap((id) => tasks.filter((x) => x.id === id))
    return {
      ids,
      label: t.title,
      verdict: (spot) => taskVerdict(lifted(), spot),
      drop: (spot) => {
        dropTasks(lifted(), spot)
        if (ids.length > 1) clearSelection()
      },
    }
  }

  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onTomorrow: bulkTomorrow, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete, onTop3: bulkTop3 }
      : undefined

  // P7e A18: D Plan…, ! Priority, = Duration, S Someday, H goal, F focus; the bulk bar's Priority / Labels.
  const verbs = useListVerbs(bulkActions)
  // ponytail: ⇧F / ⇧S press the tab bar's own Label / Sort trigger — the popover a click opens, keys and all.
  const pressTool = (name: string) => () => {
    const el = document.querySelector<HTMLElement>(`[aria-label="${name}"]`)
    el?.focus()
    el?.click()
  }
  const bindings = buildListBindings({
    ...verbs.actions,
    // Pressing the complete key again on a just-checked row reopens it, like a second click.
    complete: (t) => (checkAction(t.status === 'done', completing.has(t.id)) === 'reopen' ? handleRowReopen(t) : handleRowComplete(t)),
    open: (t) => openTask(t.id), // F3 punch 29: Enter opens detail
    today: (t) => planWithUndo(t, todayFor(t)), // the Plan menu's Today: keeps the task's time
    tomorrow: (t) => moveToTomorrowWithUndo([t]),
    nextWeek: (t) => planWithUndo(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    labels: (t) => setKbLabelIds([t.id]),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => deleteTasksWithUndo([t]),
    filter: pressTool('Label filter'),
    sort: pressTool('Sort order'),
  }, {
    ...verbs.bulk,
    someday: () => bulkSomeday(),
    // Kai 2026-10-12: with rows selected, a key acts on the selection (T was dead after a mouse select).
    complete: () => bulkComplete(),
    today: () => bulkSchedule(scheduleToday()),
    tomorrow: () => bulkTomorrow(),
    nextWeek: () => bulkSchedule(scheduleNextWeek()),
    top3: () => bulkTop3(),
    labels: (ts) => setKbLabelIds(ts.map((t) => t.id)),
    delete: () => bulkDelete(),
  })
  useDeepLinkScroll(focusId, flatTasks)

  // Done has its own keys: the rows it shows, and only what a done task can take (e/Space reopens,
  // Enter opens, # deletes) — there's no selection or bulk bar there.
  const isDone = activeTab === 'done'
  const [doneExpanded, setDoneExpanded] = useState(false)
  const doneRows = useMemo(() => {
    const { doneToday, doneEarlier } = doneLists(displayTasks)
    return doneExpanded ? [...doneToday, ...doneEarlier] : doneToday
  }, [displayTasks, doneExpanded])
  const doneBindings = useMemo(
    () =>
      buildListBindings({ complete: (t) => handleRowReopen(t), open: (t) => openTask(t.id), delete: (t) => deleteTasksWithUndo([t]) })
        .map((b) => (b.label === 'Complete' ? { ...b, label: 'Reopen' } : b)), // the cheatsheet says what it does here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTask],
  )
  const { focusedId: kbFocusedId } = useListKeys(isDone ? doneRows : flatTasks, isDone ? doneBindings : bindings, {
    active: !kbProjectId && !kbLabelIds && !verbs.picking,
    sectionLabel: isDone ? 'Done' : 'Lists',
    onSelectAll: isDone ? undefined : () => setSelected(new Set(flatTasks.map((t) => t.id))),
    selected: isDone ? undefined : selectedTasks,
    // ⌘/Ctrl+↑/↓ (p7e A22): within its group, while the list shows its own order (Sort · Smart).
    reorder: isDone || sort !== 'smart' ? undefined : (rows, dir) => void moveInListWithUndo(groups.map((g) => g.tasks), rows, dir),
  })

  const isSomeday = activeTab === 'someday'
  // Someday and Done are single-column (Tasks.dc.html 2a/2b — no Organize rail).
  const singleCol = isSomeday || isDone
  const stage = cherryStage(openTotal, doneTodayCount)
  const headerIcon = isDone ? `${A}/cherry/fallen.png` : isSomeday ? `${A}/clover/resting.png` : `${A}/cherry/${stage}.png`
  const isOverdue = activeTab === 'overdue'
  const h1 = isDone ? 'Done' : isSomeday ? 'Someday' : isOverdue ? 'Overdue' : 'Tasks'
  const eyebrow = isDone ? `Tasks · ${doneTodayCount} done today` : isSomeday ? `Tasks · ${somedayCount} someday` : `Tasks · ${openTotal} open`
  const caption =
    activeTab === 'today' ? `everything due or scheduled for today — ${todayCount} to tend`
    : isDone ? 'everything you tended today — one petal fell for each ✿'
    : isSomeday ? 'no date, no pressure — the shelf where ideas wait'
    : isOverdue ? overdueCount > 0 ? `${overdueCount} past their date — reschedule what still matters` : 'Nothing overdue — the garden is current.'
    : activeTab === 'all' ? allCount > 0 ? `every open task in the garden — dated, undated, someday, all ${allCount}` : 'every open task in the garden — nothing open yet'
    : null

  // Header, tabs, caption, chips and quick-add all live in the grid's LEFT column
  // (Tasks.dc.html:253-256) so the Organize rail starts level with the header.
  return (
    <div className="tasks-page" style={{ maxWidth: 'var(--kf-page-max)' }}>
      {/* Tasks.dc.html 1b (iPhone): single column, no Organize rail — the rail is desktop-only.
          Polish D (2026-09-26 audit): the switch was `@media (max-width: 767px)`, but media
          queries read the WINDOW, which the root 125% zoom (lib/uiScale.ts) doesn't shrink — a
          1280px window lays out only ~1024 CSS px, so the 288px rail kept its place and left the
          list ~414px. A container query reads the page's real laid-out width instead: the rail
          shows only when the list beside it keeps ≥472px (room for the six tabs on one line).
          Below that the page is single-column, the layout Someday/Done (2a/2b) and phone already use. */}
      <style>{`
        .tasks-page { container: tasks-page / inline-size; }
        .tasks-grid { display: grid; grid-template-columns: minmax(0,1fr); }
        .tasks-rail { display: none; }
        @container tasks-page (min-width: 760px) {
          .tasks-grid { grid-template-columns: minmax(0,1fr) 288px; }
          .tasks-rail { display: block; }
        }
      `}</style>
      <div className={singleCol ? undefined : 'tasks-grid'} style={{ display: singleCol ? 'block' : undefined, maxWidth: singleCol ? 780 : undefined }}>
        <div className="kf-bulk-anchor" style={{ minWidth: 0, maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Night 1b: the header plant is a silhouette lit at the rim in its own accent. */}
            <img src={headerIcon} alt="" style={{ height: 56, filter: isSomeday ? 'var(--rim-clover, var(--shadow-drop-sm))' : 'var(--rim-blossom, var(--shadow-drop-sm))' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', color: 'var(--ink-faint)' }}>{eyebrow}</div>
              <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isDone ? 34 : 40, lineHeight: 1, letterSpacing: 'var(--ls-display)', color: 'var(--ink-body)' }}>{h1}</h1>
            </div>
          </div>
          {isDone ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--acc-blossom)', lineHeight: 1 }}>{doneTodayCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 3 }}>petals today</div>
            </div>
          ) : (
            // Phone: the tab bar's mic is the capture button; a second one here wrapped to two lines.
            !isSomeday && <span className="tasks-head-capture"><CaptureCta /></span>
          )}
        </div>

        <TabBar active={activeTab} todayCount={todayCount} weekCount={weekCount} monthCount={monthCount} overdueCount={overdueCount} upcomingCount={upcomingCount} somedayCount={somedayCount} doneCount={doneCount} allCount={allCount} sort={sort} onSort={setSort} labels={labelOptions(tasks)} label={labelFilter} onLabel={setLabelFilter} onManageLabels={setManageLabelsAt} />
        {caption && <div className="kf-help" style={CAPTION}>{caption}</div>}
        {dupeClusters.length > 0 && (
          <Link to="/settings/import" className="kf-link-terra" style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}>
            {dupeClusters.length === 1
              ? `"${dupeClusters[0].title}" is here ${dupeClusters[0].tasks.length} times`
              : `${dupeClusters.length} tasks are repeated as copies`}{' '}
            — tidy them →
          </Link>
        )}
        {/* R4-12 (2026-07-20 audit): "there should be a reschedule button that lets me replan
            the tasks that I missed" — one click pulls every overdue task onto today. */}
        {isOverdue && overdueCount > 0 && (
          // D11 = B: the kit's secondary button (D13's tonal is 4.17:1 on the bare canvas: Kai's call).
          <Button
            variant="secondary"
            onClick={() => {
              // The Plan menu's Today for each (its own time), past blocks off the calendar, with Undo.
              const stale = filterByList(displayTasks, 'overdue', now)
              const undos = stale.map((t) => rescheduleDue(t, todayFor(t, now)))
              toastUndo(`${stale.length} overdue task${stale.length === 1 ? '' : 's'} moved to today.`, () => undos.forEach((undo) => undo()))
            }}
            style={{ marginTop: 14 }}
          >
            Reschedule all to today
          </Button>
        )}
        {/* Tasks.dc.html mobile — the swipe affordance is invisible until told */}
        {!singleCol && (
          <div className="tr-mobile-only kf-help" style={{ marginTop: 8 }}>
            Swipe → tomorrow · swipe ← delete · hold to select
          </div>
        )}

        {/* Tasks.dc.html 1b's domain filter chips — on desktop too (Kai 2026-10-12: phone-only hid the filter). */}
        {!singleCol && domains.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {/* D12: the kit's filter chip — a visible edge, ink-filled when on (components/filterChip). */}
            <span onClick={() => setDomainChip(null)} aria-pressed={!domainChip} {...domainChipLook(!domainChip)}>
              All
            </span>
            {domains.map((d) => (
              <span
                key={d.id}
                onClick={() => setDomainChip(d.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  chipMenu.open(d.id, { x: e.clientX, y: e.clientY })
                }}
                aria-pressed={domainChip === d.id}
                {...domainChipLook(domainChip === d.id)}
              >
                {renamingChip === d.id ? (
                  <RenameField value={d.name} ariaLabel="Domain name" style={{ width: 120, margin: '-2px -4px' }} onDone={(next) => { setRenamingChip(null); if (next && next !== d.name) renameDomain(d, next) }} />
                ) : d.name}
              </span>
            ))}
            {chipMenu.node}
          </div>
        )}

        {!singleCol && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) {
                // The command bar's one capture rule (command-bar/quickAdd): the instant local parse — a
                // date and time on the user's clock, #project, !priority, 30m, *labels — lands it now (a
                // typed time on the calendar too), a toast says where it went, the AI fills gaps after.
                // Here it is always a task (it's the Tasks page); a line naming no day on Today is today's.
                const parsed = parseCommand(title, domains, projects, { zone: 'cairo' })
                const place = parsed.projectMatch ?? parsed.domainMatch
                addTypedTask(parsed, title.trim(), place, activeTab === 'today' ? now.toISOString() : null)
                seedPlant(e.currentTarget, motion) // Motion 5f — the seed drops out of the quick-add
              }
              setTitle('')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '11px 14px', marginTop: 18 }}
          >
            <span style={{ width: 16, height: 16, border: '1.5px solid var(--check-border)', borderRadius: 4, flex: 'none' }} />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Quick add task… try "submit the report tomorrow 3pm #forecasting"'
              style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'transparent', border: 'none', outline: 'none' }}
            />
          </form>
        )}

        {/* Effects 4 — banner rises 400ms, dwells 3s; petals ride the token petalFall (900ms) */}
        {dayComplete && (
          <div style={{ position: 'relative', marginTop: 18 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="tr-petal tr-burst" style={{ left: `${16 + i * 17}%`, top: 0, animationDelay: `${i * 60}ms` }} />
            ))}
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-medium)', color: 'var(--acc-gold)', textAlign: 'center', animation: 'entryFadeUp 400ms var(--ease-out) both' }}>
              All done. The garden can rest. ✿
            </div>
          </div>
        )}
        {tasksState === 'loading' ? (
          <Skeleton />
        ) : tasksState === 'away' ? (
          <div style={{ marginTop: 22 }}><OfflineChip>Offline — your tasks will be here when you’re back online</OfflineChip></div>
        ) : tasksState === 'resting' ? (
          <div style={{ marginTop: 22 }}><ErrorCard message="Couldn’t load your tasks." onRetry={() => void tasksQuery.refetch()} /></div>
        ) : isDone ? (
          <DoneView tasks={displayTasks} motion={motion} justCompletedId={justCompletedId} expanded={doneExpanded} setExpanded={setDoneExpanded} focusedId={kbFocusedId} />
        ) : (
        <div style={{ paddingTop: isSomeday ? 16 : 0 }}>
          {groups.length === 0 ? (
            // States t1 rule — the surface's own flower as seed + one hand line (the quick-add above is the one action)
            <div style={{ margin: '28px 0 0', textAlign: 'center' }}>
              <img src={isSomeday ? `${A}/clover/resting.png` : `${A}/cherry/bud.png`} alt="" style={{ height: 44, margin: '0 auto', display: 'block', filter: 'var(--shadow-drop-sm)', opacity: 0.9 }} />
              <p className="kf-help" style={{ margin: '10px 0 0' }}>
                {isSomeday ? 'Nothing parked for someday.' : 'Nothing here. Type one above, or press ⌘K and just say what\'s on your mind.'}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                {!isSomeday && <SectionHeader group={group} />}
                {shownTasks(group).map((t, i) => (
                  <DragRow key={t.id} id={t.id} load={dragLoad(t)} className={motion && !focusId ? 'kf-stagger-item' : undefined} style={motion && !focusId ? staggerDelay(i) : undefined}>
                    <TaskRow
                      task={t}
                      highlighted={t.id === kbFocusedId || t.id === focusId}
                      selected={selected.has(t.id)}
                      onToggleSelect={() => toggleSelected(t.id)}
                      selecting={selected.size > 0}
                      bulk={bulkActions}
                      goalTaskId={goalTaskId}
                      justCompletedId={justCompletedId}
                      onComplete={handleRowComplete}
                      onReopen={handleRowReopen}
                    />
                  </DragRow>
                ))}
                {shownTasks(group).length < group.tasks.length && (
                  <button
                    type="button"
                    className="kf-link-terra"
                    onClick={() => setOpenGroups((prev) => new Set(prev).add(group.key))}
                    style={{ background: 'none', border: 'none', padding: '10px 0 4px', font: 'inherit', fontSize: 13, cursor: 'pointer' }}
                  >
                    Show {group.tasks.length - shownTasks(group).length} more
                  </button>
                )}
              </div>
            ))
          )}

          {activeTab === 'today' && doneTodayTasks.length > 0 && (
            <>
              <SectionLabel
                style={{ margin: '26px 0 4px' }}
                action={<><span style={META}>{doneTodayTasks.length}</span><img src={`${A}/cherry/fallen.png`} alt="" style={{ height: 26, opacity: 0.8, filter: 'var(--shadow-drop-sm)' }} /></>}
              >
                Done today
              </SectionLabel>
              {doneTodayTasks.map((t, i) => (
                <TaskRow key={t.id} task={t} border={i < doneTodayTasks.length - 1} justCompletedId={justCompletedId} />
              ))}
            </>
          )}

          {isSomeday && (
            <div className="kf-help" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line-dashed)' }}>
              pull one up whenever you're ready — it keeps until then
            </div>
          )}
        </div>
        )}
        </div>

        {!singleCol && (
          <div className="tasks-rail" style={{ minWidth: 0 }}>
            <OrganizeRail domains={domains} projects={projects} areas={areas} tasks={displayTasks} />
          </div>
        )}
      </div>

      {kbProjectTask && (
        <MovePicker position={rowAnchor('task-', kbProjectTask.id)} current={placeKey(kbProjectTask)} onPick={(to) => moveTasksWithUndo([kbProjectTask], to)} onClose={() => setKbProjectId(null)} />
      )}

      {kbLabelIds && <LabelPicker taskIds={kbLabelIds} position={rowAnchor('task-', kbLabelIds[0])} onClose={() => setKbLabelIds(null)} />}
      {verbs.node}
      {manageLabelsAt && <LabelManagerOverlay at={manageLabelsAt} onClose={() => setManageLabelsAt(null)} />}

      {!isDone && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onTomorrow={bulkTomorrow}
          onSchedule={(e) => setBulkSchedulePos({ x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onTop3={bulkTop3}
          onPriority={(e) => verbs.open(selectedTasks, 'priority', { x: e.clientX, y: e.clientY })}
          onLabels={(e) => verbs.open(selectedTasks, 'labels', { x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
          onSelectAll={() => setSelected(new Set(flatTasks.map((t) => t.id)))}
        />
      )}
      {bulkSchedulePos && selectedTasks.length > 0 && (
        <PlanMenu task={selectedTasks[0]} bulkCount={selectedTasks.length} position={bulkSchedulePos} onClose={() => setBulkSchedulePos(null)} actions={{ schedule: bulkSchedule, tomorrow: bulkTomorrow, someday: bulkSomeday }} />
      )}
      {bulkProjectPos && <MovePicker position={bulkProjectPos} current={null} onPick={bulkMove} onClose={() => setBulkProjectPos(null)} />}
    </div>
  )
}
