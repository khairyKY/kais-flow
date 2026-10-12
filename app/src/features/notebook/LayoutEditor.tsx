import type { ReactNode } from 'react'
import { Button, Chip, Segmented, Toggle } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { BLOCK_LABEL, NOTE_LINES, PRESETS, TASK_CAPS, moveBlock, presetOf, type BlockId, type NotebookLayout, type PresetId } from './page'

// "Format it however you like" (brainstorm §A, prompt 10 §2): presets to start from, the checkbox
// style, and each block on/off, up/down, with its one or two options. Every change saves at once and
// the page beside (desktop) or below (phone) is the live preview. No design yet — kit parts only.

const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

function Option({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="nb-ed-opt">
      <span>{label}</span>
      {children}
    </div>
  )
}

export function LayoutEditor({ layout, onChange, onDone }: { layout: NotebookLayout; onChange: (next: NotebookLayout) => void; onDone: () => void }) {
  const preset = presetOf(layout)
  const set = (patch: Partial<NotebookLayout>) => onChange({ ...layout, ...patch })
  const toggle = (id: BlockId) => set({ blocks: layout.blocks.map((b) => (b.id === id ? { ...b, on: !b.on } : b)) })
  const move = (id: BlockId, by: -1 | 1) => {
    const next = moveBlock(layout, id, by)
    if (next) onChange(next)
  }

  const options = (id: BlockId): ReactNode => {
    switch (id) {
      case 'header':
        return (
          <>
            <Option label="Full date">
              <Toggle on={layout.header.long} label="Full date" onToggle={() => set({ header: { ...layout.header, long: !layout.header.long } })} />
            </Option>
            <Option label="woke __ · slept __">
              <Toggle on={layout.header.sleep} label="Sleep blanks" onToggle={() => set({ header: { ...layout.header, sleep: !layout.header.sleep } })} />
            </Option>
          </>
        )
      case 'top3':
        return (
          <>
            <Option label="The day’s plan">
              <Toggle on={layout.top3.plan} label="The day’s plan" onToggle={() => set({ top3: { ...layout.top3, plan: !layout.top3.plan } })} />
            </Option>
            {layout.top3.plan && (
              <Option label="Clock">
                <Segmented value={layout.top3.clock} label="Clock" options={[{ value: '24h', label: '24h' }, { value: '12h', label: '12h' }]} onChange={(clock) => set({ top3: { ...layout.top3, clock } })} />
              </Option>
            )}
          </>
        )
      case 'habits':
        return (
          <Option label="Draw as">
            <Segmented value={layout.habits.row ? 'row' : 'list'} label="Habits drawn as" options={[{ value: 'row', label: 'One row' }, { value: 'list', label: 'A list' }]} onChange={(v) => set({ habits: { row: v === 'row' } })} />
          </Option>
        )
      case 'tasks':
        return (
          <Option label="Up to">
            <Segmented value={layout.tasks.cap} label="Tasks on the page" options={TASK_CAPS.map((n) => ({ value: n, label: String(n) }))} onChange={(cap) => set({ tasks: { cap } })} />
          </Option>
        )
      case 'notes':
        return (
          <Option label="Lines">
            <Segmented value={layout.notes.lines} label="Note lines" options={NOTE_LINES.map((n) => ({ value: n, label: String(n) }))} onChange={(lines) => set({ notes: { lines } })} />
          </Option>
        )
      case 'night':
        return <div className="nb-ed-help">+ what happened · − what got in the way · → tomorrow’s three · ♡ one true line</div>
    }
  }

  return (
    <section className="nb-editor" aria-label="Page layout">
      <div className="nb-ed-head">
        <span className="nb-ed-title">Page layout</span>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
      <div className="nb-ed-label">Start from</div>
      <div className="nb-ed-chips">
        {PRESET_IDS.map((p) => (
          <Chip key={p} selected={preset === p} onClick={() => onChange(PRESETS[p].layout)}>
            {PRESETS[p].label}
          </Chip>
        ))}
      </div>
      <Option label="Checkboxes">
        <Segmented value={layout.marks} label="Checkbox style" options={[{ value: 'box', label: '☐ Boxes' }, { value: 'bullet', label: '• Bullets' }]} onChange={(marks) => set({ marks })} />
      </Option>
      <div className="nb-ed-label">Blocks · top to bottom</div>
      {layout.blocks.map((b, i) => (
        <div key={b.id} className="nb-ed-block">
          <div className="nb-ed-row">
            <Toggle on={b.on} label={`Show ${BLOCK_LABEL[b.id]}`} onToggle={() => toggle(b.id)} />
            <span className={`nb-ed-name${b.on ? '' : ' is-off'}`}>{BLOCK_LABEL[b.id]}</span>
            <button type="button" className="nb-ed-move" aria-label={`Move ${BLOCK_LABEL[b.id]} up`} disabled={i === 0} onClick={() => move(b.id, -1)}>
              <Icon name="chevdown" size={20} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button type="button" className="nb-ed-move" aria-label={`Move ${BLOCK_LABEL[b.id]} down`} disabled={i === layout.blocks.length - 1} onClick={() => move(b.id, 1)}>
              <Icon name="chevdown" size={20} />
            </button>
          </div>
          {b.on && <div className="nb-ed-opts">{options(b.id)}</div>}
        </div>
      ))}
    </section>
  )
}
