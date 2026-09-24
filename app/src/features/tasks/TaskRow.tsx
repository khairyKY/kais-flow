import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
import './TaskRow.css'
import { settleSwipeX, DRAG_THRESHOLD, SWIPE_LEFT, SWIPE_RIGHT } from './swipe'
import {
  completeTask,
  uncompleteTask,
  toggleTop3,
  snoozeTask,
  setSomeday,
  setProject,
  setRecurrence,
  setReminder,
  setPriority,
  setDuration,
  rescheduleDue,
  deleteTask,
} from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { daysOverdue, formatDuration, priorityColor, priorityFlag, resolveTag } from './taskDisplay'
import { shortcutHint } from './listShortcuts'
import { scheduleToday } from '../../lib/dateShortcuts'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { ConfirmCard } from '../projects/ConfirmCard'
import { Checkbox } from '../../components/kit'
import { useMotionEnabled } from '../../lib/motion'
import {
  BellMenuIcon,
  CheckMenuIcon,
  ClockMenuIcon,
  DurationMenuIcon,
  FolderMenuIcon,
  RepeatMenuIcon,
  ScheduleMenuIcon,
  SelectMenuIcon,
  TrashMenuIcon,
  UndoMenuIcon,
} from '../../components/icons/MenuIcons'
import type { Task } from '../../lib/types'

// ── Shared task row — pixel contract: Tasks.dc.html 1a/1b (open), 2a/2c (done),
// 2b (someday). W1 Today and W3 Planning import this; keep the prop surface additive. ──

const A = '/ds/assets'

// Star for the Top 3 menu item — path from the design's context menu (Tasks.dc.html:261).
function StarMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.4 9.7l6-.7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

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
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  display: 'flex',
  gap: 14,
  alignItems: 'center',
  flexWrap: 'wrap',
}

export interface BulkActions {
  count: number
  onComplete: () => void
  onSnooze: (until: string) => void
  onSomeday: () => void
  onSchedule: (iso: string) => void
  onMove: (projectId: string | null, domainId: string | null) => void
  onDelete: () => void
}

export interface TaskRowProps {
  task: Task
  highlighted?: boolean
  selected?: boolean
  onToggleSelect?: () => void
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
  /** Defaults to `completeTask`. TasksPage supplies one that also tracks the grace window
   * a just-checked row needs to stay visible in its group so the check/petal animation can play. */
  onComplete?: (task: Task) => void
}

function useRowSwipe() {
  const [x, setX] = useState(0)
  const armed = useRef(false)
  const dragging = useRef(false)
  const startClientX = useRef(0)
  const startX = useRef(0)
  const lastClientX = useRef(0)
  const lastTime = useRef(0)
  const velocity = useRef(0)

  function settle() {
    armed.current = false
    if (!dragging.current) return
    dragging.current = false
    const v = velocity.current
    setX((cur) => settleSwipeX(cur, v))
  }

  return {
    x,
    reset: () => setX(0),
    handlers: {
      // The gesture only becomes a drag (and only captures the pointer) after ~8px of
      // horizontal travel — so plain clicks on child controls (selection checkbox,
      // complete checkbox, star) stay ordinary clicks.
      // J-1/J-9: swipe is a touch gesture. A mouse (any button) never arms it — desktop drags
      // and right-clicks used to swipe rows, and an escaped press left a row armed so a later
      // plain hover dragged it (the "third row moves" report).
      onPointerDown(e: React.PointerEvent) {
        if (e.pointerType !== 'touch' || e.button !== 0) return
        armed.current = true
        dragging.current = false
        startClientX.current = e.clientX
        startX.current = x
        lastClientX.current = e.clientX
        lastTime.current = e.timeStamp
        velocity.current = 0
      },
      onPointerMove(e: React.PointerEvent) {
        if (!armed.current) return
        if ((e.buttons & 1) === 0) { settle(); return }
        const dx = e.clientX - startClientX.current
        if (!dragging.current) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return
          dragging.current = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        const dt = e.timeStamp - lastTime.current
        if (dt > 0) velocity.current = (e.clientX - lastClientX.current) / dt
        lastClientX.current = e.clientX
        lastTime.current = e.timeStamp
        setX(Math.max(-SWIPE_LEFT, Math.min(SWIPE_RIGHT, startX.current + dx)))
      },
      onPointerUp: settle,
      onPointerCancel: settle,
      onLostPointerCapture: settle,
      onPointerLeave: settle,
    },
  }
}

export function TaskRow({
  task,
  highlighted,
  selected,
  onToggleSelect,
  bulk,
  hideCheckbox,
  border = true,
  goalTaskId,
  justCompletedId,
  onComplete = completeTask,
}: TaskRowProps) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [popover, setPopover] = useState<{ kind: 'snooze' | 'schedule' | 'project'; x: number; y: number } | null>(null)
  // Punch 14: in-app ConfirmCard replaces the native confirm popup on every delete path
  const [confirmDelete, setConfirmDelete] = useState<{ title: string; body: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const motionOn = useMotionEnabled()
  const swipe = useRowSwipe()

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
  // J-3 (K-d, 2026-09-24 — matches Today's 07-21 rows): right-click never changes the selection.
  // The menu acts on this row, or on the whole selection when this row is part of it; the row
  // wears the selection tint while its menu is open so the target stays obvious.
  const bulkActive = !!bulk && !!selected

  function openMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  // Ctrl/Cmd+click toggles selection — the mouse path on surfaces with no checkbox (Planning
  // board). Capture phase so it never also completes/stars; DOM-contains check skips clicks
  // bubbling up (via the React tree) from this row's portaled menus.
  function selectClick(e: React.MouseEvent) {
    if (!(e.ctrlKey || e.metaKey) || !onToggleSelect || !e.currentTarget.contains(e.target as Node)) return
    e.preventDefault()
    e.stopPropagation()
    onToggleSelect()
  }

  // J-8: the mouse path to task detail (Enter was the only way). A row swiped open on a phone
  // closes on a title tap instead of navigating out from under the user.
  function openDetail() {
    if (swipe.x !== 0) swipe.reset()
    else navigate(`/tasks/${task.id}`)
  }

  function handleCheck() {
    setChecking(true)
    onComplete(task)
    swipe.reset()
  }

  const menuItems: ContextMenuItem[] = done
    ? [
        { label: 'Reopen', icon: <UndoMenuIcon />, onClick: () => uncompleteTask(task) },
        { label: 'Delete', danger: true, icon: <TrashMenuIcon />, onClick: () => setConfirmDelete({ title: `Delete "${task.title}"?`, body: '' }) },
      ]
    : [
        {
          label: bulkActive ? `Complete (${bulk!.count})` : 'Complete',
          icon: <CheckMenuIcon />,
          shortcut: shortcutHint('complete'),
          onClick: () => (bulkActive ? bulk!.onComplete() : handleCheck()),
        },
        // 2nd item per the design's context menu (Tasks.dc.html:261).
        {
          label: task.top3 ? 'Remove from Top 3' : 'Add to Top 3',
          icon: <StarMenuIcon />,
          shortcut: shortcutHint('top3'),
          onClick: () => toggleTop3(task),
        },
        {
          label: 'Snooze…',
          icon: <ClockMenuIcon />,
          shortcut: shortcutHint('snooze'),
          submenu: ({ position, onClose, closeAll }) => (
            <SnoozeMenu
              position={position}
              title={bulkActive ? undefined : task.title}
              onClose={onClose}
              onSnooze={(until) => { bulkActive ? bulk!.onSnooze(until) : snoozeTask(task, until); closeAll() }}
              onSomeday={() => { bulkActive ? bulk!.onSomeday() : setSomeday(task, true); closeAll() }}
            />
          ),
        },
        {
          label: 'Schedule',
          icon: <ScheduleMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ScheduleMenu
              position={position}
              title={bulkActive ? undefined : task.title}
              onClose={onClose}
              onSchedule={(iso) => { bulkActive ? bulk!.onSchedule(iso) : rescheduleDue(task, iso); closeAll() }}
            />
          ),
        },
        {
          label: 'Repeat',
          icon: <RepeatMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'No repeat', onClick: () => { setRecurrence(task, null); closeAll() } },
                { label: 'Daily', onClick: () => { setRecurrence(task, 'FREQ=DAILY'); closeAll() } },
                { label: 'Weekly', onClick: () => { setRecurrence(task, 'FREQ=WEEKLY'); closeAll() } },
                { label: 'Monthly', onClick: () => { setRecurrence(task, 'FREQ=MONTHLY'); closeAll() } },
                // Overlays.dc.html:188 — no dedicated rrule editor exists yet, so Custom…
                // opens the task editor (its Repeat select lives there).
                { label: 'Custom…', onClick: () => { navigate(`/tasks/${task.id}`); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Remind',
          icon: <BellMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => {
            const base = task.due_at || task.scheduled_start
            const offsets: { value: number | null; label: string }[] = [
              { value: null, label: 'No reminder' },
              { value: 0, label: 'At due time' },
              { value: 5, label: '5 min before' },
              { value: 15, label: '15 min before' },
              { value: 30, label: '30 min before' },
              { value: 60, label: '1 hr before' },
            ]
            return (
              <ContextMenu
                position={position}
                onClose={onClose}
                items={offsets.map((o) => ({
                  label: o.label,
                  disabled: o.value !== null && !base,
                  onClick: () => {
                    setReminder(task, o.value === null ? null : new Date(new Date(base!).getTime() - o.value * 60 * 1000).toISOString())
                    closeAll()
                  },
                }))}
              />
            )
          },
        },
        {
          label: 'Priority',
          icon: <PriorityFlag color="currentColor" />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'None', onClick: () => { setPriority(task, null); closeAll() } },
                { label: '! Medium', labelColor: priorityColor(3) ?? undefined, onClick: () => { setPriority(task, 3); closeAll() } },
                { label: '!! High', labelColor: priorityColor(2) ?? undefined, onClick: () => { setPriority(task, 2); closeAll() } },
                { label: '!!! Critical', labelColor: priorityColor(1) ?? undefined, onClick: () => { setPriority(task, 1); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Duration',
          icon: <DurationMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ContextMenu
              position={position}
              onClose={onClose}
              items={[
                { label: 'No duration', onClick: () => { setDuration(task, null); closeAll() } },
                { label: '15 min', onClick: () => { setDuration(task, 15); closeAll() } },
                { label: '30 min', onClick: () => { setDuration(task, 30); closeAll() } },
                { label: '1 hr', onClick: () => { setDuration(task, 60); closeAll() } },
                { label: '2 hr', onClick: () => { setDuration(task, 120); closeAll() } },
              ]}
            />
          ),
        },
        {
          label: 'Move to project',
          icon: <FolderMenuIcon />,
          shortcut: shortcutHint('project'),
          submenu: ({ position, onClose, closeAll }) => (
            <ProjectPicker
              position={position}
              projects={projects}
              domains={domains}
              currentProjectId={bulkActive ? null : task.project_id}
              onSelect={(projectId, domainId) => { bulkActive ? bulk!.onMove(projectId, domainId) : setProject(task, projectId, domainId); closeAll() }}
              onClose={onClose}
            />
          ),
        },
        ...(onToggleSelect ? [{ label: selected ? 'Deselect' : 'Select', icon: <SelectMenuIcon />, onClick: onToggleSelect, shortcut: '⌃click' }] : []),
        {
          label: bulkActive ? `Delete (${bulk!.count})` : 'Delete',
          danger: true,
          icon: <TrashMenuIcon />,
          shortcut: shortcutHint('delete'),
          onClick: () => {
            if (bulkActive) { bulk!.onDelete(); return }
            setConfirmDelete({
              title: `Delete "${task.title}"?`,
              body: task.scheduled_start ? 'This also removes its scheduled calendar block.' : '',
            })
          },
        },
      ]

  // One card serves all three delete entry points (menu, done-menu, swipe) — rendered in every branch.
  const confirmCard = confirmDelete && (
    <ConfirmCard
      title={confirmDelete.title}
      body={confirmDelete.body}
      confirmLabel="Delete"
      onConfirm={() => { setConfirmDelete(null); deleteTask(task) }}
      onCancel={() => setConfirmDelete(null)}
    />
  )

  const rowStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '13px 2px',
    borderBottom: border ? '1px dashed var(--line-dashed)' : 'none',
    boxShadow: highlighted ? '0 0 0 3px color-mix(in srgb, var(--acc-sage) 28%, transparent)' : undefined,
    background: selected || menu ? 'color-mix(in oklch, var(--acc-sage) 8%, transparent)' : undefined,
    outline: 'none',
  }

  // ── Done — fallen petals (2a / 2c) ──
  if (done) {
    return (
      <div
        id={`task-${task.id}`}
        className="task-row kf-lift"
        tabIndex={highlighted ? 0 : -1}
        onContextMenu={openMenu}
        style={{ ...rowStyle, alignItems: 'center', padding: '11px 2px', opacity: justCompleted ? 0.55 : 1 }}
      >
        <span
          onClick={() => uncompleteTask(task)}
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
                {tag.label}
              </span>
            )}
            {task.completed_at && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-hairline)' }}>
                {new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </>
        )}
        {justCompleted && <span className="tr-petal" style={{ left: 24, top: 4, transform: 'rotate(35deg)' }} />}
        {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} items={menuItems} />}
        {confirmCard}
      </div>
    )
  }

  // ── Someday — the quiet shelf (2b) ──
  if (someday) {
    return (
      <div
        id={`task-${task.id}`}
        className="task-row tr-someday kf-lift"
        tabIndex={highlighted ? 0 : -1}
        onContextMenu={openMenu}
        onClickCapture={selectClick}
        style={{ ...rowStyle, alignItems: 'center', padding: '12px 10px', margin: '0 -10px' }}
      >
        <Checkbox checked={false} size={18} onChange={handleCheck} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={openDetail} style={{ fontSize: 15, color: 'var(--ink-body)', cursor: 'pointer' }}><EmojiText text={task.title} /></div>
          {tag && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
              {tag.label}
            </div>
          )}
        </div>
        <span
          className="tr-someday-hover"
          onClick={() => rescheduleDue(task, scheduleToday())}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', background: 'color-mix(in srgb, var(--acc-moss) 20%, transparent)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}
        >
          → Today
        </span>
        <span
          className="tr-someday-hover"
          onClick={(e) => setPopover({ kind: 'schedule', x: e.clientX, y: e.clientY })}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}
        >
          Schedule ▾
        </span>
        {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} items={menuItems} />}
        {confirmCard}
        {popover?.kind === 'schedule' && (
          <ScheduleMenu position={popover} title={task.title} onClose={() => setPopover(null)} onSchedule={(iso) => { rescheduleDue(task, iso); setPopover(null) }} />
        )}
      </div>
    )
  }

  // ── Open — the main list (1a / 1b) ──
  return (
    <div
      id={`task-${task.id}`}
      // Motion 4a (WB-1): `overflow: hidden` (the swipe panels need it) clips the hover
      // shadow, so this variant reads the lift as travel only. Accepted — the alternative is
      // an extra wrapper element on the app's hottest row.
      className={`task-row kf-lift${checking ? ' tr-checking' : ''}`}
      tabIndex={highlighted ? 0 : -1}
      onContextMenu={openMenu}
      onClickCapture={selectClick}
      style={{ ...rowStyle, overflow: 'hidden' }}
    >
      {swipe.x !== 0 && (
        <div className="tr-swipe-actions" aria-hidden="true">
          <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'color-mix(in srgb, var(--acc-lavender) 92%, transparent)', pointerEvents: swipe.x > 0 ? 'auto' : 'none', cursor: 'pointer' }} onClick={(e) => setPopover({ kind: 'schedule', x: e.clientX, y: e.clientY })}>
            <ScheduleMenuIcon />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Resched</span>
          </div>
          <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'color-mix(in srgb, var(--acc-moss) 94%, transparent)', pointerEvents: swipe.x > 0 ? 'auto' : 'none', cursor: 'pointer' }} onClick={(e) => setPopover({ kind: 'project', x: e.clientX, y: e.clientY })}>
            <FolderMenuIcon />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Project</span>
          </div>
          <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'color-mix(in srgb, var(--acc-gold-warm) 95%, transparent)', pointerEvents: swipe.x > 0 ? 'auto' : 'none', cursor: 'pointer' }} onClick={(e) => setPopover({ kind: 'snooze', x: e.clientX, y: e.clientY })}>
            <ClockMenuIcon />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Snooze</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ width: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'var(--acc-terra)', pointerEvents: swipe.x < 0 ? 'auto' : 'none', cursor: 'pointer' }} onClick={() => setConfirmDelete({ title: `Delete "${task.title}"?`, body: task.scheduled_start ? 'This also removes its scheduled calendar block.' : '' })}>
            <TrashMenuIcon />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Delete</span>
          </div>
        </div>
      )}

      <div
        className="tr-swipe-content"
        {...swipe.handlers}
        style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 0, background: swipe.x !== 0 ? 'var(--paper-linen)' : undefined, transform: swipe.x !== 0 ? `translateX(${swipe.x}px)` : undefined, transition: swipe.x === 0 ? 'transform 200ms var(--ease-spring)' : undefined, boxShadow: swipe.x > 0 ? '-9px 0 12px rgba(var(--kf-shadow-rgb, 60,52,38),0.14)' : swipe.x < 0 ? '9px 0 12px rgba(var(--kf-shadow-rgb, 60,52,38),0.14)' : undefined }}
      >
        {!hideCheckbox && onToggleSelect && (
          <span
            onClick={onToggleSelect}
            className={selected ? 'kf-hit' : 'task-row-hover kf-hit'}
            style={{ width: 14, height: 14, marginTop: 3, flex: 'none', borderRadius: 4, border: '1.5px solid var(--acc-sage)', background: selected ? 'var(--acc-sage)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 9, lineHeight: 1, cursor: 'pointer' }}
          >
            {selected ? '✓' : ''}
          </span>
        )}
        <span style={{ position: 'relative', marginTop: 2 }}>
          <Checkbox
            checked={checking}
            size={18}
            bloom={task.top3}
            onChange={handleCheck}
            style={checking ? { background: 'var(--sig-done)', boxShadow: 'none' } : overdue ? { borderColor: 'var(--acc-terra)' } : undefined}
          />
          {checking && motionOn && task.top3 && <span className="tr-petal tr-petal-live" style={{ right: -5, bottom: -3, transform: 'rotate(40deg)' }} />}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span onClick={openDetail} className={checking ? 'tr-title-strike' : undefined} style={{ fontSize: 15.5, color: 'var(--ink-body)', cursor: 'pointer' }}><EmojiText text={task.title} /></span>
            {inProgress && <img src={`${A}/cherry/opening.png`} alt="in progress" style={{ height: 19, filter: 'var(--shadow-drop-sm)' }} />}
          </div>
          <div style={metaStyle}>
            {tag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--ink-faint)' }} />
                {tag.label}
              </span>
            )}
            {overdue && <span style={{ color: 'var(--acc-terra)' }}>Overdue {overdueDays}d</span>}
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
          </div>
        </div>

        <span
          onClick={() => toggleTop3(task)}
          title={task.top3 ? 'Remove from Top 3' : 'Add to Top 3'}
          className="kf-hit"
          style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--line-solid)', fontSize: 16, lineHeight: 1, cursor: 'pointer', flex: 'none', marginTop: 1 }}
        >
          {task.top3 ? '★' : '☆'}
        </span>
      </div>

      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} items={menuItems} />}
      {confirmCard}
      {popover?.kind === 'snooze' && (
        <SnoozeMenu position={popover} title={task.title} onClose={() => setPopover(null)} onSnooze={(until) => { snoozeTask(task, until); setPopover(null); swipe.reset() }} onSomeday={() => { setSomeday(task, true); setPopover(null); swipe.reset() }} />
      )}
      {popover?.kind === 'schedule' && (
        <ScheduleMenu position={popover} title={task.title} onClose={() => setPopover(null)} onSchedule={(iso) => { rescheduleDue(task, iso); setPopover(null); swipe.reset() }} />
      )}
      {popover?.kind === 'project' && (
        <ProjectPicker position={popover} projects={projects} domains={domains} currentProjectId={task.project_id} onSelect={(projectId, domainId) => { setProject(task, projectId, domainId); setPopover(null); swipe.reset() }} onClose={() => setPopover(null)} />
      )}
    </div>
  )
}
