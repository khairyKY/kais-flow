import { getSeason, type Season } from '../../lib/seasons'
import './seasons.css'

// D12 — Effects 2a "seasonal drift" + Seasons.dc 1a/1b's header layer (Kai said yes, 2026-10-28): one
// particle system behind the page header, four skins by the real season — spring blossom petals
// (pFall), summer's buttercream shimmer (shimmerY), autumn's amber leaves crossing (sideDrift), winter's
// thin hydrangea rain (rainFall). Decorative: it only exists with Effects on and no reduced motion
// (.motion-on, seasons.css). Tokens only. The header it sits in clips it and keeps its own stacking.

/** [left %, delay s, duration s] per bit — the demo's (Motion fixes.html D12) placements. */
const BITS: Record<Season, [number, number, number][]> = {
  spring: [[12, 0, 7], [48, 2.4, 8], [80, 4.6, 6.4]],
  summer: [[0, 0, 7]],
  autumn: [[-5, 0, 10], [30, 3.5, 11], [60, 6.5, 9.5]],
  winter: Array.from({ length: 14 }, (_, i) => [(i * 7.3) % 100, (i * 0.37) % 2, 1.6 + (i % 4) * 0.3]),
}

export function SeasonDrift({ now = new Date() }: { now?: Date }) {
  const season = getSeason(now)
  return (
    <div className="kf-season-drift" data-season={season} aria-hidden="true">
      {BITS[season].map(([left, delay, dur], i) => (
        <span key={i} style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
      ))}
    </div>
  )
}
