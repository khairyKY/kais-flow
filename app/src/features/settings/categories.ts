import type { IconName } from '../../components/icons/kf'

// Settings, layout A (Settings options.html, Kai 2026-10-25 "layout A, rows A"): eleven categories in
// four groups (you · how it looks and behaves · what it connects and keeps · help), one per page —
// /settings/<id> — with the Integrations providers one level down (/settings/integrations/<provider>).

export type CatId = 'account' | 'appearance' | 'calendar' | 'capture' | 'notify' | 'organize' | 'integrations' | 'data' | 'privacy' | 'shortcuts' | 'about'

export interface Cat {
  id: CatId
  name: string
  icon: IconName
  /** The line under the page title. */
  sum: string
}

export const CATS: Cat[] = [
  { id: 'account', name: 'Account', icon: 'person', sum: 'Your email and name, sign out, delete your account' },
  { id: 'appearance', name: 'Appearance', icon: 'appearance', sum: 'Theme, interface size, paper texture, animations' },
  { id: 'calendar', name: 'Calendar & time', icon: 'calendar', sum: 'Time zone, the clock, your weekend, how the calendar opens and fits' },
  { id: 'capture', name: 'Capture & AI', icon: 'inbox', sum: 'Whether the AI files captures, project suggestions, page photos, sharing' },
  { id: 'notify', name: 'Notifications & sound', icon: 'bell', sum: 'Which reminders reach you, quiet hours, the sounds' },
  { id: 'organize', name: 'Organize', icon: 'label', sum: 'Domains, labels, and when “Not now” comes back' },
  { id: 'integrations', name: 'Integrations', icon: 'link', sum: 'Google Calendar, GitHub, AI assistants, the capture key' },
  { id: 'data', name: 'Your data', icon: 'data', sum: 'Import from Akiflow or a CSV, export everything, Trash' },
  { id: 'privacy', name: 'Privacy & terms', icon: 'lock', sum: 'The Privacy Policy and Terms, what we keep and where' },
  { id: 'shortcuts', name: 'Shortcuts', icon: 'keyboard', sum: 'Keyboard keys, and what you can type in a task' },
  { id: 'about', name: 'App & updates', icon: 'info', sum: 'Version, updates, what’s new, the Windows and Android apps' },
]

export const CAT: Record<CatId, Cat> = Object.fromEntries(CATS.map((c) => [c.id, c])) as Record<CatId, Cat>

/** The list's groups, hairlines between. */
export const GROUPS: CatId[][] = [['account'], ['appearance', 'calendar', 'capture', 'notify', 'organize'], ['integrations', 'data', 'privacy'], ['shortcuts', 'about']]

export const isCat = (s: string | undefined): s is CatId => !!s && s in CAT

/** The providers under Integrations, each its own page. */
export const PROVIDERS = ['google', 'github', 'mcp', 'capture-key'] as const
export type ProviderId = (typeof PROVIDERS)[number]
export const isProvider = (s: string | undefined): s is ProviderId => !!s && (PROVIDERS as readonly string[]).includes(s)

/** The computer opens on Appearance (today's first card); the phone opens on the list. */
export const DESKTOP_HOME: CatId = 'appearance'

/** The old one-page anchors (`/settings#settings-Sound`, and the cards' ids the guides and harnesses
 * know) → where each now lives. The ids stay on those sections, so the page still scrolls to them. */
const OLD_ANCHORS: Record<string, string> = {
  Profile: 'account',
  Appearance: 'appearance',
  Calendar: 'calendar',
  Timezone: 'calendar',
  Capture: 'capture',
  Notifications: 'notify',
  Sound: 'notify',
  Organize: 'organize',
  Labels: 'organize',
  Resurfacing: 'organize',
  Integrations: 'integrations',
  Advanced: 'integrations/capture-key',
  Data: 'data',
  Legal: 'privacy',
  App: 'about',
}

/** `#settings-Sound` → `notify`; null for any other hash. */
export function anchorTarget(hash: string): string | null {
  const m = /^#settings-(\w+)$/.exec(hash)
  return m ? (OLD_ANCHORS[m[1]] ?? null) : null
}

/** Search: every word typed must start a word of the row's label, help or keywords ("dark" finds Theme
 * through its keywords, "quiet hours" finds Quiet hours). Case and accents don't count. */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const words = fold(query).split(' ').filter(Boolean)
  const hay = ` ${fold(texts.filter(Boolean).join(' '))}`
  return words.length > 0 && words.every((w) => hay.includes(` ${w}`))
}

/** Lower case, no accents, words split on anything that isn't a letter or digit. */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ')
