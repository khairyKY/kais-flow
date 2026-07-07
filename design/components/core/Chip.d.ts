/**
 * Chip — small mono/uppercase pill for metadata: tags, statuses, filters.
 * Filled variant is the "primary tag" (terra background, white text).
 * Bordered variant is a passive tag (uppercase mono, muted).
 */
export interface ChipProps {
  children: React.ReactNode;
  /** Visual variant. */
  variant?: 'filled' | 'bordered' | 'faint';
  /** Optional leading dot color (used for project/domain markers). */
  dot?: string;
}
