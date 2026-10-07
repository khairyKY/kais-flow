import { useEffect, useMemo, useRef, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTasks, completeTask, completeTaskWithUndo, undoCompletion, reopenTaskWithUndo, toggleTaskWithUndo, toggleTop3, rescheduleDue, moveInTop3Order, spreadWithUndo, moveTasksWithUndo, rescheduleTasksWithUndo, somedayTasksWithUndo, deleteTasksWithUndo, moveToTomorrowWithUndo } from '../tasks/api'
import { PlanMenu } from '../tasks/PlanMenu'
import { isOverdue, todayFor } from '../tasks/planMath'
import { DndContext, MouseSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { checkAction } from '../tasks/completion'
import { buildListBindings } from '../tasks/listShortcuts'
import { daysOverdue, formatDuration } from '../tasks/taskDisplay'
import { todayListTasks } from '../tasks/grouping'
import { cairoDateKey, scheduleNextWeek } from '../../lib/dateShortcuts'
import { useCalendarEvents } from '../calendar/api'
import { cairoTimeKey } from '../calendar/eventTime'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { useAreas } from '../areas/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { computeStreak, localDateKey, routinesForToday, todayTally } from '../routines/streaks'
import { groupRoutinesByTime, splitByTimeOfDay } from '../routines/routineGrouping'
import { useSlipping, markReviewed } from '../slipping/api'
import { usePendingInboxItems } from '../inbox/api'
import { usePeople, getDaysUntilBirthday } from '../people/api'
import { CaptureCta } from '../capture/CaptureCta'
import { useRitualStepsToday, type RitualKind } from '../rituals/api'
import { useRitualPins } from '../rituals/ritualPins'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import { useLatestResurfaced } from '../resurfacing/api'
import { useTimeEntries } from '../focus/api'
import { legacyGoalId } from './goalStore'
import { dayTop3 } from './top3Order'
import { useTerrariumStore } from './terrariumStore'
import { openCapture } from '../command-bar/commandBarStore'
import { SectionLabel, Checkbox, Button, Star } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { isTypingTarget, useListKeys } from '../../components/useListKeys'
import { useLingering } from '../../components/syncQueue'
import { BulkBar } from '../../components/BulkBar'
import { EmptyState, ErrorCard, OfflineChip, Skeleton } from '../../components/States'
import { MovePicker } from '../tasks/MovePicker'
import { placeKey, type MoveTarget } from '../tasks/move'
import { ContextMenu } from '../../components/ContextMenu'
import { useEscapeStack } from '../../lib/overlayStack'
import { rowAnchor } from '../../lib/rowAnchor'
import { toastUndo } from '../../lib/undo'
import { useOnline } from '../../lib/useOnline'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import { wisteriaStage } from '../../lib/growthStages'
import { claimDayComplete, DAY_DONE_DWELL_MS } from './dayComplete'
import { ritualProgress, type RitualState } from './dayPhase'
import { upNextClock, upNextLabel } from './upNext'
import { blockTomorrowHint, eventMenuItems, moveBlockToTomorrow, unscheduleWithUndo } from './rowMenus'
import { RowMenuButton, SelectCircle, SwipeRow } from '../tasks/SwipeRow'
import { LabelChips } from '../tasks/TaskRow'
import { useRowGrammar, type RowGrammarOptions } from '../tasks/useRowGrammar'
import { useOpenTask } from '../tasks/openTask'
import { DayCard, RitualCard } from './DayCard'
import { clearFirstTodayHint, firstTodayHintPending, FIRST_TODAY_HINT } from './firstTodayHint'
import { useAuth } from '../auth/AuthProvider'
import { useDay } from './useDay'
import { useStarEvents } from './api'
import { blockMeta, blockOf, dayOfJourney, eventMetas, focusedToday, foldOpen, remainingWork, runningBlock, topCard, upNextItems, workloadLine, type WorkloadInput } from './todayLayout'
import { filterByList } from '../tasks/grouping'
import { flushOutbox, useOutboxMarks } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import type { Task, CalendarEvent, Project, Routine, SlippingRow } from '../../lib/types'
import './today.css'
import { appZone } from '../../lib/appZone'

// ── Today — pixel contract: Today.dc.html 1a (desktop, design lines 107-221) + States.dc.html
// 1a/1b (empty/done), and on a phone (< 768px) Today Phone.dc.html 2a–2n with the 2026-09-28
// rulings (design-export/SCREENS-2026-09-28.md §Today). The shell owns the sidebar/topbar/tab-bar;
// this is the main content, wired to real data. What goes where — the NOW slip, Up next, the fold,
// the header line — is ./todayLayout, shared by both layouts: each item shows once. ──

const A = '/ds/assets'
const PROJECT_DOTS = ['--acc-moss', '--acc-blossom', '--acc-lavender', '--acc-hydrangea', '--acc-buttercream', '--acc-sage']
// Punch 17: Today is a glance surface — "All open" stops here; the full list lives on /tasks.
const ALL_OPEN_CAP = 50

// Punch 20: same weighted-milestone % as ProjectsPage's projectStats (a milestone counts when
// flagged complete, or when it has linked tasks and they're all done) — the slipping card's
// wisteria must show the project's REAL stage, never a hardcoded one.
function weightedMilestonePct(project: Project, tasks: Task[]): number {
  let totalWeight = 0
  let completedWeight = 0
  for (const m of project.milestones ?? []) {
    totalWeight += m.weight
    const linked = tasks.filter((t) => t.milestone_id === m.id)
    const complete = linked.length > 0 ? linked.every((t) => t.status === 'done') : m.completed
    if (complete) completedWeight += m.weight
  }
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
}

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
}

function cherryStage(open: number, done: number): string {
  if (open + done === 0) return 'bud'
  if (done === 0) return 'opening'
  if (open === 0) return 'fallen'
  return 'bloom'
}

export function TodayPage() {
  // J-10: `isPending` (no data yet), not `isLoading` — while the IndexedDB cache is still being
  // restored the query is pending but not fetching, so isLoading is false and the empty states lied.
  const tasksQuery = useTasks()
  const eventsQuery = useCalendarEvents()
  // Kai 2026-10-07: the phone's "Syncing" dot blinked on with every refetch (each write's realtime
  // echo refetches). The topbar's rule now: only a fetch that's still going after ~4s shows it.
  const fetchingSlowly = useLingering(tasksQuery.isFetching || eventsQuery.isFetching)
  const { data: tasks = [], isPending: tasksPending } = tasksQuery
  const { data: events = [], isPending: eventsPending } = eventsQuery
  const { data: projects = [] } = useProjects()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: ritualSteps = { morning: new Set<string>(), evening: new Set<string>() } } = useRitualStepsToday()
  const ritualPins = useRitualPins()
  const { data: slipping = [] } = useSlipping()
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const { data: people = [] } = usePeople()
  // Punch 2: the heading must not outlive its card — same source the card guards on.
  const { data: resurfacedRow } = useLatestResurfaced()
  const [dismissedBdays, setDismissedBdays] = useState(() => {
    const s = new Set()
    if (typeof window !== 'undefined') {
      try {
        const curY = new Date().getFullYear()
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('dismissed_bday_') && key.endsWith(`_${curY}`)) {
            if (localStorage.getItem(key) === '1') {
              const pid = key.split('_')[2]
              s.add(pid)
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    return s
  })
  const terrariumOn = useTerrariumStore((s) => s.on)
  const isMobile = useIsMobile()
  // DS-CHANGELOG §3 Offline: a phone row not yet synced carries a pending ring while offline.
  const online = useOnline()
  const { pending: pendingIds } = useOutboxMarks('tasks')

  const [morningOpen, setMorningOpen] = useState(false)
  const [eveningOpen, setEveningOpen] = useState(false)
  // A notification's "Plan my day" / "Shut down" lands on /today?ritual=morning|evening (notify/copy.ts).
  const [searchParams, setSearchParams] = useSearchParams()
  const ritualParam = searchParams.get('ritual')
  useEffect(() => {
    if (!ritualParam) return
    if (ritualParam === 'morning') setMorningOpen(true)
    if (ritualParam === 'evening') setEveningOpen(true)
    setSearchParams((p) => (p.delete('ritual'), p), { replace: true })
  }, [ritualParam, setSearchParams])
  const [celebrate, setCelebrate] = useState(false)

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects])
  const projectDot = (id: string | null) => {
    if (!id) return 'var(--acc-moss)'
    const idx = projects.findIndex((p) => p.id === id)
    return `var(${PROJECT_DOTS[idx >= 0 ? idx % PROJECT_DOTS.length : 0]})`
  }

  // A3 (2026-07-18 audit): tasks completed *today* stay visible struck-through in their
  // sections instead of vanishing; done rows sort after open ones within each section.
  const doneAfterOpen = (a: Task, b: Task) => Number(!!a.completed_at) - Number(!!b.completed_at)
  // One rule for this page and the sidebar badge (Polish F1): grouping.ts `todayListTasks`.
  const visible = todayListTasks(tasks)
  const open = visible.filter((t) => !t.completed_at)
  // Loop A (2026-09-26 daily cycle): completing clears `top3` (completion.ts), so a finished pick
  // used to drop out of this section into "All open" — and the Day card couldn't tell "all three
  // done" from "none picked". Today's Top 3 now also holds the tasks finished today while starred,
  // read back from the star log (./top3Today) — struck through, as A3/R4 always intended.
  const { data: starEvents = [] } = useStarEvents(visible.filter((t) => t.completed_at || t.top3).map((t) => t.id))
  // Kai 2026-10-07: the Top 3 in his order, the first one the goal of the day — the same on every
  // device (./top3Order, tasks.top3_rank). R4 (2026-07-20 audit): a finished goal stays the goal,
  // struck through; the other finished picks sit after the open ones (A3).
  const top3InOrder = dayTop3(tasks, legacyGoalId(), starEvents, new Date())
  const top3Ids = new Set(top3InOrder.map((t) => t.id))
  const top3 = top3InOrder
  const goal = top3InOrder[0] as Task | undefined
  const restTop3 = top3InOrder.slice(1)
  // Move up / Move down in a Top 3 row's menu (and Alt+↑/↓): its place among the open picks.
  const lastOpen = top3InOrder.findLastIndex((t) => !t.completed_at)
  const placeOf = (t: Task) => (t.completed_at ? undefined : { index: top3InOrder.indexOf(t), last: lastOpen })

  // The day's phase + ritual progress on the minute clock (./useDay) — the desktop Day card, the
  // phone's ritual card and header line, and what counts as running or still to come.
  const day = useDay({ events, tasks, top3: top3InOrder, ritualSteps, prompts: ritualPins })
  const now = day.now
  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const doneTaskIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id))
  // Each item once (./todayLayout, rulings 3–4). Only the phone has the NOW slip; on desktop the
  // running block stays in Up next, reading "Now".
  const slip = isMobile ? runningBlock(events, now, doneTaskIds) : null
  const slipTask = slip?.task_id ? taskById.get(slip.task_id) : undefined
  const upNext = upNextItems(events, now, slip, top3Ids)
  const upNextTasks = upNext.flatMap((e) => (e.task_id && taskById.has(e.task_id) ? [taskById.get(e.task_id)!] : []))
  const allOpen = foldOpen(visible, top3Ids, slip ? [slip, ...upNext] : upNext).sort(doneAfterOpen)
  // Kai 2026-10-07 ("More for today · 320", mostly overdue): the overdue ones get their own fold with
  // Replan all ▾; More for today keeps the rest. Oldest first (Today's list order).
  const overdueOpen = allOpen.filter((t) => !t.completed_at && isOverdue(t, now))
  const overdueIds = new Set(overdueOpen.map((t) => t.id))
  const restOpen = allOpen.filter((t) => !overdueIds.has(t.id))
  const openCount = restOpen.filter((t) => !t.completed_at).length
  const doneToday = tasks.filter((t) => isToday(t.completed_at)).length
  const nothingPlanned = !tasksPending && open.length === 0 && doneToday === 0
  const allDone = !tasksPending && open.length === 0 && doneToday > 0

  // X1 Effects 2d (+ Motion 1b) — the last check of the day earns a 5-petal fall and a
  // handwritten banner over the Top-3 section. Punch 23: the once-per-day gate lives in
  // ./dayComplete (single key, 3s dwell) — the one implementation for the whole app.
  const motion = useMotionEnabled()
  const wasAllDone = useRef(allDone)
  useEffect(() => {
    const was = wasAllDone.current
    wasAllDone.current = allDone
    if (was || !allDone || !motion) return
    if (!claimDayComplete()) return
    setCelebrate(true)
    const t = setTimeout(() => setCelebrate(false), DAY_DONE_DWELL_MS)
    return () => clearTimeout(t)
  }, [allDone, motion])

  // A2 (2026-07-18 audit): the Tasks selection pattern on Today — checkbox toggle,
  // Ctrl+A via useListKeys, BulkBar. Done rows aren't selectable (bulk acts on open tasks).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Every task row on the page, in screen order, once (a Top 3 task that is also the slip's block
  // shows twice by design — Open question 1 — but is one selection).
  const selectable = [...new Map([...top3InOrder, ...(slipTask ? [slipTask] : []), ...upNextTasks, ...allOpen].map((t) => [t.id, t] as const)).values()].filter((t) => !t.completed_at)
  const selectedTasks = selectable.filter((t) => selected.has(t.id))
  // Kai 2026-07-21 (clarified): the visible per-row select SQUARES go, but selectability
  // stays — Ctrl/Cmd+click toggles a row, Ctrl+A still selects all, the BulkBar still rides
  // a selection, and every row has a right-click menu.
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  // The one task-row grammar (features/tasks/SwipeRow + TaskMenu): each row's selection props.
  const rowSelection = (t: Task) => ({ selected: selected.has(t.id), onToggleSelect: () => toggleSelected(t.id), selecting: selected.size > 0 })
  useEscapeStack(selected.size > 0, clearSelection)

  // Punch 19: click-away deselects. A click on empty page space clears the multi-select;
  // clicks that land on a task row, the BulkBar, any menu/popover, or an overlay card/scrim
  // keep it (Ctrl-click toggling and Esc behave as before). Document-level so "empty space"
  // includes the shell around the page, not just this component's box.
  const hasSelection = selected.size > 0
  useEffect(() => {
    if (!hasSelection) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Element | null
      if (t?.closest('[id^="task-"], [id^="upnext-"], [role="toolbar"], [role="menu"], [role="dialog"], .kf-overlay-card, .kf-overlay-scrim')) return
      setSelected(new Set())
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [hasSelection])

  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)
  const [replanAt, setReplanAt] = useState<{ x: number; y: number } | null>(null)

  // Punch 6 (Polish D): completing gets the same Undo as a single check — see completeTaskWithUndo.
  // Kai 2026-10-07: every bulk action is an Undo toast now (no plain "N tasks moved." notices).
  function bulkComplete() {
    const undos = selectedTasks.map((t) => completeTask(t))
    toastUndo(`${undos.length} task${undos.length === 1 ? '' : 's'} completed.`, () => undos.forEach(undoCompletion))
    clearSelection()
  }
  function bulkTomorrow() { moveToTomorrowWithUndo(selectedTasks); clearSelection() }
  function bulkSchedule(iso: string, timed?: boolean) { rescheduleTasksWithUndo(selectedTasks, iso, { timed }); clearSelection() }
  function bulkMove(to: MoveTarget) { moveTasksWithUndo(selectedTasks, to); clearSelection() }
  function bulkSomeday() { somedayTasksWithUndo(selectedTasks); clearSelection() }
  // Flow Audit §4: delete = Trash + Undo, no confirm.
  function bulkDelete() { deleteTasksWithUndo(selectedTasks); clearSelection() }

  // F3 (punch 12/22/29): Today's list keyboard was an empty bindings array — dead keys on the
  // app's primary surface. Wired to the same handlers its context menu already uses.
  // WB-4 (punch 12): s/p were still unwired here while the `?` cheatsheet advertised them for
  // "Task list" — same row-menu pattern as TasksPage now, so both surfaces match the overlay.
  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  const kbProjectTask = kbProjectId ? selectable.find((t) => t.id === kbProjectId) : null
  const openTask = useOpenTask()
  const listBindings = buildListBindings({
    complete: (t) => completeTaskWithUndo(t),
    open: (t) => openTask(t.id),
    today: (t) => rescheduleDue(t, todayFor(t)), // the Plan menu's Today: keeps the task's time
    tomorrow: (t) => moveToTomorrowWithUndo([t]),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => deleteTasksWithUndo([t]),
  })
  const { focusedId } = useListKeys(selectable, listBindings, {
    active: !morningOpen && !eveningOpen && !bulkSchedulePos && !bulkProjectPos && !kbProjectId && !replanAt,
    sectionLabel: 'Lists',
    onSelectAll: () => setSelected(new Set(selectable.map((t) => t.id))),
  })

  // Kai 2026-10-07: order the Top 3. Alt+↑/↓ moves the focused Top 3 row (up into first place = the
  // goal); desktop also drags a row onto another's place (Top3Slot). A phone uses the rows' menu.
  const keysOn = !morningOpen && !eveningOpen
  useEffect(() => {
    if (!keysOn) return
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || isTypingTarget(e.target)) return
      const id = document.activeElement?.closest('[id^="task-"]')?.id.slice(5) || focusedId
      const t = top3InOrder.find((x) => x.id === id)
      if (!t || t.completed_at) return
      e.preventDefault()
      if (moveInTop3Order(t, top3InOrder.indexOf(t) + (e.key === 'ArrowUp' ? -1 : 1))) {
        requestAnimationFrame(() => document.getElementById(`task-${t.id}`)?.focus({ preventScroll: true }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const dragSensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }))
  function onTop3Drop(e: DragEndEvent) {
    // The drop's mouseup is followed by a click on the moved row — it must not open the task.
    const swallow = (ev: Event) => ev.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    const t = top3InOrder.find((x) => x.id === e.active.id)
    const to = top3InOrder.findIndex((x) => x.id === e.over?.id)
    if (t && to >= 0) moveInTop3Order(t, to)
  }

  // Polish D (2026-09-26 audit): the rail counted and listed EVERY active routine — a Sunday-only
  // "Plan the week" on a Saturday, "1/5" where Routines said "1 of 3". The count and the rows now
  // both come from the Routines page's own definition of today (streaks.ts todayTally /
  // routinesForToday: scheduled today, or already checked off today), so the two pages agree.
  const routineGroups = groupRoutinesByTime(routinesForToday(routines, completions)).filter((g) => g.items.length > 0)
  // Kai 2026-10-03: the phone shows the routines for now (+ Anytime); other times fold into one line each.
  const routineSplit = splitByTimeOfDay(routineGroups, Number(cairoTimeKey(now).slice(0, 2)))
  const [openRoutineGroups, setOpenRoutineGroups] = useState<string[]>([])
  const doneKeys = useMemo(() => {
    const today = localDateKey(new Date())
    return new Set(completions.filter((c) => c.completed_on === today).map((c) => c.routine_id))
  }, [completions])
  const { due: routinesTotal, done: routinesDone } = todayTally(routines, completions)
  const hasActiveRoutines = routines.some((r) => r.active)

  // R4-D1 (Kai's 2026-07-20 ruling (a)): a ritual's progress is its own steps walked today,
  // never a count of `time_of_day`-tagged routines — those are a separate surface entirely.
  // Loop A: the Day card reads them (./dayPhase morningState / eveningState).
  //
  // A ritual logs its steps through the outbox into activity_log, which realtime doesn't sync and
  // the outbox's optimistic write doesn't reach (only the exact ['activity_log'] key). So when a
  // ritual closes, let the queue land, then re-read the log — the Day card turns without a reload.
  function openRitual(kind: RitualKind) {
    if (kind === 'morning') setMorningOpen(true)
    else setEveningOpen(true)
  }
  function closeRitual(kind: RitualKind) {
    if (kind === 'morning') setMorningOpen(false)
    else setEveningOpen(false)
    void flushOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['activity_log'] }))
  }
  const overdueCount = filterByList(tasks, 'overdue').length

  const streak = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let best = 0
    for (const r of routines) if (r.active) best = Math.max(best, computeStreak(byRoutine.get(r.id) ?? [], r.cadence).current)
    return best
  }, [routines, completions])

  // Ported from the retired Terrarium.tsx — day count since the earliest record, for the phone
  // header's "Day N" (Today Phone ruling 1). Desktop 1a's band omits it.
  const firstRecord = useMemo(
    () => [...tasks.map((t) => t.created_at), ...pendingInbox.map((i) => i.created_at), ...projects.map((p) => p.created_at), ...routines.map((r) => r.created_at)].sort()[0] ?? null,
    [tasks, pendingInbox, projects, routines],
  )
  const dayNumber = dayOfJourney(firstRecord, now)

  const upcomingBirthdays = useMemo(() => {
    return people
      .filter((p) => {
        if (dismissedBdays.has(p.id)) return false
        const bdayFact = p.facts?.find((f: any) => f.label === 'Birthday')
        if (!bdayFact) return false
        const days = getDaysUntilBirthday(bdayFact.date || bdayFact.value)
        return days === 0 || days === 1
      })
      .map((p) => {
        const bdayFact = p.facts?.find((f: any) => f.label === 'Birthday')
        const days = getDaysUntilBirthday(bdayFact?.date || bdayFact?.value)!
        return { person: p, days }
      })
  }, [people, dismissedBdays])

  const handleDismissBday = (personId: string) => {
    const curY = new Date().getFullYear()
    const key = `dismissed_bday_${personId}_${curY}`
    try {
      localStorage.setItem(key, '1')
    } catch (e) {
      console.error(e)
    }
    setDismissedBdays((prev) => {
      const next = new Set(prev)
      next.add(personId)
      return next
    })
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: appZone() })
  const dateLabelShort = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: appZone() })
  const hyd = pendingInbox.length === 0 ? 'zero' : pendingInbox.length < 5 ? 'light' : pendingInbox.length < 20 ? 'medium' : 'heavy'
  const vine = streak >= 30 ? 'lush' : streak >= 7 ? 'flowering' : streak >= 1 ? 'sprouting' : 'bare'

  const resurfacing = resurfacedRow?.action === 'pending'
  const slippingCards = (
    // Punch 20: multiple slipping items stack as multiple cards (TODAY_BEHAVIOR §A).
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {slipping.map((row) => {
        const project = row.entity_type === 'project' ? projects.find((p) => p.id === row.entity_id) : undefined
        // Non-project rows (domain/area) have no milestone % — p0 is the least-claiming stage.
        const stage = wisteriaStage(project ? weightedMilestonePct(project, tasks) : 0)
        return <SlippingCard key={`${row.entity_type}:${row.entity_id}`} row={row} stage={stage} />
      })}
    </div>
  )
  const birthdayCards = upcomingBirthdays.map(({ person, days }) => {
    const text = days === 0
      ? `${person.name}'s birthday is today!`
      : `${person.name}'s birthday is tomorrow.`

    return (
      <div key={person.id} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-clover-text)' }}>
            A moment coming
          </span>
          <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
        </div>
        <div
          style={{
            position: 'relative',
            background: 'var(--paper-parchment)',
            border: '1px solid var(--line-card)',
            borderRadius: 3,
            boxShadow: 'var(--shadow-crisp)',
            padding: '13px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 13
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}>
            <g fill="var(--acc-sage)">
              <ellipse cx="12" cy="6.8" rx="3" ry="4.2" />
              <ellipse cx="6.8" cy="13.8" rx="3" ry="4.2" transform="rotate(-70 6.8 13.8)" />
              <ellipse cx="17.2" cy="13.8" rx="3" ry="4.2" transform="rotate(70 17.2 13.8)" />
            </g>
            <circle cx="12" cy="12" r="4" fill="var(--acc-blossom)" />
            <circle cx="12" cy="12" r="1.8" fill="var(--acc-gold-warm)" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', color: 'var(--ink-body)' }}>{text}</div>
          </div>
          <span
            onClick={() => {
              window.dispatchEvent(new CustomEvent('prefill-command-bar', { detail: `task: for ${person.name}'s birthday` }))
              openCapture()
            }}
            style={{ fontSize: '12.5px', color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer', flex: 'none' }}
          >
            Plan something →
          </span>
          <span
            onClick={() => handleDismissBday(person.id)}
            style={{ fontSize: '12px', color: 'var(--ink-hairline)', cursor: 'pointer', flex: 'none', paddingLeft: 2 }}
          >
            ✕
          </span>
        </div>
      </div>
    )
  })

  // The overdue fold's header action: every overdue task through the Plan list (+ Spread into free slots).
  const replanAll = overdueOpen.length > 0 && (
    <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={(e) => setReplanAt({ x: e.clientX, y: e.clientY })}>
      Replan all ▾
    </Button>
  )

  // The bulk bar, pickers and rituals ride over either layout.
  const overlays = (
    <>
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onTomorrow={bulkTomorrow}
          onSchedule={(e) => setBulkSchedulePos({ x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
          onSelectAll={() => setSelected(new Set(selectable.map((t) => t.id)))}
        />
      )}
      {bulkSchedulePos && selectedTasks.length > 0 && (
        <PlanMenu task={selectedTasks[0]} bulkCount={selectedTasks.length} position={bulkSchedulePos} onClose={() => setBulkSchedulePos(null)} actions={{ schedule: bulkSchedule, tomorrow: bulkTomorrow, someday: bulkSomeday }} />
      )}
      {replanAt && overdueOpen.length > 0 && (
        <PlanMenu
          task={overdueOpen[0]}
          bulkCount={overdueOpen.length}
          spreadTasks={overdueOpen}
          title="Replan all"
          position={replanAt}
          onClose={() => setReplanAt(null)}
          actions={{
            schedule: (iso, timed) => rescheduleTasksWithUndo(overdueOpen, iso, { timed, message: `${overdueOpen.length} overdue task${overdueOpen.length === 1 ? '' : 's'} replanned` }),
            tomorrow: () => moveToTomorrowWithUndo(overdueOpen),
            someday: () => somedayTasksWithUndo(overdueOpen),
            spread: spreadWithUndo,
          }}
        />
      )}
      {bulkProjectPos && <MovePicker position={bulkProjectPos} current={null} onPick={bulkMove} onClose={() => setBulkProjectPos(null)} />}
      {kbProjectTask && (
        <MovePicker position={rowAnchor('task-', kbProjectTask.id)} current={placeKey(kbProjectTask)} onPick={(to) => moveTasksWithUndo([kbProjectTask], to)} onClose={() => setKbProjectId(null)} />
      )}

      {morningOpen && <MorningRitual onClose={() => closeRitual('morning')} />}
      {eveningOpen && <EveningRitual onClose={() => closeRitual('evening')} />}
    </>
  )

  // ── Phone: Today Phone.dc.html 2a–2n. Header line → NOW slip or ritual card → Top 3 → Up next
  // → Routines → the quiet fold. Four section labels, each item once. ──
  if (isMobile) {
    const empty = nothingPlanned && !eventsPending && upNext.length === 0 && !slip
    const card = tasksPending ? null : topCard(day.state.phase, slip, empty)
    const tended = day.tally.picked > 0 && day.tally.done >= day.tally.picked
    const metas = eventMetas(upNext, now)
    const blockMetaOf = (t: Task) => {
      const b = blockOf(t.id, events, now)
      return b ? blockMeta(b, now) : undefined
    }
    const row = (t: Task, extra: { pick?: boolean; block?: CalendarEvent; meta?: string[]; place?: RowGrammarOptions['place'] } = {}) => (
      <TaskRow key={extra.block?.id ?? t.id} task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} compact pending={!online && pendingIds.has(t.id)} {...rowSelection(t)} highlighted={t.id === focusedId} {...extra} />
    )
    const foldCount = restOpen.length + slipping.length + (resurfacing ? 1 : 0)
    const workload: Omit<WorkloadInput, 'focusedMin'> = {
      day: dayNumber,
      phase: day.state.phase,
      empty,
      top3: day.tally,
      top3DoneAt: top3.map((t) => t.completed_at ?? '').sort().pop() || null,
      doneToday,
      remaining: remainingWork(top3InOrder.filter((t) => !t.completed_at), events, now, doneTaskIds),
    }
    return (
      <div className="tp">
        <PhoneBar title={dateLabelShort} morning={day.morning} evening={day.evening} onOpenRitual={openRitual} />
        {tasksPending ? (
          <div style={{ padding: '4px 16px 12px' }}><span className="tp-sk" style={{ width: '64%' }} /></div>
        ) : (
          <PhoneSummary workload={workload} now={now} online={online} syncing={fetchingSlowly} />
        )}

        {card === 'slip' && slip && <NowSlip event={slip} task={slipTask} now={now} sel={slipTask ? rowSelection(slipTask) : {}} />}
        {card && card !== 'slip' && <RitualCard kind={card} day={day} inboxCount={pendingInbox.length} overdueCount={overdueCount} sweepCount={open.length} onOpenRitual={openRitual} />}
        {card && <FirstTodayHint />}
        {birthdayCards.length > 0 && <div style={{ padding: '8px 16px 0' }}>{birthdayCards}</div>}

        {empty ? (
          // Ruling 8: one secondary action that opens capture; the terra capture button stays the CTA.
          <div style={{ paddingTop: 64 }}>
            <EmptyState image={`${A}/clover/seedling.png`} line="Nothing here yet. A day starts with three things." action={{ label: 'Add your first three things', onClick: openCapture }} />
          </div>
        ) : (
          <>
            <section style={{ position: 'relative' }}>
              {celebrate && <DayCompleteBurst />}
              <PhoneSection label="Top 3" link={tasksPending ? undefined : { to: '/tasks', label: 'All tasks' }} first />
              {tasksPending ? (
                <>
                  <div className="tp-goal-wrap"><GoalCardLoading /></div>
                  <div className="tp-list"><Skeleton rows={2} /></div>
                </>
              ) : tasksQuery.isError && tasks.length === 0 ? (
                <div className="tp-pad"><ErrorCard message="Couldn't load your tasks." onRetry={() => void tasksQuery.refetch()} /></div>
              ) : top3.length === 0 ? (
                <div className="tp-quiet">Nothing starred for today yet.</div>
              ) : (
                <>
                  {goal && (
                    <div className="tp-goal-wrap">
                      <GoalCard task={goal} projectName={projectName.get(goal.project_id ?? '')} dot={projectDot(goal.project_id)} compact meta={blockMetaOf(goal)} place={placeOf(goal)} {...rowSelection(goal)} />
                    </div>
                  )}
                  {restTop3.length > 0 && <div className="tp-list">{restTop3.map((t) => row(t, { pick: true, meta: blockMetaOf(t), place: placeOf(t) }))}</div>}
                  {tended && (
                    <div className="tp-tended">
                      <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 36, height: 'auto', filter: 'var(--shadow-drop-sm)' }} />
                      <span className="tp-hand" style={{ fontSize: 'var(--fs-hand-l)' }}>{day.tally.picked === 3 ? 'All three tended.' : 'All tended.'} The rest is extra ✿</span>
                    </div>
                  )}
                </>
              )}
            </section>

            <section>
              <PhoneSection label="Up next" link={tasksPending ? undefined : { to: '/calendar', label: 'Calendar' }} />
              {eventsPending ? (
                <div className="tp-list"><Skeleton rows={2} /></div>
              ) : eventsQuery.isError && events.length === 0 ? (
                <div className="tp-pad"><ErrorCard message="Couldn't load calendar events." onRetry={() => void eventsQuery.refetch()} /></div>
              ) : upNext.length === 0 ? (
                // Ruling 6: "what's next" is still answered.
                <div className="tp-quiet">Nothing else on the calendar today</div>
              ) : (
                <div className="tp-list">
                  {upNext.map((e, i) => {
                    const t = e.task_id ? taskById.get(e.task_id) : undefined
                    // A task's block is the task (a task row, carrying its time); an event is an event row.
                    return t ? row(t, { block: e, meta: [blockMeta(e, now)[0], ...metas[i]] }) : <PhoneEventRow key={e.id} event={e} meta={metas[i]} />
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {!tasksPending && !(empty && routinesTotal === 0) && (
          <section>
            <PhoneSection label={routinesTotal > 0 ? `Routines · ${routinesDone}/${routinesTotal}` : 'Routines'} link={{ to: '/routines', label: 'Routines' }} />
            {routinesTotal === 0 ? (
              // Polish D: routines exist but every one rests today — say so, don't invite planting.
              <div className="tp-quiet">{hasActiveRoutines ? 'Nothing on repeat today' : 'Nothing on repeat yet — plant one on Routines'}</div>
            ) : (
              <>
                {[...routineSplit.shown, ...routineSplit.folded.filter((g) => openRoutineGroups.includes(g.key))].map((g, i) => (
                  <div key={g.key}>
                    {routineGroups.length > 1 && <div className={`tp-sub${i === 0 ? ' is-first' : ''}`} style={{ paddingBottom: 6 }}>{g.label}</div>}
                    <div className="tp-list">
                      {g.items.map((r) => <RoutineRow key={r.id} routine={r} done={doneKeys.has(r.id)} compact />)}
                    </div>
                  </div>
                ))}
                {routineSplit.folded.filter((g) => !openRoutineGroups.includes(g.key)).map((g) => (
                  <button key={g.key} type="button" className="tp-sub tp-fold-line" onClick={() => setOpenRoutineGroups((o) => [...o, g.key])}>
                    {g.when} · {g.label} {g.items.filter((r) => doneKeys.has(r.id)).length}/{g.items.length}
                  </button>
                ))}
              </>
            )}
          </section>
        )}

        {!tasksPending && overdueOpen.length > 0 && (
          <MoreForToday phone label="Overdue" summary={String(overdueOpen.length)} storageKey={OVERDUE_OPEN_KEY} action={replanAll}>
            <div className="tp-list">{overdueOpen.slice(0, ALL_OPEN_CAP).map((t) => row(t))}</div>
            {overdueOpen.length > ALL_OPEN_CAP && <Link to="/tasks?list=overdue" className="tp-link" style={{ marginLeft: 8 }}>View all</Link>}
          </MoreForToday>
        )}
        {!tasksPending && foldCount > 0 && (
          <MoreForToday phone summary={String(foldCount)}>
            {restOpen.length > 0 && (
              <>
                <div className="tp-sub is-first" style={{ paddingBottom: 6 }}>Open · {openCount}</div>
                <div className="tp-list">{restOpen.slice(0, ALL_OPEN_CAP).map((t) => row(t))}</div>
                {restOpen.length > ALL_OPEN_CAP && <Link to="/tasks?list=all" className="tp-link" style={{ marginLeft: 8 }}>View all</Link>}
              </>
            )}
            {slipping.length > 0 && (
              <>
                <div className="tp-sub">Slipping</div>
                <div className="tp-pad">{slippingCards}</div>
              </>
            )}
            {resurfacing && (
              <>
                <div className="tp-sub">From a while ago</div>
                <div className="tp-pad"><ResurfaceCard /></div>
              </>
            )}
          </MoreForToday>
        )}
        {overlays}
      </div>
    )
  }

  // ── Desktop: Today.dc.html 1a. ──
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Today</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 42, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{dateLabel}</h1>
      </div>
      <CaptureCta />
    </div>
  )

  const terrarium = terrariumOn && (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 26, marginBottom: 26, transform: 'rotate(-0.3deg)' }}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: 44, width: 66, height: 16, background: 'color-mix(in srgb, var(--acc-sage) 36%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <img src={`${A}/cherry/${cherryStage(open.length, doneToday)}.png`} alt="Tasks" style={{ height: 58, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/hydrangea/${hyd}.png`} alt="Inbox" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/vine/${vine}.png`} alt="Routines" style={{ height: 54, filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>The terrarium</div>
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', marginTop: 2 }}>pressed &amp; kept, one day at a time</div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.7 }}>
        <div>{pendingInbox.length} in inbox</div>
        <div>{doneToday} of {open.length + doneToday} done</div>
        <div style={{ color: 'var(--acc-sage-text)' }}>{streak}-day streak</div>
      </div>
    </div>
  )

  // Loop A (2026-09-26 daily cycle, DAILY-CYCLE.md §Today): Day card → Top 3 → Up next → Routines
  // lead; the lists that don't drive the next move rest under one quiet "More for today" fold.
  // Desktop keeps its rail (Routines first, then Slipping / From a while ago — already peripheral).
  const showAllOpen = !tasksPending && !nothingPlanned && !allDone
  const allOpenSection = showAllOpen && (
    <section className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(2) : undefined}>
      <SectionLabel style={{ marginBottom: 6 }}>{`All open · ${openCount}`}</SectionLabel>
      {/* X1 Effects 2g — focus dim on the resting list (kf-dim, AppLayout shell CSS). */}
      <div className="kf-dim">
        {restOpen.slice(0, ALL_OPEN_CAP).map((t, i) => (
          <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
            <TaskRow task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} hollow border={i > 0} {...rowSelection(t)} highlighted={t.id === focusedId} />
          </div>
        ))}
      </div>
      {/* Punch 17: the rest lives on the Tasks "All" tab (built in parallel — link regardless). */}
      {restOpen.length > ALL_OPEN_CAP && (
        <Link to="/tasks?list=all" className="kf-link-terra" style={{ ...linkStyle, display: 'inline-block', marginTop: 10 }}>
          View all →
        </Link>
      )}
    </section>
  )
  const slippingSection = slipping.length > 0 && (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}><span style={{ color: 'var(--acc-terra)' }}>Slipping</span></SectionLabel>
      {slippingCards}
    </section>
  )
  // Punch 2: with no routines this was a heading reading "· 0/0" above nothing.
  // The section now either carries content or offers the one designed way in.
  const routinesSection = (
    <section>
      <SectionLabel style={{ marginBottom: 10 }}>{routinesTotal > 0 ? `Routines · ${routinesDone}/${routinesTotal}` : 'Routines'}</SectionLabel>
      {routinesTotal === 0 && (
        <Link to="/routines" style={{ display: 'block', fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand, #7a745f)', textDecoration: 'none' }}>
          {/* Polish D: routines exist but every one rests today — say so, don't invite planting. */}
          {hasActiveRoutines ? 'nothing on repeat today ✿' : 'nothing on repeat yet — plant one ✿'}
        </Link>
      )}
      {routineGroups.map((g) => (
        <div key={g.key}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', margin: '2px 0 5px' }}>{g.label}</div>
          {g.items.map((r) => (
            <RoutineRow key={r.id} routine={r} done={doneKeys.has(r.id)} />
          ))}
        </div>
      ))}
    </section>
  )
  // Punch 2: ResurfaceCard returns null when nothing has resurfaced, so this was a
  // bare heading. The heading now only appears with a card under it.
  const resurfaceSection = resurfacing && (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}>From a while ago</SectionLabel>
      <ResurfaceCard />
    </section>
  )
  const moreForToday = showAllOpen && (
    <>
      {overdueOpen.length > 0 && (
        <MoreForToday label="Overdue" summary={String(overdueOpen.length)} storageKey={OVERDUE_OPEN_KEY} action={replanAll}>
          <section>
            <div className="kf-dim">
              {overdueOpen.slice(0, ALL_OPEN_CAP).map((t, i) => (
                <TaskRow key={t.id} task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} hollow border={i > 0} {...rowSelection(t)} highlighted={t.id === focusedId} />
              ))}
            </div>
            {overdueOpen.length > ALL_OPEN_CAP && (
              <Link to="/tasks?list=overdue" className="kf-link-terra" style={{ ...linkStyle, display: 'inline-block', marginTop: 10 }}>
                View all →
              </Link>
            )}
          </section>
        </MoreForToday>
      )}
      <MoreForToday summary={openCount > 0 ? `${openCount} open` : ''}>
        {allOpenSection}
      </MoreForToday>
    </>
  )

  return (
    // Kai 2026-10-03: the shared page width, left-aligned like Tasks (it was 1010 centred, and
    // shrank to its content inside the flex route — index.css .kf-route > *).
    <div style={{ maxWidth: 'var(--kf-page-max)' }}>
      {terrarium}
      {header}

      {/* deviation(2026-09-26 daily cycle): ONE Day card with the next move replaces the two
          pinned ritual cards (./DayCard, ./dayPhase). Pins now decide which ritual it prompts. */}
      <div className="kf-daycard-slot" style={{ marginTop: 20 }}>
        <DayCard day={day} inboxCount={pendingInbox.length} overdueCount={overdueCount} onOpenRitual={openRitual} />
      </div>
      {!tasksPending && <FirstTodayHint style={{ padding: '10px 0 0 24px', fontSize: 'var(--fs-hand-l)' }} />}

      <div style={{ height: 1, borderBottom: '1px dashed var(--line-solid)', margin: '26px 0 28px' }} />

      {/* The side column (Routines · Slipping) grows with the page too, from 264 to 340. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) clamp(264px, 28%, 340px)', gap: 44, alignItems: 'start' }}>
        <div className="kf-bulk-anchor" style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          {birthdayCards}
          <section className={motion ? 'kf-stagger-item' : undefined} style={{ position: 'relative', ...(motion ? staggerDelay(0) : null) }}>
            {celebrate && <DayCompleteBurst />}
            <SectionLabel style={{ marginBottom: 14 }}>Top 3 for today</SectionLabel>
            {tasksPending ? (
              <>
                <Skeleton variant="card" />
                <Skeleton rows={2} />
              </>
            ) : nothingPlanned ? (
              <EmptyTodayCard onPlan={openCapture} />
            ) : allDone ? (
              <DoneTodayCard />
            ) : (
              <DndContext sensors={dragSensors} onDragEnd={onTop3Drop}>
                {goal && (
                  <Top3Slot key={goal.id} id={goal.id} open={!goal.completed_at}>
                    <GoalCard task={goal} projectName={projectName.get(goal.project_id ?? '')} dot={projectDot(goal.project_id)} meta={blockMetaFor(goal, events, now)} place={placeOf(goal)} {...rowSelection(goal)} />
                  </Top3Slot>
                )}
                {restTop3.map((t) => (
                  <Top3Slot key={t.id} id={t.id} open={!t.completed_at}>
                    <TaskRow task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} border meta={blockMetaFor(t, events, now)} place={placeOf(t)} {...rowSelection(t)} highlighted={t.id === focusedId} />
                  </Top3Slot>
                ))}
                {top3.length === 0 && <Empty line="Nothing starred for today yet." />}
              </DndContext>
            )}
          </section>

          <section className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(1) : undefined}>
            <SectionLabel action={<Link to="/calendar" className="kf-link-terra" style={linkStyle}>Open calendar →</Link>} style={{ marginBottom: 12 }}>Up next</SectionLabel>
            {!eventsPending && upNext.length === 0 && <Empty line="A clear afternoon." />}
            {upNext.map((e, i) => (
              <EventRow key={e.id} event={e} task={e.task_id ? taskById.get(e.task_id) : undefined} border={i > 0} now={now} rowSelection={rowSelection} />
            ))}
          </section>

          {moreForToday}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {routinesSection}
          {slippingSection}
          {resurfaceSection}
        </div>
      </div>

      {overlays}
    </div>
  )
}

const linkStyle = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', textDecoration: 'none' }

/** A Top 3 task's block today, as its row's meta ("13:30–15:00 · 1H30M") — Up next skips it. */
function blockMetaFor(t: Task, events: CalendarEvent[], now: Date): string[] | undefined {
  const b = blockOf(t.id, events, now)
  return b ? blockMeta(b, now) : undefined
}

function metaRow(projectName: string | undefined, dot: string, duration: number | null, extra?: React.ReactNode) {
  return (
    <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {projectName && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
          {projectName}
        </span>
      )}
      {duration != null && <span>{formatDuration(duration)}</span>}
      {extra}
    </div>
  )
}

// ── Phone chrome ──

/** MK top bar: the date as the page title (Source Serif 26), search and ⋯. Scrolled → the small-
 * title variant (Inter 18/600, ruling 7). ⋯ keeps the two rituals one tap away in every state, as
 * the desktop Day card's links do. Re-tapping the Today tab scrolls to the top (MobileTabBar). */
function PhoneBar({ title, morning, evening, onOpenRitual }: { title: string; morning: RitualState; evening: RitualState; onOpenRitual: (kind: RitualKind) => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const main = document.querySelector('.app-main-content')
    if (!main) return
    const on = () => setScrolled(main.scrollTop > 8)
    on()
    main.addEventListener('scroll', on, { passive: true })
    return () => main.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="tp-bar" data-scrolled={scrolled || undefined}>
      <h1 className="tp-bar-title">{title}</h1>
      {/* AppLayout owns the overlay; this asks it to open. */}
      <button type="button" className="tp-icon" aria-label="Search" onClick={() => window.dispatchEvent(new Event('kf-open-search'))}>
        <Icon name="search" />
      </button>
      <button type="button" className="tp-icon" aria-label="Today menu" aria-haspopup="dialog" onClick={() => setMenu(true)}>
        <Icon name="dots" />
      </button>
      {menu && (
        <ActionSheet
          title="Today"
          items={[
            { label: 'Morning ritual', hint: ritualProgress(morning), icon: <Icon name="today" />, onSelect: () => onOpenRitual('morning') },
            { label: 'Evening ritual', hint: ritualProgress(evening), icon: <Icon name="routines" />, onSelect: () => onOpenRitual('evening') },
          ]}
          onClose={() => setMenu(false)}
        />
      )}
    </div>
  )
}

/** Ruling 1: the Workload line under the title ("Day 84 · …"), a Syncing dot while cached data
 * refreshes (2m), and the offline chip in its place while offline (2h). */
function PhoneSummary({ workload, now, online, syncing }: { workload: Omit<WorkloadInput, 'focusedMin'>; now: Date; online: boolean; syncing: boolean }) {
  const { data: entries = [] } = useTimeEntries()
  if (!online) {
    return (
      <div style={{ padding: '0 16px 8px' }}>
        <OfflineChip />
      </div>
    )
  }
  return (
    <div className="tp-sum">
      <Icon name="clock" size={20} />
      <span style={{ flex: 1, minWidth: 0 }}>{workloadLine({ ...workload, focusedMin: focusedToday(entries, now) })}</span>
      {syncing && <span className="tp-syncing" style={{ fontSize: 'var(--fs-meta)', letterSpacing: '0.06em' }}>Syncing</span>}
    </div>
  )
}

function PhoneSection({ label, link, first }: { label: string; link?: { to: string; label: string }; first?: boolean }) {
  return (
    <div className={`tp-sec${first ? ' is-first' : ''}`}>
      <span className="tp-label">{label}</span>
      <span className="tp-rule" />
      {link && (
        <Link to={link.to} className="tp-link">
          {link.label}
          <Icon name="chevright" size={16} />
        </Link>
      )}
    </div>
  )
}

/** First Run 9i: the one Caveat line under the next-move card on a brand-new account's first Today
 * (./firstTodayHint). Mounted only under a card, so only a tap while it shows clears it. */
function FirstTodayHint({ style }: { style?: React.CSSProperties }) {
  const uid = useAuth().session?.user.id
  const [on, setOn] = useState(() => firstTodayHintPending(uid))
  useEffect(() => {
    if (!on) return
    const off = () => {
      clearFirstTodayHint(uid)
      setOn(false)
    }
    document.addEventListener('pointerdown', off, { capture: true, once: true })
    return () => document.removeEventListener('pointerdown', off, { capture: true })
  }, [on, uid])
  return on ? <div className="tp-hand tp-first-hint" style={style}>{FIRST_TODAY_HINT}</div> : null
}

/** The NOW slip (MK 11, option 1b "Taped slip"): only while a block actually runs (./todayLayout).
 * Ring = time elapsed, minutes left inside. Tap = open it; ✓ = done + Undo (a task's block only —
 * a plain event has nothing to complete); swipe / hold behave as the task's row. */
function NowSlip({ event, task, now, sel }: { event: CalendarEvent; task?: Task; now: Date; sel: RowSelection }) {
  const navigate = useNavigate()
  const openTask = useOpenTask()
  const start = new Date(event.starts_at).getTime()
  const end = new Date(event.ends_at).getTime()
  const pct = Math.min(100, Math.max(0, Math.round(((now.getTime() - start) / Math.max(1, end - start)) * 100)))
  const left = Math.max(1, Math.ceil((end - now.getTime()) / 60_000))
  const open = () => (task ? openTask(task.id) : navigate('/calendar'))
  const card = { position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px 10px 12px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', transform: 'rotate(-0.3deg)' } as const
  const inner = (done?: React.ReactNode) => (
    <>
      <span aria-hidden className="tp-tape" />
      <span className="tp-ring" style={{ background: `conic-gradient(var(--acc-sage-text) 0 ${pct}%, var(--line-card) ${pct}% 100%)` }} aria-label={`${left} minutes left`}>
        <span>{formatDuration(left)}</span>
      </span>
      <div onClick={open} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className="tp-caption is-now">Now · until {cairoTimeKey(new Date(end))}</div>
        <div className="tp-slip-title"><EmojiText text={event.title} /></div>
      </div>
      {done}
    </>
  )
  if (!task) {
    return (
      <div className="tp-slip-wrap">
        <div id={`slip-${event.id}`} style={card} role="link" aria-label={`Now: ${event.title}`} onClick={open}>{inner()}</div>
      </div>
    )
  }
  return (
    <div className="tp-slip-wrap">
      <SlipTask event={event} task={task} card={card} sel={sel} inner={inner} />
    </div>
  )
}

function SlipTask({ event, task, card, sel, inner }: { event: CalendarEvent; task: Task; card: React.CSSProperties; sel: RowSelection; inner: (done?: React.ReactNode) => React.ReactNode }) {
  const g = useTodayRow(task, { ...sel, ...blockGrammar(event) })
  const done = g.selecting ? (
    <span className="tp-hit"><SelectCircle on={!!sel.selected} title={task.title} /></span>
  ) : (
    <button type="button" className="tp-slip-done" aria-label={`Done: "${task.title}"`} onClick={(e) => { e.stopPropagation(); completeTaskWithUndo(task) }}>
      <span><Icon name="check" size={20} strokeWidth={2} /></span>
    </button>
  )
  return (
    <SwipeRow id={`slip-${event.id}`} onContextMenu={g.onContextMenu} contentStyle={{ ...card, backgroundImage: sel.selected ? 'linear-gradient(var(--select-bg), var(--select-bg))' : undefined }} {...g.swipeProps} overlay={g.menuNode}>
      {inner(done)}
    </SwipeRow>
  )
}

/** Ruling 5: time on the left (mono), a 3px lavender rule, title and meta. Tap opens it (the
 * calendar); no checkbox, no ⋯ — the event sheet holds the actions. */
function PhoneEventRow({ event, meta }: { event: CalendarEvent; meta: string[] }) {
  const navigate = useNavigate()
  return (
    <div id={`upnext-${event.id}`} className="tp-ev" role="link" tabIndex={0} onClick={() => navigate('/calendar')} onKeyDown={(e) => e.key === 'Enter' && navigate('/calendar')}>
      <span className="tp-ev-time">{cairoTimeKey(new Date(event.starts_at))}</span>
      <span className="tp-ev-rule" aria-hidden />
      <div className="tp-ev-body">
        <div className="tp-title"><EmojiText text={event.title} /></div>
        <div className="tp-meta">{meta.map((m) => <span key={m} style={m === 'Now' ? { color: 'var(--acc-sage-text)' } : undefined}>{m}</span>)}</div>
      </div>
    </div>
  )
}

/** MK Goal card, loading (2g): skeleton title lines under the tag. */
function GoalCardLoading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="tp-goal" style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 3, padding: '14px 12px 14px 4px', transform: 'rotate(-0.4deg)' }}>
      <div style={{ paddingLeft: 12 }}><span className="tp-goal-tag">✶ Goal of the day</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
        <span className="tp-hit"><span style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid var(--acc-gold)', boxSizing: 'border-box' }} /></span>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 12 }}>
          <div style={{ animation: 'skeletonPulse 1.6s var(--ease-natural) infinite' }}>
            <span className="tp-sk" style={{ width: '88%', height: 14 }} />
            <span className="tp-sk" style={{ width: '60%', height: 14, marginTop: 8 }} />
          </div>
          <div className="tp-meta">The one thing that makes today a win</div>
        </div>
        <img src={`${A}/clover/awake.png`} alt="" style={{ width: 34, height: 'auto', marginTop: 12, filter: 'var(--shadow-drop-sm)' }} />
      </div>
    </div>
  )
}

// X1 Effects 2d — day complete: 5 petals fall over the finished Top-3 and a handwritten
// banner rises once. Reuses the petalFall keyframe (tokens/motion.css) + itemFadeIn.
function DayCompleteBurst() {
  const petals = [12, 30, 50, 68, 84] // left %
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 5 }}>
      {petals.map((left, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 8,
            left: `${left}%`,
            width: 11,
            height: 9,
            background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)',
            borderRadius: i % 2 ? '60% 40% 70% 30%' : '70% 30% 60% 40%',
            animation: `petalFall 900ms var(--ease-out) ${i * 90}ms both`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 6,
          textAlign: 'center',
          fontFamily: 'var(--font-hand)',
          fontSize: 17,
          color: 'var(--ink-hand, #7a745f)',
          animation: 'itemFadeIn 400ms var(--ease-out) 500ms both',
        }}
      >
        that's the day, gently done ✿
      </div>
    </div>
  )
}

// States.dc.html 1a — Empty Today: seedling clover + one hand line + one action.
function EmptyTodayCard({ onPlan }: { onPlan: () => void }) {
  return (
    <div style={{ padding: '40px 40px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', left: '50%', top: -40, width: 260, height: 170, transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(232,217,160,0.5), rgba(232,217,160,0) 70%)' }} />
      <div style={{ position: 'relative', width: 190, height: 130 }}>
        <div style={{ position: 'absolute', inset: 0, border: '2.5px solid rgba(107,100,85,0.45)', borderRadius: '14px 14px 10px 10px', background: 'rgba(244,241,234,0.4)' }} />
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 30, borderRadius: '4px 4px 7px 7px', background: 'linear-gradient(180deg,var(--sky-horizon,#b9a98a),var(--sky-panel-strong,#a3937a))', boxShadow: 'inset 0 3px 5px rgba(var(--kf-shadow-rgb, 60,52,38),0.25)' }} />
        <img src={`${A}/clover/seedling.png`} alt="" style={{ position: 'absolute', left: '50%', bottom: 34, height: 52, transform: 'translateX(-50%)', filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ marginTop: 22, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', textAlign: 'center' }}>Nothing planted for today yet.</div>
      <Button type="button" variant="cta" onClick={onPlan} style={{ marginTop: 18, fontSize: 13.5, padding: '10px 22px' }}>Plan today</Button>
    </div>
  )
}

// States.dc.html 1b — Done Today: petal pile, no action.
function DoneTodayCard() {
  const petals: [number, number, number, number, string][] = [
    [52, 5, 13, 10, '70% 30% 60% 40%'],
    [70, 2, 12, 9, '60% 40% 70% 30%'],
    [40, 1, 11, 8, '70% 30% 60% 40%'],
    [62, 14, 11, 8, '60% 40% 70% 30%'],
    [82, 9, 10, 7, '70% 30% 60% 40%'],
    [52, 24, 9, 7, '60% 40% 70% 30%'],
  ]
  const rotations = [14, -38, 64, -10, 96, 150]
  return (
    <div style={{ padding: '44px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 150, height: 64 }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderBottom: '1.5px dashed var(--line-dashed)' }} />
        {petals.map(([left, bottom, w, h, radius], i) => (
          <span
            key={i}
            aria-hidden
            style={{ position: 'absolute', left, bottom, width: w, height: h, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: radius, transform: `rotate(${rotations[i]}deg)` }}
          />
        ))}
      </div>
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', textAlign: 'center' }}>All done. The garden can rest.</div>
    </div>
  )
}

// Holds a bloomed checkbox on screen for the length of Motion 5a before the row settles into
// its done treatment. Without it the swap to DoneCheck is instant and nothing animates.
// Polish F2a: the held box stays checked, so a second click on it used to run the completion
// again ("Done" twice). A click on a checked box now reopens the task, with Undo (checkAction).
function useBloomCheck(task: Task) {
  const [checking, setChecking] = useState(false)
  const done = !!task.completed_at
  const wasDone = useRef(done)
  useEffect(() => {
    if (wasDone.current && !done) setChecking(false) // reopened — drop the stale checked look
    wasDone.current = done
  }, [done])
  return {
    checking,
    toggle: () => {
      if (checkAction(done, checking) === 'reopen') {
        setChecking(false)
        reopenTaskWithUndo(task) // "Reopened" toast + Undo (puts the check back exactly)
        return
      }
      setChecking(true)
      completeTaskWithUndo(task) // punch 6: "Done" toast + Undo; the reopen effect above drops the bloom
    },
  }
}

type RowSelection = Pick<RowGrammarOptions, 'selected' | 'onToggleSelect' | 'selecting'>

/** A Today row's grammar: swipe, ⋯ / right-click, hold to select (features/tasks). */
function useTodayRow(task: Task, o: RowSelection & Pick<RowGrammarOptions, 'actions' | 'tomorrowHint' | 'canUnschedule' | 'place'>) {
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const done = !!task.completed_at
  return useRowGrammar(task, { projects, domains, areas, ...o, onToggleSelect: done ? undefined : o.onToggleSelect })
}

/** The block's own moves for a task row that stands for a calendar block (Up next, the slip):
 * Tomorrow keeps the block's time, and the menu can take it off the calendar. */
const blockGrammar = (event: CalendarEvent) => ({ actions: { tomorrow: () => moveBlockToTomorrow(event), unschedule: () => unscheduleWithUndo(event) }, tomorrowHint: blockTomorrowHint(event), canUnschedule: true })

const doneAt = (task: Task) => (task.completed_at ? `Done ${cairoTimeKey(new Date(task.completed_at))}` : 'Done')

/** Desktop: a Top 3 row that drags (mouse only — touch keeps its swipes) onto another's place;
 * dropped on the goal card it becomes the goal. Every row is a drop target, only open ones drag. */
function Top3Slot({ id, open, children }: { id: string; open: boolean; children: React.ReactNode }) {
  const drag = useDraggable({ id, disabled: !open })
  const drop = useDroppable({ id })
  const t = drag.transform
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.listeners}
      data-top3-slot={id}
      style={{
        position: 'relative',
        transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined,
        zIndex: drag.isDragging ? 5 : undefined,
        cursor: drag.isDragging ? 'grabbing' : undefined,
        borderRadius: 3,
        outline: drop.isOver && !drag.isDragging ? '2px dashed var(--acc-sage)' : undefined,
        outlineOffset: 2,
      }}
    >
      {children}
    </div>
  )
}

function GoalCard({ task, projectName, dot, compact, meta, place, ...sel }: { task: Task; projectName?: string; dot: string; compact?: boolean; meta?: string[]; place?: RowGrammarOptions['place'] } & RowSelection) {
  const done = !!task.completed_at // A3 — a completed goal stays on its card, struck through
  const bloom = useBloomCheck(task)
  const openTask = useOpenTask()
  const openDetail = () => openTask(task.id) // J-8
  // Loop A (2026-09-26 daily cycle): the goal is a Top 3 row too — the same grammar as the rows under it.
  const g = useTodayRow(task, { ...sel, place })
  const more = !g.selecting && <RowMenuButton title={task.title} onOpen={g.openMenu} />
  const card = { position: 'relative', backgroundColor: 'var(--paper-goal)', backgroundImage: sel.selected ? 'linear-gradient(var(--select-bg), var(--select-bg))' : undefined, border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 3, display: 'flex', alignItems: 'flex-start', transform: 'rotate(-0.4deg)' } as const
  if (compact) {
    // MK Goal card (Today Phone 2a–2e): gold tag, 22 gold box in a 48 hit, serif 18/600, gold meta,
    // clover (four-leaf once done). ⋯ stays, so every swipe has its tap path (DS-CHANGELOG §3).
    const lines = done ? [`${doneAt(task)} · a four-leaf day`] : meta ?? ([projectName, task.duration_min != null ? formatDuration(task.duration_min) : null].filter(Boolean) as string[])
    return (
      <SwipeRow id={`task-${task.id}`} className="tp-goal" onContextMenu={g.onContextMenu} contentStyle={{ ...card, display: 'block', padding: '14px 4px 14px 4px' }} {...g.swipeProps} overlay={g.menuNode}>
        <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', marginLeft: -36, width: 72, height: 17, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
        <div style={{ paddingLeft: 12 }}><span className="tp-goal-tag">✶ Goal of the day</span></div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
          <span className="tp-hit">
            {g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : <Checkbox label={task.title} checked={done || bloom.checking} bloom onChange={bloom.toggle} style={done || bloom.checking ? { background: 'var(--acc-gold)', color: 'var(--paper-parchment)' } : { borderColor: 'var(--acc-gold)' }} />}
          </span>
          <div onClick={openDetail} style={{ flex: 1, minWidth: 0, paddingTop: 12, cursor: 'pointer' }}>
            <div className={`tp-goal-title${done ? ' is-done' : ''}`}><EmojiText text={task.title} /></div>
            <div className="tp-meta">{lines.length ? lines.join(' · ') : 'The one thing that makes today a win'}</div>
          </div>
          <img className="tp-goal-clover" src={`${A}/clover/${done ? 'four_leaf' : 'awake'}.png`} alt="" style={{ width: 34, height: 'auto', marginTop: 12, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
          {more}
        </div>
      </SwipeRow>
    )
  }
  const box = { borderColor: 'var(--acc-gold)', background: 'color-mix(in srgb, var(--paper-parchment) 50%, transparent)' }
  const check = g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : done && !bloom.checking ? <DoneCheck task={task} size={19} /> : <Checkbox label={task.title} checked={bloom.checking} size={19} bloom onChange={bloom.toggle} style={box} />
  return (
    <SwipeRow id={`task-${task.id}`} onContextMenu={g.onContextMenu} style={{ marginBottom: 8 }} contentStyle={{ ...card, padding: '17px 18px 16px', gap: 14 }} {...g.swipeProps} overlay={g.menuNode}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', width: 78, height: 18, marginLeft: -39, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-1.5deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <span style={{ marginTop: 16 }}>{check}</span>
      <div onClick={openDetail} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>✶ Goal of the day</span>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.3, marginTop: 5 }}><EmojiText text={task.title} /></div>
        {metaRow(projectName, dot, task.duration_min, <>{meta && <span>{meta.join(' · ')}</span>}<span>{done ? 'Done today' : 'Due today'}</span></>)}
      </div>
      <div style={{ textAlign: 'center', flex: 'none' }}>
        <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 34, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 13, color: 'var(--acc-gold)', marginTop: -2 }}>for luck</div>
      </div>
      {more}
    </SwipeRow>
  )
}

// A3 — the design's done treatment (Today.dc.html:204, same as routine rows): filled
// --sig-done check, struck-through title. Click reopens (Polish F2a: with Undo).
function DoneCheck({ task, size }: { task: Task; size: number }) {
  return (
    <span
      onClick={() => reopenTaskWithUndo(task)}
      title="Reopen"
      className="kf-hit"
      style={{ width: size, height: size, borderRadius: 5, background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', flex: 'none', cursor: 'pointer' }}
    >
      ✓
    </span>
  )
}

function TaskRow({ task, projectName, dot, border, hollow, compact, highlighted, pick, block, meta, pending, place, ...sel }: {
  task: Task
  /** A Top 3 row: its place, for Move up / Move down in its menu. */
  place?: RowGrammarOptions['place']
  projectName?: string
  dot: string
  border?: boolean
  hollow?: boolean
  /** The phone's MK task row. */
  compact?: boolean
  highlighted?: boolean
  /** A Top 3 row: a finished pick keeps its filled star. */
  pick?: boolean
  /** The row stands for this calendar block (Up next): the block's own Tomorrow / Unschedule. */
  block?: CalendarEvent
  /** Replaces the row's own details — its block's time ("13:30–15:00 · starts in 20M"). */
  meta?: string[]
  /** Not synced yet while offline (phone): the pending ring. */
  pending?: boolean
} & RowSelection) {
  const bloom = useBloomCheck(task)
  const done = !!task.completed_at
  // Punch 18 (drift T-10): the same overdue/due-today/↻ meta the Tasks TaskRow renders,
  // via the shared taskDisplay helper — same "Overdue Nd" treatment, same ↻ glyph.
  const dueDays = !done && !task.someday && task.due_at ? daysOverdue(task.due_at) : null
  const dueBadges = dueDays !== null || task.recurrence_rule ? (
    <>
      {dueDays !== null && dueDays > 0 && <span style={{ color: 'var(--sig-overdue)' }}>Overdue {dueDays}d</span>}
      {dueDays === 0 && <span>Due today</span>}
      {task.recurrence_rule && <span>↻</span>}
    </>
  ) : null
  const openTask = useOpenTask()
  const g = useTodayRow(task, { ...sel, place, ...(block ? blockGrammar(block) : null) })
  // Kai 2026-07-21: no visible select squares on desktop — Ctrl/Cmd+click toggles selection.
  function selectClick(e: React.MouseEvent) {
    if (!(e.ctrlKey || e.metaKey) || done || !sel.onToggleSelect) return
    e.preventDefault()
    e.stopPropagation()
    sel.onToggleSelect()
  }
  const open = () => openTask(task.id)
  const rowProps = {
    id: block ? `upnext-${block.id}` : `task-${task.id}`,
    tabIndex: highlighted ? 0 : -1,
    onClickCapture: selectClick,
    onContextMenu: g.onContextMenu,
    style: {
      borderBottom: border ? '1px dashed var(--line-dashed)' : 'none',
      background: sel.selected || g.menuOpen ? 'var(--select-bg)' : undefined,
      boxShadow: highlighted ? '0 0 0 3px color-mix(in srgb, var(--acc-sage) 28%, transparent)' : undefined,
      outline: 'none',
    },
    ...g.swipeProps,
    overlay: g.menuNode,
  }
  if (compact) {
    // MK task row (DS-CHANGELOG §3): [check 48][title 15/20 + mono meta][star 48][⋯ 48], min-h 56.
    const details = done
      ? [<span key="done">{doneAt(task)}</span>]
      : meta
        ? meta.map((m) => <span key={m} style={m === 'Now' ? { color: 'var(--acc-sage-text)' } : undefined}>{m}</span>)
        : [
            projectName && <span key="p"><span className="tp-dot" style={{ background: dot }} />{projectName}</span>,
            dueDays !== null && dueDays > 0 && <span key="o" style={{ color: 'var(--sig-overdue)' }}>Overdue {dueDays}d</span>,
            dueDays === 0 && <span key="d">Due today</span>,
            task.duration_min != null && <span key="m">{formatDuration(task.duration_min)}</span>,
            task.recurrence_rule && <span key="r">↻</span>,
            !!task.labels?.length && <LabelChips key="l" labels={task.labels} />,
          ].filter(Boolean)
    return (
      <SwipeRow {...rowProps} className="tp-row" style={{ ...rowProps.style, borderBottom: undefined }} contentStyle={{ display: 'flex', alignItems: 'flex-start', minHeight: 'var(--row-min)', padding: 'var(--sp-1)', boxSizing: 'border-box' }}>
        <span className="tp-hit">
          {g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : <Checkbox label={task.title} checked={done || bloom.checking} bloom={task.top3} onChange={bloom.toggle} />}
        </span>
        <div onClick={open} className="tp-body">
          <div className={`tp-title${done ? ' is-done' : ''}`}><EmojiText text={task.title} /></div>
          {(details.length > 0 || pending) && (
            <div className="tp-meta">
              {details}
              {pending && <span className="tp-pending">Pending sync</span>}
            </div>
          )}
        </div>
        {!g.selecting && (
          <>
            {(!done || pick) && <Star on={task.top3 || (done && !!pick)} label={task.title} disabled={done} onChange={() => toggleTop3(task)} style={done ? { opacity: 1 } : undefined} />}
            <RowMenuButton title={task.title} onOpen={g.openMenu} />
          </>
        )}
      </SwipeRow>
    )
  }
  const check = g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : done && !bloom.checking ? <DoneCheck task={task} size={17} /> : <span style={{ marginTop: 2 }}><Checkbox label={task.title} checked={bloom.checking} bloom={task.top3} onChange={bloom.toggle} /></span>
  const tail = !g.selecting && (
    <>
      {!done && (
        <span className="kf-hit" onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--ink-hairline)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
          {task.top3 ? '★' : '☆'}
        </span>
      )}
      <RowMenuButton title={task.title} onOpen={g.openMenu} />
    </>
  )
  const title = { color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none' } as const
  return (
    <SwipeRow {...rowProps} contentStyle={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: hollow ? '10px 2px' : '11px 2px' }}>
      {check}
      <div onClick={open} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ fontSize: hollow ? 14.5 : 15, ...title }}><EmojiText text={task.title} /></div>
        {metaRow(projectName, dot, task.duration_min, <>{meta && <span>{meta.join(' · ')}</span>}{dueBadges}{!done && <LabelChips labels={task.labels} />}</>)}
      </div>
      {tail}
    </SwipeRow>
  )
}

// Kai 2026-07-21: "where are the checkboxes for the top 3 tasks and the entire task behaviour" —
// Up-next rows backed by a task now carry the task's own checkbox and strike through when done,
// same contract as the calendar block (only task-linked entries are completable; plain events
// have nothing to complete).
//
// Loop A (2026-09-26, Kai: "I can't right click what is in the up next section"): the rows were
// display-only. Now every row behaves like a task row — a click opens it (the task editor, or the
// calendar for a plain event; the calendar has no per-event deep link), right-click opens the row
// menu (./rowMenus). Polish F2a: the list is what's running and still to come today (upNext.ts);
// the page's minute clock (./useDay) flips "Now" on time. Desktop only — the phone has PhoneEventRow.
function EventRow({ event, task, border, now, rowSelection }: { event: CalendarEvent; task?: Task; border: boolean; now: Date; rowSelection: (t: Task) => RowSelection }) {
  const clock = upNextClock
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // Polish D (2026-09-26 audit): "Now" was the FIRST event of the day whatever the clock said —
  // a 10:00 meeting at 08:38. It now reads "Now" only while the event runs (upNext.ts).
  const label = upNextLabel(event.starts_at, event.ends_at, now)
  const labelColor = label.tone === 'now' ? 'var(--acc-terra)' : 'var(--ink-faint)'
  const done = task?.status === 'done'
  const openTask = useOpenTask()
  const open = () => (task ? openTask(task.id) : navigate('/calendar'))
  // The checkbox acts on its own; its click must not also open the row.
  const own = (e: React.MouseEvent) => e.stopPropagation()
  const check = task && (
    <span onClick={own} style={{ display: 'inline-flex', flex: 'none' }}>
      <Checkbox label={task.title} checked={!!done} size={15} onChange={() => toggleTaskWithUndo(task)} />
    </span>
  )
  const titleStyle = { textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--ink-hairline)' : 'var(--ink-body)' } as const
  const cells = (checkSlot: React.ReactNode) => (
    <>
      <span style={{ width: 88, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: labelColor }}>{label.text}</span>
      {checkSlot}
      <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, ...titleStyle }}><EmojiText text={event.title} /></div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{clock(event.starts_at)}–{clock(event.ends_at)}</span>
    </>
  )
  const rowStyle = { display: 'flex', gap: 16, padding: '9px 0', alignItems: 'center', cursor: 'pointer' } as const
  const borderTop = border ? '1px dashed var(--line-dashed)' : 'none'
  if (task) return <UpNextTaskRow event={event} task={task} open={open} rowStyle={rowStyle} borderTop={borderTop} sel={rowSelection(task)} check={check} cells={cells} />
  // A plain event only opens or goes. The menu is a sibling of the row, not a child: it portals to
  // <body>, but React events still bubble through the component tree, and a menu click reaching
  // the row would also open it.
  return (
    <>
      <div id={`upnext-${event.id}`} onClick={open} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }} title="Open in calendar" style={{ ...rowStyle, borderTop }}>
        {cells(null)}
      </div>
      {menu && <ContextMenu items={eventMenuItems(event, open)} position={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

// Loop A (Kai: "I can't right click what is in the up next section") → the one grammar: a
// task-backed block is a task row. Its Tomorrow moves the block to the same time tomorrow (a block
// keeps the time it was given), and its menu can also take it off the calendar.
function UpNextTaskRow({ event, task, open, rowStyle, borderTop, sel, check, cells }: { event: CalendarEvent; task: Task; open: () => void; rowStyle: React.CSSProperties; borderTop: string; sel: RowSelection; check: React.ReactNode; cells: (checkSlot: React.ReactNode) => React.ReactNode }) {
  const g = useTodayRow(task, { ...sel, ...blockGrammar(event) })
  return (
    <SwipeRow
      id={`upnext-${event.id}`}
      onClick={open}
      onContextMenu={g.onContextMenu}
      title="Open task"
      style={{ borderTop, background: sel.selected || g.menuOpen ? 'var(--select-bg)' : undefined }}
      contentStyle={rowStyle}
      {...g.swipeProps}
      overlay={g.menuNode}
    >
      {cells(g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : check)}
      {!g.selecting && <RowMenuButton title={task.title} onOpen={g.openMenu} />}
    </SwipeRow>
  )
}

function SlippingCard({ row, stage }: { row: SlippingRow; stage: string }) {
  const navigate = useNavigate()
  // A4 (2026-07-18 audit): the card body opens the slipping entity itself. Projects and
  // areas both live at /projects/:id (ProjectDetailPage renders either); a domain has no
  // detail page, so it lands on the garden overview.
  const to = row.entity_type === 'domain' ? '/projects' : `/projects/${row.entity_id}`
  return (
    <div
      // Motion 3e (WB-1): markReviewed() looks the card up by this id to play the exit
      // before the stack heals. Same scheme in the Weekly Review sweep.
      id={`slipping-${row.entity_type}:${row.entity_id}`}
      className="kf-lift"
      onClick={() => navigate(to)}
      role="link"
      // deviation(punch 15, 2026-07-26): export tilts this card rotate(0.4deg); dropped — the
      // sub-degree transform blurred the title + mono caption (see QuickCreate's 07-18 deviation).
      style={{ position: 'relative', border: '1px solid var(--line-goal)', background: 'var(--paper-goal)', padding: '12px 14px', boxShadow: 'var(--shadow-card)', borderRadius: 3, cursor: 'pointer' }}
    >
      {/* punch 20: the wisteria is the entity's real growth stage, computed by the caller. */}
      <img src={`${A}/wisteria/${stage}.png`} alt="" style={{ position: 'absolute', top: 8, right: 10, height: 56, opacity: 0.7 }} />
      <div style={{ fontSize: 13.5, color: 'var(--ink-body)', fontWeight: 500, paddingRight: 40 }}>{row.entity_name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)', marginTop: 5 }}>{Math.floor(row.days_since)} days untouched</div>
      <button onClick={(e) => { e.stopPropagation(); markReviewed(row) }} style={{ marginTop: 9, background: 'none', border: 'none', color: 'var(--acc-terra)', font: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>reviewed</button>
    </div>
  )
}

function RoutineRow({ routine, done, compact }: { routine: Routine; done: boolean; compact?: boolean }) {
  if (compact) {
    // Today Phone: the kit task row without star or ⋯ (a routine only checks off).
    return (
      <div className="tp-row" style={{ display: 'flex', alignItems: 'flex-start', minHeight: 'var(--row-min)', padding: 'var(--sp-1)', boxSizing: 'border-box' }}>
        <span className="tp-hit"><Checkbox label={routine.name} checked={done} onChange={() => toggleCompletion(routine)} /></span>
        <div className="tp-body" style={{ cursor: 'default' }}>
          <div className={`tp-title${done ? ' is-done' : ''}`}>{routine.name}</div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <Checkbox label={routine.name} checked={done} size={16} onChange={() => toggleCompletion(routine)} />
      <span style={{ flex: 1, fontSize: 13, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none' }}>{routine.name}</span>
    </div>
  )
}

// Loop A — the quiet fold (DAILY-CYCLE.md: "still there, not competing"). Collapsed by default,
// remembered per device; SectionLabel's look, as a button. On a phone (Today Phone 2n): "More for
// today · N", a dashed rule and a chevron; its lists sit under mono sub-headers (ruling 7).
const MORE_OPEN_KEY = 'kf.today.more-open'

// Kai 2026-10-07 ("More for today · 320", mostly overdue): the overdue pile is its own fold, folded
// by default, its count and Replan all ▾ on the header (`action`, beside the toggle).
const OVERDUE_OPEN_KEY = 'kf.today.overdue-open'

function MoreForToday({ summary, phone, label = 'More for today', storageKey = MORE_OPEN_KEY, action, children }: { summary: string; phone?: boolean; label?: string; storageKey?: string; action?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })
  function toggle() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* storage off: this visit only */ }
  }
  if (phone) {
    return (
      <section>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" aria-expanded={open} onClick={toggle} className="tp-fold" style={{ flex: 1, minWidth: 0 }}>
            <span className="tp-label">{label} · {summary}</span>
            <span className="tp-rule" />
            <Icon name="chevdown" size={20} />
          </button>
          {action && <span style={{ flex: 'none', marginTop: 'var(--sp-2)', paddingRight: 'var(--gutter-phone)' }}>{action}</span>}
        </div>
        {open && <div style={{ paddingTop: 4 }}>{children}</div>}
      </section>
    )
  }
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" aria-expanded={open} onClick={toggle} className="kf-hit" style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: '6px 0', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}{summary && <span style={{ color: 'var(--ink-hairline)' }}> · {summary}</span>}
          </span>
          <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          <span aria-hidden style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 160ms var(--ease-out)' }}>▸</span>
        </button>
        {action}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 12 }}>{children}</div>}
    </section>
  )
}

function Empty({ line }: { line: string }) {
  return <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', padding: '8px 2px' }}>{line}</div>
}
