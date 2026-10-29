import { useId, type ReactNode } from 'react'
import { Checkbox } from '../../components/kit'
import { openExternal } from '../../lib/platform'
import { RELEASE_NOTES_URL } from '../../lib/whatsNew'
import { CURRENT, type LegalDoc } from '../../../../supabase/functions/_shared/legal.ts'

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

/** One required box per document (sign-up and the "We've updated our terms" notice): the Terms with the
 * age line; the Privacy Policy with the explicit consent to sensitive content and the EU/US handling, kept
 * apart from the Terms (GDPR Art 7(2), Egypt PDPL — docs/log/2026-10-29-0231-legal-review-handoff.md C2).
 * A tick records that document's `consents` row at its current version. */
export function ConsentBox({ doc, checked, onToggle, className }: { doc: LegalDoc; checked: boolean; onToggle: () => void; className: string }) {
  const id = useId()
  return (
    // The box's own click bubbles up here, so the line is one target: a tap anywhere on it ticks
    // (keyboard: Space on the box); its link opens the page instead (LegalLink stops it).
    <div className={className} onClick={onToggle}>
      <Checkbox checked={checked} size={20} labelledBy={id} />
      <span id={id}>
        {doc === 'terms' ? (
          <>
            I agree to the <LegalLink href={TERMS_URL}>Terms of Use</LegalLink>. I’m 16 or older.
          </>
        ) : (
          <>
            I agree to the <LegalLink href={PRIVACY_URL}>Privacy Policy</LegalLink> and explicitly consent to keeping sensitive things I choose to write, and to my data being kept in the EU and partly handled in the US.
          </>
        )}
      </span>
    </div>
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
