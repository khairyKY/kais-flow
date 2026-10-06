import { useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { logActivity } from '../../lib/activity'
import { writeRow } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import type { Area, Domain, Project, Task } from '../../lib/types'
import { toastUndo } from '../../lib/undo'
import { ConfirmCard } from './ConfirmCard'
import { areaToDomain, areaToProject, domainToArea, flipProjectType, KIND_LABEL, kindOf, projectToArea, TARGETS, type Kind, type Plan } from './convert'

// Change a thing's type (Kai 2026-10-06) from its ⋯ menu or its own page: pick what it becomes,
// read the one line that says exactly what will happen, confirm — one Undo takes it all back.
// The rules are ./convert.ts; this only builds the plan from the caches and runs it.

const an = (k: Kind) => (k === 'area' ? 'an area' : `a ${k}`)
const ENTITY: Record<Kind, 'project' | 'area' | 'domain'> = { project: 'project', retainer: 'project', area: 'area', domain: 'domain' }

export type Convertible = { table: 'projects'; row: Project } | { table: 'areas'; row: Area } | { table: 'domains'; row: Domain }

const cache = <T,>(key: string) => queryClient.getQueryData<T[]>([key]) ?? []

function planFor(thing: Convertible, to: Kind): Plan {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const tasks = cache<Task>('tasks')
  if (thing.table === 'projects') return to === 'area' ? projectToArea(thing.row, tasks, id, now) : flipProjectType(thing.row, now)
  if (thing.table === 'areas') return to === 'domain' ? areaToDomain(thing.row, tasks, id, cache<Domain>('domains').length, now) : areaToProject(thing.row, tasks, id, now)
  return domainToArea(thing.row, { projects: cache('projects'), areas: cache('areas'), tasks, people: cache('people'), routines: cache('routines'), notes: cache('notes') }, id, now)
}

function run(plan: Plan, thing: Convertible, from: Kind, to: Kind, onUndone?: () => void): void {
  for (const w of plan.writes) writeRow(w.table, w.row, w.op)
  const name = thing.row.name
  logActivity(`${ENTITY[from]}.type_changed`, ENTITY[from], thing.row.id, { from, to, name, ...(plan.created ? { new_id: plan.created.id } : null) })
  if (plan.created) logActivity(`${ENTITY[to]}.created`, ENTITY[to], plan.created.id, { name, from })
  toastUndo(`“${name}” is now ${an(to)}`, () => {
    for (const w of plan.undo) writeRow(w.table, w.row, w.op)
    logActivity(`${ENTITY[from]}.type_restored`, ENTITY[from], thing.row.id, { from: to, to: from })
    onUndone?.()
  })
}

/** `ask(thing, to)` opens the confirmation; render `node`. `after` gets what it became (navigate
 * there from a detail page); `onUndone` runs after the Undo (come back). */
export function useChangeType(o: { after?: (created: Plan['created']) => void; onUndone?: (thing: Convertible) => void } = {}) {
  const [pending, setPending] = useState<{ thing: Convertible; from: Kind; to: Kind; plan: Plan } | null>(null)
  const ask = (thing: Convertible, to: Kind) => {
    const from = kindOf(thing.row, thing.table)
    setPending({ thing, from, to, plan: planFor(thing, to) })
  }
  const node = pending && (
    <ConfirmCard
      title={`Make “${pending.thing.row.name}” ${an(pending.to)}?`}
      body={pending.plan.summary}
      confirmLabel={`Make it ${an(pending.to)}`}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        // Re-plan at the moment of confirming, so a change made while the card was open is not undone.
        const plan = planFor(pending.thing, pending.to)
        run(plan, pending.thing, pending.from, pending.to, o.onUndone && (() => o.onUndone!(pending.thing)))
        setPending(null)
        o.after?.(plan.created)
      }}
    />
  )
  return { ask, node }
}

/** The "Change type…" chooser: what this thing can become — a menu on a computer, a sheet on a phone. */
export function TypeMenu({ thing, at, onPick, onClose }: { thing: Convertible; at: { x: number; y: number }; onPick: (to: Kind) => void; onClose: () => void }) {
  const isMobile = useIsMobile()
  const from = kindOf(thing.row, thing.table)
  const items = TARGETS[from].map((to) => ({ label: `Make it ${an(to)}`, run: () => onPick(to) }))
  return isMobile ? (
    <ActionSheet title="Change type" meta={`${thing.row.name} · ${KIND_LABEL[from]}`} onClose={onClose} items={items.map((i) => ({ label: i.label, onSelect: i.run }))} />
  ) : (
    <ContextMenu position={at} onClose={onClose} items={items.map((i) => ({ label: i.label, onClick: i.run }))} />
  )
}
