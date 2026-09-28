import { useState, type ReactNode } from 'react'
import { Button, SectionLabel } from './kit'
import { BottomSheet, type SheetDetent } from './BottomSheet'
import { ActionSheet } from './ActionSheet'
import { ToastHost } from './ToastHost'
import { EmptyState, ErrorCard, OfflineChip, Skeleton } from './States'
import { toastUndo } from '../lib/undo'

// Mobile Kit on /design-system (dev only): Bottom sheet, Action sheet, Undo toast, States.
// The page sits outside AppLayout, so it mounts its own ToastHost.

const icon = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const ICONS = {
  tomorrow: icon('M3.5 18.5h17M7.2 18.5a4.8 4.8 0 0 1 9.6 0M12 10.5V4M9.5 6.5 12 4l2.5 2.5'),
  date: icon('M4 7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8.5 3.5v4M15.5 3.5v4'),
  project: icon('M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM10 13.5h4.5M12.8 11.5l2 2-2 2'),
  priority: icon('M6 21V4.5M6 5h11l-2.2 3.5L17 12H6'),
  repeat: icon('M4 12a8 8 0 0 1 13-6l2 2M20 12a8 8 0 0 1-13 6l-2-2M19 4v4h-4M5 20v-4h4'),
  remind: icon('M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10zM10 19.5a2 2 0 0 0 4 0'),
  star: icon('M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z'),
  select: icon('M7.5 4.5h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3zM8.5 12.2l2.4 2.4 4.6-4.9'),
  delete: icon('M4 7h16M9.5 7V4.8h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5'),
}

const meta = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' } as const

export function KitSheetsDemo() {
  const [sheet, setSheet] = useState<SheetDetent | null>(null)
  const [draft, setDraft] = useState('') // lives here, not in the sheet: closing keeps it
  const [menu, setMenu] = useState(false)
  const [n, setN] = useState(1)

  const toast = (message: string) => {
    toastUndo(message, () => toastUndo('Undone — nothing lost', () => {}))
    setN((x) => x + 1)
  }

  return (
    <>
      <section>
        <SectionLabel>Bottom sheet</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setSheet('medium')}>Medium</Button>
          <Button variant="secondary" onClick={() => setSheet('full')}>Full</Button>
          <Button variant="secondary" onClick={() => setSheet('content')}>Content</Button>
          <span style={meta}>draft: {draft ? `"${draft}"` : '—'}</span>
        </div>
      </section>

      <section>
        <SectionLabel>Action sheet</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setMenu(true)}>⋯ Call the bank</Button>
        </div>
      </section>

      <section>
        <SectionLabel>Undo toast</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
          <Button variant="secondary" onClick={() => toast(`Moved to Trash · ${n}`)}>Push one</Button>
          <Button variant="secondary" onClick={() => ['Moved to Tomorrow 09:00', '“Book the dentist” moved to Trash', 'Filed to Tasks · Today'].forEach(toast)}>Push three</Button>
          <Button variant="secondary" onClick={() => toast('“Plan and implement the forecasting logic for the Q4 review” moved to Trash')}>Long</Button>
        </div>
      </section>

      <section>
        <SectionLabel>States</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 24, marginTop: 14, alignItems: 'start' }}>
          <Frame label="Loading · no cache">
            <Skeleton variant="card" />
            <Skeleton rows={2} />
          </Frame>
          <Frame label="Empty">
            <EmptyState line="Nothing waiting. Inbox zero." action={{ label: 'Plan tomorrow', onClick: () => {} }} />
          </Frame>
          <Frame label="Error + offline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <OfflineChip />
              <div style={{ alignSelf: 'stretch' }}>
                <ErrorCard message="Couldn’t load calendar events." onRetry={() => {}} />
              </div>
            </div>
          </Frame>
        </div>
      </section>

      {sheet && (
        <BottomSheet onClose={() => setSheet(null)} detent={sheet} title="Edit task">
          {(close) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.3 }}>Plan and implement the forecasting logic</div>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type, swipe the sheet away, reopen — it's kept"
                style={{ height: 48, padding: '0 14px', borderRadius: 8, border: '1px solid var(--line-control)', background: 'var(--paper-bone)', font: 'inherit', fontSize: 15, color: 'var(--ink-body)' }}
              />
              {Array.from({ length: sheet === 'content' ? 2 : 8 }, (_, i) => (
                <div key={i} style={{ minHeight: 52, display: 'flex', alignItems: 'center', borderBottom: '1px dashed var(--line-dashed)', fontSize: 15 }}>Row {i + 1}</div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" onClick={() => { setDraft(''); close() }}>Discard</Button>
                <Button variant="cta" onClick={close}>Save</Button>
              </div>
            </div>
          )}
        </BottomSheet>
      )}

      {menu && (
        <ActionSheet
          title="Call the bank about the mortgage"
          meta="Personal · 15m · Today"
          onClose={() => setMenu(false)}
          items={[
            { label: 'Tomorrow', icon: ICONS.tomorrow, hint: 'Mon 09:00', onSelect: () => toast('Moved to Tomorrow 09:00') },
            { label: 'Pick date…', icon: ICONS.date, onSelect: () => {} },
            { label: 'Move to project…', icon: ICONS.project, hint: 'Personal', onSelect: () => {} },
            { label: 'Priority', icon: ICONS.priority, hint: 'None', onSelect: () => {} },
            { label: 'Repeat', icon: ICONS.repeat, hint: 'Never', onSelect: () => {} },
            { label: 'Remind', icon: ICONS.remind, hint: 'Off', onSelect: () => {} },
            { label: 'Add to Top 3', icon: ICONS.star, onSelect: () => {} },
            { label: 'Select', icon: ICONS.select, hint: 'or hold a row', onSelect: () => {} },
            { label: 'Delete', icon: ICONS.delete, hint: 'Undo 6s', destructive: true, onSelect: () => toast('“Call the bank” moved to Trash') },
          ]}
        />
      )}

      <ToastHost />
    </>
  )
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ ...meta, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}
