# Radian brand

- `radian-mark.svg` / `.png`: colour R with the off-white sticker border and soft shadow. `radian-mark-mono.svg`: one colour in `currentColor`, gaps where a stroke passes underneath.
- `radian-wordmark.svg`: flat mark + "Radian" (Avenir Next Demi Bold, system font stack). `social-preview.svg` / `.png`: 1280 × 640 GitHub social preview.
- `../assets/icon.svg`: 1024 px macOS icon (824 px white squircle, white sticker, mark 600 × 500 like Arc's). `icon.png`, `radian.icns` and `radian.ico` are built from it.
- Geometry (1024 grid): 128 px round-capped strokes. One coral stroke draws stem, top bar, elliptical bowl and leg; the swoosh is one circular arc that passes over the stem and under the bowl and leg, as Arc's swoosh does through its A.
- Colours: coral `#FF6378`, blue `#1942CD`, pink `#FF9396`, navy foot `#1A007F`, blue over stem `#0229C0`, bowl and leg over swoosh `#ED4A5F`, sticker `#FFFCEA` (mark) or `#FFFFFF` (icon).
- PNGs: `rsvg-convert -w 1024 -h 1024 assets/icon.svg -o assets/icon.png; rsvg-convert -w 1024 -h 1024 brand/radian-mark.svg -o brand/radian-mark.png; rsvg-convert brand/social-preview.svg -o brand/social-preview.png`
- ICNS: `d=$(mktemp -d)/radian.iconset; mkdir "$d"; for s in 16 32 128 256 512; do rsvg-convert -w $s -h $s assets/icon.svg -o "$d/icon_${s}x${s}.png"; rsvg-convert -w $((s*2)) -h $((s*2)) assets/icon.svg -o "$d/icon_${s}x${s}@2x.png"; done; iconutil -c icns "$d" -o assets/radian.icns`
- ICO (16, 24, 32, 48, 64, 128 and 256 px, as `tests/pe-resources.test.js` expects): `node scripts/make-ico.js`
