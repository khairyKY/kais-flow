import { useEscapeStack } from '../lib/overlayStack'
import { usePageShortcutsStore } from '../lib/pageShortcutsStore'
import { GLOBAL_SHORTCUTS, INBOX_SHORTCUTS } from '../lib/shortcuts'
import type { ShortcutEntry } from '../lib/pageShortcutsStore'

function KeyChip({ text }: { text: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.04em',
        color: 'var(--text-primary)',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-input)',
        padding: '2px 7px',
      }}
    >
      {text}
    </span>
  )
}

function Section({ title, entries }: { title: string; entries: ShortcutEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => (
          <div key={entry.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{entry.label}</span>
            <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
              {entry.keys.map((k) => (
                <KeyChip key={k} text={k} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Renders GLOBAL_SHORTCUTS + whichever page is currently registered in `pageShortcutsStore`
 * (via `useListKeys`'s `sectionLabel`) — same data the real key handlers dispatch on. */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { section, entries } = usePageShortcutsStore()

  useEscapeStack(open, onClose)

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: 'calc(100vh - 160px)',
          overflowY: 'auto',
          margin: '0 16px',
          background: 'rgba(251,246,233,0.92)',
          backdropFilter: 'blur(9px)',
          border: '1px solid rgba(224,216,194,0.9)',
          borderRadius: 16,
          boxShadow: '0 2px 4px rgba(40,32,20,0.15), 0 30px 70px rgba(40,32,20,0.35)',
          padding: '22px 24px 20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--text-primary)' }}>Keyboard shortcuts</div>

        <Section title="Global" entries={GLOBAL_SHORTCUTS} />
        {section && <Section title={section} entries={entries} />}
        {section !== 'Inbox triage' && <Section title="Inbox triage" entries={INBOX_SHORTCUTS} />}
      </div>
    </div>
  )
}
