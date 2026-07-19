import { useEscapeStack, useBodyScrollLock } from '../lib/overlayStack'
import { GLOBAL_SHORTCUTS, NAVIGATE_SHORTCUTS, TASK_LIST_SHORTCUTS, INBOX_SHORTCUTS, CALENDAR_SHORTCUTS, COMMAND_BAR_SHORTCUTS } from '../lib/shortcuts'
import type { ShortcutEntry } from '../lib/pageShortcutsStore'

function KeyChip({ text }: { text: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        lineHeight: 1,
        color: 'var(--ink-body)',
        background: 'var(--paper-bone)',
        border: '1px solid var(--line-card)',
        borderBottomWidth: 2,
        borderRadius: 5,
        padding: '5px 7px',
        minWidth: 22,
        textAlign: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-crisp)',
      }}
    >
      {text}
    </span>
  )
}

function Category({ title, entries }: { title: string; entries: ShortcutEntry[] }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--acc-terra)', margin: '0 0 3px' }}>
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
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
      onClick={onClose}
    >
      <div
        className="kf-overlay-card"
        style={{
          width: '100%',
          maxWidth: 660,
          maxHeight: 'calc(100dvh - 160px)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyChip text="?" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>toggle · Esc closes</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Column last={false}>
            <Category title="Global" entries={GLOBAL_SHORTCUTS} />
            <div style={{ marginTop: 20 }} />
            <Category title="Navigate" entries={NAVIGATE_SHORTCUTS} />
          </Column>
          <Column last={false}>
            <Category title="Task list" entries={TASK_LIST_SHORTCUTS} />
            <div style={{ marginTop: 20 }} />
            <Category title="Inbox triage" entries={INBOX_SHORTCUTS} />
          </Column>
          <Column last={true}>
            <Category title="Calendar" entries={CALENDAR_SHORTCUTS} />
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
