import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router'
import {
  isPushSupported,
  useMyPushSubscriptions,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../notifications/api'
import { testThisDevice, useDeviceState } from '../notifications/device'
import { blockers } from '../notifications/plan'
import { useAppSettings, updateAppSetting, useCalendarDefaultView, settingSynced, useOwner, type AutoProjectMode, type CalendarDefaultView } from '../../lib/settings'
import { appPlatform, buildStamp, installedVersion, reloadToUpdate } from '../../lib/appUpdate'
import { BUNDLED_VERSION, useWhatsNew } from '../../lib/whatsNew'
import { checkForUpdates } from '../whats-new/check'
import { DownloadLinks } from '../download/DownloadBar'
import { UpdateButton, UpdateNotes } from '../whats-new/WhatsNew'
import { restartTour } from '../tour/help'
import { useAuth } from '../auth/AuthProvider'
import { useTheme, THEME_MODE_KEY, readThemeMode, themeOfMode, GRAIN_KEY, readGrainPct, applyGrainPct, type ThemeMode } from '../../lib/theme'
import { prefWritten, usePrefsVersion } from '../../lib/prefs'
import { clockText, setHour24, useHour24 } from '../../lib/clock'
import { useUiScale, UI_SCALES, TOUCH_UI_SCALE, defaultUiScale, readUiScaleEnv, uiZoom, type UiScale } from '../../lib/uiScale'
import { usePrefersReducedMotion, setEffectsEnabled } from '../../lib/motion'
import { readSoundEvents, writeSoundEvents, readSoundPack, writeSoundPack, readVolume, writeVolume, readQuietHours, writeQuietHours, previewSound, DEFAULT_VOLUME, PACKS, SOUND_PACKS, type SoundEvent, type SoundPack } from '../../lib/sounds'
import { useIntegrations, connectGithub, syncGithub, disconnectGithub, githubState, githubRulesOf, watchingHelp, useGithubRepos, saveGithubRules, type IntegrationStatus } from './api'
import { chooseGoogleCalendars, disconnectGoogle, GOOGLE_RETURN, googleState, refreshGoogleCalendars, setGoogleMirror, startGoogle, syncedLabel, syncGoogle, type GoogleSyncResult } from './api'
import { isCapacitorShell, isNativeShell, openExternal } from '../../lib/platform'
import { MAX_REPOS, type GithubRules } from '../../../../supabase/functions/_shared/github.ts'
import { Select } from '../../components/Select'
import { useCaptureKey, createCaptureKey, deleteCaptureKey, bookmarklet, curlRecipe, CAPTURE_URL } from './captureKey'
import { useMcpKey, createMcpKey, deleteMcpKey, setMcpPersonal, claudeCodeCommand, claudeDesktopConfig, genericConfig, MCP_URL, type McpScope } from './mcpKey'
import { useScansToday } from '../paper/api'
import { DAILY_PAGES, scansLeft } from '../paper/paperMath'
import { usePaperStore } from '../paper/paperStore'
import { useToastStore } from '../../lib/toastStore'
import { BackLink, Button, Chip, KeyCombo, Segmented, Toggle } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Popover } from '../../components/DatePicker'
import { KindGlyph } from '../notifications/KindGlyph'
import { KIND_IDS, KIND_LOOK } from '../notifications/kinds'
import { NOTIFY_PACKS, NOTIFY_PACK_LOOK, NOTIFY_SOUNDS, NOTIFY_SOUND_LABEL, parseNotifyPack, previewNotifySound, type NotifyPack } from '../notifications/sounds'
import { QUIET_FROM, QUIET_TO } from '../../../../supabase/functions/notify/copy.ts'
import { isTauri, native, readTrayShown, writeTrayShown } from '../tray/native'
import { widgetsAvailable } from '../widgets/native'
import { useHideTitles } from '../widgets/bridge'
import { readLock, writeLock } from '../lockscreen/native'
import { TimeField } from '../calendar/TimeField'
import { useDeletedItems } from '../trash/api'
import { appZone, deviceZone, isZone, searchZones, zoneCity } from '../../lib/appZone'
import { readViewOptions, writeViewOptions, type CalViewOptions } from '../calendar/ViewOptionsPopover'
import { CALENDAR_SHORTCUTS, COMMAND_BAR_SHORTCUTS, GLOBAL_SHORTCUTS } from '../../lib/shortcuts'
import type { ShortcutEntry } from '../../lib/pageShortcutsStore'
import { useSignOut } from '../auth/useSignOut'
import { useDomains } from '../domains/api'
import { CAT, CATS, DESKTOP_HOME, GROUPS, anchorTarget, isCat, isProvider, matches, type CatId, type ProviderId } from './categories'
import { parseWeekend, weekendLabel, weekendPreset, WEEKEND_PRESETS } from '../../lib/weekend'
import { planGlossary } from '../tasks/planMath'
import { DomainsSettings } from '../domains/DomainList'
import { LabelManager } from '../tasks/LabelManager'
import { ConfirmCard } from '../projects/ConfirmCard'
import { runExport } from '../export/api'
import { useConsents } from '../legal/api'
import { LegalLink, PRIVACY_URL, TERMS_URL } from '../legal/LegalLinks'
import { DeleteAccountDialog, LicensesDialog } from '../legal/LegalDialogs'
import { PRIVACY_VERSION, TERMS_VERSION } from '../../../../supabase/functions/_shared/legal.ts'
import type { ExportKind } from '../export/files'
import './settings.css'

// Settings, layout A + rows A (Settings options.html, Kai 2026-10-25 "layout A, rows A"): eleven
// categories down the left (a list that drills in on a phone), one on the right; each category is a few
// sections, each section a rounded panel of rows — label + one short help line, the control on the right,
// a choice of more than three as a picker, the danger zone a terra-edged panel. Search heads the list and
// shows the matching rows themselves, real controls and all (the same components, filtered — so a row
// can't drift from its search result). Earlier history: Settings.dc.html t1–t3, the UI pass of 2026-10-08.

/** What a row needs to know: the search (if any) and the category it sits in. */
interface Scope {
  q: string
  cat: CatId | null
  /** › on a search result: its category, the row lit. */
  open: (cat: CatId, key: string) => void
}
const ScopeCtx = createContext<Scope>({ q: '', cat: null, open: () => {} })

/** One section: a title (+ a note, + something on its right, + one short line) over a rounded panel of
 * rows. In search results the title becomes the crumb "Category › Section" and the panel keeps only the
 * rows that match (settings.css hides the rest, and a section left with none). */
/** Marks what stays on this device while everything else follows the person (settings-sync 2026-10-26):
 * the push subscription, Android's alarm and battery rows, the Windows tray and start-up, the widgets,
 * the updater. */
const DeviceTag = () => <span className="st-device" title="Kept on this device — your other devices have their own">This device</span>

function SCard({ id, title, note, sub, aside, danger, padded, device, children }: { id?: string; title?: string; note?: string; sub?: ReactNode; aside?: ReactNode; danger?: boolean; padded?: boolean; device?: boolean; children: ReactNode }) {
  const { q, cat } = useContext(ScopeCtx)
  return (
    <section id={id} className={`st-sec${danger ? ' is-danger' : ''}`}>
      {q && cat ? (
        <div className="st-crumb">
          <Icon name={CAT[cat].icon} size={15} />
          {CAT[cat].name}
          {title ? ` › ${title}` : ''}
        </div>
      ) : (
        (title != null || aside != null) && (
          <header className="st-sec-head">
            {title != null && (
              <h3 className="st-title">
                {title}
                {device && <DeviceTag />}
                {note && <small>{note}</small>}
              </h3>
            )}
            {aside}
            {sub != null && <p className="st-sub">{sub}</p>}
          </header>
        )
      )}
      <div className={`st-panel${padded ? ' is-padded' : ''}`}>{children}</div>
    </section>
  )
}

/** A search hit inside a label, marked. */
function marked(text: string, q: string): ReactNode {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return text
  return text.split(new RegExp(`\\b(${words.join('|')})`, 'i')).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
}

/** The one row: label + one short help line, the control right-aligned (it drops under the label only
 * when they don't fit side by side); `under` = a full-width block. `find` names a row whose label isn't
 * plain text, `keys` are the other words search should find it by ("dark" → Theme). `to` makes the whole
 * row a link with a ›. Under a search, a row that doesn't match isn't drawn, and one that does gets a ›. */
function Row({ label, help, lead, under, style, attrs, find, keys, to, device, children }: { label: ReactNode; help?: ReactNode; lead?: ReactNode; under?: ReactNode; style?: CSSProperties; attrs?: Record<string, string>; find?: string; keys?: string; to?: string; device?: boolean; children?: ReactNode }) {
  const { q, cat, open } = useContext(ScopeCtx)
  const key = find ?? (typeof label === 'string' ? label : '')
  if (q && !matches(q, key, typeof help === 'string' ? help : '', keys)) return null
  const go = q && cat && !to ? (
    <button type="button" className="st-go" aria-label={`Open ${CAT[cat].name}`} title={`Open ${CAT[cat].name}`} onClick={() => open(cat, key)}>
      <Icon name="chevright" size={16} />
    </button>
  ) : null
  const inner = (
    <>
      {lead && <span className="st-lead">{lead}</span>}
      <div className="st-row-text">
        <div className="st-label">
          {q && typeof label === 'string' ? marked(label, q) : label}
          {device && <DeviceTag />}
        </div>
        {help != null && <div className="st-help">{help}</div>}
      </div>
      {(children != null || go || to) && (
        <div className="st-ctrl">
          {children}
          {go}
          {to && <Icon name="chevright" size={16} className="st-chev" />}
        </div>
      )}
      {under != null && <div className="st-under">{under}</div>}
    </>
  )
  const cls = `st-row${lead ? ' has-lead' : ''}${to ? ' is-link' : ''}`
  return to ? (
    <Link to={to} className={cls} style={style} data-st-key={key || undefined} {...attrs}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={style} data-st-key={key || undefined} {...attrs}>
      {inner}
    </div>
  )
}

/** A block that isn't one row (the domain list, the labels): itself on its page, a plain row in search. */
function Find({ label, help, keys, children }: { label: string; help?: string; keys?: string; children: ReactNode }) {
  const { q } = useContext(ScopeCtx)
  return q ? (
    <Row label={label} help={help} keys={keys} />
  ) : (
    <div className="st-block" data-st-key={label}>
      {children}
    </div>
  )
}

/** The picker look (a choice of more than three): our Select's trigger, or a button that opens a search. */
const PICK: CSSProperties = { background: 'var(--paper-bone)', border: '1px solid var(--line-control)', borderRadius: 'var(--radius-md)', color: 'var(--ink-body)' }
const pickFace = (text: ReactNode) => (
  <>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
    <Icon name="chevdown" size={14} style={{ color: 'var(--ink-faint)' }} />
  </>
)
function PickButton({ text, open, label, onClick }: { text: ReactNode; open: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="st-pick" style={{ ...PICK, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-ui)' }} aria-expanded={open} aria-label={label} onClick={onClick}>
      {pickFace(text)}
    </button>
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

// ── Paper texture (punch 53): lib/theme keeps the value and puts it on <html>; it follows the person. ──
function useGrain() {
  const [pct, setPct] = useState(readGrainPct)
  useEffect(() => {
    applyGrainPct(pct)
  }, [pct])
  function set(next: number) {
    setPct(next)
    try {
      localStorage.setItem(GRAIN_KEY, String(next))
      prefWritten(GRAIN_KEY)
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

function useThemeMode() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const [mode, setMode] = useState<ThemeMode>(readThemeMode)

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
    try {
      localStorage.setItem(THEME_MODE_KEY, next)
      prefWritten(THEME_MODE_KEY) // every device wears it (Auto: each its own system's)
    } catch {
      /* this session only */
    }
    setMode(next)
    setTheme(themeOfMode(next))
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
    <SCard id="settings-Appearance">
      <Row label="Theme" help="Auto follows your system" keys="dark light night day mode colour color">
        <Segmented<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]} />
      </Row>
      {/* R4 (Kai 2026-07-20): labelled in the percentages he used. Polish F2b: the default is per
          device (125% on a computer, 100% on a phone), so the help names this device's own normal. Synced per
          kind of device (settings-sync, 2026-10-26): a phone follows your phones, a computer your computers. */}
      <Row label="Interface size" help={`Scales the whole app · same on all your ${defaultUiScale(readUiScaleEnv()) === TOUCH_UI_SCALE ? 'phones' : 'computers'} · ${Math.round(defaultUiScale(readUiScaleEnv()) * 100)}% is normal here`} keys="zoom scale bigger smaller text font">
        <Select
          value={String(scale)}
          onChange={(v) => setScale(Number(v) as UiScale)}
          options={UI_SCALES.map((s) => ({ value: String(s), label: `${Math.round(s * 100)}%` }))}
          ariaLabel="Interface size"
          className="st-pick"
          style={PICK}
          display={pickFace(`${Math.round(scale * 100)}%`)}
        />
      </Row>
      <Row label="Paper texture" help={`The grain on paper pages · ${grain.pct}%`} keys="grain noise">
        <Slider ariaLabel="Paper texture" value={grain.pct} onChange={grain.set} width={140} />
        <span aria-hidden="true" style={{ width: 56, height: 36, flex: 'none', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', background: 'var(--paper-linen)', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: grain.pct / 100 }} />
          <img src="/ds/assets/clover/awake.png" alt="" style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', height: 20 }} />
        </span>
      </Row>
      <Row label="Botanical animations" help={osReduced ? 'Your system asks for less motion, so the garden holds still' : 'Petals fall, leaves sway'} keys="motion effects petals reduce">
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

// Queue items 7 + 17 (Kai 2026-10-23/25): what the AI may do on its own with what you capture and make,
// synced on the settings row (migration 0086). Both default to the light touch: captures wait in the
// Inbox; a project is suggested, never put. Until the server has the columns the rows are shown, off.
function CaptureAiCard() {
  const { data: s } = useAppSettings()
  const ready = settingSynced('auto_file_captures')
  const fileOn = s?.auto_file_captures === true
  const project: AutoProjectMode = s?.auto_project === 'off' || s?.auto_project === 'assign' ? s.auto_project : 'suggest'
  const later = 'Arrives with the next server update'
  return (
    <SCard id="settings-Capture" title="What the AI may do">
      <Row
        label="File captures for me"
        keys="AI auto file inbox"
        help={
          !ready
            ? later
            : fileOn
              ? 'A capture with a date or #project, or one the AI is sure of, becomes a task (Undo) · quick add always makes tasks'
              : 'Captures wait in your Inbox, ⌘K lines with a date or #project too — one tap files them · quick add on Tasks and Today still makes tasks'
        }
      >
        <Toggle on={fileOn} label="File captures for me" disabled={!ready} onToggle={() => updateAppSetting('auto_file_captures', !fileOn)} />
      </Row>
      <Row label="Pick a project for new things" keys="AI project suggest assign" help={!ready ? later : project === 'assign' ? 'Puts a new task or event in its likely project, with Undo' : project === 'suggest' ? 'Offers its likely project — one tap to accept' : 'Leaves new things where you put them'}>
        {ready && (
          <Segmented<AutoProjectMode>
            label="Pick a project for new things"
            value={project}
            onChange={(v) => updateAppSetting('auto_project', v)}
            options={[{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest' }, { value: 'assign', label: 'Assign' }]}
          />
        )}
      </Row>
    </SCard>
  )
}

// The calendar's View options (ViewOptionsPopover's storage, following the person) — the same switches, here too.
function useViewOptions(): [CalViewOptions, (patch: Partial<CalViewOptions>) => void] {
  const [v, setV] = useState(readViewOptions)
  const set = (patch: Partial<CalViewOptions>) => {
    const next = { ...readViewOptions(), ...patch }
    writeViewOptions(next)
    setV(next)
  }
  return [v, set]
}

// Photos of your pages · Sharing (Paper Capture.dc.html 11o, and the share target), out of the old
// Integrations page into Capture & AI.
function PhotosSections() {
  const { data: settings } = useAppSettings()
  const keep = settings?.capture_keep_photos !== false
  const used = Math.min(DAILY_PAGES, useScansToday())
  const waiting = usePaperStore((s) => s.waiting)
  return (
    <>
      <SCard title="Photos of your pages">
        <Row label="Page photos" help={keep ? 'So you can look back at the page, then they’re deleted' : 'Deleted within the hour after you review them'} keys="paper scan camera photo AI">
          <Segmented<'keep' | 'drop'> label="Photos of your pages" value={keep ? 'keep' : 'drop'} onChange={(v) => updateAppSetting('capture_keep_photos', v === 'keep')} options={[{ value: 'keep', label: 'Keep for 7 days' }, { value: 'drop', label: 'Delete after reading' }]} />
        </Row>
        <Row label="Scans today" help={`${DAILY_PAGES} pages a day`} keys="paper scan camera">
          <span className="st-meter" aria-label={`${used} of ${DAILY_PAGES} pages, ${scansLeft(used)} left`}>
            <i>
              <b style={{ width: `${(used / DAILY_PAGES) * 100}%` }} />
            </i>
            {used} of {DAILY_PAGES}
          </span>
        </Row>
        <Row label="Read when offline" help="Waiting on this device" keys="paper scan queue">
          <span className="st-value">Queue · {waiting}</span>
        </Row>
      </SCard>
      <SCard title="Sharing">
        <Row label="Share to Kai’s Flow" help="In the phone’s share sheet once the app (or the installed web app) is on it · text and links, not images yet" keys="share target android phone" />
      </SCard>
    </>
  )
}

function CalendarCat() {
  const phone = useIsMobile()
  const h24 = useHour24()
  const [v, setV] = useViewOptions()
  const [zoneOpen, setZoneOpen] = useState(false)
  const gg = googleState(useIntegrations().data?.find((i) => i.provider === 'google'))
  return (
    <>
      <SCard id="settings-Timezone" title="Time">
        <TimezoneRow />
        {/* Kai 2026-10-22: one clock for every time the app shows — the calendar's View options switch, here
            too (lib/clock; every device). */}
        <Row label="Time format" help={h24 ? 'Every time reads 13:30' : 'Every time reads 1:30 PM'} keys="12 24 hour clock">
          <Segmented<'12' | '24'> label="Time format" value={h24 ? '24' : '12'} onChange={(x) => setHour24(x === '24')} options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} />
        </Row>
        <WeekendSetting />
        <Row label="Week starts on" help="Also in the calendar’s View options" keys="monday sunday first day">
          <Segmented<'mon' | 'sun'> label="Week starts on" value={v.weekStartsMon ? 'mon' : 'sun'} onChange={(x) => setV({ weekStartsMon: x === 'mon' })} options={[{ value: 'mon', label: 'Mon' }, { value: 'sun', label: 'Sun' }]} />
        </Row>
      </SCard>
      <SCard id="settings-Calendar" title="Calendar">
        <Row label="Opens on" help="On every device · the toolbar still switches it" keys="default view day week">
          <CalendarViewSeg platformDefault={phone ? 'day' : 'week'} />
        </Row>
        <Row label="Fit days to the window" help="Responsive: as many days as the width fits" keys="responsive width">
          <Toggle on={v.responsive} label="Fit days to the window" onToggle={() => setV({ responsive: !v.responsive })} />
        </Row>
        <Row label="Fit hours to my day" help="Dynamic: the grid starts and ends with your blocks" keys="dynamic">
          <Toggle on={v.dynamic} label="Fit hours to my day" onToggle={() => setV({ dynamic: !v.dynamic })} />
        </Row>
        <Row label="Density" help="How tall an hour is" keys="compact height size">
          <Segmented<CalViewOptions['density']> label="Density" value={v.density} onChange={(density) => setV({ density })} options={[{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }]} />
        </Row>
        <Row
          label="Second time zone"
          help="A second hour column beside yours"
          keys="clock zone"
          under={
            zoneOpen && (
              <ZoneSearch
                current={v.secondZone ?? ''}
                lead={
                  v.secondZone != null && (
                    <button type="button" className="st-link" onClick={() => { setV({ secondZone: null }); setZoneOpen(false) }} style={{ marginBottom: 6 }}>
                      Turn it off
                    </button>
                  )
                }
                onPick={(z) => { setV({ secondZone: z }); setZoneOpen(false) }}
              />
            )
          }
        >
          <PickButton text={v.secondZone ? zoneCity(v.secondZone) : 'Off'} open={zoneOpen} label="Second time zone" onClick={() => setZoneOpen(!zoneOpen)} />
        </Row>
        <Row label="Now card" help="Bottom left of the calendar: what’s on now, or next" keys="ongoing up next">
          <Toggle on={v.nowCard} label="Now card" onToggle={() => setV({ nowCard: !v.nowCard })} />
        </Row>
      </SCard>
      <SCard title="Planning">
        <Row label="Plan shortcuts" help="Today, Next free slot, This weekend…" keys="glossary">
          <PlanGlossaryLink />
        </Row>
        {/* Shows in two places: its controls live in Integrations › Google Calendar. */}
        <Row label="Google Calendar" help="Read-only on yours · your plan there as busy" keys="google sync">
          <span className="st-chip"><span className="st-dot" style={{ background: TONE_DOT[gg.tone] }} />{gg.tone === 'off' ? 'Not connected' : gg.tone === 'bad' ? 'Reconnect' : 'Connected'}</span>
          <Link to="/settings/integrations/google" className="st-link">Manage</Link>
        </Row>
      </SCard>
    </>
  )
}

// Kai 2026-10-07: "My weekend is Friday and Saturday… Don't force people to be someone they're not."
// app_settings.weekend_days (lib/weekend) — what the Plan menu's "This weekend" lands on.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKEND_OPTIONS = [...WEEKEND_PRESETS.map((p) => ({ value: p.key as string, label: p.label })), { value: 'custom', label: 'Custom' }]
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
      keys="days off friday saturday sunday"
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
      <Select
        value={shown}
        onChange={(v) => {
          setCustomOpen(v === 'custom')
          const p = WEEKEND_PRESETS.find((x) => x.key === v)
          if (p) set([...p.days])
        }}
        options={WEEKEND_OPTIONS}
        ariaLabel="Weekend"
        className="st-pick"
        style={PICK}
        display={pickFace(WEEKEND_OPTIONS.find((o) => o.value === shown)?.label)}
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
    : r.kind === 'store' ? 'Updates come from the Microsoft Store'
    : r.kind === 'dev' ? 'This is a development build — nothing to compare it with'
    : 'Couldn’t reach the update check — look at the connection and try again'
  return (
    <SCard id="settings-App">
      <Row
        device
        label="Kai’s Flow"
        help={`${current}${built ? ` · built ${built}` : ''}`}
        keys="version update check build"
        under={
          line && !checking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span role="status" style={{ fontSize: 13, color: r?.kind === 'offline' ? 'var(--ink-muted)' : 'var(--ink-body)' }}>{line}</span>
              {/* A newer release has its Update beside its notes below; this is a newer deploy of the same version. */}
              {!available && r?.kind === 'reload' && <Button variant="cta" onClick={() => void reloadToUpdate()}>Reload</Button>}
              {!available && r?.kind === 'download' && <UpdateButton result={r} />}
            </div>
          )
        }
      >
        <Button variant="secondary" disabled={checking} onClick={() => void checkForUpdates(uid)}>
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </Row>
      {/* Kai 2026-10-14: the download bar's links for good, so dismissing it is never a dead end. Not in the
          Microsoft Store install: the Store updates it, and a Store app mustn't hand out its own .exe. */}
      {r?.kind !== 'store' && (
        <Row label="Download the apps" help="Android, Windows and Mac · always the newest release" keys="android windows mac apk installer dmg">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <DownloadLinks />
          </div>
        </Row>
      )}
      {/* Tour & help (Tour and Help Guide.dc.html, "Also in Settings → App"): the notes again. */}
      <Row label="What’s new" help="In your version, and what’s coming" keys="release notes changelog" under={<UpdateNotes running={running} />} />
      <Row label="The tour" help="Replays the notes on Today and clears seen hints" keys="help onboarding show me around">
        <Button variant="secondary" onClick={restartTour}>Show me around again</Button>
      </Row>
      <LicensesRow />
      <Row label="Guide" help="How the method and every page work" keys="help manual">
        <Link to="/guide" className="st-link">Open the Guide</Link>
      </Row>
    </SCard>
  )
}

// User time zones (2026-10-04): the zone every "what day is it" reads (lib/appZone.ts) — Today,
// "Tomorrow 09:00", due dates, routines, the morning digest and evening nudge, chat. Any IANA zone
// Intl knows, searched; this device's own zone offered first.
const zoneOffset = (z: string) => new Date().toLocaleTimeString('en-GB', { timeZone: z, timeZoneName: 'shortOffset' }).split(' ').pop()

/** The zone search (Time zone, Second time zone): this device's zone first, then a typed search. */
function ZoneSearch({ current, onPick, lead }: { current: string; onPick: (zone: string) => void; lead?: ReactNode }) {
  const [q, setQ] = useState('')
  const device = deviceZone()
  const matches_ = searchZones(q)
  const option: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 40, textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--line-dashed)', padding: '9px 4px', fontFamily: 'inherit', fontSize: 'var(--fs-body-s)', color: 'var(--ink-body)', cursor: 'pointer' }
  return (
    <>
      {lead}
      {device !== current && isZone(device) && (
        <button type="button" className="st-link" onClick={() => onPick(device)} style={{ marginBottom: 6, display: 'flex' }}>
          Use this device’s zone ({device})
        </button>
      )}
      <input type="search" className="st-field" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search time zones" placeholder="Search a city or region — e.g. London" autoFocus />
      {matches_.length > 0 && (
        <div role="listbox" aria-label="Time zones" style={{ marginTop: 6 }}>
          {matches_.map((z) => (
            <button key={z} type="button" role="option" aria-selected={z === current} onClick={() => isZone(z) && onPick(z)} style={option}>
              <span>{z.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{zoneOffset(z)}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim() && matches_.length === 0 && <div className="st-help" style={{ marginTop: 8 }}>No zone matches “{q.trim()}”</div>}
    </>
  )
}

function TimezoneRow() {
  const { data: settings } = useAppSettings()
  const [open, setOpen] = useState(false)
  if (!settings) return null
  const tz = settings.timezone
  return (
    <Row
      label="Time zone"
      help="What “today” and “tomorrow 09:00” mean, on every device"
      keys="timezone city zone"
      under={open && <ZoneSearch current={tz} onPick={(z) => { updateAppSetting('timezone', z); setOpen(false) }} />}
    >
      <PickButton text={`${tz} · ${zoneOffset(tz)}`} open={open} label="Time zone" onClick={() => setOpen(!open)} />
    </Row>
  )
}

const TONE_DOT = { ok: 'var(--check-fill)', bad: 'var(--acc-terra-ink)', off: 'var(--line-control)' } as const

const statusChip = (text: string, tone: keyof typeof TONE_DOT) => (
  <span className="st-chip" style={tone === 'bad' ? { color: 'var(--acc-terra-ink)', borderColor: 'currentColor' } : undefined}>
    <span className="st-dot" style={{ background: TONE_DOT[tone] }} />
    {text}
  </span>
)
const brand = (icon: ReactNode, gh = false) => <span className={`st-brand${gh ? ' is-gh' : ''}`}>{icon}</span>

function IntegrationsCat() {
  const { data: integrations = [] } = useIntegrations()
  const { data: mcp } = useMcpKey()
  const { data: cap } = useCaptureKey()
  const github = integrations.find((i) => i.provider === 'github')
  const gh = githubState(github)
  const gg = googleState(integrations.find((i) => i.provider === 'google'))
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: appZone() })
  return (
    <>
      <SCard id="settings-Integrations" title="Connected apps">
        {/* B1 (2026-10-13): read-only, under our own calendar; our plan out as busy (2026-10-14). */}
        <Row to="/settings/integrations/google" lead={brand(<Icon name="calendar" size={17} />)} label="Google Calendar" help="Your calendars on ours, read-only · your plan there as busy" keys="google sync calendars busy">
          {statusChip(gg.text, gg.tone)}
        </Row>
        <Row to="/settings/integrations/github" lead={brand(<GithubMark size={16} />, true)} label="GitHub" help={githubRulesOf(github).rules.land === 'tasks' ? 'Issues land straight in Tasks' : 'Issues land in the Inbox'} keys="github issues repos token pause">
          {statusChip(gh.text, gh.tone)}
        </Row>
      </SCard>
      <SCard title="AI">
        <Row to="/settings/integrations/mcp" lead={brand(<Icon name="chat" size={17} />)} label="AI assistants (MCP)" help="Let Claude or another assistant read your garden, and change it if you allow" keys="mcp claude assistant key journal people">
          {mcp ? statusChip(mcp.scope === 'read' ? 'Read only' : 'Read & write', 'ok') : statusChip('Not set up', 'off')}
        </Row>
        <Row lead={brand(<Icon name="sprout" size={17} />)} label="Groq" help="Chat and capture parsing · keeps nothing" keys="AI chat model">
          <span className="st-value">Built in</span>
        </Row>
      </SCard>
      <SCard title="Capture from anywhere">
        {/* Kai 2026-10-12 moved the key to a quiet Advanced section; the grouping (2026-10-25) brings it here. */}
        <Row to="/settings/integrations/capture-key" lead={brand(<Icon name="link" size={17} />)} label="Capture key & bookmarklet" help="Send anything to your Inbox from shortcuts, scripts or a bookmark" keys="external capture endpoint api bookmarklet shortcut key">
          {cap ? statusChip(`Key made ${day(cap.updated_at)}`, 'ok') : statusChip('Not set up', 'off')}
        </Row>
      </SCard>
    </>
  )
}

// Settings → Notifications (Tray and Notifications.dc.html 12i), synced per account (app_settings
// 0045 + 0048): notify reads every switch here (supabase/functions/notify/copy.ts `deliver`), and
// the app's own notices (focus done; reminders in the Windows app) follow the same rules. Times are
// wall-clock in the user's zone (Settings → Timezone). The Windows rows are this device's own.
const RITUAL_AT = { morning_digest: '08:00', evening_nudge: '21:00' } as const

function NotificationRow({ glyph, label, help, keys, children }: { glyph: ReactNode; label: string; help?: ReactNode; keys?: string; children: ReactNode }) {
  return (
    <Row lead={glyph} label={label} help={help} keys={`notification ${keys ?? ''}`}>
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
  const supported = isPushSupported()
  const thisDeviceLabel = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : ''
  const [device, recheck] = useDeviceState(subs)
  // This browser's own endpoint when it has one (a browser update changes the label, not the endpoint).
  const subscribed = device?.subscribed || subs.some((d) => d.device_label === thisDeviceLabel)
  if (!s) return null
  const inTheWay = device ? blockers(device, s, new Date(), appZone()) : []
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
      recheck()
    }
  }

  async function handleTest() {
    setBusy(true)
    setMessage(null)
    try {
      // The same way a real reminder reaches this device: a Windows toast, Android's own, or a push.
      setMessage(await testThisDevice(subs))
    } catch {
      setMessage("The test didn't go out — try again in a moment.")
    } finally {
      setBusy(false)
      recheck()
    }
  }

  const glyph = (name: 'moon' | 'lock') => <Icon name={name} size={18} />

  return (
    <>
    <SCard id="settings-Notifications">
      <Row
        label="This device"
        help={`Calm by default · each kind can be turned off, silent ones never make a sound · times are ${zoneCity(appZone())} time`}
        keys="test notification push"
        under={
          device && (
            <ul aria-label="What’s in the way on this device" data-kf-notify-status className="st-note" style={{ margin: 0, padding: '0 0 0 18px' }}>
              {inTheWay.length ? inTheWay.map((line) => <li key={line}>{line}</li>) : <li>Nothing in the way on this device.</li>}
            </ul>
          )
        }
      >
        <Button variant="secondary" onClick={handleTest} disabled={busy} icon={<Icon name="bell" size={16} />}>
          Send a test notification
        </Button>
      </Row>
      {message && <p role="status" className="st-note st-pad">{message}</p>}
    </SCard>

    <SCard title="Kinds">
      {KIND_IDS.map((kind) => {
        const k = KIND_LOOK[kind]
        const key = `${kind}_on` as const
        const on = s[key] !== false
        const ritual = kind === 'morning_digest' || kind === 'evening_nudge' ? kind : null
        return (
          <NotificationRow key={kind} glyph={<KindGlyph kind={kind} size={28} />} label={k.label} help={`${k.channel} · ${k.silent ? 'silent' : 'with sound'}`} keys={ritual ? 'time ritual' : undefined}>
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
    </SCard>

    <SCard title="Quiet">
      <NotificationRow glyph={glyph('moon')} label="Quiet hours" help="Nothing makes a sound; the tray shows a moon" keys="silent do not disturb night time">
        <TimeField value={(s.quiet_from ?? QUIET_FROM).slice(0, 5)} ariaLabel="Quiet from" onChange={(v) => v && updateAppSetting('quiet_from', v)} style={timeStyle(quietOn)} />
        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>to</span>
        <TimeField value={(s.quiet_to ?? QUIET_TO).slice(0, 5)} ariaLabel="Quiet until" onChange={(v) => v && updateAppSetting('quiet_to', v)} style={timeStyle(quietOn)} />
        <Toggle on={quietOn} label="Quiet hours" onToggle={() => updateAppSetting('quiet_hours_on', !quietOn)} />
      </NotificationRow>
      <NotificationRow glyph={glyph('lock')} label="Show task names on the lock screen" help="Off: “Kai’s Flow · A reminder”" keys="privacy">
        <Toggle on={s.lock_screen_names === true} label="Show task names on the lock screen" onToggle={() => updateAppSetting('lock_screen_names', !s.lock_screen_names)} />
      </NotificationRow>
    </SCard>

    {/* Sound sits with the notices it rides on (the grouping, 2026-10-25). */}
    <SoundCatalogCard />
    <NotificationSoundsCard />

    {/* Only where it applies, as before: the Windows app's rows live in App & updates. */}
    {tauri ? null : device?.channel === 'android' ? (
      <SCard title="This phone" note="Android app only" device>
        <Row label="Reminders on this phone" help="Reminders, the digest, the nudge and focus rounds are set on the phone itself, a week ahead, from what it last synced. Something set on another device reaches the phone the next time the app opens" keys="android notification" />
        {/* notif (2026-10-26): what can hold a reminder back on this phone, each with its Android screen. */}
        {device.exact === false && (
          <Row label="Alarms & reminders" help="Off — reminders can come a few minutes late" keys="android exact alarm">
            <Button variant="secondary" onClick={() => void import('../notifications/android').then((m) => m.openExactAlarmSettings())}>
              Turn on
            </Button>
          </Row>
        )}
        {device.background === false && (
          <Row label="Run in the background" help="Battery saving can hold reminders while the app is closed" keys="android battery background">
            <Button variant="secondary" onClick={() => void import('../notifications/android').then((m) => m.openBackgroundSettings())}>
              Allow
            </Button>
          </Row>
        )}
        <LockScreenRows />
      </SCard>
    ) : (
      <SCard title="This browser" note="web only" device>
        {!supported ? (
          <Row label="Notifications in this browser" help="Not supported here. On iPhone, add the app to your home screen first (Share → Add to Home Screen)" keys="push notification" />
        ) : (
          <Row
            label={`${subs.length} device${subs.length === 1 ? '' : 's'} subscribed`}
            find="This browser: get notifications here"
            keys="push notification subscribe unsubscribe device"
            help={subs.length ? subs.map((d) => (d.device_label === thisDeviceLabel ? 'this device ✓' : (d.device_label ?? 'device').slice(0, 20))).join(' · ') : 'None yet'}
          >
            <Button variant="secondary" onClick={handleSubscribe} disabled={busy}>
              {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
            </Button>
          </Row>
        )}
      </SCard>
    )}
    </>
  )
}

/** Kai's Flow on the lock screen (lockscreen 2026-10-26; native/android/.../widgets/LockScreen.java). Kept
 * per device, so each row says This device. Hidden on an APK from before it (no window.KaisFlowLock). */
function LockScreenRows() {
  const [lock, setLock] = useState(readLock)
  if (!lock) return null
  const set = (nowBar: boolean, dayStrip: boolean) => {
    writeLock(nowBar, dayStrip)
    setLock(readLock())
  }
  const names = 'Names show when “Show task names on the lock screen” is on'
  return (
    <>
      {lock.nowBarSupported && (
        <Row device label="Lock screen: Now Bar" help={`The block that’s on now, as a pill on the lock screen and the Always On Display, with today’s blocks and a countdown. ${names}`} keys="lock screen now bar live update notification android 16 aod">
          <Toggle on={lock.nowBar} label="Lock screen: Now Bar" onToggle={() => set(!lock.nowBar, lock.dayStrip)} />
        </Row>
      )}
      <Row device label="Lock screen: Day strip notification" help={`Today’s blocks across, with a now line and what’s next. It draws its own strip, so it can’t also sit in the Now Bar. ${names}`} keys="lock screen day strip notification ongoing">
        <Toggle on={lock.dayStrip} label="Lock screen: Day strip notification" onToggle={() => set(lock.nowBar, !lock.dayStrip)} />
      </Row>
      <Row
        device
        label="How to add the Top 3 to your lock screen"
        help="Samsung’s lock screen only offers Samsung’s own widgets. Good Lock › LockStar adds any app’s:"
        keys="lock screen widget top 3 good lock lockstar samsung aod"
        under={
          <ol data-kf-lockstar-steps className="st-note" style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'decimal' }}>
            <li>Install Good Lock from the Galaxy Store, then LockStar inside it.</li>
            <li>In LockStar, turn it on and tap the lock screen to edit it.</li>
            <li>Tap Widgets › Kai’s Flow › Top 3 · lock screen, and place it under the clock.</li>
          </ol>
        }
      />
    </>
  )
}

// On this computer (the Windows or Mac app) · On this phone (the Android app's widgets) — App & updates.
function DeviceSections() {
  const tauri = isTauri()
  const mac = appPlatform() === 'mac' // the same rows, in the Mac's words
  const [trayShown, setTrayShown] = useState(readTrayShown)
  const widgets = widgetsAvailable() // the Android app's home-screen widgets
  const hideTitles = useHideTitles((h) => h.on)
  const setHideTitles = useHideTitles((h) => h.set)
  const [autostart, setAutostart] = useState<boolean | null>(null)
  useEffect(() => {
    if (tauri) void native<boolean>('autostart_get').then((on) => setAutostart(!!on))
  }, [tauri])
  return (
    <>
      {tauri && (
        <SCard title="On this computer" note={mac ? 'Mac app only' : 'Windows app only'} device>
          <Row label={mac ? 'Show in the menu bar' : 'Show in the system tray'} help={mac ? 'The K in the menu bar, with a quick flyout' : 'The K by the clock, with a quick flyout'} keys="tray windows mac menu bar">
            <Toggle
              on={trayShown}
              label={mac ? 'Show in the menu bar' : 'Show in the system tray'}
              onToggle={() => {
                writeTrayShown(!trayShown)
                setTrayShown(!trayShown)
              }}
            />
          </Row>
          <Row label={mac ? 'Open at login' : 'Start with Windows'} help={mac ? 'Opens quietly to the menu bar' : 'Opens quietly to the tray'} keys="startup autostart login tray">
            <Toggle on={!!autostart} label={mac ? 'Open at login' : 'Start with Windows'} onToggle={autostart === null ? undefined : () => void native<boolean>('autostart_set', { on: !autostart }).then((on) => setAutostart(!!on))} />
          </Row>
        </SCard>
      )}
      {widgets && (
        <SCard title="On this phone" note="Android app only" device>
          <Row label="Hide titles on the home screen" help="Widgets say “Your goal” · “Pick 2”" keys="widgets privacy android">
            <Toggle on={hideTitles} label="Hide titles on the home screen" onToggle={() => setHideTitles(!hideTitles)} />
          </Row>
        </SCard>
      )}
    </>
  )
}

// ── Resurfacing cooldowns (punch 21, Kai's spec: high ~2d / medium ~5d / low ~10d, tunable).
// Today's resurfacing engine reads exactly these keys, from localStorage; they follow the person
// across devices (lib/prefs). ──
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
      prefWritten(COOLDOWN_KEYS[level])
    } catch {
      /* session-only is fine */
    }
  }
  const row = (level: keyof typeof COOLDOWN_KEYS, label: string, help: string) => (
    <Row label={label} help={help} keys="not now resurfacing cooldown snooze">
      <Slider ariaLabel={`${label} cooldown in days`} value={days[level]} min={1} max={30} onChange={(v) => set(level, v)} width={140} />
      <span className="st-value">{days[level]} {days[level] === 1 ? 'day' : 'days'}</span>
    </Row>
  )
  return (
    <SCard id="settings-Resurfacing" title="“Not now” comes back after">
      {row('high', 'High priority', 'Comes back soonest')}
      {row('med', 'Medium priority', 'A working week, roughly')}
      {row('low', 'Low priority', 'The long shelf')}
    </SCard>
  )
}

// P-IMPORT entry (Settings.dc.html 2a) + punch 50's Trash entry point — one "your data" card.
const linkBtn = 'kf-btn kf-press kf-button kf-button--secondary'
function DataCard() {
  const { data: deletedItems = [] } = useDeletedItems()
  return (
    <SCard id="settings-Data">
      <Row label="Import" help="From Akiflow or a CSV file · re-importing never duplicates" keys="akiflow csv">
        <Link to="/settings/import" className={linkBtn} style={{ textDecoration: 'none' }}>Open importer</Link>
      </Row>
      <ExportRow />
      <Row label="Trash" help={`${deletedItems.length === 0 ? 'Nothing resting' : `${deletedItems.length} item${deletedItems.length === 1 ? '' : 's'} resting`} · composts after 30 days`} keys="delete deleted restore">
        <Link to="/trash" className={linkBtn} style={{ textDecoration: 'none' }}>Open trash</Link>
      </Row>
    </SCard>
  )
}

// The open-source software the app is built with, and its licences (LICENSE: the app itself is proprietary).
function LicensesRow() {
  const [open, setOpen] = useState(false)
  return (
    <Row label="Open-source licences" help="The free software Kai’s Flow is built with, and its licences" keys="licenses licences open source credits third party">
      <Button variant="secondary" onClick={() => setOpen(true)}>Read</Button>
      {open && <LicensesDialog onClose={() => setOpen(false)} />}
    </Row>
  )
}

// docs/LEGAL.md: leaving, from the app itself — the account and everything in it, for good (function
// `delete-account`). The dialog asks for the word DELETE and offers the export first.
function DeleteAccountRow() {
  const [open, setOpen] = useState(false)
  return (
    <Row label="Delete account" help="Your account and everything in it, for good · export first under Your data" keys="delete remove close leave">
      <Button variant="ghost" onClick={() => setOpen(true)}>Delete account…</Button>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </Row>
  )
}

// docs/LEGAL.md: the two policies (on the site, opened in the browser), when you agreed, and the short
// version of where your things live — the Privacy Policy has the long one.
const dayOf = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: appZone() })
function LegalCard() {
  const { data: consents = [] } = useConsents()
  const agreed = (doc: 'terms' | 'privacy', version: string) => {
    const row = consents.filter((c) => c.document === doc && c.version >= version).sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0]
    return row ? ` · you agreed ${dayOf(row.accepted_at)}` : ''
  }
  return (
    <SCard id="settings-Legal">
      <Row label="Privacy Policy" keys="privacy legal" help={`Updated ${dayOf(PRIVACY_VERSION)}${agreed('privacy', PRIVACY_VERSION)}`}>
        <LegalLink href={PRIVACY_URL} className={linkBtn}>Read</LegalLink>
      </Row>
      <Row label="Terms of Use" keys="terms legal" help={`Updated ${dayOf(TERMS_VERSION)}${agreed('terms', TERMS_VERSION)}`}>
        <LegalLink href={TERMS_URL} className={linkBtn}>Read</LegalLink>
      </Row>
      <Row
        label="What we keep, and where"
        help="Your account and what you write: Supabase, in the EU · the AI: Groq (US and elsewhere), set to keep nothing · no ads, no tracking · export it under Your data, delete it under Account"
        keys="privacy data storage"
      />
      {/* Shows in two places: the same switches as Integrations › AI assistants. */}
      <Row label="What AI assistants can see" help="Journal and People stay off unless you allow them" keys="privacy mcp journal people AI">
        <Link to="/settings/integrations/mcp" className="st-link">Manage</Link>
      </Row>
    </SCard>
  )
}

// Gap audit #1 (Kai: "build it"): take it all out — the whole account, tasks for a spreadsheet, the calendar.
const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: 'json', label: 'Everything (.json)' },
  { kind: 'csv', label: 'Tasks (.csv)' },
  { kind: 'ics', label: 'Calendar (.ics)' },
]
function ExportRow() {
  const push = useToastStore((s) => s.push)
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  async function run(kind: ExportKind) {
    setBusy(kind)
    setProgress('Exporting…')
    try {
      const { name, result } = await runExport(kind, (table, n) => setProgress(`Exporting… ${table.replace(/_/g, ' ')} ${n.toLocaleString('en-US')}`))
      if (result !== 'cancelled') push({ message: `${result === 'shared' ? 'Shared' : 'Saved'} ${name}` })
    } catch (e) {
      push({ message: `Couldn’t export: ${(e as { message?: string } | null)?.message ?? String(e)}` })
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }
  return (
    <Row label="Export your data" find="Export your data" help={<span role="status">{progress ?? 'A copy for you to keep · it can’t be imported back yet'}</span>} keys="backup download json csv ics copy">
      {EXPORTS.map((x) => (
        <Button key={x.kind} variant="secondary" loading={busy === x.kind} disabled={busy !== null} onClick={() => void run(x.kind)}>
          {x.label}
        </Button>
      ))}
    </Row>
  )
}

function AccountCat() {
  const session = useAuth().session
  const email = (() => {
    try {
      return session?.user.email ?? localStorage.getItem('kf.lastEmail') ?? ''
    } catch {
      return session?.user.email ?? ''
    }
  })()
  const { flow, workspace } = useOwner()
  const signOut = useSignOut()
  return (
    <>
      <SCard id="settings-Profile">
        <Row label={email || 'Signed in'} find="Email" help="Signed in · one person, one garden" keys="sign out log out account email">
          <Button variant="secondary" onClick={signOut.request}>Sign out</Button>
        </Row>
        <Row label="Name and workspace" help={`${flow} · ${workspace} · the whole app wears it`} keys="rerun welcome onboarding">
          {/* WA-1 punch 3: quiet re-entry to the first-run wizard (name / workspace / seed). */}
          <Link to="/onboarding?replant=1" className="st-link">Rerun the welcome</Link>
        </Row>
      </SCard>
      <SCard title="Danger zone" danger>
        <DeleteAccountRow />
      </SCard>
      {signOut.prompt}
    </>
  )
}

function ProviderRow({ icon, name, desc, status, children }: { icon: ReactNode; name: string; desc: string; status: ReactNode; children?: ReactNode }) {
  return (
    <SCard padded>
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
      <GithubMark size={17} />
    </span>
  )
}

function GithubMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.5 2 2 6.6 2 12.3c0 4.6 2.9 8.4 6.8 9.8.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 4-2.4 4.8-4.6 5.1.4.3.7 1 .7 1.9v2.8c0 .3.2.6.7.5a10.2 10.2 0 0 0 6.8-9.8C22 6.6 17.5 2 12 2Z" /></svg>
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
  const [confirmOff, setConfirmOff] = useState(false)
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
    <SCard id="settings-Advanced" padded title="External capture endpoint" sub="Anything POSTed here lands in your Inbox · a new key stops the old one">
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
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmOff(true)}>
            Turn off
          </Button>
        )}
      </div>
      {/* No Undo here: only the key's hash is stored, and the client never sees it, so a deleted key
          can't be put back — a short confirm instead. */}
      {confirmOff && row && (
        // ds-ok: turning a key off can't be undone (only its hash is stored), so it asks first
        <ConfirmCard
          title="Turn off the capture key?"
          body="Shortcuts and bookmarklets using it stop sending to your Inbox. A new key can be made any time, but this one can't come back."
          confirmLabel="Turn off"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false)
            void run(async () => { await deleteCaptureKey(row.id); setShown(null) })
          }}
        />
      )}
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
  const [scope, setScope] = useState<McpScope>('read_write')
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  // appZone() is validated — a bad stored timezone would make toLocaleDateString throw.
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
  // The real key goes into the snippets only while it's on screen; otherwise a placeholder.
  const key = shown ?? undefined
  const clients = [
    { name: 'Claude Code', how: 'Run it in a terminal.', text: claudeCodeCommand(key) },
    { name: 'Claude Desktop', how: 'Settings → Developer → Edit Config, paste into claude_desktop_config.json, restart Claude. Needs Node.js.', text: claudeDesktopConfig(key) },
    { name: 'Other MCP clients', how: 'The address and the header, in the usual mcpServers shape.', text: genericConfig(key) },
  ]
  return (
    <SCard padded title="AI assistants (MCP)" sub="Let Claude or another assistant read your garden — tasks, projects, calendar, Inbox, routines, Library — and, if you allow it, change things for you.">
      {!row && !shown && <div className="st-help">Not set up yet</div>}
      {row && !shown && (
        <div className="st-help">
          Key made {day(row.updated_at)} · {row.scope === 'read' ? 'read only' : 'read & write'} · {row.last_used_at ? `last used ${day(row.last_used_at)}` : 'not used yet'}
        </div>
      )}
      {/* The personal areas (0080): off for every key until switched on here; the server enforces it. */}
      {row && (
        <>
          <Row label="Journal" help={row.scopes?.includes('journal') ? 'This key can read and write your journal entries' : 'Off: the assistant never sees your journal'} style={{ borderTop: 'none' }}>
            <Toggle on={!!row.scopes?.includes('journal')} label="Let this key reach my journal" disabled={busy} onToggle={() => void run(() => setMcpPersonal(row, 'journal', !row.scopes?.includes('journal')))} />
          </Row>
          <Row label="People" help={row.scopes?.includes('people') ? 'This key can read and write the people you keep and your notes about them' : 'Off: the assistant never sees the people you keep'}>
            <Toggle on={!!row.scopes?.includes('people')} label="Let this key reach my people" disabled={busy} onToggle={() => void run(() => setMcpPersonal(row, 'people', !row.scopes?.includes('people')))} />
          </Row>
        </>
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
      <Row label="Access" help={scope === 'read' ? 'The assistant can look but never change anything' : 'It can also add, change and tick things off — deletes go to Trash'} style={row ? undefined : { borderTop: 'none' }}>
        <Segmented<McpScope> label="Access" value={scope} onChange={setScope} options={[{ value: 'read_write', label: 'Read & write' }, { value: 'read', label: 'Read only' }]} />
      </Row>
      <div className="st-btns">
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => setShown(await createMcpKey(scope)))}>
          {row || shown ? 'New key' : 'Create key'}
        </Button>
        {row && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmOff(true)}>
            Turn off
          </Button>
        )}
      </div>
      {/* No Undo here: only the key's hash is stored, and the client never sees it, so a deleted key
          can't be put back — a short confirm instead (the one other place, besides Delete forever). */}
      {confirmOff && row && (
        // ds-ok: turning a key off can't be undone (only its hash is stored), so it asks first
        <ConfirmCard
          title="Turn off the AI key?"
          body="Any assistant using it stops reaching your garden. A new key can be made any time, but this one can't come back."
          confirmLabel="Turn off"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false)
            void run(async () => { await deleteMcpKey(row.id); setShown(null) })
          }}
        />
      )}
      {err && <div className="st-help" style={{ color: 'var(--acc-terra-ink)', marginTop: 8 }}>{err}</div>}
      <div className="st-help" style={{ marginTop: 10 }}>A new key stops the old one, and starts with Journal and People off · 500 tool calls a day</div>
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

const flabel: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: 'var(--ls-meta)', color: 'var(--ink-faint)' }

// P6 step 1: GitHub issues → inbox. The PAT lives only in this input until it is posted to the
// github-connect edge function; afterwards the client only ever sees login/status/synced_at, plus
// the watched repos and rules (Settings 2a), which hold no secret.
function GithubProvider({ github }: { github?: IntegrationStatus }) {
  const [formOpen, setFormOpen] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const failing = github?.status === 'failing'
  const { rules } = githubRulesOf(github)

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
      const { login } = await connectGithub(token.trim())
      setToken('')
      setFormOpen(false)
      return `Connected as @${login}.`
    })
  const sync = () =>
    run(async () => {
      const r = await syncGithub()
      return `Synced · ${r.fetched} open · ${r.new} new · ${r.dismissed + (r.completed ?? 0)} closed`
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
      desc={rules.land === 'tasks' ? 'Open issues come straight into Tasks, each linked back to GitHub.' : 'Open issues come into your Inbox, ready to become tasks.'}
      status={
        github ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', flex: 'none', maxWidth: '45%' }}>
            <span className="st-dot" style={{ background: TONE_DOT[githubState(github).tone] }} />
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
              <Link to={rules.land === 'tasks' ? '/tasks' : '/inbox'} className="kf-btn kf-press kf-button kf-button--cta" style={{ textDecoration: 'none' }}>
                {rules.land === 'tasks' ? 'See your tasks →' : 'See issues in your Inbox →'}
              </Link>
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
          style={{ display: 'grid', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-dashed)' }}
        >
          <label>
            <div style={{ ...flabel, marginBottom: 6 }}>Fine-grained access token</div>
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" className="st-field" />
            <div className="st-help" style={{ marginTop: 6 }}>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Create one on GitHub</a> — pick the repos it can see, set Issues to read-only (Metadata comes with it), and paste it here. Which repos to watch comes after.
            </div>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="cta" disabled={busy || !token.trim()}>{busy ? 'Connecting…' : 'Connect'}</Button>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {message && <div role="status" className="st-help" style={{ marginTop: 10 }}>{message}</div>}
      {github && !failing && <GithubRulesPanel github={github} />}
    </ProviderRow>
  )
}

// Settings.dc.html 2a "Rules · how GitHub lands": watched repos as chips (the list comes from GitHub
// through github-connect — the token never leaves the server), where new issues land, where GitHub
// letters sit in the Inbox, and Pause. Each change saves at once (github-connect `rules`).
function GithubRulesPanel({ github }: { github: IntegrationStatus }) {
  const { repos, rules, legacy } = githubRulesOf(github)
  const list = useGithubRepos(true)
  const [err, setErr] = useState<string | null>(null)
  const save = (nextRepos: string[], patch: Partial<GithubRules>) => {
    setErr(null)
    saveGithubRules(nextRepos, { ...rules, ...patch }, repos).catch((e: Error) => setErr(e.message))
  }
  const unwatched = (list.data ?? []).filter((r) => !repos.includes(r))
  const addOptions = list.isPending
    ? [{ value: '', label: 'Loading your repos…', disabled: true }]
    : list.isError
      ? [{ value: '', label: list.error.message, disabled: true }]
      : unwatched.length === 0
        ? [{ value: '', label: 'No other repos this token can see', disabled: true }]
        : unwatched.map((r) => ({ value: r, label: r }))

  return (
    <div className="st-gh-rules">
      <div className="st-gh-rules-label" style={flabel}>Rules · how GitHub lands</div>
      <Row label="Watching" help={watchingHelp({ repos, legacy })}>
        {repos.map((r) => (
          <Chip key={r} tone="bordered" style={repoChip}>
            <span title={r}>{r.split('/')[1]}</span>
            <button type="button" className="kf-hit st-chip-x" aria-label={`Stop watching ${r}`} onClick={() => save(repos.filter((x) => x !== r), {})}>✕</button>
          </Chip>
        ))}
        {repos.length < MAX_REPOS && (
          <Select
            value=""
            options={addOptions}
            onChange={(r) => r && save([...repos, r], {})}
            display="+ add repo"
            ariaLabel="Add a repo to watch"
            className="kf-chip kf-chip--bordered"
            style={addChip}
          />
        )}
      </Row>
      <Row label="New issues land in" help={rules.land === 'tasks' ? 'As tasks with no project, linked to the issue · closing it ticks the task off' : undefined}>
        <Segmented<GithubRules['land']> label="New issues land in" value={rules.land} onChange={(land) => save(repos, { land })} options={[{ value: 'inbox', label: 'Inbox' }, { value: 'tasks', label: 'Straight to Tasks' }]} />
      </Row>
      <Row label="Priority in inbox ordering" help="Where GitHub letters sort against voice notes & shares">
        <Segmented<GithubRules['priority']> label="Priority in inbox ordering" value={rules.priority} onChange={(priority) => save(repos, { priority })} options={[{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }]} />
      </Row>
      <Row label="Pause this source" help={rules.paused ? 'Nothing syncs until you turn this off' : undefined}>
        <Toggle on={rules.paused} label="Pause GitHub" onToggle={() => save(repos, { paused: !rules.paused })} />
      </Row>
      {err && <div role="alert" className="st-help" style={{ color: 'var(--acc-terra-ink)', paddingBottom: 12 }}>{err}</div>}
    </div>
  )
}

// 2a's chips: a pill, the repo in body ink; "+ add repo" dashed and faint.
const repoChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 'var(--radius-pill)', borderColor: 'var(--line-solid)', color: 'var(--ink-body)' }
const addChip: CSSProperties = { fontFamily: 'var(--font-mono)', background: 'none', border: '1px dashed var(--line-solid)', borderRadius: 'var(--radius-pill)', color: 'var(--ink-faint)' }

// B1 (Kai 2026-10-13): Google Calendar, read-only — the chosen calendars' events on our grid
// (google-sync, every 15 min); since 2026-10-14 our own blocks go out to the primary calendar as private
// busy events ("Show my plan in Google as busy"), and nothing else there is touched. Connect goes through Google's consent page
// (google-connect); the client only ever sees the account, its calendar list, the chosen ids, status
// and synced_at — never the refresh token. Until Kai sets the two secrets, Connect says which are missing.
function GoogleGlyph({ dim }: { dim?: boolean }) {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)', opacity: dim ? 0.75 : 1 }}>
      <Icon name="calendar" size={18} />
    </span>
  )
}

const syncLine = (r: GoogleSyncResult) =>
  `Synced · ${r.calendars} ${r.calendars === 1 ? 'calendar' : 'calendars'} · ${r.fetched} events · ${r.new} new · ${r.removed} gone${r.out ? ` · ${r.out.blocks} ${r.out.blocks === 1 ? 'block' : 'blocks'} busy in Google` : ''}`

function GoogleProvider({ google }: { google?: IntegrationStatus }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const failing = google?.status === 'failing'
  const state = googleState(google)

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setMessage(null)
    try {
      const m = await action()
      if (m) setMessage(m)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  // Back from Google's consent page: google-connect sent the browser to /settings?google=<code>.
  const [params, setParams] = useSearchParams()
  const landed = useRef(false)
  useEffect(() => {
    const code = params.get('google')
    if (!code || landed.current) return
    landed.current = true
    const said = GOOGLE_RETURN[code === 'connected' ? code : (params.get('reason') ?? '')] ?? GOOGLE_RETURN.google_unavailable
    setParams((p) => {
      p.delete('google')
      p.delete('reason')
      return p
    }, { replace: true })
    if (code !== 'connected') return setMessage(said)
    void run(async () => `Connected · ${syncLine(await syncGoogle())}`)
  }, [params, setParams]) // eslint-disable-line react-hooks/exhaustive-deps -- once per landing
  // The landing's word, in view (on a phone the row sits far down Settings).
  const said = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (landed.current && message) said.current?.scrollIntoView({ block: 'center' })
  }, [message])

  const connect = () =>
    run(async () => {
      const r = await startGoogle()
      if ('missing' in r) return `Not set up yet: ${r.missing.join(' and ')} ${r.missing.length > 1 ? 'aren’t' : 'isn’t'} set on the server. docs/GOOGLE-SETUP.md has the steps (free, about 10 minutes).`
      if (isNativeShell()) {
        // Google refuses its consent page inside an app's web view: the browser does it, the grid follows.
        await openExternal(r.url)
        return 'Finish on Google’s page in your browser. Back here, Sync now brings your calendars in.'
      }
      window.location.assign(r.url)
      return null
    })
  const sync = () => run(async () => syncLine(await syncGoogle()))
  const disconnect = () =>
    run(async () => {
      await disconnectGoogle()
      return 'Disconnected. Google’s events are off your calendar and your blocks are off Google; your own are untouched.'
    })

  return (
    <ProviderRow
      icon={<GoogleGlyph dim={!google} />}
      name="Google Calendar"
      desc="Your Google calendars on ours, read-only — prayer times, work, holidays. Your own blocks show in your main Google calendar as busy."
      status={
        google ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', flex: 'none', maxWidth: '45%' }}>
            <span className="st-dot" style={{ background: TONE_DOT[state.tone] }} />
            <span style={{ fontSize: 'var(--fs-caption)', color: failing ? 'var(--acc-terra-ink)' : 'var(--ink-muted)', textAlign: 'right', overflowWrap: 'anywhere' }}>
              {failing || !google.login ? '' : `${google.login} · `}{state.text}
            </span>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void connect()} disabled={busy}>{busy ? 'Opening…' : 'Connect'}</Button>
        )
      }
    >
      {google && (
        <div className="st-btns" style={{ marginTop: 12 }}>
          {failing ? (
            <Button type="button" variant="secondary" onClick={() => void connect()} disabled={busy}>Reconnect</Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void sync()} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy}>Disconnect</Button>
        </div>
      )}
      {message && <div ref={said} role="status" className="st-help" style={{ marginTop: 10 }}>{message}</div>}
      {google && !failing && <GoogleCalendars google={google} onReconnect={() => void connect()} />}
    </ProviderRow>
  )
}

// Which calendars show, one switch each (saved at once, google-connect `choose`): a newly shown one
// syncs now, a hidden one's events leave the grid. ponytail: the GitHub rules panel's bone sheet.
// Under them, our plan out to Google: the switch once the grant can write, else Reconnect to allow it.
function GoogleCalendars({ google, onReconnect }: { google: IntegrationStatus; onReconnect: () => void }) {
  const chosen = google.chosen ?? []
  const [err, setErr] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const toggle = (id: string) => {
    setErr(null)
    chooseGoogleCalendars(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id], chosen).catch((e: Error) => setErr(e.message))
  }
  const lookAgain = () => {
    setErr(null)
    setLooking(true)
    refreshGoogleCalendars().catch((e: Error) => setErr(e.message)).finally(() => setLooking(false))
  }
  return (
    <div className="st-gh-rules">
      <div className="st-gh-rules-label" style={flabel}>Calendars · shown on yours, read-only</div>
      {(google.calendars ?? []).map((c) => (
        <Row key={c.id} lead={<span className="st-dot" style={{ background: c.color ?? 'var(--acc-blossom)' }} />} label={c.name} help={c.id === google.login ? 'Your main calendar' : undefined}>
          <Toggle on={chosen.includes(c.id)} label={`Show ${c.name}`} onToggle={() => toggle(c.id)} />
        </Row>
      ))}
      {!google.calendars?.length && <Row label="No calendars yet" help="Look again once the account has one" />}
      {google.can_write ? (
        <Row label="Show my plan in Google as busy" help="Your blocks and events, as private busy time in your main Google calendar">
          <Toggle on={google.mirror !== false} label="Show my plan in Google as busy" onToggle={() => { setErr(null); setGoogleMirror(google.mirror === false).catch((e: Error) => setErr(e.message)) }} />
        </Row>
      ) : (
        <Row label="Allow Kai’s Flow to show your blocks in Google" help="Reconnect once and allow it. Your calendars keep syncing until then">
          <Button type="button" variant="secondary" onClick={onReconnect}>Reconnect</Button>
        </Row>
      )}
      <Row label="Last synced" help="Every 15 minutes, and on Sync now">
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)' }}>{syncedLabel(google.synced_at)}</span>
      </Row>
      <div style={{ padding: '4px 0 14px' }}>
        <button type="button" className="st-link" onClick={lookAgain} disabled={looking}>{looking ? 'Looking…' : 'Look for new calendars'}</button>
      </div>
      {err && <div role="alert" className="st-help" style={{ color: 'var(--acc-terra-ink)', paddingBottom: 12 }}>{err}</div>}
    </div>
  )
}

// Integrations › a provider: its own page with today's controls (the grouping, 2026-10-25).
function ProviderPage({ id }: { id: ProviderId }) {
  const { data: integrations = [] } = useIntegrations()
  return (
    <div className="st-provider">
      <BackLink to="/settings/integrations">Integrations</BackLink>
      {id === 'google' ? (
        <GoogleProvider google={integrations.find((i) => i.provider === 'google')} />
      ) : id === 'github' ? (
        <GithubProvider github={integrations.find((i) => i.provider === 'github')} />
      ) : id === 'mcp' ? (
        <McpCard />
      ) : (
        <CaptureKeyCard />
      )}
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
      <Row label="Sound" help="Soft, warm, a little musical" keys="volume mute whisper">
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
      <Row label="Sound pack" help={`${PACKS[pack].label} · ${PACKS[pack].blurb}`} keys="sound kalimba felt glass" lead={<PlayButton label={`Hear ${PACKS[pack].label}`} onClick={() => previewSound('complete_big', pack)} />}>
        <Segmented<SoundPack> label="Sound pack" value={pack} onChange={choosePack} options={SOUND_PACKS.map((p) => ({ value: p, label: PACKS[p].label }))} />
      </Row>
      {SOUND_ROWS.map((s) => {
        const on = events[s.id]
        return (
          <Row key={s.id} attrs={{ 'data-sound-event': s.id }} keys="sound" lead={<PlayButton label={`Preview ${s.label}`} onClick={() => previewSound(s.id)} />} label={s.label} help={s.help} style={{ opacity: masterOn && on ? 1 : 0.6 }}>
            <Toggle on={on} label={s.label} onToggle={() => toggleEvent(s.id, !on)} />
          </Row>
        )
      })}
      <Row label="Silent after Shut down" help="Until morning · quiet hours and paused notifications hush it too" keys="sound quiet night">
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

// Notification sound packs (Kai 2026-10-26: "include all of them and keep them separated, each in its
// pack"). Chosen apart from the app's own sounds above: these are files, synced on the settings row
// (0088) so every device rings the same; ▶ plays each kind in the shown pack. The switches stay in Kinds.
function NotificationSoundsCard() {
  const { data: s } = useAppSettings()
  const [shown, setShown] = useState<NotifyPack | null>(null) // a pack being auditioned before the server has the column
  const ready = settingSynced('notification_sound_pack')
  const pack = shown ?? parseNotifyPack(s?.notification_sound_pack)
  const where = isCapacitorShell()
    ? 'On this phone each sound is its own channel — Android’s settings can change one'
    : isTauri()
      ? 'Played by the app with each notification'
      : 'Played when the app is open; otherwise your browser’s own sound'
  function choose(p: NotifyPack) {
    if (ready) updateAppSetting('notification_sound_pack', p)
    else setShown(p)
    previewNotifySound(p, 'task_reminder')
  }
  return (
    <SCard id="settings-NotificationSounds" title="Notification sounds">
      <Row label="Pack" find="Notification sound pack" help={`${NOTIFY_PACK_LOOK[pack].blurb} · ${ready ? where : 'Choosing arrives with the next server update'}`} keys="notification sound pack felt glass mixed">
        <Segmented<NotifyPack> label="Notification sound pack" value={pack} onChange={choose} options={NOTIFY_PACKS.map((p) => ({ value: p, label: NOTIFY_PACK_LOOK[p].label }))} />
      </Row>
      {NOTIFY_SOUNDS.map((id) => (
        <Row key={id} attrs={{ 'data-notify-sound': id }} find={`${NOTIFY_SOUND_LABEL[id]} sound`} keys="notification sound" lead={<PlayButton label={`Hear ${NOTIFY_SOUND_LABEL[id]} (${NOTIFY_PACK_LOOK[pack].label})`} onClick={() => previewNotifySound(pack, id)} />} label={NOTIFY_SOUND_LABEL[id]} />
      ))}
    </SCard>
  )
}

/** Kai 2026-10-06: domains are made, renamed, recoloured, merged and deleted here (and on the Tasks
 * page's Organize card). Overlays.dc.html "Labels · manage · settings": labels cut across every domain. */
function OrganizeCat() {
  return (
    <>
      <SCard id="settings-Organize" title="Domains">
        <Find label="Domains" help="The big buckets your projects, areas and tasks sit in · make, rename, recolour, merge, delete" keys="domain recolour merge organize">
          <DomainsSettings />
        </Find>
      </SCard>
      <SCard id="settings-Labels" title="Labels">
        <Find label="Labels" help="They cut across every domain · make, rename, recolour, delete" keys="label tag">
          <LabelManager bare />
        </Find>
      </SCard>
      <ResurfacingCard />
    </>
  )
}

// Shortcuts: the keys and the typing syntax as a reference — the cheatsheet's own tables (lib/shortcuts),
// so this can't drift from the keys that really work. "?" opens the whole sheet anywhere.
function ShortcutsCat() {
  const rows = (list: ShortcutEntry[], keys: string) =>
    list.map((e) => {
      const sheet = e.keys[0] === '?'
      return (
        <Row key={e.label} label={sheet ? 'Every shortcut' : e.label} help={sheet ? 'The full list, anywhere in the app' : undefined} keys={`shortcut ${keys}`}>
          <KeyCombo keys={e.keys} />
        </Row>
      )
    })
  return (
    <>
      <SCard title="Keys">{rows(GLOBAL_SHORTCUTS, '')}</SCard>
      <SCard title="On the calendar">{rows(CALENDAR_SHORTCUTS, 'calendar')}</SCard>
      <SCard title="Typing a task" sub="In the capture bar (⌘K) and every quick add">{rows(COMMAND_BAR_SHORTCUTS, 'typing syntax')}</SCard>
    </>
  )
}

/** Each category's sections. */
const BODY: Record<CatId, () => ReactNode> = {
  account: () => <AccountCat />,
  appearance: () => <AppearanceCard />,
  calendar: () => <CalendarCat />,
  capture: () => (
    <>
      <CaptureAiCard />
      <PhotosSections />
    </>
  ),
  notify: () => <NotificationsCard />,
  organize: () => <OrganizeCat />,
  integrations: () => <IntegrationsCat />,
  data: () => <DataCard />,
  privacy: () => <LegalCard />,
  shortcuts: () => <ShortcutsCat />,
  about: () => (
    <>
      <AppUpdateCard />
      <DeviceSections />
    </>
  ),
}

/** One category's sections, scoped — and under a search, filtered to the rows that match. */
function CategoryBody({ id, q = '' }: { id: CatId; q?: string }) {
  const navigate = useNavigate()
  const open = (cat: CatId, key: string) => navigate(`/settings/${cat}`, { state: { lit: key } })
  return <ScopeCtx.Provider value={{ q, cat: id, open }}>{BODY[id]()}</ScopeCtx.Provider>
}

type Landing = { lit?: string; anchor?: string } | null

/** A category's page: its name and line, then its sections. Arriving from a search result lights the
 * row; arriving from an old anchor (#settings-Sound) scrolls to that section. */
function CategoryPage({ id }: { id: CatId }) {
  const state = useLocation().state as Landing
  useEffect(() => {
    if (!state?.lit && !state?.anchor) return
    const t = setTimeout(() => {
      const el = state.anchor ? document.getElementById(state.anchor) : document.querySelector(`[data-st-key="${CSS.escape(state.lit ?? '')}"]`)
      if (!el) return
      el.scrollIntoView({ block: state.anchor ? 'start' : 'center' })
      if (state.lit) {
        el.classList.add('is-lit')
        // O8: the light fades out over 600ms (is-unlit carries the transition only for that fade).
        setTimeout(() => {
          el.classList.replace('is-lit', 'is-unlit')
          setTimeout(() => el.classList.remove('is-unlit'), 600)
        }, 2000)
      }
    }, 80)
    return () => clearTimeout(t)
  }, [state, id])
  return (
    <div className="st-page">
      <header className="st-page-head">
        <h2>{CAT[id].name}</h2>
        <p>{CAT[id].sum}</p>
      </header>
      <CategoryBody id={id} />
    </div>
  )
}

/** How many rows a block shows right now (search results fill in as their data lands). */
function useRowCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [n, setN] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const count = () => setN(el.querySelectorAll('.st-row').length)
    count()
    const mo = new MutationObserver(count)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [ref])
  return n
}

/** Search results: every category's matching rows, grouped by category › section, each with its own
 * control and a › to its category. */
function Results({ q }: { q: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const n = useRowCount(ref)
  return (
    <div className="st-results">
      <p className="st-res-h" role="status">
        <b>{n === 1 ? '1 setting' : `${n} settings`}</b> match “{q.trim()}”
      </p>
      <div ref={ref}>
        {CATS.map((c) => (
          <CategoryBody key={c.id} id={c.id} q={q} />
        ))}
      </div>
      {n === 0 && <p className="st-res-foot">Nothing by that name — try another word, like “dark”, “quiet” or “export”.</p>}
    </div>
  )
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function SearchField({ q, setQ, inputRef }: { q: string; setQ: (q: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <label className={`st-search${q ? ' is-on' : ''}`}>
      <Icon name="search" size={16} />
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder="Search settings"
        aria-label="Search settings"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && q) {
            e.stopPropagation()
            setQ('')
          }
        }}
      />
      <kbd>{q ? 'Esc' : MAC ? '⌘ F' : 'Ctrl F'}</kbd>
    </label>
  )
}

const THEME_WORD: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' }

/** The phone list's right-hand words: where each category stands. */
function useCatValues(): Partial<Record<CatId, string>> {
  const { data: s } = useAppSettings()
  const scale = useUiScale((x) => x.scale)
  const { data: domains = [] } = useDomains()
  const { data: integrations = [] } = useIntegrations()
  const mode = readThemeMode()
  return {
    appearance: `${THEME_WORD[mode] ?? 'Light'} · ${Math.round(scale * 100)}%`,
    calendar: zoneCity(appZone()),
    capture: s?.auto_file_captures ? 'Files for me' : 'Inbox first',
    notify: s?.quiet_hours_on === false ? 'Quiet off' : `Quiet ${clockText((s?.quiet_from ?? QUIET_FROM).slice(0, 5))}`,
    organize: `${domains.length} domain${domains.length === 1 ? '' : 's'}`,
    integrations: `${integrations.length} connected`,
    about: BUNDLED_VERSION,
  }
}

const clover = (h: number) => <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: h, filter: 'var(--rim-clover, var(--shadow-drop-sm))' }} />

/** The phone's Settings: Account on top (as iOS does), then the other categories in their groups. */
function PhoneHome() {
  const values = useCatValues()
  const { flow } = useOwner()
  const email = useAuth().session?.user.email ?? ''
  return (
    <>
      <Link to="/settings/account" className="st-me">
        <span className="st-me-av">
          <Icon name="person" size={22} />
        </span>
        <span className="st-me-text">
          <b>{flow}</b>
          <span>{email ? `${email} · ` : ''}Account</span>
        </span>
        <Icon name="chevright" size={16} className="st-chev" />
      </Link>
      {GROUPS.slice(1).map((g) => (
        <div key={g[0]} className="st-list">
          {g.map((id) => (
            <Link key={id} to={`/settings/${id}`} className="st-list-row">
              <Icon name={CAT[id].icon} size={20} />
              <span className="n">{CAT[id].name}</span>
              {values[id] && <span className="v">{values[id]}</span>}
              <Icon name="chevright" size={16} className="st-chev" />
            </Link>
          ))}
        </div>
      ))}
    </>
  )
}

interface ViewProps {
  cat: CatId
  sub?: ProviderId
  q: string
  setQ: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  prefsV: number
}

// Layout A: the categories (with their icons) down the left, search at the top of the list, one category
// on the right. Kai 2026-10-03: the page has no scroller of its own — .app-main-content scrolls.
function DesktopSettings({ cat, sub, q, setQ, searchRef, prefsV }: ViewProps) {
  return (
    <div className="st-desk">
      <nav className="st-nav" aria-label="Settings categories">
        <div className="st-nav-in">
          <div className="st-nav-title">
            {/* Night 1e: the clover is a silhouette lit at the rim. */}
            {clover(26)}
            <h1>Settings</h1>
          </div>
          <SearchField q={q} setQ={setQ} inputRef={searchRef} />
          {GROUPS.map((g) => (
            <div key={g[0]} className="st-nav-grp">
              {g.map((id) => (
                <Link key={id} to={`/settings/${id}`} className="st-nav-item" aria-current={!q && id === cat ? 'page' : undefined}>
                  <Icon name={CAT[id].icon} size={18} />
                  <span>{CAT[id].name}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="st-main">
        <div className="st-main-in" key={prefsV}>{q ? <Results q={q} /> : sub ? <ProviderPage id={sub} /> : <CategoryPage id={cat} />}</div>
      </div>
    </div>
  )
}

// The phone: a list that drills into one page per category (‹ Settings to go back); search under the title.
function MobileSettings({ cat, sub, q, setQ, searchRef, home, prefsV }: ViewProps & { home: boolean }) {
  if (sub) return <div className="st-phone"><ProviderPage id={sub} /></div>
  if (!home && !q) {
    return (
      <div className="st-phone">
        <BackLink to="/settings">Settings</BackLink>
        <CategoryPage id={cat} key={prefsV} />
      </div>
    )
  }
  return (
    <div className="st-phone">
      <div className="st-phone-title">
        {clover(32)}
        <h1>Settings</h1>
      </div>
      <SearchField q={q} setQ={setQ} inputRef={searchRef} />
      {q ? <Results q={q} key={prefsV} /> : <PhoneHome />}
      <div className="st-phone-foot">Everything saves as you touch it ✿</div>
    </div>
  )
}

export function SettingsPage() {
  const isMobile = useIsMobile()
  const params = useParams()
  const location = useLocation()
  const [search, setSearch] = useSearchParams()
  const uid = useAuth().session?.user.id
  const searchRef = useRef<HTMLInputElement>(null)
  // A setting kept on the device changed on another one: the rows hold their own copies, so the open page
  // redraws from scratch (everything else arrives through the settings row and re-renders by itself).
  const prefsV = usePrefsVersion()
  // The search lives here, mirrored into ?q= (a deep link). The address follows the field, never the other
  // way while typing (a router update lands a keystroke late); any other move — a link, a result's ›,
  // Back — brings the field in line with the address.
  const urlQ = search.get('q') ?? ''
  const [q, setQState] = useState(urlQ)
  const navType = useNavigationType()
  useEffect(() => {
    if (navType !== 'REPLACE') setQState(urlQ)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps -- once per move, read as it lands
  const setQ = (next: string) => {
    setQState(next)
    setSearch(
      (p) => {
        if (next) p.set('q', next)
        else p.delete('q')
        return p
      },
      { replace: true },
    )
  }

  // Kai 2026-10-07: opening Settings checks for updates too (App & updates shows the answer).
  useEffect(() => {
    void checkForUpdates(uid)
  }, [uid])

  // ⌘/Ctrl F reaches the search, as drawn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'f' && searchRef.current) {
        e.preventDefault()
        searchRef.current.focus()
        searchRef.current.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The old one-page links (#settings-Sound, the guides', the harnesses') land on their category, scrolled
  // to the section; Google's consent page coming back (?google=…) lands on Integrations › Google.
  const old = anchorTarget(location.hash)
  if (old) return <Navigate to={`/settings/${old}${location.search}`} replace state={{ anchor: location.hash.slice(1) }} />
  if (search.has('google') && !(params.cat === 'integrations' && params.sub === 'google')) return <Navigate to={`/settings/integrations/google${location.search}`} replace />
  const cat = isCat(params.cat) ? params.cat : undefined
  if (params.cat && !cat) return <Navigate to="/settings" replace />
  const sub = cat === 'integrations' && isProvider(params.sub) ? params.sub : undefined
  if (params.sub && !sub) return <Navigate to={`/settings/${cat}`} replace />

  const view = { cat: cat ?? DESKTOP_HOME, sub, q, setQ, searchRef, prefsV }
  return isMobile ? <MobileSettings {...view} home={!cat} /> : <DesktopSettings {...view} />
}
