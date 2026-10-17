import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTasks, completeTask, completeTaskWithUndo, undoCompletion, reopenTaskWithUndo, toggleTaskWithUndo, toggleTop3, toggleTop3ManyWithUndo, duplicateTasksWithUndo, planWithUndo, moveInTop3Order, spreadWithUndo, moveTasksWithUndo, rescheduleTasksWithUndo, somedayTasksWithUndo, snoozeTasksWithUndo, deleteTasksWithUndo, moveToTomorrowWithUndo } from '../tasks/api'
import { PlanMenu } from '../tasks/PlanMenu'
import { isOverdue, todayFor } from '../tasks/planMath'
import { DragRow, useDropSpot, type DragLoad, type Spot } from '../../components/drag'
import { checkAction } from '../tasks/completion'
import { buildListBindings } from '../tasks/listShortcuts'
import { useListVerbs } from '../tasks/useListVerbs'
import { formatDuration } from '../tasks/taskDisplay'
import { todayListTasks } from '../tasks/grouping'
import { backFromSnooze } from '../tasks/snooze'
import { sortByOrder } from '../tasks/manualOrder'
import { cachedTask, moveInListWithUndo } from '../tasks/api'
import { nestOut } from '../tasks/subtasks'
import { SubtaskAddButton, SubtaskCount, SubtaskNest, hasOpenSubtasks, useNestOpen } from '../tasks/SubtaskNest'
import { cairoDateKey, scheduleNextWeek, scheduleToday, zoneDateKey } from '../../lib/dateShortcuts'
import { slotLabel, useCalendarEvents } from '../calendar/api'
import { cairoTimeKey } from '../calendar/eventTime'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { useAreas } from '../areas/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { routinesForToday, todayTally } from '../routines/streaks'
import { groupRoutinesByTime, splitByTimeOfDay } from '../routines/routineGrouping'
import { useSlipping, markReviewed } from '../slipping/api'
import { usePendingInboxItems } from '../inbox/api'
import { usePeople, getDaysUntilBirthday } from '../people/api'
import { useReviewEventsThisWeek, useRitualStepsToday, type RitualKind } from '../rituals/api'
import { loopNow } from '../rituals/loopDay'
import { startOfWeek } from '../rituals/reviewWeek'
import { useRitualPins } from '../rituals/ritualPins'
import { PLAN_STEPS, SHUT_STEPS } from '../rituals/ritualLogic'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import { useResurfacePick } from '../resurfacing/api'
import { useTimeEntries } from '../focus/api'
import { legacyGoalId } from './goalStore'
import { dayTop3 } from './top3Order'
import { CAPTURE_INPUT_ID, openCapture } from '../command-bar/commandBarStore'
import { SectionLabel, Checkbox, Button, Star, KeyCombo } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { isTypingTarget, useListKeys } from '../../components/useListKeys'
import { useLingering } from '../../components/syncQueue'
import { BulkBar } from '../../components/BulkBar'
import { EmptyState, ErrorCard, OfflineChip, Skeleton } from '../../components/States'
import { MovePicker } from '../tasks/MovePicker'
import { LabelPicker } from '../tasks/LabelPicker'
import { placeKey, type MoveTarget } from '../tasks/move'
import { ContextMenu } from '../../components/ContextMenu'
import { useEscapeStack } from '../../lib/overlayStack'
import { rowAnchor } from '../../lib/rowAnchor'
import { toastUndo } from '../../lib/undo'
import { useOnline } from '../../lib/useOnline'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import { wisteriaStage } from '../../lib/growthStages'
import { claimDayComplete, DAY_DONE_DWELL_MS } from './dayComplete'
import { Fireflies } from './NightGarden'
import { isEvening, ritualFinished, ritualProgress, SHUTDOWN_FROM, type RitualState } from './dayPhase'
import { isInProgress, upNextEvents } from './upNext'
import { blockTomorrowHint, eventMenuItems, moveBlockToTomorrow, unscheduleWithUndo } from './rowMenus'
import { RowMenuButton, SelectCircle, SwipeRow } from '../tasks/SwipeRow'
import { LabelChips } from '../tasks/TaskRow'
import { useRowGrammar, type RowGrammarOptions } from '../tasks/useRowGrammar'
import type { BulkActions } from '../tasks/TaskMenu'
import { useOpenTask } from '../tasks/openTask'
import { DeskRitualHead, RitualCard, ReviewCard, type CardHead } from './DayCard'
import { clearFirstTodayHint, firstTodayHintPending, FIRST_TODAY_HINT } from './firstTodayHint'
import { useAuth } from '../auth/AuthProvider'
import { useDay } from './useDay'
import { useStarEvents } from './api'
import { useStartFocus } from './startFocus'
import { useFocusNow } from './focusNow'
import { JUST_DONE_MS, nowBlock, nowState, type NowState } from './nowCard'
import { blockMeta, blockOf, dayCounts, eventMetas, focusedToday, foldOpen, overCapacity, projectTag, remainingWork, reviewDue, ribbonPct, ribbonSpan, span, top3Planned, topCard, upNextItems, workloadLine, RIBBON_FROM_MIN, RIBBON_TO_MIN, type WorkloadInput } from './todayLayout'
import { dayOfJourney, firstCreatedAt } from './journey'
import { filterByList, taskDayDiff } from '../tasks/grouping'
import { flushOutbox, useOutboxMarks } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import type { Task, CalendarEvent, Project, Routine, SlippingRow } from '../../lib/types'
import type { ContextMenuItem } from '../../components/ContextMenu'
import './today.css'
import { appZone } from '../../lib/appZone'
import { weekendDays } from '../../lib/weekend'

// The 2a capture pill's mic: the voice sheet, loaded on first use (as the tray does).
const VoiceCaptureSheet = lazy(() => import('../capture/VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

// ── Today — pixel contract: Today.dc.html 2a (desktop, "reviewed pass", 2026-09-28) + States.dc.html
// 1a/1b (empty/done), and on a phone (< 768px) Today Phone.dc.html 2a–2n with the 2026-09-28
// rulings (design-export/SCREENS-2026-09-28.md §Today). The Now card / NOW slip states are MK Now
// Card.dc.html (./nowCard), the phone header line MK Workload. The shell owns the sidebar/topbar/
// tab-bar; this is the main content, wired to real data. What goes where — the Now card, Up next,
// the folds, the header line — is ./todayLayout + ./nowCard, shared by both layouts: each item
// shows once. Where 2a and a later Kai ruling disagree the ruling holds (docs/log fix-today handoff). ──

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
  const resurfacePick = useResurfacePick()
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
    // The Overdue widget's Replan all: the overdue fold's Plan list, mid-screen.
    if (ritualParam === 'replan') setReplanAt({ x: window.innerWidth / 2, y: window.innerHeight / 3 })
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
  const doneToday = tasks.filter((t) => isToday(t.completed_at)).length
  const nothingPlanned = !tasksPending && open.length === 0 && doneToday === 0

  // The Now card / NOW slip (MK Now Card, ./nowCard): running · over · paused · just done · next ·
  // free. It shares the top slot with the ritual card (./todayLayout topCard): something under way
  // wins, Next / Free give way to Plan / Shut down / Day closed.
  const focus = useFocusNow()
  // Just done needs the wall clock (a 4s window), not the minute clock.
  const nowS = nowState({ events, taskOf: (id) => taskById.get(id), now, clockMs: Date.now(), focus })
  const [, rerender] = useState(0)
  const doneUntil = nowS?.kind === 'done' ? nowS.at.getTime() + JUST_DONE_MS : null
  useEffect(() => {
    if (doneUntil == null) return
    const t = setTimeout(() => rerender((n) => n + 1), Math.max(0, doneUntil - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [doneUntil])
  const empty = nothingPlanned && !eventsPending && upNextEvents(events, now).length === 0
  const card = tasksPending ? null : topCard(day.state.phase, nowS?.kind ?? null, empty)
  // Desktop (Today 2a): the card's ribbon and next two are the day's Up next, so the card stays all
  // day — with no head while nothing runs ('idle', Kai's "no card during the day"). An empty day
  // keeps only the Plan / Shut down / Day closed moments, as the Day card always did.
  const deskCard = tasksPending ? null : card ?? (!empty ? 'idle' : day.state.phase === 'now' ? null : day.state.phase)
  const topSlot = isMobile ? card : deskCard
  const headBlock = topSlot === 'slip' ? nowBlock(nowS) : null
  const headTask = topSlot === 'slip' && nowS && 'task' in nowS ? nowS.task : undefined
  // Each item once (./todayLayout, rulings 3–4): Up next skips the card's block and the Top 3's.
  const upNext = upNextItems(events, now, headBlock, top3Ids)
  // Desktop lists the next two under the ribbon (2a); the rest are on the ribbon, and their tasks
  // stay rows in Also open — every task shows as a row somewhere (DAILY-CYCLE).
  const upNextShown = isMobile ? upNext : upNext.slice(0, 2)
  const upNextTasks = upNextShown.flatMap((e) => (e.task_id && taskById.has(e.task_id) ? [taskById.get(e.task_id)!] : []))
  // By date, or the manual order ⌘/Ctrl+↑/↓ gave a row (p7e A22, ../tasks/manualOrder).
  // Snooze: one back today leads the list (its "Back from snooze" marker), ahead of the date order.
  const backFirst = (a: Task, b: Task) => Number(backFromSnooze(b, now)) - Number(backFromSnooze(a, now))
  const listed = sortByOrder(foldOpen(visible, top3Ids, headBlock ? [headBlock, ...upNextShown] : upNextShown)).sort(doneAfterOpen).sort(backFirst)
  // Subtasks A (Kai 2026-10-16): a subtask whose parent is a row on this page (Top 3 or the lists — a parent
  // finished today too, struck, while it has open ones) sits nested under it, not in a list of its own; one
  // whose parent isn't here stays a row, "↳ parent". A timed one also shows by itself in Up next (C).
  const drawnParents = new Set([...top3InOrder, ...listed].filter((t) => !t.parent_task_id).map((t) => t.id))
  const allOpen = nestOut(listed, drawnParents)
  // Kai 2026-10-07 ("More for today · 320", mostly overdue): the overdue ones get their own fold with
  // Replan all ▾; More for today keeps the rest. Oldest first (Today's list order).
  const overdueOpen = allOpen.filter((t) => !t.completed_at && isOverdue(t, now) && !backFromSnooze(t, now))
  const overdueIds = new Set(overdueOpen.map((t) => t.id))
  const restOpen = allOpen.filter((t) => !overdueIds.has(t.id))
  const openCount = restOpen.filter((t) => !t.completed_at).length
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
  const selectable = [...new Map([...top3InOrder, ...(headTask ? [headTask] : []), ...upNextTasks, ...allOpen].map((t) => [t.id, t] as const)).values()].filter((t) => !t.completed_at)
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
  // The one task-row grammar (features/tasks/SwipeRow + TaskMenu): each row's selection props, and
  // with several rows selected the ⋯ / right-click menu acts on all of them (as on Tasks).
  const rowSelection = (t: Task): RowSelection => ({ selected: selected.has(t.id), onToggleSelect: () => toggleSelected(t.id), selecting: selected.size > 0, bulk })
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
  function bulkTop3() { toggleTop3ManyWithUndo(selectedTasks); clearSelection() }
  function bulkDuplicate() { duplicateTasksWithUndo(selectedTasks); clearSelection() }
  function bulkSnooze(iso: string) { snoozeTasksWithUndo(selectedTasks, iso); clearSelection() }
  // Kai 2026-10-12: a row's menu ignored the selection — it gets the page's bulk handlers.
  const bulk: BulkActions | undefined = selected.size > 1
    ? { count: selected.size, onTomorrow: bulkTomorrow, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete, onTop3: bulkTop3, onDuplicate: bulkDuplicate, onSnooze: bulkSnooze }
    : undefined

  // F3 (punch 12/22/29): Today's list keyboard was an empty bindings array — dead keys on the
  // app's primary surface. Wired to the same handlers its context menu already uses.
  // WB-4 (punch 12): s/p were still unwired here while the `?` cheatsheet advertised them for
  // "Task list" — same row-menu pattern as TasksPage now, so both surfaces match the overlay.
  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  const kbProjectTask = kbProjectId ? selectable.find((t) => t.id === kbProjectId) : null
  // L (Overlays.dc.html "Label picker · keyboard L"), as on Tasks: the focused row, or every selected one.
  const [kbLabelIds, setKbLabelIds] = useState<string[] | null>(null)
  const openTask = useOpenTask()
  const navigate = useNavigate()
  // P7e A18: D Plan…, ! Priority, = Duration, S Someday, H goal, F focus; the bulk bar's Priority / Labels.
  const verbs = useListVerbs(bulk)
  const listBindings = [...buildListBindings({
    ...verbs.actions,
    complete: (t) => completeTaskWithUndo(t),
    open: (t) => openTask(t.id),
    today: (t) => planWithUndo(t, todayFor(t)), // the Plan menu's Today: keeps the task's time
    tomorrow: (t) => moveToTomorrowWithUndo([t]),
    nextWeek: (t) => planWithUndo(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    labels: (t) => setKbLabelIds([t.id]),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => deleteTasksWithUndo([t]),
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
  }), { keys: NOTEBOOK_KEY, label: 'Notebook page', run: () => navigate(NOTEBOOK_PATH) }]
  const { focusedId } = useListKeys(selectable, listBindings, {
    active: !morningOpen && !eveningOpen && !bulkSchedulePos && !bulkProjectPos && !kbProjectId && !kbLabelIds && !replanAt && !verbs.picking,
    sectionLabel: 'Lists',
    onSelectAll: () => setSelected(new Set(selectable.map((t) => t.id))),
    selected: selectedTasks,
    // ⌘/Ctrl+↑/↓ (p7e A22): a Top 3 row moves in the Top 3 (as Alt+↑/↓); the rest within the overdue
    // fold or More for today. Up next follows the calendar, so it has no order to change.
    reorder: (rows, dir) => {
      const pick = rows.length === 1 ? top3InOrder.find((t) => t.id === rows[0].id && !t.completed_at) : undefined
      if (pick) moveInTop3Order(pick, top3InOrder.indexOf(pick) + dir)
      else moveInListWithUndo([overdueOpen, restOpen.filter((t) => !t.completed_at)], rows, dir)
    },
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
  // The Notebook page (Kai's 2026-10-03 brainstorm): Shift+N on Today. N is New task everywhere — one
  // meaning per key (conductor 2026-10-13) — so this never takes a plain n. Listed in the page's own
  // cheatsheet section (NOTEBOOK_KEY in listBindings); runs at capture so the list's copy can't fire too.
  useEffect(() => {
    if (!keysOn) return
    function onKey(e: KeyboardEvent) {
      // Layout-proof like the shell's keys: on an Arabic keyboard Shift+N arrives as another key, code 'KeyN'.
      const n = /^[\x20-\x7e]$/.test(e.key) ? e.key.toLowerCase() === 'n' : e.code === 'KeyN'
      if (!n || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      navigate(NOTEBOOK_PATH)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [keysOn, navigate])

  // Polish D (2026-09-26 audit): the rail counted and listed EVERY active routine — a Sunday-only
  // "Plan the week" on a Saturday, "1/5" where Routines said "1 of 3". The count and the rows now
  // both come from the Routines page's own definition of today (streaks.ts todayTally /
  // routinesForToday: scheduled today, or already checked off today), so the two pages agree.
  const routineGroups = groupRoutinesByTime(routinesForToday(routines, completions)).filter((g) => g.items.length > 0)
  // Kai 2026-10-03: the phone shows the routines for now (+ Anytime); other times fold into one line each.
  const routineSplit = splitByTimeOfDay(routineGroups, Number(cairoTimeKey(now).slice(0, 2)))
  const [openRoutineGroups, setOpenRoutineGroups] = useState<string[]>([])
  // The user's day (lib/appZone), like the hour above — not the device's.
  const todayKey = zoneDateKey(now)
  const doneKeys = useMemo(() => new Set(completions.filter((c) => c.completed_on === todayKey).map((c) => c.routine_id)), [completions, todayKey])
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
  // DAILY-CYCLE step 5, the weekly review: prompted on its day (the first day of the user's
  // weekend) until this week's review is closed (./todayLayout reviewDue). The Weekly review's own
  // read of the week, so its Close and Undo reach this prompt without a refetch.
  const weekend = weekendDays()
  const { data: reviewEvents = [] } = useReviewEventsThisWeek(startOfWeek(loopNow(now), weekend).toISOString())
  const reviewToday = reviewDue(now, weekend, reviewEvents)

  // Ported from the retired Terrarium.tsx — day count since the earliest record, for the phone
  // header's "Day N" (Today Phone ruling 1). On a desktop it's the sidebar foot's "day N" (2a, AppLayout).
  const firstRecord = useMemo(() => firstCreatedAt(tasks, pendingInbox, projects, routines), [tasks, pendingInbox, projects, routines])
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
  // "2 of 6 done" — today's own work (./todayLayout dayCounts): 2a's summary, the phone's hairline.
  const counts = dayCounts(tasks, now)

  const resurfacing = !!resurfacePick
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
        <SectionLabel style={{ marginBottom: 10 }}>A moment coming</SectionLabel>
        <div
          style={{
            position: 'relative',
            background: 'var(--paper-parchment)',
            border: '1px solid var(--line-card)',
            borderRadius: 'var(--radius-card)',
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
            style={{ fontSize: '12px', color: 'var(--ink-faint)', cursor: 'pointer', flex: 'none', paddingLeft: 2 }}
          >
            ✕
          </span>
        </div>
      </div>
    )
  })

  // The overdue fold's header action: every overdue task through the Plan list (+ Spread into free slots).
  // D13 wants the tonal button here, but this header sits on the bare canvas, where tonal is 4.17:1
  // by day (AA needs 4.5): it stays the B secondary until Kai picks (bj-final handoff, 2026-10-16).
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
          onTop3={bulkTop3}
          onPriority={(e) => verbs.open(selectedTasks, 'priority', { x: e.clientX, y: e.clientY })}
          onLabels={(e) => verbs.open(selectedTasks, 'labels', { x: e.clientX, y: e.clientY })}
          onDuplicate={bulkDuplicate}
          onSnooze={(e) => verbs.open(selectedTasks, 'snooze', { x: e.clientX, y: e.clientY })}
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
      {kbLabelIds && <LabelPicker taskIds={kbLabelIds} position={rowAnchor('task-', kbLabelIds[0])} onClose={() => setKbLabelIds(null)} />}
      {verbs.node}

      {morningOpen && <MorningRitual onClose={() => closeRitual('morning')} />}
      {eveningOpen && <EveningRitual onClose={() => closeRitual('evening')} />}
    </>
  )

  // ── Phone: Today Phone.dc.html 2a–2n. Header line → NOW slip or ritual card → Top 3 → Up next
  // → Routines → the quiet fold. Four section labels, each item once. ──
  if (isMobile) {
    const tended = day.tally.picked > 0 && day.tally.done >= day.tally.picked
    const metas = eventMetas(upNext, now)
    // The desktop's: a held task reads "in Code block · 10:00" here too (slots-ux).
    const blockMetaOf = (t: Task) => blockMetaFor(t, events, now)
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
    // MK Workload: amber + "2H OVER" when the plan doesn't fit the working day (during the day only).
    const over = day.state.phase === 'now' && !empty ? overCapacity(top3InOrder.filter((t) => !t.completed_at), events, now, doneTaskIds) : 0
    return (
      <div className="tp">
        <Fireflies phone />
        <PhoneBar title={dateLabelShort} morning={day.morning} evening={day.evening} onOpenRitual={openRitual} />
        {tasksPending ? (
          <div style={{ padding: '4px 16px 12px' }}><span className="tp-sk" style={{ width: '64%' }} /></div>
        ) : (
          <PhoneSummary workload={workload} now={now} online={online} syncing={fetchingSlowly} over={over} counts={counts} />
        )}

        {card === 'slip' && nowS && <NowSlip state={nowS} sel={headTask ? rowSelection(headTask) : {}} />}
        {card && card !== 'slip' && <RitualCard kind={card} day={day} inboxCount={pendingInbox.length} overdueCount={overdueCount} sweepCount={open.length} onOpenRitual={openRitual} />}
        {card && <FirstTodayHint />}
        {!tasksPending && reviewToday && <ReviewCard />}
        {birthdayCards.length > 0 && <div style={{ padding: '8px 16px 0' }}>{birthdayCards}</div>}

        {empty ? (
          // Ruling 8: one secondary action that opens capture; the terra capture button stays the CTA.
          <div style={{ paddingTop: 64 }}>
            <EmptyState image={`${A}/clover/seedling.png`} line="Nothing here yet. A day starts with three things." action={{ label: 'Add your first three things', onClick: openCapture }} variant="secondary" />
          </div>
        ) : (
          <>
            <section data-tour="top3" style={{ position: 'relative' }}>
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
                      <span className="tp-note">{day.tally.picked === 3 ? 'All three tended.' : 'All tended.'} The rest is extra ✿</span>
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

  // ── Desktop: Today.dc.html 2a ("Desktop — reviewed pass"). One date and a one-line summary, the
  // typed capture pill → the Now card (the moment, the 8–20 ribbon, the next two) → Today's three,
  // Overdue, Also open | the rail: Rituals, Routines, Worth a look. The terrarium band is gone (2a:
  // "replaces the decorative terrarium band"); its counts live in the summary and the sidebar. ──
  const nextUp = upNextEvents(events, now).find((e) => new Date(e.starts_at).getTime() > now.getTime() && !(e.task_id && doneTaskIds.has(e.task_id)))
  const header = (
    <div className="td-head">
      <div>
        <h1 className="td-date">{dateLabel}</h1>
        {!tasksPending && (
          <div className="td-sum">
            {counts.total > 0 && `${counts.done} of ${counts.total} done`}
            {counts.total > 0 && nextUp && ' · '}
            {nextUp && <>next up <span className="td-ink"><EmojiText text={nextUp.title} /> at {cairoTimeKey(new Date(nextUp.starts_at))}</span></>}
            {counts.total === 0 && !nextUp && 'A fresh page'}
          </div>
        )}
      </div>
      <div className="td-head-actions">
        <NotebookButton />
        <AddTaskPill />
      </div>
    </div>
  )

  // Loop A (2026-09-26 daily cycle, DAILY-CYCLE.md §Today): the next move leads; the lists that don't
  // drive it stay quiet — 2a's "Also open · N" shows three rows and folds the rest behind "Show N
  // more" (the old "More for today" fold, remembered per device), the overdue pile its own fold.
  const showLists = !tasksPending && !nothingPlanned && !allDone
  const openRow = (t: Task, i: number) => <TaskRow key={t.id} task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} hollow border={i > 0} {...rowSelection(t)} highlighted={t.id === focusedId} />
  // Punch 2: with no routines this was a heading reading "· 0/0" above nothing.
  // The section now either carries content or offers the one designed way in.
  const routinesSection = (
    <section>
      <SectionLabel style={{ marginBottom: 10 }}>{routinesTotal > 0 ? `Routines · ${routinesDone}/${routinesTotal}` : 'Routines'}</SectionLabel>
      {routinesTotal === 0 && (
        <Link to="/routines" className="tp-note" style={{ display: 'block', textDecoration: 'none' }}>
          {/* Polish D: routines exist but every one rests today — say so, don't invite planting. */}
          {hasActiveRoutines ? 'Nothing on repeat today ✿' : 'Nothing on repeat yet — plant one ✿'}
        </Link>
      )}
      {routineGroups.map((g) => (
        <div key={g.key}>
          <div className="td-rail-sub">{g.label}</div>
          {g.items.map((r) => (
            <RoutineRow key={r.id} routine={r} done={doneKeys.has(r.id)} />
          ))}
        </div>
      ))}
    </section>
  )
  // 2a rule 7: a nudge never flags what the screen already treats as a priority — no slipping card
  // for a project one of today's open picks belongs to.
  const pickProjects = new Set(top3InOrder.filter((t) => !t.completed_at && t.project_id).map((t) => t.project_id))
  const nudges = slipping.filter((r) => !(r.entity_type === 'project' && pickProjects.has(r.entity_id)))
  const stageOf = (row: SlippingRow) => {
    const project = row.entity_type === 'project' ? projects.find((p) => p.id === row.entity_id) : undefined
    return wisteriaStage(project ? weightedMilestonePct(project, tasks) : 0)
  }
  const inProgressIds = new Set([...(nowS?.kind === 'running' && nowS.task ? [nowS.task.id] : []), ...(focus?.running ? [focus.taskId] : [])])

  return (
    // Kai 2026-10-03: the shared page width, left-aligned like Tasks (it was 1010 centred, and
    // shrank to its content inside the flex route — index.css .kf-route > *).
    <div className="td" style={{ maxWidth: 'var(--kf-page-max)' }}>
      <Fireflies phone={false} />
      {header}

      {deskCard && (
        <NowCard
          slot={deskCard}
          state={nowS}
          ritual={deskCard === 'slip' || deskCard === 'idle' ? undefined : <DeskRitualHead kind={deskCard} day={day} inboxCount={pendingInbox.length} overdueCount={overdueCount} onOpenRitual={openRitual} />}
          events={events}
          now={now}
          next={upNextShown}
          taskById={taskById}
          top3Ids={top3Ids}
          focus={focus}
          firstPick={top3InOrder.find((t) => !t.completed_at)}
          rowSelection={rowSelection}
        />
      )}
      {!tasksPending && deskCard && <FirstTodayHint style={{ padding: '0 0 0 24px', marginTop: -14 }} />}

      {/* The side column grows with the page too, from 264 to 340 (Kai 2026-10-03). */}
      <div className="td-grid">
        <div className="kf-bulk-anchor td-main">
          {birthdayCards}
          <section data-tour="top3" className={motion ? 'kf-stagger-item' : undefined} style={{ position: 'relative', ...(motion ? staggerDelay(0) : null) }}>
            {celebrate && <DayCompleteBurst />}
            {(() => {
              const planned = top3Planned(top3InOrder, events, now)
              return <SectionLabel action={planned > 0 ? <span className="td-label-note">{span(planned)} planned</span> : undefined} style={{ marginBottom: 16 }}>Today's three</SectionLabel>
            })()}
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
              <>
                {goal && (
                  <Top3Slot key={goal.id} task={goal} index={0}>
                    <GoalCard task={goal} projectName={projectName.get(goal.project_id ?? '')} dot={projectDot(goal.project_id)} meta={blockMetaFor(goal, events, now)} inProgress={inProgressIds.has(goal.id)} place={placeOf(goal)} {...rowSelection(goal)} />
                  </Top3Slot>
                )}
                {restTop3.map((t, i) => (
                  <Top3Slot key={t.id} task={t} index={i + 1}>
                    <TaskRow task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} border={i < restTop3.length - 1} pick meta={blockMetaFor(t, events, now)} inProgress={inProgressIds.has(t.id)} place={placeOf(t)} {...rowSelection(t)} highlighted={t.id === focusedId} />
                  </Top3Slot>
                ))}
                {top3.length === 0 && <Empty line="Nothing starred for today yet." />}
              </>
            )}
          </section>

          {showLists && overdueOpen.length > 0 && (
            <MoreForToday label="Overdue" summary={String(overdueOpen.length)} storageKey={OVERDUE_OPEN_KEY} action={replanAll}>
              <section>
                <div className="kf-dim">{overdueOpen.slice(0, ALL_OPEN_CAP).map(openRow)}</div>
                {overdueOpen.length > ALL_OPEN_CAP && (
                  <Link to="/tasks?list=overdue" className="td-more">View all →</Link>
                )}
              </section>
            </MoreForToday>
          )}
          {showLists && restOpen.length > 0 && <AlsoOpen count={openCount} rows={restOpen} render={openRow} motion={motion} />}
        </div>

        <div className="td-rail">
          <RitualsRail day={day} now={now} onOpen={openRitual} review={reviewToday} />
          {routinesSection}
          <WorthALook rows={nudges} resurfacing={resurfacing} stageOf={stageOf} />
        </div>
      </div>

      {overlays}
    </div>
  )
}

/** The Notebook page (another builder's route; Kai's analog-journal export). */
const NOTEBOOK_PATH = '/notebook?day=today'
/** Its key on Today, as the cheatsheet draws it (two caps). */
const NOTEBOOK_KEY = ['⇧', 'N']

/** A Top 3 task's block today, as its row's meta ("13:30–15:00 · 1H30M") — Up next skips it. */
function blockMetaFor(t: Task, events: CalendarEvent[], now: Date): string[] | undefined {
  const b = blockOf(t.id, events, now)
  if (b) return blockMeta(b, now)
  // In a Time slot (0073) the task has no block of its own: "in Code block · 10:00".
  const slot = slotLabel(t, now)
  return slot ? [slot] : undefined
}

/** Days past its due date on the user's calendar (lib/appZone) — 0 = due today, null = no date. */
function overdueDays(task: Task): number | null {
  if (!task.due_at) return null
  const diff = taskDayDiff({ due_at: task.due_at, scheduled_start: null }, new Date())
  return diff === null ? null : -diff
}

/** Today 2a's metadata: sans 12.5 in --ink-muted (rule 4), a 6px project dot, "30m", "in progress"
 * in terra. The block's own meta keeps its order ("13:30–15:00 · starts in 20m"). */
function metaRow(projectName: string | undefined, dot: string, duration: number | null, extra?: React.ReactNode) {
  return (
    <div className="td-meta">
      {projectName && (
        <span>
          <span className="td-dot" style={{ background: dot }} />
          {projectName}
        </span>
      )}
      {duration != null && <span>{formatDuration(duration).toLowerCase()}</span>}
      {extra}
    </div>
  )
}

/** A block's meta on a desktop row: "Now" reads "in progress" (2a), lengths in lower case. */
const deskBlockMeta = (meta: string[] | undefined, inProgress: boolean) => (
  <>
    {/* 2a's lower-case durations ("1h30m"); a slot's line keeps its name ("in Code block💻 · 10:00" —
        the only meta that starts "in "; blockMeta's own read "starts in …"). */}
    {meta?.filter((m) => m !== 'Now').map((m) => <span key={m}>{m.startsWith('in ') ? m : m.toLowerCase()}</span>)}
    {(inProgress || meta?.includes('Now')) && <span className="td-terra">in progress</span>}
  </>
)

// ── Desktop chrome (Today.dc.html 2a) ──

/** 2a header: "+ Add a task…" with the capture keycap and the mic inside (rule 6: capture is
 * type-first). The field opens the capture bar; the mic, the voice sheet. The keycap reads N, as 2a
 * draws it: N is New task everywhere (the Notebook page is Shift+N). */
function AddTaskPill() {
  const [voice, setVoice] = useState(false)
  return (
    <div className="td-pill">
      <button type="button" className="td-pill-field" data-tour="command-bar" onClick={openCapture} title="Capture — type, or use the mic to talk (N)">
        <Icon name="plus" size={18} />
        <span className="td-pill-text">Add a task…</span>
        <KeyCombo keys={['N']} size="sm" />
      </button>
      <button type="button" className="td-pill-mic" aria-label="Voice capture" title="Voice capture" onClick={() => setVoice(true)}>
        <Icon name="mic" size={16} strokeWidth={2} />
      </button>
      {voice && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet open onClose={() => setVoice(false)} />
        </Suspense>
      )}
    </div>
  )
}

/** The Notebook page's quiet way in on desktop (an icon button beside capture; Shift+N on Today). */
function NotebookButton() {
  return (
    <Link to={NOTEBOOK_PATH} className="td-icon-btn" aria-label="Notebook page" title="Notebook page (Shift+N)">
      <Icon name="journal" size={20} />
    </Link>
  )
}

/** "48 min left" under an hour, "1h 20m" past it. */
const minsText = (n: number) => (n < 60 ? `${n} min` : span(n))

/** Today 2a's Now card: the moment (MK Now Card states, ./nowCard) or, at a ritual moment, the Day
 * card's next move (./DayCard DeskRitualHead); under it the 8 AM–8 PM ribbon and the next two blocks
 * (2a: it "replaces both the decorative terrarium band and the Up next list"). No Done / Open
 * buttons (Kai 2026-09-27) — Start focus is the one action; a task the card stands for keeps the
 * task-row grammar (click opens, right-click menu, ⌃click selects) and, when it isn't a Top 3 row
 * below, its checkbox. */
function NowCard({ slot, state: s, ritual, events, now, next, taskById, top3Ids, focus, firstPick, rowSelection }: {
  /** 'slip' = something under way (./nowCard); 'idle' = nothing runs: no head, ribbon + next two. */
  slot: 'slip' | 'idle' | 'plan' | 'shutdown' | 'closed'
  state: NowState<CalendarEvent, Task> | null
  /** The ritual moment's head (DeskRitualHead) — set for every slot but 'slip'. */
  ritual?: React.ReactNode
  events: CalendarEvent[]
  now: Date
  next: CalendarEvent[]
  taskById: Map<string, Task>
  top3Ids: ReadonlySet<string>
  focus: ReturnType<typeof useFocusNow>
  firstPick?: Task
  rowSelection: (t: Task) => RowSelection
}) {
  const moment = slot === 'slip' ? s : null
  const block = nowBlock(moment)
  const ritualSlot = slot !== 'slip' && slot !== 'idle'
  return (
    <section className="td-now" aria-label="Your day" data-now={moment ? moment.kind : slot} data-day-card={ritualSlot || undefined} data-tour={ritualSlot ? 'plan' : undefined}>
      {moment ? <MomentHead state={moment} taskById={taskById} top3Ids={top3Ids} focus={focus} firstPick={firstPick} rowSelection={rowSelection} /> : ritual}
      <Ribbon events={events} now={now} head={block} taskById={taskById} />
      <div className="td-next">
        {next.length === 0 ? (
          <span>Nothing else on the calendar today</span>
        ) : (
          next.map((e) => {
            const t = e.task_id ? taskById.get(e.task_id) : undefined
            return t ? <NextTaskItem key={e.id} event={e} task={t} sel={rowSelection(t)} /> : <NextEventItem key={e.id} event={e} />
          })
        )}
        <Link to="/calendar" className="td-cal-link">Calendar →</Link>
      </div>
    </section>
  )
}

/** The Now card's head row for the moment's state (caption · title · sub, one action). */
function MomentHead({ state: s, taskById, top3Ids, focus, firstPick, rowSelection }: { state: NowState<CalendarEvent, Task>; taskById: Map<string, Task>; top3Ids: ReadonlySet<string>; focus: ReturnType<typeof useFocusNow>; firstPick?: Task; rowSelection: (t: Task) => RowSelection }) {
  const startFocus = useStartFocus()
  const navigate = useNavigate()
  const time = (iso: string | Date) => cairoTimeKey(new Date(iso))
  const block = nowBlock(s)
  const task = 'task' in s ? s.task : undefined
  const focusTask = focus ? taskById.get(focus.taskId) : undefined
  // Start focus: the card's task; for a time block with none, the task in focus or the first open
  // pick (2a: "Deep work — Forecasting · working on <the pick>"); a meeting has nothing to focus on.
  const target = task ?? (block && block.type !== 'event' ? focusTask ?? firstPick : undefined)
  const working = focus?.running && focusTask && focusTask.id !== task?.id ? <> · working on <span className="td-ink"><EmojiText text={focusTask.title} /></span></> : null
  const focusBtn = (label = 'Start focus') => target && <Button type="button" variant="secondary" onClick={() => startFocus(target)}>{label}</Button>
  let head: CardHead
  switch (s.kind) {
    case 'running':
      head = { caption: `Now · ${time(s.block.starts_at)}–${time(s.block.ends_at)}`, tone: 'now', title: <EmojiText text={s.block.title} />, sub: <>{minsText(s.leftMin)} left{working}</>, action: focusBtn() }
      break
    case 'over':
      head = { caption: `Now · ${minsText(s.overMin)} over`, tone: 'over', title: <EmojiText text={s.block.title} />, sub: <>ended {time(s.block.ends_at)}{working}</>, action: focusBtn() }
      break
    case 'paused':
      head = { caption: s.since ? `Paused · since ${time(s.since)}` : 'Paused', tone: 'quiet', title: <EmojiText text={s.task.title} />, sub: `${minsText(s.leftMin)} left in the round`, action: focusBtn('Resume focus') }
      break
    case 'done':
      head = { caption: `Done · ${time(s.at)}`, tone: 'done', title: <span className="td-struck"><EmojiText text={s.task.title} /></span>, action: <Button type="button" variant="secondary" icon={<Icon name="undo" size={16} />} onClick={() => reopenTaskWithUndo(s.task)}>Undo</Button> }
      break
  }
  return (
    <div className="td-now-head">
      {task && s.kind !== 'done' ? (
        <NowHeadTask task={task} block={block ?? undefined} head={head} check={!top3Ids.has(task.id)} sel={rowSelection(task)} />
      ) : (
        <NowHeadText head={head} onOpen={block ? () => navigate(eventPath(block)) : undefined} event={block ?? undefined} />
      )}
      {head.action && <span style={{ flex: 'none' }}>{head.action}</span>}
    </div>
  )
}

function NowHeadText({ head, onOpen, event }: { head: CardHead; onOpen?: () => void; event?: CalendarEvent }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <div className="td-now-text" onClick={onOpen} role={onOpen ? 'link' : undefined} style={onOpen ? { cursor: 'pointer' } : undefined} onContextMenu={event ? (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) } : undefined}>
        <div className="td-cap" data-tone={head.tone}><span className="td-cap-dot" aria-hidden />{head.caption}</div>
        <div className="td-now-title">{head.title}</div>
        {head.sub && <div className="td-now-sub">{head.sub}</div>}
      </div>
      {menu && event && <EventMenu event={event} at={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

/** The card's head when it stands for a task: the task row's grammar on the text. */
function NowHeadTask({ task, block, head, check, sel }: { task: Task; block?: CalendarEvent; head: CardHead; check: boolean; sel: RowSelection }) {
  const g = useTodayRow(task, { ...sel, ...(block ? blockGrammar(block) : null) })
  const bloom = useBloomCheck(task)
  const openTask = useOpenTask()
  return (
    <>
    <div id={`now-${task.id}`} className="td-now-text" style={{ cursor: 'pointer', background: sel.selected || g.menuOpen ? 'var(--select-bg)' : undefined }} onClickCapture={ctrlSelect(sel, !!task.completed_at)} onClick={() => openTask(task.id)} onContextMenu={g.onContextMenu}>
      <div className="td-cap" data-tone={head.tone}><span className="td-cap-dot" aria-hidden />{head.caption}</div>
      <div className="td-now-title">
        {check && <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', marginRight: 10, verticalAlign: '-2px' }}><Checkbox label={task.title} checked={bloom.checking} size={20} onChange={bloom.toggle} /></span>}
        {head.title}
      </div>
      {head.sub && <div className="td-now-sub">{head.sub}</div>}
    </div>
    {g.menuNode}
    </>
  )
}

/** 2a's day ribbon: 8 AM–8 PM, every timed block today in its calendar colour (CALENDAR.md kinds:
 * a meeting blossom, a task / time block lavender, or the event's own colour), the card's block
 * outlined in terra with its spent part filled, a terra now line. A block opens on click. */
function Ribbon({ events, now, head, taskById }: { events: CalendarEvent[]; now: Date; head: CalendarEvent | null; taskById: Map<string, Task> }) {
  const navigate = useNavigate()
  const openTask = useOpenTask()
  const today = cairoDateKey(now)
  const t = now.getTime()
  const blocks = events.filter((e) => !e.all_day && (cairoDateKey(new Date(e.starts_at)) === today || isInProgress(e.starts_at, e.ends_at, now)))
  const nowPct = ribbonPct(t, now)
  const hours = Array.from({ length: (RIBBON_TO_MIN - RIBBON_FROM_MIN) / 120 + 1 }, (_, i) => RIBBON_FROM_MIN / 60 + i * 2)
  return (
    <div className="td-ribbon">
      <div className="td-ribbon-track">
        <span className="td-ribbon-rail" aria-hidden />
        {blocks.map((e) => {
          const pos = ribbonSpan(e, now)
          if (!pos) return null
          const task = e.task_id ? taskById.get(e.task_id) : undefined
          const start = new Date(e.starts_at).getTime()
          const end = new Date(e.ends_at).getTime()
          const isHead = e.id === head?.id
          const spent = isHead ? Math.min(100, Math.max(0, ((t - start) / Math.max(1, end - start)) * 100)) : 0
          const color = e.color ?? (e.type === 'event' && !e.task_id ? 'var(--acc-blossom)' : 'var(--acc-lavender)')
          return (
            <button
              key={e.id}
              type="button"
              className="td-rb"
              data-head={isHead || undefined}
              data-past={end <= t || undefined}
              data-done={task?.status === 'done' || undefined}
              style={{ left: `${pos.left}%`, width: `${pos.width}%`, '--rb': color } as React.CSSProperties}
              title={`${cairoTimeKey(new Date(start))}–${cairoTimeKey(new Date(end))} · ${e.title}`}
              aria-label={`${cairoTimeKey(new Date(start))}–${cairoTimeKey(new Date(end))} ${e.title}`}
              onClick={() => (task ? openTask(task.id) : navigate(eventPath(e)))}
            >
              {isHead && spent > 0 && <span className="td-rb-spent" style={{ width: `${spent}%` }} />}
            </button>
          )
        })}
        {nowPct > 0 && nowPct < 100 && <span className="td-ribbon-now" style={{ left: `${nowPct}%` }} aria-hidden />}
      </div>
      <div className="td-ribbon-axis" aria-hidden>{hours.map((h) => <span key={h}>{h}</span>)}</div>
    </div>
  )
}

/** One of the next two under the ribbon — a task's block is the task (checkbox, opens it, its menu). */
function NextTaskItem({ event, task, sel }: { event: CalendarEvent; task: Task; sel: RowSelection }) {
  const g = useTodayRow(task, { ...sel, ...blockGrammar(event) })
  const parentTitle = task.parent_task_id ? cachedTask(task.parent_task_id)?.title : undefined
  const openTask = useOpenTask()
  const done = task.status === 'done'
  return (
    <>
      <span id={`upnext-${event.id}`} className="td-next-item" data-selected={sel.selected || g.menuOpen || undefined} role="link" tabIndex={0} title="Open task" onClickCapture={ctrlSelect(sel, done)} onClick={() => openTask(task.id)} onKeyDown={(e) => e.key === 'Enter' && openTask(task.id)} onContextMenu={g.onContextMenu}>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}><Checkbox label={task.title} checked={done} size={16} onChange={() => toggleTaskWithUndo(task)} /></span>
        <span className="td-next-time">{cairoTimeKey(new Date(event.starts_at))}</span>
        <span className={`td-ink${done ? ' td-struck' : ''}`}><EmojiText text={event.title} /></span>
        {/* Subtasks C: a timed subtask shows here by itself, with whose it is. */}
        {parentTitle && <span className="td-sub-of">↳ <EmojiText text={parentTitle} /></span>}
      </span>
      {g.menuNode}
    </>
  )
}

/** …and a plain event: its colour, time and title; opens on the calendar; right-click = its menu. */
function NextEventItem({ event }: { event: CalendarEvent }) {
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const open = () => navigate(eventPath(event))
  return (
    <>
      <span id={`upnext-${event.id}`} className="td-next-item" role="link" tabIndex={0} title="Open in calendar" onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}>
        <span className="td-next-sq" style={{ background: event.color ?? (event.task_id ? 'var(--acc-lavender)' : event.type === 'event' ? 'var(--acc-blossom)' : 'var(--acc-lavender)') }} aria-hidden />
        <span className="td-next-time">{cairoTimeKey(new Date(event.starts_at))}</span>
        <span className="td-ink"><EmojiText text={event.title} /></span>
      </span>
      {menu && <EventMenu event={event} at={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

/** "Also open · N" (2a #13): three rows, then "Show N more →" — the old "More for today" fold,
 * remembered per device. Open, it lists up to ALL_OPEN_CAP and links the rest to Tasks. */
function AlsoOpen({ count, rows, render, motion }: { count: number; rows: Task[]; render: (t: Task, i: number) => React.ReactNode; motion: boolean }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(MORE_OPEN_KEY) === '1' } catch { return false }
  })
  function toggle() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(MORE_OPEN_KEY, next ? '1' : '0') } catch { /* storage off: this visit only */ }
  }
  const shown = rows.slice(0, open ? ALL_OPEN_CAP : ALSO_OPEN_FIRST)
  // "Show N more" counts the open ones folded away (rows finished today sort last, struck — A3).
  const hidden = rows.slice(ALSO_OPEN_FIRST).filter((t) => !t.completed_at).length || rows.length - ALSO_OPEN_FIRST
  return (
    <section aria-label="Also open" className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(2) : undefined}>
      <SectionLabel style={{ marginBottom: 6 }}>{`Also open · ${count}`}</SectionLabel>
      {/* X1 Effects 2g — focus dim on the resting list (kf-dim, AppLayout shell CSS). */}
      <div className="kf-dim">{shown.map(render)}</div>
      {hidden > 0 && (
        <button type="button" className="td-more" aria-expanded={open} onClick={toggle}>
          {open ? 'Show fewer' : `Show ${hidden} more →`}
        </button>
      )}
      {/* Punch 17: Today is a glance — the rest lives on the Tasks "All" tab. */}
      {open && rows.length > ALL_OPEN_CAP && <Link to="/tasks?list=all" className="td-more">View all {rows.length} →</Link>}
    </section>
  )
}
const ALSO_OPEN_FIRST = 3

// The ritual step names — rituals/ritualLogic STEP_NAME's words (not exported there).
const STEP_LABEL: Record<string, string> = { overdue: 'Carry-over', inbox: 'Inbox', top3: 'Pick your 3', block: 'Suggested times', sweep: 'Sweep', line: 'One line', seeds: "Tomorrow's 3", goodnight: 'Close the day' }

/** 2a's rail "Rituals" — the rituals' one home (2a #5): each a checklist of its own steps walked
 * today (R4-D1: a ritual's progress is its steps, never routines). Morning is open until the evening
 * (Shut down's 17:00, Kai 2026-09-28 — 2a drew 7 PM); then Evening. Any row opens its ritual. */
function RitualsRail({ day, now, onOpen, review }: { day: ReturnType<typeof useDay>; now: Date; onOpen: (kind: RitualKind) => void; review: boolean }) {
  const evening = isEvening(now) // on until 04:00, the loop day's turn (A29)
  const from = `${String(Math.floor(SHUTDOWN_FROM / 60)).padStart(2, '0')}:${String(SHUTDOWN_FROM % 60).padStart(2, '0')}`
  return (
    <section aria-label="Rituals" data-tour="plan">
      <SectionLabel action={<Link to="/routines" className="td-label-note td-label-link">Edit</Link>} style={{ marginBottom: 12 }}>Rituals</SectionLabel>
      <RitualGroup kind="morning" label="Morning" r={day.morning} steps={PLAN_STEPS} logged={day.steps.morning} open={!evening} onOpen={onOpen} />
      <RitualGroup kind="evening" label={evening ? 'Evening' : `Evening · from ${from}`} r={day.evening} steps={SHUT_STEPS} logged={day.steps.evening} open={evening} onOpen={onOpen} split />
      {/* DAILY-CYCLE step 5 on its day, until the week is closed — the ritual rows' look. */}
      {review && (
        <div className="td-rit is-split" data-ritual="review">
          <Link to="/weekly-review" className="td-rit-head" style={{ textDecoration: 'none' }}>
            <span className="td-rit-dot" data-kind="review" aria-hidden />
            <span className="td-rit-name" data-open>Weekly review</span>
            <span className="td-rit-count">today</span>
          </Link>
        </div>
      )}
    </section>
  )
}

function RitualGroup({ kind, label, r, steps, logged, open, onOpen, split }: { kind: RitualKind; label: string; r: RitualState; steps: readonly string[]; logged: ReadonlySet<string>; open: boolean; onOpen: (kind: RitualKind) => void; split?: boolean }) {
  const finished = ritualFinished(r)
  // dayPhase morningState counts a task block today as "Suggested times" once the ritual was walked.
  const inferred = r.done > logged.size
  const isDone = (s: string) => finished || logged.has(s) || (s === 'block' && inferred)
  return (
    <div className={`td-rit${split ? ' is-split' : ''}`} data-ritual={kind}>
      <button type="button" className="td-rit-head" aria-expanded={open} onClick={() => onOpen(kind)}>
        <span className="td-rit-dot" data-kind={kind} aria-hidden />
        <span className="td-rit-name" data-open={open || undefined}>{label}</span>
        <span className="td-rit-count">{ritualProgress(r)}</span>
      </button>
      {open && steps.map((s) => (
        <button key={s} type="button" className="td-rit-step" data-done={isDone(s) || undefined} onClick={() => onOpen(kind)}>
          <span className="td-rit-box" aria-hidden>{isDone(s) && <Icon name="check" size={12} strokeWidth={2.4} />}</span>
          <span>{STEP_LABEL[s] ?? s}</span>
        </button>
      ))}
    </div>
  )
}

/** 2a "Worth a look · 1 of 2": one nudge at a time — the slipping cards (Kai's A4/punch-20 card:
 * the real wisteria stage, the body opens it) and the resurfaced memory share the slot; "1 of 2"
 * steps through them. Nothing to nudge → no section. */
function WorthALook({ rows, resurfacing, stageOf }: { rows: SlippingRow[]; resurfacing: boolean; stageOf: (row: SlippingRow) => string }) {
  const [i, setI] = useState(0)
  const total = rows.length + (resurfacing ? 1 : 0)
  if (total === 0) return null
  const at = i % total
  const count = total > 1 && (
    <button type="button" className="td-label-note td-label-link" aria-label={`Nudge ${at + 1} of ${total} — next`} onClick={() => setI(at + 1)}>{at + 1} of {total}</button>
  )
  return (
    <section aria-label="Worth a look">
      <SectionLabel action={count || undefined} style={{ marginBottom: 12 }}>Worth a look</SectionLabel>
      {at < rows.length ? <SlippingCard row={rows[at]} stage={stageOf(rows[at])} /> : <ResurfaceCard />}
    </section>
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
      {/* The Notebook page's quiet way in (Kai's 2026-10-03 brainstorm). */}
      <Link to={NOTEBOOK_PATH} className="tp-icon" aria-label="Notebook page">
        <Icon name="journal" />
      </Link>
      {/* AppLayout owns the overlay; this asks it to open. */}
      <button type="button" className="tp-icon" aria-label="Search" onClick={() => window.dispatchEvent(new Event('kf-open-search'))}>
        <Icon name="search" />
      </button>
      <button type="button" className="tp-icon" data-tour="plan-menu" aria-label="Today menu" aria-haspopup="dialog" onClick={() => setMenu(true)}>
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
 * refreshes (2m), and the offline chip in its place while offline (2h). MK Workload: over capacity
 * it turns amber with an alert and "2H OVER"; the progress hairline under it is today's done share. */
function PhoneSummary({ workload, now, online, syncing, over, counts }: { workload: Omit<WorkloadInput, 'focusedMin'>; now: Date; online: boolean; syncing: boolean; over: number; counts: { done: number; total: number } }) {
  const { data: entries = [] } = useTimeEntries()
  if (!online) {
    return (
      <div style={{ padding: '0 16px 8px' }}>
        <OfflineChip />
      </div>
    )
  }
  const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0
  return (
    <>
      <div className={`tp-sum${over > 0 ? ' is-over' : ''}`}>
        <Icon name={over > 0 ? 'alert' : 'clock'} size={20} />
        <span style={{ flex: 1, minWidth: 0 }}>{workloadLine({ ...workload, focusedMin: focusedToday(entries, now) })}</span>
        {syncing ? (
          <span className="tp-syncing" style={{ fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)' }}>Syncing</span>
        ) : over > 0 && <span className="tp-over">{span(over)} over</span>}
      </div>
      {counts.total > 0 && (
        <div className="tp-hairline tp-progress" role="progressbar" aria-label={`Today · ${counts.done} of ${counts.total} done`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
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
  return on ? <div className="tp-note tp-first-hint" style={style}>{FIRST_TODAY_HINT}</div> : null
}

/** /calendar?event=<id> — the calendar turns to the event's day and opens it (CalendarPage). */
const eventPath = (e: CalendarEvent) => `/calendar?event=${e.id}`


/** The NOW slip (MK 11, option 1b "Taped slip") in each MK Now Card state (./nowCard) — only while
 * something runs: the ring is the time spent (running), full amber "+20" (over), a frozen hairline
 * (paused), full with ✓ (just done). Tap = open it; ✓ = done + Undo (a task only — a plain event has
 * nothing to complete); just done's ↶ = Undo. A task's slip keeps the task row's swipe / hold / ⋯. */
function NowSlip({ state: s, sel }: { state: NowState<CalendarEvent, Task>; sel: RowSelection }) {
  const navigate = useNavigate()
  const openTask = useOpenTask()
  const block = nowBlock(s)
  const task = 'task' in s ? s.task : undefined
  const time = (iso: string | Date) => cairoTimeKey(new Date(iso))
  const track = 'var(--line-card)'
  let ring: { bg: string; label: React.ReactNode; tone: string; aria: string }
  let caption: string
  let tone = ''
  switch (s.kind) {
    case 'running':
      ring = { bg: `conic-gradient(var(--acc-sage-text) 0 ${s.pct}%, ${track} ${s.pct}% 100%)`, label: formatDuration(s.leftMin), tone: 'now', aria: `${s.leftMin} minutes left` }
      caption = `Now · until ${time(s.block.ends_at)}`
      tone = 'is-now'
      break
    case 'over':
      ring = { bg: 'var(--sig-amber)', label: `+${s.overMin}`, tone: 'over', aria: `${s.overMin} minutes over` }
      caption = `Now · ${formatDuration(s.overMin)} over`
      tone = 'is-over'
      break
    case 'paused':
      ring = { bg: `conic-gradient(var(--ink-hairline) 0 ${s.pct}%, ${track} ${s.pct}% 100%)`, label: formatDuration(s.leftMin), tone: 'quiet', aria: `paused, ${s.leftMin} minutes left` }
      caption = s.since ? `Paused · since ${time(s.since)}` : 'Paused'
      break
    case 'done':
      ring = { bg: 'var(--acc-sage-text)', label: <Icon name="check" size={18} strokeWidth={2} />, tone: 'now', aria: 'done' }
      caption = `Done · ${time(s.at)}`
      tone = 'is-now'
      break
  }
  const title = block && s.kind !== 'paused' && s.kind !== 'done' ? block.title : task?.title ?? ''
  const open = () => (task ? openTask(task.id) : block ? navigate(eventPath(block)) : undefined)
  // A tool card (B D3/D4/D7): 16 corners, a hairline, flat — no tape, no tilt.
  const card = { position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px 10px 12px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)' } as const
  const inner = (action?: React.ReactNode) => (
    <>
      <span className="tp-ring" data-tone={ring.tone} style={{ background: ring.bg }} aria-label={ring.aria}>
        <span>{ring.label}</span>
      </span>
      <div onClick={open} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className={`tp-caption ${tone}`}>{caption}</div>
        <div className={`tp-slip-title${s.kind === 'done' ? ' is-done' : ''}`}><EmojiText text={title} /></div>
      </div>
      {action}
    </>
  )
  const id = `slip-${block?.id ?? task?.id}`
  const wrap = (body: React.ReactNode) => <div className="tp-slip-wrap" data-now={s.kind}>{body}</div>
  if (s.kind === 'done') {
    const undo = (
      <button type="button" className="tp-slip-done" aria-label={`Undo: "${s.task.title}"`} onClick={(e) => { e.stopPropagation(); reopenTaskWithUndo(s.task) }}>
        <span><Icon name="undo" size={20} strokeWidth={2} /></span>
      </button>
    )
    return wrap(<div id={id} style={card}>{inner(undo)}</div>)
  }
  if (!task) return wrap(<div id={id} style={card} role="link" aria-label={`${caption}: ${title}`} onClick={open}>{inner()}</div>)
  return wrap(<SlipTask id={id} block={block ?? undefined} task={task} card={card} sel={sel} inner={inner} />)
}

function SlipTask({ id, block, task, card, sel, inner }: { id: string; block?: CalendarEvent; task: Task; card: React.CSSProperties; sel: RowSelection; inner: (action?: React.ReactNode) => React.ReactNode }) {
  const g = useTodayRow(task, { ...sel, ...(block ? blockGrammar(block) : null) })
  const done = g.selecting ? (
    <span className="tp-hit"><SelectCircle on={!!sel.selected} title={task.title} /></span>
  ) : (
    <button type="button" className="tp-slip-done" aria-label={`Done: "${task.title}"`} onClick={(e) => { e.stopPropagation(); completeTaskWithUndo(task) }}>
      <span><Icon name="check" size={20} strokeWidth={2} /></span>
    </button>
  )
  return (
    <SwipeRow id={id} onContextMenu={g.onContextMenu} contentStyle={{ ...card, backgroundImage: sel.selected ? 'linear-gradient(var(--select-bg), var(--select-bg))' : undefined }} {...g.swipeProps} overlay={g.menuNode}>
      {inner(done)}
    </SwipeRow>
  )
}

/** A plain event's menu — the desktop right-click list, the phone's action sheet (one grammar). */
function EventMenu({ event, at, onClose }: { event: CalendarEvent; at: { x: number; y: number }; onClose: () => void }) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const items: ContextMenuItem[] = eventMenuItems(event, () => navigate(eventPath(event)))
  return isMobile ? (
    <ActionSheet title={<EmojiText text={event.title} />} items={items.map((i) => ({ label: i.label, destructive: i.danger, onSelect: () => i.onClick?.() }))} onClose={onClose} />
  ) : (
    <ContextMenu items={items} position={at} onClose={onClose} />
  )
}

/** Ruling 5: time on the left (mono), a 3px lavender rule, title and meta. Tap opens the event on
 * the calendar. Kai 2026-10-12: the same grammar as desktop Up next — a ⋯ (and right-click) with
 * Open in calendar · Delete. The menu is the row's sibling: it portals, but React events would
 * still bubble a menu tap into the row. */
function PhoneEventRow({ event, meta }: { event: CalendarEvent; meta: string[] }) {
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const open = () => navigate(eventPath(event))
  return (
    <>
      <div id={`upnext-${event.id}`} className="tp-ev" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}>
        <span className="tp-ev-time">{cairoTimeKey(new Date(event.starts_at))}</span>
        <span className="tp-ev-rule" aria-hidden />
        <div className="tp-ev-body">
          <div className="tp-title"><EmojiText text={event.title} /></div>
          <div className="tp-meta">{meta.map((m) => <span key={m} style={m === 'Now' ? { color: 'var(--acc-sage-text)' } : undefined}>{m}</span>)}</div>
        </div>
        <span style={{ alignSelf: 'center' }}><RowMenuButton title={event.title} onOpen={setMenu} /></span>
      </div>
      {menu && <EventMenu event={event} at={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

/** MK Goal card, loading (2g): skeleton title lines under the tag. */
function GoalCardLoading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="tp-goal kf-page" style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 'var(--radius-page)', padding: '14px 12px 14px 4px', transform: 'rotate(-0.4deg)' }}>
      <div style={{ paddingLeft: 12 }}><span className="tp-goal-tag">✶ Goal of the day</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
        <span className="tp-hit"><span style={{ width: 22, height: 22, borderRadius: 'var(--radius-check)', border: '1.5px solid var(--acc-gold)', boxSizing: 'border-box' }} /></span>
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
          fontSize: 'var(--fs-body-s)',
          color: 'var(--ink-muted)',
          animation: 'itemFadeIn 400ms var(--ease-out) 500ms both',
        }}
      >
        That's the day, gently done ✿
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
      <div style={{ marginTop: 22, fontSize: 'var(--fs-body)', color: 'var(--ink-muted)', textAlign: 'center' }}>Nothing planted for today yet.</div>
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
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderBottom: '1.5px solid var(--line-dashed)' }} />
        {petals.map(([left, bottom, w, h, radius], i) => (
          <span
            key={i}
            aria-hidden
            style={{ position: 'absolute', left, bottom, width: w, height: h, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: radius, transform: `rotate(${rotations[i]}deg)` }}
          />
        ))}
      </div>
      <div style={{ marginTop: 20, fontSize: 'var(--fs-body)', color: 'var(--ink-muted)', textAlign: 'center' }}>All done. The garden can rest.</div>
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

type RowSelection = Pick<RowGrammarOptions, 'selected' | 'onToggleSelect' | 'selecting' | 'bulk'>

/** Kai 2026-07-21: no visible select squares on desktop — Ctrl/Cmd+click toggles a row's selection
 * (every task row on Today: Top 3, the goal card, the Now card's task, the next two, the lists). */
const ctrlSelect = (sel: RowSelection, done: boolean) => (e: React.MouseEvent) => {
  if (!(e.ctrlKey || e.metaKey) || done || !sel.onToggleSelect) return
  e.preventDefault()
  e.stopPropagation()
  sel.onToggleSelect()
}

/** A Today row's grammar: swipe, ⋯ / right-click, hold to select (features/tasks). */
function useTodayRow(task: Task, o: RowSelection & Pick<RowGrammarOptions, 'actions' | 'tomorrowHint' | 'canUnschedule' | 'place' | 'nest'>) {
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

/** A place in the Top 3: its index in the day's order (0 = the goal). */
type Top3Spot = Spot & { kind: 'top3'; index: number }

/** Desktop: a Top 3 row that drags (mouse only — touch keeps its swipes) onto another's place;
 * dropped on the goal card it becomes the goal. Every row is a drop target, only open ones drag.
 * On the shared drag kit (components/drag): the spot under the pointer and the ghost are placed in
 * the root zoom's px — its own DndContext moved the row by dnd-kit's un-zoomed delta, so at 125% a
 * row aimed at the goal card landed one place off. Its own place is no place (null, not a soft no). */
function Top3Slot({ task, index, children }: { task: Task; index: number; children: React.ReactNode }) {
  const drop = useDropSpot<Top3Spot>(`top3:${task.id}`, { kind: 'top3', label: index === 0 ? 'the goal' : `place ${index + 1}`, index })
  const load: DragLoad = {
    ids: [task.id],
    label: task.title,
    verdict: (spot) => (spot.kind === 'top3' && (spot as Top3Spot).index !== index ? true : null),
    drop: (spot) => void moveInTop3Order(task, (spot as Top3Spot).index),
  }
  return (
    <DragRow id={task.id} load={load} disabled={!!task.completed_at}>
      <div ref={drop.ref} className={drop.className} data-top3-slot={task.id} style={{ position: 'relative', borderRadius: 'var(--radius-input)' }}>
        {children}
      </div>
    </DragRow>
  )
}

function GoalCard({ task, projectName, dot, compact, meta, inProgress = false, place, ...sel }: { task: Task; projectName?: string; dot: string; compact?: boolean; meta?: string[]; inProgress?: boolean; place?: RowGrammarOptions['place'] } & RowSelection) {
  const done = !!task.completed_at // A3 — a completed goal stays on its card, struck through
  const bloom = useBloomCheck(task)
  const openTask = useOpenTask()
  const openDetail = () => openTask(task.id) // J-8
  // Loop A (2026-09-26 daily cycle): the goal is a Top 3 row too — the same grammar as the rows under it.
  const g = useTodayRow(task, { ...sel, place, nest: true })
  const more = !g.selecting && <RowMenuButton title={task.title} onOpen={g.openMenu} />
  // Subtasks A: the goal's subtasks hang under its card (../tasks/SubtaskNest).
  const nestOpen = useNestOpen(task) && !task.parent_task_id && (!done || hasOpenSubtasks(task))
  const subs = !task.parent_task_id && <SubtaskCount parent={task} />
  const card = { position: 'relative', backgroundColor: 'var(--paper-goal)', backgroundImage: sel.selected ? 'linear-gradient(var(--select-bg), var(--select-bg))' : undefined, border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 'var(--radius-page)', display: 'flex', alignItems: 'flex-start', transform: 'rotate(-0.4deg)' } as const
  if (compact) {
    // MK Goal card (Today Phone 2a–2e): gold tag, 22 gold box in a 48 hit, serif 18/600, gold meta,
    // clover (four-leaf once done). ⋯ stays, so every swipe has its tap path (DS-CHANGELOG §3).
    const lines = done ? [`${doneAt(task)} · a four-leaf day`] : meta ?? ([projectName, task.duration_min != null ? formatDuration(task.duration_min) : null].filter(Boolean) as string[])
    return (
      <>
      <SwipeRow id={`task-${task.id}`} tabIndex={-1} className="tp-goal" contentClassName="kf-page" onClickCapture={ctrlSelect(sel, done)} onContextMenu={g.onContextMenu} contentStyle={{ ...card, display: 'block', padding: '14px 4px 14px 4px' }} {...g.swipeProps} overlay={g.menuNode}>
        <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', marginLeft: -36, width: 72, height: 17, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
        <div style={{ paddingLeft: 12 }}><span className="tp-goal-tag">✶ Goal of the day</span></div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
          <span className="tp-hit">
            {g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : <Checkbox label={task.title} checked={done || bloom.checking} bloom onChange={bloom.toggle} style={done || bloom.checking ? { background: 'var(--acc-gold)', color: 'var(--paper-parchment)' } : { borderColor: 'var(--acc-gold)' }} />}
          </span>
          <div onClick={openDetail} style={{ flex: 1, minWidth: 0, paddingTop: 12, cursor: 'pointer' }}>
            <div className={`tp-goal-title${done ? ' is-done' : ''}`}><EmojiText text={task.title} /></div>
            <div className="tp-meta">{lines.length ? lines.join(' · ') : 'The one thing that makes today a win'}{subs && <> {subs}</>}</div>
          </div>
          <img className="tp-goal-clover" src={`${A}/clover/${done ? 'four_leaf' : 'awake'}.png`} alt="" style={{ width: 34, height: 'auto', marginTop: 12, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
          {more}
        </div>
      </SwipeRow>
      {nestOpen && <SubtaskNest parent={task} phone />}
      </>
    )
  }
  // Today 2a: 20 gold box · serif 20/600 title · one meta line led by the mono "✶ Goal of the day",
  // then project, block time and its real due state · the four-leaf clover. The one taped, tilted
  // card on the page (2a rule 3).
  const box = { borderColor: 'var(--acc-gold)', background: 'color-mix(in srgb, var(--paper-parchment) 50%, transparent)' }
  const check = g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : done && !bloom.checking ? <DoneCheck task={task} size={20} /> : <Checkbox label={task.title} checked={bloom.checking} size={20} bloom onChange={bloom.toggle} style={box} />
  const due = overdueDays(task)
  return (
    <>
    <SwipeRow id={`task-${task.id}`} tabIndex={-1} className="kf-goal-row" onClickCapture={ctrlSelect(sel, done)} onContextMenu={g.onContextMenu} style={{ marginBottom: 6, outline: 'none' }} contentClassName="kf-page" contentStyle={{ ...card, padding: '18px 18px 16px', gap: 14 }} {...g.swipeProps} overlay={g.menuNode}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', width: 78, height: 18, marginLeft: -39, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-1.5deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <span style={{ marginTop: 3 }}>{check}</span>
      <div onClick={openDetail} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className={`td-goal-title${done ? ' is-done' : ''}`}><EmojiText text={task.title} /></div>
        <div className="td-meta td-goal-meta">
          <span className="td-goal-tag">✶ Goal of the day</span>
          {projectName && <span><span className="td-dot" style={{ background: dot }} />{projectName}</span>}
          {deskBlockMeta(meta, inProgress && !done)}
          {done ? <span>{doneAt(task)}</span> : due === 0 ? <span>Due today</span> : due !== null && due > 0 ? <span className="td-terra">Overdue {due}d</span> : null}
          {subs}
        </div>
      </div>
      <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 32, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
      {!g.selecting && !done && !task.parent_task_id && <SubtaskAddButton parent={task} />}
      {more}
    </SwipeRow>
    {nestOpen && <SubtaskNest parent={task} />}
    </>
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
      style={{ width: size, height: size, borderRadius: 'var(--radius-check)', background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', flex: 'none', cursor: 'pointer' }}
    >
      ✓
    </span>
  )
}

function TaskRow({ task, projectName, dot, border, hollow, compact, highlighted, pick, block, meta, pending, inProgress = false, place, ...sel }: {
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
  /** Desktop: its block is running, or it's the task in focus — "in progress" (2a). */
  inProgress?: boolean
} & RowSelection) {
  const bloom = useBloomCheck(task)
  const done = !!task.completed_at
  const back = backFromSnooze(task) // Snooze: back today (tasks/snooze)
  // Punch 18 (drift T-10): the same overdue/due-today/↻ meta the Tasks TaskRow renders — same
  // "Overdue Nd" treatment, same ↻ glyph — counted in the user's days (lib/appZone).
  const dueDays = !done && !task.someday ? overdueDays(task) : null
  // In a Time slot (0073): "in Code block · 10:00" says more than "Due today" (slots-ux).
  const held = done ? null : slotLabel(task)
  const dueBadges = dueDays !== null || task.recurrence_rule ? (
    <>
      {dueDays !== null && dueDays > 0 && <span style={{ color: 'var(--sig-overdue)' }}>Overdue {dueDays}d</span>}
      {dueDays === 0 && <span>Due today</span>}
      {task.recurrence_rule && <span>↻</span>}
    </>
  ) : null
  const openTask = useOpenTask()
  // Subtasks A: a parent's row draws its subtasks under it — not an Up next row (that one is its block).
  const parent = !block && !task.parent_task_id
  const g = useTodayRow(task, { ...sel, place, nest: parent, ...(block ? blockGrammar(block) : null) })
  const nestOpen = useNestOpen(task) && parent && (!done || hasOpenSubtasks(task))
  // A subtask drawn on its own (its parent isn't on the page, or it's a Top 3 pick / Up next block): "↳ parent".
  const parentTitle = task.parent_task_id ? cachedTask(task.parent_task_id)?.title : undefined
  const ofParent = parentTitle && <span key="sub" className="td-sub-of" title={`Subtask of “${parentTitle}”`}>↳ <EmojiText text={parentTitle} /></span>
  const subs = parent && <SubtaskCount key="subs" parent={task} />
  const open = () => openTask(task.id)
  const rowProps = {
    id: block ? `upnext-${block.id}` : `task-${task.id}`,
    tabIndex: highlighted ? 0 : -1,
    onClickCapture: ctrlSelect(sel, done),
    onContextMenu: g.onContextMenu,
    style: {
      borderBottom: border && !nestOpen ? '1px solid var(--line-dashed)' : 'none',
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
      ? [<span key="done">{doneAt(task)}</span>, subs].filter(Boolean)
      : meta
        ? [...meta.map((m) => <span key={m} style={m === 'Now' ? { color: 'var(--acc-sage-text)' } : undefined}>{m}</span>), ofParent].filter(Boolean)
        : [
            back && <span key="b" className="td-back">Back from snooze</span>,
            ofParent,
            projectName && <span key="p"><span className="tp-dot" style={{ background: dot }} />{projectName}</span>,
            dueDays !== null && dueDays > 0 && <span key="o" style={{ color: 'var(--sig-overdue)' }}>Overdue {dueDays}d</span>,
            held && <span key="s">{held}</span>,
            dueDays === 0 && !held && <span key="d">Due today</span>,
            task.duration_min != null && <span key="m">{formatDuration(task.duration_min)}</span>,
            task.recurrence_rule && <span key="r">↻</span>,
            !!task.labels?.length && <LabelChips key="l" labels={task.labels} />,
            subs,
          ].filter(Boolean)
    return (
      <>
      <SwipeRow {...rowProps} data-tour="task-row" className={`tp-row${nestOpen ? ' has-nest' : ''}`} style={{ ...rowProps.style, borderBottom: undefined }} contentStyle={{ display: 'flex', alignItems: 'flex-start', minHeight: 'var(--row-min)', padding: 'var(--sp-1)', boxSizing: 'border-box' }}>
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
      {nestOpen && <SubtaskNest parent={task} phone rule />}
      </>
    )
  }
  // Desktop (Today 2a): 20px boxes (rule 14). Top 3 rows carry no star — being in the section says
  // it (#12); other rows keep ☆ as a hover action. The ⋯ stays on every row (Wave L).
  const check = g.selecting ? <SelectCircle on={!!sel.selected} title={task.title} /> : done && !bloom.checking ? <DoneCheck task={task} size={20} /> : <Checkbox label={task.title} checked={bloom.checking} size={20} bloom={task.top3} onChange={bloom.toggle} />
  const tail = !g.selecting && (
    <>
      {parent && !done && <SubtaskAddButton parent={task} />}
      {!done && !pick && (
        <button type="button" className="kf-hit td-star" aria-label={task.top3 ? `Remove "${task.title}" from Top 3` : `Add "${task.title}" to Top 3`} onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--star-on)' : 'var(--star-empty)' }}>
          {task.top3 ? '★' : '☆'}
        </button>
      )}
      <RowMenuButton title={task.title} onOpen={g.openMenu} />
    </>
  )
  const title = <span className={done ? 'td-struck' : undefined}><EmojiText text={task.title} /></span>
  if (hollow) {
    // 2a "Also open": one line — the title, then the row's one fact in a right-aligned column.
    const fact = back ? <span className="td-back">Back from snooze</span>
      : parentTitle && !held ? ofParent
      : dueDays !== null && dueDays > 0 ? <span className="td-terra">Overdue {dueDays}d</span>
      : held ? <span>{held}</span>
      : dueDays === 0 ? <span>Due today{task.recurrence_rule ? ' · ↻' : ''}</span>
      : projectName ? <span><span className="td-dot" style={{ background: dot }} />{projectName}</span>
      : task.recurrence_rule ? <span>↻</span> : null
    return (
      <>
      <SwipeRow {...rowProps} className="td-row" contentStyle={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 2px' }}>
        {check}
        <div onClick={open} className="td-row-title">{title}</div>
        {subs && <span className="td-meta td-row-fact">{subs}</span>}
        {fact && <span className="td-meta td-row-fact">{fact}</span>}
        {tail}
      </SwipeRow>
      {nestOpen && <SubtaskNest parent={task} rule={border} />}
      </>
    )
  }
  return (
    <>
    <SwipeRow {...rowProps} className="td-row" contentStyle={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 2px' }}>
      <span style={{ marginTop: 1 }}>{check}</span>
      <div onClick={open} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className="td-row-title">{title}</div>
        {metaRow(projectName, dot, meta ? null : task.duration_min, <>{ofParent}{deskBlockMeta(meta, inProgress && !done)}{dueBadges}{!done && <LabelChips labels={task.labels} />}{subs}</>)}
      </div>
      {tail}
    </SwipeRow>
    {nestOpen && <SubtaskNest parent={task} rule={border} />}
    </>
  )
}

function SlippingCard({ row, stage }: { row: SlippingRow; stage: string }) {
  const navigate = useNavigate()
  // A4 (2026-07-18 audit): the card body opens the slipping entity itself. Projects and
  // areas both live at /projects/:id (ProjectDetailPage renders either); a domain has no
  // detail page, so it lands on the garden overview.
  const to = row.entity_type === 'domain' ? '/projects' : `/projects/${row.entity_id}`
  const { data: projects = [] } = useProjects()
  // 2a rule 9 (actions are verbs): "reviewed" became Plan a step and Snooze a week (the review mark —
  // the card stays away while it's untouched < 7 days). Plan a step writes the next step in place
  // (conductor 2026-10-13): the capture bar opens on "#Project ", so Enter files it there. An area or
  // a domain has no #tag in the command bar, so its Plan a step still opens its page.
  function planStep() {
    const project = row.entity_type === 'project' ? projects.find((p) => p.id === row.entity_id) : undefined
    if (!project) return navigate(to)
    const text = `${projectTag(project, projects)} `
    window.dispatchEvent(new CustomEvent('prefill-command-bar', { detail: text }))
    openCapture()
    const input = document.getElementById(CAPTURE_INPUT_ID) as HTMLInputElement | null
    requestAnimationFrame(() => input?.setSelectionRange(text.length, text.length)) // type after the tag
  }
  return (
    <div
      // Motion 3e (WB-1): markReviewed() looks the card up by this id to play the exit
      // before the stack heals. Same scheme in the Weekly Review sweep.
      id={`slipping-${row.entity_type}:${row.entity_id}`}
      className="kf-lift td-nudge"
      onClick={() => navigate(to)}
      role="link"
    >
      {/* punch 20: the wisteria is the entity's real growth stage, computed by the caller. */}
      <img src={`${A}/wisteria/${stage}.png`} alt="" className="td-nudge-art" />
      <div className="td-nudge-name">{row.entity_name}</div>
      <div className="td-nudge-why">untouched for {Math.floor(row.days_since)} days</div>
      <div className="td-nudge-actions">
        <Button type="button" variant="cta" className="td-btn-sm" onClick={(e) => { e.stopPropagation(); planStep() }}>Plan a step</Button>
        <Button type="button" variant="secondary" className="td-btn-sm" onClick={(e) => { e.stopPropagation(); markReviewed(row, 'Snoozed a week') }}>Snooze a week</Button>
      </div>
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
// today · N" and a chevron; its lists sit under quiet sub-headers (ruling 7).
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
          {/* B D6: a section label (14 semibold ink, sentence case), no rule after it. */}
          <span style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}{summary && ` · ${summary}`}
          </span>
          <span style={{ flex: 1 }} />
          <Icon name="chevright" size={16} style={{ flex: 'none', color: 'var(--ink-faint)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--dur-quick) var(--ease-out)' }} />
        </button>
        {action}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 12 }}>{children}</div>}
    </section>
  )
}

function Empty({ line }: { line: string }) {
  return <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)', padding: '8px 2px' }}>{line}</div>
}
