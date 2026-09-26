import { useState } from 'react'
import { Button, Chip, SectionLabel, TapeCard, Checkbox, KeyChip, KeyCombo } from './kit'
import { useTheme } from '../lib/theme'

// Living reference for the §04 component kit — reachable at /design-system (no auth).
// Wave agents diff their compositions against these atoms.
export function KitReference() {
  const [checked, setChecked] = useState(true)
  const toggleTheme = useTheme((s) => s.toggle)
  const theme = useTheme((s) => s.theme)

  return (
    <div style={{ minHeight: 'var(--kf-vh)', background: 'var(--paper-linen)', padding: '48px 56px', color: 'var(--ink-body)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600 }}>Component kit</h1>
        <button onClick={toggleTheme} style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}>
          {theme === 'night' ? '☀ day' : '☾ night'}
        </button>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 0 }}>Design System §04 · the atoms every surface composes</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 34, marginTop: 34, maxWidth: 760 }}>
        <section>
          <SectionLabel action={<a href="#" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}>View all →</a>}>Buttons</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
            <Button variant="cta">Voice capture</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </section>

        <section>
          <SectionLabel>Chips &amp; tags</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Chip tone="tasks">Tasks</Chip>
            <Chip tone="inbox">Inbox</Chip>
            <Chip tone="routed">Routed</Chip>
            <Chip tone="overdue">Overdue 3d</Chip>
            <Chip tone="gold">!! High</Chip>
            <Chip tone="bordered">Meeting</Chip>
          </div>
        </section>

        <section>
          <SectionLabel>Keycaps — every shortcut hint (J-17)</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', marginTop: 14 }}>
            <KeyCombo keys={['⌘', 'K']} />
            <KeyChip text="?" />
            <KeyCombo keys={['⌘', 'K']} size="sm" />
            <KeyChip text="E" size="sm" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>md · overlays — sm · menus, footer, strips</span>
          </div>
        </section>

        <section>
          <SectionLabel>Checkbox — bloom on check</SectionLabel>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14 }}>
            <Checkbox checked={false} onChange={() => {}} />
            <Checkbox checked={checked} onChange={setChecked} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>click me</span>
          </div>
        </section>

        <section>
          <SectionLabel>Washi tape &amp; tilt — placed cards</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 26, marginTop: 18, alignItems: 'start' }}>
            <TapeCard goal tape="color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)" tilt={-0.4}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: '#4a3a1e', lineHeight: 1.3 }}>Deliver the MVP of the forecasting app</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>The one thing that makes today a win</div>
            </TapeCard>
            <TapeCard tape="color-mix(in srgb, var(--acc-sage) 50%, transparent)" tilt={0.4}>
              <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.5 }}>A placed note — tape matches the surface accent, radius 3px, tilt ±0.4°.</div>
            </TapeCard>
          </div>
        </section>
      </div>
    </div>
  )
}
