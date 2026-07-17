import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useTimeEntries } from '../projects/api'
import { useTasks } from '../tasks/api'
import { writeRow } from '../../lib/outbox'
import type { Project } from '../../lib/types'

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

function getSpecimenPlant(projectId: string) {
  const plants = ['/ds/assets/wisteria/p100.png', '/ds/assets/cherry/bloom.png', '/ds/assets/hydrangea/heavy.png', '/ds/assets/fern/full.png']
  let hash = 0
  for (let i = 0; i < projectId.length; i++) hash = projectId.charCodeAt(i) + ((hash << 5) - hash)
  return plants[Math.abs(hash) % plants.length]
}

function getSeasonAndYear(dateStr: string) {
  const d = new Date(dateStr)
  const month = d.getMonth()
  let season = 'Winter'
  if (month >= 2 && month <= 4) season = 'Spring'
  else if (month >= 5 && month <= 7) season = 'Summer'
  else if (month >= 8 && month <= 10) season = 'Autumn'
  return `${season} ${d.getFullYear()}`
}

function formatDayMonth(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`
}

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`
}

export function HerbariumPage() {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: projects = [], isLoading } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: timeEntries = [] } = useTimeEntries()
  const archivedProjects = useMemo(() => projects.filter((p) => p.status === 'archived'), [projects])
  const hasItems = archivedProjects.length > 0
  const [selectedSpecimen, setSelectedSpecimen] = useState<Project | null>(null)
  const [isEditingLine, setIsEditingLine] = useState(false)
  const [editedLineText, setEditedLineText] = useState('')
  const [pressingProject, setPressingProject] = useState<Project | null>(null)
  const [ceremonyBeat, setCeremonyBeat] = useState<1 | 2 | 3>(1)
  const [ceremonyLine, setCeremonyLine] = useState('')

  useEffect(() => {
    const pressParam = searchParams.get('press')
    if (pressParam) {
      const p = projects.find((x) => x.id === pressParam)
      if (p) {
        setPressingProject(p); setCeremonyBeat(1); setCeremonyLine('')
        searchParams.delete('press'); setSearchParams(searchParams)
      }
    } else {
      const unpressed = archivedProjects.find((p) => !p.completion_summary)
      if (unpressed && !pressingProject) { setPressingProject(unpressed); setCeremonyBeat(1); setCeremonyLine('') }
    }
  }, [searchParams, projects, archivedProjects])

  const seasonalGroups = useMemo(() => {
    const groups: Record<string, Project[]> = {}
    for (const p of archivedProjects) {
      const key = getSeasonAndYear(p.updated_at)
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups).sort((a, b) => {
      const [, yA] = a[0].split(' '); const [, yB] = b[0].split(' ')
      return parseInt(yB) - parseInt(yA)
    })
  }, [archivedProjects])

  const specimenStats = useMemo(() => {
    if (!selectedSpecimen) return { hours: 0, doneMilestones: 0, totalMilestones: 0, tasksCount: 0, longestFocusDay: '0h' }
    const p = selectedSpecimen
    const pTimeEntries = timeEntries.filter((e) => e.project_id === p.id)
    const totalMin = pTimeEntries.reduce((acc, e) => acc + e.duration_min, 0)
    const hours = Math.round((totalMin / 60) * 10) / 10
    const milestones = p.milestones || []
    const totalMilestones = milestones.length
    const doneMilestones = milestones.filter(m => m.completed).length
    const tasksCount = tasks.filter((t) => t.project_id === p.id && t.status === 'done').length
    const dayDurations: Record<string, number> = {}
    for (const entry of pTimeEntries) { const day = new Date(entry.started_at).toDateString(); dayDurations[day] = (dayDurations[day] || 0) + entry.duration_min }
    let maxMin = 0
    for (const min of Object.values(dayDurations)) { if (min > maxMin) maxMin = min }
    const longestFocusDay = maxMin > 0 ? `${Math.floor(maxMin / 60)}h ${maxMin % 60}m` : '0h'
    return { hours, doneMilestones, totalMilestones, tasksCount, longestFocusDay }
  }, [selectedSpecimen, timeEntries, tasks])

  const handleSaveLine = () => {
    if (!selectedSpecimen) return
    const updated = { ...selectedSpecimen, completion_summary: editedLineText }
    writeRow('projects', updated)
    setSelectedSpecimen(updated); setIsEditingLine(false)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const handlePressIt = () => {
    if (!pressingProject) return
    const updated = { ...pressingProject, status: 'archived', completion_summary: ceremonyLine.trim() || 'Pressed into the field guide.' }
    writeRow('projects', updated)
    setPressingProject(null)
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const styles = `
    .pressed { filter: saturate(0.35) sepia(0.28) contrast(0.88) brightness(1.04); }
    .washi { position:absolute; width:52px; height:15px; background:rgba(138,154,126,0.42); background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px); border-radius:1px; box-shadow:var(--shadow-crisp); z-index:6; }
    .spec { position:relative; background:var(--paper-parchment); border:1px solid var(--line-card); border-radius:3px; box-shadow:var(--shadow-card); padding:22px 24px 20px; cursor:pointer; transition:transform 0.2s, box-shadow 0.2s; }
    .spec:hover { transform:translateY(-2px); box-shadow:var(--shadow-panel); }
    .ledger { font-family:var(--font-mono); font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-faint); line-height:2; }
    .seas { display:flex; align-items:center; gap:14px; margin:30px 0 18px; }
    .seas span.t { font-family:var(--font-mono); font-size:10.5px; letter-spacing:0.22em; text-transform:uppercase; color:var(--ink-faint); white-space:nowrap; }
    .seas .r { flex:1; height:1px; background:var(--line-solid); }
  `

  const renderSpecimenModal = () => {
    if (!selectedSpecimen) return null
    const p = selectedSpecimen
    const imgSource = getSpecimenPlant(p.id)
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
        <div style={{ position: 'relative', width: isMobile ? '92%' : 600, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: '0 24px 60px rgba(42,36,32,0.35)', padding: isMobile ? '24px' : '30px 34px 26px' }}>
          <span className="washi" style={{ top: -9, left: 44, transform: 'rotate(-4deg)' }}></span>
          <span className="washi" style={{ top: -9, right: 44, transform: 'rotate(3deg)', background: 'rgba(201,165,90,0.4)' }}></span>
          <span onClick={() => { setSelectedSpecimen(null); setIsEditingLine(false) }} style={{ position: 'absolute', top: 14, right: 16, fontSize: 16, color: 'var(--ink-faint)', cursor: 'pointer', userSelect: 'none' }}>\u2715</span>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 18 : 30 }}>
            <div style={{ flex: 'none', width: isMobile ? '100%' : 230, height: isMobile ? 220 : 280, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderRight: isMobile ? 'none' : '1px solid var(--line-card)', paddingRight: isMobile ? 0 : 26 }}>
              <img src={imgSource} alt="" className="pressed" style={{ height: isMobile ? 200 : 265, transform: 'scaleY(0.94) rotate(-1.2deg)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>Specimen \u00b7 {p.engagement_model || 'Standard'}</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-hand)', fontSize: 30, color: 'var(--ink-body)' }}>{p.name}</div>
              <div className="ledger" style={{ marginTop: 12 }}>Planted {formatFullDate(p.created_at)}<br />Bloomed {formatFullDate(p.updated_at)}<br />{specimenStats.hours} hours \u00b7 {specimenStats.doneMilestones}/{specimenStats.totalMilestones} milestones</div>
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 5 }}>
                {isEditingLine ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea value={editedLineText} onChange={(e) => setEditedLineText(e.target.value)} style={{ width: '100%', minHeight: 60, font: 'inherit', fontSize: 13, background: 'var(--paper-linen)', border: '1px solid var(--line-card)', borderRadius: 4, padding: 8, resize: 'none', color: 'var(--ink-body)' }} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <span onClick={() => setIsEditingLine(false)} style={{ fontSize: 11.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</span>
                      <span onClick={handleSaveLine} style={{ fontSize: 11.5, color: 'var(--acc-terra)', fontWeight: 600, cursor: 'pointer' }}>Save</span>
                    </div>
                  </div>
                ) : <div style={{ fontSize: 13.5, fontStyle: 'italic', color: 'var(--ink-muted)', lineHeight: '1.6' }}>"{p.completion_summary || 'No summary line written.'}"</div>}
              </div>
              {!isEditingLine && <span onClick={() => { setEditedLineText(p.completion_summary || ''); setIsEditingLine(true) }} style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-faint)', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-end' }}>Edit the line\u2026</span>}
              <div style={{ flex: 1 }}></div>
              <div style={{ borderTop: '1px dashed var(--line-dashed)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 8 }}>A life in numbers</div>
                <div style={{ display: 'flex', gap: 26 }}>
                  <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-body)' }}>{specimenStats.tasksCount}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>tasks bloomed</div></div>
                  <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-body)' }}>{specimenStats.longestFocusDay}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>longest focus day</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderPressingCeremony = () => {
    if (!pressingProject) return null
    const p = pressingProject
    const imgSource = getSpecimenPlant(p.id)
    const pTimeEntries = timeEntries.filter((e) => e.project_id === p.id)
    const totalMin = pTimeEntries.reduce((acc, e) => acc + e.duration_min, 0)
    const hours = Math.round(totalMin / 60)
    const milestones = p.milestones || []
    const doneMilestones = milestones.filter(m => m.completed).length
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
        <div style={{ width: isMobile ? '92%' : 380, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: '0 20px 50px rgba(42,36,32,0.32)', padding: '24px 26px', display: 'flex', flexDirection: 'column', minHeight: 380 }}>
          {ceremonyBeat === 1 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press \u00b7 1 of 3</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 0' }}>
              <div style={{ width: 210, height: 10, background: '#8b7a5e', borderRadius: 2, boxShadow: '0 2px 4px rgba(60,52,38,0.3)' }}></div>
              <div style={{ width: 190, height: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'var(--paper-bone)', borderLeft: '1px solid var(--line-card)', borderRight: '1px solid var(--line-card)', overflow: 'hidden' }}>
                <img src={imgSource} alt="" style={{ height: 140, transform: 'scaleY(0.82)', transformOrigin: '50% 100%', filter: 'saturate(0.7)' }} />
              </div>
              <div style={{ width: 210, height: 10, background: '#8b7a5e', borderRadius: 2, boxShadow: '0 2px 4px rgba(60,52,38,0.3)' }}></div>
              <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f' }}>the press closes, gently</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setCeremonyBeat(2)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>next \u2192</span>
              <span onClick={() => setCeremonyBeat(3)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', cursor: 'pointer' }}>skip</span>
            </div>
          </>)}
          {ceremonyBeat === 2 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press \u00b7 2 of 3</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '22px 6px' }}>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 24, color: 'var(--ink-body)', textAlign: 'center' }}>{p.name}</div>
              <div style={{ marginTop: 18, borderTop: '1px dashed var(--line-dashed)' }}>
                {[['Planted', formatDayMonth(p.created_at).toUpperCase()], ['Bloomed', formatDayMonth(new Date().toISOString()).toUpperCase()], ['Hours', String(hours)], ['Milestones', `${doneMilestones}/${milestones.length}`]].map(([label, value], i) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 2px', borderBottom: i < 3 ? '1px dashed var(--line-dashed)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.15em', color: 'var(--ink-body)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', textAlign: 'center' }}>the ledger stamps itself, line by line</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setCeremonyBeat(3)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>next \u2192</span>
              <span onClick={() => setCeremonyBeat(3)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', cursor: 'pointer' }}>skip</span>
            </div>
          </>)}
          {ceremonyBeat === 3 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press \u00b7 3 of 3</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '22px 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: 110 }}>
                <img src={imgSource} alt="" className="pressed" style={{ height: 100, transform: 'scaleY(0.94)' }} />
              </div>
              <div style={{ marginTop: 20, borderBottom: '1.5px dashed var(--line-dashed)', paddingBottom: 8, display: 'flex', alignItems: 'center' }}>
                <input value={ceremonyLine} onChange={(e) => setCeremonyLine(e.target.value)} placeholder="One line for the field guide\u2026" style={{ flex: 1, fontStyle: 'italic', fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-body)', border: 'none', background: 'transparent', outline: 'none' }} />
                <span style={{ display: 'inline-block', width: 1.5, height: 18, background: 'var(--acc-terra)', marginLeft: 3 }}></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 20 }}>
                <span onClick={handlePressIt} style={{ fontSize: 12.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>Skip</span>
                <button onClick={handlePressIt} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '9px 20px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Press it</button>
              </div>
            </div>
          </>)}
        </div>
      </div>
    )
  }

  const renderEmptyState = () => (
    <div style={{ background: 'var(--paper-linen)', padding: '46px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 560, border: '1px solid #cfc7b0', borderRadius: 5, boxShadow: 'var(--shadow-card)', margin: '40px auto' }}>
      <svg width="150" height="96" viewBox="0 0 150 96"><rect x="20" y="70" width="110" height="9" rx="2" fill="#8b7a5e"></rect><rect x="30" y="34" width="90" height="36" fill="#EFE8D6" stroke="#cfc7b0" strokeWidth="1.5"></rect></svg>
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', textAlign: 'center', maxWidth: 340, lineHeight: '1.45' }}>The press is waiting. Finish a project and it lives here forever.</div>
      <Link to="/projects" style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-body)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '9px 18px', textDecoration: 'none' }}>Back to the living garden \u2192</Link>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{styles}</style>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
      <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        <span>Kai's Flow \u00b7 Projects \u00b7 Herbarium</span><span>Africa/Cairo</span>
      </div>
      <div style={{ flex: 1, padding: '32px 0 48px', display: 'flex', justifyContent: 'center', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
        <div style={{ width: 880, maxWidth: '100%', padding: '0 34px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{archivedProjects.length} specimens</div>
              <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>The Herbarium</h1>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', transform: 'rotate(-0.6deg)' }}>what bloomed, kept flat and forever \u273f</div>
            </div>
            <Link to="/projects" style={{ fontSize: 12.5, color: 'var(--ink-muted)', textDecoration: 'underline', paddingBottom: 6 }}>see the garden as it was \u2192</Link>
          </div>
          {isLoading ? <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>Reading the field guide...</div>
          : !hasItems ? renderEmptyState()
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {seasonalGroups.map(([seasonKey, group]) => (
                <div key={seasonKey}>
                  <div className="seas"><span className="t">{seasonKey}</span><span className="r"></span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 22 }}>
                    {group.map((p) => {
                      const imgSrc = getSpecimenPlant(p.id)
                      const pTE = timeEntries.filter((e) => e.project_id === p.id)
                      const hrs = Math.round((pTE.reduce((a, e) => a + e.duration_min, 0) / 60) * 10) / 10
                      const ms = p.milestones || []; const doneM = ms.filter(m => m.completed).length
                      return (
                        <div className="spec" key={p.id} onClick={() => setSelectedSpecimen(p)}>
                          <span className="washi" style={{ top: -8, left: 22, transform: 'rotate(-4deg)' }}></span>
                          <span className="washi" style={{ top: -8, right: 22, transform: 'rotate(3deg)', background: 'rgba(201,165,90,0.4)' }}></span>
                          <div style={{ height: 170, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid var(--line-card)', paddingBottom: 14 }}>
                            <img src={imgSrc} alt="" className="pressed" style={{ height: 150, transform: 'scaleY(0.94) rotate(-1.2deg)' }} />
                          </div>
                          <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 22, color: 'var(--ink-body)' }}>{p.name}</div>
                          <div className="ledger" style={{ marginTop: 8 }}>Planted {formatDayMonth(p.created_at)} \u00b7 Bloomed {formatDayMonth(p.updated_at)}<br />{hrs} hours \u00b7 {doneM}/{ms.length} milestones</div>
                          <div style={{ marginTop: 10, fontSize: 13, fontStyle: 'italic', color: 'var(--ink-muted)', lineHeight: 1.55 }}>"{p.completion_summary || 'Pressed specimen.'}"</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedSpecimen && renderSpecimenModal()}
      {pressingProject && renderPressingCeremony()}
    </div>
  )
}
