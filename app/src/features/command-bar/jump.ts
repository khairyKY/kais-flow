/** Somewhere ⌘K can jump: a view, or (P7e A9) a project, area or label. `name` is what's matched. */
export interface JumpTarget {
  name: string
  label: string
  to: string
  kind?: 'Project' | 'Area' | 'Label'
}

// F3b (D-5 ruling, punch 59): Go-to lives inside ⌘K — type a view name, a jump row
// appears; ↓ selects it, ↵ navigates. Plain ↵ still quick-adds. Parked surfaces
// (Library) and dev routes are deliberately absent until they return. Journal is back in the sidebar (U-14).
export const JUMP_VIEWS: JumpTarget[] = [
  { name: 'today', label: 'Today', to: '/today' },
  { name: 'inbox', label: 'Inbox', to: '/inbox' },
  { name: 'tasks', label: 'Tasks', to: '/tasks' },
  { name: 'calendar', label: 'Calendar', to: '/calendar' },
  { name: 'projects', label: 'Projects', to: '/projects' },
  { name: 'routines', label: 'Routines', to: '/routines' },
  { name: 'review', label: 'Review', to: '/weekly-review' },
  { name: 'focus', label: 'Focus', to: '/focus' },
  { name: 'people', label: 'People', to: '/people' },
  { name: 'journal', label: 'Journal', to: '/journal' },
  { name: 'notebook', label: 'Notebook page', to: '/notebook' },
  { name: 'activity', label: 'Activity', to: '/activity' },
  { name: 'settings', label: 'Settings', to: '/settings' },
  { name: 'search', label: 'Search', to: '/search' },
  { name: 'herbarium', label: 'Herbarium', to: '/herbarium' },
  { name: 'perennials', label: 'Perennials', to: '/perennials' },
  { name: 'trash', label: 'Trash', to: '/trash' },
]

/** The views, then every project, area and label by name. A label opens All tasks filtered to it. */
export function jumpTargets(projects: readonly { id: string; name: string }[], areas: readonly { id: string; name: string }[], labels: readonly string[]): JumpTarget[] {
  return [
    ...JUMP_VIEWS,
    ...projects.map((p) => ({ name: p.name, label: p.name, to: `/projects/${p.id}`, kind: 'Project' as const })),
    ...areas.map((a) => ({ name: a.name, label: a.name, to: `/projects/${a.id}`, kind: 'Area' as const })),
    ...labels.map((l) => ({ name: l, label: l, to: `/tasks?list=all&label=${encodeURIComponent(l)}`, kind: 'Label' as const })),
  ]
}

/** The one jump row for what's typed (≥2 chars): an exact name first, then a name that starts with
 * it, then a word inside a name, each in `targets` order (views first). "in" → Inbox, "t" nothing. */
export function matchJump(input: string, targets: readonly JumpTarget[]): JumpTarget | null {
  const q = input.trim().toLowerCase()
  if (q.length < 2) return null
  const name = (t: JumpTarget) => t.name.toLowerCase()
  return (
    targets.find((t) => name(t) === q) ??
    targets.find((t) => name(t).startsWith(q)) ??
    targets.find((t) => name(t).split(/\s+/).some((w) => w.startsWith(q))) ??
    null
  )
}
