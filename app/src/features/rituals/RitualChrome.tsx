import type { ReactNode } from 'react'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { SheetTitle } from '../../components/TimePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { tomorrowHint } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { SwipeRow } from '../tasks/SwipeRow'
import type { Task } from '../../lib/types'
import './rituals.css'
import { useOpenTask } from '../tasks/openTask'

// ── The chrome both rituals share (SCREENS-2026-09-28 §Plan my day / §Shut down): on a phone a
// full-height kit BottomSheet (✕, Back and a swipe down close it and keep progress); on desktop a
// centred 1080 panel in two columns with "Esc closes · keeps progress". Everything inside is the
// Mobile Kit at phone size on both (Plan ruling 8). ──

/** `.flabel` — a mono caption (Weekly review). */
export function FieldLabel({ children, color = 'var(--ink-faint)' }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color }}>{children}</span>
}

export function RitualSheet({ title, sub, onClose, left, right, footer }: {
  title: string
  sub: string
  onClose: () => void
  /** Desktop's left column; on a phone the two columns stack. */
  left: ReactNode
  right: ReactNode
  /** Gets the sheet's animated close (phone) — the rituals' final action writes, then leaves. */
  footer: (close: () => void) => ReactNode
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <BottomSheet detent="full" onClose={onClose} title={<SheetTitle title={title} meta={sub} />} footer={footer}>
        {() => <div className="rt rt-phone">{left}{right}</div>}
      </BottomSheet>
    )
  }
  return <DeskPanel title={title} sub={sub} onClose={onClose} left={left} right={right} footer={footer} />
}

function DeskPanel({ title, sub, onClose, left, right, footer }: { title: string; sub: string; onClose: () => void; left: ReactNode; right: ReactNode; footer: (close: () => void) => ReactNode }) {
  useEscapeStack(true, onClose)
  return (
    <div className="rt-desk-scrim" onClick={onClose}>
      <div className="rt rt-desk" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="rt-desk-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rt-desk-title">{title}</div>
            <div className="rt-mono" style={{ marginTop: 4 }}>{sub}</div>
          </div>
          <button type="button" className="rt-icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="rt-desk-cols">
          <div>{left}</div>
          <div>{right}</div>
        </div>
        <div className="rt-desk-foot">{footer(onClose)}</div>
      </div>
    </div>
  )
}

/** The sticky footer (Plan ruling 6): phone = the workload line over [mono status · the terra CTA];
 * desktop = one row [workload or status · "Esc closes · keeps progress" · CTA]. */
export function RitualFoot({ workload, status, cta }: { workload?: ReactNode; status: ReactNode; cta: ReactNode }) {
  const isMobile = useIsMobile()
  if (!isMobile) {
    return (
      <>
        <div style={{ flex: 1, minWidth: 0 }}>{workload ?? <span className="rt-mono">{status}</span>}</div>
        <span className="rt-mono">Esc closes · keeps progress</span>
        {cta}
      </>
    )
  }
  return (
    <div className="rt-foot">
      {workload}
      <div className="rt-foot-row">
        <span className="rt-mono" style={{ flex: 1, minWidth: 0 }}>{status}</span>
        {cta}
      </div>
    </div>
  )
}

/** MK Workload: clock + text in ink-muted; over capacity = amber, alert and "2H OVER". */
export function WorkloadLine({ text, over }: { text: string; over?: string }) {
  return (
    <div className={`rt-wl${over ? ' is-over' : ''}`}>
      <Icon name={over ? 'alert' : 'clock'} size={20} />
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      {over && <span className="rt-mono" style={{ color: 'inherit' }}>{over}</span>}
    </div>
  )
}

/** Kit section label: mono 12.5, dashed rule, optional link + chevron in a 48 hit. */
export function Section({ label, link, first }: { label: string; link?: { label: string; onClick: () => void }; first?: boolean }) {
  return (
    <div className={`rt-sec${first ? ' is-first' : ''}`}>
      <span className="rt-label">{label}</span>
      <span className="rt-rule" />
      {link && (
        <button type="button" className="rt-link" onClick={link.onClick}>
          {link.label}
          <Icon name="chevright" size={16} />
        </button>
      )}
    </div>
  )
}

/** An empty section collapsed to one quiet line (6f, 8c): "Carry-over ········ Nothing carried over ✿". */
export function Collapsed({ label, line }: { label: string; line: string }) {
  return (
    <div className="rt-sec">
      <span className="rt-label">{label}</span>
      <span className="rt-rule" />
      <span className="rt-collapsed">{line}</span>
    </div>
  )
}

/** Kit Segmented (DS-CHANGELOG §3): pill, 1px --line-control, 3px inset, 40-tall segments in a
 * 48 row; selected = --block-sage + sage-text 600 + check 16. `value` null = nothing chosen yet. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <span className="rt-seg-row">
      <span className="rt-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="rt-seg-opt" onClick={() => onChange(o.value)}>
            {o.value === value && <Icon name="check" size={16} />}
            {o.label}
          </button>
        ))}
      </span>
    </span>
  )
}

/** A kit task row inside a ritual: [lead 48][title 15/20 + mono meta][trail], min-height 56, with an
 * optional second line (the Carry-over row's Segmented + Drop). Tap the body = open the task. */
export function KitRow({ task, lead, meta, trail, below, done, swipe, selected, className }: {
  task: Task
  lead: ReactNode
  meta: ReactNode[]
  trail?: ReactNode
  below?: ReactNode
  done?: boolean
  swipe?: Omit<Parameters<typeof SwipeRow>[0], 'children' | 'tomorrowHint'> & { tomorrowHint?: string }
  selected?: boolean
  className?: string
}) {
  const openTask = useOpenTask()
  const shown = meta.filter(Boolean)
  return (
    <SwipeRow
      id={`rt-${task.id}`}
      tomorrowHint={tomorrowHint()}
      {...swipe}
      className={`rt-row${className ? ` ${className}` : ''}`}
      style={{ background: selected ? 'var(--select-bg)' : undefined }}
    >
      <div className="rt-row-main">
        <span className="rt-hit">{lead}</span>
        <div className="rt-body" onClick={() => openTask(task.id)}>
          <div className={`rt-title${done ? ' is-done' : ''}`}><EmojiText text={task.title} /></div>
          {shown.length > 0 && <div className="rt-meta">{shown}</div>}
        </div>
        {trail}
      </div>
      {below}
    </SwipeRow>
  )
}

/** Mono meta item; `tone` colours it (overdue, gold goal, sage seed, amber). */
export function Meta({ children, tone, dot }: { children: ReactNode; tone?: string; dot?: string }) {
  return (
    <span style={tone ? { color: tone } : undefined}>
      {dot && <span className="rt-dot" style={{ background: dot }} />}
      {children}
    </span>
  )
}
