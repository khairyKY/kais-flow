import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from './kit'
import { EmptyState } from './States'

// D13 (Kai 2026-10-16, Design System B "C inside B · tonal"): B's shape filled with the soft terra
// wash (--wash-terra) in terra ink. The computed fill, ink, corner and the terra text button's
// pressed wash are checked in the browser: docs/log/assets/kit-sheets/verify.mjs ("tonal").
describe('kit Button · tonal (D13)', () => {
  it('renders the tonal variant on the kit button', () => {
    const html = renderToStaticMarkup(<Button variant="tonal">Replan all</Button>)
    expect(html).toContain('kf-button kf-button--tonal')
    expect(html).toContain('Replan all')
  })

  it('an empty state’s suggestion is the tonal button, never a second terra CTA', () => {
    const html = renderToStaticMarkup(<EmptyState line="Nothing here yet" action={{ label: 'Add one', onClick: () => {} }} />)
    expect(html).toContain('kf-button--tonal')
    expect(html).not.toContain('kf-button--cta')
  })
})
