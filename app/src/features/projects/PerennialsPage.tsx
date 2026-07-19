import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { useDomains } from '../domains/api'
import {
  useTasks,
  setRecurrence,
  pauseTask,
  resumeTask,
  skipNextOccurrence,
  deleteTask,
} from '../tasks/api'
import { Chip, SectionLabel } from '../../components/kit'
import { useToastStore } from '../../lib/toastStore'
import { useEffect } from 'react'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import './xfx.css'

export function getCadenceType(rule: string): 'daily' | 'weekly' | 'monthly' | 'custom' {
  if (!rule) return 'custom'
  const upper = rule.toUpperCase()
  if (upper.includes('INTERVAL=') && !upper.includes('INTERVAL=1;')) return 'custom'
  if (upper.includes('FREQ=DAILY')) return 'daily'
  if (upper.includes('FREQ=WEEKLY')) return 'weekly'
  if (upper.includes('FREQ=MONTHLY')) return 'monthly'
  return 'custom'
}

export function formatRecurrenceRule(rule: string): string {
  if (!rule) return ''
  const upper = rule.toUpperCase()

  const intervalMatch = upper.match(/INTERVAL=(\d+)/)
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1

  if (upper.includes('FREQ=DAILY')) {
    return interval > 1 ? `Every ${interval} days` : 'Every day'
  }

  if (upper.includes('FREQ=WEEKLY')) {
    const bydayMatch = upper.match(/BYDAY=([A-Z,]+)/)
    if (bydayMatch) {
      const days = bydayMatch[1].split(',')
      const dayMap: Record<string, string> = {
        SU: 'Sun',
        MO: 'Mon',
        TU: 'Tue',
        WE: 'Wed',
        TH: 'Thu',
        FR: 'Fri',
        SA: 'Sat',
      }
      const formattedDays = days.map((d) => dayMap[d] || d).join(', ')
      return interval > 1 ? `Every ${interval} weeks on ${formattedDays}` : `Every ${formattedDays}`
    }
    return interval > 1 ? `Every ${interval} weeks` : 'Every week'
  }

  if (upper.includes('FREQ=MONTHLY')) {
    const bymonthdayMatch = upper.match(/BYMONTHDAY=(\d+)/)
    if (bymonthdayMatch) {
      const day = parseInt(bymonthdayMatch[1])
      const suffix =
        day === 1 || day === 21 || day === 31 ? 'st' :
        day === 2 || day === 22 ? 'nd' :
        day === 3 || day === 23 ? 'rd' : 'th'
      return interval > 1 ? `Every ${interval} months on the ${day}${suffix}` : `Monthly on the ${day}${suffix}`
    }
    return interval > 1 ? `Every ${interval} months` : 'Monthly'
  }

  return 'Custom repeat'
}

export function formatLastCompleted(completedAt: string | null): string {
  if (!completedAt) return 'never done'
  const date = new Date(completedAt)
  const now = new Date()

  const isToday = date.toDateString() === now.toDateString()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isToday) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `last done today ${hours}:${minutes}`
  }

  if (isYesterday) {
    return 'last done yesterday'
  }

  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return `last done ${weekday} ${String(day).padStart(2, '0')} ${month}`
}

export function formatNextDue(dueAt: string | null): { text: string; urgent: boolean } {
  if (!dueAt) return { text: 'no date', urgent: false }
  const date = new Date(dueAt)
  const now = new Date()

  const isToday = date.toDateString() === now.toDateString()

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  if (isToday) {
    return { text: 'Next: today', urgent: true }
  }
  if (isTomorrow) {
    return { text: 'Next: tomorrow', urgent: false }
  }

  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return { text: `Next: ${weekday} ${String(day).padStart(2, '0')} ${month}`, urgent: false }
}

export function PerennialsPage() {
  const { data: domains = [] } = useDomains()
  const { data: allTasks = [] } = useTasks()
  const motion = useMotionEnabled()

  // X4: hover-revealed row actions get a touch counterpart — a per-row expand toggle
  // (spec: "row actions collapse into an ellipsis" on mobile)
  const [isCoarse, setIsCoarse] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches)
  useEffect(() => {
    const mq = matchMedia('(hover: none)')
    const on = () => setIsCoarse(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Hover states
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [confirmEndSeries, setConfirmEndSeries] = useState<string | null>(null)

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

  // Count repeating tasks due this week
  const dueThisWeekCount = useMemo(() => {
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + 7)

    return activeSeries.filter((t) => {
      if (!t.due_at) return false
      const due = new Date(t.due_at)
      return due >= now && due <= endOfWeek
    }).length
  }, [activeSeries])

  // Render Perennials Empty state (1b)
  if (activeSeries.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto 0', background: 'var(--paper-linen)', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden', position: 'relative' }}>
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

  const handleSkip = (task: any) => {
    skipNextOccurrence(task)
    useToastStore.getState().push({ message: `Skipped next occurrence of "${task.title}".` })
  }

  const handlePauseToggle = (task: any) => {
    if (task.paused) {
      resumeTask(task)
      useToastStore.getState().push({ message: `Resumed repeating "${task.title}".` })
    } else {
      pauseTask(task)
      useToastStore.getState().push({ message: `Paused repeating "${task.title}".` })
    }
  }

  const handleEndSeries = (task: any) => {
    deleteTask(task)
    useToastStore.getState().push({ message: `Ended repeating series "${task.title}".` })
    setConfirmEndSeries(null)
  }

  const renderRow = (t: any, rowIndex: number) => {
    const lastDone = getLastCompletedDate(t.title)
    const nextInfo = formatNextDue(t.due_at)
    const domain = domains.find((d) => d.id === t.domain_id)

    const isHovered = hoveredRow === t.id
    const isEditing = editingRule === t.id
    const isConfirming = confirmEndSeries === t.id

    return (
      <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={{ display: 'flex', flexDirection: 'column', ...(motion ? staggerDelay(rowIndex) : {}) }}>
        <div
          onMouseEnter={() => setHoveredRow(t.id)}
          onMouseLeave={() => {
            setHoveredRow(null)
            if (!isEditing) setHoveredRow(null)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '13px 12px',
            margin: '0 -10px',
            borderRadius: 6,
            background: isHovered ? 'var(--paper-bone)' : 'transparent',
            opacity: t.paused ? 0.62 : 1,
            transition: 'background var(--dur-quick) var(--ease-natural)',
          }}
        >
          {/* Accent dot or paused icon */}
          {t.paused ? (
            <svg width="15" height="15" viewBox="0 0 24 24" style={{ flex: 'none' }}><path d="M12 20c0-5 0-8 3-11" fill="none" stroke="var(--ink-faint)" strokeWidth="1.5" strokeLinecap="round" /><path d="M15 9c2.6-.4 4-2 4.4-4.6C17 4 15 5 14.3 7.2" fill="var(--ink-hairline)" opacity="0.7" transform="rotate(24 15 6)" /><path d="M12 13c-2-2-4.5-2.2-6.5-1 1.4 2.4 3.4 3.2 5.8 2.6" fill="var(--ink-hairline)" opacity="0.7" /></svg>
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: domain?.color ?? 'var(--acc-sage)', flex: 'none' }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14.5px', color: t.paused ? 'var(--ink-muted)' : 'var(--ink-body)', fontWeight: t.paused ? 400 : 500 }}>{t.title}</div>
            <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 4 }}>
              {formatRecurrenceRule(t.recurrence_rule || '')} · {formatLastCompleted(lastDone)}
            </div>
          </div>

          {/* Action controls or Next due date chip */}
          {(isHovered || (isCoarse && hoveredRow === t.id)) && !isConfirming && !isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
              <span onClick={() => setEditingRule(t.id)} style={{ fontSize: 12, color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer' }}>Edit rule</span>
              <span onClick={() => handleSkip(t)} style={{ fontSize: 12, color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer' }}>Skip next</span>
              <span onClick={() => handlePauseToggle(t)} style={{ fontSize: 12, color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer' }}>
                {t.paused ? 'Resume' : 'Pause'}
              </span>
              <span onClick={() => setConfirmEndSeries(t.id)} style={{ fontSize: 12, color: 'var(--acc-terra)', textDecoration: 'underline', cursor: 'pointer' }}>End series</span>
            </div>
          ) : (
            <>
              {t.paused ? (
                <Chip tone="bordered">Paused</Chip>
              ) : (
                <Chip tone={nextInfo.urgent ? 'terra' : 'lavender'}>{nextInfo.text}</Chip>
              )}
              {isCoarse && (
                <span
                  onClick={() => setHoveredRow(hoveredRow === t.id ? null : t.id)}
                  style={{ fontSize: 18, color: 'var(--ink-faint)', padding: '10px 12px', margin: '-10px -8px', cursor: 'pointer', userSelect: 'none' }}
                >⋯</span>
              )}
            </>
          )}
        </div>

        {/* Inline rule edit */}
        {isEditing && (
          <div style={{ margin: '4px 0 8px 32px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Repeat rule:</span>
            <select
              value={t.recurrence_rule || ''}
              onChange={(e) => {
                setRecurrence(t, e.target.value || null)
                setEditingRule(null)
                useToastStore.getState().push({ message: 'Recurrence rule updated.' })
              }}
              style={{ font: 'inherit', fontSize: 12, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '4px 8px', outline: 'none', color: 'var(--ink-body)' }}
            >
              <option value="FREQ=DAILY">Every day</option>
              <option value="FREQ=WEEKLY;BYDAY=MO,WE">Every Mon, Wed</option>
              <option value="FREQ=WEEKLY;BYDAY=SU">Every Sun</option>
              <option value="FREQ=WEEKLY;BYDAY=TH">Every Thu</option>
              <option value="FREQ=WEEKLY;BYDAY=FR">Every Fri</option>
              <option value="FREQ=MONTHLY;BYMONTHDAY=1">Monthly on the 1st</option>
              <option value="FREQ=MONTHLY;BYMONTHDAY=3">Monthly on the 3rd</option>
              <option value="FREQ=WEEKLY;INTERVAL=6">Every 6 weeks</option>
            </select>
            <span onClick={() => setEditingRule(null)} style={{ fontSize: 12, color: 'var(--ink-faint)', cursor: 'pointer', textDecoration: 'underline' }}>Cancel</span>
          </div>
        )}

        {/* Inline end-series confirm */}
        {isConfirming && (
          <div style={{ margin: '8px 0 8px 32px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-panel)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, maxWidth: 520 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-body)' }}>End this repeat? Past completions stay in the log.</span>
            <span style={{ flex: 1 }}></span>
            <span onClick={() => setConfirmEndSeries(null)} style={{ fontSize: 12.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</span>
            <button
              onClick={() => handleEndSeries(t)}
              style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12, padding: '7px 14px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
            >
              End series
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', background: 'var(--paper-linen)', minHeight: '85vh', position: 'relative' }}>
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
              <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Everything that repeats, in one bed
              </div>
              <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                Perennials
              </h1>
            </div>
          </div>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingBottom: 4 }}>
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
    </div>
  )
}
