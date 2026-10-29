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
