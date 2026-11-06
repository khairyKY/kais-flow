// The Terms of Use and Privacy Policy versions — ONE place for the app (features/legal), the notify
// function's `terms` sweep and the site (site/src/pages/info.mjs reads the two dates out of this file
// for its "updated" lines). How to bump them: docs/LEGAL.md.
// A version is the day the text changed, YYYY-MM-DD, so versions compare as plain text.

export const TERMS_VERSION = '2026-10-29'
export const PRIVACY_VERSION = '2026-10-29'

/** What changed, 2–4 short lines: the "We've updated our terms" notice shows them. Rewrite on every bump. */
export const LEGAL_SUMMARY: readonly string[] = [
  'Both now say who runs Kai’s Flow (Kai, in Egypt), that it’s for people 16 and over, and that Egyptian law applies.',
  'Your data is kept in the EU and partly handled in the US. Agreeing includes your consent to that, and to keeping sensitive things you choose to write.',
  'Chat can send the AI (Groq, US) lines from your journal and notes about people that match your question. Account emails go through Gmail.',
  'Also new: how long each thing stays, your rights, how you may use the app, and the limits of our responsibility.',
]

export type LegalDoc = 'terms' | 'privacy'
export const CURRENT: Record<LegalDoc, string> = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION }

/** Both versions as one key: the notify sweep marks a person "told" under it. */
export const LEGAL_KEY = `${TERMS_VERSION}|${PRIVACY_VERSION}`

/** The documents a person still has to agree to, given their consent rows (0083). None at all = both. */
export function outdated(rows: readonly { document: string; version: string }[]): LegalDoc[] {
  return (['terms', 'privacy'] as const).filter((d) => !rows.some((r) => r.document === d && r.version >= CURRENT[d]))
}

// ── Two kinds of change ──
// MATERIAL (a version above): people must agree again — the card over the app, `consents` rows, the hourly sweep.
// INFORMATIONAL (here): the text changed but nothing is asked of anyone — a one-line "updated" notice, dismissed
// once per account (docs/LEGAL.md). Add one when a policy changes without needing a new agreement; it never
// touches the versions above, so nobody is asked to agree again.

export interface LegalNote {
  /** The day the text changed, YYYY-MM-DD: names the note, and accounts made on or after it never see it. */
  id: string
  doc: LegalDoc
  /** One plain line saying what changed. */
  line: string
}

/** Oldest first. A note stays once added: accounts that haven't dismissed it still see it. */
export const LEGAL_NOTES: readonly LegalNote[] = [
  { id: '2026-11-03', doc: 'privacy', line: 'Google Calendar events you change here are now written back to Google, and calendars you subscribe to by link are kept on our server and never shown to the AI.' },
]

/** A dismissed note is one `consents` row: document `<doc>_notice`, version = the note's id (0093). */
export const noticeDoc = (n: LegalNote) => `${n.doc}_notice`

/** The notes this account hasn't dismissed (per its consent rows) and was around for. */
export function unseenNotes(rows: readonly { document: string; version: string }[], accountCreatedAt: string): LegalNote[] {
  return LEGAL_NOTES.filter((n) => accountCreatedAt.slice(0, 10) < n.id && !rows.some((r) => r.document === noticeDoc(n) && r.version === n.id))
}
