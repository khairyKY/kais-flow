import { useEffect, useRef, useState } from 'react'
import { useDomains } from '../domains/api'
import { createProject } from './api'
import { createArea } from '../areas/api'
import { useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { useEscapeStack } from '../../lib/overlayStack'
import { DateField } from '../../components/DatePicker'
import { NumberField } from '../../components/NumberField'
import { Select } from '../../components/Select'
import { Button } from '../../components/kit'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import './xfx.css'

type ProjectType = 'standard' | 'area' | 'retainer'
interface Draft {
  type: ProjectType
  name: string
  domainId: string
  targetDate: string
  engagementModel: string
  color: string
  milestones: Array<{ title: string; weight: number }>
  newMilestoneTitle: string
  newMilestoneWeight: number
}

// Phone: closing the sheet never discards (BottomSheet's contract — its scrim, swipe and Back keep
// the draft): a form with something typed waits here until Plant or Cancel. Desktop follows the
// outside-click rule instead: the scrim is ignored while dirty, and Esc / ✕ / Cancel discard.
let draft: Draft | null = null

// A ✕ that removes a row: a real button, 44px to a finger (.kf-hit).
const removeBtn: React.CSSProperties = { flex: 'none', width: 24, height: 24, border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 'var(--fs-caption)', color: 'var(--acc-terra)', cursor: 'pointer', borderRadius: 999, marginLeft: 4 }

// Extracted from ProjectsPage (2026-07-18 audit) so the Tasks rail can open the same
// designed modal. `domains` is optional — when omitted the modal fetches them itself.
export function NewProjectModal({
  onClose,
  defaultType = 'standard',
  defaultDomainId,
  domains: domainsProp,
}: {
  onClose: () => void
  defaultType?: ProjectType
  /** The domain it opens on (the board's "Plant a project here…" column); else the first. */
  defaultDomainId?: string
  domains?: any[]
}) {
  const { data: fetchedDomains = [] } = useDomains()
  const domains = domainsProp ?? fetchedDomains
  const isMobile = useIsMobile()
  // The phone's BottomSheet handles Esc itself (and keeps the draft); on desktop Esc discards.
  useEscapeStack(!isMobile, () => { discard(); onClose() })
  const motion = useMotionEnabled()
  const [saved] = useState(() => draft)
  const [type, setType] = useState<ProjectType>(saved?.type ?? defaultType)
  const [name, setName] = useState(saved?.name ?? '')
  const [domainId, setDomainId] = useState(saved?.domainId ?? defaultDomainId ?? domains[0]?.id ?? '')
  const [targetDate, setTargetDate] = useState(saved?.targetDate ?? '')
  const [engagementModel, setEngagementModel] = useState(saved?.engagementModel ?? '')
  const [color, setColor] = useState(saved?.color ?? 'var(--acc-terra)')

  // Milestones list state
  const [milestones, setMilestones] = useState<Array<{ title: string; weight: number }>>(saved?.milestones ?? [])
  const [newMilestoneTitle, setNewMilestoneTitle] = useState(saved?.newMilestoneTitle ?? '')
  const [newMilestoneWeight, setNewMilestoneWeight] = useState(saved?.newMilestoneWeight ?? 1)

  // Outside-click rule: a form with something typed ignores the scrim (Esc / Cancel still close).
  const dirty = !!(name.trim() || engagementModel.trim() || targetDate || milestones.length || newMilestoneTitle.trim())
  const ended = useRef(false)
  useEffect(() => {
    if (!ended.current) draft = dirty ? { type, name, domainId, targetDate, engagementModel, color, milestones, newMilestoneTitle, newMilestoneWeight } : null
  })
  const discard = () => {
    ended.current = true
    draft = null
  }

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim()) return
    setMilestones([...milestones, { title: newMilestoneTitle.trim(), weight: newMilestoneWeight }])
    setNewMilestoneTitle('')
    setNewMilestoneWeight(1)
  }

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index))
  }

  const effectiveDomain = domainId || domains[0]?.id || ''

  const handlePlant = (from: HTMLElement, close: () => void) => {
    if (!name.trim()) return
    seedPlant(from, motion) // Motion 5f

    const selectedDomain = effectiveDomain || null

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
    discard()
    close()
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

  const fields = (
    <>
          {/* Type Selector */}
          <div style={{ marginTop: isMobile ? 0 : 18 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 7 }}>Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                onClick={() => setType('standard')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'standard' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'standard' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 'var(--radius-input)', padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src="/ds/assets/wisteria/p40.png" alt="" style={{ height: 20 }} /><span style={{ fontSize: 14, fontWeight: type === 'standard' ? 600 : 400, color: 'var(--ink-body)' }}>Project</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 5 }}>Has a finish line</div>
              </div>
              <div
                onClick={() => setType('area')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'area' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'area' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 'var(--radius-input)', padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--acc-buttercream)' }}></span><span style={{ fontSize: 14, fontWeight: type === 'area' ? 600 : 400, color: 'var(--ink-body)' }}>Area</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 5 }}>Ongoing, no end</div>
              </div>
              <div
                onClick={() => setType('retainer')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'retainer' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'retainer' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 'var(--radius-input)', padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--acc-lavender-deep)' }}></span><span style={{ fontSize: 14, fontWeight: type === 'retainer' ? 600 : 400, color: 'var(--ink-body)' }}>Retainer</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginTop: 5 }}>Monthly hours</div>
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 7 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Balcony garden rebuild…"
              style={{ width: '100%', font: 'inherit', fontSize: 'var(--fs-body)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--acc-moss)', borderRadius: 'var(--radius-md)', padding: '11px 13px', outline: 'none' }}
            />
          </div>

          {/* Engagement + Domain + Target Date */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 7 }}>Domain</div>
              <Select
                value={effectiveDomain}
                onChange={setDomainId}
                options={domains.map((d) => ({ value: d.id, label: d.name }))}
                ariaLabel="Domain"
                placeholder="Domain"
                style={{ width: '100%', fontSize: 'var(--fs-body)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '9px 12px', minHeight: isMobile ? 44 : undefined }}
              />
            </div>

            {type !== 'area' && (
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 7 }}>
                  {type === 'retainer' ? 'Renews' : 'Target date'}
                </div>
                <DateField
                  value={targetDate}
                  onChange={setTargetDate}
                  title={type === 'retainer' ? 'Renews' : 'Target date'}
                  style={{ width: '100%', font: 'inherit', fontSize: 'var(--fs-body)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '9px 12px', outline: 'none', minHeight: isMobile ? 44 : undefined }}
                />
              </div>
            )}
          </div>

          {type !== 'area' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 7 }}>Engagement model / client</div>
              <input
                value={engagementModel}
                onChange={(e) => setEngagementModel(e.target.value)}
                placeholder="e.g. Freelance, Personal…"
                style={{ width: '100%', font: 'inherit', fontSize: 'var(--fs-body)', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-md)', padding: '9px 12px', outline: 'none' }}
              />
            </div>
          )}

          {/* Color Picker */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', marginBottom: 8 }}>Color</div>
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Starting milestones</span>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Optional — the trellis it climbs ✿</span>
              </div>
              <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-input)', padding: '2px 13px' }}>
                {milestones.map((m, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--line-dashed)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', width: 12 }}>{index + 1}</span>
                    <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-body)' }}>{m.title}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Weight {m.weight}</span>
                    <button type="button" className="kf-hit" onClick={() => handleRemoveMilestone(index)} title="Remove" aria-label={`Remove milestone ${m.title}`} style={removeBtn}>✕</button>
                  </div>
                ))}
                {/* Milestone quick add */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0' }}>
                  <input
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    placeholder="Milestone title…"
                    style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 'var(--fs-caption)', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
                  />
                  <NumberField value={newMilestoneWeight} onChange={setNewMilestoneWeight} min={1} max={100} ariaLabel="Milestone weight" style={{ fontSize: 12.5 }} />
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontSize: 'var(--fs-mono-l)', padding: '4px 10px', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}
    </>
  )

  // Cancel throws the draft away; every other close keeps it.
  const actions = (close: () => void) => (
    <>
      <Button variant="secondary" onClick={() => { discard(); close() }}>Cancel</Button>
      <Button onClick={(e) => handlePlant(e.currentTarget, close)} icon={<img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 16 }} />}>
        {type === 'area' ? 'Plant area' : 'Plant project'}
      </Button>
    </>
  )

  // Phone: a sheet over the page (its scrim, swipe and Esc dismiss — the draft stays).
  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} title="Plant something new" footer={(close) => actions(close)}>
        {() => fields}
      </BottomSheet>
    )
  }

  return (
    <div className="kf-overlay-scrim" onClick={() => { if (!dirty) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}>
      <div className="dv-card kf-overlay-card" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: 'calc(var(--kf-vw) - 24px)', maxHeight: 'calc(var(--kf-vh) - 24px)', overflowY: 'auto', background: 'var(--paper-parchment)', position: 'relative', border: '1px solid var(--line-solid)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-popover)' }}>
        <div style={{ padding: '26px 30px 28px', position: 'relative', zIndex: 10 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingBottom: 18, borderBottom: '1px solid var(--line-dashed)' }}>
            <img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Projects</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--fs-display-l)', lineHeight: 1, color: 'var(--ink-body)' }}>Plant something new</h1>
            </div>
            <button type="button" className="kf-hit" onClick={() => { discard(); onClose() }} title="Close" aria-label="Close" style={{ width: 28, height: 28, padding: 0, borderRadius: '999px', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', font: 'inherit', fontSize: 'var(--fs-body-s)', cursor: 'pointer' }}>✕</button>
          </div>

          {fields}

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line-dashed)' }}>
            <span style={{ flex: 1 }}></span>
            {actions(onClose)}
          </div>
        </div>
      </div>
    </div>
  )
}
