/**
 * FireflyField — animated firefly overlay for the Night theme.
 * Absolutely fills its positioned parent with a scattering of gently drifting,
 * glowing dots. Uses CSS `fireflyDrift` keyframe from `tokens/motion.css`.
 *
 * @startingPoint section="Night" subtitle="Ambient fireflies (night theme only)" viewport="640x300"
 */
export interface FireflyFieldProps {
  /** Number of fireflies to render. Default 12. Keep low — atmosphere, not swarm. */
  count?: number;
  /** Reduce brightness — for dense screens. Default 1.0. */
  intensity?: number;
  /** Whether the field is currently animating. */
  active?: boolean;
}
