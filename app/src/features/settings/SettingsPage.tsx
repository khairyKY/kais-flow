import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  isPushSupported,
  useMyPushSubscriptions,
  subscribeThisDevice,
  unsubscribeThisDevice,
  sendTestNotification,
} from '../notifications/api'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { useTheme } from '../../lib/theme'
import { useMotionEnabled, setEffectsEnabled } from '../../lib/motion'
import { Select } from '../../components/Select'
import { useIntegrations } from './api'

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

const flabel: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const fhelp: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }
const chip: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5 }

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
      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 150ms' }} />
    </button>
  )
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 13px', borderRadius: 5, fontSize: 12, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', font: 'inherit',
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
const SOUND_KEY = 'kf_sounds'
const SOUND_CATALOG = [
  { id: 'paper_rustle', label: 'Paper rustle', help: 'Completing a task', defaultOn: true },
  { id: 'petal_fall', label: 'Petal fall', help: 'A bloom moment (project / streak milestone)', defaultOn: true },
  { id: 'distant_chime', label: 'Distant chime', help: 'A ritual begins', defaultOn: false },
  { id: 'birdsong', label: 'Birdsong', help: 'First open of the morning', defaultOn: false },
  { id: 'rain_patter', label: 'Rain patter', help: 'Gentle rain / rainy weather', defaultOn: true },
  { id: 'pencil_scratch', label: 'Pencil scratch', help: 'Saving a journal line', defaultOn: false },
] as const

function readSounds(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SOUND_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return Object.fromEntries(SOUND_CATALOG.map((s) => [s.id, s.defaultOn]))
}

function useSoundSettings() {
  const [sounds, setSounds] = useState(readSounds)
  function set(id: string, on: boolean) {
    setSounds((prev) => {
      const next = { ...prev, [id]: on }
      localStorage.setItem(SOUND_KEY, JSON.stringify(next))
      return next
    })
  }
  const masterOn = Object.values(sounds).some(Boolean)
  function setMaster(on: boolean) {
    const next = Object.fromEntries(SOUND_CATALOG.map((s) => [s.id, on]))
    setSounds(next)
    localStorage.setItem(SOUND_KEY, JSON.stringify(next))
  }
  return { sounds, set, masterOn, setMaster }
}

const COMMON_TIMEZONES = ['Africa/Cairo', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai']

function AppearanceCard() {
  const { mode, setMode } = useThemeMode()
  const motionOn = useMotionEnabled()
  const [animOn, setAnimOn] = useState(motionOn)

  return (
    <SCard tapeTint="rgba(138,154,126,0.4)">
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div style={{ flex: 'none' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Paper texture</div>
          <div style={fhelp}>the grain over everything · 60%</div>
        </div>
        <div style={{ flex: 1, maxWidth: 240, height: 4, borderRadius: 2, background: 'var(--line-solid)', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '60%', borderRadius: 2, background: 'var(--acc-sage)' }} />
          <span style={{ position: 'absolute', left: '60%', top: '50%', transform: 'translate(-50%, -50%)', width: 15, height: 15, borderRadius: '50%', background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)', boxShadow: 'var(--shadow-crisp)' }} />
        </div>
        <div style={{ width: 64, height: 44, flex: 'none', border: '1px solid var(--line-card)', borderRadius: 5, background: 'var(--paper-linen)', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.6 }} />
          <img src="/ds/assets/clover/awake.png" alt="" style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', height: 22 }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Botanical animations</div>
          <div style={fhelp}>petal falls, leaf sways · bows to reduced-motion</div>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 2px' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Accent</div>
          <div style={fhelp}>terracotta by default — the one warm thing</div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <span style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--acc-terra)', outline: '1.5px solid var(--paper-parchment)', boxShadow: '0 0 0 3px var(--acc-terra)' }} />
          <span style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--acc-moss)' }} />
          <span style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--acc-lavender-deep)' }} />
          <span style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--acc-gold)' }} />
        </div>
      </div>
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
        <span style={{ ...chip, background: 'rgba(138,154,126,0.18)', color: 'var(--acc-sage-text)' }}>saved ✓</span>
      </div>
      <p style={{ margin: '6px 0 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }}>
        Used everywhere the app needs to know "what day is it" — due dates, routine checks, the daily summary. Stored in UTC, converted at the edges.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ ...flabel, fontSize: 8.5, marginBottom: 6, color: 'var(--ink-hairline)' }}>Common timezones</div>
          <Select value={tz} onChange={apply} ariaLabel="Common timezones" options={COMMON_TIMEZONES.map((z) => ({ value: z, label: z }))} style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)' }} />
        </div>
        <div>
          <div style={{ ...flabel, fontSize: 8.5, marginBottom: 6, color: 'var(--ink-hairline)' }}>Or custom IANA name</div>
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

function IntegrationsSummaryCard({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { data: integrations = [] } = useIntegrations()
  const google = integrations.find((i) => i.provider === 'google')
  const github = integrations.find((i) => i.provider === 'github')
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Integrations · Google Calendar</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: google ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
          {google ? `Connected · last synced ${new Date(google.updated_at).toLocaleString()}` : 'Not connected'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={!google} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 15px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: google ? 'pointer' : 'default', opacity: google ? 1 : 0.5 }}>Sync now</button>
        <button type="button" disabled={!google} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 14px', borderRadius: 999, cursor: google ? 'pointer' : 'default', opacity: google ? 1 : 0.5 }}>Disconnect</button>
      </div>
      <div style={fhelp}>mirrors events in and out invisibly — never its own UI · scopes: calendar.events read/write</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: github ? 'var(--acc-gold-warm)' : 'var(--line-solid)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>GitHub · issues → inbox</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>{github ? 'configured' : 'not connected'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line-solid)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Groq · chat + parse</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onOpenIntegrations}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}
        >
          open integrations status →
        </button>
      </div>
    </SCard>
  )
}

const RITUAL_REMINDERS_KEY = 'kf_ritual_reminders'

function PushCard() {
  const { data: subs = [] } = useMyPushSubscriptions()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [remindersOn, setRemindersOn] = useState(() => localStorage.getItem(RITUAL_REMINDERS_KEY) !== '0')
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.')
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Test send failed.')
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Ritual reminders</div>
          <div style={fhelp}>morning 8:30 · evening 21:30 — a nudge, never a lock</div>
        </div>
        <Toggle
          on={remindersOn}
          onToggle={() => {
            const next = !remindersOn
            setRemindersOn(next)
            localStorage.setItem(RITUAL_REMINDERS_KEY, next ? '1' : '0')
          }}
        />
      </div>
      <div style={fhelp}>iphone: install to home screen first (share → add to home screen) — safari tabs can't receive push</div>
    </SCard>
  )
}

function CaptureApiCard() {
  return (
    <SCard>
      <div style={{ ...flabel, marginBottom: 12 }}>Capture API · external capture</div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-muted)' }}>
        Post text or voice into the same pipeline from anywhere — Tasker, a share-sheet, a bookmarklet.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '10px 13px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>not set up yet</span>
      </div>
      <div style={{ marginTop: 10, background: 'rgba(42,36,32,0.05)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '10px 13px', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.7, color: 'var(--ink-muted)' }}>
        POST /capture · body: {'{"text": "call omar tomorrow 3pm"}'}
        <br />→ parsed, filed, or held in Inbox — same as ⌘K
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
    </SCard>
  )
}

function ProviderRow({ icon, name, desc, status }: { icon: ReactNode; name: string; desc: string; status: ReactNode }) {
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
    </SCard>
  )
}

function GithubGlyph({ dim }: { dim?: boolean }) {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 8, background: '#2a2420', color: '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', opacity: dim ? 0.75 : 1 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.6 2 12.3c0 4.6 2.9 8.4 6.8 9.8.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 4-2.4 4.8-4.6 5.1.4.3.7 1 .7 1.9v2.8c0 .3.2.6.7.5a10.2 10.2 0 0 0 6.8-9.8C22 6.6 17.5 2 12 2Z" /></svg>
    </span>
  )
}

function IntegrationsPage() {
  const { data: integrations = [] } = useIntegrations()
  const github = integrations.find((i) => i.provider === 'github')
  const google = integrations.find((i) => i.provider === 'google')

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 500, color: 'var(--ink-body)' }}>Integrations</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-muted)' }}>Everything that feeds the inbox, and the rules it follows.</p>
      </div>

      <ProviderRow
        icon={<GithubGlyph dim={!github} />}
        name="GitHub"
        desc="Issues and mentions from watched repos, filed as inbox letters."
        status={
          github ? (
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc-sage)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Connected · synced {new Date(github.updated_at).toLocaleTimeString()}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'underline', cursor: 'pointer' }}>Disconnect</div>
            </div>
          ) : (
            <button type="button" style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', flex: 'none' }}>Connect</button>
          )
        }
      />

      <ProviderRow
        icon={
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.7" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" /></svg>
          </span>
        }
        name="Google Calendar"
        desc="Your calendar stays ours; Google syncs silently underneath."
        status={
          google ? (
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc-sage)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Connected · synced {new Date(google.updated_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : (
            <button type="button" style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', flex: 'none' }}>Connect</button>
          )
        }
      />

      <ProviderRow
        icon={
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.3 19.5a2 2 0 0 0 3.4 0" /></svg>
          </span>
        }
        name="Pushover"
        desc="Delivers ritual reminders and due nudges to any device."
        status={<button type="button" style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', flex: 'none' }}>Connect</button>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={flabel}>Capture from anywhere</span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <SCard style={{ boxShadow: 'var(--shadow-crisp)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-body)' }}>External capture endpoint</div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>not set up yet</div>
          <div style={fhelp}>anything POSTed here lands in your inbox</div>
        </SCard>
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

function SoundCatalogCard() {
  const { sounds, set, masterOn, setMaster } = useSoundSettings()
  return (
    <SCard tapeTint="rgba(154,180,190,0.4)">
      <div style={{ ...flabel, marginBottom: 4 }}>Sound · the garden's voice</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '12px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Sound</div>
          <div style={fhelp}>quiet, papery, never musical</div>
        </div>
        <Toggle on={masterOn} onToggle={() => setMaster(!masterOn)} />
      </div>
      {SOUND_CATALOG.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '1px dashed var(--line-dashed)', opacity: sounds[s.id] ? 1 : 0.6 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line-solid)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="9" height="10" viewBox="0 0 12 14"><path d="M1.5 1.2 11 7l-9.5 5.8V1.2Z" fill="var(--ink-muted)" /></svg>
          </span>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-body)', width: 120, flex: 'none' }}>{s.label}</span>
          <span style={{ ...flabel, fontSize: 8.5, flex: 1 }}>{s.help}</span>
          <Toggle on={sounds[s.id] ?? s.defaultOn} onToggle={() => set(s.id, !(sounds[s.id] ?? s.defaultOn))} />
        </div>
      ))}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="12" height="12" viewBox="0 0 24 24"><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--ink-hairline)" /></svg>
        <span style={fhelp}>The garden is silent after you close it.</span>
      </div>
    </SCard>
  )
}

const SUBNAV_ITEMS = ['Appearance', 'Timezone', 'Integrations', 'Notifications', 'Capture API', 'Profile', 'Sound'] as const
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
        {SUBNAV_ITEMS.filter((i) => i !== 'Sound').map((item) => {
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
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', transform: 'rotate(-1.2deg)', padding: '0 4px' }}>
          {active === 'Integrations' ? "the garden's irrigation ✿" : "where the garden's light gets tuned ✿"}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: '30px 36px 44px', maxWidth: active === 'Integrations' ? 780 : 760, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        {active === 'Integrations' ? (
          <IntegrationsPage />
        ) : (
          <>
            <div id="settings-Appearance"><AppearanceCard /></div>
            <SoundCatalogCard />
            <div id="settings-Timezone"><TimezoneCard /></div>
            <IntegrationsSummaryCard onOpenIntegrations={() => go('Integrations')} />
            <div id="settings-Notifications"><PushCard /></div>
            <div id="settings-Capture API"><CaptureApiCard /></div>
            <ImportCard />
            <div id="settings-Profile"><ProfileCard /></div>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#7a745f', transform: 'rotate(-0.8deg)', padding: '0 4px' }}>
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
  const github = integrations.find((i) => i.provider === 'github')
  const google = integrations.find((i) => i.provider === 'google')
  const { mode, setMode } = useThemeMode()

  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Timezone', value: settings?.timezone ?? '—' },
    { label: 'Google Calendar', value: google ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc-sage)', display: 'inline-block' }} /> Connected</> : 'Not connected' },
    { label: 'GitHub', value: github ? 'Connected' : 'Not connected' },
    { label: 'Notifications', value: `${subs.length} device${subs.length === 1 ? '' : 's'}` },
    { label: 'Capture API', value: 'not set up' },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>Paper texture</span>
          <span style={{ width: 120, height: 4, borderRadius: 2, background: 'var(--line-solid)', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '60%', borderRadius: 2, background: 'var(--acc-sage)' }} />
            <span style={{ position: 'absolute', left: '60%', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--paper-parchment)', border: '1px solid var(--line-solid)' }} />
          </span>
        </div>
      </SCard>

      <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 8, boxShadow: 'var(--shadow-crisp)', marginTop: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px dashed var(--line-dashed)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 1 }}>{r.label}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>{r.value}</span>
            <span style={{ color: 'var(--ink-hairline)', fontSize: 11 }}>›</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', transform: 'rotate(-0.8deg)' }}>everything saves as you touch it ✿</div>
    </div>
  )
}

export function SettingsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileSettings /> : <DesktopSettings />
}
