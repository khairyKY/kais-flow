// The kf-* glyph set — design-export/ds/icons (DS-CHANGELOG §3 Icons): 24 grid, stroke 1.6,
// round caps/joins, fill none, currentColor. Copied verbatim minus the export's c2pa <metadata>
// block (~8 KB per file), which would otherwise ride into the bundle 38 times.
export const ICON_NAMES = [
  'alert', 'back', 'calendar', 'camera', 'check', 'chevdown', 'chevright', 'clock', 'close', 'delete', 'dots', 'duplicate',
  'drag', 'focus', 'image', 'inbox', 'journal', 'label', 'link', 'lock', 'mic', 'more', 'offline', 'people',
  'pickdate', 'plus', 'priority', 'project', 'projects', 'remind', 'repeat', 'review', 'rotate', 'routines', 'search',
  'send', 'settings', 'star', 'stop', 'tasks', 'today', 'tomorrow', 'undo',
  // Tray and Notifications.dc.html 12l (bell, moon, focus-ring) + 12k's digest sprout.
  'bell', 'moon', 'focus-ring', 'sprout',
  // The sidebar's line set (Sidebar options.html, icons A, Kai 2026-10-22): its rows, the Plan drawer and the foot.
  'activity', 'chat', 'clipboard', 'guide', 'library', 'plan', 'signout', 'someday',
  // The password field's Show / Hide (queue item 6, 2026-10-25): drawn here, the export has no eye.
  'eye', 'eye-off',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const files = import.meta.glob('./kf-*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** name → the SVG's inner markup (the <svg> wrapper is re-rendered by <Icon>). */
export const ICON_SVGS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [path.slice('./kf-'.length, -'.svg'.length), svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '')]),
)
