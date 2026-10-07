import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { animateRowRemoval } from '../../lib/motion'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { placeName } from '../tasks/move'
import { useOpenTask } from '../tasks/openTask'
import { PlanMenu } from '../tasks/PlanMenu'
import {
  convertResurfaced,
  cooldownDays,
  cooldownTier,
  doneResurfaced,
  keepResurfaced,
  letGoResurfaced,
  notNowResurfaced,
  planResurfaced,
  useResurfacePick,
  type ResurfacePick,
} from './api'
import { actionLabel, asksToSettle, cardActions, metaLine, type CardAction } from './rules'

// Pixel contract: Today.dc.html 1a "From a while ago" card (lines 212-217). TodayPage
// already renders the SectionLabel above this — own only the card body. `#fff` in the
// export is swapped for --text-on-accent (house rule: no pure white).
// Kai 2026-10-07: the card says what the thing is and why it's here, the quote opens it, and every
// button settles it (./rules has which buttons and their words).

const EXPLAIN = 'Something you saved a while ago. Keep it, plan it, or let it go.'

export function ResurfaceCard() {
  const pick = useResurfacePick()
  // Keyed by the pick: a new pick is a new element, never one the exit motion left faded out.
  return pick ? <Card key={pick.row.id} pick={pick} /> : null
}

// punch 22: `font` (shorthand) must precede `fontSize` — later shorthand keys clobber earlier
// longhands in React style objects, which reset the chip to the body size.
const chip: CSSProperties = { font: 'inherit', fontSize: 'var(--fs-meta-l)', padding: '5px 10px', minHeight: 30, borderRadius: 999, cursor: 'pointer' }
const primary: CSSProperties = { ...chip, background: 'var(--acc-terra)', color: 'var(--text-on-accent)', border: 'none' }
const quiet: CSSProperties = { ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', background: 'none' }

function Card({ pick }: { pick: ResurfacePick }) {
  // Motion 3e (WB-1): every action leaves through the exit, so the slot closes instead of blinking out.
  const cardRef = useRef<HTMLDivElement>(null)
  const [planAt, setPlanAt] = useState<{ x: number; y: number } | null>(null)
  const [why, setWhy] = useState(false)
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: domains = [] } = useDomains()
  const openTask = useOpenTask()
  const navigate = useNavigate()
  const { row, task, item, putOffs } = pick

  const subject = { kind: task ? ('task' as const) : ('note' as const), filed: item?.status === 'filed', putOffs }
  const snoozeDays = cooldownDays(cooldownTier(task))
  const asking = asksToSettle(subject)
  const exit = (write: () => void) => animateRowRemoval(cardRef.current, write)
  const meta = task
    ? metaLine({ kind: 'task', place: placeName(task, projects, areas, domains), createdAt: task.created_at, updatedAt: task.updated_at }, new Date())
    : metaLine({ kind: 'note', filed: subject.filed, createdAt: item!.created_at }, new Date())

  const run: Record<CardAction, (e: React.MouseEvent<HTMLButtonElement>) => void> = {
    plan: (e) => {
      const r = e.currentTarget.getBoundingClientRect()
      setPlanAt({ x: r.left, y: r.bottom + 4 })
    },
    done: () => exit(() => doneResurfaced(row, task!)),
    convert: () => exit(() => convertResurfaced(row, item!)),
    keep: () => exit(() => keepResurfaced(row)),
    letgo: () => exit(() => letGoResurfaced(row, { task, item })),
    notnow: () => exit(() => notNowResurfaced(row, snoozeDays)),
  }
  const plan = task && planResurfaced(row, task)

  return (
    <div
      ref={cardRef}
      data-resurface={row.entity_type}
      // deviation(punch 15, 2026-07-26): export tilts this card rotate(-0.3deg), but the
      // sub-degree transform blurs the 14px quote text (grayscale AA on a rotated baseline,
      // compounded by the 1.25 root zoom) — dropped for crisp rendering, same call as
      // QuickCreate's 2026-07-18 deviation. The tape strip keeps the placed-note feel.
      style={{
        position: 'relative',
        border: '1px solid var(--line-card)',
        background: 'var(--paper-parchment)',
        padding: '13px 14px',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 3,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -8,
          right: 16,
          width: 42,
          height: 12,
          background: 'color-mix(in srgb, var(--acc-clover) 40%, transparent)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
          transform: 'rotate(3deg)',
          borderRadius: 1,
        }}
      />
      <button
        type="button"
        className="kf-resurface-open"
        onClick={() => (task ? openTask(task.id) : navigate(`/inbox?focus=${row.entity_id}`))}
        title={task ? 'Open the task' : 'Open it in the Inbox'}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.4, overflowWrap: 'anywhere' }}
      >
        "{task ? task.title : item!.raw_text}"
      </button>
      <div className="kf-resurface-meta" style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, fontSize: 'var(--fs-meta-l)', color: 'var(--ink-muted)' }}>
        <span style={{ minWidth: 0 }}>{meta}</span>
        <button
          type="button"
          aria-label="What is this?"
          aria-expanded={why}
          onClick={() => setWhy((w) => !w)}
          style={{ ...quiet, flex: 'none', minHeight: 0, width: 20, height: 20, padding: 0, lineHeight: '18px', textAlign: 'center' }}
        >
          ?
        </button>
      </div>
      {why && <div className="kf-resurface-why" style={{ marginTop: 4, fontSize: 'var(--fs-meta-l)', color: 'var(--ink-muted)' }}>{EXPLAIN}</div>}
      {asking && (
        <div className="kf-resurface-ask" style={{ marginTop: 8, fontSize: 'var(--fs-meta-l)', color: 'var(--ink-body)' }}>
          You've put this off twice — keep it or let it go?
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
        {cardActions(subject).map((a, i) => (
          <button key={a} type="button" data-action={a} onClick={run[a]} style={i === 0 ? primary : quiet}>
            {actionLabel(a, subject, snoozeDays)}
          </button>
        ))}
      </div>
      {planAt && task && plan && (
        <PlanMenu
          task={task}
          position={planAt}
          onClose={() => setPlanAt(null)}
          actions={{
            schedule: (iso, timed) => exit(() => plan.schedule(iso, timed)),
            tomorrow: () => exit(plan.tomorrow),
            slot: (s, e) => exit(() => plan.slot(s, e)),
            someday: () => exit(plan.someday),
          }}
        />
      )}
    </div>
  )
}
