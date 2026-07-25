import { useState, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { usePeople, useInteractions, upsertPerson, deletePerson, createInteraction, deleteInteraction, getDaysUntilBirthday } from './api'
import { useDomains } from '../domains/api'
import type { Fact } from '../../lib/types'
import { BackLink, Button } from '../../components/kit'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { ConfirmCard } from '../projects/ConfirmCard'

function getAvatarBgColor(name: string): string {
  const colors = [
    'color-mix(in oklch, var(--acc-hydrangea) 30%, transparent)', 'color-mix(in oklch, var(--acc-blossom) 32%, transparent)', 'color-mix(in oklch, var(--acc-clover) 30%, transparent)',
    'color-mix(in oklch, var(--acc-buttercream) 35%, transparent)', 'color-mix(in oklch, var(--acc-moss) 28%, transparent)'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getCloverAsset(days: number): string {
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
  const { data: people = [], refetch: refetchPeople } = usePeople()
  const { data: interactions = [], refetch: refetchInteractions } = useInteractions()
  const { data: domains = [] } = useDomains()
  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)

  const person = useMemo(() => people.find((p) => p.id === id) ?? null, [people, id])
  const personInteractions = useMemo(() => interactions.filter((i) => i.person_id === id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [interactions, id])
  const domain = useMemo(() => (person?.domain_id ? domains.find((d) => d.id === person.domain_id) ?? null : null), [person, domains])
  const lastTouchDays = useMemo(() => personInteractions.length ? daysSince(personInteractions[0].occurred_at) : 9999, [personInteractions])

  const bdayFact = person?.facts?.find((f) => f.label === 'Birthday') ?? null
  const daysUntilBday = bdayFact ? getDaysUntilBirthday(bdayFact.date || bdayFact.value) : null
  const momentFacts = useMemo(() => (person?.facts || []).filter((f) => f.date), [person])

  // Facts form
  const [newFactType, setNewFactType] = useState('Interest')
  const [newFactValue, setNewFactValue] = useState('')
  const [newFactDate, setNewFactDate] = useState('')
  const [newFactRecurs, setNewFactRecurs] = useState(false)
  const factValueRef = useRef<HTMLInputElement>(null)

  // Interactions form
  const [logChannel, setLogChannel] = useState('in person')
  const [logSummary, setLogSummary] = useState('')
  const [logDate, setLogDate] = useState('today')

  // Edit person
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editName, setEditName] = useState(person?.name ?? '')
  const [editDomain, setEditDomain] = useState(person?.domain_id ?? '')
  useMemo(() => { if (person) { setEditName(person.name); setEditDomain(person.domain_id ?? '') } }, [person])

  if (!person) return <div style={{ padding: 40, color: 'var(--ink-body)' }}>Person not found. <Link to="/people">Back to directory</Link></div>

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFactValue.trim()) return
    const fact: Fact = { id: crypto.randomUUID(), label: newFactType, value: newFactValue.trim(), date: newFactDate || null, recurs: newFactRecurs }
    upsertPerson({ ...person, facts: [...(person.facts || []), fact] }, false)
    setNewFactValue(''); setNewFactDate(''); setNewFactRecurs(false)
    void refetchPeople()
  }

  const removeFact = (fid: string) => {
    upsertPerson({ ...person, facts: (person.facts || []).filter((f) => f.id !== fid) }, false)
    void refetchPeople()
  }

  const editFact = (f: Fact) => {
    setNewFactType(f.label)
    setNewFactValue(f.value)
    setNewFactDate(f.date || '')
    setNewFactRecurs(!!f.recurs)
    removeFact(f.id)
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

  const quickTouch = (ch: string) => {
    createInteraction({ person_id: person.id, summary: ch === 'call' ? 'Phone call catch up' : ch === 'text' ? 'Text message catch up' : 'Met in person', occurred_at: new Date().toISOString() })
    void refetchInteractions()
  }

  const savePerson = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    upsertPerson({ ...person, name: editName.trim(), domain_id: editDomain || null }, false)
    setEditing(false)
    void refetchPeople()
  }

  // Kai audit E2 grammar: in-app ConfirmCard, never a native popup
  const removePerson = () => setConfirmDelete(true)

  const lastTouchLabel = lastTouchDays === 0 ? 'today' : lastTouchDays === 1 ? 'yesterday' : lastTouchDays < 7 ? `${lastTouchDays}d ago` : `${Math.floor(lastTouchDays / 7)}w ago`

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`
        .chip{font-family:var(--font-mono);font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;padding:4px 9px;border-radius:999px;display:inline-flex;align-items:center;gap:5px}
        .flabel{font-family:var(--font-mono);font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-faint)}
        .fhelp{font-family:var(--font-mono);font-size:8.5px;letter-spacing:0.06em;color:var(--ink-hairline)}
        .fsel{background:var(--paper-bone);border:1px solid var(--line-card);border-radius:6px;padding:8px 11px;font-size:12.5px;color:var(--ink-body);display:inline-flex;align-items:center;gap:8px}
        .slabel{display:flex;align-items:center;gap:12px;font-family:var(--font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink-faint)}
        .slabel .r{flex:1;height:1px;border-bottom:1px dashed var(--line-dashed)}
        .av{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--ink-body);flex:none}
      `}</style>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackLink to="/people">People</BackLink>
        <span className="fhelp">added {new Date(person.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · {person.facts?.length || 0} facts · {personInteractions.length} interactions</span>
      </div>

      {/* Birthday banner (2b) */}
      {daysUntilBday !== null && daysUntilBday <= 14 && bdayFact && (
        <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, transform: 'rotate(-0.3deg)' }}>
          <BloomIcon />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14.5px', color: 'var(--ink-body)' }}>{getBannerText(person.name, daysUntilBday)}</div>
            <div className="fhelp" style={{ marginTop: 3 }}>Birthday · {bdayFact.value} · repeats yearly</div>
          </div>
          <span onClick={() => { window.dispatchEvent(new CustomEvent('prefill-command-bar', { detail: `task: for ${person.name}'s birthday` })); setCommandBarOpen(true) }} style={{ fontSize: '12.5px', color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer', flex: 'none' }}>Plan something →</span>
        </div>
      )}

      {/* Person header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
        <span className="av" style={{ width: 52, height: 52, fontSize: 21, background: getAvatarBgColor(person.name) }}>{person.name.charAt(0)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-clover-text)' }}>{domain?.name || 'Uncategorized'} · last touch {lastTouchLabel}</div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 34, lineHeight: 1.1, color: 'var(--ink-body)' }}>{person.name}</h1>
        </div>
        <img src={getCloverAsset(lastTouchDays)} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <span onClick={() => quickTouch('call')} className="chip" style={{ background: 'color-mix(in oklch, var(--acc-clover) 20%, transparent)', color: 'var(--acc-clover-text)', cursor: 'pointer' }}>log a call</span>
        <span onClick={() => quickTouch('meet')} className="chip" style={{ background: 'color-mix(in oklch, var(--acc-clover) 20%, transparent)', color: 'var(--acc-clover-text)', cursor: 'pointer' }}>met in person</span>
        <span onClick={() => quickTouch('text')} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>text</span>
        <span style={{ flex: 1 }} />
        <span onClick={() => setEditing(!editing)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>{editing ? 'close editor' : 'edit person ▸'}</span>
      </div>

      {/* Inline editor */}
      {editing && (
        <form onSubmit={savePerson} style={{ marginTop: 14, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', padding: 14, borderRadius: 3, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div className="flabel" style={{ marginBottom: 4 }}>Name</div>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: 8, fontSize: 13 }} />
          </div>
          <div style={{ width: 180 }}>
            <div className="flabel" style={{ marginBottom: 4 }}>Circle</div>
            <select value={editDomain} onChange={(e) => setEditDomain(e.target.value)} style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: 8, fontSize: 13 }}>
              <option value="">No Circle</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <Button type="submit" variant="cta" style={{ padding: '8px 16px', fontSize: 12 }}>Save</Button>
        </form>
      )}

      {/* Moments (2b) — dated facts: birthdays, anniversaries, one-off milestones */}
      <div className="slabel" style={{ margin: '22px 0 6px' }}><span style={{ color: 'var(--acc-clover-text)' }}>Moments</span><span className="r" /></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {momentFacts.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
            <MomentIcon filled={f.label === 'Birthday'} />
            <span style={{ fontSize: '13.5px', color: 'var(--ink-body)' }}>{f.label}</span>
            <span className="fhelp">{f.date}</span>
            <span style={{ flex: 1 }} />
            {f.recurs
              ? <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>yearly ✓</span>
              : <span className="chip" style={{ border: '1px dashed var(--line-solid)', color: 'var(--ink-faint)' }}>once</span>}
            <span onClick={() => editFact(f)} style={{ fontSize: '11.5px', color: 'var(--ink-faint)', textDecoration: 'underline', cursor: 'pointer' }}>edit</span>
          </div>
        ))}
        <div
          onClick={() => factValueRef.current?.focus()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px', cursor: 'pointer' }}
        >
          <span style={{ width: 15, textAlign: 'center', color: 'var(--ink-hairline)', fontSize: 14, flex: 'none' }}>+</span>
          <span style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Add a moment… label · date · repeats yearly</span>
        </div>
      </div>

      {/* Facts */}
      <div className="slabel" style={{ margin: '26px 0 6px' }}><span>Facts · {person.facts?.length || 0}</span><span className="r" /></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {(person.facts || []).map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
            <span className="flabel" style={{ width: 88, flex: 'none' }}>{f.label}</span>
            <span style={{ fontSize: '13.5px', color: 'var(--ink-body)', flex: 1 }}>{f.value}</span>
            {f.recurs && <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' }}>↻ recurs</span>}
            {f.label === 'Birthday' && f.date && <span className="fhelp" style={{ marginLeft: 'auto' }}>nudges 2 weeks out</span>}
            <span onClick={() => removeFact(f.id)} style={{ fontSize: 11.5, color: 'var(--ink-faint)', cursor: 'pointer', marginLeft: 10 }}>✕</span>
          </div>
        ))}
        {/* Add fact row */}
        <form onSubmit={handleAddFact} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 2px', flexWrap: 'wrap' }}>
          <span className="fsel" style={{ cursor: 'pointer', position: 'relative' }}>
            <select value={newFactType} onChange={(e) => setNewFactType(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
              <option value="Interest">Interest</option><option value="Birthday">Birthday</option><option value="Note">Note</option><option value="Family">Family</option>
            </select>
            {newFactType} <span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
          </span>
          <span style={{ flex: 1, minWidth: 160 }}>
            <input ref={factValueRef} type="text" placeholder={newFactType === 'Birthday' ? 'e.g. July 17' : 'a thing worth remembering…'} value={newFactValue} onChange={(e) => setNewFactValue(e.target.value)} required style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', fontSize: '12.5px', color: 'var(--ink-body)', fontStyle: newFactValue ? 'normal' : 'italic', outline: 'none' }} />
          </span>
          <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer', position: 'relative' }}>
            <input type="text" placeholder="MM-DD" value={newFactDate} onChange={(e) => setNewFactDate(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%' }} />
            date?
          </span>
          <span onClick={() => setNewFactRecurs(!newFactRecurs)} className="chip" style={{ border: '1px solid var(--line-solid)', color: newFactRecurs ? 'var(--acc-clover-text)' : 'var(--ink-muted)', cursor: 'pointer' }}>↻</span>
          <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12, padding: '7px 14px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Add fact</button>
        </form>
      </div>

      {/* Interactions */}
      <div className="slabel" style={{ margin: '24px 0 6px' }}><span>Interactions · {personInteractions.length}</span><span className="r" /></div>
      <form onSubmit={handleLog} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 0 12px', flexWrap: 'wrap' }}>
        <span className="fsel" style={{ cursor: 'pointer', position: 'relative' }}>
          <select value={logChannel} onChange={(e) => setLogChannel(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
            <option value="in person">In person</option><option value="call">Call</option><option value="text">Text</option><option value="email">Email</option>
          </select>
          {logChannel === 'in person' ? 'In person' : logChannel.charAt(0).toUpperCase() + logChannel.slice(1)} <span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
        </span>
        <span style={{ flex: 1, minWidth: 160 }}>
          <input type="text" placeholder="what did you talk about?" value={logSummary} onChange={(e) => setLogSummary(e.target.value)} required style={{ width: '100%', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', fontSize: '12.5px', color: 'var(--ink-body)', fontStyle: logSummary ? 'normal' : 'italic', outline: 'none' }} />
        </span>
        <span className="fsel" style={{ cursor: 'pointer', position: 'relative' }}>
          <select value={logDate} onChange={(e) => setLogDate(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
            <option value="today">today</option><option value="yesterday">yesterday</option><option value="1w ago">1w ago</option>
          </select>
          {logDate} <span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
        </span>
        <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12, padding: '7px 14px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Log</button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {personInteractions.map((i, idx) => {
          const dateStr = new Date(i.occurred_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
          const s = i.summary.toLowerCase()
          const channel = s.includes('call') || s.includes('phone') ? 'call' : s.includes('dinner') || s.includes('met ') || s.includes('in person') ? 'in person' : 'text'
          const chipStyle = channel === 'in person' ? { background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)' } : { border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }
          return (
            <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 2px', borderBottom: idx < personInteractions.length - 1 ? '1px dashed var(--line-dashed)' : 'none' }}>
              <span className="fhelp" style={{ width: 74, flex: 'none', paddingTop: 3 }}>{dateStr}</span>
              <span className="chip" style={{ ...chipStyle, flex: 'none' }}>{channel}</span>
              <span style={{ fontSize: '13.5px', color: 'var(--ink-body)', lineHeight: 1.5, flex: 1 }}>{i.summary}</span>
              <span onClick={() => { deleteInteraction(i.id); void refetchInteractions() }} style={{ fontSize: 11, color: 'var(--ink-faint)', cursor: 'pointer', paddingLeft: 6 }}>✕</span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
        <span onClick={removePerson} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Delete person…</span>
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>the log is the memory ✿</span>
      </div>

      {confirmDelete && (
        <ConfirmCard
          title={`Delete ${person.name}?`}
          body="Their facts and the interaction log go with them."
          confirmLabel="Delete"
          onConfirm={() => { setConfirmDelete(false); deletePerson(person.id); navigate('/people') }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
