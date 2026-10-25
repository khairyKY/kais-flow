import { useEffect, useRef, useState } from 'react'
import { Segmented, Toggle as KitToggle } from '../../components/kit'
import { uiZoom } from '../../lib/uiScale'
import { useEscapeStack } from '../../lib/overlayStack'
import { ALL_ZONES, isZone, searchZones } from '../../lib/appZone'

// ── WA2-calendar-contracts.md "View options overlay" (Overlays §05), merged with Kai's
// Akiflow ruling [K-26]: a 1–6/W/M view-selector row replaces the header's N-day cycler.
// Every control here has real backing; the contract's "Show declined" row is OMITTED —
// calendar_events has no attendee/RSVP status column, so the toggle would be dead weight
// on screen ("nothing dead on screen"). ──

export interface CalViewOptions {
  density: 's' | 'm' | 'l'
  weekStartsMon: boolean
  showWeekends: boolean
  showCompleted: boolean
  hour24: boolean
  /** cal-wave (Akiflow's "Responsive"): the N-day and Week views show as many days as fit the width. */
  responsive: boolean
  /** cal-wave (Akiflow's "Dynamic"): the hours fit the shown days' blocks, and the rows the screen. */
  dynamic: boolean
  /** cal-wave: a second clock in the time gutter (an IANA zone), or null. */
  secondZone: string | null
  /** cal-wave item 19: the Ongoing / Up next card at the bottom left (Kai's "now card A"). */
  nowCard: boolean
}

export const DEFAULT_VIEW_OPTIONS: CalViewOptions = {
  density: 'm', // M = the contract's 54px/hour grid; S/L scale the whole --s space
  weekStartsMon: true, // contract's segmented shows Mon active (month view is the consumer)
  showWeekends: true,
  showCompleted: true,
  hour24: false,
  responsive: false,
  dynamic: false,
  secondZone: null,
  nowCard: true,
}

const VIEW_OPTIONS_KEY = 'kf.calViewOptions'

/** Per-device view preferences, like rail width and UI scale — localStorage, not the synced settings row. */
export function readViewOptions(): CalViewOptions {
  try {
    return { ...DEFAULT_VIEW_OPTIONS, ...JSON.parse(localStorage.getItem(VIEW_OPTIONS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_VIEW_OPTIONS
  }
}

export function writeViewOptions(opts: CalViewOptions): void {
  try {
    localStorage.setItem(VIEW_OPTIONS_KEY, JSON.stringify(opts))
  } catch {
    /* private mode — session-only prefs are fine */
  }
}

const VIEW_CELLS = ['1', '2', '3', '4', '5', '6', 'W', 'M'] as const
export type ViewCell = (typeof VIEW_CELLS)[number]

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 10px' }
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--ink-body)' }
// B (D12): the rows are the kit's Segmented — a visible edge, the pick ink-filled. The view row's eight
// cells share the popover's width.
const SEG_CSS = '.cal-vo-row.kf-seg { display: flex; flex-wrap: nowrap; } .cal-vo-row .kf-seg-btn { min-width: 0; padding: 0; } .cal-vo-dense .kf-seg-btn { padding: 0 8px; }'
const VIEW_OPTS = VIEW_CELLS.map((c) => ({ value: c, label: c }))
const DENSITY_OPTS = [{ value: 's' as const, label: 'Small' }, { value: 'm' as const, label: 'Medium' }, { value: 'l' as const, label: 'Large' }]
const WEEK_OPTS = [{ value: 'mon', label: 'Mon' }, { value: 'sun', label: 'Sun' }]

/** A labelled row around the kit Toggle (UI pass: one switch look across the app). */
function Toggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <div style={{ ...rowStyle, padding: '8px 10px' }}>
      <span style={labelStyle}>{label}</span>
      <KitToggle on={on} label={label} onToggle={onToggle} />
    </div>
  )
}

/** The second clock's zone: a typed search over every zone Intl knows (the browser's own suggestions);
 * it applies once the text is a real zone. '' = on, none picked yet. */
function ZoneField({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <div style={{ ...rowStyle, paddingTop: 0 }}>
      <input
        list="kf-vo-zones"
        aria-label="Second time zone"
        placeholder="City or zone, e.g. London"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const hit = isZone(e.target.value) ? e.target.value : searchZones(e.target.value, 2).length === 1 ? searchZones(e.target.value, 1)[0] : null
          if (hit) onChange(hit)
        }}
        style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--line-control)', borderRadius: 'var(--radius-input)', background: 'var(--paper-bone)', color: 'var(--ink-body)', font: 'inherit', fontSize: 'var(--fs-meta-l)' }}
      />
      <datalist id="kf-vo-zones">{ALL_ZONES.map((z) => <option key={z} value={z} />)}</datalist>
    </div>
  )
}

interface ViewOptionsPopoverProps {
  /** Trigger pill's bottom-right corner, VISUAL px (a raw getBoundingClientRect read). */
  anchor: { x: number; y: number }
  closing: boolean
  onClose: () => void
  /** '1'…'6' | 'W' | 'M' — the active cell in the view row. */
  activeView: ViewCell
  onPickView: (cell: ViewCell) => void
  value: CalViewOptions
  onChange: (patch: Partial<CalViewOptions>) => void
  /** Calendar §4 planning mode, by name (Kai 2026-10-22: never by the pane handle). */
  onPlanMode?: () => void
}

export function ViewOptionsPopover({ anchor, closing, onClose, activeView, onPickView, value, onChange, onPlanMode }: ViewOptionsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEscapeStack(!closing, onClose)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    // A fixed popover over a scrolled page detaches from its trigger — close it (ContextMenu's rule).
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Pointer coords are VISUAL px; fixed left/top are LAYOUT px — divide once by uiZoom()
  // (same correction ContextMenu applies, Kai's "way too far from where I right clicked").
  const z = uiZoom()
  const width = 256
  const estHeight = 470
  const left = Math.max(8, Math.min(anchor.x / z - width, window.innerWidth / z - width - 8))
  const top = Math.max(12, Math.min(anchor.y / z + 6, window.innerHeight / z - estHeight - 12))

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="View options"
      className={`kf-pop${closing ? ' kf-pop--out' : ''}`}
      style={{
        ['--pop-origin' as string]: 'top right',
        position: 'fixed',
        top,
        left,
        zIndex: 1000,
        width,
        padding: 6,
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        borderRadius: 5,
        boxShadow: 'var(--shadow-popover)',
        // Punch 32: dragging across the segmented buttons must select no text.
        userSelect: 'none',
      }}
    >
      <style>{SEG_CSS}</style>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', color: 'var(--ink-faint)', padding: '6px 10px 8px' }}>
        View options
      </div>

      {/* [K-26] Akiflow view row — replaces the N-day cycler. 1 = day, 2–6 = N-day, W = week, M = month. */}
      <div style={{ padding: '7px 10px' }}>
        <Segmented className="cal-vo-row" label="View" value={activeView} onChange={onPickView} options={VIEW_OPTS} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Density</span>
        <Segmented className="cal-vo-dense" label="Density" value={value.density} onChange={(density) => onChange({ density })} options={DENSITY_OPTS} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Week starts</span>
        <Segmented label="Week starts" value={value.weekStartsMon ? 'mon' : 'sun'} onChange={(v) => onChange({ weekStartsMon: v === 'mon' })} options={WEEK_OPTS} />
      </div>

      <div style={{ height: 1, background: 'var(--line-card)', margin: '5px 8px' }} />

      <Toggle on={value.showWeekends} label="Show weekends" onToggle={() => onChange({ showWeekends: !value.showWeekends })} />
      <Toggle on={value.showCompleted} label="Show completed" onToggle={() => onChange({ showCompleted: !value.showCompleted })} />
      <Toggle on={value.hour24} label="24-hour time" onToggle={() => onChange({ hour24: !value.hour24 })} />
      <Toggle on={value.responsive} label="Days fit the width" onToggle={() => onChange({ responsive: !value.responsive })} />
      <Toggle on={value.dynamic} label="Hours fit the day" onToggle={() => onChange({ dynamic: !value.dynamic })} />
      <Toggle on={value.secondZone != null} label="Second time zone" onToggle={() => onChange({ secondZone: value.secondZone != null ? null : '' })} />
      {value.secondZone != null && <ZoneField value={value.secondZone} onChange={(secondZone) => onChange({ secondZone })} />}
      <Toggle on={value.nowCard} label="Now card" onToggle={() => onChange({ nowCard: !value.nowCard })} />
      {onPlanMode && (
        <>
          <div style={{ height: 1, background: 'var(--line-card)', margin: '5px 8px' }} />
          <Toggle on={false} label="Planning mode" onToggle={onPlanMode} />
        </>
      )}
    </div>
  )
}
