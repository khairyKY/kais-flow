// "Colour follows where it lives" (Kai 2026-11-16): the ONE rule for the colour of a task, a task's block or an event.
//   own colour (hand-set)  →  its project's  →  its area's  →  none (the kind's default: Iris for a task, Rose for an event)
// A task block asks its task first (moving the task to another project recolours the block); a Google / ICS event
// keeps its calendar's colour unless it is filed under a project or area. A project's or area's colour is drawn as
// its palette C swatch (a legacy one — lavender, plum, gold, sage, terracotta… — as its nearest new swatch).
// Pure — no Deno APIs — and shared: the app's every drawing (calendar, Day bar, widgets, dots, focus), the widget
// edge function and the MCP all call it; the app's vitest (colorFollows.test.ts) covers it.
import { nearestSwatch, swatchOfHex } from './blockColors.ts'

export type ColorSource = 'own' | 'project' | 'area' | 'none'
/** `from`: the project's or area's id the colour came from (source 'project' | 'area'). */
export interface Resolved { color: string | null; source: ColorSource; from?: string }

/** Day hex of the app's colour tokens a project or area may have been saved with (colors.css). */
export const TOKEN_HEX: Readonly<Record<string, string>> = {
  'var(--acc-sage)': '#8A9A7E', 'var(--acc-moss)': '#7A946E', 'var(--acc-terra)': '#B5654A', 'var(--acc-blossom)': '#D4A8B0',
  'var(--acc-lavender)': '#A8A0BE', 'var(--acc-hydrangea)': '#9AB4BE', 'var(--acc-buttercream)': '#D4C78A', 'var(--acc-clover)': '#C9A0A0',
  'var(--acc-gold)': '#7F6428', 'var(--acc-gold-warm)': '#C9A55A', 'var(--acc-lavender-deep)': '#6A5988',
}
const HEX = /^#[0-9a-f]{6}$/i

/** A project's or area's stored colour as the palette C swatch it draws as; null when it has none (or can't be read). */
export function placeSwatch(color: string | null | undefined): string | null {
  if (!color) return null
  const k = color.trim()
  const hex = TOKEN_HEX[k.toLowerCase()] ?? k
  return HEX.test(hex) ? nearestSwatch(hex).value : null
}

/** What a thing carries that its colour can follow. A task has no colour of its own (only its blocks do). */
export interface Colored {
  color?: string | null
  project_id?: string | null
  area_id?: string | null
  task_id?: string | null
  /** 'gcal' | 'ics' keeps its calendar's colour unless it is filed. */
  source?: string | null
}
interface Placed { id: string; color?: string | null }
interface Homed { id: string; project_id?: string | null; area_id?: string | null }

/** The resolver over a snapshot of the user's projects, areas and tasks (only the tasks that blocks hold are needed). */
export function makeColorResolver(projects: Iterable<Placed>, areas: Iterable<Placed>, tasks: Iterable<Homed>): (item: Colored) => Resolved {
  const pc = new Map<string, string | null>()
  for (const p of projects) pc.set(p.id, placeSwatch(p.color))
  const ac = new Map<string, string | null>()
  for (const a of areas) ac.set(a.id, placeSwatch(a.color))
  const tk = new Map<string, Homed>()
  for (const t of tasks) tk.set(t.id, t)
  const where = (h: { project_id?: string | null; area_id?: string | null } | undefined): Resolved | null => {
    const p = h?.project_id ? pc.get(h.project_id) : null
    if (p) return { color: p, source: 'project', from: h!.project_id! }
    const a = h?.area_id ? ac.get(h.area_id) : null
    return a ? { color: a, source: 'area', from: h!.area_id! } : null
  }
  return (item) => {
    const own = item.color ? swatchOfHex(item.color)?.value ?? item.color : null
    const synced = item.source === 'gcal' || item.source === 'ics'
    const filed = () => (item.task_id ? where(tk.get(item.task_id)) : null) ?? where(item)
    if (synced) return filed() ?? (own ? { color: own, source: 'own' } : { color: null, source: 'none' })
    if (own) return { color: own, source: 'own' }
    return filed() ?? { color: null, source: 'none' }
  }
}
