import { useEffect, useMemo, useRef, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { SortIcon } from '../../components/controlIcons'
import { Select } from '../../components/Select'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useDomains, createDomain } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { NewProjectModal } from '../projects/NewProjectModal'
import { ConfirmCard } from '../projects/ConfirmCard'
import { useTasks, createTask, setSomeday, completeTask, completeTaskWithUndo, undoCompletion, reopenTaskWithUndo, snoozeTask, rescheduleDue, toggleTop3, setProject, deleteTask, type CompletionUndo } from './api'
import { checkAction } from './completion'
import { TaskRow, type BulkActions } from './TaskRow'
import { filterByList, groupTasks, SMART_LISTS, type SmartList, type TaskGroup } from './grouping'
import { buildListBindings } from './listShortcuts'
import { useListKeys } from '../../components/useListKeys'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { BulkBar } from '../../components/BulkBar'
import { TapeCard } from '../../components/kit'
import { rowAnchor } from '../../lib/rowAnchor'
import { cairoDateKey, scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { animateRowRemoval, cancelRowRemoval, useMotionEnabled, staggerDelay } from '../../lib/motion'
import { toastUndo } from '../../lib/undo'
import { seedPlant } from '../../lib/seedPlant'
import { useGoalStore } from '../today/goalStore'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { findDuplicateClusters } from '../import/dedupe'
import type { Area, Domain, Project, Task } from '../../lib/types'

// ── Tasks — pixel contract: Tasks.dc.html 1a (desktop list + rail), 1b (iPhone + filter
// chips), 2a (Done — fallen petals), 2b (Someday — the quiet shelf), 2c (iPhone Done).
// The tab row (Today/Overdue/Upcoming/Someday/Done/All) is the page's own scoping; the
// sidebar's Plan drawer additionally deep-links `?list=week|month`, which render the same
// list body with no tab highlighted. ──

const A = '/ds/assets'

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

function cherryStage(open: number, doneToday: number): string {
  if (open + doneToday === 0) return 'bud'
  if (doneToday === 0) return 'opening'
  if (open === 0) return 'fallen'
  return 'bloom'
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

type Tab = 'today' | 'overdue' | 'upcoming' | 'someday' | 'done' | 'all'

// Punch 27: `/tasks?list=all` is the stable deep-link contract for "every open task" —
// Today's "View all →" (WA-4), Inbox filing feedback, and search deep links all target it
// (optionally with `&focus=<taskId>` to scroll + highlight the row).
function tabOf(rawList: string | null, list: SmartList | null): Tab | null {
  if (rawList === 'done') return 'done'
  if (list === 'overdue') return 'overdue'
  if (rawList === null || list === 'today') return 'today'
  if (list === 'upcoming') return 'upcoming'
  if (list === 'someday') return 'someday'
  if (list === 'all') return 'all'
  return null
}

function TabBar({ active, todayCount, overdueCount, upcomingCount, somedayCount, doneCount, allCount, sort, onSort }: { active: Tab | null; todayCount: number; overdueCount: number; upcomingCount: number; somedayCount: number; doneCount: number; allCount: number; sort: SortKey; onSort: (s: SortKey) => void }) {
  const stripRef = useRef<HTMLDivElement>(null)
  // Polish D: on a narrow screen the strip scrolls sideways — keep the active tab in view
  // (a deep link to Done/All would otherwise land on a tab scrolled out of sight).
  useEffect(() => {
    const strip = stripRef.current
    const el = strip?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left - 16)
  }, [active])
  const tab = (key: Tab, label: string, count: number, underline: string) => (
    <Link
      key={key}
      to={key === 'done' ? '/tasks?list=done' : `/tasks?list=${key}`}
      aria-current={active === key ? 'page' : undefined}
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
      <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: active === key ? underline : 'var(--ink-hairline)' }}>{count}</span>
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
        <Link to="/perennials" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}>↻ Repeating</Link>
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
          display={<><SortIcon /> {SORT_LABELS[sort]}</>}
          style={{ gap: 6, background: 'none', border: 'none', borderRadius: 0, padding: 0, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', userSelect: 'none' }}
        />
      </span>
    </div>
  )
}

function SectionHeader({ group }: { group: TaskGroup }) {
  const terra = group.key === 'overdue'
  const h = Math.floor(group.totalMinutes / 60)
  const m = group.totalMinutes % 60
  const time = group.totalMinutes > 0 ? [h ? `${h}H` : '', m ? `${m}M` : ''].filter(Boolean).join(' ') : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 4px', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: terra ? 'var(--acc-terra)' : 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
      <span>{group.label} · {group.tasks.length}{time ? ` · ${time}` : ''}</span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
    </div>
  )
}

function OffsetTape({ top, left, right, width, tint, rotate }: { top: number; left?: number; right?: number; width: number; tint: string; rotate: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top, left, right, width, height: 16,
        background: tint,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
        transform: `rotate(${rotate}deg)`, borderRadius: 1, boxShadow: 'var(--shadow-crisp)',
      }}
    />
  )
}

function InlineAdd({ label, placeholder, color, onSubmit }: { label: string; placeholder: string; color: string; onSubmit: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{ marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color, cursor: 'pointer' }}>
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
        style={{ width: '100%', font: 'inherit', fontSize: 12.5, border: '1px solid var(--line-solid)', borderRadius: 6, padding: '6px 9px', background: 'var(--paper-bone)', color: 'var(--ink-body)', outline: 'none' }}
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
    <div style={{ borderLeft: '1px dashed var(--line-solid)', padding: '40px 26px', display: 'flex', flexDirection: 'column', gap: 22, background: 'color-mix(in srgb, var(--paper-sidebar) 35%, transparent)', position: 'sticky', top: 0, alignSelf: 'start', maxHeight: 'calc(100dvh - 42px - 30px)', overflowY: 'auto' }}>
      {/* R4-19 (2026-07-20 audit): "should be a bit more of a header… the same font as the title
          of the page… make it a bit more subtle, but to still be visible." Was 9.5px uppercase
          mono in --ink-faint, reading as a caption. Now the display face the page titles use,
          at a quiet weight and size — present without shouting. */}
      {/* Punch 30: header centered over the card stack (was left-aligned). */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink-muted)', marginBottom: 2, textAlign: 'center' }}>Organize</div>

      <TapeCard tilt={-0.5} tape={false} style={{ padding: '16px 16px 14px' }}>
        <OffsetTape top={-9} left={22} width={58} tint="color-mix(in srgb, var(--acc-moss) 40%, transparent)" rotate={-2} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>Domains · {domains.length}</div>
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {domains.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--ink-body)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color ?? 'var(--acc-moss)' }} />
              {d.name}
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>
                {open.filter((t) => effectiveDomainId(t, projects, areas) === d.id).length}
              </span>
            </div>
          ))}
        </div>
        <InlineAdd label="Add domain" placeholder="New domain…" color="var(--acc-terra)" onSubmit={(name) => createDomain(name)} />
      </TapeCard>

      <TapeCard tilt={0.4} tape={false} style={{ padding: '16px 16px 14px' }}>
        <OffsetTape top={-9} right={26} width={52} tint="color-mix(in srgb, var(--acc-lavender) 42%, transparent)" rotate={2} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-lavender-text)' }}>Areas · {areas.length}</div>
        <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {areas.map((a) => (
            <span key={a.id} style={{ fontSize: 12.5, color: 'var(--ink-muted)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '5px 11px' }}><EmojiText text={a.name} /></span>
          ))}
        </div>
        <div onClick={() => setNewModal('area')} style={{ marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>
          ＋ New area
        </div>
      </TapeCard>

      <TapeCard tilt={-0.35} tape={false} style={{ padding: '16px 16px 14px' }}>
        <OffsetTape top={-9} left={30} width={56} tint="color-mix(in srgb, var(--acc-hydrangea) 42%, transparent)" rotate={-1.5} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>Projects · {projects.length}</div>
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {projects.slice(0, 4).map((p) => {
            const inProject = tasks.filter((t) => t.project_id === p.id)
            const done = inProject.filter((t) => t.status === 'done').length
            // ponytail: real Projects milestones aren't built yet — proxy % done-tasks/total,
            // upgrade to the weighted milestone % once that feature lands.
            const pct = inProject.length === 0 ? 0 : Math.round((done / inProject.length) * 5) * 20
            const domainName = domains.find((d) => d.id === p.domain_id)?.name ?? 'no domain'
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={`${A}/wisteria/p${pct}.png`} alt="" style={{ height: 30 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={p.name} /></div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{domainName} · {pct === 100 ? 'done' : `${pct}%`}</div>
                </div>
              </div>
            )
          })}
        </div>
        <div onClick={() => setNewModal('standard')} style={{ marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>
          ＋ New project
        </div>
      </TapeCard>

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

function DoneView({ tasks, motion, justCompletedId }: { tasks: Task[]; motion: boolean; justCompletedId: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const doneRecent = tasks.filter((t) => t.status === 'done' && t.completed_at && daysSince(t.completed_at) <= 30)
  const doneToday = doneRecent.filter((t) => isToday(t.completed_at)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doneEarlier = doneRecent.filter((t) => !isToday(t.completed_at)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '6px 0 4px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Today · {doneToday.length}</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
            </div>
            {doneToday.map((t, i) => (
              <TaskRow key={t.id} task={t} border={i < doneToday.length - 1} justCompletedId={mostRecentId} />
            ))}
          </>
        )}
        {doneToday.length === 0 && doneEarlier.length === 0 && (
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', padding: '8px 2px' }}>Nothing finished yet today.</div>
        )}

        {doneEarlier.length > 0 && (
          <>
            <div onClick={() => setExpanded((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, padding: '9px 2px', cursor: 'pointer' }}>
              <span style={{ color: 'var(--ink-hairline)', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Earlier this week · {doneEarlier.length}</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              <img src={`${A}/cherry/fallen.png`} alt="" style={{ height: 22, opacity: 0.7, filter: 'var(--shadow-drop-sm)' }} />
            </div>
            {expanded && doneEarlier.map((t, i) => (
              <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
                <TaskRow task={t} border={i < doneEarlier.length - 1} />
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
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
  const { data: tasks = [] } = useTasks()
  // J-18: an import that exploded a repeating task into copies buried Kai's real tasks for weeks;
  // the tidy tool existed but lived three clicks deep in Settings. Point at it when it's needed.
  const dupeClusters = useMemo(() => findDuplicateClusters(tasks), [tasks])
  const [title, setTitle] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
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
  const { goalTaskId } = useGoalStore()

  const now = new Date()

  // Completing a task is instant (real write, no delay) — this just keeps the row visible
  // in its group a beat longer so the check/petal animation (Motion 3b/5a, Tasks 2a) has
  // somewhere to play before the row actually leaves the list.
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
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
    setCompletingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
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
    if (todayOpen.some((t) => t.id === task.id) && todayOpen.every((t) => t.id === task.id)) {
      const dayKey = new Date().toDateString()
      try {
        if (localStorage.getItem('kf_day_complete') !== dayKey) {
          localStorage.setItem('kf_day_complete', dayKey)
          setDayComplete(true)
          window.setTimeout(() => setDayComplete(false), 3400)
        }
      } catch { /* private mode — skip the ceremony */ }
    }
    setCompletingIds((prev) => new Set(prev).add(task.id))
    const timer = window.setTimeout(() => {
      exitTimers.current.delete(task.id)
      // Motion 3e (WB-1) — the 650ms grace exists so the 3b check sequence can play; it used
      // to end in the row blinking out. Now it hands off to the shared exit: slide, collapse,
      // then the row leaves the list.
      animateRowRemoval(document.getElementById(`task-${task.id}`), () => {
        setCompletingIds((prev) => { const next = new Set(prev); next.delete(task.id); return next })
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
    () => (completingIds.size === 0 ? tasks : tasks.map((t) => (completingIds.has(t.id) ? { ...t, status: 'todo' as const } : t))),
    [tasks, completingIds],
  )

  const [domainChip, setDomainChip] = useState<string | null>(null)

  const filteredBase = filterByList(displayTasks, list, now)
  const filtered = domainChip ? filteredBase.filter((t) => effectiveDomainId(t, projects, areas) === domainChip) : filteredBase
  const [sort, setSort] = useState<SortKey>('smart')
  const groups = applySort(groupTasks(filtered, now), sort)
  const flatTasks = groups.flatMap((g) => g.tasks)

  const openTotal = displayTasks.filter((t) => t.status === 'todo' && !t.someday).length
  const doneTodayCount = tasks.filter((t) => t.status === 'done' && isToday(t.completed_at)).length
  const doneTodayTasks = displayTasks.filter((t) => t.status === 'done' && isToday(t.completed_at))

  const todayCount = filterByList(displayTasks, 'today', now).length
  const overdueCount = filterByList(displayTasks, 'overdue', now).length
  const upcomingCount = filterByList(displayTasks, 'upcoming', now).length
  const somedayCount = filterByList(displayTasks, 'someday', now).length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const allCount = filterByList(displayTasks, 'all', now).length

  const [kbSnoozeId, setKbSnoozeId] = useState<string | null>(null)
  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  const kbSnoozeTask = kbSnoozeId ? flatTasks.find((t) => t.id === kbSnoozeId) : null
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

  const [bulkSnoozePos, setBulkSnoozePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)
  // Punch 14: in-app ConfirmCard replaces the native confirm popup (bulk delete + keyboard delete)
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null)

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
  function bulkSnooze(until: string) {
    selectedTasks.forEach((t) => snoozeTask(t, until))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} snoozed.` })
    clearSelection()
  }
  function bulkSchedule(iso: string, when = '') {
    selectedTasks.forEach((t) => rescheduleDue(t, iso))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} scheduled${when ? ' ' + when : ''}.` })
    clearSelection()
  }
  function bulkMove(projectId: string | null, domainId: string | null) {
    selectedTasks.forEach((t) => setProject(t, projectId, domainId))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} moved.` })
    clearSelection()
  }
  function bulkSomeday() {
    selectedTasks.forEach((t) => setSomeday(t, true))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} parked for someday.` })
    clearSelection()
  }
  function bulkDelete() {
    setConfirm({
      title: `Delete ${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'}?`,
      body: '',
      onConfirm: () => {
        setConfirm(null)
        selectedTasks.forEach(deleteTask)
        useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} deleted.` })
        clearSelection()
      },
    })
  }

  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onComplete: bulkComplete, onSnooze: bulkSnooze, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete }
      : undefined

  const bindings = buildListBindings({
    // Pressing the complete key again on a just-checked row reopens it, like a second click.
    complete: (t) => (checkAction(t.status === 'done', completingIds.has(t.id)) === 'reopen' ? handleRowReopen(t) : handleRowComplete(t)),
    open: (t) => navigate(`/tasks/${t.id}`), // F3 punch 29: Enter opens detail
    snooze: (t) => setKbSnoozeId(t.id),
    today: (t) => rescheduleDue(t, scheduleToday()),
    tomorrow: (t) => rescheduleDue(t, scheduleTomorrow()),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => {
      setConfirm({
        title: `Delete "${t.title}"?`,
        body: t.scheduled_start ? 'This also removes its scheduled calendar block.' : '',
        onConfirm: () => { setConfirm(null); deleteTask(t) },
      })
    },
  })
  useDeepLinkScroll(focusId, flatTasks)

  const { focusedId: kbFocusedId } = useListKeys(flatTasks, bindings, {
    active: !kbSnoozeId && !kbProjectId && !confirm && activeTab !== 'done',
    sectionLabel: activeTab === 'done' ? undefined : 'Lists',
    onSelectAll: () => setSelected(new Set(flatTasks.map((t) => t.id))),
  })

  const isDone = activeTab === 'done'
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
    <div className="tasks-page" style={{ maxWidth: 1180 }}>
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
            <img src={headerIcon} alt="" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{eyebrow}</div>
              <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isDone ? 34 : 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{h1}</h1>
            </div>
          </div>
          {isDone ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--acc-blossom)', lineHeight: 1 }}>{doneTodayCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 3 }}>petals today</div>
            </div>
          ) : (
            !isSomeday && <VoiceCaptureButton />
          )}
        </div>

        <TabBar active={activeTab} todayCount={todayCount} overdueCount={overdueCount} upcomingCount={upcomingCount} somedayCount={somedayCount} doneCount={doneCount} allCount={allCount} sort={sort} onSort={setSort} />
        {caption && <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', marginTop: 12 }}>{caption}</div>}
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
          <button
            type="button"
            onClick={() => {
              const stale = filterByList(displayTasks, 'overdue', now)
              stale.forEach((t) => rescheduleDue(t, now.toISOString()))
              useToastStore.getState().push({
                message: `${stale.length} overdue task${stale.length === 1 ? '' : 's'} moved to today.`,
              })
            }}
            style={{
              marginTop: 14,
              minHeight: 34,
              padding: '0 14px',
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--acc-terra) 40%, transparent)',
              background: 'color-mix(in srgb, var(--acc-terra) 12%, transparent)',
              color: 'var(--acc-terra)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reschedule all to today
          </button>
        )}
        {/* Tasks.dc.html mobile — the swipe affordance is invisible until told */}
        {!singleCol && (
          <div className="tr-mobile-only" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 8 }}>
            swipe → for actions · swipe ← to delete
          </div>
        )}

        {!singleCol && domains.length > 0 && (
          <div className="tr-mobile-only" style={{ gap: 8, marginTop: 14, overflowX: 'auto' }}>
            <span
              onClick={() => setDomainChip(null)}
              style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: !domainChip ? 'var(--kf-chip-tasks, #8A4A58)' : 'var(--ink-muted)', background: !domainChip ? 'color-mix(in srgb, var(--acc-blossom) 20%, transparent)' : 'transparent', border: !domainChip ? 'none' : '1px solid var(--line-solid)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer' }}
            >
              All
            </span>
            {domains.map((d) => (
              <span
                key={d.id}
                onClick={() => setDomainChip(d.id)}
                style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: domainChip === d.id ? 'var(--kf-chip-tasks, #8A4A58)' : 'var(--ink-muted)', background: domainChip === d.id ? 'color-mix(in srgb, var(--acc-blossom) 20%, transparent)' : 'transparent', border: domainChip === d.id ? 'none' : '1px solid var(--line-solid)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer' }}
              >
                {d.name}
              </span>
            ))}
          </div>
        )}

        {!singleCol && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) {
                createTask({ title: title.trim(), dueAt: activeTab === 'today' ? now.toISOString() : undefined })
                seedPlant(e.currentTarget, motion) // Motion 5f — the seed drops out of the quick-add
              }
              setTitle('')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '11px 14px', marginTop: 18 }}
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
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--acc-gold)', textAlign: 'center', animation: 'entryFadeUp 400ms var(--ease-out) both' }}>
              All done. The garden can rest. ✿
            </div>
          </div>
        )}
        {isDone ? (
          <DoneView tasks={displayTasks} motion={motion} justCompletedId={justCompletedId} />
        ) : (
        <div style={{ paddingTop: isSomeday ? 16 : 0 }}>
          {groups.length === 0 ? (
            // States t1 rule — the surface's own flower as seed + one hand line (the quick-add above is the one action)
            <div style={{ margin: '28px 0 0', textAlign: 'center' }}>
              <img src={isSomeday ? `${A}/clover/resting.png` : `${A}/cherry/bud.png`} alt="" style={{ height: 44, margin: '0 auto', display: 'block', filter: 'var(--shadow-drop-sm)', opacity: 0.9 }} />
              <p style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', margin: '10px 0 0' }}>
                {isSomeday ? 'Nothing parked for someday.' : 'Nothing here. Type one above, or press ⌘K and just say what\'s on your mind.'}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                {!isSomeday && <SectionHeader group={group} />}
                {group.tasks.map((t, i) => (
                  <div key={t.id} className={motion && !focusId ? 'kf-stagger-item' : undefined} style={motion && !focusId ? staggerDelay(i) : undefined}>
                    <TaskRow
                      task={t}
                      highlighted={t.id === kbFocusedId || t.id === focusId}
                      selected={selected.has(t.id)}
                      onToggleSelect={isSomeday ? undefined : () => toggleSelected(t.id)}
                      bulk={isSomeday ? undefined : bulkActions}
                      goalTaskId={goalTaskId}
                      justCompletedId={justCompletedId}
                      onComplete={handleRowComplete}
                      onReopen={handleRowReopen}
                    />
                  </div>
                ))}
              </div>
            ))
          )}

          {activeTab === 'today' && doneTodayTasks.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 4px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Done today · {doneTodayTasks.length}</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
                <img src={`${A}/cherry/fallen.png`} alt="" style={{ height: 26, opacity: 0.8, filter: 'var(--shadow-drop-sm)' }} />
              </div>
              {doneTodayTasks.map((t, i) => (
                <TaskRow key={t.id} task={t} border={i < doneTodayTasks.length - 1} justCompletedId={justCompletedId} />
              ))}
            </>
          )}

          {isSomeday && (
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)' }}>
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

      {kbSnoozeTask && (
        <SnoozeMenu position={rowAnchor('task-', kbSnoozeTask.id)} title={kbSnoozeTask.title} onClose={() => setKbSnoozeId(null)} onSnooze={(until) => snoozeTask(kbSnoozeTask, until)} onSomeday={() => setSomeday(kbSnoozeTask, true)} />
      )}
      {kbProjectTask && (
        <ProjectPicker position={rowAnchor('task-', kbProjectTask.id)} projects={projects} domains={domains} currentProjectId={kbProjectTask.project_id} onSelect={(projectId, domainId) => setProject(kbProjectTask, projectId, domainId)} onClose={() => setKbProjectId(null)} />
      )}

      {!isDone && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onSnooze={(e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY })}
          onSchedule={(e) => setBulkSchedulePos({ x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}
      {bulkSnoozePos && <SnoozeMenu position={bulkSnoozePos} onClose={() => setBulkSnoozePos(null)} onSnooze={bulkSnooze} onSomeday={bulkSomeday} />}
      {bulkSchedulePos && <ScheduleMenu position={bulkSchedulePos} onClose={() => setBulkSchedulePos(null)} onSchedule={(iso) => bulkSchedule(iso)} />}
      {bulkProjectPos && <ProjectPicker position={bulkProjectPos} projects={projects} domains={domains} currentProjectId={null} onSelect={bulkMove} onClose={() => setBulkProjectPos(null)} />}
      {confirm && <ConfirmCard {...confirm} confirmLabel="Delete" onCancel={() => setConfirm(null)} />}
    </div>
  )
}
