import { useEffect, useMemo, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { SortIcon } from '../../components/controlIcons'
import { Link, useSearchParams } from 'react-router'
import { useDomains, createDomain } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { NewProjectModal } from '../projects/NewProjectModal'
import { useTasks, createTask, setSomeday, completeTask, snoozeTask, rescheduleDue, toggleTop3, setProject, deleteTask } from './api'
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
import { scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import { useGoalStore } from '../today/goalStore'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import type { Area, Domain, Project, Task } from '../../lib/types'

// ── Tasks — pixel contract: Tasks.dc.html 1a (desktop list + rail), 1b (iPhone + filter
// chips), 2a (Done — fallen petals), 2b (Someday — the quiet shelf), 2c (iPhone Done).
// The tab row (Today/Upcoming/Someday/Done) is the page's own scoping; the sidebar's Plan
// drawer additionally deep-links `?list=week|month`, which render the same list body with
// no tab highlighted. ──

const A = '/ds/assets'

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
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
const SORT_LABELS: Record<SortKey, string> = { smart: 'Sort · Smart', due: 'Sort · Due', priority: 'Sort · Priority', title: 'Sort · A-Z' }

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

type Tab = 'today' | 'overdue' | 'upcoming' | 'someday' | 'done'

function tabOf(rawList: string | null, list: SmartList | null): Tab | null {
  if (rawList === 'done') return 'done'
  if (list === 'overdue') return 'overdue'
  if (rawList === null || list === 'today') return 'today'
  if (list === 'upcoming') return 'upcoming'
  if (list === 'someday') return 'someday'
  return null
}

function TabBar({ active, todayCount, overdueCount, upcomingCount, somedayCount, doneCount, sort, onSort }: { active: Tab | null; todayCount: number; overdueCount: number; upcomingCount: number; somedayCount: number; doneCount: number; sort: SortKey; onSort: (s: SortKey) => void }) {
  const tab = (key: Tab, label: string, count: number, underline: string) => (
    <Link
      key={key}
      to={key === 'done' ? '/tasks?list=done' : `/tasks?list=${key}`}
      style={{
        position: 'relative',
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 24, borderBottom: '1px solid var(--line-card)' }}>
      {tab('today', 'Today', todayCount, 'var(--acc-blossom)')}
      {/* R4-12 (2026-07-20 audit): overdue-only view, terra like every other overdue affordance */}
      {tab('overdue', 'Overdue', overdueCount, 'var(--acc-terra)')}
      {tab('upcoming', 'Upcoming', upcomingCount, 'var(--acc-blossom)')}
      {tab('someday', 'Someday', somedayCount, 'var(--acc-sage)')}
      {tab('done', 'Done', doneCount, 'var(--acc-blossom)')}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, paddingBottom: 11 }}>
        <Link to="/perennials" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}>↻ Repeating</Link>
        {/* R4-21 (2026-07-20 audit): this was a dead span (cursor:default, no handler) drawn
            with the `⚟` glyph. Now a real sort cycler with a real icon. */}
        <button
          type="button"
          onClick={() => onSort(SORT_KEYS[(SORT_KEYS.indexOf(sort) + 1) % SORT_KEYS.length])}
          title="Change sort order"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer', userSelect: 'none' }}
        >
          <SortIcon /> {SORT_LABELS[sort]}
        </button>
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
    <div style={{ borderLeft: '1px dashed var(--line-solid)', padding: '40px 26px', display: 'flex', flexDirection: 'column', gap: 22, background: 'color-mix(in srgb, var(--paper-sidebar) 35%, transparent)', position: 'sticky', top: 0, alignSelf: 'start', maxHeight: '100vh', overflowY: 'auto' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: -4 }}>Organize</div>

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
function DoneView({ tasks, motion, justCompletedId }: { tasks: Task[]; motion: boolean; justCompletedId: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const doneRecent = tasks.filter((t) => t.status === 'done' && t.completed_at && daysSince(t.completed_at) <= 30)
  const doneToday = doneRecent.filter((t) => isToday(t.completed_at)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doneEarlier = doneRecent.filter((t) => !isToday(t.completed_at)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const mostRecentId = justCompletedId && doneToday.some((t) => t.id === justCompletedId) ? justCompletedId : null

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative', marginTop: 16 }}>
        <span aria-hidden style={{ position: 'absolute', right: 18, top: -4, width: 11, height: 9, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: '70% 30% 60% 40%', transform: 'rotate(24deg)', opacity: 0.85 }} />
        <span aria-hidden style={{ position: 'absolute', right: 120, top: 64, width: 9, height: 7, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: '70% 30% 60% 40%', transform: 'rotate(-18deg)', opacity: 0.55 }} />

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
  const [title, setTitle] = useState('')
  const [searchParams] = useSearchParams()
  const rawList = searchParams.get('list')
  // R4-3 (2026-07-20 audit): SearchOverlay deep-links here as /tasks?focus=<id>, but this
  // page never read the param, so a clicked result landed on an unhighlighted list.
  const focusId = searchParams.get('focus')
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
  function handleRowComplete(task: Task) {
    completeTask(task)
    setJustCompletedId(task.id)
    if (!motion) return
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
    window.setTimeout(() => {
      setCompletingIds((prev) => { const next = new Set(prev); next.delete(task.id); return next })
    }, 650)
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

  function bulkComplete() {
    selectedTasks.forEach((t) => handleRowComplete(t))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} completed.` })
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
    if (!window.confirm(`Delete ${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'}?`)) return
    selectedTasks.forEach(deleteTask)
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} deleted.` })
    clearSelection()
  }

  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onComplete: bulkComplete, onSnooze: bulkSnooze, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete }
      : undefined

  const bindings = buildListBindings({
    complete: (t) => handleRowComplete(t),
    snooze: (t) => setKbSnoozeId(t.id),
    today: (t) => rescheduleDue(t, scheduleToday()),
    tomorrow: (t) => rescheduleDue(t, scheduleTomorrow()),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => {
      const message = t.scheduled_start ? `Delete "${t.title}"? This also removes its scheduled calendar block.` : `Delete "${t.title}"?`
      if (window.confirm(message)) deleteTask(t)
    },
  })
  useDeepLinkScroll(focusId, flatTasks)

  const { focusedId: kbFocusedId } = useListKeys(flatTasks, bindings, {
    active: !kbSnoozeId && !kbProjectId && activeTab !== 'done',
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
    : isOverdue ? `${overdueCount} past their date — reschedule what still matters`
    : null

  // Header, tabs, caption, chips and quick-add all live in the grid's LEFT column
  // (Tasks.dc.html:253-256) so the Organize rail starts level with the header.
  return (
    <div style={{ maxWidth: 1180 }}>
      {/* Tasks.dc.html 1b (iPhone): single column, no Organize rail — the rail is desktop-only. */}
      <style>{`
        .tasks-grid { display: grid; grid-template-columns: minmax(0,1fr) 288px; }
        @media (max-width: 767px) {
          .tasks-grid { grid-template-columns: 1fr; }
          .tasks-rail { display: none; }
        }
      `}</style>
      <div className={singleCol ? undefined : 'tasks-grid'} style={{ display: singleCol ? 'block' : undefined, maxWidth: singleCol ? 780 : undefined }}>
        <div style={{ minWidth: 0, maxWidth: 780 }}>
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

        <TabBar active={activeTab} todayCount={todayCount} overdueCount={overdueCount} upcomingCount={upcomingCount} somedayCount={somedayCount} doneCount={doneCount} sort={sort} onSort={setSort} />
        {caption && <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', marginTop: 12 }}>{caption}</div>}
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
              style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: !domainChip ? '#8A4A58' : 'var(--ink-muted)', background: !domainChip ? 'color-mix(in srgb, var(--acc-blossom) 20%, transparent)' : 'transparent', border: !domainChip ? 'none' : '1px solid var(--line-solid)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer' }}
            >
              All
            </span>
            {domains.map((d) => (
              <span
                key={d.id}
                onClick={() => setDomainChip(d.id)}
                style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: domainChip === d.id ? '#8A4A58' : 'var(--ink-muted)', background: domainChip === d.id ? 'color-mix(in srgb, var(--acc-blossom) 20%, transparent)' : 'transparent', border: domainChip === d.id ? 'none' : '1px solid var(--line-solid)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer' }}
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
              if (title.trim()) createTask({ title: title.trim(), dueAt: activeTab === 'today' ? now.toISOString() : undefined })
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
                  <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
                    <TaskRow
                      task={t}
                      highlighted={t.id === kbFocusedId || t.id === focusId}
                      selected={selected.has(t.id)}
                      onToggleSelect={isSomeday ? undefined : () => toggleSelected(t.id)}
                      bulk={isSomeday ? undefined : bulkActions}
                      goalTaskId={goalTaskId}
                      justCompletedId={justCompletedId}
                      onComplete={handleRowComplete}
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
        <SnoozeMenu position={rowAnchor('task-', kbSnoozeTask.id)} onClose={() => setKbSnoozeId(null)} onSnooze={(until) => snoozeTask(kbSnoozeTask, until)} onSomeday={() => setSomeday(kbSnoozeTask, true)} />
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
    </div>
  )
}
