import { useAppZone, zoneCity } from '../../lib/appZone'

// ── Pixel contract: design-export/Seasons.dc.html 1c — the segment appended to the topbar
// after the Synced dot: "· Cairo · 34° clear". Season is real (the clock); weather is a live
// no-key fetch (see lib/seasons.ts) and fails soft — the segment just drops the weather half.
// User time zones (2026-10-04): the city is the user's zone's; the weather is Cairo's (the only
// coordinates the app has), so it only shows for a Cairo user.
// Reported for the orchestrator: AppLayout.tsx's TopBar() renders
//   <span>Kai's Flow · {dateLabel} · {online ? 'Synced' : 'Offline'}</span>
//   {online ? <span style={{ color: 'var(--acc-sage)' }}>●</span> : <span style={{ color: 'var(--ink-faint)' }}>◌</span>}
// — add `<SeasonTopbarEcho />` immediately after that dot span (same flex row), plus
// `import { SeasonTopbarEcho } from '../features/seasons/TopbarEcho'` at the top of AppLayout.tsx.
// This is the only change TopBar() needs; nothing else in AppLayout moves. ──
export function SeasonTopbarEcho() {
  // The weather half ("· 34° clear") was cut 2026-10-12: it was Cairo's for everyone (lib/seasons).
  const zone = useAppZone()
  return (
    <>
      <span>·</span>
      <span style={{ color: 'var(--ink-muted)' }}>{zoneCity(zone)}</span>
    </>
  )
}
