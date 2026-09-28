// The kf-* glyph set — design-export/ds/icons (DS-CHANGELOG §3 Icons): 24 grid, stroke 1.6,
// round caps/joins, fill none, currentColor. Copied verbatim minus the export's c2pa <metadata>
// block (~8 KB per file), which would otherwise ride into the bundle 38 times.
export const ICON_NAMES = [
  'alert', 'back', 'calendar', 'check', 'chevdown', 'chevright', 'clock', 'close', 'delete', 'dots',
  'drag', 'focus', 'inbox', 'journal', 'label', 'lock', 'mic', 'more', 'offline', 'people',
  'pickdate', 'plus', 'priority', 'project', 'projects', 'remind', 'repeat', 'review', 'routines', 'search',
  'send', 'settings', 'star', 'stop', 'tasks', 'today', 'tomorrow', 'undo',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const files = import.meta.glob('./kf-*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** name → the SVG's inner markup (the <svg> wrapper is re-rendered by <Icon>). */
export const ICON_SVGS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [path.slice('./kf-'.length, -'.svg'.length), svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '')]),
)
