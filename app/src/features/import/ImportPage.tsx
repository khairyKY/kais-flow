import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip, SectionLabel } from '../../components/kit'
import { ConfirmCard } from '../projects/ConfirmCard'
import { useTasks, setRecurrence, deleteTask, restoreTask } from '../tasks/api'
import { toastUndo } from '../../lib/undo'
import { type ImportBatch, mergeBatches } from './adapters/shared'
import { parseAkiflow } from './adapters/akiflow'
import { parseCsv, csvToBatch, guessMapping, CSV_TARGETS, type CsvMapping } from './adapters/csv'
import { parseTodoist } from './adapters/todoist'
import { parseTickTick } from './adapters/ticktick'
import {
  fetchAllExistingRefs, commitBatch, planCommit, undoImport, refKey, KINDS,
  type ExistingRefs, type ImportSummary, type Kind, type Counts,
} from './api'
import { findDuplicateClusters, MIN_CLUSTER, type DupeCluster } from './dedupe'

// P-IMPORT wizard: source → file(s) → (csv/notion mapping) → preview → import → summary (+ Undo).
// Quiet, minimal, §04 kit + tokens only. States.dc.html rules: never the word "error".

type Source = 'akiflow' | 'todoist' | 'ticktick' | 'csv'
// One line each: what to drop, and where the source's own menus hide the export.
const SOURCES: Record<Source, { label: string; accept: string; multiple?: boolean; how: string; match?: string }> = {
  akiflow: { label: 'Akiflow JSON', accept: '.json', how: 'akiflow-dump.json · from the prompt-bank dump prompt' },
  todoist: { label: 'Todoist', accept: '.csv', multiple: true, how: 'Todoist: open a project → ⋯ → Export as a template → Download CSV · one file per project, several at once is fine', match: 'todoist csvs carry no ids — a re-import matches tasks by file + section + title' },
  ticktick: { label: 'TickTick', accept: '.csv', how: 'TickTick (web): Settings → Account → Backup & Restore → Generate backup — the .csv it downloads' },
  csv: { label: 'Generic CSV', accept: '.csv', how: 'a .csv with a header row · you map the columns next', match: 'csv rows have no ids — duplicates are matched by a hash of title + due + project' },
}

type Step =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'mapping'; source: 'csv'; rows: string[][]; fileName: string; mapping: CsvMapping }
  | { name: 'preview'; batch: ImportBatch; existing: ExistingRefs }
  | { name: 'importing'; done: number; total: number; undoing?: boolean }
  | { name: 'summary'; summary: ImportSummary; undone?: boolean }

const NOUN: Record<Kind, [string, string]> = {
  projects: ['project', 'projects'], tasks: ['task', 'tasks'], events: ['event', 'events'], books: ['book', 'books'],
  quotes: ['highlight', 'highlights'], notes: ['note', 'notes'], inbox: ['inbox note', 'inbox notes'],
}
const TONE = { projects: 'sage', tasks: 'tasks', events: 'hydrangea', books: 'gold', quotes: 'lavender', notes: 'clover', inbox: 'inbox' } as const
const count = (k: Kind, n: number) => `${n} ${NOUN[k][n === 1 ? 0 : 1]}`
/** "12 tasks · 2 projects" — non-zero kinds only. */
function describe(c: Counts) {
  return KINDS.filter((k) => c[k] > 0).map((k) => count(k, c[k])).join(' · ')
}

const card: React.CSSProperties = {
  background: 'var(--paper-parchment)', border: '1px solid var(--line-card)',
  borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '18px 20px',
}
const help: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em',
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
    rest.forEach((t) => deleteTask(t)) // outbox soft-delete — lands in Trash, restorable
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
  const [includeToRead, setIncludeToRead] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const opts = { includeCompleted, includeEvents, includeToRead }
  const src = SOURCES[source]

  async function toPreview(batch: ImportBatch) {
    try {
      const existing = await fetchAllExistingRefs()
      setStep({ name: 'preview', batch, existing })
    } catch {
      setStep({ name: 'pick' })
      setTrouble("Couldn't check for already-imported rows — check the connection and try again.")
    }
  }

  /** The chosen source's adapter over the picked file(s); null = handed off to the mapping step. */
  async function parse(files: File[]): Promise<ImportBatch | null> {
    const first = files[0]
    switch (source) {
      case 'akiflow':
        return parseAkiflow(JSON.parse(await first.text()))
      case 'ticktick':
        return parseTickTick(await first.text())
      case 'todoist':
        return mergeBatches(await Promise.all(files.map(async (f) => parseTodoist(await f.text(), f.name))))
      case 'csv': {
        const rows = parseCsv(await first.text())
        if (rows.length < 2) throw new Error('a header row plus at least one row is needed')
        setStep({ name: 'mapping', source, rows, fileName: first.name, mapping: recallMapping(first.name) ?? guessMapping(rows[0]) })
        return null
      }
    }
  }

  async function handleFiles(list: File[]) {
    setTrouble(null)
    const files = src.multiple ? list : list.slice(0, 1)
    if (!files.length) return
    setStep({ name: 'reading' })
    let batch: ImportBatch | null
    try {
      batch = await parse(files)
    } catch {
      setStep({ name: 'pick' })
      setTrouble(`That didn't read as a ${src.label} file. ${src.how}.`)
      return
    }
    if (batch) await toPreview(batch)
  }

  async function runImport(batch: ImportBatch, existing: ExistingRefs) {
    setStep({ name: 'importing', done: 0, total: 0 })
    const summary = await commitBatch(batch, existing, opts, (done, total) => setStep({ name: 'importing', done, total }))
    setStep({ name: 'summary', summary })
  }

  async function runUndo(summary: ImportSummary) {
    setStep({ name: 'importing', done: 0, total: 0, undoing: true })
    await undoImport(summary, (done, total) => setStep({ name: 'importing', done, total, undoing: true }))
    setStep({ name: 'summary', summary, undone: true })
  }

  function reset() {
    setStep({ name: 'pick' })
    setIncludeCompleted(false)
    setIncludeEvents(false)
    setIncludeToRead(false)
  }

  const toggle = (checked: boolean, set: (v: boolean) => void, label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  )
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line-dashed)' }
  const rowTitle: React.CSSProperties = { fontSize: 13, color: 'var(--ink-body)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {(Object.keys(SOURCES) as Source[]).map((v) => (
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
                  {SOURCES[v].label}
                </button>
              ))}
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void handleFiles(Array.from(e.dataTransfer.files))
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '1.5px dashed var(--line-solid)', borderRadius: 6, padding: '36px 20px',
                textAlign: 'center', cursor: 'pointer', background: 'var(--paper-bone)',
              }}
            >
              <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>Drop the file{src.multiple ? 's' : ''} here, or click to pick</div>
              <div style={{ ...help, marginTop: 8, textTransform: 'none', letterSpacing: '0.04em', lineHeight: 1.5 }}>{src.how}</div>
              <input
                ref={fileRef}
                type="file"
                data-testid="import-file"
                accept={src.accept}
                multiple={!!src.multiple}
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handleFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </div>
            {trouble && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--acc-terra)' }}>{trouble}</p>}
          </div>
        )}

        {step.name === 'reading' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 8 }}>Reading</SectionLabel>
            <div style={help}>sorting the seeds…</div>
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
                  setStep({ name: 'reading' })
                  void csvToBatch(step.rows, step.mapping, step.source).then(toPreview)
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
          const plan = planCommit(batch, existing, opts)
          const writes = Object.fromEntries(KINDS.map((k) => [k, plan.rows[k].length])) as Counts
          const total = KINDS.reduce((n, k) => n + writes[k], 0)
          const completedCount = batch.tasks.filter((t) => t.done).length
          const toReadCount = batch.books.filter((b) => b.shelf === 'to-read').length
          const quotesOf = (title: string) => batch.quotes.filter((q) => q.book === title).length
          return (
            <div style={card}>
              <SectionLabel style={{ marginBottom: 14 }}>Preview</SectionLabel>
              <div data-testid="import-counts" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {KINDS.filter((k) => batch[k].length > 0).map((k) => (
                  <Chip key={k} tone={TONE[k]}>{count(k, batch[k].length)}{plan.skipped[k] ? ` · ${plan.skipped[k]} already here` : ''}</Chip>
                ))}
                {completedCount > 0 && <Chip>{completedCount} completed</Chip>}
              </div>
              {SOURCES[batch.source as Source]?.match && <div style={{ ...help, marginBottom: 10 }}>{SOURCES[batch.source as Source].match}</div>}
              <div style={{ borderTop: '1px dashed var(--line-dashed)', marginTop: 8 }}>
                {batch.tasks.slice(0, 5).map((t) => {
                  const dup = existing.tasks.has(refKey(t.external_ref.source, t.external_ref.id))
                  const projectName = batch.projects.find((p) => p.external_ref.id === t.sourceProjectId)?.name
                  return (
                    <div key={t.external_ref.id} style={row}>
                      <span style={{ ...rowTitle, color: t.done ? 'var(--ink-faint)' : 'var(--ink-body)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                      {projectName && <span style={{ ...help, textTransform: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</span>}
                      {t.recurrence_rule && <span style={help}>↻</span>}
                      <span style={help}>{fmtDate(t.due_at)}</span>
                      {t.priority && <span style={help}>{'!'.repeat(4 - t.priority)}</span>}
                      {dup && <Chip tone="gold">already here</Chip>}
                    </div>
                  )
                })}
                {batch.tasks.length === 0 && batch.books.slice(0, 5).map((b) => (
                  <div key={b.title} style={row}>
                    <span style={rowTitle}>{b.title}</span>
                    {b.author && <span style={{ ...help, textTransform: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>}
                    <span style={help}>{quotesOf(b.title) ? count('quotes', quotesOf(b.title)) : b.shelf}</span>
                  </div>
                ))}
                {batch.tasks.length === 0 && batch.books.length === 0 && [...batch.notes.map((n) => n.title ?? n.body), ...batch.inbox.map((i) => i.raw_text)].slice(0, 5).map((text, i) => (
                  <div key={i} style={row}><span style={rowTitle}>{text}</span></div>
                ))}
                {(() => {
                  const shown = batch.tasks.length || batch.books.length || batch.notes.length + batch.inbox.length
                  return shown > 5 ? <div style={{ ...help, padding: '9px 0' }}>… and {shown - 5} more</div> : null
                })()}
                {KINDS.every((k) => batch[k].length === 0) && <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '12px 0' }}>Nothing to bring in from this file.</div>}
              </div>
              {completedCount > 0 && toggle(includeCompleted, setIncludeCompleted, `Include completed tasks (${completedCount})`)}
              {batch.events.length > 0 && toggle(includeEvents, setIncludeEvents, `Include calendar events (${batch.events.length})`)}
              {toReadCount > 0 && toggle(includeToRead, setIncludeToRead, `Include the want-to-read shelf (${toReadCount}) — they land as reading, page 0`)}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
                <Button disabled={!total} style={total ? undefined : { opacity: 0.5, cursor: 'default' }} onClick={() => void runImport(batch, existing)}>
                  {total ? `Import ${describe(writes)}` : 'Nothing new to import'}
                </Button>
                <Button variant="ghost" onClick={reset}>Start over</Button>
              </div>
            </div>
          )
        })()}

        {step.name === 'importing' && (
          <div style={card}>
            <SectionLabel style={{ marginBottom: 14 }}>{step.undoing ? 'Taking it back' : 'Importing'}</SectionLabel>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--line-solid)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${step.total ? Math.round((step.done / step.total) * 100) : 0}%`, background: 'var(--acc-sage)', transition: 'width 200ms' }} />
            </div>
            <div style={{ ...help, marginTop: 10 }}>{step.undoing ? 'lifting' : 'planting'} {step.done} of {step.total}…</div>
          </div>
        )}

        {step.name === 'summary' && (() => {
          const { written, skipped } = step.summary
          const already = KINDS.reduce((n, k) => n + skipped[k], 0)
          const toLibrary = written.books + written.quotes > 0
          return (
            <div style={card}>
              <SectionLabel style={{ marginBottom: 14 }}>{step.undone ? 'Taken back' : 'Done'}</SectionLabel>
              <div data-testid="import-summary" style={{ fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.7 }}>
                {step.undone
                  ? <>Undone — {describe(written) || 'nothing'} removed. Tasks and inbox notes wait in the Trash.</>
                  : <>{describe(written) || 'Nothing new'} brought in.</>}
              </div>
              {!step.undone && (
                <div style={{ ...help, marginTop: 8 }}>
                  {already} already here, left untouched
                  {skipped.completed > 0 && <> · {skipped.completed} completed left behind</>}
                  {skipped.toRead > 0 && <> · {skipped.toRead} want-to-read left behind</>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                {!step.undone && <Button onClick={() => navigate(toLibrary ? '/library' : '/tasks')}>{toLibrary ? 'See the library' : 'See the tasks'}</Button>}
                <Button variant="secondary" onClick={reset}>Import another file</Button>
                {!step.undone && step.summary.rows.length > 0 && (
                  <Button variant="ghost" onClick={() => void runUndo(step.summary)}>Undo this import</Button>
                )}
              </div>
            </div>
          )
        })()}

        <TidyDuplicates />
      </div>
    </div>
  )
}
