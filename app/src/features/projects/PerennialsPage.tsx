import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { ContextMenu } from '../../components/ContextMenu'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { toastUndo } from '../../lib/undo'
import { writeRow } from '../../lib/outbox'
import {
  useTasks,
  setRecurrence,
  pauseTask,
  resumeTask,
  skipNextOccurrence,
  deleteTasksWithUndo,
} from '../tasks/api'
import { TaskRow } from '../tasks/TaskRow'
import { useOpenTask } from '../tasks/openTask'
import { useDayRollover } from '../calendar/useDayRollover'
import { Chip, SectionLabel } from '../../components/kit'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import { daysFromToday, formatLastCompleted, formatNextDue, formatRecurrenceRule, getCadenceType } from './perennials'
import type { Task } from '../../lib/types'
import './xfx.css'

export function PerennialsPage() {
  const { data: allTasks = [] } = useTasks()
  const motion = useMotionEnabled()
  const isMobile = useIsMobile()
  const openTask = useOpenTask()
  // "today" / "tomorrow" on the rows roll over at the user's midnight.
  useDayRollover()

  // The series menu (⋯ / right-click, an ActionSheet on a phone — ProjectsPage's pattern) beside each
  // row; the row itself is the task grammar's TaskRow (tap opens, its own ⋯ is the task menu).
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  // Punch 31: "Edit rule" opens the real themed Repeat menu, anchored where the menu was opened —
  // not a native <select>.
  const [ruleMenu, setRuleMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Filter tasks to find repeating series
  // We represent each active repeating series by its currently active (status = todo) task with a recurrence_rule.
  const activeSeries = useMemo(() => {
    return allTasks.filter((t) => t.recurrence_rule && t.status === 'todo')
  }, [allTasks])

  // Get count of completed tasks to show last completed timestamp
  const completedTasks = useMemo(() => {
    return allTasks.filter((t) => t.status === 'done')
  }, [allTasks])

  // Group active series by cadence
  const groupedSeries = useMemo(() => {
    const daily: typeof activeSeries = []
    const weekly: typeof activeSeries = []
    const monthly: typeof activeSeries = []
    const custom: typeof activeSeries = []

    for (const t of activeSeries) {
      const type = getCadenceType(t.recurrence_rule || '')
      if (type === 'daily') daily.push(t)
      else if (type === 'weekly') weekly.push(t)
      else if (type === 'monthly') monthly.push(t)
      else custom.push(t)
    }

    return { daily, weekly, monthly, custom }
  }, [activeSeries])

  // Helper to find last completion date by task title
  function getLastCompletedDate(title: string): string | null {
    const matching = completedTasks.filter((t) => t.title === title)
    if (matching.length === 0) return null
    const latest = matching.reduce((latestTask, currTask) => {
      if (!latestTask.completed_at) return currTask
      if (!currTask.completed_at) return latestTask
      return new Date(currTask.completed_at) > new Date(latestTask.completed_at) ? currTask : latestTask
    })
    return latest.completed_at || null
  }

  // Repeating tasks due today or in the next six days, on the user's calendar.
  const dueThisWeekCount = activeSeries.filter((t) => {
    // A paused series makes no new copies (tasks/ skips paused rows), so it is not "due".
    if (!t.due_at || t.paused) return false
    const days = daysFromToday(t.due_at)
    return days >= 0 && days < 7
  }).length

  // Render Perennials Empty state (1b)
  if (activeSeries.length === 0) {
    return (
      <div style={{ width: '100%', maxWidth: 560, margin: '60px auto 0', background: 'var(--paper-linen)', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
        <div style={{ background: 'var(--paper-linen)', padding: '44px 40px 46px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            <svg width="52" height="44" viewBox="0 0 52 44"><path d="M8 14h36l-4 26H12L8 14Z" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinejoin="round" /><path d="M5 14h42" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" /></svg>
            <svg width="44" height="38" viewBox="0 0 52 44"><path d="M8 14h36l-4 26H12L8 14Z" fill="none" stroke="var(--ink-hairline)" strokeWidth="2" strokeLinejoin="round" /><path d="M5 14h42" stroke="var(--ink-hairline)" strokeWidth="2" strokeLinecap="round" /></svg>
            <svg width="52" height="44" viewBox="0 0 52 44"><path d="M8 14h36l-4 26H12L8 14Z" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinejoin="round" /><path d="M5 14h42" stroke="var(--ink-faint)" stroke-width="2" stroke-linecap="round" /><path d="M26 14V8" stroke="var(--acc-moss)" strokeWidth="2" strokeLinecap="round" /><path d="M26 9c-3-.5-4.5-2-5-5 3 0 4.7 1.3 5 5Z" fill="var(--acc-moss)" /></svg>
          </div>
          <div style={{ marginTop: 22, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 380, lineHeight: 1.45 }}>
            Nothing on repeat yet. Perennials come back on their own — give one a rhythm from any task's Repeat menu.
          </div>
          <Link to="/tasks" style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-body)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '9px 18px', textDecoration: 'none' }}>
            Open Tasks →
          </Link>
        </div>
      </div>
    )
  }

  // Svg Icons
  const DailyIcon = (
    <svg width="12" height="14" viewBox="0 0 16 20" style={{ marginRight: 6 }}><path d="M8 1c2 3 5 4 5 8 0 3-2.2 5-5 5s-5-2-5-5c0-4 3-5 5-8Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" /><path d="M8 14v5M5.5 19h5" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinecap="round" /></svg>
  )
  const WeeklyIcon = (
    <svg width="13" height="14" viewBox="0 0 18 20" style={{ marginRight: 6 }}><ellipse cx="9" cy="7" rx="3" ry="4.5" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" /><path d="M9 11v5" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinecap="round" /><path d="M4 16.5h10l-1 3H5l-1-3Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinejoin="round" /></svg>
  )
  const MonthlyIcon = (
    <svg width="13" height="14" viewBox="0 0 18 20" style={{ marginRight: 6 }}><path d="M5 12h8l-1.2 6.5H6.2L5 12Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinejoin="round" /><path d="M4 12h10" stroke="var(--ink-faint)" strokeWidth="1.4" stroke-linecap="round" /><path d="M9 12V7" stroke="var(--ink-faint)" strokeWidth="1.4" stroke-linecap="round" /><circle cx="9" cy="4.5" r="2.6" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" /></svg>
  )
  const CustomIcon = (
    <svg width="13" height="14" viewBox="0 0 18 20" style={{ marginRight: 6 }}><path d="M9 18c-3-4-6-5-6-9 0-3 2-5 4-5 .8 0 1.5.3 2 .8.5-.5 1.2-.8 2-.8 2 0 4 2 4 5 0 4-3 5-6 9Z" fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeLinejoin="round" /></svg>
  )

  // Editing a rule is reversible — undo puts the previous rule back (incl. "No repeat",
  // which removes the row from this page entirely until undone).
  const applyRule = (task: Task, rule: string | null, label: string) => {
    const prev = task.recurrence_rule ?? null
    setRecurrence(task, rule)
    toastUndo(rule ? `Repeat set — ${label.toLowerCase()}.` : 'Repeat removed.', () => setRecurrence(task, prev))
  }

  // Every series action is an Undo toast that writes the row back as it was (Flow Audit §4).
  const handleSkip = (task: Task) => {
    skipNextOccurrence(task)
    toastUndo(`Skipped next occurrence of "${task.title}"`, () => writeRow('tasks', task))
  }

  const handlePauseToggle = (task: Task) => {
    // `task` is the row before the change: pausing it again / resuming it again IS writing it back.
    if (task.paused) {
      resumeTask(task)
      toastUndo(`Resumed repeating "${task.title}"`, () => pauseTask(task))
    } else {
      pauseTask(task)
      toastUndo(`Paused repeating "${task.title}"`, () => resumeTask(task))
    }
  }

  const seriesActions = (t: Task): { label: string; icon: IconName; danger?: boolean; run: () => void }[] => [
    { label: 'Edit rule…', icon: 'repeat', run: () => setRuleMenu(menu && { ...menu, id: t.id }) },
    // Nothing to skip without a next date.
    ...(t.due_at ? [{ label: 'Skip next', icon: 'tomorrow' as IconName, run: () => handleSkip(t) }] : []),
    { label: t.paused ? 'Resume' : 'Pause', icon: t.paused ? 'rotate' : 'stop', run: () => handlePauseToggle(t) },
    // No confirm: Trash + Undo, like every task delete.
    { label: 'End series', icon: 'delete', danger: true, run: () => deleteTasksWithUndo([t]) },
  ]
  const ruleChoices = (t: Task) => [
    { label: 'No repeat', run: () => applyRule(t, null, 'No repeat') },
    { label: 'Daily', run: () => applyRule(t, 'FREQ=DAILY', 'Daily') },
    { label: 'Weekly', run: () => applyRule(t, 'FREQ=WEEKLY', 'Weekly') },
    { label: 'Monthly', run: () => applyRule(t, 'FREQ=MONTHLY', 'Monthly') },
    // Custom… opens the task, where the full rule lives.
    { label: 'Custom…', run: () => openTask(t.id) },
  ]
  const menuTask = menu && activeSeries.find((t) => t.id === menu.id)
  const ruleTask = ruleMenu && activeSeries.find((t) => t.id === ruleMenu.id)
  const menuLayers = (
    <>
      {menu && menuTask && (isMobile ? (
        <ActionSheet
          title={menuTask.title}
          meta="Repeating"
          onClose={() => setMenu(null)}
          items={seriesActions(menuTask).map((a) => ({ label: a.label, icon: <Icon name={a.icon} />, destructive: a.danger, onSelect: a.run }))}
        />
      ) : (
        <ContextMenu
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={seriesActions(menuTask).map((a) => ({ label: a.label, icon: <Icon name={a.icon} size={16} />, danger: a.danger, onClick: a.run }))}
        />
      ))}
      {ruleMenu && ruleTask && (isMobile ? (
        <ActionSheet title="Repeat" meta={ruleTask.title} onClose={() => setRuleMenu(null)} items={ruleChoices(ruleTask).map((c) => ({ label: c.label, onSelect: c.run }))} />
      ) : (
        <ContextMenu position={{ x: ruleMenu.x, y: ruleMenu.y }} onClose={() => setRuleMenu(null)} items={ruleChoices(ruleTask).map((c) => ({ label: c.label, onClick: c.run }))} />
      ))}
    </>
  )

  const renderRow = (t: Task, rowIndex: number) => {
    const lastDone = getLastCompletedDate(t.title)
    const nextInfo = formatNextDue(t.due_at)

    return (
      <div
        key={t.id}
        className={motion ? 'kf-stagger-item' : undefined}
        // Right-click beside the task (its chip, its rule line) opens the series menu; on the task
        // itself the TaskRow's own menu has already taken it.
        onContextMenu={(e) => {
          if (e.isDefaultPrevented()) return
          e.preventDefault()
          setMenu({ id: t.id, x: e.clientX, y: e.clientY })
        }}
        // Phone: the next-date chip and the series button wrap under the task, or the title gets ~150px.
        style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : undefined, alignItems: 'center', gap: isMobile ? '0 10px' : 10, paddingBottom: isMobile ? 6 : 0, borderBottom: '1px dashed var(--line-dashed)', opacity: t.paused ? 0.62 : 1, ...(motion ? staggerDelay(rowIndex) : {}) }}
      >
        <div style={{ flex: isMobile ? '1 1 100%' : 1, minWidth: 0 }}>
          <TaskRow task={t} border={false} />
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '-6px 0 0 34px', paddingBottom: 11 }}>
            {formatRecurrenceRule(t.recurrence_rule || '')} · {t.paused ? 'paused · ' : ''}{formatLastCompleted(lastDone)}
          </div>
        </div>
        {isMobile && <span style={{ flex: 1 }} />}
        {t.paused ? (
          <Chip tone="bordered">Paused</Chip>
        ) : (
          <Chip tone={nextInfo.urgent ? 'terra' : 'lavender'}>{nextInfo.text}</Chip>
        )}
        <button
          type="button"
          className="kf-hit"
          aria-label={`Series options for ${t.title}`}
          aria-haspopup="menu"
          title="Series options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ id: t.id, x: r.left, y: r.bottom })
          }}
          style={{ flex: 'none', width: isMobile ? 44 : 28, height: isMobile ? 44 : 28, padding: 0, border: 'none', borderRadius: 6, background: 'none', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <Icon name="repeat" size={18} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', background: 'var(--paper-linen)', minHeight: '85vh', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />

      <div style={{ padding: '28px 0 48px', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-faint)' }}>
          <Link to="/tasks" style={{ color: 'var(--ink-faint)' }}>Tasks</Link>
          <span>›</span>
          <span style={{ color: 'var(--ink-muted)' }}>Repeating</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 46, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Everything that repeats, in one bed
              </div>
              <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                Perennials
              </h1>
            </div>
          </div>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingBottom: 4 }}>
            {activeSeries.length} series · {dueThisWeekCount} due this week
          </div>
        </div>

        {/* DAILY SECTION */}
        {groupedSeries.daily.length > 0 && (
          <>
            <SectionLabel style={{ marginTop: 28, marginBottom: 4 }} action={DailyIcon}>
              <span>Daily · {groupedSeries.daily.length}</span>
            </SectionLabel>
            {groupedSeries.daily.map((t, i) => renderRow(t, i))}
          </>
        )}

        {/* WEEKLY SECTION */}
        {groupedSeries.weekly.length > 0 && (
          <>
            <SectionLabel style={{ marginTop: 28, marginBottom: 4 }} action={WeeklyIcon}>
              <span>Weekly · {groupedSeries.weekly.length}</span>
            </SectionLabel>
            {groupedSeries.weekly.map((t, i) => renderRow(t, i))}
          </>
        )}

        {/* MONTHLY SECTION */}
        {groupedSeries.monthly.length > 0 && (
          <>
            <SectionLabel style={{ marginTop: 28, marginBottom: 4 }} action={MonthlyIcon}>
              <span>Monthly · {groupedSeries.monthly.length}</span>
            </SectionLabel>
            {groupedSeries.monthly.map((t, i) => renderRow(t, i))}
          </>
        )}

        {/* CUSTOM SECTION */}
        {groupedSeries.custom.length > 0 && (
          <>
            <SectionLabel style={{ marginTop: 28, marginBottom: 4 }} action={CustomIcon}>
              <span>Custom · {groupedSeries.custom.length}</span>
            </SectionLabel>
            {groupedSeries.custom.map((t, i) => renderRow(t, i))}
          </>
        )}
      </div>
      {menuLayers}
    </div>
  )
}
