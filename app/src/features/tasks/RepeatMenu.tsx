import { useRef, useState, type ReactNode } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { DateField, Popover } from '../../components/DatePicker'
import { Button, Chip, Segmented } from '../../components/kit'
import { NumberField } from '../../components/NumberField'
import { buildRule, nthLabel, parseRule, repeatStart, WEEKDAY_NAMES, WEEKDAYS, type RepeatSpec, type RepeatUnit, type WeekdayCode } from './repeatRule'
import { repeatLabel } from './taskSheetMath'

// ── The Repeat picker, for anything that repeats (a task's ⋯ menu, the task sheet and popover chips,
// the editor's field; calendar events can take it as is): the five presets and Custom…, which opens
// a small rule editor — every N days / weeks / months / years, weekdays, day of the month or the Nth weekday,
// ends never / on a date / after N times. Value in, RRULE string (or null = never) out. Phone =
// action sheet + bottom sheet; desktop = context menu + popover. No design exists for the custom
// editor yet: built from the kit (Segmented, NumberField, Chip, DateField) — flagged for Phase C. ──

export const REPEAT_PRESETS: { label: string; rule: string | null }[] = [
  { label: 'Never', rule: null },
  { label: 'Daily', rule: 'FREQ=DAILY' },
  { label: 'Weekly', rule: 'FREQ=WEEKLY' },
  { label: 'Monthly', rule: 'FREQ=MONTHLY' },
  { label: 'Yearly', rule: 'FREQ=YEARLY' },
]

interface RepeatProps {
  value: string | null
  onChange: (rule: string | null) => void
  /** Desktop anchor, screen px. */
  position: { x: number; y: number }
  onClose: () => void
  /** What the rule hangs off: a task's due date, an event's start (ISO). None = today. */
  start?: string | null
  /** The phone sheet's mono line (the task's name). */
  meta?: string
}

export function RepeatMenu({ onCustom, ...p }: RepeatProps & {
  /** A desktop submenu can't hold the editor: its owner opens it in the menu's place instead. */
  onCustom?: () => void
}) {
  const isMobile = useIsMobile()
  const [custom, setCustom] = useState(false)
  const toCustom = useRef(false)
  if (custom) return <RepeatEditor {...p} />
  const isPreset = REPEAT_PRESETS.some((o) => o.rule === p.value)
  const items = [
    ...REPEAT_PRESETS.map((o) => ({ label: o.label, on: o.rule === p.value, run: () => p.onChange(o.rule) })),
    // A rule the presets don't name shows as itself, ticked, above Custom… (which opens it).
    ...(p.value && !isPreset ? [{ label: repeatLabel(p.value), on: true, run: () => p.onChange(p.value) }] : []),
  ]
  const openCustom = () => (onCustom ? onCustom() : setCustom(true))
  if (isMobile) {
    return (
      <ActionSheet
        key="repeat"
        title="Repeat"
        meta={p.meta}
        onClose={p.onClose}
        items={[...items.map((o) => ({ label: o.label, selected: o.on, onSelect: o.run })), { label: 'Custom…', chevron: true, onSelect: openCustom }]}
      />
    )
  }
  // ContextMenu closes itself after a pick; Custom… swaps it for the editor instead.
  return (
    <ContextMenu
      position={p.position}
      label="Repeat"
      onClose={() => !toCustom.current && p.onClose()}
      items={[
        ...items.map((o) => ({ label: o.on ? `${o.label} ✓` : o.label, onClick: o.run })),
        { label: 'Custom…', onClick: () => { toCustom.current = true; openCustom() } },
      ]}
    />
  )
}

const UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
  { value: 'year', label: 'Years' },
]
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)' } as const
const ROW = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 } as const

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={LABEL}>{label}</div>
      <div style={ROW}>{children}</div>
    </div>
  )
}

/** The custom rule editor on its own (RepeatMenu's Custom…). Done writes; closing keeps the old rule. */
export function RepeatEditor({ value, onChange, position, onClose, start, meta }: RepeatProps) {
  const isMobile = useIsMobile()
  const from = repeatStart(start ? new Date(start) : new Date())
  const [spec, setSpec] = useState<RepeatSpec>(() => parseRule(value, from))
  const set = (patch: Partial<RepeatSpec>) => setSpec((s) => ({ ...s, ...patch }))
  const rule = buildRule(spec, from)
  const toggleDay = (d: WeekdayCode) => set({ days: spec.days.includes(d) ? spec.days.filter((x) => x !== d) : [...spec.days, d] })
  const m = spec.monthly
  const unitWord = { day: 'day', week: 'week', month: 'month', year: 'year' }[spec.unit] + (spec.every === 1 ? '' : 's')

  const body = (
    <div style={{ paddingBottom: 4 }}>
      <Field label="Every">
        <NumberField value={spec.every} min={1} max={99} ariaLabel="Repeat every" onChange={(every) => set({ every })} />
        <span style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', minWidth: 52 }}>{unitWord}</span>
        <Segmented value={spec.unit} onChange={(unit) => set({ unit })} options={UNITS} label="Repeat unit" />
      </Field>
      {spec.unit === 'week' && (
        <Field label="On">
          {WEEKDAYS.map((d) => (
            <Chip key={d} tone="bordered" selected={spec.days.includes(d)} onClick={() => toggleDay(d)}>
              {WEEKDAY_NAMES[d].slice(0, 3)}
            </Chip>
          ))}
        </Field>
      )}
      {spec.unit === 'month' && (
        <Field label="On">
          <Segmented
            value={m.by}
            onChange={(by) => set({ monthly: by === 'day' ? { by, day: Number(from.date.slice(8)) } : { by, nth: from.nth, day: from.weekday } })}
            options={[{ value: 'day', label: 'Day of the month' }, { value: 'weekday', label: 'A weekday' }]}
            label="Monthly on"
          />
          {m.by === 'day' ? (
            <>
              <span style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)' }}>day</span>
              <NumberField value={m.day} min={1} max={31} ariaLabel="Day of the month" onChange={(day) => set({ monthly: { by: 'day', day } })} />
            </>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Segmented value={m.nth} onChange={(nth) => set({ monthly: { ...m, nth } })} options={[1, 2, 3, 4, -1].map((n) => ({ value: n, label: nthLabel(n) }))} label="Which one" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {WEEKDAYS.map((d) => (
                  <Chip key={d} tone="bordered" selected={m.day === d} onClick={() => set({ monthly: { ...m, day: d } })}>
                    {WEEKDAY_NAMES[d].slice(0, 3)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Field>
      )}
      <Field label="Ends">
        <Segmented
          value={spec.ends.by}
          onChange={(by) => set({ ends: by === 'never' ? { by } : by === 'date' ? { by, date: from.date } : { by, count: 10 } })}
          options={[{ value: 'never', label: 'Never' }, { value: 'date', label: 'On a date' }, { value: 'count', label: 'After' }]}
          label="Ends"
        />
        {spec.ends.by === 'date' && (
          <DateField value={spec.ends.date} clearable={false} title="Ends on" onChange={(date) => date && set({ ends: { by: 'date', date } })} style={{ font: 'inherit', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 6, padding: '6px 10px' }} />
        )}
        {spec.ends.by === 'count' && (
          <>
            <NumberField value={spec.ends.count} min={1} max={999} ariaLabel="Times" onChange={(count) => set({ ends: { by: 'count', count } })} />
            <span style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)' }}>{spec.ends.count === 1 ? 'time' : 'times'}</span>
          </>
        )}
      </Field>
      <div aria-live="polite" style={{ ...LABEL, marginTop: 16, color: 'var(--acc-sage-text)' }}>↻ {repeatLabel(rule)}</div>
    </div>
  )
  const done = () => {
    onChange(rule)
    onClose()
  }

  if (isMobile) {
    return (
      <BottomSheet
        title={<>Custom repeat{meta && <div style={{ ...LABEL, marginTop: 3 }}>{meta}</div>}</>}
        onClose={onClose}
        footer={(close) => (
          <Button style={{ flex: 1 }} onClick={() => { onChange(rule); close() }}>Done</Button>
        )}
      >
        {() => body}
      </BottomSheet>
    )
  }
  return (
    <Popover
      title="Custom repeat"
      position={position}
      focusKey={null}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={done}>Done</Button>
        </>
      }
    >
      {body}
    </Popover>
  )
}
