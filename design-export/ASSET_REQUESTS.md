# Asset generation requests — copy-paste prompts

Each asset below has a **complete, self-contained prompt** — paste it as-is, no
manual additions needed. The shared style block is already baked into every one.

Technical specs for all: transparent or solid-white background (white is fine —
I knock it out in code), no baked drop shadows, light from upper-left, render at
3–4× the noted display size.

---

## 1. Cherry — trend-tip stages · `ds/assets/cherry/`
Three stages of one flower opening, used at the tip of a rising trend line.
Same canvas, same stem anchor across all three so they can be swapped in place.
Display ~34px; render ~360px square.

### `bud-right.png`
> Minimalist botanical line illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill. The style references 19th-century botanical field journal sketches — precise, delicate, scientific, but warm. Line weight: thin and consistent (0.5–1pt equivalent). Color fills are dusty and desaturated, never saturated or vibrant. No drop shadows, no gradients, no glow effects, no textures on the background. Single specimen, no additional elements, no text, no labels.
>
> Subject: a single closed cherry-blossom bud on a short stem. The stem enters from the bottom-left corner of the frame at roughly 40 degrees, and the bud leans up and to the right, as if the plant is climbing toward the upper-right. Dusty pink petals still furled tight, two tiny sepal leaves at the base of the bud. Centered composition with generous negative space; the bud head sits slightly right of center.

### `half-right.png`
> Minimalist botanical line illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill. The style references 19th-century botanical field journal sketches — precise, delicate, scientific, but warm. Line weight: thin and consistent (0.5–1pt equivalent). Color fills are dusty and desaturated, never saturated or vibrant. No drop shadows, no gradients, no glow effects, no textures on the background. Single specimen, no additional elements, no text, no labels.
>
> Subject: a single cherry blossom half open, mid-bloom, on a short stem. The stem enters from the bottom-left corner of the frame at roughly 40 degrees and the flower head leans up and to the right. Outer petals beginning to part and curl outward, inner petals still cupped; dusty pink fill with slightly deeper pink at the petal bases, two small sepal leaves at the base. Same specimen, same stem position and framing as a closed bud version — only the flower has progressed. Centered composition with generous negative space.

### `bloom-right.png`
> Minimalist botanical line illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill. The style references 19th-century botanical field journal sketches — precise, delicate, scientific, but warm. Line weight: thin and consistent (0.5–1pt equivalent). Color fills are dusty and desaturated, never saturated or vibrant. No drop shadows, no gradients, no glow effects, no textures on the background. Single specimen, no additional elements, no text, no labels.
>
> Subject: a single cherry blossom in full open bloom, five petals fully spread, seen at a three-quarter angle facing up and to the right. Short stem entering from the bottom-left corner of the frame at roughly 40 degrees. Dusty pink petals with a paler wash toward the edges, tiny stamen dots in the center in a muted ochre. Same specimen, same stem position and framing as the bud and half-open versions — the final stage of the same flower. Centered composition with generous negative space.

---

## 2. Ink pen · `ds/assets/tools/pen.png`  ← used immediately
The pen that "writes" the weekly letter on screen. Display ~58px; render ~700px square.
**Anchor matters most: the nib tip must touch the exact lower-left corner.**

> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill. The style references 19th-century field journal sketches — precise, delicate, scientific, but warm. Line weight: thin and consistent (0.5–1pt equivalent). Color fills are dusty and desaturated, never saturated or vibrant. No drop shadows, no gradients, no glow effects, no textures on the background. Single object, no additional elements, no text, no labels.
>
> Subject: a vintage wooden dip pen in writing position, drawn diagonally across the frame. The metal nib tip touches the exact bottom-left corner of the image, and the slender wooden holder rises to the upper-right at about 45 degrees. Visible details: pointed steel nib with a center slit and a small round breather hole, a short brass collar where the nib meets the holder, and a slim walnut-brown wooden barrel with a slightly tapered end. Muted washes: warm grey-silver on the nib, dull brass ochre on the collar, dusty walnut brown on the wood. The pen is the only element; generous negative space above and right.

---

## 3. Wax seal · `ds/assets/seal/`  ← used immediately
Three files; the two halves must reassemble into the intact seal exactly.
Display ~52px; render ~240px square each, seal centered, same position in all three.

### `intact.png`
> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. Single object, centered, generous negative space, no text, no labels.
>
> Subject: a wax letter seal viewed straight on. An irregular, organically squashed disc of dusty brick-red wax — not a perfect circle: the rim is softly lumpy with one or two small cooled drips at the edge. In the center, a pressed embossed imprint of a small fern frond, slightly lighter where the wax is raised and slightly deeper red in the recesses, drawn with fine ink lines rather than shading.

### `broken-left.png` and `broken-right.png`
> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. No text, no labels.
>
> Subject: the LEFT half only of a broken wax letter seal. The seal was an irregular squashed disc of dusty brick-red wax with a pressed fern-frond imprint; it has cracked in two along a jagged, irregular vertical fracture line slightly right of center. Draw only the left fragment, positioned exactly where it sat in the intact seal (left side of the frame center), with a sharp, jagged inner broken edge showing slightly deeper red. The other half is absent — empty white where it would be. Half of the fern imprint is visible on this fragment.
>
> *(For `broken-right.png`: same prompt with LEFT/left swapped for RIGHT/right, fracture "slightly right of center" kept identical, right fragment positioned exactly where it sat in the intact seal.)*

---

## 4. Envelope set · `ds/assets/envelope/`
Three files on the SAME canvas geometry (~1600×1000, envelope filling ~90% of the
width, landscape 8:5), pixel-aligned so they overlay perfectly. Display ~420px wide.

### `front.png`
> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. Single object, centered, no text, no labels.
>
> Subject: the FRONT of a kraft-paper letter envelope, landscape orientation, 8:5 proportions, viewed perfectly straight on and squared to the frame. A plain warm-beige paper rectangle with a fine ink outline, gently softened corners, and a very subtle paper-tone wash. The face is EMPTY: no address, no stamp, no postmark, no lines — blank paper only (those are added separately). Faint short ink ticks at the two top corners suggesting folded paper thickness.

### `back.png`
> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. Single object, centered, no text, no labels.
>
> Subject: the BACK of a kraft-paper letter envelope, landscape orientation, 8:5 proportions, viewed perfectly straight on and squared to the frame, WITHOUT its top closing flap (the top edge is a plain straight edge). Visible construction seams drawn in fine ink: two side flaps folding in from the left and right meeting near the center, and a bottom flap folding up over them, its point reaching just above the middle of the envelope. Each flap gets a whisper-light wash a shade deeper than the base paper so the layering reads.

### `flap.png`
> Minimalist botanical-journal-style object illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. Single object, no text, no labels.
>
> Subject: ONLY the top closing flap of a kraft-paper envelope, isolated on white. A wide downward-pointing triangle with softly rounded tip, its long straight top edge spanning the full envelope width at the very top of the frame (this edge is the fold hinge), its rounded point reaching about 60% of the way down an 8:5 landscape envelope's height. Warm-beige wash matching the envelope, slightly lighter along the top fold. Everything below and around the triangle stays empty white.

---

## 5. Postage stamp · `ds/assets/envelope/stamp.png`
Display ~64px tall; render ~900×1200 (portrait 3:4).

> Minimalist botanical postage-stamp illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century field journal sketches — precise, delicate, scientific, but warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures.
>
> Subject: a single postage stamp, portrait orientation, 3:4 proportions, viewed straight on. Classic perforated stamp edge: a rectangle bordered by small evenly-spaced semicircular scallops cut into all four sides. Inside, a thin ink frame line, and within it a single cherry-blossom sprig specimen in dusty pink with a small muted-green leaf. The bottom strip of the stamp (about the lower fifth, inside the frame) is left as clear empty paper — no motif there. Cream paper tone. No text, no numbers, no labels anywhere.

---

## 6. Tiny trend leaves · `ds/assets/vine/`
Two files. Display ~16px; render ~160px square each.

### `leaf-left.png`
> Minimalist botanical line illustration on a solid white background. Fine ink pen outline with subtle muted watercolor fill, referencing 19th-century botanical field journal sketches — precise, delicate, scientific, but warm. Line weight thin and consistent (0.5–1pt equivalent). Colors dusty and desaturated. No drop shadows, no gradients, no glow effects, no background textures. The illustration is centered with generous negative space, suitable for use as a tiny 16×16px accent when scaled down. Single specimen, no additional elements, no text, no labels.
>
> Subject: one single small simple leaf with a very short stem nub at its base. The stem nub sits at the bottom-right and the leaf blade points up and to the LEFT. Muted sage-green wash, a single fine center vein, nothing else.

### `leaf-right.png`
> *(Same prompt, with the stem nub at the bottom-left and the leaf blade pointing up and to the RIGHT.)*

---

**Priority order:** pen + seal (letter animation), cherry tips (trend), envelope
set, stamp, leaves. Drop them at the paths above and tell me — I'll swap out the
CSS stand-ins.
