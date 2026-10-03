import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  isPushSupported,
  useMyPushSubscriptions,
  subscribeThisDevice,
  unsubscribeThisDevice,
  sendTestNotification,
} from '../notifications/api'
import { useAppSettings, updateAppSetting, useCalendarDefaultView, type CalendarDefaultView } from '../../lib/settings'
import { appPlatform, buildStamp, checkForUpdate, installedVersion, openDownload, reloadToUpdate, type UpdateResult } from '../../lib/appUpdate'
import { useTheme } from '../../lib/theme'
import { useUiScale, UI_SCALES, defaultUiScale, readUiScaleEnv, type UiScale } from '../../lib/uiScale'
import { usePrefersReducedMotion, setEffectsEnabled } from '../../lib/motion'
import { readSoundCatalog, writeSoundCatalog, readVolume, writeVolume, readQuietHours, writeQuietHours, previewSound, DEFAULT_VOLUME, type SoundId } from '../../lib/sounds'
import { Select } from '../../components/Select'
import { useIntegrations, connectGithub, syncGithub, disconnectGithub, githubState, type IntegrationStatus } from './api'
import { useCaptureKey, createCaptureKey, deleteCaptureKey, bookmarklet, CAPTURE_URL } from './captureKey'
import { Button } from '../../components/kit'
import { TimeField } from '../calendar/TimeField'
import { useDeletedItems } from '../trash/api'

// Settings.dc.html t1 1a/1b, t2 2a, t3 3a — transcribed node-for-node onto real data.
// Card shell mirrors the contract's `.scard` class (tape-topped, radius 3, shadow-card).

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

const flabel: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const fhelp: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }
const chip: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5 }

function SCard({ children, style, tapeTint }: { children: ReactNode; style?: CSSProperties; tapeTint?: string }) {
  return (
    <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '18px 20px', position: 'relative', ...style }}>
      {tapeTint && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -9, left: 26, width: 54, height: 16, background: tapeTint,
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
            transform: 'rotate(-2deg)', borderRadius: 1,
          }}
        />
      )}
      {children}
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={!onToggle}
      style={{ width: 34, height: 20, borderRadius: 999, background: on ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', border: 'none', cursor: onToggle ? 'pointer' : 'default', padding: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left var(--dur-quick) var(--ease-out)' }} />
    </button>
  )
}

function Seg<T extends string | number>({ value, onChange, options, fill = false }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; fill?: boolean }) {
  // `fill`: span the row and share it equally (phone Interface size — five options must fit even at 175%).
  return (
    <div style={{ display: fill ? 'flex' : 'inline-flex', width: fill ? '100%' : undefined, boxSizing: 'border-box', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            style={{
              padding: fill ? '6px 0' : '6px 13px', flex: fill ? '1 1 0' : undefined, minWidth: 0, borderRadius: 5, fontSize: 12, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', font: 'inherit',
              background: on ? 'var(--paper-parchment)' : 'none',
              boxShadow: on ? 'var(--shadow-crisp)' : 'none',
              color: on ? 'var(--ink-body)' : 'var(--ink-muted)',
              fontWeight: on ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ponytail: mirrors motion.ts's private reader — motion.ts is frozen and doesn't export it.
// Reads the raw effects flag so the toggle shows the STORED value even under OS reduced-motion
// (useMotionEnabled conflates the two — punch 56).
function readEffectsOn(): boolean {
  try {
    return localStorage.getItem('kf_effects') !== '0'
  } catch {
    return true
  }
}

// ── Paper texture (punch 53). Per-device visual pref like theme/uiScale → localStorage.
// Writes --kf-grain-opacity on <html>; index.css's body::before grain consumes it via a
// pending one-line foundation patch (`opacity: var(--kf-grain-opacity, 0.5)`). ──
const GRAIN_KEY = 'kf_grain'

function readGrainPct(): number {
  try {
    const raw = localStorage.getItem(GRAIN_KEY)
    const n = Number(raw)
    if (raw !== null && Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)))
  } catch {
    /* private mode */
  }
  return 50 // matches the grain's shipped opacity 0.5
}

function applyGrainPct(pct: number) {
  document.documentElement.style.setProperty('--kf-grain-opacity', String(pct / 100))
}

function useGrain() {
  const [pct, setPct] = useState(readGrainPct)
  useEffect(() => {
    applyGrainPct(pct)
  }, [pct])
  function set(next: number) {
    setPct(next)
    try {
      localStorage.setItem(GRAIN_KEY, String(next))
    } catch {
      /* session-only is fine */
    }
  }
  return { pct, set }
}

// The export's hairline slider (4px track, 15px thumb), made real: an invisible native
// range input overlays the drawn track, so drag + keyboard both work.
function HairlineSlider({ value, min = 0, max = 100, onChange, style, ariaLabel }: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  style?: CSSProperties
  ariaLabel: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <span style={{ display: 'inline-block', height: 4, borderRadius: 2, background: 'var(--line-solid)', position: 'relative', ...style }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 2, background: 'var(--acc-sage)' }} />
      <span style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 15, height: 15, borderRadius: '50%', background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)', boxShadow: 'var(--shadow-crisp)' }} />
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', height: 22, margin: 0, opacity: 0, cursor: 'pointer' }}
      />
    </span>
  )
}

// Disabled action chip — Onboarding's "Soon" pattern (nothing clickable that does nothing).
function SoonChip({ label = 'Soon' }: { label?: string }) {
  return (
    <span aria-disabled="true" title="Coming with integrations — not wired up yet" style={{ ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', opacity: 0.45, cursor: 'not-allowed' }}>
      {label}
    </span>
  )
}

const THEME_MODE_KEY = 'kf_theme_mode'
type ThemeMode = 'light' | 'dark' | 'auto'

function useThemeMode() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const [mode, setMode] = useState<ThemeMode>(() => (localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null) ?? 'light')

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setTheme(mq.matches ? 'night' : 'day')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function setMode_(next: ThemeMode) {
    localStorage.setItem(THEME_MODE_KEY, next)
    setMode(next)
    if (next === 'light') setTheme('day')
    else if (next === 'dark') setTheme('night')
  }

  return { mode, setMode: setMode_, theme }
}

// ── Sound catalog — local preference, no audio pipeline shipped yet (out of a reskin wave's
// scope); toggles persist so the eventual player has real state to read. ──
const SOUND_CATALOG = [
  { id: 'paper_rustle', label: 'Paper rustle', help: 'Completing a task', defaultOn: true },
  { id: 'petal_fall', label: 'Petal fall', help: 'A bloom moment (project / streak milestone)', defaultOn: true },
  { id: 'distant_chime', label: 'Distant chime', help: 'A ritual begins', defaultOn: false },
  { id: 'birdsong', label: 'Birdsong', help: 'First open of the morning', defaultOn: false },
  { id: 'rain_patter', label: 'Rain patter', help: 'Gentle rain / rainy weather', defaultOn: true },
  { id: 'pencil_scratch', label: 'Pencil scratch', help: 'Saving a journal line', defaultOn: false },
] as const


// (the old local sound store lived here — superseded by lib/sounds.ts)

const COMMON_TIMEZONES = ['Africa/Cairo', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai']

function AppearanceCard() {
  const { mode, setMode } = useThemeMode()
  const scale = useUiScale((s) => s.scale)
  const setScale = useUiScale((s) => s.setScale)
  // Punch 56: the toggle shows the STORED effects flag, not useMotionEnabled() (which ANDs in
  // OS reduced-motion — so the row used to read "off" for a user who never turned it off).
  const [animOn, setAnimOn] = useState(readEffectsOn)
  const osReduced = usePrefersReducedMotion()
  const grain = useGrain()

  return (
    <SCard tapeTint="color-mix(in oklch, var(--acc-sage) 40%, transparent)">
      <div style={{ ...flabel, marginBottom: 4 }}>Appearance · the garden's light</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Theme</div>
          <div style={fhelp}>auto follows the OS · night garden after dark</div>
        </div>
        <Seg<ThemeMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'auto', label: 'Auto' },
          ]}
        />
      </div>
      {/* R4 (Kai 2026-07-20): "things look most natural [at] 110% but everything feels small."
          Labelled in the same percentages he used, so the control speaks his language. */}
      {/* Wraps under its label when the five sizes don't fit beside it (Kai 2026-10-03: at 150% they
          ran off the card and the whole page scrolled sideways); wrapped, they share the full row. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Interface size</div>
          {/* Polish F2b: the default is per device (125% on a computer, 100% on a phone or a
              touch-first screen), so the caption names this device's own normal. */}
          <div style={fhelp}>scales the whole app · {Math.round(defaultUiScale(readUiScaleEnv()) * 100)}% is this device's normal</div>
        </div>
        <div style={{ flex: '1 1 300px', maxWidth: 400 }}>
          <Seg<UiScale>
            fill
            value={scale}
            onChange={setScale}
            options={UI_SCALES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div style={{ flex: 'none' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Paper texture</div>
          <div style={fhelp}>the grain over everything · {grain.pct}%</div>
        </div>
        <HairlineSlider ariaLabel="Paper texture" value={grain.pct} onChange={grain.set} style={{ flex: 1, maxWidth: 240 }} />
        <div style={{ width: 64, height: 44, flex: 'none', border: '1px solid var(--line-card)', borderRadius: 5, background: 'var(--paper-linen)', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: grain.pct / 100 }} />
          <img src="/ds/assets/clover/awake.png" alt="" style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', height: 22 }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Botanical animations</div>
          <div style={fhelp}>
            {osReduced ? 'your system prefers reduced motion — the garden holds still regardless' : 'petal falls, leaf sways · bows to reduced-motion'}
          </div>
        </div>
        <Toggle
          on={animOn}
          onToggle={() => {
            const next = !animOn
            setAnimOn(next)
            setEffectsEnabled(next)
          }}
        />
      </div>
      {/* Punch 55 (D-3, Kai 2026-07-26): the Accent row was four decorative swatches with no
          handler — removed for v1; a real accent picker ships in v2. */}
    </SCard>
  )
}

// Kai 2026-10-03: the view the calendar opens on, synced (app_settings.calendar_default_view) so
// the computer and the phone agree. Until one is picked the row shows this device's own default.
function CalendarViewSeg({ platformDefault }: { platformDefault: CalendarDefaultView }) {
  const view = useCalendarDefaultView(platformDefault)
  return (
    <Seg<CalendarDefaultView>
      value={view ?? platformDefault}
      onChange={(v) => updateAppSetting('calendar_default_view', v)}
      options={[
        { value: 'day', label: 'Day' },
        { value: '3day', label: '3 days' },
        { value: 'week', label: 'Week' },
      ]}
    />
  )
}

function CalendarCard() {
  return (
    <SCard tapeTint="color-mix(in oklch, var(--acc-lavender) 40%, transparent)">
      <div style={{ ...flabel, marginBottom: 4 }}>Calendar</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0 2px' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Opens on</div>
          <div style={fhelp}>on every device · the toolbar still switches it any time</div>
        </div>
        <CalendarViewSeg platformDefault="week" />
      </div>
    </SCard>
  )
}

// Kai 2026-10-03: "Check for updates" — one button for the web app, the Android app and the
// Windows app (lib/appUpdate.ts says how each one checks).
function AppUpdateCard() {
  const platform = appPlatform()
  const stamp = buildStamp()
  const [installed, setInstalled] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'checking' | UpdateResult>('idle')
  useEffect(() => {
    if (platform !== 'web') void installedVersion(platform).then(setInstalled)
  }, [platform])
  const built = stamp ? new Date(stamp.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }) : null
  const current = platform === 'web' ? (stamp ? `build ${stamp.commit.slice(0, 7)}` : 'development build') : installed ? `v${installed.replace(/^v/, '')}` : 'version unknown'
  const r = typeof state === 'object' ? state : null
  const file = platform === 'android' ? 'APK' : 'installer'
  const line =
    !r ? null
    : r.kind === 'reload' ? 'A new version is ready'
    : r.kind === 'download' ? `${r.version} is out`
    : r.kind === 'pending' ? `${r.version} is out — its ${file} is still on its way, try again in a few minutes`
    : r.kind === 'current' ? `You're on the latest (${r.version ?? current})`
    : r.kind === 'dev' ? 'This is a development build — nothing to compare it with'
    : 'Couldn’t reach the update check — look at the connection and try again'
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>App · Kai's Flow</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          disabled={state === 'checking'}
          onClick={() => {
            setState('checking')
            void checkForUpdate(platform).then(setState)
          }}
        >
          {state === 'checking' ? 'Checking…' : 'Check for updates'}
        </Button>
        {line && <span role="status" style={{ fontSize: 13, color: r?.kind === 'offline' ? 'var(--ink-muted)' : 'var(--ink-body)' }}>{line}</span>}
        {r?.kind === 'reload' && <Button variant="cta" onClick={() => void reloadToUpdate()}>Reload</Button>}
        {r?.kind === 'download' && <Button variant="cta" onClick={() => openDownload(r.url)}>Download</Button>}
      </div>
      <div style={fhelp}>{current}{built ? ` · built ${built}` : ''}</div>
    </SCard>
  )
}

function TimezoneCard() {
  const { data: settings } = useAppSettings()
  const [custom, setCustom] = useState('')
  if (!settings) return null
  const tz = settings.timezone

  function apply(next: string) {
    if (!next) return
    updateAppSetting('timezone', next)
  }

  return (
    <SCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={flabel}>Timezone</div>
        <span style={{ ...chip, background: 'color-mix(in oklch, var(--acc-sage) 18%, transparent)', color: 'var(--acc-sage-text)' }}>saved ✓</span>
      </div>
      <p style={{ margin: '6px 0 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }}>
        Used everywhere the app needs to know "what day is it" — due dates, routine checks, the daily summary. Stored in UTC, converted at the edges.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ ...flabel, fontSize: 'var(--fs-meta)', marginBottom: 6, color: 'var(--ink-hairline)' }}>Common timezones</div>
          <Select value={tz} onChange={apply} ariaLabel="Common timezones" options={COMMON_TIMEZONES.map((z) => ({ value: z, label: z }))} style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)' }} />
        </div>
        <div>
          <div style={{ ...flabel, fontSize: 'var(--fs-meta)', marginBottom: 6, color: 'var(--ink-hairline)' }}>Or custom IANA name</div>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { apply(custom.trim()); setCustom('') }
            }}
            placeholder="e.g. Europe/Berlin"
            style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)', fontStyle: custom ? 'normal' : 'italic', fontFamily: 'inherit' }}
          />
        </div>
      </div>
      <div style={fhelp}>current · {tz} · {new Date().toLocaleTimeString('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).split(' ').pop()}</div>
    </SCard>
  )
}

const TONE_DOT = { ok: 'var(--acc-sage)', bad: 'var(--acc-terra)', off: 'var(--line-solid)' } as const

function IntegrationsSummaryCard({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { data: integrations = [] } = useIntegrations()
  const gh = githubState(integrations.find((i) => i.provider === 'github'))
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Integrations</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE_DOT[gh.tone], flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>GitHub · issues → inbox</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...chip, border: '1px solid var(--line-solid)', color: gh.tone === 'bad' ? 'var(--acc-terra)' : 'var(--ink-muted)' }}>{gh.text}</span>
      </div>
      {/* Google Calendar sync is a later integrations wave — nothing syncs yet, so no button. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line-solid)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Google Calendar · sync</span>
        <span style={{ flex: 1 }} />
        <SoonChip label="Coming soon" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line-solid)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Groq · chat + parse</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onOpenIntegrations}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}
        >
          open integrations status →
        </button>
      </div>
    </SCard>
  )
}

// Ritual reminders, synced per account (app_settings, 0045): notify's 15-minute cron sends each one
// at the user's own time (supabase/functions/notify/ritual.ts). Cairo time until per-user timezones.
const RITUALS = [
  { kind: 'morning_digest', label: 'Morning digest', help: 'your Top 3 and anything slipping', at: '08:00' },
  { kind: 'evening_nudge', label: 'Evening nudge', help: 'only when a routine was missed', at: '21:00' },
] as const

function RitualReminders() {
  const { data: s } = useAppSettings()
  if (!s) return null
  return (
    <>
      {RITUALS.map((r) => {
        const on = s[`${r.kind}_on` as const] !== false
        return (
          <div key={r.kind} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{r.label}</div>
              <div style={fhelp}>{r.help}</div>
            </div>
            <TimeField
              value={(s[`${r.kind}_at` as const] ?? r.at).slice(0, 5)}
              ariaLabel={`${r.label} time`}
              onChange={(v) => v && updateAppSetting(`${r.kind}_at` as const, v)}
              style={{ width: 96, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '8px 12px', opacity: on ? 1 : 0.5 }}
            />
            <Toggle on={on} onToggle={() => updateAppSetting(`${r.kind}_on` as const, !on)} />
          </div>
        )
      })}
      <div style={fhelp}>Cairo time · a nudge, never a lock</div>
    </>
  )
}

function PushCard() {
  const { data: subs = [] } = useMyPushSubscriptions()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const supported = isPushSupported()
  const thisDeviceLabel = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : ''
  const subscribed = subs.some((s) => s.device_label === thisDeviceLabel)

  async function handleToggle() {
    setBusy(true)
    setMessage(null)
    try {
      if (subscribed) {
        await unsubscribeThisDevice()
        setMessage('Unsubscribed this device.')
      } else {
        await subscribeThisDevice()
        setMessage('Subscribed! You should get pushes on this device now.')
      }
    } catch {
      // House rule: raw e.message can carry the word "error" / server text — calm copy only.
      setMessage("That didn't take — check the connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendTestNotification()
      setMessage(`Sent to ${result.sent} device(s), pruned ${result.pruned} dead subscription(s).`)
    } catch {
      setMessage("The test push didn't go out — try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Notifications · push</div>
      {!supported ? (
        <p style={{ fontSize: 13.5, color: 'var(--acc-terra)', margin: 0 }}>
          Not supported on this browser. On iPhone, install this app to your home screen first (Share → Add to Home Screen) — Safari tabs can't receive push, only installed PWAs can.
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>{subs.length} device{subs.length === 1 ? '' : 's'} subscribed</span>
          {subs.map((s) => (
            <span key={s.id} style={{ ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>
              {s.device_label === thisDeviceLabel ? 'this device ✓' : (s.device_label ?? 'device').slice(0, 20)}
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={handleToggle} disabled={busy} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
          </button>
          <button type="button" onClick={handleTest} disabled={busy} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            Send test push
          </button>
        </div>
      )}
      {message && <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '10px 0 0' }}>{message}</p>}
      <div style={{ marginTop: 14, paddingTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>
        <RitualReminders />
      </div>
      <div style={fhelp}>iphone: install to home screen first (share → add to home screen) — safari tabs can't receive push</div>
    </SCard>
  )
}

// ── Resurfacing cooldowns (punch 21, Kai's spec: high ~2d / medium ~5d / low ~10d, tunable).
// Today's resurfacing engine reads exactly these keys; the values are per-device prefs like
// theme/scale, so localStorage is the right home until MIG-1 adds the server fields. ──
const COOLDOWN_KEYS = { high: 'kf.resurfaceCooldown.high', med: 'kf.resurfaceCooldown.med', low: 'kf.resurfaceCooldown.low' } as const
const COOLDOWN_DEFAULTS = { high: 2, med: 5, low: 10 } as const

function readCooldown(level: keyof typeof COOLDOWN_KEYS): number {
  try {
    const n = Number(localStorage.getItem(COOLDOWN_KEYS[level]))
    if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.round(n)
  } catch {
    /* private mode */
  }
  return COOLDOWN_DEFAULTS[level]
}

function ResurfacingCard() {
  const [days, setDays] = useState(() => ({ high: readCooldown('high'), med: readCooldown('med'), low: readCooldown('low') }))
  function set(level: keyof typeof COOLDOWN_KEYS, value: number) {
    setDays((prev) => ({ ...prev, [level]: value }))
    try {
      localStorage.setItem(COOLDOWN_KEYS[level], String(value))
    } catch {
      /* session-only is fine */
    }
  }
  const row = (level: keyof typeof COOLDOWN_KEYS, label: string, help: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '12px 0', borderBottom: level === 'low' ? 'none' : '1px dashed var(--line-dashed)' }}>
      <div style={{ flex: 'none' }}>
        <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{label}</div>
        <div style={fhelp}>{help}</div>
      </div>
      <HairlineSlider ariaLabel={`${label} cooldown in days`} value={days[level]} min={1} max={30} onChange={(v) => set(level, v)} style={{ flex: 1, maxWidth: 200 }} />
      <div style={{ width: 74, flex: 'none', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>
        rests {days[level]} {days[level] === 1 ? 'day' : 'days'}
      </div>
    </div>
  )
  return (
    <SCard tapeTint="color-mix(in oklch, var(--acc-buttercream) 40%, transparent)" style={{ scrollMarginTop: 24 }}>
      <div style={{ ...flabel, marginBottom: 4 }}>Resurfacing · how long "Later" rests</div>
      {row('high', 'High priority', 'comes back soonest')}
      {row('med', 'Medium priority', 'a working week, roughly')}
      {row('low', 'Low priority', 'the long shelf')}
      <div style={{ marginTop: 10, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)' }}>
        press Later and it goes quiet — then wanders back ✿
      </div>
    </SCard>
  )
}

// P-IMPORT entry card — Settings.dc.html 2a Integrations-card language.
function ImportCard() {
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Import data · bring your life in</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>One-time import from Akiflow or a CSV file.</span>
        <span style={{ flex: 1 }} />
        <Link to="/settings/import" style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 15px', borderRadius: 999, textDecoration: 'none' }}>Open importer</Link>
      </div>
      <div style={fhelp}>parsed on this device · re-importing the same file never duplicates</div>
    </SCard>
  )
}

// Punch 50: Trash had no entry point anywhere — it was URL-only. Its own header already reads
// "Kai's Flow · Settings · Trash", so this is where the design says it hangs.
function TrashCard() {
  const { data: deletedItems = [] } = useDeletedItems()
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Trash · the compost heap</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>
          {deletedItems.length === 0 ? 'Nothing resting right now.' : `${deletedItems.length} item${deletedItems.length === 1 ? '' : 's'} resting.`}
        </span>
        <span style={{ flex: 1 }} />
        <Link to="/trash" style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 15px', borderRadius: 999, textDecoration: 'none' }}>Open trash</Link>
      </div>
      <div style={fhelp}>deleted tasks, inbox items, events, journal entries, projects and areas · composts after 30 days</div>
    </SCard>
  )
}

function ProfileCard() {
  const email = (() => {
    try {
      const raw = localStorage.getItem('kf.lastEmail')
      return raw ?? ''
    } catch {
      return ''
    }
  })()
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Profile</div>
      <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{email || 'signed in'}</div>
      <div style={fhelp}>one person, one garden — no team settings here</div>
      {/* WA-1 punch 3: quiet re-entry to the first-run wizard (name / workspace / seed). */}
      <Link to="/onboarding?replant=1" style={{ display: 'inline-block', marginTop: 12, fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', textDecoration: 'none', transform: 'rotate(-0.5deg)' }}>
        Replant your garden — rerun the welcome →
      </Link>
    </SCard>
  )
}

function ProviderRow({ icon, name, desc, status, children }: { icon: ReactNode; name: string; desc: string; status: ReactNode; children?: ReactNode }) {
  return (
    <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        {icon}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-body)' }}>{name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{desc}</div>
        </div>
        {status}
      </div>
      {children}
    </SCard>
  )
}

function GithubGlyph({ dim }: { dim?: boolean }) {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--ink-body)', color: 'var(--paper-parchment)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', opacity: dim ? 0.75 : 1 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.6 2 12.3c0 4.6 2.9 8.4 6.8 9.8.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 4-2.4 4.8-4.6 5.1.4.3.7 1 .7 1.9v2.8c0 .3.2.6.7.5a10.2 10.2 0 0 0 6.8-9.8C22 6.6 17.5 2 12 2Z" /></svg>
    </span>
  )
}

// P6 step 7: the personal capture key (features/settings/captureKey.ts, function `capture`).
function CaptureKeyCard() {
  const { data: row } = useCaptureKey()
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' })
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try { await fn() } catch { setErr('That didn’t save — check the connection and try again.') } finally { setBusy(false) }
  }
  const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--ink-muted)', wordBreak: 'break-all' }
  const box: CSSProperties = { marginTop: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '9px 12px' }
  return (
    <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>External capture endpoint</div>
      {!row && !shown && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>not set up yet</div>}
      {row && !shown && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-muted)' }}>
          key made {day(row.updated_at)} · {row.last_used_at ? `last used ${day(row.last_used_at)}` : 'not used yet'}
        </div>
      )}
      {shown && (
        <>
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-body)' }}>Your capture key — copy it now, it won’t be shown again:</div>
          <div style={{ ...box, ...mono, color: 'var(--ink-body)' }}>{shown}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(shown)}>Copy key</Button>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(bookmarklet(shown))}>Copy bookmarklet</Button>
          </div>
          <div style={{ ...box, ...mono }}>
            POST {CAPTURE_URL}
            <br />Authorization: Bearer {'<key>'}
            <br />{'{"text": "call the supplier", "url": "https://…"}'}
          </div>
          <div style={fhelp}>bookmarklet: make a new bookmark and paste it as the address · it sends the selected text, or the page</div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => setShown(await createCaptureKey()))}>
          {row || shown ? 'New key' : 'Create key'}
        </Button>
        {row && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await deleteCaptureKey(row.id); setShown(null) })}>
            Turn off
          </Button>
        )}
      </div>
      {err && <div style={{ ...fhelp, color: 'var(--acc-terra)' }}>{err}</div>}
      <div style={fhelp}>anything POSTed here lands in your inbox · a new key stops the old one</div>
    </SCard>
  )
}

const fieldInput: CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)', fontFamily: 'inherit' }

// P6 step 1: GitHub issues → inbox. The PAT lives only in this input until it is posted to the
// github-connect edge function; afterwards the client only ever sees login/status/synced_at.
function GithubProvider({ github }: { github?: IntegrationStatus }) {
  const [formOpen, setFormOpen] = useState(false)
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const failing = github?.status === 'failing'

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      const { login } = await connectGithub(token.trim(), repos)
      setToken('')
      setFormOpen(false)
      return `Connected as @${login}.`
    })
  const sync = () =>
    run(async () => {
      const r = await syncGithub()
      return `Synced · ${r.fetched} open · ${r.new} new · ${r.dismissed} closed`
    })
  const disconnect = () =>
    run(async () => {
      await disconnectGithub()
      return 'Disconnected. Issues already in your inbox stay there.'
    })

  return (
    <ProviderRow
      icon={<GithubGlyph dim={!github} />}
      name="GitHub"
      desc="Open issues assigned to you, plus any repos you watch, filed as inbox letters."
      status={
        github ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', flex: 'none', maxWidth: '45%' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: failing ? 'var(--acc-terra)' : 'var(--acc-sage)', flex: 'none' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: failing ? 'var(--acc-terra)' : 'var(--ink-muted)', textAlign: 'right' }}>
              {failing ? '' : `@${github.login ?? '?'} · `}{githubState(github).text}
            </span>
          </div>
        ) : (
          !formOpen && <Button type="button" variant="secondary" onClick={() => setFormOpen(true)}>Connect</Button>
        )
      }
    >
      {github && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {failing ? (
            !formOpen && <Button type="button" variant="secondary" onClick={() => setFormOpen(true)}>Reconnect</Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void sync()} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy}>Disconnect</Button>
        </div>
      )}
      {formOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void connect()
          }}
          style={{ display: 'grid', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}
        >
          <label>
            <div style={{ ...flabel, marginBottom: 6 }}>Fine-grained access token</div>
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" style={fieldInput} />
            <div style={fhelp}>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Create one on GitHub</a> — pick the repos it can see, set Issues to read-only (Metadata comes with it), and paste it here.
            </div>
          </label>
          <label>
            <div style={{ ...flabel, marginBottom: 6 }}>Watched repos · optional</div>
            <input value={repos} onChange={(e) => setRepos(e.target.value)} placeholder="owner/repo, owner/other" style={fieldInput} />
            <div style={fhelp}>all their open issues come in too · issues assigned to you always do</div>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="cta" disabled={busy || !token.trim()}>{busy ? 'Connecting…' : 'Connect'}</Button>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {message && <div role="status" style={{ ...fhelp, fontSize: 'var(--fs-meta-l)', color: 'var(--ink-muted)' }}>{message}</div>}
    </ProviderRow>
  )
}

function IntegrationsPage() {
  const { data: integrations = [] } = useIntegrations()
  const github = integrations.find((i) => i.provider === 'github')

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 500, color: 'var(--ink-body)' }}>Integrations</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-muted)' }}>Everything that feeds the inbox, and the rules it follows.</p>
      </div>

      <GithubProvider github={github} />

      <ProviderRow
        icon={
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.7" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" /></svg>
          </span>
        }
        name="Google Calendar"
        desc="Planned: a quiet sync underneath our own calendar. Not built yet — nothing syncs."
        status={<SoonChip label="Coming soon" />}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={flabel}>Capture from anywhere</span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CaptureKeyCard />
        <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <svg width="20" height="30" viewBox="0 0 20 32" style={{ flex: 'none' }}><rect x="1" y="1" width="18" height="30" rx="4" fill="none" stroke="var(--ink-faint)" strokeWidth="1.6" /><circle cx="10" cy="26.5" r="1.6" fill="var(--ink-faint)" /></svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>Share target</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.5 }}>Share to Kai's Flow from any app on your phone — links, screenshots, half-thoughts.</div>
            </div>
          </div>
          <div style={{ ...fhelp, marginTop: 9 }}>appears in the share sheet once the app is installed</div>
        </SCard>
      </div>
    </div>
  )
}

// Settings.dc.html 3a — master row with the whisper↔full meter, six sounds each with a
// working preview, quiet hours. Kai un-cut Sounds on 2026-07-26; the voices are synthesised
// in lib/sounds.ts (no audio files — $0 and weightless).
export function SoundCatalogCard() {
  const [sounds, setSounds] = useState(readSoundCatalog)
  const [volume, setVolume] = useState(readVolume)
  const [quiet, setQuiet] = useState(readQuietHours)
  const masterOn = volume > 0

  function toggleSound(id: SoundId, on: boolean) {
    const next = { ...sounds, [id]: on }
    setSounds(next)
    writeSoundCatalog(next)
    if (on) previewSound(id) // turning one on should let you hear what you just agreed to
  }
  function setVol(v: number) {
    setVolume(v)
    writeVolume(v)
  }

  return (
    <SCard tapeTint="color-mix(in oklch, var(--acc-hydrangea) 40%, transparent)" style={{ scrollMarginTop: 24 }}>
      <div style={{ ...flabel, marginBottom: 4 }}>Sound · the garden's voice</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div style={{ flex: 'none' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Sound</div>
          <div style={fhelp}>quiet, papery, never musical</div>
        </div>
        {/* The design's whisper↔full meter: three bars that fill with the volume. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginLeft: 'auto' }}>
          <span style={{ ...flabel, fontSize: 'var(--fs-meta)' }}>whisper</span>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 16 }}>
            {[0.34, 0.67, 1].map((step, i) => (
              <button
                key={step}
                type="button"
                aria-label={`Volume ${i + 1} of 3`}
                onClick={() => {
                  setVol(step)
                  previewSound('paper_rustle')
                }}
                style={{
                  width: 5, height: 6 + i * 5, padding: 0, border: 'none', borderRadius: 1, cursor: 'pointer',
                  background: volume >= step - 0.01 ? 'var(--acc-sage)' : 'var(--line-solid)',
                }}
              />
            ))}
          </span>
          <span style={{ ...flabel, fontSize: 'var(--fs-meta)' }}>full</span>
          <Toggle on={masterOn} onToggle={() => setVol(masterOn ? 0 : DEFAULT_VOLUME)} />
        </div>
      </div>
      {SOUND_CATALOG.map((s) => {
        const on = sounds[s.id as SoundId] ?? s.defaultOn
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '1px dashed var(--line-dashed)', opacity: masterOn && on ? 1 : 0.6 }}>
            <button
              type="button"
              aria-label={`Preview ${s.label}`}
              title={`Preview ${s.label}`}
              onClick={() => previewSound(s.id as SoundId)}
              style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line-solid)', background: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
            >
              <svg width="9" height="10" viewBox="0 0 12 14"><path d="M1.5 1.2 11 7l-9.5 5.8V1.2Z" fill="var(--ink-muted)" /></svg>
            </button>
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-body)', width: 120, flex: 'none' }}>{s.label}</span>
            <span style={{ ...flabel, fontSize: 'var(--fs-meta)', flex: 1 }}>{s.help}</span>
            <Toggle on={on} onToggle={() => toggleSound(s.id as SoundId, !on)} />
          </div>
        )
      })}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="12" height="12" viewBox="0 0 24 24"><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--ink-hairline)" /></svg>
        <span style={{ ...fhelp, marginTop: 0, flex: 1 }}>The garden is silent after you close it.</span>
        <Toggle
          on={quiet}
          onToggle={() => {
            setQuiet(!quiet)
            writeQuietHours(!quiet)
          }}
        />
      </div>
    </SCard>
  )
}

// The capture endpoint's key card lives on the Integrations page, so it has no row of its own.
// 'Sound' returned when Kai un-cut it (2026-07-26); 'Resurfacing' is the cooldown card
// (punch 21); 'Trash' is punch 50's entry point.
const SUBNAV_ITEMS = ['Appearance', 'Sound', 'Calendar', 'Resurfacing', 'Timezone', 'Integrations', 'Notifications', 'Trash', 'Profile', 'App'] as const
type SubnavItem = (typeof SUBNAV_ITEMS)[number]

function DesktopSettings() {
  const [active, setActive] = useState<SubnavItem>('Appearance')

  function go(item: SubnavItem) {
    setActive(item)
    if (item !== 'Integrations') {
      document.getElementById(`settings-${item}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
      <div style={{ width: 200, flex: 'none', borderRight: '1px dashed var(--line-solid)', padding: '28px 18px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 26, filter: 'var(--shadow-drop-sm)' }} />
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 500, color: 'var(--ink-body)' }}>Settings</h2>
        </div>
        {SUBNAV_ITEMS.map((item) => {
          const on = active === item
          return (
            <div
              key={item}
              onClick={() => go(item)}
              style={{
                fontSize: 13.5, color: on ? 'var(--ink-body)' : 'var(--ink-muted)', padding: '8px 11px', borderRadius: 6, cursor: 'pointer',
                background: on ? 'var(--paper-parchment)' : 'none',
                border: on ? '1px solid var(--line-card)' : '1px solid transparent',
                boxShadow: on ? 'var(--shadow-crisp)' : 'none',
                fontWeight: on ? 600 : 400,
              }}
            >
              {item}
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1.2deg)', padding: '0 4px' }}>
          {active === 'Integrations' ? "the garden's irrigation ✿" : "where the garden's light gets tuned ✿"}
        </div>
      </div>

      {/* Kai 2026-10-03: no scroller of its own. Its height was never bounded (the route grows with
          the page — index.css .kf-route), so it never scrolled; it only swallowed the wheel (an
          overflow-y:auto box gets overscroll-behavior: contain) and the page behind it, the one real
          scroller (.app-main-content), stood still unless the pointer was over the left nav. */}
      <div style={{ flex: 1, minWidth: 0, padding: '30px 36px 44px', maxWidth: active === 'Integrations' ? 780 : 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {active === 'Integrations' ? (
          <IntegrationsPage />
        ) : (
          <>
            <div id="settings-Appearance"><AppearanceCard /></div>
            {/* Sounds un-cut by Kai 2026-07-26 — now a real synthesised layer (lib/sounds.ts). */}
            <div id="settings-Sound"><SoundCatalogCard /></div>
            <div id="settings-Calendar"><CalendarCard /></div>
            <div id="settings-Timezone"><TimezoneCard /></div>
            <IntegrationsSummaryCard onOpenIntegrations={() => go('Integrations')} />
            <div id="settings-Notifications"><PushCard /></div>
            <div id="settings-Resurfacing"><ResurfacingCard /></div>
            <ImportCard />
            <div id="settings-Trash"><TrashCard /></div>
            <div id="settings-Profile"><ProfileCard /></div>
            <div id="settings-App"><AppUpdateCard /></div>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-0.8deg)', padding: '0 4px' }}>
              everything saves as you touch it — the SAVED chip just says so ✿
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MobileSettings() {
  const { data: integrations = [] } = useIntegrations()
  const { data: settings } = useAppSettings()
  const { data: subs = [] } = useMyPushSubscriptions()
  const { data: deletedItems = [] } = useDeletedItems()
  const github = integrations.find((i) => i.provider === 'github')
  const { mode, setMode } = useThemeMode()
  // Final polish (2026-09-26): the phone's Appearance card drew a static 60% "slider" and had no
  // Interface size at all. Both now drive the same prefs as the desktop card.
  const scale = useUiScale((st) => st.scale)
  const setScale = useUiScale((st) => st.setScale)
  const grain = useGrain()

  const rows: { label: string; value: ReactNode; to?: string }[] = [
    { label: 'Timezone', value: settings?.timezone ?? '—' },
    { label: 'Google Calendar', value: 'Coming soon' },
    { label: 'GitHub', value: githubState(github).text },
    { label: 'Notifications', value: `${subs.length} device${subs.length === 1 ? '' : 's'}` },
    { label: 'Capture API', value: 'not set up' },
    // Punch 50: the phone's only way into Trash.
    { label: 'Trash', value: `${deletedItems.length} resting`, to: '/trash' },
  ]

  return (
    <div style={{ padding: '8px 4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 34, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: 'var(--ink-body)' }}>Settings</div>
      </div>

      <SCard style={{ marginTop: 16, boxShadow: 'var(--shadow-crisp)' }}>
        <div style={{ ...flabel, marginBottom: 10 }}>Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>Theme</span>
          <Seg<ThemeMode> value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]} />
        </div>
        {/* Five sizes don't fit beside the label at 390px — the control gets its own line. */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, color: 'var(--ink-body)', marginBottom: 8 }}>Interface size</div>
          <Seg<UiScale> fill value={scale} onChange={setScale} options={UI_SCALES.map((sc) => ({ value: sc, label: `${Math.round(sc * 100)}` }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 'none' }}>Paper texture</span>
          <HairlineSlider ariaLabel="Paper texture" value={grain.pct} onChange={grain.set} style={{ flex: 1, maxWidth: 160 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 'none' }}>Calendar opens on</span>
          <CalendarViewSeg platformDefault="day" />
        </div>
      </SCard>

      <div style={{ marginTop: 12 }}>
        <AppUpdateCard />
      </div>

      <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 8, boxShadow: 'var(--shadow-crisp)', marginTop: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          // Only a row that actually goes somewhere is a link and shows the chevron; the rest are
          // read-outs (a chevron on a dead row promised a tap that did nothing).
          const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', minHeight: 44, boxSizing: 'border-box' as const, borderBottom: i === rows.length - 1 ? 'none' : '1px dashed var(--line-dashed)', color: 'inherit', textDecoration: 'none' }
          const inner = (
            <>
              <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>{r.value}</span>
              {r.to && <span style={{ color: 'var(--ink-hairline)', fontSize: 11 }}>›</span>}
            </>
          )
          return r.to ? <Link key={r.label} to={r.to} style={rowStyle}>{inner}</Link> : <div key={r.label} style={rowStyle}>{inner}</div>
        })}
      </div>

      {/* The phone is where the pushes land, so its reminder times live here too. */}
      <SCard style={{ marginTop: 12, boxShadow: 'var(--shadow-crisp)' }}>
        <div style={{ ...flabel, marginBottom: 2 }}>Ritual reminders</div>
        <RitualReminders />
      </SCard>

      {/* P6: the phone has no Integrations page, so the GitHub row (connect / sync) sits here. */}
      <div style={{ marginTop: 12 }}>
        <GithubProvider github={github} />
      </div>

      <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-0.8deg)' }}>everything saves as you touch it ✿</div>
    </div>
  )
}

export function SettingsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileSettings /> : <DesktopSettings />
}
