import type { CSSProperties } from 'react'
import type { Timeline } from './focusPlan'
import './focusTimeline.css'

// Focus D3's one timeline (design-export/Focus redesign.html, htl / vtl): the block split into segments — focus
// in the block's own colour, breaks in sage, what's left of the block empty. On the Focus page's top timeline
// a bud or bloom sits above each focus segment (`flowers`); the hour column, the tray, the pill and the lock
// screen show the coloured segments only. Pure drawing: the tray imports it without the focus store.

const SAGE = 'var(--acc-sage)'

function fill(k: 'f' | 'b' | 'x', state: 'done' | 'now' | 'todo', frac: number, color: string, vertical: boolean): string {
  if (k === 'x') return 'transparent'
  const full = k === 'f' ? color : `color-mix(in srgb, ${SAGE} 75%, transparent)`
  const light = k === 'f' ? `color-mix(in srgb, ${color} 28%, transparent)` : `color-mix(in srgb, ${SAGE} 22%, transparent)`
  if (state === 'done') return full
  if (state === 'now') return `linear-gradient(${vertical ? 180 : 90}deg, ${full} ${(frac * 100).toFixed(1)}%, ${light} 0)`
  return light
}

export function FocusTimeline({ tl, color, flowers = false, vertical = false, labels, breakLabel, className, style }: {
  tl: Timeline
  color: string
  /** The Focus page's top timeline only: a bud / bloom above each focus segment. */
  flowers?: boolean
  vertical?: boolean
  /** Start · middle · end, under the bar. */
  labels?: readonly [string, string, string]
  /** "Break · 4:12", in a pill above the break under way. */
  breakLabel?: string
  className?: string
  style?: CSSProperties
}) {
  const { segs, cur, frac, done, phase } = tl
  const stateOf = (i: number): 'done' | 'now' | 'todo' => {
    if (i === cur) return 'now'
    if (cur >= 0) return i < cur ? 'done' : 'todo'
    // Nothing under way: focus segments kept, and the breaks between them.
    return segs[i].k === 'f' ? (i / 2 < done ? 'done' : 'todo') : (i - 1) / 2 + 1 < done ? 'done' : 'todo'
  }
  const flowerOf = (i: number): { img: string; faint?: boolean; glow?: boolean } | null => {
    if (segs[i].k !== 'f') return null
    const n = i / 2
    if (n < done) return { img: 'bloom', glow: phase === 'end' && n === done - 1 }
    if (i === cur) return { img: 'opening' }
    if ((phase === 'idle' && n === done) || ((phase === 'break' || phase === 'end') && n === done)) return { img: 'bud', faint: true }
    return null
  }
  return (
    <div className={`ftl${vertical ? ' ftl--v' : ''}${className ? ` ${className}` : ''}`} style={style} data-phase={phase}>
      {flowers && !vertical && (
        <div className="ftl-tops" aria-hidden>
          {segs.map((s, i) => {
            const f = flowerOf(i)
            return (
              <span key={i} className="ftl-top" style={{ flex: s.min }}>
                {f?.glow && <span className="ftl-glow" />}
                {f && <img className={`ftl-flower is-${f.img}${f.faint ? ' is-faint' : ''}`} src={`/ds/assets/cherry/${f.img}.png`} alt="" />}
                {i === cur && s.k === 'b' && breakLabel && <span className="ftl-break">{breakLabel}</span>}
              </span>
            )
          })}
        </div>
      )}
      <div className="ftl-segs" role="img" aria-label={`${done} of ${segs.filter((s) => s.k === 'f').length} rounds kept`}>
        {segs.map((s, i) => {
          const st = stateOf(i)
          return (
            <span
              key={i}
              className={`ftl-seg${st === 'now' ? ' is-now' : ''}${st === 'now' && s.k === 'b' ? ' is-pulse' : ''}`}
              data-k={s.k}
              data-state={st}
              style={{ flex: s.min, background: fill(s.k, st, frac, color, vertical) }}
            />
          )
        })}
      </div>
      {labels && !vertical && (
        <div className="ftl-labels">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}
