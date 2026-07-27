import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAppSettings, needsOnboarding, completeOnboarding } from './api'
import { isPushSupported, subscribeThisDevice } from '../notifications/api'
import { useMotionEnabled } from '../../lib/motion'

// ── Pixel contract: design-export/Onboarding.dc.html — 1a-1g (the seven steps) + 1h
// (iPhone, full-screen, CTA pinned). One React tree; the phone chrome from 1h (dots-only
// header, CTA pinned to the bottom) is a CSS breakpoint of the same markup, not a fork —
// the fake status-bar/island/home-indicator in the mockup are canvas framing for "this is
// what an iPhone looks like," not real UI (this route already renders full-viewport; the
// OS/PWA chrome draws its own status bar). ──

const TOTAL_STEPS = 7

const SEEDS = [
  { key: 'cherry/bud', src: '/ds/assets/cherry/bud.png' },
  { key: 'clover/awake', src: '/ds/assets/clover/awake.png' },
  { key: 'hydrangea/light', src: '/ds/assets/hydrangea/light.png' },
  { key: 'daisy/midday', src: '/ds/assets/daisy/midday.png' },
  { key: 'vine/sprouting', src: '/ds/assets/vine/sprouting.png' },
]

const PILLARS = {
  plan: { n: 1, label: 'Plan', bg: 'color-mix(in srgb, var(--acc-hydrangea) 28%, transparent)', color: 'var(--acc-hydrangea-deep)' },
  tend: { n: 2, label: 'Tend', bg: 'color-mix(in srgb, var(--acc-moss) 24%, transparent)', color: 'var(--acc-sage-text)' },
  cultivate: { n: 3, label: 'Cultivate', bg: 'color-mix(in srgb, var(--acc-buttercream) 32%, transparent)', color: 'var(--acc-buttercream-text)' },
}

const STYLES = `
  .ob-page { min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: var(--paper-sidebar); padding: 24px; }
  /* R4-28b (2026-07-20 audit): "There's even a vertical one here, too." height was pinned at
     600px, so the taller steps overflowed into an internal scrollbar. min-height keeps the
     roomy proportions for the short steps and lets the tall ones grow; max-height still caps
     it to the viewport, so a genuinely small window scrolls instead of clipping. */
  .ob-card { position: relative; width: 780px; max-width: 100%; min-height: 600px; max-height: calc(100dvh - 48px); display: flex; flex-direction: column; background: var(--paper-linen); border: 1px solid var(--line-card); border-radius: 5px; box-shadow: 0 2px 6px rgba(60,52,38,0.12), 0 18px 44px rgba(60,52,38,0.14); overflow: hidden; }
  .ob-grain { position: absolute; inset: 0; pointer-events: none; z-index: 40; background-image: var(--noise-url); mix-blend-mode: multiply; opacity: 0.45; }
  .ob-header { position: relative; z-index: 2; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; }
  .ob-dots-mobile { display: none; }
  .ob-body { position: relative; z-index: 2; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 40px; }
  .ob-col { width: 460px; max-width: 100%; display: flex; flex-direction: column; align-items: center; }
  .ob-footer { position: relative; z-index: 2; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 40px 28px; }
  .ob-footer-right { display: flex; align-items: center; gap: 16px; }
  .ob-h { font-family: var(--font-display); font-weight: 500; font-size: 32px; line-height: 1.12; letter-spacing: -0.01em; color: var(--ink-body); margin: 0; }
  .ob-sub { margin: 12px 0 0; font-size: 14px; line-height: 1.6; color: var(--ink-muted); }
  .ob-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line-sidebar); }
  .ob-dot.on { background: var(--acc-terra); width: 20px; border-radius: 999px; }
  .ob-cta { border: none; background: var(--acc-terra); color: var(--paper-parchment); font-family: inherit; font-size: 14px; padding: 12px 26px; border-radius: 999px; box-shadow: var(--shadow-cta); cursor: pointer; }
  .ob-back, .ob-skip { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); cursor: pointer; background: none; border: none; padding: 0; }
  .ob-flabel { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
  .ob-finput { background: var(--paper-bone); border: 1px solid var(--line-card); border-radius: 8px; padding: 13px 15px; font-size: 15px; font-family: inherit; color: var(--ink-body); width: 100%; outline: none; }
  .ob-feat { display: flex; align-items: flex-start; gap: 13px; text-align: left; width: 100%; }
  .ob-feat-t { font-size: 14.5px; color: var(--ink-body); font-weight: 500; }
  .ob-feat-d { font-size: 12.5px; color: var(--ink-muted); margin-top: 2px; line-height: 1.45; }
  .ob-seedchip { width: 36px; height: 36px; border-radius: 10px; background: var(--paper-parchment); border: 1px solid var(--line-card); display: flex; align-items: center; justify-content: center; flex: none; padding: 0; cursor: pointer; }
  .ob-seedchip.on { outline: 2px solid var(--paper-linen); box-shadow: 0 0 0 3px var(--acc-terra); }
  .ob-nudge { display: flex; align-items: center; gap: 12px; margin-top: 24px; width: 100%; background: var(--paper-parchment); border: 1px dashed var(--line-solid); border-radius: 8px; padding: 12px 16px; }
  .ob-hand { font-family: var(--font-hand); color: var(--ink-muted); }
  .ob-int-row { display: flex; align-items: center; gap: 13px; border: 1px solid var(--line-card); border-radius: 10px; padding: 13px 16px; background: var(--paper-parchment); }
  .ob-int-btn { border: 1px solid var(--line-solid); background: var(--paper-bone); color: var(--ink-body); font-family: inherit; font-size: 12.5px; padding: 8px 16px; border-radius: 999px; cursor: pointer; text-decoration: none; display: inline-block; }
  .ob-terrarium { width: 100%; margin-top: 26px; position: relative; height: 170px; background: linear-gradient(180deg,#F4EFE0,#EDE6D3); border: 1px solid var(--line-card); border-radius: 12px; overflow: hidden; }
  .ob-terrarium-soil { position: absolute; left: 0; right: 0; bottom: 0; height: 44px; background: linear-gradient(180deg,#b79f77,#8f7a54); }
  .ob-terrarium-seeds { position: absolute; left: 0; right: 0; bottom: 40px; display: flex; justify-content: space-around; align-items: flex-end; padding: 0 26px; }
  .ob-pebble { width: 10px; height: 10px; border-radius: 50%; background: #5a4a30; opacity: 0.7; }
  .ob-terrarium-note { position: absolute; top: 12px; right: 16px; font-family: var(--font-hand); font-size: 16px; color: #8f7a54; transform: rotate(-2deg); }
  .ob-mobile-only { display: none; }
  /* Effects 9 "Ink bleed" — onboarding lines sharpen from a soft blur, 480ms, 180ms stagger.
     Effects 21 "Settle-in" — the step-7 seeds drop in and settle (700ms, overshoot, ends at
     transform:none per the 2026-07-18 containing-block ruling). Gated by .ob-motion
     (useMotionEnabled — onboarding renders outside the app-shell gate); reduced-motion is
     neutralized globally in tokens/motion.css. */
  @keyframes obInkBleed { from { opacity: 0; filter: blur(4px); } to { opacity: 1; filter: none; } }
  @keyframes obSettleIn {
    0%   { transform: translateY(-26px); opacity: 0; }
    60%  { transform: translateY(2px) scale(1.03) rotate(1deg); opacity: 1; }
    100% { transform: none; opacity: 1; }
  }
  .ob-motion .ob-h { animation: obInkBleed 480ms var(--ease-out) both; }
  .ob-motion .ob-sub { animation: obInkBleed 480ms var(--ease-out) 180ms both; }
  .ob-motion .ob-terrarium-seeds > * { animation: obSettleIn 700ms var(--ease-out) both; }
  .ob-motion .ob-terrarium-seeds > *:nth-child(2) { animation-delay: 90ms; }
  .ob-motion .ob-terrarium-seeds > *:nth-child(3) { animation-delay: 180ms; }
  .ob-motion .ob-terrarium-seeds > *:nth-child(4) { animation-delay: 270ms; }
  .ob-motion .ob-terrarium-seeds > *:nth-child(5) { animation-delay: 360ms; }
  @media (max-width: 767px) {
    .ob-page { padding: 0; background: var(--paper-linen); }
    .ob-card { width: 100%; height: 100dvh; max-height: none; border-radius: 0; border: none; box-shadow: none; }
    .ob-header { display: none; }
    .ob-dots-mobile { display: flex; justify-content: center; padding: calc(14px + env(safe-area-inset-top)) 0 0; position: relative; z-index: 2; }
    .ob-body { padding: 14px 22px 0; }
    .ob-col { width: 100%; }
    .ob-h { font-size: 27px; }
    .ob-sub { font-size: 13px; }
    .ob-footer { flex-direction: column-reverse; align-items: stretch; gap: 10px; padding: 0 22px calc(14px + env(safe-area-inset-bottom)); }
    .ob-footer-right { flex-direction: column-reverse; gap: 8px; }
    .ob-cta { width: 100%; padding: 15px; font-size: 15px; }
    .ob-back { text-align: center; }
    .ob-mobile-only { display: inline-block; }
    .ob-desktop-only { display: none; }
  }
`

function Dots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span key={i} className={`ob-dot${i === step ? ' on' : ''}`} />
      ))}
    </div>
  )
}

function PillarChip({ pillar }: { pillar: (typeof PILLARS)[keyof typeof PILLARS] }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 999, padding: '5px 16px 5px 5px', boxShadow: 'var(--shadow-crisp)' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: pillar.bg, color: pillar.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{pillar.n}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: pillar.color }}>{pillar.label}</span>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="ob-feat">
      <span className="ob-seedchip" style={{ cursor: 'default' }}>{icon}</span>
      <div>
        <div className="ob-feat-t">{title}</div>
        <div className="ob-feat-d">{desc}</div>
      </div>
    </div>
  )
}

function Footer({ onBack, skip, ctaLabel, onCta }: { onBack?: () => void; skip?: () => void; ctaLabel: string; onCta: () => void }) {
  return (
    <div className="ob-footer">
      {onBack ? <button type="button" className="ob-back" onClick={onBack}>← Back</button> : <span />}
      <div className="ob-footer-right">
        {skip && <button type="button" className="ob-skip" onClick={skip}>Skip for now</button>}
        <button type="button" className="ob-cta" onClick={onCta}>{ctaLabel}</button>
      </div>
    </div>
  )
}

const NudgeArrow = (
  <svg width="42" height="20" viewBox="0 0 42 20" fill="none" style={{ flex: 'none' }}>
    <path d="M2 11 C 13 4, 24 4, 34 9" stroke="var(--acc-terra)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1 4.5" />
    <path d="M29 5 L 35 9.5 L 28 12.5" stroke="var(--acc-terra)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

export function OnboardingPage() {
  const { data: settings } = useAppSettings()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // WA-1 punch 3: Settings → Profile links here with ?replant=1 to rerun the welcome on an
  // already-onboarded account (fields prefill from settings; finishing re-saves them). Without
  // the flag, a completed account is always bounced to /today — onboarding runs once.
  const replant = searchParams.has('replant')
  const isMobile = useIsMobile()
  const motionOn = useMotionEnabled()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Personal')
  const [seed, setSeed] = useState(SEEDS[0].key)
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'enabled' | 'error'>('idle')
  const prefilled = useRef(false)

  useEffect(() => {
    if (prefilled.current || !settings) return
    prefilled.current = true
    if (settings.display_name) setName(settings.display_name)
    if (settings.workspace_name) setWorkspaceName(settings.workspace_name)
    if (settings.seed_avatar) setSeed(settings.seed_avatar)
  }, [settings])

  if (!replant && settings && !needsOnboarding(settings)) return <Navigate to="/today" replace />

  const appName = name.trim() ? `${name.trim()}'s Flow` : "Kai's Flow"
  const back = () => setStep((s) => Math.max(0, s - 1))
  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))
  const finish = () => {
    completeOnboarding({ name, workspaceName, seedAvatar: seed })
    navigate('/today', { replace: true })
  }

  async function enablePush() {
    setPushStatus('enabling')
    try {
      await subscribeThisDevice()
      setPushStatus('enabled')
    } catch {
      setPushStatus('error')
    }
  }

  const header =
    step === 2 ? <PillarChip pillar={PILLARS.plan} />
    : step === 3 ? <PillarChip pillar={PILLARS.tend} />
    : step === 4 ? <PillarChip pillar={PILLARS.cultivate} />
    : <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink-body)' }}>{step === 0 ? 'Your Flow' : appName}</div>

  return (
    <div className={`ob-page${motionOn ? ' ob-motion' : ''}`}>
      <style>{STYLES}</style>
      <div className="ob-card">
        <div className="ob-grain" />
        <div className="ob-header">{header}<Dots step={step} /></div>
        <div className="ob-dots-mobile"><Dots step={step} /></div>

        <div className="ob-body">
          {step === 0 && (
            <div className="ob-col">
              <img src="/ds/assets/fern/full.png" alt="" style={{ position: 'absolute', left: -30, bottom: -20, height: 300, opacity: 0.12, transform: 'rotate(-6deg)' }} />
              <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
              <div className="ob-hand" style={{ marginTop: 10, fontSize: 19, transform: 'rotate(-1deg)' }}>let's plant something ✿</div>
              <h1 className="ob-h" style={{ marginTop: 14 }}>What should we call you?</h1>
              <p className="ob-sub">Just a first name is plenty — it's your garden, after all.</p>
              <div style={{ width: '100%', marginTop: 26, textAlign: 'left' }}>
                <div className="ob-flabel" style={{ marginBottom: 7 }}>Your name</div>
                <input className="ob-finput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kai" autoFocus />
                <div className="ob-flabel" style={{ margin: '18px 0 9px' }}>Pick a seed</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {SEEDS.map((s) => (
                    <button key={s.key} type="button" className={`ob-seedchip${seed === s.key ? ' on' : ''}`} onClick={() => setSeed(s.key)}>
                      <img src={s.src} alt="" style={{ height: 20 }} />
                    </button>
                  ))}
                </div>
                {/* R4-26 (2026-07-20 audit): "If the name's too long, the app takes your name.
                    Notice it gets bumped down." Nothing bounded the echoed name, so a long one
                    wrapped and shoved the row. Both sides may now shrink (min-width:0 — flex
                    items refuse to shrink below content width without it) and the name ellipses
                    rather than wrapping. */}
                <div className="ob-nudge">
                  <span className="ob-hand" style={{ fontSize: 16, transform: 'rotate(-1.5deg)', flex: '1 1 auto', minWidth: 0, textAlign: 'left' }}>type it, and the whole app takes your name —</span>
                  {NudgeArrow}
                  <span
                    title={appName}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink-body)', borderBottom: '2px solid var(--acc-terra)', paddingBottom: 1, flex: '0 1 auto', minWidth: 0, maxWidth: '48%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {appName}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="ob-col">
              <img src="/ds/assets/vine/sprouting.png" alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
              <h1 className="ob-h" style={{ marginTop: 16 }}>Name your workspace</h1>
              <p className="ob-sub">One place for your whole life — work, home, health. It shows up quietly at the top of every page.</p>
              <div style={{ width: '100%', marginTop: 26, textAlign: 'left' }}>
                <div className="ob-flabel" style={{ marginBottom: 7 }}>Workspace</div>
                <input className="ob-finput" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Personal" />
              </div>
              <div style={{ width: '100%', marginTop: 22, border: '1px solid var(--line-card)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-parchment)' }}>
                <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  <span>Kai's Flow · <b style={{ color: 'var(--acc-terra)', fontWeight: 600 }}>{workspaceName.trim() || 'Personal'}</b> · Cairo</span><span>preview</span>
                </div>
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>…the strip you'll see everywhere</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-col" style={{ width: 500 }}>
              <img src="/ds/assets/hydrangea/medium.png" alt="" style={{ position: 'absolute', right: -20, top: -10, height: 180, opacity: 0.14, transform: 'rotate(8deg)' }} />
              <h1 className="ob-h">Get it out of your head</h1>
              <p className="ob-sub" style={{ marginBottom: 24 }}>Everything that takes time belongs in one place. Capture fast, sort later.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <Feature icon={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-body)' }}>⌘K</span>} title="Command bar & voice" desc={'Type or speak a thought — "send the invoice friday 3pm" — and it parses the date, project and priority for you.'} />
                <Feature icon={<img src="/ds/assets/hydrangea/light.png" alt="" style={{ height: 20 }} />} title="Universal inbox" desc="Anything it can't place waits in one calm inbox. Clear it to zero, one keystroke each." />
                <Feature icon={<img src="/ds/assets/wisteria/p60.png" alt="" style={{ height: 20 }} />} title="Projects & areas" desc="Group work that finishes into projects, and the parts of life that just continue into areas." />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="ob-col" style={{ width: 500 }}>
              <img src="/ds/assets/cherry/bloom.png" alt="" style={{ position: 'absolute', right: -16, bottom: -16, height: 190, opacity: 0.14, transform: 'rotate(-8deg)' }} />
              <h1 className="ob-h">Make each day a good one</h1>
              <p className="ob-sub" style={{ marginBottom: 24 }}>Show up, pick what matters, give it a shape. Then just follow the day.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <Feature icon={<img src="/ds/assets/clover/four_leaf.png" alt="" style={{ height: 20 }} />} title="Today & your Top-3" desc="One anchor screen. Choose the three things that would make today count — the rest can wait." />
                <Feature icon={<span style={{ width: 13, height: 13, borderLeft: '3px solid var(--acc-lavender)', background: 'rgba(168,160,190,0.25)', borderRadius: 2, display: 'inline-block' }} />} title="Calendar time-blocking" desc="Drag a task onto the calendar to reserve real time for it. Syncs both ways with Google Calendar." />
                <Feature
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="5" fill="#C9A55A" />
                      <g stroke="#9a7b3a" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></g>
                    </svg>
                  }
                  title="Morning & evening rituals"
                  desc="Two short guided flows — plan the day, then close its loops at night. Under five minutes each."
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="ob-col" style={{ width: 500 }}>
              <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ position: 'absolute', left: -20, top: -10, height: 200, opacity: 0.13, transform: 'rotate(6deg)' }} />
              <h1 className="ob-h">Watch it grow</h1>
              <p className="ob-sub" style={{ marginBottom: 24 }}>The parts that pay off slowly — habits, reflection, the people and ideas you keep.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
                <Feature icon={<img src="/ds/assets/vine/flowering.png" alt="" style={{ height: 20 }} />} title="Routines & streaks" desc="Daily habits, separate from tasks. The vine grows a leaf for every day you keep it." />
                <Feature icon={<img src="/ds/assets/fern/unfurl1.png" alt="" style={{ height: 20 }} />} title="Weekly review & Slipping" desc="A gentle sweep each week — and a nudge when a project's gone quiet too long." />
                <Feature icon={<img src="/ds/assets/clover/four_leaf.png" alt="" style={{ height: 20 }} />} title="Journal, people & library" desc="Write the day, remember the people, keep the quotes and notes worth returning to." />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="ob-col" style={{ width: 480 }}>
              <h1 className="ob-h">Connect what you already use</h1>
              <p className="ob-sub" style={{ marginBottom: 24 }}>Optional — integrations arrive in a later release; push works today.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <div className="ob-int-row">
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-lavender)', flex: 'none' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}><div className="ob-feat-t">Google Calendar</div><div className="ob-feat-d">Two-way sync — your blocks and events, everywhere.</div></div>
                  <span className="ob-int-btn" aria-disabled="true" title="Coming with integrations — not wired up yet" style={{ opacity: 0.45, cursor: 'not-allowed' }}>Soon</span>
                </div>
                <div className="ob-int-row">
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-moss)', flex: 'none' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}><div className="ob-feat-t">GitHub</div><div className="ob-feat-d">Ranked issues drop straight into your inbox.</div></div>
                  <span className="ob-int-btn" aria-disabled="true" title="Coming with integrations — not wired up yet" style={{ opacity: 0.45, cursor: 'not-allowed' }}>Soon</span>
                </div>
                <div className="ob-int-row">
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}><div className="ob-feat-t">Push notifications</div><div className="ob-feat-d">Ritual nudges & reminders on this device.</div></div>
                  {isPushSupported() ? (
                    <button type="button" className="ob-int-btn" onClick={enablePush} disabled={pushStatus === 'enabling' || pushStatus === 'enabled'}>
                      {pushStatus === 'enabled' ? 'Enabled ✓' : pushStatus === 'enabling' ? 'Enabling…' : pushStatus === 'error' ? 'Try again' : 'Enable'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>not supported here</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="ob-col" style={{ width: 520 }}>
              <div className="ob-flabel" style={{ color: 'var(--acc-sage-text)' }}>Day 1</div>
              <h1 className="ob-h" style={{ marginTop: 8 }}>Let's plant your garden</h1>
              <p className="ob-sub">
                {isMobile
                  ? 'One seed for each part of the app — your terrarium starts here.'
                  : "One seed for each part of the app. They'll grow as you tend them — this is where your terrarium begins."}
              </p>
              <div className="ob-terrarium">
                <div className="ob-terrarium-soil" />
                <div className="ob-terrarium-seeds">
                  <img className="ob-desktop-only" src="/ds/assets/cherry/bud.png" alt="Tasks" style={{ height: 40 }} />
                  <img className="ob-desktop-only" src="/ds/assets/hydrangea/zero.png" alt="Inbox" style={{ height: 38 }} />
                  <span className="ob-pebble ob-desktop-only" style={{ marginBottom: 8 }} />
                  <img className="ob-desktop-only" src="/ds/assets/clover/seedling.png" alt="Routines" style={{ height: 36 }} />
                  <span className="ob-pebble ob-desktop-only" style={{ marginBottom: 14 }} />
                  <img className="ob-mobile-only" src="/ds/assets/cherry/bud.png" alt="Tasks" style={{ height: 38 }} />
                  <img className="ob-mobile-only" src="/ds/assets/hydrangea/zero.png" alt="Inbox" style={{ height: 36 }} />
                  <img className="ob-mobile-only" src="/ds/assets/clover/seedling.png" alt="Routines" style={{ height: 34 }} />
                  <img className="ob-mobile-only" src="/ds/assets/vine/sprouting.png" alt="Routines" style={{ height: 34 }} />
                </div>
                <div className="ob-terrarium-note ob-desktop-only">seeds settling in…</div>
              </div>
            </div>
          )}
        </div>

        {step === 0 && <Footer ctaLabel="Continue →" onCta={next} />}
        {step === 1 && <Footer onBack={back} ctaLabel="Continue →" onCta={next} />}
        {step === 2 && <Footer onBack={back} ctaLabel="Next: Tend →" onCta={next} />}
        {step === 3 && <Footer onBack={back} ctaLabel="Next: Cultivate →" onCta={next} />}
        {step === 4 && <Footer onBack={back} ctaLabel="Continue →" onCta={next} />}
        {step === 5 && <Footer onBack={back} skip={next} ctaLabel="Continue →" onCta={next} />}
        {step === 6 && <Footer onBack={back} ctaLabel="Enter your garden ✿" onCta={finish} />}
      </div>
    </div>
  )
}
