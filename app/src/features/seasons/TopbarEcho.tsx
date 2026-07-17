import { useCairoWeather } from '../../lib/seasons'

// ── Pixel contract: design-export/Seasons.dc.html 1c — the segment appended to the topbar
// after the Synced dot: "· Cairo · 34° clear". Season is real (the clock); weather is a live
// no-key fetch (see lib/seasons.ts) and fails soft — the segment just drops the weather half.
// Reported for the orchestrator: AppLayout.tsx's TopBar() renders
//   <span>Kai's Flow · {dateLabel} · {online ? 'Synced' : 'Offline'}</span>
//   {online ? <span style={{ color: 'var(--acc-sage)' }}>●</span> : <span style={{ color: 'var(--ink-faint)' }}>◌</span>}
// — add `<SeasonTopbarEcho />` immediately after that dot span (same flex row), plus
// `import { SeasonTopbarEcho } from '../features/seasons/TopbarEcho'` at the top of AppLayout.tsx.
// This is the only change TopBar() needs; nothing else in AppLayout moves. ──
export function SeasonTopbarEcho() {
  const { data: weather } = useCairoWeather()
  return (
    <>
      <span>·</span>
      <span style={{ color: 'var(--ink-muted)' }}>Cairo{weather ? ` · ${weather.tempC}° ${weather.condition}` : ''}</span>
    </>
  )
}
