/**
 * Card — parchment surface with a subtle tilt and two-part shadow.
 * The card body itself is *not* usually a component in Kai's Flow, but this
 * primitive gives you the standard box: border, background, shadow, radius,
 * optional rotation.
 *
 * @startingPoint section="Core" subtitle="Parchment card with tape slot" viewport="700x200"
 */
export interface CardProps {
  children: React.ReactNode;
  /** Extra tilt in deg — pass a small non-zero value for the "pinned" feel. */
  tilt?: number;
  /** Background variant. `parchment` (default), `bone`, `goal` (gold), `flat` (no shadow). */
  tone?: 'parchment' | 'bone' | 'goal' | 'flat';
  /** Padding preset. */
  padding?: 'sm' | 'md' | 'lg';
  /** Additional inline styles merged over the base. */
  style?: React.CSSProperties;
}
