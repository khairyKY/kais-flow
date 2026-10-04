// Everything factual the site says, in one place. Keep it true: check the app before changing a line.

export const APP_URL = 'https://kais-flow.kaidagoat.workers.dev'
export const REPO = 'https://github.com/khairyKY/kais-flow'
export const RELEASES_URL = `${REPO}/releases`
// Kai: put the address people should write to here; until then the pages show "[contact email]".
export const CONTACT_EMAIL = ''

// The newest release at build time. The pages ask GitHub for the current one when they load
// (site.js) and fall back to this if GitHub doesn't answer.
export const LATEST = { tag: 'v1.0.20', date: '2026-10-04', apkMB: 34, exeMB: 32 }
export const apkUrl = (tag) => `${REPO}/releases/download/${tag}/kais-flow-${tag}.apk`
export const exeUrl = (tag) => `${REPO}/releases/download/${tag}/kais-flow-${tag}-windows-setup.exe`

// Field notes — the real release history, newest first (dates are Cairo days).
export const RELEASES = [
  { v: 'v1.0.20', date: '2026-10-04', art: 'cherry-bloom', title: 'A tray icon, and paper that becomes tasks', lines: [
    'A tray icon on Windows, with a little flyout: now, next, your Top 3, quick capture and focus',
    'Notifications with buttons — Done and Tomorrow right from a reminder',
    'Quiet hours, and task names hidden on the lock screen until you choose',
    'Paper capture: photograph your handwritten notes and they come back as tasks, events and notes (Arabic too)'] },
  { v: 'v1.0.19', date: '2026-10-04', art: 'fern-coil', lines: ['Signing up works straight away while email is being set up'] },
  { v: 'v1.0.18', date: '2026-10-04', art: 'hydrangea-light', lines: [
    'Sign-up and reset emails lead back to the app',
    'The chat answers from your day and knows how the app works — in your language',
    'GitHub in Settings leads straight to your issues'] },
  { v: 'v1.0.17', date: '2026-10-04', art: 'daisy-evening', title: 'Settings that tell the truth, and the share sheet', lines: [
    'Settings tells the truth: real reminder times, the real GitHub state, and Google Calendar marked as coming',
    'Kai’s Flow is in the Android share sheet',
    'Make capture keys on the phone',
    'Labels on task rows, and *label to add one',
    'Streak goals for routines',
    'Retainer projects roll their open tasks into the new month'] },
  { v: 'v1.0.16', date: '2026-10-03', art: 'cherry-bloom', title: 'Settings that scroll, and a calendar that snaps', lines: [
    'Settings scrolls everywhere', 'Our own right-click menu', 'Delete areas', 'Search in Focus',
    'The calendar snaps to 15 minutes', 'A default calendar view', 'Check for updates',
    'A Windows installer that looks like the app'] },
  { v: 'v1.0.15', date: '2026-10-03', art: 'hydrangea-light', lines: [
    'Plan my day searches all your tasks and lets you pick in place', 'A calendar task opens in one tap',
    'Reminders move with their task', 'Routines fold by time of day', 'The pressing ceremony waits for you',
    'Import from Todoist, TickTick, Notion, Obsidian, Kindle and Goodreads'] },
  { v: 'v1.0.14', date: '2026-10-02', art: 'clover-four_leaf', lines: ['The new icon: a Source Serif K on warm paper'] },
  { v: 'v1.0.13', date: '2026-09-29', art: 'daisy-midday', lines: ['A touch calendar for phones: swipe days, hold to move, resize handles'] },
  { v: 'v1.0.12', date: '2026-09-29', art: 'fern-unfurl1', lines: ['Open a task as a sheet over any page', 'A calmer first run'] },
  { v: 'v1.0.11', date: '2026-09-28', art: 'wisteria-p40', lines: ['Plan my day and Shut down, redrawn'] },
  { v: 'v1.0.10', date: '2026-09-28', art: 'vine-leaf-right', lines: ['Our own date and time pickers', 'Today on the phone, with the NOW slip'] },
  { v: 'v1.0.9', date: '2026-09-28', art: 'cherry-bud', lines: ['Swipe right for Tomorrow, left for Trash with Undo', 'Hold to select'] },
  { v: 'v1.0.8', date: '2026-09-28', art: 'clover-awake', lines: ['The refreshed design system', 'The native Android app'] },
  { v: 'v1.0.7', date: '2026-09-27', art: 'daisy-morning', lines: ['The phone pass: readability, phone type, tab icons'] },
  { v: 'v1.0.6', date: '2026-09-27', art: 'hydrangea-medium', lines: ['GitHub issues into your Inbox'] },
  { v: 'v1.0.5', date: '2026-09-27', art: 'fern-coil', lines: ['Capture from anywhere with a link'] },
]

// What's growing — Now / Next / Later. Now = what builders are working on this month.
export const ROADMAP = {
  now: ['A time zone of your own', 'An MCP server for AI assistants', 'This website'],
  next: ['The Notebook page', 'The ticks loop', 'A short tour and a guide inside the app', 'More themes', 'Google Calendar sync', 'Email → Inbox'],
  later: ['A Telegram bot', 'Notifications in the Android app', 'Smart lists', 'An iPhone app <i>(if it ever stops costing money)</i>'],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MONTHS[m - 1]}` }
export const longDate = (iso) => `${shortDate(iso)} ${iso.slice(0, 4)}`
