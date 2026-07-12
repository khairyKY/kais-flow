import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useTasks, completeTask, toggleTop3, snoozeTask, setSomeday, rescheduleDue, setProject, deleteTask } from '../tasks/api'
import { type BulkActions } from '../tasks/TaskRow'
import { buildListBindings } from '../tasks/listShortcuts'
import { BulkBar } from '../../components/BulkBar'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { useProjects } from '../projects/api'
import { useCalendarEvents } from '../calendar/api'
import { useDomains } from '../domains/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { computeStreak, localDateKey } from '../routines/streaks'
import { groupRoutinesByTime } from '../routines/routineGrouping'
import { useSlipping, markReviewed } from '../slipping/api'
import { usePendingInboxItems, dismissInboxItem, fileToTask } from '../inbox/api'
import { useRecentActivity } from '../notifications/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import { Terrarium } from './Terrarium'
import { useGoalStore } from './goalStore'
import { useTerrariumStore } from './terrariumStore'
import { PetalIcon } from '../../components/icons/NavIcons'
import { useListKeys } from '../../components/useListKeys'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { CheckMenuIcon, ClockMenuIcon, FolderMenuIcon, ScheduleMenuIcon, TrashMenuIcon } from '../../components/icons/MenuIcons'
import { rowAnchor } from '../../lib/rowAnchor'
import { scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../../lib/dateShortcuts'
import type { Domain, Task } from '../../lib/types'

/** Anchored popover position — mouse-triggered menus carry explicit click coordinates,
 * keyboard-triggered ones fall back to `rowAnchor` under the focused row. */
type MenuAnchor = { task: Task; x: number; y: number }

const DOMAIN_PALETTE = [
  'var(--acc-sage)',
  'var(--acc-terra)',
  'var(--acc-hydrangea)',
  'var(--acc-gold-warm)',
  'var(--acc-lavender)',
  'var(--acc-blossom)',
]

function domainColor(domain: Domain | undefined, index: number): string {
  return domain?.color || DOMAIN_PALETTE[index % DOMAIN_PALETTE.length]
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function isVisible(task: Task, now: Date): boolean {
  if (task.status !== 'todo') return false
  if (task.someday) return false
  if (task.snoozed_until && new Date(task.snoozed_until) > now) return false
  return true
}

function dueLabel(task: Task, now: Date): string | null {
  if (!task.due_at) return null
  const due = new Date(task.due_at)
  if (due < startOfToday()) {
    const days = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86_400_000))
    return `Overdue ${days}d`
  }
  if (due <= endOfToday()) return 'Due today'
  const tomorrow = new Date(startOfToday())
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (due >= tomorrow && due.getTime() - tomorrow.getTime() < 86_400_000) return 'Due tomorrow'
  return null
}

function recurrenceLabel(rule: string | null): string | null {
  if (!rule) return null
  if (rule.includes('DAILY')) return '↻ Daily'
  if (rule.includes('WEEKLY')) return '↻ Weekly'
  if (rule.includes('MONTHLY')) return '↻ Monthly'
  return '↻ Repeats'
}

function SectionHeader({ label, action }: { label: string; action?: { to: string; text: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--border-dashed)' }} />
      {action && (
        <Link to={action.to} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {action.text}
        </Link>
      )}
    </div>
  )
}

function Checkbox({ checked, onClick, variant }: { checked: boolean; onClick: () => void; variant?: 'goal' }) {
  const size = variant === 'goal' ? 19 : 17
  if (checked) {
    return (
      <span
        onClick={onClick}
        style={{
          width: size,
          height: size,
          borderRadius: 5,
          background: 'var(--sig-done)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--bg-app)',
          fontSize: 11,
          flex: 'none',
          cursor: 'pointer',
        }}
      >
        ✓
      </span>
    )
  }
  return (
    <span
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        flex: 'none',
        marginTop: variant === 'goal' ? 4 : 2,
        cursor: 'pointer',
        border: variant === 'goal' ? '1.5px solid var(--acc-gold)' : '1.5px solid var(--line-sidebar)',
        background: variant === 'goal' ? 'rgba(255,255,255,0.5)' : 'transparent',
      }}
    />
  )
}

/** The "⋯" mouse trigger for the shared actions menu (Snooze/Schedule/Move/Delete) — every Today
 * row also opens the same menu on right-click; this is the discoverable, always-visible affordance. */
function MenuTrigger({ onOpen }: { onOpen: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="More actions"
      style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 16, letterSpacing: '0.1em', cursor: 'pointer', padding: '0 2px', flex: 'none' }}
    >
      ⋯
    </button>
  )
}

function TaskRow({
  task,
  domain,
  domainIndex,
  showStar,
  highlighted,
  onMenu,
  selected,
  onToggleSelect,
}: {
  task: Task
  domain?: Domain
  domainIndex: number
  showStar?: boolean
  highlighted?: boolean
  onMenu: (task: Task, e: React.MouseEvent) => void
  /** All Open is the one Today section selectable for bulk actions — opening the menu on an
   * unselected row selects it first, same mechanism the Tasks page and Planning board use. */
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const now = new Date()
  const due = dueLabel(task, now)
  const recurrence = recurrenceLabel(task.recurrence_rule)
  function openMenu(e: React.MouseEvent) {
    if (!selected) onToggleSelect?.()
    onMenu(task, e)
  }
  return (
    <div
      id={`task-${task.id}`}
      className="task-row"
      tabIndex={highlighted ? 0 : -1}
      onContextMenu={openMenu}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '10px 12px',
        margin: '0 -6px',
        borderRadius: selected ? 'var(--radius-input)' : undefined,
        boxShadow: highlighted ? '0 0 0 3px rgba(138,154,126,0.28)' : undefined,
        background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, transparent)' : undefined,
        outline: 'none',
      }}
    >
      {onToggleSelect && (
        <span
          onClick={onToggleSelect}
          className={selected ? undefined : 'task-row-hover'}
          style={{
            width: 15,
            height: 15,
            marginTop: 3,
            flex: 'none',
            borderRadius: 4,
            border: '1.5px solid var(--acc-sage)',
            background: selected ? 'var(--acc-sage)' : 'transparent',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bg-app)',
            fontSize: 10,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          {selected ? '✓' : ''}
        </span>
      )}
      <Checkbox checked={false} onClick={() => completeTask(task)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, color: 'var(--text-primary)' }}>{task.title}</div>
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          {domain && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: domainColor(domain, domainIndex), display: 'inline-block' }} />
              {domain.name}
            </span>
          )}
          {due && <span style={{ color: due.startsWith('Overdue') ? 'var(--acc-terra)' : undefined }}>{due}</span>}
          {recurrence && <span>{recurrence}</span>}
        </div>
      </div>
      {showStar && (
        <span onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--line-solid)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
          {task.top3 ? '★' : '☆'}
        </span>
      )}
      <MenuTrigger onOpen={openMenu} />
    </div>
  )
}

function Top3Section({ top3, domains, focusedId, onMenu }: { top3: Task[]; domains: Domain[]; focusedId: string | null; onMenu: (task: Task, e: React.MouseEvent) => void }) {
  const { goalTaskId, setGoal } = useGoalStore()
  if (top3.length === 0) {
    return (
      <section>
        <SectionHeader label="Top 3 for today" />
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
          Star up to 3 tasks from Tasks to feature them here.
        </p>
      </section>
    )
  }

  const goal = top3.find((t) => t.id === goalTaskId) ?? top3[0]
  const rest = top3.filter((t) => t.id !== goal.id)
  const domainOf = (id: string | null) => domains.find((d) => d.id === id)
  const domainIndexOf = (id: string | null) => Math.max(0, domains.findIndex((d) => d.id === id))

  return (
    <section>
      <SectionHeader label="Top 3 for today" />

      <div
        id={`task-${goal.id}`}
        tabIndex={focusedId === goal.id ? 0 : -1}
        onContextMenu={(e) => onMenu(goal, e)}
        style={{
          position: 'relative',
          margin: '14px 0 16px',
          background: 'var(--paper-goal)',
          border: '1px solid var(--line-goal)',
          boxShadow: focusedId === goal.id
            ? '0 0 0 3px rgba(138,154,126,0.28), 0 1px 2px rgba(60,52,38,0.14), 0 8px 20px rgba(154,123,58,0.14)'
            : '0 1px 2px rgba(60,52,38,0.14), 0 8px 20px rgba(154,123,58,0.14)',
          padding: '16px 18px 15px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          transform: 'rotate(-0.4deg)',
          borderRadius: 'var(--radius-sharp)',
          outline: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -7,
            left: 12,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            background: 'var(--acc-gold)',
            color: 'var(--paper-parchment)',
            padding: '3px 9px',
            borderRadius: 2,
            transform: 'rotate(-1deg)',
          }}
        >
          ✶ Goal of the day
        </span>
        <Checkbox checked={false} onClick={() => completeTask(goal)} variant="goal" />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink-body)', lineHeight: 1.3 }}>
            {goal.title}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>
            {domainOf(goal.domain_id) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-terra)', display: 'inline-block' }} />
                {domainOf(goal.domain_id)?.name}
              </span>
            )}
            <span>One thing that makes today a win</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
          <img src="assets/clover/four_leaf.png" alt="" style={{ width: 38, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 2px 3px rgba(74,58,30,0.22))' }} />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--acc-gold)', transform: 'rotate(-2deg)' }}>for luck</span>
        </div>
        <span style={{ position: 'absolute', top: 6, right: 8 }}>
          <MenuTrigger onOpen={(e) => onMenu(goal, e)} />
        </span>
      </div>

      {rest.map((t) => (
        <div
          key={t.id}
          id={`task-${t.id}`}
          tabIndex={focusedId === t.id ? 0 : -1}
          onContextMenu={(e) => onMenu(t, e)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '11px 0', boxShadow: focusedId === t.id ? '0 0 0 3px rgba(138,154,126,0.28)' : undefined, outline: 'none' }}
        >
          <Checkbox checked={false} onClick={() => completeTask(t)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: 'var(--text-primary)' }}>{t.title}</div>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              {domainOf(t.domain_id) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: domainColor(domainOf(t.domain_id), domainIndexOf(t.domain_id)), display: 'inline-block' }} />
                  {domainOf(t.domain_id)?.name}
                </span>
              )}
              {dueLabel(t, new Date()) && <span>{dueLabel(t, new Date())}</span>}
            </div>
          </div>
          <span onClick={() => setGoal(t.id)} title="Make this the goal" style={{ color: 'var(--acc-terra)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
            ★
          </span>
          <MenuTrigger onOpen={(e) => onMenu(t, e)} />
        </div>
      ))}
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
        Mark one starred task as your goal — it becomes the day's headline.
      </p>
    </section>
  )
}

function formatWhen(iso: string, now: Date): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return time
  const weekday = d.toLocaleDateString([], { weekday: 'short' })
  return `${weekday} ${time}`
}

function UpNextSection({ events }: { events: { id: string; title: string; starts_at: string }[] }) {
  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.starts_at) >= now).slice(0, 3)
  return (
    <section>
      <SectionHeader label="Up next" action={{ to: '/calendar', text: 'View all →' }} />
      {upcoming.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing scheduled.</p>
      ) : (
        upcoming.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 18, padding: '10px 0', alignItems: 'baseline' }}>
            <span style={{ width: 96, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
              {formatWhen(e.starts_at, now)}
            </span>
            <div style={{ fontSize: 15, color: 'var(--text-primary)' }}>{e.title}</div>
          </div>
        ))
      )}
    </section>
  )
}

function AllOpenSection({
  tasks,
  domains,
  focusedId,
  onMenu,
  selected,
  onToggleSelect,
}: {
  tasks: Task[]
  domains: Domain[]
  focusedId: string | null
  onMenu: (task: Task, e: React.MouseEvent) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
}) {
  return (
    <section>
      <SectionHeader label={`All open · ${tasks.length}`} />
      {tasks.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing else open. Clear skies.</p>
      ) : (
        tasks.map((t) => {
          const domain = domains.find((d) => d.id === t.domain_id)
          const domainIndex = Math.max(0, domains.findIndex((d) => d.id === t.domain_id))
          return (
            <TaskRow
              key={t.id}
              task={t}
              domain={domain}
              domainIndex={domainIndex}
              showStar
              highlighted={t.id === focusedId}
              onMenu={onMenu}
              selected={selected.has(t.id)}
              onToggleSelect={() => onToggleSelect(t.id)}
            />
          )
        })
      )}
    </section>
  )
}

function SlippingSection() {
  const { data: rows = [] } = useSlipping()
  if (rows.length === 0) return null
  return (
    <section>
      <SectionHeader label="Slipping" />
      {rows.map((row) => (
        <div
          key={`${row.entity_type}-${row.entity_id}`}
          style={{
            position: 'relative',
            border: '1px solid var(--line-goal)',
            background: 'var(--paper-bone)',
            padding: '12px 14px',
            transform: 'rotate(0.4deg)',
            boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 5px 12px rgba(60,52,38,0.08)',
            borderRadius: 'var(--radius-sharp)',
            marginBottom: 10,
          }}
        >
          <img
            src="assets/wisteria/p20.png"
            alt=""
            style={{ position: 'absolute', top: 7, height: 69, width: 35, opacity: 0.75, left: 230 }}
          />
          <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500, paddingRight: 44 }}>{row.entity_name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)', marginTop: 5 }}>
            {Math.floor(row.days_since)} days untouched
          </div>
          <button
            type="button"
            onClick={() => markReviewed(row)}
            style={{ marginTop: 9, background: 'none', border: 'none', color: 'var(--acc-terra)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            reviewed
          </button>
        </div>
      ))}
    </section>
  )
}

function RoutinesSection() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { on: terrariumOn, inToday: terrariumInToday } = useTerrariumStore()
  const today = new Date()
  const todayKey = localDateKey(today)
  const scheduledToday = routines.filter((r) => r.active && r.cadence.weekdays.includes(today.getDay()))
  const doneCount = scheduledToday.filter((r) => completions.some((c) => c.routine_id === r.id && c.completed_on === todayKey)).length

  const allDays = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  const completedDays = Array.from(new Set(completions.map((c) => c.completed_on)))
  const { current: gardenStreak } = computeStreak(completedDays, allDays)
  const earliest = [...routines.map((r) => r.created_at)].sort()[0]
  const gardenDay = earliest ? Math.max(1, Math.round((Date.now() - new Date(earliest).getTime()) / 86_400_000) + 1) : 1

  return (
    <section>
      <SectionHeader label={`Routines · ${doneCount}/${scheduledToday.length}`} action={{ to: '/routines', text: 'View all →' }} />

      {terrariumOn && !terrariumInToday && (
        <Link
          to="/routines"
          style={{
            position: 'relative',
            border: '1px solid var(--line-card)',
            background: 'var(--bg-surface)',
            marginBottom: 16,
            padding: '12px 14px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transform: 'rotate(-0.5deg)',
            boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 6px 14px rgba(60,52,38,0.09)',
            borderRadius: 'var(--radius-sharp)',
            textDecoration: 'none',
          }}
        >
          <img src="assets/clover/awake.png" alt="Terrarium" style={{ height: 54, width: 'auto', flex: 'none', animation: 'cloverSway 5s ease-in-out infinite', transformOrigin: '50% 100%' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              The Terrarium
            </div>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--text-secondary)', marginTop: 2 }}>
              day {gardenDay} — {gardenStreak}-day streak
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--acc-terra)', textDecoration: 'underline' }}>Open garden →</span>
          </div>
        </Link>
      )}

      {scheduledToday.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing scheduled today.</p>
      ) : (
        groupRoutinesByTime(scheduledToday).map(({ key, label, items: group }) => {
          if (group.length === 0) return null
          return (
            <div key={key}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', margin: '10px 0 6px' }}>
                {label}
              </div>
              {group.map((r) => {
                const done = completions.some((c) => c.routine_id === r.id && c.completed_on === todayKey)
                const routineCompletedDays = completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
                const { current } = computeStreak(routineCompletedDays, r.cadence)
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <Checkbox checked={done} onClick={() => toggleCompletion(r)} />
                    <span style={{ flex: 1, fontSize: 13.5, color: done ? 'var(--ink-hairline)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
                      {r.name}
                    </span>
                    {current > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--acc-terra)' }}>
                        <PetalIcon />
                        {current}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </section>
  )
}

function NeedsReviewSection() {
  const { data: pending = [] } = usePendingInboxItems()
  const preview = pending.slice(0, 2)
  if (preview.length === 0) return null
  return (
    <section>
      <SectionHeader label={`Needs review · ${pending.length}`} action={{ to: '/inbox', text: 'View all →' }} />
      {preview.map((item) => (
        <div
          key={item.id}
          style={{
            border: '1px solid var(--line-card)',
            background: 'var(--bg-surface)',
            padding: '13px 14px',
            marginBottom: 12,
            transform: 'rotate(-0.3deg)',
            boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 5px 12px rgba(60,52,38,0.08)',
            borderRadius: 'var(--radius-sharp)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {item.raw_text}
          </div>
          {item.transcript && item.transcript !== item.raw_text && (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.4 }}>{item.transcript}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
            <button
              type="button"
              onClick={() => fileToTask(item)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-on-accent)', background: 'var(--acc-terra)', border: 'none', borderRadius: 'var(--radius-sharp)', padding: '4px 7px', cursor: 'pointer' }}
            >
              File → task
            </button>
            <button
              type="button"
              onClick={() => dismissInboxItem(item)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sharp)', padding: '4px 7px', background: 'none', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

function relativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// activity_log events worth surfacing as a notification, mapped to a human line.
// Uses the event's own payload (title/name) when it carries one.
const NOTIFY_EVENTS: Record<string, (payload: Record<string, unknown> | null) => string> = {
  'task.completed': () => 'Task completed',
  'task.created': (p) => (typeof p?.title === 'string' ? `Task added — ${p.title}` : 'Task added'),
  'task.rescheduled': () => 'Task rescheduled',
  'inbox.captured': () => 'Captured to inbox',
  'inbox.filed': () => 'Inbox item filed to a task',
  'routine.checked': () => 'Routine checked off',
  'project.created': (p) => (typeof p?.name === 'string' ? `Project started — ${p.name}` : 'Project started'),
  'calendar_event.created': (p) => (typeof p?.title === 'string' ? `Scheduled — ${p.title}` : 'Event scheduled'),
  'task.scheduled': () => 'Task time-blocked',
}

function isToday(iso: string, now: Date): boolean {
  return new Date(iso).toDateString() === now.toDateString()
}

function NotificationsSection() {
  const { data: activity = [] } = useRecentActivity()
  const now = new Date()

  const notifications = activity.filter((a) => a.event_type in NOTIFY_EVENTS).slice(0, 3)
  const doneToday = activity.filter((a) => a.event_type === 'task.completed' && isToday(a.created_at, now)).length

  if (notifications.length === 0 && doneToday === 0) return null

  return (
    <section>
      <SectionHeader label={`Notifications · ${notifications.length}`} />
      {notifications.map((a) => (
        <div key={a.id} style={{ padding: '7px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{NOTIFY_EVENTS[a.event_type](a.payload)}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginTop: 3 }}>
            {relativeTime(a.created_at, now)}
          </div>
        </div>
      ))}
      {doneToday > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 6 }}>
          ✓ {doneToday} done today
        </div>
      )}
    </section>
  )
}

const PILL_BUTTON: CSSProperties = {
  border: '1px solid var(--border-default)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '9px 16px',
  borderRadius: 999,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(60,52,38,0.1)',
}

export function TodayPage() {
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { goalTaskId } = useGoalStore()
  const [ritual, setRitual] = useState<'morning' | 'evening' | null>(null)
  const now = new Date()
  const visible = tasks.filter((t) => isVisible(t, now))

  const top3 = visible.filter((t) => t.top3)
  const openOthers = visible.filter((t) => !t.top3)

  // Mirrors Top3Section's own goal pick, purely to order the keyboard-nav list the same as the page renders.
  const goal = top3.find((t) => t.id === goalTaskId) ?? top3[0]
  const restTop3 = top3.filter((t) => t.id !== goal?.id)
  const orderedVisible = [...(goal ? [goal] : []), ...restTop3, ...openOthers]

  const [snoozeMenu, setSnoozeMenu] = useState<MenuAnchor | null>(null)
  const [projectMenu, setProjectMenu] = useState<MenuAnchor | null>(null)
  const [actionsMenu, setActionsMenu] = useState<MenuAnchor | null>(null)

  function openRowMenu(task: Task, e: React.MouseEvent) {
    e.preventDefault()
    setActionsMenu({ task, x: e.clientX, y: e.clientY })
  }

  // Bulk selection — All Open is the only section that's selectable (its own TaskRow wires the
  // checkbox + select-on-menu-open); Top 3/goal rows never populate `selected`, so bulk mode can
  // only ever activate for a right-clicked All Open task, never a goal/rest-of-top3 one.
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
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)

  function bulkComplete() {
    selectedTasks.forEach(completeTask)
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} completed.` })
    clearSelection()
  }
  function bulkSnooze(until: string) {
    selectedTasks.forEach((t) => snoozeTask(t, until))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} snoozed.` })
    clearSelection()
  }
  function bulkSomeday() {
    selectedTasks.forEach((t) => setSomeday(t, true))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} parked for someday.` })
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
  const bulkActive = !!bulkActions && !!actionsMenu && selected.has(actionsMenu.task.id)

  const actionsMenuItems: ContextMenuItem[] = actionsMenu
    ? [
        {
          label: bulkActive ? `Complete (${bulkActions!.count})` : 'Complete',
          icon: <CheckMenuIcon />,
          onClick: () => (bulkActive ? bulkActions!.onComplete() : completeTask(actionsMenu.task)),
        },
        {
          label: 'Snooze…',
          icon: <ClockMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <SnoozeMenu
              position={position}
              onClose={onClose}
              onSnooze={(until) => { bulkActive ? bulkActions!.onSnooze(until) : snoozeTask(actionsMenu.task, until); closeAll() }}
              onSomeday={() => { bulkActive ? bulkActions!.onSomeday() : setSomeday(actionsMenu.task, true); closeAll() }}
            />
          ),
        },
        {
          label: 'Schedule',
          icon: <ScheduleMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ScheduleMenu
              position={position}
              onClose={onClose}
              onSchedule={(iso) => { bulkActive ? bulkActions!.onSchedule(iso) : rescheduleDue(actionsMenu.task, iso); closeAll() }}
            />
          ),
        },
        {
          label: 'Move to project',
          icon: <FolderMenuIcon />,
          submenu: ({ position, onClose, closeAll }) => (
            <ProjectPicker
              position={position}
              projects={projects}
              domains={domains}
              currentProjectId={bulkActive ? null : actionsMenu.task.project_id}
              onSelect={(projectId, domainId) => { bulkActive ? bulkActions!.onMove(projectId, domainId) : setProject(actionsMenu.task, projectId, domainId); closeAll() }}
              onClose={onClose}
            />
          ),
        },
        {
          label: bulkActive ? `Delete (${bulkActions!.count})` : 'Delete',
          danger: true,
          icon: <TrashMenuIcon />,
          onClick: () => {
            if (bulkActive) { bulkActions!.onDelete(); return }
            const message = actionsMenu.task.scheduled_start
              ? `Delete "${actionsMenu.task.title}"? This also removes its scheduled calendar block.`
              : `Delete "${actionsMenu.task.title}"?`
            if (window.confirm(message)) deleteTask(actionsMenu.task)
          },
        },
      ]
    : []

  const bindings = buildListBindings({
    complete: (t) => completeTask(t),
    snooze: (t) => setSnoozeMenu({ task: t, ...rowAnchor('task-', t.id) }),
    today: (t) => rescheduleDue(t, scheduleToday()),
    tomorrow: (t) => rescheduleDue(t, scheduleTomorrow()),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setProjectMenu({ task: t, ...rowAnchor('task-', t.id) }),
    delete: (t) => {
      const message = t.scheduled_start ? `Delete "${t.title}"? This also removes its scheduled calendar block.` : `Delete "${t.title}"?`
      if (window.confirm(message)) deleteTask(t)
    },
  })
  const menuOpen = !!(snoozeMenu || projectMenu || actionsMenu || bulkSnoozePos || bulkProjectPos)
  // Only All Open rows are selectable (see the `selected` state comment above) — Ctrl/Cmd+A
  // selects that subset, not the goal/top3 rows mixed into `orderedVisible`.
  const { focusedId } = useListKeys(orderedVisible, bindings, {
    active: !menuOpen,
    sectionLabel: 'Lists',
    onSelectAll: () => setSelected(new Set(openOthers.map((t) => t.id))),
  })

  const dateHeading = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div>
      <Terrarium />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Today
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            {dateHeading}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setRitual('morning')} style={PILL_BUTTON}>
            Morning ritual
          </button>
          <button type="button" onClick={() => setRitual('evening')} style={PILL_BUTTON}>
            Evening ritual
          </button>
          <VoiceCaptureButton />
        </div>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 32px' }} />

      {ritual === 'morning' && <MorningRitual onClose={() => setRitual(null)} />}
      {ritual === 'evening' && <EveningRitual onClose={() => setRitual(null)} />}

      <style>{'.today-columns{display:grid;grid-template-columns:minmax(0,1fr) 272px;gap:52px;align-items:start}@media (max-width:767px){.today-columns{grid-template-columns:minmax(0,1fr);gap:32px}}'}</style>
      <div className="today-columns">
        <div style={{ minWidth: 0, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 40 }}>
          <Top3Section top3={top3} domains={domains} focusedId={focusedId} onMenu={openRowMenu} />
          <UpNextSection events={events} />
          <AllOpenSection tasks={openOthers} domains={domains} focusedId={focusedId} onMenu={openRowMenu} selected={selected} onToggleSelect={toggleSelected} />
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <SlippingSection />
          <RoutinesSection />
          <ResurfaceCard />
          <NeedsReviewSection />
          <NotificationsSection />
        </div>
      </div>

      {actionsMenu && <ContextMenu position={actionsMenu} onClose={() => setActionsMenu(null)} items={actionsMenuItems} />}
      {snoozeMenu && (
        <SnoozeMenu
          position={snoozeMenu}
          onClose={() => setSnoozeMenu(null)}
          onSnooze={(until) => snoozeTask(snoozeMenu.task, until)}
          onSomeday={() => setSomeday(snoozeMenu.task, true)}
        />
      )}
      {projectMenu && (
        <ProjectPicker
          position={projectMenu}
          projects={projects}
          domains={domains}
          currentProjectId={projectMenu.task.project_id}
          onSelect={(projectId, domainId) => setProject(projectMenu.task, projectId, domainId)}
          onClose={() => setProjectMenu(null)}
        />
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onSnooze={(e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY })}
          onToday={() => bulkSchedule(scheduleToday(), 'today')}
          onTomorrow={() => bulkSchedule(scheduleTomorrow(), 'tomorrow')}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}
      {bulkSnoozePos && (
        <SnoozeMenu
          position={bulkSnoozePos}
          onClose={() => setBulkSnoozePos(null)}
          onSnooze={bulkSnooze}
          onSomeday={bulkSomeday}
        />
      )}
      {bulkProjectPos && (
        <ProjectPicker
          position={bulkProjectPos}
          projects={projects}
          domains={domains}
          currentProjectId={null}
          onSelect={bulkMove}
          onClose={() => setBulkProjectPos(null)}
        />
      )}
    </div>
  )
}
