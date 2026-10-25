// The Terms of Use and Privacy Policy versions — ONE place for the app (features/legal), the notify
// function's `terms` sweep and the site (site/src/pages/info.mjs reads the two dates out of this file
// for its "updated" lines). How to bump them: docs/LEGAL.md.
// A version is the day the text changed, YYYY-MM-DD, so versions compare as plain text.

export const TERMS_VERSION = '2026-10-25'
export const PRIVACY_VERSION = '2026-10-25'

/** What changed, 2–4 short lines: the "We've updated our terms" notice shows them. Rewrite on every bump. */
export const LEGAL_SUMMARY: readonly string[] = [
  'You can now export everything and delete your account yourself, in Settings → Your data.',
  'New accounts agree to these terms when they sign up, and we note which version and when.',
  'The privacy policy now names every service that sees a little of your data: push services, GitHub and the emails we send.',
]

export type LegalDoc = 'terms' | 'privacy'
export const CURRENT: Record<LegalDoc, string> = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION }

/** Both versions as one key: the notify sweep marks a person "told" under it. */
export const LEGAL_KEY = `${TERMS_VERSION}|${PRIVACY_VERSION}`

/** The documents a person still has to agree to, given their consent rows (0083). None at all = both. */
export function outdated(rows: readonly { document: string; version: string }[]): LegalDoc[] {
  return (['terms', 'privacy'] as const).filter((d) => !rows.some((r) => r.document === d && r.version >= CURRENT[d]))
}
