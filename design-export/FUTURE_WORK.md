# Future work — parked ideas

## The Weekly Letter animation (parked — Jul 2026)
**File:** `Review.dc.html`, turn 4 (option 4a)

The full arrival set-piece: closed envelope → wax seal cracks and its halves
fall → front flips flat to the open back (flap attached) → the letter rises out,
settles, unfolds → the dip pen writes the week in ink, line by line, then signs
off as the photo lands. All bespoke assets are live (envelope, seal + halves,
pen, stamp, cherry stages, leaves).

**Why parked:** the animation is done and correct, but it's a set-piece, not a
shippable feature yet. To ship it needs:
- **Live data** — letter copy, stats, trend numbers are hard-coded samples.
- **First-open-once behavior** — play the full open only on the first Sunday
  visit, then show a folded teaser on repeat visits (the 2b idea). Teaser state
  not built.
- **Real photo** — currently a drag-drop slot with no default.
- **Cherry trend-tip logic** — all three stages exist; wire the stage to the
  week's focused hours (<10h / 10–20h / 20h+). Only the half-open is placed now.

**If revisited:** keep the animation exactly as-is; the work is purely wiring it
to real data and adding the repeat-visit teaser.

## A Year in the Garden (parked — Jul 2026)
**File:** `Focus.dc.html`, turn 2 (options 2a, 2b)

The "scrub the whole year" mode for the garden view — a plant-stake ruler you
drag to see the garden as it was in any past month.

**Why parked:** the concept is under-executed and, more importantly, it reads as
a weaker take on ground that Forest (the focus app) and similar tools already do
better. Not worth shipping as-is.

**If revisited:** find an angle that isn't a year-scrubber timeline. The
honest-history idea (months before the app render as "prepared soil", 2b) is the
only part worth keeping — it's original and quiet. Build outward from that, not
from the scrub rail.
