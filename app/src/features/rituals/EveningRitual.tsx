import { useState } from 'react'
import { useTasks, completeTask, rescheduleDue } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { PillButton, RitualFooter, RitualHeader, RitualModal } from './RitualChrome'

const STEPS = ['sweep', 'preview'] as const

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

function dayBounds(offsetDays: number): [Date, Date] {
  const start = new Date()
  start.setDate(start.getDate() + offsetDays)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return [start, end]
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

export function EveningRitual({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  // Tasks completed during THIS ritual session render as "swept" (dimmed, struck-through,
  // fallen petal) instead of vanishing — matches the mockup's mixed open/swept list.
  const [justSwept, setJustSwept] = useState<string[]>([])

  const [, todayEnd] = dayBounds(0)
  const [tomorrowStart, tomorrowEnd] = dayBounds(1)

  const todaysOpen = tasks.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) <= todayEnd)
  const sweptTasks = tasks.filter((t) => justSwept.includes(t.id))
  const top3 = tasks.filter((t) => t.top3)
  const tomorrowsDue = tasks.filter(
    (t) => t.status === 'todo' && t.due_at && new Date(t.due_at) >= tomorrowStart && new Date(t.due_at) <= tomorrowEnd,
  )
  const tomorrowsEvents = events.filter((e) => new Date(e.starts_at) >= tomorrowStart && new Date(e.starts_at) <= tomorrowEnd)

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1)
    else onClose()
  }

  function markDone(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    completeTask(task)
    setJustSwept((s) => [...s, taskId])
  }

  const caption =
    step === 'sweep'
      ? todaysOpen.length === 0 && sweptTasks.length === 0
        ? 'all quiet, nothing left to sweep'
        : 'the garden is settling in for the night'
      : 'tomorrow is still just a seed'

  return (
    <RitualModal
      gradient="linear-gradient(90deg, var(--acc-lavender), color-mix(in srgb, var(--acc-lavender) 65%, var(--ink-body)) 50%, color-mix(in srgb, var(--acc-lavender) 40%, var(--ink-body)))"
      backdropTint="rgba(46,40,46,0.4)"
    >
      <RitualHeader label={`Evening ritual · step ${stepIndex + 1}/${STEPS.length}`} onSkip={onClose} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <img src={`assets/clover/${step === 'sweep' ? 'resting' : 'seedling'}.png`} alt="" style={{ height: 34, width: 'auto', objectFit: 'contain', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-1deg)' }}>{caption}</span>
      </div>

      {step === 'sweep' && (
        <>
          <h2 style={{ margin: '18px 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--text-primary)' }}>Sweep today</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>Still open — finish or roll each one forward.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {todaysOpen.length === 0 && sweptTasks.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Nothing left open today.</p>
            )}
            {todaysOpen.map((t) => (
              <div key={t.id} style={{ border: '1px dashed var(--border-default)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                <span style={{ width: 15, height: 15, border: '1.5px solid var(--line-sidebar)', borderRadius: 4, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, color: 'var(--text-primary)' }}>{t.title}</span>
                <PillButton onClick={() => markDone(t.id)}>done</PillButton>
                <button type="button" onClick={() => rescheduleDue(t, tomorrowIso())} style={{ border: 'none', background: 'none', color: 'var(--acc-lavender-deep)', fontFamily: 'inherit', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                  roll to tomorrow
                </button>
              </div>
            ))}
            {sweptTasks.map((t) => (
              <div key={t.id} style={{ border: '1px dashed var(--border-default)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', opacity: 0.55 }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, background: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-on-accent)', fontSize: 10, flex: 'none' }}>✓</span>
                <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, color: 'var(--ink-hairline)', textDecoration: 'line-through' }}>Swept just now</span>
                <img src="assets/cherry/fallen.png" alt="" style={{ height: 18, width: 'auto', opacity: 0.8 }} />
              </div>
            ))}
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <h2 style={{ margin: '18px 0 12px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--text-primary)' }}>Tomorrow, at a glance</h2>
          <PreviewRow label="Top-3" value={top3.length ? top3.map((t) => t.title).join(', ') : 'none set'} />
          <PreviewRow label="Due tomorrow" value={tomorrowsDue.length ? tomorrowsDue.map((t) => t.title).join(', ') : 'nothing due'} />
          <PreviewRow label="Scheduled" value={tomorrowsEvents.length ? tomorrowsEvents.map((e) => e.title).join(', ') : 'nothing blocked yet'} />
        </>
      )}

      <RitualFooter stepIndex={stepIndex} total={STEPS.length} onNext={next} isLast={stepIndex === STEPS.length - 1} />
    </RitualModal>
  )
}
