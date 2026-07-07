/**
 * Button — the workspace's primary action element.
 *
 * @startingPoint section="Core" subtitle="Terra CTA, ghost, secondary" viewport="700x120"
 */
export interface ButtonProps {
  /** Visual weight. `primary` = terra pill (CTA), `secondary` = bordered pill,
   *  `ghost` = no border, muted. Default: `secondary`. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Content — usually a label; may include a leading icon glyph. */
  children: React.ReactNode;
  /** Leading dot indicator (used on `Voice capture` — pulses when active). */
  showDot?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}
