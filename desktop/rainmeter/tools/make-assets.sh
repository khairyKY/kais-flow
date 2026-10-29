#!/usr/bin/env bash
# Makes the widgets' images and font from the app's art. Run once; the output is committed.
#   bash make-assets.sh [plants dir] [Courier Prime woff2 dir]
# Plants: Kai's Glass @Resources\KaiFlow PNGs (the same art as design-export/desktop-widgets/plants).
# Every plant is sized to the pixel it's drawn at (Rainmeter draws it 1:1) with a 10 px clear margin, so the
# night copy's glow fits; the skins place each image 10 px up and left of where the design puts it.
# Night copies = the design's --plant-filter: brightness(.6) saturate(.75) drop-shadow(0 0 6px rgba(168,160,190,.4)).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="${1:-$HOME/OneDrive/Documents/Rainmeter/Skins/Glass/@Resources/KaiFlow}"
fonts="${2:-$here/../../../app/node_modules/@fontsource/courier-prime}"
res="$here/../Glass/@Resources/KaisFlow"
out="$res/Plants"
mkdir -p "$out" "$res/Fonts"

day() { # name width -> <name>-<width>.png
  magick "$src/$1.png" -filter Lanczos -resize "$2x" -bordercolor none -border 10 "$out/$1-$2.png"
}
fit() { # name -> <name>-bud.png: object-fit contain in 20x24 (the goal card's bud)
  magick "$src/$1.png" -filter Lanczos -resize 20x24 -background none -gravity center -extent 20x24 -bordercolor none -border 10 "$out/$1-bud.png"
}
night() { # file -> file-night.png
  local f="$out/$1.png"
  magick "$f" -channel RGB -evaluate multiply 0.6 +channel -modulate 100,75 \
    \( +clone -alpha extract -blur 0x3 -evaluate multiply 0.4 -background 'rgb(168,160,190)' -alpha shape \) \
    +swap -compose over -composite "$out/$1-night.png"
}
day hydrangea-medium 132; day hydrangea-light 132; night hydrangea-light-132; rm "$out/hydrangea-light-132.png"
for w in 50 54; do day daisy-midday $w; day daisy-past $w; night daisy-past-$w; rm "$out/daisy-past-$w.png"; done
for n in cherry-opening cherry-bloom; do day $n 54; night $n-54; done
for n in cherry-bud cherry-bloom; do fit $n; night $n-bud; done

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
ls -la "$out" "$res" "$res/Fonts"
