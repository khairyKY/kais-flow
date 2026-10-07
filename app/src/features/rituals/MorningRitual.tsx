import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTasks, completeTaskWithUndo, createTask, deleteTasksWithUndo, rescheduleDue, setSomeday, toggleTop3 } from '../tasks/api'
import { usePendingInboxItems, fileToTask, dismissInboxItem } from '../inbox/api'
import { useCalendarEvents, scheduleTask } from '../calendar/api'
import { cairoToIso } from '../calendar/eventTime'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { useGoalStore } from '../today/goalStore'
import { useRowGrammar } from '../tasks/useRowGrammar'
import { RowMenuButton } from '../tasks/SwipeRow'
import { formatDuration } from '../tasks/taskDisplay'
import { Button, Checkbox, Chip, Star } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { TimePicker } from '../../components/TimePicker'
import { ProjectPicker } from '../../components/ProjectPicker'
import { useIsMobile } from '../../components/BottomSheet'
import { busyOnDay, fromMin, toMin } from '../../components/pickerMath'
import { cairoDateKey, scheduleToday, scheduleTomorrow } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { toastAction } from '../../lib/undo'
import { playSound } from '../../lib/sounds'
import { logRitualFinished, logRitualStep, useDraft, useRitualStepsToday, useSeedsFor } from './api'
import { loopDayKey, morningPreselection, top3Diff } from './loopDay'
import {
  DAY_FROM,
  DAY_TO,
  PLAN_STEPS,
  cairoMin,
  captureMeta,
  carryMeta,
  carryRows,
  headerDate,
  pickCandidates,
  planStatus,
  planWorkload,
  searchOpen,
  span,
  suggestTimes,
  swapIn,
  toPlace,
  withPick,
  type CarryChoice,
  type CarryEntry,
  type Chosen,
  type PickIn,
  type Slot,
} from './ritualLogic'
import { Collapsed, KitRow, Meta, RitualFoot, RitualSheet, Section, Segmented, WorkloadLine } from './RitualChrome'
import type { InboxItem, Project, Domain, Task } from '../../lib/types'

// ── Plan my day — design-export/Plan.dc.html 6a–6m + SCREENS-2026-09-28 §Plan my day rulings 1–8.
// One scrolling sheet: Carry-over · Inbox · Pick your 3 · Suggested times, a sticky footer with the
// workload and the one terra action. Carry-over and Inbox choices apply at once; the picks and
// times are a draft (kept across ✕ / Back / swipe-down / reload for this loop day) that "Start the
// day" writes. Each finished section logs its step, so a plan closed half-way reads "2 of 4 done" +
// Resume on Today (6m). Kai: Plan my day is always TODAY's plan — after 17:00 the Today card offers
// Shut down instead (no 6g "Plan tomorrow"); the morning always suggests times. Kai 2026-10-03:
// Pick your 3 searches every open task in place, and a suggested time needs no ✓ — Start the day
// places every pick that has a time. ──

interface PlanDraft {
  carry: CarryEntry[]
  /** null until touched, so the pre-selection follows the seeds as they load. */
  picks: string[] | null
  chosen: Record<string, Chosen>
}

const CARRY_OPTIONS: { value: CarryChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'someday', label: 'Someday' },
]

export function MorningRitual({ onClose }: { onClose: () => void }) {
  const now = new Date()
  const today = cairoDateKey(now)
  const isMobile = useIsMobile()
  const { data: tasks = [], isPending } = useTasks()
  const { data: inbox = [] } = usePendingInboxItems()
  const { data: events = [] } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const { data: stepsToday } = useRitualStepsToday()
  const setGoal = useGoalStore((s) => s.setGoal)
  const seeds = useSeedsFor(loopDayKey(now))
  const [draft, setDraft, clearDraft] = useDraft<PlanDraft>('plan', loopDayKey(now), () => ({ carry: [], picks: null, chosen: {} }))
  const finished = useRef(false)

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const carry = carryRows(tasks, draft.carry, now)
  const carried = new Set(carry.map((e) => e.id))
  const selection = (draft.picks ?? morningPreselection(seeds, tasks)).filter((id) => byId.get(id)?.status === 'todo')
  const candidates = pickCandidates(tasks, seeds, selection, carried, now)
  const seedIds = new Set(seeds.map((t) => t.id))
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name

  // Kai 2026-10-03: pick from every open task right here — search, or "Show all" under the
  // suggestions. Esc clears the search before it closes the sheet; "/" finds it on desktop.
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const open = searchOpen(tasks, projects, candidates, '')
  const pool = open.filter((t) => !carried.has(t.id))
  const found = query.trim() ? searchOpen(tasks, projects, candidates, query) : null
  const listed = found ?? (showAll ? pool : candidates)
  useEscapeStack(query !== '', () => setQuery(''))
  const [changing, setChanging] = useState<string | null>(null)
  useEffect(() => {
    if (isMobile || changing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || (e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile, changing])

  // Suggested times (ruling 5): every pick gets a slot on today's calendar, 09–18.
  const busy = busyOnDay(events, today)
  const nowMin = cairoMin(now)
  const pickIns: PickIn[] = selection.flatMap((id) => {
    const t = byId.get(id)
    if (!t) return []
    const b = events.find((e) => e.task_id === id && !e.all_day && !e.deleted_at && cairoDateKey(new Date(e.starts_at)) === today)
    return [{ id, dur: draft.chosen[id]?.dur ?? t.duration_min ?? 30, booked: b ? { start: cairoMin(new Date(b.starts_at)), end: cairoMin(new Date(b.ends_at)) } : undefined }]
  })
  const slots = suggestTimes(pickIns, busy, draft.chosen, nowMin)
  const workload = planWorkload(busy, pickIns, slots, nowMin)

  // Each section finished here logs its step once (the Today card's "2 of 4 done", 6m). Only a
  // change made on this screen counts — a section that was already empty when it opened doesn't.
  // Suggested times counts once every pick's time is yours (set, "No time", or already booked).
  const flags: Record<(typeof PLAN_STEPS)[number], boolean> = {
    overdue: carry.every((e) => e.choice),
    inbox: inbox.length === 0,
    top3: selection.length >= 3,
    block: slots.length > 0 && slots.every((s) => s.kind === 'booked' || !!draft.chosen[s.id]),
  }
  const prevFlags = useRef(flags)
  const loggedHere = useRef(new Set<string>())
  useEffect(() => {
    for (const step of PLAN_STEPS) {
      if (flags[step] && !prevFlags.current[step] && !isPending && !stepsToday?.morning.has(step) && !loggedHere.current.has(step)) {
        loggedHere.current.add(step)
        logRitualStep('morning', step)
      }
    }
    prevFlags.current = flags
  })

  // 6f: nothing due, nothing starred → "Clear morning — pick your 3" with an input. Stays up while
  // the typed picks fill the list, until three are picked.
  const [clearMorning, setClearMorning] = useState(false)
  useEffect(() => {
    if (!isPending && candidates.length === 0) setClearMorning(true)
  }, [isPending, candidates.length])

  function choose(e: CarryEntry, t: Task, choice: CarryChoice) {
    if (choice === 'today') rescheduleDue(t, scheduleToday())
    else if (choice === 'tomorrow') rescheduleDue(t, scheduleTomorrow())
    else setSomeday(t, true)
    setDraft((d) => ({
      carry: carry.map((x) => (x.id === e.id ? { ...x, choice } : x)),
      picks: choice === 'today' ? d.picks : (d.picks ?? selection).filter((id) => id !== t.id),
    }))
  }
  function rollAll() {
    for (const e of carry) {
      const t = byId.get(e.id)
      if (t && e.choice !== 'tomorrow') rescheduleDue(t, scheduleTomorrow())
    }
    setDraft((d) => ({ carry: carry.map((x) => ({ ...x, choice: 'tomorrow' })), picks: (d.picks ?? selection).filter((id) => !carried.has(id)) }))
  }
  function drop(t: Task) {
    deleteTasksWithUndo([t]) // Trash + "Moved to Trash · Undo", never a confirm
    setDraft((d) => ({ picks: (d.picks ?? selection).filter((id) => id !== t.id) }))
  }
  // Ruling 4: a 4th star shows the swap toast (6l); the first pick is the goal.
  function togglePick(t: Task) {
    const r = withPick(selection, t.id)
    if (r.full) {
      toastAction('Top 3 is full — swap one out?', 'Swap', () => setDraft((d) => ({ picks: swapIn(d.picks ?? selection, t.id) })))
      return
    }
    setDraft({ picks: r.picks })
    // Ruling 3: starring a carried row implies Today.
    const e = carry.find((x) => x.id === t.id)
    if (e && r.picks.includes(t.id) && e.choice !== 'today') choose(e, t, 'today')
  }
  function setChosen(id: string, c: Chosen) {
    setDraft((d) => ({ chosen: { ...d.chosen, [id]: c } }))
  }
  function addTyped(title: string) {
    const t = createTask({ title, dueAt: scheduleToday() })
    const r = withPick(selection, t.id)
    if (!r.full) setDraft({ picks: r.picks })
  }

  // "Start the day" (6 intro): the picks become the Top 3 (the first one the goal), every pick with
  // a time (suggested or set) goes on the calendar, every section counts as walked, and the ritual
  // is finished.
  function start(close: () => void) {
    const { unstar, star } = top3Diff(selection, tasks)
    unstar.forEach(toggleTop3)
    star.forEach(toggleTop3)
    setGoal(selection[0] ?? null)
    for (const s of toPlace(slots)) {
      const t = byId.get(s.id)
      if (t) scheduleTask(t, cairoToIso(today, fromMin(s.start)), cairoToIso(today, fromMin(s.end)))
    }
    for (const step of PLAN_STEPS) if (!stepsToday?.morning.has(step) && !loggedHere.current.has(step)) logRitualStep('morning', step)
    logRitualFinished('morning', [...PLAN_STEPS])
    playSound('ritual_done')
    finished.current = true
    close()
  }

  const pickMeta = (t: Task, i: number) => [
    i === 0 && <Meta key="g" tone="var(--acc-gold)">✶ Goal</Meta>,
    seedIds.has(t.id) && (
      <Meta key="s" tone="var(--acc-sage-text)">
        <Icon name="today" size={16} />
        Seed
      </Meta>
    ),
    projectName(t.project_id) && <Meta key="p" dot="var(--acc-moss)">{projectName(t.project_id)}</Meta>,
    t.due_at && cairoDateKey(new Date(t.due_at)) === today && <Meta key="d">Due today</Meta>,
    t.duration_min != null && <Meta key="m">{formatDuration(t.duration_min)}</Meta>,
  ]
  const pickIndex = (id: string) => selection.indexOf(id)

  const carrySection =
    carry.length === 0 ? (
      <Collapsed label="Carry-over" line="Nothing carried over ✿" />
    ) : (
      <>
        <Section first label={`Carry-over · ${carry.length}`} link={{ label: 'Roll all to tomorrow', onClick: rollAll }} />
        {carry.map((e) => {
          const t = byId.get(e.id)!
          const i = pickIndex(t.id)
          return (
            <PlanRow
              key={e.id}
              task={t}
              picked={i >= 0}
              onStar={() => togglePick(t)}
              projects={projects}
              domains={domains}
              actions={{ tomorrow: () => choose(e, t, 'tomorrow'), delete: () => drop(t), someday: () => choose(e, t, 'someday') }}
              meta={[
                i === 0 && <Meta key="g" tone="var(--acc-gold)">✶ Goal</Meta>,
                carryMeta(e.due, now) && <Meta key="o" tone={carryMeta(e.due, now)!.startsWith('Overdue') ? 'var(--sig-overdue)' : undefined}>{carryMeta(e.due, now)}</Meta>,
                t.duration_min != null && <Meta key="m">{formatDuration(t.duration_min)}</Meta>,
              ]}
              below={
                <div className="rt-below">
                  <Segmented label={`When: ${t.title}`} options={CARRY_OPTIONS} value={e.choice ?? null} onChange={(c) => choose(e, t, c)} />
                  <Button type="button" variant="ghost" className="rt-drop" icon={<Icon name="delete" size={20} />} onClick={() => drop(t)}>
                    Drop
                  </Button>
                </div>
              }
            />
          )
        })}
      </>
    )

  const inboxSection =
    inbox.length === 0 ? (
      <Collapsed label="Inbox" line="Inbox zero ✿" />
    ) : (
      <>
        <Section label={`Inbox · ${inbox.length}`} />
        {inbox.map((item) => (
          <InboxRow key={item.id} item={item} now={now} projects={projects} domains={domains} />
        ))}
      </>
    )

  const picksSection = (
    <>
      <Section label={`Pick your 3 · ${selection.length}/3`} />
      {open.length > 0 && (
        <div className="rt-search">
          {/* No autoFocus: on a phone the keyboard stays down until the field is tapped. */}
          <input
            ref={searchRef}
            type="search"
            className="rt-input"
            value={query}
            placeholder="Search all tasks…"
            aria-label="Search all tasks"
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {clearMorning && (
        <ClearMorning onAdd={addTyped} full={selection.length >= 3} title={candidates.length === 0} />
      )}
      {listed.map((t) => (
        // A carried row found by the search is the Carry-over row's twin — its own DOM id.
        <PlanRow key={t.id} rowId={carried.has(t.id) ? `rt-found-${t.id}` : undefined} task={t} picked={selection.includes(t.id)} onStar={() => togglePick(t)} projects={projects} domains={domains} meta={pickMeta(t, pickIndex(t.id))} />
      ))}
      {found?.length === 0 && <div className="rt-hint">No open task matches “{query.trim()}”.</div>}
      {!found && pool.length > candidates.length && (
        <div className="rt-more">
          <button type="button" className="rt-link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${pool.length} open tasks`}
            <Icon name="chevdown" size={16} style={showAll ? { transform: 'rotate(180deg)' } : undefined} />
          </button>
        </div>
      )}
    </>
  )

  const changingSlot = slots.find((s) => s.id === changing)
  const timesSection =
    slots.length === 0 ? (
      <Collapsed label="Suggested times" line="Pick something first" />
    ) : (
      <>
        <Section label="Suggested times" />
        {slots.every((s) => s.kind === 'noslot') && (
          <div className="rt-warn">
            <Icon name="alert" size={20} />
            <span>Your calendar is full from {fromMin(Math.max(DAY_FROM, Math.ceil(nowMin / 15) * 15))} to 18:00.</span>
          </div>
        )}
        {toPlace(slots).length > 0 && <div className="rt-hint">Times are suggestions — tap one to change it. Start the day puts them on your calendar.</div>}
        <Timeline busy={busy} slots={slots} changing={changing} />
        {slots.map((s) => (
          <TimeRow key={s.id} task={byId.get(s.id)!} slot={s} changing={changing === s.id} onChange={() => setChanging(s.id)} />
        ))}
      </>
    )

  const changingTask = changing ? byId.get(changing) : undefined
  const dur = changing ? (pickIns.find((p) => p.id === changing)?.dur ?? 30) : 30

  return (
    <>
      <RitualSheet
        title="Plan my day"
        sub={`${headerDate(now)} · about 3 minutes`}
        onClose={() => {
          if (finished.current) clearDraft()
          onClose()
        }}
        left={
          <>
            {carrySection}
            {inboxSection}
          </>
        }
        right={
          <>
            {picksSection}
            {timesSection}
          </>
        }
        footer={(close) => (
          <RitualFoot
            workload={<WorkloadLine text={workload.text} over={workload.over ? `${span(workload.over)} over` : undefined} />}
            status={planStatus(carry, slots)}
            cta={
              <Button type="button" onClick={() => start(close)}>
                Start the day
              </Button>
            }
          />
        )}
      />
      {changingTask && (
        <TimePicker
          day={today}
          title={changingTask.title}
          value={changingSlot && (changingSlot.kind === 'accepted' || changingSlot.kind === 'suggested' || changingSlot.kind === 'booked') ? fromMin(changingSlot.start) : null}
          duration={dur}
          events={events}
          onDone={(hhmm, d) => setChosen(changingTask.id, { at: toMin(hhmm), dur: d ?? dur })}
          onClear={() => setChosen(changingTask.id, { at: null, dur })}
          onClose={() => setChanging(null)}
        />
      )}
    </>
  )
}

/** A kit task row in the plan: [check][title + meta][star][⋯], the row grammar (swipe right =
 * Tomorrow, left = Drop/Delete, ⋯), and the star = this plan's pick (ruling 3–4). */
function PlanRow({ task, rowId, picked, onStar, meta, below, projects, domains, actions }: {
  task: Task
  rowId?: string
  picked: boolean
  onStar: () => void
  meta: ReactNode[]
  below?: ReactNode
  projects: Project[]
  domains: Domain[]
  actions?: { tomorrow?: () => void; delete?: () => void; someday?: () => void }
}) {
  const g = useRowGrammar(task, { projects, domains, actions: { top3: onStar, ...actions } })
  return (
    <KitRow
      task={task}
      meta={meta}
      below={below}
      selected={g.menuOpen}
      lead={<Checkbox checked={false} label={task.title} bloom={picked} onChange={() => completeTaskWithUndo(task)} />}
      trail={
        <>
          <Star on={picked} label={task.title} onChange={onStar} />
          <RowMenuButton title={task.title} onOpen={g.openMenu} />
        </>
      }
      swipe={{ ...g.swipeProps, overlay: g.menuNode, onContextMenu: g.onContextMenu, ...(rowId && { id: rowId }) }}
    />
  )
}

/** Ruling 7: an inbox row is not a task yet — no checkbox. Capture meta, a tappable project chip
 * (the capture parse chip), Dismiss (ghost) and File (secondary), each with its Undo toast. */
function InboxRow({ item, now, projects, domains }: { item: InboxItem; now: Date; projects: Project[]; domains: Domain[] }) {
  const parsed = (item.ai_parse as { project_id?: string | null } | null)?.project_id ?? null
  const [project, setProject] = useState<{ id: string | null; domain: string | null }>({ id: parsed, domain: projects.find((p) => p.id === parsed)?.domain_id ?? null })
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const slot = useRef<HTMLSpanElement>(null)
  const name = projects.find((p) => p.id === project.id)?.name
  return (
    <div className="rt-inbox">
      <div className="rt-title">{item.raw_text}</div>
      <div className="rt-meta">
        <span>{captureMeta(item, now)}</span>
      </div>
      <div className="rt-inbox-acts">
        <span className="rt-chip-slot" ref={slot}>
          <Chip
            tone="project"
            onClick={() => {
              const r = slot.current?.getBoundingClientRect()
              setAt({ x: r?.left ?? 0, y: r?.bottom ?? 0 })
            }}
          >
            {name ?? 'No project'}
          </Chip>
        </span>
        <Button type="button" variant="ghost" onClick={() => dismissInboxItem(item)}>
          Dismiss
        </Button>
        <Button type="button" variant="secondary" onClick={() => fileToTask(item, { projectId: project.id, domainId: project.domain })}>
          File
        </Button>
      </div>
      {at && <ProjectPicker position={at} projects={projects} domains={domains} currentProjectId={project.id} onSelect={(id, domain) => setProject({ id, domain })} onClose={() => setAt(null)} />}
    </div>
  )
}

/** 6f: a clear morning — type three things; each gets a time below. */
function ClearMorning({ onAdd, full, title }: { onAdd: (title: string) => void; full: boolean; title: boolean }) {
  const [text, setText] = useState('')
  return (
    <div className="rt-clear">
      {title && (
        <>
          <div className="rt-clear-title">Clear morning — pick your 3.</div>
          <div className="rt-clear-sub">Nothing is due and nothing is starred. Type three things; each gets a time below.</div>
        </>
      )}
      {!full && (
        <input
          className="rt-input"
          style={{ margin: '12px 0 4px' }}
          value={text}
          placeholder="Add a task…"
          aria-label="Add a task"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onAdd(text.trim())
              setText('')
            }
          }}
        />
      )}
    </div>
  )
}

/** The 09–18 mini timeline + legend (ruling 5): calendar = lavender, suggested = dashed sage,
 * set by you = sage fill, being changed = focus ring. */
function Timeline({ busy, slots, changing }: { busy: { start: number; end: number }[]; slots: Slot[]; changing: string | null }) {
  const x = (m: number) => `${((Math.min(DAY_TO, Math.max(DAY_FROM, m)) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100}%`
  const w = (a: number, b: number) => `${((Math.min(DAY_TO, b) - Math.max(DAY_FROM, a)) / (DAY_TO - DAY_FROM)) * 100}%`
  const blocks = [
    ...busy.filter((b) => b.end > DAY_FROM && b.start < DAY_TO).map((b) => ({ ...b, k: 'event' })),
    ...slots.filter((s) => (s.kind === 'suggested' || s.kind === 'accepted') && s.start < DAY_TO && s.end > DAY_FROM).map((s) => ({ ...s, k: s.id === changing ? 'changing' : s.kind })),
  ]
  return (
    <div className="rt-tl" aria-hidden>
      <div className="rt-tl-bar">
        {[12, 15].map((h) => (
          <span key={h} className="rt-tl-tick" style={{ left: x(h * 60) }} />
        ))}
        {blocks.map((b, i) => (
          <span key={i} className={`rt-tl-b rt-k-${b.k}`} style={{ left: x(b.start), width: w(b.start, b.end) }} />
        ))}
      </div>
      <div className="rt-tl-hours">
        {[9, 12, 15, 18].map((h, i) => (
          <span key={h} style={{ left: x(h * 60), transform: `translateX(${i === 0 ? '0' : i === 3 ? '-100%' : '-50%'})` }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <div className="rt-legend">
        {[['event', 'Calendar'], ['suggested', 'Suggested'], ['accepted', 'Set by you']].map(([k, label]) => (
          <span key={k}>
            <span className={`rt-sw rt-k-${k}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A suggested-time row: one time pill (tap = the Time Picker) — dashed while it's our suggestion,
 * solid once it's yours (Kai 2026-10-03: the ✓ beside it confused; there's nothing to accept, Start
 * the day places it). No free slot, or "No time" → a secondary "Pick one". */
function TimeRow({ task, slot, changing, onChange }: { task: Task; slot: Slot; changing: boolean; onChange: () => void }) {
  const dur = slot.end - slot.start
  const loose = slot.kind === 'noslot' || slot.kind === 'untimed'
  const meta = [
    !loose && <Meta key="m">{formatDuration(dur)}</Meta>,
    loose && task.duration_min != null && <Meta key="m">{formatDuration(task.duration_min)}</Meta>,
    slot.after && <Meta key="a">after {slot.after}</Meta>,
    slot.kind === 'booked' && <Meta key="b">On the calendar</Meta>,
    slot.late && <Meta key="l" tone="var(--sig-amber)">Runs past 18:00</Meta>,
    slot.kind === 'noslot' && <Meta key="n" tone="var(--sig-amber)">No free slot</Meta>,
    slot.kind === 'untimed' && <Meta key="u">No time</Meta>,
  ].filter(Boolean)
  const mine = slot.kind === 'accepted' || slot.kind === 'booked'
  return (
    <div className="rt-trow" id={`rt-time-${task.id}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rt-title">{task.title}</div>
        {meta.length > 0 && <div className="rt-meta">{meta}</div>}
      </div>
      {loose ? (
        <Button type="button" variant="secondary" icon={<Icon name="clock" size={20} />} onClick={onChange}>
          Pick one
        </Button>
      ) : (
        <button
          type="button"
          className={`rt-pill${changing ? ' is-changing' : mine ? ' rt-k-accepted is-set' : ' is-suggested'}`}
          onClick={onChange}
          aria-label={`${mine ? 'Time' : 'Suggested time'} for "${task.title}": ${fromMin(slot.start)}–${fromMin(slot.end)}. Change it`}
        >
          {fromMin(slot.start)}–{fromMin(slot.end)}
        </button>
      )}
    </div>
  )
}
