import { useEffect, useState } from 'react'
import { useTheme } from '../../lib/theme'

// Night.dc.html 1a / 1f — Today after dark: the moonflower opens, one or two fireflies drift. Night
// only (morning users never see either). Styles + motion gates live in styles/night.css.

/** The moonflower — the one plant that only opens at night. Drawn from 1a's band (46 × 64). */
export function Moonflower({ height = 44 }: { height?: number }) {
  return (
    <svg className="kf-moonflower" width={(height * 46) / 64} height={height} viewBox="0 0 46 64" aria-hidden style={{ flex: 'none' }}>
      <path d="M23 63V34" stroke="var(--moonflower-stem)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M23 48c-5-1-8-4-9-9 5 .4 8 2.6 9 9Z" fill="var(--moonflower-stem)" />
      <g opacity="0.95">
        <ellipse cx="23" cy="20" rx="6" ry="13" fill="var(--moonflower-petal)" />
        <ellipse cx="13" cy="24" rx="6" ry="12" fill="var(--moonflower-petal-2)" transform="rotate(-38 13 24)" />
        <ellipse cx="33" cy="24" rx="6" ry="12" fill="var(--moonflower-petal-2)" transform="rotate(38 33 24)" />
      </g>
      <circle cx="23" cy="24" r="4.5" fill="var(--acc-buttercream)" />
      <circle cx="23" cy="24" r="9" fill="none" stroke="var(--acc-buttercream)" strokeOpacity="0.35" strokeWidth="4" opacity="0.6" />
    </svg>
  )
}

// Where they hang: 1a puts two in the open air at the top right of the page, 1f one under the card.
const FLIES = {
  desktop: [{ left: '62%', top: 118 }, { left: '86%', top: 360, small: true, delay: '2s,3s' }],
  phone: [{ left: '68%', top: 200 }],
} as const

/** Today's fireflies — absolutely placed in the page (.td / .tp), above the paper, never in the way. */
export function Fireflies({ phone }: { phone: boolean }) {
  const night = useTheme((s) => s.theme === 'night')
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  if (!night) return null
  return (
    <div className="kf-flies" aria-hidden data-paused={hidden || undefined}>
      {FLIES[phone ? 'phone' : 'desktop'].map((f, i) => (
        <span key={i} className={`kf-fly${'small' in f ? ' is-small' : ''}`} style={{ left: f.left, top: f.top, animationDelay: 'delay' in f ? f.delay : undefined }} />
      ))}
    </div>
  )
}
