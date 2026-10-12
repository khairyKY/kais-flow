// Everything factual the site says, in one place. Keep it true: check the app before changing a line.
import fs from 'node:fs'

export const APP_URL = 'https://kais-flow.kaidagoat.workers.dev'
export const REPO = 'https://github.com/khairyKY/kais-flow'
export const RELEASES_URL = `${REPO}/releases`
// Kai: put the address people should write to here; until then the pages show "[contact email]".
export const CONTACT_EMAIL = ''

// The release notes: ONE file that the site (Field notes, What's new, RSS), the app (its What's new
// sheet, app/src/lib/whatsNew.ts) and the release workflow (the GitHub Release's body) all read.
// Newest first, dates are Cairo days. Each: { v, date, title?, highlights: [...], icons?: [one
// icons.mjs name per highlight, drawn on /whats-new/], art }. A new release goes on top.
export const RELEASES = JSON.parse(fs.readFileSync(new URL('./releases.json', import.meta.url), 'utf8'))

// The newest release at build time. The pages ask GitHub for the current one when they load
// (site.js) and fall back to this if GitHub doesn't answer.
export const LATEST = { tag: RELEASES[0].v, date: RELEASES[0].date, apkMB: 34, exeMB: 32 }
export const apkUrl = (tag) => `${REPO}/releases/download/${tag}/kais-flow-${tag}.apk`
export const exeUrl = (tag) => `${REPO}/releases/download/${tag}/kais-flow-${tag}-windows-setup.exe`

// What's growing — Now / Next / Later. Now = what builders are working on this month (October 2026);
// Next / Later = the open items in docs/ROADMAP.md. Shipped things leave for Field notes.
export const ROADMAP = {
  now: ['Events that repeat, and a new menu for calendar events', 'The Notebook page and the ticks loop', 'Today and the Inbox, redrawn from Kai’s reviewed designs', 'Talk it out and photos in the journal'],
  next: ['Google Calendar sync', 'Smart lists'],
  later: ['Email → Inbox', 'More themes', 'An iPhone app <i>(if it ever stops costing money)</i>'],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MONTHS[m - 1]}` }
export const longDate = (iso) => `${shortDate(iso)} ${iso.slice(0, 4)}`
