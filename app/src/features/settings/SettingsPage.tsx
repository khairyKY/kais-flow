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
import { appPlatform, buildStamp, installedVersion, openDownload, reloadToUpdate } from '../../lib/appUpdate'
import { BUNDLED_VERSION, useWhatsNew } from '../../lib/whatsNew'
import { checkForUpdates } from '../whats-new/check'
import { UpdateNotes } from '../whats-new/WhatsNew'
import { restartTour } from '../tour/help'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../../lib/theme'
import { useUiScale, UI_SCALES, defaultUiScale, readUiScaleEnv, type UiScale } from '../../lib/uiScale'
import { usePrefersReducedMotion, setEffectsEnabled } from '../../lib/motion'
import { readSoundEvents, writeSoundEvents, readSoundPack, writeSoundPack, readVolume, writeVolume, readQuietHours, writeQuietHours, previewSound, DEFAULT_VOLUME, PACKS, SOUND_PACKS, type SoundEvent, type SoundPack } from '../../lib/sounds'
import { useIntegrations, connectGithub, syncGithub, disconnectGithub, githubState, type IntegrationStatus } from './api'
import { useCaptureKey, createCaptureKey, deleteCaptureKey, bookmarklet, curlRecipe, CAPTURE_URL } from './captureKey'
import { useMcpKey, createMcpKey, deleteMcpKey, claudeCodeCommand, claudeDesktopConfig, genericConfig, MCP_URL, type McpScope } from './mcpKey'
import { PaperSettingsCard } from '../paper/PaperSettings'
import { useToastStore } from '../../lib/toastStore'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { KindGlyph } from '../notifications/KindGlyph'
import { KIND_IDS, KIND_LOOK } from '../notifications/kinds'
import { showLocal } from '../notifications/local'
import { QUIET_FROM, QUIET_TO, testNotice } from '../../../../supabase/functions/notify/copy.ts'
import { isTauri, native, readTrayShown, writeTrayShown } from '../tray/native'
import { TimeField } from '../calendar/TimeField'
import { useDeletedItems } from '../trash/api'
import { appZone, deviceZone, isZone, searchZones, zoneCity } from '../../lib/appZone'
import { parseWeekend, weekendLabel, weekendPreset, WEEKEND_PRESETS } from '../../lib/weekend'
import { planGlossary } from '../tasks/planMath'
import { DomainsSettings } from '../domains/DomainList'

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

function Toggle({ on, onToggle, label }: { on: boolean; onToggle?: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={!onToggle}
      style={{ width: 34, height: 20, borderRadius: 999, background: on ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', border: 'none', cursor: onToggle ? 'pointer' : 'default', padding: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left var(--dur-quick) var(--ease-out)' }} />
    </button>
  )
}

function Seg<T extends string | number>({ value, onChange, options, fill = false, minHeight }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; fill?: boolean; minHeight?: number }) {
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
              padding: fill ? '6px 2px' : '6px 13px', flex: fill ? '1 1 0' : undefined, minWidth: 0, minHeight, borderRadius: 5, fontSize: 12, lineHeight: 1.2, whiteSpace: fill ? 'normal' : 'nowrap', // a filled row wraps a long label instead of overlapping its neighbour (Weekend at 150%) border: 'none', cursor: 'pointer', font: 'inherit',
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

// ── Sound (v2, Kai 2026-10-07): one row per event that really plays, in the order a day meets them. ──
const SOUND_ROWS: { id: SoundEvent; label: string; help: string }[] = [
  { id: 'complete', label: 'Task done', help: 'a soft tock as you check one off' },
  { id: 'complete_big', label: 'Goal done', help: 'the Goal of the day, or the last of your Top 3' },
  { id: 'capture', label: 'Captured', help: 'saved from the capture bar' },
  { id: 'focus_start', label: 'Focus begins', help: 'a fresh round starts' },
  { id: 'focus_end', label: 'Focus ends', help: 'the round is over, heard across the room' },
  { id: 'ritual_done', label: 'Ritual', help: 'Start the day · Goodnight' },
  { id: 'undo', label: 'Undo', help: 'a tiny step back' },
]


// (the old local sound store lived here — superseded by lib/sounds.ts)

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
function CalendarViewSeg({ platformDefault, fill }: { platformDefault: CalendarDefaultView; fill?: boolean }) {
  const view = useCalendarDefaultView(platformDefault)
  return (
    <Seg<CalendarDefaultView>
      fill={fill}
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

function CalendarCard({ phone = false }: { phone?: boolean }) {
  return (
    <SCard tapeTint="color-mix(in oklch, var(--acc-lavender) 40%, transparent)" style={phone ? { boxShadow: 'var(--shadow-crisp)' } : undefined}>
      <div style={{ ...flabel, marginBottom: 4 }}>Calendar</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, padding: '12px 0 2px' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Opens on</div>
          <div style={fhelp}>on every device · the toolbar still switches it any time</div>
        </div>
        {/* phone-polish: beside its label the three views ran past the card at 360 — fill wraps it to its own line. */}
        <CalendarViewSeg platformDefault={phone ? 'day' : 'week'} fill={phone} />
      </div>
      <WeekendSetting phone={phone} />
      <PlanGlossary />
    </SCard>
  )
}

// Kai 2026-10-07: "My weekend is Friday and Saturday… Don't force people to be someone they're not."
// app_settings.weekend_days (lib/weekend) — what the Plan menu's "This weekend" lands on.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function WeekendSetting({ phone }: { phone: boolean }) {
  const { data } = useAppSettings()
  const days = parseWeekend(data?.weekend_days)
  const preset = weekendPreset(days)
  const [customOpen, setCustomOpen] = useState(false)
  const shown = customOpen ? 'custom' : preset
  const set = (next: number[]) => updateAppSetting('weekend_days', [...next].sort((a, b) => a - b))
  const h = phone ? 48 : undefined // phone targets ≥ 48px
  return (
    <div style={{ padding: '14px 0 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Weekend</div>
          <div style={fhelp}>“This weekend” lands on its first day · {weekendLabel(days)}</div>
        </div>
        {/* Its own full-width line everywhere: beside the label, four options ran past the card at 150%. */}
        <div style={{ width: '100%' }}>
          <Seg<string>
            fill
            minHeight={h}
            value={shown}
            onChange={(v) => {
              setCustomOpen(v === 'custom')
              const p = WEEKEND_PRESETS.find((x) => x.key === v)
              if (p) set([...p.days])
            }}
            options={[...WEEKEND_PRESETS.map((p) => ({ value: p.key as string, label: p.label })), { value: 'custom', label: 'Custom' }]}
          />
        </div>
      </div>
      {shown === 'custom' && (
        // One row of seven: on a 390 phone the card has ~310px, so each day is ~44 wide and 48 tall.
        <div role="group" aria-label="Weekend days" style={{ display: phone ? 'grid' : 'flex', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 10 }}>
          {WEEKDAY_SHORT.map((label, d) => {
            const on = days.includes(d)
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => set(on ? days.filter((x) => x !== d) : [...days, d])}
                style={{ minWidth: phone ? 0 : 40, minHeight: h ?? 32, padding: phone ? 0 : '0 6px', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: 'pointer', border: '1px solid var(--line-card)', background: on ? 'var(--block-lavender)' : 'var(--paper-bone)', color: on ? 'var(--acc-lavender-text)' : 'var(--ink-muted)', fontWeight: on ? 600 : 400 }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** "What the plan shortcuts mean" — the Plan menu's options in a sentence each (tasks/planMath). */
function PlanGlossary() {
  const { data } = useAppSettings()
  return (
    <div style={{ padding: '16px 0 2px' }}>
      <div style={{ fontSize: 14, color: 'var(--ink-body)', marginBottom: 6 }}>What the plan shortcuts mean</div>
      <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
        {planGlossary(parseWeekend(data?.weekend_days)).map((g) => (
          <div key={g.label} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-muted)' }}>
            <dt style={{ color: 'var(--ink-body)', fontWeight: 600 }}>{g.label}</dt>
            <dd style={{ margin: 0 }}>{g.means}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// Kai 2026-10-03: "Check for updates" — one button for the web app, the Android app and the
// Windows app (lib/appUpdate.ts says how each one checks). Kai 2026-10-07: opening Settings checks
// too, and the card shows what's in this version and what's coming (features/whats-new).
function AppUpdateCard() {
  const platform = appPlatform()
  const stamp = buildStamp()
  const uid = useAuth().session?.user.id
  const [installed, setInstalled] = useState<string | null>(null)
  const checking = useWhatsNew((s) => s.checking)
  const r = useWhatsNew((s) => s.result)
  const available = useWhatsNew((s) => s.available)
  useEffect(() => {
    if (platform !== 'web') void installedVersion(platform).then(setInstalled)
  }, [platform])
  useEffect(() => {
    void checkForUpdates(uid)
  }, [uid])
  const built = stamp ? new Date(stamp.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: appZone() }) : null
  const running = platform === 'web' || !installed ? BUNDLED_VERSION : `v${installed.replace(/^v/, '')}`
  const current = platform === 'web' ? `${BUNDLED_VERSION} · ${stamp ? `build ${stamp.commit.slice(0, 7)}` : 'development build'}` : installed ? running : 'version unknown'
  const file = platform === 'android' ? 'APK' : 'installer'
  const line =
    !r ? null
    : available ? `${available.v} is out`
    : r.kind === 'reload' ? 'A new version is ready'
    : r.kind === 'download' ? `${r.version} is out`
    : r.kind === 'pending' ? `${r.version} is out — its ${file} is still on its way, try again in a few minutes`
    : r.kind === 'current' ? `You're on the latest (${r.version ?? running})`
    : r.kind === 'dev' ? 'This is a development build — nothing to compare it with'
    : 'Couldn’t reach the update check — look at the connection and try again'
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>App · Kai's Flow</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" disabled={checking} onClick={() => void checkForUpdates(uid)}>
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
        {line && !checking && <span role="status" style={{ fontSize: 13, color: r?.kind === 'offline' ? 'var(--ink-muted)' : 'var(--ink-body)' }}>{line}</span>}
        {/* A newer release has its Update beside its notes below; this is a newer deploy of the same version. */}
        {!available && r?.kind === 'reload' && <Button variant="cta" onClick={() => void reloadToUpdate()}>Reload</Button>}
        {!available && r?.kind === 'download' && <Button variant="cta" onClick={() => openDownload(r.url)}>Download</Button>}
      </div>
      <div style={fhelp}>{current}{built ? ` · built ${built}` : ''}</div>
      {/* Tour & help (Tour and Help Guide.dc.html, "Also in Settings → App"): the notes again. */}
      <button type="button" onClick={restartTour} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, marginTop: 14, padding: '6px 0', border: 'none', borderTop: '1px dashed var(--line-dashed)', borderBottom: '1px dashed var(--line-dashed)', background: 'none', font: 'inherit', textAlign: 'start', cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--acc-terra-ink)' }}>Show me around again</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--ink-muted)' }}>Replays the notes on Today and clears seen hints</span>
        </span>
        <Icon name="chevright" size={20} style={{ color: 'var(--ink-muted)' }} />
      </button>
      <UpdateNotes running={running} />
    </SCard>
  )
}

// User time zones (2026-10-04): the zone every "what day is it" reads (lib/appZone.ts) — Today,
// "Tomorrow 09:00", due dates, routines, the morning digest and evening nudge, chat. Any IANA zone
// Intl knows, searched; this device's own zone offered first.
const zoneOffset = (z: string) => new Date().toLocaleTimeString('en-GB', { timeZone: z, timeZoneName: 'shortOffset' }).split(' ').pop()

function TimezoneCard() {
  const { data: settings } = useAppSettings()
  const [q, setQ] = useState('')
  if (!settings) return null
  const tz = settings.timezone
  const device = deviceZone()
  const matches = searchZones(q)
  const field: CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)', fontFamily: 'inherit' }
  const option: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px dashed var(--line-dashed)', padding: '9px 4px', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }

  function apply(next: string) {
    if (!isZone(next)) return
    updateAppSetting('timezone', next)
    setQ('')
  }

  return (
    <SCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={flabel}>Timezone</div>
        <span style={{ ...chip, background: 'color-mix(in oklch, var(--acc-sage) 18%, transparent)', color: 'var(--acc-sage-text)' }}>saved ✓</span>
      </div>
      <p style={{ margin: '6px 0 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }}>
        Your day runs on this clock on every device — what "today" and "tomorrow 09:00" mean, due dates, routines, the morning digest and evening nudge. Stored in UTC, converted at the edges.
      </p>
      {device !== tz && isZone(device) && (
        <button type="button" onClick={() => apply(device)} style={{ ...option, borderBottom: 'none', padding: '0 0 12px', color: 'var(--acc-sage-text)' }}>
          Use this device’s zone ({device})
        </button>
      )}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search time zones" placeholder="Search a city or region — e.g. London" style={field} />
      {matches.length > 0 && (
        <div role="listbox" aria-label="Time zones" style={{ marginTop: 6 }}>
          {matches.map((z) => (
            <button key={z} type="button" role="option" aria-selected={z === tz} onClick={() => apply(z)} style={option}>
              <span>{z.replace(/_/g, ' ')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{zoneOffset(z)}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim() && matches.length === 0 && <div style={fhelp}>no zone matches “{q.trim()}”</div>}
      <div style={fhelp}>current · {tz} · {zoneOffset(tz)}</div>
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

// Settings → Notifications (Tray and Notifications.dc.html 12i), synced per account (app_settings
// 0045 + 0048): notify reads every switch here (supabase/functions/notify/copy.ts `deliver`), and
// the app's own notices (focus done; reminders in the Windows app) follow the same rules. Times are
// wall-clock in the user's zone (Settings → Timezone). The Windows rows are this device's own.
const RITUAL_AT = { morning_digest: '08:00', evening_nudge: '21:00' } as const

function NotificationRow({ glyph, label, help, children }: { glyph: ReactNode; label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
      {glyph}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{label}</div>
        {help && <div style={{ ...fhelp, marginTop: 2 }}>{help}</div>}
      </div>
      {children}
    </div>
  )
}

const timeStyle = (on: boolean): CSSProperties => ({ width: 84, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '8px 10px', opacity: on ? 1 : 0.5 })

function NotificationsCard() {
  const { data: s } = useAppSettings()
  const { data: subs = [] } = useMyPushSubscriptions()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const tauri = isTauri()
  const [trayShown, setTrayShown] = useState(readTrayShown)
  const [autostart, setAutostart] = useState<boolean | null>(null)
  useEffect(() => {
    if (tauri) void native<boolean>('autostart_get').then((on) => setAutostart(!!on))
  }, [tauri])
  const supported = isPushSupported()
  const thisDeviceLabel = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : ''
  const subscribed = subs.some((d) => d.device_label === thisDeviceLabel)
  if (!s) return null
  const quietOn = s.quiet_hours_on !== false

  async function handleSubscribe() {
    setBusy(true)
    setMessage(null)
    try {
      if (subscribed) {
        await unsubscribeThisDevice()
        setMessage('This device won’t get notifications any more.')
      } else {
        await subscribeThisDevice()
        setMessage('This device gets notifications now.')
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
      if (tauri) {
        await showLocal(testNotice()) // the Windows app has no push; its toasts are its own
        setMessage('Sent — it should be in the corner of the screen.')
      } else {
        const result = await sendTestNotification()
        setMessage(`Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}${result.pruned ? ` · ${result.pruned} old one${result.pruned === 1 ? '' : 's'} cleared` : ''}.`)
      }
    } catch {
      setMessage("The test didn't go out — try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const pill: CSSProperties = { border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }
  const sub = (text: string) => <div style={{ ...flabel, margin: '16px 0 2px' }}>{text}</div>

  return (
    <SCard>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={flabel}>Notifications</div>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6 }}>Calm by default. Each kind can be turned off; silent ones never make a sound.</div>
        </div>
        <button type="button" onClick={handleTest} disabled={busy} style={pill}>
          <Icon name="bell" size={15} /> Send a test notification
        </button>
      </div>

      {sub('Kinds')}
      {KIND_IDS.map((kind) => {
        const k = KIND_LOOK[kind]
        const key = `${kind}_on` as const
        const on = s[key] !== false
        const ritual = kind === 'morning_digest' || kind === 'evening_nudge' ? kind : null
        return (
          <NotificationRow key={kind} glyph={<KindGlyph kind={kind} />} label={k.label} help={`${k.channel} · ${k.silent ? '○ silent' : 'sound'}`}>
            {ritual && (
              <TimeField
                value={(s[`${ritual}_at` as const] ?? RITUAL_AT[ritual]).slice(0, 5)}
                ariaLabel={`${k.label} time`}
                onChange={(v) => v && updateAppSetting(`${ritual}_at` as const, v)}
                style={timeStyle(on)}
              />
            )}
            <Toggle on={on} onToggle={() => updateAppSetting(key, !on)} />
          </NotificationRow>
        )
      })}

      {sub('Quiet')}
      <NotificationRow
        glyph={<span style={{ width: 30, display: 'flex', justifyContent: 'center', color: 'var(--ink-muted)' }}><Icon name="moon" size={18} /></span>}
        label="Quiet hours"
        help="Nothing makes a sound; the tray shows a moon"
      >
        <Toggle on={quietOn} onToggle={() => updateAppSetting('quiet_hours_on', !quietOn)} />
      </NotificationRow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 10px 42px', borderBottom: '1px dashed var(--line-dashed)' }}>
        <TimeField value={(s.quiet_from ?? QUIET_FROM).slice(0, 5)} ariaLabel="Quiet from" onChange={(v) => v && updateAppSetting('quiet_from', v)} style={timeStyle(quietOn)} />
        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>to</span>
        <TimeField value={(s.quiet_to ?? QUIET_TO).slice(0, 5)} ariaLabel="Quiet until" onChange={(v) => v && updateAppSetting('quiet_to', v)} style={timeStyle(quietOn)} />
      </div>
      <NotificationRow glyph={<span style={{ width: 30, display: 'flex', justifyContent: 'center', color: 'var(--ink-muted)' }}><Icon name="lock" size={18} /></span>} label="Show task names on the lock screen" help="Off: “Kai’s Flow · A reminder”">
        <Toggle on={s.lock_screen_names === true} onToggle={() => updateAppSetting('lock_screen_names', !s.lock_screen_names)} />
      </NotificationRow>

      {tauri ? (
        <>
          {sub('Windows')}
          <NotificationRow glyph={<span style={{ width: 30 }} />} label="Show in the system tray" help="The K by the clock, with a quick flyout">
            <Toggle
              on={trayShown}
              onToggle={() => {
                writeTrayShown(!trayShown)
                setTrayShown(!trayShown)
              }}
            />
          </NotificationRow>
          <NotificationRow glyph={<span style={{ width: 30 }} />} label="Start with Windows" help="Opens quietly to the tray">
            <Toggle on={!!autostart} onToggle={autostart === null ? undefined : () => void native<boolean>('autostart_set', { on: !autostart }).then((on) => setAutostart(!!on))} />
          </NotificationRow>
        </>
      ) : (
        <>
          {sub('This device')}
          {!supported ? (
            <p style={{ fontSize: 13.5, color: 'var(--acc-terra)', margin: '8px 0 0' }}>
              Not supported on this browser. On iPhone, install this app to your home screen first (Share → Add to Home Screen) — Safari tabs can't receive push, only installed PWAs can.
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0' }}>
              <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>{subs.length} device{subs.length === 1 ? '' : 's'} subscribed</span>
              {subs.map((d) => (
                <span key={d.id} style={{ ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>
                  {d.device_label === thisDeviceLabel ? 'this device ✓' : (d.device_label ?? 'device').slice(0, 20)}
                </span>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={handleSubscribe} disabled={busy} style={pill}>
                {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
              </button>
            </div>
          )}
        </>
      )}
      {message && <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '10px 0 0' }}>{message}</p>}
      <div style={fhelp}>{zoneCity(appZone())} time · a nudge, never a lock</div>
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
      <div style={fhelp}>deleted tasks, inbox items, events, journal entries, projects, areas and domains · composts after 30 days</div>
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
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: appZone() })
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try { await fn() } catch { setErr('That didn’t save — check the connection and try again.') } finally { setBusy(false) }
  }
  const copy = (text: string, what: string) =>
    void navigator.clipboard.writeText(text).then(
      () => useToastStore.getState().push({ message: `${what} copied` }),
      () => setErr('Couldn’t reach the clipboard — select the text and copy it by hand.'),
    )
  const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--ink-muted)', wordBreak: 'break-all' }
  const box: CSSProperties = { marginTop: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '9px 12px' }
  const how: CSSProperties = { margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }
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
            <Button variant="secondary" onClick={() => copy(shown, 'Key')}>Copy key</Button>
            <Button variant="secondary" onClick={() => copy(bookmarklet(shown), 'Bookmarklet')}>Copy bookmarklet</Button>
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
      {/* The short version of docs/CAPTURE.md. The key only ever goes in the header. */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', cursor: 'pointer', minHeight: 24 }}>How to send things here</summary>
        <div style={{ ...box, ...mono }}>
          POST {CAPTURE_URL}
          <br />Authorization: Bearer {'<your key>'}
          <br />Content-Type: application/json
          <br />{'{"text": "call the supplier", "url": "https://…"}'}
        </div>
        <div style={{ marginTop: 8 }}>
          <Button variant="secondary" onClick={() => copy(CAPTURE_URL, 'Address')}>Copy address</Button>
        </div>
        <p style={how}><b>Android share sheet</b> — nothing to set up: share text or a link to Kai’s Flow from any app.</p>
        <p style={how}><b>iPhone · Shortcuts</b> — new shortcut, show it in the Share Sheet (no input: Ask for Text) → Get Contents of URL: the address, Method POST, Headers Authorization = Bearer + your key, Request Body JSON with text = Shortcut Input.</p>
        <p style={how}><b>Android · HTTP Shortcuts or Tasker</b> — a POST to the address with the same header, content type application/json and the body above.</p>
        <p style={how}><b>Computer</b> — the bookmarklet (Copy bookmarklet, right after making a key), or curl:</p>
        <div style={{ ...box, ...mono, marginTop: 6 }}>{curlRecipe()}</div>
        <p style={how}><b>Let the AI file it</b> — add <span style={{ fontFamily: 'var(--font-mono)' }}>?file=1</span> to the address: a line like “dentist friday 3pm” becomes a task with its date when the app next opens (uses today’s AI allowance).</p>
      </details>
    </SCard>
  )
}

// AI assistants over MCP (features/settings/mcpKey.ts, function `mcp`, docs/MCP.md): the AI access
// key — the capture key's sibling, so the same shown-once flow — plus the server address and a
// ready-to-paste config per client.
function McpCard() {
  const { data: row } = useMcpKey()
  const { data: settings } = useAppSettings()
  const [scope, setScope] = useState<McpScope>('read_write')
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: settings?.timezone ?? 'Africa/Cairo' })
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try { await fn() } catch { setErr('That didn’t save — check the connection and try again.') } finally { setBusy(false) }
  }
  const copy = (text: string, what: string) =>
    void navigator.clipboard.writeText(text).then(
      () => useToastStore.getState().push({ message: `${what} copied` }),
      () => setErr('Couldn’t reach the clipboard — select the text and copy it by hand.'),
    )
  const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--ink-muted)', wordBreak: 'break-all' }
  const box: CSSProperties = { marginTop: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '9px 12px' }
  // The real key goes into the snippets only while it's on screen; otherwise a placeholder.
  const key = shown ?? undefined
  const clients = [
    { name: 'Claude Code', how: 'Run it in a terminal.', text: claudeCodeCommand(key) },
    { name: 'Claude Desktop', how: 'Settings → Developer → Edit Config, paste into claude_desktop_config.json, restart Claude. Needs Node.js.', text: claudeDesktopConfig(key) },
    { name: 'Other MCP clients', how: 'The address and the header, in the usual mcpServers shape.', text: genericConfig(key) },
  ]
  return (
    <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>AI assistants (MCP)</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.5 }}>
        Let Claude or another AI assistant read your tasks, projects and calendar — and, if you allow it, add tasks and tick them off for you.
      </div>
      {!row && !shown && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>not set up yet</div>}
      {row && !shown && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-muted)' }}>
          key made {day(row.updated_at)} · {row.scope === 'read' ? 'read only' : 'read & write'} · {row.last_used_at ? `last used ${day(row.last_used_at)}` : 'not used yet'}
        </div>
      )}
      {shown && (
        <>
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-body)' }}>Your AI access key — copy it now, it won’t be shown again:</div>
          <div style={{ ...box, ...mono, color: 'var(--ink-body)' }}>{shown}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => copy(shown, 'Key')}>Copy key</Button>
          </div>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <Seg<McpScope> value={scope} onChange={setScope} options={[{ value: 'read_write', label: 'Read & write' }, { value: 'read', label: 'Read only' }]} />
      </div>
      <div style={fhelp}>{scope === 'read' ? 'the assistant can look but never change anything' : 'the assistant can also add tasks, tick them off, move them to tomorrow and add to your inbox'}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => setShown(await createMcpKey(scope)))}>
          {row || shown ? 'New key' : 'Create key'}
        </Button>
        {row && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await deleteMcpKey(row.id); setShown(null) })}>
            Turn off
          </Button>
        )}
      </div>
      {err && <div style={{ ...fhelp, color: 'var(--acc-terra)' }}>{err}</div>}
      <div style={fhelp}>a new key stops the old one · your journal and people are never shared · 500 tool calls a day</div>
      <div style={{ ...box, ...mono }}>{MCP_URL}</div>
      <div style={{ marginTop: 8 }}>
        <Button variant="secondary" onClick={() => copy(MCP_URL, 'Server address')}>Copy server address</Button>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', cursor: 'pointer', minHeight: 24 }}>Connect an assistant</summary>
        {!shown && <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }}>Make a key first — right after you do, these come with it filled in.</p>}
        {clients.map((c) => (
          <div key={c.name} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)' }}>{c.name}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-muted)', marginTop: 2 }}>{c.how}</div>
            <pre style={{ ...box, ...mono, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{c.text}</pre>
            <div style={{ marginTop: 6 }}>
              <Button variant="secondary" onClick={() => copy(c.text, c.name)}>Copy for {c.name}</Button>
            </div>
          </div>
        ))}
      </details>
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
      desc="Brings the open GitHub issues assigned to you (and repos you watch) into your Inbox, where you can turn them into tasks."
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
            <>
              {/* A friend's feedback 2026-10-04: once connected, "GitHub" should lead to the issues. */}
              <Link to="/inbox" className="kf-btn kf-press kf-button kf-button--cta" style={{ textDecoration: 'none' }}>See issues in your Inbox →</Link>
              <Button type="button" variant="secondary" onClick={() => void sync()} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Button>
            </>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        <CaptureKeyCard />
        <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <svg width="20" height="30" viewBox="0 0 20 32" style={{ flex: 'none' }}><rect x="1" y="1" width="18" height="30" rx="4" fill="none" stroke="var(--ink-faint)" strokeWidth="1.6" /><circle cx="10" cy="26.5" r="1.6" fill="var(--ink-faint)" /></svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>Share target</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.5 }}>Share to Kai's Flow from any app on your phone — links, notes, half-thoughts.</div>
            </div>
          </div>
          <div style={{ ...fhelp, marginTop: 9 }}>appears in the share sheet once the app (or the installed web app) is on the phone · text and links, not images yet</div>
        </SCard>
      </div>
      {/* Capture → photos (Paper capture): photo retention, today's scans, the offline queue. */}
      <PaperSettingsCard />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={flabel}>AI assistants</span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      <McpCard />
    </div>
  )
}

/** The round ▶ every sound row and pack card uses. */
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line-solid)', background: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
    >
      <svg width="9" height="10" viewBox="0 0 12 14"><path d="M1.5 1.2 11 7l-9.5 5.8V1.2Z" fill="var(--ink-muted)" /></svg>
    </button>
  )
}

// Settings.dc.html 3a: master row with the whisper↔full meter, quiet hours. Sounds v2 (Kai
// 2026-10-07, "I hate the current sounds"): a pack picker (kalimba / felt / glass, each with ▶ to
// hear its phrase) and one row per event that actually plays. Synthesised in lib/sounds.ts.
export function SoundCatalogCard() {
  const [events, setEvents] = useState(readSoundEvents)
  const [pack, setPack] = useState(readSoundPack)
  const [volume, setVolume] = useState(readVolume)
  const [quiet, setQuiet] = useState(readQuietHours)
  const mobile = useIsMobile()
  const masterOn = volume > 0

  function toggleEvent(id: SoundEvent, on: boolean) {
    const next = { ...events, [id]: on }
    setEvents(next)
    writeSoundEvents(next)
    if (on) previewSound(id) // turning one on should let you hear what you just agreed to
  }
  function choosePack(p: SoundPack) {
    setPack(p)
    writeSoundPack(p)
    previewSound('complete_big', p)
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
          <div style={fhelp}>soft, warm, a little musical</div>
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
                  previewSound('complete')
                }}
                style={{
                  width: 5, height: 6 + i * 5, padding: 0, border: 'none', borderRadius: 1, cursor: 'pointer',
                  background: volume >= step - 0.01 ? 'var(--acc-sage)' : 'var(--line-solid)',
                }}
              />
            ))}
          </span>
          <span style={{ ...flabel, fontSize: 'var(--fs-meta)' }}>full</span>
          <Toggle on={masterOn} label="Sound" onToggle={() => setVol(masterOn ? 0 : DEFAULT_VOLUME)} />
        </div>
      </div>
      <div role="radiogroup" aria-label="Sound pack" style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 8, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        {SOUND_PACKS.map((p) => {
          const on = p === pack
          return (
            // The whole card picks the pack; its ▶ only auditions it.
            <div key={p} data-sound-pack={p} style={{ position: 'relative', borderRadius: 7, border: `1px solid ${on ? 'var(--acc-sage)' : 'var(--line-card)'}`, background: on ? 'var(--paper-bone)' : 'none' }}>
              <button type="button" role="radio" aria-checked={on} onClick={() => choosePack(p)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 14, color: 'var(--ink-body)', minHeight: 24, paddingRight: 30 }}>
                  {PACKS[p].label}
                  {on && <span style={{ color: 'var(--acc-sage)', marginLeft: 6 }}>✓</span>}
                </div>
                <div style={{ ...fhelp, marginTop: 3 }}>{PACKS[p].blurb}</div>
              </button>
              <span style={{ position: 'absolute', top: 8, right: 8 }}>
                <PlayButton label={`Hear ${PACKS[p].label}`} onClick={() => previewSound('complete_big', p)} />
              </span>
            </div>
          )
        })}
      </div>
      {SOUND_ROWS.map((s) => {
        const on = events[s.id]
        return (
          <div key={s.id} data-sound-event={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '1px dashed var(--line-dashed)', opacity: masterOn && on ? 1 : 0.6 }}>
            <PlayButton label={`Preview ${s.label}`} onClick={() => previewSound(s.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-body)' }}>{s.label}</div>
              <div style={{ ...flabel, fontSize: 'var(--fs-meta)', marginTop: 2 }}>{s.help}</div>
            </div>
            <Toggle on={on} label={s.label} onToggle={() => toggleEvent(s.id, !on)} />
          </div>
        )
      })}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="12" height="12" viewBox="0 0 24 24"><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--ink-hairline)" /></svg>
        <span style={{ ...fhelp, marginTop: 0, flex: 1 }}>The garden is silent after you close it. Quiet hours and paused notifications hush it too.</span>
        <Toggle
          on={quiet}
          label="Silent after you close the garden"
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
const SUBNAV_ITEMS = ['Appearance', 'Sound', 'Calendar', 'Resurfacing', 'Timezone', 'Integrations', 'Notifications', 'Organize', 'Trash', 'Profile', 'App'] as const

/** Kai 2026-10-06: domains are made, renamed, recoloured, merged and deleted here (and on the Tasks
 * page's Organize card) — no longer only from Tasks, create-only. */
function OrganizeCard() {
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Organize · domains</div>
      <DomainsSettings />
    </SCard>
  )
}
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
            <div id="settings-Notifications"><NotificationsCard /></div>
            <div id="settings-Resurfacing"><ResurfacingCard /></div>
            <ImportCard />
            <div id="settings-Organize"><OrganizeCard /></div>
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
  const { data: subs = [] } = useMyPushSubscriptions()
  const { data: deletedItems = [] } = useDeletedItems()
  const { data: captureKey } = useCaptureKey()
  const github = integrations.find((i) => i.provider === 'github')
  const { mode, setMode } = useThemeMode()
  // Final polish (2026-09-26): the phone's Appearance card drew a static 60% "slider" and had no
  // Interface size at all. Both now drive the same prefs as the desktop card.
  const scale = useUiScale((st) => st.scale)
  const setScale = useUiScale((st) => st.setScale)
  const grain = useGrain()

  const rows: { label: string; value: ReactNode; to?: string }[] = [
    { label: 'Google Calendar', value: 'Coming soon' },
    { label: 'GitHub', value: githubState(github).text },
    { label: 'Notifications', value: `${subs.length} device${subs.length === 1 ? '' : 's'}` },
    { label: 'Capture API', value: captureKey ? 'On' : 'Not set up' },
    // Punch 50: the phone's only way into Trash.
    { label: 'Trash', value: `${deletedItems.length} resting`, to: '/trash' },
  ]

  return (
    // Kai's phone review: the shell's 16px gutter is the page's (Today's), not 16 + 4 of its own.
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 34, filter: 'var(--shadow-drop-sm)' }} />
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: 'var(--ink-body)' }}>Settings</h1>
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
      </SCard>

      {/* Calendar: Opens on (it sat under Appearance until the Weekend joined it, 2026-10-07). */}
      <div id="settings-Calendar" style={{ marginTop: 12 }}>
        <CalendarCard phone />
      </div>

      {/* Sounds v2: the phone plays them too, so it gets the same card (it had none). */}
      <div id="settings-Sound" style={{ marginTop: 12 }}>
        <SoundCatalogCard />
      </div>

      <div style={{ marginTop: 12 }}>
        <TimezoneCard />
      </div>

      <div style={{ marginTop: 12 }}>
        <AppUpdateCard />
      </div>

      {/* The phone has no Organize rail — its domains live here. */}
      <div id="settings-Organize" style={{ marginTop: 12 }}>
        <OrganizeCard />
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

      {/* The phone is where the pushes land, so the whole Notifications card lives here too (12i). */}
      <div style={{ marginTop: 12 }}>
        <NotificationsCard />
      </div>

      {/* P6: the phone has no Integrations page, so the GitHub row (connect / sync) sits here. */}
      <div style={{ marginTop: 12 }}>
        <GithubProvider github={github} />
      </div>

      {/* The capture key and its how-to: the same card as the desktop's Integrations page. */}
      <div style={{ marginTop: 12 }}>
        <CaptureKeyCard />
      </div>
      <div style={{ marginTop: 12 }}>
        <PaperSettingsCard />
      </div>
      <div style={{ marginTop: 12 }}>
        <McpCard />
      </div>

      <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-0.8deg)' }}>everything saves as you touch it ✿</div>
    </div>
  )
}

export function SettingsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileSettings /> : <DesktopSettings />
}
