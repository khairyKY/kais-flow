import { useEffect, useRef } from 'react'
import { useMotionEnabled } from '../../lib/motion'
import { useTheme } from '../../lib/theme'
import { SOTTO_LABEL, barLevels, cycle, easeOut, micMeter, mmBlob, seg, type SottoState } from './sotto'
import './capture.css'

// Sotto's dictation pill, ported from its overlay (D:\Coding\sotto\ui\overlay.js) the way Sotto draws
// it — a canvas in Sotto's own 148×40 units: lilac bars on the mic's level while listening, amber
// bubbles rising while transcribing, gold blobs with a shimmer and a twinkle while polishing, a lilac
// tick when done, blush on an error. 1.2× so it stands 48px, the touch floor (Sukoon scales it the
// same). Colours are Sotto's, from styles/tokens/sotto.css, read off the canvas every frame — so Night
// Garden draws Sotto's dark. Reduced motion (or Effects off): a calm still frame of each state.

const S = 1.2
const PW = 148
const PH = 40
const CR = PH / 2
/** No ✕/↻ slot: the hold-to-talk pill (sliding cancels it) and the hands-free bar (its own Cancel). */
const COMPACT_W = 118
/** Canvas margin around the pill for its shadow. */
const PAD = 16
const BTN_R = 11
/** The still frame each state shows with reduced motion (ms into the state). */
const STILL: Record<SottoState, number> = { listening: 0, transcribing: 1000, polishing: 900, done: 260, error: 0 }
const BLOBS: [number, number, number, number][] = [[-14, 1, 8, 0], [1, 0, 10, -0.5], [13.5, 1.5, 7.5, -1]]
let star: Path2D | null = null // the design's 4-point twinkle, 12×12 viewBox

type Button = 'cancel' | 'retry' | null

interface SottoPillProps {
  state: SottoState
  /** Listening: the take's own mic — the bars follow its level (an AnalyserNode on it). */
  stream?: MediaStream | null
  /** Tapping the pill while listening: done talking. */
  onFinish?: () => void
  /** The ✕, while listening. */
  onCancel?: () => void
  /** The ↻ on an error: the kept take, tried again. */
  onRetry?: () => void
  compact?: boolean
}

export function SottoPill({ state, stream, onFinish, onCancel, onRetry, compact = false }: SottoPillProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const level = useRef<() => number>(() => 0)
  const since = useRef(0)
  const motion = useMotionEnabled()
  const theme = useTheme((s) => s.theme) // a still pill repaints when the theme flips
  const w = compact ? COMPACT_W : PW
  const button: Button = compact ? null : state === 'listening' && onCancel ? 'cancel' : state === 'error' && onRetry ? 'retry' : null

  useEffect(() => {
    if (!stream) return
    const meter = micMeter(stream)
    level.current = meter.read
    return () => {
      level.current = () => 0
      meter.close()
    }
  }, [stream])

  useEffect(() => {
    since.current = performance.now()
  }, [state])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let raf = 0
    const frame = (now: number) => {
      // Unmounted (React drops the node before this effect's cleanup runs): no styles left to read.
      if (!el.isConnected) return
      paint(ctx, el, { state, w, button, motion, t: motion ? now - since.current : STILL[state], now: motion ? now : 0, level: motion ? level.current() : 0 })
      if (motion) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [state, w, button, motion, theme])

  return (
    <div className="sotto-pill" data-sotto={state} style={{ width: w * S, height: PH * S }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={SOTTO_LABEL[state]}
        style={{ left: -PAD * S, top: -PAD * S, width: (w + PAD * 2) * S, height: (PH + PAD * 2) * S }}
      />
      {state === 'listening' && onFinish && <button type="button" className="sotto-pill-body" aria-label="Finish talking" onClick={onFinish} />}
      {button && (
        <button
          type="button"
          className="sotto-pill-btn"
          aria-label={button === 'retry' ? 'Retry the take' : 'Discard the take'}
          onClick={button === 'retry' ? onRetry : onCancel}
          style={{ left: (w - 8 - BTN_R) * S - 24 }}
        />
      )}
    </div>
  )
}

/** "Powered by Sotto", with Sotto's mark: its wave in the lilac tile (as Sukoon shows it). */
export function PoweredBySotto() {
  return (
    <span className="sotto-powered">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect width="16" height="16" rx="5" fill="var(--sotto-mark)" />
        <path d="M3 8.5C4.5 5 6 5 7.5 8C9 11 10.8 11 13 7.5" fill="none" stroke="var(--sotto-mark-wave)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Powered by Sotto
    </span>
  )
}

// ── drawing (overlay.js, in its units) ──

interface Frame {
  state: SottoState
  w: number
  button: Button
  motion: boolean
  /** ms into this state */
  t: number
  /** the clock the listening bars wave on */
  now: number
  level: number
}

type Tokens = (name: string) => string

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function paint(ctx: CanvasRenderingContext2D, el: HTMLCanvasElement, f: Frame) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const k = S * dpr // shadows are in device pixels: the transform doesn't scale them
  const cw = f.w + PAD * 2
  const ch = PH + PAD * 2
  const W = Math.round(cw * k)
  const H = Math.round(ch * k)
  if (el.width !== W) el.width = W
  if (el.height !== H) el.height = H
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  const css = getComputedStyle(el)
  const c: Tokens = (name) => css.getPropertyValue(`--sotto-${name}`).trim()
  const font = (weight: number, px: number) => `${weight} ${px}px ${css.fontFamily}`

  // Every state arrives as Sotto's do: fading in while it settles 4px.
  let alpha = 1
  let y = PAD
  if (f.motion && f.t < 180) {
    const e = easeOut(f.t / 180)
    alpha = e
    y += (1 - e) * 4
  }
  const x = PAD
  const w = f.w
  const yc = y + PH / 2
  const xr = x + w - 8 - BTN_R
  // Live states centre in the room left of the ✕ / ↻; without one, in the pill.
  const cx = f.button ? (x + 14 + xr - BTN_R - 4) / 2 : x + w / 2
  const t = f.t

  base(ctx, c, x, y, w, alpha, k)
  ctx.globalAlpha = alpha

  if (f.state === 'listening') {
    const barW = 3.5
    const gap = 4
    const startX = cx - (5 * barW + 4 * gap) / 2
    ctx.fillStyle = c('lilac')
    barLevels(f.now, f.level).forEach((v, i) => {
      const bh = Math.max(4, v * 18)
      ctx.globalAlpha = alpha * (0.5 + v * 0.5)
      rr(ctx, startX + i * (barW + gap), yc - bh / 2, barW, bh, barW / 2)
      ctx.fill()
    })
  } else if (f.state === 'transcribing') {
    // mm-rise: four bubbles rise from the floor (translateY 9 → -15, scale .4 → 1.05), in to .95, down to .55, out.
    const floor = yc + 12
    const sizes = [9, 7, 11, 8]
    const xs = [-20.5, -5.5, 10.5, 23]
    ctx.fillStyle = c('amber')
    ctx.shadowColor = c('amber-glow')
    ctx.shadowBlur = 6 * k
    for (let i = 0; i < 4; i++) {
      const p = cycle(t, 2.3, -0.5 * i)
      const o = p < 0.25 ? seg(0, 0.95, p / 0.25) : p < 0.72 ? seg(0.95, 0.55, (p - 0.25) / 0.47) : seg(0.55, 0, (p - 0.72) / 0.28)
      ctx.globalAlpha = alpha * o
      ctx.beginPath()
      ctx.arc(cx + xs[i], floor - sizes[i] / 2 + seg(9, -15, p), (sizes[i] / 2) * seg(0.4, 1.05, p), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
  } else if (f.state === 'polishing') {
    // Three gold blobs drifting as one cloud (mm-blob), a shimmer sweeping it, a twinkle at its top right.
    ctx.fillStyle = c('gold')
    ctx.globalAlpha = alpha * 0.85
    for (const [ox, oy, r, delay] of BLOBS) {
      const [bx, by, bs] = mmBlob(t, 2.6, delay)
      ctx.beginPath()
      ctx.arc(cx + ox + bx, yc + oy + by, r * bs, 0, Math.PI * 2)
      ctx.fill()
    }
    const glint = c('glint')
    const clear = c('glint-clear')
    const sp = cycle(t, 2, 0)
    const sx = cx + seg(-28, 28, sp)
    const shimmer = ctx.createLinearGradient(sx, 0, sx + 22, 0)
    shimmer.addColorStop(0, clear)
    shimmer.addColorStop(0.5, glint)
    shimmer.addColorStop(1, clear)
    ctx.fillStyle = shimmer
    ctx.globalAlpha = alpha * (sp < 0.5 ? seg(0, 1, sp * 2) : seg(1, 0, sp * 2 - 1))
    rr(ctx, sx, yc, 22, 3, 1.5)
    ctx.fill()
    const tp = cycle(t, 1.8, 0)
    const tw = tp < 0.5 ? seg(0, 1, tp * 2) : seg(1, 0, tp * 2 - 1)
    if (tw > 0.01) {
      star ??= new Path2D('M6 0 l1 4 4 1 -4 1 -1 4 -1 -4 -4 -1 4 -1z')
      ctx.save()
      ctx.globalAlpha = alpha * tw
      ctx.translate(cx + 24.5, yc - 9.5)
      ctx.scale(0.75 * tw, 0.75 * tw)
      ctx.translate(-6, -6)
      ctx.fillStyle = glint
      ctx.fill(star)
      ctx.restore()
    }
  } else if (f.state === 'done') {
    // The tick draws itself in 260ms.
    const d = easeOut(Math.min(t, 260) / 260)
    const l1 = Math.hypot(6, 6)
    const l2 = Math.hypot(14, 15)
    const run = d * (l1 + l2)
    ctx.strokeStyle = c('lilac')
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - 9, yc + 1)
    if (run <= l1) ctx.lineTo(cx - 9 + (6 * run) / l1, yc + 1 + (6 * run) / l1)
    else {
      ctx.lineTo(cx - 3, yc + 7)
      const u = (run - l1) / l2
      ctx.lineTo(cx - 3 + 14 * u, yc + 7 - 15 * u)
    }
    ctx.stroke()
  } else {
    // A blush disc. Sotto's toast also counts down to dismiss itself; a kept take never does, so no bar.
    ctx.fillStyle = c('blush')
    ctx.beginPath()
    ctx.arc(cx, yc, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c('blush-ink')
    ctx.font = font(700, 11)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', cx, yc)
  }

  ctx.globalAlpha = alpha
  if (f.button) {
    ctx.fillStyle = c(f.button === 'retry' ? 'retry-bg' : 'button')
    ctx.beginPath()
    ctx.arc(xr, yc, BTN_R, 0, Math.PI * 2)
    ctx.fill()
    if (f.button === 'retry') {
      ctx.fillStyle = c('retry')
      ctx.font = font(600, BTN_R)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u21BB', xr, yc + 0.5)
    } else {
      const s = BTN_R * 0.45
      ctx.strokeStyle = c('muted')
      ctx.lineWidth = 1.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(xr - s, yc - s)
      ctx.lineTo(xr + s, yc + s)
      ctx.moveTo(xr + s, yc - s)
      ctx.lineTo(xr - s, yc + s)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

/** Sotto's pill body: cream (plum at night), its neumorphic shadow and light, a sheen, a 1px rim. */
function base(ctx: CanvasRenderingContext2D, c: Tokens, x: number, y: number, w: number, alpha: number, k: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = c('surface')
  for (const [colour, off] of [[c('shadow'), 4], [c('light'), -4]] as const) {
    ctx.shadowColor = colour
    ctx.shadowBlur = 10 * k
    ctx.shadowOffsetX = off * k
    ctx.shadowOffsetY = off * k
    rr(ctx, x, y, w, PH, CR)
    ctx.fill()
  }
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = alpha
  rr(ctx, x, y, w, PH, CR)
  ctx.clip()
  const sheen = ctx.createLinearGradient(0, y, 0, y + PH / 2)
  sheen.addColorStop(0, c('sheen'))
  sheen.addColorStop(1, c('sheen-clear'))
  ctx.fillStyle = sheen
  ctx.fillRect(x, y, w, PH / 2)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineWidth = 1
  ctx.strokeStyle = c('edge')
  rr(ctx, x + 0.5, y + 0.5, w - 1, PH - 1, CR - 0.5)
  ctx.stroke()
  ctx.restore()
}
