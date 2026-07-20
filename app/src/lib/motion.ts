import { useEffect, useState } from 'react'

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
