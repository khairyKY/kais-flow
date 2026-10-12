import { useState } from 'react'

export interface EditField {
  key: string
  label: string
  value: string
  multiline?: boolean
}

const fieldStyle = { width: '100%', padding: '4px 8px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 3, outline: 'none' } as const

/** The Library's inline edit card (Kai 2026-10-12: books, notes and quotes were create-only). The
 * same parchment card and Cancel / pill buttons as the page's "Add" forms, opened prefilled. */
export function LibraryEditForm({ title, fields, onSave, onCancel }: { title: string; fields: EditField[]; onSave: (values: Record<string, string>) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])))
  const set = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }))
  return (
    <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'block', marginBottom: 8 }}>
          <span className="fhelp" style={{ display: 'block', marginBottom: 3 }}>{f.label}</span>
          {f.multiline ? (
            <textarea value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} style={{ ...fieldStyle, minHeight: 80, padding: 6, resize: 'vertical' }} />
          ) : (
            <input value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} style={fieldStyle} />
          )}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ border: 'none', background: 'transparent', font: 'inherit', fontSize: '11px', color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={() => onSave(values)} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', font: 'inherit', fontSize: '11px', padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}>Save</button>
      </div>
    </div>
  )
}
