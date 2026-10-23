# Arc 1.170.0: theme picker swatches

Arc's theme picker ("Edit Theme Color…") has **5 pages of 9 swatches (45)**, paged with ‹ ›. Radian's `SWATCHES` in `src/renderer/theme.js` uses these values, in this order.

## Sources and method

1. **Live capture (used for every value below).** Arc 1.170.0 on the user's Mac, 2026-10-23, 2× screenshots in sRGB, macOS dark. Each page was shown with ‹ › only; no swatch was applied. Each hex is the mean of a 6 × 6 px patch at the swatch centre. Write-up: `docs/parity/captures/live/theme.md`. Screenshots `22-theme-editor.png` (page 1), `25-theme-page2.png` … `25-theme-page5.png`, `26b-page2-zoom.png`. They are kept outside the repo.
   - Arc's names come from the swatches' accessibility labels ("Set space color to Catalog color: … ColorPicker<Name><n>").
2. **Web images (page 1 only, used as a cross-check).** Each hex is the mean of a box at the swatch centre:
   `magick <img> -crop 7x7+<x−3>+<y−3> +repage -scale 1x1! -format '#%[hex:p{0,0}]' info:`
   Both images are palette PNGs (256 and 128 colours) with no colour profile, so each value is within a few levels at best.
   - [GIGA] Gigazine review, 2023-07-27, image `57.png` (1200 × 1071). Box 11 px, row y = 755, x = 546, 599, 653, 706, 760, 813, 867, 920, 974. It matches the live capture within 6 levels per channel (largest gap: swatch 7, G).
   - [ARC-IMG] arc.net marketing image `theme-picker.png` (1400 × 933, archived 2025-05-31). Box 7 px, row y = 745, x = 1058 … 1276. It is noticeably washed out compared with Arc on screen, so it is not used. An older note in `docs/parity/web-research.md` §2.3 quotes values from this image.
3. **No web image of pages 2–5 was found.** Sources checked: the Arc help center and 2022–2026 release notes (no picker images), arc.net (only page 1), Gigazine, The Sweet Setup (old V1 picker), candid.technology (Windows picker), and Chris Coyier's review.

## Page 1: Brand (`ColorPickerBrand1…9`), one colour each

| # | Live (used) | [GIGA] | [ARC-IMG] |
|---|---|---|---|
| 1 | `#F1EAE5` | `#F1EAE5` | `#F0EAE9` |
| 2 | `#E69FBA` | `#E69FBA` | `#DBAABC` |
| 3 | `#9E749B` | `#9C779A` | `#A183A1` |
| 4 | `#E1686F` | `#E0696E` | `#D37C7A` |
| 5 | `#EF8C62` | `#EE8B62` | `#E19A74` |
| 6 | `#F2D66D` | `#F2D56D` | `#EDDA87` |
| 7 | `#73E59C` | `#71DF98` | `#97DFA6` |
| 8 | `#7FB8D6` | `#80B7D6` | `#94BBD5` |
| 9 | `#666786` | `#666684` | `#707589` |

Swatch 1 is a colour (warm off-white), not "no theme". Arc's default theme is restored with (−), which removes every colour.

## Page 2: three-colour gradients (approximation)

Each swatch is a diagonal three-band gradient. The values are the bands **as drawn in the 24 pt swatch** (top-left → centre → bottom-right). The colours Arc applies to the window may be more saturated than these. **Approximation:** the exact preset colours cannot be read without applying a swatch, which the capture did not do. The accessibility labels on this page repeat `ColorPickerBrand1…9`. Radian applies these as three-colour themes at 131°, in the same order.

| # | Top-left | Centre | Bottom-right |
|---|---|---|---|
| 1 | `#D8D5D1` | `#D8D8D1` | `#D8D3D2` |
| 2 | `#CF9BA2` | `#D0A397` | `#CE9DB3` |
| 3 | `#936E86` | `#926E7B` | `#896E88` |
| 4 | `#CC836A` | `#CBA068` | `#CC888F` |
| 5 | `#DAAB62` | `#D8CE63` | `#DB9D7E` |
| 6 | `#C3CD6B` | `#AAD76B` | `#C6AD6C` |
| 7 | `#6ECDB3` | `#6FCBCE` | `#7DCDA4` |
| 8 | `#7990C4` | `#7979C4` | `#7A9CBA` |
| 9 | `#6C6380` | `#746380` | `#6D6C80` |

## Page 3: Pastel (`ColorPickerPastel1…9`)

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| `#FEFBFA` | `#FBEAF3` | `#ECD2EA` | `#F7CDD2` | `#FAE1D5` | `#FEF9E7` | `#E4FCEC` | `#E0F2FB` | `#C5C6E2` |

## Page 4: Drab (`ColorPickerDrab1…9`)

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| `#4B3B58` | `#623856` | `#854444` | `#A77048` | `#D1B46A` | `#CDCCA8` | `#84A885` | `#34604B` | `#2D4468` |

## Page 5: Greyscale (`ColorPickerGreyscale1…9`)

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| `#FFFFFF` | `#E5E5E5` | `#CCCCCC` | `#B3B3B3` | `#808080` | `#666666` | `#333333` | `#191919` | `#000000` |

## Limits

- Values are on-screen sRGB samples of the swatch fill. Arc's catalog colours may differ by a level or two, and the swatch ring was avoided by sampling the centre.
- Page 2 is an approximation (see above).
- Every swatch keeps Radian's text readable: worst contrast 4.56 over all 45 swatches, intensities 0, 0.5 and 1, every mode, light and dark.

[GIGA]: https://i.gzn.jp/img/2023/07/27/arc-web-browser/57.png (from https://gigazine.net/gsc_news/en/20230727-arc-web-browser)
[ARC-IMG]: https://web.archive.org/web/20250531172436im_/https://arc.net/_next/image?url=%2Ftheme-picker.png&w=1920&q=100
