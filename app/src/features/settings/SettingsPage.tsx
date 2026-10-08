import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { useUiScale, UI_SCALES, defaultUiScale, readUiScaleEnv, uiZoom, type UiScale } from '../../lib/uiScale'
import { usePrefersReducedMotion, setEffectsEnabled } from '../../lib/motion'
import { readSoundEvents, writeSoundEvents, readSoundPack, writeSoundPack, readVolume, writeVolume, readQuietHours, writeQuietHours, previewSound, DEFAULT_VOLUME, PACKS, SOUND_PACKS, type SoundEvent, type SoundPack } from '../../lib/sounds'
import { useIntegrations, connectGithub, syncGithub, disconnectGithub, githubState, type IntegrationStatus } from './api'
import { useCaptureKey, createCaptureKey, deleteCaptureKey, bookmarklet, curlRecipe, CAPTURE_URL } from './captureKey'
import { useMcpKey, createMcpKey, deleteMcpKey, claudeCodeCommand, claudeDesktopConfig, genericConfig, MCP_URL, type McpScope } from './mcpKey'
import { PaperSettingsCard } from '../paper/PaperSettings'
import { useToastStore } from '../../lib/toastStore'
import { Button, Segmented, Toggle } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Popover } from '../../components/DatePicker'
import { KindGlyph } from '../notifications/KindGlyph'
import { KIND_IDS, KIND_LOOK } from '../notifications/kinds'
import { showLocal } from '../notifications/local'
import { QUIET_FROM, QUIET_TO, testNotice } from '../../../../supabase/functions/notify/copy.ts'
import { isTauri, native, readTrayShown, writeTrayShown } from '../tray/native'
import { widgetsAvailable } from '../widgets/native'
import { useHideTitles } from '../widgets/bridge'
import { TimeField } from '../calendar/TimeField'
import { useDeletedItems } from '../trash/api'
import { appZone, deviceZone, isZone, searchZones, zoneCity } from '../../lib/appZone'
import { parseWeekend, weekendLabel, weekendPreset, WEEKEND_PRESETS } from '../../lib/weekend'
import { planGlossary } from '../tasks/planMath'
import { DomainsSettings } from '../domains/DomainList'
import './settings.css'

// Settings.dc.html t1 1a/1b, t2 2a, t3 3a — transcribed onto real data. UI pass (Kai 2026-10-08,
// "This doesn't look good"): one card (serif title, no tape — see settings.css) and one row
// (label + one short help line + its control) everywhere, on the computer and the phone alike;
// long explanations moved out of the cards (the plan-shortcut glossary opens from a link).

/** A settings card: a serif title (+ one short line, + something on its right), then its rows. */
function SCard({ id, title, sub, aside, plain, padded, style, children }: { id?: string; title?: ReactNode; sub?: ReactNode; aside?: ReactNode; plain?: boolean; padded?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <section id={id} className={`st-card${plain ? ' is-plain' : ''}${padded ? ' is-padded' : ''}`} style={style}>
      {title != null && (
        <header className="st-head">
          <h2 className="st-title">{title}</h2>
          {aside}
          {sub != null && <p className="st-sub">{sub}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

/** The one row pattern: label + one short help line, the control right-aligned at its natural width
 * (it drops under the label only when they don't fit side by side); `under` = a full-width block. */
function Row({ label, help, lead, under, style, attrs, children }: { label: ReactNode; help?: ReactNode; lead?: ReactNode; under?: ReactNode; style?: CSSProperties; attrs?: Record<string, string>; children?: ReactNode }) {
  return (
    <div className={`st-row${lead ? ' has-lead' : ''}`} style={style} {...attrs}>
      {lead && <span className="st-lead">{lead}</span>}
      <div className="st-row-text">
        <div className="st-label">{label}</div>
        {help != null && <div className="st-help">{help}</div>}
      </div>
      {children != null && <div className="st-ctrl">{children}</div>}
      {under != null && <div className="st-under">{under}</div>}
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

// The export's hairline slider, made real: an invisible native range input overlays the drawn
// track, so drag + keyboard both work (and a phone gets a 48-tall hit).
function Slider({ value, min = 0, max = 100, onChange, width, ariaLabel }: { value: number; min?: number; max?: number; onChange: (v: number) => void; width: number; ariaLabel: string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <span className="st-slider" style={{ width }}>
      <span className="st-slider-fill" style={{ width: `${pct}%` }} />
      <span className="st-slider-thumb" style={{ left: `${pct}%` }} />
      <input type="range" min={min} max={max} value={value} aria-label={ariaLabel} onChange={(e) => onChange(Number(e.target.value))} />
    </span>
  )
}

// Disabled action chip — Onboarding's "Soon" pattern (nothing clickable that does nothing).
function SoonChip({ label = 'Soon' }: { label?: string }) {
  return (
    <span className="st-chip" aria-disabled="true" title="Coming with integrations — not wired up yet" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
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
  { id: 'complete', label: 'Task done', help: 'A soft tock as you check one off' },
  { id: 'complete_big', label: 'Goal done', help: 'The Goal of the day, or the last of your Top 3' },
  { id: 'capture', label: 'Captured', help: 'Saved from the capture bar' },
  { id: 'focus_start', label: 'Focus begins', help: 'A fresh round starts' },
  { id: 'focus_end', label: 'Focus ends', help: 'The round is over, heard across the room' },
  { id: 'ritual_done', label: 'Ritual', help: 'Start the day · Goodnight' },
  { id: 'undo', label: 'Undo', help: 'A tiny step back' },
]

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
    <SCard id="settings-Appearance" title="Appearance">
      <Row label="Theme" help="Auto follows your system">
        <Segmented<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]} />
      </Row>
      {/* R4 (Kai 2026-07-20): labelled in the percentages he used. Polish F2b: the default is per
          device (125% on a computer, 100% on a phone), so the help names this device's own normal. */}
      <Row label="Interface size" help={`Scales the whole app · ${Math.round(defaultUiScale(readUiScaleEnv()) * 100)}% is this device’s normal`}>
        <Segmented<UiScale> label="Interface size" value={scale} onChange={setScale} options={UI_SCALES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))} />
      </Row>
      <Row label="Paper texture" help={`The grain over everything · ${grain.pct}%`}>
        <Slider ariaLabel="Paper texture" value={grain.pct} onChange={grain.set} width={140} />
        <span aria-hidden="true" style={{ width: 56, height: 36, flex: 'none', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', background: 'var(--paper-linen)', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: grain.pct / 100 }} />
          <img src="/ds/assets/clover/awake.png" alt="" style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', height: 20 }} />
        </span>
      </Row>
      <Row label="Botanical animations" help={osReduced ? 'Your system asks for less motion, so the garden holds still' : 'Petals fall, leaves sway'}>
        <Toggle
          on={animOn}
          label="Botanical animations"
          onToggle={() => {
            const next = !animOn
            setAnimOn(next)
            setEffectsEnabled(next)
          }}
        />
      </Row>
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
    <Segmented<CalendarDefaultView>
      label="Opens on"
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
    <SCard id="settings-Calendar" title="Calendar">
      <Row label="Opens on" help="On every device · the toolbar still switches it">
        <CalendarViewSeg platformDefault={phone ? 'day' : 'week'} />
      </Row>
      <WeekendSetting />
      <Row label="Plan shortcuts" help="Today, Next free slot, This weekend…">
        <PlanGlossaryLink />
      </Row>
    </SCard>
  )
}

// Kai 2026-10-07: "My weekend is Friday and Saturday… Don't force people to be someone they're not."
// app_settings.weekend_days (lib/weekend) — what the Plan menu's "This weekend" lands on.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function WeekendSetting() {
  const { data } = useAppSettings()
  const days = parseWeekend(data?.weekend_days)
  const preset = weekendPreset(days)
  const [customOpen, setCustomOpen] = useState(false)
  const shown = customOpen ? 'custom' : preset
  const set = (next: number[]) => updateAppSetting('weekend_days', [...next].sort((a, b) => a - b))
  return (
    <Row
      label="Weekend"
      help={`${weekendLabel(days)} · “This weekend” lands on its first day`}
      under={
        shown === 'custom' && (
          // One row of seven: on a 390 phone each day is ~44 wide and 48 tall (kf-seg-btn).
          <div role="group" aria-label="Weekend days" className="kf-seg" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', width: '100%', borderRadius: 'var(--radius-md)' }}>
            {WEEKDAY_SHORT.map((label, d) => {
              const on = days.includes(d)
              return (
                <button key={label} type="button" className="kf-seg-btn" aria-pressed={on} onClick={() => set(on ? days.filter((x) => x !== d) : [...days, d])} style={{ padding: 0, borderRadius: 'var(--radius-input)' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )
      }
    >
      <Segmented<string>
        label="Weekend"
        value={shown}
        onChange={(v) => {
          setCustomOpen(v === 'custom')
          const p = WEEKEND_PRESETS.find((x) => x.key === v)
          if (p) set([...p.days])
        }}
        options={[...WEEKEND_PRESETS.map((p) => ({ value: p.key as string, label: p.label })), { value: 'custom', label: 'Custom' }]}
      />
    </Row>
  )
}

/** "What do these mean?" — the Plan menu's options in a sentence each (tasks/planMath), live with
 * the weekend above. UI pass: it was seven paragraphs inline in the card; now it opens in the Plan
 * menu's own popover on a computer and a sheet on a phone, and links on to the Guide. */
function PlanGlossaryLink() {
  const mobile = useIsMobile()
  const { data } = useAppSettings()
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const close = () => setAt(null)
  const body = (
    <>
      <dl className="st-gloss">
        {planGlossary(parseWeekend(data?.weekend_days)).map((g) => (
          <div key={g.label}>
            <dt>{g.label}</dt>
            <dd>{g.means.charAt(0).toUpperCase() + g.means.slice(1)}</dd>
          </div>
        ))}
      </dl>
      <div className="st-gloss-foot">
        <Link to="/guide/plan" className="st-link">More in the Guide: Plan my day</Link>
      </div>
    </>
  )
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="st-link"
        aria-haspopup="dialog"
        aria-expanded={at != null}
        onClick={() => {
          if (at) return close()
          // Visual px (Popover divides by the zoom): right-aligned under the link, 340 layout wide.
          const r = ref.current?.getBoundingClientRect()
          if (r) setAt({ x: r.right - 340 * uiZoom(), y: r.bottom + 6 })
        }}
      >
        What do these mean?
      </button>
      {at &&
        (mobile ? (
          <BottomSheet onClose={close} title="Plan shortcuts">
            {() => <div className="st-sheet-body">{body}</div>}
          </BottomSheet>
        ) : (
          <Popover title="Plan shortcuts" position={at} trigger={ref} onClose={close} focusKey={null}>
            <div style={{ padding: '4px 0 8px' }}>{body}</div>
          </Popover>
        ))}
    </>
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
    <SCard id="settings-App" title="App">
      <Row
        label="Kai’s Flow"
        help={`${current}${built ? ` · built ${built}` : ''}`}
        under={
          line && !checking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span role="status" style={{ fontSize: 13, color: r?.kind === 'offline' ? 'var(--ink-muted)' : 'var(--ink-body)' }}>{line}</span>
              {/* A newer release has its Update beside its notes below; this is a newer deploy of the same version. */}
              {!available && r?.kind === 'reload' && <Button variant="cta" onClick={() => void reloadToUpdate()}>Reload</Button>}
              {!available && r?.kind === 'download' && <Button variant="cta" onClick={() => openDownload(r.url)}>Download</Button>}
            </div>
          )
        }
      >
        <Button variant="secondary" disabled={checking} onClick={() => void checkForUpdates(uid)}>
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </Row>
      {/* Tour & help (Tour and Help Guide.dc.html, "Also in Settings → App"): the notes again. */}
      <Row label="The tour" help="Replays the notes on Today and clears seen hints">
        <Button variant="secondary" onClick={restartTour}>Show me around again</Button>
      </Row>
      <div style={{ paddingBottom: 12 }}>
        <UpdateNotes running={running} />
      </div>
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
  const option: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 40, textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px dashed var(--line-dashed)', padding: '9px 4px', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink-body)', cursor: 'pointer' }

  function apply(next: string) {
    if (!isZone(next)) return
    updateAppSetting('timezone', next)
    setQ('')
  }

  return (
    <SCard id="settings-Timezone" title="Time zone" padded>
      <Row
        label={`${tz} · ${zoneOffset(tz)}`}
        help="What “today” and “tomorrow 09:00” mean, on every device"
        under={
          <>
            {device !== tz && isZone(device) && (
              <button type="button" className="st-link" onClick={() => apply(device)} style={{ marginBottom: 6 }}>
                Use this device’s zone ({device})
              </button>
            )}
            <input type="search" className="st-field" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search time zones" placeholder="Search a city or region — e.g. London" />
            {matches.length > 0 && (
              <div role="listbox" aria-label="Time zones" style={{ marginTop: 6 }}>
                {matches.map((z) => (
                  <button key={z} type="button" role="option" aria-selected={z === tz} onClick={() => apply(z)} style={option}>
                    <span>{z.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{zoneOffset(z)}</span>
                  </button>
                ))}
              </div>
            )}
            {q.trim() && matches.length === 0 && <div className="st-help" style={{ marginTop: 8 }}>No zone matches “{q.trim()}”</div>}
          </>
        }
      />
    </SCard>
  )
}

const TONE_DOT = { ok: 'var(--check-fill)', bad: 'var(--acc-terra-ink)', off: 'var(--line-control)' } as const

function IntegrationsSummaryCard({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { data: integrations = [] } = useIntegrations()
  const gh = githubState(integrations.find((i) => i.provider === 'github'))
  const dot = (tone: keyof typeof TONE_DOT) => <span className="st-dot" style={{ background: TONE_DOT[tone] }} />
  return (
    <SCard
      id="settings-Integrations"
      title="Integrations"
      aside={<button type="button" className="st-link" onClick={onOpenIntegrations}>Open integrations</button>}
    >
      <Row lead={dot(gh.tone)} label="GitHub" help="Issues assigned to you land in the Inbox">
        <span className="st-chip" style={gh.tone === 'bad' ? { color: 'var(--acc-terra-ink)', borderColor: 'currentColor' } : undefined}>{gh.text}</span>
      </Row>
      {/* Google Calendar sync is a later integrations wave — nothing syncs yet, so no button. */}
      <Row lead={dot('off')} label="Google Calendar" help="A quiet sync under our own calendar">
        <SoonChip label="Coming soon" />
      </Row>
      <Row lead={dot('off')} label="Groq" help="Chat and capture parsing" />
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
    <Row lead={glyph} label={label} help={help}>
      {children}
    </Row>
  )
}

const timeStyle = (on: boolean): CSSProperties => ({ width: 84, boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 'var(--radius-md)', padding: '8px 10px', opacity: on ? 1 : 0.5 })

function NotificationsCard() {
  const { data: s } = useAppSettings()
  const { data: subs = [] } = useMyPushSubscriptions()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const tauri = isTauri()
  const [trayShown, setTrayShown] = useState(readTrayShown)
  const widgets = widgetsAvailable() // the Android app's home-screen widgets
  const hideTitles = useHideTitles((h) => h.on)
  const setHideTitles = useHideTitles((h) => h.set)
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

  const sub = (text: string) => <div className="st-sub-label">{text}</div>
  const glyph = (name: 'moon' | 'lock') => <Icon name={name} size={18} />

  return (
    <SCard id="settings-Notifications" title="Notifications" sub={`Calm by default — any kind can go quiet. On ${zoneCity(appZone())} time.`}>
      <Row label="Send a test" help="See how one looks on this device">
        <Button variant="secondary" onClick={handleTest} disabled={busy} icon={<Icon name="bell" size={16} />}>
          Send a test notification
        </Button>
      </Row>

      {sub('Kinds')}
      {KIND_IDS.map((kind) => {
        const k = KIND_LOOK[kind]
        const key = `${kind}_on` as const
        const on = s[key] !== false
        const ritual = kind === 'morning_digest' || kind === 'evening_nudge' ? kind : null
        return (
          <NotificationRow key={kind} glyph={<KindGlyph kind={kind} />} label={k.label} help={`${k.channel} · ${k.silent ? 'silent' : 'with sound'}`}>
            {ritual && (
              <TimeField
                value={(s[`${ritual}_at` as const] ?? RITUAL_AT[ritual]).slice(0, 5)}
                ariaLabel={`${k.label} time`}
                onChange={(v) => v && updateAppSetting(`${ritual}_at` as const, v)}
                style={timeStyle(on)}
               
              />
            )}
            <Toggle on={on} label={k.label} onToggle={() => updateAppSetting(key, !on)} />
          </NotificationRow>
        )
      })}

      {sub('Quiet')}
      <NotificationRow glyph={glyph('moon')} label="Quiet hours" help="Nothing makes a sound; the tray shows a moon">
        <TimeField value={(s.quiet_from ?? QUIET_FROM).slice(0, 5)} ariaLabel="Quiet from" onChange={(v) => v && updateAppSetting('quiet_from', v)} style={timeStyle(quietOn)} />
        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>to</span>
        <TimeField value={(s.quiet_to ?? QUIET_TO).slice(0, 5)} ariaLabel="Quiet until" onChange={(v) => v && updateAppSetting('quiet_to', v)} style={timeStyle(quietOn)} />
        <Toggle on={quietOn} label="Quiet hours" onToggle={() => updateAppSetting('quiet_hours_on', !quietOn)} />
      </NotificationRow>
      <NotificationRow glyph={glyph('lock')} label="Task names on the lock screen" help="Off: “Kai’s Flow · A reminder”">
        <Toggle on={s.lock_screen_names === true} label="Show task names on the lock screen" onToggle={() => updateAppSetting('lock_screen_names', !s.lock_screen_names)} />
      </NotificationRow>
      {widgets && (
        <NotificationRow glyph={<span />} label="Hide titles on the home screen" help="Widgets say “Your goal” · “Pick 2” — this phone only">
          <Toggle on={hideTitles} label="Hide titles on the home screen" onToggle={() => setHideTitles(!hideTitles)} />
        </NotificationRow>
      )}

      {tauri ? (
        <>
          {sub('Windows')}
          <NotificationRow glyph={<span />} label="Show in the system tray" help="The K by the clock, with a quick flyout">
            <Toggle
              on={trayShown}
              label="Show in the system tray"
              onToggle={() => {
                writeTrayShown(!trayShown)
                setTrayShown(!trayShown)
              }}
            />
          </NotificationRow>
          <NotificationRow glyph={<span />} label="Start with Windows" help="Opens quietly to the tray">
            <Toggle on={!!autostart} label="Start with Windows" onToggle={autostart === null ? undefined : () => void native<boolean>('autostart_set', { on: !autostart }).then((on) => setAutostart(!!on))} />
          </NotificationRow>
        </>
      ) : (
        <>
          {sub('This device')}
          {!supported ? (
            <p className="st-note" style={{ color: 'var(--acc-terra-ink)' }}>
              Not supported on this browser. On iPhone, add the app to your home screen first (Share → Add to Home Screen).
            </p>
          ) : (
            <Row
              label={`${subs.length} device${subs.length === 1 ? '' : 's'} subscribed`}
              help={subs.length ? subs.map((d) => (d.device_label === thisDeviceLabel ? 'this device ✓' : (d.device_label ?? 'device').slice(0, 20))).join(' · ') : 'None yet'}
            >
              <Button variant="secondary" onClick={handleSubscribe} disabled={busy}>
                {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
              </Button>
            </Row>
          )}
        </>
      )}
      {message && <p role="status" className="st-note">{message}</p>}
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
    <Row label={label} help={help}>
      <Slider ariaLabel={`${label} cooldown in days`} value={days[level]} min={1} max={30} onChange={(v) => set(level, v)} width={140} />
      <span className="st-value">{days[level]} {days[level] === 1 ? 'day' : 'days'}</span>
    </Row>
  )
  return (
    <SCard id="settings-Resurfacing" title="Resurfacing" sub="How long “Not now” rests before it wanders back">
      {row('high', 'High priority', 'Comes back soonest')}
      {row('med', 'Medium priority', 'A working week, roughly')}
      {row('low', 'Low priority', 'The long shelf')}
    </SCard>
  )
}

// P-IMPORT entry (Settings.dc.html 2a) + punch 50's Trash entry point — one "your data" card.
const linkBtn = 'kf-btn kf-press kf-button kf-button--secondary'
function DataCard({ importer = true }: { importer?: boolean }) {
  const { data: deletedItems = [] } = useDeletedItems()
  return (
    <SCard id="settings-Data" title="Your data">
      {importer && (
        <Row label="Import" help="From Akiflow or a CSV file · re-importing never duplicates">
          <Link to="/settings/import" className={linkBtn} style={{ textDecoration: 'none' }}>Open importer</Link>
        </Row>
      )}
      <Row label="Trash" help={`${deletedItems.length === 0 ? 'Nothing resting' : `${deletedItems.length} item${deletedItems.length === 1 ? '' : 's'} resting`} · composts after 30 days`}>
        <Link to="/trash" className={linkBtn} style={{ textDecoration: 'none' }}>Open trash</Link>
      </Row>
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
    <SCard id="settings-Profile" title="Profile">
      <Row label={email || 'Signed in'} help="One person, one garden — no team settings here">
        {/* WA-1 punch 3: quiet re-entry to the first-run wizard (name / workspace / seed). */}
        <Link to="/onboarding?replant=1" className="st-link">Rerun the welcome</Link>
      </Row>
    </SCard>
  )
}

function ProviderRow({ icon, name, desc, status, children }: { icon: ReactNode; name: string; desc: string; status: ReactNode; children?: ReactNode }) {
  return (
    <SCard plain padded>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {icon}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div className="st-title" style={{ fontSize: 18 }}>{name}</div>
          <div className="st-help">{desc}</div>
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

const how: CSSProperties = { margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-muted)' }
const summary: CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--ink-body)', cursor: 'pointer', minHeight: 28, display: 'flex', alignItems: 'center' }

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
  return (
    <SCard plain padded title="External capture endpoint" sub="Anything POSTed here lands in your Inbox · a new key stops the old one">
      {!row && !shown && <div className="st-help">Not set up yet</div>}
      {row && !shown && (
        <div className="st-help">
          Key made {day(row.updated_at)} · {row.last_used_at ? `last used ${day(row.last_used_at)}` : 'not used yet'}
        </div>
      )}
      {shown && (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Your capture key — copy it now, it won’t be shown again:</div>
          <div className="st-mono-box" style={{ color: 'var(--ink-body)' }}>{shown}</div>
          <div className="st-btns" style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={() => copy(shown, 'Key')}>Copy key</Button>
            <Button variant="secondary" onClick={() => copy(bookmarklet(shown), 'Bookmarklet')}>Copy bookmarklet</Button>
          </div>
          <div className="st-help" style={{ marginTop: 6 }}>Bookmarklet: make a new bookmark and paste it as the address — it sends the selected text, or the page</div>
        </>
      )}
      <div className="st-btns" style={{ marginTop: 12 }}>
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => setShown(await createCaptureKey()))}>
          {row || shown ? 'New key' : 'Create key'}
        </Button>
        {row && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await deleteCaptureKey(row.id); setShown(null) })}>
            Turn off
          </Button>
        )}
      </div>
      {err && <div className="st-help" style={{ color: 'var(--acc-terra-ink)', marginTop: 8 }}>{err}</div>}
      {/* The short version of docs/CAPTURE.md. The key only ever goes in the header. */}
      <details style={{ marginTop: 12 }}>
        <summary style={summary}>How to send things here</summary>
        <div className="st-mono-box">
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
        <div className="st-mono-box" style={{ marginTop: 6 }}>{curlRecipe()}</div>
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
  // The real key goes into the snippets only while it's on screen; otherwise a placeholder.
  const key = shown ?? undefined
  const clients = [
    { name: 'Claude Code', how: 'Run it in a terminal.', text: claudeCodeCommand(key) },
    { name: 'Claude Desktop', how: 'Settings → Developer → Edit Config, paste into claude_desktop_config.json, restart Claude. Needs Node.js.', text: claudeDesktopConfig(key) },
    { name: 'Other MCP clients', how: 'The address and the header, in the usual mcpServers shape.', text: genericConfig(key) },
  ]
  return (
    <SCard plain padded title="AI assistants (MCP)" sub="Let Claude or another assistant read your tasks, projects and calendar — and, if you allow it, add and tick off tasks.">
      {!row && !shown && <div className="st-help">Not set up yet</div>}
      {row && !shown && (
        <div className="st-help">
          Key made {day(row.updated_at)} · {row.scope === 'read' ? 'read only' : 'read & write'} · {row.last_used_at ? `last used ${day(row.last_used_at)}` : 'not used yet'}
        </div>
      )}
      {shown && (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Your AI access key — copy it now, it won’t be shown again:</div>
          <div className="st-mono-box" style={{ color: 'var(--ink-body)' }}>{shown}</div>
          <div className="st-btns" style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={() => copy(shown, 'Key')}>Copy key</Button>
          </div>
        </>
      )}
      <Row label="Access" help={scope === 'read' ? 'The assistant can look but never change anything' : 'It can also add tasks, tick them off, move them to tomorrow and add to your Inbox'} style={{ borderTop: 'none' }}>
        <Segmented<McpScope> label="Access" value={scope} onChange={setScope} options={[{ value: 'read_write', label: 'Read & write' }, { value: 'read', label: 'Read only' }]} />
      </Row>
      <div className="st-btns">
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => setShown(await createMcpKey(scope)))}>
          {row || shown ? 'New key' : 'Create key'}
        </Button>
        {row && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await deleteMcpKey(row.id); setShown(null) })}>
            Turn off
          </Button>
        )}
      </div>
      {err && <div className="st-help" style={{ color: 'var(--acc-terra-ink)', marginTop: 8 }}>{err}</div>}
      <div className="st-help" style={{ marginTop: 10 }}>A new key stops the old one · your journal and people are never shared · 500 tool calls a day</div>
      <div className="st-mono-box">{MCP_URL}</div>
      <div style={{ marginTop: 8 }}>
        <Button variant="secondary" onClick={() => copy(MCP_URL, 'Server address')}>Copy server address</Button>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary style={summary}>Connect an assistant</summary>
        {!shown && <p style={how}>Make a key first — right after you do, these come with it filled in.</p>}
        {clients.map((c) => (
          <div key={c.name} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-body)' }}>{c.name}</div>
            <div style={{ ...how, marginTop: 2 }}>{c.how}</div>
            <pre className="st-mono-box" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{c.text}</pre>
            <div style={{ marginTop: 6 }}>
              <Button variant="secondary" onClick={() => copy(c.text, c.name)}>Copy for {c.name}</Button>
            </div>
          </div>
        ))}
      </details>
    </SCard>
  )
}

const flabel: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', color: 'var(--ink-faint)' }

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
      desc="Open issues assigned to you (and repos you watch) come into your Inbox, ready to become tasks."
      status={
        github ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', flex: 'none', maxWidth: '45%' }}>
            <span className="st-dot" style={{ background: failing ? 'var(--acc-terra-ink)' : 'var(--check-fill)' }} />
            <span style={{ fontSize: 13, color: failing ? 'var(--acc-terra-ink)' : 'var(--ink-muted)', textAlign: 'right' }}>
              {failing ? '' : `@${github.login ?? '?'} · `}{githubState(github).text}
            </span>
          </div>
        ) : (
          !formOpen && <Button type="button" variant="secondary" onClick={() => setFormOpen(true)}>Connect</Button>
        )
      }
    >
      {github && (
        <div className="st-btns" style={{ marginTop: 12 }}>
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
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" className="st-field" />
            <div className="st-help" style={{ marginTop: 6 }}>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Create one on GitHub</a> — pick the repos it can see, set Issues to read-only (Metadata comes with it), and paste it here.
            </div>
          </label>
          <label>
            <div style={{ ...flabel, marginBottom: 6 }}>Watched repos · optional</div>
            <input value={repos} onChange={(e) => setRepos(e.target.value)} placeholder="owner/repo, owner/other" className="st-field" />
            <div className="st-help" style={{ marginTop: 6 }}>All their open issues come in too · issues assigned to you always do</div>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="cta" disabled={busy || !token.trim()}>{busy ? 'Connecting…' : 'Connect'}</Button>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {message && <div role="status" className="st-help" style={{ marginTop: 10 }}>{message}</div>}
    </ProviderRow>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="st-group-label">
      <span>{children}</span>
      <span />
    </div>
  )
}

function IntegrationsPage() {
  const { data: integrations = [] } = useIntegrations()
  const github = integrations.find((i) => i.provider === 'github')

  return (
    <div className="st-integrations">
      <div>
        <h2 className="st-title" style={{ fontSize: 26 }}>Integrations</h2>
        <p className="st-sub" style={{ marginTop: 6 }}>Everything that feeds the inbox, and the rules it follows.</p>
      </div>

      <GithubProvider github={github} />

      <ProviderRow
        icon={
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)' }}>
            <Icon name="calendar" size={18} />
          </span>
        }
        name="Google Calendar"
        desc="Planned: a quiet sync underneath our own calendar. Not built yet — nothing syncs."
        status={<SoonChip label="Coming soon" />}
      />

      <GroupLabel>Capture from anywhere</GroupLabel>
      <div className="st-pair">
        <CaptureKeyCard />
        <SCard plain padded title="Share target" sub="Share to Kai’s Flow from any app on your phone — links, notes, half-thoughts.">
          <div className="st-help">It’s in the share sheet once the app (or the installed web app) is on the phone · text and links, not images yet</div>
        </SCard>
      </div>
      {/* Capture → photos (Paper capture): photo retention, today's scans, the offline queue. */}
      <PaperSettingsCard />

      <GroupLabel>AI assistants</GroupLabel>
      <McpCard />
    </div>
  )
}

/** The round ▶ every sound row and pack card uses. */
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="st-play" aria-label={label} title={label} onClick={onClick}>
      <svg width="9" height="10" viewBox="0 0 12 14" aria-hidden="true"><path d="M2 1.2 11 7l-9 5.8V1.2Z" fill="currentColor" /></svg>
    </button>
  )
}

const VOLUME_STEPS = [
  { value: 0.34, label: 'Whisper' },
  { value: 0.67, label: 'Soft' },
  { value: 1, label: 'Full' },
]

// Settings.dc.html 3a: master row with the whisper↔full volume, quiet hours. Sounds v2 (Kai
// 2026-10-07, "I hate the current sounds"): a pack picker (kalimba / felt / glass, each with ▶ to
// hear its phrase) and one row per event that actually plays. Synthesised in lib/sounds.ts.
export function SoundCatalogCard() {
  const [events, setEvents] = useState(readSoundEvents)
  const [pack, setPack] = useState(readSoundPack)
  const [volume, setVolume] = useState(readVolume)
  const [quiet, setQuiet] = useState(readQuietHours)
  const masterOn = volume > 0
  // The step nearest the stored volume (the default 0.35 reads as Whisper); none while it's off.
  const step = masterOn ? VOLUME_STEPS.reduce((a, b) => (Math.abs(b.value - volume) < Math.abs(a.value - volume) ? b : a)).value : -1

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
    <SCard id="settings-Sound" title="Sound">
      <Row label="Sound" help="Soft, warm, a little musical">
        <Segmented<number>
          label="Volume"
          value={step}
          onChange={(v) => {
            setVol(v)
            previewSound('complete')
          }}
          options={VOLUME_STEPS}
        />
        <Toggle on={masterOn} label="Sound" onToggle={() => setVol(masterOn ? 0 : DEFAULT_VOLUME)} />
      </Row>
      <div role="radiogroup" aria-label="Sound pack" className="st-packs">
        {SOUND_PACKS.map((p) => {
          const on = p === pack
          return (
            // The whole card picks the pack; its ▶ only auditions it.
            <div key={p} data-sound-pack={p} className={`st-pack${on ? ' is-on' : ''}`}>
              <button type="button" role="radio" aria-checked={on} onClick={() => choosePack(p)}>
                <div className="st-label">{PACKS[p].label}</div>
                <div className="st-help">{PACKS[p].blurb.charAt(0).toUpperCase() + PACKS[p].blurb.slice(1)}</div>
              </button>
              <PlayButton label={`Hear ${PACKS[p].label}`} onClick={() => previewSound('complete_big', p)} />
            </div>
          )
        })}
      </div>
      {SOUND_ROWS.map((s) => {
        const on = events[s.id]
        return (
          <Row key={s.id} attrs={{ 'data-sound-event': s.id }} lead={<PlayButton label={`Preview ${s.label}`} onClick={() => previewSound(s.id)} />} label={s.label} help={s.help} style={{ opacity: masterOn && on ? 1 : 0.6 }}>
            <Toggle on={on} label={s.label} onToggle={() => toggleEvent(s.id, !on)} />
          </Row>
        )
      })}
      <Row label="Silent after Shut down" help="Until morning · quiet hours and paused notifications hush it too">
        <Toggle
          on={quiet}
          label="Silent after you close the garden"
          onToggle={() => {
            setQuiet(!quiet)
            writeQuietHours(!quiet)
          }}
        />
      </Row>
    </SCard>
  )
}

/** Kai 2026-10-06: domains are made, renamed, recoloured, merged and deleted here (and on the Tasks
 * page's Organize card) — no longer only from Tasks, create-only. */
function OrganizeCard() {
  return (
    <SCard id="settings-Organize" title="Organize" sub="Domains — the big buckets your projects, areas and tasks sit in" padded>
      <DomainsSettings />
    </SCard>
  )
}

// The capture endpoint's key card lives on the Integrations page, so it has no row of its own.
// 'Sound' returned when Kai un-cut it (2026-07-26); 'Resurfacing' is the cooldown card (punch 21);
// 'Data' holds the importer and punch 50's Trash entry point. UI pass: in the order the page reads.
const SUBNAV_ITEMS = ['Appearance', 'Sound', 'Calendar', 'Timezone', 'Resurfacing', 'Notifications', 'Integrations', 'Organize', 'Data', 'Profile', 'App'] as const
type SubnavItem = (typeof SUBNAV_ITEMS)[number]
const SUBNAV_LABEL: Partial<Record<SubnavItem, string>> = { Timezone: 'Time zone', Data: 'Your data' }

function DesktopSettings() {
  const [active, setActive] = useState<SubnavItem>('Appearance')
  const [page, setPage] = useState<'all' | 'integrations'>('all')

  function go(item: SubnavItem) {
    setActive(item)
    if (item === 'Integrations') return setPage('integrations')
    setPage('all')
    // After the cards render again (coming back from the Integrations page they weren't there).
    requestAnimationFrame(() => document.getElementById(`settings-${item}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div className="st-desk">
      <nav className="st-nav" aria-label="Settings sections">
        <div className="st-nav-in">
          <div className="st-nav-title">
            <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 26, filter: 'var(--shadow-drop-sm)' }} />
            <h1>Settings</h1>
          </div>
          {SUBNAV_ITEMS.map((item) => (
            <button key={item} type="button" className="st-nav-item" aria-current={active === item || undefined} onClick={() => go(item)}>
              {SUBNAV_LABEL[item] ?? item}
            </button>
          ))}
          <div className="st-nav-hand">{page === 'integrations' ? "the garden's irrigation ✿" : 'everything saves as you touch it ✿'}</div>
        </div>
      </nav>

      {/* Kai 2026-10-03: no scroller of its own. Its height was never bounded (the route grows with
          the page — index.css .kf-route), so it never scrolled; it only swallowed the wheel (an
          overflow-y:auto box gets overscroll-behavior: contain) and the page behind it, the one real
          scroller (.app-main-content), stood still unless the pointer was over the left nav. */}
      <div className="st-main">
        {page === 'integrations' ? (
          <IntegrationsPage />
        ) : (
          // Two columns once there's room (settings.css): how the garden looks and keeps time on the
          // left, what it connects to and keeps on the right; one column, in that order, below it.
          <div className="st-cols">
            <div className="st-col">
              <AppearanceCard />
              {/* Sounds un-cut by Kai 2026-07-26 — now a real synthesised layer (lib/sounds.ts). */}
              <SoundCatalogCard />
              <CalendarCard />
              <TimezoneCard />
              <ResurfacingCard />
            </div>
            <div className="st-col">
              <NotificationsCard />
              <IntegrationsSummaryCard onOpenIntegrations={() => go('Integrations')} />
              <OrganizeCard />
              <DataCard />
              <ProfileCard />
              <AppUpdateCard />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MobileSettings() {
  const { data: integrations = [] } = useIntegrations()
  const github = integrations.find((i) => i.provider === 'github')

  return (
    // Kai's phone review: the shell's 16px gutter is the page's (Today's), not 16 + 4 of its own.
    // UI pass: the same cards and rows as the computer, one column.
    <div className="st-phone">
      <div className="st-phone-title">
        <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 34, filter: 'var(--shadow-drop-sm)' }} />
        <h1>Settings</h1>
      </div>
      <AppearanceCard />
      {/* Sounds v2: the phone plays them too, so it gets the same card. */}
      <SoundCatalogCard />
      <CalendarCard phone />
      <TimezoneCard />
      {/* The phone is where the pushes land, so the whole Notifications card lives here too (12i). */}
      <NotificationsCard />
      {/* The phone has no Organize rail — its domains live here. */}
      <OrganizeCard />
      {/* P6: the phone has no Integrations page, so GitHub, the capture key, photos and AI sit here. */}
      <GroupLabel>Connections</GroupLabel>
      <GithubProvider github={github} />
      <CaptureKeyCard />
      <PaperSettingsCard />
      <McpCard />
      {/* Punch 50: the phone's way into Trash. */}
      <DataCard importer={false} />
      <AppUpdateCard />
      <div className="st-phone-foot">everything saves as you touch it ✿</div>
    </div>
  )
}

export function SettingsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileSettings /> : <DesktopSettings />
}
