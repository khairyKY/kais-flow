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

function Column({ title, entries, last }: { title: string; entries: ShortcutEntry[]; last: boolean }) {
  return (
    <div style={{ padding: '18px 22px', borderRight: last ? 'none' : '1px dashed var(--line-dashed)' }}>
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
      {last && (
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', transform: 'rotate(-0.5deg)' }}>
          arrow → key → arrow → key. shovel through it ✿
        </div>
      )}
    </div>
  )
}

/** Renders GLOBAL_SHORTCUTS + whichever page is currently registered in `pageShortcutsStore`
 * (via `useListKeys`'s `sectionLabel`) — same data the real key handlers dispatch on. Laid out
 * as the export's 3-column keymap, one live section per column instead of a fixed static map. */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { section, entries } = usePageShortcutsStore()

  useEscapeStack(open, onClose)

  if (!open) return null

  const columns: { title: string; entries: ShortcutEntry[] }[] = [{ title: 'Global', entries: GLOBAL_SHORTCUTS }]
  if (section) columns.push({ title: section, entries })
  if (section !== 'Inbox triage') columns.push({ title: 'Inbox triage', entries: INBOX_SHORTCUTS })

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(58,50,38,0.32)', paddingTop: 96 }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 660,
          maxHeight: 'calc(100vh - 160px)',
          overflowY: 'auto',
          margin: '0 16px',
          background: 'rgba(251,246,233,0.82)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(220,214,190,0.6)',
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
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', marginTop: 2 }}>plant a whole day without the mouse</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyChip text="?" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>toggle · Esc closes</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
          {columns.map((col, i) => (
            <Column key={col.title} title={col.title} entries={col.entries} last={i === columns.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
