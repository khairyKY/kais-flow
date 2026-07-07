/**
 * Tape — washi-tape decoration pinned to the top edge of cards & panels.
 * Renders a small striped rectangle absolutely positioned above the card.
 *
 * Use inside a `position: relative` parent. Every hero card in Kai's Flow has
 * one to two of these; a plain card has none.
 */
export interface TapeProps {
  /** Which flower accent the tape is tinted with. Default: `sage`. */
  color?: 'sage' | 'blossom' | 'lavender' | 'hydrangea' | 'clover' | 'gold' | 'moss' | 'buttercream';
  /** Which corner/edge to pin to. Default: `top-center`. */
  position?: 'top-center' | 'top-left' | 'top-right' | 'top-off-left' | 'top-off-right';
  /** Width in px. Default: 72. */
  width?: number;
  /** Rotation in degrees. Default: random-feeling small tilt. */
  tilt?: number;
}
