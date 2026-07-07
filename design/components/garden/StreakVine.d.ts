/**
 * StreakVine — horizontal timeline of days with vine growth per day.
 * Uses `assets/flowers/vine/{state}.png` per cell. Days with completed streak
 * show `lush` or `flowering`; empty days show `bare`.
 */
export interface StreakVineProps {
  /** Array of vine states, oldest → newest. */
  days: Array<'bare' | 'sprouting' | 'flowering' | 'lush'>;
  /** Optional labels beneath cells (e.g. M T W T F S S). */
  labels?: string[];
  /** Highlight the last day (today). */
  highlightLast?: boolean;
}
