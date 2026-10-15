import { useNavigate } from 'react-router'
import { useEscapeStack, useBodyScrollLock } from '../lib/overlayStack'
import { GLOBAL_SHORTCUTS, SHEET_SECTIONS, CALENDAR_SHORTCUTS, LIST_EXTRAS, LIST_NAV, SELECTION_NOTE, keyCap } from '../lib/shortcuts'
import { LIST_SHORTCUTS } from '../features/tasks/listShortcuts'
import { usePageShortcutsStore, type ShortcutEntry } from '../lib/pageShortcutsStore'
import { restartTour } from '../features/tour/help'
// J-17: the keycap lives in the shared kit now — this overlay was its only user before.
import { KeyChip } from './kit'
import { Icon } from './Icon'

function Category({ title, entries, note }: { title: string; entries: ShortcutEntry[]; note?: string }) {
  return (
    <>
      {/* D6: a section label — 14 semibold ink, sentence case. */}
      <div style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)', margin: '0 0 3px' }}>
        {title}
      </div>
      {entries.map((entry, i) => (
        <div
          key={entry.label}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: i === entries.length - 1 ? 'none' : '1px solid var(--line-dashed)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 'none', minWidth: 104 }}>
            {entry.keys.map((k) => (
              <KeyChip key={k} text={k} />
            ))}
          </span>
          <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>{entry.label}</span>
        </div>
      ))}
      {note && <div className="kf-help" style={{ marginTop: 6 }}>{note}</div>}
    </>
  )
}

const link = { background: 'none', border: 'none', padding: '6px 0', font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--acc-lavender-deep)', cursor: 'pointer' } as const

/** The whole keymap — a 3-column reference (Anywhere + Calendar, On a task, Inbox triage + Command bar). "On a
 * task" is what the list page underneath registered (useListKeys → pageShortcutsStore: the keys it
 * really dispatches on, so the sheet can't drift from them), plus the keys every task list has; with
 * no list page mounted it falls back to the Tasks keys table itself (tasks/listShortcuts.ts). Tour & help 14k-3
 * gives it a solid sheet with a fern, a ×, and the way back to the tour and the Guide (a tool under
 * Bound Journal: 16px corners, no tape, no handwriting). */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeStack(open, onClose)
  useBodyScrollLock(open)
  const navigate = useNavigate()
  const page = usePageShortcutsStore()
  const lists = page.section === 'Lists'
  const taskKeys = page.section
    ? [LIST_NAV, ...page.entries.map((e) => ({ ...e, keys: e.keys.map(keyCap) })), ...(lists ? LIST_EXTRAS : [])]
    : [LIST_NAV, ...LIST_SHORTCUTS.map((e) => ({ keys: e.keys.map(keyCap), label: e.label })), ...LIST_EXTRAS] // A31: the Tasks table itself, never a copy
  const taskTitle = page.section && !lists ? `On a task · ${page.section}` : 'On a task'

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
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img src="/ds/assets/fern/unfurl2.png" alt="" style={{ position: 'absolute', top: 12, right: 72, height: 64, filter: 'var(--shadow-drop-sm)' }} />
        <button type="button" aria-label="Close" onClick={onClose} className="kf-press" style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', borderRadius: '50%', color: 'var(--ink-muted)', cursor: 'pointer' }}>
          <Icon name="close" size={20} />
        </button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)', lineHeight: 1.1 }}>Shortcuts</div>
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-muted)', marginTop: 4 }}>The quick paths through the garden</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 32, marginTop: 22 }}>
          <div>
            <Category title="Anywhere" entries={GLOBAL_SHORTCUTS} />
            {/* p7e A4: back, now that the keys are bound. deviation(2026-10-13): Tour 14k-3 draws it last in
                the third column, under "Go to" (cut, D-5); that column holds Inbox triage + Command bar
                here, so it sits under Anywhere and the sheet still fits a laptop screen unscrolled. */}
            <div style={{ marginTop: 20 }} />
            <Category title="Calendar" entries={CALENDAR_SHORTCUTS} />
          </div>
          <div>
            <Category title={taskTitle} entries={taskKeys} note={!page.section || lists ? SELECTION_NOTE : undefined} />
          </div>
          <div>
            {SHEET_SECTIONS.map((section, i) => (
              <div key={section.title} style={i ? { marginTop: 20 } : undefined}>
                <Category title={section.title} entries={section.entries} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--line-dashed)' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: 'var(--ink-muted)' }}>On a Mac it’s ⌘; on Windows, Ctrl.</span>
          <button type="button" style={link} onClick={() => { onClose(); restartTour() }}>Show me around again</button>
          <button type="button" style={link} onClick={() => { onClose(); navigate('/guide') }}>Open the Guide →</button>
        </div>
      </div>
    </div>
  )
}
