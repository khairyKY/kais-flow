/**
 * FlowerBadge — the small round botanical avatar used on nav items,
 * profile chips, and card gutters. Uses raster PNGs from `assets/flowers/…`.
 *
 * @startingPoint section="Garden" subtitle="One flower per surface" viewport="700x160"
 */
export interface FlowerBadgeProps {
  /** Which flower plant. Each maps to one surface's identity. */
  species: 'clover' | 'hydrangea' | 'daisy' | 'cherry' | 'wisteria' | 'fern' | 'vine';
  /** Growth/mood state. The available values depend on species:
   *  - cherry: bud | opening | bloom | fallen
   *  - clover: seedling | awake | resting | dewdrop | four_leaf
   *  - daisy: morning | midday | evening | past | future
   *  - fern: coil | unfurl1 | unfurl2 | full
   *  - hydrangea: zero | light | medium | heavy
   *  - vine: bare | sprouting | flowering | lush
   *  - wisteria: p0 | p20 | p40 | p60 | p80 | p100 (progress) */
  state?: string;
  /** Rendered diameter in px. Default 28. */
  size?: number;
  /** Alt/title. */
  label?: string;
}
