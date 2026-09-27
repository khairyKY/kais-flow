import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip, SectionLabel } from '../../components/kit'
import { ConfirmCard } from '../projects/ConfirmCard'
import { useTasks, setRecurrence, deleteTask, restoreTask } from '../tasks/api'
import { toastUndo } from '../../lib/undo'
import type { ImportBatch } from './adapters/shared'
import { parseAkiflow } from './adapters/akiflow'
import { parseCsv, csvToBatch, guessMapping, CSV_TARGETS, type CsvMapping } from './adapters/csv'
import { fetchAllExistingRefs, commitBatch, type ExistingRefs, type ImportSummary } from './api'
import { findDuplicateClusters, MIN_CLUSTER, type DupeCluster } from './dedupe'

// P-IMPORT tier-0 wizard: source → file → (csv mapping) → preview → import → summary.
// Quiet, minimal, §04 kit + tokens only. States.dc.html rules: never the word "error".

type Source = 'akiflow' | 'csv'
type Step =
  | { name: 'pick' }
  | { name: 'mapping'; rows: string[][]; fileName: string; mapping: CsvMapping }
  | { name: 'preview'; batch: ImportBatch; existing: ExistingRefs }
  | { name: 'importing'; done: number; total: number }
  | { name: 'summary'; summary: ImportSummary }

const card: React.CSSProperties = {
  background: 'var(--paper-parchment)', border: '1px solid var(--line-card)',
  borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '18px 20px',
}
const help: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--ink-faint)',
}

// Mapping memory — per filename pattern (digits stripped so "export (2).csv" matches "export.csv").
const MAPPING_KEY = 'kf_import_csv_mappings'
function filePattern(name: string) {
  return name.toLowerCase().replace(/[\d()_\- ]+/g, '')
}
function recallMapping(name: string): CsvMapping | null {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}')[filePattern(name)] ?? null
  } catch { return null }
}
function rememberMapping(name: string, mapping: CsvMapping) {
  try {
    const all = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}')
    all[filePattern(name)] = mapping
    localStorage.setItem(MAPPING_KEY, JSON.stringify(all))
  } catch { /* localStorage full/blocked — mapping just isn't remembered */ }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' })
}

// ── Punch 28: recurring-import dedupe assistant ──────────────────────────────
// Dry-run first: the table below changes NOTHING. Each cluster only merges after its own
// ConfirmCard — keep one task (+ guessed recurrence_rule), soft-delete the rest through
// the outbox (deleteTask → Trash), with an Undo toast that restores everything.
function TidyDuplicates() {
  const { data: tasks = [] } = useTasks()
  const clusters = useMemo(() => findDuplicateClusters(tasks), [tasks])
  const [confirming, setConfirming] = useState<DupeCluster | null>(null)

  function merge(c: DupeCluster) {
    setConfirming(null)
    const rest = c.tasks.filter((t) => t.id !== c.keep.id)
    const prevRule = c.keep.recurrence_rule ?? null
    if (c.rule) setRecurrence(c.keep, c.rule)
    rest.forEach(deleteTask) // outbox soft-delete — lands in Trash, restorable
    toastUndo(
      `"${c.title}" tidied — kept 1 of ${c.tasks.length}${c.cadence ? `, repeats ${c.cadence}` : ''}.`,
      () => {
        rest.forEach(restoreTask)
        if (c.rule) setRecurrence(c.keep, prevRule)
      },
    )
  }

  const cadenceLabel = (c: DupeCluster) =>
    c.cadence ? `looks ${c.cadence}` : 'no clear rhythm'

  return (
    <div style={card}>
      <SectionLabel style={{ marginBottom: 6 }}>Tidy duplicates</SectionLabel>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
        Imports of recurring tasks often land as one copy per occurrence. Clusters of {MIN_CLUSTER}+
        open tasks sharing a title can each collapse to a single repeating task — nothing changes
        until you confirm a cluster, and removals go to the trash.
      </p>
      {clusters.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '10px 0 2px' }}>
          No duplicate clusters right now — the bed is tidy.
        </div>
      ) : (
        <div style={{ borderTop: '1px dashed var(--line-dashed)', marginTop: 8 }}>
          {clusters.map((c) => (
            <div key={c.keep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-body)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
              <Chip tone="tasks">{c.tasks.length} open</Chip>
              <span style={help}>{cadenceLabel(c)}</span>
              <span style={help}>next {fmtDate(c.keep.due_at)}</span>
              <Button variant="secondary" onClick={() => setConfirming(c)}>Tidy…</Button>
            </div>
          ))}
        </div>
      )}
      {confirming && (
        <ConfirmCard
          title={`Tidy "${confirming.title}"?`}
          body={`Keeps 1 of ${confirming.tasks.length}${confirming.cadence ? `, set to repeat ${confirming.cadence}` : ''} — the other ${confirming.tasks.length - 1} move to the trash. Undo is right there after.`}
          confirmLabel="Tidy"
          onConfirm={() => merge(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

export function ImportPage() {
  const navigate = useNavigate()
  const [source, setSource] = useState<Source>('akiflow')
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [trouble, setTrouble] = useState<string | null>(null)
  const [includeCompleted, setIncludeCompleted] = useState(false)
  const [includeEvents, setIncludeEvents] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function toPreview(batch: ImportBatch) {
    try {
      const existing = await fetchAllExistingRefs()
      setStep({ name: 'preview', batch, existing })
    } catch {
      setTrouble("Couldn't check for already-imported rows — check the connection and try again.")
    }
  }

  async function handleFile(file: File) {
    setTrouble(null)
    const text = await file.text()
    if (source === 'akiflow') {
      try {
        await toPreview(parseAkiflow(JSON.parse(text)))
      } catch {
        setTrouble("This file didn't read as an Akiflow dump — it should be the akiflow-dump.json from the PROMPT-BANK prompt.")
      }
    } else {
      const rows = parseCsv(text)
      if (rows.length < 2) {
        setTrouble('This file looks empty — a header row plus at least one task row is needed.')
        return
      }
      setStep({ name: 'mapping', rows, fileName: file.name, mapping: recallMapping(file.name) ?? guessMapping(rows[0]) })
    }
  }

  async function runImport(batch: ImportBatch, existing: ExistingRefs) {
    setStep({ name: 'importing', done: 0, total: 0 })
    const summary = await commitBatch(batch, existing, { includeCompleted, includeEvents }, (done, total) =>
      setStep({ name: 'importing', done, total }),
    )
    setStep({ name: 'summary', summary })
  }

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '30px 36px 44px' }}>
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 500, color: 'var(--ink-body)' }}>Import data</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-muted)' }}>
            One-time, from a file. Parsed entirely on this device — nothing leaves except your own database writes.
          </p>
        </div>

        {step.name === 'pick' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 14 }}>Source</SectionLabel>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {([['akiflow', 'Akiflow JSON'], ['csv', 'Generic CSV']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setSource(v); setTrouble(null) }}
                  style={{
                    font: 'inherit', fontSize: 13, padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
                    border: source === v ? '1px solid var(--acc-sage)' : '1px solid var(--line-solid)',
                    background: source === v ? 'color-mix(in srgb, var(--acc-sage) 18%, transparent)' : 'var(--paper-bone)',
                    color: source === v ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                    fontWeight: source === v ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) void handleFile(f)
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '1.5px dashed var(--line-solid)', borderRadius: 6, padding: '36px 20px',
                textAlign: 'center', cursor: 'pointer', background: 'var(--paper-bone)',
              }}
            >
              <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Drop the file here, or click to pick it</div>
              <div style={{ ...help, marginTop: 8 }}>
                {source === 'akiflow' ? 'akiflow-dump.json · from the prompt-bank dump prompt' : 'a .csv with a header row · you map the columns next'}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={source === 'akiflow' ? '.json' : '.csv'}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.target.value = ''
                }}
              />
            </div>
            {trouble && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--acc-terra)' }}>{trouble}</p>}
          </div>
        )}

        {step.name === 'mapping' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 6 }}>Map columns</SectionLabel>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
              Say what each column means — title is the only one required. Remembered for files named like this one.
            </p>
            {/* Punch 2 sweep: an empty CSV made this throw (`rows[0]` undefined) — the one
                un-guarded index in the app. A file with no rows just maps nothing. */}
            {(step.rows[0] ?? []).map((header, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-body)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{header || `column ${i + 1}`}</span>
                <span style={{ ...help, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'none' }}>{step.rows[1]?.[i] ?? ''}</span>
                <select
                  value={step.mapping[i] ?? ''}
                  onChange={(e) => {
                    const mapping = { ...step.mapping }
                    if (e.target.value) mapping[i] = e.target.value as CsvMapping[number]
                    else delete mapping[i]
                    setStep({ ...step, mapping })
                  }}
                  style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, color: 'var(--ink-body)', font: 'inherit' }}
                >
                  <option value="">— skip —</option>
                  {CSV_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button
                disabled={!Object.values(step.mapping).includes('title')}
                style={Object.values(step.mapping).includes('title') ? undefined : { opacity: 0.5, cursor: 'default' }}
                onClick={() => {
                  rememberMapping(step.fileName, step.mapping)
                  void toPreview(csvToBatch(step.rows, step.mapping))
                }}
              >
                Continue to preview
              </Button>
              <Button variant="ghost" onClick={() => setStep({ name: 'pick' })}>Back</Button>
            </div>
          </div>
        )}

        {step.name === 'preview' && (() => {
          const { batch, existing } = step
          const dupTasks = batch.tasks.filter((t) => existing.tasks.has(`${t.external_ref.source} ${t.external_ref.id}`)).length
          const dupProjects = batch.projects.filter((p) => existing.projects.has(`${p.external_ref.source} ${p.external_ref.id}`)).length
          const completedCount = batch.tasks.filter((t) => t.done).length
          const willImport =
            batch.tasks.length - dupTasks - (includeCompleted ? 0 : batch.tasks.filter((t) => t.done && !existing.tasks.has(`${t.external_ref.source} ${t.external_ref.id}`)).length)
          return (
            <div style={card}>
              <SectionLabel style={{ marginBottom: 14 }}>Preview</SectionLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <Chip tone="sage">{batch.projects.length} projects{dupProjects ? ` · ${dupProjects} already here` : ''}</Chip>
                <Chip tone="tasks">{batch.tasks.length} tasks{dupTasks ? ` · ${dupTasks} already here` : ''}</Chip>
                {batch.events.length > 0 && <Chip tone="hydrangea">{batch.events.length} events</Chip>}
                {completedCount > 0 && <Chip>{completedCount} completed</Chip>}
              </div>
              {batch.source === 'csv' && (
                <div style={{ ...help, marginBottom: 10 }}>csv rows have no ids — duplicates are matched by a hash of title + due + project</div>
              )}
              <div style={{ borderTop: '1px dashed var(--line-dashed)', marginTop: 8 }}>
                {batch.tasks.slice(0, 5).map((t) => {
                  const dup = existing.tasks.has(`${t.external_ref.source} ${t.external_ref.id}`)
                  const projectName = batch.projects.find((p) => p.external_ref.id === t.sourceProjectId)?.name
                  return (
                    <div key={t.external_ref.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                      <span style={{ fontSize: 13, color: t.done ? 'var(--ink-faint)' : 'var(--ink-body)', textDecoration: t.done ? 'line-through' : 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      {projectName && <span style={{ ...help, textTransform: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</span>}
                      <span style={help}>{fmtDate(t.due_at)}</span>
                      {t.priority && <span style={help}>{'!'.repeat(4 - t.priority)}</span>}
                      {dup && <Chip tone="gold">already here</Chip>}
                    </div>
                  )
                })}
                {batch.tasks.length > 5 && <div style={{ ...help, padding: '9px 0' }}>… and {batch.tasks.length - 5} more</div>}
                {batch.tasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '12px 0' }}>Nothing to bring in from this file.</div>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
                Include completed tasks ({completedCount})
              </label>
              {batch.source === 'akiflow' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeEvents} onChange={(e) => setIncludeEvents(e.target.checked)} />
                  Include calendar events ({batch.events.length})
                </label>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
                <Button onClick={() => void runImport(batch, existing)}>Import {willImport} task{willImport === 1 ? '' : 's'}</Button>
                <Button variant="ghost" onClick={() => setStep({ name: 'pick' })}>Start over</Button>
              </div>
            </div>
          )
        })()}

        {step.name === 'importing' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 14 }}>Importing</SectionLabel>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--line-solid)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${step.total ? Math.round((step.done / step.total) * 100) : 0}%`, background: 'var(--acc-sage)', transition: 'width 200ms' }} />
            </div>
            <div style={{ ...help, marginTop: 10 }}>planting {step.done} of {step.total}…</div>
          </div>
        )}

        {step.name === 'summary' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 14 }}>Done</SectionLabel>
            <div style={{ fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.7 }}>
              {step.summary.written.projects} projects · {step.summary.written.tasks} tasks
              {step.summary.written.events > 0 && <> · {step.summary.written.events} events</>} brought in.
            </div>
            <div style={{ ...help, marginTop: 8 }}>
              {step.summary.skipped.tasks + step.summary.skipped.projects + step.summary.skipped.events} already here, left untouched
              {step.summary.skipped.completed > 0 && <> · {step.summary.skipped.completed} completed left behind</>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button onClick={() => navigate('/tasks')}>See the tasks</Button>
              <Button variant="secondary" onClick={() => { setStep({ name: 'pick' }); setIncludeCompleted(false); setIncludeEvents(false) }}>Import another file</Button>
            </div>
          </div>
        )}

        <TidyDuplicates />
      </div>
    </div>
  )
}
