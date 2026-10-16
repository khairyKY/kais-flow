import type { CSSProperties } from 'react'

// ── Filter chip (kit Chip tone="filter") — Search.dc.html `.fchip`: a 1px pill that narrows a list.
// On, it inverts with the theme (ink fill + linen label: dark-on-cream by day, cream-on-violet at
// night) instead of taking the ring + check; an optional filter ("Open only") is dashed until it's
// on. Its own module (not kit.tsx, which exports only components) so a Select trigger can wear it
// too (Search "Any time ▾"): Select draws its own field box inline, so the box lives in the style;
// size, tracking and the phone height are kit.css's `.kf-chip` / `.kf-chip--filter`. ──
export function filterChip(on: boolean, dashed = false): { className: string; style: CSSProperties } {
  return {
    className: 'kf-chip kf-chip--filter',
    style: {
      fontFamily: 'var(--font-mono)',
      gap: 7,
      borderRadius: 'var(--radius-pill)',
      background: on ? 'var(--ink-body)' : 'none',
      // D12 (Kai 2026-10-15): off, a 3:1 edge and body ink — --line-solid / --ink-muted all but vanished
      color: on ? 'var(--paper-linen)' : 'var(--ink-body)',
      border: `1px ${dashed && !on ? 'dashed' : 'solid'} ${on ? 'var(--ink-body)' : 'var(--line-control)'}`,
    },
  }
}
