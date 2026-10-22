# Radian brand

- `radian-mark.svg`: full-colour R mark on a transparent background (640 × 640 viewBox).
- `radian-mark-mono.svg`: one-colour mark in `currentColor` for the sidebar, About window and menu bar.
- `../assets/icon.svg`: the 1024 px macOS app icon (824 px squircle tile, white sticker outline, soft shadows). `icon.png`, `radian.icns` and `radian.ico` are all built from it.
- Colours: coral `#FF6378`, blue `#1942CD`, pink `#FF9396`, navy `#1A007F`, overlaps `#0229C0` (blue over stem) and `#ED4A5F` (leg over ribbon), tile and outline `#FFFFFF`.
- PNG: `rsvg-convert -w 1024 -h 1024 assets/icon.svg -o assets/icon.png`
- ICNS: `d=$(mktemp -d)/radian.iconset; mkdir "$d"; for s in 16 32 128 256 512; do rsvg-convert -w $s -h $s assets/icon.svg -o "$d/icon_${s}x${s}.png"; rsvg-convert -w $((s*2)) -h $((s*2)) assets/icon.svg -o "$d/icon_${s}x${s}@2x.png"; done; iconutil -c icns "$d" -o assets/radian.icns`
- ICO (16, 24, 32, 48, 64, 128 and 256 px, as `tests/pe-resources.test.js` expects): `node scripts/make-ico.js`
