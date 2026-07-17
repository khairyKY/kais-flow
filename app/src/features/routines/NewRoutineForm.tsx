import { useState } from 'react'
import { createRoutine, createChallenge } from './api'
import { localDateKey } from './streaks'
import { useEscapeStack, useBodyScrollLock } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import type { Cadence } from '../../lib/types'

// ── New routine — pixel contract Routines.dc.html #2a (desktop) / #2b (iPhone sheet).
// Deviations from the mock, both because the routines schema (migrations 0005/0019) has no
// backing field for them — building working inputs against nothing would be fake, not real
// data: the "Steps" checklist (no routine_steps table) and the "Domain" picker (routines
// carry no domain_id) are both omitted. "Its plant" is a static Vine chip, not a picker —
// routines only ever grow the vine species (_SHARED.md growth-stage map). "Challenge" trades
// the mock's bare day-count for a real start/end pair: start = today, end = today + N-1. ──

const A = '/ds/assets'
type TimeMode = 'morning' | 'afternoon' | 'evening' | 'anytime'
type RepeatMode = 'daily' | 'weekdays' | 'custom'
const WEEKDAY_COLS: { day: number; label: string }[] = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' },
]

function cadenceFor(mode: RepeatMode, custom: number[]): Cadence {
  if (mode === 'daily') return { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  if (mode === 'weekdays') return { weekdays: [1, 2, 3, 4, 5] }
  return { weekdays: [...custom].sort() }
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDateKey(d)
}

export function NewRoutineForm({ onClose, initialChallenge = false }: { onClose: () => void; initialChallenge?: boolean }) {
  useEscapeStack(true, onClose)
  useBodyScrollLock(true)
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  // 2a's fields sit on a parchment modal and use bone for contrast; 2b's sheet is linen and
  // swaps to parchment fields with a bone "raised" tone — same pattern the mock repeats for
  // every field container and its active/highlight state.
  const fieldBg = isMobile ? 'var(--paper-parchment)' : 'var(--paper-bone)'
  const fieldBgRaised = isMobile ? 'var(--paper-bone)' : 'var(--paper-parchment)'

  const [name, setName] = useState('')
  const [timeMode, setTimeMode] = useState<TimeMode>('evening')
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('custom')
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([1, 3, 5])
  const [reminderOn, setReminderOn] = useState(true)
  const [reminderTime, setReminderTime] = useState('21:30')
  const [isChallenge, setIsChallenge] = useState(initialChallenge)
  const [challengeDays, setChallengeDays] = useState('30')

  function toggleWeekday(day: number) {
    setCustomWeekdays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()))
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const cadence = cadenceFor(repeatMode, customWeekdays)
    const timeOfDay = timeMode === 'anytime' ? null : timeMode
    const clockTime = reminderOn ? reminderTime : null
    const days = Math.max(1, Number(challengeDays) || 0)

    if (isChallenge && days > 0) {
      const start = localDateKey(new Date())
      createChallenge(trimmed, timeOfDay, cadence, start, addDays(start, days - 1), clockTime)
      useToastStore.getState().push({ message: 'New challenge registered in the soil.' })
    } else {
      createRoutine(trimmed, timeOfDay, cadence, clockTime)
      useToastStore.getState().push({ message: 'New routine planted ✿' })
    }
    onClose()
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 8.5 : 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Routines</div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 22 : 26, lineHeight: 1, color: 'var(--ink-body)' }}>New routine</h1>
        </div>
        {!isMobile && (
          <span onClick={onClose} style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 13, cursor: 'pointer' }}>✕</span>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Name</div>
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
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Time of day</div>
        <div style={{ display: 'flex', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, overflow: 'hidden' }}>
          {seg('morning', 'Morning', 'Morn')}
          {seg('afternoon', 'Afternoon', 'Aft')}
          {seg('evening', 'Evening', 'Eve')}
          {seg('anytime', 'Anytime', 'Any')}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Repeats</div>
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 3 }}>a gentle push notification</div>
        </div>
        {reminderOn && (
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-body)', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: '8px 12px' }}
          />
        )}
        <span
          role="switch"
          aria-checked={reminderOn}
          onClick={() => setReminderOn((v) => !v)}
          style={{ width: 38, height: 22, borderRadius: 999, background: reminderOn ? 'var(--acc-moss)' : 'var(--line-card)', position: 'relative', flex: 'none', cursor: 'pointer' }}
        >
          <span style={{ position: 'absolute', top: 2, left: reminderOn ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 120ms ease' }} />
        </span>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
          <span role="checkbox" aria-checked={isChallenge} onClick={() => setIsChallenge((v) => !v)} style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--line-solid)', background: isChallenge ? 'var(--ink-body)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
            {isChallenge && <span style={{ color: 'var(--paper-parchment)', fontSize: 10, lineHeight: 1 }}>✓</span>}
          </span>
          <span onClick={() => setIsChallenge((v) => !v)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}>Challenge (optional)</span>
        </div>
        {isChallenge && (
          <div style={{ display: 'flex', alignItems: 'center', background: fieldBg, border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px', width: isMobile ? '100%' : 160 }}>
            <input
              type="number"
              min={1}
              value={challengeDays}
              onChange={(e) => setChallengeDays(e.target.value)}
              style={{ width: 36, font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none' }}
            />
            <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--ink-muted)' }}>day streak</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Its plant</span>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: '#7a745f' }}>starts bare, grows with the streak ✿</span>
        </div>
        <div style={{ background: fieldBg, border: '1px solid var(--acc-moss)', outline: '2px solid rgba(122,148,110,0.35)', borderRadius: 8, padding: '8px 4px', textAlign: 'center', width: isMobile ? 76 : 96 }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <img src={`${A}/vine/flowering.png`} alt="" style={{ maxHeight: 40 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', marginTop: 5 }}>Vine</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
        {!isMobile && (
          <>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}>Cancel</button>
          </>
        )}
        <button
          type="button"
          onClick={submit}
          style={{ flex: isMobile ? 1 : 'none', border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: isMobile ? 14.5 : 13, padding: isMobile ? '14px' : '10px 20px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: isMobile ? 17 : 16 }} />
          Plant routine
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,32,0.32)', zIndex: 998 }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999, background: 'var(--paper-linen)', borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 30px rgba(60,52,38,0.22)', padding: '12px 22px 26px', maxHeight: '90dvh', overflowY: 'auto', overscrollBehavior: 'contain' }}
        >
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line-solid)', margin: '0 auto 16px' }} />
          {body}
        </div>
      </>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,32,0.3)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: '100%', maxHeight: '90dvh', overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-popover)', padding: '26px 30px 28px' }}>
        {body}
      </div>
    </div>
  )
}
