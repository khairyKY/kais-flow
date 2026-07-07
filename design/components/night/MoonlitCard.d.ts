/**
 * MoonlitCard — the Night-theme equivalent of `<Card>`. Frosted glass panel
 * on the navy sky, with a subtle warm inner glow at the top edge (moon spill)
 * and an optional firefly resting near a corner.
 *
 * @startingPoint section="Night" subtitle="Frosted panel — dark theme card" viewport="640x300"
 */
export interface MoonlitCardProps {
  children: React.ReactNode;
  /** Tilt in deg. Default 0. */
  tilt?: number;
  /** Padding preset. */
  padding?: 'sm' | 'md' | 'lg';
  /** Show a single firefly perched on the top-right of the card. */
  firefly?: boolean;
  style?: React.CSSProperties;
}
