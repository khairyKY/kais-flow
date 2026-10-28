import type { CSSProperties, ReactNode } from 'react'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { SheetTitle } from '../../components/TimePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { tomorrowHint } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { SwipeRow } from '../tasks/SwipeRow'
import type { Task } from '../../lib/types'
import './rituals.css'
import '../../components/pageMotion.css' // the dusk veil (D10)
import { useOpenTask } from '../tasks/openTask'
import { Num } from '../../components/PageMotion'
import { reducedMotionNow, useMotionEnabled } from '../../lib/motion'
import { Collapse } from '../../components/Collapse'

// ── The chrome both rituals share (SCREENS-2026-09-28 §Plan my day / §Shut down): on a phone a
// full-height kit BottomSheet (✕, Back and a swipe down close it and keep progress); on desktop a
// centred 1080 panel in two columns with "Esc closes · keeps progress". Everything inside is the
// Mobile Kit at phone size on both (Plan ruling 8). ──

/** `.flabel` — a metadata caption (Weekly review): sentence case, untracked (B D5). */
export function FieldLabel({ children, color = 'var(--ink-faint)' }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color }}>{children}</span>
}

export function RitualSheet({ title, sub, onClose, left, right, footer, leaving }: {
  title: string
  sub: string
  onClose: () => void
  /** R8: the ritual is finishing — its content fades out (150ms) before the finish screen. */
  leaving?: boolean
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
        {() => <div className={`rt rt-phone${leaving ? ' rt-leaving' : ''}`}>{left}{right}</div>}
      </BottomSheet>
    )
  }
  return <DeskPanel title={title} sub={sub} onClose={onClose} left={left} right={right} footer={footer} leaving={leaving} />
}

function DeskPanel({ title, sub, onClose, left, right, footer, leaving }: { title: string; sub: string; onClose: () => void; left: ReactNode; right: ReactNode; footer: (close: () => void) => ReactNode; leaving?: boolean }) {
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
        <div className={`rt-desk-cols${leaving ? ' rt-leaving' : ''}`}>
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
      {/* T12: the line rises in when the plan changes it */}
      <Num value={text} style={{ flex: 1, minWidth: 0 }} />
      {over && <span className="rt-mono" style={{ color: 'inherit' }}>{over}</span>}
    </div>
  )
}

/** Kit section label (B D6): 14 semibold ink, no rule after it; optional link + chevron in a 48 hit. */
export function Section({ label, link, first }: { label: ReactNode; link?: { label: string; onClick: () => void }; first?: boolean }) {
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
 * 48 row; B D12: no track, body ink, the chosen one ink-filled. `value` null = nothing chosen yet. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <span className="rt-seg-row">
      <span className="rt-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="rt-seg-opt" onClick={() => onChange(o.value)}>
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

/** R8 — the finish screen's payoff beat (rituals.css): the clover rises from its base, the title soaks
 * in, the chips follow 60ms apart. D10 — `dusk` (the evening close): after the beat, Focus's dusk veil
 * settles over it (Effects 1j). Decorative parts need Effects on; without, it's a plain fade. */
export function FinishScreen({ img, title, dusk, children }: { img: string; title: string; dusk?: boolean; children?: ReactNode }) {
  const motion = useMotionEnabled()
  return (
    <div className="rt-summary">
      <img src={img} alt="" />
      <div className="rt-summary-title">{title}</div>
      {children}
      {dusk && motion && (
        <>
          <span className="kf-dusk-veil" aria-hidden data-dusk style={{ '--veil-delay': '700ms' } as CSSProperties} />
          <span className="kf-dusk-vignette" aria-hidden style={{ '--veil-delay': '700ms' } as CSSProperties} />
          <span className="kf-dusk-fly" aria-hidden style={{ left: '68%', top: '38%', '--veil-delay': '700ms' } as CSSProperties} />
        </>
      )}
    </div>
  )
}

/** R8: how long the ritual's content takes to fade before its finish screen (0 under reduced motion). */
export const leaveMs = () => (reducedMotionNow() ? 0 : 150)

/** T8 — a ritual section that empties folds shut while its quiet line ("Inbox zero ✿") folds open,
 * instead of the rows swapping for the line in one frame. */
export function FoldSection({ empty, line, children }: { empty: boolean; line: ReactNode; children: ReactNode }) {
  return (
    <>
      <Collapse open={!empty}>{children}</Collapse>
      <Collapse open={empty}>{line}</Collapse>
    </>
  )
}
