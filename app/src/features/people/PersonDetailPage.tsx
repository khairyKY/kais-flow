import { useState, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { usePeople, useInteractions, upsertPerson, deletePersonWithUndo, createInteraction, updateInteraction, deleteInteractionWithUndo, getDaysUntilBirthday, removeFactWithUndo, withFactSaved, logTouchWithUndo } from './api'
import { RenameField } from '../../components/RenameField'
import { DateField } from '../../components/DatePicker'
import { Select } from '../../components/Select'
import { Skeleton, ErrorCard } from '../../components/States'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { zoneTimeKey, zoneToIso } from '../calendar/eventTime'
import { useDomains } from '../domains/api'
import type { Fact } from '../../lib/types'
import { BackLink, Button } from '../../components/kit'
import { openCapture } from '../command-bar/commandBarStore'

const FACT_TYPES = ['Interest', 'Birthday', 'Note', 'Family']
const LOG_CHANNELS = [{ value: 'in person', label: 'In person' }, { value: 'call', label: 'Call' }, { value: 'text', label: 'Text' }, { value: 'email', label: 'Email' }]
const LOG_DAYS = ['today', 'yesterday', '1w ago'].map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))
// The fsel look (paper-bone field, 12.5px) on the themed Select's trigger.
const fsel: React.CSSProperties = { background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '8px 11px', fontSize: 'var(--fs-caption)', color: 'var(--ink-body)' }
// The .chip pills as real buttons.
const chipBtn: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer' }
// A ✕ that removes a row: a real button, 44px to a finger (.kf-hit).
const removeBtn: React.CSSProperties = { flex: 'none', width: 24, height: 24, border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 'var(--fs-caption)', color: 'var(--ink-faint)', cursor: 'pointer', borderRadius: 999 }

/** A stored fact date for the date picker: legacy "MM-DD" gains this year. */
function factDateForField(date: string | null | undefined): string {
  if (!date) return ''
  const md = /^(\d{1,2})-(\d{1,2})$/.exec(date)
  return md ? `${zoneDateKey(new Date()).slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}` : date
}

function getAvatarBgColor(name: string): string {
  const colors = [
    'color-mix(in oklch, var(--acc-hydrangea) 30%, transparent)', 'color-mix(in oklch, var(--acc-blossom) 32%, transparent)', 'color-mix(in oklch, var(--acc-clover) 30%, transparent)',
    'color-mix(in oklch, var(--acc-buttercream) 35%, transparent)', 'color-mix(in oklch, var(--acc-moss) 28%, transparent)'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getCloverAsset(days: number | null): string {
  // Never touched → seedling (a new relationship, not a neglected one). The old sentinel
  // reached this as 9999 and picked seedling by accident; now it's the stated rule.
  if (days === null) return '/ds/assets/clover/seedling.png'
  if (days === 0) return '/ds/assets/clover/four_leaf.png'
  if (days <= 3) return '/ds/assets/clover/dewdrop.png'
  if (days <= 7) return '/ds/assets/clover/awake.png'
  if (days <= 21) return '/ds/assets/clover/resting.png'
  return '/ds/assets/clover/seedling.png'
}

function daysSince(s: string): number { return Math.floor((Date.now() - new Date(s).getTime()) / 86400000) }

function getBannerText(name: string, d: number): string {
  if (d === 0) return `${name} turns a year older today!`
  if (d === 1) return `${name} turns a year older tomorrow`
  if (d <= 7) {
    const bday = new Date(); bday.setDate(bday.getDate() + d)
    return `${name} turns a year older on ${bday.toLocaleDateString('en-US', { weekday: 'long' })}`
  }
  return `${name} turns a year older in ${d} days`
}

/* Bloom icon (30 × 30 for the detail banner) */
const BloomIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" style={{ flex: 'none' }}>
    <g fill="var(--acc-sage)"><ellipse cx="12" cy="6.8" rx="3" ry="4.2" /><ellipse cx="6.8" cy="13.8" rx="3" ry="4.2" transform="rotate(-70 6.8 13.8)" /><ellipse cx="17.2" cy="13.8" rx="3" ry="4.2" transform="rotate(70 17.2 13.8)" /></g>
    <circle cx="12" cy="12" r="4" fill="var(--acc-blossom)" /><circle cx="12" cy="12" r="1.8" fill="var(--acc-gold-warm)" />
  </svg>
)

/* Moments row icon — filled clover for Birthday, dim leaf-dot for other moments */
const MomentIcon = ({ filled }: { filled: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" style={{ flex: 'none', opacity: filled ? 1 : 0.7 }}>
    <g fill="var(--acc-sage)"><ellipse cx="12" cy="7.4" rx="2.6" ry="3.6" /><ellipse cx="7.6" cy="13.6" rx="2.6" ry="3.6" transform="rotate(-70 7.6 13.6)" /><ellipse cx="16.4" cy="13.6" rx="2.6" ry="3.6" transform="rotate(70 16.4 13.6)" /></g>
    {filled ? <circle cx="12" cy="12" r="3.4" fill="var(--acc-blossom)" /> : <circle cx="12" cy="12.4" r="1.6" fill="var(--acc-sage-text)" />}
  </svg>
)

export function PersonDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const peopleQuery = usePeople()
  const { data: people = [], refetch: refetchPeople } = peopleQuery
  const { data: interactions = [], refetch: refetchInteractions } = useInteractions()
  const { data: domains = [] } = useDomains()

  const person = useMemo(() => people.find((p) => p.id === id) ?? null, [people, id])
  const personInteractions = useMemo(() => interactions.filter((i) => i.person_id === id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [interactions, id])
  const domain = useMemo(() => (person?.domain_id ? domains.find((d) => d.id === person.domain_id) ?? null : null), [person, domains])
  // null = never touched. The old 9999 sentinel flowed straight into the formatter, so a
  // brand-new person read "last touch 1428w ago" (punch 2, fresh-account sweep).
  const lastTouchDays = useMemo(() => (personInteractions.length ? daysSince(personInteractions[0].occurred_at) : null), [personInteractions])

  const bdayFact = person?.facts?.find((f) => f.label === 'Birthday') ?? null
  const daysUntilBday = bdayFact ? getDaysUntilBirthday(bdayFact.date || bdayFact.value) : null
  const momentFacts = useMemo(() => (person?.facts || []).filter((f) => f.date), [person])

  // Facts form
  const [newFactType, setNewFactType] = useState('Interest')
  const [newFactValue, setNewFactValue] = useState('')
  const [newFactDate, setNewFactDate] = useState('')
  const [newFactRecurs, setNewFactRecurs] = useState(false)
  // A fact being edited sits in the add-fact form and replaces the stored one only on save.
  const [editingFact, setEditingFact] = useState<string | null>(null)
  const factValueRef = useRef<HTMLInputElement>(null)

  // Interactions form
  const [logChannel, setLogChannel] = useState('in person')
  const [logSummary, setLogSummary] = useState('')
  const [logDate, setLogDate] = useState('today')
  // Kai 2026-10-12: an interaction's summary is edited in place (its day through the date picker).
  const [editingInteraction, setEditingInteraction] = useState<string | null>(null)

  // Edit person
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')

  if (!person) {
    // Designed states: nothing cached yet → skeleton; the load failed → retry; only a loaded
    // directory without this id is "not found".
    if (peopleQuery.isPending) return <div style={{ maxWidth: 760 }}><Skeleton rows={4} /></div>
    if (peopleQuery.isError) return <div style={{ maxWidth: 760 }}><ErrorCard message="Couldn't load this person." onRetry={() => void refetchPeople()} /></div>
    return <div style={{ padding: 40, color: 'var(--ink-body)' }}>Person not found. <Link to="/people">Back to directory</Link></div>
  }

  const resetFactForm = () => {
    setEditingFact(null); setNewFactValue(''); setNewFactDate(''); setNewFactRecurs(false)
  }

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFactValue.trim()) return
    const fact: Fact = { id: editingFact ?? crypto.randomUUID(), label: newFactType, value: newFactValue.trim(), date: newFactDate || null, recurs: newFactRecurs }
    upsertPerson({ ...person, facts: withFactSaved(person.facts || [], fact) }, false)
    resetFactForm()
    void refetchPeople()
  }

  // Kai's flow audit: "edit" used to delete the fact and refill the form — leave the page and it was
  // gone. Now it only loads the form; the stored fact changes on Save.
  const editFact = (f: Fact) => {
    setEditingFact(f.id)
    setNewFactType(f.label)
    setNewFactValue(f.value)
    setNewFactDate(factDateForField(f.date))
    setNewFactRecurs(!!f.recurs)
    factValueRef.current?.focus()
  }

  const handleLog = (e: React.FormEvent) => {
    e.preventDefault()
    if (!logSummary.trim()) return
    let at = new Date().toISOString()
    if (logDate === 'yesterday') at = new Date(Date.now() - 86400000).toISOString()
    else if (logDate === '1w ago') at = new Date(Date.now() - 7 * 86400000).toISOString()
    createInteraction({ person_id: person.id, summary: logSummary.trim(), occurred_at: at })
    setLogSummary('')
    void refetchInteractions()
  }

  const savePerson = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    upsertPerson({ ...person, name: editName.trim(), domain_id: editDomain || null }, false)
    setEditing(false)
    void refetchPeople()
  }

  // The editor starts from the person as they are when it opens (it used to be re-seeded during
  // render, on every refetch).
  const toggleEditor = () => {
    if (!editing) { setEditName(person.name); setEditDomain(person.domain_id ?? '') }
    setEditing(!editing)
  }

  // Flow Audit §4: delete = Undo toast, no confirm. Undo brings back the person and their log.
  const removePerson = () => { deletePersonWithUndo(person); navigate('/people') }

  const lastTouchLabel =
    lastTouchDays === null ? 'no history yet' : lastTouchDays === 0 ? 'today' : lastTouchDays === 1 ? 'yesterday' : lastTouchDays < 7 ? `${lastTouchDays}d ago` : `${Math.floor(lastTouchDays / 7)}w ago`

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`
        .chip{font-family:var(--font-mono);font-size: var(--fs-meta);letter-spacing: var(--ls-meta);padding:4px 9px;border-radius:999px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .flabel{font-family:var(--font-mono);font-size: var(--fs-meta);letter-spacing: var(--ls-meta);color:var(--ink-faint)}
        .fhelp { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-meta); color: var(--ink-faint); }
        .slabel{display:flex;align-items:center;gap:12px;font-family:var(--font-ui);font-size:var(--fs-section);font-weight:var(--fw-semibold);color:var(--ink-body)}
        .slabel .r{flex:1}
        .av{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--ink-body);flex:none}
      `}</style>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px 16px' }}>
        <BackLink to="/people">People</BackLink>
        <span className="fhelp">Added {new Date(person.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · {person.facts?.length || 0} facts · {personInteractions.length} interactions</span>
      </div>

      {/* Birthday banner (2b) */}
      {daysUntilBday !== null && daysUntilBday <= 14 && bdayFact && (
        <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
          <BloomIcon />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14.5px', color: 'var(--ink-body)' }}>{getBannerText(person.name, daysUntilBday)}</div>
            <div className="fhelp" style={{ marginTop: 3 }}>Birthday · {bdayFact.value} · repeats yearly</div>
          </div>
          <span onClick={() => { window.dispatchEvent(new CustomEvent('prefill-command-bar', { detail: `task: for ${person.name}'s birthday` })); openCapture() }} style={{ fontSize: '12.5px', color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer', flex: 'none' }}>Plan something →</span>
        </div>
      )}

      {/* Person header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
        <span className="av" style={{ width: 52, height: 52, fontSize: 21, background: getAvatarBgColor(person.name) }}>{person.name.charAt(0)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-clover-text)' }}>{domain?.name || 'Uncategorized'} · <span style={{ whiteSpace: 'nowrap' }}>last touch {lastTouchLabel}</span></div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 34, lineHeight: 1.1, color: 'var(--ink-body)' }}>{person.name}</h1>
        </div>
        <img src={getCloverAsset(lastTouchDays)} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={() => logTouchWithUndo(person, 'call')} className="chip kf-hit" style={{ ...chipBtn, background: 'color-mix(in oklch, var(--acc-clover) 20%, transparent)', color: 'var(--acc-clover-text)' }}>Log a call</button>
        <button type="button" onClick={() => logTouchWithUndo(person, 'meet')} className="chip kf-hit" style={{ ...chipBtn, background: 'color-mix(in oklch, var(--acc-clover) 20%, transparent)', color: 'var(--acc-clover-text)' }}>Met in person</button>
        <button type="button" onClick={() => logTouchWithUndo(person, 'text')} className="chip kf-hit" style={{ ...chipBtn, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>Text</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={toggleEditor} className="chip kf-hit" style={{ ...chipBtn, border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)' }}>{editing ? 'Close editor' : 'Edit person ▸'}</button>
      </div>

      {/* Inline editor */}
      {editing && (
        <form onSubmit={savePerson} style={{ marginTop: 14, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', padding: 14, borderRadius: 'var(--radius-card)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div className="flabel" style={{ marginBottom: 4 }}>Name</div>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: 8, fontSize: 'var(--fs-body-s)' }} />
          </div>
          <div style={{ width: 180 }}>
            <div className="flabel" style={{ marginBottom: 4 }}>Circle</div>
            <Select
              value={editDomain}
              onChange={setEditDomain}
              ariaLabel="Circle"
              options={[{ value: '', label: 'No Circle' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
              style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: 8, fontSize: 'var(--fs-body-s)' }}
            />
          </div>
          <Button type="submit" variant="cta" style={{ padding: '8px 16px', fontSize: 12 }}>Save</Button>
        </form>
      )}

      {/* Moments (2b) — dated facts: birthdays, anniversaries, one-off milestones */}
      <div className="slabel" style={{ margin: '22px 0 6px' }}><span style={{ color: 'var(--acc-clover-text)' }}>Moments</span><span className="r" /></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {momentFacts.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: '1px solid var(--line-dashed)' }}>
            <MomentIcon filled={f.label === 'Birthday'} />
            <span style={{ fontSize: '13.5px', color: 'var(--ink-body)' }}>{f.label}</span>
            <span className="fhelp">{f.date}</span>
            <span style={{ flex: 1 }} />
            {f.recurs
              ? <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>Yearly ✓</span>
              : <span className="chip" style={{ border: '1px dashed var(--line-solid)', color: 'var(--ink-faint)' }}>Once</span>}
            <button type="button" className="kf-hit" onClick={() => editFact(f)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 'var(--fs-caption)', color: editingFact === f.id ? 'var(--acc-clover-text)' : 'var(--ink-faint)', textDecoration: 'underline', cursor: 'pointer' }}>{editingFact === f.id ? 'Editing…' : 'Edit'}</button>
          </div>
        ))}
        <div
          onClick={() => factValueRef.current?.focus()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px', cursor: 'pointer' }}
        >
          <span style={{ width: 15, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 14, flex: 'none' }}>+</span>
          <span style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Add a moment… label · date · repeats yearly</span>
        </div>
      </div>

      {/* Facts */}
      <div className="slabel" style={{ margin: '26px 0 6px' }}><span>Facts · {person.facts?.length || 0}</span><span className="r" /></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {(person.facts || []).map((f) => (
          // A phone row too narrow for value + recurs + nudge wraps them whole onto a second line.
          <div key={f.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', padding: '9px 2px', borderBottom: '1px solid var(--line-dashed)' }}>
            <span className="flabel" style={{ width: 88, flex: 'none' }}>{f.label}</span>
            <span style={{ fontSize: '13.5px', color: 'var(--ink-body)', flex: '1 1 96px', minWidth: 0 }}>{f.value}</span>
            {f.recurs && <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' }}>↻ Recurs</span>}
            {f.label === 'Birthday' && f.date && <span className="fhelp" style={{ marginLeft: 'auto' }}>Nudges 2 weeks out</span>}
            <button type="button" className="kf-hit" aria-label={`Remove ${f.label}`} onClick={() => removeFactWithUndo(person, f.id)} style={{ ...removeBtn, marginLeft: 4 }}>✕</button>
          </div>
        ))}
        {/* Add fact row (also the editor for an existing fact — `edit` above) */}
        <form onSubmit={handleAddFact} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 2px', flexWrap: 'wrap' }}>
          <Select
            value={newFactType}
            onChange={setNewFactType}
            ariaLabel="Fact type"
            options={(FACT_TYPES.includes(newFactType) ? FACT_TYPES : [...FACT_TYPES, newFactType]).map((t) => ({ value: t, label: t }))}
            style={fsel}
          />
          <span style={{ flex: 1, minWidth: 160 }}>
            <input ref={factValueRef} type="text" placeholder={newFactType === 'Birthday' ? 'e.g. July 17' : 'a thing worth remembering…'} value={newFactValue} onChange={(e) => setNewFactValue(e.target.value)} required style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '8px 11px', fontSize: 'var(--fs-caption)', color: 'var(--ink-body)', fontStyle: newFactValue ? 'normal' : 'italic', outline: 'none' }} />
          </span>
          <DateField
            value={newFactDate}
            onChange={setNewFactDate}
            title="Date"
            placeholder="date?"
            ariaLabel="Fact date"
            style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999, border: '1px solid var(--line-solid)', background: 'none', color: 'var(--ink-muted)' }}
          />
          <button type="button" aria-pressed={newFactRecurs} aria-label="Repeats yearly" onClick={() => setNewFactRecurs(!newFactRecurs)} className="chip kf-hit" style={{ ...chipBtn, border: '1px solid var(--line-solid)', color: newFactRecurs ? 'var(--acc-clover-text)' : 'var(--ink-muted)' }}>↻</button>
          {editingFact && <button type="button" onClick={resetFactForm} className="chip kf-hit" style={{ ...chipBtn, border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)' }}>Cancel</button>}
          <Button type="submit">{editingFact ? 'Save fact' : 'Add fact'}</Button>
        </form>
      </div>

      {/* Interactions */}
      <div className="slabel" style={{ margin: '24px 0 6px' }}><span>Interactions · {personInteractions.length}</span><span className="r" /></div>
      <form onSubmit={handleLog} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 0 12px', flexWrap: 'wrap' }}>
        <Select value={logChannel} onChange={setLogChannel} ariaLabel="Channel" options={LOG_CHANNELS} style={fsel} />
        <span style={{ flex: 1, minWidth: 160 }}>
          <input type="text" placeholder="what did you talk about?" value={logSummary} onChange={(e) => setLogSummary(e.target.value)} required style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '8px 11px', fontSize: 'var(--fs-caption)', color: 'var(--ink-body)', fontStyle: logSummary ? 'normal' : 'italic', outline: 'none' }} />
        </span>
        <Select value={logDate} onChange={setLogDate} ariaLabel="When" options={LOG_DAYS} style={fsel} />
        <Button type="submit">Log</Button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {personInteractions.map((i, idx) => {
          const s = i.summary.toLowerCase()
          const channel = s.includes('call') || s.includes('phone') ? 'call' : s.includes('dinner') || s.includes('met ') || s.includes('in person') ? 'in person' : 'text'
          const chipStyle = channel === 'in person' ? { background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)' } : { border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }
          return (
            <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 2px', borderBottom: idx < personInteractions.length - 1 ? '1px solid var(--line-dashed)' : 'none' }}>
              {/* The day opens the app's date picker (not the future); the time of day stays. */}
              <DateField
                value={zoneDateKey(new Date(i.occurred_at))}
                max={zoneDateKey(new Date())}
                clearable={false}
                onChange={(v) => { if (v && v <= zoneDateKey(new Date())) updateInteraction(i, { occurred_at: zoneToIso(v, zoneTimeKey(new Date(i.occurred_at))) }) }}
                title="When"
                ariaLabel="Date of this interaction"
                style={{ width: 74, flex: 'none', padding: '3px 0 0', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', background: 'none', border: 'none', whiteSpace: 'normal' }}
              />
              <span className="chip" style={{ ...chipStyle, flex: 'none' }}>{channel.charAt(0).toUpperCase() + channel.slice(1)}</span>
              {editingInteraction === i.id ? (
                <span style={{ fontSize: '13.5px', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                  <RenameField
                    value={i.summary}
                    ariaLabel="Edit interaction"
                    style={{ margin: '-3px 0' }}
                    onDone={(next) => {
                      setEditingInteraction(null)
                      if (next && next !== i.summary) updateInteraction(i, { summary: next })
                    }}
                  />
                </span>
              ) : (
                <span role="button" tabIndex={0} title="Edit" onClick={() => setEditingInteraction(i.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditingInteraction(i.id) } }} style={{ fontSize: '13.5px', color: 'var(--ink-body)', lineHeight: 1.5, flex: 1, cursor: 'text' }}>{i.summary}</span>
              )}
              <button type="button" className="kf-hit" aria-label="Remove interaction" onClick={() => deleteInteractionWithUndo(i)} style={removeBtn}>✕</button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 14, borderTop: '1px solid var(--line-dashed)' }}>
        <button type="button" className="kf-hit" onClick={removePerson} style={{ border: 'none', background: 'none', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)', cursor: 'pointer' }}>Delete person</button>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-muted)' }}>The log is the memory ✿</span>
      </div>
    </div>
  )
}
