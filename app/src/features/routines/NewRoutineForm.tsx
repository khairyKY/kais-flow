import { useEffect, useRef, useState } from 'react'
import { createRoutine, createChallenge, updateRoutine } from './api'
import { localDateKey } from './streaks'
import { useDomains } from '../domains/api'
import { Select } from '../../components/Select'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { TimeField } from '../calendar/TimeField'
import { Toggle } from '../../components/kit'
import { NumberField } from '../../components/NumberField'
import { NEW_ROUTINE_DEFAULTS, addDays, applyRoutineForm, draftToRoutineFields, formChanged, routineToForm, type RepeatMode, type RoutineFormState, type TimeMode } from './newRoutine'
import type { Routine } from '../../lib/types'

// Phone: the form rides the kit BottomSheet, whose scrim/swipe/Back always dismiss — and
// "closing never discards" (BottomSheet's contract), so a dismissed sheet parks its draft here
// and the same form (same routine, or a new one) opens with it again. Plant/Save/Cancel clear it.
// ponytail: one module-level draft — a reload drops it; enough for "I tapped outside by mistake".
let parked: { key: string; form: RoutineFormState } | null = null

// ── New routine — pixel contract Routines.dc.html #2a (desktop) / #2b (iPhone sheet).
// "Steps" and "Domain" are real since migration 0028 (routines.steps jsonb + domain_id).
// Deviations from the mock: steps are plain labels — the schema stores no per-step minutes,
// so the mock's "2 min" chips / "10 min total" tally and the drag-reorder handle are dropped.
// "Its plant" is a static Vine chip, not a picker — routines only ever grow the vine species
// (_SHARED.md growth-stage map). "Challenge" trades the mock's bare day-count for a real
// start/end pair: start = today, end = today + N-1.
// Polish B (audit-newuser): the form opens neutral — Anytime · Every day · reminder off — not
// on the mock's filled sample; see NEW_ROUTINE_DEFAULTS in newRoutine.ts.
// Edit mode (Kai 2026-10-12): pass `routine` and the same form opens prefilled from it, titled
// "Edit routine", and saves over the row (routineToForm / applyRoutineForm in newRoutine.ts). ──

const A = '/ds/assets'
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
    routine ? routineToForm(routine) : { ...NEW_ROUTINE_DEFAULTS, name: '', steps: [], domainId: '', isChallenge: initialChallenge, challengeDays: 30 },
  )
  const [start] = useState<RoutineFormState>(() => (parked?.key === draftKey ? parked.form : initial))
  const [name, setName] = useState(start.name)
  const [steps, setSteps] = useState<string[]>(start.steps)
  const [domainId, setDomainId] = useState(start.domainId)
  const { data: domains = [] } = useDomains()
  const [timeMode, setTimeMode] = useState<TimeMode>(start.timeMode)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(start.repeatMode)
  const [customWeekdays, setCustomWeekdays] = useState<number[]>(start.customWeekdays)
  const [reminderOn, setReminderOn] = useState(start.reminderOn)
  const [reminderTime, setReminderTime] = useState(start.reminderTime)
  const [isChallenge, setIsChallenge] = useState(start.isChallenge)
  const [challengeDays, setChallengeDays] = useState(start.challengeDays)
  const form: RoutineFormState = { name, timeMode, repeatMode, customWeekdays, reminderOn, reminderTime, steps, domainId, isChallenge, challengeDays }
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
    const stepList = steps.map((s) => s.trim()).filter(Boolean)
    const domain = domainId || null

    if (isChallenge && days > 0) {
      const start = localDateKey(new Date())
      createChallenge(trimmed, timeOfDay, cadence, start, addDays(start, days - 1), clockTime, stepList, domain)
      useToastStore.getState().push({ message: 'New challenge registered in the soil.' })
    } else {
      createRoutine(trimmed, timeOfDay, cadence, clockTime, stepList, domain)
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
        <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: isMobile ? 34 : 40, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Routines</div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 22 : 26, lineHeight: 1, color: 'var(--ink-body)' }}>{routine ? 'Edit routine' : 'New routine'}</h1>
        </div>
        {!isMobile && (
          <button type="button" aria-label="Close" className="kf-hit" onClick={finish} style={{ width: 28, height: 28, padding: 0, font: 'inherit', borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 13, cursor: 'pointer' }}>✕</button>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{isMobile ? 'Steps' : 'Steps · what it’s made of'}</span>
          {!isMobile && <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)' }}>checked off one by one, or all at once ✿</span>}
        </div>
        <div style={{ background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: isMobile ? '2px 12px' : '2px 13px' }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 11, padding: isMobile ? '9px 0' : '10px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', width: isMobile ? 12 : 14, flex: 'none' }}>{i + 1}</span>
              <input
                autoFocus={step === '' && i === steps.length - 1}
                value={step}
                onChange={(e) => setSteps((cur) => cur.map((s, j) => (j === i ? e.target.value : s)))}
                placeholder="Neck & shoulder rolls"
                style={{ flex: 1, font: 'inherit', fontSize: isMobile ? 13.5 : 14, color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none' }}
              />
              <span onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))} style={{ color: 'var(--ink-faint)', fontSize: 11, cursor: 'pointer' }}>✕</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 11, padding: isMobile ? '9px 0' : '10px 0' }}>
            <span style={{ width: isMobile ? 12 : 14, flex: 'none' }} />
            <span onClick={() => setSteps((cur) => [...cur, ''])} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>＋ Add a step</span>
          </div>
        </div>
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
        <div style={{ background: fieldBg, border: '1px solid var(--acc-moss)', outline: '2px solid color-mix(in srgb, var(--acc-moss) 35%, transparent)', borderRadius: 8, padding: '8px 4px', textAlign: 'center', width: isMobile ? 76 : 96 }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <img src={`${A}/vine/flowering.png`} alt="" style={{ maxHeight: 40 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', marginTop: 5 }}>Vine</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
        {!isMobile && <span style={{ flex: 1 }} />}
        {/* Cancel throws the draft away (on a phone too — dismissing the sheet keeps it). */}
        <button type="button" onClick={finish} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: isMobile ? 14.5 : 13, padding: isMobile ? '14px 18px' : '10px 18px', borderRadius: 999, cursor: 'pointer' }}>Cancel</button>
        <button
          type="button"
          onClick={(e) => submit(e.currentTarget)}
          style={{ flex: isMobile ? 1 : 'none', border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: isMobile ? 14.5 : 13, padding: isMobile ? '14px' : '10px 20px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: isMobile ? 17 : 16 }} />
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
  return (
    <div onClick={() => { if (!dirty) finish() }} className="kf-scrim" style={{ position: 'fixed', inset: 0, zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="kf-overlay-card" style={{ width: 620, maxWidth: '100%', maxHeight: '90dvh', overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-popover)', padding: '26px 30px 28px' }}>
        {body}
      </div>
    </div>
  )
}
