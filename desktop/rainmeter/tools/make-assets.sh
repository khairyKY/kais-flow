#!/usr/bin/env bash
# Makes the widgets' images and font. Run once; the output is committed. (1.1 has no flowers: the plant art is gone.)
#   bash make-assets.sh [Courier Prime fontsource dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
fonts="${1:-$here/../../../app/node_modules/@fontsource/courier-prime}"
res="$here/../Glass/@Resources/KaisFlow"
mkdir -p "$res/Fonts"

# The washi tape on the goal card: gold stripes 3 px solid / 2 px at 55%, at 75%, tilted 1.5 degrees.
magick -size 48x11 xc:none \
  -fill 'rgba(201,165,90,0.75)' -draw "$(for x in 0 5 10 15 20 25 30 35 40 45; do printf 'rectangle %d,0 %d,10 ' $x $((x + 2)); done)" \
  -fill 'rgba(201,165,90,0.4125)' -draw "$(for x in 3 8 13 18 23 28 33 38 43; do printf 'rectangle %d,0 %d,10 ' $x $((x + 1)); done)" \
  -background none -rotate -1.5 "$res/tape.png"

# Paper grain (day only): fine noise in the design's ink (46,41,31) at ~5% twice over.
magick -size 240x240 xc: -seed 7 +noise Random -channel G -separate +channel -blur 0x0.4 -evaluate multiply 0.06 \
  \( -size 240x240 xc:'rgb(46,41,31)' \) +swap -alpha off -compose copy_opacity -composite "$res/grain.png"

# Courier Prime (the goal stamp), from the app's own @fontsource copy, as a TTF Rainmeter can load.
python -c "from fontTools.ttLib import TTFont; f=TTFont(r'$(cygpath -w "$fonts/files/courier-prime-latin-400-normal.woff2")'); f.flavor=None; f.save(r'$(cygpath -w "$res/Fonts/CourierPrime-Regular.ttf")')"
cp "$fonts/LICENSE" "$res/Fonts/CourierPrime-OFL.txt"
ls -la "$res" "$res/Fonts"
