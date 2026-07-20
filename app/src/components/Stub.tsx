// Placeholder for surfaces not yet built (Wave 2). Each wave swaps its route's
// element for the real feature. Neutral scaffolding — not shipped product copy.
export function Stub({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: 'var(--ink-faint)' }}>
      <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 40, opacity: 0.7 }} />
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-muted)' }}>{name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>in cultivation</div>
    </div>
  )
}
