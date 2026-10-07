import { useEffect, useRef, useState } from 'react'
import { useOpenTask } from './openTask'
import { EmojiText } from '../../components/EmojiText'
import './TaskRow.css'
import { completeTaskWithUndo, reopenTaskWithUndo, toggleTop3, rescheduleDue } from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { daysOverdue, formatDuration, priorityColor, priorityFlag, resolveTag, rowLabels } from './taskDisplay'
import { checkAction } from './completion'
import { scheduleToday } from '../../lib/dateShortcuts'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { Checkbox, Chip } from '../../components/kit'
import { useMotionEnabled } from '../../lib/motion'
import { RowMenuButton, SelectCircle, SwipeRow } from './SwipeRow'
import type { BulkActions } from './TaskMenu'
import { useRowGrammar } from './useRowGrammar'
import type { Task } from '../../lib/types'

export type { BulkActions } from './TaskMenu'

// ── Shared task row — pixel contract: Tasks.dc.html 1a/1b (open), 2a/2c (done),
// 2b (someday). W1 Today and W3 Planning import this; keep the prop surface additive.
// Gestures + ⋯ menu: the one row grammar (./SwipeRow, ./TaskMenu — Flow Audit §4). ──

const A = '/ds/assets'

function PriorityFlag({ color }: { color: string }) {
  return (
    <svg width="9" height="11" viewBox="0 0 12 14" fill="none" style={{ flex: 'none' }}>
      <path d="M2.4 1v12.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.4 1.7h7.2L7.9 4l1.7 2.3H2.4z" fill={color} />
    </svg>
  )
}

const metaStyle: React.CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-meta)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  display: 'flex',
  // 4px between wrapped lines, 14px between items: on a phone the details wrap, and a flat 14px
  // gap spread one task's details over three widely spaced lines.
  gap: '4px 14px',
  alignItems: 'center',
  flexWrap: 'wrap',
}

// The kit's bordered chip, sized down to sit in a mono meta line (its own height and 9px desktop
// type are for standalone chips).
const LABEL_CHIP: React.CSSProperties = { height: 'auto', padding: '1px 6px', fontSize: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit' }

/** A row's labels in its meta (Kai 2026-10-03): up to two kit chips, then "+N". */
export function LabelChips({ labels }: { labels: readonly string[] | null | undefined }) {
  const { shown, more } = rowLabels(labels)
  return (
    <>
      {shown.map((l) => (
        <Chip key={l} tone="bordered" style={LABEL_CHIP}>
          {l}
        </Chip>
      ))}
      {more > 0 && <span aria-label={`${more} more label${more === 1 ? '' : 's'}`}>+{more}</span>}
    </>
  )
}

export interface TaskRowProps {
  task: Task
  highlighted?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  /** Something on the page is selected. On a phone every tap then toggles a row, and the select
   * circle replaces the checkbox (DS-CHANGELOG §3 "Selection mode"). */
  selecting?: boolean
  /** When 2+ tasks are selected, the row's actions menu acts on all of them instead of just this row. */
  bulk?: BulkActions
  /** Selection still works (Ctrl/Cmd+click or the menu's Select, bulk actions in the menu) — this only
   * hides the visible checkbox, for surfaces (the Planning board) that select without one. */
  hideCheckbox?: boolean
  /** Dashed bottom hairline — off for the last row in a group. Default true. */
  border?: boolean
  /** Today's "goal of the day" task id — shows the ✶ Goal chip + a solid star. */
  goalTaskId?: string | null
  /** Most recently completed task id this session — shows "just now ✿" + a loose petal instead of a time. */
  justCompletedId?: string | null
  /** Defaults to `completeTaskWithUndo` (punch 6: toast "Done" + Undo). TasksPage supplies one
   * that also tracks the grace window a just-checked row needs to stay visible in its group so
   * the check/petal animation can play. */
  onComplete?: (task: Task) => void
  /** Defaults to `reopenTaskWithUndo` (Polish F2a: toast "Reopened" + Undo) — the filled ✓, the
   * menu's Reopen, and a second click on a just-checked box. TasksPage supplies one that also
   * ends the row's grace window. */
  onReopen?: (task: Task) => void
}

export function TaskRow({
  task,
  highlighted,
  selected,
  onToggleSelect,
  selecting,
  bulk,
  hideCheckbox,
  border = true,
  goalTaskId,
  justCompletedId,
  onComplete = (t: Task) => void completeTaskWithUndo(t),
  onReopen = (t: Task) => void reopenTaskWithUndo(t),
}: TaskRowProps) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const openTask = useOpenTask()
  const [schedulePos, setSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const motionOn = useMotionEnabled()

  const done = task.status === 'done'
  // `checking` never resets once set — reopening a done row (checkbox click or the
  // "Reopen" menu item) would otherwise render it with a stale strikethrough/checked look.
  const wasDone = useRef(done)
  useEffect(() => {
    if (wasDone.current && !done) setChecking(false)
    wasDone.current = done
  }, [done])
  const someday = task.someday && !done
  const tag = resolveTag(task, domains, projects, areas)
  const overdueDays = !done && !task.someday && task.due_at ? daysOverdue(task.due_at) : 0
  const overdue = overdueDays > 0
  const inProgress = !done && !!task.scheduled_start
  const isGoal = task.top3 && !!goalTaskId && task.id === goalTaskId
  const justCompleted = done && !!justCompletedId && task.id === justCompletedId

  // Polish F2a: inside Tasks' grace window a just-checked row is still drawn open with its box
  // checked — a second click there used to complete it again. It now reopens (checkAction).
  function handleCheck() {
    if (checkAction(done, checking) === 'reopen') {
      handleReopen()
      return
    }
    setChecking(true)
    onComplete(task)
  }

  function handleReopen() {
    setChecking(false)
    onReopen(task)
  }

  // J-3 (K-d, 2026-09-24): right-click never changes the selection. The menu acts on this row, or
  // on the whole selection when this row is part of it (bulk).
  const grammar = useRowGrammar(task, { projects, domains, selected, onToggleSelect, selecting, bulk, actions: { reopen: handleReopen } })

  // Ctrl/Cmd+click toggles selection — the mouse path on surfaces with no checkbox (Planning
  // board). Capture phase so it never also completes/stars; DOM-contains check skips clicks
  // bubbling up (via the React tree) from this row's portaled menus.
  function selectClick(e: React.MouseEvent) {
    if (!(e.ctrlKey || e.metaKey) || !onToggleSelect || !e.currentTarget.contains(e.target as Node)) return
    e.preventDefault()
    e.stopPropagation()
    onToggleSelect()
  }

  // J-8: tap the row = open the task. (A tap on a row swiped open closes it instead — SwipeRow.)
  const openDetail = () => openTask(task.id)

  const rowStyle: React.CSSProperties = {
    borderBottom: border ? '1px dashed var(--line-dashed)' : 'none',
    boxShadow: highlighted ? '0 0 0 3px color-mix(in srgb, var(--acc-sage) 28%, transparent)' : undefined,
    background: selected || grammar.menuOpen ? 'var(--select-bg)' : undefined,
    outline: 'none',
  }
  const more = !grammar.selecting && <RowMenuButton title={task.title} onOpen={grammar.openMenu} />

  // ── Done — fallen petals (2a / 2c) ──
  if (done) {
    return (
      <div
        id={`task-${task.id}`}
        className="task-row kf-lift"
        tabIndex={highlighted ? 0 : -1}
        onContextMenu={grammar.onContextMenu}
        style={{ ...rowStyle, position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 2px', opacity: justCompleted ? 0.55 : 1 }}
      >
        <span
          onClick={handleReopen}
          title="Reopen"
          style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 11, flex: 'none', cursor: 'pointer' }}
        >
          ✓
        </span>
        <span onClick={openDetail} style={{ flex: 1, fontSize: 15, color: 'var(--ink-hairline)', textDecoration: 'line-through', cursor: 'pointer' }}><EmojiText text={task.title} /></span>
        {justCompleted ? (
          // deviation(2026-07-19 X3): hand notes ride --ink-muted so night matches Night.dc (#c9c0d8)
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)' }}>just now ✿</span>
        ) : (
          <>
            {tag && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
                {tag.label}
              </span>
            )}
            {task.completed_at && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)' }}>
                {new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </>
        )}
        {more}
        {justCompleted && <span className="tr-petal" style={{ left: 24, top: 4, transform: 'rotate(35deg)' }} />}
        {grammar.menuNode}
      </div>
    )
  }

  // ── Someday — the quiet shelf (2b) ──
  if (someday) {
    return (
      <SwipeRow
        id={`task-${task.id}`}
        className="task-row tr-someday kf-lift"
        tabIndex={highlighted ? 0 : -1}
        onContextMenu={grammar.onContextMenu}
        onClickCapture={selectClick}
        style={{ ...rowStyle, margin: '0 -10px' }}
        contentStyle={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px' }}
        {...grammar.swipeProps}
        overlay={
          <>
            {grammar.menuNode}
            {schedulePos && <ScheduleMenu position={schedulePos} title={task.title} onClose={() => setSchedulePos(null)} onSchedule={(iso, _min, timed) => rescheduleDue(task, iso, timed)} />}
          </>
        }
      >
        {grammar.selecting ? <SelectCircle on={!!selected} title={task.title} /> : <Checkbox checked={false} size={18} onChange={handleCheck} label={task.title} />}
        <div onClick={openDetail} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ fontSize: 15, color: 'var(--ink-body)' }}><EmojiText text={task.title} /></div>
          {tag && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
              {tag.label}
            </div>
          )}
        </div>
        <span
          className="tr-someday-hover"
          onClick={() => rescheduleDue(task, scheduleToday())}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}
        >
          → Today
        </span>
        <span
          className="tr-someday-hover"
          onClick={(e) => setSchedulePos({ x: e.clientX, y: e.clientY })}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}
        >
          Schedule ▾
        </span>
        {more}
      </SwipeRow>
    )
  }

  // ── Open — the main list (1a / 1b) ──
  return (
    <SwipeRow
      id={`task-${task.id}`}
      // Motion 4a (WB-1): `overflow: hidden` (the swipe layers need it) clips the hover
      // shadow, so this variant reads the lift as travel only.
      className={`task-row kf-lift${checking ? ' tr-checking' : ''}`}
      tabIndex={highlighted ? 0 : -1}
      onContextMenu={grammar.onContextMenu}
      onClickCapture={selectClick}
      style={rowStyle}
      contentStyle={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 2px' }}
      {...grammar.swipeProps}
      overlay={grammar.menuNode}
    >
      {!hideCheckbox && onToggleSelect && (
        <span
          onClick={onToggleSelect}
          className={selected ? 'tr-select is-on kf-hit' : 'tr-select task-row-hover kf-hit'}
          style={{ width: 14, height: 14, marginTop: 3, flex: 'none', borderRadius: 4, border: '1.5px solid var(--acc-sage)', background: selected ? 'var(--acc-sage)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', lineHeight: 1, cursor: 'pointer' }}
        >
          {selected ? '✓' : ''}
        </span>
      )}
      <span style={{ position: 'relative', marginTop: 2 }}>
        {grammar.selecting ? (
          <SelectCircle on={!!selected} title={task.title} />
        ) : (
          <Checkbox
            label={task.title}
            checked={checking}
            size={18}
            bloom={task.top3}
            onChange={handleCheck}
            style={checking ? { background: 'var(--sig-done)', boxShadow: 'none' } : overdue ? { borderColor: 'var(--acc-terra)' } : undefined}
          />
        )}
        {checking && motionOn && task.top3 && <span className="tr-petal tr-petal-live" style={{ right: -5, bottom: -3, transform: 'rotate(40deg)' }} />}
      </span>

      <div onClick={openDetail} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={checking ? 'tr-title-strike' : undefined} style={{ fontSize: 15.5, color: 'var(--ink-body)' }}><EmojiText text={task.title} /></span>
          {inProgress && <img src={`${A}/cherry/opening.png`} alt="in progress" style={{ height: 19, filter: 'var(--shadow-drop-sm)' }} />}
        </div>
        <div style={metaStyle}>
          {tag && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
              {tag.label}
            </span>
          )}
          {overdue && <span style={{ color: 'var(--sig-overdue)' }}>Overdue {overdueDays}d</span>}
          {inProgress && <span style={{ color: 'var(--kf-chip-tasks, #8A4A58)' }}>In progress</span>}
          {inProgress && task.scheduled_start && (
            <span>
              {new Date(task.scheduled_start).toLocaleDateString([], { weekday: 'short' })}{' '}
              {new Date(task.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
          {task.duration_min != null && <span>{formatDuration(task.duration_min)}</span>}
          {priorityFlag(task.priority) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: priorityColor(task.priority) ?? 'var(--acc-terra)' }}>
              <PriorityFlag color={priorityColor(task.priority) ?? 'var(--acc-terra)'} />
              {`P${task.priority}`}
            </span>
          )}
          {task.recurrence_rule && <span>↻</span>}
          {isGoal && <span style={{ color: 'var(--acc-gold)' }}>✶ Goal</span>}
          <LabelChips labels={task.labels} />
        </div>
      </div>

      {!grammar.selecting && (
        <span
          onClick={() => toggleTop3(task)}
          title={task.top3 ? 'Remove from Top 3' : 'Add to Top 3'}
          className="kf-hit"
          style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--line-solid)', fontSize: 16, lineHeight: 1, cursor: 'pointer', flex: 'none', marginTop: 1 }}
        >
          {task.top3 ? '★' : '☆'}
        </span>
      )}
      {more}
    </SwipeRow>
  )
}
