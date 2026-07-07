import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTasks, rescheduleDue, deleteTask, toggleTop3 } from '../tasks/api'
import { usePendingInboxItems, fileToTask, dismissInboxItem } from '../inbox/api'
import { PillButton, RitualFooter, RitualHeader, RitualModal } from './RitualChrome'

const STEPS = ['overdue', 'top3', 'inbox', 'block'] as const
const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  overdue: 'Review overdue',
  top3: 'Pick your Top-3',
  inbox: 'Inbox to zero',
  block: 'Time-block your day',
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

// One clover per step: completed steps settle into a dewdrop, the current step is awake,
// upcoming steps are seedlings that fade further out — mirrors the mockup's "two sprouts
// awake, two still sleeping" cluster, generalized to any step count/position.
function StepClovers({ stepIndex, total }: { stepIndex: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
      {Array.from({ length: total }, (_, i) => {
        if (i < stepIndex) return <img key={i} src="assets/clover/dewdrop.png" alt="" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
        if (i === stepIndex) return <img key={i} src="assets/clover/awake.png" alt="" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
        const distance = i - stepIndex
        const opacity = Math.max(0.2, 0.55 - (distance - 1) * 0.2)
        return <img key={i} src="assets/clover/seedling.png" alt="" style={{ height: 24, width: 'auto', objectFit: 'contain', opacity }} />
      })}
    </div>
  )
}

export function MorningRitual({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = usePendingInboxItems()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const overdue = tasks.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) < startOfToday)
  const top3 = tasks.filter((t) => t.top3)
  const candidatesForTop3 = tasks.filter((t) => t.status === 'todo' && !t.top3)

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1)
    else onClose()
  }

  const caption =
    step === 'overdue'
      ? overdue.length === 0
        ? 'no loose ends from yesterday'
        : `${overdue.length} loose end${overdue.length === 1 ? '' : 's'} from yesterday`
      : step === 'top3'
        ? `${top3.length} sprout${top3.length === 1 ? '' : 's'} awake, ${3 - top3.length} still sleeping`
        : step === 'inbox'
          ? inboxItems.length === 0
            ? 'the inbox is clear, not a leaf out of place'
            : `${inboxItems.length} letter${inboxItems.length === 1 ? '' : 's'} still waiting`
          : "let today's shape settle onto the calendar"

  return (
    <RitualModal gradient="linear-gradient(90deg, var(--acc-buttercream), var(--acc-gold-warm) 40%, var(--acc-clover))" backdropTint="rgba(58,50,38,0.34)">
      <RitualHeader label={`Morning ritual · step ${stepIndex + 1}/${STEPS.length}`} onSkip={onClose} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <StepClovers stepIndex={stepIndex} total={STEPS.length} />
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-1deg)' }}>{caption}</span>
      </div>

      <h2 style={{ margin: '18px 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--text-primary)' }}>
        {STEP_TITLES[step]}
        {step === 'top3' && (
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 13, color: 'var(--text-tertiary)' }}> ({top3.length}/3)</span>
        )}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 280, overflowY: 'auto' }}>
        {step === 'overdue' &&
          (overdue.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Nothing overdue.</p>
          ) : (
            overdue.map((t) => (
              <div key={t.id} style={{ border: '1px dashed var(--border-default)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)' }}>{t.title}</span>
                <PillButton onClick={() => rescheduleDue(t, tomorrowIso())}>push to tomorrow</PillButton>
                <button type="button" onClick={() => deleteTask(t)} style={{ border: 'none', background: 'none', color: 'var(--acc-terra)', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                  drop
                </button>
              </div>
            ))
          ))}

        {step === 'top3' && (
          <>
            {top3.map((t, i) => (
              <div
                key={t.id}
                onClick={() => toggleTop3(t)}
                style={{ background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11, transform: `rotate(${i % 2 === 0 ? -0.3 : 0.25}deg)`, cursor: 'pointer' }}
              >
                <span style={{ color: 'var(--acc-terra)', fontSize: 15, lineHeight: 1 }}>★</span>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)' }}>{t.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>picked</span>
              </div>
            ))}
            {candidatesForTop3.map((t) => (
              <div key={t.id} style={{ border: '1px dashed var(--border-default)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ color: 'var(--line-sidebar)', fontSize: 15, lineHeight: 1 }}>☆</span>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)' }}>{t.title}</span>
                <PillButton onClick={() => toggleTop3(t)}>star</PillButton>
              </div>
            ))}
          </>
        )}

        {step === 'inbox' &&
          (inboxItems.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Inbox zero already.</p>
          ) : (
            inboxItems.map((item) => (
              <div key={item.id} style={{ border: '1px dashed var(--border-default)', borderRadius: 3, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)' }}>{item.raw_text}</span>
                <PillButton onClick={() => fileToTask(item)}>file</PillButton>
                <button type="button" onClick={() => dismissInboxItem(item)} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                  dismiss
                </button>
              </div>
            ))
          ))}

        {step === 'block' && (
          <div>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Drag your Top-3 and anything important onto today's calendar.
            </p>
            <PillButton
              onClick={() => {
                navigate('/calendar')
                onClose()
              }}
            >
              Open calendar
            </PillButton>
          </div>
        )}
      </div>

      <RitualFooter stepIndex={stepIndex} total={STEPS.length} onNext={next} isLast={stepIndex === STEPS.length - 1} />
    </RitualModal>
  )
}
