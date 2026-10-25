import type { ReactNode } from 'react'
import { openExternal } from '../../lib/platform'
import { RELEASE_NOTES_URL } from '../../lib/whatsNew'
import { CURRENT } from '../../../../supabase/functions/_shared/legal.ts'

// The policies live on the site (site/src/pages/info.mjs); kept light, the sign-in page imports this.

/** The site's pages (the address site/build.mjs defaults SITE_URL to, as What's new uses). */
export const PRIVACY_URL = new URL('/privacy/', RELEASE_NOTES_URL).href
export const TERMS_URL = new URL('/terms/', RELEASE_NOTES_URL).href

/** Sign-up's user metadata: the versions the box was ticked for. 0083's trigger records them. */
export const signupConsent = () => ({ terms_version: CURRENT.terms, privacy_version: CURRENT.privacy })

/** A policy link: a new tab on the web, the system browser in the Windows and Android apps. */
export function LegalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation() // inside sign-up's "I agree…" line, a link isn't a tick
        void openExternal(href)
      }}
    >
      {children}
    </a>
  )
}

/** "Privacy · Terms", small, under the sign-in and sign-up forms. */
export function LegalFooter() {
  return (
    <nav className="fr-legal" aria-label="Policies">
      <LegalLink href={PRIVACY_URL}>Privacy Policy</LegalLink>
      <span aria-hidden="true">·</span>
      <LegalLink href={TERMS_URL}>Terms of Use</LegalLink>
    </nav>
  )
}
