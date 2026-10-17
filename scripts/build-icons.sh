#!/bin/sh
# Regenerates the PNG logo and favicons in public/icons/ from icon.svg.
# Needs rsvg-convert (macOS: brew install librsvg; Debian: apt install librsvg2-bin).
set -eu
cd "$(dirname "$0")/../public/icons"
rsvg-convert -w 512 -h 512 icon.svg -o logo-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
rsvg-convert -w 32 -h 32 icon.svg -o favicon-32.png
