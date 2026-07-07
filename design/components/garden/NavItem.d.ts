/**
 * NavItem — sidebar navigation row. Rest state is transparent; active state
 * is a bone pill with a small washi tape bookmark on the top-right.
 *
 * @startingPoint section="Garden" subtitle="Nav row rest & active" viewport="360x180"
 */
export interface NavItemProps {
  species: 'clover' | 'hydrangea' | 'daisy' | 'cherry' | 'wisteria' | 'fern' | 'vine';
  label: string;
  href?: string;
  active?: boolean;
  /** Right-aligned counter, e.g. inbox unread count. */
  count?: number;
  /** Tape color when active. Defaults to `terra`. */
  activeTape?: 'terra' | 'sage' | 'blossom' | 'gold';
}
