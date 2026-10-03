import { useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDomains } from '../domains/api'
import { useProjects, useTimeEntries, restoreProject, isThisMonth, renameProject, deleteProjectWithUndo } from './api'
import { useAreas, renameArea, deleteAreaWithUndo } from '../areas/api'
import { ContextMenu } from '../../components/ContextMenu'
import { ActionSheet } from '../../components/ActionSheet'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { NewProjectModal } from './NewProjectModal'
import { useTasks } from '../tasks/api'
import { useSlipping } from '../slipping/api'
import { queryClient } from '../../lib/queryClient'
import { BackLink, SectionLabel } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { Select } from '../../components/Select'
import { useMotionEnabled, staggerDelay, idPhase } from '../../lib/motion'
import { wisteriaStage } from '../../lib/growthStages'
import { useIsMobile } from '../../components/BottomSheet'
import './xfx.css'

// Contract: `target {d MMM}` / `renews {d MMM}` — day without a leading zero, short month.
function dayMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Effects 1t amber drift: three leaves per slipping board card, staggered 0 / 3.4 / 6.2s inside
// the card. J-22 (Kai, 2026-07-29): those same constants ran on EVERY card, so the whole board
// fell in lockstep. Each card now shifts the cycle by its id's phase (a negative delay starts the
// fall mid-way, so no card waits empty) and stretches its durations by up to 16%. The stagger
// inside a card is kept; only transform/opacity animate (kfAmberFall in xfx.css).
const AMBER_LEAVES = [
  { left: '18%', delay: 0, duration: 9.5 },
  { left: '52%', delay: 3.4, duration: 11 },
  { left: '78%', delay: 6.2, duration: 10.2 },
] as const
function amberLeafTiming(leaf: (typeof AMBER_LEAVES)[number], phase: number): React.CSSProperties {
  return {
    left: leaf.left,
    animationDelay: `${(leaf.delay - phase * 10).toFixed(2)}s`,
    animationDuration: `${(leaf.duration * (0.92 + 0.16 * phase)).toFixed(2)}s`,
  }
}

const EMPTY_STAT = { hours: 0, monthHours: 0, doneMilestones: 0, totalMilestones: 0, pct: 0, weight: 0, doneWeight: 0, hasTop3Task: false }

// Projects.dc.html `.mchip` / `.chip` verbatim (the export's canvas CSS has no counterpart in the app).
const mchip: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const mchipLast: React.CSSProperties = { ...mchip, width: 96, textAlign: 'right' }
const chip: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5 }
// Section count on the right of the rule (`<span style="color:var(--ink-hairline)">2</span>`).
const sectionCount = (n: number) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.18em', color: 'var(--ink-hairline)' }}>{n}</span>

// F2 freeze: thresholds live in lib/growthStages — this is just the asset path.
export function getWisteriaImage(pct: number): string {
  return `/ds/assets/wisteria/${wisteriaStage(pct)}.png`
}

/** A row's name, edited in place (the row menu's Rename): Enter or leaving it saves, Esc keeps the old name. */
function RenameField({ value, onDone, style }: { value: string; onDone: (next: string | null) => void; style?: React.CSSProperties }) {
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (next: string | null) => {
    if (done.current) return
    done.current = true
    onDone(next)
  }
  return (
    <input
      autoFocus
      aria-label="Name"
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(text.trim() || null)
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(null)
        }
      }}
      onBlur={() => finish(text.trim() || null)}
      style={{ font: 'inherit', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 5, padding: '2px 6px', margin: '-3px -7px', minWidth: 0, width: '100%', ...style }}
    />
  )
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()

  // State
  const [view, setView] = useState<'list' | 'board' | 'archive'>('list')
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newType, setNewType] = useState<'standard' | 'area' | 'retainer'>('standard')

  // Queries
  const { data: domains = [] } = useDomains()
  const { data: allProjects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  const { data: timeEntries = [] } = useTimeEntries()
  const { data: slippingList = [] } = useSlipping()

  // Filter out archived projects
  const activeProjects = useMemo(() => allProjects.filter((p) => p.status === 'active'), [allProjects])
  const archivedProjects = useMemo(() => allProjects.filter((p) => p.status === 'archived'), [allProjects])

  const filteredProjects = useMemo(() => {
    return activeProjects.filter((p) => !selectedDomainId || p.domain_id === selectedDomainId)
  }, [activeProjects, selectedDomainId])

  const filteredAreas = useMemo(() => {
    return areas.filter((a) => !selectedDomainId || a.domain_id === selectedDomainId)
  }, [areas, selectedDomainId])

  const activeCount = activeProjects.length
  const totalCount = allProjects.length

  // The list view's three sections (contract 1a): Active · Retainers · Areas.
  const listActive = filteredProjects.filter((p) => p.type === 'standard')
  const listRetainers = filteredProjects.filter((p) => p.type === 'retainer')

  // Computed data
  const projectStats = useMemo(() => {
    const stats: Record<string, { hours: number; monthHours: number; doneMilestones: number; totalMilestones: number; pct: number; weight: number; doneWeight: number; hasTop3Task: boolean }> = {}

    for (const p of allProjects) {
      // Sum hours from time_entries
      const entries = timeEntries.filter((e) => e.project_id === p.id)
      const minutes = entries.reduce((acc, curr) => acc + curr.duration_min, 0)
      const hours = Math.round((minutes / 60) * 10) / 10
      // punch 42: retainers report the CURRENT month, not all time.
      const monthMinutes = entries.filter((e) => isThisMonth(e.started_at)).reduce((acc, curr) => acc + curr.duration_min, 0)
      const monthHours = Math.round((monthMinutes / 60) * 10) / 10

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
      const hasTop3Task = tasks.some((t) => t.project_id === p.id && t.status === 'todo' && t.top3)

      stats[p.id] = {
        hours,
        monthHours,
        doneMilestones,
        totalMilestones,
        pct,
        weight: totalWeight,
        doneWeight: completedWeight,
        hasTop3Task,
      }
    }
    return stats
  }, [allProjects, timeEntries, tasks])

  // Header wisteria = the whole set's real stage (weighted milestones across active projects),
  // not a fixed p60. House rule: never show a stage that contradicts the data.
  const forestPct = useMemo(() => {
    let weight = 0
    let done = 0
    for (const p of activeProjects) {
      weight += projectStats[p.id]?.weight ?? 0
      done += projectStats[p.id]?.doneWeight ?? 0
    }
    return weight > 0 ? Math.round((done / weight) * 100) : 0
  }, [activeProjects, projectStats])

  const areaOpenTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of areas) {
      counts[a.id] = tasks.filter((t) => t.area_id === a.id && t.status === 'todo').length
    }
    return counts
  }, [areas, tasks])

  // Effects 1e bloom glow — never on more than one plant at once.
  const bloomId = activeProjects.find((p) => projectStats[p.id]?.pct === 100)?.id ?? null
  const slippingProject = (pid: string) => slippingList.find((s) => s.entity_type === 'project' && s.entity_id === pid)
  const isSlippingProject = (pid: string) => !!slippingProject(pid)
  // J-19: the area rows' slipping chip, now shared with project rows (the list used to flag a
  // slipping area but not a slipping project — only the board knew). Desktop carries the days
  // like the export's `slipping · 21d`; the phone branch keeps its shorter `slipping`.
  const slippingChip = (days: number) => (
    <span style={{ ...chip, background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)' }}>
      slipping · {Math.floor(days)}d
    </span>
  )
  const mobileSlippingChip = (
    <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>
      slipping
    </span>
  )

  const isEmpty = allProjects.length === 0 && areas.length === 0

  // Kai 2026-10-03: a project / area row's own menu — right-click on a computer, ⋯ everywhere
  // (an ActionSheet on a phone). Rename edits the name in place; Delete = Trash + Undo.
  const [menu, setMenu] = useState<{ kind: 'project' | 'area'; id: string; name: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const openMenu = (kind: 'project' | 'area', id: string, name: string, x: number, y: number) => setMenu({ kind, id, name, x, y })
  const rowMenu = (kind: 'project' | 'area', id: string, name: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      openMenu(kind, id, name, e.clientX, e.clientY)
    },
  })
  const moreButton = (kind: 'project' | 'area', id: string, name: string) => (
    <button
      type="button"
      className="pj-more kf-hit"
      aria-label={`More for ${name}`}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        openMenu(kind, id, name, r.left, r.bottom)
      }}
    >
      <Icon name="dots" size={20} />
    </button>
  )
  const nameOf = (id: string, name: string, style?: React.CSSProperties) =>
    renaming === id ? (
      <RenameField
        value={name}
        style={style}
        onDone={(next) => {
          setRenaming(null)
          if (!next || next === name) return
          const p = allProjects.find((x) => x.id === id)
          if (p) renameProject(p, next)
          const a = areas.find((x) => x.id === id)
          if (a) renameArea(a, next)
        }}
      />
    ) : (
      <EmojiText text={name} />
    )
  const menuActions = (m: NonNullable<typeof menu>): { label: string; icon: IconName; danger?: boolean; run: () => void }[] => {
    const project = m.kind === 'project' ? allProjects.find((p) => p.id === m.id) : undefined
    const area = m.kind === 'area' ? areas.find((a) => a.id === m.id) : undefined
    return [
      { label: 'Open', icon: 'chevright', run: () => navigate(`/projects/${m.id}`) },
      { label: 'Rename', icon: 'label', run: () => setRenaming(m.id) },
      // The press ceremony archives it when it closes (punch 51), with its own Undo.
      ...(project ? [{ label: 'Finish & press', icon: 'check' as IconName, run: () => navigate(`/herbarium?press=${project.id}`) }] : []),
      { label: 'Delete', icon: 'delete', danger: true, run: () => (project ? deleteProjectWithUndo(project) : area && deleteAreaWithUndo(area)) },
    ]
  }
  const menuLayer = menu && (isMobile ? (
    <ActionSheet
      title={menu.name}
      meta={menu.kind === 'project' ? 'Project' : 'Area'}
      onClose={() => setMenu(null)}
      items={menuActions(menu).map((a) => ({ label: a.label, icon: <Icon name={a.icon} />, destructive: a.danger, onSelect: a.run }))}
    />
  ) : (
    <ContextMenu
      position={{ x: menu.x, y: menu.y }}
      onClose={() => setMenu(null)}
      items={menuActions(menu).map((a) => ({ label: a.label, icon: <Icon name={a.icon} size={16} />, danger: a.danger, onClick: a.run }))}
    />
  ))

  // States t1 / 1c — unplanted projects: pots on a shelf, soil at the ready.
  const renderEmptyState = () => (
    <div style={{ padding: '52px 40px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="180" height="86" viewBox="0 0 180 86">
        <path d="M8 74h164" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round" />
        {[36, 90, 144].map((cx, i) => (
          <g key={cx}>
            <path d={`M${cx - 20} 40h40l-5 33h-30l-5-33Z`} fill="none" stroke={i === 1 ? 'var(--ink-faint)' : 'var(--ink-hairline)'} strokeWidth="2" strokeLinejoin="round" />
            <path d={`M${cx - 24} 40h48`} stroke={i === 1 ? 'var(--ink-faint)' : 'var(--ink-hairline)'} strokeWidth="2" strokeLinecap="round" />
            {i === 1 && <text x={cx} y={62} textAnchor="middle" style={{ font: '600 8px var(--font-mono)', letterSpacing: '0.14em', fill: 'var(--ink-hairline)' }}>SOIL</text>}
          </g>
        ))}
      </svg>
      <div style={{ marginTop: 22, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-muted)', textAlign: 'center', maxWidth: 340, lineHeight: 1.45 }}>No projects growing yet.</div>
      <button
        onClick={() => { setNewType('standard'); setShowNewModal(true) }}
        className="kf-lift"
        style={{ marginTop: 20, border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13.5, padding: '10px 20px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
      >
        + Plant the first one
      </button>
    </div>
  )

  // Render Mobile (iPhone variant 1c)
  if (isMobile) {
    return (
      <div style={{ maxWidth: 398, margin: '0 auto', background: 'var(--paper-linen)', minHeight: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
        <div style={{ flex: 1, padding: '16px 18px 24px', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <img src={getWisteriaImage(forestPct)} alt="" className={motion ? 'kf-sway' : undefined} style={{ height: 36, filter: 'var(--shadow-drop-sm)' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>Projects</div>
            </div>
            {/* X4: 44px touch target */}
            <button
              onClick={() => {
                setNewType('standard')
                setShowNewModal(true)
              }}
              className="kf-lift"
              style={{ width: 44, height: 44, borderRadius: '999px', background: 'var(--acc-terra)', border: 'none', boxShadow: 'var(--shadow-cta)', color: 'var(--paper-parchment)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }}
            >
              +
            </button>
          </div>

          {isEmpty && renderEmptyState()}

          {!isEmpty && <>
          {/* Active section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '16px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>Active</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {filteredProjects
            .filter((p) => p.type === 'standard')
            .map((p, i) => {
              const stat = projectStats[p.id] ?? EMPTY_STAT
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  {...rowMenu('project', p.id, p.name)}
                  className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: p.color ?? domain?.color ?? 'var(--acc-moss)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink-body)', minWidth: 0 }}>{nameOf(p.id, p.name)}</div>
                      {stat.hasTop3Task && <span style={{ color: 'var(--acc-terra)', fontSize: 12 }}>★</span>}
                    </div>
                    {/* J-19: on the meta line, not beside the name — the title row has no room at 390px. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 1 }}>
                      {stat.hours}h · {stat.doneMilestones}/{stat.totalMilestones} milestones
                      {isSlippingProject(p.id) && mobileSlippingChip}
                    </div>
                  </div>
                  <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>
                    {p.target_date ? new Date(p.target_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'no date'}
                  </span>
                  {moreButton('project', p.id, p.name)}
                </div>
              )
            })}

          {/* Retainers Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Retainers</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {filteredProjects
            .filter((p) => p.type === 'retainer')
            .map((p, i) => {
              const stat = projectStats[p.id] ?? EMPTY_STAT
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  {...rowMenu('project', p.id, p.name)}
                  className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: p.color ?? domain?.color ?? 'var(--acc-lavender-deep)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink-body)', minWidth: 0 }}>{nameOf(p.id, p.name)}</div>
                      {stat.hasTop3Task && <span style={{ color: 'var(--acc-terra)', fontSize: 12 }}>★</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 1 }}>
                      {stat.monthHours}h this month
                      {isSlippingProject(p.id) && mobileSlippingChip}
                    </div>
                  </div>
                  <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>
                    retainer
                  </span>
                  {moreButton('project', p.id, p.name)}
                </div>
              )
            })}

          {/* Areas Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Areas</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
          </div>
          {filteredAreas.map((a, i) => {
            const count = areaOpenTaskCounts[a.id] || 0
            const domain = domains.find((d) => d.id === a.domain_id)
            const isSlipping = slippingList.some((s) => s.entity_type === 'area' && s.entity_id === a.id)
            return (
              <div
                key={a.id}
                onClick={() => navigate(`/projects/${a.id}`)}
                {...rowMenu('area', a.id, a.name)}
                className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: '1px dashed var(--line-dashed)', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
              >
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: a.color ?? domain?.color ?? 'var(--acc-buttercream)', flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--ink-body)' }}>{nameOf(a.id, a.name)}</span>
                {isSlipping ? (
                  mobileSlippingChip
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
                    {count} open
                  </span>
                )}
                {moreButton('area', a.id, a.name)}
              </div>
            )
          })}
          </>}
        </div>
        {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} defaultType={newType} domains={domains} />}
        {menuLayer}
      </div>
    )
  }

  // J-21 (Kai, 2026-07-29): "Board / Finished / domain buttons shouldn't live under the heading
  // of the page." WA-8's split out of the header was right (six pills never fit it), its home
  // wasn't: the same controls now sit right-aligned on the first section-label row of whichever
  // view is showing — beside ACTIVE's count in the list, on a bare dashed rule above the board
  // and the archive. App-only navigation, not in the export; still kept quiet (R4-33a: only one
  // filled CTA per view).
  const viewControls = (
    <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12, rowGap: 10 }}>
      {view !== 'archive' && (
        /* punch 41: the dead `Timeline` third tab is gone — it was never wired (DRIFT-AUDIT: "Timeline tab dead"). */
        <span className="seg" style={{ display: 'inline-flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 3, gap: 3 }}>
          <span onClick={() => setView('list')} className={view === 'list' ? 'on' : ''} style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: view === 'list' ? 'var(--ink-body)' : 'var(--ink-muted)', background: view === 'list' ? 'var(--paper-parchment)' : 'transparent', border: view === 'list' ? '1px solid var(--line-card)' : '1px solid transparent', boxShadow: view === 'list' ? 'var(--shadow-crisp)' : 'none', fontWeight: view === 'list' ? 600 : 400, cursor: view === 'list' ? 'default' : 'pointer', fontFamily: 'inherit' }}>List</span>
          <span onClick={() => setView('board')} className={view === 'board' ? 'on' : ''} style={{ padding: '6px 13px', borderRadius: 5, fontSize: 12, color: view === 'board' ? 'var(--ink-body)' : 'var(--ink-muted)', background: view === 'board' ? 'var(--paper-parchment)' : 'transparent', border: view === 'board' ? '1px solid var(--line-card)' : '1px solid transparent', boxShadow: view === 'board' ? 'var(--shadow-crisp)' : 'none', fontWeight: view === 'board' ? 600 : 400, cursor: view === 'board' ? 'default' : 'pointer', fontFamily: 'inherit' }}>Board</span>
        </span>
      )}
      {view === 'archive' && (
        <span onClick={() => setView('list')} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '8px 13px' }}>
          ← Back to Active
        </span>
      )}
      {/* E4 (2026-07-18 audit): explicit labeled entry to the archive — the count text alone was undiscoverable */}
      <button
        onClick={() => setView(view === 'archive' ? 'list' : 'archive')}
        style={{
          border: view === 'archive' ? '1px solid var(--line-solid)' : '1px solid transparent',
          background: view === 'archive' ? 'var(--paper-parchment)' : 'transparent',
          color: view === 'archive' ? 'var(--ink-body)' : 'var(--ink-muted)',
          fontFamily: 'inherit',
          fontSize: '12.5px',
          padding: '9px 13px',
          borderRadius: '999px',
          cursor: 'pointer',
          boxShadow: view === 'archive' ? 'var(--shadow-crisp)' : 'none',
        }}
      >
        Finished · {archivedProjects.length}
      </button>
      {/* R4-33b (2026-07-20 audit): "that drop down menu isn't our theme at all." The pill
          was a styled div with a transparent native <select> laid over it — the trigger
          looked right, but opening it handed you the OS dropdown. The themed Select keeps
          the pill (it merges `style` onto its trigger) and brings our own popover. */}
      <Select
        value={selectedDomainId || ''}
        onChange={(v) => setSelectedDomainId(v || null)}
        options={[{ value: '', label: 'All Domains' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
        ariaLabel="Filter by domain"
        placeholder="Domain"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9.5px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
          border: '1px solid var(--line-solid)',
          borderRadius: '999px',
          padding: '8px 13px',
        }}
      />
    </span>
  )
  // Board / archive / empty list have no section label of their own: SectionLabel's dashed rule,
  // minus the empty label slot (it would indent the rule), carries the controls.
  const controlsRule = (maxWidth: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 4px', maxWidth }}>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      {viewControls}
    </div>
  )

  // Render Desktop
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '85vh' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />

      <main style={{ position: 'relative', zIndex: 10, padding: '10px 8px 40px' }}>
        {/* punch 41: header is Projects.dc.html 1a node-for-node — plant at the set's live stage,
            eyebrow, 40px display title, then exactly `{n} active · {n} total` + New area + New project.
            The app-only navigation (List/Board, Finished, domain filter) lives on the section-label
            row below (J-21): six pills never fit this row (punch 16's wrap), and the export's header has three. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, rowGap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={getWisteriaImage(forestPct)} alt="" className={motion ? 'kf-sway' : undefined} title={`p${forestPct}`} style={{ height: 52, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Projects &amp; areas · the forest
              </div>
              <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
                {view === 'list' ? "What's growing" : "The forest, by domain"}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, rowGap: 10 }}>
            <span className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
              {activeCount} active · {totalCount} total
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
        {view === 'list' && isEmpty && <div style={{ maxWidth: 900 }}>{controlsRule(900)}{renderEmptyState()}</div>}
        {view === 'list' && !isEmpty && (
          <div style={{ maxWidth: 900 }}>
            {/* ACTIVE */}
            <SectionLabel style={{ margin: '26px 0 4px' }} action={<>{sectionCount(listActive.length)}{viewControls}</>}>
              <span style={{ color: 'var(--acc-sage-text)' }}>Active</span>
            </SectionLabel>
            {listActive.map((p, i) => {
              const stat = projectStats[p.id] ?? EMPTY_STAT
              const slip = slippingProject(p.id)
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  {...rowMenu('project', p.id, p.name)}
                  className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 2px', borderBottom: i < listActive.length - 1 ? '1px dashed var(--line-dashed)' : 'none', textDecoration: 'none', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color ?? domain?.color ?? 'var(--acc-terra)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)', minWidth: 0 }}>{nameOf(p.id, p.name)}</div>
                      {stat.hasTop3Task && <span style={{ color: 'var(--acc-terra)', fontSize: 13 }}>★</span>}
                      {slip && slippingChip(slip.days_since)}
                    </div>
                    {/* Contract sub-line is the domain ("Freelance" / "Personal"); engagement model is the fallback. */}
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{domain?.name ?? p.engagement_model ?? ''}</div>
                  </div>
                  <span style={mchip}>{stat.hours}h logged</span>
                  <span style={{ ...chip, background: 'color-mix(in oklch, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)' }}>
                    {stat.doneMilestones} / {stat.totalMilestones} milestones
                  </span>
                  <span style={mchipLast}>{p.target_date ? `target ${dayMonth(p.target_date)}` : 'no date'}</span>
                  {moreButton('project', p.id, p.name)}
                </div>
              )
            })}

            {/* RETAINERS */}
            <SectionLabel style={{ margin: '24px 0 4px' }} action={sectionCount(listRetainers.length)}>
              <span>Retainers</span>
            </SectionLabel>
            {listRetainers.map((p, i) => {
              const stat = projectStats[p.id] ?? EMPTY_STAT
              const slip = slippingProject(p.id)
              const domain = domains.find((d) => d.id === p.domain_id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  {...rowMenu('project', p.id, p.name)}
                  className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 2px', textDecoration: 'none', borderBottom: i < listRetainers.length - 1 ? '1px dashed var(--line-dashed)' : 'none', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color ?? domain?.color ?? 'var(--acc-lavender-deep)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)', minWidth: 0 }}>{nameOf(p.id, p.name)}</div>
                      {stat.hasTop3Task && <span style={{ color: 'var(--acc-terra)', fontSize: 13 }}>★</span>}
                      {slip && slippingChip(slip.days_since)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{domain?.name ?? p.engagement_model ?? ''}</div>
                  </div>
                  {/* punch 42: real hours for THIS month. The contract's "/ 10h" allowance and
                      "renews 1 Aug" have no field behind them — nothing is rendered rather than a
                      design literal (the 96px cell stays so the columns still line up). */}
                  <span style={mchip}>{stat.monthHours}h this month</span>
                  <span style={{ ...chip, background: 'color-mix(in oklch, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)' }}>
                    retainer
                  </span>
                  <span style={mchipLast} />
                  {moreButton('project', p.id, p.name)}
                </div>
              )
            })}

            {/* AREAS */}
            <SectionLabel style={{ margin: '24px 0 4px' }} action={sectionCount(filteredAreas.length)}>
              <span>Areas</span>
            </SectionLabel>
            {filteredAreas.map((a, i) => {
              const count = areaOpenTaskCounts[a.id] || 0
              const domain = domains.find((d) => d.id === a.domain_id)
              const slippingItem = slippingList.find((s) => s.entity_type === 'area' && s.entity_id === a.id)
              return (
                <div
                  key={a.id}
                  onClick={() => navigate(`/projects/${a.id}`)}
                  {...rowMenu('area', a.id, a.name)}
                  className={motion ? 'kf-lift kf-stagger-item' : 'kf-lift'}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 2px', borderBottom: i < filteredAreas.length - 1 ? '1px dashed var(--line-dashed)' : 'none', cursor: 'pointer', ...(motion ? staggerDelay(i) : {}) }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.color ?? domain?.color ?? 'var(--acc-buttercream)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 15, color: 'var(--ink-body)' }}>{nameOf(a.id, a.name, { width: 'auto' })}</span>
                    {domain && <span style={{ fontSize: 12, color: 'var(--ink-muted)', marginLeft: 8 }}>{domain.name}</span>}
                  </div>
                  {slippingItem ? (
                    slippingChip(slippingItem.days_since)
                  ) : (
                    <span style={{ ...chip, border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' }}>area</span>
                  )}
                  <span style={mchipLast}>{count} open</span>
                  {moreButton('area', a.id, a.name)}
                </div>
              )
            })}

            <div style={{ marginTop: 26, fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand)', transform: 'rotate(-0.8deg)' }}>
              projects finish; areas just keep going — both grow leaves as you tend them ✿
            </div>
          </div>
        )}

        {/* BOARD VIEW */}
        {view === 'board' && controlsRule(1100)}
        {view === 'board' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16, maxWidth: 1100 }}>
            {domains
              .filter((d) => !selectedDomainId || d.id === selectedDomainId)
              .map((d) => {
                const domainProjects = filteredProjects.filter((p) => p.domain_id === d.id)
                const almostBloomingProject = domainProjects.find((p) => {
                  const stat = projectStats[p.id]
                  return stat && stat.pct >= 80 && stat.pct < 100 && (stat.totalMilestones - stat.doneMilestones === 1)
                })

                return (
                  <div key={d.id} style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 10, padding: '13px 13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 4px 12px' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color ?? 'var(--acc-moss)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-body)' }}>{d.name}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)' }}>{domainProjects.length}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {domainProjects.map((p, idx) => {
                        const stat = projectStats[p.id] ?? EMPTY_STAT
                        const cardTilt = idx % 2 === 0 ? -0.4 : 0.3
                        const imgSource = getWisteriaImage(stat.pct)

                        const slipping = isSlippingProject(p.id)
                        return (
                          <div
                            key={p.id}
                            onClick={() => navigate(`/projects/${p.id}`)}
                            {...rowMenu('project', p.id, p.name)}
                            className="kf-lift-tilt"
                            style={{
                              display: 'block',
                              position: 'relative',
                              overflow: 'hidden',
                              background: 'var(--paper-parchment)',
                              border: '1px solid var(--line-card)',
                              borderRadius: 8,
                              boxShadow: 'var(--shadow-crisp)',
                              padding: '13px 14px',
                              cursor: 'pointer',
                              ['--kf-tilt' as string]: `${cardTilt}deg`,
                            }}
                          >
                            {/* Effects 1t — amber drift over a slipping card, <=3 leaves; plant desaturates ~20% */}
                            {motion && slipping && AMBER_LEAVES.map((leaf) => (
                              <span key={leaf.left} className="kf-amber-leaf" style={amberLeafTiming(leaf, idPhase(p.id))} />
                            ))}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                              <span style={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
                                {/* Effects 1e — bloom glow at 100%, never more than one plant */}
                                {motion && p.id === bloomId && <span className="kf-bloom" style={{ inset: -10 }} />}
                                <img src={imgSource} alt="" style={{ height: 34, flex: 'none', position: 'relative', filter: slipping ? 'saturate(0.8)' : undefined }} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-body)', lineHeight: 1.15 }}><EmojiText text={p.name} /></div>
                                <div className="fhelp" style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
                                  {p.engagement_model ?? 'Project'} · {p.target_date ? `target ${new Date(p.target_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}` : 'no date'}
                                </div>
                              </div>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color ?? d.color ?? (p.type === 'retainer' ? 'var(--acc-lavender-deep)' : 'var(--acc-terra)'), flex: 'none', marginTop: 3 }} />
                            </div>

                            <div style={{ marginTop: 11, height: 5, borderRadius: 3, background: 'color-mix(in oklch, var(--ink-body) 8%, transparent)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', width: `${stat.pct}%`, height: '100%', background: 'var(--acc-moss)' }} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                              <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}>
                                {stat.doneMilestones} / {stat.totalMilestones}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{stat.hours}h</span>
                              {stat.hasTop3Task && <span style={{ marginLeft: 'auto', color: 'var(--acc-terra)', fontSize: 13 }}>★</span>}
                            </div>
                          </div>
                        )
                      })}

                      {almostBloomingProject && (
                        <div style={{ padding: '16px 6px', textAlign: 'center', fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-muted)' }}>
                          almost blooming — one milestone left ✿
                        </div>
                      )}

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

        {/* ARCHIVE VIEW */}
        {view === 'archive' && controlsRule(760)}
        {view === 'archive' && (
          <div style={{ maxWidth: 760, background: 'var(--paper-linen)', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-card)', padding: '30px 38px 34px', position: 'relative', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <BackLink onClick={() => setView('list')}>All projects</BackLink>
              <span style={{ marginLeft: 'auto' }} className="fhelp">{archivedProjects.length} finished · {archivedProjects.reduce((acc, p) => acc + (projectStats[p.id]?.hours || 0), 0)}h all-time</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 20 }}>
              <img src="/ds/assets/wisteria/p100.png" alt="" className={motion ? 'kf-sway' : undefined} style={{ height: 46, filter: 'var(--shadow-drop-sm)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Projects · archive</div>
                <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1, color: 'var(--ink-body)' }}>Grown &amp; done</h1>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', marginTop: 10 }}>
              finished projects reach the full wisteria cascade — kept, not cleared ✿
            </div>

            {/* Group archived projects by year */}
            {Object.entries(
              archivedProjects.reduce<Record<number, any[]>>((acc, p) => {
                const year = new Date(p.updated_at).getFullYear()
                if (!acc[year]) acc[year] = []
                acc[year].push(p)
                return acc
              }, {})
            )
              .sort(([yearA], [yearB]) => parseInt(yearB) - parseInt(yearA))
              .map(([year, yearProjs]) => (
                <div key={year}>
                  <div className="slabel" style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '24px 0 4px' }}>
                    <span>{year}</span>
                    <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
                    <span style={{ color: 'var(--ink-hairline)' }}>{yearProjs.length}</span>
                  </div>
                  {yearProjs.map((p) => {
                    const stat = projectStats[p.id] ?? EMPTY_STAT
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                        <img src="/ds/assets/wisteria/p100.png" alt="" style={{ height: 30, flex: 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-body)' }}><EmojiText text={p.name} /></div>
                          <div className="fhelp" style={{ marginTop: 2 }}>{p.engagement_model || 'Project'} · {stat.doneMilestones} / {stat.totalMilestones} milestones</div>
                        </div>
                        <span className="mchip">{stat.hours}h</span>
                        <span className="mchip" style={{ width: 88, textAlign: 'right' }}>
                          done {new Date(p.updated_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                        </span>
                        <span
                          className="chip"
                          onClick={() => {
                            restoreProject(p)
                            queryClient.invalidateQueries({ queryKey: ['projects'] })
                          }}
                          style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 999 }}
                        >
                          restore
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}

            <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link to="/herbarium" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
                Open the Herbarium — {archivedProjects.length} pressed specimens →
              </Link>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
                Archived projects stay searchable · restore any time
              </span>
              <span style={{ flex: 1 }}></span>
              {/* Punch 8: "Export all ↓" was styled clickable with no handler and no export
                  implementation anywhere. Removed rather than faked; the archive still reads. */}
            </div>
          </div>
        )}
      </main>

      {/* NEW PROJECT MODAL */}
      {showNewModal && <NewProjectModal onClose={() => setShowNewModal(false)} defaultType={newType} domains={domains} />}
      {menuLayer}
    </div>
  )
}
