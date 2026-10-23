# Arc 1.170.0: Space theme editor (live capture)

Captured 2026-10-23 on the user's profile (macOS dark, 2× display). Both Spaces use Arc's default theme (no `windowTheme` saved in `StorableSidebar.json`). The editor was opened, its preset pages were paged with the ‹ › buttons (paging does not apply a colour), controls were hovered for tooltips, then it was closed with Escape. No swatch, mode, slider or texture was touched; `StorableSidebar.json` space models were identical before and after, and the window background pixels were unchanged.

Screenshots, prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/shots/`: `21-space-context-menu.png`, `22-theme-editor.png` (page 1), `25-theme-page2.png` … `25-theme-page5.png`, `26-pages-1-2.png`, `26b-page2-zoom.png`, `24-theme-hover-modes.png`, `28-theme-bottom-controls.png`. AX dump: `../ax-theme.txt`.

## How it opens

Right-click the Space title in the sidebar. Context menu (native NSMenu, in order):
Change Space Icon… · Rename Space… · **Edit Theme Color…** · Set Profile ▸ · ─ · New Folder · Live Folders ▸ · ─ · Share Space… · Export “Space 1” into Folder ▸ · ─ · Manage Spaces… · ─ · Delete Space

"Edit Theme Color…" opens an **`AXPopover`** (SwiftUI, translucent material) attached to the browser window, not a separate window.

## Geometry (points)

- Popover: **382 × 534**, at window x = 233, y = 10 (just right of the 250 pt sidebar, near the top). Content inset 13 pt (content 356 × 508). Corner radius ≈ 24 pt.
- **Colour field** ("DotGrid"): **340 × 340**, 8 pt from the content's top-left. Dotted grid texture (≈ 4 pt dot pitch). Centred text when no colour is set: **"Tap to pick a color for this space"** (13 pt semibold, white).
- **Appearance buttons**: three 32 × 32 buttons, 40 pt pitch, centred, 24 pt below the field's top edge. Order and tooltips:
  1. sparkles icon: **"Automatic Appearance"** (selected here; selected = rounded chip `#6D6C7A` ≈, radius 8)
  2. sun icon: **"Light Appearance"**
  3. moon-with-star icon: **"Dark Appearance"**
- **Remove / Add** colour-point buttons: 32 × 32 icons "−" and "+" (AX "Remove", "Add"), centred at the bottom of the colour field (y = field top + 292); both disabled when no colour is set.
- **Preset strip** (16 pt below the field): ‹ button 32 × 32 ("Move to previous preset page."), 9 swatches **24 × 24** circles at **29.5 pt pitch**, › button 32 × 32 ("Move to next preset page."). ‹ is disabled on page 1, › on the last page. Paging slides the strip horizontally.
  - Each swatch has a 2 pt lighter ring (same hue, ~20 % lighter) inside its edge.
  - AX label pattern: "Set space color to Catalog color: #$assets-… ColorPicker<Name><n>".
- **Intensity slider** (AX help "Intensity"): 224 × 44 at content x = 18, y = 430; drawn as a translucent track (≈ 10 pt tall, fully rounded) with a sine-wave line (6 periods) over it.
- **Noise texture dial**: 84 × 84 at content x = 258, y = 412: a ring of 24 small dots around a 40 pt circle. Two AX elements share it: top half button **"Cycle noise texture"** (tap cycles textures), bottom half an `AXSlider` (no label; drag/rotate = grain amount). With no theme set, both slider and dial draw dimmed.

## Preset pages: 5 pages × 9 swatches = 45

Hex sampled at each swatch centre (6 × 6 px mean) from 2× screenshots, sRGB.

**Page 1: "Brand" (solid)**: `ColorPickerBrand1…9`
| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| `#F1EAE5` | `#E69FBA` | `#9E749B` | `#E1686F` | `#EF8C62` | `#F2D66D` | `#73E59C` | `#7FB8D6` | `#666786` |

**Page 2: multi-colour presets** (AX again labels them `ColorPickerBrand1…9`; each is a 3-band diagonal gradient, top-left band → centre band → bottom-right band):
| # | top-left | centre | bottom-right |
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

**Page 3: Pastel**: `ColorPickerPastel1…9`
| `#FEFBFA` | `#FBEAF3` | `#ECD2EA` | `#F7CDD2` | `#FAE1D5` | `#FEF9E7` | `#E4FCEC` | `#E0F2FB` | `#C5C6E2` |
|---|---|---|---|---|---|---|---|---|

**Page 4: Drab**: `ColorPickerDrab1…9`
| `#4B3B58` | `#623856` | `#854444` | `#A77048` | `#D1B46A` | `#CDCCA8` | `#84A885` | `#34604B` | `#2D4468` |
|---|---|---|---|---|---|---|---|---|

**Page 5: Greyscale**: `ColorPickerGreyscale1…9`
| `#FFFFFF` | `#E5E5E5` | `#CCCCCC` | `#B3B3B3` | `#808080` | `#666666` | `#333333` | `#191919` | `#000000` |
|---|---|---|---|---|---|---|---|---|

## Colours of the editor itself (over the default purple theme)

- Popover fill ≈ `#554C5F` (translucent material; varies with the theme behind it).
- Colour field ≈ `#5C596A` with lighter dots.
- Tooltips (all Arc custom tooltips, here and in Little Arc): pill, fill `#0A0D4B`, white 13 pt semibold text, ≈ 26 pt tall, appear ≈ 1 s after hover, 8 pt below the control; shortcut keycaps inside are `#D3D4FD` rounded squares with navy glyphs.

## Not captured

- Texture option names/count behind "Cycle noise texture", the slider ranges, and what the field looks like with points placed: all of these apply live and the default theme has nothing saved to restore to, so they were not touched.
- Light/Dark appearance results.
