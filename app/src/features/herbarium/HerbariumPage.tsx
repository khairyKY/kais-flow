import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useTimeEntries } from '../projects/api'
import { useTasks } from '../tasks/api'
import { writeRow } from '../../lib/outbox'
import { useEscapeStack } from '../../lib/overlayStack'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import '../projects/xfx.css'
import { Button } from '../../components/kit'
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

function formatMonthYear(dateStr: string) {
  const d = new Date(dateStr)
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`
}

// The four washi/frame combinations 1a cycles across its spread — matches Herbarium.dc.html 1a exactly.
const SPEC_VARIANTS = [
  { cardH: 170, imgH: 165, tapeL: { left: 22, rotate: '-4deg' }, tapeR: { right: 22, rotate: '3deg', tint: 'color-mix(in oklch, var(--acc-gold-warm) 40%, transparent)' } },
  { cardH: 170, imgH: 150, tapeL: { left: 30, rotate: '2.5deg', tint: 'color-mix(in oklch, var(--acc-blossom) 42%, transparent)' }, tapeR: { right: 30, rotate: '-3deg' } },
  { cardH: 150, imgH: 135, tapeL: { left: 26, rotate: '-3deg', tint: 'color-mix(in oklch, var(--acc-hydrangea) 42%, transparent)' }, tapeR: { right: 26, rotate: '4deg' } },
  { cardH: 150, imgH: 140, tapeL: { left: 34, rotate: '3deg' }, tapeR: { right: 34, rotate: '-2deg', tint: 'color-mix(in oklch, var(--acc-lavender) 40%, transparent)' } },
]

export function HerbariumPage() {
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()
  const navigate = useNavigate()
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

  // X2 (Motion 3b): esc obeys immediately on both overlays
  useEscapeStack(!!selectedSpecimen, () => { setSelectedSpecimen(null); setIsEditingLine(false) })
  useEscapeStack(!!pressingProject, () => setPressingProject(null))

  useEffect(() => {
    const pressParam = searchParams.get('press')
    if (pressParam) {
      const p = projects.find((x) => x.id === pressParam)
      if (p) {
        setPressingProject(p); setCeremonyBeat(1); setCeremonyLine('')
        searchParams.delete('press'); setSearchParams(searchParams)
      }
    }
  }, [searchParams, projects])

  useEffect(() => {
    if (!pressingProject || ceremonyBeat === 3) return
    const t = setTimeout(() => setCeremonyBeat((b) => (b === 1 ? 2 : 3)), 2200)
    return () => clearTimeout(t)
  }, [pressingProject, ceremonyBeat])

  const seasonalGroups = useMemo(() => {
    const groups: Record<string, Project[]> = {}
    for (const p of archivedProjects) {
      const key = getSeasonAndYear(p.updated_at)
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups).sort((a, b) => {
      const latest = (group: Project[]) => Math.max(...group.map((p) => new Date(p.updated_at).getTime()))
      return latest(b[1]) - latest(a[1])
    })
  }, [archivedProjects])

  const specimenIndex = useMemo(() => {
    const sorted = [...archivedProjects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    const map = new Map<string, number>()
    sorted.forEach((p, i) => map.set(p.id, i + 1))
    return map
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
    .washi { position:absolute; width:52px; height:15px; background:color-mix(in oklch, var(--acc-sage) 42%, transparent); background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px); border-radius:1px; box-shadow:var(--shadow-crisp); z-index:6; }
    .spec { position:relative; background:var(--paper-parchment); border:1px solid var(--line-card); border-radius:3px; box-shadow:var(--shadow-card); padding:22px 24px 20px; cursor:pointer; transition:transform var(--dur-quick) var(--ease-out), box-shadow var(--dur-quick) var(--ease-out); }
    .spec:hover { transform:translateY(-1px); box-shadow:var(--shadow-panel); }
    .spec:active { transform:scale(0.97); transition-duration:80ms; }
    .spec.kf-stagger-item { animation-fill-mode: backwards; }
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
      <div className="kf-overlay-scrim" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
        <div className="kf-overlay-card" style={{ position: 'relative', width: isMobile ? '92%' : 600, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-popover)', padding: isMobile ? '24px' : '30px 34px 26px' }}>
          <span className="washi" style={{ top: -9, left: 44, transform: 'rotate(-4deg)' }}></span>
          <span className="washi" style={{ top: -9, right: 44, transform: 'rotate(3deg)', background: 'color-mix(in oklch, var(--acc-gold-warm) 40%, transparent)' }}></span>
          <span onClick={() => { setSelectedSpecimen(null); setIsEditingLine(false) }} style={{ position: 'absolute', top: 14, right: 16, fontSize: 16, color: 'var(--ink-faint)', cursor: 'pointer', userSelect: 'none' }}>✕</span>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 18 : 30 }}>
            <div style={{ flex: 'none', width: isMobile ? '100%' : 230, height: isMobile ? 220 : 280, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderRight: isMobile ? 'none' : '1px solid var(--line-card)', paddingRight: isMobile ? 0 : 26 }}>
              <img src={imgSource} alt="" className="pressed" style={{ height: isMobile ? 200 : 265, transform: 'scaleY(0.94) rotate(-1.2deg)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>Specimen {String(specimenIndex.get(p.id) || 1).padStart(2, '0')} · {p.engagement_model || 'Standard'}</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-hand)', fontSize: 30, color: 'var(--ink-body)' }}>{p.name}</div>
              <div className="ledger" style={{ marginTop: 12 }}>Planted {formatFullDate(p.created_at)}<br />Bloomed {formatFullDate(p.updated_at)}<br />{specimenStats.hours} hours · {specimenStats.doneMilestones}/{specimenStats.totalMilestones} milestones</div>
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
              {!isEditingLine && <span onClick={() => { setEditedLineText(p.completion_summary || ''); setIsEditingLine(true) }} style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-faint)', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-end' }}>Edit the line…</span>}
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
      <div className="kf-overlay-scrim" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
        <div className="kf-overlay-card" style={isMobile
          ? { width: '100%', height: '100dvh', background: 'var(--paper-parchment)', padding: 'calc(24px + env(safe-area-inset-top)) 26px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column' }
          : { width: 360, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-popover)', padding: '24px 26px', display: 'flex', flexDirection: 'column', minHeight: 380 }}>
          {ceremonyBeat === 1 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press · 1 of 3</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 0' }}>
              <div style={{ width: 210, height: 10, background: '#8b7a5e', borderRadius: 2, boxShadow: '0 2px 4px rgba(60,52,38,0.3)' }}></div>
              <div style={{ width: 190, height: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'var(--paper-bone)', borderLeft: '1px solid var(--line-card)', borderRight: '1px solid var(--line-card)', overflow: 'hidden' }}>
                <img src={imgSource} alt="" style={{ height: 140, transform: 'scaleY(0.82)', transformOrigin: '50% 100%', filter: 'saturate(0.7)' }} />
              </div>
              <div style={{ width: 210, height: 10, background: '#8b7a5e', borderRadius: 2, boxShadow: '0 2px 4px rgba(60,52,38,0.3)' }}></div>
              <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)' }}>the press closes, gently</div>
            </div>
            <div onClick={() => setCeremonyBeat(3)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', textAlign: 'right', cursor: 'pointer' }}>skip</div>
          </>)}
          {ceremonyBeat === 2 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press · 2 of 3</div>
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
              <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', textAlign: 'center' }}>the ledger stamps itself, line by line</div>
            </div>
            <div onClick={() => setCeremonyBeat(3)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', textAlign: 'right', cursor: 'pointer' }}>skip</div>
          </>)}
          {ceremonyBeat === 3 && (<>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Ready for the press · 3 of 3</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '22px 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: 110 }}>
                <img src={imgSource} alt="" className="pressed" style={{ height: 100, transform: 'scaleY(0.94)' }} />
              </div>
              <div style={{ marginTop: 20, borderBottom: '1.5px dashed var(--line-dashed)', paddingBottom: 8, display: 'flex', alignItems: 'center' }}>
                <input value={ceremonyLine} onChange={(e) => setCeremonyLine(e.target.value)} placeholder="One line for the field guide…" style={{ flex: 1, fontStyle: 'italic', fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-body)', border: 'none', background: 'transparent', outline: 'none' }} />
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
    <div style={{ padding: '46px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="150" height="96" viewBox="0 0 150 96">
        <rect x="20" y="70" width="110" height="9" rx="2" fill="#8b7a5e"></rect>
        <rect x="30" y="34" width="90" height="36" fill="var(--paper-bone)" stroke="var(--line-solid)" strokeWidth={1.5}></rect>
        <rect x="20" y="24" width="110" height="9" rx="2" fill="#8b7a5e" transform="rotate(-9 75 28)"></rect>
        <circle cx="34" cy="75" r="3" fill="var(--ink-faint)"></circle>
        <circle cx="116" cy="75" r="3" fill="var(--ink-faint)"></circle>
        <path d="M34 20v55M116 20v55" stroke="var(--ink-faint)" strokeWidth={2.5}></path>
        <path d="M30 14h8M112 14h8M34 10v8M116 10v8" stroke="var(--ink-faint)" strokeWidth={2.5} strokeLinecap="round"></path>
      </svg>
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 340, lineHeight: '1.45' }}>The press is waiting. Finish a project and it lives here forever.</div>
      <Link to="/projects" style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-body)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '9px 18px', textDecoration: 'none' }}>Back to the living garden →</Link>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{styles}</style>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
      <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        <span>Kai's Flow · Projects · Herbarium</span><span>Africa/Cairo</span>
      </div>
      <div style={{ flex: 1, padding: '32px 0 48px', display: 'flex', justifyContent: 'center', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
        <div style={{ width: 880, maxWidth: '100%', padding: '0 34px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {archivedProjects.length} specimens{hasItems && ` · since ${formatMonthYear(archivedProjects.reduce((min, p) => (new Date(p.created_at) < new Date(min) ? p.created_at : min), archivedProjects[0].created_at))}`}
              </div>
              <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>The Herbarium</h1>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-muted)', transform: 'rotate(-0.6deg)' }}>what bloomed, kept flat and forever ✿</div>
            </div>
            {/* deviation(2026-07-18 audit): export only has the subtle link; Kai couldn't find the way out */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, paddingBottom: 6 }}>
              <Button variant="secondary" onClick={() => navigate('/projects')}>← Back to the garden</Button>
              <Link to="/projects" style={{ fontSize: 12.5, color: 'var(--ink-muted)', textDecoration: 'underline' }}>see the garden as it was →</Link>
            </div>
          </div>
          {isLoading ? <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>Reading the field guide...</div>
          : !hasItems ? renderEmptyState()
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {seasonalGroups.map(([seasonKey, group]) => (
                <div key={seasonKey}>
                  <div className="seas"><span className="t">{seasonKey}</span><span className="r"></span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 22 }}>
                    {group.map((p, gi) => {
                      const imgSrc = getSpecimenPlant(p.id)
                      const pTE = timeEntries.filter((e) => e.project_id === p.id)
                      const hrs = Math.round((pTE.reduce((a, e) => a + e.duration_min, 0) / 60) * 10) / 10
                      const ms = p.milestones || []; const doneM = ms.filter(m => m.completed).length
                      const variant = SPEC_VARIANTS[((specimenIndex.get(p.id) || 1) - 1) % SPEC_VARIANTS.length]
                      return (
                        <div className={motion ? 'spec kf-stagger-item' : 'spec'} style={motion ? staggerDelay(gi) : undefined} key={p.id} onClick={() => setSelectedSpecimen(p)}>
                          <span className="washi" style={{ top: -8, left: variant.tapeL.left, transform: `rotate(${variant.tapeL.rotate})`, ...(variant.tapeL.tint ? { background: variant.tapeL.tint } : {}) }}></span>
                          <span className="washi" style={{ top: -8, right: variant.tapeR.right, transform: `rotate(${variant.tapeR.rotate})`, ...(variant.tapeR.tint ? { background: variant.tapeR.tint } : {}) }}></span>
                          <div style={{ height: variant.cardH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid var(--line-card)', paddingBottom: 14 }}>
                            <img src={imgSrc} alt="" className="pressed" style={{ height: variant.imgH, transform: 'scaleY(0.94) rotate(-1.2deg)' }} />
                          </div>
                          <div style={{ marginTop: 14, fontFamily: 'var(--font-hand)', fontSize: 22, color: 'var(--ink-body)' }}>{p.name}</div>
                          <div className="ledger" style={{ marginTop: 8 }}>Planted {formatDayMonth(p.created_at)} · Bloomed {formatDayMonth(p.updated_at)}<br />{hrs} hours · {doneM}/{ms.length} milestones</div>
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
