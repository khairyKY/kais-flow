import { useEffect, useRef, useState } from 'react'

// ── Shared motion gate + helpers. Every animation in the app checks useMotionEnabled()
// so it honors both the OS reduced-motion pref AND the app's Effects toggle (Routines 3b /
// Settings). Ambient loops (petals, fireflies) are decorative and gate on this; essential
// affordance feedback still runs. Keyframes live in tokens/motion.css. ──

const EFFECTS_KEY = 'kf_effects'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function readEffectsOn(): boolean {
  try {
    return localStorage.getItem(EFFECTS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setEffectsEnabled(on: boolean) {
  try {
    localStorage.setItem(EFFECTS_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event('kf-effects-change'))
}

// True when decorative motion should play: effects on AND not reduced-motion.
export function useMotionEnabled(): boolean {
  const reduced = usePrefersReducedMotion()
  const [effectsOn, setOn] = useState(readEffectsOn)
  useEffect(() => {
    const on = () => setOn(readEffectsOn())
    window.addEventListener('kf-effects-change', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('kf-effects-change', on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return effectsOn && !reduced
}

// Entry stagger — content settles up in source order, 60ms apart (Motion 4b).
// Spread onto each item: style={staggerDelay(i)}. Pairs with the .kf-stagger CSS.
export function staggerDelay(index: number, step = 60): React.CSSProperties {
  return { animationDelay: `${index * step}ms` }
}

// F4 Motion 3c — overlay exit (140ms). Render while `mounted`; add the matching
// `--out` class (kf-overlay-card--out / kf-scrim--out / kf-sheet--out / kf-drawer--out)
// while `closing`. Esc obeys immediately under reduced-motion (duration collapses to 0).
export function useOverlayExit(open: boolean, duration = 140): { mounted: boolean; closing: boolean } {
  const reduced = usePrefersReducedMotion()
  const [closing, setClosing] = useState(false)
  const prevOpen = useRef(open)
  useEffect(() => {
    const was = prevOpen.current
    prevOpen.current = open
    if (open || !was) return // opening, or never was open — nothing to animate out
    setClosing(true)
    const t = setTimeout(() => setClosing(false), reduced ? 0 : duration)
    return () => clearTimeout(t)
  }, [open, duration, reduced])
  return { mounted: open || closing, closing }
}

// F4 Motion 3e — list breathing, the exit half. Call BEFORE removing the row from
// data: slides the element out 200ms, collapses its height 180ms, then runs onDone
// (which performs the actual mutation). Reduced-motion → immediate onDone.
export function animateRowRemoval(el: HTMLElement | null, onDone: () => void) {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!el || reduced || typeof el.animate !== 'function') {
    onDone()
    return
  }
  const height = el.offsetHeight
  el.style.pointerEvents = 'none'
  const slide = el.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(24px)' },
    ],
    { duration: 200, easing: 'cubic-bezier(0.55, 0, 0.68, 0.53)', fill: 'forwards' },
  )
  slide.onfinish = () => {
    el.style.overflow = 'hidden'
    const collapse = el.animate([{ height: `${height}px` }, { height: '0px' }], {
      duration: 180,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    })
    collapse.onfinish = () => onDone()
  }
}

// Motion 5b "Drag lift" — R4-23 (Kai's 2026-07-20 audit). The export calls this "the one
// grammar for every draggable", so it lives here rather than being re-typed per surface:
// lift in 140ms, settle back over 320ms with an overshoot. Draggables previously just faded
// to 40% opacity, which reads as "disabled", not "picked up".
export function dragLift(isDragging: boolean, motionOn = true): React.CSSProperties {
  if (!motionOn) return { opacity: isDragging ? 0.6 : 1 }
  return {
    transform: isDragging ? 'scale(1.04) rotate(1.2deg)' : 'none',
    boxShadow: isDragging ? '0 14px 30px rgba(60,52,38,0.26)' : undefined,
    // Asymmetric on purpose: the pick-up is quick, the release settles with the overshoot.
    transition: isDragging
      ? 'transform 140ms var(--ease-out), box-shadow 140ms var(--ease-out)'
      : 'transform 320ms var(--ease-spring), box-shadow 320ms var(--ease-out)',
    // A lifted leaf stays legible; the old 0.4 made it look switched off.
    opacity: isDragging ? 0.92 : 1,
  }
}
