#!/bin/sh
# Regenerates the PNG logo and favicons in public/icons/ from icon.svg, and the
# Open Graph images from og-image-<lang>.svg. Also renders the credential card
# backgrounds in public/cards/ (856x540, under 200 KB: Procivis drops larger images).
# Needs rsvg-convert (macOS: brew install librsvg; Debian: apt install librsvg2-bin).
set -eu
cd "$(dirname "$0")/../public/icons"
rsvg-convert -w 512 -h 512 icon.svg -o logo-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
rsvg-convert -w 32 -h 32 icon.svg -o favicon-32.png
for lang in fi en; do
  rsvg-convert -w 1200 -h 630 og-image-$lang.svg -o og-image-$lang.png
done
cd ../cards
for card in study-credential student-status; do
  rsvg-convert -w 856 -h 540 $card.svg -o $card.png
done
