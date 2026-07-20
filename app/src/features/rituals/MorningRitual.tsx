import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useTasks, rescheduleDue, deleteTask, toggleTop3 } from '../tasks/api'
import { usePendingInboxItems, fileToTask, dismissInboxItem } from '../inbox/api'
import { useCalendarEvents, scheduleTask } from '../calendar/api'
import { localToIso } from '../calendar/eventTime'
import { localDateKey } from '../routines/streaks'
import { logRitualStep } from './api'
import { FieldLabel, RLink, Pill, CtaButton, useIsMobile } from './RitualChrome'
import type { Task } from '../../lib/types'

// ── Morning ritual — pixel contract Rituals.dc.html 1a (overdue), 1b/3b (top-3, open vs.
// seeded), 1c (inbox to zero), 1d (time-block), 1g (iPhone). The "scene" parchment takeover
// on desktop, a full-bleed sheet at phone widths. ──

const A = '/ds/assets'
const STEPS = ['overdue', 'top3', 'inbox', 'block'] as const
type Step = (typeof STEPS)[number]
const STEP_TITLES: Record<Step, string> = {
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

function daysOver(dueAt: string): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((start.getTime() - new Date(dueAt).getTime()) / 86_400_000))
}

// One clover per step: completed steps settle into a dewdrop, the current step is awake,
// upcoming steps are seedlings that fade further out.
function StepClovers({ stepIndex, total }: { stepIndex: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flex: 'none' }}>
      {Array.from({ length: total }, (_, i) => {
        if (i < stepIndex) return <img key={i} src={`${A}/clover/dewdrop.png`} alt="" style={{ height: 30 }} />
        if (i === stepIndex) return <img key={i} src={`${A}/clover/awake.png`} alt="" style={{ height: 34 }} />
        const distance = i - stepIndex
        const opacity = Math.max(0.2, 0.55 - (distance - 1) * 0.2)
        return <img key={i} src={`${A}/clover/seedling.png`} alt="" style={{ height: 24, opacity }} />
      })}
    </div>
  )
}

// The parchment "scene" panel — desktop centered takeover, full-bleed sheet on phone widths.
// A5 (2026-07-18 audit): the export's `.scene-dim` scrim now lives on the full-viewport
// `inset:0` layer (it used to sit inside a fixed-width inner box, so the app behind was never
// dimmed) — the real app plays the role of the export's faux page behind the scene. The panel
// carries the export `.panel` elevation shadow (0 30px 70px) so it reads as a takeover.
function MorningPanel({ wide, children, footer }: { wide?: boolean; children: ReactNode; footer: ReactNode }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--paper-parchment)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 6, flex: 'none', background: 'linear-gradient(90deg,var(--acc-buttercream),var(--acc-gold-warm) 40%,var(--acc-clover))' }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 20px 0', display: 'flex', flexDirection: 'column' }}>{children}</div>
        <div style={{ flex: 'none', padding: '14px 20px 22px' }}>{footer}</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'radial-gradient(120% 90% at 50% 0%, rgba(42,36,32,0.1), rgba(42,36,32,0.34) 90%)' }}>
      <div style={{ position: 'relative', width: wide ? 940 : 520, maxWidth: '100%', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 12, boxShadow: '0 30px 70px rgba(46,40,32,0.4)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 7, flex: 'none', background: 'linear-gradient(90deg,var(--acc-buttercream),var(--acc-gold-warm) 40%,var(--acc-clover))' }} />
        <div style={{ padding: '22px 26px 24px', overflowY: 'auto' }}>
          {children}
          {footer}
        </div>
      </div>
    </div>
  )
}

function StepFooter({ onSkip, onNext, label }: { onSkip: () => void; onNext: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 15, borderTop: '1px dashed var(--line-dashed)' }}>
      <RLink onClick={onSkip}>skip for now</RLink>
      <CtaButton onClick={onNext}>{label}</CtaButton>
    </div>
  )
}

export function MorningRitual({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [repicking, setRepicking] = useState(false)
  const step = STEPS[stepIndex]
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = usePendingInboxItems()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const overdue = tasks.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) < startOfToday)
  const top3 = tasks.filter((t) => t.top3)
  const candidatesForTop3 = tasks.filter((t) => t.status === 'todo' && !t.top3)
  const seeded = step === 'top3' && top3.length === 3 && !repicking

  function next() {
    logRitualStep('morning', STEPS[stepIndex])
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1)
    else onClose()
  }

  // 3b — "the step arrives closed and auto-advances after a beat unless touched".
  const seededRef = useRef(seeded)
  seededRef.current = seeded
  useEffect(() => {
    if (!seeded) return
    const t = setTimeout(() => {
      if (seededRef.current) next()
    }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, stepIndex])

  const caption =
    step === 'overdue'
      ? overdue.length === 0
        ? 'no loose ends from yesterday'
        : `${overdue.length} loose end${overdue.length === 1 ? '' : 's'} from yesterday`
      : step === 'top3'
        ? seeded
          ? 'picked from bed, last night'
          : `${top3.length} sprout${top3.length === 1 ? '' : 's'} awake, ${Math.max(0, 3 - top3.length)} still sleeping`
        : step === 'inbox'
          ? inboxItems.length === 0
            ? 'the inbox is clear, not a leaf out of place'
            : `${inboxItems.length} letter${inboxItems.length === 1 ? '' : 's'} still waiting`
          : "let today's shape settle onto the calendar"

  // A6 (2026-07-18 audit): two distinct skips — the top-right "skip" advances past the current
  // step without performing it (also the block step's only skip, since it has no footer); the
  // footer's "skip for now" abandons the whole ritual.
  return (
    <MorningPanel wide={step === 'block'} footer={step === 'block' ? null : <StepFooter onSkip={onClose} onNext={next} label={stepIndex === STEPS.length - 1 ? 'Finish' : 'Next →'} />}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <FieldLabel>
          {`Morning ritual · step ${stepIndex + 1}/${STEPS.length}`}
          {seeded && <span style={{ color: 'var(--acc-gold)' }}> · closed by last night's seeds</span>}
        </FieldLabel>
        <RLink onClick={next}>skip</RLink>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 16 }}>
        <StepClovers stepIndex={stepIndex} total={STEPS.length} />
        <span style={{ marginLeft: 6, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-1deg)' }}>{caption}</span>
      </div>

      {step === 'top3' && seeded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, background: 'var(--paper-goal)', border: '1.5px dashed var(--line-goal)', borderRadius: 8, padding: '12px 15px', transform: 'rotate(-0.3deg)' }}>
          <svg width="30" height="22" viewBox="0 0 34 24" style={{ flex: 'none' }}>
            <path d="M2 4h30v18H2V4Z" fill="#C8B48C" stroke="#9d8a63" strokeWidth="1.5" />
            <path d="M2 4l15 10L32 4" fill="none" stroke="#9d8a63" strokeWidth="1.5" />
          </svg>
          <div style={{ flex: 1 }}>
            <FieldLabel color="var(--acc-gold)">Planted last night</FieldLabel>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Tomorrow's three came in from the closing ritual — this step is already done.</div>
          </div>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--acc-gold)', flex: 'none' }}>✿ {top3.length} seed{top3.length === 1 ? '' : 's'}</span>
        </div>
      )}

      <h2 style={{ margin: '18px 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 23, color: 'var(--ink-body)' }}>
        {step === 'top3' && seeded ? 'Your Top-3' : STEP_TITLES[step]}
        {step === 'top3' && (
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 13, color: 'var(--ink-faint)' }}> ({top3.length}/3{seeded ? ' · seeded' : ''})</span>
        )}
      </h2>

      {step === 'overdue' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-faint)' }}>Push each one forward or let it go — start the day with a clean slate.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {overdue.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>Nothing overdue.</p>
            ) : (
              overdue.map((t) => (
                <div key={t.id} style={{ border: '1px dashed var(--line-solid)', borderRadius: 6, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={t.title} /></span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, background: 'rgba(181,101,74,0.14)', color: 'var(--acc-terra)' }}>
                    {daysOver(t.due_at!)}d over
                  </span>
                  <Pill onClick={() => rescheduleDue(t, tomorrowIso())}>push to tomorrow</Pill>
                  <RLink onClick={() => deleteTask(t)} color="var(--acc-terra)">drop</RLink>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {step === 'top3' && (
        seeded ? (
          <>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-faint)' }}>Picked from bed, last night. Confirm them — or re-pick if the morning knows better.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top3.map((t, i) => (
                <div key={t.id} style={{ background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', borderRadius: 6, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, transform: `rotate(${i % 2 === 0 ? -0.3 : 0.2}deg)` }}>
                  <span style={{ color: 'var(--acc-terra)', fontSize: 15 }}>★</span>
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={t.title} /></span>
                  <FieldLabel color="var(--acc-gold)">seeded</FieldLabel>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 15, borderTop: '1px dashed var(--line-dashed)' }}>
              <RLink onClick={() => setRepicking(true)}>re-pick</RLink>
              <CtaButton onClick={next}>Keep &amp; continue →</CtaButton>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-faint)' }}>The three that would make today a good day. Star up to three.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {top3.map((t, i) => (
                <div key={t.id} onClick={() => toggleTop3(t)} style={{ background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', borderRadius: 6, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, transform: `rotate(${i % 2 === 0 ? -0.3 : 0.25}deg)`, cursor: 'pointer' }}>
                  <span style={{ color: 'var(--acc-terra)', fontSize: 15 }}>★</span>
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={t.title} /></span>
                  <FieldLabel color="var(--acc-gold)">picked</FieldLabel>
                </div>
              ))}
              {candidatesForTop3.map((t) => (
                <div key={t.id} style={{ border: '1px dashed var(--line-solid)', borderRadius: 6, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--line-sidebar)', fontSize: 15 }}>☆</span>
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-body)' }}><EmojiText text={t.title} /></span>
                  <Pill onClick={() => toggleTop3(t)}>star</Pill>
                </div>
              ))}
            </div>
            {repicking && <div style={{ marginTop: 8 }}><RLink onClick={() => setRepicking(false)}>done re-picking</RLink></div>}
          </>
        )
      )}

      {step === 'inbox' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-faint)' }}>File what matters, dismiss what doesn't. The hydrangea calms as it clears.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {inboxItems.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>Inbox zero already.</p>
            ) : (
              inboxItems.map((item) => (
                <div key={item.id} style={{ border: '1px dashed var(--line-solid)', borderRadius: 6, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, color: 'var(--ink-body)' }}>{item.raw_text}</span>
                  <button
                    type="button"
                    onClick={() => fileToTask(item)}
                    style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 13px', borderRadius: 999, cursor: 'pointer' }}
                  >
                    file
                  </button>
                  <RLink onClick={() => dismissInboxItem(item)}>dismiss</RLink>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {step === 'block' && <BlockStep />}
    </MorningPanel>
  )
}

// ── Step 4 — Time-block your day: source beds (Top-3 / Inbox / This week) dragged onto a
// live hour grid for today. Pixel contract 1d — the sample 8am-2pm window becomes a
// scrollable real-hours grid so any task can actually be planted, not just the seven shown. ──

const HOUR_START = 6
const HOUR_END = 22
const HOUR_PX = 52

function BedItem({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        borderRadius: 6,
        padding: '8px 10px',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      <span style={{ color: 'var(--ink-hairline)', fontSize: 11, letterSpacing: -3 }}>⠿</span>
      {task.top3 && <span style={{ color: 'var(--acc-terra)', fontSize: 12 }}>★</span>}
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-body)' }}><EmojiText text={task.title} /></span>
      {task.duration_min != null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>{task.duration_min}m</span>
      )}
    </div>
  )
}

function Bed({ icon, title, tasks }: { icon: string; title: string; tasks: Task[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <img src={icon} alt="" style={{ height: 26 }} />
        <FieldLabel>{title}</FieldLabel>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{tasks.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0 }}>nothing here</p>
        ) : (
          tasks.map((t) => <BedItem key={t.id} task={t} />)
        )}
      </div>
    </div>
  )
}

function HourRow({ hour, isOver, setNodeRef }: { hour: number; isOver: boolean; setNodeRef: (el: HTMLElement | null) => void }) {
  const label = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : hour === 0 ? '12 AM' : `${hour} AM`
  return (
    <div ref={setNodeRef} style={{ position: 'relative', height: HOUR_PX, borderBottom: '1px solid var(--line-card)', background: isOver ? 'rgba(168,160,190,0.14)' : undefined }}>
      <span style={{ position: 'absolute', left: -46, top: -6, width: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{label}</span>
    </div>
  )
}

function DropSlot({ hour }: { hour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `hour-${hour}` })
  return <HourRow hour={hour} isOver={isOver} setNodeRef={setNodeRef} />
}

function inboxStage(count: number): string {
  return count === 0 ? 'zero' : count < 5 ? 'light' : count < 10 ? 'medium' : 'heavy'
}

function BlockStep() {
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: inboxItems = [] } = usePendingInboxItems()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const in7Days = new Date(startOfToday)
  in7Days.setDate(in7Days.getDate() + 7)

  const top3 = tasks.filter((t) => t.status === 'todo' && t.top3)
  const thisWeek = tasks.filter(
    (t) => t.status === 'todo' && !t.top3 && t.due_at && new Date(t.due_at) >= startOfToday && new Date(t.due_at) < in7Days,
  )

  const todayEvents = events
    .filter((e) => !e.all_day && new Date(e.starts_at).toDateString() === new Date().toDateString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const plantedToday = todayEvents.filter((e) => e.task_id)
  const totalMin = todayEvents.reduce((sum, e) => sum + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return
    const task = tasks.find((t) => t.id === e.active.id)
    if (!task) return
    const hour = Number(String(e.over.id).replace('hour-', ''))
    const dateKey = localDateKey(new Date())
    const start = localToIso(dateKey, `${String(hour).padStart(2, '0')}:00`)
    const durationMin = task.duration_min ?? 30
    const end = new Date(new Date(start).getTime() + durationMin * 60000).toISOString()
    scheduleTask(task, start, end)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <p style={{ margin: '4px 0 14px', fontSize: 12.5, color: 'var(--ink-faint)' }}>Give the day a shape. Drag anything from the beds on the left into an open hour; drop the rest tomorrow.</p>
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
        <div style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Bed icon={`${A}/daisy/morning.png`} title="Today · Top-3" tasks={top3} />
          {/* Inbox bed (contract 1d): read-only here — filing+scheduling in one drag needs inbox/api.ts, owned by W4 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
              <img src={`${A}/hydrangea/${inboxStage(inboxItems.length)}.png`} alt="" style={{ height: 26, flex: 'none' }} />
              <FieldLabel>Inbox</FieldLabel>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{inboxItems.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {inboxItems.length === 0 ? (
                <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0 }}>nothing here</p>
              ) : (
                inboxItems.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px' }}>
                    <span style={{ color: 'var(--ink-hairline)', fontSize: 11, lineHeight: 1, letterSpacing: -3 }}>⠿</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-body)' }}>{item.raw_text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <Bed icon={`${A}/wisteria/p40.png`} title="This week" tasks={thisWeek} />
        </div>
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--line-solid)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-parchment)' }}>
          <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: '1px solid var(--line-card)', background: 'var(--paper-bone)' }}>
            <FieldLabel>{new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })} · today</FieldLabel>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>
              <span style={{ color: 'var(--acc-sage)' }}>●</span> {plantedToday.length} planted · {Math.floor(totalMin / 60)}h{totalMin % 60 ? ` ${totalMin % 60}m` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', height: 364, overflowY: 'auto' }}>
            <div style={{ width: 46, flex: 'none', position: 'relative', borderRight: '1px solid var(--line-card)' }} />
            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((hour) => (
                <DropSlot key={hour} hour={hour} />
              ))}
              {todayEvents.map((e) => {
                const start = new Date(e.starts_at)
                const end = new Date(e.ends_at)
                const startMin = (start.getHours() - HOUR_START) * 60 + start.getMinutes()
                const durMin = (end.getTime() - start.getTime()) / 60000
                if (startMin < 0) return null
                return (
                  <div
                    key={e.id}
                    style={{
                      position: 'absolute',
                      top: (startMin / 60) * HOUR_PX,
                      left: 7,
                      right: 8,
                      height: Math.max(20, (durMin / 60) * HOUR_PX),
                      background: 'rgba(168,160,190,0.2)',
                      borderLeft: '3px solid var(--acc-lavender)',
                      boxShadow: e.task_id ? 'inset 3px 0 0 var(--acc-blossom)' : undefined,
                      borderRadius: 3,
                      padding: '5px 9px',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.task_id && <span style={{ color: 'var(--acc-terra)', fontSize: 11 }}>★</span>}
                      <span style={{ fontSize: 11.5, color: 'var(--ink-body)' }}>{e.title}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faint)', marginTop: 2 }}>
                      {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  )
}
