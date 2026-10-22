import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ContextMenu } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Button, Checkbox, Segmented } from '../../components/kit'
import { Skeleton } from '../../components/States'
import type { Area, CalendarEvent, Domain, Project, Task } from '../../lib/types'
import { completeTaskWithUndo } from '../tasks/api'
import { resolveTag } from '../tasks/taskDisplay'
import { REPEAT_LABELS } from '../tasks/taskMenuSpec'
import { useRowGrammar } from '../tasks/useRowGrammar'
import { deleteEventWithUndo } from './api'
import { dragGuard } from './dragGuard'
import { PlanButton } from './PlanButton'
import { useCardOpen } from './cardOpen'
import { cardDraggable } from './cardDrag'
import { durationLabel } from '../../components/pickerMath'
import { dueWord, footerLine, groupPlan, minutesLabel, PLAN_SORTS, planningTasks, sortPlan, totalLine, type PlanSort, type PlanTab } from './planningMode'
import { railMinutes, type RailTask } from './replan'
import './planning.css'

// ── design-export/Calendar.dc.html §4 — planning mode: the unscheduled rail swollen to ~60% of the
// calendar (4a groups by project; 4b, two days in the strip, one line a task). Cards drag onto the
// agenda strip on the right (FullCalendar's Draggable, as the rail's); a click opens the task (Kai
// 2026-10-17, ./cardOpen), Plan ▾ the calendar's Plan menu, a right-click the task menu. The pure
// half is ./planningMode. ──

const TAB_KEY = 'kf.calPlanTab'
const SORT_KEY = 'kf.calPlanSort'
/** A group shows this many cards until its "+N more" is opened. */
const GROUP_CAP = 8

function remembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* private mode — it lasts this visit */
  }
}

// B (D5): metadata in the interface face, sentence case, even digits.
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-faint)' }

function PlanCard({ r, compact, dot, projects, domains, areas, now, onPlan }: {
  r: RailTask
  compact: boolean
  /** 4b's one-line card wears its project's dot. */
  dot: string | null
  projects: Project[]
  domains: Domain[]
  areas: Area[]
  now: Date
  onPlan: (x: number, y: number) => void
}) {
  const { task: t, block } = r
  const grammar = useRowGrammar(t, { projects, domains, areas, canUnschedule: !!block, actions: block ? { unschedule: () => deleteEventWithUndo(block, 'Unscheduled') } : undefined })
  const len = minutesLabel(railMinutes(r))
  const repeat = t.recurrence_rule ? (compact ? '↻' : `↻ ${REPEAT_LABELS[t.recurrence_rule] ?? 'Repeats'}`) : null
  const due = r.late === 0 && t.due_at ? dueWord(t.due_at, now, compact) : null
  const meta = [len, due, repeat].filter(Boolean).join(' · ')
  const open = useCardOpen(t.id)
  return (
    <div
      className={`unscheduled-task cal-plan-card${compact ? ' is-compact' : ''}`}
      {...open}
      data-task-id={t.id}
      data-title={t.title}
      data-duration={railMinutes(r)}
      data-length={durationLabel(railMinutes(r))}
      onContextMenu={grammar.onContextMenu}
    >
      {/* Tick it off without planting it (the rail card's guard: FullCalendar never sees the press). */}
      <span ref={dragGuard(() => completeTaskWithUndo(t))} style={{ display: 'inline-flex', flex: 'none', marginTop: 1 }}>
        <Checkbox checked={false} size={15} label={t.title} />
      </span>
      {compact ? (
        <div className="cal-plan-line">
          <span className="cal-plan-title"><EmojiText text={t.title} /></span>
          <span className="cal-plan-meta">
            {dot && <span className="cal-plan-dot" style={{ background: dot }} />}
            {r.late > 0 && <span style={{ color: 'var(--acc-terra)' }}>Overdue {r.late}d ·&nbsp;</span>}
            {meta}
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cal-plan-title is-wrap"><EmojiText text={t.title} /></div>
          <div className="cal-plan-meta" style={{ marginTop: 5 }}>
            {r.late > 0 && <span style={{ color: 'var(--acc-terra)' }}>Overdue {r.late}d</span>}
            <span>{meta}</span>
          </div>
        </div>
      )}
      {/* Plants it from the menu: Today · Next free slot · Tomorrow · Pick date… — the rail card's own. */}
      <PlanButton title={t.title} onPlan={onPlan} />
      {!compact && (
        <span className="cal-plan-grip" aria-hidden>
          ⠿
        </span>
      )}
      {grammar.menuNode}
    </div>
  )
}

export function PlanningPanel({ tasks, events, loading, projects, domains, areas, days, now, daisy, panelRef, onPlan, onQuickAdd, onLeave }: {
  tasks: Task[]
  /** The year-around-today events (a series' occurrences included). */
  events: CalendarEvent[]
  loading: boolean
  projects: Project[]
  domains: Domain[]
  areas: Area[]
  /** The strip's days: one (4a) or two (4b). */
  days: string[]
  now: Date
  daisy: string
  /** The drop target for a block dragged back off the strip (CalendarGrid's railRef). */
  panelRef: React.RefObject<HTMLDivElement | null>
  onPlan: (r: RailTask, x: number, y: number) => void
  onQuickAdd: (e: React.MouseEvent) => void
  /** "Leave planning mode": the rail and the grid come back. */
  onLeave: () => void
}) {
  const [tab, setTabState] = useState<PlanTab>(() => remembered(TAB_KEY, 'all', ['all', 'today', 'overdue']))
  const [sort, setSortState] = useState<PlanSort>(() => remembered(SORT_KEY, 'due', PLAN_SORTS.map((s) => s.value)))
  const [sortAt, setSortAt] = useState<{ x: number; y: number } | null>(null)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const setTab = (v: PlanTab) => { setTabState(v); remember(TAB_KEY, v) }
  const setSort = (v: PlanSort) => { setSortState(v); remember(SORT_KEY, v) }
  const day = days[0]
  const rows = useMemo(() => sortPlan(planningTasks(tasks, events, now, tab), sort), [tasks, events, tab, sort, day]) // eslint-disable-line react-hooks/exhaustive-deps -- `now` moves each minute; the lists turn with the day
  const compact = days.length > 1
  const tagOf = (t: Task) => resolveTag(t, domains, projects, areas)
  const groups = useMemo(() => groupPlan(rows, (t) => tagOf(t)?.label ?? null), [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // One Draggable on the list: it delegates to `.unscheduled-task`, so cards that come and go need no
  // re-binding (the rail's own pattern).
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!listRef.current) return
    const d = cardDraggable(listRef.current)
    return () => d.destroy()
  }, [])

  const card = (r: RailTask) => {
    const tag = tagOf(r.task)
    return <PlanCard key={r.task.id} r={r} compact={compact} dot={tag ? tag.color ?? 'var(--acc-moss)' : null} projects={projects} domains={domains} areas={areas} now={now} onPlan={(x, y) => onPlan(r, x, y)} />
  }
  const empty = tab === 'overdue' ? 'Nothing overdue.' : tab === 'today' ? 'Nothing left without a time today.' : 'Everything has a time.'

  return (
    // Overdue is a computed list (a block can't be put there); Today takes a block back as due today
    // (calendar/railDrop) — the strip's blocks drop here like on the rail.
    <div ref={panelRef} className="cal-plan" data-section={tab === 'all' ? undefined : tab}>
      <div className="cal-plan-head">
        <div>
          {/* B (D6): the panel's section label — 14px semibold ink, sentence case. */}
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)', fontVariantNumeric: 'tabular-nums' }}>Unscheduled · {rows.length} {rows.length === 1 ? 'task' : 'tasks'}</div>
          <div className="cal-plan-hand">{compact ? 'two days ahead — plant what matters ✿' : 'pick something, plant it on the right ✿'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented
            className="cal-plan-tabs"
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'All' },
              { value: 'today', label: 'Today' },
              { value: 'overdue', label: 'Overdue' },
            ]}
          />
          <button
            type="button"
            className="cal-plan-sort"
            aria-haspopup="menu"
            aria-expanded={!!sortAt}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              setSortAt((cur) => (cur ? null : { x: b.left, y: b.bottom + 4 }))
            }}
          >
            Sort ↕
          </button>
          <Button variant="secondary" onClick={onLeave}>Leave planning mode</Button>
        </div>
      </div>

      <button type="button" className="cal-plan-add" onClick={onQuickAdd}>
        <span className="cal-plan-add-box" aria-hidden />
        <span style={{ flex: 1, textAlign: 'left' }}>Quick add task…</span>
        <span style={MONO}>N</span>
      </button>

      <div ref={listRef} className="cal-plan-list">
        {loading ? (
          <Skeleton rows={4} />
        ) : rows.length === 0 ? (
          <p className="cal-plan-empty">{empty}</p>
        ) : compact ? (
          <div className="cal-plan-cards is-compact">{rows.map(card)}</div>
        ) : (
          groups.map((g) => {
            const tag = g.key === 'none' ? null : tagOf(g.rows[0].task)
            const shown = opened.has(g.key) ? g.rows : g.rows.slice(0, GROUP_CAP)
            return (
              <section key={g.key} className="cal-plan-group">
                <div className="cal-plan-group-head">
                  <span className="cal-plan-dot" style={{ background: tag ? tag.color ?? 'var(--acc-moss)' : 'var(--ink-hairline)' }} />
                  <span style={MONO}>
                    <EmojiText text={tag?.label ?? 'No project'} /> · {g.rows.length} {g.rows.length === 1 ? 'task' : 'tasks'} · {minutesLabel(g.minutes)}
                  </span>
                </div>
                <div className="cal-plan-cards">{shown.map(card)}</div>
                {shown.length < g.rows.length && (
                  <button type="button" className="cal-plan-more" onClick={() => setOpened((s) => new Set(s).add(g.key))}>
                    +{g.rows.length - shown.length} more
                  </button>
                )}
              </section>
            )
          })
        )}
      </div>

      <div className="cal-plan-foot">
        <img src={`/ds/assets/daisy/${daisy}.png`} alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ ...MONO, lineHeight: 1.7 }}>
          {totalLine(rows)}
          <br />
          {footerLine(events, days, now)}
        </div>
      </div>

      {sortAt && (
        <ContextMenu
          position={sortAt}
          onClose={() => setSortAt(null)}
          label="Sort"
          items={PLAN_SORTS.map((s) => ({ label: s.label, hint: s.value === sort ? '✓' : undefined, onClick: () => { setSort(s.value); setSortAt(null) } }))}
        />
      )}
    </div>
  )
}
