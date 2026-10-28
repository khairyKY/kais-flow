import { useState, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from 'react'
import { motionOnNow, useMotionEnabled } from '../lib/motion'
import '../features/projects/xfx.css' // .kf-bloom / .kf-bloom-once
import './pageMotion.css'

// ── Lane A2 (motion build 2026-10-28) — the page pieces the gap report asked for more than once:
// a growth-stage plant that cross-fades (R2 Routines, R5 Focus garden, R9 the fern, R10 the
// wisteria), a number that rises when it changes (T12), and the soft no outside the shell (R12). ──

/** A growth-stage plant: when `src` changes while it's on screen, the old stage fades out over the
 * new one, which rises from its base (0.92 → 1, 400ms), plus one Effects 2e bloom when `bloom`.
 * Effects off or reduced motion: a plain swap. The first render never animates. */
export function StageImg({ src, bloom, bloomInset = -10, ...img }: ImgHTMLAttributes<HTMLImageElement> & { src: string; bloom?: boolean; bloomInset?: number }) {
  const motion = useMotionEnabled()
  const [s, setS] = useState<{ src: string; prev: string | null; n: number }>({ src, prev: null, n: 0 })
  if (s.src !== src) setS({ src, prev: s.src, n: s.n + 1 })
  const live = motion && s.n > 0
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      {live && bloom && <span key={`b${s.n}`} className="kf-bloom kf-bloom-once" style={{ inset: bloomInset }} />}
      {/* the wrapper carries the rise, so the img keeps its own animation (a sway) */}
      <span key={live ? s.n : 0} className={live ? 'kf-stage-in' : undefined} style={{ display: 'inline-flex' }}>
        <img alt="" {...img} src={src} />
      </span>
      {live && s.prev && (
        <img
          key={`o${s.n}`}
          src={s.prev}
          alt=""
          aria-hidden
          className="kf-stage-out"
          style={{ ...img.style, position: 'absolute', left: '50%', bottom: 0, translate: '-50% 0', margin: 0 }}
          onAnimationEnd={() => setS((x) => (x.n === s.n ? { ...x, prev: null } : x))}
        />
      )}
    </span>
  )
}

/** T12: a counter that rises in (200ms) when its value changes — never on first render. */
export function Num({ value, children, style }: { value: string | number; children?: ReactNode; style?: CSSProperties }) {
  const [s, setS] = useState({ v: value, n: 0 })
  if (s.v !== value) setS({ v: value, n: s.n + 1 })
  return (
    <span key={s.n} className={s.n ? 'kf-num' : undefined} style={style}>
      {children ?? value}
    </span>
  )
}

/** R12 — Effects 2j's soft no on something outside the app shell (no `.motion-on` there): one
 * decaying ±4px shake, Effects on only. */
export function shakeNo(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement) || typeof el.animate !== 'function' || !motionOnNow()) return
  el.animate(
    [0, -4, 4, -3, 2, -1, 0].map((x, i) => ({ transform: `translateX(${x}px)`, offset: [0, 0.15, 0.3, 0.45, 0.62, 0.8, 1][i] })),
    { duration: 320, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
  )
}
