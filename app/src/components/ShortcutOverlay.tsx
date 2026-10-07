import { useNavigate } from 'react-router'
import { useEscapeStack, useBodyScrollLock } from '../lib/overlayStack'
import { GLOBAL_SHORTCUTS, TASK_LIST_SHORTCUTS, INBOX_SHORTCUTS, COMMAND_BAR_SHORTCUTS } from '../lib/shortcuts'
import type { ShortcutEntry } from '../lib/pageShortcutsStore'
import { restartTour } from '../features/tour/help'
// J-17: the keycap lives in the shared kit now — this overlay was its only user before.
import { KeyChip } from './kit'
import { Icon } from './Icon'

function Category({ title, entries }: { title: string; entries: ShortcutEntry[] }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--acc-terra)', margin: '0 0 3px' }}>
        {title}
      </div>
      {entries.map((entry, i) => (
        <div
          key={entry.label}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: i === entries.length - 1 ? 'none' : '1px dashed var(--line-dashed)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 'none', minWidth: 104 }}>
            {entry.keys.map((k) => (
              <KeyChip key={k} text={k} />
            ))}
          </span>
          <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>{entry.label}</span>
        </div>
      ))}
    </>
  )
}

const link = { background: 'none', border: 'none', padding: '6px 0', font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--acc-lavender-deep)', cursor: 'pointer' } as const

/** The whole keymap, always — a fixed 3-column reference (Anywhere, On a task, Inbox triage +
 * Command bar), regardless of which page is mounted underneath. Each category's data is static
 * (lib/shortcuts.ts: only keys that work). Tour & help 14k-3 gives it the paper treatment: a solid
 * taped sheet with a fern, a ×, and the way back to the tour and the Guide. */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeStack(open, onClose)
  useBodyScrollLock(open)
  const navigate = useNavigate()

  if (!open) return null

  return (
    <div
      className="kf-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 72 }}
      onClick={onClose}
    >
      <div
        className="kf-overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label="Shortcuts"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 940,
          maxHeight: 'calc(var(--kf-vh) - 120px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          margin: '0 16px',
          padding: '28px 32px 18px',
          boxSizing: 'border-box',
          background: 'var(--paper-parchment)',
          border: '1px solid var(--line-card)',
          borderRadius: 3,
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', marginLeft: -36, width: 72, height: 18, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
        <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ position: 'absolute', top: 12, right: 72, height: 64, filter: 'var(--shadow-drop-sm)' }} />
        <button type="button" aria-label="Close" onClick={onClose} className="kf-press" style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', borderRadius: '50%', color: 'var(--ink-muted)', cursor: 'pointer' }}>
          <Icon name="close" size={20} />
        </button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)', lineHeight: 1.1 }}>Shortcuts</div>
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', marginTop: 4 }}>the quick paths through the garden</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 32, marginTop: 22 }}>
          <div>
            <Category title="Anywhere" entries={GLOBAL_SHORTCUTS} />
          </div>
          <div>
            <Category title="On a task" entries={TASK_LIST_SHORTCUTS} />
          </div>
          <div>
            <Category title="Inbox triage" entries={INBOX_SHORTCUTS} />
            <div style={{ marginTop: 20 }} />
            <Category title="Command bar" entries={COMMAND_BAR_SHORTCUTS} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 20, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: 'var(--ink-muted)' }}>On a Mac it’s ⌘; on Windows, Ctrl.</span>
          <button type="button" style={link} onClick={() => { onClose(); restartTour() }}>Show me around again</button>
          <button type="button" style={link} onClick={() => { onClose(); navigate('/guide') }}>Open the Guide →</button>
        </div>
      </div>
    </div>
  )
}
