import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDomains } from '../domains/api'
import { useProjects, createProject, useTimeEntries } from './api'
import { useAreas, createArea } from '../areas/api'
import { useTasks } from '../tasks/api'
import { SectionLabel } from '../../components/kit'

function localUseIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return isMobile
}

export function getWisteriaImage(pct: number): string {
  if (pct === 0) return '/ds/assets/wisteria/p0.png'
  if (pct <= 20) return '/ds/assets/wisteria/p20.png'
  if (pct <= 40) return '/ds/assets/wisteria/p40.png'
  if (pct <= 60) return '/ds/assets/wisteria/p60.png'
  if (pct <= 80) return '/ds/assets/wisteria/p80.png'
  return '/ds/assets/wisteria/p100.png'
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const isMobile = localUseIsMobile()

  // State
  const [view, setView] = useState<'list' | 'board'>('list')
  const [showNewModal, setShowNewModal] = useState(false)
  const [newType, setNewType] = useState<'standard' | 'area' | 'retainer'>('standard')

  // Queries
  const { data: domains = [] } = useDomains()
  const { data: allProjects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  const { data: timeEntries = [] } = useTimeEntries()

  // Filter out archived projects
  const projects = useMemo(() => allProjects.filter((p) => p.status === 'active'), [allProjects])

  // Computed data
  const projectStats = useMemo(() => {
    const stats: Record<string, { hours: number; doneMilestones: number; totalMilestones: number; pct: number }> = {}

    for (const p of projects) {
      // Sum hours from time_entries
      const entries = timeEntries.filter((e) => e.project_id === p.id)
      const minutes = entries.reduce((acc, curr) => acc + curr.duration_min, 0)
      const hours = Math.round((minutes / 60) * 10) / 10

      // Calculate milestone completion
      const milestones = p.milestones ?? []
      const totalMilestones = milestones.length
      let doneMilestones = 0
      let totalWeight = 0
      let completedWeight = 0

      for (const m of milestones) {
        totalWeight += m.weight
        // A milestone is completed if flagged or if all tasks linked to it are completed
        const linkedTasks = tasks.filter((t) => t.milestone_id === m.id)
        const isComplete =
          linkedTasks.length > 0 ? linkedTasks.every((t) => t.status === 'done') : m.completed

        if (isComplete) {
          doneMilestones++
          completedWeight += m.weight
        }
      }

      const pct = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

      stats[p.id] = {
        hours,
        doneMilestones,
        totalMilestones,
        pct,
      }
    }
    return stats
  }, [projects, timeEntries, tasks])

  const areaOpenTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of areas) {
      counts[a.id] = tasks.filter((t) => t.area_id === a.id && t.status === 'todo').length
    }
    return counts
  }, [areas, tasks])

  // Render Mobile (iPhone variant 1c)
  if (isMobile) {
    return (
      <div style={{ maxWidth: 398, margin: '0 auto', background: 'var(--paper-linen)', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
        <div style={{ flex: 1, padding: '16px 18px 24px', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <img src="/ds/assets/wisteria/p60.png" alt="" style={{ height: 36, filter: 'var(--shadow-drop-sm)' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>Projects</div>
            </div>
            <button
              onClick={() => {
                setNewType('standard')
                setShowNewModal(true)
              }}
              style={{ width: 30, height: 30, borderRadius: '999px', background: 'var(--acc-terra)', border: 'none', boxShadow: 'var(--shadow-cta)', color: '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer' }}
            >
              +
            </button>
          </div>

          {/* Active section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '16px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>Active</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {projects
            .filter((p) => p.type === 'standard')
            .map((p) => {
              const stat = projectStats[p.id] || { hours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0 }
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: domain?.color ?? 'var(--acc-moss)', flex: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink-body)' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 1 }}>
                      {stat.hours}h · {stat.doneMilestones}/{stat.totalMilestones} milestones
                    </div>
                  </div>
                  <span className="chip" style={{ background: 'rgba(122,148,110,0.18)', color: 'var(--acc-sage-text)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                    {p.target_date ? new Date(p.target_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'no date'}
                  </span>
                </div>
              )
            })}

          {/* Retainers Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Retainers</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {projects
            .filter((p) => p.type === 'retainer')
            .map((p) => {
              const stat = projectStats[p.id] || { hours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0 }
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', cursor: 'pointer' }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: domain?.color ?? 'var(--acc-lavender-deep)', flex: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink-body)' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 1 }}>
                      {stat.hours}h / 10h this month
                    </div>
                  </div>
                  <span className="chip" style={{ background: 'rgba(168,160,190,0.22)', color: 'var(--acc-lavender-text)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                    retainer
                  </span>
                </div>
              )
            })}

          {/* Areas Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Areas</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {areas.map((a) => {
            const count = areaOpenTaskCounts[a.id] || 0
            const domain = domains.find((d) => d.id === a.domain_id)
            return (
              <div
                key={a.id}
                onClick={() => navigate(`/projects/${a.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
              >
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: a.color ?? domain?.color ?? 'var(--acc-buttercream)', flex: 'none' }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--ink-body)' }}>{a.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>
                  {count} open
                </span>
              </div>
            )
          })}
        </div>
        {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} defaultType={newType} domains={domains} />}
      </div>
    )
  }

  // Render Desktop
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '85vh' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />

      <main style={{ position: 'relative', zIndex: 10, padding: '10px 8px 40px' }}>
        {/* Toggle header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/ds/assets/wisteria/p60.png" alt="" style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Projects &amp; areas · the forest
              </div>
              <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                {view === 'list' ? "What's growing" : "The forest, by domain"}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {view === 'board' && (
              <span className="seg" style={{ display: 'inline-flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 3, gap: 3 }}>
                <span onClick={() => setView('list')} style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>List</span>
                <span className="on" style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', boxShadow: 'var(--shadow-crisp)', color: 'var(--ink-body)', fontWeight: 600, cursor: 'default', fontFamily: 'inherit' }}>Board</span>
                <span style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: 'var(--ink-hairline)', cursor: 'default', opacity: 0.5, fontFamily: 'inherit' }}>Timeline</span>
              </span>
            )}
            {view === 'list' && (
              <span className="seg" style={{ display: 'inline-flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 3, gap: 3 }}>
                <span className="on" style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', boxShadow: 'var(--shadow-crisp)', color: 'var(--ink-body)', fontWeight: 600, cursor: 'default', fontFamily: 'inherit' }}>List</span>
                <span onClick={() => setView('board')} style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Board</span>
                <span style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: 'var(--ink-hairline)', cursor: 'default', opacity: 0.5, fontFamily: 'inherit' }}>Timeline</span>
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '8px 13px', cursor: 'pointer' }}>
              ⚟ Domain ▾
            </span>
            <button
              onClick={() => {
                setNewType('area')
                setShowNewModal(true)
              }}
              style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 15px', borderRadius: '999px', cursor: 'pointer' }}
            >
              + New area
            </button>
            <button
              onClick={() => {
                setNewType('standard')
                setShowNewModal(true)
              }}
              style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: '12.5px', padding: '9px 15px', borderRadius: '999px', boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
            >
              + New project
            </button>
          </div>
        </div>

        {/* LIST VIEW */}
        {view === 'list' && (
          <div style={{ maxWidth: 900 }}>
            {/* Active Projects */}
            <SectionLabel style={{ margin: '26px 0 4px' }}>
              <span style={{ color: 'var(--acc-sage-text)' }}>Active</span>
            </SectionLabel>
            {projects
              .filter((p) => p.type === 'standard')
              .map((p) => {
                const stat = projectStats[p.id] || { hours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0 }
                const domain = domains.find((d) => d.id === p.domain_id)
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 2px', borderBottom: '1px dashed var(--line-dashed)', textDecoration: 'none', cursor: 'pointer' }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: domain?.color ?? 'var(--acc-terra)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{p.engagement_model ?? 'Project'}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      {stat.hours}h logged
                    </span>
                    <span className="chip" style={{ background: 'rgba(122,148,110,0.18)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                      {stat.doneMilestones} / {stat.totalMilestones} milestones
                    </span>
                    <span style={{ width: 96, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      {p.target_date ? `target ${new Date(p.target_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}` : 'no date'}
                    </span>
                  </div>
                )
              })}

            {/* Retainers */}
            <SectionLabel style={{ margin: '24px 0 4px' }}>
              <span>Retainers</span>
            </SectionLabel>
            {projects
              .filter((p) => p.type === 'retainer')
              .map((p) => {
                const stat = projectStats[p.id] || { hours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0 }
                const domain = domains.find((d) => d.id === p.domain_id)
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 2px', textDecoration: 'none', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: domain?.color ?? 'var(--acc-lavender-deep)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{p.engagement_model ?? 'Retainer'}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      {stat.hours}h / 10h this month
                    </span>
                    <span className="chip" style={{ background: 'rgba(168,160,190,0.22)', color: 'var(--acc-lavender-text)', fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                      retainer
                    </span>
                    <span style={{ width: 96, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      renews 1 Aug
                    </span>
                  </div>
                )
              })}

            {/* Areas */}
            <SectionLabel style={{ margin: '24px 0 4px' }}>
              <span>Areas</span>
            </SectionLabel>
            {areas.map((a) => {
              const count = areaOpenTaskCounts[a.id] || 0
              const domain = domains.find((d) => d.id === a.domain_id)
              return (
                <div
                  key={a.id}
                  onClick={() => navigate(`/projects/${a.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer' }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.color ?? domain?.color ?? 'var(--acc-buttercream)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 15, color: 'var(--ink-body)', fontWeight: 600 }}>{a.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-muted)', marginLeft: 8 }}>{domain?.name ?? 'No Domain'}</span>
                  </div>
                  <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '4px 9px', borderRadius: 3 }}>
                    area
                  </span>
                  <span style={{ width: 96, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                    {count} open
                  </span>
                </div>
              )
            })}

            <div style={{ marginTop: 26, fontFamily: 'var(--font-hand)', fontSize: 16, color: '#7a745f', transform: 'rotate(-0.8deg)' }}>
              projects finish; areas just keep going — both grow leaves as you tend them ✿
            </div>
            <div style={{ marginTop: 20 }}>
              <Link to="/perennials" style={{ fontSize: 13, color: 'var(--acc-terra)', textDecoration: 'underline' }}>
                View Repeating Perennials Series →
              </Link>
            </div>
          </div>
        )}

        {/* BOARD VIEW */}
        {view === 'board' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 26, maxWidth: 1100 }}>
            {domains.map((d) => {
              const domainProjects = projects.filter((p) => p.domain_id === d.id)
              // Rotate cards slightly for placed cards effect
              return (
                <div key={d.id} style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 10, padding: '13px 13px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 4px 12px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color ?? 'var(--acc-moss)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-body)' }}>{d.name}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-hairline)' }}>{domainProjects.length}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {domainProjects.map((p, idx) => {
                      const stat = projectStats[p.id] || { hours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0 }
                      const cardTilt = idx % 2 === 0 ? -0.4 : 0.3
                      const imgSource = getWisteriaImage(stat.pct)

                      return (
                        <div
                          key={p.id}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          style={{
                            display: 'block',
                            background: 'var(--paper-parchment)',
                            border: '1px solid var(--line-card)',
                            borderRadius: 8,
                            boxShadow: 'var(--shadow-crisp)',
                            padding: '13px 14px',
                            cursor: 'pointer',
                            transform: `rotate(${cardTilt}deg)`,
                            transition: 'transform 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                            <img src={imgSource} alt="" style={{ height: 34, flex: 'none' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-body)', lineHeight: 1.15 }}>{p.name}</div>
                              <div className="fhelp" style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
                                {p.engagement_model ?? 'Project'} · {p.target_date ? `target ${new Date(p.target_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}` : 'no date'}
                              </div>
                            </div>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.type === 'retainer' ? 'var(--acc-lavender-deep)' : 'var(--acc-terra)', flex: 'none', marginTop: 3 }} />
                          </div>

                          <div style={{ marginTop: 11, height: 5, borderRadius: 3, background: 'rgba(42, 36, 32, 0.08)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${stat.pct}%`, height: '100%', background: 'var(--acc-moss)' }} />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                            <span className="chip" style={{ background: 'rgba(122,148,110,0.18)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                              {stat.doneMilestones} / {stat.totalMilestones}
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{stat.hours}h</span>
                          </div>
                        </div>
                      )
                    })}

                    {/* Plant a project here stub slot */}
                    <div
                      onClick={() => {
                        setNewType('standard')
                        setShowNewModal(true)
                      }}
                      style={{ display: 'block', background: 'var(--paper-parchment)', border: '1px dashed var(--line-solid)', borderRadius: 8, padding: '13px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 34, height: 34, borderRadius: 8, border: '1px dashed var(--ink-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 16, flex: 'none' }}>＋</span>
                        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Plant a project here…</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* NEW PROJECT MODAL */}
      {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} defaultType={newType} domains={domains} />}
    </div>
  )
}

function NewProjectModal({ onClose, defaultType, domains }: { onClose: () => void; defaultType: 'standard' | 'area' | 'retainer'; domains: any[] }) {
  const [type, setType] = useState(defaultType)
  const [name, setName] = useState('')
  const [domainId, setDomainId] = useState(domains[0]?.id || '')
  const [targetDate, setTargetDate] = useState('')
  const [engagementModel, setEngagementModel] = useState('')
  const [color, setColor] = useState('var(--acc-terra)')

  // Milestones list state
  const [milestones, setMilestones] = useState<Array<{ title: string; weight: number }>>([])
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneWeight, setNewMilestoneWeight] = useState(1)

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim()) return
    setMilestones([...milestones, { title: newMilestoneTitle.trim(), weight: newMilestoneWeight }])
    setNewMilestoneTitle('')
    setNewMilestoneWeight(1)
  }

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index))
  }

  const handlePlant = () => {
    if (!name.trim()) return

    const selectedDomain = domainId || null

    if (type === 'area') {
      createArea(name.trim(), selectedDomain, color)
    } else {
      const milestoneList = milestones.map((m) => ({
        id: crypto.randomUUID(),
        title: m.title,
        weight: m.weight,
        completed: false,
      }))
      createProject(
        name.trim(),
        selectedDomain,
        type,
        engagementModel.trim() || null,
        targetDate || null,
        color,
        milestoneList,
        []
      )
    }
    onClose()
  }

  const colorPalette = [
    'var(--acc-terra)',
    'var(--acc-moss)',
    'var(--acc-lavender-deep)',
    'var(--acc-gold)',
    'var(--acc-hydrangea)',
    'var(--acc-sage)',
    '#7a4a52',
    '#8b8471',
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
      <div className="dv-card" style={{ width: 620, background: 'var(--paper-parchment)', position: 'relative', border: '1px solid #cfc7b0', borderRadius: 5, boxShadow: '0 18px 44px rgba(60,52,38,0.18)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.3 }} />
        <div style={{ padding: '26px 30px 28px', position: 'relative', zIndex: 10 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingBottom: 18, borderBottom: '1px dashed var(--line-dashed)' }}>
            <img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Projects</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, lineHeight: 1, color: 'var(--ink-body)' }}>Plant something new</h1>
            </div>
            <span onClick={onClose} style={{ width: 28, height: 28, borderRadius: '999px', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 13, cursor: 'pointer' }}>✕</span>
          </div>

          {/* Type Selector */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                onClick={() => setType('standard')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'standard' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'standard' ? '2px solid rgba(122,148,110,0.28)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src="/ds/assets/wisteria/p40.png" alt="" style={{ height: 20 }} /><span style={{ fontSize: 14, fontWeight: type === 'standard' ? 600 : 400, color: 'var(--ink-body)' }}>Project</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }}>has a finish line</div>
              </div>
              <div
                onClick={() => setType('area')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'area' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'area' ? '2px solid rgba(122,148,110,0.28)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--acc-buttercream)' }}></span><span style={{ fontSize: 14, fontWeight: type === 'area' ? 600 : 400, color: 'var(--ink-body)' }}>Area</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }}>ongoing, no end</div>
              </div>
              <div
                onClick={() => setType('retainer')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'retainer' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'retainer' ? '2px solid rgba(122,148,110,0.28)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--acc-lavender-deep)' }}></span><span style={{ fontSize: 14, fontWeight: type === 'retainer' ? 600 : 400, color: 'var(--ink-body)' }}>Retainer</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }}>monthly hours</div>
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Balcony garden rebuild…"
              style={{ width: '100%', font: 'inherit', fontSize: 15, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--acc-moss)', borderRadius: 8, padding: '11px 13px', outline: 'none' }}
            />
          </div>

          {/* Engagement + Domain + Target Date */}
          <div style={{ display: 'flex', gap: 14, marginTop: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Domain</div>
              <select
                value={domainId}
                onChange={(e) => setDomainId(e.target.value)}
                style={{ width: '100%', font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px', outline: 'none' }}
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {type !== 'area' && (
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>
                  {type === 'retainer' ? 'Renews Date' : 'Target date'}
                </div>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  style={{ width: '100%', font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px', outline: 'none' }}
                />
              </div>
            )}
          </div>

          {type !== 'area' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>Engagement Model / Client</div>
              <input
                value={engagementModel}
                onChange={(e) => setEngagementModel(e.target.value)}
                placeholder="e.g. Freelance, Personal…"
                style={{ width: '100%', font: 'inherit', fontSize: 14, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '9px 12px', outline: 'none' }}
              />
            </div>
          )}

          {/* Color Picker */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Color</div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {colorPalette.map((c) => (
                <span
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    outline: color === c ? '1.5px solid var(--paper-parchment)' : 'none',
                    boxShadow: color === c ? `0 0 0 3px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Starting Milestones */}
          {type === 'standard' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Starting milestones</span>
                <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: '#7a745f' }}>optional — the trellis it climbs ✿</span>
              </div>
              <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '2px 13px' }}>
                {milestones.map((m, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)', width: 12 }}>{index + 1}</span>
                    <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-body)' }}>{m.title}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>weight {m.weight}</span>
                    <span onClick={() => handleRemoveMilestone(index)} style={{ cursor: 'pointer', color: 'var(--acc-terra)', fontSize: 12, marginLeft: 8 }}>✕</span>
                  </div>
                ))}
                {/* Milestone quick add */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0' }}>
                  <input
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    placeholder="Milestone title…"
                    style={{ flex: 1, font: 'inherit', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
                  />
                  <input
                    type="number"
                    value={newMilestoneWeight}
                    onChange={(e) => setNewMilestoneWeight(parseInt(e.target.value) || 1)}
                    min="1"
                    style={{ width: 45, font: 'inherit', fontSize: 12.5, background: 'transparent', border: '1px solid var(--line-solid)', borderRadius: 4, padding: '2px 4px', textAlign: 'center', outline: 'none', color: 'var(--ink-body)' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
            <span style={{ flex: 1 }}></span>
            <button onClick={onClose} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handlePlant} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 20px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 16 }} />
              {type === 'area' ? 'Plant Area' : 'Plant Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
