import { useEffect, useRef, useState } from 'react'
import { DndContext, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { createRoutine, createChallenge, updateRoutine } from './api'
import { localDateKey } from './streaks'
import { useDomains } from '../domains/api'
import { Select } from '../../components/Select'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { ActionSheet } from '../../components/ActionSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { TimeField } from '../calendar/TimeField'
import { Toggle } from '../../components/kit'
import { NumberField } from '../../components/NumberField'
import { NEW_ROUTINE_DEFAULTS, addDays, applyRoutineForm, draftToRoutineFields, formChanged, moveItem, parseMinutes, routineToForm, stepsTotal, writeSteps, type RepeatMode, type RoutineFormState, type StepDraft, type TimeMode } from './newRoutine'
import { PLANTS, PLANT_ORDER, plantPreviewSrc, plantSrc } from './plant'
import type { Routine, RoutinePlant } from '../../lib/types'

// Phone: the form rides the kit BottomSheet, whose scrim/swipe/Back always dismiss — and
// "closing never discards" (BottomSheet's contract), so a dismissed sheet parks its draft here
// and the same form (same routine, or a new one) opens with it again. Plant/Save/Cancel clear it.
// ponytail: one module-level draft — a reload drops it; enough for "I tapped outside by mistake".
let parked: { key: string; form: RoutineFormState } | null = null

// ── New routine — pixel contract Routines.dc.html #2a (desktop) / #2b (iPhone sheet).
// "Steps" and "Domain" are real since migration 0028 (routines.steps jsonb + domain_id).
// Routines 2 (Kai 2026-10-12, "build the unbuilt designs"): each step carries 2a's minutes chip and
// the list its "N min total"; steps reorder by the ⠿ handle (drag on a computer, hold-and-drag on a
// phone; a tap on it opens Move up / Move down / Remove step; ↑/↓ on it, or Alt+↑/↓ in the step,
// move it from the keyboard). "Its plant" is 2a's five-species picker (routines.plant, 0067), and the
// header + Plant button draw the chosen species. Deviations: the phone rows (2b draws no handle and
// no ✕) carry 2a's ⠿, and its sheet holds Remove step; 2b's picker shows four tiles and drops
// Clover — the phone shows all five, in 2a's order (they fit at 390).
// "Challenge" trades the mock's bare day-count for a real start/end pair: start = today, end = today + N-1.
// Polish B (audit-newuser): the form opens neutral — Anytime · Every day · reminder off — not
// on the mock's filled sample; see NEW_ROUTINE_DEFAULTS in newRoutine.ts.
// Edit mode (Kai 2026-10-12): pass `routine` and the same form opens prefilled from it, titled
// "Edit routine", and saves over the row (routineToForm / applyRoutineForm in newRoutine.ts). ──

const WEEKDAY_COLS: { day: number; label: string }[] = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' },
]

export function NewRoutineForm({ onClose, initialChallenge = false, routine }: { onClose: () => void; initialChallenge?: boolean; routine?: Routine }) {
  const motion = useMotionEnabled()
  const isMobile = useIsMobile()
  // Desktop modal only — on a phone the BottomSheet owns Esc/Back and the scroll lock.
  useEscapeStack(!isMobile, () => finish())
  useBodyScrollLock(!isMobile)
  // 2a's fields sit on a parchment modal and use bone for contrast. The phone form now rides the
  // kit BottomSheet, which is parchment too (2b's linen sheet was the hand-made one), so both
  // keep bone fields with a parchment "raised" tone.
  const fieldBg = 'var(--paper-bone)'
  const fieldBgRaised = 'var(--paper-parchment)'
  const closeSheet = useRef<(() => void) | null>(null)

  const draftKey = routine?.id ?? (initialChallenge ? 'new-challenge' : 'new')
  const [initial] = useState<RoutineFormState>(() =>
    routine ? routineToForm(routine) : { ...NEW_ROUTINE_DEFAULTS, name: '', steps: [], domainId: '', isChallenge: initialChallenge, challengeDays: 30, plant: 'vine' },
  )
  const [start] = useState<RoutineFormState>(() => (parked?.key === draftKey ? parked.form : initial))
  const [name, setName] = useState(start.name)
  const [steps, setSteps] = useState<StepDraft[]>(start.steps)
  const [plant, setPlant] = useState<RoutinePlant>(start.plant)
  const [domainId, setDomainId] = useState(start.domainId)
  const { data: domains = [] } = useDomains()
  const [timeMode, setTimeMode] = useState<TimeMode>(start.timeMode)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(start.repeatMode)
  const [customWeekdays, setCustomWeekdays] = useState<number[]>(start.customWeekdays)
  const [reminderOn, setReminderOn] = useState(start.reminderOn)
  const [reminderTime, setReminderTime] = useState(start.reminderTime)
  const [isChallenge, setIsChallenge] = useState(start.isChallenge)
  const [challengeDays, setChallengeDays] = useState(start.challengeDays)
  const form: RoutineFormState = { name, timeMode, repeatMode, customWeekdays, reminderOn, reminderTime, steps, domainId, isChallenge, challengeDays, plant }
  const dirty = formChanged(form, initial)

  // Park the draft when the phone sheet is dismissed (not saved or cancelled) with changes in it.
  const latest = useRef({ form, dirty, isMobile, done: false })
  latest.current = { ...latest.current, form, dirty, isMobile }
  useEffect(() => () => {
    const l = latest.current
    if (!l.done && l.isMobile && l.dirty) parked = { key: draftKey, form: l.form }
  }, [draftKey])

  /** Saved or cancelled: the draft is spent. A phone sheet leaves through its exit animation. */
  function finish() {
    latest.current.done = true
    if (parked?.key === draftKey) parked = null
    if (isMobile && closeSheet.current) closeSheet.current()
    else onClose()
  }

  function toggleWeekday(day: number) {
    setCustomWeekdays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()))
  }

  function submit(from?: HTMLElement) {
    if (routine) {
      const next = applyRoutineForm(routine, form, localDateKey(new Date()), new Date().toISOString())
      if (!next) return
      updateRoutine(next)
      useToastStore.getState().push({ message: 'Routine updated' })
      finish()
      return
    }
    const fields = draftToRoutineFields({ name, timeMode, repeatMode, customWeekdays, reminderOn, reminderTime })
    if (!fields) return
    seedPlant(from, motion) // Motion 5f — the seed drops out of the plant button
    const { name: trimmed, timeOfDay, cadence, clockTime } = fields
    const days = challengeDays
    const { steps: stepList, step_minutes: stepMinutes } = writeSteps(steps)
    const domain = domainId || null

    if (isChallenge && days > 0) {
      const start = localDateKey(new Date())
      createChallenge(trimmed, timeOfDay, cadence, start, addDays(start, days - 1), clockTime, stepList, domain, plant, stepMinutes)
      useToastStore.getState().push({ message: 'New challenge registered in the soil.' })
    } else {
      createRoutine(trimmed, timeOfDay, cadence, clockTime, stepList, domain, plant, stepMinutes)
      useToastStore.getState().push({ message: 'New routine planted ✿' })
    }
    finish()
  }

  const seg = (mode: TimeMode, full: string, short: string) => (
    <span
      onClick={() => setTimeMode(mode)}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '9px 0',
        cursor: 'pointer',
        fontSize: isMobile ? 12 : 12.5,
        color: timeMode === mode ? 'var(--ink-body)' : 'var(--ink-muted)',
        fontWeight: timeMode === mode ? 600 : 400,
        background: timeMode === mode ? fieldBgRaised : 'transparent',
        boxShadow: timeMode === mode && !isMobile ? 'var(--shadow-crisp)' : 'none',
      }}
    >
      {isMobile ? short : full}
    </span>
  )

  const repeatPill = (mode: RepeatMode, label: string) => (
    <span
      onClick={() => setRepeatMode(mode)}
      style={{
        fontSize: 12.5,
        borderRadius: 999,
        padding: '7px 14px',
        cursor: 'pointer',
        color: repeatMode === mode ? 'var(--paper-parchment)' : 'var(--ink-muted)',
        background: repeatMode === mode ? 'var(--acc-moss)' : 'transparent',
        border: `1px solid ${repeatMode === mode ? 'var(--acc-moss)' : 'var(--line-solid)'}`,
      }}
    >
      {label}
    </span>
  )

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingBottom: 18, borderBottom: '1px dashed var(--line-dashed)' }}>
        <img src={plantSrc(plant, 1)} alt="" style={{ height: isMobile ? 34 : 40, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Routines</div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 22 : 26, lineHeight: 1, color: 'var(--ink-body)' }}>{routine ? 'Edit routine' : 'New routine'}</h1>
        </div>
        {!isMobile && (
          <button type="button" aria-label="Close" className="kf-hit" onClick={finish} style={{ width: 28, height: 28, padding: 0, font: 'inherit', borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-caption)', cursor: 'pointer' }}>✕</button>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Name</div>
        <div style={{ display: 'flex', alignItems: 'center', background: fieldBg, border: '1px solid var(--acc-moss)', borderRadius: 8, padding: '11px 13px' }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Evening stretch"
            style={{ flex: 1, font: 'inherit', fontSize: 15, color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
          {/* 2b: the phone carries the total in the label; 2a at the end of the add row */}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-mono)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{isMobile ? (stepsTotal(steps) > 0 ? `Steps · ${stepsTotal(steps)} min total` : 'Steps') : 'Steps · what it’s made of'}</span>
          {!isMobile && <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)' }}>checked off one by one, or all at once ✿</span>}
        </div>
        <StepsField steps={steps} setSteps={setSteps} isMobile={isMobile} fieldBg={fieldBg} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Time of day</div>
        <div style={{ display: 'flex', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, overflow: 'hidden' }}>
          {seg('morning', 'Morning', 'Morn')}
          {seg('afternoon', 'Afternoon', 'Aft')}
          {seg('evening', 'Evening', 'Eve')}
          {seg('anytime', 'Anytime', 'Any')}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Repeats</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 11 }}>
          {repeatPill('daily', 'Every day')}
          {repeatPill('weekdays', 'Weekdays')}
          {repeatPill('custom', 'Custom')}
        </div>
        {repeatMode === 'custom' && (
          <div style={{ display: 'flex', gap: isMobile ? 6 : 7 }}>
            {WEEKDAY_COLS.map(({ day, label }) => {
              const on = customWeekdays.includes(day)
              return (
                <span
                  key={day}
                  onClick={() => toggleWeekday(day)}
                  style={{
                    flex: isMobile ? 1 : 'none',
                    width: isMobile ? undefined : 34,
                    height: isMobile ? 36 : 34,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: on ? 'var(--paper-parchment)' : 'var(--ink-muted)',
                    background: on ? 'var(--acc-moss)' : fieldBg,
                    border: on ? 'none' : '1px solid var(--line-card)',
                  }}
                >
                  {label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Reminder</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-faint)', marginTop: 3 }}>a gentle push notification</div>
        </div>
        {reminderOn && (
          <TimeField
            value={reminderTime}
            onChange={setReminderTime}
            style={{ width: 96, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-body)', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: '8px 12px' }}
          />
        )}
        <Toggle on={reminderOn} label="Remind me" onToggle={() => setReminderOn((v) => !v)} />
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <span role="checkbox" aria-checked={isChallenge} onClick={() => setIsChallenge((v) => !v)} style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--line-solid)', background: isChallenge ? 'var(--ink-body)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
              {isChallenge && <span style={{ color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', lineHeight: 1 }}>✓</span>}
            </span>
            <span onClick={() => setIsChallenge((v) => !v)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}>Challenge (optional)</span>
          </div>
          {isChallenge && (
            <div style={{ display: 'flex', alignItems: 'center', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px', width: isMobile ? '100%' : 210 }}>
              {/* Kai 2026-10-06: the shared NumberField; 1–3650 is goal_days' own check (0046). */}
              <NumberField value={challengeDays} onChange={setChallengeDays} min={1} max={3650} ariaLabel="Challenge days" style={{ fontSize: 14 }} inputStyle={{ border: 'none' }} />
              <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--ink-muted)' }}>day streak</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Domain</div>
          <div style={{ display: 'flex', alignItems: 'center', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px' }}>
            {domainId && <span style={{ width: 8, height: 8, borderRadius: '50%', background: domains.find((d) => d.id === domainId)?.color ?? 'var(--acc-hydrangea)', marginRight: 9, flex: 'none' }} />}
            <Select
              value={domainId}
              onChange={setDomainId}
              ariaLabel="Domain"
              options={[{ value: '', label: 'None' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
              style={{ flex: 1, background: 'none', border: 'none', borderRadius: 0, padding: 0, fontSize: 14, color: 'var(--ink-body)' }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Its plant</span>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)' }}>starts bare, grows with the streak ✿</span>
        </div>
        {/* 2a: five tiles sharing the row; 2b: 60px tiles (all five fit at 390). */}
        <div role="radiogroup" aria-label="Its plant" style={{ display: 'flex', gap: isMobile ? 8 : 10, overflowX: 'auto', padding: 2, margin: -2 }}>
          {PLANT_ORDER.map((p) => {
            const on = plant === p
            const h = isMobile ? 34 : 40
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPlant(p)}
                style={{ flex: isMobile ? 'none' : 1, width: isMobile ? 60 : undefined, minWidth: 0, font: 'inherit', background: fieldBg, border: `1px solid ${on ? 'var(--acc-moss)' : 'var(--line-card)'}`, outline: on ? '2px solid color-mix(in srgb, var(--acc-moss) 35%, transparent)' : 'none', borderRadius: 8, padding: isMobile ? '7px 4px' : '8px 4px', textAlign: 'center', cursor: 'pointer' }}
              >
                <span style={{ height: h, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {/* 2a draws the clover a touch shorter (36 of 40) */}
                  <img src={plantPreviewSrc(p)} alt="" style={{ maxHeight: p === 'clover' ? h - 4 : h }} />
                </span>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: on ? 'var(--acc-sage-text)' : 'var(--ink-faint)', marginTop: isMobile ? 4 : 5 }}>{PLANTS[p].label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
        {!isMobile && <span style={{ flex: 1 }} />}
        {/* Cancel throws the draft away (on a phone too — dismissing the sheet keeps it). */}
        <button type="button" onClick={finish} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: isMobile ? 'var(--fs-body)' : 'var(--fs-caption)', padding: isMobile ? '14px 18px' : '10px 18px', borderRadius: 999, cursor: 'pointer' }}>Cancel</button>
        <button
          type="button"
          onClick={(e) => submit(e.currentTarget)}
          style={{ flex: isMobile ? 1 : 'none', border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: isMobile ? 'var(--fs-body)' : 'var(--fs-caption)', padding: isMobile ? '14px' : '10px 20px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <img src={plantSrc(plant, 1)} alt="" style={{ height: isMobile ? 17 : 16 }} />
          {routine ? 'Save routine' : 'Plant routine'}
        </button>
      </div>
    </>
  )

  if (isMobile) {
    // The kit sheet (handle, detents, swipe/scrim/Back to dismiss) in place of a hand-made one.
    return (
      <BottomSheet onClose={onClose} detent="full" handleGap={4}>
        {(close) => {
          closeSheet.current = close
          return body
        }}
      </BottomSheet>
    )
  }

  // The outside-click rule: a clean form closes on a click outside it; one with unsaved changes
  // ignores it (Esc / ✕ / Cancel still close).
  // Height: --kf-vh is the window in layout px under the interface size (90dvh overflowed at 125%).
  return (
    <div onClick={() => { if (!dirty) finish() }} className="kf-scrim" style={{ position: 'fixed', inset: 0, zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="kf-overlay-card" style={{ width: 620, maxWidth: '100%', maxHeight: 'calc(var(--kf-vh) * 0.9)', overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-popover)', padding: '26px 30px 28px' }}>
        {body}
      </div>
    </div>
  )
}

// ── 2a/2b "Steps · what it's made of": one row per step — ⠿ · number · text · minutes · ✕ — then
// "＋ Add a step" and "10 min total". Reorder: drag the ⠿ (a computer: press and move; a phone:
// hold it, then move — a quick swipe still scrolls the sheet), or tap it for Move up / Move down /
// Remove step, or ↑/↓ on it / Alt+↑/↓ in the step's text. The order is the order saved. ──

type MoveFocus = 'handle' | 'text'

function StepsField({ steps, setSteps, isMobile, fieldBg }: { steps: StepDraft[]; setSteps: (next: StepDraft[]) => void; isMobile: boolean; fieldBg: string }) {
  const box = useRef<HTMLDivElement>(null)
  const justDragged = useRef(false)
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )
  const total = stepsTotal(steps)

  const set = (i: number, patch: Partial<StepDraft>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const remove = (i: number) => setSteps(steps.filter((_, j) => j !== i))
  function move(from: number, to: number, focus?: MoveFocus) {
    if (to < 0 || to >= steps.length || to === from) return
    setSteps(moveItem(steps, from, to))
    // Rows are keyed by place, so focus stays on the place it was: follow the step instead.
    if (focus) requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-step-${focus}="${to}"]`)?.focus())
  }

  function onDragEnd(e: DragEndEvent) {
    const from = e.active.data.current?.index as number | undefined
    const to = e.over?.data.current?.index as number | undefined
    if (from != null && to != null) move(from, to)
    setTimeout(() => (justDragged.current = false)) // the click that ends a mouse drag isn't a tap
  }

  const n = menu?.i ?? 0
  const menuItems = menu
    ? [
        ...(n > 0 ? [{ label: 'Move up', run: () => move(n, n - 1) }] : []),
        ...(n < steps.length - 1 ? [{ label: 'Move down', run: () => move(n, n + 1) }] : []),
        { label: 'Remove step', danger: true, run: () => remove(n) },
      ]
    : []

  return (
    <div ref={box} style={{ background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: isMobile ? '2px 12px' : '2px 13px' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (justDragged.current = true)} onDragEnd={onDragEnd} onDragCancel={() => (justDragged.current = false)}>
        {steps.map((step, i) => (
          <StepRow
            key={i}
            i={i}
            step={step}
            last={i === steps.length - 1}
            isMobile={isMobile}
            fieldBg={fieldBg}
            onText={(text) => set(i, { text })}
            onMinutes={(minutes) => set(i, { minutes })}
            onMove={(by, focus) => move(i, i + by, focus)}
            onRemove={() => remove(i)}
            onMenu={(at) => {
              if (!justDragged.current) setMenu({ i, ...at })
            }}
          />
        ))}
      </DndContext>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 11, padding: isMobile ? '9px 0' : '10px 0' }}>
        {/* under the handle + number, as 2a's 26px spacer */}
        <span style={{ width: isMobile ? 38 : 26, flex: 'none' }} />
        <button type="button" onClick={() => setSteps([...steps, { text: '' }])} style={{ minHeight: isMobile ? 44 : undefined, margin: isMobile ? '-10px 0' : 0, padding: 0, border: 'none', background: 'none', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>
          {isMobile ? '＋ Add step' : '＋ Add a step'}
        </button>
        <span style={{ flex: 1 }} />
        {!isMobile && total > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{total} min total</span>}
      </div>
      {menu &&
        (isMobile ? (
          <ActionSheet
            title={steps[n]?.text.trim() || `Step ${n + 1}`}
            meta={`Step ${n + 1} of ${steps.length}`}
            onClose={() => setMenu(null)}
            items={menuItems.map((m) => ({ label: m.label, destructive: m.danger, icon: <Icon name={m.danger ? 'delete' : m.label === 'Move up' ? 'back' : 'chevdown'} />, onSelect: m.run }))}
          />
        ) : (
          <ContextMenu position={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} label={`Step ${n + 1}`} items={menuItems.map((m) => ({ label: m.label, danger: m.danger, onClick: m.run }))} />
        ))}
    </div>
  )
}

function StepRow({ i, step, last, isMobile, fieldBg, onText, onMinutes, onMove, onRemove, onMenu }: {
  i: number
  step: StepDraft
  last: boolean
  isMobile: boolean
  fieldBg: string
  onText: (text: string) => void
  onMinutes: (minutes: number | undefined) => void
  onMove: (by: -1 | 1, focus: MoveFocus) => void
  onRemove: () => void
  onMenu: (at: { x: number; y: number }) => void
}) {
  const drag = useDraggable({ id: `step-${i}`, data: { index: i } })
  const drop = useDroppable({ id: `step-${i}`, data: { index: i } })
  const y = drag.transform?.y ?? 0
  const arrow = (key: string): -1 | 1 | null => (key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : null)
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      // a computer's right-click opens the step's menu; on a phone a long press is the drag
      onContextMenu={
        isMobile
          ? undefined
          : (e) => {
              e.preventDefault()
              onMenu({ x: e.clientX, y: e.clientY })
            }
      }
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 10 : 11,
        padding: isMobile ? '9px 0' : '10px 0',
        borderBottom: '1px dashed var(--line-dashed)',
        transform: drag.isDragging ? `translate3d(0, ${y}px, 0)` : undefined,
        zIndex: drag.isDragging ? 5 : undefined,
        background: drag.isDragging ? fieldBg : undefined,
        boxShadow: drag.isDragging ? 'var(--shadow-crisp)' : undefined,
        outline: drop.isOver && !drag.isDragging ? '2px dashed var(--acc-sage)' : undefined,
        outlineOffset: -1,
        borderRadius: 3,
      }}
    >
      <button
        type="button"
        ref={drag.setActivatorNodeRef}
        {...drag.listeners}
        data-step-handle={i}
        className="kf-hit"
        aria-label={`Step ${i + 1} — drag to move it, or open Move up / Move down`}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onMenu({ x: r.left, y: r.bottom })
        }}
        onKeyDown={(e) => {
          const by = arrow(e.key)
          if (!by) return
          e.preventDefault()
          onMove(by, 'handle')
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ flex: 'none', width: 16, height: 20, padding: 0, border: 'none', background: 'none', font: 'inherit', fontSize: 'var(--fs-caption)', lineHeight: 1, color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: drag.isDragging ? 'grabbing' : 'grab', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        ⠿
      </button>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', width: isMobile ? 12 : 14, flex: 'none' }}>{i + 1}</span>
      <input
        autoFocus={step.text === '' && last}
        value={step.text}
        data-step-text={i}
        aria-label={`Step ${i + 1}`}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          const by = e.altKey ? arrow(e.key) : null
          if (!by) return
          e.preventDefault()
          onMove(by, 'text')
        }}
        placeholder="Neck & shoulder rolls"
        style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none' }}
      />
      {/* 2a "2 min" / 2b "2m": typing replaces it, empty = no minutes */}
      <label style={{ flex: 'none', display: 'inline-flex', alignItems: 'baseline', gap: isMobile ? 0 : 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', cursor: 'text' }}>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`Minutes for step ${i + 1}`}
          value={step.minutes ?? ''}
          placeholder="–"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onMinutes(parseMinutes(e.target.value))}
          style={{ width: '3ch', padding: 0, font: 'inherit', textAlign: 'right', color: 'inherit', background: 'none', border: 'none', outline: 'none' }}
        />
        {isMobile ? 'm' : 'min'}
      </label>
      {!isMobile && (
        <button type="button" aria-label={`Remove step ${i + 1}`} onClick={onRemove} style={{ flex: 'none', padding: 0, border: 'none', background: 'none', font: 'inherit', fontSize: 'var(--fs-mono-l)', color: 'var(--ink-faint)', cursor: 'pointer' }}>
          ✕
        </button>
      )}
    </div>
  )
}
