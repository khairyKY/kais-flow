/**
 * SectionLabel — the mono/uppercase caption that opens every content section,
 * followed by a dashed hairline rule and an optional trailing link.
 *
 * @startingPoint section="Core" subtitle="Mono label + dashed rule" viewport="700x60"
 */
export interface SectionLabelProps {
  /** The uppercase caption text. Rendered as-is; component adds text-transform. */
  label: string;
  /** Optional trailing action, e.g. `View all →`. */
  action?: { label: string; onClick?: () => void };
}
