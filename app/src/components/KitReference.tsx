import { useState, type ReactNode } from 'react'
import { Button, Chip, SectionLabel, TapeCard, Checkbox, KeyChip, KeyCombo, Star } from './kit'
import { Icon } from './Icon'
import { ICON_NAMES } from './icons/kf'
import { MobileTabBar, TabItem } from './MobileTabBar'
import { ToastHost } from './ToastHost'
import { useTheme } from '../lib/theme'
import { KitSheetsDemo } from './KitSheetsDemo'
import { KitGesturesDemo } from './KitGesturesDemo'
import { KitPickersDemo } from './KitPickersDemo'

const caption = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' } as const

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>{children}</div>
}

/** A static tab bar row: the capture slot is drawn, not live (the live bar is pinned below on a phone). */
function TabRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 'var(--tabbar-h)', maxWidth: 390, padding: '0 var(--sp-1)', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-tabbar)', border: '1px solid var(--line-card)', marginTop: 10 }}>
      {children}
    </div>
  )
}
const captureSlot = (
  <div style={{ width: 72, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span className="kf-capture" aria-hidden="true"><Icon name="mic" /></span>
  </div>
)

// Living reference for the §04 component kit — reachable at /design-system (no auth).
// Wave agents diff their compositions against these atoms. 2026-09-28: every refreshed state
// (DS-CHANGELOG §3) is here so it can be checked signed-out; at ≤767px the phone sizes apply and
// the real tab bar (capture: tap = type, hold = talk) is pinned to the bottom.
export function KitReference() {
  const [checked, setChecked] = useState(true)
  const [starred, setStarred] = useState(true)
  const [filterOn, setFilterOn] = useState(true)
  const toggleTheme = useTheme((s) => s.toggle)
  const theme = useTheme((s) => s.theme)

  return (
    <div className="kit-reference" style={{ minHeight: 'var(--kf-vh)', background: 'var(--paper-linen)', padding: '48px clamp(16px, 5vw, 56px) 120px', color: 'var(--ink-body)' }}>
      <style>{'.kit-reference .app-tabbar { display: none; } @media (max-width: 767px) { .kit-reference .app-tabbar { display: flex; } }'}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600 }}>Component kit</h1>
        <button onClick={toggleTheme} style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}>
          {theme === 'night' ? '☀ day' : '☾ night'}
        </button>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 0 }}>Design System §04 · the atoms every surface composes</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 34, marginTop: 34, maxWidth: 760 }}>
        <section>
          <SectionLabel action={<a href="#" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}>View all →</a>}>Buttons</SectionLabel>
          <Row>
            <Button variant="cta" icon={<Icon name="mic" size={16} />}>Voice capture</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </Row>
          <Row>
            <Button variant="cta" loading>Saving</Button>
            <Button variant="cta" disabled>Plan today</Button>
            <Button variant="secondary" selected={filterOn} onClick={() => setFilterOn((v) => !v)}>Filter</Button>
            <Button variant="secondary" loading>Loading</Button>
            <Button variant="ghost" disabled>Cancel</Button>
            <span style={caption}>loading · disabled · selected (tap Filter) — press any for the overlay, Tab for the ring</span>
          </Row>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <Chip tone="date" onClick={() => {}}>Tomorrow 09:00</Chip>
            <Chip tone="project" onClick={() => {}}>Forecasting</Chip>
            <Chip tone="duration" onClick={() => {}}>30m</Chip>
            <Chip tone="priority" onClick={() => {}}>P1</Chip>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <Chip tone="inbox" selected>Inbox</Chip>
            <Chip tone="date" loading>Tomorrow 09:00</Chip>
            <Chip tone="inbox" disabled>Inbox</Chip>
            <span style={caption}>parse chips (tap = picker) · selected · loading · disabled</span>
          </div>
        </section>

        <section>
          <SectionLabel>Tab bar — MK Tab Bar</SectionLabel>
          <TabRow>
            <TabItem to="/today" label="Today" icon="today" tint="var(--block-sage)" active />
            <TabItem to="/inbox" label="Inbox" icon="inbox" tint="var(--block-hydrangea)" active={false} />
            {captureSlot}
            <TabItem to="/calendar" label="Calendar" icon="calendar" tint="var(--block-lavender)" active={false} />
            <TabItem label="More" icon="more" tint="var(--block-buttercream)" active={false} />
          </TabRow>
          <TabRow>
            <TabItem to="/today" label="Today" icon="today" tint="var(--block-sage)" active={false} />
            <TabItem to="/inbox" label="Inbox" icon="inbox" tint="var(--block-hydrangea)" active badge={1} />
            {captureSlot}
            <TabItem to="/calendar" label="Calendar" icon="calendar" tint="var(--block-lavender)" active={false} />
            <TabItem label="More" icon="more" tint="var(--block-buttercream)" active={false} />
          </TabRow>
          <TabRow>
            <TabItem to="/today" label="Today" icon="today" tint="var(--block-sage)" active={false} />
            <TabItem to="/inbox" label="Inbox" icon="inbox" tint="var(--block-hydrangea)" active={false} badge={12} />
            {captureSlot}
            <TabItem to="/calendar" label="Calendar" icon="calendar" tint="var(--block-lavender)" active />
            <TabItem label="More" icon="more" tint="var(--block-buttercream)" active={false} />
          </TabRow>
          <TabRow>
            <TabItem to="/today" label="Today" icon="today" tint="var(--block-sage)" active={false} />
            <TabItem to="/inbox" label="Inbox" icon="inbox" tint="var(--block-hydrangea)" active={false} badge={128} />
            {captureSlot}
            <TabItem to="/calendar" label="Calendar" icon="calendar" tint="var(--block-lavender)" active={false} />
            <TabItem label="More" icon="more" tint="var(--block-buttercream)" active />
          </TabRow>
          <p style={{ ...caption, marginTop: 10 }}>Active: Today · Inbox (badge 1) · Calendar (badge 12) · More (badge 99+). At phone width the live bar is pinned below: tap capture = type, hold = talk.</p>
        </section>

        <section>
          <SectionLabel>Icons — kf-* · 24 grid · stroke 1.6</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginTop: 14 }}>
            {ICON_NAMES.map((name) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, color: 'var(--ink-body)' }}>
                <Icon name={name} />
                <span style={caption}>{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Keycaps — every shortcut hint (J-17)</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', marginTop: 14 }}>
            <KeyCombo keys={['⌘', 'K']} />
            <KeyChip text="?" />
            <KeyCombo keys={['⌘', 'K']} size="sm" />
            <KeyChip text="E" size="sm" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>md · overlays — sm · menus, footer, strips</span>
          </div>
        </section>

        <section>
          <SectionLabel>Checkbox — bloom on check</SectionLabel>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14 }}>
            <Checkbox checked={false} onChange={() => {}} />
            <Checkbox checked={checked} onChange={setChecked} />
            <Checkbox checked={false} subtask onChange={() => {}} />
            <Checkbox checked subtask onChange={() => {}} />
            <Checkbox checked={false} disabled />
            <span style={caption}>click me · subtask · disabled</span>
          </div>
        </section>

        <section>
          <SectionLabel>Star — Top 3</SectionLabel>
          <Row>
            <Star on={false} onChange={() => {}} />
            <Star on={starred} onChange={setStarred} label="Draft the club newsletter" />
            <Star on={false} disabled />
            <span style={caption}>empty · on (tap) · disabled — 22 glyph in a 48 hit</span>
          </Row>
        </section>

        <section>
          <SectionLabel>Washi tape &amp; tilt — placed cards</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 26, marginTop: 18, alignItems: 'start' }}>
            <TapeCard goal tape="color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)" tilt={-0.4}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: '#4a3a1e', lineHeight: 1.3 }}>Deliver the MVP of the forecasting app</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>The one thing that makes today a win</div>
            </TapeCard>
            <TapeCard tape="color-mix(in srgb, var(--acc-sage) 50%, transparent)" tilt={0.4}>
              <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.5 }}>A placed note — tape matches the surface accent, radius 3px, tilt ±0.4°.</div>
            </TapeCard>
          </div>
        </section>

        <KitGesturesDemo />

        <KitPickersDemo />

        <KitSheetsDemo />
      </div>

      <MobileTabBar pendingInbox={12} onSearch={() => {}} onChat={() => {}} onSignOut={() => {}} />
      <ToastHost />
    </div>
  )
}
