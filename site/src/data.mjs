// Everything factual the site says, in one place. Keep it true: check the app before changing a line.
import fs from 'node:fs'

export const APP_URL = 'https://kais-flow.kaidagoat.workers.dev'
export const REPO = 'https://github.com/khairyKY/kais-flow'
export const RELEASES_URL = `${REPO}/releases`
// Kai: put the address people should write to here; until then the pages show "[contact email]".
export const CONTACT_EMAIL = 'khairyshhn1@gmail.com'

// Kai 2026-10-12: turned off. `true` brings back /ar/, the EN | ع switch, the hreflang links, its
// sitemap entry and its share card (src/pages/ar.mjs and public/og/ar.png are kept for that).
export const ARABIC = false

// The site's public address (canonical links, share cards, sitemap, RSS). SITE_URL wins. Without it:
// Cloudflare Pages names its deployment (CF_PAGES_URL = https://<hash>.<project>.pages.dev, so the
// project's own address is that minus the first label); otherwise the Worker the site deploys to
// (2026-10-17: `npx wrangler deploy` from site/, Kai's account subdomain khairyshhn1).
export const siteUrl = (env) => {
  const strip = (u) => u.replace(/\/+$/, '')
  if (env.SITE_URL) return strip(env.SITE_URL)
  if (env.CF_PAGES_URL) return strip(env.CF_PAGES_URL.replace(/^(https?:\/\/)[^.]+\.(?=[^.]+\.pages\.dev)/, '$1'))
  return 'https://kais-flow-site.khairyshhn1.workers.dev'
}

// The release notes: ONE file that the site (Field notes, What's new, RSS), the app (its What's new
// sheet, app/src/lib/whatsNew.ts) and the release workflow (the GitHub Release's body) all read.
// Newest first, dates are Cairo days. Each: { v, date, title?, highlights: [...], icons?: [one
// icons.mjs name per highlight, drawn on /whats-new/], art }. A new release goes on top.
export const RELEASES = JSON.parse(fs.readFileSync(new URL('./releases.json', import.meta.url), 'utf8'))

// The newest release at build time. The pages ask GitHub for the current one when they load
// (site.js) and fall back to this if GitHub doesn't answer.
export const LATEST = { tag: RELEASES[0].v, date: RELEASES[0].date, apkMB: 34, exeMB: 32, dmgMB: 20 }
// The newest release's installers under fixed names (android.yml / desktop.yml upload a version-less copy
// beside the versioned file): the download buttons. A release's own file (apkUrl) is for its notes.
export const APK_LATEST = `${REPO}/releases/latest/download/kais-flow.apk`
export const EXE_LATEST = `${REPO}/releases/latest/download/kais-flow-windows-setup.exe`
// The Mac app (desktop.yml's macos job, 2026-10-29): one .dmg for Apple silicon and Intel. Live once a
// release has built it; deploy the site after that release, or this button 404s.
export const DMG_LATEST = `${REPO}/releases/latest/download/kais-flow-mac.dmg`
export const apkUrl = (tag) => `${REPO}/releases/download/${tag}/kais-flow-${tag}.apk`

// What's growing — Now / Next / Later. Now = what builders are working on this month (October 2026);
// Next / Later = the open items in docs/ROADMAP.md. Shipped things leave for Field notes.
export const ROADMAP = {
  now: ['Fixes from living with v1.5'],
  next: ['Being weighed: start dates, attachments on tasks, a quick-add key on Windows'],
  later: ['Email → Inbox', 'More themes', 'An iPhone app <i>(if it ever stops costing money)</i>'],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MONTHS[m - 1]}` }
export const longDate = (iso) => `${shortDate(iso)} ${iso.slice(0, 4)}`
