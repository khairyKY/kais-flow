/**
 * StarField — the deep-sky backdrop for the Night theme. Renders a static
 * scattering of small twinkling stars behind the page content.
 *
 * @startingPoint section="Night" subtitle="Star backdrop for the Night theme" viewport="640x260"
 */
export interface StarFieldProps {
  /** Number of stars. Default 60. */
  count?: number;
  /** Include a subtle radial "moon" glow at the given position. */
  moon?: { x?: string; y?: string } | false;
}
