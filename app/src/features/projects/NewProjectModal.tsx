import { useState } from 'react'
import { useDomains } from '../domains/api'
import { createProject } from './api'
import { createArea } from '../areas/api'
import { useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { useEscapeStack } from '../../lib/overlayStack'
import './xfx.css'

// Extracted from ProjectsPage (2026-07-18 audit) so the Tasks rail can open the same
// designed modal. `domains` is optional — when omitted the modal fetches them itself.
export function NewProjectModal({
  onClose,
  defaultType = 'standard',
  domains: domainsProp,
}: {
  onClose: () => void
  defaultType?: 'standard' | 'area' | 'retainer'
  domains?: any[]
}) {
  const { data: fetchedDomains = [] } = useDomains()
  const domains = domainsProp ?? fetchedDomains
  useEscapeStack(true, onClose)
  const motion = useMotionEnabled()
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

  const handlePlant = (from?: HTMLElement) => {
    if (!name.trim()) return
    seedPlant(from, motion) // Motion 5f

    const selectedDomain = domainId || domains[0]?.id || null

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
    <div className="kf-overlay-scrim" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.4)', backdropFilter: 'blur(3px)' }}>
      <div className="dv-card kf-overlay-card" style={{ width: 620, maxWidth: 'calc(var(--kf-vw) - 24px)', maxHeight: 'calc(var(--kf-vh) - 24px)', overflowY: 'auto', background: 'var(--paper-parchment)', position: 'relative', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-popover)' }}>
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
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'standard' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'standard' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src="/ds/assets/wisteria/p40.png" alt="" style={{ height: 20 }} /><span style={{ fontSize: 14, fontWeight: type === 'standard' ? 600 : 400, color: 'var(--ink-body)' }}>Project</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }}>has a finish line</div>
              </div>
              <div
                onClick={() => setType('area')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'area' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'area' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--acc-buttercream)' }}></span><span style={{ fontSize: 14, fontWeight: type === 'area' ? 600 : 400, color: 'var(--ink-body)' }}>Area</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 5 }}>ongoing, no end</div>
              </div>
              <div
                onClick={() => setType('retainer')}
                style={{ flex: 1, background: 'var(--paper-bone)', border: type === 'retainer' ? '1px solid var(--acc-moss)' : '1px solid var(--line-card)', outline: type === 'retainer' ? '2px solid color-mix(in oklch, var(--acc-moss) 28%, transparent)' : 'none', borderRadius: 9, padding: '11px 12px', cursor: 'pointer' }}
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
                <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-muted)' }}>optional — the trellis it climbs ✿</span>
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
            <button onClick={(e) => handlePlant(e.currentTarget)} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 20px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 16 }} />
              {type === 'area' ? 'Plant Area' : 'Plant Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
