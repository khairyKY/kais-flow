import { useState } from 'react'
import { getSeason, SEASON_META, type Season } from '../../lib/seasons'
import { useMotionEnabled, setEffectsEnabled } from '../../lib/motion'
import { SectionLabel } from '../../components/kit'
import { SeasonTopbarEcho } from './TopbarEcho'

// ── Pixel contract: design-export/Seasons.dc.html — 1a (seasons row), 1b (three season ×
// weather composites), 1c (topbar echo + effects toggle). Living reference for the season
// system, reachable at /seasons (no sidebar nav entry — same convention as /design-system).
// The *production* home for 1c is AppLayout's topbar (see TopbarEcho.tsx's reported hook);
// this page documents the states, it doesn't own the live integration. ──

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter']

const SEASON_SAMPLE: Record<Season, { date: string; greeting: string }> = {
  spring: { date: 'Tuesday · 14 April', greeting: 'Good morning, Kai' },
  summer: { date: 'Friday · 10 July', greeting: 'Good morning, Kai' },
  autumn: { date: 'Monday · 19 October', greeting: 'Good morning, Kai' },
  winter: { date: 'Thursday · 15 January', greeting: 'Good morning, Kai' },
}

const PETALS = [
  { left: 20, delay: 0, w: 10, h: 8 },
  { left: 44, delay: 2.6, w: 8, h: 7 },
  { left: 66, delay: 5, w: 10, h: 8 },
  { left: 84, delay: 1.4, w: 9, h: 7 },
]
const RAINDROPS = [
  { left: 16, delay: 0 }, { left: 28, delay: 0.5 }, { left: 41, delay: 0.2 }, { left: 55, delay: 0.8 },
  { left: 68, delay: 0.35 }, { left: 81, delay: 0.65 }, { left: 91, delay: 0.1 },
]

const STYLES = `
  .se-hstage { position: relative; height: 210px; overflow: hidden; }
  .se-hband { position: absolute; left: 20px; right: 20px; bottom: 18px; z-index: 5; }
  .se-hlabel { position: absolute; left: 14px; top: 12px; font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-faint); z-index: 6; }
  /* punch 57: multiply is a no-op over the night paper — Night.dc.html uses overlay @ 0.25. */
  .se-grain { position: absolute; inset: 0; pointer-events: none; z-index: 4; background-image: var(--noise-url); mix-blend-mode: multiply; opacity: 0.45; }
  [data-theme='night'] .se-grain { mix-blend-mode: overlay; opacity: 0.25; }
  .se-petal { position: absolute; top: -14px; background: linear-gradient(135deg,#E8C4CC,#D4A8B0); border-radius: 70% 30% 60% 40%; }
  .se-aleaf { position: absolute; top: -14px; width: 12px; height: 8px; background: linear-gradient(135deg,#C9A55A,#a9803f); border-radius: 80% 20% 70% 30%; }
  .se-wleaf { position: absolute; width: 12px; height: 8px; background: linear-gradient(135deg,#C9A55A,#a9803f); border-radius: 80% 20% 70% 30%; }
  .se-rain { position: absolute; top: -20px; width: 1.5px; height: 16px; background: linear-gradient(transparent,color-mix(in srgb, var(--acc-hydrangea) 70%, transparent)); }
  .se-shimmer { position: absolute; left: 14%; right: 14%; bottom: 70px; height: 14px; background: linear-gradient(rgba(232,217,160,0),rgba(232,217,160,0.55),rgba(232,217,160,0)); transform-origin: 50% 100%; }
  .motion-on .se-petal { animation: sePFall 8s linear infinite; }
  .motion-on .se-aleaf { animation: sePFall 10s linear infinite; }
  .motion-on .se-wleaf { animation: seSideDrift 6.5s ease-in infinite; }
  .motion-on .se-rain { animation: seRainFall 1.4s linear infinite; }
  .motion-on .se-shimmer { animation: seShimmerY 3.5s ease-in-out infinite; }
  @keyframes sePFall { 0%{transform:translate(0,-16px) rotate(0deg);opacity:0} 10%{opacity:0.95} 55%{transform:translate(18px,110px) rotate(200deg);opacity:0.9} 100%{transform:translate(4px,230px) rotate(380deg);opacity:0} }
  @keyframes seSideDrift { 0%{transform:translate(-20px,0) rotate(0deg);opacity:0} 12%{opacity:0.9} 100%{transform:translate(340px,44px) rotate(300deg);opacity:0} }
  @keyframes seRainFall { 0%{transform:translateY(0)} 100%{transform:translateY(240px)} }
  @keyframes seShimmerY { 0%,100%{opacity:0.14;transform:scaleY(1)} 50%{opacity:0.3;transform:scaleY(1.06)} }
`

type Sparkle = { top: number; left?: number; right?: number; size: number }

function Sparkles({ sparkles }: { sparkles: Sparkle[] }) {
  return (
    <>
      {sparkles.map((s, i) => (
        <span
          key={i}
          style={{ position: 'absolute', top: s.top, left: s.left, right: s.right, width: s.size, height: s.size, background: 'radial-gradient(circle at 40% 40%,var(--star, #FDFBF4),transparent 65%)', borderRadius: '50%' }}
        />
      ))}
    </>
  )
}

function SeasonStage({
  bg, radial, label, date, greeting, asset, assetFilter, assetTransform, effect, borderRight, sparkles,
}: {
  bg: string
  radial: string
  label: string
  date: string
  greeting: string
  asset: string
  assetFilter?: string
  assetTransform?: string
  effect?: 'petals' | 'leaf' | 'shimmer' | 'rain' | 'wind'
  borderRight?: boolean
  sparkles?: Sparkle[]
}) {
  return (
    <div className="se-hstage" style={{ background: bg, borderRight: borderRight ? '1px solid var(--line-card)' : undefined }}>
      <div className="se-grain" />
      <span className="se-hlabel">{label}</span>
      <span style={{ position: 'absolute', inset: 0, background: radial }} />
      {effect === 'petals' && PETALS.map((p, i) => (
        <span key={i} className="se-petal" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, width: p.w, height: p.h }} />
      ))}
      {effect === 'leaf' && <span className="se-aleaf" style={{ left: '38%' }} />}
      {effect === 'shimmer' && <span className="se-shimmer" />}
      {effect === 'rain' && RAINDROPS.map((r, i) => (
        <span key={i} className="se-rain" style={{ left: `${r.left}%`, animationDelay: `${r.delay}s` }} />
      ))}
      {effect === 'wind' && (
        <>
          <span className="se-wleaf" style={{ left: '4%', top: 36 }} />
          <span className="se-wleaf" style={{ left: '-4%', top: 70, animationDelay: '2.8s', width: 10, height: 7 }} />
        </>
      )}
      <div className="se-hband">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{date}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, color: 'var(--ink-body)', marginTop: 3 }}>{greeting}</div>
          <span style={{ position: 'relative' }}>
            <img src={asset} alt="" style={{ height: 56, filter: `var(--shadow-drop-sm) ${assetFilter ?? ''}`.trim(), transform: assetTransform, transformOrigin: assetTransform ? '50% 100%' : undefined }} />
            {sparkles && <Sparkles sparkles={sparkles} />}
          </span>
        </div>
      </div>
    </div>
  )
}

function EffectsToggleDemo() {
  const motionOn = useMotionEnabled()
  const [dateLabel] = useState(() => new Date().toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }))
  return (
    <div style={{ background: 'var(--paper-linen)' }}>
      <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Kai's Flow</span><span>·</span><span>{dateLabel}</span><span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Synced<span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc-sage)' }} /></span>
          <SeasonTopbarEcho />
        </div>
        <div>Africa/Cairo</div>
      </div>
      <div style={{ padding: '16px 26px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={() => setEffectsEnabled(!motionOn)}
          aria-pressed={motionOn}
          style={{ width: 34, height: 20, borderRadius: 999, background: motionOn ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ position: 'absolute', top: 2, left: motionOn ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 150ms var(--ease-spring)' }} />
        </button>
        <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
          Effects {motionOn ? 'on' : 'off'} → the whole layer folds away; only this topbar segment remains. The layer always sits <em>behind</em> content and never fogs text.
        </div>
      </div>
    </div>
  )
}

export function SeasonsPage() {
  const motionOn = useMotionEnabled()
  const today = getSeason(new Date())

  return (
    <div className={motionOn ? 'motion-on' : ''} style={{ minHeight: '100%', background: 'var(--paper-linen)', padding: '40px 48px 60px', color: 'var(--ink-body)' }}>
      <style>{STYLES}</style>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600 }}>Seasons &amp; weather</h1>
      <p style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Year-phases and sky over the Today header · today is {SEASON_META[today].label.split(' · ')[0]}
      </p>

      <div style={{ marginTop: 30 }}>
        <SectionLabel>The seasons row</SectionLabel>
        <div style={{ marginTop: 16, width: '100%', maxWidth: 1240, border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {SEASON_ORDER.map((season, i) => {
              const meta = SEASON_META[season]
              const sample = SEASON_SAMPLE[season]
              const effect = season === 'spring' ? 'petals' : season === 'summer' ? 'shimmer' : season === 'autumn' ? 'leaf' : undefined
              return (
                <SeasonStage
                  key={season}
                  bg={meta.bg}
                  radial={meta.radial}
                  label={`${meta.label}${season === today ? ' · today' : ''}`}
                  date={sample.date}
                  greeting={sample.greeting}
                  asset={meta.asset}
                  assetFilter={meta.assetFilter}
                  effect={effect}
                  borderRight={i < SEASON_ORDER.length - 1}
                  sparkles={season === 'winter' ? [{ top: 12, right: 10, size: 7 }] : undefined}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 34 }}>
        <SectionLabel>Three composites — season × weather, enough to prove the matrix</SectionLabel>
        <div style={{ marginTop: 16, width: '100%', maxWidth: 1240, border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <SeasonStage
              bg="var(--sky-panel, #EBE5CE)" radial="linear-gradient(color-mix(in srgb, var(--acc-hydrangea) 18%, transparent),transparent 60%)"
              label="Rainy summer day" date="Friday · 10 July · rain" greeting="Good morning, Kai"
              asset="/ds/assets/daisy/midday.png" assetFilter="brightness(1.04)" effect="rain" borderRight
              sparkles={[{ top: 10, right: 14, size: 6 }, { top: 22, left: 12, size: 5 }]}
            />
            <SeasonStage
              bg="var(--sky-panel, #ECEAE1)" radial="radial-gradient(ellipse 80% 55% at 30% 0%, rgba(232,222,190,0.5), rgba(232,222,190,0) 70%)"
              label="Clear winter morning" date="Thursday · 15 January · clear" greeting="Good morning, Kai"
              asset="/ds/assets/daisy/morning.png" assetFilter="saturate(0.85)" borderRight
            />
            <SeasonStage
              bg="var(--sky-panel, #E9DDC6)" radial="linear-gradient(rgba(90,74,96,0.16), color-mix(in srgb, var(--acc-gold-warm) 12%, transparent) 70%)"
              label="Windy autumn evening" date="Monday · 19 October · wind" greeting="Good evening, Kai"
              asset="/ds/assets/vine/lush.png" assetFilter="sepia(0.3) saturate(0.8)" assetTransform="rotate(2.5deg)" effect="wind"
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 34 }}>
        <SectionLabel>Topbar echo — and what remains with effects off</SectionLabel>
        <div style={{ marginTop: 16, width: 640, maxWidth: '100%', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
          <EffectsToggleDemo />
        </div>
      </div>
    </div>
  )
}
