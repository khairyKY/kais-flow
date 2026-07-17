import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePeople, useInteractions, upsertPerson, createInteraction, getDaysUntilBirthday } from './api'
import { useDomains } from '../domains/api'
import type { Person, Interaction, Domain } from '../../lib/types'
import { Button } from '../../components/kit'

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

function getAvatarBgColor(name: string): string {
  const colors = [
    'rgba(154,180,190,0.3)',
    'rgba(212,168,176,0.32)',
    'rgba(201,160,160,0.3)',
    'rgba(212,199,138,0.35)',
    'rgba(122,148,110,0.28)'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function timeAgo(dateStr: string): string {
  const d = daysSince(dateStr)
  if (d === 0) return 'today'
  if (d === 1) return '1d ago'
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w === 1) return '1w ago'
  if (w < 4) return `${w}w ago`
  const mo = Math.floor(d / 30)
  return mo <= 1 ? '1mo ago' : `${mo}mo ago`
}

function timeAgoShort(dateStr: string): string {
  const d = daysSince(dateStr)
  if (d === 0) return 'today'
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  return `${w}w`
}

function weeksQuiet(dateStr: string): string {
  const d = daysSince(dateStr)
  const w = Math.floor(d / 7)
  if (w === 0) return `${d} days quiet`
  if (w === 1) return '1 week quiet'
  return `${w} weeks quiet`
}

/* Bloom badge SVG — shows when a birthday is within 14 days */
const BloomBadge = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" style={{ position: 'absolute', top: -6, right: -6 }}>
    <g fill="#8A9A7E">
      <ellipse cx="12" cy="7.4" rx="2.6" ry="3.6" />
      <ellipse cx="7.6" cy="13.6" rx="2.6" ry="3.6" transform="rotate(-70 7.6 13.6)" />
      <ellipse cx="16.4" cy="13.6" rx="2.6" ry="3.6" transform="rotate(70 16.4 13.6)" />
    </g>
    <circle cx="12" cy="12" r="3.4" fill="#D4A8B0" />
    <circle cx="12" cy="12" r="1.5" fill="#C9A55A" />
  </svg>
)

export function PeoplePage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { data: people = [] } = usePeople()
  const { data: interactions = [] } = useInteractions()
  const { data: domains = [] } = useDomains()
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')

  // Compute latest interaction per person
  const latestInteraction = useMemo(() => {
    const map = new Map<string, Interaction>()
    for (const i of interactions) {
      const existing = map.get(i.person_id)
      if (!existing || i.occurred_at > existing.occurred_at) {
        map.set(i.person_id, i)
      }
    }
    return map
  }, [interactions])

  // Group by domain
  const grouped = useMemo(() => {
    const groups = new Map<string | null, { domain: Domain | null; people: Person[] }>()
    for (const p of people) {
      const key = p.domain_id
      if (!groups.has(key)) {
        const domain = domains.find((d) => d.id === key) || null
        groups.set(key, { domain, people: [] })
      }
      groups.get(key)!.people.push(p)
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (!a.domain && b.domain) return 1
      if (a.domain && !b.domain) return -1
      return (a.domain?.name || '').localeCompare(b.domain?.name || '')
    })
  }, [people, domains])

  // Nudge candidates: people with no interaction for > 21 days
  const nudges = useMemo(() => {
    return people.filter((p) => {
      const latest = latestInteraction.get(p.id)
      if (!latest) return true
      return daysSince(latest.occurred_at) > 21
    }).slice(0, 4) // max 4 nudge cards
  }, [people, latestInteraction])

  const totalFacts = useMemo(() => people.reduce((s, p) => s + (p.facts?.length || 0), 0), [people])

  const handleNewPerson = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const p = upsertPerson({ name: newName.trim(), domain_id: newDomain || null, facts: [] }, true)
    setNewName('')
    setNewDomain('')
    setShowNewForm(false)
    navigate(`/people/${p.id}`)
  }

  const handleQuickAction = (personId: string, action: string) => {
    const summary = action === 'call' ? 'Phone call catch up' : action === 'text' ? 'Text message catch up' : 'Met in person'
    createInteraction({ person_id: personId, summary, occurred_at: new Date().toISOString() })
  }

  /* ───────── MOBILE LAYOUT (1c) ───────── */
  if (isMobile) {
    return (
      <div style={{ padding: '8px 18px 0' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src="/ds/assets/clover/four_leaf.png" alt="" style={{ height: 36, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>People</div>
          </div>
          <span
            onClick={() => setShowNewForm(true)}
            style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--acc-terra)', boxShadow: 'var(--shadow-cta)', color: '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer' }}
          >+</span>
        </div>

        {/* Nudges (mobile) */}
        {nudges.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '16px 0 8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-clover-text)' }}>Say hi</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
            </div>
            {nudges.slice(0, 1).map((p) => {
              const latest = latestInteraction.get(p.id)
              const quietText = latest ? weeksQuiet(latest.occurred_at) : 'never reached out'
              const bdayFact = p.facts?.find((f) => f.label === 'Birthday')
              const bdayDays = bdayFact ? getDaysUntilBirthday(bdayFact.date || bdayFact.value) : null
              const bdayLabel = bdayDays !== null && bdayDays <= 14 ? ` · bday ${bdayDays}d` : ''
              return (
                <div key={p.id} style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 8, boxShadow: 'var(--shadow-crisp)', padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 11, transform: 'rotate(-0.3deg)' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: getAvatarBgColor(p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', flex: 'none' }}>{p.name.charAt(0)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13.5px', color: 'var(--ink-body)' }}>{p.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 2 }}>{quietText}{bdayLabel}</div>
                  </div>
                  <span onClick={() => handleQuickAction(p.id, 'call')} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, cursor: 'pointer' }}>call</span>
                </div>
              )
            })}
          </>
        )}

        {/* People rows by domain (mobile) */}
        {grouped.map(({ domain, people: groupPeople }) => (
          <div key={domain?.id || 'uncategorized'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 4px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{domain?.name || 'Uncategorized'}</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
            </div>
            {groupPeople.map((p, idx) => {
              const latest = latestInteraction.get(p.id)
              const lastTouchText = latest ? timeAgoShort(latest.occurred_at) : '—'
              const summaryShort = latest ? latest.summary.split('—')[0].split('·')[0].trim().slice(0, 30) : ''
              return (
                <Link key={p.id} to={`/people/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: idx < groupPeople.length - 1 ? '1px dashed var(--line-dashed)' : 'none', textDecoration: 'none' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: getAvatarBgColor(p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--ink-body)', flex: 'none' }}>{p.name.charAt(0)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{p.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', marginTop: 1 }}>{summaryShort}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{lastTouchText}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  /* ───────── DESKTOP LAYOUT (1a + 2a) ───────── */
  return (
    <div style={{ maxWidth: 900 }}>
      <style>{`
        .grain { position: absolute; inset: 0; pointer-events: none; z-index: 10; background-image: var(--noise-url); mix-blend-mode: multiply; opacity: 0.5; }
        .chip { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; }
        .flabel { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
        .fhelp { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 0.06em; color: var(--ink-hairline); }
        .slabel { display: flex; align-items: center; gap: 12px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-faint); }
        .slabel .r { flex: 1; height: 1px; border-bottom: 1px dashed var(--line-dashed); }
        .av { width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--ink-body); flex: none; }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/ds/assets/clover/four_leaf.png" alt="" style={{ height: 50, filter: 'var(--shadow-drop-sm)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>People · kept close</div>
            <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>The clover patch</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="fhelp">{people.length} people · {totalFacts} facts kept</span>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 17px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
          >+ New person</button>
        </div>
      </div>

      {/* New person form (inline) */}
      {showNewForm && (
        <form onSubmit={handleNewPerson} style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0', padding: '12px 16px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3 }}>
          <input type="text" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} required style={{ flex: 1, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', fontSize: 13 }} />
          <select value={newDomain} onChange={(e) => setNewDomain(e.target.value)} style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', fontSize: 13 }}>
            <option value="">No circle</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <Button type="submit" variant="cta" style={{ padding: '8px 16px', fontSize: 12 }}>Add</Button>
        </form>
      )}

      {/* Nudges section */}
      {nudges.length > 0 && (
        <>
          <div className="slabel" style={{ margin: '26px 0 10px' }}>
            <span style={{ color: 'var(--acc-clover-text)' }}>Say hi — it's been a while</span>
            <span className="r" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {nudges.map((p, idx) => {
              const latest = latestInteraction.get(p.id)
              const quietText = latest ? weeksQuiet(latest.occurred_at) : 'never reached out'
              const bdayFact = p.facts?.find((f) => f.label === 'Birthday')
              const bdayDays = bdayFact ? getDaysUntilBirthday(bdayFact.date || bdayFact.value) : null
              const bdayLabel = bdayDays !== null && bdayDays <= 14 ? ` · birthday in ${bdayDays} days ↻` : ''
              // First interesting fact as nudge body
              const interestFact = p.facts?.find((f) => f.label === 'Note' || f.label === 'Interest')
              const nudgeBody = interestFact ? interestFact.value.split('—')[0].trim() : ''
              const nudgeHint = nudgeBody ? ` · ${nudgeBody}` : ''
              return (
                <div key={p.id} style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, transform: `rotate(${idx % 2 === 0 ? '-0.3' : '0.3'}deg)` }}>
                  <span className="av" style={{ background: getAvatarBgColor(p.name) }}>{p.name.charAt(0)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink-body)' }}>{p.name}</div>
                    <div className="fhelp" style={{ marginTop: 2 }}>{quietText}{bdayLabel}{nudgeHint}</div>
                  </div>
                  <span onClick={() => handleQuickAction(p.id, 'call')} className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer' }}>call</span>
                  <span className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer' }}>later</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* People rows by domain */}
      {grouped.map(({ domain, people: groupPeople }) => (
        <div key={domain?.id || 'uncategorized'}>
          <div className="slabel" style={{ margin: '26px 0 4px' }}>
            <span>{domain?.name || 'Uncategorized'}</span>
            <span className="r" />
            <span style={{ color: 'var(--ink-hairline)' }}>{groupPeople.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {groupPeople.map((p, idx) => {
              const latest = latestInteraction.get(p.id)
              const lastTouchText = latest ? timeAgo(latest.occurred_at) : '—'
              const summaryText = latest ? latest.summary : ''
              const factCount = p.facts?.length || 0
              const bdayFact = p.facts?.find((f) => f.label === 'Birthday')
              const bdayDays = bdayFact ? getDaysUntilBirthday(bdayFact.date || bdayFact.value) : null
              const showBloom = bdayDays !== null && bdayDays <= 14
              const isLast = idx === groupPeople.length - 1
              return (
                <Link key={p.id} to={`/people/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 2px', borderBottom: isLast ? 'none' : '1px dashed var(--line-dashed)', textDecoration: 'none' }}>
                  <span className="av" style={{ background: getAvatarBgColor(p.name), position: 'relative' }}>
                    {p.name.charAt(0)}
                    {showBloom && <BloomBadge />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14.5px', color: 'var(--ink-body)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{summaryText}</div>
                  </div>
                  {showBloom && (
                    <span className="chip" style={{ background: 'rgba(212,168,176,0.24)', color: '#a1707c' }}>
                      Birthday · in {bdayDays} days
                    </span>
                  )}
                  <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' }}>{factCount} facts</span>
                  <span className="fhelp" style={{ width: 52, textAlign: 'right' }}>{lastTouchText}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 26, fontFamily: 'var(--font-hand)', fontSize: 16, color: '#7a745f', transform: 'rotate(-0.8deg)' }}>a light CRM — facts so you remember, nudges so you reach out ✿</div>
    </div>
  )
}
