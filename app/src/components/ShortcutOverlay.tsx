import { useEscapeStack, useBodyScrollLock } from '../lib/overlayStack'
import { GLOBAL_SHORTCUTS, TASK_LIST_SHORTCUTS, INBOX_SHORTCUTS, COMMAND_BAR_SHORTCUTS } from '../lib/shortcuts'
import type { ShortcutEntry } from '../lib/pageShortcutsStore'
// J-17: the keycap lives in the shared kit now — this overlay was its only user before.
import { KeyChip } from './kit'

function Category({ title, entries }: { title: string; entries: ShortcutEntry[] }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--acc-terra)', margin: '0 0 3px' }}>
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
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{entry.label}</span>
        </div>
      ))}
    </>
  )
}

function Column({ children, last }: { children: React.ReactNode; last: boolean }) {
  return (
    <div style={{ padding: '18px 22px', borderRight: last ? 'none' : '1px dashed var(--line-dashed)' }}>
      {children}
    </div>
  )
}

/** The whole keymap, always — a fixed 3-column reference (Global+Navigate, Task list+Inbox
 * triage, Calendar+Command bar), same layout and copy as Overlays.dc.html §04 regardless of
 * which page is mounted underneath. Each category's data is static (see lib/shortcuts.ts). */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeStack(open, onClose)
  useBodyScrollLock(open)

  if (!open) return null

  return (
    <div
      className="kf-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 96 }}
      onClick={onClose}
    >
      <div
        className="kf-overlay-card"
        style={{
          width: '100%',
          maxWidth: 660,
          maxHeight: 'calc(var(--kf-vh) - 160px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          margin: '0 16px',
          background: 'color-mix(in srgb, var(--paper-parchment) 82%, transparent)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--line-card)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--line-dashed)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/ds/assets/clover/awake.png" alt="" style={{ height: 30, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, color: 'var(--ink-body)', lineHeight: 1 }}>Keyboard shortcuts</div>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)', marginTop: 2 }}>plant a whole day without the mouse</div>
            </div>
          </div>
          {/* polish-f1: every key in the hint is a keycap (J-17's one visual language), Esc too. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
            <KeyChip text="?" />
            <span>toggle ·</span>
            <KeyChip text="Esc" />
            <span>closes</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Column last={false}>
            <Category title="Global" entries={GLOBAL_SHORTCUTS} />
          </Column>
          <Column last={false}>
            <Category title="Task list" entries={TASK_LIST_SHORTCUTS} />
          </Column>
          <Column last={true}>
            <Category title="Inbox triage" entries={INBOX_SHORTCUTS} />
            <div style={{ marginTop: 20 }} />
            <Category title="Command bar" entries={COMMAND_BAR_SHORTCUTS} />
            <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-0.5deg)' }}>
              arrow → key → arrow → key. shovel through it ✿
            </div>
          </Column>
        </div>
      </div>
    </div>
  )
}
